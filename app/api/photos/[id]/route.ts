import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  await prisma.photo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
