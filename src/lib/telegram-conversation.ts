/**
 * telegram-conversation.ts
 *
 * State machine untuk alur request Telegram multi-step:
 *
 *   IDLE
 *     → user kirim request → parsing
 *     → jika ada grup ambigu  → AWAITING_GROUP_SELECTION
 *     → semua grup resolved   → CHECK_MEMBERSHIP
 *     → ada grup belum joined → AWAITING_INVITE
 *     → semua joined          → submit TelegramRequest (pending approval)
 *
 * State disimpan di tabel TelegramConversationState (DB),
 * sehingga aman ketika server restart.
 */

import { prisma } from "@/lib/prisma";
import { listCachedGroups } from "@/lib/group-cache";
import { checkBotGroupMembership } from "@/lib/waha";
import { createTelegramRequest } from "@/lib/telegram-service";
import { sendAdminRequestNotification } from "@/lib/telegram-admin";
import type { ParsedTelegramRequest } from "@/lib/telegram-request-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data request yang disimpan sebagai JSON di field `payload` */
export type ConversationPayload = {
  /** Data awal hasil parse request user */
  parsedRequest: ParsedTelegramRequest;
  /** Nama-nama grup yang sudah selesai di-resolve ke ID */
  resolvedGroups: ResolvedGroup[];
  /** Nama-nama grup yang masih menunggu resolusi (ambigu atau belum cek) */
  pendingGroupNames: string[];
  /** Antrian verifikasi membership — group name → group ID */
  pendingMembershipCheck: { name: string; groupId: string }[];
  /** Metadata requester untuk disimpan ke DB */
  requester: RequesterMeta;
};

export type ResolvedGroup = {
  name: string;   // nama yang diketik user
  groupId: string; // WA group ID
};

export type RequesterMeta = {
  updateId?: string;
  messageId?: string;
  chatId: string;
  chatType?: string;
  chatTitle?: string;
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

export type ConversationStep =
  | "awaiting_group_selection"
  | "awaiting_invite";

/** Row dari tabel TelegramConversationState */
type ConversationRow = {
  id: number;
  chatId: string;
  step: ConversationStep;
  payload: string;
  expiresAt: Date;
};

/** Tambahan: candidat saat step awaiting_group_selection */
export type GroupSelectionContext = {
  /** Nama grup ambigu yang sedang ditanyakan */
  groupName: string;
  /** Kandidat yang cocok */
  candidates: { name: string; groupId: string }[];
};

/** Payload mentah yang disimpan bersama candidates di DB */
type StoredPayload = ConversationPayload & {
  selectionContext?: GroupSelectionContext;
};

const CONVERSATION_TTL_MS = 30 * 60 * 1000; // 30 menit

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getState(chatId: string): Promise<ConversationRow | null> {
  const row = await prisma.telegramConversationState.findUnique({
    where: { chatId },
  });
  if (!row) return null;

  // Expired — hapus dan kembalikan null
  if (new Date() > row.expiresAt) {
    await prisma.telegramConversationState.delete({ where: { chatId } }).catch(() => {});
    return null;
  }

  return row as ConversationRow;
}

async function saveState(
  chatId: string,
  step: ConversationStep,
  payload: StoredPayload
): Promise<void> {
  const expiresAt = new Date(Date.now() + CONVERSATION_TTL_MS);
  await prisma.telegramConversationState.upsert({
    where: { chatId },
    create: { chatId, step, payload: JSON.stringify(payload), expiresAt },
    update: { step, payload: JSON.stringify(payload), expiresAt },
  });
}

async function clearState(chatId: string): Promise<void> {
  await prisma.telegramConversationState.deleteMany({ where: { chatId } });
}

function parsePayload(raw: string): StoredPayload {
  return JSON.parse(raw) as StoredPayload;
}

// ---------------------------------------------------------------------------
// Group resolution
// ---------------------------------------------------------------------------

type ResolveResult =
  | { type: "resolved"; group: ResolvedGroup }
  | { type: "ambiguous"; candidates: { name: string; groupId: string }[] }
  | { type: "not_found" };

async function resolveGroupName(groupName: string): Promise<ResolveResult> {
  const rows = await listCachedGroups(groupName);

  if (rows.length === 0) return { type: "not_found" };

  // Exact match (case-insensitive) takes priority
  const exactMatch = rows.find(
    (r) => r.name.trim().toLowerCase() === groupName.trim().toLowerCase()
  );
  if (exactMatch) {
    return { type: "resolved", group: { name: groupName, groupId: exactMatch.remote } };
  }

  if (rows.length === 1) {
    return { type: "resolved", group: { name: groupName, groupId: rows[0]!.remote } };
  }

  return {
    type: "ambiguous",
    candidates: rows.map((r) => ({ name: r.name, groupId: r.remote })),
  };
}

// ---------------------------------------------------------------------------
// Membership check & invite flow
// ---------------------------------------------------------------------------

type MembershipCheckResult =
  | { allJoined: true }
  | { allJoined: false; notJoined: { name: string; groupId: string }[] };

async function checkMembership(
  groups: ResolvedGroup[]
): Promise<MembershipCheckResult> {
  const ids = groups.map((g) => g.groupId);
  const results = await checkBotGroupMembership(ids);

  const notJoined = results
    .filter((r) => !r.isMember)
    .map((r) => {
      const group = groups.find((g) => g.groupId === r.groupId)!;
      return { name: group.name, groupId: r.groupId };
    });

  if (notJoined.length === 0) return { allJoined: true };
  return { allJoined: false, notJoined };
}

// ---------------------------------------------------------------------------
// Submit request
// ---------------------------------------------------------------------------

async function submitRequest(
  payload: ConversationPayload,
  rawMessage: string
): Promise<number> {
  const { parsedRequest, resolvedGroups, requester } = payload;

  const groupIds = resolvedGroups.map((g) => g.groupId);
  const groupNames = resolvedGroups.map((g) => g.name);

  const result = await createTelegramRequest({
    requester,
    rawMessage,
    parseResult: {
      ok: true,
      fields: {
        pic: [parsedRequest.pic.name, parsedRequest.pic.nik, parsedRequest.pic.unit]
          .filter(Boolean)
          .join(" / "),
        name: parsedRequest.name,
        groupNames: groupNames.join(", "),
        spreadsheetUrl: parsedRequest.spreadsheetUrl,
        gid: parsedRequest.gid,
        cellRange: parsedRequest.cellRange,
        caption: parsedRequest.caption,
        cronExpression: parsedRequest.cronExpression,
      },
      data: {
        ...parsedRequest,
        groupNames,
      },
    },
    resolvedGroupIds: groupIds,
    groupNames,
  });

  return result.id;
}

// ---------------------------------------------------------------------------
// Public API: start a new conversation from a fresh request
// ---------------------------------------------------------------------------

export type ConversationResult =
  | { action: "ask_group_selection"; groupName: string; candidates: { name: string; groupId: string }[] }
  | { action: "ask_invite"; notJoined: { name: string; groupId: string }[] }
  | { action: "submitted"; requestId: number }
  | { action: "error"; message: string };

/**
 * Mulai conversation baru dari request yang sudah di-parse.
 * Dipanggil dari webhook handler ketika user mengirim request baru.
 */
export async function startConversation(
  chatId: string,
  parsedRequest: ParsedTelegramRequest,
  requester: RequesterMeta,
  rawMessage: string
): Promise<ConversationResult> {
  const payload: ConversationPayload = {
    parsedRequest,
    resolvedGroups: [],
    pendingGroupNames: [...parsedRequest.groupNames],
    pendingMembershipCheck: [],
    requester,
  };

  return processNextGroupResolution(chatId, payload, rawMessage);
}

/**
 * Lanjutkan conversation: user memilih nomor untuk grup yang ambigu.
 */
export async function continueWithGroupSelection(
  chatId: string,
  choiceIndex: number // 1-based
): Promise<ConversationResult> {
  const row = await getState(chatId);
  if (!row || row.step !== "awaiting_group_selection") {
    return { action: "error", message: "Tidak ada sesi aktif yang menunggu pilihan grup." };
  }

  const stored = parsePayload(row.payload);
  const ctx = stored.selectionContext;
  if (!ctx) {
    return { action: "error", message: "Data sesi tidak valid." };
  }

  const chosen = ctx.candidates[choiceIndex - 1];
  if (!chosen) {
    return {
      action: "ask_group_selection",
      groupName: ctx.groupName,
      candidates: ctx.candidates,
    };
  }

  // Resolved — pindahkan ke resolvedGroups
  stored.resolvedGroups.push({ name: ctx.groupName, groupId: chosen.groupId });
  stored.selectionContext = undefined;

  const rawMessage = buildRawMessage(stored.parsedRequest);
  return processNextGroupResolution(chatId, stored, rawMessage);
}

/**
 * Lanjutkan conversation: user sudah mengundang bot ke grup.
 * Sistem akan polling WAHA untuk verifikasi.
 */
export async function continueAfterInvite(
  chatId: string
): Promise<ConversationResult & { retryable?: boolean }> {
  const row = await getState(chatId);
  if (!row || row.step !== "awaiting_invite") {
    return { action: "error", message: "Tidak ada sesi aktif yang menunggu konfirmasi invite." };
  }

  const stored = parsePayload(row.payload);
  const notJoined = stored.pendingMembershipCheck;
  if (notJoined.length === 0) {
    const rawMessage = buildRawMessage(stored.parsedRequest);
    return finishAfterMembership(chatId, stored, rawMessage);
  }

  // Polling WAHA — cek ulang hingga 3x dengan interval 2 detik
  const ids = notJoined.map((g) => g.groupId);
  let results = await checkBotGroupMembership(ids);
  let attempt = 0;
  while (results.some((r) => !r.isMember) && attempt < 2) {
    await delay(2000);
    results = await checkBotGroupMembership(ids);
    attempt++;
  }

  const stillNotJoined = results
    .filter((r) => !r.isMember)
    .map((r) => notJoined.find((g) => g.groupId === r.groupId)!);

  if (stillNotJoined.length > 0) {
    // Masih belum join, biarkan state tetap di awaiting_invite agar bisa dicoba ulang
    return {
      action: "ask_invite",
      notJoined: stillNotJoined,
      retryable: true,
    };
  }

  const rawMessage = buildRawMessage(stored.parsedRequest);
  return finishAfterMembership(chatId, stored, rawMessage);
}

// ---------------------------------------------------------------------------
// Get current conversation state (for webhook to check before routing)
// ---------------------------------------------------------------------------

export async function getConversationStep(
  chatId: string
): Promise<ConversationStep | null> {
  const row = await getState(chatId);
  return row ? row.step : null;
}

export async function cancelConversation(chatId: string): Promise<void> {
  await clearState(chatId);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function processNextGroupResolution(
  chatId: string,
  payload: ConversationPayload,
  rawMessage: string
): Promise<ConversationResult> {
  // Masih ada grup yang belum diproses?
  while (payload.pendingGroupNames.length > 0) {
    const groupName = payload.pendingGroupNames.shift()!;
    const result = await resolveGroupName(groupName);

    if (result.type === "not_found") {
      await clearState(chatId);
      return {
        action: "error",
        message: `Grup "${groupName}" tidak ditemukan di database. Minta admin refresh daftar grup dari dashboard terlebih dahulu.`,
      };
    }

    if (result.type === "ambiguous") {
      // Simpan state dan tanya ke user
      const stored: StoredPayload = {
        ...payload,
        selectionContext: { groupName, candidates: result.candidates },
      };
      await saveState(chatId, "awaiting_group_selection", stored);
      return { action: "ask_group_selection", groupName, candidates: result.candidates };
    }

    // resolved — lanjut
    payload.resolvedGroups.push(result.group);
  }

  // Semua grup terselesaikan — cek membership
  const memberCheck = await checkMembership(payload.resolvedGroups);

  if (!memberCheck.allJoined) {
    payload.pendingMembershipCheck = memberCheck.notJoined;
    await saveState(chatId, "awaiting_invite", { ...payload });
    return { action: "ask_invite", notJoined: memberCheck.notJoined };
  }

  // Semua join — submit
  return finishAfterMembership(chatId, payload, rawMessage);
}

async function finishAfterMembership(
  chatId: string,
  payload: ConversationPayload,
  rawMessage: string
): Promise<ConversationResult> {
  await clearState(chatId);
  try {
    const requestId = await submitRequest(payload, rawMessage);
    // Kirim notif ke admin Telegram dengan inline keyboard Approve/Reject
    // Fire-and-forget — tidak memblok response ke user
    sendAdminRequestNotification(requestId).catch(() => {});
    return { action: "submitted", requestId };
  } catch (error) {
    return {
      action: "error",
      message: error instanceof Error ? error.message : "Gagal menyimpan request.",
    };
  }
}

function buildRawMessage(parsed: ParsedTelegramRequest): string {
  return [
    `PIC Pengaju: ${[parsed.pic.name, parsed.pic.nik, parsed.pic.unit].filter(Boolean).join(" / ")}`,
    `Nama Project: ${parsed.name}`,
    `Nama Grup Tujuan: ${parsed.groupNames.join(", ")}`,
    `URL Spreadsheet: ${parsed.spreadsheetUrl}`,
    `GID Sheet: ${parsed.gid}`,
    `Rentang Cell: ${parsed.cellRange}`,
    `Caption: ${parsed.caption}`,
    `Jam Running: ${parsed.cronExpression}`,
  ].join("\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
