// 결과 카드의 버튼(되돌리기·지우기)이 기존 API 라우트로 요청을 넘기는 한 곳.
// `/api/agent/undo` 와 `/api/agent/remove` 가 같이 쓴다 — 둘이 따로 쓰면 하나만 고쳐지는 날이 온다.
//
// **경로는 여기서 받지 않고 호출부가 레지스트리에서 만든 것만 넘긴다**(화이트리스트).
// 권한은 판단하지 않는다 — 요청자의 쿠키를 그대로 실어 대상 라우트와 proxy 가 판단한다.
import { NextResponse } from "next/server";
import { agentOrigin } from "./origin";

const HTTP_TIMEOUT_MS = 10_000;

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(HTTP_TIMEOUT_MS)
    : undefined;
}

/** 대상 라우트가 남긴 한국어 안내를 그대로 전달한다. 없으면 기본 문구. */
async function targetError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return fallback;
  try {
    const parsed: unknown = JSON.parse(text);
    const error = (parsed as { error?: unknown } | null)?.error;
    if (typeof error === "string" && error.trim()) return error.trim();
  } catch {
    // JSON 이 아니면(오류 HTML 등) 그대로 보여 줄 것이 못 된다.
  }
  return fallback;
}

/**
 * 사이트 안의 라우트로 한 번 보내고, 화면이 쓸 응답으로 바꾼다.
 * 성공이면 `{ ok:true }` — 대상의 본문 모양은 라우트마다 달라 읽지 않는다.
 */
export async function forwardToSite(opts: {
  method: "DELETE" | "PATCH";
  path: string;
  cookie: string;
  body?: Record<string, unknown>;
  failed: string;
}): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetch(`${agentOrigin()}${opts.path}`, {
      method: opts.method,
      headers: {
        // 요청자의 쿠키를 그대로 — 권한은 대상 라우트와 proxy 가 판단한다.
        cookie: opts.cookie,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
      // 세션이 풀렸을 때 로그인 화면으로의 이동을 성공으로 오해하지 않는다.
      redirect: "manual",
      signal: timeoutSignal(),
    });
  } catch {
    return NextResponse.json({ error: opts.failed }, { status: 502 });
  }

  if (!res.ok) {
    const error = await targetError(res, opts.failed);
    // 대상의 5xx 를 그대로 물려받으면 **우리 라우트가** 500 으로 로그에 남는다.
    // 그건 우리 쪽 장애가 아니라 상류 응답 문제다 — 502 로 바꿔 내보낸다(사용자가 보는 문구는 그대로).
    // 3xx(로그인 화면으로 보내기)도 성공이 아니다 → 502.
    const status = res.status >= 500 ? 502 : res.status >= 400 ? res.status : 502;
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ ok: true });
}
