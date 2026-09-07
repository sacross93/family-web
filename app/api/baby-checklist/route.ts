import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 단건 { babyId, text } 또는 일괄 { babyId, texts: string[] } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.babyId) {
    return NextResponse.json({ error: "아기를 찾을 수 없어요." }, { status: 400 });
  }

  const texts: string[] = Array.isArray(body.texts)
    ? body.texts.map((t: unknown) => String(t ?? "").trim()).filter(Boolean)
    : [String(body.text ?? "").trim()].filter(Boolean);
  if (texts.length === 0) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  const last = await prisma.babyChecklistItem.findFirst({
    where: { babyId: body.babyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const base = (last?.sortOrder ?? -1) + 1;

  const items = await prisma.babyChecklistItem.createManyAndReturn({
    data: texts.map((text, i) => ({ babyId: body.babyId, text, sortOrder: base + i })),
  });
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  return NextResponse.json(Array.isArray(body.texts) ? sorted : sorted[0]);
}
