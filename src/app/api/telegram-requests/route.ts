import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { telegramRequestToDto } from "@/lib/telegram-service";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const requestedPage = searchParams.get("page");
  const status = searchParams.get("status")?.trim();
  const page = Math.max(1, parseInt(requestedPage || "1", 10) || 1);
  const where = status && status !== "all" ? { status } : undefined;

  const [total, requests] = await prisma.$transaction([
    prisma.telegramRequest.count({ where }),
    prisma.telegramRequest.findMany({
      where,
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return Response.json({
    requests: requests.map(telegramRequestToDto),
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
