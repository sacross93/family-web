"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Bell,
  BellRing,
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarCheck,
} from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import {
  PageHeader,
  Card,
  Button,
  IconButton,
  ItemActions,
  Input,
  Select,
  Field,
  Checkbox,
  Avatar,
  Tag,
  Modal,
  EmptyState,
} from "@/components/ui";
import { type PaletteKey } from "@/lib/colors";
import { cn } from "@/lib/utils";
import {
  kDate,
  kDateShort,
  kWeekday,
  startOfDay,
  isSameDay,
  isToday,
  differenceInCalendarDays,
} from "@/lib/date";
import {
  notificationPermission,
  requestNotificationPermission,
  scheduleLocalReminder,
  cancelReminder,
} from "@/lib/notifications";
import type { TodoWithMember, FamilyMember } from "@/lib/types";

// ─────────────────────────────────────────────
// 상수 · 헬퍼
// ─────────────────────────────────────────────
const PRIORITY_OPTIONS = [
  { value: "high", label: "중요" },
  { value: "normal", label: "보통" },
  { value: "low", label: "여유" },
] as const;

function priorityColor(p: string): PaletteKey {
  return p === "high" ? "rose" : p === "low" ? "sky" : "mint";
}

const dayKey = (d: Date | string) => format(new Date(d), "yyyy-MM-dd");

type Perm = NotificationPermission | "unsupported";

interface FormState {
  title: string;
  date: string; // yyyy-MM-dd
  dueTime: string; // HH:mm
  priority: string;
  memberId: string;
  remindAt: string; // yyyy-MM-ddTHH:mm
  syncToGoogle: boolean;
}

function emptyForm(dateStr: string): FormState {
  return {
    title: "",
    date: dateStr,
    dueTime: "",
    priority: "normal",
    memberId: "",
    remindAt: "",
    syncToGoogle: false,
  };
}

/** fetch 응답(JSON)은 날짜가 문자열 → 클라 상태와 맞게 Date 로 되살림 */
function reviveTodo(raw: TodoWithMember): TodoWithMember {
  return {
    ...raw,
    date: new Date(raw.date),
    remindAt: raw.remindAt ? new Date(raw.remindAt) : null,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

// ─────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────
export function TodosClient({
  initialTodos,
  members,
}: {
  initialTodos: TodoWithMember[];
  members: FamilyMember[];
}) {
  const [todos, setTodos] = useState<TodoWithMember[]>(initialTodos);
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()));
  const [permission, setPermission] = useState<Perm>("default");
  const [notice, setNotice] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(format(new Date(), "yyyy-MM-dd"))
  );
  const [busy, setBusy] = useState(false);

  const timersRef = useRef<number[]>([]);
  const noticeTimer = useRef<number | null>(null);

  function showNotice(msg: string) {
    setNotice(msg);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4500);
  }

  // 알림 권한 상태 파악 (클라 전용)
  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  // 이번 세션 로컬 알림 예약 (권한 있을 때, 미완료 + 미래 remindAt)
  useEffect(() => {
    timersRef.current.forEach(cancelReminder);
    timersRef.current = [];
    if (permission !== "granted") return;
    const now = Date.now();
    for (const t of todos) {
      if (t.done || !t.remindAt) continue;
      const at = new Date(t.remindAt);
      if (at.getTime() <= now) continue;
      const id = scheduleLocalReminder(
        at,
        `⏰ ${t.title}`,
        t.dueTime ? `${t.dueTime} 마감이에요` : "잊지 말고 챙겨요!"
      );
      if (id != null) timersRef.current.push(id);
    }
    return () => {
      timersRef.current.forEach(cancelReminder);
      timersRef.current = [];
    };
  }, [todos, permission]);

  // ── 파생 데이터 ──────────────────────────────
  const week = useMemo(() => {
    const start = startOfWeek(selected, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  const countsByDay = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const t of todos) {
      const k = dayKey(t.date);
      const c = map.get(k) ?? { total: 0, done: 0 };
      c.total += 1;
      if (t.done) c.done += 1;
      map.set(k, c);
    }
    return map;
  }, [todos]);

  const dayTodos = useMemo(() => {
    return todos
      .filter((t) => isSameDay(new Date(t.date), selected))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const at = a.dueTime ?? "99:99";
        const bt = b.dueTime ?? "99:99";
        if (at !== bt) return at < bt ? -1 : 1;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [todos, selected]);

  const total = dayTodos.length;
  const doneCount = dayTodos.filter((t) => t.done).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;

  const diff = differenceInCalendarDays(selected, startOfDay(new Date()));
  const relLabel =
    diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === -1 ? "어제" : format(selected, "yyyy년");

  // ── 액션 ────────────────────────────────────
  async function enableNotifications() {
    const ok = await requestNotificationPermission();
    setPermission(notificationPermission());
    if (ok) showNotice("알림을 켰어요 🔔 마감 전에 알려드릴게요.");
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm(format(selected, "yyyy-MM-dd")));
    setModalOpen(true);
  }

  function openEdit(t: TodoWithMember) {
    setEditingId(t.id);
    setForm({
      title: t.title,
      date: format(new Date(t.date), "yyyy-MM-dd"),
      dueTime: t.dueTime ?? "",
      priority: t.priority,
      memberId: t.memberId ?? "",
      remindAt: t.remindAt ? format(new Date(t.remindAt), "yyyy-MM-dd'T'HH:mm") : "",
      syncToGoogle: t.syncedToGoogle,
    });
    setModalOpen(true);
  }

  async function submit() {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      date: form.date,
      dueTime: form.dueTime || null,
      priority: form.priority,
      memberId: form.memberId || null,
      remindAt: form.remindAt || null,
      syncToGoogle: form.syncToGoogle,
    };
    try {
      if (editingId) {
        const res = await fetch(`/api/todos/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = reviveTodo(await res.json());
          setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          setSelected(startOfDay(new Date(updated.date)));
          setModalOpen(false);
        }
      } else {
        const res = await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = reviveTodo(await res.json());
          setTodos((prev) => [...prev, created]);
          setSelected(startOfDay(new Date(created.date)));
          setModalOpen(false);
          if (form.syncToGoogle) {
            showNotice(
              created.syncedToGoogle
                ? "구글 캘린더에도 저장했어요 🗓️"
                : "구글 캘린더 연동은 설정 후 자동 저장돼요 🗓️"
            );
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(t: TodoWithMember) {
    const next = !t.done;
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: next } : x)));
    const res = await fetch(`/api/todos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
    }
  }

  async function remove(id: string) {
    const prev = todos;
    setTodos((p) => p.filter((t) => t.id !== id));
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (!res.ok) setTodos(prev);
  }

  // ── 렌더 ────────────────────────────────────
  return (
    <div>
      <PageHeader emoji="📝" title="할일" description="그날그날 우리 가족이 할 일">
        {permission !== "unsupported" &&
          (permission === "granted" ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mint-soft px-3.5 text-sm font-semibold text-mint-ink">
              <BellRing className="h-4 w-4" /> 알림 켜짐
            </span>
          ) : (
            <Button variant="soft" size="sm" onClick={enableNotifications}>
              <Bell className="h-4 w-4" /> 알림 켜기
            </Button>
          ))}
        {/* 그날 할일이 없으면 아래 빈 화면의 초대가 같은 일을 한다 —
            같은 버튼을 한 화면에 두 번 두지 않는다. */}
        {total > 0 && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" /> 할일 추가
          </Button>
        )}
      </PageHeader>

      {notice && (
        <div className="animate-fade-up mb-5 flex items-center gap-2 rounded-2xl bg-primary-soft px-4 py-3 text-sm font-medium text-primary-ink">
          {notice}
        </div>
      )}

      {/* 날짜 네비 + 진행률 */}
      <Card className="mb-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <IconButton
            variant="ghost"
            aria-label="이전 날"
            onClick={() => setSelected((d) => startOfDay(addDays(d, -1)))}
          >
            <ChevronLeft className="h-5 w-5" />
          </IconButton>

          <div className="flex flex-col items-center">
            <p className="font-display text-lg font-bold text-ink">{kDateShort(selected)}</p>
            {isToday(selected) ? (
              <span className="text-xs font-semibold text-ink-faint">{relLabel}</span>
            ) : (
              <button
                type="button"
                onClick={() => setSelected(startOfDay(new Date()))}
                className="text-xs font-semibold text-primary transition hover:underline"
              >
                오늘로 가기
              </button>
            )}
          </div>

          <IconButton
            variant="ghost"
            aria-label="다음 날"
            onClick={() => setSelected((d) => startOfDay(addDays(d, 1)))}
          >
            <ChevronRight className="h-5 w-5" />
          </IconButton>
        </div>

        {/* 주간 스트립 */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {week.map((day) => {
            const c = countsByDay.get(dayKey(day));
            const sel = isSameDay(day, selected);
            const today = isToday(day);
            const hasOpen = c ? c.done < c.total : false;
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelected(startOfDay(day))}
                aria-pressed={sel}
                aria-label={kDate(day)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl py-2 transition-all",
                  sel
                    ? "bg-primary text-white shadow-sm"
                    : cn("text-ink hover:bg-sunken", today && "ring-2 ring-primary ring-inset")
                )}
              >
                <span
                  className={cn(
                    "text-[0.6875rem] font-semibold",
                    sel ? "text-white/80" : "text-ink-faint"
                  )}
                >
                  {kWeekday(day)}
                </span>
                <span className="font-num text-[0.9375rem] font-bold leading-none">
                  {day.getDate()}
                </span>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    !c
                      ? "bg-transparent"
                      : sel
                        ? "bg-white/80"
                        : hasOpen
                          ? "bg-primary"
                          : "bg-mint"
                  )}
                />
              </button>
            );
          })}
        </div>

        {/* 진행률 */}
        {total > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  allDone ? "bg-mint" : "bg-primary"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-num shrink-0 text-sm font-semibold text-ink-soft">
              {doneCount}/{total}
            </span>
            {allDone && (
              <span className="shrink-0 text-sm font-semibold text-mint-ink">🎉 다 했어요!</span>
            )}
          </div>
        )}
      </Card>

      {/* 목록 */}
      {total === 0 ? (
        <EmptyState
          emoji="☕"
          title="이 날은 할일이 없어요"
          description="여유로운 하루예요. 할일을 더해볼까요?"
          action={
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" /> 할일 추가
            </Button>
          }
        />
      ) : (
        <Card flush className="overflow-hidden">
          <ul>
            {dayTodos.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                onToggle={toggleDone}
                onEdit={openEdit}
                onRemove={remove}
              />
            ))}
          </ul>
        </Card>
      )}

      {/* 추가/수정 모달 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        emoji={editingId ? "✏️" : "📝"}
        title={editingId ? "할일 수정" : "할일 추가"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={!form.title.trim() || busy}>
              {editingId ? "저장" : "추가"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="할일">
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="무엇을 할까요? (예: 준비물 챙기기)"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="날짜">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="font-num"
              />
            </Field>
            <Field label="마감 시간" hint="선택">
              <Input
                type="time"
                value={form.dueTime}
                onChange={(e) => setForm((f) => ({ ...f, dueTime: e.target.value }))}
                className="font-num"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="우선순위">
              <Select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="알림 시각" hint="선택">
              <Input
                type="datetime-local"
                value={form.remindAt}
                onChange={(e) => setForm((f) => ({ ...f, remindAt: e.target.value }))}
                className="font-num"
              />
            </Field>
          </div>

          {members.length > 0 && (
            <Field label="담당 가족">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, memberId: "" }))}
                  aria-pressed={form.memberId === ""}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border border-line-strong bg-surface px-3 text-xs font-semibold transition",
                    form.memberId === ""
                      ? "ring-2 ring-primary ring-offset-1 text-ink"
                      : "text-ink-soft opacity-70 hover:opacity-100"
                  )}
                >
                  담당 없음
                </button>
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, memberId: m.id }))}
                    aria-pressed={form.memberId === m.id}
                    aria-label={m.name}
                    className={cn(
                      "rounded-full transition",
                      form.memberId === m.id
                        ? "ring-2 ring-primary ring-offset-1"
                        : "opacity-50 hover:opacity-100"
                    )}
                  >
                    <Avatar emoji={m.emoji} color={m.color} name={m.name} size="sm" />
                  </button>
                ))}
              </div>
            </Field>
          )}

          <div className="rounded-2xl bg-sunken px-4 py-3.5">
            <Toggle
              checked={form.syncToGoogle}
              onChange={(v) => setForm((f) => ({ ...f, syncToGoogle: v }))}
              label="구글 캘린더에 저장"
            />
            <p className="mt-1.5 pl-[52px] text-xs text-ink-faint">
              연동 전이면 설정 후 자동으로 올라가요.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// 할일 행
// ─────────────────────────────────────────────
function TodoRow({
  todo,
  onToggle,
  onEdit,
  onRemove,
}: {
  todo: TodoWithMember;
  onToggle: (t: TodoWithMember) => void;
  onEdit: (t: TodoWithMember) => void;
  onRemove: (id: string) => void;
}) {
  const checkColor = todo.member?.color ?? priorityColor(todo.priority);
  const done = todo.done;

  return (
    <li className="group flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 sm:px-5">
      <Checkbox
        checked={done}
        onChange={() => onToggle(todo)}
        color={checkColor}
        label={todo.title}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-[0.9375rem]",
              done
                ? "text-ink-faint line-through"
                : todo.priority === "low"
                  ? "text-ink-soft"
                  : "text-ink"
            )}
          >
            {todo.title}
          </span>
          {todo.priority === "high" && !done && <Tag color="rose">중요</Tag>}
        </div>

        {(todo.dueTime || todo.remindAt || todo.priority === "low") && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-faint">
            {todo.dueTime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span className="font-num">{todo.dueTime}</span>
              </span>
            )}
            {todo.remindAt && (
              <span className="inline-flex items-center gap-1" title="알림 설정됨">
                <Bell className="h-3.5 w-3.5" />
                알림
              </span>
            )}
            {todo.priority === "low" && !done && <span>여유</span>}
          </div>
        )}
      </div>

      {todo.member && (
        <Avatar
          emoji={todo.member.emoji}
          color={todo.member.color}
          name={todo.member.name}
          size="xs"
        />
      )}

      <ItemActions
        inline
        actions={[
          { label: "수정", icon: Pencil, onClick: () => onEdit(todo) },
          { label: "삭제", icon: Trash2, onClick: () => onRemove(todo.id), danger: true },
        ]}
      />
    </li>
  );
}

// ─────────────────────────────────────────────
// 로컬 토글 스위치 (공용 컴포넌트에 없어 기능 폴더에 둠)
// ─────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3"
    >
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-primary" : "bg-line-strong"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200",
            checked ? "left-[22px]" : "left-0.5"
          )}
        />
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
        <CalendarCheck className="h-4 w-4 text-ink-soft" />
        {label}
      </span>
    </button>
  );
}
