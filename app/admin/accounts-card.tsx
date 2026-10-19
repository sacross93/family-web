"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, CollapsibleCard, Field, Input, Label, Segmented, Tag, useToast } from "@/components/ui";
import { cleanName } from "@/lib/accounts";

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
  const [editingId, setEditingId] = useState<string | null>(null);

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
              open={editingId === row.id}
              onToggle={(open) => setEditingId(open ? row.id : null)}
              onSaved={(saved) =>
                setRows((prev) => (Array.isArray(prev) ? prev.map((r) => (r.id === saved.id ? saved : r)) : prev))
              }
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

/** 계정 한 줄 + 펼치면 그 아래에 고치기(이름·비밀번호). 떠 있는 판이 아니라 제자리에서 펼친다. */
function AccountItem({
  row,
  me,
  open,
  onToggle,
  onSaved,
}: {
  row: AccountRow;
  me: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  onSaved: (row: AccountRow) => void;
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
            aria-label={`${row.username} 고치기`}
            onClick={() => onToggle(!open)}
          >
            고치기
          </Button>
        </span>
      </div>
      {/* 접으면 칸째로 없앤다 — 다른 줄을 펼쳤을 때 치다 만 비밀번호가 숨은 채 남지 않게. */}
      {open && <AccountEdit row={row} me={me} onSaved={onSaved} onDone={() => onToggle(false)} />}
    </div>
  );
}

/** 바뀐 것만 알린다. 남의 이름은 그 사람 쿠키에 실려 있어서 다시 로그인해야 바뀐다(`/api/accounts/[id]`). */
function savedMessage(saved: AccountRow, me: boolean, nameChanged: boolean, passwordChanged: boolean): string {
  const what = nameChanged && passwordChanged ? "이름과 비밀번호를" : nameChanged ? "이름을" : "비밀번호를";
  const head = me ? `${what} 바꿨어요.` : `${saved.username} ${what} 바꿨어요.`;
  if (nameChanged && passwordChanged && !me) {
    return `${head} 이미 로그인한 기기는 그대로 로그인돼 있고, 새 이름은 다시 로그인하면 보여요.`;
  }
  if (passwordChanged) return `${head} 이미 로그인한 기기는 그대로 로그인돼 있어요.`;
  if (!me) return `${head} ${saved.name ?? saved.username} 님 화면에는 다시 로그인하면 보여요.`;
  return head;
}

function AccountEdit({
  row,
  me,
  onSaved,
  onDone,
}: {
  row: AccountRow;
  me: boolean;
  onSaved: (row: AccountRow) => void;
  onDone: () => void;
}) {
  const { say } = useToast();
  const router = useRouter();
  const [name, setName] = useState(row.name ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // 서버와 같은 식으로 다듬어 비교한다 — 끝에 빈칸 하나 친 것은 바뀐 게 아니다.
  const nameChanged = cleanName(name) !== cleanName(row.name);
  const passwordChanged = password !== "";
  const canSave = (nameChanged || passwordChanged) && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      // 바뀐 칸만 보낸다 — 이름만 고칠 때 비밀번호를 건드리지 않게.
      const res = await fetch(`/api/accounts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(nameChanged ? { name } : {}),
          ...(passwordChanged ? { password } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        say(data?.error ?? "바꾸지 못했어요.", "error");
        setBusy(false);
        return;
      }
      onSaved(data);
      say(savedMessage(data, me, nameChanged, passwordChanged));
      // 내 이름은 응답에 실린 새 쿠키로 바뀌었다 — 위의 "○○ 님" 을 지금 다시 그린다.
      if (me && nameChanged) router.refresh();
      // 저장한 비밀번호는 다시 보여 주지 않는다 — 칸째로 접는다.
      onDone();
    } catch {
      say("연결을 확인해 주세요.", "error");
      setBusy(false);
    }
  }

  const onEnter = (e: KeyboardEvent) => e.key === "Enter" && !e.nativeEvent.isComposing && save();

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="이름" hint="사이트 위에 “○○ 님”으로 나와요" className="min-w-0">
          <Input
            placeholder="비워 두면 아이디가 보여요"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEnter}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field label="새 비밀번호" hint="4자 이상" className="min-w-0">
          <Input
            type="text"
            placeholder="바꿀 때만 적어 주세요"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onEnter}
            autoComplete="off"
            {...PLAIN_TYPING}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!canSave}>
          {busy ? "바꾸는 중…" : "저장"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          취소
        </Button>
      </div>
    </div>
  );
}
