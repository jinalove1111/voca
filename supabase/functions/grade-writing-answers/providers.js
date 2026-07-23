// supabase/functions/grade-writing-answers/providers.js
//
// AI provider 추상화 — 순수 JS(ESM), Deno 전역 API(Deno.env 등) 직접 사용
// 금지(pipeline.js와 동일 원칙, § 파일 헤더 참고). 모든 외부 의존(fetch
// 구현/API 키/모델명/타임아웃)은 팩토리 인자로 주입받는다 — 이래야 Node
// 테스트(esbuild 번들)에서도 그대로 검증 가능하다. fetch/AbortController/
// setTimeout/console은 Deno 전용이 아니라 양쪽(Deno/Node18+) 표준 전역이라
// 여기서 그대로 쓴다(Deno.* 네임스페이스만 금지 대상).
//
// 2026-07-24(implementer) — 운영자 명시 요구사항으로 index.ts가 직접 하던
// OpenAI/Anthropic fetch 호출과 OpenAI Structured Outputs 스키마/Anthropic
// content 텍스트 추출 로직을 전부 이 파일로 이동했다(동작 변화 0 목표).
// 신규로 GeminiProvider를 추가했다(Google AI Studio generateContent,
// responseSchema로 최상위 배열 JSON 강제). 세 provider 전부 동일 인터페이스
// (gradeWritingAnswers/healthCheck/estimateCost/normalizeResponse)를 구현해
// index.ts가 provider별 분기 없이 하나의 경로로 호출할 수 있게 한다.
//
// 프롬프트(buildAiPrompt)는 전 provider가 완전히 동일하게 재사용한다(요구
// 사항 8) — provider마다 프롬프트를 따로 만들지 않는다.
import { buildAiPrompt, parseAiBatchResponse, estimateCostUsd, AI_MODEL_ID, DEFAULT_GEMINI_MODEL } from './pipeline.js'

// ── 비용 추정 폴백(단일 원본, 구 index.ts safeEstimateCostUsd 이동) ────────
// 알 수 없는(가격표에 없는) 모델이 넘어와도 이 함수 전체가 죽으면 안 되므로
// (헌법 규칙 9), 알려진 모델 중 가장 비싼 단가(현재 claude-sonnet-5)로
// 보수적으로(과소 추정이 아니라 과대 추정 쪽으로 안전하게) 대체한다. 원본
// 위치(index.ts)에서 이 파일로 옮기며 provider 정보를 함께 로그에 남길 수
// 있도록 onUnknownModel 콜백을 추가했지만, 콜백을 안 넘겨도(logger로) 기존과
// 동일한 형태의 경고 로그가 남는다 — 호출부(index.ts) 코드 변경 없이도
// 안전.
export const FALLBACK_PRICE_PER_MTOK = { input: 3.0, output: 15.0 } // 알려진 모델 중 최고가(claude-sonnet-5) — 안전 쪽 과대추정
export function safeEstimateCostUsd(tokens, model, { onUnknownModel, logger = console } = {}) {
  try {
    return estimateCostUsd(tokens, model)
  } catch (err) {
    const payload = {
      event: 'grade-writing-answers.unknown_model_price',
      model,
      error: String(err?.message || err),
    }
    if (typeof onUnknownModel === 'function') onUnknownModel(payload)
    else if (logger && typeof logger.warn === 'function') logger.warn(JSON.stringify(payload))
    const inputTokens = tokens?.inputTokens ?? 0
    const outputTokens = tokens?.outputTokens ?? 0
    return (inputTokens / 1e6) * FALLBACK_PRICE_PER_MTOK.input + (outputTokens / 1e6) * FALLBACK_PRICE_PER_MTOK.output
  }
}

// fetch 구현 주입 + 타임아웃(AbortController) — 구 index.ts fetchWithTimeout
// 이동. fetchImpl이 안 넘어오면(방어적) 전역 fetch로 폴백하되, 전역 fetch도
// 없는 극단적 환경이면 명시적으로 에러를 던진다(무한 대기 방지).
async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
  if (!doFetch) throw new Error('fetch 구현이 주입되지 않았고 전역 fetch도 없습니다')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await doFetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// OpenAI Structured Outputs(response_format: json_schema, strict)용 스키마 —
// buildAiPrompt/parseAiBatchResponse가 기대하는 "판정 배열"과 정확히 같은
// 항목 모양을 담되, strict 모드 요구사항(모든 속성을 required에 포함,
// nullable은 type 배열로 표현, additionalProperties:false)에 맞춰 object로
// 감싼다. 구 index.ts에서 이동 — 내용 무변경.
export const OPENAI_GRADING_JSON_SCHEMA = {
  name: 'grading',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pending_answer_id: { type: 'string' },
            decision: { type: 'string', enum: ['accept', 'review', 'reject_candidate'] },
            confidence: { type: 'number' },
            reason: { type: 'string' },
            suggested_synonym: { type: ['string', 'null'] },
            part_of_speech_warning: { type: ['string', 'null'] },
            meaning_scope_warning: { type: ['string', 'null'] },
          },
          required: [
            'pending_answer_id', 'decision', 'confidence', 'reason',
            'suggested_synonym', 'part_of_speech_warning', 'meaning_scope_warning',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['decisions'],
    additionalProperties: false,
  },
}

// Gemini(Google AI Studio) responseSchema — OpenAPI 스타일(type은 대문자:
// ARRAY/OBJECT/STRING/NUMBER, nullable은 별도 boolean 필드). 최상위를 배열로
// 강제해 parseAiBatchResponse가 기대하는 "배열 텍스트" 계약과 그대로 맞춘다
// (OpenAI처럼 {"decisions":[...]}로 감싸지 않음 — normalizeResponse에서도
// 그 전제로 처리).
const GEMINI_GRADING_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      pending_answer_id: { type: 'STRING' },
      decision: { type: 'STRING', enum: ['accept', 'review', 'reject_candidate'] },
      confidence: { type: 'NUMBER' },
      reason: { type: 'STRING' },
      suggested_synonym: { type: 'STRING', nullable: true },
      part_of_speech_warning: { type: 'STRING', nullable: true },
      meaning_scope_warning: { type: 'STRING', nullable: true },
    },
    required: ['pending_answer_id', 'decision', 'confidence', 'reason'],
  },
}

// 공통: provider raw 응답 텍스트(판정 배열이거나 배열을 감싼 객체) ->
// parseAiBatchResponse에 넘길 "배열 JSON 텍스트"로 정규화. 파싱 실패 시
// 원문 그대로 반환(§ 기존 계약 — parseAiBatchResponse가 빈 Map으로 처리해
// 그 배치 전체가 review로 강등됨, provider 무관 공통 경로).
function normalizeDecisionsText(rawText) {
  try {
    const parsed = JSON.parse(rawText)
    const decisionsArray = Array.isArray(parsed) ? parsed : (parsed?.decisions ?? [])
    return JSON.stringify(decisionsArray)
  } catch {
    return rawText
  }
}

class OpenAIProvider {
  constructor({ apiKey, model, fetchImpl, timeoutMs }) {
    this.name = 'openai'
    this.model = model || AI_MODEL_ID
    this.apiKey = apiKey || ''
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  // messages 구성은 system/user 분리 — buildAiPrompt 결과, 배치 내용 그대로.
  // temperature는 의도적으로 생략(구 index.ts 주석 그대로 이동 — 일부 최신
  // 모델은 커스텀 temperature 미지원이라 기본값을 그대로 둔다).
  async _callApi(system, user) {
    const res = await fetchWithTimeout(this.fetchImpl, 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_schema', json_schema: OPENAI_GRADING_JSON_SCHEMA },
      }),
    }, this.timeoutMs)
    const respJson = await res.json()
    if (!res.ok) throw new Error(respJson?.error?.message || `OpenAI API ${res.status}`)
    return respJson
  }

  // strict json_schema 응답은 {"decisions":[...]} 형태의 JSON 문자열 —
  // parseAiBatchResponse(provider 무관 공용)는 최상위가 "배열"인 텍스트를
  // 기대하므로 decisions만 뽑아 다시 문자열로 만든다.
  normalizeResponse(respJson) {
    const content = respJson?.choices?.[0]?.message?.content || ''
    return normalizeDecisionsText(content)
  }

  async gradeWritingAnswers(batch) {
    const { system, user } = buildAiPrompt(batch)
    const respJson = await this._callApi(system, user)
    const inputTokens = respJson?.usage?.prompt_tokens || 0
    const outputTokens = respJson?.usage?.completion_tokens || 0
    const decisionsMap = parseAiBatchResponse(this.normalizeResponse(respJson))
    return { decisionsMap, inputTokens, outputTokens }
  }

  healthCheck() {
    return { ok: !!this.apiKey, provider: this.name, model: this.model, apiKeyPresent: !!this.apiKey }
  }

  estimateCost(tokens) {
    return safeEstimateCostUsd(tokens, this.model)
  }
}

class GeminiProvider {
  constructor({ apiKey, model, fetchImpl, timeoutMs }) {
    this.name = 'gemini'
    this.model = model || DEFAULT_GEMINI_MODEL
    this.apiKey = apiKey || ''
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async _callApi(system, user) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    const res = await fetchWithTimeout(this.fetchImpl, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_GRADING_RESPONSE_SCHEMA,
        },
      }),
    }, this.timeoutMs)
    const respJson = await res.json()
    if (!res.ok) throw new Error(respJson?.error?.message || `Gemini API ${res.status}`)
    return respJson
  }

  // responseSchema로 최상위 배열을 강제했으므로 text 자체가 이미 배열
  // JSON이어야 정상이지만, 방어적으로 normalizeDecisionsText를 그대로 거친다
  // (혹시 모델이 스키마를 어기고 {"decisions":[...]}류로 감싸 응답해도 같은
  // 공용 처리 경로로 흡수).
  normalizeResponse(respJson) {
    const text = respJson?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return normalizeDecisionsText(text)
  }

  async gradeWritingAnswers(batch) {
    const { system, user } = buildAiPrompt(batch)
    const respJson = await this._callApi(system, user)
    const inputTokens = respJson?.usageMetadata?.promptTokenCount || 0
    const outputTokens = respJson?.usageMetadata?.candidatesTokenCount || 0
    const decisionsMap = parseAiBatchResponse(this.normalizeResponse(respJson))
    return { decisionsMap, inputTokens, outputTokens }
  }

  healthCheck() {
    return { ok: !!this.apiKey, provider: this.name, model: this.model, apiKeyPresent: !!this.apiKey }
  }

  estimateCost(tokens) {
    return safeEstimateCostUsd(tokens, this.model)
  }
}

class AnthropicProvider {
  constructor({ apiKey, model, fetchImpl, timeoutMs }) {
    this.name = 'anthropic'
    this.model = model || 'claude-haiku-4-5'
    this.apiKey = apiKey || ''
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  // 기존 v2 경로 그대로(무변경 보존 — "향후 Claude" 요구는 이미 충족,
  // 삭제 금지). system은 최상위 필드, user만 messages에 담는다(Anthropic
  // Messages API 관례).
  async _callApi(system, user) {
    const res = await fetchWithTimeout(this.fetchImpl, 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    }, this.timeoutMs)
    const respJson = await res.json()
    if (!res.ok) throw new Error(respJson?.error?.message || `Anthropic API ${res.status}`)
    return respJson
  }

  normalizeResponse(respJson) {
    const text = (respJson?.content || []).find((b) => b.type === 'text')?.text || ''
    return normalizeDecisionsText(text)
  }

  async gradeWritingAnswers(batch) {
    const { system, user } = buildAiPrompt(batch)
    const respJson = await this._callApi(system, user)
    const inputTokens = respJson?.usage?.input_tokens || 0
    const outputTokens = respJson?.usage?.output_tokens || 0
    const decisionsMap = parseAiBatchResponse(this.normalizeResponse(respJson))
    return { decisionsMap, inputTokens, outputTokens }
  }

  healthCheck() {
    return { ok: !!this.apiKey, provider: this.name, model: this.model, apiKeyPresent: !!this.apiKey }
  }

  estimateCost(tokens) {
    return safeEstimateCostUsd(tokens, this.model)
  }
}

const KNOWN_PROVIDERS = new Set(['openai', 'gemini', 'anthropic'])

// 팩토리 — index.ts가 이 함수 하나로만 provider 인스턴스를 만든다(운영자가
// AI_PROVIDER/AI_FALLBACK_PROVIDER 환경변수로 코드 재배포 없이 전환).
// 미지 provider 문자열이면(운영자 오타 등) throw하지 않고 openai로 조용히
// 폴백한다 — 헌법 규칙 9 "우아한 성능 저하"와 동일 원칙(오타 하나로 함수
// 전체가 500으로 죽으면 안 됨). onUnknownProvider 콜백으로 호출부가 경고를
// 남길 수 있게 하고, 반환된 인스턴스에도 fallbackApplied/requestedProvider를
// 실어 index.ts가 로그/응답에 반영할 수 있게 한다.
export function createAIProvider({ provider, apiKeys = {}, models = {}, fetchImpl, timeoutMs = 45000, onUnknownProvider } = {}) {
  let resolvedProvider = provider
  let fallbackApplied = false
  if (!KNOWN_PROVIDERS.has(resolvedProvider)) {
    fallbackApplied = true
    if (typeof onUnknownProvider === 'function') {
      onUnknownProvider({ requestedProvider: provider, fallbackProvider: 'openai' })
    }
    resolvedProvider = 'openai'
  }

  const deps = { fetchImpl, timeoutMs }
  let instance
  if (resolvedProvider === 'gemini') {
    instance = new GeminiProvider({ apiKey: apiKeys.gemini, model: models.gemini, ...deps })
  } else if (resolvedProvider === 'anthropic') {
    instance = new AnthropicProvider({ apiKey: apiKeys.anthropic, model: models.anthropic, ...deps })
  } else {
    instance = new OpenAIProvider({ apiKey: apiKeys.openai, model: models.openai, ...deps })
  }
  instance.fallbackApplied = fallbackApplied
  instance.requestedProvider = provider
  return instance
}

// 테스트/디버그 편의를 위해 클래스도 함께 내보낸다(index.ts는 팩토리만
// 쓰지만, providers.js 자체 스모크 테스트는 개별 provider를 직접 생성해
// normalizeResponse 등을 검증할 수 있어야 한다).
export { OpenAIProvider, GeminiProvider, AnthropicProvider }
