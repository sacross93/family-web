import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PRIORITIES = new Set(["low", "normal", "high"]);
const TIME_RE = /^\d{1,2}:\d{2}$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.priority === "string" && PRIORITIES.has(body.priority))
    data.priority = body.priority;
  if ("dueTime" in body) {
    data.dueTime =
      typeof body.dueTime === "string" && TIME_RE.test(body.dueTime.trim())
        ? body.dueTime.trim()
        : null;
  }
  if ("memberId" in body) data.memberId = body.memberId || null;
  if ("date" in body) {
    const s = typeof body.date === "string" ? body.date.trim() : "";
    if (s) {
      const d = s.includes("T") ? new Date(s) : new Date(`${s}T00:00:00`);
      if (!Number.isNaN(d.getTime())) data.date = d;
    }
  }
  if ("remindAt" in body) {
    if (body.remindAt) {
      const d = new Date(body.remindAt);
      data.remindAt = Number.isNaN(d.getTime()) ? null : d;
    } else {
      data.remindAt = null;
    }
  }

  const todo = await prisma.todo.update({
    where: { id },
    data,
    include: { member: true },
  });
  return NextResponse.json(todo);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.todo.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
