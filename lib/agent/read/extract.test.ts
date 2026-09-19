import { describe, expect, it } from "vitest";

import {
  extractBlobText,
  extractImages,
  extractJsonLd,
  extractPage,
  looksBlocked,
  mainRegion,
  stripTags,
} from "./extract";

const BASE = "https://example.com/article/1";

describe("stripTags", () => {
  it("껍데기 태그는 통째로 버린다", () => {
    const html = `
      <nav>홈 로그인 장바구니</nav>
      <header>상단 배너</header>
      <p>진짜 본문입니다.</p>
      <footer>회사 소개 이용약관</footer>
      <script>var a = "스크립트 안의 글";</script>
      <style>.x{content:"스타일 안의 글"}</style>`;
    const out = stripTags(html);
    expect(out).toBe("진짜 본문입니다.");
  });

  it("닫히지 않은 script 가 남은 잘린 HTML 도 삼키지 않는다", () => {
    // 2MiB 상한에 걸려 중간에서 잘린 문서가 실제로 들어온다.
    const out = stripTags(`<p>본문</p><script>var x = "안 닫힘`);
    expect(out).toBe("본문");
  });

  it("태그 자리에 공백을 남겨 단어가 붙지 않게 한다", () => {
    expect(stripTags("<p>앞</p><p>뒤</p>")).toBe("앞 뒤");
  });
});

describe("mainRegion", () => {
  it("main 안쪽만 고른다", () => {
    const html = `<body><nav>메뉴</nav><main><p>본문</p></main><footer>바닥</footer></body>`;
    expect(stripTags(mainRegion(html))).toBe("본문");
  });

  it("main·article 이 여럿이면 가장 긴 것 하나만 — 이으면 같은 글이 두 번 들어간다", () => {
    const html = `<article>짧은 미리보기</article><article>${"긴 본문입니다. ".repeat(40)}</article>`;
    const out = stripTags(mainRegion(html));
    expect(out).not.toContain("짧은 미리보기");
    expect(out).toContain("긴 본문입니다.");
  });

  it("main 이 없으면 body 로 떨어진다", () => {
    expect(stripTags(mainRegion(`<html><body><p>본문만</p></body></html>`))).toBe("본문만");
  });

  it("body 도 없으면 통째로 본다", () => {
    expect(stripTags(mainRegion(`<p>조각</p>`))).toBe("조각");
  });

  it("main 이 거의 비어 있으면 믿지 않고 body 로 떨어진다 — 마크업이 거짓말하는 경우", () => {
    const html = `<body><main>메뉴</main><div>${"진짜 글이 바깥에 있습니다. ".repeat(20)}</div></body>`;
    expect(stripTags(mainRegion(html))).toContain("진짜 글이 바깥에 있습니다.");
  });
});

describe("extractJsonLd", () => {
  it("@graph 안의 항목을 펼친다", () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"Article","articleBody":"기사 본문"},{"@type":"Person","name":"글쓴이"}]}
    </script>`;
    expect(extractJsonLd(html)).toEqual([
      { type: "Article", text: "기사 본문" },
      { type: "Person", text: "" },
    ]);
  });

  it("깨진 블록 하나가 나머지를 버리게 하지 않는다", () => {
    const html =
      `<script type="application/ld+json">{ 깨짐 </script>` +
      `<script type="application/ld+json">{"@type":"Recipe","description":"레시피 설명"}</script>`;
    expect(extractJsonLd(html)).toEqual([{ type: "Recipe", text: "레시피 설명" }]);
  });

  it("@type 이 배열이면 첫 번째를 쓴다", () => {
    const html = `<script type="application/ld+json">{"@type":["NewsArticle","Article"],"description":"설명"}</script>`;
    expect(extractJsonLd(html)[0].type).toBe("NewsArticle");
  });
});

describe("extractBlobText", () => {
  it("application/json 블롭에서 글을 건진다 — 인스타 같은 경우", () => {
    // 실측: 본문 9자, application/json 508KB
    const html = `<script type="application/json">
      {"data":{"post":{"caption":"오늘 발리 해변에서 찍은 사진이에요 정말 좋았습니다","id":"abc123"}}}
    </script>`;
    expect(extractBlobText(html)).toContain("오늘 발리 해변에서 찍은 사진이에요");
  });

  it("짧은 문자열과 키 이름은 글로 치지 않는다", () => {
    const html = `<script type="application/json">{"a":"짧음","b":"shortkey","c":"x"}</script>`;
    expect(extractBlobText(html)).toBe("");
  });

  it("주소는 글이 아니다", () => {
    const html = `<script type="application/json">{"u":"https://example.com/아주아주긴주소여기에계속이어짐"}</script>`;
    expect(extractBlobText(html)).toBe("");
  });

  it("self.__next_f (App Router) 조각에서 글을 건진다", () => {
    // 실측: nextjs.org·terms.naver.com 둘 다 __NEXT_DATA__ 가 아니라 이 모양이었다
    const html = `<script>self.__next_f.push([1,"a:[\\"$\\",\\"p\\",null,{\\"children\\":\\"임신 초기에 알아두면 좋은 것들\\"}]"])</script>`;
    expect(extractBlobText(html)).toContain("임신 초기에 알아두면 좋은 것들");
  });

  it("사람이 읽는 글이 아닌 것은 버린다 — UA·CSS 클래스·RSC 조각", () => {
    // 셋 다 실측에서 블롭 맨 앞에 나왔던 것들이다. 본문이 비면 모델이 처음 보는 글이라 특히 나쁘다.
    const junk = [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "min-h-screen bg-white text-base antialiased",
      "}]}]}],null]}] 11:[ 19:I[623370,[[ ] 1a:I[621862,[[",
    ];
    for (const j of junk) {
      const html = `<script type="application/json">{"x":${JSON.stringify(j)}}</script>`;
      expect(extractBlobText(html), j.slice(0, 30)).toBe("");
    }
  });

  it("같은 문장이 여러 번 들어 있어도 한 번만 남긴다", () => {
    const line = "블롭 안에서 반복되는 같은 문장입니다";
    const html = `<script type="application/json">{"a":"${line}","b":"${line}"}</script>`;
    expect(extractBlobText(html)).toBe(line);
  });
});

describe("extractImages", () => {
  it("og:image 가 가장 앞이다 — 페이지를 대표하라고 만든 값이다", () => {
    const html = `<meta property="og:image" content="/hero.jpg"><main><img src="/body.jpg"></main>`;
    expect(extractImages(html, BASE, mainRegion(html))[0]).toBe("https://example.com/hero.jpg");
  });

  it("상대 주소를 절대 주소로 바꾼다", () => {
    const html = `<meta property="og:image" content="../up.jpg">`;
    expect(extractImages(html, BASE, "")).toEqual(["https://example.com/up.jpg"]);
  });

  it("장식 그림은 거른다", () => {
    const html = `<main><img src="/logo.png"><img src="/sprite.svg"><img src="/photo.jpg"></main>`;
    expect(extractImages(html, BASE, mainRegion(html))).toEqual(["https://example.com/photo.jpg"]);
  });

  it("data: 와 http(s) 아닌 스킴은 버린다", () => {
    const html = `<main><img src="data:image/png;base64,AAA"><img src="ftp://h/x.jpg"></main>`;
    expect(extractImages(html, BASE, mainRegion(html))).toEqual([]);
  });

  it("같은 그림을 두 번 넣지 않는다", () => {
    const html = `<meta property="og:image" content="/same.jpg"><main><img src="/same.jpg"></main>`;
    expect(extractImages(html, BASE, mainRegion(html))).toEqual(["https://example.com/same.jpg"]);
  });
});

describe("looksBlocked", () => {
  it("짧은 Access Denied 를 내용으로 넘기지 않는다", () => {
    // 실측: coupang.com 이 HTTP 200 에 본문 316자짜리 Access Denied 를 줬다
    expect(looksBlocked(200, "Access Denied", "Access Denied You don't have permission to access")).toBe(true);
  });

  it("403·429 는 본문과 무관하게 차단이다", () => {
    expect(looksBlocked(403, "", "")).toBe(true);
    expect(looksBlocked(429, "", "")).toBe(true);
  });

  it("긴 글 안에 captcha 라는 낱말이 있는 건 차단이 아니다", () => {
    const body = `캡차와 captcha 우회에 대한 긴 해설 기사입니다. ${"내용이 계속 이어집니다. ".repeat(200)}`;
    expect(body.length).toBeGreaterThan(1500);
    expect(looksBlocked(200, "captcha 해설", body)).toBe(false);
  });

  it("평범한 페이지는 차단이 아니다", () => {
    expect(looksBlocked(200, "임신 - 나무위키", "임신에 대한 설명입니다.")).toBe(false);
  });
});

describe("extractPage", () => {
  const html = `<!doctype html><html><head>
      <title>임신 초기 &amp; 주의할 점</title>
      <meta name="description" content="임신 초기에 알아두면 좋은 것들">
      <meta property="og:site_name" content="아이사랑">
      <meta property="og:image" content="https://cdn.example.com/hero.jpg">
      <script type="application/ld+json">{"@type":"Article","articleBody":"기사 전문"}</script>
    </head><body>
      <nav>메뉴 로그인</nav>
      <main><p>본문 첫 문단입니다.</p></main>
      <footer>바닥글</footer>
    </body></html>`;

  it("계단의 각 칸을 따로 담는다", () => {
    const p = extractPage(html, BASE);
    expect(p.title).toBe("임신 초기 & 주의할 점");
    expect(p.description).toBe("임신 초기에 알아두면 좋은 것들");
    expect(p.siteName).toBe("아이사랑");
    expect(p.jsonLd).toEqual([{ type: "Article", text: "기사 전문" }]);
    expect(p.body).toBe("본문 첫 문단입니다.");
    expect(p.images).toEqual(["https://cdn.example.com/hero.jpg"]);
  });

  it("엔티티를 사람이 읽는 글자로 되돌린다", () => {
    const p = extractPage(`<title>a &amp; b</title><body><p>&#54620;&lt;글&gt;</p></body>`, BASE);
    expect(p.title).toBe("a & b");
    expect(p.body).toBe("한<글>");
  });

  it("&amp;lt; 가 < 로 두 번 풀리지 않는다", () => {
    expect(extractPage(`<title>&amp;lt;</title>`, BASE).title).toBe("&lt;");
  });
});
