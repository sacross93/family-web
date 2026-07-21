import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const posts = await prisma.boardPost.findMany({
    include: { author: true },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.content?.trim()) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }
  const post = await prisma.boardPost.create({
    data: {
      content: body.content.trim(),
      emoji: body.emoji?.trim() || "💬",
      color: body.color || "butter",
      pinned: typeof body.pinned === "boolean" ? body.pinned : false,
      authorId: body.authorId || null,
    },
    include: { author: true },
  });
  return NextResponse.json(post);
}
