// 관리자 카드 「사진 저장 공간」 — 얼마나 찼는지(BlobUsage 에 기억한 값), 그리고 [다시 재기].
//
// **관리자만.** GET 은 기억한 값을 준다(6시간보다 오래됐으면 그때 한 번 다시 잰다).
// POST 는 [다시 재기] — 그래도 1분 안에 잰 값이 있으면 다시 재지 않는다. 재기(`list()`)는 Blob 의
// 고급 요청이라(Hobby 월 2천 건, 넘으면 저장소가 멈춘다) 연달아 눌러도 태우지 않게.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { storageStatus } from "@/lib/blob-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function respond(force: boolean) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 볼 수 있어요." }, { status: 403 });
  }
  const status = await storageStatus({ force });
  if (!status) {
    // 못 쟀다(표가 아직 없는 배포·저장소가 대답 안 함). "비어 있음" 으로 그리지 않게 오류로 준다.
    return NextResponse.json({ error: "저장 공간을 재지 못했어요." }, { status: 500 });
  }
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return respond(false);
}

export function POST() {
  return respond(true);
}
