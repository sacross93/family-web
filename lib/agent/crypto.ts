import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AUTH_SECRET 에서 32바이트 키를 파생한다. 형식: iv:tag:ciphertext (base64url)
function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 이 설정되지 않았어요 (.env 확인).");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(":");
}

export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(":").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !enc) throw new Error("암호문 형식이 올바르지 않습니다.");
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
