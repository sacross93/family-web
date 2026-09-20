import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { BabyClient } from "./baby-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/baby", "아기") };
}

export default async function BabyPage() {
  const [baby, members] = await Promise.all([
    prisma.baby.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        entries: {
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          include: { author: true },
        },
        checklist: { orderBy: { sortOrder: "asc" } },
        links: { orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return <BabyClient initialBaby={baby} members={members} />;
}
