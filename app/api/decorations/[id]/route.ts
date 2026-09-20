import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sweepUploads } from "@/lib/uploads";
import { getCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

function isPageLevel(page: string) {
  return page.startsWith("/") || page === "global";
}

// 대상 스티커에 대한 편집 권한 확인 (페이지=관리자, 스코프=로그인 가족)
async function authorize(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요.", status: 401 as const };
  const deco = await prisma.decoration.findUnique({ where: { id } });
  if (!deco) return { error: "없는 항목이에요.", status: 404 as const };
  if (isPageLevel(deco.page) && !user.isAdmin) {
    return { error: "관리자만 수정할 수 있어요.", status: 403 as const };
  }
  return { deco };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["xPct", "yPx", "width", "rotation", "z"] as const) {
    if (typeof body[k] === "number") data[k] = body[k];
  }
  if (typeof body.url === "string" && body.url.trim()) data.url = body.url.trim();

  const item = await prisma.decoration.update({ where: { id }, data });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // 스티커 그림도 올린 파일이다 — 떼면 파일도 지운다.
  // 같은 그림을 여러 곳에 붙였을 수 있어 참조를 세고 지운다(sweepUploads).
  const before = await prisma.decoration.findUnique({ where: { id }, select: { url: true } });
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.decoration.deleteMany({ where: { id } });
  await sweepUploads([before?.url]);
  return NextResponse.json({ ok: true });
}
