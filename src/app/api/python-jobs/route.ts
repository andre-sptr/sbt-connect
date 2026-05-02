import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { reloadScheduler } from "@/lib/scheduler";
import { pythonJobData, pythonJobToDto, savePythonScript } from "@/lib/python-job-service";
import { pythonJobSchema, validatePythonCronExpression, validatePythonFilename } from "@/lib/python-job-validation";

const PAGE_SIZE = 10;

function parseEnabled(value: FormDataEntryValue | null) {
  return value === null ? true : value === "true";
}

function getUploadedFile(formData: FormData) {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const requestedPage = searchParams.get("page");
  const page = Math.max(1, parseInt(requestedPage || "1", 10) || 1);
  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { originalFilename: { contains: search } },
          { cronExpression: { contains: search } },
        ],
      }
    : undefined;

  if (!requestedPage) {
    const jobs = await prisma.pythonJob.findMany({ where, orderBy: { updatedAt: "desc" } });
    return Response.json({ jobs: jobs.map(pythonJobToDto) });
  }

  const [total, activeTotal, jobs] = await prisma.$transaction([
    prisma.pythonJob.count({ where }),
    prisma.pythonJob.count({ where: { ...where, enabled: true } }),
    prisma.pythonJob.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return Response.json({
    jobs: jobs.map(pythonJobToDto),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      activeTotal,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      hasPreviousPage: page > 1,
      hasNextPage: page < Math.ceil(total / PAGE_SIZE),
    },
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const formData = await request.formData().catch(() => null);
  if (!formData) return Response.json({ error: "Payload upload tidak valid." }, { status: 400 });

  const file = getUploadedFile(formData);
  if (!file) return Response.json({ error: "File Python wajib diupload." }, { status: 400 });
  if (!validatePythonFilename(file.name)) {
    return Response.json({ error: "File harus berekstensi .py." }, { status: 400 });
  }

  const parsed = pythonJobSchema.safeParse({
    name: formData.get("name"),
    originalFilename: file.name,
    cronExpression: formData.get("cronExpression"),
    timezone: formData.get("timezone") || "Asia/Jakarta",
    enabled: parseEnabled(formData.get("enabled")),
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Input tidak valid." }, { status: 400 });
  }
  if (!validatePythonCronExpression(parsed.data.cronExpression, parsed.data.timezone)) {
    return Response.json({ error: "Cron expression tidak valid." }, { status: 400 });
  }

  const job = await prisma.pythonJob.create({
    data: {
      ...pythonJobData(parsed.data),
      storedPath: "",
    },
  });

  try {
    const storedPath = await savePythonScript(job.id, file);
    const updated = await prisma.pythonJob.update({
      where: { id: job.id },
      data: { storedPath },
    });
    await reloadScheduler();
    return Response.json({ job: pythonJobToDto(updated) }, { status: 201 });
  } catch (error) {
    await prisma.pythonJob.delete({ where: { id: job.id } }).catch(() => {});
    return Response.json(
      { error: error instanceof Error ? error.message : "Gagal menyimpan file Python." },
      { status: 500 }
    );
  }
}
