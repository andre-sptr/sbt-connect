import { prisma } from "@/lib/prisma";
import { projectSchema, validateCronExpression } from "@/lib/project-validation";
import { projectData, projectToDto } from "@/lib/project-service";
import { requireApiSession } from "@/lib/auth";
import { reloadScheduler } from "@/lib/scheduler";

const PAGE_SIZE = 10;

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const isAdmin = session.role === "admin";

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const requestedPage = searchParams.get("page");
  const page = Math.max(1, parseInt(requestedPage || "1", 10) || 1);

  const ownerFilter = isAdmin ? {} : { createdByUserId: session.userId };
  const searchFilter = search
    ? {
        OR: [
          { name: { contains: search } },
          { spreadsheetUrl: { contains: search } },
          { gid: { contains: search } },
        ],
      }
    : undefined;

  const where = { ...ownerFilter, ...searchFilter };

  if (!requestedPage) {
    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { username: true } } },
    });
    return Response.json({ projects: projects.map(projectToDto) });
  }

  const [total, activeTotal, projects] = await prisma.$transaction([
    prisma.project.count({ where }),
    prisma.project.count({ where: { ...where, enabled: true } }),
    prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { createdBy: { select: { username: true } } },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return Response.json({
    projects: projects.map(projectToDto),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      activeTotal,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const json = await request.json().catch(() => null);
  const parsed = projectSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || "Input tidak valid." }, { status: 400 });
  }
  if (!validateCronExpression(parsed.data.cronExpression, parsed.data.timezone)) {
    return Response.json({ error: "Cron expression tidak valid." }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      ...projectData(parsed.data),
      createdByUserId: session.userId,
    },
  });
  await reloadScheduler();
  return Response.json({ project: projectToDto(project) }, { status: 201 });
}
