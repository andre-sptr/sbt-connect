import { getTelegramConfig } from "@/lib/config";

export async function sendTelegramMessage(chatId: string, text: string) {
  const config = getTelegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Telegram sendMessage failed (${response.status}): ${responseText.slice(0, 300)}`);
  }
}
