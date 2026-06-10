import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken } from "@/lib/auth";
import { getUserByUsername, verifyPassword } from "@/lib/user-service";

type LoginBody = {
  username?: string;
  password?: string;
};

async function readLoginBody(request: Request): Promise<{ body: LoginBody | null; nativeForm: boolean }> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return {
      body: (await request.json().catch(() => null)) as LoginBody | null,
      nativeForm: false,
    };
  }

  const formData = await request.formData().catch(() => null);
  return {
    body: formData
      ? {
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || ""),
        }
      : null,
    nativeForm: true,
  };
}

function loginFailure(request: Request, nativeForm: boolean) {
  if (nativeForm) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), { status: 303 });
  }
  return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
}

export async function POST(request: Request) {
  const { body, nativeForm } = await readLoginBody(request);

  if (!body?.username || !body?.password) {
    return loginFailure(request, nativeForm);
  }

  const user = await getUserByUsername(body.username);
  if (!user || !user.isActive) {
    return loginFailure(request, nativeForm);
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return loginFailure(request, nativeForm);
  }

  const token = createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role as "admin" | "user",
  });

  const response = nativeForm
    ? NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 })
    : NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
