import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

export function middleware(request: NextRequest) {
  const isProtected =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/api/projects") ||
    request.nextUrl.pathname.startsWith("/api/groups") ||
    request.nextUrl.pathname.startsWith("/api/logs") ||
    request.nextUrl.pathname.startsWith("/api/overview") ||
    request.nextUrl.pathname.startsWith("/api/runs");

  if (isProtected && !request.cookies.get(AUTH_COOKIE)?.value) {
    if (request.nextUrl.pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (request.nextUrl.pathname === "/login" && request.cookies.get(AUTH_COOKIE)?.value) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/api/:path*"],
};
