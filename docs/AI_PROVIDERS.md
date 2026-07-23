# 쓰기 검수 AI 보조 — Provider 가이드 (`AI_PROVIDERS.md`)

_신규: 2026-07-24(docs-maintainer). 쓰기 답안 검토 큐 AI 보조
(`supabase/functions/grade-writing-answers`)가 OpenAI/Anthropic 직접 호출
구조에서 `providers.js` 기반 Provider 추상화로 리팩터링된 것을 문서화한다.
운영자가 코드 재배포 없이 환경변수만으로 AI provider(OpenAI/Gemini/
Anthropic)를 전환할 수 있게 하는 것이 이 리팩터링의 목적. 이 문서는
`docs/` 아래 신규 파일이며, 이 기능 자체의 배경(왜 preview-only Edge
Function으로 분리했는지 등)은 `docs/operations/task2-writing-analysis.md`
§6-4를 참고하고, 세션별 상세 작업 로그는 `handoff.md`(특히 2026-07-24
10차)를 참고한다._

## 아키텍처 개요

- `supabase/functions/grade-writing-answers/providers.js`가 3개 Provider
  클래스(`OpenAIProvider`/`GeminiProvider`/`AnthropicProvider`)를 정의하고,
  전부 동일한 공통 인터페이스(4개 메서드)를 구현한다.
  - `gradeWritingAnswers(batch)` — `pipeline.js`의 `buildAiPrompt(batch)`로
    만든 system/user 프롬프트를 그 provider의 API로 보내고,
    `{ decisionsMap, inputTokens, outputTokens }`를 반환한다.
    `decisionsMap`은 `pipeline.js`의 `parseAiBatchResponse`가 만드는
    `pending_answer_id -> 판정` `Map`.
  - `healthCheck()` — `{ ok, provider, model, apiKeyPresent }` 반환(API
    키 존재 여부만 확인, 실제 네트워크 호출 없음).
  - `estimateCost(tokens)` — `safeEstimateCostUsd(tokens, this.model)` 호출
    (아래 "비용 비교 표" 참고, 알려진 모델이 아니면 안전 폭 과대추정 폴백).
  - `normalizeResponse(respJson)` — provider별로 다른 원시 응답 모양
    (OpenAI `choices[0].message.content` / Gemini
    `candidates[0].content.parts[0].text` / Anthropic `content[].text`)을
    "배열 JSON 텍스트" 하나로 정규화(`normalizeDecisionsText`, provider
    공통 헬퍼).
- `createAIProvider({ provider, apiKeys, models, fetchImpl, timeoutMs,
  onUnknownProvider })` 팩토리 — `index.ts`는 **이 팩토리 하나만** 호출해
  Provider 인스턴스를 만든다. 미지 provider 문자열(운영자 오타 등)이 오면
  throw하지 않고 `openai`로 조용히 폴백하며(`fallbackApplied`/
  `requestedProvider` 플래그를 인스턴스에 실어 호출부가 로그를 남길 수
  있게 함), `KNOWN_PROVIDERS = new Set(['openai', 'gemini', 'anthropic'])`
  에 없는 값이면 이 경로를 탄다.
- **Edge Function(`index.ts`)은 Provider만 호출한다** — OpenAI/Anthropic
  API에 대한 `fetch()` 호출 코드는 `index.ts`에 전혀 없다(전부
  `providers.js` 안으로 이동). `index.ts`가 하는 일은 (1) env를 읽어
  `createAIProvider()`로 `primaryProvider`/(설정 시)`fallbackProvider`를
  만들고, (2) `primaryProvider.healthCheck()`로 API 키 유무를 확인하고,
  (3) 배치마다 `primaryProvider.gradeWritingAnswers(batch)`를 호출하며
  실패 시(설정돼 있으면) `fallbackProvider.gradeWritingAnswers(batch)`로
  1회 재시도하고, (4) `(provider, model)`별로 사용량을 집계해
  `ai_usage_daily`에 기록하는 것뿐이다.
- **프롬프트/판정 JSON 스키마는 전 provider가 완전히 동일하다**
  (`pipeline.js`의 `buildAiPrompt`/`parseAiBatchResponse`를 3개 provider가
  전부 그대로 재사용). Provider별로 다른 것은 오직 "그 프롬프트를 어떤
  API 모양으로 감싸서 보내고, 응답에서 어떻게 텍스트를 꺼내는가"뿐이다
  (OpenAI는 Structured Outputs `response_format: json_schema` +
  `{"decisions":[...]}`로 감싼 응답, Gemini는 `responseSchema`로 최상위
  배열 자체를 강제, Anthropic은 스키마 강제 없이 텍스트 블록에서 배열
  JSON을 그대로 파싱).

## 환경변수 표

Supabase Edge Function 시크릿(`supabase secrets set ...`)으로 설정한다 —
Vercel 환경변수와는 별개다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `AI_PROVIDER` | `openai` (`pipeline.js` `DEFAULT_AI_PROVIDER`) | `'openai' \| 'gemini' \| 'anthropic'`. 미지 값이면 `createAIProvider`가 조용히 `openai`로 폴백(경고 로그만 남김, 500 아님). |
| `OPENAI_API_KEY` | (없음) | OpenAI API 키. 없으면 `primaryProvider.healthCheck().apiKeyPresent`가 `false`가 되어 그 provider 경로의 모든 미해결 항목이 `decision_source='ai_unavailable'`로 review 강등(자동 거부 아님). |
| `OPENAI_MODEL` | `gpt-5-nano` (`pipeline.js` `AI_MODEL_ID`) | OpenAI 모델 id. |
| `GEMINI_API_KEY` | (없음) | Google AI Studio API 키. |
| `GEMINI_MODEL` | `gemini-2.5-flash` (`pipeline.js` `DEFAULT_GEMINI_MODEL`) | Gemini 모델 id. |
| `ANTHROPIC_API_KEY` | (없음) | Anthropic API 키. |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` (`index.ts`에 별도 하드코딩 — `pipeline.js`의 `AI_MODEL_ID`가 더 이상 Anthropic 모델을 가리키지 않으므로) | Anthropic 모델 id. |
| `AI_FALLBACK_PROVIDER` | `''`(빈 문자열 = 폴백 없음) | 설정하면(`'openai'\|'gemini'\|'anthropic'`) 주 provider의 배치 호출이 실패(throw)할 때, 그 배치만 폴백 provider로 **1회** 재시도한다. 폴백 provider의 API 키가 없으면 재시도 자체를 생략하고 기존 실패 처리 경로(`decision_source='ai_error'`, review 강등)로 넘어간다. |
| `MAX_ITEMS_PER_REQUEST` | `200` | 요청(HTTP 호출) 하나당 처리 가능한 pending 항목 수 상한. 초과 시 AI 호출 전에 400 반환(부분 실행 없음). |
| `MAX_EST_COST_USD_PER_REQUEST` | `2.0` | 요청 하나의 추정 비용 상한(원장 규칙으로 미해결인 항목 수 기준 사전 추정, 최악의 경우 가정). 초과 시 AI 호출 전 400. |
| `MAX_DAILY_COST` | `2.0` | 하루(Asia/Seoul 날짜 경계) 누적 추정 비용 상한. `ai_usage_daily` 테이블 기준(모든 provider/model 행 합산). 초과 시 그날 남은 요청은 캐시로 해결 가능한 항목만 처리하고 나머지는 AI 호출 없이 `decision_source='ai_budget_exceeded'`로 review 강등(자동 거부 아님). 테이블이 아직 없으면(운영자가 `supabase_v3_8` SQL 미실행) 경고 로그만 남기고 이 상한 자체를 적용하지 않는다(요청당 상한은 별개로 계속 적용). |
| `MAX_BATCH_SIZE` | `20` | AI 배치 크기. `pipeline.js`의 `buildBatches` 하드 제약(20~30)에 맞춰 `readClampedBatchSizeEnv`가 **20~30으로 clamp**한다(운영자가 10~19 등을 넣어도 자동으로 20으로 보정 — 매 요청이 예외로 죽는 것을 방지). |

그 외 이 함수가 요구하는 필수 시크릿(provider와 무관하게 항상 필요,
기존부터 있던 값): `ADMIN_PIN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Gemini 설정 방법

1. [Google AI Studio](https://aistudio.google.com/)에서 API 키를 발급받는다.
2. Supabase 시크릿을 설정한다.
   ```
   supabase secrets set GEMINI_API_KEY=발급받은_키 AI_PROVIDER=gemini
   ```
   모델을 기본값(`gemini-2.5-flash`)과 다르게 쓰고 싶으면
   `GEMINI_MODEL=...`도 함께 설정한다.
3. Edge Function을 재배포한다.
   ```
   supabase functions deploy grade-writing-answers
   ```

## OpenAI 설정 방법

Gemini와 동일한 패턴이다(현재 저장소 기본 provider).

1. OpenAI 플랫폼에서 API 키를 발급받는다.
2. Supabase 시크릿을 설정한다.
   ```
   supabase secrets set OPENAI_API_KEY=발급받은_키 AI_PROVIDER=openai
   ```
   (`AI_PROVIDER`는 이미 기본값이 `openai`라 생략해도 되지만, 다른
   provider에서 되돌리는 경우 명시적으로 설정한다.) 모델을 기본값
   (`gpt-5-nano`)과 다르게 쓰려면 `OPENAI_MODEL=...`도 함께 설정한다.
3. Edge Function을 재배포한다.
   ```
   supabase functions deploy grade-writing-answers
   ```

Anthropic으로 되돌리는 경우도 동일 패턴
(`ANTHROPIC_API_KEY=... AI_PROVIDER=anthropic`, 필요 시
`ANTHROPIC_MODEL=...`).

## 비용 비교 표

`pipeline.js`의 `MODEL_PRICING_PER_MTOK`(2026-07-24 확인 기준, $/1M
토큰) 실측값과, `index.ts`가 요청당 사전 비용 점검(preflight)에 쓰는
항목당 토큰 추정 상수(`EST_INPUT_TOKENS_PER_ITEM=250`,
`EST_OUTPUT_TOKENS_PER_ITEM=120`, `EST_SYSTEM_PROMPT_TOKENS_PER_BATCH=260`,
`MAX_BATCH_SIZE` 기본 20)를 그대로 적용해, "200건을 한 번에 처리"했을 때의
대략적 비용을 계산한 값이다(실제 청구는 실측 토큰 기반이라 이 추정보다
낮게 나오는 게 정상 — 이 표는 안전 쪽으로 넉넉히 잡은 "상한 판정용"
추정치이지 확정 청구액이 아니다).

계산 과정: 배치 수 = `ceil(200 / 20) = 10`. 입력 토큰 =
`200 * 250(항목당) + 10 * 260(배치당 system 프롬프트) = 52,600`. 출력
토큰 = `200 * 120 = 24,000`. 비용 = `입력/1e6 * price.input + 출력/1e6 *
price.output`.

| 모델 | Provider | 입력 $/MTok | 출력 $/MTok | 200건 처리 추정 비용 |
|---|---|---|---|---|
| `gpt-5-nano` | openai(기본) | 0.05 | 0.40 | 약 $0.0122 |
| `gemini-2.5-flash` | gemini | 0.30 | 2.50 | 약 $0.0758 |
| `claude-haiku-4-5` | anthropic | 1.00 | 5.00 | 약 $0.1726 |
| `claude-sonnet-5` | (선택 가능한 provider 아님 — 가격표에 없는 미지 모델의 `safeEstimateCostUsd` 안전 폴백가) | 3.00 | 15.00 | 약 $0.5178 |

## 새 Provider 추가 방법

1. `providers.js`에 새 클래스를 추가한다 — 공통 인터페이스 4개 메서드
   (`gradeWritingAnswers`/`healthCheck`/`estimateCost`/`normalizeResponse`)
   를 구현하고, `pipeline.js`의 `buildAiPrompt`/`parseAiBatchResponse`를
   그대로 재사용한다(프롬프트를 provider마다 새로 만들지 않는다).
2. `createAIProvider`의 `KNOWN_PROVIDERS` Set과 분기(`if (resolvedProvider
   === '...')`)에 새 provider 이름을 추가한다.
3. `pipeline.js`의 `MODEL_PRICING_PER_MTOK`에 그 provider 기본 모델의
   단가($/MTok)를 추가한다(추가하지 않으면 `estimateCostUsd`가
   throw하고, `safeEstimateCostUsd`가 `claude-sonnet-5` 가격으로
   안전하게 과대추정 폴백한다 — 기능은 안 깨지지만 비용 상한 판정이
   부정확해질 수 있으니 실제 배포 전에는 정확한 단가를 반드시 채운다).
4. `TESTING.md`의 쓰기 검수 AI 보조 테스트 섹션(현재 50~55가 `providers.js`
   계약 검증 담당)을 새 provider를 포함하도록 갱신한다.
5. (선택) 클라이언트 표시명이 필요하면
   `src/utils/spellingReviewAiApi.js`의 `formatProviderDisplay`
   내부 `PROVIDER_MODEL_DISPLAY_NAMES` 맵에 모델 id → 사람이 읽는 표시명
   항목을 추가한다(추가하지 않아도 원문 모델 id가 그대로 표시될 뿐,
   화면이 깨지지는 않는다).

캐시는 provider 무관(운영자 요구사항 11 — 아래 "캐시 정책" 참고)이라 새
provider를 추가해도 캐시 관련 코드는 전혀 손댈 필요가 없다.

## 캐시 정책

`spelling_ai_grading_cache`의 캐시 키(`pipeline.js` `buildCacheKey`)는
**5개 필드**로만 구성된다: `word_id`(wordId) / `meaning_snapshot`
(등록 뜻 스냅샷) / `normalized_answer`(정규화된 학생 답) / `part_of_speech`
(현재 항상 빈 문자열 — words에 품사 컬럼이 아직 없음) / `prompt_version`
(`pipeline.js`의 `PROMPT_VERSION` 상수). **모델/provider는 캐시 키에
포함되지 않는다** — 이 저장소가 2026-07-23까지 쓰던 "모델을 캐시 키
마지막 필드로 포함해 모델이 바뀌면 자동 무효화" 설계를, 운영자가
2026-07-24에 **의도적으로 뒤집은 것**이다(비용 절약이 "모델 전환 시 캐시
안전 무효화"보다 우선순위가 높다는 명시적 운영 판단). 모든 provider가
완전히 동일한 프롬프트/판정 스키마를 쓰기 때문에(위 "아키텍처 개요" 참고)
이 재사용이 안전하다고 판단했다.

이 설계의 실질적 의미: **provider/모델을 전환한 뒤에도 기존 AI 판정이
그대로 캐시 히트로 재사용된다.** 캐시 무효화가 필요해지면(예: 프롬프트
문구 자체를 바꾸는 경우) `pipeline.js`의 `PROMPT_VERSION` 상수를 올리는
것이 유일한 무효화 레버다 — 모델별 무효화 레버는 더 이상 없다.
`spelling_ai_grading_cache.model` 컬럼 자체는 삭제되지 않고 audit
메타데이터로 남아있다(그 판정을 실제로 만들어낸 provider의 모델이 무엇
이었는지 기록용, 조회/캐시 히트 판정에는 관여하지 않음).
