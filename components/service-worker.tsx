"use client";

import { useEffect } from "react";

/**
 * 구명정 서비스 워커를 등록한다(`public/sw.js`).
 *
 * **개발 중에는 등록하지 않는다** — `next dev` 의 새로고침과 섞이면 무엇이 문제인지
 * 알 수 없어진다. 그리고 한 번 등록된 워커는 끈질기게 남으므로, 개발에서 붙여 두면
 * 나중에 손으로 지워야 한다.
 *
 * 지우는 법(혹시 문제가 생기면): 브라우저 개발자도구 → Application → Service Workers →
 * Unregister. 또는 `public/sw.js` 를 지우고 배포하면 다음 방문에 등록이 풀린다.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // 첫 화면 그리기를 방해하지 않게 한 박자 뒤에.
    const id = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 등록이 안 돼도 사이트는 그대로 돌아간다 */
      });
    }, 1500);
    return () => clearTimeout(id);
  }, []);
  return null;
}
