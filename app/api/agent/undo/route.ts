// 되돌리기. 에이전트에게는 삭제 도구가 없다 — 추가 시점에 서버가 기록한 서술자만 되돌린다(스펙 §8).
//
// 이 라우트가 "확인 없이 바로 실행하고 되돌리기를 준다"는 약속의 유일한 구현이다.
// 그래서 **클라이언트는 경로를 보내지 않는다.** {resource, id} 만 받고 지울 주소는 서버가 만든다.
// 경로를 받아 주면 화이트리스트가 무의미해지고 임의 DELETE 가 열린다.
import { NextRequest, NextResponse } from "next/server";
import { agentOrigin } from "@/lib/agent/origin";
import { findResource } from "@/lib/agent/registry";
import { RESOURCES } from "@/lib/agent/resources";

export const runtime = "nodejs";

/** 되돌릴 수 없는 요청은 이유를 나누지 않는다(없는 키인지 create 가 없는지 알려 줄 이유가 없다). */
const CANNOT_UNDO = "그건 되돌릴 수 없어요.";
const UNDO_FAILED = "되돌리지 못했어요.";
const HTTP_TIMEOUT_MS = 10_000;

/** id 는 경로 조각이 된다. cuid 밖의 글자(`/` `..` `?`)가 섞이면 클라이언트가 DELETE 목적지를 고르게 된다. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(HTTP_TIMEOUT_MS)
    : undefined;
}

/** 대상 라우트가 남긴 한국어 안내를 그대로 전달한다. 없으면 기본 문구. */
async function targetError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return UNDO_FAILED;
  try {
    const parsed: unknown = JSON.parse(text);
    const error = (parsed as { error?: unknown } | null)?.error;
    if (typeof error === "string" && error.trim()) return error.trim();
  } catch {
    // JSON 이 아니면(오류 HTML 등) 그대로 보여 줄 것이 못 된다.
  }
  return UNDO_FAILED;
}

export async function POST(req: NextRequest) {
  const raw: unknown = await req.json().catch(() => null);
  const body = (raw && typeof raw === "object" ? raw : {}) as { resource?: unknown; id?: unknown };
  const key = typeof body.resource === "string" ? body.resource.trim() : "";
  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!key || !ID_RE.test(id)) {
    return NextResponse.json({ error: CANNOT_UNDO }, { status: 400 });
  }

  // 화이트리스트. undoApi 가 없는 리소스(아기·가족)는 되돌릴 것도 없다.
  const undoApi = findResource(key, RESOURCES)?.create?.undoApi;
  if (!undoApi) {
    return NextResponse.json({ error: CANNOT_UNDO }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${agentOrigin()}${undoApi(id)}`, {
      method: "DELETE",
      // 요청자의 쿠키를 그대로 — 지울 권한은 대상 라우트와 middleware 가 판단한다.
      headers: { cookie: req.headers.get("cookie") ?? "" },
      // 세션이 풀렸을 때 로그인 화면으로의 이동을 성공으로 오해하지 않는다.
      redirect: "manual",
      signal: timeoutSignal(),
    });
  } catch {
    return NextResponse.json({ error: UNDO_FAILED }, { status: 502 });
  }

  if (!res.ok) {
    const error = await targetError(res);
    // 대상의 5xx 를 그대로 물려받으면 **우리 라우트가** 500 으로 로그에 남는다.
    // 이미 지운 것을 또 되돌리면 대상이 P2025 로 500 을 내는데, 그건 우리 쪽 장애가 아니라
    // 상류 응답 문제다 — 502 로 바꿔 내보낸다(사용자가 보는 문구는 그대로).
    const status = res.status >= 500 ? 502 : res.status >= 400 ? res.status : 502;
    return NextResponse.json({ error }, { status });
  }

  // 여기까지 오면 지워졌다. 본문 모양은 라우트마다 달라 읽지 않는다.
  return NextResponse.json({ ok: true });
}
