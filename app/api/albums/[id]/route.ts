import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removeUploads } from "@/lib/uploads";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if ("description" in body) data.description = body.description?.trim() || null;
  if (typeof body.emoji === "string") data.emoji = body.emoji.trim() || "📸";
  if (typeof body.color === "string") data.color = body.color;
  if ("coverUrl" in body) data.coverUrl = body.coverUrl?.trim() || null;
  if ("takenOn" in body) data.takenOn = body.takenOn ? new Date(body.takenOn) : null;

  const album = await prisma.album.update({ where: { id }, data });
  return NextResponse.json(album);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // 지울 주소를 먼저 챙긴다 — 행이 사라지면 어느 파일인지 알 수 없다.
  const album = await prisma.album.findUnique({
    where: { id },
    select: { coverUrl: true, photos: { select: { url: true } } },
  });
  // photos 는 스키마 onDelete:Cascade 로 함께 삭제됨
  await prisma.album.delete({ where: { id } });
  await removeUploads([album?.coverUrl, ...(album?.photos.map((p) => p.url) ?? [])]);
  return NextResponse.json({ ok: true });
}
