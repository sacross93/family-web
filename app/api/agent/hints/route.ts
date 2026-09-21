import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 포동이 빈 화면의 **추천 질문 세 줄**.
 *
 * 예전에는 코드에 박아 둔 세 문장이었다 — `"발리 사진 어디 있지?"` 는 **시드 데이터**고,
 * 우리 집에 발리 앨범이 없으면 눌러 봐야 "없어요" 가 돌아온다. 그러면 첫인상이
 * "얘는 우리 집을 모르는구나" 가 된다. 그래서 **우리 집 것**으로 만든다.
 *
 * 세 줄은 역할이 다르다. 하나씩 바꾸더라도 이 셋은 남길 것:
 *   ① 찾기   — 있는 것을 찾아 준다
 *   ② 시키기 — **물어보기만 하는 게 아니라 시킬 수도 있다**(버튼 이름이 못 하는 말)
 *   ③ 기억   — 지난 것을 기억해 준다
 *
 * 데이터가 없으면 일반적인 문장으로 떨어진다 — 빈집에서도 셋은 보여야 한다.
 */
export async function GET() {
  const [album, event] = await Promise.all([
    prisma.album.findFirst({ orderBy: { createdAt: "desc" }, select: { title: true } }),
    prisma.calendarEvent.findFirst({
      where: { start: { gte: new Date() } },
      orderBy: { start: "asc" },
      select: { title: true },
    }),
  ]);

  const find = album?.title
    ? `${album.title} 사진 보여줘`
    : "사진첩에 뭐 있는지 보여줘";
  const make = "내일 우유 사기 할일 추가해줘";
  const recall = event?.title
    ? `${event.title} 언제라고 했지?`
    : "다가오는 일정 알려줘";

  return NextResponse.json({ hints: [find, make, recall] });
}
