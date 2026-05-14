import { getTelegramConfig, getTelegramAdminChatId } from "@/lib/config";
import { sendTelegramMessage, answerCallbackQuery } from "@/lib/telegram";
import {
  formatTelegramRequestExample,
  parseTelegramRequestPayload,
  requestLabelPattern,
} from "@/lib/telegram-request-parser";
import {
  startConversation,
  continueWithGroupSelection,
  continueAfterInvite,
  getConversationStep,
  cancelConversation,
  type RequesterMeta,
} from "@/lib/telegram-conversation";
import {
  parseCallbackData,
  setPendingReject,
  getPendingReject,
  clearPendingReject,
} from "@/lib/telegram-admin";
import {
  approveTelegramRequest,
  rejectTelegramRequest,
} from "@/lib/telegram-service";
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

function buildRequester(update: TelegramWebhookUpdate, chatId: string): RequesterMeta {
  const message = update.message!;
  return {
    updateId: update.update_id != null ? String(update.update_id) : undefined,
    messageId: message.message_id != null ? String(message.message_id) : undefined,
    chatId,
    chatType: message.chat?.type,
    chatTitle: message.chat?.title,
    userId: message.from?.id != null ? String(message.from.id) : undefined,
    username: message.from?.username,
    firstName: message.from?.first_name,
    lastName: message.from?.last_name,
  };
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
    "SBT Connect — Bot Request Laporan",
    "",
    "/help  - tampilkan bantuan",
    "/start - tampilkan bantuan",
    "/batal - batalkan sesi request yang sedang berjalan",
    "/daftar <username> - daftar akun dashboard",
    "",
    "Kirim format di bawah untuk mengajukan request laporan:",
    "",
    formatTelegramRequestExample(),
    "",
    "Catatan: Nama Grup Tujuan adalah nama grup WhatsApp, pisahkan dengan koma jika lebih dari satu.",
  ].join("\n");
}

function getWaBotName(): string {
  return process.env.WA_BOT_NAME?.trim() || "bot laporan";
}

function formatGroupSelectionMessage(groupName: string, candidates: { name: string; groupId: string }[]) {
  const list = candidates.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
  return [
    `Ditemukan ${candidates.length} grup dengan nama mengandung "${groupName}":`,
    "",
    list,
    "",
    "Balas dengan nomor yang kamu maksud (contoh: 1)",
  ].join("\n");
}

function formatInviteMessage(notJoined: { name: string; groupId: string }[]) {
  const grupList = notJoined.map((g) => `- ${g.name}`).join("\n");
  return [
    `Bot WhatsApp (${getWaBotName()}) belum tergabung di grup berikut:`,
    "",
    grupList,
    "",
    "Langkah yang perlu dilakukan:",
    `1. Buka grup WhatsApp di atas`,
    `2. Tambahkan nomor bot (${getWaBotName()}) sebagai anggota grup`,
    `3. Setelah selesai, balas pesan ini dengan: sudah`,
    "",
    "Atau ketik /batal untuk membatalkan request.",
  ].join("\n");
}

function formatSubmittedMessage(
  requestId: number,
  projectName: string,
  groupNames: string[],
  cron: string
) {
  return [
    "✅ Request diterima dan menunggu approval admin.",
    "",
    `ID Request: ${requestId}`,
    `Project: ${projectName}`,
    `Grup tujuan: ${groupNames.join(", ")}`,
    `Jam Running: ${cron}`,
    "",
    "Admin akan menghubungi jika request disetujui atau ditolak.",
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

  // ── Admin: menunggu alasan reject UserRequest ─────────────────────────────
  if (adminChatId && chatId === adminChatId) {
    const pendingUserReject = getPendingUserReject(chatId);
    if (pendingUserReject) {
      clearPendingUserReject(chatId);
      const reason = commandName(rawText) === "/skip" ? "" : rawText.trim();
      const { replyText } = await handleUserRequestRejectReason(chatId, pendingUserReject.requestId, reason);
      await safeReply(chatId, replyText);
      return Response.json({ ok: true, action: "user_req_rejected" });
    }
  }

  // ── Admin: menunggu alasan reject TelegramRequest ─────────────────────────
  if (adminChatId && chatId === adminChatId) {
    const pendingReject = getPendingReject(chatId);
    if (pendingReject) {
      return handleAdminRejectReason(chatId, rawText, pendingReject.requestId);
    }
  }

  const command = commandName(rawText);

  // ── /start /help ──────────────────────────────────────────────────────────
  if (command === "/start" || command === "/help") {
    await safeReply(chatId, helpText());
    return Response.json({ ok: true });
  }

  // ── /batal ────────────────────────────────────────────────────────────────
  if (command === "/batal") {
    const step = await getConversationStep(chatId);
    if (step) {
      await cancelConversation(chatId);
      await safeReply(chatId, "Sesi request dibatalkan.");
    } else {
      await safeReply(chatId, "Tidak ada sesi request yang aktif.");
    }
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

  // ── Cek conversation aktif ────────────────────────────────────────────────
  const activeStep = await getConversationStep(chatId);

  // ── Step: awaiting_group_selection ────────────────────────────────────────
  if (activeStep === "awaiting_group_selection") {
    const choice = Number.parseInt(rawText.trim(), 10);

    if (Number.isNaN(choice) || choice < 1) {
      if (requestLabelPattern.test(rawText)) {
        await cancelConversation(chatId);
        // Lanjut proses sebagai request baru (fall through)
      } else {
        await safeReply(chatId, "Balas dengan nomor pilihan grup (contoh: 1), atau kirim /batal untuk membatalkan.");
        return Response.json({ ok: true });
      }
    } else {
      const result = await continueWithGroupSelection(chatId, choice);
      return handleConversationResult(chatId, result);
    }
  }

  // ── Step: awaiting_invite ─────────────────────────────────────────────────
  if (activeStep === "awaiting_invite") {
    const lower = rawText.toLowerCase().trim();

    if (lower === "sudah" || lower === "done" || lower === "ok") {
      await safeReply(chatId, "Memverifikasi keanggotaan bot di grup...");
      const result = await continueAfterInvite(chatId);

      if (result.action === "ask_invite" && "retryable" in result && result.retryable) {
        await safeReply(
          chatId,
          [
            "Bot belum terdeteksi di grup berikut:",
            "",
            result.notJoined.map((g) => `- ${g.name}`).join("\n"),
            "",
            "Pastikan nomor bot sudah ditambahkan, lalu balas lagi dengan: sudah",
            "Atau ketik /batal untuk membatalkan.",
          ].join("\n")
        );
        return Response.json({ ok: true });
      }

      return handleConversationResult(chatId, result);
    }

    if (requestLabelPattern.test(rawText)) {
      await cancelConversation(chatId);
      // Lanjut sebagai request baru (fall through)
    } else {
      await safeReply(chatId, "Balas dengan *sudah* setelah mengundang bot ke grup, atau /batal untuk membatalkan.");
      return Response.json({ ok: true });
    }
  }

  // ── Request baru ──────────────────────────────────────────────────────────
  if (!requestLabelPattern.test(rawText)) {
    await safeReply(chatId, "Pesan belum dikenali. Kirim /help untuk melihat format request.");
    return Response.json({ ok: true, skipped: true });
  }

  const parseResult = parseTelegramRequestPayload(rawText);

  if (!parseResult.ok) {
    await safeReply(
      chatId,
      [
        "Format request tidak valid:",
        "",
        parseResult.errors.map((e) => `- ${e}`).join("\n"),
        "",
        "Kirim /help untuk melihat contoh format.",
      ].join("\n")
    );
    return Response.json({ ok: true, status: "parse_error" });
  }

  const requester = buildRequester(body, chatId);
  const result = await startConversation(chatId, parseResult.data, requester, rawText);
  return handleConversationResult(chatId, result);
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

  // ── Project request callbacks (approve: / reject:) ────────────────────────
  const parsed = parseCallbackData(callbackQuery.data);
  if (!parsed) {
    await answerCallbackQuery(callbackQueryId, "Aksi tidak dikenali.");
    return Response.json({ ok: true, skipped: true });
  }

  const { action, requestId } = parsed;

  if (action === "approve") {
    try {
      await answerCallbackQuery(callbackQueryId, "Memproses approval...");
      await approveTelegramRequest(requestId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await safeReply(adminChatId, `❌ Gagal approve request #${requestId}:\n${msg}`);
    }
    return Response.json({ ok: true, action: "approved" });
  }

  if (action === "reject") {
    await answerCallbackQuery(callbackQueryId, "Ketik alasan penolakan.");
    setPendingReject(adminChatId, requestId, callbackQueryId);
    await safeReply(
      adminChatId,
      [
        `Tolak request #${requestId}`,
        "",
        "Ketik alasan penolakan, atau kirim /skip untuk menolak tanpa alasan.",
      ].join("\n")
    );
    return Response.json({ ok: true, action: "awaiting_reject_reason" });
  }

  await answerCallbackQuery(callbackQueryId);
  return Response.json({ ok: true, skipped: true });
}

// ---------------------------------------------------------------------------
// Admin reject reason handler (TelegramRequest)
// ---------------------------------------------------------------------------

async function handleAdminRejectReason(
  adminChatId: string,
  text: string,
  requestId: number
): Promise<Response> {
  clearPendingReject(adminChatId);

  const reason = commandName(text) === "/skip" ? "" : text.trim();

  try {
    await rejectTelegramRequest(requestId, reason);
    await safeReply(
      adminChatId,
      reason
        ? `✅ Request #${requestId} ditolak.\nAlasan: ${reason}`
        : `✅ Request #${requestId} ditolak.`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await safeReply(adminChatId, `❌ Gagal menolak request #${requestId}:\n${msg}`);
  }

  return Response.json({ ok: true, action: "rejected" });
}

// ---------------------------------------------------------------------------
// Conversation result handler
// ---------------------------------------------------------------------------

async function handleConversationResult(
  chatId: string,
  result: Awaited<ReturnType<typeof startConversation>>
): Promise<Response> {
  switch (result.action) {
    case "ask_group_selection":
      await safeReply(chatId, formatGroupSelectionMessage(result.groupName, result.candidates));
      return Response.json({ ok: true, step: "awaiting_group_selection" });

    case "ask_invite":
      await safeReply(chatId, formatInviteMessage(result.notJoined));
      return Response.json({ ok: true, step: "awaiting_invite" });

    case "submitted": {
      const { prisma } = await import("@/lib/prisma");
      const req = await prisma.telegramRequest.findUnique({ where: { id: result.requestId } });
      const groupNames = safeParseJsonArray(req?.groupNames);
      await safeReply(
        chatId,
        formatSubmittedMessage(
          result.requestId,
          req?.projectName ?? "-",
          groupNames,
          req?.cronExpression ?? "-"
        )
      );
      return Response.json({ ok: true, requestId: result.requestId, status: "pending" }, { status: 201 });
    }

    case "error":
      await safeReply(
        chatId,
        [`❌ ${result.message}`, "", "Kirim /help untuk melihat format request, atau coba lagi."].join("\n")
      );
      return Response.json({ ok: true, status: "error" });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
