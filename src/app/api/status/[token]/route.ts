import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
  const { token } = await context.params;

  const project = await prisma.project.findUnique({ where: { publicToken: token } });
  if (!project) {
    return Response.json({ error: "Halaman tidak ditemukan." }, { status: 404 });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentRuns = await prisma.run.findMany({
    where: { projectId: project.id, startedAt: { gte: sevenDaysAgo } },
    orderBy: { startedAt: "desc" },
  });

  const total = recentRuns.length;
  const success = recentRuns.filter((r) => r.status === "success").length;
  const successRate = total > 0 ? Math.round((success / total) * 100) : null;

  const lastRun = recentRuns[0] ?? null;

  // Cari thumbnail dari run sukses terakhir
  const lastSuccessRun = recentRuns.find((r) => r.status === "success" && r.thumbnailPath);
  const thumbnailRunId = lastSuccessRun?.id ?? null;

  return Response.json({
    name: project.name,
    enabled: project.enabled,
    lastRunAt: project.lastRunAt,
    nextRunAt: project.nextRunAt,
    cronExpression: project.cronExpression,
    timezone: project.timezone,
    successRate,
    totalRuns: total,
    lastRunStatus: lastRun?.status ?? null,
    lastRunError: lastRun?.errorSummary ?? null,
    thumbnailRunId,
  });
}
