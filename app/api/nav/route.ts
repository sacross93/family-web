import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getNav } from "@/lib/site";
import { NAV as DEFAULT_NAV } from "@/lib/nav";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getNav());
}

// 메뉴 한 항목의 이모지·이름·설명 수정 (href 로 지정, 경로 자체는 고정)
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 바꿀 수 있어요." }, { status: 403 });
  }
  const body = await req.json();
  const href = String(body.href ?? "");
  const idx = DEFAULT_NAV.findIndex((d) => d.href === href);
  if (idx < 0) {
    return NextResponse.json({ error: "알 수 없는 메뉴예요." }, { status: 400 });
  }
  const def = DEFAULT_NAV[idx];
  const emoji = (typeof body.emoji === "string" && body.emoji.trim()) || def.emoji;
  const label = (typeof body.label === "string" && body.label.trim()) || def.label;
  const description =
    (typeof body.description === "string" && body.description.trim()) || def.desc;

  // **순서는 보낸 쪽이 정한다.** 예전에는 여기서 `DEFAULT_NAV` 의 인덱스를 썼다 —
  // 그래서 무슨 순서를 보내도 늘 기본값이 저장됐고, `sortOrder` 컬럼이 사실상 죽어 있었다
  // (가족이 폰 탭바에 무엇을 올릴지 바꿀 방법이 없었다는 뜻이다).
  // 범위 밖이거나 숫자가 아니면 기본 인덱스로 떨어진다.
  const asked = Number(body.sortOrder);
  const sortOrder =
    Number.isInteger(asked) && asked >= 0 && asked < DEFAULT_NAV.length ? asked : idx;

  const row = await prisma.navItem.upsert({
    where: { href },
    update: { emoji, label, description, sortOrder },
    create: { href, emoji, label, description, sortOrder },
  });
  return NextResponse.json(row);
}
