import cron, { ScheduledTask } from "node-cron";
import { prisma } from "@/lib/prisma";
import { getNextRunAt, validateCronExpression } from "@/lib/project-validation";
import { runProject } from "@/lib/bot";
import { writeLog } from "@/lib/logging";

const globalForScheduler = globalThis as unknown as {
  scheduler?: {
    initialized: boolean;
    tasks: Map<number, ScheduledTask>;
  };
};

function getState() {
  if (!globalForScheduler.scheduler) {
    globalForScheduler.scheduler = { initialized: false, tasks: new Map() };
  }
  return globalForScheduler.scheduler;
}

async function runWithRetry(projectId: number, maxRetries: number, retryDelayMinutes: number) {
  let attempt = 0;

  const tryRun = async (): Promise<void> => {
    try {
      if (attempt > 0) {
        await writeLog({
          projectId,
          level: "info",
          message: `Mencoba ulang run (${attempt}/${maxRetries}) setelah gagal sebelumnya.`,
        });
      } else {
        await writeLog({ projectId, message: "Scheduler menjalankan projek." });
      }
      await runProject(projectId, "full");
    } catch (error) {
      await writeLog({
        projectId,
        level: "error",
        message: `Scheduler gagal: ${error instanceof Error ? error.message : "unknown error"}`,
      });

      if (attempt < maxRetries) {
        attempt++;
        const delayMs = retryDelayMinutes * 60 * 1000;
        await writeLog({
          projectId,
          level: "info",
          message: `Retry ${attempt}/${maxRetries} dijadwalkan dalam ${retryDelayMinutes} menit.`,
        });
        setTimeout(tryRun, delayMs);
      }
    }
  };

  await tryRun();
}

export async function reloadScheduler() {
  const state = getState();
  for (const task of state.tasks.values()) task.stop();
  state.tasks.clear();

  const projects = await prisma.project.findMany({ where: { enabled: true } });
  for (const project of projects) {
    if (!validateCronExpression(project.cronExpression, project.timezone)) {
      await writeLog({ projectId: project.id, level: "warning", message: "Cron expression tidak valid, scheduler dilewati." });
      continue;
    }

    const task = cron.schedule(
      project.cronExpression,
      async () => {
        try {
          await runWithRetry(project.id, project.maxRetries, project.retryDelayMinutes);
        } finally {
          await prisma.project.update({
            where: { id: project.id },
            data: { nextRunAt: getNextRunAt(project.cronExpression, project.timezone) },
          });
        }
      },
      { timezone: project.timezone }
    );

    state.tasks.set(project.id, task);
    await prisma.project.update({
      where: { id: project.id },
      data: { nextRunAt: getNextRunAt(project.cronExpression, project.timezone) },
    });
  }

  state.initialized = true;
}

export async function ensureScheduler() {
  const state = getState();
  if (!state.initialized) await reloadScheduler();
}
