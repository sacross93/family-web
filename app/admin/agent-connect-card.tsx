"use client";

import { useState } from "react";
import { ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Button, CheckCircle, CollapsibleCard, Field, Input } from "@/components/ui";
import { AGENT_NAME } from "@/lib/agent/name";
import { ALLOW_ACCOUNT_CHANGE_LABEL } from "@/lib/agent/connect-copy";
import { kDateShortYear, kTime } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * 연결 상태. **"모름" 과 "없음" 을 나눈다** — 못 읽은 것을 "연결 안 됨" 으로 보여 주면
 * 멀쩡한 연결을 괜히 다시 하게 된다. `updatedAt` 은 ISO 문자열(서버→화면).
 */
export type AgentConnection =
  | { kind: "connected"; accountId: string | null; updatedAt: string }
  | { kind: "none" }
  | { kind: "unknown" };

type Note = { tone: "ok" | "error"; text: string } | null;

/** 진행 중인 연결을 이 탭에 기억해 두는 자리(아래 `readStarted` 참고). */
const STARTED_KEY = "podong_agent_connect";
/** 서버 쿠키와 같은 15분(lib/agent/connect.ts 의 PENDING_TTL_MS). 지나면 어차피 처음부터다. */
const STARTED_TTL_MS = 15 * 60 * 1000;

/**
 * 폰 사파리는 다른 탭·앱(인증 메일, 문자)에 다녀오는 사이 이 탭을 **새로 불러오기도 한다.**
 * 그러면 "붙여넣기" 칸이 사라져, 로그인을 다 마치고도 [다시 연결하기] 를 누르게 되고 —
 * 그 순간 state 가 바뀌어 손에 든 주소가 쓸모없어진다. 그래서 시작한 사실(로그인 주소)을
 * sessionStorage 에 둔다. 비밀은 없다: challenge·state 만 있고 verifier 는 서버 쿠키 안에만 있다.
 */
function readStarted(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STARTED_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { url?: unknown; at?: unknown };
    if (typeof v.url !== "string" || typeof v.at !== "number") return null;
    return Date.now() - v.at < STARTED_TTL_MS ? v.url : null;
  } catch {
    return null;
  }
}
function rememberStarted(url: string | null) {
  try {
    if (url) window.sessionStorage.setItem(STARTED_KEY, JSON.stringify({ url, at: Date.now() }));
    else window.sessionStorage.removeItem(STARTED_KEY);
  } catch {
    // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)는 새로 불러올 때 처음부터 하면 된다.
  }
}

/**
 * 관리자 화면 「AI 포동이 연결」 — ChatGPT 연결이 풀렸을 때 **터미널 없이** 다시 잇는 자리.
 *
 * 등록된 돌아올 주소가 `localhost:1455` 하나뿐이라, 로그인을 마친 탭은 "연결할 수 없음" 이 된다.
 * 그 탭의 주소(code·state 가 실려 있다)를 붙여넣으면 서버가 토큰으로 바꿔 저장한다.
 * 서버 쪽은 `app/api/agent/connect/*` → `lib/agent/connect.ts`.
 */
export function AgentConnectCard({ initial }: { initial: AgentConnection }) {
  const [status, setStatus] = useState(initial);

  return (
    <CollapsibleCard
      emoji="🔌"
      emojiClassName="bg-sky-soft"
      title={`${AGENT_NAME} 연결`}
      summary={
        status.kind === "connected"
          ? `${kDateShortYear(status.updatedAt)} 갱신`
          : status.kind === "none"
            ? "연결 안 됨"
            : undefined
      }
      className="gap-5"
    >
      {/* 접혀 있을 때는 그리지 않는다(CollapsibleCard) — 그래서 아래의 sessionStorage 읽기는
          언제나 브라우저에서만 일어난다. 이 카드를 처음부터 펼쳐 두면(defaultOpen) 서버 그림과
          어긋나니 그때는 readStarted 를 효과로 옮길 것. */}
      <ConnectBody status={status} onConnected={setStatus} />
    </CollapsibleCard>
  );
}

function ConnectBody({
  status,
  onConnected,
}: {
  status: AgentConnection;
  onConnected: (next: AgentConnection) => void;
}) {
  // 시작했으면 ChatGPT 로그인 주소. 있으면 붙여넣기 칸을 보인다.
  const [authUrl, setAuthUrl] = useState<string | null>(readStarted);
  const [pasted, setPasted] = useState("");
  const [allow, setAllow] = useState(false);
  const [busy, setBusy] = useState<"start" | "finish" | null>(null);
  const [note, setNote] = useState<Note>(null);

  function setStarted(url: string | null) {
    setAuthUrl(url);
    rememberStarted(url);
    setPasted("");
  }

  async function start() {
    if (busy) return;
    setBusy("start");
    setNote(null);
    try {
      const res = await fetch("/api/agent/connect", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.url !== "string") {
        setNote({ tone: "error", text: data?.error ?? "연결을 시작하지 못했어요. 잠시 뒤 다시 해 주세요." });
        return;
      }
      setStarted(data.url);
      // 새 탭으로 연다. 다만 **열렸는지 알 수 없다** — noopener 를 주면 window.open 은 열렸어도
      // null 을 돌려준다(명세). 폰 사파리는 fetch 를 기다린 뒤의 window.open 을 막기도 한다.
      // 그래서 같은 주소를 아래에 버튼으로 **늘** 둔다(그건 사용자가 직접 누르니 막히지 않는다).
      window.open(data.url, "_blank", "noopener");
    } catch {
      setNote({ tone: "error", text: "인터넷 연결을 확인해 주세요." });
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    if (busy || !pasted.trim()) return;
    setBusy("finish");
    setNote(null);
    try {
      const res = await fetch("/api/agent/connect/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pasted, allowAccountChange: allow }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        onConnected({ kind: "connected", accountId: data.accountId ?? null, updatedAt: data.updatedAt });
        setStarted(null);
        setAllow(false);
        setNote({ tone: "ok", text: "연결됐어요 ✓" });
        return;
      }
      // 서버가 "진행 중이던 연결이 끝났다" 고 하면(code 를 이미 썼거나 15분이 지남) 붙여넣기 칸을 닫는다 —
      // 그 주소로는 다시 해도 안 된다. 체크칸은 그대로 둔다: "체크하고 다시 연결해 주세요" 를 따르게.
      if (data?.restart) setStarted(null);
      setNote({ tone: "error", text: data?.error ?? "연결하지 못했어요. 처음부터 다시 해 주세요." });
    } catch {
      setNote({ tone: "error", text: "인터넷 연결을 확인해 주세요." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ConnectionStatus status={status} />

      <p className="text-sm leading-relaxed text-ink-soft">
        {AGENT_NAME}가 &lsquo;연결이 풀렸어요&rsquo;라고 하면 여기서 다시 이어 주세요. ChatGPT 로그인 화면이 새
        탭으로 열려요.
      </p>

      <Button
        onClick={start}
        disabled={busy !== null}
        // 붙여넣는 중에는 [연결] 이 주인공이다. 강조는 한 곳에만(DESIGN.md §1).
        variant={authUrl ? "outline" : "primary"}
        className="self-start"
      >
        <RefreshCw className="h-4 w-4" />
        {busy === "start"
          ? "여는 중…"
          : authUrl
            ? "처음부터 다시"
            : status.kind === "none"
              ? "연결하기"
              : "다시 연결하기"}
      </Button>

      {authUrl && (
        <div className="flex min-w-0 flex-col gap-4 border-t border-line pt-4">
          <p className="text-sm leading-relaxed text-ink">
            로그인을 마치면 그 탭이 <b>&lsquo;연결할 수 없음&rsquo;</b> 화면이 돼요. 정상이에요. 그 탭의{" "}
            <b>주소창 주소를 통째로 복사</b>해서 아래에 붙여넣어 주세요.
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs text-ink-faint">새 탭이 안 열렸다면</span>
            <Button href={authUrl} target="_blank" rel="noopener noreferrer" variant="soft" size="sm">
              <ExternalLink className="h-4 w-4" /> ChatGPT 로그인 열기
            </Button>
          </div>

          <Field label="로그인을 마친 탭의 주소">
            <Input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && finish()}
              placeholder="http://localhost:1455/auth/callback?code=…"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              // 붙여넣는 주소는 수백 자다. 칸이 그 길이로 카드를 벌리지 않게.
              className="min-w-0"
            />
          </Field>

          {/* 줄 전체가 눌린다(체크 동그라미만 겨누지 않게) — components/ui/checkbox.tsx 의 규칙. */}
          <div className="flex flex-col">
            <button
              type="button"
              role="checkbox"
              aria-checked={allow}
              onClick={() => setAllow((v) => !v)}
              className="flex min-h-11 items-center gap-3 self-start text-left"
            >
              <CheckCircle checked={allow} size="sm" />
              <span className="text-sm text-ink">{ALLOW_ACCOUNT_CHANGE_LABEL}</span>
            </button>
            <p className="text-xs text-ink-faint">
              보통은 꺼 두세요. 브라우저에 다른 계정이 로그인돼 있을 때 모르는 사이에 바뀌는 걸 막아 줘요.
            </p>
          </div>

          <Button onClick={finish} disabled={busy !== null || !pasted.trim()} className="self-start">
            <Link2 className="h-4 w-4" /> {busy === "finish" ? "연결하는 중…" : "연결"}
          </Button>
        </div>
      )}

      {note && (
        <p
          role={note.tone === "error" ? "alert" : "status"}
          className={cn(
            "break-words text-sm font-semibold",
            note.tone === "error" ? "text-danger-ink" : "text-mint-ink"
          )}
        >
          {note.text}
        </p>
      )}
    </>
  );
}

/** 지금 연결된 계정과 마지막으로 바뀐 때. 토큰은 여기 오지도 않는다(서버가 고르지 않는다). */
function ConnectionStatus({ status }: { status: AgentConnection }) {
  if (status.kind === "unknown") {
    return (
      <p className="rounded-md bg-sunken px-3 py-2.5 text-sm text-ink-soft">
        지금은 연결 상태를 확인할 수 없어요. 그래도 아래에서 다시 연결할 수 있어요.
      </p>
    );
  }
  if (status.kind === "none") {
    return <p className="rounded-md bg-sunken px-3 py-2.5 text-sm text-ink-soft">아직 연결되지 않았어요</p>;
  }
  return (
    // 계정 id 는 띄어쓰기 없는 36자라 칸을 벌린다 — minmax(0,1fr) + break-all (DESIGN.md "min-w-0").
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-sunken px-3 py-2.5 text-sm">
      <dt className="text-ink-soft">연결된 계정</dt>
      <dd className="break-all font-semibold text-ink">{status.accountId ?? "계정 정보 없음"}</dd>
      {/* 다시 연결할 때뿐 아니라 토큰을 저절로 새로 받을 때도 바뀐다 — 그래서 "연결한 날" 이 아니라 "갱신". */}
      <dt className="text-ink-soft">마지막 갱신</dt>
      <dd className="text-ink">
        {kDateShortYear(status.updatedAt)} {kTime(status.updatedAt)}
      </dd>
    </dl>
  );
}
