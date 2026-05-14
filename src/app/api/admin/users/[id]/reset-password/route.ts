import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/auth";
import { resetPassword } from "@/lib/user-service";

type Context = { params: Promise<{ id: string }> };

/** POST — generate new password and return it to admin */
export async function POST(_request: Request, context: Context) {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "User tidak ditemukan." }, { status: 404 });
  if (!user.isActive) return Response.json({ error: "User tidak aktif." }, { status: 400 });

  const newPassword = await resetPassword(userId);
  return Response.json({ password: newPassword });
}
