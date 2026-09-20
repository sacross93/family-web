import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { ShoppingClient } from "./shopping-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/shopping", "장보기") };
}

export default async function ShoppingPage() {
  const [items, members] = await Promise.all([
    prisma.shoppingItem.findMany({
      orderBy: [{ done: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      include: { addedBy: true },
    }),
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return <ShoppingClient initialItems={items} members={members} />;
}
