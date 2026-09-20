"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { Card, Checkbox, Input, Button, IconButton, Tag } from "@/components/ui";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { BabyChecklistItem } from "@/lib/types";

/** 준비 체크리스트. 모바일은 기본 접힘(헤더 탭으로 펼침), lg 이상은 항상 펼침 */
export function BabyChecklist({
  items,
  color,
  onAdd,
  onAddDefaults,
  onToggle,
  onRemove,
}: {
  items: BabyChecklistItem[];
  color: string;
  onAdd: (text: string) => void;
  onAddDefaults: () => void;
  onToggle: (item: BabyChecklistItem) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const pal = palette(color);
  const doneCount = items.filter((i) => i.done).length;

  function add() {
    const v = text.trim();
    if (!v) return;
    onAdd(v);
    setText("");
  }

  return (
    <Card className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        // 접었다 펴는 머리글 — 폰에서 눌리는 높이를 44px 로(DESIGN.md §9).
        className="flex min-h-11 w-full items-center gap-2.5 text-left lg:min-h-0 lg:pointer-events-none"
      >
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-lg", pal.soft)}>✅</span>
        <h3 className="text-base font-bold text-ink">준비 체크리스트</h3>
        {items.length > 0 && (
          <Tag color={color} className="font-num ml-auto">
            {doneCount}/{items.length}
          </Tag>
        )}
        <ChevronDown
          className={cn("h-4 w-4 text-ink-faint transition-transform lg:hidden", open && "rotate-180", items.length === 0 && "ml-auto")}
        />
      </button>

      <div className={cn("flex-col gap-3", open ? "flex" : "hidden lg:flex")}>
        {items.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink-faint">준비할 것을 적어두면 하나씩 지워가는 재미가 있어요.</p>
            <Button variant="soft" size="sm" onClick={onAddDefaults}>
              기본 항목 넣기
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((it) => (
              <li key={it.id} className="group flex items-center gap-2.5 border-b border-line py-2 last:border-0">
                <Checkbox checked={it.done} onChange={() => onToggle(it)} color={color} size="sm" label={it.text} />
                <span className={cn("flex-1 text-[0.9375rem]", it.done ? "text-ink-faint line-through" : "text-ink")}>{it.text}</span>
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

        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="직접 추가…"
            aria-label="준비물 직접 추가"
            className="flex-1"
          />
          <Button variant="soft" onClick={add} disabled={!text.trim()} aria-label="추가">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
