import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

// GET /api/decorations?page=/albums  → 해당 페이지 + global 스티커
// GET /api/decorations                → 전체 (관리자 개요용)
export async function GET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get("page");
  const items = await prisma.decoration.findMany({
    where: page ? { page: { in: [page, "global"] } } : undefined,
    orderBy: [{ z: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(items);
}

// 페이지(전역) 꾸미기는 관리자만, 게시글/계획 안(board:/plan:)은 로그인 가족 누구나
function isPageLevel(page: string) {
  return page.startsWith("/") || page === "global";
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  const body = await req.json();
  const page = typeof body.page === "string" && body.page ? body.page : "global";
  if (isPageLevel(page) && !user.isAdmin) {
    return NextResponse.json({ error: "페이지 꾸미기는 관리자만 가능해요." }, { status: 403 });
  }
  if (!body?.url?.trim()) {
    return NextResponse.json({ error: "사진 주소가 필요해요." }, { status: 400 });
  }
  const item = await prisma.decoration.create({
    data: {
      page,
      url: body.url.trim(),
      xPct: typeof body.xPct === "number" ? body.xPct : 50,
      yPx: typeof body.yPx === "number" ? body.yPx : 200,
      width: typeof body.width === "number" ? body.width : 160,
      rotation: typeof body.rotation === "number" ? body.rotation : 0,
      z: typeof body.z === "number" ? body.z : 20, // 기본: 콘텐츠 앞(front)
    },
  });
  return NextResponse.json(item);
}
