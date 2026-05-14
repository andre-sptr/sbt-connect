import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/auth";
import { deactivateUser } from "@/lib/user-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      telegramChatId: true,
      createdAt: true,
      _count: { select: { projects: true } },
    },
  });

  if (!user) return Response.json({ error: "User tidak ditemukan." }, { status: 404 });
  return Response.json({ user });
}

/** DELETE — soft-delete: isActive=false + cascade disable semua project user */
export async function DELETE(_request: Request, context: Context) {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  // Jangan izinkan admin menon-aktifkan dirinya sendiri
  if (userId === session.userId) {
    return Response.json({ error: "Tidak bisa menonaktifkan akun sendiri." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "User tidak ditemukan." }, { status: 404 });
  if (!user.isActive) return Response.json({ error: "User sudah tidak aktif." }, { status: 400 });

  await deactivateUser(userId);
  return Response.json({ ok: true });
}
