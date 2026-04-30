import { prisma } from "@/lib/prisma";
import { projectSchema, validateCronExpression } from "@/lib/project-validation";
import { projectData, projectToDto } from "@/lib/project-service";
import { requireApiSession } from "@/lib/auth";
import { reloadScheduler } from "@/lib/scheduler";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const projects = await prisma.project.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search } },
            { spreadsheetUrl: { contains: search } },
            { gid: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
  });
  return Response.json({ projects: projects.map(projectToDto) });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const json = await request.json().catch(() => null);
  const parsed = projectSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Input tidak valid." }, { status: 400 });
  }
  if (!validateCronExpression(parsed.data.cronExpression, parsed.data.timezone)) {
    return Response.json({ error: "Cron expression tidak valid." }, { status: 400 });
  }

  const project = await prisma.project.create({ data: projectData(parsed.data) });
  await reloadScheduler();
  return Response.json({ project: projectToDto(project) }, { status: 201 });
}
