import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_TYPES = ["birthday", "anniversary", "memorial", "event"];

/** "2026-07-21" 또는 ISO 문자열을 Date 로. 잘못된 값이면 null. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.trim();
  // 날짜만 온 경우 로컬 자정으로 해석해 하루 밀림 방지
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  const items = await prisma.anniversary.findMany({
    orderBy: { date: "asc" },
    include: { member: true },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  const date = parseDate(body.date);
  if (!date) {
    return NextResponse.json({ error: "날짜를 입력해 주세요." }, { status: 400 });
  }

  const type = ALLOWED_TYPES.includes(body.type) ? body.type : "anniversary";

  const item = await prisma.anniversary.create({
    data: {
      title: body.title.trim(),
      date,
      type,
      recurring: typeof body.recurring === "boolean" ? body.recurring : true,
      emoji: body.emoji?.trim() || "🎉",
      color: body.color || "rose",
      note: body.note?.trim() || null,
      memberId: body.memberId || null,
    },
    include: { member: true },
  });
  return NextResponse.json(item);
}
