"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button, CollapsibleCard, Field, Input, Label, Segmented, Tag, useToast } from "@/components/ui";

/** `/api/accounts` 가 돌려주는 모양 — passwordHash 는 오지 않는다. 날짜는 ISO 문자열. */
type AccountRow = {
  id: string;
  username: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
};

type Role = "family" | "admin";
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "family", label: "가족" },
  { value: "admin", label: "관리자" },
];

/**
 * 폰 자판이 아이디를 고치지 않게 — 첫 글자 대문자·자동 수정·맞춤법 밑줄.
 * 로그인은 글자 그대로 맞추므로 하나라도 바뀌면 "아이디 또는 비밀번호가 올바르지 않아요" 만 나온다.
 */
const PLAIN_TYPING = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const;

/**
 * 관리자 화면 「로그인 계정」 — 터미널(`npm run user:add`) 없이 가족에게 로그인을 만들어 주는 자리.
 * 가족 카드(`FamilyMember` — 담당자·글쓴이로 고르는 이름)와는 **다른 표**다.
 *
 * 관리자 화면에 아이디·비밀번호 칸이 나란히 있으면 브라우저가 **관리자 자신의 저장된 로그인**을
 * 채워 넣고, 만든 뒤에는 그걸 새 비밀번호로 덮어 저장하자고 한다. 그래서 이 카드에는
 * `type="password"` 칸도 `<form>` 도 없다 — 비밀번호는 보이는 글자다(어차피 불러 줘야 한다).
 *
 * 지우기·관리자↔가족 바꾸기는 일부러 없다.
 */
export function AccountsCard({ currentUid }: { currentUid: string }) {
  const { say } = useToast();
  // null = 불러오는 중, "error" = 못 읽음. 못 읽은 것을 "없음" 으로 그리지 않는다 — 관리자 자신은 늘 있다.
  const [rows, setRows] = useState<AccountRow[] | null | "error">(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("family");
  const [busy, setBusy] = useState(false);
  // 한 번에 한 줄만 펼친다.
  const [changingId, setChangingId] = useState<string | null>(null);

  // 관리자 화면에서만 쓰는 목록이라 페이지 데이터에 싣지 않았다(가족 카드와 같다).
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRows(Array.isArray(d) ? d : "error"))
      .catch(() => setRows("error"));
  }, []);

  async function create() {
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, name, isAdmin: role === "admin" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        say(data?.error ?? "계정을 만들지 못했어요.", "error");
        return;
      }
      setRows((prev) => [...(Array.isArray(prev) ? prev : []), data]);
      setUsername("");
      setPassword("");
      setName("");
      setRole("family");
      say(`${data.username} 계정을 만들었어요.`);
    } catch {
      say("연결을 확인해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard
      emoji="🔑"
      emojiClassName="bg-butter-soft"
      title="로그인 계정"
      summary={Array.isArray(rows) ? `${rows.length}개` : undefined}
      className="gap-5"
    >
      <p className="rounded-md bg-sunken px-3 py-2 text-xs text-ink-soft">
        사이트에 들어올 때 쓰는 <b className="text-ink">아이디와 비밀번호</b>예요. 담당자·글쓴이로 고르는
        이름은 <b className="text-ink">가족</b> 카드에서 따로 넣어요.
      </p>

      {rows === null ? (
        <p className="text-sm text-ink-faint">불러오는 중…</p>
      ) : rows === "error" ? (
        <p className="text-sm text-ink-soft">목록을 못 불러왔어요. 잠시 후 새로고침해 주세요.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <AccountItem
              key={row.id}
              row={row}
              me={row.id === currentUid}
              open={changingId === row.id}
              onToggle={(open) => setChangingId(open ? row.id : null)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-sm font-bold text-ink">새 계정 만들기</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="아이디" hint="영문 소문자·숫자로 3~20자">
            <Input
              placeholder="예: eomma"
              value={username}
              // 서버도 소문자로 저장한다 — 치는 대로 바꿔 두면 여기 보이는 것이 곧 알려 줄 아이디다.
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              autoComplete="off"
              {...PLAIN_TYPING}
            />
          </Field>
          <Field label="비밀번호" hint="4자 이상. 알려 드리기 쉽게 글자가 보여요">
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && create()}
              autoComplete="off"
              {...PLAIN_TYPING}
            />
          </Field>
        </div>
        <Field label="이름" hint="선택 사항이에요. 사이트 위에 “○○ 님”으로 나와요">
          <Input placeholder="예: 엄마" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field hint="관리자는 이 관리자 화면을 열 수 있어요">
          <Label>권한</Label>
          <Segmented value={role} options={ROLE_OPTIONS} onChange={setRole} className="self-start" />
        </Field>
        <Button onClick={create} disabled={!username.trim() || !password || busy} className="self-start">
          <Plus className="h-4 w-4" /> {busy ? "만드는 중…" : "계정 만들기"}
        </Button>
      </div>
    </CollapsibleCard>
  );
}

/** 계정 한 줄 + 펼치면 그 아래에 비밀번호 바꾸기. 떠 있는 판이 아니라 제자리에서 펼친다. */
function AccountItem({
  row,
  me,
  open,
  onToggle,
}: {
  row: AccountRow;
  me: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      {/* 글자가 커지면 오른쪽 묶음이 아래로 내려간다(DESIGN.md §9) — 한 줄에 밀어 넣지 않는다. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-28">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-ink">{row.username}</span>
            {me && <span className="shrink-0 text-xs font-semibold text-primary-ink">(나)</span>}
          </span>
          {row.name && <span className="block truncate text-xs text-ink-faint">{row.name} 님</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Tag color={row.isAdmin ? "rose" : "mint"}>{row.isAdmin ? "관리자" : "가족"}</Tag>
          <Button
            variant="soft"
            size="sm"
            aria-expanded={open}
            aria-label={`${row.username} 비밀번호 바꾸기`}
            onClick={() => onToggle(!open)}
          >
            비밀번호
          </Button>
        </span>
      </div>
      {/* 접으면 칸째로 없앤다 — 다른 줄을 펼쳤을 때 치다 만 비밀번호가 숨은 채 남지 않게. */}
      {open && <PasswordChange row={row} onDone={() => onToggle(false)} />}
    </div>
  );
}

function PasswordChange({ row, onDone }: { row: AccountRow; onDone: () => void }) {
  const { say } = useToast();
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!next || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        say(data?.error ?? "비밀번호를 못 바꿨어요.", "error");
        setBusy(false);
        return;
      }
      // 저장한 비밀번호는 다시 보여 주지 않는다 — 칸째로 접는다.
      say(`${row.username} 비밀번호를 바꿨어요. 이미 로그인한 기기는 그대로 로그인돼 있어요.`);
      onDone();
    } catch {
      say("연결을 확인해 주세요.", "error");
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-end">
      <Field label="새 비밀번호" className="min-w-0 flex-1">
        <Input
          type="text"
          placeholder="4자 이상"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()}
          autoComplete="off"
          {...PLAIN_TYPING}
          autoFocus
        />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!next || busy}>
          {busy ? "바꾸는 중…" : "저장"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          취소
        </Button>
      </div>
    </div>
  );
}
