import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const albumId = req.nextUrl.searchParams.get("albumId");
  const photos = await prisma.photo.findMany({
    where: albumId ? { albumId } : undefined,
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(photos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.albumId || !body?.url?.trim()) {
    return NextResponse.json({ error: "앨범과 사진 주소가 필요해요." }, { status: 400 });
  }

  // 해당 앨범의 마지막 순서 뒤로 붙이기
  const last = await prisma.photo.findFirst({
    where: { albumId: body.albumId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const photo = await prisma.photo.create({
    data: {
      albumId: body.albumId,
      url: body.url.trim(),
      caption: body.caption?.trim() || null,
      width: typeof body.width === "number" ? body.width : null,
      height: typeof body.height === "number" ? body.height : null,
      takenAt: body.takenAt ? new Date(body.takenAt) : null,
      sortOrder,
    },
  });

  // 사진이 추가된 앨범을 최근 순으로 끌어올림
  await prisma.album.update({
    where: { id: body.albumId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(photo);
}
