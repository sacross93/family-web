import { describe, expect, it } from "vitest";

import {
  captionUrl,
  extractChapters,
  humanDuration,
  innertubeApiKey,
  parseCaptionXml,
  parseWatchPage,
  pickCaptionTrack,
  playerCaptionTracks,
  playerRequestBody,
  timeLabel,
  youtubeId,
  youtubeSummaryText,
} from "./youtube";

describe("youtubeId", () => {
  it("여러 모양의 유튜브 주소를 같은 id 로 읽는다", () => {
    const id = "aircAruvnKk";
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=30s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
    ]) {
      expect(youtubeId(url), url).toBe(id);
    }
  });

  it("유튜브가 아니면 null", () => {
    expect(youtubeId("https://example.com/watch?v=aircAruvnKk")).toBeNull();
    expect(youtubeId("https://youtube.com.evil.example/watch?v=aircAruvnKk")).toBeNull();
    expect(youtubeId("not a url")).toBeNull();
  });

  it("id 모양이 아니면 null — 주소를 잘못 읽은 것이다", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=has/slash11")).toBeNull();
    expect(youtubeId("https://www.youtube.com/")).toBeNull();
  });

  it("http(s) 가 아닌 스킴은 받지 않는다", () => {
    expect(youtubeId("javascript:alert(1)//youtube.com/watch?v=aircAruvnKk")).toBeNull();
  });
});

describe("extractChapters", () => {
  it("chapterRenderer 에서 제목을 순서대로 뽑는다", () => {
    // 실측: 3Blue1Brown 영상이 12개였다
    const html = [
      `"chapterRenderer":{"title":{"simpleText":"Introduction example"},"timeRangeStartMillis":0}`,
      `"chapterRenderer":{"title":{"simpleText":"Series preview"},"timeRangeStartMillis":61000}`,
      `"chapterRenderer":{"title":{"simpleText":"What are neurons?"},"timeRangeStartMillis":121000}`,
    ].join(",");
    expect(extractChapters(html)).toEqual([
      { title: "Introduction example", startSeconds: 0 },
      { title: "Series preview", startSeconds: 61 },
      { title: "What are neurons?", startSeconds: 121 },
    ]);
  });

  it("이스케이프된 따옴표와 유니코드를 되돌린다", () => {
    const html = `"chapterRenderer":{"title":{"simpleText":"\\uc784\\uc2e0 \\"\\ucd08\\uae30\\""}}`;
    expect(extractChapters(html)).toEqual([{ title: '임신 "초기"', startSeconds: 0 }]);
  });

  it("챕터가 없으면 빈 배열", () => {
    expect(extractChapters(`<html>아무것도 없음</html>`)).toEqual([]);
  });
});

describe("timeLabel", () => {
  it("영상 안 시각으로 읽는다", () => {
    expect(timeLabel(0)).toBe("0:00");
    expect(timeLabel(61)).toBe("1:01");
    expect(timeLabel(600)).toBe("10:00");
    expect(timeLabel(3723)).toBe("1:02:03");
  });
});

describe("humanDuration", () => {
  it("시·분·초로 읽는다", () => {
    expect(humanDuration(1120)).toBe("18분 40초");
    expect(humanDuration(3661)).toBe("1시간 1분 1초");
    expect(humanDuration(45)).toBe("45초");
    expect(humanDuration(120)).toBe("2분");
  });

  it("알 수 없으면 빈 문자열", () => {
    expect(humanDuration(0)).toBe("");
    expect(humanDuration(NaN)).toBe("");
    expect(humanDuration(-5)).toBe("");
  });
});

/** 실측한 watch 페이지와 같은 모양(값만 줄임). */
const WATCH_HTML = `<!doctype html><html><head><title>유튜브</title></head><body>
<script nonce="x">var ytInitialPlayerResponse = {"responseContext":{},"playabilityStatus":{"status":"OK"},
"videoDetails":{"videoId":"aircAruvnKk","title":"But what is a neural network?","lengthSeconds":"1120",
"author":"3Blue1Brown","viewCount":"24377557","shortDescription":"What are the neurons, why are there layers?\\nHelp fund: https://patreon.com/3blue1brown"},
"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[
{"baseUrl":"https://www.youtube.com/api/timedtext?v=aircAruvnKk","languageCode":"en"},
{"baseUrl":"https://www.youtube.com/api/timedtext?v=aircAruvnKk","languageCode":"ko"},
{"baseUrl":"https://www.youtube.com/api/timedtext?v=aircAruvnKk","languageCode":"ko"}]}}};var meta = 1;</script>
<script>var ytInitialData = {"contents":{"x":[
{"chapterRenderer":{"title":{"simpleText":"Introduction example"}}},
{"chapterRenderer":{"title":{"simpleText":"Series preview"}}}]}};</script>
</body></html>`;

describe("parseWatchPage", () => {
  it("실측 모양의 watch 페이지를 읽는다", () => {
    const info = parseWatchPage(WATCH_HTML, "aircAruvnKk");
    expect(info).not.toBeNull();
    expect(info!.title).toBe("But what is a neural network?");
    expect(info!.author).toBe("3Blue1Brown");
    expect(info!.lengthSeconds).toBe(1120);
    expect(info!.viewCount).toBe("24377557");
    expect(info!.description).toContain("What are the neurons");
    expect(info!.chapters).toEqual([
      { title: "Introduction example", startSeconds: 0 },
      { title: "Series preview", startSeconds: 0 },
    ]);
  });

  it("같은 언어 트랙이 여러 개여도 언어는 한 번만 센다", () => {
    expect(parseWatchPage(WATCH_HTML, "aircAruvnKk")!.captionLanguages).toEqual(["en", "ko"]);
  });

  it("중괄호가 문자열 안에 있어도 객체 끝을 옳게 찾는다", () => {
    const html = `var ytInitialPlayerResponse = {"videoDetails":{"title":"괄호 } 가 제목에 있음","author":"A"}};`;
    expect(parseWatchPage(html, "x")!.title).toBe("괄호 } 가 제목에 있음");
  });

  it("이스케이프된 따옴표가 객체를 일찍 끝내지 않는다", () => {
    const html = `var ytInitialPlayerResponse = {"videoDetails":{"title":"따옴표 \\" 포함","author":"A"}};`;
    expect(parseWatchPage(html, "x")!.title).toBe('따옴표 " 포함');
  });

  it("playerResponse 가 없으면 null", () => {
    expect(parseWatchPage(`<html>동의 화면입니다</html>`, "x")).toBeNull();
  });
});

describe("youtubeSummaryText", () => {
  const base = parseWatchPage(WATCH_HTML, "aircAruvnKk")!;

  it("챕터에 시각을 함께 준다 — 없으면 모델이 시각을 지어낸다(실측)", () => {
    const text = youtubeSummaryText({ ...base, chapters: [{ title: "뉴런이란", startSeconds: 121 }] });
    expect(text).toContain("2:01  뉴런이란");
    expect(text).toContain("이 시각 정보 말고는 언제 무슨 말을 했는지 알 수 없습니다");
  });

  it("자막을 못 읽었다는 사실이 글 안에 들어간다", () => {
    // 이 문장이 빠지면 모델이 영상을 본 것처럼 말한다.
    const text = youtubeSummaryText(base);
    expect(text).toContain("내려받지 못했습니다");
    expect(text).toContain("자막이 아니라 설명과 챕터");
  });

  it("자막 트랙이 아예 없으면 그렇게 말한다", () => {
    const text = youtubeSummaryText({ ...base, captionLanguages: [] });
    expect(text).toContain("확인하지 못했습니다");
    expect(text).not.toContain("자막: 없습니다"); // 배포에서는 있는 자막도 안 보인다 — 없다고 단정하면 거짓
    expect(text).not.toContain("내려받지 못했습니다");
  });

  it("제목·채널·길이·챕터·설명을 담는다", () => {
    const text = youtubeSummaryText(base);
    expect(text).toContain("제목: But what is a neural network?");
    expect(text).toContain("채널: 3Blue1Brown");
    expect(text).toContain("길이: 18분 40초");
    expect(text).toContain("0:00  Introduction example");
    expect(text).toContain("What are the neurons");
  });

  it("없는 값은 줄을 만들지 않는다", () => {
    const text = youtubeSummaryText({ ...base, author: "", lengthSeconds: 0, viewCount: "", chapters: [], description: "" });
    expect(text).not.toContain("채널:");
    expect(text).not.toContain("길이:");
    expect(text).not.toContain("조회수:");
    expect(text).not.toMatch(/챕터 \d+개:/); // 안내 문장 속 "챕터"는 남는다
    expect(text).not.toContain("설명:");
  });
});

describe("자막 가져오기", () => {
  it("watch 페이지에서 InnerTube 열쇠를 꺼낸다", () => {
    expect(innertubeApiKey(`x"INNERTUBE_API_KEY": "AIzaSy-abc_123"y`)).toBe("AIzaSy-abc_123");
    expect(innertubeApiKey("열쇠 없음")).toBeNull();
  });

  it("player 요청은 ANDROID 20.10.38 로 나간다 — 낮추면 HTTP 400 이다(실측)", () => {
    expect(playerRequestBody("aircAruvnKk")).toEqual({
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
      videoId: "aircAruvnKk",
    });
  });

  it("player 응답에서 트랙을 읽고 자동 생성 여부를 표시한다", () => {
    const player = {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { languageCode: "en", baseUrl: "https://t/en", kind: "asr" },
            { languageCode: "ko", baseUrl: "https://t/ko" },
            { languageCode: "", baseUrl: "https://t/x" },
          ],
        },
      },
    };
    expect(playerCaptionTracks(player)).toEqual([
      { languageCode: "en", baseUrl: "https://t/en", isGenerated: true },
      { languageCode: "ko", baseUrl: "https://t/ko", isGenerated: false },
    ]);
  });

  it("자막이 없는 응답에는 빈 배열", () => {
    expect(playerCaptionTracks({})).toEqual([]);
    expect(playerCaptionTracks(null)).toEqual([]);
  });

  it("사람이 단 자막을 자동 생성보다 먼저 고른다", () => {
    const tracks = [
      { languageCode: "ko", baseUrl: "a", isGenerated: true },
      { languageCode: "ko", baseUrl: "b", isGenerated: false },
    ];
    expect(pickCaptionTrack(tracks, ["ko"])?.baseUrl).toBe("b");
  });

  it("원하는 언어가 없으면 있는 것이라도 읽는다 — 영어라도 없는 것보단 낫다", () => {
    const tracks = [{ languageCode: "ja", baseUrl: "j", isGenerated: false }];
    expect(pickCaptionTrack(tracks, ["ko", "en"])?.languageCode).toBe("ja");
    expect(pickCaptionTrack([], ["ko"])).toBeNull();
  });

  it("fmt=srv3 를 뗀다 — 붙은 채로는 빈 몸통이 온다", () => {
    expect(captionUrl({ languageCode: "ko", baseUrl: "https://t/ko?a=1&fmt=srv3", isGenerated: false }))
      .toBe("https://t/ko?a=1");
  });

  it("exp=xpe 가 있으면 포기한다 — PO 토큰이 필요한 영상이다", () => {
    expect(captionUrl({ languageCode: "ko", baseUrl: "https://t/ko?a=1&exp=xpe", isGenerated: false })).toBeNull();
  });

  it("자막 XML 을 글로 잇는다", () => {
    const xml = `<?xml version="1.0"?><transcript>
      <text start="0" dur="2">여기에 숫자 3이 있습니다</text>
      <text start="2" dur="3">뇌는 어떻게 &amp;quot;3&amp;quot; 이라고 인식할까요</text>
      <text start="5" dur="1">   </text></transcript>`;
    expect(parseCaptionXml(xml)).toBe('여기에 숫자 3이 있습니다 뇌는 어떻게 "3" 이라고 인식할까요');
  });

  it("자막 안의 서식 태그는 걷어낸다", () => {
    expect(parseCaptionXml(`<text start="0">앞 <b>굵게</b> 뒤</text>`)).toBe("앞 굵게 뒤");
  });
});

describe("youtubeSummaryText — 자막이 있을 때", () => {
  const base = parseWatchPage(WATCH_HTML, "aircAruvnKk")!;

  it("자막을 읽었으면 그렇게 말하고 자막을 싣는다", () => {
    const text = youtubeSummaryText(base, { languageCode: "ko", isGenerated: false, text: "실제 자막입니다" });
    expect(text).toContain("자막: ko");
    expect(text).toContain("번역본일 수 있습니다"); // 실측: 번역 자막을 원문 인용처럼 지어냈다
    expect(text).toContain("자막 전문:");
    expect(text).toContain("실제 자막입니다");
    expect(text).not.toContain("내려받지 못했습니다");
  });

  it("자동 생성 자막이면 받아쓰기라 틀릴 수 있다고 밝힌다", () => {
    const text = youtubeSummaryText(base, { languageCode: "ko", isGenerated: true, text: "자동 자막" });
    expect(text).toContain("자동 생성");
    expect(text).toContain("받아쓰기 오류가 있을 수 있습니다");
  });

  it("자막이 있으면 설명은 자리를 양보한다 — 자막이 내용이다", () => {
    const text = youtubeSummaryText(base, { languageCode: "ko", isGenerated: false, text: "자막" });
    expect(text).not.toContain("설명:");
  });

  it("자막을 못 받으면 예전처럼 설명과 챕터로 답하고 그 사실을 밝힌다", () => {
    const text = youtubeSummaryText(base, undefined);
    expect(text).toContain("내려받지 못했습니다");
    expect(text).toContain("설명:");
  });
});
