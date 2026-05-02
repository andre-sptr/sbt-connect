import { spawn } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { writePythonJobLog } from "@/lib/python-job-service";
import { getPythonExecutable, getPythonProcessEnv } from "@/lib/python-venv";

export type PythonRunSource = "manual" | "scheduled";

function cleanOutput(value: string) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trimEnd();
}

async function writeOutput(input: {
  pythonJobId: number;
  pythonRunId: number;
  stream: "stdout" | "stderr";
  chunk: Buffer;
}) {
  const message = cleanOutput(input.chunk.toString("utf8"));
  if (!message.trim()) return;
  await writePythonJobLog({
    pythonJobId: input.pythonJobId,
    pythonRunId: input.pythonRunId,
    stream: input.stream,
    level: input.stream === "stderr" ? "warning" : "info",
    message,
  });
}

export async function runPythonJob(jobId: number, source: PythonRunSource = "manual") {
  const job = await prisma.pythonJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Python job tidak ditemukan.");

  const run = await prisma.pythonRun.create({
    data: {
      pythonJobId: jobId,
      source,
      status: "running",
    },
  });

  await writePythonJobLog({
    pythonJobId: jobId,
    pythonRunId: run.id,
    message: `Run ${source} dimulai.`,
  });

  let timedOut = false;
  let exitCode: number | null = null;
  const cwd = path.dirname(job.storedPath);
  const outputWrites: Array<Promise<void>> = [];
  const pythonExecutable = await getPythonExecutable();
  const pythonEnv = await getPythonProcessEnv();

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(pythonExecutable, [job.storedPath], {
        cwd,
        env: pythonEnv,
        shell: false,
        windowsHide: true,
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, job.timeoutSeconds * 1000);

      child.stdout.on("data", (chunk: Buffer) => {
        outputWrites.push(writeOutput({ pythonJobId: jobId, pythonRunId: run.id, stream: "stdout", chunk }));
      });

      child.stderr.on("data", (chunk: Buffer) => {
        outputWrites.push(writeOutput({ pythonJobId: jobId, pythonRunId: run.id, stream: "stderr", chunk }));
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        exitCode = code;
        if (timedOut) {
          reject(new Error(`Run melewati timeout ${job.timeoutSeconds} detik.`));
          return;
        }
        if (code !== 0) {
          reject(new Error(`Python selesai dengan exit code ${code ?? "unknown"}.`));
          return;
        }
        resolve();
      });
    });
    await Promise.allSettled(outputWrites);

    await prisma.pythonRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        exitCode,
        timedOut,
      },
    });
    await prisma.pythonJob.update({ where: { id: jobId }, data: { lastRunAt: new Date() } });
    await writePythonJobLog({
      pythonJobId: jobId,
      pythonRunId: run.id,
      level: "success",
      message: `Run selesai dengan ${pythonExecutable}.`,
    });
  } catch (error) {
    await Promise.allSettled(outputWrites);
    const message = error instanceof Error ? error.message : "Run gagal.";
    await prisma.pythonRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        exitCode,
        timedOut,
        errorSummary: message,
      },
    });
    await prisma.pythonJob.update({ where: { id: jobId }, data: { lastRunAt: new Date() } });
    await writePythonJobLog({
      pythonJobId: jobId,
      pythonRunId: run.id,
      level: "error",
      message,
    });
    throw error;
  }

  return prisma.pythonRun.findUnique({ where: { id: run.id } });
}
