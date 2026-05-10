import { getWahaConfig, getTelegramAdminChatId } from "@/lib/config";
import { sendTelegramMessage } from "@/lib/telegram";

export type NotifyChannel = "whatsapp" | "telegram" | "both";

export interface NotifyAdminOptions {
  /**
   * Channel pengiriman notifikasi.
   * Default: "both" — kirim ke WA group admin DAN Telegram admin chat.
   */
  channel?: NotifyChannel;
}

/**
 * Kirim notifikasi ke admin.
 *
 * - WhatsApp: ke ADMIN_GROUP_ID (atau semua SUPER_ADMIN_GROUP_IDS jika ada)
 * - Telegram: ke TELEGRAM_ADMIN_CHAT_ID
 *
 * Masing-masing channel independent — satu gagal tidak memblok yang lain.
 */
export async function notifyAdmin(
  message: string,
  options?: NotifyAdminOptions
): Promise<void> {
  const channel = options?.channel ?? "both";

  const tasks: Promise<void>[] = [];

  if (channel === "whatsapp" || channel === "both") {
    tasks.push(notifyAdminWhatsapp(message));
  }

  if (channel === "telegram" || channel === "both") {
    tasks.push(notifyAdminTelegram(message));
  }

  // Jalankan paralel, abaikan error
  await Promise.allSettled(tasks);
}

// ---------------------------------------------------------------------------
// Internal: WhatsApp
// ---------------------------------------------------------------------------

async function notifyAdminWhatsapp(message: string): Promise<void> {
  // Kumpulkan semua super admin group IDs (termasuk legacy ADMIN_GROUP_ID)
  const ids = collectWaAdminIds();
  if (ids.length === 0) return;

  let config: ReturnType<typeof getWahaConfig>;
  try {
    config = getWahaConfig();
  } catch {
    return;
  }

  await Promise.allSettled(
    ids.map((chatId) =>
      fetch(`${config.url.replace(/\/$/, "")}/api/sendText`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Api-Key": config.apiKey,
        },
        body: JSON.stringify({ session: config.session, chatId, text: message }),
      }).catch(() => {})
    )
  );
}

function collectWaAdminIds(): string[] {
  const ids = new Set<string>();

  // SUPER_ADMIN_GROUP_IDS (baru)
  const superAdminEnv = process.env.SUPER_ADMIN_GROUP_IDS ?? "";
  for (const id of superAdminEnv.split(",").map((s) => s.trim()).filter(Boolean)) {
    ids.add(id);
  }

  // ADMIN_GROUP_ID (legacy)
  const legacyId = process.env.ADMIN_GROUP_ID?.trim();
  if (legacyId) ids.add(legacyId);

  return Array.from(ids);
}

// ---------------------------------------------------------------------------
// Internal: Telegram
// ---------------------------------------------------------------------------

async function notifyAdminTelegram(message: string): Promise<void> {
  const adminChatId = getTelegramAdminChatId();
  if (!adminChatId) return;

  try {
    await sendTelegramMessage(adminChatId, message);
  } catch {
    // Diam jika Telegram tidak dapat dihubungi
  }
}
