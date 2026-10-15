import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeUrl } from "@/lib/url";

/** 참고 사이트 추가 { url, title? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const url = normalizeUrl(body?.url);
  if (!url) {
    return NextResponse.json({ error: "주소를 확인해 주세요." }, { status: 400 });
  }
  const title = String(body?.title ?? "").trim();

  const last = await prisma.journeyLink.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const link = await prisma.journeyLink.create({
    data: { url, title, sortOrder },
  });
  return NextResponse.json(link);
}
