import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { getWahaConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { buildPublishedSheetUrl } from "@/lib/project-validation";
import { safeJsonArray } from "@/lib/utils";
import { writeLog } from "@/lib/logging";
import { notifyAdmin } from "@/lib/notify-admin";

const storageDir = path.join(process.cwd(), "storage", "screenshots");
const thumbnailDir = path.join(process.cwd(), "storage", "thumbnails");

type BotAction = "full" | "screenshot" | "send" | "dry-run";

function todayId() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatCaption(template: string, projectName: string, runCount?: number) {
  const now = new Date();

  const tz = "Asia/Jakarta";

  const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: tz }).format(now);
  const datetime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(now);
  const time = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: tz }).format(now);

  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: tz }).format(now);
  const month = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: tz }).format(now);

  // Nomor minggu dalam bulan (1-based)
  const jakartaDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const dayOfMonth = jakartaDate.getDate();
  const weekOfMonth = Math.ceil(dayOfMonth / 7);

  // Quarter (Q1–Q4)
  const monthIndex = jakartaDate.getMonth(); // 0-based
  const quarter = `Q${Math.floor(monthIndex / 3) + 1}`;

  return template
    .replaceAll("{date}", date)
    .replaceAll("{datetime}", datetime)
    .replaceAll("{time}", time)
    .replaceAll("{projectName}", projectName)
    .replaceAll("{weekday}", weekday)
    .replaceAll("{week}", `Minggu ke-${weekOfMonth}`)
    .replaceAll("{month}", month)
    .replaceAll("{quarter}", quarter)
    .replaceAll("{runCount}", runCount != null ? String(runCount) : "");
}

async function optimizeImage(filePath: string, runId: number, projectId: number) {
  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(filePath);
    const metadata = await image.metadata();
    const maxSize = 2500;
    if ((metadata.width || 0) > maxSize || (metadata.height || 0) > maxSize) {
      await image.resize({ width: maxSize, height: maxSize, fit: "inside" }).png().toFile(`${filePath}.tmp`);
      await fs.rename(`${filePath}.tmp`, filePath);
      await writeLog({ projectId, runId, level: "info", message: "Resolusi screenshot dioptimalkan." });
    }
  } catch (error) {
    await writeLog({
      projectId,
      runId,
      level: "warning",
      message: `Optimasi gambar dilewati: ${error instanceof Error ? error.message : "unknown error"}`,
    });
  }
}

async function createThumbnail(filePath: string, runId: number, projectId: number): Promise<string | undefined> {
  try {
    await fs.mkdir(thumbnailDir, { recursive: true });
    const thumbPath = path.join(thumbnailDir, `thumb-run-${runId}.png`);
    const sharp = (await import("sharp")).default;
    await sharp(filePath).resize({ width: 400 }).png({ quality: 70 }).toFile(thumbPath);
    await writeLog({ projectId, runId, level: "info", message: "Thumbnail berhasil dibuat." });
    return thumbPath;
  } catch (error) {
    await writeLog({
      projectId,
      runId,
      level: "warning",
      message: `Pembuatan thumbnail dilewati: ${error instanceof Error ? error.message : "unknown error"}`,
    });
    return undefined;
  }
}

async function captureSheetScreenshot(input: {
  projectId: number;
  runId: number;
  spreadsheetUrl: string;
  gid: string;
  cellRange: string;
}) {
  await fs.mkdir(storageDir, { recursive: true });
  const filePath = path.join(storageDir, `project-${input.projectId}-run-${input.runId}-${Date.now()}.png`);
  const targetUrl = buildPublishedSheetUrl(input.spreadsheetUrl, input.gid, input.cellRange);

  await writeLog({
    projectId: input.projectId,
    runId: input.runId,
    message: `Mengambil screenshot range ${input.cellRange}.`,
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 3000, height: 1500 } });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("table.waffle:visible", { timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      document.querySelectorAll("img").forEach((img) => {
        img.style.border = "none";
        img.style.outline = "none";
        let parent = img.parentElement;
        while (parent && parent.tagName !== "TABLE") {
          parent.style.border = "none";
          if (parent.tagName === "TD" || parent.tagName === "TH") {
            parent.style.borderTop = "none";
            parent.style.borderRight = "none";
            parent.style.borderBottom = "none";
            parent.style.borderLeft = "none";
            break;
          }
          parent = parent.parentElement;
        }
      });
    });
    await page.locator("table.waffle:visible").first().screenshot({ path: filePath });
    await optimizeImage(filePath, input.runId, input.projectId);
    await writeLog({ projectId: input.projectId, runId: input.runId, level: "success", message: "Screenshot berhasil dibuat." });
    return filePath;
  } finally {
    await browser.close();
  }
}

async function sendImageToWhatsapp(input: {
  projectId: number;
  runId: number;
  projectName: string;
  groupIds: string[];
  caption: string;
  filePath: string;
  runCount?: number;
}) {
  const config = getWahaConfig();
  const image = await fs.readFile(input.filePath);
  const data = image.toString("base64");
  const caption = formatCaption(input.caption, input.projectName, input.runCount);
  let allSuccess = true;

  for (const groupId of input.groupIds) {
    await writeLog({ projectId: input.projectId, runId: input.runId, message: `Mengirim gambar ke ${groupId}.` });
    const response = await fetch(`${config.url.replace(/\/$/, "")}/api/sendImage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify({
        session: config.session,
        chatId: groupId,
        file: {
          mimetype: "image/png",
          filename: `Reporting_${todayId()}.png`,
          data,
        },
        caption,
      }),
    });

    if (response.ok) {
      await writeLog({ projectId: input.projectId, runId: input.runId, level: "success", message: `Berhasil dikirim ke ${groupId}.` });
    } else {
      allSuccess = false;
      const responseText = await response.text();
      await writeLog({
        projectId: input.projectId,
        runId: input.runId,
        level: "error",
        message: `Gagal mengirim ke ${groupId}. Status ${response.status}: ${responseText.slice(0, 500)}`,
      });
    }
  }

  return allSuccess;
}

export async function runProject(projectId: number, action: BotAction = "full") {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project tidak ditemukan.");

  const run = await prisma.run.create({
    data: {
      projectId,
      action,
      status: "running",
    },
  });

  let screenshotPath: string | undefined;
  let thumbnailPath: string | undefined;

  try {
    await writeLog({ projectId, runId: run.id, message: `Run ${action} dimulai.` });
    screenshotPath = await captureSheetScreenshot({
      projectId,
      runId: run.id,
      spreadsheetUrl: project.spreadsheetUrl,
      gid: project.gid,
      cellRange: project.cellRange,
    });

    const groupIds = safeJsonArray(project.groupIds);

    if (action === "dry-run") {
      await writeLog({
        projectId,
        runId: run.id,
        level: "info",
        message: `[DRY RUN] Simulasi pengiriman ke ${groupIds.length} grup. Tidak ada pesan WA dikirim.`,
      });
      thumbnailPath = await createThumbnail(screenshotPath, run.id, projectId);
    } else if (action !== "screenshot") {
      // Hitung berapa kali project sudah berhasil dijalankan hari ini (untuk {runCount})
      const todayStart = new Date(
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()) + "T00:00:00+07:00"
      );
      const runCountToday = await prisma.run.count({
        where: { projectId, status: "success", startedAt: { gte: todayStart } },
      });

      const sent = await sendImageToWhatsapp({
        projectId,
        runId: run.id,
        projectName: project.name,
        groupIds,
        caption: project.caption,
        filePath: screenshotPath,
        runCount: runCountToday + 1, // run ini akan jadi run ke-(n+1) hari ini
      });
      if (!sent) {
        throw new Error("Sebagian pengiriman WhatsApp gagal. Lihat log untuk detail.");
      }
      thumbnailPath = await createThumbnail(screenshotPath, run.id, projectId);
    }

    if (action === "full" || action === "dry-run") {
      await fs.rm(screenshotPath, { force: true });
      screenshotPath = undefined;
      await writeLog({ projectId, runId: run.id, message: "Screenshot sementara dihapus." });
    }

    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        screenshotPath,
        thumbnailPath,
      },
    });
    await prisma.project.update({ where: { id: projectId }, data: { lastRunAt: new Date() } });
    await writeLog({ projectId, runId: run.id, level: "success", message: `Run ${action} selesai.` });
    return prisma.run.findUnique({ where: { id: run.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorSummary: message,
        screenshotPath,
        thumbnailPath,
      },
    });
    await prisma.project.update({ where: { id: projectId }, data: { lastRunAt: new Date() } });
    await writeLog({ projectId, runId: run.id, level: "error", message });

    const now = new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date());
    await notifyAdmin(
      `⚠️ *[SBT Connect] Run Gagal*\n\nProject: ${project.name}\nAksi: ${action}\nError: ${message.slice(0, 300)}\nWaktu: ${now}`
    );

    throw error;
  }
}
