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
  await prisma.babyLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
