// 관리자 화면 「연결」 카드 1/2 — ChatGPT 로그인 주소를 만들고, 마칠 때 쓸 verifier·state 를
// 봉인 쿠키(15분, 이 경로 아래에만 실림)에 넣어 둔다. 몸통은 lib/agent/connect.ts.
//
// **관리자만.** 연결은 온 가족의 ChatGPT 사용을 한 계정에 묶는 일이다.
// **`agentConfig().enabled` 는 일부러 보지 않는다** — 기능을 잠시 꺼 둔 동안에도 연결은 고칠 수
// 있어야 한다. 대화 기록(chats/*)·되돌리기(undo)가 안 거는 것과 같은 이유다(PODONGI.md). "빠졌다"고 채우지 말 것.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/current-user";
import { pendingCookieSet, startConnect, type StartResult } from "@/lib/agent/connect";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });
  }

  let started: StartResult;
  try {
    started = startConnect();
  } catch {
    // AUTH_SECRET 이 없으면 봉할 수 없다. 운영은 로그인 세션도 같은 값을 쓰므로 여기까지 오기 어렵다.
    return NextResponse.json({ error: "연결을 시작하지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 500 });
  }

  (await cookies()).set(pendingCookieSet(started.pending));
  // 주소에는 challenge·state 만 있다(verifier 는 쿠키 안에만). 그래도 남의 캐시에 남길 이유가 없다.
  return NextResponse.json({ url: started.url }, { headers: { "Cache-Control": "no-store" } });
}
