import { getWahaConfig } from "@/lib/config";

/**
 * Kirim pesan teks ke grup admin (ADMIN_GROUP_ID di env).
 * Jika env tidak dikonfigurasi, fungsi ini diam-diam dilewati.
 */
export async function notifyAdmin(message: string): Promise<void> {
  const adminGroupId = process.env.ADMIN_GROUP_ID?.trim();
  if (!adminGroupId) return;

  try {
    const config = getWahaConfig();
    await fetch(`${config.url.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify({
        session: config.session,
        chatId: adminGroupId,
        text: message,
      }),
    });
  } catch {
  }
}
