import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  // 허용 필드만 반영
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if ("quantity" in body) data.quantity = body.quantity?.trim() || null;
  if (typeof body.category === "string") data.category = body.category;
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.addedById === "string" || body.addedById === null)
    data.addedById = body.addedById;

  const item = await prisma.shoppingItem.update({
    where: { id },
    data,
    include: { addedBy: true },
  });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.shoppingItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
