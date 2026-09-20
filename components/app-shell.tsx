"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { X, LogOut, Palette, Sparkles, MessageCircle } from "lucide-react";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Decorations } from "@/components/decorations";
import { AgentFab } from "@/components/agent/agent-fab";
import { BottomTabs } from "@/components/bottom-tabs";
import { ShellProvider } from "@/components/shell-context";
import { useFocusTrap } from "@/components/ui";
import { isNavActive, type NavItem } from "@/lib/nav";
import type { SiteConfigData } from "@/lib/site";
import type { SessionUser } from "@/lib/session";

/** 전역 꾸미기 편집 상태를 페이지 이동 후에도 유지하는 키. decoration-surface 도 이 이름을 안다. */
const DECOR_EDIT_KEY = "podong_edit_mode";

function NavList({
  nav,
  onNavigate,
}: {
  nav: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = isNavActive(pathname, item.href);
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
                : "text-ink-soft hover:bg-sunken hover:text-ink",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition-transform duration-200 group-hover:scale-110",
                active ? "bg-white/70 shadow-sm" : "bg-sunken",
              )}
            >
              {item.emoji}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[0.9375rem]">{item.label}</span>
              <span
                className={cn(
                  "text-[0.6875rem] font-normal",
                  active ? "opacity-70" : "text-ink-faint",
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
          <img
            src={site.brandImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          site.brandEmoji
        )}
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-2xl font-bold text-ink">
          {site.siteName}
        </span>
        <span className="mt-1 text-[0.6875rem] text-ink-faint">{site.tagline}</span>
      </span>
    </Link>
  );
}

function Footer({
  user,
  onDecorate,
}: {
  user: SessionUser | null;
  /** 이 페이지 꾸미기 토글. 관리자 + 상단 메뉴 페이지일 때만 넘어온다. */
  onDecorate?: () => void;
}) {
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
      {onDecorate && (
        <button
          type="button"
          onClick={onDecorate}
          className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-ink-soft transition hover:bg-sunken hover:text-ink"
        >
          <Sparkles className="h-4 w-4" /> 이 페이지 꾸미기
        </button>
      )}
      {user?.isAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-ink-soft transition hover:bg-sunken hover:text-ink"
        >
          <Palette className="h-4 w-4" /> 관리자
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
  agentEnabled,
}: {
  children: React.ReactNode;
  user: SessionUser | null;
  site: SiteConfigData;
  nav: NavItem[];
  /** AGENT_ENABLED. 서버에서만 읽히는 값이라 layout 이 내려준다. */
  agentEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 전역 페이지 꾸미기의 편집 상태는 여기 있다 — 토글이 사이드바·드로어·상단바 여러 곳에 있고
  // 스티커 레이어(Decorations)는 main 안에 있어, 공통 부모인 셸이 쥐어야 한 벌로 움직인다.
  const [decorating, setDecorating] = useState(false);
  // 포동이 시트. 탭바(여는 쪽)와 시트가 형제라 공통 부모인 셸이 쥔다.
  const [asking, setAsking] = useState(false);
  // 드로어가 열려 있는 동안 탭이 뒤쪽 화면으로 새어 나가지 않게.
  const drawer = useFocusTrap<HTMLElement>(open);
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

  // 드로어는 바깥 탭뿐 아니라 Esc 로도 닫힌다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 편집 상태는 페이지를 옮겨도 유지된다(스티커를 여러 페이지에 이어서 붙이는 흐름).
  useEffect(() => {
    if (localStorage.getItem(DECOR_EDIT_KEY) === "1") setDecorating(true);
  }, []);
  useEffect(() => {
    localStorage.setItem(DECOR_EDIT_KEY, decorating ? "1" : "0");
  }, [decorating]);

  // 로그인 페이지는 셸 없이 전체 화면
  if (pathname === "/login") return <>{children}</>;

  const isTopLevel = nav.some((n) => n.href === pathname);
  // 전역 꾸미기는 상단 메뉴 페이지 + 관리자일 때만(decoration-surface 의 canEdit 과 같은 조건).
  const canDecorate = isTopLevel && Boolean(user?.isAdmin);
  const decorate = canDecorate ? () => setDecorating((v) => !v) : undefined;
  const current = nav.find((n) => isNavActive(pathname, n.href));

  return (
    <ShellProvider
      value={{ titleInTopBar: !!current && current.href !== "/" }}
    >
      <div className="min-h-dvh">
        {/* ── 데스크톱 사이드바 ── */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col gap-4 border-r border-line bg-surface/80 px-4 py-6 backdrop-blur-sm lg:flex">
          <Brand site={site} />
          {/* 폰에서는 하단 탭바에 있다. 데스크톱은 탭바가 없으니 여기가 포동이의 자리. */}
          {agentEnabled && (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex items-center gap-2.5 rounded-2xl bg-primary px-3 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-hover active:scale-[0.98]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <MessageCircle className="h-4.5 w-4.5" />
              </span>
              <span className="text-[0.9375rem]">포동이에게 물어보기</span>
            </button>
          )}
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            <NavList nav={nav} />
          </div>
          <Footer user={user} onDecorate={decorate} />
        </aside>

        {/* ── 모바일 상단바 ── 페이지마다 브랜드를 되풀이하지 않고 지금 어디인지 말한다.
           메뉴는 아래 탭바로 내려갔다(엄지가 닿는 자리). */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface/85 px-4 backdrop-blur-md lg:hidden">
          {current && current.href !== "/" ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-xl">{current.emoji}</span>
              <span className="truncate font-display text-lg font-bold text-ink">
                {current.label}
              </span>
            </span>
          ) : (
            <Brand site={site} />
          )}
          {decorate && (
            <button
              type="button"
              onClick={decorate}
              aria-pressed={decorating}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition",
                decorating
                  ? "bg-primary text-white"
                  : "bg-sunken text-ink-soft hover:text-ink",
              )}
            >
              <Sparkles className="h-4 w-4" />
              {decorating ? "마치기" : "꾸미기"}
            </button>
          )}
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
            <aside
            ref={drawer}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="메뉴"
            className="absolute inset-y-0 left-0 flex w-[80%] max-w-[300px] flex-col gap-6 bg-surface px-4 py-6 shadow-lg animate-[pop-in_.25s_ease]"
          >
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
              <Footer
                user={user}
                onDecorate={
                  decorate &&
                  (() => {
                    decorate();
                    setOpen(false);
                  })
                }
              />
            </aside>
          </div>
        )}

        {/* ── 메인 콘텐츠 (+ 꾸미기 스티커 레이어) ── */}
        <main className="lg:pl-[264px]">
          {/* 아래 여백 = 탭바 + 여유. 값은 globals.css 의 --bottom-bar 한 곳에서 온다.
              떠 있는 버튼이 없어져서 그만큼(5.5rem → 2rem) 돌려받았다. */}
          <div
            className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10"
            style={{ paddingBottom: "calc(var(--bottom-bar) + 2rem)" }}
          >
            {/* 전역 페이지 꾸미기는 상단 메뉴 페이지에서만. 상세(계획/앨범)는 자체 꾸미기 사용 */}
            {isTopLevel ? (
              <Decorations
                isAdmin={Boolean(user?.isAdmin)}
                editing={decorating}
                onEditingChange={setDecorating}
              >
                {children}
              </Decorations>
            ) : (
              children
            )}
          </div>
        </main>

        <BottomTabs
        nav={nav}
        onMore={() => setOpen(true)}
        onAsk={agentEnabled ? () => setAsking(true) : undefined}
      />

        {/* 물어보기는 main 바깥에 — 안에 두면 lg:pl-[264px] 때문에 위치가 밀린다. */}
        {agentEnabled && <AgentFab open={asking} onClose={() => setAsking(false)} />}
      </div>
    </ShellProvider>
  );
}
