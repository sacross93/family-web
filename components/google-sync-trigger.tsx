"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SyncOutcome } from "@/lib/gcal/contract";

/** 같은 탭에서 마지막으로 부른 때. 홈 → 캘린더로 옮겨 다닐 때마다 부르지 않게(서버도 60초 제한을 따로 둔다). */
const LAST_KEY = "podong_gcal_synced_at";
const GAP_MS = 2 * 60_000;

/**
 * 화면이 그려진 **뒤에** 구글 캘린더와 한 번 맞춘다(스펙 §5 "언제 돈다") — 홈·캘린더에 둔다.
 *
 * 화면을 기다리게 하지 않으려고 서버 컴포넌트가 아니라 여기서 부른다. 아무것도 그리지 않고,
 * 실패는 조용히 넘긴다 — 동기화는 덤이고, 못 맞췄으면 다음에 열 때 또 맞춘다(오류는 관리자 카드가 보인다).
 * 구글에서 바뀐 것이 들어왔을 때(`changed > 0`)만 화면을 다시 읽는다.
 */
export function GoogleSyncTrigger() {
  const router = useRouter();

  useEffect(() => {
    // 자동화 브라우저(Playwright 로 도는 ui:audit·ui:flows)에서는 부르지 않는다 — audit 은 운영에 대고 "로그인 말고 쓰기 0" 을 약속하고, flows 는 진짜 캘린더를 건드리면 안 된다.
    if (navigator.webdriver) return;

    try {
      const last = Number(window.sessionStorage.getItem(LAST_KEY));
      if (last && Date.now() - last < GAP_MS) return;
      // 부르기 **전에** 적는다 — 개발 모드의 Strict Mode 가 효과를 두 번 돌려도 한 번만 나간다.
      window.sessionStorage.setItem(LAST_KEY, String(Date.now()));
    } catch {
      /* sessionStorage 를 못 쓰는 환경 — 그래도 부른다(서버가 60초 제한을 지킨다) */
    }

    // 정리 함수로 끊지 않는다: 첫 효과가 Strict Mode 로 정리되면 두 번째는 위의 기록 때문에 건너뛰므로,
    // 끊으면 개발 모드에서 새로 읽기가 영영 안 일어난다. 다른 화면으로 옮긴 뒤에 refresh 해도 해가 없다.
    fetch("/api/google/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((out: SyncOutcome | null) => {
        if (out?.ran && out.changed > 0) router.refresh();
      })
      .catch(() => {
        /* 조용히 — 위 설명 */
      });
  }, [router]);

  return null;
}
