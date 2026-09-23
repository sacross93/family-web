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

export async function GET() {
  const events = await prisma.calendarEvent.findMany({
    orderBy: { start: "asc" },
  });
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!body?.date) {
    return NextResponse.json({ error: "날짜를 선택해 주세요." }, { status: 400 });
  }

  const { start, end, allDay } = buildDates(body);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "날짜가 올바르지 않아요." }, { status: 400 });
  }

  const event = await prisma.calendarEvent.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      start,
      end,
      allDay,
      color: body.color || "rose",
      location: body.location?.trim() || null,
    },
  });
  return NextResponse.json(event);
}
