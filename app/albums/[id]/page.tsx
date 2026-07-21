import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AlbumDetailClient } from "./album-detail-client";

export const dynamic = "force-dynamic";

export default async function AlbumDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const album = await prisma.album.findUnique({
    where: { id },
    include: { photos: { orderBy: { sortOrder: "asc" } } },
  });

  if (!album) notFound();

  return <AlbumDetailClient initialAlbum={album} />;
}
