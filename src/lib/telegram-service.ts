import type { TelegramRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { projectData, projectToDto } from "@/lib/project-service";
import { projectSchema, validateCronExpression } from "@/lib/project-validation";
import { reloadScheduler } from "@/lib/scheduler";
import { safeJsonArray } from "@/lib/utils";
import type { TelegramRequestParseResult } from "@/lib/telegram-request-parser";

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
    project: request.project ?? null,
  };
}

export async function createTelegramRequest(input: {
  requester: TelegramRequester;
  rawMessage: string;
  parseResult: TelegramRequestParseResult;
}) {
  const fields = parsedFields(input.parseResult);
  const pic = input.parseResult.ok ? input.parseResult.data.pic : splitPic(fields.pic);
  const groupIds = input.parseResult.ok
    ? input.parseResult.data.groupIds
    : fields.groupIds?.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean) ?? [];

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

export async function approveTelegramRequest(id: number) {
  const request = await prisma.telegramRequest.findUnique({ where: { id } });
  if (!request) throw new Error("Request Telegram tidak ditemukan.");
  assertPending(request);

  const parsed = projectSchema.safeParse({
    name: request.projectName,
    groupIds: safeJsonArray(request.groupIds ?? "[]"),
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

  return {
    request: telegramRequestToDto(updatedRequest),
    project: projectToDto(project),
  };
}

export async function rejectTelegramRequest(id: number, reason: string) {
  const request = await prisma.telegramRequest.findUnique({ where: { id } });
  if (!request) throw new Error("Request Telegram tidak ditemukan.");
  assertPending(request);

  const updatedRequest = await prisma.telegramRequest.update({
    where: { id },
    data: {
      status: telegramRequestStatuses.rejected,
      rejectionReason: reason.trim() || "Ditolak oleh admin.",
      reviewedAt: new Date(),
    },
    include: { project: { select: { id: true, name: true } } },
  });

  return telegramRequestToDto(updatedRequest);
}
