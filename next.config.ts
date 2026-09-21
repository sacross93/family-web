import type { NextConfig } from "next";
import { IMAGE_HOSTS, IMAGE_WIDTHS } from "./lib/img";

const nextConfig: NextConfig = {
  // 상위 폴더의 다른 lockfile 때문에 워크스페이스 루트가 잘못 잡히는 것 방지
  turbopack: {
    root: __dirname,
  },
  images: {
    // 허용 크기와 허용 호스트는 `lib/img.ts` 한 곳에서 온다 — 주소를 만드는 쪽과
    // 받아 주는 쪽이 어긋나면 사진이 400 으로 안 뜬다.
    deviceSizes: [...IMAGE_WIDTHS],
    imageSizes: [16, 32, 48, 64],
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: "/**",
    })),
  },
};

export default nextConfig;
