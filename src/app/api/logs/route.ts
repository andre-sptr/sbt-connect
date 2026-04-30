import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const level = searchParams.get("level");
  const logs = await prisma.log.findMany({
    where: {
      projectId: projectId ? Number(projectId) : undefined,
      level: level || undefined,
    },
    include: {
      project: { select: { name: true } },
      run: { select: { status: true, action: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
  return Response.json({ logs });
}
