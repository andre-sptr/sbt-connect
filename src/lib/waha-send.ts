/**
 * src/lib/waha-send.ts
 *
 * Pengiriman ke WAHA yang tahan-banting (resilient).
 *
 * Latar belakang: sesi WhatsApp di WAHA dijalankan oleh Chromium internal WAHA
 * (puppeteer-core). Browser itu bisa mati/crash (mis. kehabisan RAM di VPS),
 * dan begitu mati setiap kiriman membalas HTTP 500 dengan "Target closed"
 * (TargetCloseError) sampai sesi WAHA di-launch ulang. Sebelum ada modul ini,
 * satu kali WAHA error langsung membuat seluruh run gagal dan butuh restart
 * manual.
 *
 * Modul ini menambahkan:
 *   1. Timeout per request (AbortController) — WAHA yang menggantung tidak lagi
 *      memblok run tanpa batas.
 *   2. Retry dengan backoff untuk kegagalan transien (5xx / jaringan).
 *   3. Pemulihan sesi otomatis: saat respons menandakan sesi mati, modul ini
 *      memicu restart sesi WAHA lewat REST API, menunggu status WORKING, lalu
 *      mengirim ulang. Ini menggantikan restart PM2 manual.
 *
 * Sengaja TANPA import alias "@/..." atau dependency berat (Playwright/Prisma)
 * supaya bisa di-import langsung oleh test runner Node (`node --test`) dan
 * mudah di-mock (fetch & sleep di-inject).
 */

export interface WahaEndpoint {
  url: string;
  session: string;
  apiKey: string;
}

export type WahaLogLevel = "info" | "warning" | "error" | "success";
export type WahaLogFn = (level: WahaLogLevel, message: string) => void | Promise<void>;

export type FetchLike = typeof fetch;
export type SleepFn = (ms: number) => Promise<void>;

export interface SendToWahaOptions {
  config: WahaEndpoint;
  /** Path relatif, contoh: "/api/sendImage" atau "/api/sendText". */
  path: string;
  /** Body JSON request (akan di-stringify). */
  body: Record<string, unknown>;
  fetchImpl?: FetchLike;
  sleep?: SleepFn;
  /** Timeout per request (ms). Default 30000. */
  timeoutMs?: number;
  /** Maksimum percobaan kirim. Default 3. */
  maxAttempts?: number;
  /** Aktifkan pemulihan sesi otomatis saat sesi terdeteksi mati. Default true. */
  recoverSession?: boolean;
  /** Batas waktu menunggu sesi kembali WORKING setelah restart (ms). Default 60000. */
  sessionWaitMs?: number;
  log?: WahaLogFn;
}

export interface SendToWahaOutcome {
  ok: boolean;
  /** Status HTTP terakhir (0 = error jaringan / timeout). */
  status: number;
  /** Body respons / pesan error terakhir. */
  bodyText: string;
  /** Jumlah percobaan kirim yang dilakukan. */
  attempts: number;
  /** True jika sempat memicu restart sesi WAHA. */
  recovered: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_SESSION_WAIT_MS = 60_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimUrl(url: string): string {
  return url.replace(/\/$/, "");
}

/** Backoff eksponensial dengan batas atas. attempt mulai dari 1. */
export function backoffDelay(attempt: number, baseMs = 2000, capMs = 8000): number {
  return Math.min(baseMs * 2 ** (attempt - 1), capMs);
}

/**
 * Apakah respons menandakan sesi WhatsApp WAHA sudah mati (browser closed /
 * sesi tidak WORKING), sehingga kirim ulang biasa percuma dan perlu restart
 * sesi terlebih dulu.
 */
export function looksLikeDeadSession(status: number, bodyText: string): boolean {
  const recoverableStatus = status === 500 || status === 503 || status === 422;
  if (!recoverableStatus) return false;
  const patterns =
    /target\s*closed|targetclose|protocol error|browser.*(closed|disconnected)|page.*closed|session.*(not found|not as expected|stopped|failed)|status is not|not\s*working|restart the session/i;
  return patterns.test(bodyText);
}

/** 4xx yang tidak ada gunanya di-retry (auth/permintaan salah). */
function isFatalClientError(status: number): boolean {
  if (status < 400 || status >= 500) return false;
  // 408 (timeout), 429 (rate limit), 422 (sering = sesi belum WORKING) dianggap
  // bisa dipulihkan/di-retry, jadi bukan fatal.
  return status !== 408 && status !== 429 && status !== 422;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** fetch dengan timeout via AbortController. */
async function timedFetch(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": apiKey,
  };
}

/** Ambil status sesi WAHA. Mengembalikan string status (uppercase) atau null. */
export async function getWahaSessionStatus(opts: {
  config: WahaEndpoint;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = trimUrl(opts.config.url);
  try {
    const res = await timedFetch(
      fetchImpl,
      `${base}/api/sessions/${encodeURIComponent(opts.config.session)}`,
      { method: "GET", headers: jsonHeaders(opts.config.apiKey) },
      timeoutMs
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: unknown };
    return typeof data.status === "string" ? data.status.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Picu restart sesi WAHA. Toleran terhadap perbedaan versi API:
 *  - WAHA modern: POST /api/sessions/{session}/restart
 *  - WAHA lama:   POST /api/sessions/restart  (nama sesi di body)
 */
export async function restartWahaSession(opts: {
  config: WahaEndpoint;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<boolean> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = trimUrl(opts.config.url);
  const headers = jsonHeaders(opts.config.apiKey);

  // Coba endpoint path-style (WAHA modern).
  try {
    const res = await timedFetch(
      fetchImpl,
      `${base}/api/sessions/${encodeURIComponent(opts.config.session)}/restart`,
      { method: "POST", headers },
      timeoutMs
    );
    if (res.ok) return true;
    // 404/405 → versi WAHA tidak punya endpoint ini; fallback ke body-style.
    if (res.status !== 404 && res.status !== 405) return false;
  } catch {
    // lanjut ke fallback
  }

  // Fallback body-style (WAHA lama).
  try {
    const res = await timedFetch(
      fetchImpl,
      `${base}/api/sessions/restart`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ name: opts.config.session, session: opts.config.session }),
      },
      timeoutMs
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Tunggu sampai sesi WAHA berstatus WORKING (atau timeout). */
export async function waitForWahaSessionWorking(opts: {
  config: WahaEndpoint;
  fetchImpl?: FetchLike;
  sleep?: SleepFn;
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
}): Promise<boolean> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SESSION_WAIT_MS;
  const pollMs = opts.pollMs ?? 3000;
  const deadline = now() + timeoutMs;

  // Beri WAHA jeda sejenak untuk mulai me-launch ulang sebelum polling pertama.
  await sleep(Math.min(pollMs, 3000));

  while (now() < deadline) {
    const status = await getWahaSessionStatus({
      config: opts.config,
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
    });
    if (status === "WORKING") return true;
    // SCAN_QR_CODE / FAILED biasanya perlu intervensi manual; berhenti menunggu.
    if (status === "SCAN_QR_CODE" || status === "FAILED") return false;
    await sleep(pollMs);
  }
  return false;
}

/**
 * Kirim ke WAHA dengan timeout, retry, dan pemulihan sesi otomatis.
 */
export async function sendToWahaWithRecovery(opts: SendToWahaOptions): Promise<SendToWahaOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const recoverSession = opts.recoverSession ?? true;
  const sessionWaitMs = opts.sessionWaitMs ?? DEFAULT_SESSION_WAIT_MS;
  const log = opts.log;

  const base = trimUrl(opts.config.url);
  const url = `${base}${opts.path}`;
  const init: RequestInit = {
    method: "POST",
    headers: jsonHeaders(opts.config.apiKey),
    body: JSON.stringify(opts.body),
  };

  let recovered = false;
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let status = 0;
    let bodyText = "";

    try {
      const res = await timedFetch(fetchImpl, url, init, timeoutMs);
      status = res.status;
      if (res.ok) {
        return { ok: true, status, bodyText: "", attempts: attempt, recovered };
      }
      bodyText = await safeText(res);
    } catch (err) {
      status = 0;
      bodyText = err instanceof Error ? err.message : "network error";
    }

    lastStatus = status;
    lastBody = bodyText;

    const isLastAttempt = attempt === maxAttempts;
    const dead = looksLikeDeadSession(status, bodyText);

    // Sesi mati → coba restart sesi sekali, lalu kirim ulang.
    if (dead && recoverSession && !recovered && !isLastAttempt) {
      await log?.("warning", `Sesi WAHA tampak mati (status ${status}). Memicu restart sesi...`);
      const restarted = await restartWahaSession({ config: opts.config, fetchImpl, timeoutMs });
      recovered = true; // tandai sudah mencoba, agar tidak restart berulang
      if (restarted) {
        const ready = await waitForWahaSessionWorking({
          config: opts.config,
          fetchImpl,
          sleep,
          timeoutMs: sessionWaitMs,
        });
        await log?.(
          ready ? "info" : "warning",
          ready
            ? "Sesi WAHA WORKING kembali. Mengirim ulang."
            : "Sesi WAHA belum WORKING setelah restart. Tetap mencoba kirim ulang."
        );
      } else {
        await log?.("warning", "Tidak dapat memicu restart sesi WAHA. Mencoba ulang biasa.");
        await sleep(backoffDelay(attempt));
      }
      continue;
    }

    // 4xx fatal (auth/permintaan salah) → tidak ada gunanya di-retry.
    if (isFatalClientError(status)) {
      return { ok: false, status, bodyText, attempts: attempt, recovered };
    }

    if (isLastAttempt) break;

    // Kegagalan transien (5xx / jaringan / 408 / 429) → backoff lalu ulangi.
    await log?.("warning", `Gagal kirim ke WAHA (status ${status}). Retry ${attempt + 1}/${maxAttempts}...`);
    await sleep(backoffDelay(attempt));
  }

  return { ok: false, status: lastStatus, bodyText: lastBody, attempts: maxAttempts, recovered };
}
