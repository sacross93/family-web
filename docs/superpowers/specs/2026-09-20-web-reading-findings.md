# 실측 — 웹페이지·유튜브를 서버에서 어디까지 읽을 수 있나 (2026-09-20)

에이전트에 "링크를 주면 내용을 파악한다"를 붙이기 전에, **추측을 걷어내려고** 먼저 쟀다.
탐침 스크립트는 세션 스크래치패드(`probe-yt*.mjs`·`probe-ladder.mjs`)에 있고, 아래는 그 결과다.

계기: 사용자가 준 [Search Seoul — Debugging JavaScript for LLMs](https://gist.github.com/jonathanmooredigital/2668b3e4c89ecffe373b190fd55565dd) gist.
방향이 반대인 자료다(저쪽은 "내 페이지가 크롤러에 보이나", 우리는 "남의 페이지를 읽나") — 그래서 거울처럼 쓸모가 있었다.

---

## 1. 결론 요약

| 물음 | 답 |
|---|---|
| 유튜브 **자막 본문**을 서버에서 받을 수 있나 | ✅ **받는다.** 단 길은 하나뿐이다(§2.1). 한국어 8,942자 실측 |
| 유튜브 **제목·설명·챕터**는 | ✅ 받는다. 설명 3,416자 + 챕터 12개 (실측) |
| 일반 사이트를 fetch 만으로 읽을 수 있나 | ✅ 주류 5/5 성공 (본문 3.8K~37.7K자) |
| 브라우저(렌더)가 만능인가 | ❌ **아니다.** 못 읽는 경우의 상당수는 렌더해도 못 읽는다 |

**설계에 주는 함의: 브라우저는 첫 칸이 아니라 마지막 칸이고, 없어도 대부분 된다.**

---

## 2. 유튜브 자막 — 길은 하나뿐이다

> ⚠️ **2026-09-20 정정.** 처음 이 문서는 "못 받는다"로 결론지었다. **틀렸다.**
> 사용자가 알려준 `youtube-transcript-api`(파이썬)를 직접 돌려 보니 한국어 자막 8,942자를 받아 왔다.
> 아래 실패 표는 여전히 사실이지만, **전부 같은 실수를 공유하고 있었다** — 자막 주소를
> watch 페이지에서 꺼낸 것. 살아 있는 주소는 다른 곳에 있다(§2.1).
>
> 교훈: "여러 갈래로 해 봤다"는 불가능의 증거가 아니다. 그 갈래들이 같은 가정을 공유하면
> 열다섯 번을 해도 한 번 한 것과 같다.

`aircAruvnKk`(3Blue1Brown, 자막 31개 언어)로 쟀다. 아래는 **안 되는 길들**이다.

| 경로 | 결과 |
|---|---|
| `ytInitialPlayerResponse` → `captionTracks[].baseUrl` | HTTP 200, **0자** |
| 같은 URL + `fmt=srv3` / `fmt=vtt` / `fmt=json3&c=WEB` | 전부 HTTP 200, **0자** |
| 같은 URL + `Referer`·`Origin` 헤더 | HTTP 200, **0자** |
| 옛 `video.google.com/timedtext` | HTTP 200, **0자** |
| `youtube.com/api/timedtext` 직접 | HTTP 200, **0자** |
| InnerTube `/youtubei/v1/player` — ANDROID·IOS | HTTP **400** |
| InnerTube — WEB | 200, `playabilityStatus=UNPLAYABLE`, 트랙 0 |
| InnerTube — TVHTML5_SIMPLY_EMBEDDED_PLAYER | 200, `status=ERROR`, 트랙 0 |
| **진짜 크롬**(CDP 제어) 안에서 같은 baseUrl fetch | HTTP 200, **0자** |
| **진짜 크롬** UI 로 "스크립트" 패널 열기 | 패널은 열리나 **비어 있음**. 영상 재생도 거부됨("미디어를 재생할 수 없습니다") |
| Piped 공개 인스턴스 3곳 | 전부 실패(JSON 깨짐·fetch 실패·HTML 반환) |
| Invidious `inv.nadeko.net` 자막 **목록** | ✅ 200, 31개 |
| 같은 인스턴스 자막 **본문** (`?lang=`·`?label=` 3가지) | 전부 200, **0자** |
| InnerTube `/youtubei/v1/get_transcript` — UI 패널이 쓰는 그 엔드포인트 | HTTP **400** `Precondition check failed` |
| 같은 엔드포인트 + `visitorData`·쿠키·`x-goog-visitor-id`·`x-youtube-client-*` 풀 컨텍스트 | HTTP **400** 동일 |

`getTranscriptEndpoint.params`(120자)는 watch 페이지에 **있다.** 그런데도 거절된다 —
그 blob 역시 세션에 묶여 있다는 뜻이다. 즉 페이지에서 꺼낼 수 있는 값만으로는 안 된다.

위 표의 **공통점**: 자막 주소를 `watch` 페이지의 `ytInitialPlayerResponse` 에서 꺼냈다.
**그 주소가 죽은 주소다.** 파라미터에 `pot`(PO 토큰)이 없고, 유튜브는 그 주소로는 빈 몸통을 준다.

### 2.1 되는 길 — ANDROID 클라이언트의 player 응답

```
1. GET  https://www.youtube.com/watch?v=<id>        → HTML 에서 INNERTUBE_API_KEY 추출
2. POST https://www.youtube.com/youtubei/v1/player?key=<key>
        {"context":{"client":{"clientName":"ANDROID","clientVersion":"20.10.38"}},"videoId":"<id>"}
                                                    → captions…captionTracks[].baseUrl  ← 살아 있는 주소
3. GET  <baseUrl 에서 &fmt=srv3 를 뗀 주소>           → 자막 XML
```

**어긋나면 안 되는 값 셋** (전부 실측으로 확인, 시험이 붙잡고 있다):

| 값 | 틀리면 |
|---|---|
| `clientVersion` `20.10.38` | `19.09.37` 로는 **HTTP 400** |
| `&fmt=srv3` 를 **뗀다** (fmt 를 붙이지 않는다) | 붙이면 **빈 몸통** |
| `&exp=xpe` 가 있으면 포기 | 그 영상은 PO 토큰이 필요하다 |

Node 로 옮겨 실측: 트랙 31개, 조각 255개, **한국어 8,942자**.

출처는 `youtube-transcript-api`(파이썬)의 `_settings.py`·`_transcripts.py`.
비공식 경로라 언제든 바뀔 수 있다 — **바뀌면 이 세 값부터 의심할 것.**

### 2.2 자막을 못 받는 경우의 대비

`exp=xpe` 가 붙었거나 자막 자체가 없는 영상이 있다. 그때는 받을 수 있는 것으로 답한다:

- 제목 · 채널 · 길이(19분) · 조회수
- **설명 3,416자** (`videoDetails.shortDescription`)
- **챕터 12개** — `ytInitialData` 의 `chapterRenderer`. 사실상 영상의 목차다
- 폴백으로 `oembed` (제목·채널만, 200 확인)

**자막을 읽었는지 아닌지를 결과 글이 밝힌다.** 밝히지 않으면 모델이 영상을 본 것처럼 말한다 —
실측에서 "3분쯤에 뭐라고 해?"에 없는 내용을 지어냈다. 자동 생성 자막이면 "받아쓰기라 틀린 곳이
있을 수 있다"까지 적는다.

---

## 3. 일반 URL — fetch 만으로 주류는 다 읽힌다

| 사이트 | HTML | 본문 추출 | 블롭 | 판정 |
|---|---|---|---|---|
| childcare.go.kr (아이사랑) | 66KB | **3,796자** | — | 본문으로 충분 |
| namu.wiki/w/임신 | 428KB | **37,772자** | — | 본문으로 충분(너무 많다) |
| nextjs.org/docs | 465KB | 8,939자 | `self.__next_f` 215KB | 본문으로 충분 |
| mohw.go.kr (보건복지부) | 96KB | 6,108자 | — | 본문으로 충분 |
| terms.naver.com (지식백과) | 93KB | 6,432자 | `self.__next_f` 56KB | 본문으로 충분 |

**주류 5/5 성공.** 브라우저 없이.

### 그런데 추출 품질이 문제다

뽑아낸 글에 껍데기가 잔뜩 섞인다:

```
메인페이지 > 임신육아종합포털 아이사랑 Loading... 닫기 확인 취소 닫기 확인 취소 닫기 알림 확인 … 본문내용 바로가기 대메…
정보목록 검색 … 본문으로 바로가기 주메뉴 바로가기 서브메뉴 바로가기 이…
```

그리고 나무위키는 **37,772자**다. 한 턴에 넣을 수 없다.
**즉 진짜 일거리는 "가져오기"가 아니라 "추려내기"다.**

---

## 4. 못 읽는 경우는 네 종류다 — 그리고 렌더가 고치는 건 하나뿐

| 종류 | 실측 | 렌더하면 되나 |
|---|---|---|
| **차단** | coupang.com → `Access Denied`, 본문 316자 | ❌ 안 된다. 봇 차단은 렌더해도 걸린다(데이터센터 IP) |
| **블롭 안에 내용** | instagram.com → 본문 **9자**, `application/json` **508KB** | ❌ 필요 없다. 블롭을 파면 된다 |
| **껍데기/프레임** | blog.naver.com → 3KB, 본문 **19자**, 블롭 없음 | △ 되지만, 주소 재작성(`PostView.naver`)이 더 싸고 확실하다 |
| **진짜 JS 렌더** | (이번 표본에선 안 나옴) | ✅ 렌더가 답 |

**브라우저를 지어도 쿠팡은 못 읽고 인스타는 안 지어도 읽힌다.**
렌더는 "못 읽을 때 쓰는 마지막 수단"이지 "못 읽음의 해결책"이 아니다.

---

## 5. gist 에서 가져온 것 / 고친 것

**가져온 것**
- §2.2 상태 블롭 개념 — 이게 이 조사에서 제일 값진 아이디어였다. 인스타가 그 증거다
- §5 메타 + JSON-LD(`application/ld+json`) 추출 — "한 줄 설명"은 보통 여기 있다
- §4·§7 "서버 HTML 에 있나, JS 가 만들었나"라는 판단 틀
- §3 크롤러 UA — **레시피가 아니라 경고로.** 봇 UA 는 다르게 응답받는다

**고친 것**
- `__NEXT_DATA__` 는 **Pages Router** 시절 것이다. 실측한 Next 사이트 2곳 모두 **`self.__next_f`**(App Router)였고 `__NEXT_DATA__` 는 notion.so 한 곳뿐이었다. gist 목록만 믿으면 요즘 사이트를 놓친다
- Nuxt 도 `__NUXT_DATA__` 는 3.x, 2.x 는 `window.__NUXT__`
- gist 의 스니펫은 **DevTools 콘솔 전용**이다(`$0`·`copy()`·`console.table`·`getSelection`). 서버로 옮길 수 있는 건 코드가 아니라 선택자와 판단 기준이다

---

## 6. 이 결과가 설계에 강제하는 것

1. **계단으로 짓는다.** 메타 → JSON-LD → 본문 → 블롭 → (마지막에) 렌더. 위 칸에서 끝나면 아래로 안 간다
2. **브라우저는 v1 에서 빼도 된다.** 주류 5/5 가 없이 되고, 없이 안 되는 것의 다수는 있어도 안 된다. 무료 제약과 싸울 이유가 줄었다
3. **진짜 일거리는 추려내기다.** 껍데기 제거 + 분량 예산. 37,772자를 그대로 넣으면 한 턴이 날아간다
4. **못 읽었으면 못 읽었다고 말한다.** `Access Denied` 본문 316자를 "내용"이라고 넘기면 모델이 그걸 요약해서 태연히 거짓말한다. 이게 이 프로젝트에서 반복해 잡아 온 실수다
5. **유튜브 자막은 ANDROID player 경로로 받는다**(§2.1). 못 받는 영상은 설명·챕터로 답하되 그 사실을 밝힌다
6. **"여러 번 해 봤다"를 불가능의 근거로 쓰지 않는다.** 이 문서가 한 번 틀렸던 자리다 — 시도들이 같은 가정을 공유하면 횟수는 증거가 못 된다
