"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
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
  useToast,
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
  const { say } = useToast();
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

  // 크게 보여 주는 것은 **가장 가까운 하나뿐**이다.
  // 전에는 셋을 큰 파스텔 카드로 그려, 폰에서 세 카드가 720px 을 먹고
  // 48px 짜리 D-day 숫자 셋이 서로 목소리를 높였다(DESIGN §1 "과감함은 한 곳에").
  const featured = decorated.filter((x) => x.d.days >= 0).slice(0, 1);
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
    } catch {
      // 네트워크가 끊기면 fetch 는 거부된다 — catch 가 없으면 조용히 사라진다.
      say("기념일을 못 저장했어요. 연결을 확인해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    if (editing?.id === id) setModalOpen(false);
    const res = await fetch(`/api/anniversaries/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setItems(prev);
      say("못 지웠어요. 잠시 후 다시 해 주세요.", "error");
    }
  }

  return (
    <div>
      {/* 더하는 버튼은 아래 목록 머리글에 있다 — 폰에서 제목이 상단바로 올라가면
          이 줄에 버튼 하나만 덩그러니 남는다(DESIGN §6). */}
      <PageHeader
        emoji="🎉"
        title="기념일"
        description="소중한 날들을 D-day로 챙겨요"
      />

      {items.length === 0 ? (
        <EmptyState
          emoji="🎂"
          title="아직 기념일이 없어요"
          description="생일과 소중한 날을 등록하면 며칠 남았는지 세어 드릴게요."
          action={
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> 첫 기념일 추가
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* 가장 가까운 하루 — 이 화면의 한 가지 */}
          {featured.map(({ item, d }) => (
            <FeaturedCard
              key={item.id}
              item={item}
              d={d}
              onEdit={() => openEdit(item)}
              onRemove={() => remove(item.id)}
            />
          ))}

          {rest.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
                <h2 className="font-display text-xl font-bold text-ink">
                  {featured.length > 0 ? "그 밖의 날들" : "기념일"}
                </h2>
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> 기념일 추가
                </Button>
              </div>
              <Card flush>
                <ul className="flex flex-col">
                  {rest.map(({ item, d }) => (
                    <AnniversaryRow
                      key={item.id}
                      item={item}
                      d={d}
                      onEdit={() => openEdit(item)}
                      onRemove={() => remove(item.id)}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          ) : (
            <div className="flex justify-end">
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4" /> 기념일 추가
              </Button>
            </div>
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

/* ── 가장 가까운 하루 ─────────────────────────────────
   이 화면에서 크게 말하는 것은 하나뿐이다. 나머지는 아래 줄로 내려간다. */
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
  const meta = typeMeta(item.type);
  const isToday = d.days === 0;
  const age = item.type === "birthday" ? turningAge(item, d.nextDate) : 0;

  return (
    <section className="on-chrome relative rounded-xl bg-chrome p-6 sm:p-8">
      <CardActions onEdit={onEdit} onRemove={onRemove} />

      <div className="flex items-center gap-2.5 pr-10">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/90 text-xl">
          {item.emoji}
        </span>
        <p className="min-w-0 truncate font-display text-lg font-bold text-chrome-ink">
          {item.title}
        </p>
      </div>

      <p className="mt-5 font-display text-6xl font-bold leading-none text-chrome-ink sm:text-7xl">
        {isToday ? "오늘이에요" : d.label}
      </p>

      {/* 강조색은 '지금 벌어지는 일' 에만(DESIGN §2). 여기가 그 자리다. */}
      <p className="font-num mt-3 text-base text-accent">
        {isToday
          ? `${meta.label}을 축하해요 ${item.emoji}`
          : `${kDate(d.nextDate)}까지 ${d.days}일`}
      </p>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm text-chrome-faint">
        {/* 가운뎃점으로 잇지 않는다(DESIGN §3) — 여백이 이미 구분을 한다. */}
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span>
            {meta.emoji} {meta.label}
          </span>
          {age > 0 && <span className="font-num">올해 {age}살</span>}
        </span>
        {item.member && (
          <Avatar
            emoji={item.member.emoji}
            color={item.member.color}
            name={item.member.name}
            size="sm"
          />
        )}
      </div>
    </section>
  );
}

/* ── 그 밖의 날들: 판 하나 안의 줄 ──────────────────────
   전에는 하나하나가 카드였다. 카드 열둘은 스무 화면이 되고, 무엇이 가까운지
   한눈에 안 들어온다. 줄로 세우면 날짜가 세로로 줄을 맞춘다. */
function AnniversaryRow({
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
    <li
      className={cn(
        "flex items-center gap-3 border-b border-line px-5 py-3 last:border-0",
        isPast && "opacity-60",
        isToday && pal.soft
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sunken text-xl">
        {item.emoji}
      </span>
      {/* 잘라내지 않고 접는다. 글자를 1.5배로 키우면 `truncate` 는 "3월 21일 (일) 올…"
          처럼 반을 날려 버린다 — 줄이 한 줄 늘어나는 편이 낫다(DESIGN §9). */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{item.title}</p>
        <p className="text-xs text-ink-faint">
          {kDateShort(d.nextDate)}
          {age > 0 && ` 올해 ${age}살`}
          {age === 0 && item.note ? ` ${item.note}` : ""}
        </p>
      </div>
      <span
        className={cn(
          "font-num shrink-0 text-sm font-bold",
          isToday ? pal.ink : "text-ink-soft"
        )}
      >
        {isToday ? `오늘 ${meta.emoji}` : d.label}
      </span>
      <ItemActions
        inline
        quiet
        actions={[
          { label: "수정", icon: Pencil, onClick: onEdit },
          { label: "삭제", icon: Trash2, onClick: onRemove, danger: true },
        ]}
      />
    </li>
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
