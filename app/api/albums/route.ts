import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const albums = await prisma.album.findMany({
    include: { _count: { select: { photos: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(albums);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "앨범 제목을 입력해 주세요." }, { status: 400 });
  }
  const album = await prisma.album.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      emoji: body.emoji?.trim() || "📸",
      color: body.color || "rose",
      coverUrl: body.coverUrl?.trim() || null,
      takenOn: body.takenOn ? new Date(body.takenOn) : null,
    },
    include: { _count: { select: { photos: true } } },
  });
  return NextResponse.json(album);
}
