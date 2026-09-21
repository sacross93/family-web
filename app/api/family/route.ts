import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { PALETTE_KEYS } from "@/lib/colors";

export const runtime = "nodejs";

/**
 * 가족 구성원.
 *
 * 이 라우트가 생기기 전에는 **가족을 넣을 길이 `prisma/seed.ts` 뿐이었다** — 그건 콘텐츠 표를
 * 지우고 다시 넣는 것이라 운영에서는 못 쓴다. 그래서 배포된 사이트에는 가족이 0명이었고,
 * 할일 담당자·게시판 글쓴이·아기 기록 작성자·포동이의 "나는 ___" 이 전부 고를 사람이 없었다.
 *
 * 포동이에게는 **여전히 못 만들게 한다**(`resources.ts` 의 familyMember 에 `create` 없음).
 * 사람을 만드는 일은 되돌리기 카드 한 장으로 넘길 일이 아니다.
 */
const NAME_MAX = 20;
const ROLE_MAX = 20;

function clean(v: unknown, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  return NextResponse.json(
    await prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } })
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 가족을 추가할 수 있어요." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const name = clean(body?.name, NAME_MAX);
  if (!name) return NextResponse.json({ error: "이름을 적어 주세요." }, { status: 400 });

  // 같은 이름이 둘이면 포동이가 "엄마" 를 찾을 때 누구인지 알 수 없다(memberIdByName).
  const same = await prisma.familyMember.findFirst({ where: { name }, select: { id: true } });
  if (same) return NextResponse.json({ error: `"${name}" 은(는) 이미 있어요.` }, { status: 409 });

  const color = (PALETTE_KEYS as string[]).includes(String(body?.color)) ? String(body.color) : "lavender";
  return NextResponse.json(
    await prisma.familyMember.create({
      data: {
        name,
        emoji: clean(body?.emoji, 4) || "🙂",
        color,
        role: clean(body?.role, ROLE_MAX) || null,
      },
    })
  );
}
