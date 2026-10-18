// 구글 캘린더 라우트가 돌려주는 모양 — 서버(sync.ts·라우트)와 화면(관리자 카드·캘린더)이 같이 본다.
//
// **prisma 를 들이지 않는 파일**이다. sync.ts 는 prisma·node:crypto 를 import 하므로 "use client" 파일이
// 거기서 무엇이든(타입 하나라도) 가져오면 경계가 흐려진다 — 그래서 모양과 문구만 여기 두고 sync.ts 가 다시 내보낸다.
// 값이 한 곳에서 오니 화면이 들고 있는 모양이 라우트와 어긋나지 않는다.

/** `POST /api/google/sync`·`/api/google/initial` 의 응답 */
export type SyncOutcome =
  | { ran: false; reason: "disabled" | "not_started" | "throttled" | "locked" }
  | { ran: true; changed: number; error: string | null };

/** 관리자 카드의 상태(`gcalStatus()`). 날짜는 ISO 문자열 — 서버 컴포넌트가 그대로 화면에 넘긴다. */
export interface GcalStatus {
  config: "on" | "missing" | "bad_key";
  calendarId: string | null;
  initialDoneAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  linked: number;
  pending: number;
}

/** 처음 맞추기 미리보기 — 무엇이 진짜 캘린더에 쓰일지. 구글을 못 읽었으면 짧은 오류 문구. */
export type GcalPreview = { toPush: number; toLink: number; toImport: number } | { error: string };

/** `GET /api/google/status` 의 200 본문. 켜져 있고 처음 맞추기 전일 때만 `preview` 가 붙는다. */
export type GcalStatusBody = GcalStatus & { preview?: GcalPreview };

/** 반복 회차·여러 날 일정을 사이트에서 고치거나 지우려 할 때의 409 문구(화면·포동이 모두 이 길을 탄다) */
export const READONLY_MESSAGE = "구글에서 반복되는(또는 여러 날) 일정이라 구글 캘린더에서 고쳐 주세요.";
