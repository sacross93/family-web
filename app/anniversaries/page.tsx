import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { withCanEdit } from "@/lib/anniversary";
import { AnniversariesClient } from "./anniversaries-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/anniversaries", "기념일") };
}

export default async function AnniversariesPage() {
  const [anniversaries, members, user] = await Promise.all([
    prisma.anniversary.findMany({
      orderBy: { date: "asc" },
      include: { member: true, owner: true },
    }),
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
    getCurrentUser(),
  ]);

  // 고치기·지우기 버튼을 보일지는 여기서 정한다 — 라우트와 같은 판단(lib/anniversary.ts).
  return (
    <AnniversariesClient
      initialItems={anniversaries.map((a) => withCanEdit(a, user))}
      members={members}
    />
  );
}
