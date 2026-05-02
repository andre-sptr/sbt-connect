import fs from "node:fs/promises";
import path from "node:path";
import type { PythonJob, PythonRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPythonJobNextRunAt, PYTHON_JOB_TIMEOUT_SECONDS, type PythonJobInput } from "@/lib/python-job-validation";

const pythonJobsRoot = path.join(process.cwd(), "storage", "python-jobs");

export function pythonJobToDto(job: PythonJob) {
  return {
    ...job,
    storedPath: undefined,
  };
}

export function pythonRunToDto(run: PythonRun) {
  return run;
}

export function pythonJobData(input: PythonJobInput) {
  return {
    name: input.name,
    originalFilename: input.originalFilename,
    cronExpression: input.cronExpression,
    timezone: input.timezone,
    enabled: input.enabled,
    timeoutSeconds: PYTHON_JOB_TIMEOUT_SECONDS,
    nextRunAt: input.enabled ? getPythonJobNextRunAt(input.cronExpression, input.timezone) : null,
  };
}

export function getPythonJobDir(jobId: number) {
  return path.join(pythonJobsRoot, String(jobId));
}

export function getPythonJobScriptPath(jobId: number) {
  return path.join(getPythonJobDir(jobId), "script.py");
}

export async function savePythonScript(jobId: number, file: File) {
  const jobDir = getPythonJobDir(jobId);
  const scriptPath = getPythonJobScriptPath(jobId);
  await fs.mkdir(jobDir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(scriptPath, bytes, { mode: 0o600 });
  return scriptPath;
}

export async function deletePythonJobFiles(jobId: number) {
  await fs.rm(getPythonJobDir(jobId), { recursive: true, force: true });
}

export async function writePythonJobLog(input: {
  pythonJobId: number;
  pythonRunId?: number;
  level?: "info" | "success" | "warning" | "error";
  stream?: "status" | "stdout" | "stderr";
  message: string;
}) {
  await prisma.pythonJobLog.create({
    data: {
      pythonJobId: input.pythonJobId,
      pythonRunId: input.pythonRunId,
      level: input.level || "info",
      stream: input.stream || "status",
      message: input.message.slice(0, 10_000),
    },
  });
}
