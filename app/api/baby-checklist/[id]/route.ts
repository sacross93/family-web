import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (typeof body?.done === "boolean") data.done = body.done;
  if (typeof body?.text === "string" && body.text.trim()) data.text = body.text.trim();

  const item = await prisma.babyChecklistItem.update({ where: { id }, data });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.babyChecklistItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
