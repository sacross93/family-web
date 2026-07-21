import { prisma } from "@/lib/prisma";
import { AlbumsClient } from "./albums-client";

export const dynamic = "force-dynamic";

export default async function AlbumsPage() {
  const albums = await prisma.album.findMany({
    include: { _count: { select: { photos: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return <AlbumsClient initialAlbums={albums} />;
}
