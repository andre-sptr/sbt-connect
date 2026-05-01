import { handleLaporan, handleRun, handleStatus } from "@/lib/bot-commands";

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
  let body: WahaWebhookPayload;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Hanya proses event 'message'
  if (body.event !== "message") {
    return Response.json({ ok: true, skipped: true });
  }

  const payload = body.payload;
  const text = payload?.body?.trim();
  const chatId = payload?.id?.remote ?? payload?.from;
  const fromMe = payload?.id?.fromMe ?? false;

  // Abaikan pesan dari bot sendiri
  if (fromMe || !text || !chatId) {
    return Response.json({ ok: true, skipped: true });
  }

  // Parse command (case-insensitive)
  const lower = text.toLowerCase();
  const ctx = { chatId, args: "" };

  if (lower === "!laporan") {
    // Fire & forget — jangan block response
    handleLaporan(ctx).catch(() => {});
  } else if (lower === "!status") {
    handleStatus(ctx).catch(() => {});
  } else if (lower.startsWith("!run ")) {
    handleRun({ chatId, args: text.slice(5) }).catch(() => {});
  } else if (lower === "!run") {
    handleRun({ chatId, args: "" }).catch(() => {});
  } else {
    // Bukan command yang dikenal — abaikan diam-diam
    return Response.json({ ok: true, skipped: true });
  }

  return Response.json({ ok: true });
}
