import { prisma } from "@/lib/prisma";
import { getWahaConfig } from "@/lib/config";
import { runProject } from "@/lib/bot";

/**
 * Kirim pesan teks balas ke chat tertentu via WAHA.
 */
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
    // best-effort
  }
}

type CommandContext = { chatId: string; args: string };

/**
 * !status — daftar project aktif & jadwal berikutnya
 */
export async function handleStatus({ chatId }: CommandContext) {
  const projects = await prisma.project.findMany({
    where: { enabled: true },
    orderBy: { nextRunAt: "asc" },
  });

  if (projects.length === 0) {
    await replyText(chatId, "ℹ️ Tidak ada project aktif saat ini.");
    return;
  }

  const now = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  const lines = projects.map((p) => {
    const next = p.nextRunAt ? now.format(p.nextRunAt) : "—";
    return `• *${p.name}*\n  Next: ${next}`;
  });

  await replyText(chatId, `📊 *Status SBT Connect*\n\n${lines.join("\n\n")}`);
}

/**
 * !run [nama-project] — jalankan project berdasarkan nama (exact/partial match)
 */
export async function handleRun({ chatId, args }: CommandContext) {
  const name = args.trim();
  if (!name) {
    await replyText(chatId, "❌ Sertakan nama project. Contoh: `!run Reporting Harian`");
    return;
  }

  const project = await prisma.project.findFirst({
    where: { name: { contains: name } },
  });

  if (!project) {
    await replyText(chatId, `❌ Project dengan nama "${name}" tidak ditemukan.`);
    return;
  }

  await replyText(chatId, `▶️ Menjalankan project *${project.name}*...`);
  try {
    await runProject(project.id, "full");
    await replyText(chatId, `✅ *${project.name}* berhasil dijalankan.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await replyText(chatId, `❌ Gagal menjalankan *${project.name}*:\n${msg.slice(0, 300)}`);
  }
}

/**
 * !laporan — jalankan project yang jadwalnya paling dekat berikutnya
 */
export async function handleLaporan({ chatId }: CommandContext) {
  const project = await prisma.project.findFirst({
    where: { enabled: true },
    orderBy: { nextRunAt: "asc" },
  });

  if (!project) {
    await replyText(chatId, "❌ Tidak ada project aktif untuk dijalankan.");
    return;
  }

  await replyText(chatId, `▶️ Menjalankan laporan *${project.name}*...`);
  try {
    await runProject(project.id, "full");
    await replyText(chatId, `✅ Laporan *${project.name}* berhasil dikirim.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await replyText(chatId, `❌ Gagal:\n${msg.slice(0, 300)}`);
  }
}
