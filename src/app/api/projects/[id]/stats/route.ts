import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const projectId = parseInt(id, 10);
  if (!Number.isInteger(projectId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: "Project tidak ditemukan." }, { status: 404 });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const allRuns = await prisma.run.findMany({
    where: { projectId },
    orderBy: { startedAt: "asc" },
  });

  const recentRuns = allRuns.filter((r) => r.startedAt >= sevenDaysAgo);
  const totalRecent = recentRuns.length;
  const successRecent = recentRuns.filter((r) => r.status === "success").length;
  const successRate = totalRecent > 0 ? Math.round((successRecent / totalRecent) * 100) : null;
  const finishedRuns = recentRuns.filter((r) => r.finishedAt != null);
  const avgDurationMs =
    finishedRuns.length > 0
      ? Math.round(
          finishedRuns.reduce((sum, r) => sum + (r.finishedAt!.getTime() - r.startedAt.getTime()), 0) /
            finishedRuns.length
        )
      : null;

  const dailyMap: Record<string, { success: number; failed: number; running: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyMap[key] = { success: 0, failed: 0, running: 0 };
  }
  for (const run of recentRuns) {
    const key = run.startedAt.toISOString().slice(0, 10);
    if (dailyMap[key]) {
      if (run.status === "success") dailyMap[key].success++;
      else if (run.status === "failed") dailyMap[key].failed++;
      else dailyMap[key].running++;
    }
  }
  const dailyRuns = Object.entries(dailyMap).map(([date, counts]) => ({ date, ...counts }));

  return Response.json({
    project: { id: project.id, name: project.name },
    totalRuns: allRuns.length,
    totalRecentRuns: totalRecent,
    successRate,
    avgDurationMs,
    failedRuns: recentRuns.filter((r) => r.status === "failed").length,
    dailyRuns,
  });
}
