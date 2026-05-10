import { runProject } from "@/lib/bot";
import {
  formatProjectCommandExample,
  hasRole,
  parseProjectCommandFields,
  isProjectCommandText,
} from "@/lib/bot-command-parser";
import { getWahaConfig } from "@/lib/config";
import { listCachedGroups } from "@/lib/group-cache";
import { prisma } from "@/lib/prisma";
import { projectData } from "@/lib/project-service";
import { projectSchema, validateCronExpression, getNextRunAt } from "@/lib/project-validation";
import { reloadScheduler } from "@/lib/scheduler";
import { parseGroupIds, safeJsonArray } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function replyText(chatId: string, text: string): Promise<void> {
  try {
    const config = getWahaConfig();
    await fetch(`${config.url.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify({ session: config.session, chatId, text }),
    });
  } catch {
    // Diam jika WAHA tidak dapat dihubungi
  }
}

type CommandContext = { chatId: string; args: string };

async function ensureOperator(chatId: string): Promise<boolean> {
  if (hasRole(chatId, "operator")) return true;
  await replyText(chatId, "Akses ditolak. Command ini hanya untuk operator atau super admin.");
  return false;
}

async function ensureSuperAdmin(chatId: string): Promise<boolean> {
  if (hasRole(chatId, "super_admin")) return true;
  await replyText(chatId, "Akses ditolak. Command ini hanya untuk super admin.");
  return false;
}

function formatJakartaDateTime(value?: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

/** Cari project berdasarkan nama. Balas ke chatId jika tidak ditemukan atau ambigu. */
async function resolveProject(chatId: string, name: string, command: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    await replyText(chatId, `Sertakan nama project. Contoh: \`${command} Reporting Harian\``);
    return null;
  }

  const matches = await prisma.project.findMany({
    where: { name: { contains: trimmed } },
    orderBy: { name: "asc" },
  });

  if (matches.length === 0) {
    await replyText(chatId, `Project dengan nama "${trimmed}" tidak ditemukan.`);
    return null;
  }

  if (matches.length > 1) {
    const lines = matches.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
    await replyText(
      chatId,
      [
        `Ditemukan ${matches.length} project dengan nama mengandung "${trimmed}":`,
        "",
        lines,
        "",
        `Kirim ${command} dengan nama yang lebih spesifik.`,
      ].join("\n")
    );
    return null;
  }

  return matches[0]!;
}

function missingProjectFields(fields: ReturnType<typeof parseProjectCommandFields>) {
  const required: Array<[keyof typeof fields, string]> = [
    ["nama", "Nama"],
    ["groupId", "Group ID"],
    ["url", "URL"],
    ["gid", "GID"],
    ["cell", "Cell"],
    ["caption", "CAPTION"],
    ["crontab", "CRONTAB"],
    ["retry", "RETRY"],
  ];
  return required.filter(([key]) => !fields[key]?.trim()).map(([, label]) => label);
}

// ---------------------------------------------------------------------------
// Pending state — untuk !edit (preview) dan !delete (konfirmasi)
// Disimpan in-memory dengan auto-expire 60 detik.
// ---------------------------------------------------------------------------

type PendingEdit = {
  type: "edit";
  projectId: number;
  projectName: string;
  field: EditableField;
  oldValue: string;
  newValue: string;
  expiresAt: number;
};

type PendingDelete = {
  type: "delete";
  projectId: number;
  projectName: string;
  expiresAt: number;
};

type PendingState = PendingEdit | PendingDelete;

const PENDING_TTL_MS = 60_000; // 60 detik

const globalForPending = globalThis as unknown as {
  waBotPending?: Map<string, PendingState>;
};

function getPendingMap(): Map<string, PendingState> {
  if (!globalForPending.waBotPending) {
    globalForPending.waBotPending = new Map();
  }
  return globalForPending.waBotPending;
}

type PendingEditInput = Omit<PendingEdit, "expiresAt">;
type PendingDeleteInput = Omit<PendingDelete, "expiresAt">;

function setPending(chatId: string, state: PendingEditInput | PendingDeleteInput) {
  getPendingMap().set(chatId, {
    ...state,
    expiresAt: Date.now() + PENDING_TTL_MS,
  } as PendingState);
}

function getPending(chatId: string): PendingState | null {
  const map = getPendingMap();
  const state = map.get(chatId);
  if (!state) return null;
  if (Date.now() > state.expiresAt) {
    map.delete(chatId);
    return null;
  }
  return state;
}

function clearPending(chatId: string) {
  getPendingMap().delete(chatId);
}

// ---------------------------------------------------------------------------
// !edit field definitions
// ---------------------------------------------------------------------------

const EDITABLE_FIELDS = ["cron", "caption", "name", "enabled", "retries"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

const FIELD_LABELS: Record<EditableField, string> = {
  cron: "Jadwal (cron expression)",
  caption: "Caption",
  name: "Nama project",
  enabled: "Status aktif (true/false)",
  retries: "Max retries (0-5)",
};

/**
 * Parse `!edit [nama project] [field] = [value]`
 * Field key harus salah satu dari EDITABLE_FIELDS.
 */
function parseEditCommand(args: string): { projectName: string; field: EditableField; value: string } | null {
  // Pattern: cari " field = value" di akhir string (field adalah salah satu kata kunci)
  const fieldPattern = new RegExp(
    `^(.+?)\\s+(${EDITABLE_FIELDS.join("|")})\\s*=\\s*(.+)$`,
    "i"
  );
  const match = args.trim().match(fieldPattern);
  if (!match) return null;

  return {
    projectName: match[1]!.trim(),
    field: match[2]!.toLowerCase() as EditableField,
    value: match[3]!.trim(),
  };
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

export async function handleHelp({ chatId }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const isSuperAdmin = hasRole(chatId, "super_admin");

  const operatorCommands = [
    "!help              - tampilkan bantuan command",
    "!status            - daftar project aktif & jadwal berikutnya",
    "!schedule          - jadwal project hari ini",
    "!laporan           - jalankan project dengan jadwal terdekat",
    "!run [nama]        - jalankan project berdasarkan nama",
    "!screenshot [nama] - ambil screenshot tanpa kirim WA",
    "!retry [nama]      - ulangi run terakhir yang gagal",
    "!info [nama]       - detail project",
    "!history [nama]    - riwayat 5 run terakhir",
    "!pause [nama]      - nonaktifkan project sementara",
    "!resume [nama]     - aktifkan kembali project",
    "!group             - tampilkan daftar cached group",
  ];

  const superAdminCommands = [
    "!project           - buat project baru (format multiline)",
    "!edit [nama] [field] = [value] - edit field project",
    "!delete [nama]     - hapus project",
    "",
    "Field !edit: cron, caption, name, enabled, retries",
  ];

  const lines = [
    "*SBT Connect Commands*",
    "",
    ...operatorCommands,
  ];

  if (isSuperAdmin) {
    lines.push("", "*Super Admin:*", ...superAdminCommands);
    lines.push("", "*Format !project:*", formatProjectCommandExample());
  }

  await replyText(chatId, lines.join("\n"));
}

export async function handleGroup({ chatId }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const groups = await listCachedGroups();
  if (groups.length === 0) {
    await replyText(chatId, "Belum ada cached group. Refresh daftar group dari dashboard terlebih dahulu.");
    return;
  }

  const limit = 50;
  const lines = groups
    .slice(0, limit)
    .map((group, index) => `${index + 1}. ${group.name}\n   ID: ${group.remote}`);
  const suffix =
    groups.length > limit
      ? `\n\nDitampilkan ${limit} dari ${groups.length} group.`
      : `\n\nTotal: ${groups.length} group.`;

  await replyText(chatId, `*Cached WhatsApp Groups*\n\n${lines.join("\n\n")}${suffix}`);
}

export async function handleCreateProject({ chatId, args }: CommandContext) {
  if (!(await ensureSuperAdmin(chatId))) return;

  const fields = parseProjectCommandFields(args);
  const missing = missingProjectFields(fields);
  if (missing.length > 0) {
    await replyText(
      chatId,
      [
        `Format !project belum lengkap. Field wajib: ${missing.join(", ")}.`,
        "",
        "*Contoh:*",
        formatProjectCommandExample(),
      ].join("\n")
    );
    return;
  }

  const parsed = projectSchema.safeParse({
    name: fields.nama,
    groupIds: parseGroupIds(fields.groupId ?? ""),
    spreadsheetUrl: fields.url,
    gid: fields.gid,
    cellRange: fields.cell,
    caption: fields.caption,
    cronExpression: fields.crontab,
    timezone: "Asia/Jakarta",
    enabled: true,
    maxRetries: Number.parseInt(fields.retry ?? "", 10),
    retryDelayMinutes: 5,
  });

  if (!parsed.success) {
    await replyText(chatId, parsed.error.issues[0]?.message || "Input tidak valid.");
    return;
  }

  if (!validateCronExpression(parsed.data.cronExpression, parsed.data.timezone)) {
    await replyText(chatId, "Cron expression tidak valid.");
    return;
  }

  try {
    const project = await prisma.project.create({ data: projectData(parsed.data) });
    await reloadScheduler();
    await replyText(
      chatId,
      [
        "Project berhasil dibuat.",
        "",
        `Nama: ${project.name}`,
        `ID: ${project.id}`,
        `Group tujuan: ${parsed.data.groupIds.length}`,
        `CRONTAB: ${project.cronExpression}`,
        `Next run: ${formatJakartaDateTime(project.nextRunAt)}`,
      ].join("\n")
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await replyText(chatId, `Gagal membuat project:\n${msg.slice(0, 300)}`);
  }
}

export async function handleStatus({ chatId }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const projects = await prisma.project.findMany({
    where: { enabled: true },
    orderBy: { nextRunAt: "asc" },
  });

  if (projects.length === 0) {
    await replyText(chatId, "Tidak ada project aktif saat ini.");
    return;
  }

  const formatter = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  const lines = projects.map((p) => {
    const next = p.nextRunAt ? formatter.format(p.nextRunAt) : "-";
    return `- *${p.name}*\n  Next: ${next}`;
  });

  await replyText(chatId, `*Status SBT Connect*\n\n${lines.join("\n\n")}`);
}

export async function handleRun({ chatId, args }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const project = await resolveProject(chatId, args, "!run");
  if (!project) return;

  await replyText(chatId, `Menjalankan project *${project.name}*...`);
  try {
    await runProject(project.id, "full");
    await replyText(chatId, `*${project.name}* berhasil dijalankan.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await replyText(chatId, `Gagal menjalankan *${project.name}*:\n${msg.slice(0, 300)}`);
  }
}

export async function handleLaporan({ chatId }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const project = await prisma.project.findFirst({
    where: { enabled: true },
    orderBy: { nextRunAt: "asc" },
  });

  if (!project) {
    await replyText(chatId, "Tidak ada project aktif untuk dijalankan.");
    return;
  }

  await replyText(chatId, `Menjalankan laporan *${project.name}*...`);
  try {
    await runProject(project.id, "full");
    await replyText(chatId, `Laporan *${project.name}* berhasil dikirim.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await replyText(chatId, `Gagal:\n${msg.slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// F2-1: !pause / !resume
// ---------------------------------------------------------------------------

export async function handlePause({ chatId, args }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const project = await resolveProject(chatId, args, "!pause");
  if (!project) return;

  if (!project.enabled) {
    await replyText(chatId, `Project *${project.name}* sudah dalam kondisi nonaktif.`);
    return;
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { enabled: false, nextRunAt: null },
  });
  await reloadScheduler();
  await replyText(chatId, `⏸ Project *${project.name}* dinonaktifkan sementara.\nGunakan !resume untuk mengaktifkan kembali.`);
}

export async function handleResume({ chatId, args }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const project = await resolveProject(chatId, args, "!resume");
  if (!project) return;

  if (project.enabled) {
    await replyText(chatId, `Project *${project.name}* sudah aktif.`);
    return;
  }

  const nextRunAt = getNextRunAt(project.cronExpression, project.timezone);
  await prisma.project.update({
    where: { id: project.id },
    data: { enabled: true, nextRunAt },
  });
  await reloadScheduler();
  await replyText(
    chatId,
    [
      `▶️ Project *${project.name}* diaktifkan kembali.`,
      `Next run: ${formatJakartaDateTime(nextRunAt)}`,
    ].join("\n")
  );
}

// ---------------------------------------------------------------------------
// F2-2: !info [nama]
// ---------------------------------------------------------------------------

export async function handleInfo({ chatId, args }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const project = await resolveProject(chatId, args, "!info");
  if (!project) return;

  const groupCount = safeJsonArray(project.groupIds).length;
  const statusIcon = project.enabled ? "✅ Aktif" : "⏸ Nonaktif";

  const lines = [
    `📋 *${project.name}*`,
    "",
    `Status: ${statusIcon}`,
    `Jadwal: ${project.cronExpression} (${project.timezone})`,
    `Next run: ${formatJakartaDateTime(project.nextRunAt)}`,
    `Last run: ${formatJakartaDateTime(project.lastRunAt)}`,
    `Grup tujuan: ${groupCount} grup`,
    `Max retries: ${project.maxRetries}`,
    `Retry delay: ${project.retryDelayMinutes} menit`,
    `Dibuat: ${formatJakartaDateTime(project.createdAt)}`,
  ];

  await replyText(chatId, lines.join("\n"));
}

// ---------------------------------------------------------------------------
// F2-3: !history [nama]
// ---------------------------------------------------------------------------

export async function handleHistory({ chatId, args }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const project = await resolveProject(chatId, args, "!history");
  if (!project) return;

  const runs = await prisma.run.findMany({
    where: { projectId: project.id },
    orderBy: { startedAt: "desc" },
    take: 5,
  });

  if (runs.length === 0) {
    await replyText(chatId, `Belum ada riwayat run untuk project *${project.name}*.`);
    return;
  }

  const formatter = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  const lines = runs.map((run, i) => {
    const icon = run.status === "success" ? "✅" : run.status === "running" ? "🔄" : "❌";
    const time = formatter.format(run.startedAt);
    const duration =
      run.finishedAt
        ? `${Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000)} detik`
        : "sedang berjalan";
    const error = run.status === "failed" && run.errorSummary ? ` — ${run.errorSummary.slice(0, 60)}` : "";
    return `${i + 1}. ${icon} ${time} (${duration})${error}`;
  });

  await replyText(
    chatId,
    [`📊 *Riwayat: ${project.name}*`, "", ...lines].join("\n")
  );
}

// ---------------------------------------------------------------------------
// F2-4: !schedule
// ---------------------------------------------------------------------------

export async function handleSchedule({ chatId }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  // Hitung batas hari ini (WIB)
  const now = new Date();
  const todayStart = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now) + "T00:00:00+07:00"
  );
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const projects = await prisma.project.findMany({
    where: {
      enabled: true,
      nextRunAt: { gte: todayStart, lt: todayEnd },
    },
    orderBy: { nextRunAt: "asc" },
  });

  if (projects.length === 0) {
    await replyText(chatId, "Tidak ada jadwal run untuk hari ini.");
    return;
  }

  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  const lines = projects.map(
    (p) => `- ${p.nextRunAt ? formatter.format(p.nextRunAt) : "-"} — *${p.name}*`
  );

  const dateLabel = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeZone: "Asia/Jakarta",
  }).format(now);

  await replyText(chatId, [`📅 *Jadwal Hari Ini — ${dateLabel}*`, "", ...lines].join("\n"));
}

// ---------------------------------------------------------------------------
// F2-5: !edit [nama] [field] = [value]  (super admin only)
// ---------------------------------------------------------------------------

export async function handleEdit({ chatId, args }: CommandContext) {
  if (!(await ensureSuperAdmin(chatId))) return;

  const parsed = parseEditCommand(args);
  if (!parsed) {
    await replyText(
      chatId,
      [
        "Format !edit tidak valid.",
        "",
        "Gunakan: !edit [nama project] [field] = [nilai]",
        `Field tersedia: ${EDITABLE_FIELDS.join(", ")}`,
        "",
        "Contoh:",
        "!edit Laporan Harian cron = 0 9 * * *",
        "!edit Laporan Harian caption = *Laporan {projectName}* {date}",
        "!edit Laporan Harian enabled = false",
        "!edit Laporan Harian retries = 2",
      ].join("\n")
    );
    return;
  }

  const project = await resolveProject(chatId, parsed.projectName, "!edit");
  if (!project) return;

  // Validasi nilai baru
  let oldValue = "";
  let validationError = "";

  switch (parsed.field) {
    case "cron":
      oldValue = project.cronExpression;
      if (!validateCronExpression(parsed.value, project.timezone)) {
        validationError = `Cron expression "${parsed.value}" tidak valid.`;
      }
      break;
    case "caption":
      oldValue = project.caption;
      if (!parsed.value.trim()) validationError = "Caption tidak boleh kosong.";
      break;
    case "name":
      oldValue = project.name;
      if (parsed.value.trim().length < 2) validationError = "Nama project minimal 2 karakter.";
      break;
    case "enabled":
      oldValue = String(project.enabled);
      if (parsed.value !== "true" && parsed.value !== "false") {
        validationError = `Nilai enabled harus "true" atau "false".`;
      }
      break;
    case "retries": {
      oldValue = String(project.maxRetries);
      const num = Number.parseInt(parsed.value, 10);
      if (Number.isNaN(num) || num < 0 || num > 5) {
        validationError = "Nilai retries harus angka antara 0 dan 5.";
      }
      break;
    }
  }

  if (validationError) {
    await replyText(chatId, `❌ ${validationError}`);
    return;
  }

  // Simpan pending state dan kirim preview
  setPending(chatId, {
    type: "edit",
    projectId: project.id,
    projectName: project.name,
    field: parsed.field,
    oldValue,
    newValue: parsed.value,
  });

  await replyText(
    chatId,
    [
      `📝 *Preview perubahan:*`,
      "",
      `Project: ${project.name}`,
      `Field: ${FIELD_LABELS[parsed.field]}`,
      `Sebelum: ${oldValue}`,
      `Sesudah: ${parsed.value}`,
      "",
      "Ketik !confirm untuk simpan, atau abaikan untuk batal (otomatis batal dalam 60 detik).",
    ].join("\n")
  );
}

// ---------------------------------------------------------------------------
// F2-6: !retry [nama]
// ---------------------------------------------------------------------------

export async function handleRetry({ chatId, args }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const project = await resolveProject(chatId, args, "!retry");
  if (!project) return;

  const lastFailedRun = await prisma.run.findFirst({
    where: { projectId: project.id, status: "failed" },
    orderBy: { startedAt: "desc" },
  });

  if (!lastFailedRun) {
    await replyText(chatId, `Tidak ada run gagal yang ditemukan untuk project *${project.name}*.`);
    return;
  }

  const formatter = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  await replyText(
    chatId,
    [
      `🔄 Menjalankan ulang *${project.name}*...`,
      `(Run gagal terakhir: ${formatter.format(lastFailedRun.startedAt)})`,
    ].join("\n")
  );

  try {
    await runProject(project.id, "full");
    await replyText(chatId, `✅ *${project.name}* berhasil dijalankan ulang.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await replyText(chatId, `❌ Gagal menjalankan ulang *${project.name}*:\n${msg.slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// F2-7: !screenshot [nama]
// ---------------------------------------------------------------------------

export async function handleScreenshot({ chatId, args }: CommandContext) {
  if (!(await ensureOperator(chatId))) return;

  const project = await resolveProject(chatId, args, "!screenshot");
  if (!project) return;

  await replyText(chatId, `📸 Mengambil screenshot *${project.name}*...`);
  try {
    await runProject(project.id, "screenshot");
    await replyText(
      chatId,
      `✅ Screenshot *${project.name}* berhasil diambil.\nLihat hasilnya di dashboard → project → riwayat run.`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await replyText(chatId, `❌ Gagal mengambil screenshot *${project.name}*:\n${msg.slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// F2-8: !delete [nama]  (super admin only)
// ---------------------------------------------------------------------------

export async function handleDelete({ chatId, args }: CommandContext) {
  if (!(await ensureSuperAdmin(chatId))) return;

  const project = await resolveProject(chatId, args, "!delete");
  if (!project) return;

  // Simpan pending state
  setPending(chatId, {
    type: "delete",
    projectId: project.id,
    projectName: project.name,
  });

  await replyText(
    chatId,
    [
      `⚠️ *Konfirmasi Hapus Project*`,
      "",
      `Nama: ${project.name}`,
      `ID: ${project.id}`,
      "",
      "Tindakan ini *tidak dapat dibatalkan*. Semua run dan log project ini akan ikut terhapus.",
      "",
      `Ketik *!confirm delete* untuk melanjutkan, atau abaikan untuk batal (otomatis batal dalam 60 detik).`,
    ].join("\n")
  );
}

// ---------------------------------------------------------------------------
// !confirm — eksekusi pending edit atau delete
// ---------------------------------------------------------------------------

export async function handleConfirm({ chatId, args }: CommandContext) {
  if (!(await ensureSuperAdmin(chatId))) return;

  const pending = getPending(chatId);

  if (!pending) {
    await replyText(chatId, "Tidak ada operasi yang menunggu konfirmasi, atau sudah kedaluwarsa.");
    return;
  }

  // --- Konfirmasi DELETE ---
  if (pending.type === "delete") {
    // User harus ketik "!confirm delete"
    if (args.trim().toLowerCase() !== "delete") {
      await replyText(
        chatId,
        `Untuk konfirmasi hapus, ketik: !confirm delete`
      );
      return;
    }

    clearPending(chatId);

    try {
      // Cek project masih ada
      const project = await prisma.project.findUnique({ where: { id: pending.projectId } });
      if (!project) {
        await replyText(chatId, "Project sudah tidak ditemukan (mungkin sudah dihapus).");
        return;
      }

      await prisma.project.delete({ where: { id: pending.projectId } });
      await reloadScheduler();
      await replyText(chatId, `🗑️ Project *${pending.projectName}* berhasil dihapus.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await replyText(chatId, `❌ Gagal menghapus project:\n${msg.slice(0, 300)}`);
    }
    return;
  }

  // --- Konfirmasi EDIT ---
  if (pending.type === "edit") {
    clearPending(chatId);

    try {
      const project = await prisma.project.findUnique({ where: { id: pending.projectId } });
      if (!project) {
        await replyText(chatId, "Project sudah tidak ditemukan.");
        return;
      }

      // Terapkan perubahan
      const updateData: Record<string, unknown> = {};
      switch (pending.field) {
        case "cron":
          updateData.cronExpression = pending.newValue;
          updateData.nextRunAt = project.enabled
            ? getNextRunAt(pending.newValue, project.timezone)
            : null;
          break;
        case "caption":
          updateData.caption = pending.newValue;
          break;
        case "name":
          updateData.name = pending.newValue;
          break;
        case "enabled": {
          const isEnabled = pending.newValue === "true";
          updateData.enabled = isEnabled;
          updateData.nextRunAt = isEnabled
            ? getNextRunAt(project.cronExpression, project.timezone)
            : null;
          break;
        }
        case "retries":
          updateData.maxRetries = Number.parseInt(pending.newValue, 10);
          break;
      }

      await prisma.project.update({ where: { id: pending.projectId }, data: updateData });
      await reloadScheduler();

      await replyText(
        chatId,
        [
          `✅ Project *${pending.projectName}* berhasil diperbarui.`,
          "",
          `Field: ${FIELD_LABELS[pending.field]}`,
          `Nilai baru: ${pending.newValue}`,
        ].join("\n")
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await replyText(chatId, `❌ Gagal memperbarui project:\n${msg.slice(0, 300)}`);
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Re-export untuk webhook handler
// ---------------------------------------------------------------------------

export { isProjectCommandText };
