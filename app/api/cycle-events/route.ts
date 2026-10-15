import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateInput, startOfDay } from "@/lib/date";
import { CYCLE_KINDS, TEST_RESULTS, type CycleKind, type TestResult } from "@/lib/cycle";

/** 주기 기록 하나 { date?, kind, result? } — 날짜를 비우면 오늘 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind as CycleKind;
  if (!CYCLE_KINDS.includes(kind)) {
    return NextResponse.json({ error: "무엇을 적을지 골라 주세요." }, { status: 400 });
  }
  const result = kind === "ovulationTest" ? (body?.result as TestResult) : null;
  if (kind === "ovulationTest" && !TEST_RESULTS.includes(result as TestResult)) {
    return NextResponse.json({ error: "테스트기 결과를 골라 주세요." }, { status: 400 });
  }
  const date = body?.date ? parseDateInput(body.date) : startOfDay(new Date());
  if (!date) {
    return NextResponse.json({ error: "날짜를 확인해 주세요." }, { status: 400 });
  }
  // 같은 날 같은 사건은 한 번만 — 포동이와 사람이 같은 날을 두 번 적어도 계산이 흔들리지 않게.
  // 결과가 다른 테스트기는 따로 남긴다(하루에 두 번 검사할 수 있다).
  const same = await prisma.cycleEvent.findFirst({ where: { date, kind, result } });
  if (same) return NextResponse.json(same);
  return NextResponse.json(await prisma.cycleEvent.create({ data: { date, kind, result } }));
}
