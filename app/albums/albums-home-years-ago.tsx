import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, PhotoImg } from "@/components/ui";
import { kDate, startOfDay } from "@/lib/date";
import { pickYearsAgo, yearsAgoTitle, yearsAgoWindows } from "@/lib/years-ago";

/** 한 해에서 보여 줄 사진 수. 폰은 한 줄 셋 × 두 줄, 넓으면 한 줄 여섯. */
const MAX_PHOTOS = 6;

/**
 * 사진 칸 너비(`grid-cols-3 sm:grid-cols-6`, 판 전체 폭). 2026-10-27 에 재 본 값(폭 → 그려진 CSS px):
 * 360→89 · 390→99 · 430→112 · 640→83 · 768→105 · 1024→98 · 1280→141 · 1416 이상→163.
 * 레이아웃을 바꾸면 다시 재고 고칠 것(AGENTS.md).
 */
const THUMB_SIZES =
  "(min-width: 1416px) 164px, (min-width: 1024px) calc((100vw - 436px) / 6), (min-width: 640px) calc((100vw - 140px) / 6), calc((100vw - 94px) / 3)";
/** 가장 크게 그려지는 자리 — 639px(아직 세 칸)에서 182. */
const THUMB_MAX = 182;

type Found =
  | {
      kind: "photos";
      title: string;
      photos: { id: string; url: string; caption: string | null; albumId: string; takenAt: Date | null }[];
      album: { id: string; title: string; emoji: string };
    }
  | {
      kind: "albums";
      title: string;
      albums: { id: string; title: string; emoji: string; takenOn: Date | null; cover: string | null }[];
    };

/**
 * 오늘(서버 로컬 = 서울)의 지난해들. 사진의 찍은 날이 먼저고, 하나도 없으면 앨범의 날짜(`takenOn`)로 —
 * 찍은 날이 채워지기 전(관리자 [찍은 날짜 채우기] 전)에도 비어 있지 않게.
 */
async function find(today: Date): Promise<Found | null> {
  const [oldest, albums] = await Promise.all([
    prisma.photo.aggregate({ _min: { takenAt: true } }),
    // 앨범은 수십 개라 다 읽고 고른다.
    prisma.album.findMany({
      where: { takenOn: { not: null } },
      select: {
        id: true,
        title: true,
        emoji: true,
        coverUrl: true,
        takenOn: true,
        photos: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      },
    }),
  ]);

  // 사진은 많을 수 있어 **창(지난해마다 오늘 ±3일)으로만** 읽는다. 창은 서버 로컬 자정으로 만든다 —
  // SQL 에서 월·일을 꺼내면 UTC 로 저장된 값이라 서울 자정이 전날이 된다(`lib/years-ago.ts`).
  const min = oldest._min.takenAt;
  const windows = min ? yearsAgoWindows(today, min.getFullYear()) : [];
  if (windows.length > 0) {
    const rows = await prisma.photo.findMany({
      where: { OR: windows.map((w) => ({ takenAt: { gte: w.start, lt: w.end } })) },
      select: {
        id: true,
        url: true,
        caption: true,
        albumId: true,
        takenAt: true,
        album: { select: { id: true, title: true, emoji: true } },
      },
      orderBy: [{ takenAt: "asc" }, { sortOrder: "asc" }],
    });
    const pick = pickYearsAgo(rows, (r) => r.takenAt, today);
    if (pick) {
      const photos = pick.items.slice(0, MAX_PHOTOS);
      return { kind: "photos", title: yearsAgoTitle(pick), photos, album: photos[0].album };
    }
  }

  const pick = pickYearsAgo(albums, (a) => a.takenOn, today);
  if (!pick) return null;
  return {
    kind: "albums",
    title: yearsAgoTitle(pick),
    albums: pick.items.slice(0, 3).map((a) => ({
      id: a.id,
      title: a.title,
      emoji: a.emoji,
      takenOn: a.takenOn,
      cover: a.coverUrl ?? a.photos[0]?.url ?? null,
    })),
  };
}

/**
 * 홈 「N년 전 오늘」. 지난해 오늘 찍은 사진(없으면 ±3일 「이맘때」, 그것도 없으면 그날의 앨범).
 * **아무것도 없으면 통째로 숨는다** — 빈 초대 칸을 두지 않는다(매일 뜨는 칸이 아니다).
 * 홈을 깨뜨리지 않게 못 읽으면 조용히 빠진다.
 */
export async function AlbumsHomeYearsAgo() {
  const found = await find(startOfDay(new Date())).catch(() => null);
  if (!found) return null;

  const href = `/albums/${found.kind === "photos" ? found.album.id : found.albums[0].id}`;

  return (
    // 머리줄은 홈의 다른 칸(`app/page.tsx` 의 `DashCard`)과 똑같이 연분홍 한 가지로(DESIGN.md "홈의 칸 머리줄").
    // `DashCard` 는 page.tsx 안의 함수라 가져오지 못해 모양을 옮겨 적었다 — 그쪽을 바꾸면 여기도.
    <Card flush className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between bg-primary-soft px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🕰️</span>
          <h3 className="font-display text-lg font-bold text-ink">{found.title}</h3>
        </div>
        <Link
          href={href}
          className="-my-3 flex items-center gap-0.5 py-3 pl-3 text-xs font-semibold text-ink-faint transition hover:text-primary"
        >
          앨범 보기
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="px-5 pb-5 pt-4">
        {found.kind === "photos" ? (
          <>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {found.photos.map((p) => (
                <Link
                  key={p.id}
                  href={`/albums/${p.albumId}`}
                  className="relative block aspect-square overflow-hidden rounded-md bg-sunken ring-1 ring-line"
                >
                  <PhotoImg
                    src={p.url}
                    alt={p.caption ?? "사진"}
                    maxWidth={THUMB_MAX}
                    sizes={THUMB_SIZES}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </Link>
              ))}
            </div>
            <p className="mt-3 flex min-w-0 items-baseline gap-2 text-sm text-ink-soft">
              {found.photos[0].takenAt && (
                <span className="font-num shrink-0">{kDate(found.photos[0].takenAt)}</span>
              )}
              <span className="min-w-0 truncate">
                <span className="mr-1">{found.album.emoji}</span>
                {found.album.title}
              </span>
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {found.albums.map((a) => (
              <Link key={a.id} href={`/albums/${a.id}`} className="flex min-w-0 items-center gap-3">
                {a.cover ? (
                  <span className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-sunken ring-1 ring-line">
                    {/* 판은 64px 고정이다. */}
                    <PhotoImg
                      src={a.cover}
                      alt=""
                      maxWidth={64}
                      sizes="64px"
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </span>
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sunken text-2xl">
                    {a.emoji}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {a.cover && <span className="mr-1">{a.emoji}</span>}
                    {a.title}
                  </span>
                  {a.takenOn && (
                    <span className="font-num block text-xs text-ink-faint">{kDate(a.takenOn)}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
