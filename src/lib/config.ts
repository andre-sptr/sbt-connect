export const staticLogin = {
  get username() {
    return getRequiredEnv("LOGIN_USERNAME");
  },
  get password() {
    return getRequiredEnv("LOGIN_PASSWORD");
  },
};

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
