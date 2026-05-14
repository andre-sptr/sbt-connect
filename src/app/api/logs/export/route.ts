import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const level = searchParams.get("level");
  const q = searchParams.get("q")?.trim();
  const days = parseInt(searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

  const logs = await prisma.log.findMany({
    where: {
      projectId: projectId ? Number(projectId) : undefined,
      level: level || undefined,
      ...(q ? { message: { contains: q } } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    include: {
      project: { select: { name: true } },
      run: { select: { status: true, action: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  function escCsv(value: string | null | undefined): string {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const rows = [
    ["Waktu", "Level", "Project", "Action", "Status Run", "Pesan"],
    ...logs.map((log) => [
      new Date(log.createdAt).toISOString(),
      log.level,
      log.project?.name ?? "System",
      log.run?.action ?? "",
      log.run?.status ?? "",
      log.message,
    ]),
  ];

  const csv = rows.map((row) => row.map(escCsv).join(",")).join("\r\n");
  const filename = `sbt-connect-logs-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
