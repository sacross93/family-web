// 관리자 카드 「사진 찍은 날짜」 의 [찍은 날짜 채우기] — 이미 올린 사진의 EXIF 에서 찍은 날을 읽어 채운다.
//
// **관리자만, 그리고 누를 때만.** 화면을 여는 것으로는 아무것도 안 한다(`ui:audit` 은 로그인 말고 쓰기 0 이어야 한다).
// 한 번에 몇 장씩(BATCH) — 화면이 `next` 를 들고 끝날 때까지 다시 부른다. 그래서 함수 한 번이 길어지지 않고
// 진행이 보인다. 커서(`after` = 마지막으로 본 id)로 나아가므로, 날짜 정보가 없어 계속 비어 있는 사진이
// 있어도 같은 자리를 맴돌지 않는다. 두 번 눌러도 안전하다 — 이미 채운 것은 다시 안 고르고, 못 찾은 것은
// 또 못 찾는다.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { parseDateInput } from "@/lib/date";
import { MISSING_TAKEN_AT, readTakenDayFromUrl } from "@/lib/photo-date-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 한 번에 보는 장수. 장마다 앞 128KB 를 받는다. */
const BATCH = 6;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { after?: unknown } | null;
  const after = typeof body?.after === "string" && body.after ? body.after : null;

  const batch = await prisma.photo.findMany({
    where: { ...MISSING_TAKEN_AT, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: "asc" },
    take: BATCH,
    select: { id: true, url: true },
  });

  const today = new Date();
  const reads = await Promise.all(batch.map(async (p) => ({ id: p.id, read: await readTakenDayFromUrl(p.url, today) })));

  let found = 0;
  let none = 0;
  let failed = 0;
  for (const { id, read } of reads) {
    if (read.kind === "found") {
      // `updateMany` — 그새 누가 날짜를 넣었으면 덮지 않고, 그새 지워졌으면 0건이다(`update` 는 P2025 로 500).
      const { count } = await prisma.photo.updateMany({
        where: { id, takenAt: null },
        data: { takenAt: parseDateInput(read.day) },
      });
      if (count > 0) found += 1;
    } else if (read.kind === "failed") {
      failed += 1;
    } else {
      none += 1;
    }
  }

  const next = batch.length === BATCH ? batch[batch.length - 1].id : null;
  const remaining = next ? await prisma.photo.count({ where: { ...MISSING_TAKEN_AT, id: { gt: next } } }) : 0;
  return NextResponse.json(
    { checked: batch.length, found, none, failed, next, remaining },
    { headers: { "Cache-Control": "no-store" } },
  );
}
