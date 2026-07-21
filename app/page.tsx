import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Card, Tag, Avatar, EmptyState } from "@/components/ui";
import { kDate, kDateShort, kTime, dday, startOfDay } from "@/lib/date";
import { getSiteConfig } from "@/lib/site";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

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

  const [members, todayTodos, events, annis, albums, photos, posts, shopping, plan] =
    await Promise.all([
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
      prisma.shoppingItem.findMany({ where: { done: false }, orderBy: { sortOrder: "asc" } }),
      prisma.plan.findFirst({
        where: { startDate: { gte: start } },
        orderBy: { startDate: "asc" },
        include: { _count: { select: { items: true } } },
      }),
    ]);

  const upcomingAnnis = annis
    .map((a) => ({ ...a, d: dday(a.date, { recurring: a.recurring }) }))
    .sort((a, b) => a.d.days - b.d.days)
    .slice(0, 4);

  return { members, todayTodos, events, upcomingAnnis, albums, photos, posts, shopping, plan };
}

function DashCard({
  href,
  emoji,
  title,
  color,
  action,
  className,
  children,
}: {
  href: string;
  emoji: string;
  title: string;
  color: string;
  action?: string;
  className?: string;
  children: ReactNode;
}) {
  const pal = palette(color);
  return (
    <Card className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-lg", pal.soft)}>
            {emoji}
          </span>
          <h3 className="text-base font-bold text-ink">{title}</h3>
        </div>
        <Link
          href={href}
          className="flex items-center gap-0.5 text-xs font-semibold text-ink-faint transition hover:text-primary"
        >
          {action ?? "전체보기"}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="flex-1">{children}</div>
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
  } = await getData();
  const site = await getSiteConfig();

  const doneCount = todayTodos.filter((t) => t.done).length;

  return (
    <div className="flex flex-col gap-6">
      {/* ── 히어로 ── */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-lavender-soft via-surface to-peach-soft p-6 shadow-sm sm:p-8">
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {members.map((m) => (
              <Avatar key={m.id} emoji={m.emoji} color={m.color} name={m.name} size="sm" />
            ))}
            <span className="ml-1 text-sm font-medium text-ink-soft">
              가족 {members.length}명
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary-ink">{kDate(new Date())}</p>
            <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
              {greeting()}, <span className="text-primary">{site.siteName}</span> 가족! 👋
            </h1>
            <p className="mt-2 max-w-md text-sm text-ink-soft">{site.heroSubtitle}</p>
          </div>
        </div>
        {site.heroImageUrl ? (
          <div className="pointer-events-none absolute -right-4 -top-4 h-40 w-40 overflow-hidden rounded-3xl opacity-90 sm:h-52 sm:w-52">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.heroImageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="pointer-events-none absolute -right-6 -top-6 text-[120px] opacity-20 sm:text-[160px]">
            {site.heroEmoji}
          </div>
        )}
      </section>

      {/* ── 대시보드 그리드 ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 오늘 할일 */}
        <DashCard href="/todos" emoji="✅" title="오늘 할일" color="rose">
          {todayTodos.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">오늘은 예정된 할일이 없어요. 여유로운 하루! ☕</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-rose transition-all"
                    style={{ width: `${(doneCount / todayTodos.length) * 100}%` }}
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
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white",
                      t.done ? "bg-rose" : "border-2 border-line-strong"
                    )}
                  >
                    {t.done && "✓"}
                  </span>
                  <span className={cn("truncate", t.done ? "text-ink-faint line-through" : "text-ink")}>
                    {t.title}
                  </span>
                  {t.dueTime && (
                    <span className="font-num ml-auto shrink-0 text-xs text-ink-faint">{t.dueTime}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DashCard>

        {/* 다가오는 일정 */}
        <DashCard href="/calendar" emoji="📅" title="다가오는 일정" color="peach">
          {events.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">예정된 일정이 없어요.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {events.map((e) => {
                const pal = palette(e.color);
                return (
                  <div key={e.id} className="flex items-center gap-3">
                    <span className={cn("h-8 w-1 shrink-0 rounded-full", pal.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                      <p className="font-num text-xs text-ink-faint">
                        {kDateShort(e.start)}
                        {!e.allDay && ` · ${kTime(e.start)}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DashCard>

        {/* 다가오는 기념일 */}
        <DashCard href="/anniversaries" emoji="🎉" title="다가오는 기념일" color="butter">
          {upcomingAnnis.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">등록된 기념일이 없어요.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {upcomingAnnis.map((a) => {
                const pal = palette(a.color);
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl text-base", pal.soft)}>
                      {a.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                      <p className="text-xs text-ink-faint">{kDateShort(a.d.nextDate)}</p>
                    </div>
                    <Tag color={a.color} className="font-num shrink-0">
                      {a.d.label}
                    </Tag>
                  </div>
                );
              })}
            </div>
          )}
        </DashCard>

        {/* 최근 사진 */}
        <DashCard href="/albums" emoji="📸" title="최근 사진" color="sky" className="sm:col-span-2">
          {photos.length === 0 ? (
            <EmptyState emoji="📷" title="아직 사진이 없어요" description="첫 추억을 올려볼까요?" />
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-sunken ring-1 ring-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? "사진"} className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          )}
        </DashCard>

        {/* 장보기 */}
        <DashCard href="/shopping" emoji="🛒" title="장보기" color="mint" action={`${shopping.length}개 남음`}>
          {shopping.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">장바구니가 비었어요. 완료! 🎉</p>
          ) : (
            <div className="flex flex-col gap-2">
              {shopping.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", palette(s.category).dot)} />
                  <span className="truncate text-ink">{s.name}</span>
                  {s.quantity && <span className="ml-auto shrink-0 text-xs text-ink-faint">{s.quantity}</span>}
                </div>
              ))}
            </div>
          )}
        </DashCard>

        {/* 가족 게시판 */}
        <DashCard href="/board" emoji="💬" title="가족 게시판" color="lavender" className="sm:col-span-2">
          {posts.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">첫 한마디를 남겨보세요!</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {posts.map((p) => {
                const pal = palette(p.color);
                return (
                  <div key={p.id} className={cn("rounded-2xl p-3", pal.soft)}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span>{p.emoji}</span>
                      {p.author && (
                        <span className="text-xs font-semibold text-ink-soft">{p.author.name}</span>
                      )}
                      {p.pinned && <span className="text-xs">📌</span>}
                    </div>
                    <p className="line-clamp-2 text-sm text-ink">{p.content}</p>
                  </div>
                );
              })}
            </div>
          )}
        </DashCard>

        {/* 다가오는 계획 */}
        <DashCard href="/plans" emoji="🗺️" title="다가오는 계획" color="mint">
          {!plan ? (
            <p className="py-4 text-sm text-ink-faint">아직 세운 계획이 없어요.</p>
          ) : (
            <Link href={`/plans/${plan.id}`} className="block">
              <div className={cn("rounded-2xl bg-gradient-to-br p-4", palette(plan.color).gradient)}>
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
          )}
        </DashCard>
      </div>
    </div>
  );
}
