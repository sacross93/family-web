// 관리자 카드의 [처음 맞추기] — 사이트의 오늘 이후 일정을 구글로 보내고, 같은 날·같은 제목은 잇고, 구글 일정을 가져온다(스펙 §5-4).
//
// **관리자만, 그리고 사람이 누를 때만.** 이 라우트 말고는 처음 맞추기를 시작하는 길이 없다 — 자동으로 돌면 로컬에서
// 화면을 열기만 해도 시드의 견본 일정이 진짜 캘린더로 간다(.env 에 진짜 키가 있다). 그 전에는 자동 동기화도 쓰기 반영도 멈춰 있다.
//
// 결과는 runSync 그대로. 한 건이라도 실패하면 initialDoneAt 이 안 적혀(error 에 "한 번 더 눌러 주세요") 카드가 미리보기를
// 다시 보인다 — 이미 이은 것은 남으니 다시 누르면 남은 것만 한다.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { runSync, type SyncOutcome } from "@/lib/gcal/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });
  }

  let out: SyncOutcome;
  try {
    out = await runSync({ initial: true, force: true });
  } catch {
    out = { ran: true, changed: 0, error: "구글 캘린더와 맞추지 못했어요" };
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
