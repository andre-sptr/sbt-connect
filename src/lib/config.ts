function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be configured server-side.`);
  }
  return value;
}

export function getWahaConfig() {
  const url = process.env.WAHA_URL;
  const session = process.env.WAHA_SESSION;
  const apiKey = process.env.WAHA_API_KEY;

  if (!url || !session || !apiKey) {
    throw new Error("WAHA_URL, WAHA_SESSION, and WAHA_API_KEY must be configured server-side.");
  }

  return { url, session, apiKey };
}

export function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const username = process.env.TELEGRAM_BOT_USERNAME;

  if (!token || !webhookSecret) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be configured server-side.");
  }

  return { token, webhookSecret, username };
}

export function getAuthSecret() {
  return process.env.AUTH_SECRET || "development-only-auth-secret";
}

/**
 * Konfigurasi role WhatsApp bot.
 *
 * Env:
 *   SUPER_ADMIN_GROUP_IDS  — ID grup/chat super admin, pisah koma
 *   OPERATOR_GROUP_IDS     — ID grup/chat operator, pisah koma
 *   ADMIN_GROUP_ID         — (legacy) diperlakukan sebagai super admin
 *
 * Jika hanya ADMIN_GROUP_ID yang diset, sistem tetap berjalan normal
 * dengan satu super admin (backward compatible).
 */
export function getRoleConfig() {
  const parse = (env: string | undefined) =>
    (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const superAdminIds = parse(process.env.SUPER_ADMIN_GROUP_IDS);
  const operatorIds = parse(process.env.OPERATOR_GROUP_IDS);
  const legacyAdminId = process.env.ADMIN_GROUP_ID?.trim();

  // ADMIN_GROUP_ID lama masuk sebagai super admin agar tidak breaking
  if (legacyAdminId && !superAdminIds.includes(legacyAdminId)) {
    superAdminIds.push(legacyAdminId);
  }

  return { superAdminIds, operatorIds };
}

/**
 * Telegram Admin Chat ID — tujuan notifikasi admin & inline keyboard approval.
 * Env: TELEGRAM_ADMIN_CHAT_ID
 */
export function getTelegramAdminChatId(): string | null {
  return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || null;
}
