import { getTelegramConfig } from "@/lib/config";

export type TelegramParseMode = "Markdown" | "HTML";

export interface SendTelegramMessageOptions {
  parseMode?: TelegramParseMode;
  disableWebPagePreview?: boolean;
  replyMarkup?: TelegramInlineKeyboard | TelegramReplyKeyboardRemove;
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramReplyKeyboardRemove {
  remove_keyboard: true;
  selective?: boolean;
}

/**
 * Kirim pesan teks ke chat Telegram.
 * Return message_id dari pesan yang terkirim (berguna untuk edit inline keyboard nanti).
 *
 * @param chatId  - ID chat tujuan (string agar mendukung angka besar)
 * @param text    - Teks pesan
 * @param options - Opsi tambahan: parseMode, replyMarkup, dsb.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: SendTelegramMessageOptions
): Promise<number> {
  const config = getTelegramConfig();

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: options?.disableWebPagePreview ?? true,
  };

  if (options?.parseMode) {
    body.parse_mode = options.parseMode;
  }

  if (options?.replyMarkup) {
    body.reply_markup = options.replyMarkup;
  }

  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Telegram sendMessage failed (${response.status}): ${responseText.slice(0, 300)}`);
  }

  const json = (await response.json()) as { result?: { message_id?: number } };
  return json.result?.message_id ?? 0;
}

/**
 * Edit teks pesan yang sudah terkirim (untuk update status inline keyboard).
 */
export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  options?: Pick<SendTelegramMessageOptions, "parseMode" | "replyMarkup">
): Promise<void> {
  const config = getTelegramConfig();

  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
  };

  if (options?.parseMode) {
    body.parse_mode = options.parseMode;
  }

  if (options?.replyMarkup) {
    body.reply_markup = options.replyMarkup;
  }

  const response = await fetch(`https://api.telegram.org/bot${config.token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Telegram editMessageText failed (${response.status}): ${responseText.slice(0, 300)}`);
  }
}

/**
 * Jawab callback query (hapus loading spinner di tombol inline keyboard).
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  const config = getTelegramConfig();

  await fetch(`https://api.telegram.org/bot${config.token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}
