// 사진 저장 공간 예산 — Vercel Blob Hobby(무료) 한도를 넘기 전에 멈춘다.
//
// 왜 멈춰야 하나: Hobby 는 저장 1GB · 전송 10GB/월 · 간단한 요청 1만/월 · **고급 요청 2천/월**
// (put·copy·list 가 다 고급이다). **어느 하나라도 넘으면 저장소 전체가 약 30일 멈추고, 이미 올린
// 사진까지 어디서든 403 이 된다**(커뮤니티 보고 — 파일을 지워도 잘 안 풀린다고 한다).
// 앨범·스티커를 원본으로 저장하면서(폰 사진 3~12MB) 1GB 가 금방 찬다. 그래서 90% 에서 올리기를 막는다.
//
// 이 파일은 **계산만** 한다(DB·fs·환경변수 없음) — 화면(관리자 카드)도 같이 읽는다.
// 재고 기억하는 쪽은 `lib/blob-usage.ts`(서버 전용).

import { MAX_UPLOAD_BYTES } from "@/lib/upload-kinds";

/** Hobby 저장 한도. 1GB 를 **십진**(10억 바이트)으로 잡는다 — 이진(1,073,741,824)보다 작아 안전한 쪽이다. */
export const HOBBY_LIMIT_BYTES = 1_000_000_000;
/** 이만큼 차면 관리자 카드가 조심하라고 알린다. */
export const WARN_RATIO = 0.75;
/** 이만큼 차면 올리기를 막는다. 나머지 10% 는 잰 값과 실제의 차이·동시에 올리는 사진을 위한 여유다. */
export const BLOCK_RATIO = 0.9;
/** 다시 재는 간격. 재기(`list()`)도 고급 요청이라 아껴 쓴다 — 하루 최대 4번. */
export const RECOUNT_AFTER_MS = 6 * 60 * 60 * 1000;
/** 관리자가 [다시 재기]를 연달아 눌러도 이 안에서는 한 번만 잰다. */
export const FORCE_RECOUNT_MIN_MS = 60 * 1000;

/** 거절할 때 화면이 알아보는 짧은 코드. */
export const STORAGE_FULL = "STORAGE_FULL";

export type BudgetState = "ok" | "warn" | "blocked";

/** 환경변수 값(문자열)을 한도로. 비었거나 이상하면 Hobby 한도. 시험에서 작게 줄여 쓰려고 둔다. */
export function resolveLimit(raw: string | undefined | null): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? Math.floor(n) : HOBBY_LIMIT_BYTES;
}

export const warnAt = (limit: number) => Math.floor(limit * WARN_RATIO);
export const blockAt = (limit: number) => Math.floor(limit * BLOCK_RATIO);

export function budgetState(bytes: number, limit: number): BudgetState {
  if (bytes >= blockAt(limit)) return "blocked";
  if (bytes >= warnAt(limit)) return "warn";
  return "ok";
}

/** 막기 전까지 더 올릴 수 있는 바이트(0 이상). */
export function remainingBeforeBlock(bytes: number, limit: number): number {
  return Math.max(0, blockAt(limit) - bytes);
}

/**
 * 브라우저가 `clientPayload` 로 알려 준 파일 크기. **믿지 않는다** — 없거나 이상하면 0 으로 보고,
 * 실제 상한은 표의 `maximumSizeInBytes` 가 Blob 쪽에서 지킨다(크기를 속여도 그 이상은 못 올린다).
 * 너무 큰 값은 한 장 상한으로 자른다(캐시된 사용량을 거짓으로 부풀리지 못하게).
 */
export function parseDeclaredSize(clientPayload: string | null | undefined): number {
  if (!clientPayload) return 0;
  let size: unknown;
  try {
    size = (JSON.parse(clientPayload) as { size?: unknown } | null)?.size;
  } catch {
    return 0;
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return 0;
  return Math.min(Math.floor(size), MAX_UPLOAD_BYTES);
}

export type Grant =
  | { ok: true; maximumSizeInBytes: number }
  | { ok: false; code: typeof STORAGE_FULL };

/**
 * 올려도 되나. 지금 쓴 양 + 이번 크기가 막는 선을 넘으면 거절.
 * 허락할 때의 `maximumSizeInBytes` = min(한 장 상한, 남은 양) — 크기를 속여도 막는 선을 못 넘는다.
 */
export function decideGrant(
  bytes: number,
  size: number,
  limit: number,
  maxUpload: number = MAX_UPLOAD_BYTES,
): Grant {
  const remaining = remainingBeforeBlock(bytes, limit);
  if (remaining <= 0 || size > remaining) return { ok: false, code: STORAGE_FULL };
  return { ok: true, maximumSizeInBytes: Math.max(1, Math.min(maxUpload, remaining)) };
}

/** 관리자 카드가 받는 모양(JSON). 못 쟀으면 카드가 null 을 받는다. */
export interface StorageStatus {
  bytes: number;
  count: number;
  /** ISO 문자열 */
  measuredAt: string;
  limit: number;
  warnAt: number;
  blockAt: number;
  state: BudgetState;
  /** "blob" = 운영 저장소, "local" = public/uploads */
  where: "blob" | "local";
}

export function toStatus(
  row: { bytes: number; count: number; measuredAt: Date },
  limit: number,
  where: "blob" | "local",
): StorageStatus {
  return {
    bytes: row.bytes,
    count: row.count,
    measuredAt: row.measuredAt.toISOString(),
    limit,
    warnAt: warnAt(limit),
    blockAt: blockAt(limit),
    state: budgetState(row.bytes, limit),
    where,
  };
}
