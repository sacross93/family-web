// 올리기 문지기 — 운영(직접 올리기 표)과 로컬(`/api/upload` POST)이 같은 판단을 쓴다. 서버 전용.
//
// 순서: 사용량(오래됐으면 다시 잰다) → 이번 크기로 판단(`decideGrant`) → 예약(원자적으로 더하기).
// **못 재면 막지 않는다.** 표가 아직 없는 배포·Blob 이 잠깐 대답 안 할 때 가족의 사진 올리기를 통째로 막는 쪽이
// 더 나쁘다. 그때도 한 장 상한(50MB)은 그대로다.

import { STORAGE_FULL, decideGrant } from "@/lib/blob-budget";
import { currentLimit, getUsage, reserveUsage } from "@/lib/blob-usage";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-kinds";

export type Admission = { ok: true; maximumSizeInBytes: number } | { ok: false };

export async function admitUpload(size: number, files = 1): Promise<Admission> {
  const limit = currentLimit();
  let bytes: number;
  try {
    bytes = (await getUsage()).bytes;
  } catch {
    return { ok: true, maximumSizeInBytes: MAX_UPLOAD_BYTES };
  }
  const grant = decideGrant(bytes, size, limit);
  if (!grant.ok) return { ok: false };
  try {
    // 판단과 예약 사이에 다른 사람이 올렸을 수 있다 — 예약이 막는 선을 넘기면 거절.
    if (!(await reserveUsage(size, files, limit))) return { ok: false };
  } catch {
    // 예약을 못 적었다(표 문제) — 판단은 이미 통과했으니 막지 않는다.
  }
  return { ok: true, maximumSizeInBytes: grant.maximumSizeInBytes };
}

/** 거절 응답의 본문. 화면은 `code` 를 보고 "저장 공간이 거의 찼어요" 를 띄운다. */
export const STORAGE_FULL_BODY = {
  error: "사진 저장 공간이 거의 찼어요. 관리자에게 알려 주세요.",
  code: STORAGE_FULL,
};

/** 507 Insufficient Storage — 저장 공간이 모자랄 때 쓰라고 있는 상태 코드다. */
export const STORAGE_FULL_STATUS = 507;
