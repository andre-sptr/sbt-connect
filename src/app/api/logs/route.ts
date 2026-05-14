import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const level = searchParams.get("level");
  const q = searchParams.get("q")?.trim();
  const days = parseInt(searchParams.get("days") || "0", 10);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const since = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
  const where = {
    projectId: projectId ? Number(projectId) : undefined,
    level: level || undefined,
    ...(q ? { message: { contains: q } } : {}),
    ...(since ? { createdAt: { gte: since } } : {}),
  };

  const [total, logs] = await prisma.$transaction([
    prisma.log.count({ where }),
    prisma.log.findMany({
      where,
      include: {
        project: { select: { name: true } },
        run: { select: { status: true, action: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return Response.json({
    logs,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  });
}
