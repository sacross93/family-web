"use client";

import { useCallback, useEffect, useRef } from "react";

/** 이만큼마다 다시 읽는다. 마트에서 "방금 담았어" 가 보이기까지 기다릴 만한 길이. */
const POLL_MS = 5_000;
/**
 * 이만큼 아무도 안 만지면 멈춘다. 데스크톱에 열어 둔 탭이 하루 종일 5초마다 부르면
 * Vercel 함수와 Neon DB 가 잠들지 못한다(무료 한도). 만지거나 돌아오면 바로 다시 읽고 이어 간다.
 */
const IDLE_MS = 10 * 60_000;
/** "사람이 아직 보고 있다" 로 치는 것들. 탭마다 부르지는 않는다 — 멈춰 있을 때만 깨운다. */
const INTERACTIONS = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * 공유 목록을 **새로고침 없이** 맞춘다 — 다른 가족의 폰·다른 탭·포동이(서버에서 담는다)가
 * 바꾼 것이 몇 초 안에 보인다. 아이폰 홈 화면 앱에는 새로고침 버튼이 아예 없다.
 *
 * 화면에 보이는 동안만 `url` 을 `POLL_MS` 마다 GET 하고, 돌아오면(`visibilitychange`·`focus`·`online`)
 * 바로 한 번 읽는다. 숨겨지면 쉬고, `IDLE_MS` 동안 손대지 않으면 멈춘다. 실패는 조용히 — 다음 차례에 또 읽는다.
 *
 * **내가 바꾸는 동안 읽은 것은 버린다.** 내 쓰기보다 먼저 DB 를 읽은 응답이 늦게 도착하면
 * 낙관적으로 바꿔 둔 체크·담기·지우기를 5초 동안 되돌린다(깜빡인다). 그래서 쓰기는 전부 `track()` 으로 감싼다:
 * - 쓰는 중(`pending > 0`)이면 읽기를 시작하지 않는다.
 * - 읽기가 시작된 뒤에 쓰기가 하나라도 시작됐으면(`gen` 이 바뀜) 그 응답은 버린다.
 * - 돌아왔을 때 아직 쓰는 중이어도 버린다.
 * 쓰기가 끝난 뒤 시작한 읽기는 내 쓰기를 이미 담고 있으니 그대로 쓴다.
 *
 * `apply` 는 ref 에 담아 두므로 부르는 쪽이 `useCallback` 으로 감쌀 필요 없다(`setItems` 를 그대로 넘겨도 된다).
 */
export function useLiveList<T>(
  url: string,
  apply: (fresh: T[]) => void
): { track: <R>(fn: () => Promise<R>) => Promise<R> } {
  const applyRef = useRef(apply);
  // 렌더 중에 ref 를 쓰면 react-hooks/refs 가 막는다 — 그린 뒤에 최신 것으로 바꿔 둔다.
  useEffect(() => {
    applyRef.current = apply;
  });

  /** 쓰기가 시작될 때마다 1씩 — 읽기가 시작될 때 값과 다르면 그 읽기는 낡았다. */
  const gen = useRef(0);
  /** 아직 안 끝난 쓰기 수. */
  const pending = useRef(0);

  const track = useCallback(async <R>(fn: () => Promise<R>): Promise<R> => {
    gen.current += 1;
    pending.current += 1;
    try {
      return await fn();
    } finally {
      pending.current -= 1;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    /** 한 번에 하나만 — 느린 응답 위에 읽기가 쌓이지 않게. */
    let inflight = false;
    let timer: number | undefined;
    /** 숨겨졌거나 오래 안 만져서 다음 차례를 안 잡아 둔 상태. */
    let stopped = false;
    let lastActive = Date.now();

    const visible = () => document.visibilityState === "visible";

    async function poll() {
      if (inflight || pending.current > 0) return;
      inflight = true;
      const startedAt = gen.current;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const fresh: unknown = await res.json();
        if (!alive || !Array.isArray(fresh)) return;
        // 위 설명 — 읽는 사이에 내가 쓰기 시작했거나 아직 쓰는 중이면 이 목록은 내 변경을 모른다.
        if (gen.current !== startedAt || pending.current > 0) return;
        applyRef.current(fresh as T[]);
      } catch {
        /* 끊김·잘못된 JSON — 다음 차례에 또 읽는다 */
      } finally {
        inflight = false;
      }
    }

    /** 다음 차례를 잡는다. 타이머는 언제나 하나뿐이다(먼저 지우고 잡는다). */
    function schedule() {
      window.clearTimeout(timer);
      timer = undefined;
      if (!alive) return;
      stopped = !visible() || Date.now() - lastActive > IDLE_MS;
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    }

    async function tick() {
      timer = undefined;
      await poll();
      schedule();
    }

    /** 돌아왔다 — 바로 읽고 다시 이어 간다. */
    function wake() {
      lastActive = Date.now();
      if (!alive || !visible()) return;
      window.clearTimeout(timer);
      timer = undefined;
      stopped = false;
      void tick();
    }

    function onInteract() {
      lastActive = Date.now();
      if (stopped) wake();
    }

    function onVisibility() {
      if (visible()) {
        wake();
      } else {
        window.clearTimeout(timer);
        timer = undefined;
        stopped = true;
      }
    }

    // 처음에는 읽지 않는다 — 서버가 방금 그려 준 목록이 가장 새것이다.
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    for (const type of INTERACTIONS) {
      window.addEventListener(type, onInteract, { capture: true, passive: true });
    }

    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      for (const type of INTERACTIONS) {
        window.removeEventListener(type, onInteract, { capture: true });
      }
    };
  }, [url]);

  return { track };
}
