import cron, { ScheduledTask } from "node-cron";
import { prisma } from "@/lib/prisma";
import { getNextRunAt, validateCronExpression } from "@/lib/project-validation";
import { runProject } from "@/lib/bot";
import { writeLog } from "@/lib/logging";
import { getPythonJobNextRunAt, validatePythonCronExpression } from "@/lib/python-job-validation";
import { runPythonJob } from "@/lib/python-runner";
import { writePythonJobLog } from "@/lib/python-job-service";

const globalForScheduler = globalThis as unknown as {
  scheduler?: {
    initialized: boolean;
    projectTasks: Map<number, ScheduledTask>;
    pythonJobTasks: Map<number, ScheduledTask>;
  };
};

function getState() {
  if (!globalForScheduler.scheduler) {
    globalForScheduler.scheduler = { initialized: false, projectTasks: new Map(), pythonJobTasks: new Map() };
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
  for (const task of state.projectTasks.values()) task.stop();
  for (const task of state.pythonJobTasks.values()) task.stop();
  state.projectTasks.clear();
  state.pythonJobTasks.clear();

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

    state.projectTasks.set(project.id, task);
    await prisma.project.update({
      where: { id: project.id },
      data: { nextRunAt: getNextRunAt(project.cronExpression, project.timezone) },
    });
  }

  const pythonJobs = await prisma.pythonJob.findMany({ where: { enabled: true } });
  for (const job of pythonJobs) {
    if (!validatePythonCronExpression(job.cronExpression, job.timezone)) {
      await writePythonJobLog({
        pythonJobId: job.id,
        level: "warning",
        message: "Cron expression tidak valid, scheduler dilewati.",
      });
      continue;
    }

    const task = cron.schedule(
      job.cronExpression,
      async () => {
        try {
          await writePythonJobLog({ pythonJobId: job.id, message: "Scheduler menjalankan Python job." });
          await runPythonJob(job.id, "scheduled");
        } catch (error) {
          await writePythonJobLog({
            pythonJobId: job.id,
            level: "error",
            message: `Scheduler Python job gagal: ${error instanceof Error ? error.message : "unknown error"}`,
          });
        } finally {
          await prisma.pythonJob.update({
            where: { id: job.id },
            data: { nextRunAt: getPythonJobNextRunAt(job.cronExpression, job.timezone) },
          });
        }
      },
      { timezone: job.timezone }
    );

    state.pythonJobTasks.set(job.id, task);
    await prisma.pythonJob.update({
      where: { id: job.id },
      data: { nextRunAt: getPythonJobNextRunAt(job.cronExpression, job.timezone) },
    });
  }

  state.initialized = true;
}

export async function ensureScheduler() {
  const state = getState();
  if (!state.initialized) await reloadScheduler();
}
