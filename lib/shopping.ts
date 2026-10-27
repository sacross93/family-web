// 장보기 목록의 순서 — 서버(prisma orderBy)와 화면이 **같은 줄 세우기**를 쓴다.
//
// 화면이 다른 사람의 변경을 몇 초마다 다시 읽는다(components/use-live-list.ts).
// 순서가 서버와 다르면 방금 담은 것이 맨 아래에 붙었다가 5초 뒤 맨 위로 **튄다** —
// 예전엔 실제로 맨 아래에 붙였다(서버는 새것이 위). 그래서 그릴 때마다 이 순서로 세운다.
// 서버 쪽: app/shopping/page.tsx · app/api/shopping/route.ts 의
//   orderBy: [{ done: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }]
// 하나를 바꾸면 셋을 같이 바꿀 것.

/** 줄 세우기에 필요한 칸만 — prisma 타입에 묶지 않는다(이 파일은 화면에서도 불린다). */
export interface ShoppingOrderable {
  done: boolean;
  sortOrder: number;
  /** 서버 컴포넌트에서 받으면 `Date`, `fetch().json()` 으로 받으면 ISO 문자열이다. */
  createdAt: Date | string;
}

const time = (v: Date | string) => (v instanceof Date ? v.getTime() : Date.parse(v));

/** 안 산 것 먼저 → `sortOrder` 작은 것 먼저 → 새로 담은 것 먼저. */
export function compareShopping(a: ShoppingOrderable, b: ShoppingOrderable): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return time(b.createdAt) - time(a.createdAt);
}

/** 새 배열로 돌려준다 — 상태 배열을 제자리에서 섞으면 React 가 바뀐 줄 모른다. */
export function sortShopping<T extends ShoppingOrderable>(items: readonly T[]): T[] {
  return [...items].sort(compareShopping);
}
