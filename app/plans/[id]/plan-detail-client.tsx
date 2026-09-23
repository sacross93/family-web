"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eachDayOfInterval, format } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  CalendarRange,
  CalendarDays,
  Sparkles,
  Clock,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  Card,
  Button,
  IconButton,
  ItemActions,
  Checkbox,
  CheckCircle,
  EmptyState,
  Tag,
  Modal,
  Field,
  Input,
  Select,
  ColorPicker,
  Segmented,
  useConfirm,
  useToast,
} from "@/components/ui";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownView } from "@/components/markdown-view";
import { DecorationSurface } from "@/components/decoration-surface";
import { palette, type PaletteKey } from "@/lib/colors";
import {
  kDate,
  kDateShort,
  dday,
  toKorea,
  dayDeltaLabel,
  tzOffsetLabel,
} from "@/lib/date";
import { cn } from "@/lib/utils";
import type { PlanDetail, PlanItem, PlanChecklistItem, Plan } from "@/lib/types";
import { suggestionsFor, prepTitle, wantsTzNudge, FIRST_SUGGESTIONS } from "../plan-suggestions";

const PLAN_TYPES = ["여행", "주말", "이벤트", "기타"] as const;
const NO_DAY = "__none__";

// 추천 항목(원터치 추가)은 계획 종류에 따라 다르다 — `app/plans/plan-suggestions.ts`.

// 현지 시차 프리셋 (현지-한국, 분). DST 등으로 대략값이니 필요시 직접 조정.
const TZ_PRESETS: { label: string; min: number }[] = [
  { label: "한국과 같음", min: 0 },
  { label: "발리·싱가포르 −1", min: -60 },
  { label: "태국·베트남 −2", min: -120 },
  { label: "두바이 −5", min: -300 },
  { label: "유럽 −8", min: -480 },
  { label: "미국 동부 −13", min: -780 },
  { label: "미국 서부 −16", min: -960 },
  { label: "호주 시드니 +1", min: 60 },
];

function timeVal(t?: string | null) {
  if (t && /^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  return Number.POSITIVE_INFINITY; // 시간 없는 일정은 뒤로
}

function byTime(a: PlanItem, b: PlanItem) {
  const t = timeVal(a.time) - timeVal(b.time);
  if (t !== 0) return t;
  return a.sortOrder - b.sortOrder;
}

function toInputDate(d?: Date | string | null) {
  return d ? format(new Date(d), "yyyy-MM-dd") : "";
}

function periodLabel(plan: Plan): string | null {
  if (plan.startDate && plan.endDate)
    return `${kDateShort(plan.startDate)} ~ ${kDateShort(plan.endDate)}`;
  if (plan.startDate) return `${kDateShort(plan.startDate)}부터`;
  if (plan.endDate) return `${kDateShort(plan.endDate)}까지`;
  return null;
}

export function PlanDetailClient({ initialPlan }: { initialPlan: PlanDetail }) {
  const { say } = useToast();
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [busy, setBusy] = useState(false);
  const [decorating, setDecorating] = useState(false);

  // ── 날짜별 그룹 ──────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const it of plan.items) {
      const key = it.dayDate ? format(new Date(it.dayDate), "yyyy-MM-dd") : NO_DAY;
      const list = map.get(key);
      if (list) list.push(it);
      else map.set(key, [it]);
    }
    const entries = Array.from(map.entries()).map(([key, list]) => ({
      key,
      date: key === NO_DAY ? null : new Date(list[0].dayDate!),
      items: list.slice().sort(byTime),
    }));
    entries.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });
    return entries;
  }, [plan.items]);

  // 계획 기간 내 날짜 옵션
  const dayOptions = useMemo(() => {
    if (!plan.startDate || !plan.endDate) return [];
    const start = new Date(plan.startDate);
    const end = new Date(plan.endDate);
    if (end < start) return [];
    return eachDayOfInterval({ start, end }).map((d) => ({
      value: format(d, "yyyy-MM-dd"),
      label: kDateShort(d),
    }));
  }, [plan.startDate, plan.endDate]);
  const hasRange = dayOptions.length > 0;

  // ── 일정(항목) 폼 상태 ───────────────────────
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const [iDay, setIDay] = useState("");
  const [iTime, setITime] = useState("");
  const [iTitle, setITitle] = useState("");
  const [iNote, setINote] = useState("");
  const [iLoc, setILoc] = useState("");
  const [iCat, setICat] = useState<PaletteKey>("mint");
  const [iTz, setITz] = useState<"local" | "home">("local");

  function openAddItem(presetDay: string) {
    setEditingItem(null);
    setIDay(presetDay === NO_DAY ? "" : presetDay);
    setITime("");
    setITitle("");
    setINote("");
    setILoc("");
    setICat("mint");
    setITz("local");
    setItemOpen(true);
  }

  function openEditItem(it: PlanItem) {
    setEditingItem(it);
    setIDay(toInputDate(it.dayDate));
    setITime(it.time ?? "");
    setITitle(it.title);
    setINote(it.note ?? "");
    setILoc(it.location ?? "");
    setICat((it.category as PaletteKey) ?? "mint");
    setITz(it.tz === "home" ? "home" : "local");
    setItemOpen(true);
  }

  async function saveItem() {
    if (!iTitle.trim() || busy) return;
    setBusy(true);
    const payload = {
      dayDate: iDay || null,
      time: iTime || null,
      tz: iTz,
      title: iTitle,
      note: iNote,
      location: iLoc,
      category: iCat,
    };
    try {
      if (editingItem) {
        const res = await fetch(`/api/plan-items/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated: PlanItem = await res.json();
          setPlan((p) => ({
            ...p,
            items: p.items.map((x) => (x.id === updated.id ? updated : x)),
          }));
          setItemOpen(false);
        }
      } else {
        const res = await fetch("/api/plan-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.id, ...payload }),
        });
        if (res.ok) {
          const created: PlanItem = await res.json();
          setPlan((p) => ({ ...p, items: [...p.items, created] }));
          setItemOpen(false);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(it: PlanItem) {
    const next = !it.done;
    setPlan((p) => ({
      ...p,
      items: p.items.map((x) => (x.id === it.id ? { ...x, done: next } : x)),
    }));
    await fetch(`/api/plan-items/${it.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: next }),
    }).catch(() =>
      setPlan((p) => ({
        ...p,
        items: p.items.map((x) => (x.id === it.id ? { ...x, done: it.done } : x)),
      }))
    );
  }

  async function removeItem(id: string) {
    const prev = plan.items;
    setPlan((p) => ({ ...p, items: p.items.filter((x) => x.id !== id) }));
    const res = await fetch(`/api/plan-items/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setPlan((p) => ({ ...p, items: prev }));
      say("못 지웠어요. 잠시 후 다시 해 주세요.", "error");
    }
  }

  // 준비 진행(두 묶음 합산) — 히어로가 읽는다.
  const prepTotal = plan.checklist.length;
  const prepDone = plan.checklist.filter((c) => c.done).length;

  // ── 준비 체크리스트 (여행 전 준비 / 준비물) ───
  async function addCheck(kind: "prep" | "packing", text: string) {
    const t = text.trim();
    if (!t) return;
    const res = await fetch("/api/plan-checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id, kind, text: t }),
    });
    if (res.ok) {
      const created: PlanChecklistItem = await res.json();
      setPlan((p) => ({ ...p, checklist: [...p.checklist, created] }));
    }
  }

  async function toggleCheck(item: PlanChecklistItem) {
    const next = !item.done;
    setPlan((p) => ({
      ...p,
      checklist: p.checklist.map((c) => (c.id === item.id ? { ...c, done: next } : c)),
    }));
    await fetch(`/api/plan-checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: next }),
    }).catch(() =>
      setPlan((p) => ({
        ...p,
        checklist: p.checklist.map((c) => (c.id === item.id ? { ...c, done: item.done } : c)),
      }))
    );
  }

  async function removeCheck(id: string) {
    const prev = plan.checklist;
    setPlan((p) => ({ ...p, checklist: p.checklist.filter((c) => c.id !== id) }));
    const res = await fetch(`/api/plan-checklist/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) setPlan((p) => ({ ...p, checklist: prev }));
  }

  // ── 아이디어 메모 (자유 스크래치패드) ──────────
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoDraft, setMemoDraft] = useState(plan.memo);

  function openMemo() {
    setMemoDraft(plan.memo);
    setMemoOpen(true);
  }

  async function saveMemo() {
    if (memoDraft === plan.memo) {
      setMemoOpen(false);
      return;
    }
    const draft = memoDraft;
    setPlan((p) => ({ ...p, memo: draft }));
    setMemoOpen(false);
    await fetch(`/api/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo: draft }),
    }).catch(() => {});
  }

  // ── 계획(메타) 폼 상태 ───────────────────────
  const [planOpen, setPlanOpen] = useState(false);
  const [tzOpen, setTzOpen] = useState(false);
  const [pTitle, setPTitle] = useState(plan.title);
  const [pType, setPType] = useState<string>(plan.type);
  const [pEmoji, setPEmoji] = useState(plan.emoji);
  const [pColor, setPColor] = useState<PaletteKey>((plan.color as PaletteKey) ?? "sky");
  const [pDesc, setPDesc] = useState(plan.description ?? "");
  const [pLoc, setPLoc] = useState(plan.location ?? "");
  const [pStart, setPStart] = useState(toInputDate(plan.startDate));
  const [pEnd, setPEnd] = useState(toInputDate(plan.endDate));
  const [pTz, setPTz] = useState(plan.tzOffsetMin);

  function openEditPlan() {
    setPTitle(plan.title);
    setPType(plan.type);
    setPEmoji(plan.emoji);
    setPColor((plan.color as PaletteKey) ?? "sky");
    setPDesc(plan.description ?? "");
    setPLoc(plan.location ?? "");
    setPStart(toInputDate(plan.startDate));
    setPEnd(toInputDate(plan.endDate));
    setPTz(plan.tzOffsetMin);
    setPlanOpen(true);
  }

  function openTz() {
    setPTz(plan.tzOffsetMin);
    setTzOpen(true);
  }

  async function saveTz() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tzOffsetMin: pTz }),
      });
      if (res.ok) {
        const updated: Plan = await res.json();
        setPlan((p) => ({ ...p, ...updated }));
        setTzOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    if (!pTitle.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pTitle,
          type: pType,
          emoji: pEmoji,
          color: pColor,
          description: pDesc,
          location: pLoc,
          startDate: pStart || null,
          endDate: pEnd || null,
          tzOffsetMin: pTz,
        }),
      });
      if (res.ok) {
        const updated: Plan = await res.json();
        setPlan((p) => ({ ...p, ...updated }));
        setPlanOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function deletePlan() {
    if (busy) return;
    if (
      !(await confirm({
        title: "이 계획을 지울까요?",
        description: "담긴 일정과 준비물, 메모에 붙인 사진까지 함께 사라져요.",
      }))
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/plans");
    } else {
      setBusy(false);
    }
  }

  const period = periodLabel(plan);
  const countdown = plan.startDate ? dday(plan.startDate) : null;

  return (
    <div>
      <Link
        href="/plans"
        className="mb-2 -ml-2 inline-flex items-center gap-1.5 px-2 py-2.5 text-sm font-semibold text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> 계획 목록
      </Link>

      <DecorationSurface
        surfaceKey={`plan:${plan.id}`}
        canEdit
        variant="embedded"
        showTrigger={false}
        editing={decorating}
        onEditingChange={setDecorating}
      >
      {/* 헤더 (히어로)
          이 화면은 가족이 **실제로 가장 많이 쓰는** 상세 화면이다(발리 준비물 14개).
          예전 히어로는 파스텔 판 위에 제목·기간·장소·시차·설명을 다 쌓아 폰에서 450px 을
          차지했고, 정작 보러 온 체크리스트는 첫 화면에 한 줄도 안 보였다.
          진한 판으로 바꾸고 **준비 진행**을 여기로 올린다 — 열자마자 알고 싶은 것이 그거다. */}
      <section className="on-chrome relative mb-6 rounded-xl bg-gradient-to-br from-chrome via-chrome to-peach-soft p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-2xl">
            {plan.emoji}
          </span>
          <div className="min-w-0 flex-1 pr-10">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={plan.color}>{plan.type}</Tag>
              {countdown && countdown.days >= 0 && (
                <span className="font-num inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-bold text-chrome-ink">
                  {countdown.label}
                </span>
              )}
            </div>
            <h1 className="mt-2 break-keep font-display text-2xl font-bold leading-tight text-chrome-ink sm:text-3xl">
              {plan.title}
            </h1>
            <div className="mt-2 flex flex-col gap-1">
              {period && (
                <p className="flex items-center gap-1.5 text-sm text-chrome-faint">
                  <CalendarRange className="h-4 w-4 shrink-0" />
                  {period}
                </p>
              )}
              {plan.location && (
                <p className="flex items-center gap-1.5 text-sm text-chrome-faint">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {plan.location}
                </p>
              )}
              {plan.tzOffsetMin !== 0 && (
                <p className="flex items-center gap-1.5 text-sm text-chrome-faint">
                  <Clock className="h-4 w-4 shrink-0" />
                  현지 시차 {tzOffsetLabel(plan.tzOffsetMin)}
                </p>
              )}
            </div>
            {plan.description && (
              <div className="mt-2.5 text-sm text-chrome-faint">
                <MarkdownView>{plan.description}</MarkdownView>
              </div>
            )}
          </div>
          {/* 아이콘 넷이 제목과 같은 줄을 먹어 폰에서 글자 폭이 100px 밖에 안 남았다 —
              "이번/주말/계획" 처럼 한 줄에 한 단어, 날짜는 "7월/25일/(토)부/터" 로 넉 줄.
              `…` 하나로 모아 줄에서 빼면 제목이 제 폭을 갖는다. */}
          <ItemActions
            className="right-4 top-4 sm:right-5 sm:top-5"
            actions={[
              { label: "사진 꾸미기", icon: Sparkles, onClick: () => setDecorating(true) },
              { label: "시차 설정", icon: Clock, onClick: openTz },
              { label: "계획 수정", icon: Pencil, onClick: openEditPlan },
              { label: "계획 삭제", icon: Trash2, onClick: deletePlan, danger: true },
            ]}
          />
        </div>

        {/* 준비 진행 — 이 화면에 오는 이유. 막대의 양 끝이 곧 설명이다. */}
        {prepTotal > 0 && (
          <div className="mt-5">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-white"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={prepTotal}
              aria-valuenow={prepDone}
              aria-label="준비 진행"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((prepDone / prepTotal) * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-chrome-faint">
              <span>준비</span>
              <span className="font-num">
                {prepDone === prepTotal ? "다 챙겼어요 🎉" : `${prepTotal - prepDone}개 남음`}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 해외 여행이면 시차 설정 안내 — 여행 계획에만(주말 계획에 "해외 여행인가요?" 는 엉뚱하다).
          시차는 어느 계획이든 `…` 메뉴의 "시차 설정" 에서 바꿀 수 있다. */}
      {wantsTzNudge(plan) && (
        <button
          type="button"
          onClick={openTz}
          className="mb-6 flex w-full items-center gap-2.5 rounded-md border border-dashed border-line-strong bg-surface/60 px-4 py-3 text-left text-sm text-ink-soft transition hover:border-primary hover:text-ink"
        >
          <Clock className="h-4 w-4 shrink-0 text-ink-faint" />
          <span className="flex-1">
            해외 여행인가요? <b className="text-ink">시차를 설정</b>하면 일정에 한국시간이 함께
            표시되고, 비행 도착 시각도 계산돼요.
          </span>
          <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary-ink">
            시차 설정
          </span>
        </button>
      )}

      {/* 준비 체크리스트 (여행 전 준비 · 준비물) */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChecklistSection
          title={prepTitle(plan.type)}
          emoji="✅"
          color="mint"
          items={plan.checklist.filter((c) => c.kind === "prep")}
          suggestions={suggestionsFor(plan.type, "prep")}
          onAdd={(t) => addCheck("prep", t)}
          onToggle={toggleCheck}
          onRemove={removeCheck}
        />
        <ChecklistSection
          title="준비물"
          emoji="🎒"
          color="peach"
          items={plan.checklist.filter((c) => c.kind === "packing")}
          suggestions={suggestionsFor(plan.type, "packing")}
          onAdd={(t) => addCheck("packing", t)}
          onToggle={toggleCheck}
          onRemove={removeCheck}
        />
      </div>

      {/* 아이디어 메모 (자유 스크래치패드) */}
      <button
        type="button"
        onClick={openMemo}
        className="mb-8 flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-butter-soft text-xl">
          💡
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">아이디어 메모</p>
          <p className="text-sm text-ink-soft">
            링크·사진 막 붙여넣는 자유 메모장 — 나중에 일정 짤 때 꺼내봐요
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-ink">
          {plan.memo.trim() ? "메모 열기" : "메모 쓰기"}
        </span>
      </button>

      {/* 여정 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-ink">여정</h2>
        <Button onClick={() => openAddItem("")}>
          <Plus className="h-4 w-4" /> 일정 추가
        </Button>
      </div>

      {plan.items.length === 0 ? (
        <EmptyState
          emoji="📝"
          title="아직 일정이 없어요"
          description="첫 일정을 추가해 하루하루를 채워볼까요?"
          action={
            <Button onClick={() => openAddItem("")}>
              <Plus className="h-4 w-4" /> 일정 추가
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.key}>
              {/* 날짜줄. 가운뎃점으로 개수를 잇지 않는다(DESIGN §3) — 오른쪽 끝에 놓는다. */}
              <h3 className="mb-3 flex items-baseline gap-2 border-b border-line pb-2">
                <CalendarDays className="h-4 w-4 shrink-0 self-center text-ink-faint" />
                <span className="font-display text-lg font-bold text-ink">
                  {group.date ? kDate(group.date) : "미정"}
                </span>
                <span className="ml-auto text-xs text-ink-faint">
                  {group.items.length}개
                </span>
              </h3>

              <ol className="flex flex-col">
                {group.items.map((it, i) => {
                  const cat = palette(it.category);
                  const last = i === group.items.length - 1;
                  const showTz = plan.tzOffsetMin !== 0 && !!it.time;
                  const isHome = it.tz === "home";
                  // 현지 시각 항목만 한국시간을 병기 (한국 시각 항목은 그대로)
                  const kr =
                    showTz && !isHome && it.time
                      ? toKorea(it.time, plan.tzOffsetMin)
                      : null;
                  return (
                    <li key={it.id} className="group flex gap-3">
                      {/* 시간 (현지/한국 기준에 따라) */}
                      <div
                        className={cn(
                          "shrink-0 pt-2.5 text-right",
                          showTz ? "w-16 sm:w-20" : "w-12 sm:w-14"
                        )}
                      >
                        {it.time ? (
                          <>
                            <span className="font-num block text-sm font-semibold text-ink-soft">
                              {it.time}
                              {showTz && isHome && (
                                <span className="ml-0.5 text-[0.625rem]">🇰🇷</span>
                              )}
                            </span>
                            {kr && (
                              <span className="font-num block text-[0.625rem] leading-tight text-ink-faint">
                                🇰🇷 {kr.time}
                                {kr.dayDelta ? ` ${dayDeltaLabel(kr.dayDelta)}` : ""}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-ink-faint">종일</span>
                        )}
                      </div>

                      {/* 레일 (점 + 세로선) */}
                      <div className="relative flex w-4 shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "mt-3 h-3 w-3 shrink-0 rounded-full ring-4 ring-paper",
                            cat.dot
                          )}
                        />
                        {!last && <span className="w-0.5 flex-1 bg-line" />}
                      </div>

                      {/* 내용 카드 */}
                      <div className="flex-1 pb-4">
                        <Card className="flex items-start gap-3 p-4">
                          <Checkbox
                            checked={it.done}
                            onChange={() => toggleItem(it)}
                            color={it.category}
                            size="sm"
                            label={it.title}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={cn(
                                  "text-[0.9375rem] font-semibold leading-snug",
                                  it.done
                                    ? "text-ink-faint line-through"
                                    : "text-ink"
                                )}
                              >
                                {it.title}
                              </p>
                              {/* 연필 + 휴지통 둘이 제목과 같은 줄을 먹어 폰에서
                                  "발리로 출발하는 / 비행기" 처럼 제목이 두 줄로 끊겼다.
                                  사이트의 다른 목록과 같은 `…` 하나로 모은다. */}
                              <ItemActions
                                inline
                                quiet
                                className="shrink-0"
                                actions={[
                                  { label: "수정", icon: Pencil, onClick: () => openEditItem(it) },
                                  {
                                    label: "삭제",
                                    icon: Trash2,
                                    onClick: () => removeItem(it.id),
                                    danger: true,
                                  },
                                ]}
                              />
                            </div>
                            {it.note && (
                              <div className="mt-1 text-sm text-ink-soft">
                                <MarkdownView>{it.note}</MarkdownView>
                              </div>
                            )}
                            {it.location && (
                              <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {it.location}
                              </p>
                            )}
                          </div>
                        </Card>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
      </DecorationSurface>

      {dialog}

      {/* 일정 추가/수정 모달 */}
      <Modal
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        title={editingItem ? "일정 수정" : "일정 추가"}
        emoji="📝"
        footer={
          <>
            <Button variant="ghost" onClick={() => setItemOpen(false)}>
              취소
            </Button>
            <Button onClick={saveItem} disabled={!iTitle.trim() || busy}>
              {editingItem ? "저장" : "추가"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="내용">
            <Input
              placeholder="예: 성산일출봉 등반"
              value={iTitle}
              onChange={(e) => setITitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveItem()}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="날짜">
              {hasRange ? (
                <Select value={iDay} onChange={(e) => setIDay(e.target.value)}>
                  <option value="">미정</option>
                  {dayOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type="date"
                  value={iDay}
                  onChange={(e) => setIDay(e.target.value)}
                />
              )}
            </Field>
            <Field label="시간">
              <Input
                type="time"
                value={iTime}
                onChange={(e) => setITime(e.target.value)}
              />
            </Field>
          </div>

          {plan.tzOffsetMin !== 0 && (
            <Field
              label="시각 기준"
              hint="이 시각이 현지 시각인지 한국 시각인지 (예: 인천공항 출발은 한국)"
            >
              <Segmented
                value={iTz}
                onChange={(v) => setITz(v)}
                options={[
                  { value: "local", label: "🏝️ 현지 시각" },
                  { value: "home", label: "🇰🇷 한국 시각" },
                ]}
              />
            </Field>
          )}

          <Field label="색 분류">
            <ColorPicker value={iCat} onChange={setICat} />
          </Field>

          <Field label="장소" hint="선택 사항이에요.">
            <Input
              placeholder="예: 성산읍"
              value={iLoc}
              onChange={(e) => setILoc(e.target.value)}
            />
          </Field>

          <Field label="메모" hint="마크다운으로 꾸밀 수 있어요.">
            <MarkdownEditor
              value={iNote}
              onChange={setINote}
              placeholder="준비물이나 참고할 내용을 적어봐요."
              minHeight={100}
            />
          </Field>
        </div>
      </Modal>

      {/* 계획 수정 모달 */}
      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title="계획 수정"
        emoji={plan.emoji}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlanOpen(false)}>
              취소
            </Button>
            <Button onClick={savePlan} disabled={!pTitle.trim() || busy}>
              저장
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="제목">
            <Input
              value={pTitle}
              onChange={(e) => setPTitle(e.target.value)}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="종류">
              <Select value={pType} onChange={(e) => setPType(e.target.value)}>
                {PLAN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="이모지">
              <Input
                value={pEmoji}
                onChange={(e) => setPEmoji(e.target.value)}
                maxLength={4}
                className="text-center text-lg"
              />
            </Field>
          </div>

          <Field label="색">
            <ColorPicker value={pColor} onChange={setPColor} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="시작 날짜">
              <Input
                type="date"
                value={pStart}
                onChange={(e) => setPStart(e.target.value)}
              />
            </Field>
            <Field label="종료 날짜">
              <Input
                type="date"
                value={pEnd}
                min={pStart || undefined}
                onChange={(e) => setPEnd(e.target.value)}
              />
            </Field>
          </div>

          <Field label="장소" hint="선택 사항이에요.">
            <Input value={pLoc} onChange={(e) => setPLoc(e.target.value)} />
          </Field>

          <Field label="설명" hint="마크다운으로 꾸밀 수 있어요.">
            <MarkdownEditor value={pDesc} onChange={setPDesc} minHeight={120} />
          </Field>
        </div>
      </Modal>

      {/* 시차 설정 모달 */}
      <Modal
        open={tzOpen}
        onClose={() => setTzOpen(false)}
        title="현지 시차 설정"
        emoji="🕐"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTzOpen(false)}>
              취소
            </Button>
            <Button onClick={saveTz} disabled={busy}>
              저장
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            여행지가 한국과 몇 시간 차이 나나요? 설정하면 일정에 <b className="text-ink">한국시간</b>이
            함께 보이고, <b className="text-ink">비행 도착 시각</b>도 계산해줘요.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TZ_PRESETS.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setPTz(t.min)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  pTz === t.min
                    ? "border-primary bg-primary-soft text-primary-ink"
                    : "border-line bg-sunken text-ink-soft hover:text-ink"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-soft">직접</span>
            <Input
              type="number"
              step="0.5"
              value={pTz / 60}
              onChange={(e) => setPTz(Math.round(Number(e.target.value || 0) * 60))}
              className="w-24"
              aria-label="시차 시간"
            />
            <span className="text-sm text-ink-soft">
              시간 · <b className="text-ink">{tzOffsetLabel(pTz)}</b>
            </span>
          </div>
        </div>
      </Modal>

      {/* 아이디어 메모 팝업 (자유 스크래치패드) */}
      <Modal
        open={memoOpen}
        onClose={saveMemo}
        title="아이디어 메모"
        emoji="💡"
        size="lg"
        footer={<Button onClick={saveMemo}>완료</Button>}
      >
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-faint">
            유튜브 링크 붙여넣기 · 이미지 복사 → 붙여넣기(⌘/Ctrl+V) · 막 적어두세요.{" "}
            <b>미리보기</b>를 누르면 영상·사진이 보여요. (자동 저장)
          </p>
          <MarkdownEditor
            value={memoDraft}
            onChange={setMemoDraft}
            minHeight={320}
            placeholder="가고 싶은 곳, 유튜브 링크, 사진, 메모… 자유롭게 붙여넣어요."
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
}

/* ─────────────────────────────────────────────
   준비 체크리스트 섹션 (여행 전 준비 / 준비물)
   ───────────────────────────────────────────── */
function ChecklistSection({
  title,
  emoji,
  color,
  items,
  suggestions,
  onAdd,
  onToggle,
  onRemove,
}: {
  title: string;
  emoji: string;
  color: PaletteKey;
  items: PlanChecklistItem[];
  suggestions: string[];
  onAdd: (text: string) => void;
  onToggle: (item: PlanChecklistItem) => void;
  onRemove: (id: string) => void;
}) {
  const [text, setText] = useState("");
  // 끝낸 것과 추천은 접어 둔다 — 실제 가족 계획에서 준비물 51개 중 41개가 이미
  // 체크돼 있었는데 전부 펼쳐져 있어, 정작 여행 중에 볼 여정이 여섯 화면 아래였다.
  const [showDone, setShowDone] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const pal = palette(color);
  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  // 다 챙긴 칸은 통째로 접고 연다. 여행을 떠나고 나면 준비물은 볼 일이 없고
  // 그날 어디 가는지(여정)가 궁금하다 — 끝난 칸이 화면을 차지하면 여정이 밀린다.
  // 처음 그릴 때만 정한다: 마지막 항목을 체크했다고 칸이 눈앞에서 접히면 안 된다.
  const [open, setOpen] = useState(items.length === 0 || todo.length > 0);
  const doneCount = done.length;
  const remaining = suggestions.filter(
    (s) => !items.some((i) => i.text === s)
  );
  // 펼칠 추천: "더 보기" 를 눌렀으면 전부, 목록이 비었으면 처음 몇 개, 담은 게 있으면 없음.
  const shownSuggestions = showSuggestions
    ? remaining
    : items.length === 0
      ? remaining.slice(0, FIRST_SUGGESTIONS)
      : [];
  const hiddenCount = remaining.length - shownSuggestions.length;

  function add(t: string) {
    const v = t.trim();
    if (!v) return;
    onAdd(v);
    setText("");
  }

  return (
    <Card className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // 접었다 펴는 머리글 — 폰에서 눌리는 높이를 44px 로(DESIGN.md §9).
        className="flex min-h-11 items-center gap-2.5 text-left lg:min-h-0"
      >
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-lg", pal.soft)}>
          {emoji}
        </span>
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        {items.length > 0 && (
          <Tag color={color} className="font-num ml-auto">
            {doneCount}/{items.length}
          </Tag>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-faint transition",
            items.length === 0 && "ml-auto",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
      <>

      {items.length === 0 ? (
        <p className="text-sm text-ink-faint">
          아래에 직접 적거나, 추천을 눌러 담아보세요.
        </p>
      ) : (
        <>
          {todo.length > 0 && (
            <ul className="flex flex-col">
              {todo.map((it) => (
                <ChecklistRow
                  key={it.id}
                  item={it}
                  color={color}
                  onToggle={onToggle}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          )}

          {todo.length === 0 && (
            <p className={cn("text-sm font-semibold", pal.ink)}>다 챙겼어요! 🎉</p>
          )}

          {done.length > 0 && (
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="flex h-10 items-center gap-1.5 self-start text-xs font-semibold text-ink-faint transition hover:text-ink lg:h-7"
              >
                <Check className="h-3.5 w-3.5" />
                {/* 글자와 숫자는 한 덩어리로 — 버튼의 gap 이 사이마다 끼면 "챙긴 것  3  개" 가 된다. */}
                <span>
                  챙긴 것 <span className="font-num">{done.length}</span>개
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition", showDone && "rotate-180")} />
              </button>
              {showDone && (
                <ul className="flex flex-col opacity-60">
                  {done.map((it) => (
                    <ChecklistRow
                      key={it.id}
                      item={it}
                      color={color}
                      onToggle={onToggle}
                      onRemove={onRemove}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* 직접 추가 */}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(text)}
          placeholder="직접 추가…"
          aria-label={`${title} 직접 추가`}
          className="flex-1"
        />
        <Button variant="soft" onClick={() => add(text)} disabled={!text.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* 추천 항목 — 목록이 비었을 때를 거드는 것이라, 이미 담은 게 있으면 접어 둔다.
          비어 있을 때도 **처음 몇 개만** 펼친다: 두 칸의 칩이 스물네 개 한꺼번에 펼쳐져 있으면
          정작 여정(일정 목록)이 폰에서 화면 몇 장 아래로 밀렸다. 나머지는 "더 보기" 뒤로. */}
      {remaining.length > 0 && (
        <>
          {shownSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {shownSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onAdd(s)}
                  // 칩이 여럿 붙어 있는데 26px 이면 손가락이 옆 것을 짚는다.
                  // 폰에서만 40px, 데스크톱은 그대로.
                  className="flex h-10 items-center rounded-full border border-line bg-sunken px-3 text-xs font-medium text-ink-soft transition hover:bg-primary-soft hover:text-primary-ink lg:h-7"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              className="flex h-10 items-center gap-1.5 self-start text-xs font-semibold text-ink-faint transition hover:text-ink lg:h-7"
            >
              {/* 글자와 숫자는 한 덩어리로 — gap 은 화살표와 글자 사이에만 둔다. */}
              <span>
                추천 <span className="font-num">{hiddenCount}</span>개 더 보기
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
      </>
      )}
    </Card>
  );
}

/** 체크리스트 한 줄. 할 것과 챙긴 것이 같은 모양이어야 접었다 펴도 흔들리지 않는다.
 *
 *  줄 전체가 체크 버튼이다 — 짐 싸면서 한 손으로 쓰는 목록이라, 24px 동그라미를
 *  겨누는 것보다 "여권" 이라는 글자를 누르는 편이 쉽다(장보기와 같은 규칙). */
function ChecklistRow({
  item,
  color,
  onToggle,
  onRemove,
}: {
  item: PlanChecklistItem;
  color: PaletteKey;
  onToggle: (item: PlanChecklistItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="group flex items-center border-b border-line last:border-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.text}
        onClick={() => onToggle(item)}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pr-2 text-left active:opacity-70"
      >
        <CheckCircle checked={item.done} color={color} size="sm" />
        <span
          className={cn(
            "min-w-0 flex-1 text-[0.9375rem]",
            item.done ? "text-ink-faint line-through" : "text-ink"
          )}
        >
          {item.text}
        </span>
      </button>
      {/* 휴지통은 조용하게. `danger`(분홍 알약)로 두면 14줄짜리 준비물에서
          분홍 알약 열넷이 세로로 서서, 체크하러 온 화면이 지우기 화면처럼 보였다.
          폰에서는 늘 보이게 둔다(손 얹어야 나타나는 것을 만들지 않는다). */}
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={`${item.text} 지우기`}
        onClick={() => onRemove(item.id)}
        className="text-ink-faint transition hover:text-danger-ink lg:opacity-0 lg:group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </li>
  );
}
