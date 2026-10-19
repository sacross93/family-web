import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canEditAnniversary } from "@/lib/anniversary";

const ALLOWED_TYPES = ["birthday", "anniversary", "memorial", "event"];

const FORBIDDEN = "만든 사람이나 관리자만 고칠 수 있어요.";

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
  const row = await prisma.anniversary.findUnique({ where: { id }, include: { owner: true } });
  // 없는 id 에 update 를 걸면 P2025 → 500 이 된다. 없으면 없다고 말한다.
  if (!row) {
    return NextResponse.json({ error: "이미 지워진 기념일이에요." }, { status: 404 });
  }
  if (!canEditAnniversary(user, row.owner?.userId)) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }
  const body = await req.json();

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

  const item = await prisma.anniversary.update({
    where: { id },
    data,
    include: { member: true },
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
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.anniversary.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
