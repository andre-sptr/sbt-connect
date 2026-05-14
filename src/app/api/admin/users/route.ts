import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/auth";
import { createUser, generatePassword } from "@/lib/user-service";

export async function GET() {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
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

  return Response.json({ users });
}

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const role: "admin" | "user" = body?.role === "admin" ? "admin" : "user";

  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return Response.json(
      { error: "Username harus 3–20 karakter (huruf, angka, underscore)." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return Response.json({ error: "Username sudah digunakan." }, { status: 409 });
  }

  const password = generatePassword(12);
  const user = await createUser(username, password, role);

  return Response.json(
    { user: { id: user.id, username: user.username, role: user.role }, password },
    { status: 201 }
  );
}
