import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Card, Tag, Avatar } from "@/components/ui";
import {
  kDate,
  kDateShort,
  kTime,
  dday,
  startOfDay,
  pregnancyProgress,
  weekLabel,
  daysSinceBirth,
} from "@/lib/date";
import { kindMeta } from "@/app/baby/baby-meta";
import { BabyHomeInvite } from "@/app/baby/baby-home-invite";
import { getSiteConfig } from "@/lib/site";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

// 홈에는 `generateMetadata` 를 두지 않는다. `title.template` 은 **자식 구간**에만 붙어서,
// 루트와 같은 구간인 이 파일에 제목을 주면 ` · 포동` 이 안 붙고 "홈" 한 글자가 된다.
// 루트 레이아웃의 기본값(`포동 · 우리 가족 공간`)이 홈의 제목으로 알맞다.

/** 마크다운 본문에서 홈 카드용 한 줄: 이미지 문법 제거, 첫 비어있지 않은 줄, 서식 접두 제거 */
function firstLine(md: string): string {
  const line = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s]+/, "").trim())
    .find((l) => l.length > 0);
  return line ?? "사진을 남겼어요 📷";
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "늦은 밤이에요";
  if (h < 11) return "좋은 아침이에요";
  if (h < 14) return "점심 맛있게 드세요";
  if (h < 18) return "나른한 오후네요";
  if (h < 22) return "편안한 저녁이에요";
  return "오늘도 수고했어요";
}

async function getData() {
  const start = startOfDay(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [
    members,
    todayTodos,
    events,
    annis,
    albums,
    photos,
    posts,
    shopping,
    plan,
    baby,
  ] = await Promise.all([
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.todo.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: [{ done: "asc" }, { sortOrder: "asc" }],
      include: { member: true },
    }),
    prisma.calendarEvent.findMany({
      where: { start: { gte: start } },
      orderBy: { start: "asc" },
      take: 4,
    }),
    prisma.anniversary.findMany(),
    prisma.album.findMany({
      orderBy: { updatedAt: "desc" },
      take: 3,
      include: { _count: { select: { photos: true } } },
    }),
    prisma.photo.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.boardPost.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 3,
      include: { author: true },
    }),
    prisma.shoppingItem.findMany({
      where: { done: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.plan.findFirst({
      where: { startDate: { gte: start } },
      orderBy: { startDate: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    // `showOnHome` 으로 거르지 않는다 — 꺼져 있는 경우에도 "홈에서도 볼까요?" 한 줄을
    // 띄우려면 아기가 있는지부터 알아야 한다(기본값이 false 라 대개 꺼져 있다).
    prisma.baby
      .findFirst({
        orderBy: { createdAt: "desc" },
        include: {
          entries: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            take: 1,
            include: { author: true },
          },
        },
      })
      .catch(() => null),
  ]);

  const upcomingAnnis = annis
    .map((a) => ({ ...a, d: dday(a.date, { recurring: a.recurring }) }))
    .sort((a, b) => a.d.days - b.d.days)
    .slice(0, 4);

  return {
    members,
    todayTodos,
    events,
    upcomingAnnis,
    albums,
    photos,
    posts,
    shopping,
    plan,
    baby,
  };
}

/**
 * 아직 아무것도 없는 칸들을 한 줄로 모은다.
 *
 * 빈 카드도 가득 찬 카드와 같은 높이를 차지했다 — 폰 홈 2,093px 중 세 카드가
 * "없어요" 한 문장을 담으려고 450px 를 썼다. 없는 것은 자리를 덜 차지해야 하고,
 * 그래도 초대는 남긴다(DESIGN.md §8 "빈 화면은 초대다").
 */
function EmptyRow({
  slots,
}: {
  slots: { href: string; emoji: string; label: string }[];
}) {
  // 칩은 왼쪽에 붙여 둔다 — 오른쪽 끝으로 보내면 우하단 `물어보기` 가 마지막 칩을 덮는다.
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <p className="shrink-0 text-sm text-ink-soft">여기도 채워볼까요?</p>
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex h-10 items-center gap-1.5 rounded-full bg-sunken px-3.5 text-sm font-medium text-ink-soft transition hover:bg-primary-soft hover:text-primary-ink"
          >
            <span>{s.emoji}</span>
            {s.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** 카드가 하나면 한 열, 둘이면 두 열까지, 셋부터 세 열. 클래스는 통째로 적는다(Tailwind 가 스캔한다). */
function gridCols(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

function DashCard({
  href,
  emoji,
  title,
  action,
  className,
  children,
}: {
  href: string;
  emoji: string;
  title: string;
  action?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // 머리줄은 **연분홍 한 가지로** 채운다(DESIGN.md "홈의 칸 머리줄").
    // 9/21 에 머리줄을 칸마다 다른 분류색으로 칠했더니(흰 판만 쌓여 보이던 것을 풀려고)
    // 홈 본문이 무지개가 됐다 — 히어로 아래 파스텔 면적 중 분홍이 19%, 아기 화면은 98%.
    // 일곱 머리줄이 히어로와 겨루고, 그 색들은 화면 어디에도 다시 안 나와 정보도 아니었다.
    // 흰 바탕 위의 판은 그대로 뜬다(흰 판과 ΔE 12.4 — 예전 파스텔과 같은 만큼).
    // 어느 칸인지는 이모지와 제목이 말한다. `flush` 로 여백을 없애고 줄마다 직접 준다.
    <Card flush className={cn("flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between bg-primary-soft px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{emoji}</span>
          <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        </div>
        {/* -my-2 로 자리는 그대로 두고 누를 수 있는 높이만 키운다 — 16px 짜리 글자
            링크는 폰에서 빗나가기 쉽다. */}
        <Link
          href={href}
          className="-my-3 flex items-center gap-0.5 py-3 pl-3 text-xs font-semibold text-ink-faint transition hover:text-primary"
        >
          {action ?? "전체보기"}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="flex-1 px-5 pb-5 pt-4">{children}</div>
    </Card>
  );
}

export default async function HomePage() {
  const {
    members,
    todayTodos,
    events,
    upcomingAnnis,
    photos,
    posts,
    shopping,
    plan,
    baby,
  } = await getData();
  const site = await getSiteConfig();

  const doneCount = todayTodos.filter((t) => t.done).length;

  // 아기 카드(한 줄 전체)를 뺀, 나란히 설 수 있는 카드 수.
  const sideBySide = [
    todayTodos.length > 0,
    events.length > 0,
    shopping.length > 0,
    upcomingAnnis.length > 0,
    photos.length > 0,
    posts.length > 0,
    !!plan,
  ].filter(Boolean).length;

  // 비어 있는 칸은 카드 대신 아래 한 줄로 모인다.
  const empty: { href: string; emoji: string; label: string }[] = [];
  if (todayTodos.length === 0)
    empty.push({ href: "/todos", emoji: "✅", label: "할일" });
  if (events.length === 0)
    empty.push({ href: "/calendar", emoji: "📅", label: "일정" });
  if (shopping.length === 0)
    empty.push({ href: "/shopping", emoji: "🛒", label: "장보기" });
  if (upcomingAnnis.length === 0)
    empty.push({ href: "/anniversaries", emoji: "🎉", label: "기념일" });
  if (photos.length === 0)
    empty.push({ href: "/albums", emoji: "📸", label: "사진" });
  if (posts.length === 0)
    empty.push({ href: "/board", emoji: "💬", label: "한마디" });
  if (!plan) empty.push({ href: "/plans", emoji: "🗺️", label: "계획" });

  return (
    <div className="flex flex-col gap-6">
      {/* ── 히어로 ──
          사진은 글자 **옆에** 놓는다. 예전엔 `absolute -right-4 -top-4` 라서
          폰(390px)에서 인사말 두 줄째를 통째로 덮었다 — 실제 배포본에서 그랬다.
          나란히 놓으면 사진이 커지든 글자가 길어지든 겹칠 자리가 없다. */}
      <section className="on-chrome flex items-start gap-4 rounded-xl bg-gradient-to-br from-chrome via-chrome to-peach-soft p-6 sm:gap-8 sm:p-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="font-num text-sm font-semibold text-ink-soft">
            {kDate(new Date())}
          </p>
          {/* 제목의 한 단어만 색칠하지 않는다 — 강조가 흩어지면 아무것도 강조되지 않는다. */}
          <h1 className="font-display text-[1.75rem] font-bold leading-[1.25] text-chrome-ink sm:text-4xl">
            <span className="block break-keep">{greeting()},</span>
            <span className="block break-keep">{site.siteName} 가족</span>
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-chrome-faint">
            {site.heroSubtitle}
          </p>
          {/* 구성원이 없으면 "가족 0명" 만 덩그러니 남는다. 추가할 화면도 없으니 줄째로 뺀다. */}
          {members.length > 0 && (
            <div className="mt-1 flex items-center gap-2">
              {members.map((m) => (
                <Avatar
                  key={m.id}
                  emoji={m.emoji}
                  color={m.color}
                  name={m.name}
                  size="sm"
                />
              ))}
            </div>
          )}
        </div>
        {site.heroImageUrl ? (
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md sm:h-28 sm:w-28">
            <img
              src={site.heroImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          /* 사진이 없으면 빈 네모를 그리지 않는다 — 덜 만든 화면처럼 보인다.
             이모지만 크게, 판 없이 둔다. */
          <span aria-hidden className="shrink-0 text-5xl leading-none sm:text-6xl">
            {site.heroEmoji}
          </span>
        )}
      </section>

      {/* 아기가 있는데 홈에 안 보이는 경우 — 기본값이 false 라 대개 그렇다.
          "지금 이 집에서 가장 중요한 숫자" 가 아무도 본 적 없는 스위치 때문에
          숨어 있지 않게, 한 번 눌러 켤 수 있는 줄을 둔다. */}
      {baby && !baby.showOnHome && (
        <BabyHomeInvite
          id={baby.id}
          emoji={baby.emoji}
          nickname={baby.nickname}
          summary={
            baby.birthDate
              ? `태어난 지 ${daysSinceBirth(baby.birthDate)}일`
              : weekLabel(pregnancyProgress(baby.dueDate))
          }
        />
      )}

      {/* ── 대시보드 그리드 ──
          열 수는 **나란히 설 카드 수**를 따른다. 늘 3열이면 카드가 하나뿐인 날(운영이 대개
          그렇다 — 계획 하나)에 그 카드가 데스크톱 폭의 3분의 1에 붙고 나머지가 빈다.
          아기 카드는 언제나 한 줄을 통째로 쓰므로 세지 않는다.
          "한 줄 전체" 는 `col-span-full` 로 쓴다 — `col-span-2` 를 1열 격자에 두면
          보이지 않는 열이 하나 더 생긴다. */}
      <div className={cn("grid gap-4", gridCols(sideBySide))}>
        {/* 아기 (홈 표시가 켜진 경우만) */}
        {baby?.showOnHome &&
          (() => {
            const born = !!baby.birthDate;
            const p = pregnancyProgress(baby.dueDate);
            const latest = baby.entries[0];
            return (
              <DashCard
                href="/baby"
                emoji={baby.emoji}
                title={baby.nickname}
                action="일기 보기"
                className="col-span-full"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                  <div className="flex items-baseline gap-3">
                    {born && (
                      <Tag color={baby.color} className="font-num">
                        태어난 지
                      </Tag>
                    )}
                    {/* `font-num`(고딕) 이 아니라 `font-display`(주아). 같은 "8주 2일" 인데
                        `/baby` 히어로는 주아 60px, 여기 홈 카드는 고딕 30px 이라 **사이트의
                        간판 숫자가 두 글꼴로 갈라져 있었다.** 30px 은 제목 글꼴 하한(18px)
                        위라 주아가 뭉치지 않는다. 자릿수 정렬(tnum)은 한 줄짜리라 필요 없다. */}
                    <span className="font-display text-3xl font-bold leading-none text-ink">
                      {born
                        ? `${daysSinceBirth(baby.birthDate!)}일`
                        : weekLabel(p)}
                    </span>
                    {!born && (
                      <Tag color={baby.color} className="font-num">
                        출산 {p.dueLabel}
                      </Tag>
                    )}
                  </div>
                  {latest ? (
                    <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                      <span className="mr-1">
                        {kindMeta(latest.kind).emoji}
                      </span>
                      {latest.author && (
                        <span className="mr-1 font-semibold text-ink">
                          {latest.author.name}
                        </span>
                      )}
                      {firstLine(latest.content)}
                    </p>
                  ) : (
                    <p className="text-sm text-ink-faint">
                      아직 기록이 없어요. 첫 이야기를 남겨볼까요?
                    </p>
                  )}
                </div>
              </DashCard>
            );
          })()}

        {/* 오늘 할일 */}
        {todayTodos.length > 0 && (
          <DashCard href="/todos" emoji="✅" title="오늘 할일">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-rose transition-all"
                    style={{
                      width: `${(doneCount / todayTodos.length) * 100}%`,
                    }}
                  />
                </div>
                <span className="font-num shrink-0">
                  {doneCount}/{todayTodos.length}
                </span>
              </div>
              {todayTodos.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.625rem] text-ink",
                      t.done ? "bg-rose" : "border-2 border-control",
                    )}
                  >
                    {t.done && "✓"}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      t.done ? "text-ink-faint line-through" : "text-ink",
                    )}
                  >
                    {t.title}
                  </span>
                  {t.dueTime && (
                    <span className="font-num ml-auto shrink-0 text-xs text-ink-faint">
                      {t.dueTime}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </DashCard>
        )}

        {/* 다가오는 일정 */}
        {events.length > 0 && (
          <DashCard
            href="/calendar"
            emoji="📅"
            title="다가오는 일정"
          >
            <div className="flex flex-col gap-2.5">
              {events.map((e) => {
                const pal = palette(e.color);
                return (
                  <div key={e.id} className="flex items-center gap-3">
                    <span
                      className={cn("h-8 w-1 shrink-0 rounded-full", pal.dot)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {e.title}
                      </p>
                      <p className="font-num text-xs text-ink-faint">
                        {kDateShort(e.start)}
                        {!e.allDay && ` ${kTime(e.start)}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </DashCard>
        )}

        {/* 장보기 — 매일 쓰는 것이 위로 */}
        {shopping.length > 0 && (
          <DashCard
            href="/shopping"
            emoji="🛒"
            title="장보기"
            action={`${shopping.length}개 남음`}
          >
            <div className="flex flex-col gap-2">
              {shopping.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      palette(s.category).dot,
                    )}
                  />
                  <span className="truncate text-ink">{s.name}</span>
                  {s.quantity && (
                    <span className="ml-auto shrink-0 text-xs text-ink-faint">
                      {s.quantity}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </DashCard>
        )}

        {/* 다가오는 기념일 */}
        {upcomingAnnis.length > 0 && (
          <DashCard
            href="/anniversaries"
            emoji="🎉"
            title="다가오는 기념일"
          >
            <div className="flex flex-col gap-2.5">
              {upcomingAnnis.map((a) => {
                const pal = palette(a.color);
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-base",
                        pal.soft,
                      )}
                    >
                      {a.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {a.title}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {kDateShort(a.d.nextDate)}
                      </p>
                    </div>
                    <Tag color={a.color} className="font-num shrink-0">
                      {a.d.label}
                    </Tag>
                  </div>
                );
              })}
            </div>
          </DashCard>
        )}

        {/* 최근 사진 — 가로 스크롤은 데스크톱에서 여섯째 장이 잘렸다.
            폭에 맞춰 줄어드는 모자이크로 두면 어느 폭에서도 다 보인다.
            lg:order-first: 넓은 카드(2칸)가 앞서야 좁은 카드가 뒤를 채워 3열이 꼭 맞는다.
            폰은 한 줄이라 순서가 곧 중요도 — 거기서는 장보기·할일이 먼저다. */}
        {photos.length > 0 && (
          <DashCard
            href="/albums"
            emoji="📸"
            title="최근 사진"
            className="sm:col-span-full lg:col-span-1"
          >
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:grid-cols-3">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="relative aspect-square overflow-hidden rounded-md bg-sunken ring-1 ring-line"
                >
                  <img
                    src={p.url}
                    alt={p.caption ?? "사진"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </DashCard>
        )}

        {/* 가족 게시판 */}
        {posts.length > 0 && (
          <DashCard
            href="/board"
            emoji="💬"
            title="가족 게시판"
            className="sm:col-span-full lg:col-span-1"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {posts.map((p) => {
                const pal = palette(p.color);
                return (
                  // `min-w-0` 가 필요하다 — 격자 칸의 기본 `min-width: auto` 는 "내용의 최소 너비"라,
                  // 띄어쓰기 없는 긴 단어 하나가 칸을 통째로 벌린다(61자짜리 영단어로 재 보니
                  // 316px 칸 안에 397px 카드가 들어가 오른쪽이 잘렸다). `overflow-wrap: break-word`
                  // 는 **최소 너비를 줄여 주지 않아서** 이걸 못 막는다. 한글과 주소는 멀쩡했다.
                  <div key={p.id} className={cn("min-w-0 rounded-md p-3", pal.soft)}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span>{p.emoji}</span>
                      {p.author && (
                        <span className="text-xs font-semibold text-ink-soft">
                          {p.author.name}
                        </span>
                      )}
                      {p.pinned && <span className="text-xs">📌</span>}
                    </div>
                    <p className="line-clamp-2 text-sm text-ink">{p.content}</p>
                  </div>
                );
              })}
            </div>
          </DashCard>
        )}

        {/* 다가오는 계획 */}
        {plan && (
          <DashCard href="/plans" emoji="🗺️" title="다가오는 계획">
            <Link href={`/plans/${plan.id}`} className="block">
              <div
                className={cn(
                  "rounded-md bg-gradient-to-br p-4",
                  palette(plan.color).gradient,
                )}
              >
                <div className="mb-2 text-3xl">{plan.emoji}</div>
                <p className="font-bold text-ink">{plan.title}</p>
                {plan.startDate && (
                  <p className="font-num mt-0.5 text-xs text-ink-soft">
                    {kDateShort(plan.startDate)}
                    {plan.endDate && ` ~ ${kDateShort(plan.endDate)}`}
                  </p>
                )}
                <Tag color={plan.color} className="mt-2">
                  일정 {plan._count.items}개
                </Tag>
              </div>
            </Link>
          </DashCard>
        )}
      </div>

      {empty.length > 0 && <EmptyRow slots={empty} />}
    </div>
  );
}
