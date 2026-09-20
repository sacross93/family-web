import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { AnniversariesClient } from "./anniversaries-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/anniversaries", "기념일") };
}

export default async function AnniversariesPage() {
  const [anniversaries, members] = await Promise.all([
    prisma.anniversary.findMany({
      orderBy: { date: "asc" },
      include: { member: true },
    }),
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <AnniversariesClient initialItems={anniversaries} members={members} />
  );
}
