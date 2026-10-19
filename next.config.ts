import type { NextConfig } from "next";
import { IMAGE_HOSTS, IMAGE_WIDTHS } from "./lib/img";

const nextConfig: NextConfig = {
  // 상위 폴더의 다른 lockfile 때문에 워크스페이스 루트가 잘못 잡히는 것 방지
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // `proxy.ts` 가 `/api/upload` 에도 걸려 있어서 Next 가 본문을 **복사해 메모리에 담는다**.
    // 기본 상한은 10MB 이고, 넘으면 **오류 없이 잘라** 라우트에 넘긴다(경고 한 줄만 찍힌다).
    // 앨범·스티커를 원본으로 올리면서 걸렸다 — 실측: 이 줄을 빼면 `ui:flows` 의 13MB 투명 PNG 가
    // 앨범에 안 올라간다(잘린 본문을 라우트가 못 읽는다). 화면에는 "못 올렸어요" 만 뜬다.
    // 직접 올리기의 한 장 상한(`MAX_UPLOAD_BYTES` 50MB)보다 넉넉히.
    // 운영은 상관없다 — 사진은 함수를 거치지 않고 브라우저가 Blob 에 바로 올린다(`lib/upload-client.ts`).
    proxyClientMaxBodySize: "60mb",
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
