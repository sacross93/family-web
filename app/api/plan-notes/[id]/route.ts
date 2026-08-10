import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("title" in body) data.title = body.title?.trim() || null;
  if (typeof body.content === "string") data.content = body.content;

  const note = await prisma.planNote.update({ where: { id }, data });
  return NextResponse.json(note);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.planNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
