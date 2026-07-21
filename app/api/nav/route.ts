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

  const row = await prisma.navItem.upsert({
    where: { href },
    update: { emoji, label, description, sortOrder: idx },
    create: { href, emoji, label, description, sortOrder: idx },
  });
  return NextResponse.json(row);
}
