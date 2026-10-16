import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { READONLY_MESSAGE, afterSiteDelete, afterSiteUpdate, beforeSiteDelete, readOnlyReason } from "@/lib/gcal/sync";

// 저장 뒤 구글에도 반영한다(토큰 + 요청, 각각 5초 상한) — 함수 상한에 걸려 응답이 끊기지 않게 넉넉히.
export const maxDuration = 30;

/**
 * 구글의 반복 회차·여러 날 일정은 사이트에서 고치지도 지우지도 못한다(스펙 §6). 회차 id(`<시리즈>_<시각>`)로 PATCH 하면
 * 시리즈가 갈라지고, 여러 날 일정은 사이트 양식이 하루짜리라 고치면 잘린다. 화면도 포동이도 이 라우트를 타므로 여기서 막는다
 * — 구글에는 아무 요청도 가지 않는다.
 */
async function readOnlyConflict(id: string): Promise<NextResponse | null> {
  const reason = await readOnlyReason(id);
  return reason ? NextResponse.json({ error: READONLY_MESSAGE, readOnly: reason }, { status: 409 }) : null;
}

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
  const conflict = await readOnlyConflict(id);
  if (conflict) return conflict;
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
  // 구글에 못 보내도 저장은 성공이다 — 훅이 pendingPush 를 세워 두면 다음 동기화가 다시 보낸다.
  await afterSiteUpdate(id);
  return NextResponse.json(event);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conflict = await readOnlyConflict(id);
  if (conflict) return conflict;
  // 지우기 **전에** 구글 연결에 묘비를 세운다 — 지운 뒤 여기서 끊겨도 다음 동기화가 구글에서 지운다(sync.ts).
  const link = await beforeSiteDelete(id);
  // `delete` 가 아니라 `deleteMany` — 없는 행을 지우면 prisma 가 P2025 를 던져 **500** 이 된다.
  // 공유 목록이라 실제로 일어난다: 두 사람이 같은 항목을 동시에 지우면 뒤쪽이 500 을 받고,
  // 화면은 낙관적 삭제를 되돌려 **지운 것이 되살아난다.** 이미 없으면 그걸로 된 것이다.
  await prisma.calendarEvent.deleteMany({ where: { id } });
  // 구글에서도 지운다. 못 지우면 묘비로 남고(다음 동기화가 지운다) 응답은 그대로 200 — 두 번 불러도 200.
  await afterSiteDelete(link);
  return NextResponse.json({ ok: true });
}
