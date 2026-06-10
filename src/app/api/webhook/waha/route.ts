import {
  handleConfirm,
  handleCreateProject,
  handleDelete,
  handleEdit,
  handleGroup,
  handleHelp,
  handleHistory,
  handleInfo,
  handleLaporan,
  handlePause,
  handleResume,
  handleRetry,
  handleRun,
  handleSchedule,
  handleScreenshot,
  handleStatus,
  isProjectCommandText,
} from "@/lib/bot-commands";
import { checkRateLimit, getUserRole } from "@/lib/bot-command-parser";
import { getWahaWebhookSecret } from "@/lib/config";

type WahaWebhookPayload = {
  event?: string;
  payload?: {
    body?: string;
    from?: string;
    id?: {
      remote?: string;
      fromMe?: boolean;
    };
  };
};

/**
 * Webhook WAHA untuk menerima pesan masuk.
 * Konfigurasi di WAHA: Webhook URL = https://<host>/api/webhook/waha
 */
export async function POST(request: Request) {
  let webhookSecret: string;
  try {
    webhookSecret = getWahaWebhookSecret();
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "WAHA webhook config invalid" },
      { status: 500 }
    );
  }

  const providedSecret = request.headers.get("x-waha-webhook-secret");
  if (!providedSecret || providedSecret !== webhookSecret) {
    return Response.json({ ok: false, error: "Invalid WAHA webhook secret." }, { status: 401 });
  }

  let body: WahaWebhookPayload;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.event !== "message") {
    return Response.json({ ok: true, skipped: true });
  }

  const payload = body.payload;
  const text = payload?.body?.trim();
  const chatId = payload?.id?.remote ?? payload?.from;
  const fromMe = payload?.id?.fromMe ?? false;

  if (fromMe || !text || !chatId) {
    return Response.json({ ok: true, skipped: true });
  }

  // Hanya proses jika pengirim punya role minimal operator
  const role = getUserRole(chatId);
  if (role === "none") {
    return Response.json({ ok: true, skipped: true });
  }

  // Rate limiting — abaikan diam-diam jika terlalu cepat
  if (!checkRateLimit(chatId)) {
    return Response.json({ ok: true, skipped: true, reason: "rate_limited" });
  }

  const lower = text.toLowerCase();
  const ctx = { chatId, args: "" };

  // ── Exact commands ──────────────────────────────────────────────────────
  if (lower === "!help") {
    handleHelp(ctx).catch(() => {});
  } else if (lower === "!group") {
    handleGroup(ctx).catch(() => {});
  } else if (lower === "!status") {
    handleStatus(ctx).catch(() => {});
  } else if (lower === "!laporan") {
    handleLaporan(ctx).catch(() => {});
  } else if (lower === "!schedule") {
    handleSchedule(ctx).catch(() => {});

  // ── Commands dengan argumen ─────────────────────────────────────────────
  } else if (lower === "!run") {
    handleRun({ chatId, args: "" }).catch(() => {});
  } else if (lower.startsWith("!run ")) {
    handleRun({ chatId, args: text.slice(5) }).catch(() => {});

  } else if (lower === "!info") {
    handleInfo({ chatId, args: "" }).catch(() => {});
  } else if (lower.startsWith("!info ")) {
    handleInfo({ chatId, args: text.slice(6) }).catch(() => {});

  } else if (lower === "!history") {
    handleHistory({ chatId, args: "" }).catch(() => {});
  } else if (lower.startsWith("!history ")) {
    handleHistory({ chatId, args: text.slice(9) }).catch(() => {});

  } else if (lower === "!pause") {
    handlePause({ chatId, args: "" }).catch(() => {});
  } else if (lower.startsWith("!pause ")) {
    handlePause({ chatId, args: text.slice(7) }).catch(() => {});

  } else if (lower === "!resume") {
    handleResume({ chatId, args: "" }).catch(() => {});
  } else if (lower.startsWith("!resume ")) {
    handleResume({ chatId, args: text.slice(8) }).catch(() => {});

  } else if (lower === "!screenshot") {
    handleScreenshot({ chatId, args: "" }).catch(() => {});
  } else if (lower.startsWith("!screenshot ")) {
    handleScreenshot({ chatId, args: text.slice(12) }).catch(() => {});

  } else if (lower === "!retry") {
    handleRetry({ chatId, args: "" }).catch(() => {});
  } else if (lower.startsWith("!retry ")) {
    handleRetry({ chatId, args: text.slice(7) }).catch(() => {});

  // ── Super admin commands ────────────────────────────────────────────────
  } else if (isProjectCommandText(text)) {
    handleCreateProject({ chatId, args: text }).catch(() => {});

  } else if (lower.startsWith("!edit ")) {
    handleEdit({ chatId, args: text.slice(6) }).catch(() => {});
  } else if (lower === "!edit") {
    handleEdit({ chatId, args: "" }).catch(() => {});

  } else if (lower === "!delete") {
    handleDelete({ chatId, args: "" }).catch(() => {});
  } else if (lower.startsWith("!delete ")) {
    handleDelete({ chatId, args: text.slice(8) }).catch(() => {});

  } else if (lower === "!confirm" || lower.startsWith("!confirm ")) {
    handleConfirm({ chatId, args: text.slice(8).trim() }).catch(() => {});

  } else {
    return Response.json({ ok: true, skipped: true });
  }

  return Response.json({ ok: true });
}
