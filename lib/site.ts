import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { NAV as DEFAULT_NAV, type NavItem } from "@/lib/nav";

// ─────────────────────────────────────────────────────────────
// 사이트 설정 로더. DB 값이 없으면 기본값으로 폴백 →
// 시드하지 않은 배포 환경에서도 안전하게 동작.
// ─────────────────────────────────────────────────────────────

export interface SiteConfigData {
  siteName: string;
  tagline: string;
  brandEmoji: string;
  brandImageUrl: string | null;
  heroSubtitle: string;
  heroEmoji: string;
  heroImageUrl: string | null;
}

export const SITE_DEFAULTS: SiteConfigData = {
  siteName: "포동",
  tagline: "우리 가족 공간",
  brandEmoji: "🏡",
  brandImageUrl: null,
  heroSubtitle: "오늘도 우리 가족의 소중한 하루를 함께 채워봐요.",
  heroEmoji: "🏡",
  heroImageUrl: null,
};

// ── 한 요청에 한 번만 읽는다 (`cache`) ──
// 화면 하나를 열 때 SiteConfig·NavItem 을 **여러 번** 읽고 있었다: 루트 레이아웃 본문,
// 루트 `generateMetadata`, 화면마다의 `generateMetadata`(`pageTitle` → `getNav`), 그리고
// 홈처럼 페이지가 `getSiteConfig` 를 또 부르는 곳. 함수가 미국 동부(iad1)에서 돌던 때는
// 그 한 번 한 번이 싱가포르 DB 까지 태평양을 건넜다(DEPLOY.md "함수 지역").
// React `cache` 로 감싸 **요청 하나에 한 번**만 읽는다. 기억은 요청 안에서만 가므로
// `/admin` 에서 저장한 값은 다음 요청(=`router.refresh()`)에 그대로 보인다.
// React 렌더 밖(라우트 핸들러·`manifest.ts`·vitest)에서는 기억 없이 그냥 부른다.
export const getSiteConfig = cache(async (): Promise<SiteConfigData> => {
  try {
    const row = await prisma.siteConfig.findUnique({ where: { id: "main" } });
    if (!row) return SITE_DEFAULTS;
    return {
      siteName: row.siteName,
      tagline: row.tagline,
      brandEmoji: row.brandEmoji,
      brandImageUrl: row.brandImageUrl,
      heroSubtitle: row.heroSubtitle,
      heroEmoji: row.heroEmoji,
      heroImageUrl: row.heroImageUrl,
    };
  } catch {
    return SITE_DEFAULTS;
  }
});

/** 기본 메뉴에 DB 오버라이드(이모지·이름·설명)를 병합해 반환. 항상 8개, 순서 유지.
 *  `getSiteConfig` 와 같은 이유로 요청 하나에 한 번만 읽는다(`cache`). */
export const getNav = cache(async (): Promise<NavItem[]> => {
  try {
    const rows = await prisma.navItem.findMany();
    if (!rows.length) return DEFAULT_NAV;
    const byHref = new Map(rows.map((r) => [r.href, r]));
    return (
      DEFAULT_NAV.map((d) => {
        const o = byHref.get(d.href);
        if (!o) return d;
        return {
          ...d,
          emoji: o.emoji || d.emoji,
          label: o.label || d.label,
          desc: o.description || d.desc,
        };
      })
        // **순서도 가족이 정한다.** `sortOrder` 는 그동안 저장만 되고 아무도 안 읽어서,
        // 폰 탭바에 무엇이 오를지(앞 `TAB_COUNT` 개)를 바꿀 방법이 없었다 — 매일 쓰는
        // 캘린더·할일이 `더보기` 뒤에 있는데도 손댈 수가 없었다는 뜻이다.
        //
        // **전부 저장돼 있을 때만** 저장된 순서를 쓴다. DB 에 한 줄만 남아 있던 적이 있는데
        // (옛 찌꺼기) 그 하나 때문에 사진첩이 맨 앞으로 올라왔다 — **부분 데이터는 순서가
        // 아니다.** 관리자 화면은 언제나 아홉 개를 한꺼번에 저장하므로, 제대로 저장한 뒤엔
        // 이 조건이 참이 된다.
        .map((d, i) => ({ d, order: byHref.get(d.href)?.sortOrder ?? i }))
        .sort((a, b) =>
          rows.length === DEFAULT_NAV.length ? a.order - b.order : 0
        )
        .map((x) => x.d)
    );
  } catch {
    return DEFAULT_NAV;
  }
});

/**
 * 그 화면의 **브라우저 탭 제목**.
 *
 * 열 화면이 전부 `포동 · 우리 가족 공간` 한 줄이었다 — 탭도, 즐겨찾기도, 방문 기록도,
 * 뒤로가기 목록도 전부 같은 글자라 어느 게 어느 화면인지 알 수 없었다.
 *
 * 이름은 **NAV 에서 가져온다.** 가족이 `/admin` 에서 메뉴 이름을 바꾸면 탭 제목도 같이
 * 바뀐다 — 화면마다 글자를 손으로 적어 두면 그때부터 갈라진다(AGENTS.md: 목록을 따로
 * 만들지 말 것). NAV 에 없는 화면(`/admin` 등)은 `fallback` 을 쓴다.
 */
export async function pageTitle(href: string, fallback?: string): Promise<string> {
  try {
    const nav = await getNav();
    const found = nav.find((n) => n.href === href);
    if (found?.label) return found.label;
  } catch {
    /* DB 가 없어도 제목은 나와야 한다 */
  }
  return fallback ?? href;
}
