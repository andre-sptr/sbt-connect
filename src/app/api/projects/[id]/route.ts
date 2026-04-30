import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { projectSchema, validateCronExpression } from "@/lib/project-validation";
import { projectData, projectToDto } from "@/lib/project-service";
import { reloadScheduler } from "@/lib/scheduler";

type Context = { params: Promise<{ id: string }> };

function parseId(id: string) {
  const numericId = Number(id);
  return Number.isInteger(numericId) ? numericId : null;
}

export async function GET(_request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const projectId = parseId(id);
  if (!projectId) return Response.json({ error: "ID project tidak valid." }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: "Project tidak ditemukan." }, { status: 404 });
  return Response.json({ project: projectToDto(project) });
}

export async function PUT(request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const projectId = parseId(id);
  if (!projectId) return Response.json({ error: "ID project tidak valid." }, { status: 400 });

  const json = await request.json().catch(() => null);
  const parsed = projectSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Input tidak valid." }, { status: 400 });
  }
  if (!validateCronExpression(parsed.data.cronExpression, parsed.data.timezone)) {
    return Response.json({ error: "Cron expression tidak valid." }, { status: 400 });
  }

  const project = await prisma.project.update({ where: { id: projectId }, data: projectData(parsed.data) });
  await reloadScheduler();
  return Response.json({ project: projectToDto(project) });
}

export async function DELETE(_request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const projectId = parseId(id);
  if (!projectId) return Response.json({ error: "ID project tidak valid." }, { status: 400 });

  await prisma.project.delete({ where: { id: projectId } });
  await reloadScheduler();
  return Response.json({ ok: true });
}
