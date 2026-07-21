// ─────────────────────────────────────────────────────────────
// 브라우저 알림 · 밑작업 (클라이언트 전용 헬퍼)
//
// 지금 단계: 브라우저가 열려 있는 동안의 로컬 알림(Notifications API + setTimeout).
// 앱을 닫아도 오는 진짜 예약 알림은 Service Worker + Web Push(또는 Google Calendar
// 알림)가 필요합니다 — REQUIREMENTS.md "알림" 절 참고.
// ─────────────────────────────────────────────────────────────

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showNotification(title: string, options?: NotificationOptions) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  new Notification(title, { icon: "/icon.svg", badge: "/icon.svg", ...options });
}

/**
 * 같은 세션(탭이 열려 있는 동안) 한정 로컬 예약 알림.
 * 반환된 id 로 cancelReminder 가능. (새로고침/종료 시 사라짐 — 밑작업 단계)
 */
export function scheduleLocalReminder(
  at: Date,
  title: string,
  body?: string
): number | null {
  if (!notificationsSupported()) return null;
  const delay = new Date(at).getTime() - Date.now();
  if (delay <= 0 || delay > 2 ** 31 - 1) return null;
  return window.setTimeout(() => showNotification(title, { body }), delay);
}

export function cancelReminder(id: number | null) {
  if (id != null) window.clearTimeout(id);
}
