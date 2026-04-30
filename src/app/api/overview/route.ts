import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureScheduler } from "@/lib/scheduler";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  await ensureScheduler();

  const [totalProjects, activeProjects, latestRuns, failedRuns] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { enabled: true } }),
    prisma.run.findMany({
      include: { project: { select: { name: true } } },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.run.count({ where: { status: "failed" } }),
  ]);

  const nextProject = await prisma.project.findFirst({
    where: { enabled: true, nextRunAt: { not: null } },
    orderBy: { nextRunAt: "asc" },
  });

  return Response.json({
    totalProjects,
    activeProjects,
    failedRuns,
    latestRuns,
    nextProject,
  });
}
