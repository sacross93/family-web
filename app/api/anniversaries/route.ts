import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { withCanEdit } from "@/lib/anniversary";

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
  const user = await getCurrentUser();
  const items = await prisma.anniversary.findMany({
    orderBy: { date: "asc" },
    include: { member: true, owner: true },
  });
  return NextResponse.json(items.map((a) => withCanEdit(a, user)));
}

export async function POST(req: NextRequest) {
  // proxy 가 이미 막지만, 만든 사람을 적어야 하니 여기서도 확인한다 — 없으면 주인 없는(관리자만 고치는) 줄이 생긴다.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
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
      // 만든 사람 — 한 문장으로 같이 만든다(따로 쓰다 하나만 실패하면 주인 없는 기념일이 남는다).
      owner: { create: { userId: user.uid } },
    },
    include: { member: true },
  });
  // 방금 만든 사람이니 고칠 수 있다.
  return NextResponse.json({ ...item, canEdit: true });
}
