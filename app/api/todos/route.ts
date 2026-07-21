import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncTodoToGoogle } from "@/lib/google-calendar";

const PRIORITIES = new Set(["low", "normal", "high"]);
const TIME_RE = /^\d{1,2}:\d{2}$/;

/** "yyyy-MM-dd"(또는 ISO) → 그 날 자정 Date. 못 읽으면 null. */
function parseDateOnly(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  const d = s.includes("T") ? new Date(s) : new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** datetime-local("yyyy-MM-ddTHH:mm") 등 → Date. 못 읽으면 null. */
function parseDateTime(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  const todos = await prisma.todo.findMany({
    include: { member: true },
    orderBy: [{ date: "asc" }, { done: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json(todos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "할일을 입력해 주세요." }, { status: 400 });
  }

  const date = parseDateOnly(body.date) ?? new Date();
  const priority = PRIORITIES.has(body.priority) ? body.priority : "normal";
  const dueTime =
    typeof body.dueTime === "string" && TIME_RE.test(body.dueTime.trim())
      ? body.dueTime.trim()
      : null;
  const remindAt = parseDateTime(body.remindAt);

  let todo = await prisma.todo.create({
    data: {
      title: body.title.trim(),
      date,
      dueTime,
      priority,
      remindAt,
      memberId: body.memberId || null,
    },
    include: { member: true },
  });

  // "구글 캘린더에 저장" 옵션 — 미설정이면 조용히 로컬만 유지(syncedToGoogle=false).
  if (body.syncToGoogle) {
    const result = await syncTodoToGoogle({
      title: todo.title,
      date: todo.date,
      dueTime: todo.dueTime,
      remindAt: todo.remindAt,
    });
    if (result.ok) {
      todo = await prisma.todo.update({
        where: { id: todo.id },
        data: { googleEventId: result.googleEventId, syncedToGoogle: true },
        include: { member: true },
      });
    }
  }

  return NextResponse.json(todo);
}
