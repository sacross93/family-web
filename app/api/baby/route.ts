import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PALETTE_KEYS } from "@/lib/colors";
import { dueDateFromLmp, parseDateInput } from "@/lib/date";
import { imageUrlsIn, sweepUploads } from "@/lib/uploads";

const COLORS = new Set<string>(PALETTE_KEYS);

/** 현재 아기(최신 1명). 없으면 null */
export async function GET() {
  const baby = await prisma.baby.findFirst({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(baby);
}

/** 생성: 태명 + (예정일 | 마지막 생리일) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nickname = String(body?.nickname ?? "").trim();
  if (!nickname) {
    return NextResponse.json({ error: "태명을 입력해 주세요." }, { status: 400 });
  }

  const lmp = parseDateInput(body?.lmpDate);
  const dueDate = parseDateInput(body?.dueDate) ?? (lmp ? dueDateFromLmp(lmp) : null);
  if (!dueDate) {
    return NextResponse.json(
      { error: "출산 예정일 또는 마지막 생리일을 알려 주세요." },
      { status: 400 }
    );
  }

  const baby = await prisma.baby.create({
    data: {
      nickname,
      dueDate,
      emoji: String(body?.emoji ?? "").trim() || "🌱",
      color: COLORS.has(body?.color) ? body.color : "rose",
    },
  });
  return NextResponse.json(baby);
}

/** 설정 부분 수정 (id 필수) */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: "아기를 찾을 수 없어요." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.nickname === "string" && body.nickname.trim()) data.nickname = body.nickname.trim();
  if (typeof body.emoji === "string" && body.emoji.trim()) data.emoji = body.emoji.trim();
  if (typeof body.color === "string" && COLORS.has(body.color)) data.color = body.color;
  if (typeof body.showOnHome === "boolean") data.showOnHome = body.showOnHome;

  const due = parseDateInput(body.dueDate);
  if (due) data.dueDate = due;

  if (body.birthDate === null) {
    data.birthDate = null;
  } else {
    const birth = parseDateInput(body.birthDate);
    if (birth) data.birthDate = birth;
  }

  const baby = await prisma.baby.update({ where: { id: body.id }, data });
  return NextResponse.json(baby);
}

/** 처음부터 다시 시작: 아기와 그 기록(일기·체크리스트·참고 사이트)을 모두 지운다 */
export async function DELETE() {
  // id 하나가 아니라 **전부** 지운다. 화면은 가장 최근 아기를 보여 주므로, 혹시 행이 둘이었다면
  // 하나만 지울 때 처음 화면이 아니라 예전 아기가 다시 나타난다. "처음부터" 는 하나도 안 남는 것이다.
  // 사진 주소는 **지우기 전에** 챙긴다 — 일기는 아기와 함께(cascade) 사라지고, 그 뒤에는 읽을 본문이 없다.
  const entries = await prisma.babyEntry.findMany({ select: { content: true } });
  const urls = entries.flatMap((e) => imageUrlsIn(e.content));
  // `deleteMany` — 이미 아무것도 없으면 0건을 지우고 끝난다. 두 번 눌러도 같은 결과다.
  await prisma.baby.deleteMany({});
  // 행을 지운 뒤에 훑는다: "아직 어디서 쓰이나" 를 세므로 순서가 바뀌면 하나도 못 지운다.
  await sweepUploads(urls);
  return NextResponse.json({ ok: true });
}
