// 구글 캘린더 동기화를 켤지 — 환경변수 두 개를 읽어 켜짐/꺼짐으로만 답한다.
//
// 왜 "꺼짐" 이 정상 상태인가: 키가 없는 곳(시험·다른 사람 로컬·키를 아직 안 넣은 배포)에서도 사이트는
// 지금처럼 돌아야 한다. 그래서 값이 없거나 **해석하지 못하면** 던지지 않고 `enabled:false` 를 돌려준다
// — 여기서 던지면 일정 화면이 500 이 된다(스펙 §2).
//
// 매번 읽는다(캐시 없음). 시험은 env 를 직접 넘기고, 운영은 값이 바뀌면 다음 요청부터 그대로 따라간다.
// 키 글자는 이 함수 밖으로 `privateKey` 한 군데로만 나간다 — 로그·오류 문구에 싣지 말 것.

export type GcalConfig =
  | { enabled: true; calendarId: string; clientEmail: string; privateKey: string }
  | { enabled: false; reason: "missing" | "bad_key" };

/** 켜진 설정 — 클라이언트·인증 함수들이 받는 모양 */
export type GcalOn = Extract<GcalConfig, { enabled: true }>;

// 서비스 계정 키는 PKCS#8("BEGIN PRIVATE KEY") 이다. jose 의 importPKCS8 도 이것만 받는다.
const PEM_RE = /-----BEGIN PRIVATE KEY-----[A-Za-z0-9+/=\s]+-----END PRIVATE KEY-----/;

export function gcalConfig(env: NodeJS.ProcessEnv = process.env): GcalConfig {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  if (!raw || !calendarId) return { enabled: false, reason: "missing" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { enabled: false, reason: "bad_key" };
  }
  if (!parsed || typeof parsed !== "object") return { enabled: false, reason: "bad_key" };
  const { client_email, private_key } = parsed as Record<string, unknown>;
  if (typeof client_email !== "string" || !client_email.trim()) return { enabled: false, reason: "bad_key" };
  if (typeof private_key !== "string") return { enabled: false, reason: "bad_key" };

  // 키 파일을 그대로 넣으면(Vercel) JSON.parse 가 `\n` 을 실제 개행으로 푼다. 어떤 도구는 한 번 더
  // 이스케이프해 백슬래시+n 두 글자가 남는다 — 둘 다 받는다.
  const privateKey = private_key.replace(/\\n/g, "\n");
  if (!PEM_RE.test(privateKey)) return { enabled: false, reason: "bad_key" };

  return { enabled: true, calendarId, clientEmail: client_email.trim(), privateKey };
}
