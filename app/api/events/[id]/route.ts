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
  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
