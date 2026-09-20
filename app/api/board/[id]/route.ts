import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";

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

  // 고치면서 뺀 사진은 주인이 없어진다 — 고치기 전 본문을 챙겨 두고 나중에 훑는다.
  const prev =
    typeof data.content === "string"
      ? await prisma.boardPost.findUnique({ where: { id }, select: { content: true } })
      : null;

  const post = await prisma.boardPost.update({
    where: { id },
    data,
    include: { author: true },
  });
  if (prev) await sweepUploads(imageUrlsIn(prev.content));
  return NextResponse.json(post);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // 글 안에 넣은 사진도 같이 지운다 — 앨범에 매이지 않아 여태 파일만 남았다.
  const before = await prisma.boardPost.findUnique({ where: { id }, select: { content: true } });
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.boardPost.deleteMany({ where: { id } });
  await sweepUploads(imageUrlsIn(before?.content));
  return NextResponse.json({ ok: true });
}
