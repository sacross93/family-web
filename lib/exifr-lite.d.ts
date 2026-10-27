// exifr 는 꾸러미 이름("exifr" = full 빌드, 73KB)에만 타입을 단다. 우리는 JPEG·HEIC 만 읽는 lite 빌드
// (gzip 12KB)를 쓰므로 같은 타입을 그 경로에 잇는다. 쓰는 곳: `lib/photo-date-client.ts`·`photo-date-server.ts`.
declare module "exifr/dist/lite.esm.mjs" {
  import exifr from "exifr";
  export default exifr;
}
