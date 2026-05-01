import { runProject } from "@/lib/bot";
import { formatProjectCommandExample, isAdminChat, parseProjectCommandFields } from "@/lib/bot-command-parser";
import { getWahaConfig } from "@/lib/config";
import { listCachedGroups } from "@/lib/group-cache";
import { prisma } from "@/lib/prisma";
import { projectData } from "@/lib/project-service";
import { projectSchema, validateCronExpression } from "@/lib/project-validation";
import { reloadScheduler } from "@/lib/scheduler";
import { parseGroupIds } from "@/lib/utils";

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
  }
}

type CommandContext = { chatId: string; args: string };

async function ensureAdmin(chatId: string): Promise<boolean> {
  if (isAdminChat(chatId, process.env.ADMIN_GROUP_ID)) return true;
  await replyText(chatId, "Akses ditolak. Command bot hanya dapat digunakan dari ADMIN_GROUP_ID.");
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

export async function handleHelp({ chatId }: CommandContext) {
  if (!(await ensureAdmin(chatId))) return;

  await replyText(
    chatId,
    [
      "*SBT Connect Commands*",
      "",
      "!help - tampilkan bantuan command",
      "!group - tampilkan daftar cached group",
      "!status - daftar project aktif dan jadwal berikutnya",
      "!run [nama project] - jalankan project berdasarkan nama",
      "!laporan - jalankan project aktif dengan jadwal terdekat",
      "!project - buat project baru dari format multiline",
      "",
      "*Format !project:*",
      formatProjectCommandExample(),
    ].join("\n")
  );
}

export async function handleGroup({ chatId }: CommandContext) {
  if (!(await ensureAdmin(chatId))) return;

  const groups = await listCachedGroups();
  if (groups.length === 0) {
    await replyText(chatId, "Belum ada cached group. Refresh daftar group dari dashboard terlebih dahulu.");
    return;
  }

  const limit = 50;
  const lines = groups.slice(0, limit).map((group, index) => `${index + 1}. ${group.name}\n   ID: ${group.remote}`);
  const suffix = groups.length > limit ? `\n\nDitampilkan ${limit} dari ${groups.length} group.` : `\n\nTotal: ${groups.length} group.`;

  await replyText(chatId, `*Cached WhatsApp Groups*\n\n${lines.join("\n\n")}${suffix}`);
}

export async function handleCreateProject({ chatId, args }: CommandContext) {
  if (!(await ensureAdmin(chatId))) return;

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
  if (!(await ensureAdmin(chatId))) return;

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

  const lines = projects.map((project) => {
    const next = project.nextRunAt ? formatter.format(project.nextRunAt) : "-";
    return `- *${project.name}*\n  Next: ${next}`;
  });

  await replyText(chatId, `*Status SBT Connect*\n\n${lines.join("\n\n")}`);
}

export async function handleRun({ chatId, args }: CommandContext) {
  if (!(await ensureAdmin(chatId))) return;

  const name = args.trim();
  if (!name) {
    await replyText(chatId, "Sertakan nama project. Contoh: `!run Reporting Harian`");
    return;
  }

  const project = await prisma.project.findFirst({
    where: { name: { contains: name } },
  });

  if (!project) {
    await replyText(chatId, `Project dengan nama "${name}" tidak ditemukan.`);
    return;
  }

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
  if (!(await ensureAdmin(chatId))) return;

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
