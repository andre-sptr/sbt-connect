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

export function isAdminChat(chatId: string, adminGroupId: string | undefined) {
  const configured = adminGroupId?.trim();
  return Boolean(configured) && chatId.trim() === configured;
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
