import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 단건 { text } 또는 일괄 { texts }. 지금 단계에 붙는다: 임신 중이면 그 임신, 아니면 준비 체크리스트 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const texts: string[] = Array.isArray(body?.texts)
    ? body.texts.map((t: unknown) => String(t ?? "").trim()).filter(Boolean)
    : [String(body?.text ?? "").trim()].filter(Boolean);
  if (texts.length === 0) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }
  const active = await prisma.pregnancy.findFirst({ where: { endedAt: null }, select: { id: true } });
  const pregnancyId = active?.id ?? null;
  const last = await prisma.journeyChecklistItem.findFirst({
    where: { pregnancyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const base = (last?.sortOrder ?? -1) + 1;
  const items = await prisma.journeyChecklistItem.createManyAndReturn({
    data: texts.map((text, i) => ({ text, pregnancyId, sortOrder: base + i })),
  });
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  return NextResponse.json(Array.isArray(body?.texts) ? sorted : sorted[0]);
}
