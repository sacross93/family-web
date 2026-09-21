import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** 한 줄짜리 사실만 담는다. 대화 요약이 쌓이면 기억이 아니라 로그가 된다. */
const TEXT_MAX = 200;

/** 누가 적었는가. 포동이가 짐작한 것과 가족이 말해 준 것은 무게가 다르다. */
const SOURCES = ["포동이", "가족"] as const;

/** 기억 추가 { text, by? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return NextResponse.json({ error: "기억할 내용을 적어 주세요." }, { status: 400 });
  }
  if (text.length > TEXT_MAX) {
    return NextResponse.json(
      { error: `기억은 ${TEXT_MAX}자까지예요. 한 줄로 줄여 주세요.` },
      { status: 400 }
    );
  }

  const asked = String(body?.by ?? "");
  const by = (SOURCES as readonly string[]).includes(asked) ? asked : "포동이";

  // 같은 말을 또 적지 않는다. 포동이가 매번 "예정일은 5월 3일" 을 다시 적으면
  // 기억 목록이 같은 줄로 가득 차고, 정작 다른 기억이 예산에서 밀려난다.
  const same = await prisma.agentMemory.findFirst({ where: { text }, select: { id: true } });
  if (same) return NextResponse.json({ ...same, text, by, 이미: true });

  const memory = await prisma.agentMemory.create({ data: { text, by } });
  return NextResponse.json(memory);
}
