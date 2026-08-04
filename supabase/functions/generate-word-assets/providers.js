// supabase/functions/generate-word-assets/providers.js
//
// OpenAI 호출 계층 — 순수 JS(ESM), Deno 전역(Deno.env 등) 직접 사용 금지
// (pipeline.js와 동일 원칙). fetch 구현/API 키/모델명/타임아웃은 전부
// 팩토리 인자로 주입받는다(grade-writing-answers/providers.js와 동일한
// 이유 — Node 테스트 하네스에서 실제 네트워크 없이 검증 가능해야 함).
//
// 이 파일은 grade-writing-answers/providers.js의 OpenAIProvider 클래스
// "호출 패턴"(fetchWithTimeout, response_format: json_schema, usage 필드
// 추출)을 참고해 새로 작성했다 — 그 클래스를 import하지 않는 이유: 그
// 클래스는 채점 전용 스키마(OPENAI_GRADING_JSON_SCHEMA)와 배치 판정 Map
// 반환 모양에 결합돼 있어, 이 기능(단어 자산 생성)에 억지로 재사용하면
// 두 기능의 응답 계약이 서로의 변경에 영향을 받게 된다(오케스트레이터
// 확정 설계 — grade-writing-answers에 이 기능을 얹지 않는 것과 동일한
// 이유). 반면 순수 계산인 pipeline.js의 estimateCostUsd/MODEL_PRICING_
// PER_MTOK는 이런 결합 위험이 없어(가격표는 기능 무관 사실 데이터) 그대로
// import한다(§ index.ts import 경로 주석).
import {
  buildAssetGenerationPrompt,
  normalizeAssetResponseText,
  OPENAI_ASSET_JSON_SCHEMA,
} from './pipeline.js'

// fetch 구현 주입 + 타임아웃(AbortController) — grade-writing-answers/
// providers.js fetchWithTimeout과 동일 관용구(그 함수를 import하지 않고
// 사본을 두는 이유도 위 헤더 주석과 동일: 두 파일을 서로 다른 함수 간에
// 얹으면 배포 단위가 꼬인다 — 각 Edge Function은 자신의 의존성을 자기
// 디렉터리 안에서 완결시킨다는 이 저장소의 기존 관례, admin-content-write/
// index.ts의 "별도 사본 유지" 원칙과 동일).
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

export class OpenAIWordAssetProvider {
  constructor({ apiKey, model, fetchImpl, timeoutMs = 45000 }) {
    this.name = 'openai'
    this.model = model
    this.apiKey = apiKey || ''
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  healthCheck() {
    return { ok: !!this.apiKey, provider: this.name, model: this.model, apiKeyPresent: !!this.apiKey }
  }

  // temperature 의도적 생략 — grade-writing-answers/providers.js
  // OpenAIProvider._callApi 헤더 주석과 동일 이유(일부 최신 모델은 커스텀
  // temperature 미지원, 기본값 유지).
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
        response_format: { type: 'json_schema', json_schema: OPENAI_ASSET_JSON_SCHEMA },
      }),
    }, this.timeoutMs)
    const respJson = await res.json()
    if (!res.ok) throw new Error(respJson?.error?.message || `OpenAI API ${res.status}`)
    return respJson
  }

  // strict json_schema 응답은 {"results":[...]} 형태의 JSON 문자열 —
  // normalizeAssetResponseText(provider 무관 공용)가 results만 뽑아 배열
  // 텍스트로 정규화한다.
  normalizeResponse(respJson) {
    const content = respJson?.choices?.[0]?.message?.content || ''
    return normalizeAssetResponseText(content)
  }

  // batchItems: [{ wordKey, word, meaning }]. fields는 pipeline.js
  // ASSET_FIELDS 화이트리스트 부분집합.
  async generateAssets(batchItems, fields) {
    const { system, user } = buildAssetGenerationPrompt(batchItems, fields)
    const respJson = await this._callApi(system, user)
    const inputTokens = respJson?.usage?.prompt_tokens || 0
    const outputTokens = respJson?.usage?.completion_tokens || 0
    const normalizedText = this.normalizeResponse(respJson)
    return { normalizedText, inputTokens, outputTokens }
  }
}

export function createOpenAIWordAssetProvider(opts) {
  return new OpenAIWordAssetProvider(opts)
}
