// ─────────────────────────────────────────────────────────────
// Google Calendar · 할 일용 옛 스텁(밑작업)
//
// **사이트 "일정"(CalendarEvent)의 구글 동기화는 여기가 아니라 `lib/gcal/` 에 있다** — 서비스 계정으로 붙고,
// 설계는 docs/superpowers/specs/2026-10-16-google-calendar-sync-design.md, 규칙은 AGENTS.md "구글 캘린더".
//
// 이 파일은 할 일 화면의 "구글 캘린더에도 저장" 선택지 때문에만 남아 있다. 그 선택지는 지금 **숨김**이라
// (`app/todos/todos-client.tsx`) `app/api/todos/route.ts` 의 syncTodoToGoogle 갈래는 돌지 않고, 돌더라도
// 자격증명·토큰이 없어 "미설정" 으로 답한다 — 할 일은 로컬에만 저장된다(syncedToGoogle=false).
//
// 할 일까지 구글로 보내게 넓힐 때는 이 스텁을 살리지 말고 `lib/gcal/` 의 클라이언트·서비스 계정을 쓸 것(스펙 §1).
// 아래의 OAuth(AUTH_GOOGLE_*)·googleapis 가정은 사이트가 아이디·비밀번호 로그인이 되면서 맞지 않게 됐다.
// ─────────────────────────────────────────────────────────────

export type SyncResult =
  | { ok: true; googleEventId: string }
  | { ok: false; reason: "not_configured" | "no_token" | "error"; message?: string };

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export interface GoogleEventInput {
  title: string;
  description?: string | null;
  start: Date;
  end?: Date | null;
  allDay?: boolean;
  /** 알림(분 전) */
  reminderMinutes?: number | null;
}

/**
 * 캘린더 이벤트를 Google Calendar 에 생성/동기화.
 * 미설정 시 조용히 { ok:false, reason:"not_configured" } 반환 → 호출측은 로컬만 저장.
 */
export async function syncEventToGoogle(
  _input: GoogleEventInput,
  _accessToken?: string
): Promise<SyncResult> {
  if (!isGoogleConfigured()) return { ok: false, reason: "not_configured" };
  if (!_accessToken) return { ok: false, reason: "no_token" };

  // TODO(연동): googleapis 로 events.insert 호출
  //   const calendar = google.calendar({ version: "v3", auth });
  //   const res = await calendar.events.insert({ calendarId: "primary", requestBody: {...} });
  //   return { ok: true, googleEventId: res.data.id! };
  return { ok: false, reason: "error", message: "아직 구현되지 않았어요 (밑작업 단계)" };
}

/** 할일 → 캘린더 이벤트 동기화 (마감시각/알림 포함) */
export async function syncTodoToGoogle(
  todo: { title: string; date: Date; dueTime?: string | null; remindAt?: Date | null },
  accessToken?: string
): Promise<SyncResult> {
  const start = new Date(todo.date);
  if (todo.dueTime && /^\d{1,2}:\d{2}$/.test(todo.dueTime)) {
    const [h, m] = todo.dueTime.split(":").map(Number);
    start.setHours(h, m, 0, 0);
  }
  const reminderMinutes = todo.remindAt
    ? Math.max(0, Math.round((start.getTime() - new Date(todo.remindAt).getTime()) / 60000))
    : null;

  return syncEventToGoogle(
    {
      title: `✅ ${todo.title}`,
      start,
      allDay: !todo.dueTime,
      reminderMinutes,
    },
    accessToken
  );
}

export async function deleteGoogleEvent(
  _googleEventId: string,
  _accessToken?: string
): Promise<{ ok: boolean }> {
  if (!isGoogleConfigured() || !_accessToken) return { ok: false };
  // TODO(연동): calendar.events.delete({ calendarId: "primary", eventId })
  return { ok: false };
}
