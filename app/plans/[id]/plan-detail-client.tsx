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
  Plane,
  Film,
  Play,
} from "lucide-react";
import {
  Card,
  Button,
  IconButton,
  Checkbox,
  EmptyState,
  Tag,
  Modal,
  Field,
  Input,
  Select,
  ColorPicker,
  Segmented,
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
  toLocal,
  shiftTime,
  dayDeltaLabel,
  tzOffsetLabel,
} from "@/lib/date";
import { cn } from "@/lib/utils";
import type {
  PlanDetail,
  PlanItem,
  PlanChecklistItem,
  PlanNote,
  Plan,
} from "@/lib/types";
import { youtubeIds, firstImageUrl, stripMarkdown } from "@/lib/media";

const PLAN_TYPES = ["여행", "주말", "이벤트", "기타"] as const;
const NO_DAY = "__none__";

// 여행 계획에 흔히 필요한 추천 항목 (원터치 추가)
const PREP_SUGGESTIONS = [
  "항공권 예약",
  "숙소 예약",
  "여행자보험 가입",
  "환전 / 트래블카드",
  "유심 / 로밍",
  "렌터카 예약",
  "온라인 체크인",
  "맛집 / 장소 찾기",
  "반려동물 맡기기",
  "택배 / 우편물 정지",
];
const PACKING_SUGGESTIONS = [
  "여권 / 신분증",
  "지갑 / 카드",
  "현금",
  "휴대폰 충전기",
  "보조배터리",
  "멀티 어댑터",
  "세면도구",
  "상비약",
  "선크림",
  "옷 / 속옷",
  "우산 / 우비",
  "카메라",
  "이어폰",
  "물티슈 / 마스크",
];

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
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [busy, setBusy] = useState(false);
  const [decorating, setDecorating] = useState(false);
  const pal = palette(plan.color);

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
    if (!res.ok) setPlan((p) => ({ ...p, items: prev }));
  }

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

  // ── 아이디어 메모 ─────────────────────────────
  const [noteEditOpen, setNoteEditOpen] = useState(false);
  const [noteViewOpen, setNoteViewOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<PlanNote | null>(null);
  const [viewingNote, setViewingNote] = useState<PlanNote | null>(null);
  const [nTitle, setNTitle] = useState("");
  const [nContent, setNContent] = useState("");

  function openNoteAdd() {
    setEditingNote(null);
    setNTitle("");
    setNContent("");
    setNoteEditOpen(true);
  }
  function openNoteEdit(note: PlanNote) {
    setEditingNote(note);
    setNTitle(note.title ?? "");
    setNContent(note.content);
    setNoteViewOpen(false);
    setNoteEditOpen(true);
  }
  function openNoteView(note: PlanNote) {
    setViewingNote(note);
    setNoteViewOpen(true);
  }

  async function saveNote() {
    if ((!nTitle.trim() && !nContent.trim()) || busy) return;
    setBusy(true);
    try {
      if (editingNote) {
        const res = await fetch(`/api/plan-notes/${editingNote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nTitle, content: nContent }),
        });
        if (res.ok) {
          const u: PlanNote = await res.json();
          setPlan((p) => ({ ...p, notes: p.notes.map((n) => (n.id === u.id ? u : n)) }));
          setNoteEditOpen(false);
        }
      } else {
        const res = await fetch("/api/plan-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.id, title: nTitle, content: nContent }),
        });
        if (res.ok) {
          const c: PlanNote = await res.json();
          setPlan((p) => ({ ...p, notes: [c, ...p.notes] }));
          setNoteEditOpen(false);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeNote(id: string) {
    const prev = plan.notes;
    setPlan((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== id) }));
    setNoteViewOpen(false);
    const res = await fetch(`/api/plan-notes/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) setPlan((p) => ({ ...p, notes: prev }));
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
    if (!window.confirm("이 계획을 삭제할까요? 담긴 일정도 함께 사라져요.")) return;
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
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft transition hover:text-ink"
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
      {/* 헤더 (히어로) */}
      <Card flush className="mb-6 overflow-hidden">
        <div className={cn("bg-gradient-to-br p-5 sm:p-6", pal.gradient)}>
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface/70 text-3xl shadow-sm">
              {plan.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tag color={plan.color}>{plan.type}</Tag>
                {countdown && countdown.days >= 0 && (
                  <span className="inline-flex items-center rounded-full bg-surface/80 px-2.5 py-1 font-num text-xs font-bold text-ink">
                    {countdown.label}
                  </span>
                )}
              </div>
              <h1 className="mt-1.5 font-display text-2xl font-bold leading-tight text-ink">
                {plan.title}
              </h1>
              <div className="mt-1.5 flex flex-col gap-1">
                {period && (
                  <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                    <CalendarRange className="h-4 w-4 shrink-0 text-ink-faint" />
                    {period}
                  </p>
                )}
                {plan.location && (
                  <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                    <MapPin className="h-4 w-4 shrink-0 text-ink-faint" />
                    {plan.location}
                  </p>
                )}
                {plan.tzOffsetMin !== 0 && (
                  <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                    <Clock className="h-4 w-4 shrink-0 text-ink-faint" />
                    현지 시차 · {tzOffsetLabel(plan.tzOffsetMin)}
                  </p>
                )}
              </div>
              {plan.description && (
                <div className="mt-2.5 text-sm text-ink-soft">
                  <MarkdownView>{plan.description}</MarkdownView>
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <IconButton
                variant="surface"
                aria-label="사진 꾸미기"
                onClick={() => setDecorating(true)}
                className={decorating ? "text-primary" : undefined}
              >
                <Sparkles className="h-4 w-4" />
              </IconButton>
              <IconButton
                variant="surface"
                aria-label="시차 설정"
                onClick={openTz}
                className={plan.tzOffsetMin !== 0 ? "text-primary" : undefined}
              >
                <Clock className="h-4 w-4" />
              </IconButton>
              <IconButton
                variant="surface"
                aria-label="계획 수정"
                onClick={openEditPlan}
              >
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton
                variant="surface"
                aria-label="계획 삭제"
                onClick={deletePlan}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        </div>
      </Card>

      {/* 해외 여행이면 시차 설정 안내 */}
      {plan.tzOffsetMin === 0 && (
        <button
          type="button"
          onClick={openTz}
          className="mb-6 flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-4 py-3 text-left text-sm text-ink-soft transition hover:border-primary hover:text-ink"
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
          title="여행 전 준비"
          emoji="✅"
          color="mint"
          items={plan.checklist.filter((c) => c.kind === "prep")}
          suggestions={PREP_SUGGESTIONS}
          onAdd={(t) => addCheck("prep", t)}
          onToggle={toggleCheck}
          onRemove={removeCheck}
        />
        <ChecklistSection
          title="준비물 · 챙길 것"
          emoji="🎒"
          color="peach"
          items={plan.checklist.filter((c) => c.kind === "packing")}
          suggestions={PACKING_SUGGESTIONS}
          onAdd={(t) => addCheck("packing", t)}
          onToggle={toggleCheck}
          onRemove={removeCheck}
        />
      </div>

      {/* 시차 계산기 */}
      {plan.tzOffsetMin !== 0 && (
        <div className="mb-6">
          <TimezoneCalculator offsetMin={plan.tzOffsetMin} />
        </div>
      )}

      {/* 아이디어 메모 */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-butter-soft text-lg">
              💡
            </span>
            아이디어 메모
          </h2>
          <Button variant="soft" size="sm" onClick={openNoteAdd}>
            <Plus className="h-4 w-4" /> 메모 추가
          </Button>
        </div>

        {plan.notes.length === 0 ? (
          <button
            type="button"
            onClick={openNoteAdd}
            className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center transition hover:border-primary"
          >
            <span className="text-3xl">🔗</span>
            <span className="text-sm font-semibold text-ink">
              가고 싶은 곳·영상·사진을 모아두세요
            </span>
            <span className="text-xs text-ink-faint">
              유튜브 링크 · 이미지 붙여넣기 · 자유 메모 — 나중에 일정 짤 때 꺼내봐요
            </span>
          </button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onOpen={() => openNoteView(note)}
                onRemove={() => removeNote(note.id)}
              />
            ))}
          </div>
        )}
      </div>

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
            <section key={group.key} className="animate-fade-up">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold text-ink">
                  <CalendarDays className="h-4 w-4 text-ink-faint" />
                  {group.date ? kDate(group.date) : "미정"}
                  <span className="font-num text-sm font-semibold text-ink-faint">
                    · {group.items.length}
                  </span>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAddItem(group.key)}
                >
                  <Plus className="h-4 w-4" /> 일정
                </Button>
              </div>

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
                                <span className="ml-0.5 text-[10px]">🇰🇷</span>
                              )}
                            </span>
                            {kr && (
                              <span className="font-num block text-[10px] leading-tight text-ink-faint">
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
                            label="완료"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={cn(
                                  "text-[15px] font-semibold leading-snug",
                                  it.done
                                    ? "text-ink-faint line-through"
                                    : "text-ink"
                                )}
                              >
                                {it.title}
                              </p>
                              <div className="flex shrink-0 gap-0.5 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
                                <IconButton
                                  variant="ghost"
                                  size="sm"
                                  aria-label="일정 수정"
                                  onClick={() => openEditItem(it)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton
                                  variant="danger"
                                  size="sm"
                                  aria-label="일정 삭제"
                                  onClick={() => removeItem(it.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconButton>
                              </div>
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

      {/* 메모 보기 팝업 */}
      {viewingNote && (
        <Modal
          open={noteViewOpen}
          onClose={() => setNoteViewOpen(false)}
          title={viewingNote.title || "메모"}
          emoji="💡"
          size="lg"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => removeNote(viewingNote.id)}
                className="mr-auto hover:text-danger"
              >
                <Trash2 className="h-4 w-4" /> 삭제
              </Button>
              <Button variant="soft" onClick={() => openNoteEdit(viewingNote)}>
                <Pencil className="h-4 w-4" /> 수정
              </Button>
              <Button onClick={() => setNoteViewOpen(false)}>닫기</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {viewingNote.content.trim() && (
              <MarkdownView>{viewingNote.content}</MarkdownView>
            )}
            {youtubeIds(viewingNote.content).map((id) => (
              <div
                key={id}
                className="overflow-hidden rounded-2xl bg-ink/5"
                style={{ aspectRatio: "16 / 9" }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${id}`}
                  title="YouTube"
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* 메모 작성/수정 팝업 */}
      <Modal
        open={noteEditOpen}
        onClose={() => setNoteEditOpen(false)}
        title={editingNote ? "메모 수정" : "새 메모"}
        emoji="💡"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteEditOpen(false)}>
              취소
            </Button>
            <Button
              onClick={saveNote}
              disabled={(!nTitle.trim() && !nContent.trim()) || busy}
            >
              {editingNote ? "저장" : "추가"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="제목" hint="비워도 돼요">
            <Input
              value={nTitle}
              onChange={(e) => setNTitle(e.target.value)}
              placeholder="예: 우붓 원숭이 숲 꼭 가보기"
              autoFocus
            />
          </Field>
          <Field
            label="내용"
            hint="유튜브 링크 붙여넣기 · 이미지 복사→붙여넣기(⌘/Ctrl+V) · 자유롭게"
          >
            <MarkdownEditor
              value={nContent}
              onChange={setNContent}
              minHeight={200}
              placeholder="가고 싶은 곳, 유튜브 링크, 사진을 막 붙여넣어요. 유튜브 링크는 저장하면 팝업에서 바로 재생돼요 ▶️"
            />
          </Field>
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
  const pal = palette(color);
  const doneCount = items.filter((i) => i.done).length;
  const remaining = suggestions.filter(
    (s) => !items.some((i) => i.text === s)
  );

  function add(t: string) {
    const v = t.trim();
    if (!v) return;
    onAdd(v);
    setText("");
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-lg", pal.soft)}>
          {emoji}
        </span>
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {items.length > 0 && (
          <Tag color={color} className="font-num ml-auto">
            {doneCount}/{items.length}
          </Tag>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-faint">
          아래에 직접 적거나, 추천을 눌러 담아보세요.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((it) => (
            <li
              key={it.id}
              className="group flex items-center gap-2.5 border-b border-line py-2 last:border-0"
            >
              <Checkbox checked={it.done} onChange={() => onToggle(it)} color={color} size="sm" />
              <span
                className={cn(
                  "flex-1 text-[15px]",
                  it.done ? "text-ink-faint line-through" : "text-ink"
                )}
              >
                {it.text}
              </span>
              <IconButton
                variant="danger"
                size="sm"
                aria-label="삭제"
                onClick={() => onRemove(it.id)}
                className="opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {/* 직접 추가 */}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(text)}
          placeholder="직접 추가…"
          className="flex-1"
        />
        <Button variant="soft" onClick={() => add(text)} disabled={!text.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* 추천 항목 */}
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAdd(s)}
              className="rounded-full border border-line bg-sunken px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-primary-soft hover:text-primary-ink"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────
   시차 계산기 (시간 변환 · 비행 도착 시각)
   ───────────────────────────────────────────── */
function TimezoneCalculator({ offsetMin }: { offsetMin: number }) {
  // 1) 시간 변환
  const [convTime, setConvTime] = useState("09:00");
  const [convDir, setConvDir] = useState<"L2K" | "K2L">("L2K");
  const conv =
    convDir === "L2K" ? toKorea(convTime, offsetMin) : toLocal(convTime, offsetMin);

  // 2) 비행 도착
  const [depTime, setDepTime] = useState("14:00");
  const [dur, setDur] = useState("7");
  const [flightDir, setFlightDir] = useState<"K2L" | "L2K">("L2K");
  const durMin = Math.max(0, Math.round(Number(dur || 0) * 60));
  // 출발지 시각 → 도착지 시간대로 변환 → 소요시간 더하기
  const arrBase =
    flightDir === "K2L" ? toLocal(depTime, offsetMin) : toKorea(depTime, offsetMin);
  const arr = arrBase ? shiftTime(arrBase.time, durMin) : null;
  const arrDay = (arrBase?.dayDelta ?? 0) + (arr?.dayDelta ?? 0);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-soft text-lg">
          🕐
        </span>
        <h3 className="text-base font-bold text-ink">시차 계산기</h3>
        <span className="ml-auto text-xs text-ink-faint">{tzOffsetLabel(offsetMin)}</span>
      </div>

      {/* 시간 변환 */}
      <div className="flex flex-col gap-2 rounded-2xl bg-sunken/60 p-3">
        <p className="text-sm font-semibold text-ink">시간 변환</p>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={convDir}
            onChange={(v) => setConvDir(v)}
            options={[
              { value: "L2K", label: "현지 → 한국" },
              { value: "K2L", label: "한국 → 현지" },
            ]}
          />
          <Input
            type="time"
            value={convTime}
            onChange={(e) => setConvTime(e.target.value)}
            className="w-32"
            aria-label="변환할 시각"
          />
          <span className="text-ink-faint">→</span>
          <span className="font-num rounded-full bg-primary-soft px-3 py-2 text-sm font-bold text-primary-ink">
            {conv ? conv.time : "--:--"}
            {conv?.dayDelta ? ` (${dayDeltaLabel(conv.dayDelta)})` : ""}
            <span className="ml-1 text-xs font-medium">
              {convDir === "L2K" ? "한국" : "현지"}
            </span>
          </span>
        </div>
      </div>

      {/* 비행 도착 시각 */}
      <div className="flex flex-col gap-2 rounded-2xl bg-sunken/60 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Plane className="h-4 w-4 text-ink-faint" /> 비행 도착 시각
        </p>
        <Segmented
          value={flightDir}
          onChange={(v) => setFlightDir(v)}
          options={[
            { value: "L2K", label: "현지 출발 → 한국 도착" },
            { value: "K2L", label: "한국 출발 → 현지 도착" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-ink-soft">
            출발
            <Input
              type="time"
              value={depTime}
              onChange={(e) => setDepTime(e.target.value)}
              className="w-28"
              aria-label="출발 시각"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink-soft">
            비행
            <Input
              type="number"
              step="0.5"
              min="0"
              value={dur}
              onChange={(e) => setDur(e.target.value)}
              className="w-20"
              aria-label="비행 소요 시간(시간)"
            />
            시간
          </label>
        </div>
        <p className="text-sm text-ink-soft">
          →{" "}
          <span className="font-num rounded-full bg-primary-soft px-3 py-1.5 text-sm font-bold text-primary-ink">
            {arr ? arr.time : "--:--"}
            {arrDay ? ` (${dayDeltaLabel(arrDay)})` : ""}
            <span className="ml-1 text-xs font-medium">
              {flightDir === "L2K" ? "한국" : "현지"} 도착
            </span>
          </span>
        </p>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   아이디어 메모 카드 (클릭 시 팝업)
   ───────────────────────────────────────────── */
function NoteCard({
  note,
  onOpen,
  onRemove,
}: {
  note: PlanNote;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const img = firstImageUrl(note.content);
  const yt = youtubeIds(note.content)[0];
  const thumb = img || (yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : null);
  const preview = stripMarkdown(note.content);
  const title = note.title || preview.split("\n")[0] || "메모";

  return (
    <div className="group relative">
      <Card interactive flush onClick={onOpen} className="flex h-full flex-col overflow-hidden">
        {thumb && (
          <div className="relative aspect-video bg-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
            {yt && !img && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/55 text-white">
                  <Play className="h-5 w-5" fill="currentColor" />
                </span>
              </span>
            )}
          </div>
        )}
        <div className="flex flex-1 flex-col gap-1 p-4">
          <p className="line-clamp-1 font-bold text-ink">{title}</p>
          {preview && <p className="line-clamp-2 text-sm text-ink-soft">{preview}</p>}
          <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-ink-faint">
            {yt && (
              <span className="flex items-center gap-0.5">
                <Film className="h-3.5 w-3.5" /> 영상
              </span>
            )}
            {img && <span>🖼️ 사진</span>}
            <span className="ml-auto">{kDateShort(note.createdAt)}</span>
          </div>
        </div>
      </Card>
      <IconButton
        variant="surface"
        size="sm"
        aria-label="메모 삭제"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-2 top-2 opacity-100 transition hover:text-danger lg:opacity-0 lg:group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
