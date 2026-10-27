import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ANNIVERSARY_LUNAR, canEditAnniversary } from "@/lib/anniversary";
import { matchesLunar, parseLunar, type LunarDate } from "@/lib/lunar";

const ALLOWED_TYPES = ["birthday", "anniversary", "memorial", "event"];

const FORBIDDEN = "만든 사람이나 관리자만 고칠 수 있어요.";
// 이 문구는 포동이의 지우기 카드에도 그대로 뜬다 — [지우기]를 눌렀는데 "고칠 수" 라고 하면 어색하다.
const FORBIDDEN_REMOVE = "만든 사람이나 관리자만 지울 수 있어요.";
/**
 * 음력 기념일에 `lunar` 없이 날짜만 온 경우. 받으면 둘 중 하나가 **조용히** 틀린다 — 음력 줄을 지우면
 * 엄마 생일이 이듬해부터 양력으로 세어지고, 남기면 날짜와 음력이 어긋나 나이·고치기 폼의 해가 엉뚱해진다.
 * 화면은 늘 `lunar` 를 같이 보내므로 이 말은 포동이(날짜만 고친다)가 받는다.
 * 그래서 어디서 고치면 되는지를 말한다 — 포동이가 이 문장을 그대로 가족에게 옮긴다.
 */
const LUNAR_DATE_ON_SCREEN = "음력 기념일이라 날짜는 기념일 화면에서 고쳐 주세요.";
const LUNAR_MISMATCH = "음력 날짜와 양력 날짜가 서로 맞지 않아요. 날짜를 다시 골라 주세요.";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.trim();
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const row = await prisma.anniversary.findUnique({
    where: { id },
    include: { owner: true, lunar: ANNIVERSARY_LUNAR },
  });
  // 없는 id 에 update 를 걸면 P2025 → 500 이 된다. 없으면 없다고 말한다.
  if (!row) {
    return NextResponse.json({ error: "이미 지워진 기념일이에요." }, { status: 404 });
  }
  if (!canEditAnniversary(user, row.owner?.userId)) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }
  const body = await req.json();
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "고칠 내용이 없어요." }, { status: 400 });
  }

  // 음력: 키가 없으면 그대로, null 이면 양력으로, 객체면 그 음력 날짜로(`date` 와 짝이 맞아야 한다).
  let lunar: LunarDate | null | undefined;
  if ("lunar" in body) {
    const parsed = parseLunar(body.lunar);
    if (!parsed.ok) {
      return NextResponse.json({ error: "음력 날짜를 다시 확인해 주세요." }, { status: 400 });
    }
    lunar = parsed.value;
    if (lunar) {
      // 해는 `date` 에서 되짚는다 — 날짜 없이 음력만 바꾸면 무슨 해의 그 날인지 알 수 없다.
      const date = parseDate(body.date);
      if (!date) return NextResponse.json({ error: "날짜를 입력해 주세요." }, { status: 400 });
      if (!matchesLunar(date, lunar)) return NextResponse.json({ error: LUNAR_MISMATCH }, { status: 400 });
    }
  } else if (row.lunar && "date" in body) {
    return NextResponse.json({ error: LUNAR_DATE_ON_SCREEN }, { status: 400 });
  }

  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim())
    data.title = body.title.trim();
  if ("date" in body) {
    const date = parseDate(body.date);
    if (date) data.date = date;
  }
  if (typeof body.type === "string" && ALLOWED_TYPES.includes(body.type))
    data.type = body.type;
  if (typeof body.recurring === "boolean") data.recurring = body.recurring;
  if (typeof body.emoji === "string") data.emoji = body.emoji.trim() || "🎉";
  if (typeof body.color === "string") data.color = body.color;
  if ("note" in body) data.note = body.note?.trim() || null;
  if (typeof body.memberId === "string" || body.memberId === null)
    data.memberId = body.memberId || null;

  // 음력 줄과 기념일을 한 번에 — 하나만 바뀌면 날짜는 양력인데 음력 줄이 남는(또는 그 반대) 기념일이 생긴다.
  // 줄을 뺄 때는 `deleteMany` — 없는 줄에 `delete` 를 걸면 P2025 로 500 이 된다(양력→양력 저장이 그렇다).
  const item = await prisma.$transaction(async (tx) => {
    if (lunar === null) await tx.anniversaryLunar.deleteMany({ where: { anniversaryId: id } });
    else if (lunar) {
      await tx.anniversaryLunar.upsert({
        where: { anniversaryId: id },
        create: { anniversaryId: id, ...lunar },
        update: lunar,
      });
    }
    return tx.anniversary.update({
      where: { id },
      data,
      include: { member: true, lunar: ANNIVERSARY_LUNAR },
    });
  });
  return NextResponse.json({ ...item, canEdit: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const row = await prisma.anniversary.findUnique({ where: { id }, include: { owner: true } });
  // 이미 없으면 그걸로 된 것이다 — 403 보다 먼저 본다(지운 사람이 다시 눌러도 같은 결과).
  if (!row) return NextResponse.json({ ok: true });
  if (!canEditAnniversary(user, row.owner?.userId)) {
    return NextResponse.json({ error: FORBIDDEN_REMOVE }, { status: 403 });
  }
  // 음력 줄(AnniversaryLunar)은 FK 의 ON DELETE CASCADE 로 같이 지워진다(ensure.sql).
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.anniversary.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
