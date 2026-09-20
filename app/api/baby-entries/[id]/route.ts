import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";
import { parseDateInput } from "@/lib/date";

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
  const date = parseDateInput(body?.date);
  if (date) data.date = date;

  // 고치면서 뺀 사진은 주인이 없어진다 — 고치기 전 본문을 챙겨 두고 나중에 훑는다.
  const prev =
    typeof data.content === "string"
      ? await prisma.babyEntry.findUnique({ where: { id }, select: { content: true } })
      : null;

  const entry = await prisma.babyEntry.update({
    where: { id },
    data,
    include: { author: true },
  });
  if (prev) await sweepUploads(imageUrlsIn(prev.content));
  return NextResponse.json(entry);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // 글 안에 넣은 사진도 같이 지운다 — 앨범에 매이지 않아 여태 파일만 남았다.
  const before = await prisma.babyEntry.findUnique({ where: { id }, select: { content: true } });
  await prisma.babyEntry.delete({ where: { id } });
  await sweepUploads(imageUrlsIn(before?.content));
  return NextResponse.json({ ok: true });
}
