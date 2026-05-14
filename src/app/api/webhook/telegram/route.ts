import { getTelegramConfig, getTelegramAdminChatId } from "@/lib/config";
import { sendTelegramMessage, answerCallbackQuery } from "@/lib/telegram";
import {
  handleDaftarCommand,
  parseUserRequestCallback,
  handleUserRequestApprove,
  setPendingUserReject,
  getPendingUserReject,
  clearPendingUserReject,
  handleUserRequestRejectReason,
} from "@/lib/telegram-account-flow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TelegramUser = {
  id?: number | string;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramChat = {
  id?: number | string;
  type?: string;
  title?: string;
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type TelegramWebhookUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function commandName(text: string) {
  const firstToken = text.trim().split(/\s+/)[0] ?? "";
  return firstToken.replace(/@[\w_]+$/, "").toLowerCase();
}

async function safeReply(chatId: string, text: string): Promise<void> {
  try {
    await sendTelegramMessage(chatId, text);
  } catch {
    // Diam jika Telegram gagal
  }
}

function helpText() {
  return [
    "SBT Connect — Dashboard Bot",
    "",
    "/help    - tampilkan bantuan",
    "/start   - tampilkan bantuan",
    "/daftar <username> - daftar akun",
    "",
    "Untuk membuat dan mengelola project laporan, gunakan dashboard web.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Validasi config Telegram
  let config: { token: string; webhookSecret: string; username?: string };
  try {
    config = getTelegramConfig();
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Telegram config invalid" },
      { status: 500 }
    );
  }

  // Validasi webhook secret
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== config.webhookSecret) {
    return Response.json({ ok: false, error: "Invalid Telegram webhook secret." }, { status: 401 });
  }

  // Parse body
  let body: TelegramWebhookUpdate;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // ── callback_query ────────────────────────────────────────────────────────
  if (body.callback_query) {
    return handleCallbackQuery(body.callback_query);
  }

  // ── message ───────────────────────────────────────────────────────────────
  const message = body.message;
  const rawText = message?.text?.trim();
  const chatId = message?.chat?.id != null ? String(message.chat.id) : "";

  if (!message || !rawText || !chatId || message.from?.is_bot) {
    return Response.json({ ok: true, skipped: true });
  }

  const adminChatId = getTelegramAdminChatId();
  const command = commandName(rawText);

  // ── Admin: menunggu alasan reject UserRequest ─────────────────────────────
  if (adminChatId && chatId === adminChatId) {
    const pendingUserReject = getPendingUserReject(chatId);
    if (pendingUserReject) {
      clearPendingUserReject(chatId);
      const reason = command === "/skip" ? "" : rawText.trim();
      const { replyText } = await handleUserRequestRejectReason(chatId, pendingUserReject.requestId, reason);
      await safeReply(chatId, replyText);
      return Response.json({ ok: true, action: "user_req_rejected" });
    }
  }

  // ── /start /help ──────────────────────────────────────────────────────────
  if (command === "/start" || command === "/help") {
    await safeReply(chatId, helpText());
    return Response.json({ ok: true });
  }

  // ── /daftar <username> ────────────────────────────────────────────────────
  if (command === "/daftar") {
    const parts = rawText.trim().split(/\s+/);
    const requestedUsername = parts[1]?.trim() ?? "";
    if (!requestedUsername) {
      await safeReply(
        chatId,
        "Format: /daftar <username>\nContoh: /daftar budi_santoso\n\nUsername harus 3–20 karakter (huruf, angka, underscore)."
      );
      return Response.json({ ok: true });
    }

    const meta = {
      telegramUserId: message.from?.id != null ? String(message.from.id) : undefined,
      username: message.from?.username,
      firstName: message.from?.first_name,
      lastName: message.from?.last_name,
    };

    const result = await handleDaftarCommand(chatId, requestedUsername, meta);
    await safeReply(chatId, result.message);
    return Response.json({ ok: true, action: result.action });
  }

  // ── Pesan tidak dikenali ──────────────────────────────────────────────────
  await safeReply(chatId, "Pesan belum dikenali. Kirim /help untuk bantuan.");
  return Response.json({ ok: true, skipped: true });
}

// ---------------------------------------------------------------------------
// callback_query handler
// ---------------------------------------------------------------------------

async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<Response> {
  const callbackQueryId = callbackQuery.id;
  const adminChatId = callbackQuery.message?.chat?.id != null
    ? String(callbackQuery.message.chat.id)
    : callbackQuery.from.id != null
    ? String(callbackQuery.from.id)
    : "";

  if (!callbackQuery.data) {
    await answerCallbackQuery(callbackQueryId);
    return Response.json({ ok: true, skipped: true });
  }

  // ── User request callbacks (prefix: user_req_) ────────────────────────────
  if (callbackQuery.data.startsWith("user_req_")) {
    const parsed = parseUserRequestCallback(callbackQuery.data);
    if (!parsed) {
      await answerCallbackQuery(callbackQueryId, "Aksi tidak dikenali.");
      return Response.json({ ok: true, skipped: true });
    }

    if (parsed.action === "approve") {
      const { replyText } = await handleUserRequestApprove(callbackQueryId, parsed.requestId);
      await safeReply(adminChatId, replyText);
      return Response.json({ ok: true, action: "user_req_approved" });
    }

    if (parsed.action === "reject") {
      await answerCallbackQuery(callbackQueryId, "Ketik alasan penolakan.");
      setPendingUserReject(adminChatId, parsed.requestId, callbackQueryId);
      await safeReply(
        adminChatId,
        [
          `Tolak permintaan akun #${parsed.requestId}`,
          "",
          "Ketik alasan penolakan, atau kirim /skip untuk menolak tanpa alasan.",
        ].join("\n")
      );
      return Response.json({ ok: true, action: "awaiting_user_req_reject_reason" });
    }
  }

  await answerCallbackQuery(callbackQueryId, "Aksi tidak dikenali.");
  return Response.json({ ok: true, skipped: true });
}
