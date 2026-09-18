# 실측 결과 — ChatGPT Codex 엔드포인트 (2026-09-18 08:19 KST)

`POST https://chatgpt.com/backend-api/codex/responses` · 원시 덤프 4개는 같은 폴더 `probe-*.txt`.
계획서의 SSE 픽스처는 **잠정값**이었다. 아래가 실측이며, 어긋나는 부분은 이 문서가 우선한다.

## 결론 요약

| 미지수 | 결과 |
|---|---|
| 모델 ID `gpt-5.6-terra` | ✅ **유효** (HTTP 200, 정상 응답) |
| 네이티브 function calling | ✅ **지원** — `tools` 필드 그대로 통과 |
| `{type:"object"}`(properties 없음) 인자 스키마 | ✅ **통과** — strict 불필요. 모델이 중첩 인자까지 생성 |
| 이미지 입력 | ✅ **지원** — 1px PNG 를 보고 "버튼"이라 답함 → **3층(화면 캡처) 실현 가능** |

네 탐침 모두 HTTP 200. `AGENT_TOOL_MODE=native` 로 갈 수 있고 `json` 강등은 안전망으로만 남긴다.

## 1. 스트림 종료 — `[DONE]` 센티널은 **없다**

```
grep -c "data: [DONE]" → 0 (두 덤프 모두)
```

종료는 `event: response.completed`. **계획서 픽스처가 틀렸다.** `codex.ts` 는 `response.completed` 를 받아 `done` 을 방출해야 하고, `[DONE]` 은 와도 무해하도록 함께 처리하면 된다.

## 2. 텍스트 델타 — 계획서와 일치

```
event: response.output_text.delta
data: {"type":"response.output_text.delta","content_index":0,"delta":"안","item_id":"msg_…","output_index":0,"sequence_number":4}
```

필드는 `delta`. ✅ 계획서 가정대로.

## 3. 도구 호출 — `output_item.done` 한 곳에서 다 나온다

관찰된 이벤트: `response.output_item.added` → `response.function_call_arguments.delta`(여러 번) → `response.function_call_arguments.done` → `response.output_item.done`.

**가장 단순하고 안전한 지점은 `response.output_item.done`** 이다. `item.type === "function_call"` 일 때 이름·호출 id·완성된 인자가 한 번에 들어 있다:

```json
{
  "id": "fc_0bc7…",
  "type": "function_call",
  "status": "completed",
  "arguments": "{\"path\":\"/plans/bali\"}",
  "call_id": "call_qQVM9yxLdZ5tP7tOnymMIKwV",
  "name": "open_page"
}
```

- `arguments` 는 **JSON 문자열**이다 → `JSON.parse` 필요. 파싱 실패 시 던지지 말고 `{}` 로 두거나 error 이벤트로 올릴 것.
- `call_id`(`call_…`)가 우리 `tool_call.id` 로 쓸 값이다. `item.id`(`fc_…`)와 **다르다** — 결과를 되돌려줄 때 짝을 맞추는 건 `call_id` 쪽이다.
- `function_call_arguments.delta` 를 모아 조립할 필요는 없다. 스트리밍 표시가 필요하면 나중에 쓸 수 있으니 무시하되 죽지는 말 것.

## 4. 무시해야 하는 것

- `type:"reasoning"` 항목이 `output_item.added/done` 으로 온다. `encrypted_content` 가 수 KB다. **조용히 무시할 것.**
- `response.created` · `response.in_progress` · `content_part.added/done` · `output_text.done` 도 무시.
- 모든 data 줄에 `obfuscation` 이라는 무작위 문자열 필드가 붙는다. 무시.
- **모르는 `type` 은 무시하고 계속 진행할 것.** 스트림 하나 때문에 전체가 죽으면 안 된다.

## 5. 이미지 입력 형식 (2단계 3층에서 쓸 것)

```json
{ "role": "user", "content": [
  { "type": "input_text",  "text": "이게 뭐야?" },
  { "type": "input_image", "image_url": "data:image/png;base64,…" }
]}
```

이 형태로 200 + 정상 답변. 즉 `content` 는 문자열뿐 아니라 **파트 배열**도 받는다.

## 6. 요청 본문 — 확인된 고정값

```json
{ "model": "<AGENT_MODEL>", "instructions": "<system>", "input": [...],
  "stream": true, "store": false, "tools": [...] }
```

헤더: `Authorization: Bearer …` · `Content-Type: application/json` · `Accept: text/event-stream` · `originator: codex_cli_rs` · `chatgpt-account-id: …` · `session_id: <uuid>`.

## 7. 후속 조치

- `lib/agent/llm/codex.ts`: 종료 조건을 `response.completed` 로, 도구 호출을 `output_item.done`/`function_call_arguments.done` 기준으로 수정. `codex.test.ts` 픽스처를 위 실측 문자열로 교체.
- `.env.example`/문서: `AGENT_TOOL_MODE` 기본값을 `auto` 로 두되 **native 가 실측 확인됐음**을 적을 것.
- 스펙 §16(미확인 표)을 이 결과로 갱신할 것.
- 3층(화면 캡처)은 **기술적으로 가능**함이 확인됐다. 2단계에서 클라이언트 캡처만 붙이면 된다.

---

## 8. 실측 5 (2026-09-18) — 도구 결과 되돌려주기: 구조화 vs 평탄화

Task 6 검토자가 "루프는 `assistant.toolCalls`/`tool.toolCallId` 짝을 지키는데 `codex.ts` 가 텍스트로 평탄화해 `call_id` 가 와이어에 안 실린다"고 지적해 두 방식을 같은 조건으로 찔렀다.

| 방식 | 입력 형태 | 결과 |
|---|---|---|
| **5a 구조화** | `{type:"function_call", call_id, name, arguments}` + `{type:"function_call_output", call_id, output}` | ✅ **HTTP 200** — "발리 계획은 3박 4일이에요." |
| **5b 평탄화** | `assistant: "[도구 호출] …"` + `user: "[도구 결과] …"` | ✅ HTTP 200 — 같은 답변 |

**둘 다 동작한다.** 즉 현재 구현(평탄화)이 고장 난 상태는 아니다.

**그래도 구조화로 간다.** 이유는 다중 호출이다 — 한 턴에 도구가 2개 이상 불리면 평탄화는 **순서로만** 짝을 복원할 수 있어, 모델이 어느 결과가 어느 호출의 것인지 헷갈릴 여지가 있다. 구조화는 `call_id` 로 명시적으로 묶인다. 실측상 API 가 받아주므로 더 취약한 쪽을 유지할 이유가 없다.

되돌려야 할 일이 생기면 평탄화도 동작함이 위 표로 증명돼 있다. 원시 덤프: `probe-5a-structured.txt` · `probe-5b-flattened.txt`.
