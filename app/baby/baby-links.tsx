"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, ChevronDown, ExternalLink, Pencil } from "lucide-react";
import { Card, Input, Button, IconButton, Tag } from "@/components/ui";
import { palette } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { displayDomain } from "@/lib/url";
import type { BabyLink } from "@/lib/types";

/** 참고 사이트 모음. 한 줄 설명이 링크가 되고, 주소는 도메인만 보여줍니다.
 *  모바일은 기본 접힘(헤더 탭으로 펼침), lg 이상은 항상 펼침 */
export function BabyLinks({
  items,
  color,
  onAdd,
  onEditTitle,
  onRemove,
}: {
  items: BabyLink[];
  color: string;
  onAdd: (url: string, title: string) => void;
  onEditTitle: (id: string, title: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const cancelRef = useRef(false);
  const pal = palette(color);

  function add() {
    const u = url.trim();
    if (!u) return;
    onAdd(u, title.trim());
    setUrl("");
    setTitle("");
    setAdding(false);
  }

  function startEdit(item: BabyLink) {
    cancelRef.current = false;
    setEditingId(item.id);
    setDraft(item.title);
  }

  function commitEdit(item: BabyLink) {
    setEditingId(null);
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    const next = draft.trim();
    if (next === item.title) return;
    onEditTitle(item.id, next);
  }

  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        // 접었다 펴는 머리글 — 폰에서 눌리는 높이를 44px 로(DESIGN.md §9).
        className="flex min-h-11 w-full items-center gap-2.5 text-left lg:min-h-0 lg:pointer-events-none"
      >
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-lg", pal.soft)}>🔗</span>
        <h3 className="text-base font-bold text-ink">참고 사이트</h3>
        {items.length > 0 && (
          <Tag color={color} className="font-num ml-auto">
            {items.length}
          </Tag>
        )}
        <ChevronDown
          className={cn("h-4 w-4 text-ink-faint transition-transform lg:hidden", open && "rotate-180", items.length === 0 && "ml-auto")}
        />
      </button>

      <div className={cn("min-w-0 flex-col gap-3", open ? "flex" : "hidden lg:flex")}>
        {items.length === 0 ? (
          <p className="text-sm text-ink-faint">둘이 함께 보던 사이트를 모아두면 다시 찾기 쉬워요.</p>
        ) : (
          <ul className="flex min-w-0 flex-col">
            {items.map((it) => {
              const domain = displayDomain(it.url);
              const label = it.title.trim() || domain;
              return (
                <li key={it.id} className="group flex min-w-0 items-center gap-2 border-b border-line py-2 last:border-0">
                  {editingId === it.id ? (
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitEdit(it)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          cancelRef.current = true;
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder="한 줄 설명"
                      aria-label="한 줄 설명"
                      className="min-w-0 flex-1"
                    />
                  ) : (
                    <>
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={it.url}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        <span aria-hidden className="shrink-0 text-base">
                          🌐
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] text-ink">{label}</span>
                          {it.title.trim() && (
                            <span className="block truncate text-xs text-ink-faint">{domain}</span>
                          )}
                        </span>
                        {/* 모바일은 연필·휴지통이 항상 보여 폭이 빠듯하므로 새 탭 표시는 데스크톱에서만 */}
                        <ExternalLink className="hidden h-3.5 w-3.5 shrink-0 text-ink-faint lg:block" />
                      </a>
                      <IconButton
                        size="sm"
                        aria-label="설명 수정"
                        onClick={() => startEdit(it)}
                        className="opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        variant="danger"
                        size="sm"
                        aria-label="삭제"
                        onClick={() => onRemove(it.id)}
                        className="opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {adding ? (
          <div className="flex flex-col gap-2">
            <Input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="주소 (예: babynews.co.kr)"
              aria-label="주소"
              inputMode="url"
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="한 줄 설명 (선택)"
              aria-label="한 줄 설명"
            />
            <div className="flex gap-2">
              <Button variant="soft" size="sm" onClick={add} disabled={!url.trim()} className="flex-1">
                저장
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setUrl("");
                  setTitle("");
                }}
              >
                취소
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)} className="self-start">
            <Plus className="h-4 w-4" /> 사이트 추가
          </Button>
        )}
      </div>
    </Card>
  );
}
