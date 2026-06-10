import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth-cookie";
import { prisma } from "@/lib/prisma";
import { verifyTokenSignature, type SessionPayload } from "@/lib/auth-utils";
export { AUTH_COOKIE };
export type { SessionPayload };

export { createSessionToken } from "@/lib/auth-utils";

export async function verifySessionToken(token?: string): Promise<SessionPayload | null> {
  const payload = verifyTokenSignature(token);
  if (!payload) return null;

  // Reject legacy tokens (pre-multi-user) that lack a userId
  if (!payload.userId) return null;

  // Verify user still exists and is active in DB
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive) return null;

  return payload;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  // Redirect through the logout route so the stale cookie is cleared before
  // hitting /login — prevents the middleware from bouncing back to /dashboard.
  if (!session) redirect("/api/auth/logout");
  return session;
}

export async function requireAdminPage(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/api/auth/logout");
  if (session.role !== "admin") redirect("/dashboard");
  return session;
}

export async function requireApiSession(): Promise<SessionPayload | Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requireAdminApi(): Promise<SessionPayload | Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}
