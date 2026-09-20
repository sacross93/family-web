// 일회용 탐침 2 — **배포 환경에서 자막을 받을 무료 방법이 정말 없는가.**
//
// 1차 탐침에서 ANDROID 클라이언트가 트랙 0개를 줬다. 남은 가능성 둘을 한 번에 잰다:
//   ① 재시도 — "여러 번 시도하면 되는 경우가 좀 있었다"는 다른 개발자의 관찰
//   ② 다른 클라이언트 — 데이터센터 IP 를 덜 까다롭게 대하는 종류가 있는지
//
// 결과가 나오면 이 파일과 build 스크립트의 호출을 함께 지운다.

const ID = "aircAruvnKk";
const TAG = "[자막탐침2]";
const TRIES = 3;

const CLIENTS: { name: string; client: Record<string, unknown> }[] = [
  { name: "ANDROID", client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
  { name: "ANDROID_VR", client: { clientName: "ANDROID_VR", clientVersion: "1.60.19", deviceMake: "Oculus", deviceModel: "Quest 3", androidSdkVersion: 32 } },
  { name: "IOS", client: { clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2" } },
  { name: "MWEB", client: { clientName: "MWEB", clientVersion: "2.20250101.00.00" } },
  { name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0" } },
  { name: "WEB", client: { clientName: "WEB", clientVersion: "2.20250101.00.00" } },
];

async function apiKey(): Promise<string | null> {
  const html = await fetch(`https://www.youtube.com/watch?v=${ID}`, {
    headers: { "accept-language": "en-US" },
  }).then((r) => r.text());
  return html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/)?.[1] ?? null;
}

async function tryClient(key: string, name: string, client: Record<string, unknown>): Promise<string> {
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json", "accept-language": "en-US" },
        body: JSON.stringify({ context: { client }, videoId: ID }),
      });
      if (!res.ok) {
        if (attempt === TRIES) return `HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as Record<string, unknown>;
      const caps = (data as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] } } }).captions;
      const tracks = caps?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.length) {
        const first = tracks[0] as { baseUrl?: string };
        const url = (first.baseUrl ?? "").replace("&fmt=srv3", "");
        const xpe = url.includes("exp=xpe");
        if (xpe) return `트랙 ${tracks.length}개지만 exp=xpe (${attempt}번째)`;
        const body = await fetch(url, { headers: { "accept-language": "en-US" } }).then((r) => r.text());
        return `✅ 트랙 ${tracks.length}개 · 자막 ${body.length}자 (${attempt}번째)`;
      }
      if (attempt === TRIES) {
        const status = (data as { playabilityStatus?: { status?: string } }).playabilityStatus?.status;
        return `트랙 0개 (${TRIES}번 다 시도, playability=${status})`;
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    } catch (e) {
      if (attempt === TRIES) return `오류 ${e instanceof Error ? e.message : "?"}`;
    }
  }
  return "?";
}

async function main() {
  const key = await apiKey();
  console.log(`${TAG} API key ${key ? "찾음" : "못 찾음"}`);
  if (!key) return;
  for (const { name, client } of CLIENTS) {
    console.log(`${TAG} ${name.padEnd(32)} ${await tryClient(key, name, client)}`);
  }
}

void main();
