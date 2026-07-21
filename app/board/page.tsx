import { prisma } from "@/lib/prisma";
import { BoardClient } from "./board-client";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const [posts, members] = await Promise.all([
    prisma.boardPost.findMany({
      include: { author: true },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    }),
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return <BoardClient initialPosts={posts} members={members} />;
}
