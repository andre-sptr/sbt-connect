/**
 * telegram-account-flow.ts
 *
 * Alur registrasi akun via Telegram:
 *
 *   User kirim /daftar <username>
 *     → validasi username
 *     → simpan UserRequest ke DB
 *     → kirim notif ke admin dengan tombol Approve / Reject
 *
 *   Admin klik Approve
 *     → buat User dengan password acak
 *     → kirim kredensial ke chatId user
 *     → update UserRequest status → "approved"
 *     → edit pesan admin (hapus tombol)
 *
 *   Admin klik Reject → ketik alasan → konfirmasi
 *     → kirim pemberitahuan ke chatId user
 *     → update UserRequest status → "rejected"
 *     → edit pesan admin (hapus tombol)
 */

import { prisma } from "@/lib/prisma";
import { getTelegramAdminChatId } from "@/lib/config";
import { sendTelegramMessage, editTelegramMessage, answerCallbackQuery } from "@/lib/telegram";
import { createUser, generatePassword } from "@/lib/user-service";
import type { TelegramInlineKeyboard } from "@/lib/telegram";

// ---------------------------------------------------------------------------
// Username validation
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function validateRequestedUsername(username: string): string | null {
  if (!username || !USERNAME_RE.test(username)) {
    return "Username harus 3–20 karakter, hanya huruf, angka, dan underscore (_).";
  }
  return null; // valid
}

// ---------------------------------------------------------------------------
// Callback data format
// ---------------------------------------------------------------------------

export function buildUserReqApproveData(requestId: number) {
  return `user_req_approve_${requestId}`;
}

export function buildUserReqRejectData(requestId: number) {
  return `user_req_reject_${requestId}`;
}

export function parseUserRequestCallback(
  data: string
): { action: "approve" | "reject"; requestId: number } | null {
  const match = data.match(/^user_req_(approve|reject)_(\d+)$/);
  if (!match) return null;
  return { action: match[1] as "approve" | "reject", requestId: Number(match[2]) };
}

// ---------------------------------------------------------------------------
// Admin notification
// ---------------------------------------------------------------------------

function buildUserRequestNotification(input: {
  requestId: number;
  requestedUsername: string;
  firstName?: string | null;
  username?: string | null;
  chatId: string;
}): string {
  const requester = input.firstName
    ? `${input.firstName}${input.username ? ` (@${input.username})` : ""}`
    : input.username
    ? `@${input.username}`
    : `chat ${input.chatId}`;

  return [
    `👤 Permintaan Akun Baru — #${input.requestId}`,
    ``,
    `Dari: ${requester}`,
    `Username diminta: ${input.requestedUsername}`,
    ``,
    `Setujui atau tolak permintaan ini.`,
  ].join("\n");
}

function buildApproveRejectKeyboard(requestId: number): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Setujui", callback_data: buildUserReqApproveData(requestId) },
        { text: "❌ Tolak", callback_data: buildUserReqRejectData(requestId) },
      ],
    ],
  };
}

async function sendAdminUserRequestNotification(requestId: number): Promise<void> {
  const adminChatId = getTelegramAdminChatId();
  if (!adminChatId) return;

  const req = await prisma.userRequest.findUnique({ where: { id: requestId } });
  if (!req) return;

  const text = buildUserRequestNotification({
    requestId: req.id,
    requestedUsername: req.requestedUsername,
    firstName: req.firstName,
    username: req.username,
    chatId: req.chatId,
  });

  try {
    const messageId = await sendTelegramMessage(adminChatId, text, {
      replyMarkup: buildApproveRejectKeyboard(requestId),
    });
    if (messageId) {
      await prisma.userRequest.update({
        where: { id: requestId },
        data: { adminMessageId: String(messageId) },
      });
    }
  } catch {
    // fire-and-forget — tidak boleh blok alur utama
  }
}

async function editAdminUserRequestMessage(requestId: number, statusText: string): Promise<void> {
  const adminChatId = getTelegramAdminChatId();
  if (!adminChatId) return;

  const req = await prisma.userRequest.findUnique({ where: { id: requestId } });
  if (!req?.adminMessageId) return;

  const messageId = Number(req.adminMessageId);
  if (!messageId) return;

  const original = buildUserRequestNotification({
    requestId: req.id,
    requestedUsername: req.requestedUsername,
    firstName: req.firstName,
    username: req.username,
    chatId: req.chatId,
  });

  try {
    await editTelegramMessage(adminChatId, messageId, `${original}\n\n${statusText}`, {
      replyMarkup: { inline_keyboard: [] },
    });
  } catch {
    // diam jika pesan sudah expired
  }
}

// ---------------------------------------------------------------------------
// Public: handle /daftar <username>
// ---------------------------------------------------------------------------

export type DaftarResult =
  | { action: "ok"; message: string }
  | { action: "error"; message: string };

export async function handleDaftarCommand(
  chatId: string,
  requestedUsername: string,
  meta: {
    telegramUserId?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }
): Promise<DaftarResult> {
  // 1. Validasi username
  const validationError = validateRequestedUsername(requestedUsername);
  if (validationError) {
    return { action: "error", message: validationError };
  }

  // 2. Cek sudah ada request pending dari chat ini
  const existing = await prisma.userRequest.findUnique({ where: { chatId } });
  if (existing && existing.status === "pending") {
    return {
      action: "error",
      message: `Kamu sudah memiliki permintaan akun yang sedang menunggu (username: ${existing.requestedUsername}). Tunggu konfirmasi dari admin.`,
    };
  }

  // 3. Cek apakah username sudah dipakai
  const takenUser = await prisma.user.findUnique({ where: { username: requestedUsername } });
  if (takenUser) {
    return {
      action: "error",
      message: `Username "${requestedUsername}" sudah digunakan. Coba nama lain.`,
    };
  }

  // 4. Cek apakah username sudah diminta orang lain (pending)
  const takenRequest = await prisma.userRequest.findFirst({
    where: { requestedUsername, status: "pending" },
  });
  if (takenRequest) {
    return {
      action: "error",
      message: `Username "${requestedUsername}" sedang diminta oleh pengguna lain. Coba nama lain.`,
    };
  }

  // 5. Simpan UserRequest (upsert agar bisa mengajukan ulang setelah ditolak)
  const req = await prisma.userRequest.upsert({
    where: { chatId },
    create: {
      chatId,
      telegramUserId: meta.telegramUserId,
      username: meta.username,
      firstName: meta.firstName,
      lastName: meta.lastName,
      requestedUsername,
      status: "pending",
    },
    update: {
      telegramUserId: meta.telegramUserId,
      username: meta.username,
      firstName: meta.firstName,
      lastName: meta.lastName,
      requestedUsername,
      status: "pending",
      adminMessageId: null,
      rejectionReason: null,
      reviewedAt: null,
    },
  });

  // 6. Kirim notif ke admin (fire-and-forget)
  sendAdminUserRequestNotification(req.id).catch(() => {});

  return {
    action: "ok",
    message: [
      `✅ Permintaan akun kamu sudah dikirim ke admin.`,
      ``,
      `Username yang diminta: ${requestedUsername}`,
      ``,
      `Kamu akan dihubungi di sini ketika admin sudah memutuskan.`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Public: handle callback approve/reject dari admin
// ---------------------------------------------------------------------------

export async function handleUserRequestApprove(
  callbackQueryId: string,
  requestId: number
): Promise<{ replyText: string }> {
  await answerCallbackQuery(callbackQueryId, "Memproses...");

  const req = await prisma.userRequest.findUnique({ where: { id: requestId } });
  if (!req) return { replyText: `❌ Request #${requestId} tidak ditemukan.` };
  if (req.status !== "pending") {
    return { replyText: `Request #${requestId} sudah diproses sebelumnya (${req.status}).` };
  }

  // Cek username masih tersedia
  const alreadyTaken = await prisma.user.findUnique({ where: { username: req.requestedUsername } });
  if (alreadyTaken) {
    return {
      replyText: `❌ Username "${req.requestedUsername}" sudah digunakan. Tolak dan minta user pilih username lain.`,
    };
  }

  // Generate password & buat user
  const password = generatePassword(12);
  await createUser(req.requestedUsername, password, "user");

  // Update UserRequest — simpan telegramChatId di User agar bisa resend credentials
  await prisma.$transaction([
    prisma.userRequest.update({
      where: { id: requestId },
      data: { status: "approved", reviewedAt: new Date() },
    }),
    prisma.user.update({
      where: { username: req.requestedUsername },
      data: { telegramChatId: req.chatId },
    }),
  ]);

  // Kirim kredensial ke user
  const credMsg = [
    `🎉 Akun kamu sudah disetujui!`,
    ``,
    `Username: ${req.requestedUsername}`,
    `Password: ${password}`,
    ``,
    `Login di: ${process.env.NEXT_PUBLIC_APP_URL || "dashboard"}`,
    `Segera ganti password setelah login pertama.`,
  ].join("\n");

  try {
    await sendTelegramMessage(req.chatId, credMsg);
  } catch {
    // gagal kirim — admin perlu resend manual dari dashboard
  }

  // Edit pesan admin
  await editAdminUserRequestMessage(requestId, `✅ Disetujui — akun "${req.requestedUsername}" dibuat.`);

  return { replyText: `✅ Akun "${req.requestedUsername}" dibuat dan kredensial dikirim ke user.` };
}

// ---------------------------------------------------------------------------
// Pending reject state (in-memory, per admin chatId)
// ---------------------------------------------------------------------------

type PendingUserRejectState = {
  requestId: number;
  callbackQueryId: string;
  expiresAt: number;
};

const REJECT_TTL_MS = 5 * 60 * 1000;

const globalForUserReject = globalThis as unknown as {
  tgUserReqPendingReject?: Map<string, PendingUserRejectState>;
};

function getUserRejectMap(): Map<string, PendingUserRejectState> {
  if (!globalForUserReject.tgUserReqPendingReject) {
    globalForUserReject.tgUserReqPendingReject = new Map();
  }
  return globalForUserReject.tgUserReqPendingReject;
}

export function setPendingUserReject(
  adminChatId: string,
  requestId: number,
  callbackQueryId: string
): void {
  getUserRejectMap().set(adminChatId, {
    requestId,
    callbackQueryId,
    expiresAt: Date.now() + REJECT_TTL_MS,
  });
}

export function getPendingUserReject(adminChatId: string): PendingUserRejectState | null {
  const map = getUserRejectMap();
  const state = map.get(adminChatId);
  if (!state) return null;
  if (Date.now() > state.expiresAt) {
    map.delete(adminChatId);
    return null;
  }
  return state;
}

export function clearPendingUserReject(adminChatId: string): void {
  getUserRejectMap().delete(adminChatId);
}

export async function handleUserRequestRejectReason(
  adminChatId: string,
  requestId: number,
  reason: string
): Promise<{ replyText: string }> {
  const req = await prisma.userRequest.findUnique({ where: { id: requestId } });
  if (!req) return { replyText: `❌ Request #${requestId} tidak ditemukan.` };
  if (req.status !== "pending") {
    return { replyText: `Request #${requestId} sudah diproses sebelumnya (${req.status}).` };
  }

  await prisma.userRequest.update({
    where: { id: requestId },
    data: { status: "rejected", rejectionReason: reason || null, reviewedAt: new Date() },
  });

  // Beritahu user
  const rejectMsg = reason
    ? `❌ Permintaan akun kamu ditolak.\n\nAlasan: ${reason}`
    : `❌ Permintaan akun kamu ditolak oleh admin.`;

  try {
    await sendTelegramMessage(req.chatId, rejectMsg);
  } catch {
    // diam
  }

  await editAdminUserRequestMessage(
    requestId,
    `❌ Ditolak${reason ? ` — Alasan: ${reason}` : ""}.`
  );

  return {
    replyText: reason
      ? `✅ Request #${requestId} ditolak.\nAlasan: ${reason}`
      : `✅ Request #${requestId} ditolak.`,
  };
}
