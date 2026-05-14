import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { reloadScheduler } from "@/lib/scheduler";
import {
  deletePythonJobFiles,
  pythonJobData,
  pythonJobToDto,
  savePythonScript,
} from "@/lib/python-job-service";
import { pythonJobSchema, validatePythonCronExpression, validatePythonFilename } from "@/lib/python-job-validation";

type Context = { params: Promise<{ id: string }> };

function parseId(id: string) {
  const numericId = Number(id);
  return Number.isInteger(numericId) ? numericId : null;
}

function parseEnabled(value: FormDataEntryValue | null) {
  return value === null ? true : value === "true";
}

function getUploadedFile(formData: FormData) {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

async function parseFormData(request: Request, existingFilename: string) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return { error: "Payload upload tidak valid." };

  const file = getUploadedFile(formData);
  if (file && !validatePythonFilename(file.name)) {
    return { error: "File harus berekstensi .py." };
  }

  const parsed = pythonJobSchema.safeParse({
    name: formData.get("name"),
    originalFilename: file?.name || existingFilename,
    cronExpression: formData.get("cronExpression"),
    timezone: formData.get("timezone") || "Asia/Jakarta",
    enabled: parseEnabled(formData.get("enabled")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Input tidak valid." };
  }
  if (!validatePythonCronExpression(parsed.data.cronExpression, parsed.data.timezone)) {
    return { error: "Cron expression tidak valid." };
  }

  return { data: parsed.data, file };
}

export async function GET(_request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const jobId = parseId(id);
  if (!jobId) return Response.json({ error: "ID job tidak valid." }, { status: 400 });

  const job = await prisma.pythonJob.findUnique({ where: { id: jobId } });
  if (!job) return Response.json({ error: "Python job tidak ditemukan." }, { status: 404 });

  const runs = await prisma.pythonRun.findMany({
    where: { pythonJobId: jobId },
    orderBy: { startedAt: "desc" },
    take: 10,
  });
  const logs = await prisma.pythonJobLog.findMany({
    where: { pythonJobId: jobId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Response.json({ job: pythonJobToDto(job), runs, logs });
}

export async function PUT(request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const jobId = parseId(id);
  if (!jobId) return Response.json({ error: "ID job tidak valid." }, { status: 400 });

  const existing = await prisma.pythonJob.findUnique({ where: { id: jobId } });
  if (!existing) return Response.json({ error: "Python job tidak ditemukan." }, { status: 404 });

  const parsed = await parseFormData(request, existing.originalFilename);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  let storedPath = existing.storedPath;
  if (parsed.file) {
    storedPath = await savePythonScript(jobId, parsed.file);
  }

  const job = await prisma.pythonJob.update({
    where: { id: jobId },
    data: {
      ...pythonJobData(parsed.data),
      storedPath,
    },
  });
  await reloadScheduler();
  return Response.json({ job: pythonJobToDto(job) });
}

export async function DELETE(_request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const jobId = parseId(id);
  if (!jobId) return Response.json({ error: "ID job tidak valid." }, { status: 400 });

  await prisma.pythonJob.delete({ where: { id: jobId } });
  await deletePythonJobFiles(jobId);
  await reloadScheduler();
  return Response.json({ ok: true });
}
