// 일회용 탐침 — **배포 환경(Vercel)에서 유튜브 자막이 받아지는지** 빌드 로그로 확인한다.
//
// 왜 필요한가: 로컬(가정용 IP)에서는 받아진다. 그런데 같은 방법을 쓴 다른 개발자가
// "Vercel 에 올린 뒤에는 유튜브의 요청 차단으로 실패했다"고 적었다. 데이터센터 IP 는
// 다르게 취급될 수 있다. **되는 걸 확인하기 전에 된다고 말하지 않는다.**
//
// 확인이 끝나면 이 파일과 build 스크립트의 호출을 함께 지운다.

import {
  captionUrl,
  innertubeApiKey,
  parseCaptionXml,
  pickCaptionTrack,
  playerCaptionTracks,
  playerRequestBody,
} from "../lib/agent/read/youtube";

const ID = "aircAruvnKk";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function main() {
  const tag = "[자막탐침]";
  try {
    const watch = await fetch(`https://www.youtube.com/watch?v=${ID}`, {
      headers: { "accept-language": "en-US", "user-agent": UA },
    });
    const html = await watch.text();
    console.log(`${tag} watch HTTP ${watch.status}, ${html.length}자`);

    const key = innertubeApiKey(html);
    console.log(`${tag} INNERTUBE_API_KEY ${key ? "찾음" : "못 찾음"}`);
    if (!key) return;

    const player = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json", "accept-language": "en-US", "user-agent": UA },
      body: JSON.stringify(playerRequestBody(ID)),
    });
    console.log(`${tag} player HTTP ${player.status}`);
    if (!player.ok) return;

    const tracks = playerCaptionTracks(await player.json());
    console.log(`${tag} 트랙 ${tracks.length}개: ${tracks.map((t) => t.languageCode).slice(0, 8).join(" ")}`);

    const track = pickCaptionTrack(tracks, ["ko", "en"]);
    if (!track) return;
    const url = captionUrl(track);
    console.log(`${tag} 고른 트랙 ${track.languageCode}, exp=xpe ${url ? "없음" : "있음(포기)"}`);
    if (!url) return;

    const cap = await fetch(url, { headers: { "accept-language": "en-US", "user-agent": UA } });
    const xml = await cap.text();
    const text = parseCaptionXml(xml);
    console.log(`${tag} 자막 HTTP ${cap.status}, XML ${xml.length}자 → 글 ${text.length}자`);
    console.log(`${tag} ${text.length > 0 ? "✅ 배포 환경에서도 받아진다" : "❌ 빈 몸통 — 배포에서는 못 받는다"}`);
    if (text) console.log(`${tag} 앞부분: ${text.slice(0, 120)}`);
  } catch (e) {
    console.log(`${tag} ❌ 오류: ${e instanceof Error ? e.message : "알 수 없음"}`);
  }
}

void main();
