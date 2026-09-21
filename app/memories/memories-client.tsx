"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Card, EmptyState, IconButton, PageHeader, Tag, useConfirm, useToast } from "@/components/ui";
import { kDateShort } from "@/lib/date";

export interface MemoryRow {
  id: string;
  text: string;
  by: string;
  createdAt: Date | string;
}

/**
 * 포동이가 적어 둔 것을 **가족이 직접 지우는** 자리.
 *
 * 고치기는 없다(추가 전용 규칙). 틀린 기억은 지우고 다시 말해 주면 된다.
 * 지우기는 숨은 제스처가 아니라 **보이는 휴지통**이다 — 저장소의 다른 목록과 같은 규칙.
 */
export function MemoriesClient({ initial }: { initial: MemoryRow[] | null }) {
  const { say } = useToast();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<MemoryRow[]>(initial ?? []);

  async function remove(row: MemoryRow) {
    if (!(await confirm({ title: "이 기억을 지울까요?", description: row.text }))) return;
    const before = rows;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      const res = await fetch(`/api/memories/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("실패");
    } catch {
      setRows(before);
      say("못 지웠어요. 연결을 확인해 주세요.", "error");
    }
  }

  return (
    <div>
      <PageHeader
        emoji="🧠"
        title="포동이의 기억"
        description="포동이가 다음 대화에서도 기억하려고 적어 둔 것들이에요"
        summary={rows.length > 0 ? `기억 ${rows.length}개` : undefined}
      />

      {/* 못 읽은 것과 없는 것은 **다른 말**이다. 섞으면 "포동이가 다 잊었네" 로 읽힌다. */}
      {initial === null ? (
        <Card className="flex flex-col gap-2 py-10 text-center">
          <p className="font-display text-lg font-bold text-ink">아직 확인할 수 없어요</p>
          <p className="text-sm text-ink-soft">
            기억을 담을 자리가 아직 준비되지 않았어요. 잠시 뒤 다시 와 주세요.
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          emoji="🌱"
          title="아직 기억한 게 없어요"
          description="포동이에게 “이건 기억해 줘” 라고 말해 보세요."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Card key={row.id} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-[0.9375rem] leading-relaxed text-ink">{row.text}</p>
                <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-faint">
                  {/* 누가 적었는지를 **먼저** 보여 준다. 포동이가 짐작한 것과 가족이
                      말해 준 것이 같아 보이면, 잘못 짐작한 기억이 사실처럼 굳는다. */}
                  <Tag color={row.by === "가족" ? "mint" : "lavender"}>{row.by}</Tag>
                  <span className="font-num">{kDateShort(row.createdAt)}</span>
                </p>
              </div>
              {/* 숨기지 않는다 — 모바일에서도 늘 보이는 휴지통(AGENTS.md). */}
              <IconButton aria-label="기억 지우기" variant="danger" onClick={() => remove(row)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </Card>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
