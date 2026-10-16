// 관리자 카드 「구글 캘린더」 — 켜짐/꺼짐, 대상 캘린더, 마지막 동기화, 오류, 연결 수, 보내기 대기 수(스펙 §7).
//
// **관리자만.** 대상 캘린더 ID(= 가족의 구글 계정 주소)가 실린다. 키·토큰은 gcalStatus 가 애초에 싣지 않는다.
//
// 처음 맞추기 전이고 켜져 있으면 미리보기("보낼 N · 이을 M · 가져올 K")도 같이 준다 — [처음 맞추기]를 누르기 전에
// 무엇이 진짜 캘린더에 쓰일지 먼저 보게(스펙 §5). 미리보기는 구글 목록을 읽기만 한다.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { gcalStatus, previewInitial } from "@/lib/gcal/sync";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 볼 수 있어요." }, { status: 403 });
  }

  try {
    const status = await gcalStatus();
    const body =
      status.config === "on" && status.initialDoneAt === null
        ? { ...status, preview: await previewInitial() }
        : status;
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // 표를 못 읽었다(스키마가 아직 안 깔린 배포 등). 못 읽은 것을 "꺼짐" 으로 그리지 않게 오류로 준다.
    return NextResponse.json({ error: "동기화 상태를 읽지 못했어요." }, { status: 500 });
  }
}
