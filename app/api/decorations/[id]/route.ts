import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  await prisma.decoration.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
