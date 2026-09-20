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
  const album = await prisma.album.findUnique({
    where: { id },
    select: { coverUrl: true, photos: { select: { url: true } } },
  });
  if (!album) return NextResponse.json({ ok: true });

  // 파일을 먼저 지운다(사진 삭제와 같은 이유).
  const gone = await removeUploads([album.coverUrl, ...album.photos.map((p) => p.url)]);
  if (!gone) {
    return NextResponse.json({ error: "사진 파일을 못 지웠어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
  // photos 는 스키마 onDelete:Cascade 로 함께 삭제됨
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.album.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
