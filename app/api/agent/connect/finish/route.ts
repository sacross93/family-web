// 관리자 화면 「연결」 카드 2/2 — 붙여넣은 콜백 주소로 토큰을 받아 저장한다.
// 몸통(state 확인 → 교환 → 계정 확인 → 저장)은 lib/agent/connect.ts 의 finishConnect.
//
// **관리자만**, 그리고 시작 라우트처럼 `agentConfig().enabled` 는 일부러 보지 않는다(../route.ts).
// ⚠️ 붙여넣은 주소에는 1회용 code 가 들어 있다 — 로그에도 응답에도 되돌려 싣지 않는다.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/current-user";
import { authStatus, saveAuth } from "@/lib/agent/auth";
import { exchangeCode } from "@/lib/agent/oauth";
import {
  PENDING_COOKIE,
  finishConnect,
  pendingCookieBase,
  type FinishResult,
} from "@/lib/agent/connect";

export const runtime = "nodejs";
// 토큰 교환 HTTP 타임아웃(15초, oauth.ts) + DB 두어 번. 함수가 교환 중에 죽으면 code 만 날아가고
// 처음부터 다시 해야 한다. (app/api/agent/route.ts 의 60 이 운영에서 통하므로 30 은 안전하다.)
export const maxDuration = 30;

const STATUS: Record<FinishResult["kind"], number> = {
  ok: 200,
  bad_request: 400,
  account_changed: 409,
  upstream_error: 502,
  server_error: 500,
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { url?: unknown; allowAccountChange?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  const allowAccountChange = body?.allowAccountChange === true;

  // 지금 연결된 계정을 **교환 전에** 읽는다. 못 읽으면 여기서 멈춘다 — 아직 code 를 쓰기 전이라
  // 쿠키를 남겨 두면 다시 [연결] 만 누르면 된다. 못 읽은 것을 "없음" 으로 치면 계정 확인을
  // 건너뛰고 다른 계정으로 조용히 덮어쓸 수 있다.
  let current: Awaited<ReturnType<typeof authStatus>>;
  try {
    current = await authStatus();
  } catch {
    return NextResponse.json(
      { error: "지금은 연결 상태를 확인할 수 없어요. 잠시 뒤 다시 눌러 주세요.", restart: false },
      { status: 500 }
    );
  }

  const store = await cookies();
  const result = await finishConnect(
    { url, pending: store.get(PENDING_COOKIE)?.value, allowAccountChange, current },
    { exchange: (code, verifier) => exchangeCode(code, verifier), save: saveAuth, now: Date.now }
  );

  // code 는 한 번만 쓸 수 있다. 교환을 시도했으면(성공이든 실패든) 진행 중이던 연결은 끝났다.
  // **같은 path 로** 지운다 — path 가 다르면 브라우저는 다른 쿠키로 보고 이것을 남긴다.
  if (result.restart) store.delete(pendingCookieBase());

  if (result.kind === "ok") {
    const saved = await authStatus().catch(() => null);
    return NextResponse.json({
      ok: true,
      accountId: saved?.accountId ?? result.accountId,
      updatedAt: (saved?.updatedAt ?? new Date()).toISOString(),
    });
  }
  return NextResponse.json({ error: result.message, restart: result.restart }, { status: STATUS[result.kind] });
}
