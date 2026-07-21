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
  if (typeof body.content === "string" && body.content.trim())
    data.content = body.content.trim();
  if (typeof body.emoji === "string") data.emoji = body.emoji.trim() || "💬";
  if (typeof body.color === "string") data.color = body.color;
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;
  if (typeof body.authorId === "string" || body.authorId === null)
    data.authorId = body.authorId || null;

  const post = await prisma.boardPost.update({
    where: { id },
    data,
    include: { author: true },
  });
  return NextResponse.json(post);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.boardPost.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
