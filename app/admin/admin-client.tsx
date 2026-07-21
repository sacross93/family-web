"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { Sparkles, Upload, Trash2, ExternalLink } from "lucide-react";
import type { Decoration } from "@prisma/client";
import { PageHeader, Card, Button, Select, Field, EmptyState } from "@/components/ui";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const PAGE_OPTIONS = [
  { value: "global", label: "🌈 모든 페이지" },
  ...NAV.map((n) => ({ value: n.href, label: `${n.emoji} ${n.label}` })),
];

function pageLabel(value: string) {
  return PAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function AdminClient({ decorations }: { decorations: Decoration[] }) {
  const router = useRouter();
  const [items, setItems] = useState(decorations);
  const [page, setPage] = useState("global");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function startDecorating() {
    localStorage.setItem("podong_edit_mode", "1");
    router.push("/");
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const { urls } = await up.json();
      const url = urls?.[0];
      if (!url) return;
      const rotation = Math.round((Math.random() * 16 - 8) * 10) / 10;
      const res = await fetch("/api/decorations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, url, xPct: 50, yPx: 220, width: 180, rotation }),
      });
      if (res.ok) {
        const created = await res.json();
        setItems((prev) => [...prev, created]);
      }
    } finally {
      setUploading(false);
    }
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    fetch(`/api/decorations/${id}`, { method: "DELETE" }).catch(() => {});
  }

  // 페이지별 그룹핑
  const groups = items.reduce<Record<string, Decoration[]>>((acc, it) => {
    (acc[it.page] ??= []).push(it);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader emoji="🎨" title="관리자 · 꾸미기" description="사진을 올려 페이지 곳곳에 붙여요">
        <Button onClick={startDecorating}>
          <Sparkles className="h-4 w-4" /> 꾸미기 시작
        </Button>
      </PageHeader>

      {/* 안내 */}
      <Card className="mb-5 bg-gradient-to-br from-lavender-soft to-peach-soft">
        <p className="text-sm leading-relaxed text-ink">
          <b>꾸미기 시작</b>을 누르면 편집 모드가 켜져요. 그 상태로 아무 페이지나 다니면서
          우하단 <b>꾸미기</b> 버튼의 <b>사진 추가</b>로 사진을 올리고,
          <b> 끌어서 이동 · 모서리로 크기 · 위 손잡이로 회전</b>하면 됩니다. 원하는 위치에 자유롭게! ✨
        </p>
      </Card>

      {/* 업로드 */}
      <Card className="mb-6 flex flex-col gap-3">
        <p className="text-sm font-bold text-ink">사진 바로 올리기</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="어느 페이지에?" className="sm:w-56">
            <Select value={page} onChange={(e) => setPage(e.target.value)}>
              {PAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <Button variant="soft" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" /> {uploading ? "올리는 중…" : "사진 선택"}
          </Button>
        </div>
        <p className="text-xs text-ink-faint">
          올린 사진은 해당 페이지 중앙에 놓여요. 위치·크기·회전은 그 페이지에서 조절하세요.
        </p>
      </Card>

      {/* 스티커 목록 */}
      {items.length === 0 ? (
        <EmptyState
          emoji="🖼️"
          title="아직 붙인 사진이 없어요"
          description="위에서 사진을 올려 페이지를 꾸며보세요."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(groups).map(([pg, list]) => (
            <div key={pg}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-bold text-ink">{pageLabel(pg)}</span>
                {pg !== "global" && (
                  <Link
                    href={pg}
                    className="flex items-center gap-1 text-xs font-semibold text-ink-faint transition hover:text-primary"
                  >
                    그 페이지로 <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {list.map((d) => (
                  <div
                    key={d.id}
                    className="group relative overflow-hidden rounded-2xl border border-line bg-sunken"
                  >
                    <div className="flex aspect-square items-center justify-center p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={d.url}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        style={{ transform: `rotate(${d.rotation}deg)` }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(d.id)}
                      aria-label="삭제"
                      className={cn(
                        "absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-ink-faint shadow-sm transition",
                        "hover:bg-danger-soft hover:text-danger"
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
