// 사진 보기의 밀어서 넘기기 — 손가락이 움직인 만큼으로 넘길지 정한다. 순수 함수(시험이 붙잡고 있다).

/** 이만큼은 가로로 움직여야 넘긴다. 사진을 누르다 손이 조금 미끄러진 것은 넘기기가 아니다. */
export const SWIPE_MIN_PX = 40;

/**
 * 가로가 세로의 이 배수는 넘어야 넘긴다. 대각선으로 끌어내린 것은 **스크롤**이다 — 폰에서 사진 보기 판은
 * 캡션 칸까지 세로로 굴러가야 해서, 비스듬한 손짓을 넘기기로 삼키면 판을 못 내린다.
 */
const MOSTLY_HORIZONTAL = 1.5;

/** 움직임(뗀 자리 − 누른 자리) → -1 이전 사진 · 1 다음 사진 · 0 그대로. 왼쪽으로 밀면 다음이다. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dx) < Math.abs(dy) * MOSTLY_HORIZONTAL) return 0;
  return dx < 0 ? 1 : -1;
}
