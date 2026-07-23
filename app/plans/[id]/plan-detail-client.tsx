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
} from "@/components/ui";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownView } from "@/components/markdown-view";
import { DecorationSurface } from "@/components/decoration-surface";
import { palette, type PaletteKey } from "@/lib/colors";
import { kDate, kDateShort, dday } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { PlanDetail, PlanItem, PlanChecklistItem, Plan } from "@/lib/types";

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

  function openAddItem(presetDay: string) {
    setEditingItem(null);
    setIDay(presetDay === NO_DAY ? "" : presetDay);
    setITime("");
    setITitle("");
    setINote("");
    setILoc("");
    setICat("mint");
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
    setItemOpen(true);
  }

  async function saveItem() {
    if (!iTitle.trim() || busy) return;
    setBusy(true);
    const payload = {
      dayDate: iDay || null,
      time: iTime || null,
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

  // ── 계획(메타) 폼 상태 ───────────────────────
  const [planOpen, setPlanOpen] = useState(false);
  const [pTitle, setPTitle] = useState(plan.title);
  const [pType, setPType] = useState<string>(plan.type);
  const [pEmoji, setPEmoji] = useState(plan.emoji);
  const [pColor, setPColor] = useState<PaletteKey>((plan.color as PaletteKey) ?? "sky");
  const [pDesc, setPDesc] = useState(plan.description ?? "");
  const [pLoc, setPLoc] = useState(plan.location ?? "");
  const [pStart, setPStart] = useState(toInputDate(plan.startDate));
  const [pEnd, setPEnd] = useState(toInputDate(plan.endDate));

  function openEditPlan() {
    setPTitle(plan.title);
    setPType(plan.type);
    setPEmoji(plan.emoji);
    setPColor((plan.color as PaletteKey) ?? "sky");
    setPDesc(plan.description ?? "");
    setPLoc(plan.location ?? "");
    setPStart(toInputDate(plan.startDate));
    setPEnd(toInputDate(plan.endDate));
    setPlanOpen(true);
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
                  return (
                    <li key={it.id} className="group flex gap-3">
                      {/* 시간 */}
                      <div className="w-12 shrink-0 pt-2.5 text-right sm:w-14">
                        {it.time ? (
                          <span className="font-num text-sm font-semibold text-ink-soft">
                            {it.time}
                          </span>
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
