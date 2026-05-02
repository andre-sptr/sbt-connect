import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runPythonJob } from "@/lib/python-runner";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return Response.json({ error: "ID job tidak valid." }, { status: 400 });
  }

  const job = await prisma.pythonJob.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return Response.json({ error: "Python job tidak ditemukan." }, { status: 404 });

  void runPythonJob(jobId, "manual").catch(() => {});
  return Response.json({ ok: true }, { status: 202 });
}
