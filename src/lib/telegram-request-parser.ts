import { CronExpressionParser } from "cron-parser";

/**
 * Field labels yang dikenali dalam format request Telegram.
 * "Nama Grup Tujuan" menggantikan "Group ID Tujuan" — user cukup
 * mengetik nama grup, ID diselesaikan internal oleh sistem.
 */
const fieldLabels = {
  pic: "PIC Pengaju",
  name: "Nama Project",
  groupNames: "Nama Grup Tujuan",
  spreadsheetUrl: "URL Spreadsheet",
  gid: "GID Sheet",
  cellRange: "Rentang Cell",
  caption: "Caption",
  cronExpression: "Jam Running",
} as const;

type FieldKey = keyof typeof fieldLabels;

const labelToField = new Map<string, FieldKey>(
  Object.entries(fieldLabels).map(([key, label]) => [normalizeLabel(label), key as FieldKey])
);

const fieldPattern = /^\s*-?\s*([A-Za-z ]+?)\s*(?::|=|-)\s*(.*)$/;

export type TelegramRequesterPic = {
  name: string;
  nik: string;
  unit: string;
};

export type ParsedTelegramRequest = {
  pic: TelegramRequesterPic;
  name: string;
  /** Nama-nama grup yang diketik user — belum berupa ID. */
  groupNames: string[];
  spreadsheetUrl: string;
  gid: string;
  cellRange: string;
  caption: string;
  cronExpression: string;
};

export type TelegramRequestParseResult =
  | { ok: true; data: ParsedTelegramRequest; fields: Record<FieldKey, string> }
  | { ok: false; errors: string[]; fields: Partial<Record<FieldKey, string>> };

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseRawFields(text: string) {
  const fields: Partial<Record<FieldKey, string>> = {};
  let currentKey: FieldKey | null = null;
  let currentValue: string[] = [];

  function flushCurrent() {
    if (!currentKey) return;
    fields[currentKey] = currentValue.join("\n").trim();
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(fieldPattern);
    const key = match ? labelToField.get(normalizeLabel(match[1])) : undefined;

    if (key) {
      flushCurrent();
      currentKey = key;
      currentValue = [match?.[2] ?? ""];
      continue;
    }

    if (currentKey) currentValue.push(line);
  }

  flushCurrent();
  return fields;
}

function splitPic(value: string): TelegramRequesterPic {
  const [name = "", nik = "", unit = ""] = value.split("/").map((part) => part.trim());
  return { name, nik, unit };
}

/**
 * Parse nama-nama grup yang dipisahkan koma atau newline.
 * Setiap entry adalah nama grup, bukan ID.
 */
export function splitGroupNames(value: string): string[] {
  return value
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isValidCron(expression: string) {
  try {
    CronExpressionParser.parse(expression, { tz: "Asia/Jakarta" });
    return true;
  } catch {
    return false;
  }
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse payload pesan Telegram request.
 * Mengembalikan ParsedTelegramRequest dengan groupNames (bukan groupIds).
 * Resolusi nama → ID dilakukan kemudian oleh conversation engine.
 */
export function parseTelegramRequestPayload(text: string): TelegramRequestParseResult {
  const fields = parseRawFields(text);
  const errors: string[] = [];

  for (const [key, label] of Object.entries(fieldLabels) as Array<[FieldKey, string]>) {
    if (!fields[key]?.trim()) errors.push(`${label} wajib diisi.`);
  }

  if (fields.spreadsheetUrl && !isValidUrl(fields.spreadsheetUrl)) {
    errors.push(`${fieldLabels.spreadsheetUrl} tidak valid.`);
  }

  if (fields.cellRange && !/^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/i.test(fields.cellRange)) {
    errors.push(`${fieldLabels.cellRange} tidak valid. Contoh: A1:K22.`);
  }

  if (fields.cronExpression && !isValidCron(fields.cronExpression)) {
    errors.push(`${fieldLabels.cronExpression} tidak valid.`);
  }

  const groupNames = splitGroupNames(fields.groupNames ?? "");
  if (fields.groupNames && groupNames.length === 0) {
    errors.push(`${fieldLabels.groupNames} wajib berisi minimal satu nama grup.`);
  }

  if (errors.length > 0) return { ok: false, errors, fields };

  return {
    ok: true,
    fields: fields as Record<FieldKey, string>,
    data: {
      pic: splitPic(fields.pic ?? ""),
      name: fields.name ?? "",
      groupNames,
      spreadsheetUrl: fields.spreadsheetUrl ?? "",
      gid: fields.gid ?? "",
      cellRange: (fields.cellRange ?? "").toUpperCase(),
      caption: fields.caption ?? "",
      cronExpression: fields.cronExpression ?? "",
    },
  };
}

export function formatTelegramRequestExample() {
  return [
    "PIC Pengaju: Nama / NIK / Unit",
    "Nama Project: Sales Daily",
    "Nama Grup Tujuan: Sales Sumatera, Sales Jawa",
    "URL Spreadsheet: https://docs.google.com/spreadsheets/d/xxxx/edit",
    "GID Sheet: 0",
    "Rentang Cell: A1:K22",
    "Caption: *Laporan {projectName}*",
    "Tanggal: {date}",
    "Jam Running: 0 8 * * *",
  ].join("\n");
}

/** Pattern untuk mendeteksi apakah teks adalah format request Telegram. */
export const requestLabelPattern =
  /\b(PIC Pengaju|Nama Project|Nama Grup Tujuan|URL Spreadsheet|GID Sheet|Rentang Cell|Caption|Jam Running)\b/i;
