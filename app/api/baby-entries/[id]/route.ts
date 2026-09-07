import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KINDS = new Set(["diary", "checkup", "letter"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};

  if (typeof body?.content === "string" && body.content.trim()) data.content = body.content.trim();
  if (typeof body?.kind === "string" && KINDS.has(body.kind)) data.kind = body.kind;
  if (body?.mood === null) data.mood = null;
  else if (typeof body?.mood === "string") data.mood = body.mood.trim() || null;
  if (body?.authorId === null) data.authorId = null;
  else if (typeof body?.authorId === "string" && body.authorId) data.authorId = body.authorId;
  if (typeof body?.date === "string") {
    const d = new Date(body.date);
    if (!Number.isNaN(d.getTime())) data.date = d;
  }

  const entry = await prisma.babyEntry.update({
    where: { id },
    data,
    include: { author: true },
  });
  return NextResponse.json(entry);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.babyEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
