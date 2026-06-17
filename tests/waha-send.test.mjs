/**
 * tests/waha-send.test.mjs
 *
 * Regression tests untuk ketahanan pengiriman WAHA: timeout/retry dan
 * pemulihan sesi otomatis saat WAHA membalas "Target closed" (TargetCloseError).
 *
 * Tanpa logika di src/lib/waha-send.ts, satu balasan 500 langsung = gagal.
 * Test ini membuktikan kiriman tersebut kini pulih sendiri.
 */

import assert from "node:assert/strict";
import test from "node:test";

const {
  sendToWahaWithRecovery,
  restartWahaSession,
  looksLikeDeadSession,
  backoffDelay,
} = await import("../src/lib/waha-send.ts");

const CONFIG = { url: "http://waha.test", session: "default", apiKey: "secret-key" };
const noSleep = async () => {};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
    async json() {
      return typeof body === "string" ? JSON.parse(body) : body;
    },
  };
}

const TARGET_CLOSED_BODY = {
  statusCode: 500,
  exception: {
    message: "Protocol error (Runtime.callFunctionOn): Target closed",
    name: "TargetCloseError",
  },
};

/** Mock fetch yang merutekan berdasarkan method + path, dan merekam panggilan. */
function makeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    return handler({ url, method, calls });
  };
  fn.calls = calls;
  return fn;
}

test("looksLikeDeadSession mengenali TargetCloseError 500 dan mengabaikan 4xx biasa", () => {
  assert.equal(looksLikeDeadSession(500, JSON.stringify(TARGET_CLOSED_BODY)), true);
  assert.equal(looksLikeDeadSession(503, "browser has disconnected"), true);
  assert.equal(looksLikeDeadSession(422, "Session status is not as expected. Restart the session"), true);
  assert.equal(looksLikeDeadSession(500, "internal db error"), false);
  assert.equal(looksLikeDeadSession(401, "Unauthorized"), false);
  assert.equal(looksLikeDeadSession(200, "ok"), false);
});

test("backoffDelay naik secara eksponensial namun dibatasi", () => {
  assert.equal(backoffDelay(1), 2000);
  assert.equal(backoffDelay(2), 4000);
  assert.equal(backoffDelay(3), 8000);
  assert.equal(backoffDelay(10), 8000);
});

test("berhasil pada percobaan pertama: tanpa restart, tanpa retry", async () => {
  const fetchImpl = makeFetch(() => jsonResponse(200, { id: "msg-1" }));
  const out = await sendToWahaWithRecovery({
    config: CONFIG,
    path: "/api/sendImage",
    body: { chatId: "x@g.us" },
    fetchImpl,
    sleep: noSleep,
  });
  assert.equal(out.ok, true);
  assert.equal(out.attempts, 1);
  assert.equal(out.recovered, false);
  assert.equal(fetchImpl.calls.length, 1);
});

test("5xx transien lalu sukses: retry tanpa restart sesi", async () => {
  let sendCount = 0;
  const fetchImpl = makeFetch(({ url }) => {
    if (url.endsWith("/api/sendImage")) {
      sendCount += 1;
      return sendCount === 1 ? jsonResponse(502, "bad gateway") : jsonResponse(200, { id: "ok" });
    }
    throw new Error(`unexpected url ${url}`);
  });
  const out = await sendToWahaWithRecovery({
    config: CONFIG,
    path: "/api/sendImage",
    body: {},
    fetchImpl,
    sleep: noSleep,
  });
  assert.equal(out.ok, true);
  assert.equal(out.attempts, 2);
  assert.equal(out.recovered, false);
  // tidak boleh menyentuh endpoint sesi untuk 502 generik
  assert.equal(
    fetchImpl.calls.some((c) => c.url.includes("/api/sessions/")),
    false
  );
});

test("Target closed 500: restart sesi otomatis, tunggu WORKING, lalu kirim ulang sukses", async () => {
  let sendCount = 0;
  const fetchImpl = makeFetch(({ url, method }) => {
    if (url.endsWith("/api/sendImage")) {
      sendCount += 1;
      return sendCount === 1
        ? jsonResponse(500, TARGET_CLOSED_BODY)
        : jsonResponse(200, { id: "delivered" });
    }
    if (method === "POST" && url.includes("/api/sessions/") && url.endsWith("/restart")) {
      return jsonResponse(200, { name: "default", status: "STARTING" });
    }
    if (method === "GET" && url.includes("/api/sessions/")) {
      return jsonResponse(200, { name: "default", status: "WORKING" });
    }
    throw new Error(`unexpected url ${url}`);
  });

  const out = await sendToWahaWithRecovery({
    config: CONFIG,
    path: "/api/sendImage",
    body: {},
    fetchImpl,
    sleep: noSleep,
    sessionWaitMs: 30000,
  });

  assert.equal(out.ok, true);
  assert.equal(out.recovered, true);
  assert.equal(sendCount, 2);
  // restart sesi harus benar-benar dipanggil
  assert.equal(
    fetchImpl.calls.some((c) => c.method === "POST" && c.url.endsWith("/restart")),
    true
  );
});

test("4xx fatal (401): gagal cepat tanpa retry", async () => {
  const fetchImpl = makeFetch(() => jsonResponse(401, "Unauthorized"));
  const out = await sendToWahaWithRecovery({
    config: CONFIG,
    path: "/api/sendImage",
    body: {},
    fetchImpl,
    sleep: noSleep,
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 401);
  assert.equal(out.attempts, 1);
  assert.equal(fetchImpl.calls.length, 1);
});

test("sesi mati terus-menerus: menyerah setelah maxAttempts dengan recovered=true", async () => {
  const fetchImpl = makeFetch(({ url, method }) => {
    if (url.endsWith("/api/sendImage")) return jsonResponse(500, TARGET_CLOSED_BODY);
    if (method === "POST" && url.endsWith("/restart")) return jsonResponse(200, { status: "STARTING" });
    if (method === "GET" && url.includes("/api/sessions/")) return jsonResponse(200, { status: "STARTING" });
    throw new Error(`unexpected url ${url}`);
  });
  const out = await sendToWahaWithRecovery({
    config: CONFIG,
    path: "/api/sendImage",
    body: {},
    fetchImpl,
    sleep: noSleep,
    maxAttempts: 3,
    sessionWaitMs: 50, // biar polling cepat menyerah
  });
  assert.equal(out.ok, false);
  assert.equal(out.recovered, true);
  assert.equal(out.attempts, 3);
});

test("restartWahaSession fallback: path-style 404 → body-style berhasil", async () => {
  const fetchImpl = makeFetch(({ url }) => {
    if (url.endsWith(`/api/sessions/${CONFIG.session}/restart`)) return jsonResponse(404, "not found");
    if (url.endsWith("/api/sessions/restart")) return jsonResponse(200, { status: "STARTING" });
    throw new Error(`unexpected url ${url}`);
  });
  const ok = await restartWahaSession({ config: CONFIG, fetchImpl });
  assert.equal(ok, true);
  assert.equal(fetchImpl.calls.length, 2);
});

test("timeout request: AbortController membatalkan dan dihitung sebagai kegagalan transien", async () => {
  let sendCount = 0;
  const fetchImpl = async (url, init = {}) => {
    sendCount += 1;
    if (sendCount === 1) {
      // simulasikan request menggantung sampai di-abort
      return await new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    return jsonResponse(200, { id: "ok" });
  };
  const out = await sendToWahaWithRecovery({
    config: CONFIG,
    path: "/api/sendImage",
    body: {},
    fetchImpl,
    sleep: noSleep,
    timeoutMs: 20, // abort cepat
    maxAttempts: 2,
  });
  assert.equal(out.ok, true);
  assert.equal(out.attempts, 2);
});
