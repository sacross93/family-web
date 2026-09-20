// Next 16 에서 `middleware` 는 `proxy` 로 이름이 바뀌었다(파일명·함수명).
// 하는 일은 같다: 렌더 전에 로그인을 확인하고, 없으면 /login 으로 보낸다.
//
// v16 부터 proxy 는 **Node 런타임이 기본**이지만, 여기서는 여전히 edge-safe 한 것만
// import 한다 — `lib/session.ts`(jose)뿐. prisma·next/headers·bcrypt 를 끌어오면
// 이 파일이 무거워지고 CDN 앞단으로 나갈 수 없게 된다.
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// 로그인 없이 접근 가능한 경로
const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function proxy(req: NextRequest) {
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
