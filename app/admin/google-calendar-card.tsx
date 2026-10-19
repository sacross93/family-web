"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { Button, CollapsibleCard, Spinner, useConfirm } from "@/components/ui";
// 모양은 prisma 없는 contract.ts 에서 — 엔진(sync.ts)은 prisma 를 들이는 서버 전용이라 "use client" 파일이 import 하지 않는다.
import type { GcalStatus, GcalStatusBody, SyncOutcome } from "@/lib/gcal/contract";
import { kDateShortYear, kTime } from "@/lib/date";
import { cn } from "@/lib/utils";

type Note = { tone: "ok" | "error"; text: string } | null;
type Counts = { toPush: number; toLink: number; toImport: number };

/**
 * 관리자 화면 「구글 캘린더」 — 동기화가 켜져 있는지, 어디까지 맞췄는지, 그리고 [처음 맞추기]·[지금 맞추기](스펙 §5·§7).
 *
 * 상태는 서버 컴포넌트가 `gcalStatus()` 로 미리 읽어 준다(빠르다 — DB 만 본다). **미리보기는 구글을 읽으므로**
 * 몇 초 걸려 페이지를 붙잡지 않게, 카드가 열릴 때 `/api/google/status` 로 따로 받는다.
 * 키·토큰은 여기 오지도 않는다(서버가 싣지 않는다). 대상 캘린더 ID(가족의 구글 주소)는 관리자만 보는 화면이라 보인다.
 */
export function GoogleCalendarCard({ initial }: { initial: GcalStatus | null }) {
  const [status, setStatus] = useState<GcalStatusBody | null>(initial);

  return (
    <CollapsibleCard
      emoji="📅"
      emojiClassName="bg-peach-soft"
      title="구글 캘린더"
      summary={summaryOf(status)}
      className="gap-5"
    >
      <Body status={status} onStatus={setStatus} />
    </CollapsibleCard>
  );
}

/** 접혀 있을 때 오른쪽 한 줄. 모르는 것은 비워 둔다 — "꺼짐" 으로 쓰면 멀쩡한 연결을 괜히 손보게 된다. */
function summaryOf(s: GcalStatusBody | null): string | undefined {
  if (!s) return undefined;
  if (s.config === "missing") return "꺼짐";
  if (s.config === "bad_key") return "키 확인 필요";
  if (!s.initialDoneAt) return "처음 맞추기 전";
  if (s.lastError) return "오류 있음";
  return s.lastSyncAt ? `${kDateShortYear(s.lastSyncAt)} 맞춤` : "켜짐";
}

/** `/api/google/status` 한 번. 관리자가 아니면 403, 표를 못 읽으면 500 — 둘 다 서버 문구를 그대로 쓴다. */
async function readStatus(): Promise<{ ok: true; body: GcalStatusBody } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/google/status", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (res.ok && typeof data?.config === "string") return { ok: true, body: data as GcalStatusBody };
    return { ok: false, error: data?.error ?? "동기화 상태를 읽지 못했어요." };
  } catch {
    return { ok: false, error: "인터넷 연결을 확인해 주세요." };
  }
}

function Body({
  status,
  onStatus,
}: {
  status: GcalStatusBody | null;
  onStatus: (next: GcalStatusBody) => void;
}) {
  const { confirm, dialog } = useConfirm();
  // 열릴 때 무엇을 받아 와야 하나 — 서버가 상태를 못 읽었거나, 처음 맞추기 전일 때(**열 때마다** 새로).
  // 예전 미리보기를 들고 있어도 다시 읽는다: 그 사이 구글·사이트 일정이 바뀌었으면 숫자가 다르고, 확인 창이 "아무것도 만들지
  // 않아요" 라고 말한 뒤 실제로는 만드는 일이 생긴다. CollapsibleCard 는 열려 있을 때만 이 안을 그리므로 "붙을 때" = "열릴 때".
  const [needsFetch] = useState(() => status === null || (status.config === "on" && !status.initialDoneAt));
  const [loading, setLoading] = useState(needsFetch);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"checking" | "initial" | "sync" | null>(null);
  const [note, setNote] = useState<Note>(null);

  useEffect(() => {
    if (!needsFetch) return;
    let alive = true;
    readStatus().then((r) => {
      if (!alive) return;
      if (r.ok) onStatus(r.body);
      else setLoadError(r.error);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [needsFetch, onStatus]);

  /** 누른 뒤 다시 읽는다 — 처음 맞추기가 일부 실패하면 initialDoneAt 이 비어 있어 미리보기와 단추가 다시 나온다. */
  async function reload() {
    setLoading(true);
    setLoadError(null);
    const r = await readStatus();
    if (r.ok) onStatus(r.body);
    else setLoadError(r.error);
    setLoading(false);
  }

  async function runInitial() {
    if (busy) return;
    setNote(null);
    // 확인 창 **바로 전에** 미리보기를 새로 받는다 — 화면에 떠 있는 숫자는 열었을 때의 것이라 낡았을 수 있다.
    // 새 숫자가 오면 화면도 그것으로 바뀌고, 그 사이 누가 처음 맞추기를 끝냈거나 구글을 못 읽으면 묻지 않고 그 상태를 보인다.
    setBusy("checking");
    const fresh = await readStatus();
    if (!fresh.ok) {
      setLoadError(fresh.error);
      setBusy(null);
      return;
    }
    setLoadError(null);
    onStatus(fresh.body);
    const counts = fresh.body.preview;
    if (fresh.body.config !== "on" || fresh.body.initialDoneAt || !counts || "error" in counts) {
      setBusy(null);
      return;
    }
    const ask = initialAsk(counts);
    setBusy(null); // 확인 창이 떠 있는 동안 단추가 "살펴보는 중" 으로 남지 않게(창이 화면을 덮어 다시 누를 수는 없다)
    const ok = await confirm({
      title: ask.title,
      description: ask.description,
      confirmLabel: "처음 맞추기",
      emoji: "📅",
    });
    if (!ok) return;
    setBusy("initial");
    try {
      const res = await fetch("/api/google/initial", { method: "POST" });
      const data = await res.json().catch(() => null);
      setNote(outcomeNote(res.ok ? (data as SyncOutcome) : null, data?.error, true));
    } catch {
      setNote({ tone: "error", text: "인터넷 연결을 확인해 주세요." });
    }
    await reload();
    setBusy(null);
  }

  async function syncNow() {
    if (busy) return;
    setBusy("sync");
    setNote(null);
    try {
      // force: 60초 제한을 건너뛴다(관리자만 — 서버가 확인한다).
      const res = await fetch("/api/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json().catch(() => null);
      setNote(outcomeNote(res.ok ? (data as SyncOutcome) : null, data?.error, false));
    } catch {
      setNote({ tone: "error", text: "인터넷 연결을 확인해 주세요." });
    }
    await reload();
    setBusy(null);
  }

  if (!status) {
    return (
      <>
        <p className="rounded-md bg-sunken px-3 py-2.5 text-sm text-ink-soft">
          {loading ? "동기화 상태를 읽는 중…" : "지금은 동기화 상태를 확인할 수 없어요. 잠시 뒤 다시 열어 보세요."}
        </p>
        {loadError && <ErrorLine text={loadError} />}
        {!loading && (
          <Button variant="soft" size="sm" onClick={reload} className="self-start">
            <RefreshCw className="h-4 w-4" /> 다시 읽기
          </Button>
        )}
      </>
    );
  }

  const preview = status.preview;

  return (
    <>
      <StatusList status={status} />

      {status.config === "missing" && (
        <p className="text-sm leading-relaxed text-ink-soft">
          {/* 두 이름이 가운뎃점으로 붙어 한 낱말처럼 길다(46자) — 390px 에서 그 사이에서 줄이 바뀌게 <wbr />. */}
          Vercel 에 <b className="text-ink">GOOGLE_SERVICE_ACCOUNT_JSON</b>·<wbr />
          <b className="text-ink">GOOGLE_CALENDAR_ID</b> 를 넣으면 켜져요.
        </p>
      )}

      {status.config === "bad_key" && (
        <ErrorLine text="키 형식을 읽지 못했어요 — Vercel 의 GOOGLE_SERVICE_ACCOUNT_JSON 을 확인해 주세요" />
      )}

      {/* 처음 맞추기 전 — 무엇이 진짜 캘린더에 쓰일지 먼저 보고 사람이 누른다(스펙 §5). 그 전에는 자동 동기화가 아무것도 안 한다. */}
      {status.config === "on" && !status.initialDoneAt && (
        <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm leading-relaxed text-ink">
            처음 한 번은 직접 맞춰 주세요. 사이트의 <b>오늘 이후</b> 일정을 구글로 보내고, 같은 날·같은 제목인 일정은
            하나로 이어요(내용은 구글 쪽으로 맞춰요). 지난 일정은 사이트에만 남아요.
          </p>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <Spinner className="h-4 w-4" /> 구글 캘린더를 살펴보는 중…
            </p>
          ) : preview && "error" in preview ? (
            <>
              <ErrorLine text={preview.error} />
              <Button variant="soft" size="sm" onClick={reload} disabled={busy !== null} className="self-start">
                <RefreshCw className="h-4 w-4" /> 다시 살펴보기
              </Button>
            </>
          ) : preview ? (
            <>
              {/* 세 숫자를 가운뎃점 한 줄로 잇지 않고 줄마다 — DESIGN.md §3, 그리고 390px 에서 한 줄에 안 들어간다. */}
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md bg-sunken px-3 py-2.5 text-sm">
                <dt className="text-ink-soft">구글로 보낼 일정</dt>
                <dd className="font-num font-semibold text-ink">{preview.toPush}개</dd>
                <dt className="text-ink-soft">하나로 이을 일정</dt>
                <dd className="font-num font-semibold text-ink">{preview.toLink}개</dd>
                <dt className="text-ink-soft">사이트로 가져올 일정</dt>
                <dd className="font-num font-semibold text-ink">{preview.toImport}개</dd>
              </dl>
              <Button onClick={runInitial} disabled={busy !== null} className="self-start">
                <CalendarCheck className="h-4 w-4" />
                {busy === "checking" ? "다시 살펴보는 중…" : busy === "initial" ? "맞추는 중…" : "처음 맞추기"}
              </Button>
            </>
          ) : null}
        </div>
      )}

      {status.config === "on" && status.initialDoneAt && (
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-ink-soft">
            홈이나 캘린더를 열면 저절로 맞춰요. 바로 맞추고 싶으면 눌러 주세요.
          </p>
          <Button variant="soft" onClick={syncNow} disabled={busy !== null} className="self-start">
            <RefreshCw className={cn("h-4 w-4", busy === "sync" && "animate-spin")} />
            {busy === "sync" ? "맞추는 중…" : "지금 맞추기"}
          </Button>
        </div>
      )}

      {/* 상태를 다시 읽다 실패한 것(누른 결과와는 따로) */}
      {loadError && <ErrorLine text={loadError} />}

      {note && (
        <p
          role={note.tone === "error" ? "alert" : "status"}
          className={cn(
            "break-words text-sm font-semibold",
            note.tone === "error" ? "text-danger-ink" : "text-mint-ink",
          )}
        >
          {note.text}
        </p>
      )}

      {dialog}
    </>
  );
}

/** 켜짐/꺼짐과 숫자들. 꺼져 있으면 상태 한 줄만 — 한 번도 안 켠 곳에 "연결 0개" 를 늘어놓지 않는다. */
function StatusList({ status }: { status: GcalStatusBody }) {
  const on = status.config === "on";
  return (
    // 캘린더 ID(메일 주소)·오류 문구는 띄어쓰기 없이 길 수 있다 — minmax(0,1fr) + break-all (DESIGN.md "min-w-0").
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-sunken px-3 py-2.5 text-sm">
      <dt className="text-ink-soft">상태</dt>
      <dd className={cn("font-semibold", status.config === "bad_key" ? "text-danger-ink" : "text-ink")}>
        {on ? "켜짐" : status.config === "bad_key" ? "키 형식 오류" : "꺼짐"}
      </dd>
      {on && (
        <>
          <dt className="text-ink-soft">캘린더</dt>
          <dd className="break-all text-ink">{status.calendarId}</dd>
          {/* 성공이든 실패든 마지막으로 시도한 때다 — 실패였으면 아래 "마지막 오류" 가 같이 보인다. */}
          <dt className="text-ink-soft">마지막 동기화</dt>
          <dd className="text-ink">
            {status.lastSyncAt ? `${kDateShortYear(status.lastSyncAt)} ${kTime(status.lastSyncAt)}` : "아직 없어요"}
          </dd>
          <dt className="text-ink-soft">연결된 일정</dt>
          <dd className="font-num text-ink">{status.linked}개</dd>
          <dt className="text-ink-soft">보내기 대기</dt>
          <dd className="font-num text-ink">{status.pending}개</dd>
          {status.lastError && (
            <>
              <dt className="text-ink-soft">마지막 오류</dt>
              <dd className="break-words font-semibold text-danger-ink">{status.lastError}</dd>
            </>
          )}
        </>
      )}
    </dl>
  );
}

function ErrorLine({ text }: { text: string }) {
  return <p className="break-words text-sm font-semibold text-danger-ink">{text}</p>;
}

/**
 * [처음 맞추기] 확인 창의 문구. 진짜 캘린더에 **쓰는 것**(만들 개수)을 제목에 — 그게 되돌리기 어려운 부분이다.
 * 만들 것이 없으면 무엇이 일어나는지를 대신 말한다.
 */
function initialAsk({ toPush, toLink, toImport }: Counts): { title: string; description: string } {
  const after = "이제부터 홈이나 캘린더를 열 때마다 저절로 맞춰요.";
  // 이을 때는 구글 내용이 이긴다 — 사이트에 적힌 시각·메모가 구글 것으로 바뀐다는 것을 누르기 전에 말한다.
  const joinNote = toLink > 0 ? "이은 일정의 내용은 구글 쪽으로 맞춰요." : null;
  if (toPush > 0) {
    const rest = [
      toLink > 0 ? `같은 날·같은 제목인 ${toLink}개는 하나로 잇고, 내용은 구글 쪽으로 맞춰요.` : null,
      toImport > 0 ? `구글 일정 ${toImport}개를 사이트로 가져와요.` : null,
      after,
    ].filter(Boolean);
    return { title: `구글 캘린더에 ${toPush}개를 만들어요. 계속할까요?`, description: rest.join(" ") };
  }
  const nothingWritten = [joinNote, `구글 캘린더에는 아무것도 만들지 않아요. ${after}`].filter(Boolean).join(" ");
  if (toImport > 0 && toLink > 0) {
    return { title: `구글에서 ${toImport}개를 가져오고 ${toLink}개를 이어요. 계속할까요?`, description: nothingWritten };
  }
  if (toImport > 0) return { title: `구글에서 ${toImport}개를 가져와요. 계속할까요?`, description: nothingWritten };
  if (toLink > 0) return { title: `같은 일정 ${toLink}개를 하나로 이어요. 계속할까요?`, description: nothingWritten };
  return { title: "옮길 일정이 없어요. 맞추기를 시작할까요?", description: nothingWritten };
}

/** 라우트의 SyncOutcome 을 한 줄로. 오류 문구는 서버 것을 그대로 — 비밀이 없게 서버가 만들어 둔 문장이다. */
function outcomeNote(out: SyncOutcome | null, serverError: unknown, initial: boolean): Note {
  if (!out) {
    return {
      tone: "error",
      text: typeof serverError === "string" ? serverError : "맞추지 못했어요. 잠시 뒤 다시 해 주세요.",
    };
  }
  if (!out.ran) {
    const text = {
      disabled: "동기화가 꺼져 있어요.",
      not_started: "먼저 [처음 맞추기]를 눌러 주세요.",
      throttled: "방금 맞췄어요. 잠시 뒤 다시 눌러 주세요.",
      locked: "다른 곳에서 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.",
    }[out.reason];
    return { tone: "error", text };
  }
  if (out.error) return { tone: "error", text: out.error };
  const done = out.changed > 0 ? `${out.changed}개를 맞췄어요 ✓` : initial ? "맞췄어요 ✓" : "이미 다 맞춰져 있어요 ✓";
  return { tone: "ok", text: initial ? `${done} 이제 화면을 열 때마다 저절로 맞춰요.` : done };
}
