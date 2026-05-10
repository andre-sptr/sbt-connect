import { getRoleConfig } from "@/lib/config";

// ---------------------------------------------------------------------------
// Project command field parser
// ---------------------------------------------------------------------------

const projectFieldPattern = /^\s*(Nama|Group ID|URL|GID|Cell|CAPTION|CRONTAB|RETRY)\s*=\s*(.*)$/i;

export type ProjectCommandFields = {
  nama?: string;
  groupId?: string;
  url?: string;
  gid?: string;
  cell?: string;
  caption?: string;
  crontab?: string;
  retry?: string;
};

function normalizeFieldKey(key: string): keyof ProjectCommandFields {
  const normalized = key.trim().toLowerCase();
  if (normalized === "group id") return "groupId";
  return normalized as keyof ProjectCommandFields;
}

export function isProjectCommandText(text: string) {
  return /^!project(?:\s|$)/i.test(text.trim());
}

export function parseProjectCommandFields(text: string): ProjectCommandFields {
  const withoutCommand = text.trim().replace(/^!project(?:\s+|$)/i, "");
  const fields: ProjectCommandFields = {};
  let currentKey: keyof ProjectCommandFields | null = null;
  let currentValue: string[] = [];

  function flushCurrent() {
    if (!currentKey) return;
    fields[currentKey] = currentValue.join("\n").trim();
  }

  for (const line of withoutCommand.split(/\r?\n/)) {
    const match = line.match(projectFieldPattern);
    if (match) {
      flushCurrent();
      currentKey = normalizeFieldKey(match[1]);
      currentValue = [match[2] ?? ""];
      continue;
    }

    if (currentKey) currentValue.push(line);
  }

  flushCurrent();
  return fields;
}

export function formatProjectCommandExample() {
  return [
    "!project",
    "Nama = Sales Daily",
    "Group ID = 120363xxxxxxxx@g.us",
    "URL = https://docs.google.com/spreadsheets/d/xxxx/edit",
    "GID = 0",
    "Cell = A1:K22",
    "CAPTION = *Laporan {projectName}*",
    "Tanggal: {date}",
    "CRONTAB = 0 8 * * *",
    "RETRY = 2",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Role-Based Access Control (RBAC)
// ---------------------------------------------------------------------------

export type UserRole = "super_admin" | "operator" | "none";

/**
 * Tentukan role chatId berdasarkan env SUPER_ADMIN_GROUP_IDS, OPERATOR_GROUP_IDS,
 * dan ADMIN_GROUP_ID (legacy).
 */
export function getUserRole(chatId: string): UserRole {
  const id = chatId.trim();
  const { superAdminIds, operatorIds } = getRoleConfig();

  if (superAdminIds.includes(id)) return "super_admin";
  if (operatorIds.includes(id)) return "operator";
  return "none";
}

/**
 * Cek apakah chatId punya role minimal `required`.
 * Hierarki: super_admin > operator > none
 */
export function hasRole(chatId: string, required: "super_admin" | "operator"): boolean {
  const role = getUserRole(chatId);
  if (required === "operator") return role === "super_admin" || role === "operator";
  if (required === "super_admin") return role === "super_admin";
  return false;
}

// ---------------------------------------------------------------------------
// Rate Limiting (in-memory, per chatId)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 3000; // 3 detik antar command

const globalForRateLimit = globalThis as unknown as {
  waBotRateLimit?: Map<string, number>;
};

function getRateLimitMap(): Map<string, number> {
  if (!globalForRateLimit.waBotRateLimit) {
    globalForRateLimit.waBotRateLimit = new Map();
  }
  return globalForRateLimit.waBotRateLimit;
}

/**
 * Cek apakah chatId boleh mengirim command sekarang.
 * Jika boleh, update timestamp dan return true.
 * Jika terlalu cepat, return false.
 */
export function checkRateLimit(chatId: string): boolean {
  const map = getRateLimitMap();
  const now = Date.now();
  const last = map.get(chatId) ?? 0;

  if (now - last < RATE_LIMIT_MS) return false;

  map.set(chatId, now);
  return true;
}

// ---------------------------------------------------------------------------
// Legacy helper (backward compat — masih dipakai bot-commands lama)
// ---------------------------------------------------------------------------

/** @deprecated Gunakan hasRole(chatId, "operator") */
export function isAdminChat(chatId: string, adminGroupId: string | undefined) {
  const configured = adminGroupId?.trim();
  return Boolean(configured) && chatId.trim() === configured;
}
