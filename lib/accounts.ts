import type { Prisma } from "@prisma/client";

/**
 * 로그인 계정(`AppUser`)을 관리자 화면에서 만들고 비밀번호를 바꿀 때의 규칙.
 * `/api/accounts` 와 `/api/accounts/[id]` 가 같이 쓴다(라우트 파일은 핸들러 말고는 내보낼 수 없다).
 *
 * 로그인 라우트는 아이디를 **trim 만 하고 그대로** 찾고, 비밀번호는 **다듬지 않는다.**
 * 여기서 그 둘과 어긋나는 값을 받아 두면 만든 계정으로 들어올 수 없다 — 그래서 아이디는
 * 소문자로 맞추고, 비밀번호 앞뒤 빈칸은 고치지 않고 **돌려보낸다**(몰래 지우면 알려 준 것과 달라진다).
 */

/** 화면으로 나가는 모양. `passwordHash` 는 여기 없다 — 서버 밖으로 나가지 않는다. */
export const ACCOUNT_SELECT = {
  id: true,
  username: true,
  name: true,
  isAdmin: true,
  createdAt: true,
} as const satisfies Prisma.AppUserSelect;

// 폰 자판은 첫 글자를 대문자로 바꾸고 빈칸을 넣는다. 로그인은 글자 그대로 맞추므로
// 소문자·숫자·`.` `_` `-` 만 받는다.
const USERNAME_RE = /^[a-z0-9._-]{3,20}$/;
const PASSWORD_MIN = 4;
/** bcrypt 는 72바이트 뒤를 버린다 — 그 뒤가 달라도 같은 비밀번호로 통한다. */
const PASSWORD_MAX_BYTES = 72;
const NAME_MAX = 20;

type Checked<K extends string> = ({ [P in K]: string } & { error?: undefined }) | { error: string };

export function checkUsername(v: unknown): Checked<"username"> {
  const username = String(v ?? "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return { error: "아이디는 영문 소문자·숫자·. _ - 로 3~20자예요." };
  }
  return { username };
}

export function checkPassword(v: unknown): Checked<"password"> {
  const password = typeof v === "string" ? v : "";
  if (password !== password.trim()) return { error: "비밀번호 앞뒤에 빈칸이 있어요." };
  if ([...password].length < PASSWORD_MIN) {
    return { error: `비밀번호는 ${PASSWORD_MIN}자 이상으로 해 주세요.` };
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return { error: "비밀번호가 너무 길어요. 영문 기준 72자까지예요." };
  }
  return { password };
}

/** 이름은 가족 카드와 같은 식으로 다듬는다. 비면 null — 위에는 아이디가 대신 나온다. */
export function cleanName(v: unknown): string | null {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) || null;
}

/** 같은 아이디가 이미 있다(`username @unique`). 미리 찾아보는 것만으로는 동시에 만들 때 진 쪽이 500 이 된다. */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "P2002";
}
