// 오프라인에서도 항상 예쁘게 보이는 파스텔 샘플 이미지(SVG) 생성기.
// 실제 가족이 사진을 올리면 이 자리들을 대체하게 됩니다.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "samples");
mkdirSync(OUT, { recursive: true });

// 부드러운 파스텔 그라디언트 쌍
const GRADS = {
  lavender: ["#EDE8FE", "#C7B9F5"],
  peach: ["#FFE9DC", "#FFC9A9"],
  mint: ["#DFF5EA", "#A8E0C5"],
  sky: ["#E0F0FD", "#A9D4F5"],
  butter: ["#FFF6D9", "#FBE29A"],
  rose: ["#FDE5EC", "#F5B7C9"],
};

function svg({ w, h, from, to, emoji }) {
  const id = `g${Math.round(w + h)}${from.slice(1)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${id})"/>
  <text x="50%" y="50%" font-size="${Math.round(Math.min(w, h) * 0.34)}" text-anchor="middle" dominant-baseline="central">${emoji}</text>
</svg>`;
}

// 앨범별 샘플 사진 (여러 종횡비로 masonry 가 자연스럽게)
const SETS = [
  { key: "bali", color: "sky", emojis: ["🌴", "🏖️", "🥥", "🌅", "🐠", "🛶", "🍹", "🌊"] },
  { key: "home", color: "peach", emojis: ["🏡", "🍳", "🐶", "🛋️", "🎂", "🌻"] },
  { key: "seoul", color: "lavender", emojis: ["🏙️", "🍜", "🌸", "🎡", "☕", "🌃"] },
];
const SIZES = [
  [800, 1000],
  [800, 600],
  [800, 800],
  [800, 1100],
  [800, 560],
  [800, 900],
  [800, 700],
  [800, 800],
];

for (const set of SETS) {
  const [from, to] = GRADS[set.color];
  set.emojis.forEach((emoji, i) => {
    const [w, h] = SIZES[i % SIZES.length];
    writeFileSync(
      join(OUT, `${set.key}-${i + 1}.svg`),
      svg({ w, h, from, to, emoji })
    );
  });
}

// 앨범 커버 (와이드)
const COVERS = [
  { key: "bali", color: "sky", emoji: "🌴" },
  { key: "home", color: "peach", emoji: "🏡" },
  { key: "seoul", color: "lavender", emoji: "🌸" },
];
for (const c of COVERS) {
  const [from, to] = GRADS[c.color];
  writeFileSync(
    join(OUT, `cover-${c.key}.svg`),
    svg({ w: 1200, h: 800, from, to, emoji: c.emoji })
  );
}

console.log("✓ 샘플 이미지 생성 완료 →", OUT);
