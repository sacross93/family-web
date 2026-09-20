"use client";

import { useState } from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  startOfWeek,
  startOfDay,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  MapPin,
  Clock,
} from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  Modal,
  Field,
  Label,
  Input,
  Textarea,
  Checkbox,
  ColorPicker,
  EmptyState,
  Segmented,
  ItemActions,
  useToast,
} from "@/components/ui";
import { palette, type PaletteKey } from "@/lib/colors";
import { kDate, kDateRelative, kTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_KEY = "yyyy-MM-dd";

type FormState = {
  title: string;
  date: string; // yyyy-MM-dd
  allDay: boolean;
  start: string; // HH:mm
  end: string; // HH:mm
  color: PaletteKey;
  location: string;
  description: string;
};

function emptyForm(date: Date): FormState {
  return {
    title: "",
    date: format(date, DAY_KEY),
    allDay: false,
    start: "09:00",
    end: "",
    color: "lavender",
    location: "",
    description: "",
  };
}

/** fetch 결과(문자열 날짜)를 Date 로 되살립니다. */
function revive(e: CalendarEvent): CalendarEvent {
  return {
    ...e,
    start: new Date(e.start),
    end: e.end ? new Date(e.end) : null,
    createdAt: new Date(e.createdAt),
    updatedAt: new Date(e.updatedAt),
  };
}

export function CalendarClient({
  initialEvents,
}: {
  initialEvents: CalendarEvent[];
}) {
  const { say } = useToast();
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));

  // 폼(추가/수정) 모달
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(new Date()));
  const [busy, setBusy] = useState(false);

  // 하루 상세 모달
  const [dayOpen, setDayOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const today = startOfDay(new Date());

  // 6주(42칸) 고정 그리드
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  // 날짜별 이벤트 묶기
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = format(new Date(e.start), DAY_KEY);
    const list = byDay.get(key);
    if (list) list.push(e);
    else byDay.set(key, [e]);
  }

  // 폰에서 무엇을 보여줄지. 55px 짜리 칸에는 일정 이름이 안 들어가서
  // 격자만으로는 "이번 주에 뭐 있지?" 를 답하지 못한다. 그래서 폰은 목록이 기본.
  // 데스크톱은 칸이 넓어 격자가 제 몫을 하므로 늘 격자 + 옆 목록 그대로다.
  const [phoneView, setPhoneView] = useState<"list" | "grid">("list");

  // 다가오는 일정 (오늘 이후)
  const upcoming = [...events]
    .filter((e) => startOfDay(new Date(e.start)).getTime() >= today.getTime())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 8);

  function openNew(date: Date) {
    setEditingId(null);
    setForm(emptyForm(date));
    setDayOpen(false);
    setFormOpen(true);
  }

  function openEdit(ev: CalendarEvent) {
    const s = new Date(ev.start);
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      date: format(s, DAY_KEY),
      allDay: ev.allDay,
      start: ev.allDay ? "09:00" : format(s, "HH:mm"),
      end: ev.end ? format(new Date(ev.end), "HH:mm") : "",
      color: (ev.color as PaletteKey) ?? "lavender",
      location: ev.location ?? "",
      description: ev.description ?? "",
    });
    setDayOpen(false);
    setFormOpen(true);
  }

  function openDay(date: Date) {
    setSelectedDate(date);
    setDayOpen(true);
  }

  async function save() {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      date: form.date,
      allDay: form.allDay,
      startTime: form.allDay ? null : form.start,
      endTime: form.allDay || !form.end ? null : form.end,
      color: form.color,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    };
    try {
      if (editingId) {
        const res = await fetch(`/api/events/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = revive(await res.json());
          setEvents((prev) =>
            prev.map((e) => (e.id === editingId ? updated : e))
          );
          setFormOpen(false);
        }
      } else {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = revive(await res.json());
          setEvents((prev) => [...prev, created]);
          setFormOpen(false);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = events;
    setEvents((p) => p.filter((e) => e.id !== id));
    setDayOpen(false);
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setEvents(prev);
      say("못 지웠어요. 잠시 후 다시 해 주세요.", "error");
    }
  }

  const monthLabel = format(cursor, "yyyy년 M월", { locale: ko });
  const selectedEvents = (byDay.get(format(selectedDate, DAY_KEY)) ?? []).sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  return (
    <div>
      <PageHeader
        emoji="📅"
        title="캘린더"
        description="온 가족의 이번 달 일정을 한눈에"
        summary={monthLabel}
      >
        {/* 구글 캘린더 연동은 아직 안 된다. 눌리지 않는 버튼이 폰에서 제일 좋은 자리를
            차지하고 "일정 추가" 와 폭을 나눠 가지고 있었다 — 되면 그때 올린다. */}
        <Button onClick={() => openNew(new Date())}>
          <Plus className="h-4 w-4" /> 일정 추가
        </Button>
      </PageHeader>

      {/* 폰에서만 보이는 전환. 데스크톱은 둘 다 늘 보이므로 고를 것이 없다. */}
      <div className="mb-4 lg:hidden">
        <Segmented
          value={phoneView}
          onChange={setPhoneView}
          options={[
            { value: "list", label: "목록" },
            { value: "grid", label: "달력" },
          ]}
        />
      </div>

      <div className="grid animate-fade-up gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* 달력 */}
        <div className={cn(phoneView === "grid" ? "" : "hidden lg:block")}>
          {/* 월 이동 */}
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <IconButton
                variant="surface"
                size="md"
                aria-label="이전 달"
                onClick={() => setCursor((c) => subMonths(c, 1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </IconButton>
              <h2 className="min-w-[128px] text-center font-display text-xl font-bold text-ink">
                {monthLabel}
              </h2>
              <IconButton
                variant="surface"
                size="md"
                aria-label="다음 달"
                onClick={() => setCursor((c) => addMonths(c, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </IconButton>
            </div>
            <Button
              variant="soft"
              size="sm"
              onClick={() => setCursor(startOfMonth(new Date()))}
            >
              오늘
            </Button>
          </div>

          {/* 요일 헤더 */}
          <div className="mb-1.5 grid grid-cols-7">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={cn(
                  "py-1.5 text-center text-xs font-bold",
                  i === 0
                    ? "text-rose-ink"
                    : i === 6
                    ? "text-sky-ink"
                    : "text-ink-faint"
                )}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 (항상 6주) */}
          <div className="grid grid-cols-7 overflow-hidden rounded-2xl border-l border-t border-line bg-surface shadow-sm">
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const isToday = isSameDay(day, today);
              const dow = day.getDay();
              const dayEvents = byDay.get(format(day, DAY_KEY)) ?? [];
              const visible = dayEvents.slice(0, 3);
              const extra = dayEvents.length - visible.length;

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => openDay(day)}
                  className={cn(
                    "flex min-h-[86px] flex-col gap-1 border-b border-r border-line p-1.5 text-left transition hover:bg-sunken/60 sm:min-h-[112px] sm:p-2",
                    !inMonth && "bg-paper/50",
                    isToday && "bg-primary-soft/40"
                  )}
                  aria-label={`${format(day, "M월 d일", { locale: ko })} 일정 ${dayEvents.length}개`}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full font-num text-xs font-bold sm:h-7 sm:w-7 sm:text-sm",
                      isToday
                        ? "bg-primary text-white shadow-sm"
                        : !inMonth
                        ? "text-ink-faint"
                        : dow === 0
                        ? "text-rose-ink"
                        : dow === 6
                        ? "text-sky-ink"
                        : "text-ink"
                    )}
                  >
                    {day.getDate()}
                  </span>

                  <span className="flex min-w-0 flex-col gap-0.5">
                    {visible.map((ev) => (
                      <span
                        key={ev.id}
                        title={ev.title}
                        className={cn(
                          "block truncate rounded-md px-1.5 py-0.5 text-[0.625rem] font-semibold leading-tight sm:text-[0.6875rem]",
                          palette(ev.color).chip,
                          !inMonth && "opacity-60"
                        )}
                      >
                        {ev.title}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="px-1 text-[0.625rem] font-semibold text-ink-faint">
                        +{extra}개
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 다가오는 일정 */}
        <aside className={cn(phoneView === "list" ? "" : "hidden lg:block")}>
          <Card flush className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <p className="font-display text-lg font-bold text-ink">다가오는 일정</p>
            </div>
            {upcoming.length === 0 ? (
              /* "없어요." 한 줄로 끝나 있었다. 빈 화면은 초대다(DESIGN §8) —
                 무엇을 할 수 있는지 말하고 그 자리에서 할 수 있게 한다. */
              <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                <span className="text-3xl" aria-hidden>
                  📅
                </span>
                <p className="text-sm text-ink-soft">
                  아직 잡힌 일정이 없어요.
                </p>
                <Button size="sm" variant="soft" onClick={() => openNew(new Date())}>
                  <Plus className="h-4 w-4" /> 일정 추가
                </Button>
              </div>
            ) : (
              <ul>
                {upcoming.map((ev) => (
                  // 수정·삭제가 달력 격자의 날짜 모달 안에만 있었다. 폰 기본이 목록이 된 뒤로는
                  // 이 줄에서 지울 방법이 없어, 지우려면 달력으로 바꿔 날짜를 찾아 들어가야 했다.
                  <li
                    key={ev.id}
                    className="group flex items-center gap-1 border-b border-line pr-2 last:border-0"
                  >
                    <button
                      type="button"
                      onClick={() => openEdit(ev)}
                      className="flex min-w-0 flex-1 items-start gap-2.5 px-4 py-3 text-left transition hover:bg-sunken/60"
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                          palette(ev.color).dot
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-semibold text-ink">
                          {ev.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-soft">
                          {kDateRelative(ev.start)}
                          {" · "}
                          {ev.allDay ? "종일" : kTime(ev.start)}
                        </span>
                      </span>
                    </button>
                    <ItemActions
                      inline
                      actions={[
                        { label: "수정", icon: Pencil, onClick: () => openEdit(ev) },
                        { label: "삭제", icon: Trash2, onClick: () => remove(ev.id), danger: true },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      {/* 하루 상세 모달 */}
      <Modal
        open={dayOpen}
        onClose={() => setDayOpen(false)}
        title={kDate(selectedDate)}
        emoji="📅"
        footer={
          <Button onClick={() => openNew(selectedDate)}>
            <Plus className="h-4 w-4" /> 이 날 일정 추가
          </Button>
        }
      >
        {selectedEvents.length === 0 ? (
          <EmptyState
            emoji="🗓️"
            title="이 날은 일정이 없어요"
            description="아래에서 새 일정을 추가해 보세요."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {selectedEvents.map((ev) => (
              <li
                key={ev.id}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl p-3",
                  palette(ev.color).soft
                )}
              >
                <span
                  className={cn(
                    "mt-1 h-3 w-3 shrink-0 rounded-full",
                    palette(ev.color).dot
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("font-semibold", palette(ev.color).ink)}>
                    {ev.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {ev.allDay
                        ? "종일"
                        : ev.end
                        ? `${kTime(ev.start)} ~ ${kTime(ev.end)}`
                        : kTime(ev.start)}
                    </span>
                    {ev.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {ev.location}
                      </span>
                    )}
                  </div>
                  {ev.description && (
                    <p className="mt-1.5 text-sm text-ink-soft">{ev.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    aria-label="수정"
                    onClick={() => openEdit(ev)}
                  >
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    variant="danger"
                    size="sm"
                    aria-label="삭제"
                    onClick={() => remove(ev.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* 추가 / 수정 폼 모달 */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? "일정 수정" : "새 일정"}
        emoji="✏️"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              취소
            </Button>
            <Button onClick={save} disabled={!form.title.trim() || busy}>
              저장
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="제목">
            <Input
              placeholder="무슨 일정인가요? (예: 가족 저녁 🍚)"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </Field>

          <Field label="날짜">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>

          <div className="flex items-center gap-2.5">
            <Checkbox
              checked={form.allDay}
              onChange={(next) => setForm((f) => ({ ...f, allDay: next }))}
              color={form.color}
              label="종일 일정"
            />
            <button
              type="button"
              className="cursor-pointer text-sm font-semibold text-ink"
              onClick={() => setForm((f) => ({ ...f, allDay: !f.allDay }))}
            >
              종일 일정
            </button>
          </div>

          {!form.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작 시간">
                <Input
                  type="time"
                  value={form.start}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, start: e.target.value }))
                  }
                />
              </Field>
              <Field label="종료 시간" hint="비워도 괜찮아요">
                <Input
                  type="time"
                  value={form.end}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, end: e.target.value }))
                  }
                />
              </Field>
            </div>
          )}

          <div>
            <Label>색</Label>
            <ColorPicker
              value={form.color}
              onChange={(color) => setForm((f) => ({ ...f, color }))}
            />
          </div>

          <Field label="장소">
            <Input
              placeholder="어디에서 만나요? (예: 할머니 댁)"
              value={form.location}
              onChange={(e) =>
                setForm((f) => ({ ...f, location: e.target.value }))
              }
            />
          </Field>

          <Field label="설명">
            <Textarea
              placeholder="메모를 남겨 보세요."
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
