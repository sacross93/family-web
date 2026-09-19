import { describe, expect, it } from "vitest";

import { extractChapters, humanDuration, parseWatchPage, youtubeId, youtubeSummaryText } from "./youtube";

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
    expect(extractChapters(html)).toEqual(["Introduction example", "Series preview", "What are neurons?"]);
  });

  it("이스케이프된 따옴표와 유니코드를 되돌린다", () => {
    const html = `"chapterRenderer":{"title":{"simpleText":"\\uc784\\uc2e0 \\"\\ucd08\\uae30\\""}}`;
    expect(extractChapters(html)).toEqual(['임신 "초기"']);
  });

  it("챕터가 없으면 빈 배열", () => {
    expect(extractChapters(`<html>아무것도 없음</html>`)).toEqual([]);
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
    expect(info!.chapters).toEqual(["Introduction example", "Series preview"]);
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

  it("자막을 못 읽었다는 사실이 글 안에 들어간다", () => {
    // 이 문장이 빠지면 모델이 영상을 본 것처럼 말한다.
    const text = youtubeSummaryText(base);
    expect(text).toContain("내려받을 수 없었습니다");
    expect(text).toContain("자막이 아니라 설명과 챕터");
  });

  it("자막 트랙이 아예 없으면 그렇게 말한다", () => {
    const text = youtubeSummaryText({ ...base, captionLanguages: [] });
    expect(text).toContain("자막: 없습니다");
    expect(text).not.toContain("내려받을 수 없었습니다");
  });

  it("제목·채널·길이·챕터·설명을 담는다", () => {
    const text = youtubeSummaryText(base);
    expect(text).toContain("제목: But what is a neural network?");
    expect(text).toContain("채널: 3Blue1Brown");
    expect(text).toContain("길이: 18분 40초");
    expect(text).toContain("1. Introduction example");
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
