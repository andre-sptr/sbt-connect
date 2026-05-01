import { z } from "zod";
import { CronExpressionParser } from "cron-parser";

export function findDuplicateGroupIds(groupIds: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const groupId of groupIds) {
    const normalized = groupId.trim();
    if (seen.has(normalized)) {
      duplicates.add(normalized);
    } else {
      seen.add(normalized);
    }
  }

  return Array.from(duplicates);
}

export const projectSchema = z.object({
  name: z.string().trim().min(2, "Nama projek wajib diisi."),
  groupIds: z
    .array(z.string().trim().min(5))
    .min(1, "Minimal satu group ID tujuan.")
    .refine((groupIds) => findDuplicateGroupIds(groupIds).length === 0, "Group ID tujuan tidak boleh duplikat."),
  spreadsheetUrl: z.string().trim().url("URL spreadsheet tidak valid."),
  gid: z.string().trim().min(1, "GID wajib diisi."),
  cellRange: z.string().trim().regex(/^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/i, "Format range contoh: A1:K22."),
  caption: z.string().trim().min(1, "Caption wajib diisi."),
  cronExpression: z.string().trim().min(5, "Cron expression wajib diisi."),
  timezone: z.string().trim().default("Asia/Jakarta"),
  enabled: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(5).default(0),
  retryDelayMinutes: z.number().int().min(1).max(60).default(5),
});

export type ProjectInput = z.infer<typeof projectSchema>;

export function validateCronExpression(expression: string, timezone = "Asia/Jakarta") {
  try {
    CronExpressionParser.parse(expression, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

export function getNextRunAt(expression: string, timezone = "Asia/Jakarta") {
  try {
    return CronExpressionParser.parse(expression, {
      currentDate: new Date(),
      tz: timezone,
    })
      .next()
      .toDate();
  } catch {
    return null;
  }
}

export function buildPublishedSheetUrl(spreadsheetUrl: string, gid: string, cellRange: string) {
  const sourceUrl = new URL(spreadsheetUrl);
  const publishedMatch = sourceUrl.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  const regularMatch = sourceUrl.pathname.match(/\/spreadsheets\/d\/([^/]+)/);

  let targetUrl: URL;
  if (publishedMatch?.[1]) {
    targetUrl = new URL(`https://docs.google.com/spreadsheets/d/e/${publishedMatch[1]}/pubhtml`);
  } else if (regularMatch?.[1]) {
    targetUrl = new URL(`https://docs.google.com/spreadsheets/d/${regularMatch[1]}/htmlview`);
  } else {
    targetUrl = sourceUrl;
  }

  targetUrl.searchParams.set("gid", gid);
  targetUrl.searchParams.set("single", "true");
  targetUrl.searchParams.set("range", cellRange);
  targetUrl.searchParams.set("widget", "false");
  targetUrl.searchParams.set("headers", "false");
  targetUrl.searchParams.set("chrome", "false");
  targetUrl.hash = "";

  return targetUrl.toString();
}
