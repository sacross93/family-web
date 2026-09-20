import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AlbumDetailClient } from "./album-detail-client";

export const dynamic = "force-dynamic";

/**
 * 탭 제목을 **그 앨범의 이름**으로. 여기가 가족이 실제로 즐겨찾기 하는 자리다
 * ("서울 나들이", "이번 주말 계획"). 목록 화면의 제목은 자식 구간으로 안 내려오므로
 * 이 파일에 따로 둔다 — 없으면 루트 기본값(`포동 · 우리 가족 공간`)이 그대로 나온다.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await prisma.album.findUnique({ where: { id }, select: { title: true } });
  return { title: found?.title?.trim() || "사진첩" };
}

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
