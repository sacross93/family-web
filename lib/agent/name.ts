// 이 아이의 이름. **여기 한 곳에서만 정한다.**
//
// 처음엔 화면마다 "포동이" 를 손으로 적어 뒀는데, 가족이 이름을 바꾸기로 하자 20개 파일에
// 흩어진 83군데를 찾아다녀야 했다. 이름은 바뀌는 것이므로 한 곳에 둔다.
//
// **포동 은 집이고 가족이다.** 사이트 이름이자 성(姓) 같은 것이라 이 아이의 이름이 될 수 없다.
// 그래서 같은 집 식구이되 사람이 아니라는 뜻을 담아 **인공 포동이** 로 정했다(2026-09-22).

/** 화면·안내문에 쓰는 이름. */
export const AGENT_NAME = "인공 포동이";

/**
 * 기억을 **누가 적었는가**. 저장에는 이 열쇠를, 화면에는 `byLabel()` 을 쓴다.
 *
 * 한국어 이름을 그대로 저장하지 않는 이유: 이름은 또 바뀔 수 있고, 그러면 옛 기억만
 * 지난 이름을 달고 남아 **가족이 "포동이가 누구지?" 하게 된다.** 열쇠는 안 바뀐다.
 */
export const MEMORY_BY = ["agent", "family"] as const;
export type MemoryBy = (typeof MEMORY_BY)[number];

export function isMemoryBy(value: unknown): value is MemoryBy {
  return typeof value === "string" && (MEMORY_BY as readonly string[]).includes(value);
}

/** 화면에 보일 말. 모르는 값이 오면 이 아이가 적은 것으로 본다(기본값과 같은 쪽). */
export function byLabel(by: string): string {
  return by === "family" ? "가족" : AGENT_NAME;
}
