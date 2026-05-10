import { getTelegramConfig } from "@/lib/config";
import { createTelegramRequest } from "@/lib/telegram-service";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatWhatsappGroupIdList } from "@/lib/telegram-command-helpers";
import { formatTelegramRequestExample, parseTelegramRequestPayload } from "@/lib/telegram-request-parser";
import { listCachedGroups } from "@/lib/group-cache";

type TelegramWebhookUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: {
      id?: number | string;
      type?: string;
      title?: string;
    };
    from?: {
      id?: number | string;
      is_bot?: boolean;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

const requestLabelPattern = /\b(PIC Pengaju|Nama Project|Group ID Tujuan|URL Spreadsheet|GID Sheet|Rentang Cell|Caption|Jam Running)\b/i;

function commandName(text: string) {
  const firstToken = text.trim().split(/\s+/)[0] ?? "";
  return firstToken.replace(/@[\w_]+$/, "").toLowerCase();
}

function helpText() {
  return [
    "SBT Connect Telegram Bot",
    "",
    "/groupid - tampilkan daftar WhatsApp group ID dari database",
    "/help - tampilkan bantuan",
    "",
    "Format request:",
    formatTelegramRequestExample(),
  ].join("\n");
}

async function safeReply(chatId: string, text: string) {
  try {
    await sendTelegramMessage(chatId, text);
  } catch {
  }
}

export async function POST(request: Request) {
  let config;
  try {
    config = getTelegramConfig();
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Telegram config invalid" }, { status: 500 });
  }

  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== config.webhookSecret) {
    return Response.json({ ok: false, error: "Invalid Telegram webhook secret." }, { status: 401 });
  }

  let body: TelegramWebhookUpdate;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id != null ? String(message.chat.id) : "";

  if (!message || !text || !chatId || message.from?.is_bot) {
    return Response.json({ ok: true, skipped: true });
  }

  const command = commandName(text);
  if (command === "/groupid") {
    const groups = await listCachedGroups();
    await safeReply(chatId, formatWhatsappGroupIdList(groups));
    return Response.json({ ok: true });
  }

  if (command === "/help" || command === "/start") {
    await safeReply(chatId, helpText());
    return Response.json({ ok: true });
  }

  if (!requestLabelPattern.test(text)) {
    await safeReply(chatId, "Pesan belum dikenali. Kirim /help untuk melihat format request.");
    return Response.json({ ok: true, skipped: true });
  }

  const parseResult = parseTelegramRequestPayload(text);
  const telegramRequest = await createTelegramRequest({
    requester: {
      updateId: body.update_id != null ? String(body.update_id) : undefined,
      messageId: message.message_id != null ? String(message.message_id) : undefined,
      chatId,
      chatType: message.chat?.type,
      chatTitle: message.chat?.title,
      userId: message.from?.id != null ? String(message.from.id) : undefined,
      username: message.from?.username,
      firstName: message.from?.first_name,
      lastName: message.from?.last_name,
    },
    rawMessage: text,
    parseResult,
  });

  if (!parseResult.ok) {
    await safeReply(
      chatId,
      [
        "Request belum bisa diproses karena format tidak valid.",
        "",
        parseResult.errors.map((error) => `- ${error}`).join("\n"),
        "",
        "Kirim /help untuk melihat contoh format.",
      ].join("\n")
    );
    return Response.json({ ok: true, requestId: telegramRequest.id, status: "rejected" });
  }

  await safeReply(
    chatId,
    [
      "Request diterima dan menunggu approval admin.",
      "",
      `ID Request: ${telegramRequest.id}`,
      `Project: ${parseResult.data.name}`,
      `Group tujuan: ${parseResult.data.groupIds.length}`,
      `Jam Running: ${parseResult.data.cronExpression}`,
    ].join("\n")
  );

  return Response.json({ ok: true, requestId: telegramRequest.id, status: "pending" }, { status: 201 });
}
