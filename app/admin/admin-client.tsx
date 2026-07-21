"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  Sparkles,
  Upload,
  Trash2,
  ExternalLink,
  Save,
  ImagePlus,
  X,
} from "lucide-react";
import type { Decoration } from "@prisma/client";
import {
  PageHeader,
  Card,
  Button,
  Select,
  Field,
  Input,
  EmptyState,
  ColorDot,
} from "@/components/ui";
import { NAV, type NavItem } from "@/lib/nav";
import type { SiteConfigData } from "@/lib/site";
import { cn } from "@/lib/utils";

const PAGE_OPTIONS = [
  { value: "global", label: "🌈 모든 페이지" },
  ...NAV.map((n) => ({ value: n.href, label: `${n.emoji} ${n.label}` })),
];

function pageLabel(value: string) {
  return PAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** 업로드 후 URL 반환 */
async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) return null;
  const { urls } = await res.json();
  return urls?.[0] ?? null;
}

export function AdminClient({
  decorations,
  site,
  nav,
}: {
  decorations: Decoration[];
  site: SiteConfigData;
  nav: NavItem[];
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader emoji="🎨" title="관리자" description="사이트 모양과 메뉴를 바꾸고, 사진으로 꾸며요" />

      <SiteSettingsCard site={site} onSaved={() => router.refresh()} />
      <NavEditorCard nav={nav} onSaved={() => router.refresh()} />
      <DecorationManager decorations={decorations} />
    </div>
  );
}

/* ═══════════════════════════════════════════
   1) 사이트 설정 (브랜드 · 홈 히어로)
   ═══════════════════════════════════════════ */
function SiteSettingsCard({
  site,
  onSaved,
}: {
  site: SiteConfigData;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(site);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function set<K extends keyof SiteConfigData>(k: K, v: SiteConfigData[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setMsg("");
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/site-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          brandImageUrl: form.brandImageUrl ?? "",
          heroImageUrl: form.heroImageUrl ?? "",
        }),
      });
      if (res.ok) {
        setMsg("저장했어요 ✓");
        onSaved();
      } else {
        setMsg("저장에 실패했어요");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lavender-soft text-lg">🏡</span>
        <h2 className="text-base font-bold text-ink">사이트 설정</h2>
      </div>

      {/* 브랜드 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="이름" hint="사이드바·홈 인사에 나와요">
          <Input value={form.siteName} onChange={(e) => set("siteName", e.target.value)} placeholder="포동" />
        </Field>
        <Field label="소개 (부제)">
          <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="우리 가족 공간" />
        </Field>
      </div>

      <IconField
        label="브랜드 아이콘 (사이드바 로고)"
        emoji={form.brandEmoji}
        imageUrl={form.brandImageUrl}
        onEmoji={(v) => set("brandEmoji", v)}
        onImage={(url) => set("brandImageUrl", url)}
      />

      <hr className="border-line" />

      {/* 홈 히어로 */}
      <Field label="홈 인사 문구" hint="첫 화면의 부제 문구">
        <Input
          value={form.heroSubtitle}
          onChange={(e) => set("heroSubtitle", e.target.value)}
          placeholder="오늘도 우리 가족의 소중한 하루를 함께 채워봐요."
        />
      </Field>

      <IconField
        label="홈 큰 그림 (오른쪽 집)"
        emoji={form.heroEmoji}
        imageUrl={form.heroImageUrl}
        onEmoji={(v) => set("heroEmoji", v)}
        onImage={(url) => set("heroImageUrl", url)}
      />

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "저장 중…" : "저장"}
        </Button>
        {msg && <span className="text-sm font-semibold text-mint-ink">{msg}</span>}
      </div>
    </Card>
  );
}

/** 이모지 + (선택) 업로드 이미지 필드 */
function IconField({
  label,
  emoji,
  imageUrl,
  onEmoji,
  onImage,
}: {
  label: string;
  emoji: string;
  imageUrl: string | null;
  onEmoji: (v: string) => void;
  onImage: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    try {
      const url = await uploadImage(file);
      if (url) onImage(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label} hint="이모지를 쓰거나, 원하는 사진을 올려도 돼요">
      <div className="flex items-center gap-3">
        {/* 미리보기 */}
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sunken text-3xl ring-1 ring-line">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            emoji || "🙂"
          )}
        </span>
        {!imageUrl && (
          <Input
            value={emoji}
            onChange={(e) => onEmoji(e.target.value)}
            maxLength={8}
            className="w-20 text-center text-xl"
            aria-label="이모지"
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
        {imageUrl ? (
          <Button variant="ghost" size="sm" onClick={() => onImage(null)}>
            <X className="h-4 w-4" /> 이미지 빼기
          </Button>
        ) : (
          <Button variant="soft" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImagePlus className="h-4 w-4" /> {busy ? "올리는 중…" : "사진 올리기"}
          </Button>
        )}
      </div>
    </Field>
  );
}

/* ═══════════════════════════════════════════
   2) 메뉴 편집
   ═══════════════════════════════════════════ */
function NavEditorCard({ nav, onSaved }: { nav: NavItem[]; onSaved: () => void }) {
  const [items, setItems] = useState(nav);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function edit(href: string, patch: Partial<NavItem>) {
    setItems((prev) => prev.map((it) => (it.href === href ? { ...it, ...patch } : it)));
    setMsg("");
  }

  async function saveAll() {
    if (busy) return;
    setBusy(true);
    try {
      const results = await Promise.all(
        items.map((it) =>
          fetch("/api/nav", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              href: it.href,
              emoji: it.emoji,
              label: it.label,
              description: it.desc,
            }),
          }).then((r) => r.ok)
        )
      );
      setMsg(results.every(Boolean) ? "저장했어요 ✓" : "일부 저장 실패");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint-soft text-lg">🧭</span>
        <h2 className="text-base font-bold text-ink">메뉴 편집</h2>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <div
            key={it.href}
            className="flex flex-col gap-2 rounded-2xl border border-line p-3 sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-2">
              <ColorDot color={it.color} />
              <Input
                value={it.emoji}
                onChange={(e) => edit(it.href, { emoji: e.target.value })}
                maxLength={8}
                className="w-16 text-center text-lg"
                aria-label={`${it.label} 아이콘`}
              />
            </div>
            <Input
              value={it.label}
              onChange={(e) => edit(it.href, { label: e.target.value })}
              className="sm:w-40"
              aria-label="이름"
            />
            <Input
              value={it.desc}
              onChange={(e) => edit(it.href, { desc: e.target.value })}
              className="flex-1"
              aria-label="설명"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={saveAll} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "저장 중…" : "메뉴 저장"}
        </Button>
        {msg && <span className="text-sm font-semibold text-mint-ink">{msg}</span>}
        <span className="text-xs text-ink-faint">경로(주소)와 색은 그대로예요</span>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════
   3) 페이지 꾸미기 (스티커) — 기존
   ═══════════════════════════════════════════ */
function DecorationManager({ decorations }: { decorations: Decoration[] }) {
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
      const url = await uploadImage(file);
      if (!url) return;
      const rotation = Math.round((Math.random() * 16 - 8) * 10) / 10;
      const res = await fetch("/api/decorations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, url, xPct: 50, yPx: 220, width: 180, rotation, z: 20 }),
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

  const groups = items.reduce<Record<string, Decoration[]>>((acc, it) => {
    (acc[it.page] ??= []).push(it);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-peach-soft text-lg">✨</span>
        <h2 className="text-base font-bold text-ink">페이지 꾸미기 (스티커)</h2>
      </div>

      <Card className="flex flex-col gap-3 bg-gradient-to-br from-lavender-soft to-peach-soft">
        <p className="text-sm leading-relaxed text-ink">
          <b>꾸미기 시작</b>을 누르면 편집 모드가 켜져요. 아무 페이지나 다니면서 우하단 <b>꾸미기</b> 버튼의{" "}
          <b>사진 추가</b>로 올리고, 끌어서 이동·크기·회전·앞뒤를 바꾸면 됩니다. ✨
        </p>
        <div>
          <Button onClick={startDecorating}>
            <Sparkles className="h-4 w-4" /> 꾸미기 시작
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
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
          올린 사진은 해당 페이지 중앙에 놓여요. 위치·크기는 그 페이지에서 조절하세요.
        </p>
      </Card>

      {items.length === 0 ? (
        <EmptyState emoji="🖼️" title="아직 붙인 사진이 없어요" description="위에서 사진을 올려 페이지를 꾸며보세요." />
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
                  <div key={d.id} className="group relative overflow-hidden rounded-2xl border border-line bg-sunken">
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
                      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-ink-faint shadow-sm transition hover:bg-danger-soft hover:text-danger"
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
