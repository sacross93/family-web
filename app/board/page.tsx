import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { BoardClient } from "./board-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/board", "게시판") };
}

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
