// "이 기기를 쓰는 사람은 누구인가."
//
// 계정이 **하나**다(`wlsdud022` 를 온 가족이 함께 쓴다). 그래서 세션으로는 지금 말하는
// 사람을 알 수 없다 — 로그인한 사람의 이름은 계정 주인의 이름이지 타자 치는 사람의 이름이
// 아니다. 남는 단서는 **기기**뿐이고, 기기에 남길 수 있는 곳은 브라우저 저장소뿐이다.
//
// 그래서 이 값은 **짐작**이다. 절대 사실처럼 쓰지 말 것 —
// 포동이는 이걸 기본값으로 쓰되 "아빠로 적었어요" 처럼 **무엇을 가정했는지 밝힌다**
// (`loop.ts` 의 `speakerLine`). 그래야 가족이 "아니 엄마야" 하고 고칠 수 있다.

const KEY = "podong_me";
/** 예전 열쇠. 아기 기록을 쓴 적 있는 기기는 이미 답을 갖고 있다 — 처음부터 묻지 않아도 되게. */
const LEGACY_KEY = "podong_baby_author";

/** 이 기기의 사람(FamilyMember id). 모르면 null. */
export function readMe(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY) || window.localStorage.getItem(LEGACY_KEY) || null;
  } catch {
    return null; // 시크릿 창·저장소 차단
  }
}

/** 이 기기의 사람을 적어 둔다. 빈 값이면 지운다("아무도 아님" 으로 되돌리기). */
export function writeMe(memberId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (memberId) window.localStorage.setItem(KEY, memberId);
    else window.localStorage.removeItem(KEY);
  } catch {
    // 못 적어도 그만이다 — 다음에 또 물어보면 된다.
  }
}
