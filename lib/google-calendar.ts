// ─────────────────────────────────────────────────────────────
// Google Calendar 연동 · 밑작업(스텁)
//
// 지금은 자격증명이 없어 "미설정" 상태로 동작합니다. 그래서 할일/일정은
// 로컬(PostgreSQL)에 정상 저장되고, 구글 동기화만 건너뜁니다(syncedToGoogle=false).
//
// 실제 연동을 켜려면 REQUIREMENTS.md 의 "Google 연동" 절차를 따르세요:
//   1) Google Cloud 프로젝트 + OAuth 동의화면 + 사용자 인증정보 생성
//   2) Calendar API 활성화
//   3) .env 의 AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET 채우기
//   4) 로그인 시 캘린더 scope 요청 → 아래 TODO 부분 구현
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
