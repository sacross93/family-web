import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getSiteConfig } from "@/lib/site";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getSiteConfig());
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "관리자만 바꿀 수 있어요." }, { status: 403 });
  }
  const body = await req.json();
  const data: Record<string, unknown> = {};
  // 텍스트: 비면 무시(기본값 유지)
  for (const k of ["siteName", "tagline", "brandEmoji", "heroSubtitle", "heroEmoji"] as const) {
    if (typeof body[k] === "string" && body[k].trim()) data[k] = body[k].trim();
  }
  // 이미지: 명시적으로 오면 반영(빈 문자열/null 이면 해제)
  for (const k of ["brandImageUrl", "heroImageUrl"] as const) {
    if (k in body) data[k] = body[k] ? String(body[k]) : null;
  }

  const row = await prisma.siteConfig.upsert({
    where: { id: "main" },
    update: data,
    create: { id: "main", ...data },
  });
  return NextResponse.json(row);
}
