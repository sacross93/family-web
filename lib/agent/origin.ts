// 에이전트가 이 사이트의 내부 API 를 부를 때 쓸 주소. 한 곳에만 둔다.
//
// 보안 규칙이 두 라우트에 흩어져 있으면 한쪽만 고쳐진다 — 대화 라우트(app/api/agent/route.ts)와
// 되돌리기(app/api/agent/undo/route.ts)가 같은 이 함수를 쓴다.

const DEV_ORIGIN = "http://localhost:3000";

/**
 * **요청 헤더(Host·X-Forwarded-Host)에서 만들면 안 된다.**
 * 그 헤더는 요청자가 정하는 값인데, 여기서 만든 주소로 나가는 요청에는 **요청자의 세션 쿠키가
 * 그대로 실린다.** 헤더를 믿으면 조작 한 번으로 가족의 로그인 쿠키가 남의 서버로 걸어 나간다.
 * 서버가 아는 값(환경변수)만 쓰고, 없으면 개발 기본값으로 떨어진다.
 *
 * 배포에서는 `AGENT_ORIGIN` 을 반드시 채운다. 비워 두면 `AUTH_URL` 을 쓰는데 그 값이 로컬이면
 * 배포 서버의 도구가 로컬 주소를 부른다.
 */
export function agentOrigin(): string {
  const raw = process.env.AGENT_ORIGIN || process.env.AUTH_URL || DEV_ORIGIN;
  // 끝의 `/` 는 잘라낸다 — 쓰는 쪽이 `${origin}${path}` 로 붙이므로 `//plans` 가 된다.
  return raw.trim().replace(/\/+$/, "");
}
