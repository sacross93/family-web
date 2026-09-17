import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AUTH_SECRET 에서 32바이트 키를 파생한다. 형식: iv:tag:ciphertext (base64url)
//
// 용도 분리: 같은 AUTH_SECRET 을 lib/session.ts 가 로그인 세션 서명(jose HS256)에도 쓰므로,
// 접두사를 붙여 서로 다른 키가 나오게 한다. 한쪽 키가 새도 다른 쪽으로 번지지 않는다.
// ⚠️ 이 접두사(또는 AUTH_SECRET)를 바꾸면 기존 암호문을 복호화할 수 없다. 되살리는 길은 두 가지:
//    1) 원본 codex_auth.json 이 있으면 `npm run agent:auth` 로 재주입
//    2) 원본이 없으면 **옛 키로 복호화 → 새 키로 재암호화**하는 마이그레이션을 한 트랜잭션으로 돌린다
//       (참고 구현: .superpowers/sdd/2026-09-17-site-agent-engine/rekey.ts)
//    로그인으로 받은 토큰 파일은 임시 폴더에 있다가 사라지기 쉬우니 2)를 먼저 고려한다.
const KEY_DOMAIN = "agent-token-v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 이 설정되지 않았어요 (.env 확인).");
  return createHash("sha256").update(KEY_DOMAIN).update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(":");
}

export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(":").map((p) => Buffer.from(p, "base64url"));
  // 빈 조각도 길이 0 Buffer(truthy)라 존재 검사만으로는 "::" 같은 입력이 통과한다 → 길이까지 본다.
  if (!iv || !tag || !enc || iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("암호문 형식이 올바르지 않습니다.");
  }
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
