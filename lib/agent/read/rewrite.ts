// 껍데기 주소를 내용이 있는 주소로 바꾼다.
//
// 어떤 사이트는 사람이 보는 주소와 글이 실제로 있는 주소가 다르다. 네이버 블로그가 그렇다 —
// `blog.naver.com/아이디` 는 프레임 제목줄(실측 166자)이고, 글은 `PostList.naver` 에 있다(398KB).
// 프레임을 JS 로 짜기 때문에 `<iframe>` 을 따라가는 일반적인 방법으로는 못 잡는다.
//
// **이 표는 짧게 유지한다.** 사이트마다 규칙을 늘리기 시작하면 끝이 없다.
// 여기 들어올 자격: ① 한국 가족이 실제로 자주 주는 주소이고 ② 껍데기를 반환해 아무것도 못 읽고
// ③ 바꿀 주소가 문서로 확인되는 경우.

/** 바꿀 게 없으면 받은 주소를 그대로 돌려준다. */
export function rewriteKnownShell(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const host = u.hostname.replace(/^m\./, "").toLowerCase();
  if (host !== "blog.naver.com") return raw;

  // 이미 내용 주소면 그대로 둔다.
  if (/^\/(PostView|PostList)\.naver$/i.test(u.pathname)) return raw;

  const parts = u.pathname.split("/").filter(Boolean);
  const blogId = parts[0];
  if (!blogId || !/^[A-Za-z0-9_-]{1,40}$/.test(blogId)) return raw;

  // /아이디/글번호 → 그 글 하나. /아이디 → 글 목록.
  const logNo = parts[1] ?? u.searchParams.get("logNo") ?? "";
  if (/^\d{1,20}$/.test(logNo)) {
    return `https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}`;
  }
  return `https://blog.naver.com/PostList.naver?blogId=${blogId}`;
}
