import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TIME_RE = /^\d{1,2}:\d{2}$/;

/** 날짜 문자열(yyyy-MM-dd)과 시간 문자열을 합쳐 start/end Date 로 만듭니다. */
function buildDates(body: {
  date?: string;
  allDay?: boolean;
  startTime?: string | null;
  endTime?: string | null;
}) {
  const date = String(body.date);
  const allDay = Boolean(body.allDay);

  const startTime =
    !allDay && typeof body.startTime === "string" && TIME_RE.test(body.startTime)
      ? body.startTime
      : "00:00";
  const start = new Date(`${date}T${startTime.padStart(5, "0")}:00`);

  let end: Date | null = null;
  if (!allDay && typeof body.endTime === "string" && TIME_RE.test(body.endTime)) {
    end = new Date(`${date}T${body.endTime.padStart(5, "0")}:00`);
  }

  return { start, end, allDay };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if ("description" in body) data.description = body.description?.trim() || null;
  if (typeof body.color === "string") data.color = body.color;
  if ("location" in body) data.location = body.location?.trim() || null;
  if (typeof body.allDay === "boolean") data.allDay = body.allDay;

  // 날짜가 오면 start/end/allDay 를 함께 다시 계산
  if (body.date) {
    const { start, end, allDay } = buildDates(body);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: "날짜가 올바르지 않아요." }, { status: 400 });
    }
    data.start = start;
    data.end = end;
    data.allDay = allDay;
  }

  const event = await prisma.calendarEvent.update({
    where: { id },
    data,
  });
  return NextResponse.json(event);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.calendarEvent.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
