import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeUrl } from "@/lib/url";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};

  // 빈 문자열도 허용 — 도메인 표시로 되돌리는 것
  if (typeof body?.title === "string") data.title = body.title.trim();
  if (body?.url !== undefined) {
    const url = normalizeUrl(body.url);
    if (!url) {
      return NextResponse.json({ error: "주소를 확인해 주세요." }, { status: 400 });
    }
    data.url = url;
  }

  const link = await prisma.babyLink.update({ where: { id }, data });
  return NextResponse.json(link);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.babyLink.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
