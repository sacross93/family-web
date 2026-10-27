import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ANNIVERSARY_LUNAR, withCanEdit } from "@/lib/anniversary";
import { matchesLunar, parseLunar } from "@/lib/lunar";

const ALLOWED_TYPES = ["birthday", "anniversary", "memorial", "event"];

/** 화면은 언제나 맞는 짝을 보낸다 — 이 말을 보는 것은 손으로 만든 요청뿐이다. */
const LUNAR_MISMATCH = "음력 날짜와 양력 날짜가 서로 맞지 않아요. 날짜를 다시 골라 주세요.";

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
    include: { member: true, owner: true, lunar: ANNIVERSARY_LUNAR },
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

  // 음력: `{ month, day, leap }` 이면 음력 기념일, 없거나 null 이면 양력(포동이는 보내지 않는다 — 양력으로 만든다).
  // 해는 따로 받지 않고 `date`(화면이 바꿔 둔 양력 날짜)에서 되짚으므로, 둘이 정말 같은 날인지 여기서 본다.
  const lunar = parseLunar(body.lunar ?? null);
  if (!lunar.ok) {
    return NextResponse.json({ error: "음력 날짜를 다시 확인해 주세요." }, { status: 400 });
  }
  if (lunar.value && !matchesLunar(date, lunar.value)) {
    return NextResponse.json({ error: LUNAR_MISMATCH }, { status: 400 });
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
      // 음력 줄도 같은 문장으로 — 따로 쓰다 실패하면 음력 생일이 양력으로 남는다.
      ...(lunar.value ? { lunar: { create: lunar.value } } : {}),
    },
    include: { member: true, lunar: ANNIVERSARY_LUNAR },
  });
  // 방금 만든 사람이니 고칠 수 있다.
  return NextResponse.json({ ...item, canEdit: true });
}
