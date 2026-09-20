"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import {
  PageHeader,
  Card,
  CardTitle,
  Button,
  Tag,
  Avatar,
  EmptyState,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  ColorPicker,
  ItemActions,
} from "@/components/ui";
import { palette, type PaletteKey } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { dday, kDate, kDateShort } from "@/lib/date";
import type { AnniversaryWithMember, FamilyMember } from "@/lib/types";

type AnnivType = "birthday" | "anniversary" | "memorial" | "event";

const TYPE_META: Record<AnnivType, { label: string; emoji: string }> = {
  birthday: { label: "생일", emoji: "🎂" },
  anniversary: { label: "기념일", emoji: "💍" },
  memorial: { label: "추모", emoji: "🕯️" },
  event: { label: "이벤트", emoji: "🎉" },
};

const TYPE_OPTIONS: AnnivType[] = ["birthday", "anniversary", "memorial", "event"];
const DEFAULT_EMOJIS = Object.values(TYPE_META).map((m) => m.emoji);

function typeMeta(type: string) {
  return TYPE_META[(type as AnnivType)] ?? TYPE_META.anniversary;
}

/** Date → "yyyy-MM-dd" (date input 용, 로컬 기준) */
function toDateInput(d: Date | string) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Decorated = {
  item: AnniversaryWithMember;
  d: ReturnType<typeof dday>;
};

/** 다가오는 것 먼저(가까운 순), 지난 것은 뒤로(최근 지난 순) */
function compareDecorated(a: Decorated, b: Decorated) {
  const aPast = a.d.days < 0;
  const bPast = b.d.days < 0;
  if (aPast !== bPast) return aPast ? 1 : -1;
  if (aPast) return b.d.days - a.d.days; // -1 이 -30 보다 앞
  return a.d.days - b.d.days; // 다가오는 건 작은 수(가까운) 먼저
}

/** 다가오는 생일에 몇 살이 되는지 (반복 생일 기준) */
function turningAge(item: AnniversaryWithMember, next: Date) {
  const birthYear = new Date(item.date).getFullYear();
  return next.getFullYear() - birthYear;
}

export function AnniversariesClient({
  initialItems,
  members,
}: {
  initialItems: AnniversaryWithMember[];
  members: FamilyMember[];
}) {
  const [items, setItems] = useState(initialItems);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnniversaryWithMember | null>(null);
  const [busy, setBusy] = useState(false);

  // 폼 상태
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<AnnivType>("anniversary");
  const [recurring, setRecurring] = useState(true);
  const [emoji, setEmoji] = useState("🎉");
  const [color, setColor] = useState<PaletteKey>("rose");
  const [memberId, setMemberId] = useState("");
  const [note, setNote] = useState("");

  const decorated = items
    .map((item) => ({ item, d: dday(item.date, { recurring: item.recurring }) }))
    .sort(compareDecorated);

  const featured = decorated.filter((x) => x.d.days >= 0).slice(0, 3);
  // 위에 크게 실은 것은 아래에서 뺀다 — 6건 보려고 두 벌을 스크롤하지 않게.
  const featuredIds = new Set(featured.map((x) => x.item.id));
  const rest = decorated.filter((x) => !featuredIds.has(x.item.id));

  function openAdd() {
    setEditing(null);
    setTitle("");
    setDate("");
    setType("anniversary");
    setRecurring(true);
    setEmoji("🎉");
    setColor("rose");
    setMemberId("");
    setNote("");
    setModalOpen(true);
  }

  function openEdit(item: AnniversaryWithMember) {
    setEditing(item);
    setTitle(item.title);
    setDate(toDateInput(item.date));
    setType((item.type as AnnivType) ?? "anniversary");
    setRecurring(item.recurring);
    setEmoji(item.emoji);
    setColor((item.color as PaletteKey) ?? "rose");
    setMemberId(item.memberId ?? "");
    setNote(item.note ?? "");
    setModalOpen(true);
  }

  function onTypeChange(next: AnnivType) {
    setType(next);
    // 이모지를 아직 안 건드렸으면 타입 기본 이모지로 맞춰줌
    if (!emoji.trim() || DEFAULT_EMOJIS.includes(emoji.trim())) {
      setEmoji(TYPE_META[next].emoji);
    }
  }

  async function save() {
    if (!title.trim() || !date || busy) return;
    setBusy(true);
    const payload = {
      title: title.trim(),
      date,
      type,
      recurring,
      emoji: emoji.trim() || TYPE_META[type].emoji,
      color,
      memberId: memberId || null,
      note: note.trim() || null,
    };
    try {
      if (editing) {
        const res = await fetch(`/api/anniversaries/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated: AnniversaryWithMember = await res.json();
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
          setModalOpen(false);
        }
      } else {
        const res = await fetch("/api/anniversaries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created: AnniversaryWithMember = await res.json();
          setItems((prev) => [...prev, created]);
          setModalOpen(false);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    if (editing?.id === id) setModalOpen(false);
    const res = await fetch(`/api/anniversaries/${id}`, { method: "DELETE" });
    if (!res.ok) setItems(prev);
  }

  return (
    <div>
      <PageHeader
        emoji="🎉"
        title="기념일"
        description="소중한 날들을 D-day로 챙겨요"
      >
        {/* 목록이 비면 아래 빈 화면의 초대가 같은 일을 한다 — 같은 버튼을 한 화면에
            두 번 두지 않는다(DESIGN.md §1 "화면당 강조는 하나만"). */}
        {items.length > 0 && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> 기념일 추가
          </Button>
        )}
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          emoji="🎂"
          title="아직 기념일이 없어요"
          description="생일과 소중한 날을 등록하면 D-day로 알려드릴게요."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> 첫 기념일 추가
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {/* 다가오는 D-day */}
          {featured.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle>다가오는 D-day</CardTitle>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map(({ item, d }) => (
                  <FeaturedCard
                    key={item.id}
                    item={item}
                    d={d}
                    onEdit={() => openEdit(item)}
                    onRemove={() => remove(item.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 그 밖의 날들 — featured 에 이미 실은 3건은 여기서 뺀다.
              예전에는 `decorated` 를 통째로 다시 그려 같은 생일이 위아래로 두 번 나왔다. */}
          {rest.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <CardTitle>{featured.length > 0 ? "그 밖의 날들" : "전체 기념일"}</CardTitle>
              <Tag color="lavender" className="font-num">
                {rest.length}
              </Tag>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map(({ item, d }) => (
                <ListCard
                  key={item.id}
                  item={item}
                  d={d}
                  onEdit={() => openEdit(item)}
                  onRemove={() => remove(item.id)}
                />
              ))}
            </div>
          </section>
          )}
        </div>
      )}

      {/* 추가 / 수정 모달 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        emoji={emoji || "🎉"}
        title={editing ? "기념일 수정" : "기념일 추가"}
        footer={
          <>
            {editing && (
              <Button
                variant="danger"
                onClick={() => remove(editing.id)}
                className="mr-auto"
              >
                <Trash2 className="h-4 w-4" /> 삭제
              </Button>
            )}
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={save} disabled={!title.trim() || !date || busy}>
              {editing ? "저장" : "추가"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="제목">
            <Input
              placeholder="예: 아빠 생일"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="날짜">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="종류">
              <Select
                value={type}
                onChange={(e) => onTypeChange(e.target.value as AnnivType)}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].emoji} {TYPE_META[t].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-sunken px-4 py-3">
            <Checkbox
              checked={recurring}
              onChange={setRecurring}
              color={color}
              label="매년 반복"
            />
            <button
              type="button"
              onClick={() => setRecurring((v) => !v)}
              className="flex flex-1 items-center gap-2 text-left"
            >
              <span className="text-sm font-semibold text-ink">매년 반복</span>
              <span className="text-xs text-ink-faint">
                해마다 돌아오는 날이에요
              </span>
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="이모지" hint="이 날을 대표할 이모지 하나">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🎂"
                maxLength={4}
                className="w-24 text-center text-xl"
              />
            </Field>
            <Field label="색">
              <div className="pt-1.5">
                <ColorPicker value={color} onChange={setColor} />
              </div>
            </Field>
          </div>

          {members.length > 0 && (
            <Field label="관련 가족" hint="선택 사항이에요">
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const active = memberId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMemberId(active ? "" : m.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-semibold transition",
                        active
                          ? "border-primary bg-primary-soft text-primary-ink"
                          : "border-line-strong bg-surface text-ink-soft hover:bg-sunken"
                      )}
                    >
                      <Avatar
                        emoji={m.emoji}
                        color={m.color}
                        name={m.name}
                        size="xs"
                      />
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <Field label="메모" hint="선택 사항이에요">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="함께 기억하고 싶은 이야기를 적어보세요."
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ── 다가오는 D-day: 큰 카드 ─────────────────────────── */
function FeaturedCard({
  item,
  d,
  onEdit,
  onRemove,
}: {
  item: AnniversaryWithMember;
  d: ReturnType<typeof dday>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const pal = palette(item.color);
  const meta = typeMeta(item.type);
  const isToday = d.days === 0;
  const age = item.type === "birthday" ? turningAge(item, d.nextDate) : 0;

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-4 border animate-fade-up",
        pal.soft,
        pal.border,
        isToday && cn("ring-2 ring-offset-2", pal.ring)
      )}
    >
      <CardActions onEdit={onEdit} onRemove={onRemove} />

      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface/80 text-3xl shadow-sm",
            isToday && "animate-float"
          )}
        >
          {item.emoji}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="truncate text-lg font-bold text-ink">{item.title}</p>
          <Tag color={item.color} dot className="mt-1.5">
            {meta.emoji} {meta.label}
          </Tag>
        </div>
      </div>

      {isToday ? (
        <p className={cn("font-num text-3xl font-bold", pal.ink)}>오늘! {item.emoji}</p>
      ) : (
        <p className={cn("flex items-baseline gap-1", pal.ink)}>
          <span className="font-num text-xl font-semibold">D-</span>
          <span className="font-num text-5xl font-bold leading-none">{d.days}</span>
        </p>
      )}

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-ink-soft">{kDate(d.nextDate)}</p>
          {age > 0 && (
            <p className={cn("mt-0.5 text-sm font-semibold", pal.ink)}>
              🎂 올해 <span className="font-num">{age}</span>살
            </p>
          )}
        </div>
        {item.member && (
          <Avatar
            emoji={item.member.emoji}
            color={item.member.color}
            name={item.member.name}
            size="sm"
          />
        )}
      </div>
    </Card>
  );
}

/* ── 전체 목록: 컴팩트 카드 ──────────────────────────── */
function ListCard({
  item,
  d,
  onEdit,
  onRemove,
}: {
  item: AnniversaryWithMember;
  d: ReturnType<typeof dday>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const pal = palette(item.color);
  const meta = typeMeta(item.type);
  const isToday = d.days === 0;
  const isPast = d.days < 0;
  const age = item.type === "birthday" ? turningAge(item, d.nextDate) : 0;

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-3",
        isPast && "opacity-70",
        isToday && cn("ring-2 ring-offset-2", pal.ring, pal.soft)
      )}
    >
      <CardActions onEdit={onEdit} onRemove={onRemove} />

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunken text-2xl">
          {item.emoji}
        </span>
        <div className="min-w-0 pr-8">
          <p className="truncate font-bold text-ink">{item.title}</p>
          <Tag color={item.color} dot className="mt-1">
            {meta.emoji} {meta.label}
          </Tag>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-num text-2xl font-bold", pal.ink)}>
          {isToday ? "오늘 🎉" : d.label}
        </span>
        <span className="shrink-0 text-xs text-ink-faint">
          {kDateShort(d.nextDate)}
        </span>
      </div>

      {(age > 0 || item.note || item.member) && (
        <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-soft">
            {age > 0 ? (
              <>
                올해 <span className="font-num font-semibold">{age}</span>살이 돼요
              </>
            ) : (
              item.note
            )}
          </p>
          {item.member && (
            <Avatar
              emoji={item.member.emoji}
              color={item.member.color}
              name={item.member.name}
              size="xs"
            />
          )}
        </div>
      )}
    </Card>
  );
}

/* ── 카드 우상단 수정/삭제 ───────────────────────────── */
function CardActions({
  onEdit,
  onRemove,
}: {
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <ItemActions
      actions={[
        { label: "수정", icon: Pencil, onClick: onEdit },
        { label: "삭제", icon: Trash2, onClick: onRemove, danger: true },
      ]}
    />
  );
}
