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

export async function getSiteConfig(): Promise<SiteConfigData> {
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
}

/** 기본 메뉴에 DB 오버라이드(이모지·이름·설명)를 병합해 반환. 항상 8개, 순서 유지. */
export async function getNav(): Promise<NavItem[]> {
  try {
    const rows = await prisma.navItem.findMany();
    if (!rows.length) return DEFAULT_NAV;
    const byHref = new Map(rows.map((r) => [r.href, r]));
    return DEFAULT_NAV.map((d) => {
      const o = byHref.get(d.href);
      if (!o) return d;
      return {
        ...d,
        emoji: o.emoji || d.emoji,
        label: o.label || d.label,
        desc: o.description || d.desc,
      };
    });
  } catch {
    return DEFAULT_NAV;
  }
}
