/**
 * 서버 시간대를 한국으로 맞춘다.
 *
 * Vercel 은 UTC 로 돈다. 그대로 두면 서버가 읽는 "지금"과 가족이 사는 "지금"이
 * 아홉 시간 어긋나서:
 *   - 오후 2시에 홈이 "늦은 밤이에요" 라고 인사하고,
 *   - `startOfDay(new Date())` 가 UTC 자정이라 **한국시간 새벽 0시부터 아침 9시까지**
 *     "오늘 할일" 이 어제 것을 보여 준다.
 *
 * 날짜를 저장할 때도 읽을 때도 전부 "서버 로컬 자정" 을 하루의 경계로 쓰고 있으므로
 * (`lib/date.ts` 의 `fromDateInput`·`parseDateInput`, 각 페이지의 `startOfDay`),
 * 시간대 하나만 맞추면 저장·조회·표시가 한꺼번에 들어맞는다. 호출처를 고칠 필요가 없다.
 *
 * 이미 UTC 자정으로 저장된 기록도 안전하다 — 00:00Z 는 한국시간으로 **같은 날** 09:00 이라
 * 달력 날짜가 바뀌지 않는다.
 *
 * `register()` 는 서버 인스턴스마다 요청을 받기 전에 한 번 돈다
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 * Node 는 실행 중 `process.env.TZ` 변경을 반영한다.
 */
export function register() {
  // edge 런타임(미들웨어)에는 시간대 개념이 없다.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.env.TZ = process.env.SITE_TZ || "Asia/Seoul";
}
