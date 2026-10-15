import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PALETTE_KEYS } from "@/lib/colors";
import { dueDateFromLmp, parseDateInput } from "@/lib/date";

const COLORS = new Set<string>(PALETTE_KEYS);

/** 임신을 확인했어요: 예정일(또는 마지막 생리일)로 시작. 태명은 비워도 된다 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const lmp = parseDateInput(body?.lmpDate);
  const dueDate = parseDateInput(body?.dueDate) ?? (lmp ? dueDateFromLmp(lmp) : null);
  if (!dueDate) {
    return NextResponse.json({ error: "출산 예정일 또는 마지막 생리일을 알려 주세요." }, { status: 400 });
  }
  // 진행 중인 임신은 하나뿐이다 — 두 폰에서 동시에 누르면 둘이 생겨 단계와 도장이 꼬인다.
  const existing = await prisma.pregnancy.findFirst({ where: { endedAt: null }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "이미 임신 단계예요. 새로고침해 주세요." }, { status: 409 });
  }
  const nickname = String(body?.nickname ?? "").trim();
  const pregnancy = await prisma.pregnancy.create({
    data: {
      dueDate,
      ...(nickname ? { nickname } : {}),
      emoji: String(body?.emoji ?? "").trim() || "🌱",
      color: COLORS.has(body?.color) ? body.color : "rose",
    },
  });
  return NextResponse.json(pregnancy);
}
