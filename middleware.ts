import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// 로그인 없이 접근 가능한 경로
const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const user = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  // 미인증 처리
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  if (pathname !== "/") url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // 정적 파일(_next, 확장자 있는 파일)은 제외하고 모든 경로에서 실행
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
