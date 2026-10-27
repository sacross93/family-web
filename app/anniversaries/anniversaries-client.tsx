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
  Label,
  Input,
  Textarea,
  Select,
  Checkbox,
  ColorPicker,
  ItemActions,
  Segmented,
  useToast,
} from "@/components/ui";
import { palette, type PaletteKey } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { kDate, kDateShort } from "@/lib/date";
import { anniversaryWhen, type AnniversaryWhen } from "@/lib/anniversary-dates";
import {
  LUNAR_MAX_YEAR,
  LUNAR_MIN_YEAR,
  hasLeapMonth,
  lunarLabel,
  lunarToSolar,
  solarToLunar,
} from "@/lib/lunar";
import type { AnniversaryItem, FamilyMember } from "@/lib/types";

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

type CalendarKind = "solar" | "lunar";

const LUNAR_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const LUNAR_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

/**
 * 폼의 음력 칸 → 양력 날짜. 적은 날이 **그 해에 정말 있을 때만** 날짜를 준다 — 생일 그 자체를 적는
 * 자리라 없는 날을 다른 날로 바꿔 주면 안 된다(해마다 돌아오는 날에서만 평달·29일로 넘긴다, lib/lunar.ts).
 * 없으면 왜 없는지 한 줄. 연도를 다 적기 전(네 자리 전)에는 아무 말도 하지 않는다 — 치는 중에 "범위 밖" 이 깜빡인다.
 */
function lunarPreview(
  yearText: string,
  month: number,
  day: number,
  leap: boolean
): { date: Date | null; message: string | null } {
  const t = yearText.trim();
  if (!/^\d{4}$/.test(t)) return { date: null, message: null };
  const year = Number(t);
  if (year < LUNAR_MIN_YEAR || year > LUNAR_MAX_YEAR) {
    return { date: null, message: `${LUNAR_MIN_YEAR}~${LUNAR_MAX_YEAR}년 사이로 적어 주세요.` };
  }
  if (leap && !hasLeapMonth(year, month)) {
    return { date: null, message: `${year}년에는 윤${month}월이 없어요.` };
  }
  const date = lunarToSolar(year, { month, day, leap });
  if (date) return { date, message: null };
  if (day === 30 && lunarToSolar(year, { month, day: 29, leap })) {
    return { date: null, message: `${year}년 음력 ${leap ? "윤" : ""}${month}월은 29일까지예요.` };
  }
  return { date: null, message: "이 날짜는 바꿀 수 없어요. 날짜를 다시 골라 주세요." };
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
  item: AnniversaryItem;
  d: AnniversaryWhen;
};

/** 다가오는 것 먼저(가까운 순), 지난 것은 뒤로(최근 지난 순) */
function compareDecorated(a: Decorated, b: Decorated) {
  const aPast = a.d.days < 0;
  const bPast = b.d.days < 0;
  if (aPast !== bPast) return aPast ? 1 : -1;
  if (aPast) return b.d.days - a.d.days; // -1 이 -30 보다 앞
  return a.d.days - b.d.days; // 다가오는 건 작은 수(가까운) 먼저
}

/** 실패한 응답의 `{ error }` 문구. 본문이 없거나 못 읽으면 대신할 말. */
async function errorOf(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

/** 다가오는 생일에 몇 살이 되는지 (반복 생일 기준). 음력 생일은 음력 해로 센다(`anniversaryWhen`). */
function turningAge(item: AnniversaryItem, d: AnniversaryWhen) {
  return item.type === "birthday" ? d.years : 0;
}

export function AnniversariesClient({
  initialItems,
  members,
}: {
  initialItems: AnniversaryItem[];
  members: FamilyMember[];
}) {
  const { say } = useToast();
  const [items, setItems] = useState(initialItems);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AnniversaryItem | null>(null);
  const [busy, setBusy] = useState(false);

  // 폼 상태
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  // 음력이면 해·달·날·윤달을 따로 받는다. 저장할 때는 양력 날짜(date)와 음력 줄을 함께 보낸다.
  const [kind, setKind] = useState<CalendarKind>("solar");
  const [lunarYear, setLunarYear] = useState("");
  const [lunarMonth, setLunarMonth] = useState(1);
  const [lunarDay, setLunarDay] = useState(1);
  const [lunarLeap, setLunarLeap] = useState(false);
  const [type, setType] = useState<AnnivType>("anniversary");
  const [recurring, setRecurring] = useState(true);
  const [emoji, setEmoji] = useState("🎉");
  const [color, setColor] = useState<PaletteKey>("rose");
  const [memberId, setMemberId] = useState("");
  const [note, setNote] = useState("");

  // 음력 기념일은 음력으로 센 다음 날 — 홈·포동이·달력과 같은 한 곳(lib/anniversary-dates.ts)에서.
  const decorated = items
    .map((item) => ({ item, d: anniversaryWhen(item) }))
    .sort(compareDecorated);

  const preview =
    kind === "lunar" ? lunarPreview(lunarYear, lunarMonth, lunarDay, lunarLeap) : { date: null, message: null };
  const canSave = !!title.trim() && (kind === "lunar" ? !!preview.date : !!date) && !busy;

  // 크게 보여 주는 것은 **가장 가까운 하나뿐**이다.
  // 전에는 셋을 큰 파스텔 카드로 그려, 폰에서 세 카드가 720px 을 먹고
  // 48px 짜리 D-day 숫자 셋이 서로 목소리를 높였다(DESIGN §1 "과감함은 한 곳에").
  const featured = decorated.filter((x) => x.d.days >= 0).slice(0, 1);
  // 위에 크게 실은 것은 아래에서 뺀다 — 6건 보려고 두 벌을 스크롤하지 않게.
  const featuredIds = new Set(featured.map((x) => x.item.id));
  const rest = decorated.filter((x) => !featuredIds.has(x.item.id));

  /** 음력 칸을 양력 날짜에서 채운다(바꿀 수 없는 날이면 비워 둔다). */
  function fillLunarFrom(solar: Date | null) {
    const l = solar ? solarToLunar(solar) : null;
    setLunarYear(l ? String(l.year) : "");
    setLunarMonth(l?.month ?? 1);
    setLunarDay(l?.day ?? 1);
    setLunarLeap(l?.leap ?? false);
  }

  /**
   * 양력 ↔ 음력을 바꾸면 **적어 둔 날을 옮겨 적는다** — 양력으로 고른 날을 음력으로 바꾸면 그 날의 음력이,
   * 음력으로 적은 날을 양력으로 바꾸면 그 양력 날짜가 칸에 들어간다. 비워 두면 다시 적어야 하고,
   * 무엇이 무엇인지 맞춰 볼 길도 사라진다.
   */
  function onKindChange(next: CalendarKind) {
    if (next === kind) return;
    if (next === "lunar") fillLunarFrom(date ? new Date(`${date}T00:00:00`) : null);
    else if (preview.date) setDate(toDateInput(preview.date));
    setKind(next);
  }

  function openAdd() {
    setEditing(null);
    setTitle("");
    setDate("");
    setKind("solar");
    fillLunarFrom(null);
    setType("anniversary");
    setRecurring(true);
    setEmoji("🎉");
    setColor("rose");
    setMemberId("");
    setNote("");
    setModalOpen(true);
  }

  function openEdit(item: AnniversaryItem) {
    setEditing(item);
    setTitle(item.title);
    setDate(toDateInput(item.date));
    // 음력 기념일 — 달·날·윤달은 음력 줄에서, 해는 저장된 양력 날짜에서 되짚는다(표에 해가 없다).
    setKind(item.lunar ? "lunar" : "solar");
    if (item.lunar) {
      const y = solarToLunar(new Date(item.date))?.year;
      setLunarYear(y ? String(y) : "");
      setLunarMonth(item.lunar.month);
      setLunarDay(item.lunar.day);
      setLunarLeap(item.lunar.leap);
    } else {
      fillLunarFrom(new Date(item.date));
    }
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
    if (!canSave) return;
    setBusy(true);
    const payload = {
      title: title.trim(),
      // 음력이면 그 음력 날의 양력 날짜. 라우트가 둘이 같은 날인지 다시 본다.
      date: kind === "lunar" && preview.date ? toDateInput(preview.date) : date,
      // **언제나 싣는다**(객체 아니면 null). 빼면 라우트는 "음력은 그대로" 로 읽고,
      // 음력 기념일에 날짜만 오면 400 이다(포동이를 막는 규칙) — 화면이 그 규칙에 걸리면 안 된다.
      lunar: kind === "lunar" ? { month: lunarMonth, day: lunarDay, leap: lunarLeap } : null,
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
          const updated: AnniversaryItem = await res.json();
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
          setModalOpen(false);
        } else {
          say(await errorOf(res, "기념일을 못 저장했어요."), "error");
        }
      } else {
        const res = await fetch("/api/anniversaries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created: AnniversaryItem = await res.json();
          setItems((prev) => [...prev, created]);
          setModalOpen(false);
        } else {
          say(await errorOf(res, "기념일을 못 저장했어요."), "error");
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
      // 403(만든 사람이 아님)은 서버 말을 그대로 — "잠시 후 다시" 는 다시 해도 안 되는 일에 거짓말이다.
      say(res ? await errorOf(res, "못 지웠어요. 잠시 후 다시 해 주세요.") : "못 지웠어요. 잠시 후 다시 해 주세요.", "error");
    }
  }

  return (
    /* 히어로 하나 + 한 줄짜리 목록이라 데스크톱에서 폭을 가둔다.
       페이지 폭에 그대로 펼치면 이름과 D-day 가 1100px 떨어지고, 히어로도 오른쪽이
       텅 빈다(장보기·할일과 같은 이유). */
    <div className="mx-auto max-w-3xl">
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
            <Button onClick={save} disabled={!canSave}>
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

          {/* 날짜 — 양력/음력. 부모님 생일처럼 음력으로 지내는 날은 음력으로 적어 두면 해마다 음력으로 센다. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              {/* 음력일 때는 칸이 셋이라 각 칸이 제 이름(연도·월·일)을 갖는다 — 이 글자는 묶음의 제목이다. */}
              <Label htmlFor={kind === "solar" ? "anniv-date" : undefined} className="mb-0">
                날짜
              </Label>
              <Segmented
                value={kind}
                onChange={onKindChange}
                options={[
                  { value: "solar", label: "양력" },
                  { value: "lunar", label: "음력" },
                ]}
              />
            </div>
            {kind === "solar" ? (
              <Input
                id="anniv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            ) : (
              <>
                {/* 연도는 직접 적고(생년은 고르기엔 너무 길다) 달·날은 고른다. 폰 폭에서는 한 줄에 셋.
                    격자로 셋을 박아 두면 글자 1.5배(360px)에서 달·날 칸이 화살표 자리만 남아 "3월" 이 안 보였다 —
                    rem 너비로 두고 모자라면 아래로 내려가게 한다(DESIGN §9). */}
                <div className="flex flex-wrap gap-2">
                  <Field label="연도" className="min-w-0 grow basis-[7rem]">
                    <Input
                      inputMode="numeric"
                      placeholder="1962"
                      maxLength={4}
                      value={lunarYear}
                      onChange={(e) => setLunarYear(e.target.value.replace(/\D/g, ""))}
                      aria-label="음력 연도"
                    />
                  </Field>
                  <Field label="월" className="min-w-0 grow basis-[5.5rem]">
                    <Select
                      value={lunarMonth}
                      onChange={(e) => setLunarMonth(Number(e.target.value))}
                      aria-label="음력 월"
                    >
                      {LUNAR_MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}월
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="일" className="min-w-0 grow basis-[5.5rem]">
                    <Select
                      value={lunarDay}
                      onChange={(e) => setLunarDay(Number(e.target.value))}
                      aria-label="음력 일"
                    >
                      {LUNAR_DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}일
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox checked={lunarLeap} onChange={setLunarLeap} color={color} label="윤달" />
                  <button
                    type="button"
                    onClick={() => setLunarLeap((v) => !v)}
                    className="flex flex-1 flex-wrap items-baseline gap-x-2 text-left"
                  >
                    <span className="text-sm font-semibold text-ink">윤달</span>
                    <span className="text-xs text-ink-faint">윤{lunarMonth}월이면 켜 주세요</span>
                  </button>
                </div>
                {/* 바꾼 양력 날짜를 바로 보여 준다 — 음력은 맞게 적었는지 눈으로 맞춰 볼 길이 이것뿐이다. */}
                <p
                  aria-live="polite"
                  className={cn(
                    "rounded-md px-4 py-3 text-sm",
                    preview.message ? "bg-danger-soft text-danger-ink" : "bg-sunken text-ink-soft"
                  )}
                >
                  {preview.date
                    ? `양력 ${kDate(preview.date)}`
                    : preview.message ?? "음력 날짜를 적으면 양력 날짜를 알려 드려요."}
                </p>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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

          <div className="flex items-center gap-3 rounded-md bg-sunken px-4 py-3">
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
  item: AnniversaryItem;
  d: AnniversaryWhen;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const meta = typeMeta(item.type);
  const isToday = d.days === 0;
  const age = turningAge(item, d);

  return (
    /* `group` — 데스크톱의 수정·삭제 아이콘은 `group-hover` 로 뜬다. 이게 없으면 아이콘이
       영영 투명해서 데스크톱에서는 고칠 길이 없었다(폰의 `…` 만 됐다). */
    <section className="group on-chrome relative rounded-xl bg-gradient-to-br from-chrome via-chrome to-peach-soft p-6 sm:p-8">
      {item.canEdit && <CardActions onEdit={onEdit} onRemove={onRemove} />}

      <div className="flex items-center gap-2.5 pr-10">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xl">
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
      <p className="font-num mt-3 text-base text-ink-soft">
        {isToday
          ? `${meta.label}을 축하해요 ${item.emoji}`
          : `${kDate(d.nextDate)}까지 ${d.days}일`}
      </p>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-ink/20 pt-4 text-sm text-chrome-faint">
        {/* 가운뎃점으로 잇지 않는다(DESIGN §3) — 여백이 이미 구분을 한다. */}
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span>
            {meta.emoji} {meta.label}
          </span>
          {/* 위의 날짜는 양력이다 — 음력으로 지내는 날이면 그 이름을 여기 둔다. */}
          {item.lunar && <span className="font-num">{lunarLabel(item.lunar)}</span>}
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
  item: AnniversaryItem;
  d: AnniversaryWhen;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const pal = palette(item.color);
  const meta = typeMeta(item.type);
  const isToday = d.days === 0;
  const isPast = d.days < 0;
  const age = turningAge(item, d);

  return (
    <li
      className={cn(
        // `group` — 데스크톱 수정·삭제 아이콘이 `group-hover` 로 뜬다(위 FeaturedCard 와 같은 이유).
        "group flex items-center gap-3 border-b border-line px-5 py-3 last:border-0",
        isPast && "opacity-60",
        isToday && pal.soft
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-xl">
        {item.emoji}
      </span>
      {/* 잘라내지 않고 접는다. 글자를 1.5배로 키우면 `truncate` 는 "3월 21일 (일) 올…"
          처럼 반을 날려 버린다 — 줄이 한 줄 늘어나는 편이 낫다(DESIGN §9). */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{item.title}</p>
        <p className="text-xs text-ink-faint">
          {kDateShort(d.nextDate)}
          {/* 음력이면 양력 날짜 뒤에 음력 이름 — 해마다 양력 날짜가 바뀌는 까닭이 여기서 보인다. */}
          {item.lunar && ` ${lunarLabel(item.lunar)}`}
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
      {item.canEdit ? (
        <ItemActions
          inline
          quiet
          actions={[
            { label: "수정", icon: Pencil, onClick: onEdit },
            { label: "삭제", icon: Trash2, onClick: onRemove, danger: true },
          ]}
        />
      ) : (
        /* 못 고치는 줄도 그 자리를 비워 둔다 — 빼면 D-day 가 오른쪽으로 밀려 세로줄이 어긋난다.
           폭은 ItemActions 그대로: 폰 `…` 하나(w-10), 데스크톱 아이콘 둘(w-8 ×2 + gap-1). */
        <span aria-hidden className="w-10 shrink-0 lg:w-17" />
      )}
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
