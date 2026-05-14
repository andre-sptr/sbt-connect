import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

const cookieClearOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 0,
};

/** POST — called by the logout button in the dashboard shell */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", cookieClearOptions);
  return response;
}

/** GET — called by server-side redirects when an invalid session is detected */
export async function GET(request: Request) {
  const loginUrl = new URL("/login", request.url);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(AUTH_COOKIE, "", cookieClearOptions);
  return response;
}
