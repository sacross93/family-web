import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removeUpload } from "@/lib/uploads";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if ("caption" in body) data.caption = body.caption?.trim() || null;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const photo = await prisma.photo.update({ where: { id }, data });
  return NextResponse.json(photo);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // 지울 주소를 먼저 챙긴다 — 행이 사라지면 어느 파일인지 알 수 없다.
  const photo = await prisma.photo.findUnique({ where: { id }, select: { url: true } });
  await prisma.photo.delete({ where: { id } });
  await removeUpload(photo?.url);
  return NextResponse.json({ ok: true });
}
