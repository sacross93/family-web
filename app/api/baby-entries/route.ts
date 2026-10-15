import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateInput } from "@/lib/date";

const KINDS = new Set(["diary", "checkup", "letter"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const content = String(body?.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "내용을 적어 주세요." }, { status: 400 });
  }
  const date = body?.date ? parseDateInput(body.date) : new Date();
  if (!date) {
    return NextResponse.json({ error: "날짜를 확인해 주세요." }, { status: 400 });
  }
  // 도장은 서버가 찍는다: 지금 진행 중인 임신. 준비 단계면 null.
  // 클라이언트 값을 믿지 않는다 — "준비 단계로 · 지우기" 가 지울 범위가 이 값이다.
  const active = await prisma.pregnancy.findFirst({ where: { endedAt: null }, select: { id: true } });
  const entry = await prisma.journeyEntry.create({
    data: {
      date,
      kind: KINDS.has(body.kind) ? body.kind : "diary",
      mood: typeof body.mood === "string" && body.mood.trim() ? body.mood.trim() : null,
      content,
      authorId: body.authorId || null,
      pregnancyId: active?.id ?? null,
    },
    include: { author: true },
  });
  return NextResponse.json(entry);
}
