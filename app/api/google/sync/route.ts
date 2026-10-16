// 구글 캘린더 동기화 한 번 — 홈·캘린더 화면이 그려진 뒤 브라우저가 부른다(스펙 §5 "언제 돈다"), 관리자 카드의 [지금 맞추기].
//
// 로그인한 가족 누구나 부를 수 있다(로그인은 proxy.ts 가 지킨다). 다만 60초 제한을 넘는 `force` 는 **관리자만** —
// 화면을 열 때마다 force 로 부르면 구글을 계속 두드리게 된다. 관리자가 아니면 force 를 조용히 뺀다(400 이 아니라).
//
// 처음 맞추기 전·꺼짐·60초 안·잠금 중이면 runSync 가 구글을 부르지 않고 `{ ran:false, reason }` 을 준다. 그대로 200.
// runSync 는 던지지 않게 만들어져 있지만, 만에 하나 던져도 화면의 백그라운드 호출이 500 으로 시끄럽지 않게 잡는다.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { runSync, type SyncOutcome } from "@/lib/gcal/sync";

export const runtime = "nodejs";
// 목록(쪽당 5초) + 실행(20초에서 끊는다) + 마무리. 잠금이 30초라 그 안에서 끝나지만 함수 상한은 넉넉히.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { force?: unknown } | null;
  const force = body?.force === true && user.isAdmin;

  let out: SyncOutcome;
  try {
    out = await runSync({ force });
  } catch {
    out = { ran: true, changed: 0, error: "구글 캘린더와 맞추지 못했어요" };
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
