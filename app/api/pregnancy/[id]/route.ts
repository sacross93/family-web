import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PALETTE_KEYS } from "@/lib/colors";
import { parseDateInput } from "@/lib/date";

const COLORS = new Set<string>(PALETTE_KEYS);

/** 임신 설정 부분 수정 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (typeof body?.nickname === "string" && body.nickname.trim()) data.nickname = body.nickname.trim();
  if (typeof body?.emoji === "string" && body.emoji.trim()) data.emoji = body.emoji.trim();
  if (typeof body?.color === "string" && COLORS.has(body.color)) data.color = body.color;
  const due = parseDateInput(body?.dueDate);
  if (due) data.dueDate = due;
  if (body?.birthDate === null) data.birthDate = null;
  else {
    const birth = parseDateInput(body?.birthDate);
    if (birth) data.birthDate = birth;
  }
  // update 는 없는 행에 P2025(500)를 던진다 — 누가 먼저 "준비 단계로 · 지우기" 를 했을 수 있다.
  const { count } = await prisma.pregnancy.updateMany({ where: { id }, data });
  if (count === 0) return NextResponse.json({ error: "이미 없는 임신 기록이에요." }, { status: 404 });
  return NextResponse.json(await prisma.pregnancy.findUnique({ where: { id } }));
}
