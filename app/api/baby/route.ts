import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PALETTE_KEYS } from "@/lib/colors";
import { dueDateFromLmp } from "@/lib/date";

const COLORS = new Set<string>(PALETTE_KEYS);

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 현재 아기(최신 1명). 없으면 null */
export async function GET() {
  const baby = await prisma.baby.findFirst({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(baby);
}

/** 생성: 태명 + (예정일 | 마지막 생리일) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nickname = String(body?.nickname ?? "").trim();
  if (!nickname) {
    return NextResponse.json({ error: "태명을 입력해 주세요." }, { status: 400 });
  }

  const lmp = parseDate(body?.lmpDate);
  const dueDate = parseDate(body?.dueDate) ?? (lmp ? dueDateFromLmp(lmp) : null);
  if (!dueDate) {
    return NextResponse.json(
      { error: "출산 예정일 또는 마지막 생리일을 알려 주세요." },
      { status: 400 }
    );
  }

  const baby = await prisma.baby.create({
    data: {
      nickname,
      dueDate,
      emoji: String(body?.emoji ?? "").trim() || "🌱",
      color: COLORS.has(body?.color) ? body.color : "rose",
    },
  });
  return NextResponse.json(baby);
}

/** 설정 부분 수정 (id 필수) */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: "아기를 찾을 수 없어요." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.nickname === "string" && body.nickname.trim()) data.nickname = body.nickname.trim();
  if (typeof body.emoji === "string" && body.emoji.trim()) data.emoji = body.emoji.trim();
  if (typeof body.color === "string" && COLORS.has(body.color)) data.color = body.color;
  if (typeof body.showOnHome === "boolean") data.showOnHome = body.showOnHome;

  const due = parseDate(body.dueDate);
  if (due) data.dueDate = due;

  if (body.birthDate === null) {
    data.birthDate = null;
  } else {
    const birth = parseDate(body.birthDate);
    if (birth) data.birthDate = birth;
  }

  const baby = await prisma.baby.update({ where: { id: body.id }, data });
  return NextResponse.json(baby);
}
