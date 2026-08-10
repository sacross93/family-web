import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.planId) {
    return NextResponse.json({ error: "계획을 찾을 수 없어요." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!title && !content.trim()) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  const last = await prisma.planNote.findFirst({
    where: { planId: body.planId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const note = await prisma.planNote.create({
    data: { planId: body.planId, title: title || null, content, sortOrder },
  });
  return NextResponse.json(note);
}
