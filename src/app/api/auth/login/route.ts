import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken } from "@/lib/auth";
import { getUserByUsername, verifyPassword } from "@/lib/user-service";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; password?: string }
    | null;

  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
  }

  const user = await getUserByUsername(body.username);
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
  }

  const token = createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role as "admin" | "user",
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
