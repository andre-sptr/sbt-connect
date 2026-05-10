/**
 * telegram-admin.ts
 *
 * Semua logic yang berkaitan dengan admin Telegram:
 * - Kirim notif request baru ke TELEGRAM_ADMIN_CHAT_ID dengan inline keyboard Approve/Reject
 * - Edit pesan notif setelah admin menekan tombol (update status)
 * - Pending reject state — admin diminta ketik alasan setelah klik Reject
 */

import { getTelegramAdminChatId } from "@/lib/config";
import {
  sendTelegramMessage,
  editTelegramMessage,
  answerCallbackQuery,
  type TelegramInlineKeyboard,
} from "@/lib/telegram";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Callback data format
// approve:<requestId>    → admin approve request
// reject:<requestId>     → admin klik Reject (mulai alur ketik alasan)
// ---------------------------------------------------------------------------

export function buildApproveCallbackData(requestId: number) {
  return `approve:${requestId}`;
}

export function buildRejectCallbackData(requestId: number) {
  return `reject:${requestId}`;
}

export function parseCallbackData(data: string): { action: "approve" | "reject"; requestId: number } | null {
  const match = data.match(/^(approve|reject):(\d+)$/);
  if (!match) return null;
  return {
    action: match[1] as "approve" | "reject",
    requestId: Number(match[2]),
  };
}

// ---------------------------------------------------------------------------
// Format pesan notif admin
// ---------------------------------------------------------------------------

function formatRequestNotification(input: {
  requestId: number;
  picName?: string | null;
  picNik?: string | null;
  picUnit?: string | null;
  projectName?: string | null;
  groupNames: string[];
  cronExpression?: string | null;
  spreadsheetUrl?: string | null;
  cellRange?: string | null;
  requesterUsername?: string | null;
  requesterFirstName?: string | null;
  chatType?: string | null;
  chatTitle?: string | null;
  createdAt: Date;
}): string {
  const pic = [input.picName, input.picNik, input.picUnit].filter(Boolean).join(" / ") || "-";
  const requester = input.requesterFirstName
    ? `${input.requesterFirstName}${input.requesterUsername ? ` (@${input.requesterUsername})` : ""}`
    : input.requesterUsername
    ? `@${input.requesterUsername}`
    : "-";

  const chatInfo =
    input.chatType === "group" || input.chatType === "supergroup"
      ? ` via grup "${input.chatTitle ?? "?"}"`
      : "";

  const jakartaTime = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(input.createdAt);

  const urlShort = input.spreadsheetUrl
    ? input.spreadsheetUrl.replace(/^https?:\/\/docs\.google\.com\/spreadsheets\/d\//, "").slice(0, 20) + "..."
    : "-";

  return [
    `📋 Request Baru — #${input.requestId}`,
    "",
    `👤 PIC: ${pic}`,
    `📌 Project: ${input.projectName || "-"}`,
    `🏷 Grup: ${input.groupNames.length > 0 ? input.groupNames.join(", ") : "-"}`,
    `📅 Jadwal: ${input.cronExpression || "-"}`,
    `📊 Spreadsheet: ${urlShort}`,
    `📐 Range: ${input.cellRange || "-"}`,
    "",
    `Dari: ${requester}${chatInfo}`,
    `⏰ ${jakartaTime} WIB`,
  ].join("\n");
}

function buildApproveRejectKeyboard(requestId: number): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: buildApproveCallbackData(requestId) },
        { text: "❌ Reject", callback_data: buildRejectCallbackData(requestId) },
      ],
    ],
  };
}

// ---------------------------------------------------------------------------
// Public: kirim notif request baru ke admin
// ---------------------------------------------------------------------------

/**
 * Kirim notifikasi request baru ke TELEGRAM_ADMIN_CHAT_ID.
 * Return message_id pesan admin (disimpan ke TelegramRequest.adminMessageId).
 */
export async function sendAdminRequestNotification(requestId: number): Promise<void> {
  const adminChatId = getTelegramAdminChatId();
  if (!adminChatId) return;

  const request = await prisma.telegramRequest.findUnique({ where: { id: requestId } });
  if (!request) return;

  const groupNames = safeParseJsonArray(request.groupNames);

  const text = formatRequestNotification({
    requestId: request.id,
    picName: request.picName,
    picNik: request.picNik,
    picUnit: request.picUnit,
    projectName: request.projectName,
    groupNames,
    cronExpression: request.cronExpression,
    spreadsheetUrl: request.spreadsheetUrl,
    cellRange: request.cellRange,
    requesterUsername: request.username,
    requesterFirstName: request.firstName,
    chatType: request.chatType,
    chatTitle: request.chatTitle,
    createdAt: request.createdAt,
  });

  try {
    const messageId = await sendTelegramMessage(adminChatId, text, {
      replyMarkup: buildApproveRejectKeyboard(requestId),
    });

    if (messageId) {
      await prisma.telegramRequest.update({
        where: { id: requestId },
        data: { adminMessageId: String(messageId) },
      });
    }
  } catch {
    // Diam — notif admin gagal tidak boleh blok alur utama
  }
}

// ---------------------------------------------------------------------------
// Public: edit pesan admin setelah approve/reject
// ---------------------------------------------------------------------------

/**
 * Edit pesan notif admin — hapus tombol, tampilkan status final.
 */
export async function updateAdminNotificationApproved(requestId: number, projectName: string): Promise<void> {
  await editAdminMessage(requestId, `✅ Disetujui\n\nProject "${projectName}" telah dibuat dan aktif.`);
}

export async function updateAdminNotificationRejected(requestId: number, reason: string): Promise<void> {
  await editAdminMessage(requestId, `❌ Ditolak\n\nAlasan: ${reason.trim() || "Tidak ada alasan."}`);
}

async function editAdminMessage(requestId: number, statusText: string): Promise<void> {
  const adminChatId = getTelegramAdminChatId();
  if (!adminChatId) return;

  const request = await prisma.telegramRequest.findUnique({ where: { id: requestId } });
  if (!request?.adminMessageId) return;

  const messageId = Number(request.adminMessageId);
  if (!messageId) return;

  // Baca teks asli notif dari request data (rebuilt tanpa keyboard)
  const groupNames = safeParseJsonArray(request.groupNames);
  const originalText = formatRequestNotification({
    requestId: request.id,
    picName: request.picName,
    picNik: request.picNik,
    picUnit: request.picUnit,
    projectName: request.projectName,
    groupNames,
    cronExpression: request.cronExpression,
    spreadsheetUrl: request.spreadsheetUrl,
    cellRange: request.cellRange,
    requesterUsername: request.username,
    requesterFirstName: request.firstName,
    chatType: request.chatType,
    chatTitle: request.chatTitle,
    createdAt: request.createdAt,
  });

  const newText = `${originalText}\n\n${statusText}`;

  try {
    // Edit pesan: hapus inline keyboard (kirim empty reply_markup)
    await editTelegramMessage(adminChatId, messageId, newText, {
      replyMarkup: { inline_keyboard: [] },
    });
  } catch {
    // Diam jika pesan sudah terlalu lama atau sudah diedit sebelumnya
  }
}

// ---------------------------------------------------------------------------
// Pending reject reason state (in-memory, per admin chatId)
// Admin klik Reject → simpan state → tunggu alasan → eksekusi reject
// ---------------------------------------------------------------------------

type PendingRejectState = {
  requestId: number;
  callbackQueryId: string;
  expiresAt: number;
};

const REJECT_TTL_MS = 5 * 60 * 1000; // 5 menit

const globalForRejectState = globalThis as unknown as {
  tgAdminPendingReject?: Map<string, PendingRejectState>;
};

function getRejectMap(): Map<string, PendingRejectState> {
  if (!globalForRejectState.tgAdminPendingReject) {
    globalForRejectState.tgAdminPendingReject = new Map();
  }
  return globalForRejectState.tgAdminPendingReject;
}

export function setPendingReject(adminChatId: string, requestId: number, callbackQueryId: string): void {
  getRejectMap().set(adminChatId, {
    requestId,
    callbackQueryId,
    expiresAt: Date.now() + REJECT_TTL_MS,
  });
}

export function getPendingReject(adminChatId: string): PendingRejectState | null {
  const map = getRejectMap();
  const state = map.get(adminChatId);
  if (!state) return null;
  if (Date.now() > state.expiresAt) {
    map.delete(adminChatId);
    return null;
  }
  return state;
}

export function clearPendingReject(adminChatId: string): void {
  getRejectMap().delete(adminChatId);
}

// ---------------------------------------------------------------------------
// answerCallbackQuery re-export (convenience)
// ---------------------------------------------------------------------------

export { answerCallbackQuery };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
