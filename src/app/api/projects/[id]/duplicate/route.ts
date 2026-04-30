import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { projectToDto } from "@/lib/project-service";
import { getNextRunAt } from "@/lib/project-validation";
import { reloadScheduler } from "@/lib/scheduler";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const projectId = Number(id);
  const source = await prisma.project.findUnique({ where: { id: projectId } });
  if (!source) return Response.json({ error: "Project tidak ditemukan." }, { status: 404 });

  const project = await prisma.project.create({
    data: {
      name: `${source.name} Copy`,
      groupIds: source.groupIds,
      spreadsheetUrl: source.spreadsheetUrl,
      gid: source.gid,
      cellRange: source.cellRange,
      caption: source.caption,
      cronExpression: source.cronExpression,
      timezone: source.timezone,
      enabled: false,
      nextRunAt: getNextRunAt(source.cronExpression, source.timezone),
    },
  });
  await reloadScheduler();
  return Response.json({ project: projectToDto(project) }, { status: 201 });
}
