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
import { ToastProvider, useFocusTrap } from "@/components/ui";
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
              // 틀이 연한 로즈가 된 뒤로 **파스텔 알약이 보이지 않는다** — 분류색 soft 여섯 개가
              // 로즈 위에서 1.09~1.20:1 이라 켜져 있는지 알 수 없었다. 지금 있는 곳은 **흰 판**이
              // 되고, 분류색은 그 안의 이모지 타일로 옮긴다(흰 판 위에서는 제 색이 보인다).
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200",
              // 켜진 줄의 글자는 **분류색이 아니라 중립 잉크**다. 분류색 잉크를 쓰면 홈이
              // 라벤더라 **혼자 보라색**이 되고, 파스텔 팔레트에서 그 한 줄만 튄다.
              // 색은 옆의 이모지 타일(`pal.soft`)이 나른다 — 그건 파스텔이라 튀지 않는다.
              active
                ? "bg-surface font-semibold text-ink"
                : "text-chrome-faint hover:bg-chrome-soft hover:text-chrome-ink",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg",
                active ? pal.soft : "bg-white",
              )}
            >
              {item.emoji}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[0.9375rem]">{item.label}</span>
              <span
                className={cn(
                  "text-[0.6875rem] font-normal",
                  active ? "opacity-70" : "text-chrome-faint",
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
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-lavender-soft to-peach-soft text-2xl">
        {site.brandImageUrl ? (
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
        <span className="font-display text-2xl font-bold text-chrome-ink">
          {site.siteName}
        </span>
        <span className="mt-1.5 text-[0.6875rem] text-chrome-faint">{site.tagline}</span>
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
    <div className="mt-auto flex flex-col gap-2 border-t border-ink/15 pt-3">
      {onDecorate && (
        <button
          type="button"
          onClick={onDecorate}
          className="flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-chrome-faint transition hover:bg-chrome-soft hover:text-chrome-ink"
        >
          <Sparkles className="h-4 w-4" /> 이 페이지 꾸미기
        </button>
      )}
      {user?.isAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-chrome-faint transition hover:bg-chrome-soft hover:text-chrome-ink"
        >
          <Palette className="h-4 w-4" /> 관리자
        </Link>
      )}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="truncate text-xs text-chrome-faint">
          {user ? user.name || user.username : "포동"} 님
        </span>
        {user && (
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            aria-label="로그아웃"
            className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-chrome-faint transition hover:bg-danger-soft hover:text-danger-ink"
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

  // 페이지를 옮기면 드로어를 닫는다. **라우터가 React 바깥에서 바뀌는 것**이라
  // 효과가 맞는 도구다 — 링크마다 닫기를 붙이면 빠뜨리는 링크가 반드시 생긴다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // localStorage 는 서버에 없다 — 초기값으로 읽으면 서버가 그린 것과 어긋난다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <ShellProvider value={{ titleInTopBar: !!current && current.href !== "/" }}>
      <ToastProvider>
      <div className="min-h-dvh">
        {/* ── 데스크톱 사이드바 ── */}
        <aside className="on-chrome fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col gap-4 border-r border-ink/10 bg-chrome px-4 py-6 lg:flex">
          <Brand site={site} />
          {/* 폰에서는 하단 탭바에 있다. 데스크톱은 탭바가 없으니 여기가 포동이의 자리.
              틀이 연한 로즈가 된 뒤로는 뒤집을 이유가 없다 — primary 를 그대로 채운다(흰 글자 4.9:1). */}
          {agentEnabled && (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex items-center gap-2.5 rounded-lg bg-primary px-3 py-2.5 font-semibold text-ink transition hover:bg-primary-hover active:scale-[0.98]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
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
        <header className="on-chrome sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-ink/10 bg-chrome px-4 lg:hidden">
          {current && current.href !== "/" ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-xl">{current.emoji}</span>
              <span className="truncate font-display text-xl font-bold text-chrome-ink">
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
                  ? "bg-primary text-ink"
                  : "bg-white text-chrome-faint",
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
              className="absolute inset-0 bg-ink/25 backdrop-blur-sm"
            />
            <aside
            ref={drawer}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="메뉴"
            className="on-chrome absolute inset-y-0 left-0 flex w-[80%] max-w-[300px] flex-col gap-6 bg-chrome px-4 py-6 shadow-lg animate-[pop-in_.25s_ease]"
          >
              <div className="flex items-center justify-between">
                <Brand site={site} />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="메뉴 닫기"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-chrome-ink"
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
      </ToastProvider>
    </ShellProvider>
  );
}
