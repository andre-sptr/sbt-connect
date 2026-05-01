import type { Project } from "@prisma/client";
import { getNextRunAt } from "@/lib/project-validation";
import { safeJsonArray } from "@/lib/utils";

export function projectToDto(project: Project) {
  return {
    ...project,
    groupIds: safeJsonArray(project.groupIds),
  };
}

export function projectData(input: {
  name: string;
  groupIds: string[];
  spreadsheetUrl: string;
  gid: string;
  cellRange: string;
  caption: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  maxRetries?: number;
  retryDelayMinutes?: number;
}) {
  return {
    name: input.name,
    groupIds: JSON.stringify(input.groupIds),
    spreadsheetUrl: input.spreadsheetUrl,
    gid: input.gid,
    cellRange: input.cellRange.toUpperCase(),
    caption: input.caption,
    cronExpression: input.cronExpression,
    timezone: input.timezone,
    enabled: input.enabled,
    maxRetries: input.maxRetries ?? 0,
    retryDelayMinutes: input.retryDelayMinutes ?? 5,
    nextRunAt: input.enabled ? getNextRunAt(input.cronExpression, input.timezone) : null,
  };
}

