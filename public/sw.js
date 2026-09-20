// 아주 작은 서비스 워커 — **구명정 하나만** 들고 있는다.
//
// 하는 일: 화면을 여는 요청(navigate)이 **네트워크 때문에** 실패하면 미리 받아 둔
// `/offline` 을 대신 보여 준다. 그 밖의 요청은 **손대지 않는다**(respondWith 를 안 부른다).
//
// 일부러 안 하는 것: **데이터도 화면도 캐시하지 않는다.** 가족 사이트라 오래된 장보기
// 목록이나 일정을 최신인 척 보여 주는 쪽이 훨씬 나쁘다. 그래서 이 워커는 낡을 수가 없다 —
// 들고 있는 건 "연결이 없어요" 한 장과 아이콘뿐이다.
const VERSION = "podong-lifeboat-2";
const LIFEBOAT = "/offline";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll([LIFEBOAT, "/icon.svg"])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // 화면을 여는 것만 본다. 나머지는 그대로 흘려보낸다.
  if (req.mode !== "navigate" || req.method !== "GET") return;
  const url = new URL(req.url);

  // 구명정 자체를 여는 요청이면 받아 둔 사본을 그대로 준다(여기서 또 튕기면 무한 반복이다).
  if (url.pathname === LIFEBOAT) {
    e.respondWith(caches.match(LIFEBOAT).then((r) => r || fetch(req)));
    return;
  }

  e.respondWith(
    // **먼저 네트워크.** 연결이 있으면 늘 진짜 화면이 나온다.
    // 실패하면 **주소를 바꿔서** 보낸다 — 사본을 남의 주소(`/shopping`)에 그냥 그려 주면
    // Next 가 "주소는 장보기인데 내용은 오프라인" 을 만나 오류 경계로 떨어진다.
    // 실제로 그래서 "잠시 문제가 있었어요" 가 떴다. 연결이 없을 때 할 말이 아니다.
    fetch(req).catch(() => Response.redirect(LIFEBOAT, 302))
  );
});
