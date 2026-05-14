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

async function resolveProject(projectId: number, userId: number, isAdmin: boolean) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project tidak ditemukan.", status: 404 as const };
  if (!isAdmin && project.createdByUserId !== userId) {
    return { error: "Project tidak ditemukan.", status: 404 as const }; // hide existence
  }
  return { project };
}

export async function GET(_request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const projectId = parseId(id);
  if (!projectId) return Response.json({ error: "ID project tidak valid." }, { status: 400 });

  const result = await resolveProject(projectId, session.userId, session.role === "admin");
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });

  return Response.json({ project: projectToDto(result.project) });
}

export async function PUT(request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const projectId = parseId(id);
  if (!projectId) return Response.json({ error: "ID project tidak valid." }, { status: 400 });

  const result = await resolveProject(projectId, session.userId, session.role === "admin");
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });

  const json = await request.json().catch(() => null);
  const parsed = projectSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Input tidak valid." }, { status: 400 });
  }
  if (!validateCronExpression(parsed.data.cronExpression, parsed.data.timezone)) {
    return Response.json({ error: "Cron expression tidak valid." }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: projectData(parsed.data),
  });
  await reloadScheduler();
  return Response.json({ project: projectToDto(project) });
}

export async function DELETE(_request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const projectId = parseId(id);
  if (!projectId) return Response.json({ error: "ID project tidak valid." }, { status: 400 });

  const result = await resolveProject(projectId, session.userId, session.role === "admin");
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });

  await prisma.project.delete({ where: { id: projectId } });
  await reloadScheduler();
  return Response.json({ ok: true });
}
