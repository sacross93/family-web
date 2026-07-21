"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, LogOut, Palette } from "lucide-react";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Decorations } from "@/components/decorations";
import type { NavItem } from "@/lib/nav";
import type { SiteConfigData } from "@/lib/site";
import type { SessionUser } from "@/lib/session";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavList({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = isActive(pathname, item.href);
        const pal = palette(item.color);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-200",
              active
                ? cn(pal.soft, pal.ink, "font-semibold shadow-sm")
                : "text-ink-soft hover:bg-sunken hover:text-ink"
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition-transform duration-200 group-hover:scale-110",
                active ? "bg-white/70 shadow-sm" : "bg-sunken"
              )}
            >
              {item.emoji}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[15px]">{item.label}</span>
              <span
                className={cn(
                  "text-[11px] font-normal",
                  active ? "opacity-70" : "text-ink-faint"
                )}
              >
                {item.desc}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ site }: { site: SiteConfigData }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1 py-1">
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-lavender-soft to-peach-soft text-2xl shadow-sm">
        {site.brandImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={site.brandImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          site.brandEmoji
        )}
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-2xl font-bold text-ink">{site.siteName}</span>
        <span className="mt-1 text-[11px] text-ink-faint">{site.tagline}</span>
      </span>
    </Link>
  );
}

function Footer({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
      {user?.isAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-ink-soft transition hover:bg-sunken hover:text-ink"
        >
          <Palette className="h-4 w-4" /> 관리자 · 꾸미기
        </Link>
      )}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="truncate text-xs text-ink-faint">
          {user ? user.name || user.username : "포동"} 님
        </span>
        {user && (
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            aria-label="로그아웃"
            className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-danger-soft hover:text-danger"
          >
            <LogOut className="h-3.5 w-3.5" /> 로그아웃
          </button>
        )}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  user,
  site,
  nav,
}: {
  children: React.ReactNode;
  user: SessionUser | null;
  site: SiteConfigData;
  nav: NavItem[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // 로그인 페이지는 셸 없이 전체 화면
  if (pathname === "/login") return <>{children}</>;

  const isTopLevel = nav.some((n) => n.href === pathname);

  return (
    <div className="min-h-dvh">
      {/* ── 데스크톱 사이드바 ── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col gap-6 border-r border-line bg-surface/80 px-4 py-6 backdrop-blur-sm lg:flex">
        <Brand site={site} />
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <NavList nav={nav} />
        </div>
        <Footer user={user} />
      </aside>

      {/* ── 모바일 상단바 ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/85 px-4 py-3 backdrop-blur-md lg:hidden">
        <Brand site={site} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sunken text-ink transition hover:bg-line-strong"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* ── 모바일 드로어 ── */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[80%] max-w-[300px] flex-col gap-6 bg-surface px-4 py-6 shadow-lg animate-[pop-in_.25s_ease]">
            <div className="flex items-center justify-between">
              <Brand site={site} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sunken text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto">
              <NavList nav={nav} onNavigate={() => setOpen(false)} />
            </div>
            <Footer user={user} />
          </aside>
        </div>
      )}

      {/* ── 메인 콘텐츠 (+ 꾸미기 스티커 레이어) ── */}
      <main className="lg:pl-[264px]">
        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          {/* 전역 페이지 꾸미기는 상단 메뉴 페이지에서만. 상세(계획/앨범)는 자체 꾸미기 사용 */}
          {isTopLevel ? (
            <Decorations isAdmin={Boolean(user?.isAdmin)}>{children}</Decorations>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}
