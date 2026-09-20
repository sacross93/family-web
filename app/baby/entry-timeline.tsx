"use client";

import { Pencil, Trash2, Plus } from "lucide-react";
import { Card, Tag, Avatar, Segmented, ItemActions, EmptyState, Button } from "@/components/ui";
import { MarkdownView } from "@/components/markdown-view";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { kDate, toDateInput, fromDateInput, pregnancyProgress, weekLabel } from "@/lib/date";
import type { BabyEntryWithAuthor } from "@/lib/types";
import { ENTRY_KINDS, KIND_META, kindMeta, type EntryKind } from "./baby-meta";

export type EntryFilter = "all" | EntryKind;

const FILTER_OPTIONS: { value: EntryFilter; label: string }[] = [
  { value: "all", label: "전체" },
  ...ENTRY_KINDS.map((k) => ({ value: k as EntryFilter, label: `${KIND_META[k].emoji} ${KIND_META[k].label}` })),
];

/** 날짜(yyyy-MM-dd)별 묶음, 최신 날짜 먼저. 같은 날 안에서는 넘어온 순서 유지 */
function groupByDate(entries: BabyEntryWithAuthor[]) {
  const map = new Map<string, BabyEntryWithAuthor[]>();
  for (const e of entries) {
    const key = toDateInput(e.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

export function EntryTimeline({
  entries,
  filter,
  onFilterChange,
  dueDate,
  birthDate,
  onEdit,
  onDelete,
  onCreate,
}: {
  entries: BabyEntryWithAuthor[];
  filter: EntryFilter;
  onFilterChange: (f: EntryFilter) => void;
  dueDate: Date | string;
  birthDate: Date | string | null;
  onEdit: (entry: BabyEntryWithAuthor) => void;
  onDelete: (entry: BabyEntryWithAuthor) => void;
  onCreate: () => void;
}) {
  const visible = filter === "all" ? entries : entries.filter((e) => e.kind === filter);
  const groups = groupByDate(visible);

  return (
    <div className="flex flex-col gap-4">
      {/* 목록에 이름을 붙이고, 더하는 버튼을 **그 목록 옆에** 둔다.
          전에는 페이지 맨 위 빈 줄에 버튼 하나만 떠 있었다 — 폰에서는 제목이
          상단바로 올라가면서 그 줄에 버튼만 남아, 무엇에 더하는 버튼인지 알 수 없었다. */}
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <h2 className="font-display text-xl font-bold text-ink">일기</h2>
        {/* 아직 한 편도 없으면 아래 빈 화면의 초대가 같은 일을 한다 —
            같은 버튼 둘이 한 화면에 보이면 어느 쪽을 눌러야 하나 머뭇거린다. */}
        {entries.length > 0 && (
          <Button size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4" /> 기록 남기기
          </Button>
        )}
      </div>

      <div className="overflow-x-auto pb-1">
        <Segmented value={filter} onChange={onFilterChange} options={FILTER_OPTIONS} />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          emoji="🌱"
          title="첫 기록을 남겨볼까요?"
          description="오늘의 몸 상태, 병원 이야기, 아기에게 한마디. 무엇이든 좋아요."
          action={<Button onClick={onCreate}>+ 기록 남기기</Button>}
        />
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">이 종류의 기록은 아직 없어요.</p>
      ) : (
        groups.map(([dateKey, items]) => {
          const day = fromDateInput(dateKey);
          const showWeek = !birthDate;
          return (
            <section key={dateKey} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2 px-1">
                <h3 className="text-sm font-bold text-ink">{kDate(day)}</h3>
                {showWeek && (
                  <span className="font-num text-xs text-ink-faint">{weekLabel(pregnancyProgress(dueDate, day))}</span>
                )}
              </div>
              {items.map((e) => {
                const meta = kindMeta(e.kind);
                const isLetter = e.kind === "letter";
                return (
                  <Card
                    key={e.id}
                    className={cn("group flex flex-col gap-3", isLetter && cn(palette("rose").soft, "border-transparent"))}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar emoji={e.author?.emoji} color={e.author?.color} name={e.author?.name} size="sm" />
                      <span className="text-sm font-semibold text-ink">{e.author?.name ?? "가족"}</span>
                      <Tag color={meta.color} className={cn(isLetter && "bg-surface/80")}>
                        {meta.emoji} {meta.label}
                      </Tag>
                      {e.mood && <span className="text-lg leading-none">{e.mood}</span>}
                      <ItemActions
                        inline
                        className="ml-auto"
                        actions={[
                          { label: "고치기", icon: Pencil, onClick: () => onEdit(e) },
                          { label: "삭제", icon: Trash2, onClick: () => onDelete(e), danger: true },
                        ]}
                      />
                    </div>
                    <MarkdownView>{e.content}</MarkdownView>
                  </Card>
                );
              })}
            </section>
          );
        })
      )}
    </div>
  );
}
