import type { TelegramRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { projectData, projectToDto } from "@/lib/project-service";
import { projectSchema, validateCronExpression } from "@/lib/project-validation";
import { reloadScheduler } from "@/lib/scheduler";
import { safeJsonArray } from "@/lib/utils";
import type { TelegramRequestParseResult } from "@/lib/telegram-request-parser";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatTelegramApprovalFeedback, formatTelegramRejectionFeedback } from "@/lib/telegram-command-helpers";
import {
  updateAdminNotificationApproved,
  updateAdminNotificationRejected,
} from "@/lib/telegram-admin";

export const telegramRequestStatuses = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
} as const;

type TelegramRequestStatus = (typeof telegramRequestStatuses)[keyof typeof telegramRequestStatuses];

type TelegramRequester = {
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

function splitPic(value?: string | null) {
  const [name = "", nik = "", unit = ""] = (value ?? "").split("/").map((part) => part.trim());
  return { name, nik, unit };
}

function parsedFields(result: TelegramRequestParseResult) {
  return result.fields;
}

export function telegramRequestToDto(request: TelegramRequest & { project?: { id: number; name: string } | null }) {
  return {
    ...request,
    groupIds: safeJsonArray(request.groupIds ?? "[]"),
    groupNames: safeJsonArray(request.groupNames ?? "[]"),
    project: request.project ?? null,
  };
}

/**
 * Simpan request Telegram ke database.
 *
 * @param resolvedGroupIds  - WA group IDs hasil resolusi nama → ID oleh conversation engine
 * @param groupNames        - Nama-nama grup yang diketik user (human-readable)
 */
export async function createTelegramRequest(input: {
  requester: TelegramRequester;
  rawMessage: string;
  parseResult: TelegramRequestParseResult;
  /** Resolved WA group IDs dari conversation engine. Jika tidak disediakan, groupIds diambil dari parseResult (legacy). */
  resolvedGroupIds?: string[];
  /** Nama-nama grup yang diketik user. */
  groupNames?: string[];
}) {
  const fields = parsedFields(input.parseResult);
  const pic = input.parseResult.ok ? input.parseResult.data.pic : splitPic(fields.pic);

  // Gunakan resolvedGroupIds jika tersedia (conversation engine path)
  // Fallback ke groupNames dari parseResult untuk backward compat
  const groupIds =
    input.resolvedGroupIds ??
    (input.parseResult.ok
      ? [] // groupIds sekarang diisi oleh conversation engine, bukan parser
      : []);

  const groupNames =
    input.groupNames ??
    (input.parseResult.ok && "groupNames" in input.parseResult.data
      ? (input.parseResult.data as { groupNames: string[] }).groupNames
      : []);

  return prisma.telegramRequest.create({
    data: {
      telegramUpdateId: input.requester.updateId,
      telegramMessageId: input.requester.messageId,
      chatId: input.requester.chatId,
      chatType: input.requester.chatType,
      chatTitle: input.requester.chatTitle,
      userId: input.requester.userId,
      username: input.requester.username,
      firstName: input.requester.firstName,
      lastName: input.requester.lastName,
      picName: pic.name || null,
      picNik: pic.nik || null,
      picUnit: pic.unit || null,
      projectName: fields.name || null,
      groupIds: groupIds.length > 0 ? JSON.stringify(groupIds) : null,
      groupNames: groupNames.length > 0 ? JSON.stringify(groupNames) : null,
      spreadsheetUrl: fields.spreadsheetUrl || null,
      gid: fields.gid || null,
      cellRange: fields.cellRange?.toUpperCase() || null,
      caption: fields.caption || null,
      cronExpression: fields.cronExpression || null,
      rawMessage: input.rawMessage,
      status: input.parseResult.ok ? telegramRequestStatuses.pending : telegramRequestStatuses.rejected,
      validationError: input.parseResult.ok ? null : input.parseResult.errors.join("\n"),
      rejectionReason: input.parseResult.ok ? null : "Payload tidak valid.",
      reviewedAt: input.parseResult.ok ? null : new Date(),
    },
  });
}

function assertPending(request: TelegramRequest) {
  if (request.status !== telegramRequestStatuses.pending) {
    throw new Error("Request sudah diproses.");
  }
}

async function sendTelegramFeedback(chatId: string, text: string) {
  try {
    await sendTelegramMessage(chatId, text);
  } catch {
    // Diam jika gagal
  }
}

export async function approveTelegramRequest(id: number) {
  const request = await prisma.telegramRequest.findUnique({ where: { id } });
  if (!request) throw new Error("Request Telegram tidak ditemukan.");
  assertPending(request);

  // groupIds sudah berisi resolved WA IDs dari conversation engine
  const groupIds = safeJsonArray(request.groupIds ?? "[]");

  const parsed = projectSchema.safeParse({
    name: request.projectName,
    groupIds,
    spreadsheetUrl: request.spreadsheetUrl,
    gid: request.gid,
    cellRange: request.cellRange,
    caption: request.caption,
    cronExpression: request.cronExpression,
    timezone: "Asia/Jakarta",
    enabled: true,
    maxRetries: 0,
    retryDelayMinutes: 5,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Input request Telegram tidak valid.");
  }

  if (!validateCronExpression(parsed.data.cronExpression, parsed.data.timezone)) {
    throw new Error("Jam Running tidak valid.");
  }

  const { project, updatedRequest } = await prisma.$transaction(async (tx) => {
    const createdProject = await tx.project.create({ data: projectData(parsed.data) });
    const approvedRequest = await tx.telegramRequest.update({
      where: { id },
      data: {
        status: telegramRequestStatuses.approved,
        projectId: createdProject.id,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
      include: { project: { select: { id: true, name: true } } },
    });

    return { project: createdProject, updatedRequest: approvedRequest };
  });

  await reloadScheduler();

  // Kirim feedback ke requester
  await sendTelegramFeedback(
    request.chatId,
    formatTelegramApprovalFeedback({
      requestId: request.id,
      projectName: project.name,
      projectId: project.id,
      cronExpression: project.cronExpression,
    })
  );

  // Edit pesan notif di chat admin (hapus tombol, tampilkan status)
  updateAdminNotificationApproved(request.id, project.name).catch(() => {});

  return {
    request: telegramRequestToDto(updatedRequest),
    project: projectToDto(project),
  };
}

export async function rejectTelegramRequest(id: number, reason: string) {
  const request = await prisma.telegramRequest.findUnique({ where: { id } });
  if (!request) throw new Error("Request Telegram tidak ditemukan.");
  assertPending(request);

  const rejectionReason = reason.trim() || "Ditolak oleh admin.";
  const updatedRequest = await prisma.telegramRequest.update({
    where: { id },
    data: {
      status: telegramRequestStatuses.rejected,
      rejectionReason,
      reviewedAt: new Date(),
    },
    include: { project: { select: { id: true, name: true } } },
  });

  // Kirim feedback ke requester
  await sendTelegramFeedback(
    request.chatId,
    formatTelegramRejectionFeedback({
      requestId: request.id,
      projectName: request.projectName,
      reason: rejectionReason,
    })
  );

  // Edit pesan notif di chat admin (hapus tombol, tampilkan status)
  updateAdminNotificationRejected(request.id, rejectionReason).catch(() => {});

  return telegramRequestToDto(updatedRequest);
}
