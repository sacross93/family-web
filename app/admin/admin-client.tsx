"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  ChevronRight,
  Upload,
  Trash2,
  ExternalLink,
  Save,
  ImagePlus,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Decoration, FamilyMember as FamilyMemberRow } from "@prisma/client";
import {
  PageHeader,
  Card,
  Button,
  Select,
  Field,
  Input,
  EmptyState,
  ColorDot,
  CollapsibleCard,
  IconButton,
  useConfirm,
  useToast,
} from "@/components/ui";
import { NAV, TAB_COUNT, type NavItem } from "@/lib/nav";
import { AGENT_NAME } from "@/lib/agent/name";
import type { SiteConfigData } from "@/lib/site";
import { cn } from "@/lib/utils";
import { MAX_EDGE, shrinkForUpload } from "@/lib/image-upload";

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
  fd.append("file", await shrinkForUpload(file, MAX_EDGE.brand));
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
    /* 설정 카드가 세로로 쌓이는 화면이라 폭을 가둔다 — 입력칸 하나가 1150px 로
       늘어나면 이름 같은 짧은 값도 화면 끝까지 간다. */
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader emoji="🎨" title="관리자" description="사이트 모양과 메뉴를 바꾸고, 사진으로 꾸며요" />

      <SiteSettingsCard site={site} onSaved={() => router.refresh()} />
      <NavEditorCard nav={nav} onSaved={() => router.refresh()} />
      <DecorationManager decorations={decorations} />
      <FamilyCard />
      {/* 기억 목록은 메뉴에 없다 — 매일 여는 화면이 아니라 한 번씩 확인하고 지우는 자리다.
          그래도 **길은 있어야 한다**: 한 번도 물어본 적이 없으면 이 화면이 있는 줄도 모른다. */}
      <Link
        href="/memories"
        className="flex items-center gap-3 rounded-lg border border-line bg-surface px-5 py-4 text-left transition hover:bg-sunken"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lavender-soft text-xl">
          🧠
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold text-ink">{AGENT_NAME}의 기억</span>
          <span className="block text-sm text-ink-soft">
            {AGENT_NAME}가 다음 대화에서도 기억하려고 적어 둔 것들을 보고 지워요
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
      </Link>
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
    <CollapsibleCard
      emoji="🏡"
      emojiClassName="bg-lavender-soft"
      title="사이트 설정"
      summary={form.siteName}
      defaultOpen
      className="gap-5"
    >

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
    </CollapsibleCard>
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
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sunken text-3xl ring-1 ring-line">
          {imageUrl ? (
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
  // 한 번에 한 항목만 펼친다 — 아홉 개를 다 펴 두면 폰에서 두 화면이다.
  const [editingHref, setEditingHref] = useState<string | null>(null);

  /** 순서 바꾸기. 앞 네 개가 폰 하단 탭이 되므로 **매일 쓰는 것을 위로** 올리면 된다. */
  function move(href: string, dir: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.href === href);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
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
        // 지금 화면에 보이는 **순서 그대로** 보낸다 — 앞 네 개가 폰 하단 탭이 된다.
        items.map((it, i) =>
          fetch("/api/nav", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              href: it.href,
              emoji: it.emoji,
              label: it.label,
              description: it.desc,
              sortOrder: i,
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
    <CollapsibleCard
      emoji="🧭"
      emojiClassName="bg-mint-soft"
      title="메뉴 편집"
      summary={`${items.length}개`}
      className="gap-5"
    >

      {/* 순서를 바꿀 수 있다는 걸 **여기서 알려 준다.** 화살표만 있으면 그게 무슨 뜻인지
          — 특히 "앞 네 개가 폰 아래 탭이 된다" 는 걸 — 알 길이 없다. */}
      <p className="rounded-md bg-sunken px-3 py-2 text-xs text-ink-soft">
        ↑↓ 로 순서를 바꿀 수 있어요. <b className="text-ink">맨 위 {TAB_COUNT}개</b>가 폰 아래 탭이 되고,
        나머지는 <b className="text-ink">더보기</b> 안에 들어가요.
      </p>

      {/* 아홉 항목 × 세 칸이 늘 펼쳐져 있으면 폰에서 두 화면이다. 대개 한 항목만 고치러 온다. */}
      <div className="flex flex-col gap-2">
        {items.map((it, idx) => {
          const open = editingHref === it.href;
          return (
            <div key={it.href} className="flex items-stretch gap-1 rounded-md border border-line">
              {/* 순서 바꾸기. 펼치는 버튼 **밖**에 둔다 — 버튼 안에 버튼을 넣을 수 없다. */}
              <div className="flex flex-col justify-center gap-0.5 py-1 pl-1">
                <IconButton
                  type="button"
                  size="sm"
                  aria-label={`${it.label} 위로`}
                  disabled={idx === 0}
                  onClick={() => move(it.href, -1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </IconButton>
                <IconButton
                  type="button"
                  size="sm"
                  aria-label={`${it.label} 아래로`}
                  disabled={idx === items.length - 1}
                  onClick={() => move(it.href, 1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setEditingHref(open ? null : it.href)}
                aria-expanded={open}
                className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left"
              >
                <ColorDot color={it.color} />
                <span className="text-lg">{it.emoji}</span>
                <span className="font-semibold text-ink">{it.label}</span>
                <span className="ml-auto truncate pl-2 text-xs text-ink-faint">{it.desc}</span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-ink-faint transition", open && "rotate-180")}
                />
              </button>
              {open && (
                <div className="flex flex-col gap-2 border-t border-line p-3 sm:flex-row sm:items-center">
                  <Input
                    value={it.emoji}
                    onChange={(e) => edit(it.href, { emoji: e.target.value })}
                    maxLength={8}
                    className="w-16 text-center text-lg"
                    aria-label={`${it.label} 아이콘`}
                  />
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
              )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={saveAll} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "저장 중…" : "메뉴 저장"}
        </Button>
        {msg && <span className="text-sm font-semibold text-mint-ink">{msg}</span>}
        <span className="text-xs text-ink-faint">경로(주소)와 색은 그대로예요</span>
      </div>
    </CollapsibleCard>
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
    <CollapsibleCard emoji="✨" emojiClassName="bg-peach-soft" title="페이지 꾸미기 (스티커)" className="gap-5">

      <Card className="flex flex-col gap-3 bg-gradient-to-br from-lavender-soft to-peach-soft">
        <p className="text-sm leading-relaxed text-ink">
          <b>꾸미기 시작</b>을 누르면 편집 모드가 켜져요. 아무 페이지나 다니면서{" "}
          <b>맨 위의 꾸미기</b>(데스크톱은 왼쪽 <b>이 페이지 꾸미기</b>)를 누르고,{" "}
          <b>사진 추가</b>로 올린 뒤 끌어서 이동·크기·회전·앞뒤를 바꾸면 됩니다. ✨
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
                  <div key={d.id} className="group relative overflow-hidden rounded-md border border-line bg-sunken">
                    <div className="flex aspect-square items-center justify-center p-3">
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
                      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-ink-faint shadow-sm transition hover:bg-danger-soft hover:text-danger-ink"
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
    </CollapsibleCard>
  );
}

/* ═══════════════════════════════════════════
   4) 가족 — 이름을 넣는 유일한 자리
   ═══════════════════════════════════════════ */

/**
 * 가족을 넣을 길이 **어디에도 없었다.** `prisma/seed.ts` 뿐이었고 그건 콘텐츠 표를 지우고
 * 다시 넣는 것이라 운영에서는 못 쓴다. 그래서 배포된 사이트는 가족 0명이었고, 할일 담당자·
 * 게시판 글쓴이·아기 기록 작성자·포동이의 "나는 ___" 이 전부 고를 사람이 없었다.
 *
 * 지우기는 **글을 같이 지우지 않는다** — 스키마의 관계가 전부 `onDelete: SetNull` 이라
 * 그 사람이 쓴 것은 남고 이름만 빈다. 그래도 물어보고 지운다(되돌릴 수 없다).
 */
function FamilyCard() {
  const { say } = useToast();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<FamilyMemberRow[] | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🙂");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);

  // 서버에서 한 번 받아 온다. 관리자 화면에서만 쓰는 목록이라 페이지 데이터에 싣지 않았다.
  useEffect(() => {
    fetch("/api/family")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, []);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, emoji, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        say(data?.error ?? "추가하지 못했어요.", "error");
        return;
      }
      setRows((prev) => [...(prev ?? []), data]);
      setName("");
      setRole("");
      setEmoji("🙂");
    } catch {
      say("연결을 확인해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: FamilyMemberRow) {
    const ok = await confirm({
      title: `${row.name} 님을 지울까요?`,
      description: "이 사람이 쓴 글과 할일은 그대로 남고, 이름만 비워져요.",
    });
    if (!ok) return;
    const before = rows ?? [];
    setRows(before.filter((r) => r.id !== row.id));
    const res = await fetch(`/api/family/${row.id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setRows(before);
      say("못 지웠어요.", "error");
    }
  }

  return (
    <CollapsibleCard emoji="👨‍👩‍👧‍👦" emojiClassName="bg-mint-soft" title="가족" className="gap-5">
      <p className="rounded-md bg-sunken px-3 py-2 text-xs text-ink-soft">
        여기 넣은 이름이 <b className="text-ink">할일 담당자 · 글쓴이 · 아기 기록 작성자</b>와
        {AGENT_NAME}의 <b className="text-ink">&ldquo;나는 ___&rdquo;</b>에 나와요.
      </p>

      {rows === null ? (
        <p className="text-sm text-ink-faint">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-soft">아직 아무도 없어요. 아래에서 한 명씩 더해 주세요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              <span className="text-xl">{row.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{row.name}</span>
                {row.role && <span className="block text-xs text-ink-faint">{row.role}</span>}
              </span>
              <IconButton aria-label={`${row.name} 지우기`} variant="danger" onClick={() => remove(row)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="grid grid-cols-[4.5rem_1fr] gap-2">
          <Field label="이모지">
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="text-center text-lg" />
          </Field>
          <Field label="이름">
            <Input
              placeholder="예: 엄마"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </Field>
        </div>
        <Field label="역할" hint="선택 사항이에요. 예: 첫째">
          <Input placeholder="예: 엄마" value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
        <Button onClick={add} disabled={!name.trim() || busy} className="self-start">
          <Plus className="h-4 w-4" /> 가족 더하기
        </Button>
      </div>
      {dialog}
    </CollapsibleCard>
  );
}
