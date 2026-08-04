// supabase/functions/generate-word-assets/pipeline.js
//
// AI 단어 자산(cefr/pronunciation_uk/example_sentence+translation/
// part_of_speech) 생성 — 순수 로직 계층. grade-writing-answers/pipeline.js와
// 동일한 순수성 원칙: Deno 전역(Deno.env 등) 직접 사용 금지, 네트워크 호출
// 0건, 모든 외부 의존(fetch/시간/난수)은 없음 — 이 파일은 입력→출력이
// 완전히 결정론적인 프롬프트 조립/응답 파싱/검증 함수만 담는다(index.ts가
// Deno.serve/env/fetch/Supabase 클라이언트를 담당). 이렇게 나누는 이유는
// grade-writing-answers/pipeline.js 헤더가 이미 증명한 것과 동일 —
// esbuild로 번들해 Node 테스트 하네스에서 실제 네트워크 없이 검증 가능.
//
// ── 이 함수가 채우는 필드는 4개뿐(오케스트레이터 확정 설계, 재조사 불필요) ──
// cefr, pronunciation_uk, example_sentence(+example_translation),
// part_of_speech. difficulty/base_review_interval_days/image_prompt는
// src/utils/wordAssetRules.js가 이미 규칙 기반으로 결정론적으로 만든다 —
// 이 함수는 그 세 필드를 절대 생성하지 않는다(생성기 간 책임 분리, 헤더
// 재확인 목적으로 아래 ASSET_FIELDS 상수에도 그 4개만 존재).
// image_url도 생성하지 않는다(이미지 생성은 이번 작업 범위 밖).
//
// ── DB 쓰기 없음 ──────────────────────────────────────────────────────────
// 이 파일과 index.ts 둘 다 word_assets에 쓰지 않는다 — 생성 결과는 호출자
// (관리자 화면)에게 반환만 하고, 실제 upsert는 admin-content-write의
// word_asset.upsert_bulk가 담당한다(그 액션에 이미 "기존 값을 덮어쓰지
// 않는다"는 클라이언트(M3c) 보호 규칙이 있다 — 이 함수가 직접 쓰면 그
// 보호막을 우회하게 되므로 의도적으로 쓰기 권한 자체를 만들지 않았다).

// ════════════════════════════════════════════════════════════════════════
// 상수
// ════════════════════════════════════════════════════════════════════════

// AI가 채울 수 있는 필드 화이트리스트 — 호출자가 fields 옵션으로 이 중
// 일부만 요청할 수 있다(옵션 미지정 시 4개 전부).
export const ASSET_FIELDS = ['cefr', 'pronunciation_uk', 'example_sentence', 'part_of_speech']

// supabase_v3_15_word_assets.sql에는 cefr에 DB CHECK가 없지만(자유 텍스트,
// "학생 채점과 무관한 콘텐츠 메타데이터"라 의도적으로 느슨함), 이 함수는
// 표준 CEFR 6단계 밖의 값을 AI가 지어내지 못하도록 애플리케이션 레벨에서
// 강제한다 — 틀린 값보다 null이 낫다는 원칙(§ 아래 5번 요구사항)을 cefr에도
// 동일하게 적용.
export const CEFR_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

// src/utils/wordAssetRules.js VALID_PARTS_OF_SPEECH와 정확히 같은 4종
// 도메인(noun/verb/adjective/adverb)으로 맞춘다 — 규칙 기반 생성기와 AI
// 생성기가 같은 품사 도메인을 쓰지 않으면 같은 word_key에 대해 서로 다른
// "정상 범위"를 갖게 되어 이후 어느 쪽 값이 맞는지 판단할 기준이 사라진다.
// (이 파일은 wordAssetRules.js를 import하지 않는다 — Deno Edge Function은
// Vite 전용 문법을 쓰는 그 파일을 import할 수 없어 도메인 값만 사본으로
// 유지한다, admin-content-write/index.ts의 "별도 사본 유지" 원칙과 동일.)
export const PART_OF_SPEECH_VALUES = new Set(['noun', 'verb', 'adjective', 'adverb'])

// 요청당 상한 기본값 — index.ts가 env로 오버라이드 가능. 채점 기능
// (grade-writing-answers)의 MAX_ITEMS_PER_REQUEST 등과 값 자체를 공유하지
// 않는다(오케스트레이터 확정: 일일 "총 비용" 예산만 공유하고, 요청당
// 튜닝값은 기능별로 독립 — 한쪽 기능의 요청 크기 상한을 조정해도 다른
// 기능이 영향받지 않게 하기 위함). 총 695단어를 배치로 나눠 부르는 상황을
// 감안해 그래도 넉넉하게 잡았다.
export const DEFAULT_MAX_ITEMS_PER_REQUEST = 100
export const DEFAULT_MAX_EST_COST_USD_PER_REQUEST = 0.5
// OpenAI 배치 호출 1건당 항목 수 — grade-writing-answers의 20~30 하드
// invariant(buildBatches)는 그 파일만의 설계 제약(캐시 키/통계 훅과 결합)
// 이라 이 함수에 그대로 가져올 이유가 없다. 이 함수는 캐시/통계 훅이 없는
// 훨씬 단순한 파이프라인이라 더 넓은 범위(5~50)를 허용한다.
export const DEFAULT_BATCH_SIZE = 20
export const MIN_BATCH_SIZE = 5
export const MAX_BATCH_SIZE = 50

export function clampBatchSize(n, fallback = DEFAULT_BATCH_SIZE) {
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.round(n)))
}

export function buildBatches(items, size = DEFAULT_BATCH_SIZE) {
  const clamped = clampBatchSize(size)
  const batches = []
  for (let i = 0; i < items.length; i += clamped) batches.push(items.slice(i, i + clamped))
  return batches
}

// ── 금칙 톤 사전(src/utils/curriculum/generatorContract.js FORBIDDEN_TONE_
// HINTS 재사용) ─────────────────────────────────────────────────────────
// 그 파일은 export하지 않고(모듈 내부 상수) Vite 전용 문법을 쓰는 파일이라
// Deno Edge Function이 import할 수 없다 — 그래서 값 자체를 여기 사본으로
// 유지한다(위 PART_OF_SPEECH_VALUES와 동일한 "별도 사본" 원칙). 두 목록
// 중 하나만 바뀌면 드리프트가 생기므로, 콘텐츠 팀이 금칙어를 확장할 때는
// 반드시 이 배열도 함께 갱신할 것 — 이후 그 계약을 실제로 구현할 때
// (curriculum 생성기) 프롬프트를 두 번 만들지 않기 위한 재사용이므로,
// 그 작업에서도 이 목록을 그대로 참고해야 한다.
export const FORBIDDEN_TONE_HINTS = ['혼나', '벌점', '창피', '꼴찌', '너만', '시간이 없', '빨리 안 하면']

export function findForbiddenToneHints(text) {
  const hay = String(text || '')
  return FORBIDDEN_TONE_HINTS.filter((w) => hay.includes(w))
}

// 공백을 포함하면 단어가 아니라 구/숙어다(라이브 실측: words 811행 중
// 공백 포함 106개 — "a few", "according to" 등). IPA 발음을 단어 하나처럼
// 만들면 안 되므로 프롬프트에서도 명시하고, 여기서 한 번 더 방어적으로
// 판정한다(§ sanitizeGeneratedItem의 pronunciation_uk 강제 null 처리).
export function isPhrase(word) {
  return /\s/.test(String(word || '').trim())
}

// ════════════════════════════════════════════════════════════════════════
// 프롬프트 조립
// ════════════════════════════════════════════════════════════════════════
//
// buildAiPrompt(grade-writing-answers/pipeline.js)와 동일한 관례: system은
// 배치 전체가 공유하는 고정 규칙(프롬프트 캐싱 breakpoint 위치), user는
// 배치별 항목 목록.
//
// 아래 7개 반영 사항(구현 지시 원문 그대로, 각 줄에 대응):
//   1) meaning의 세미콜론 = 품사별로 다른 뜻일 가능성 → 예문이 그 중
//      선택한 뜻과 어긋나면 안 됨을 명시.
//   2) 괄호 부가설명 = 용법 힌트 → 예문이 그 용법에 맞아야 함을 명시.
//   3) 공백 포함 항목은 단어가 아니라 구/숙어 → IPA를 단어 하나처럼 만들지
//      말 것을 명시(+ 아래 sanitizeGeneratedItem에서 재차 강제).
//   4) 대상은 한국 초·중등 학습자 → 예문은 짧고 쉬운 문장.
//   5) 확신 없으면 null(특히 품사) → 명시.
//   6) 구조화 출력 강제 → 이 함수는 텍스트만 만들고, 실제 강제는
//      providers.js가 response_format: json_schema로 수행(§ OPENAI_ASSET_
//      JSON_SCHEMA).
//   7) 금칙 톤 사전 재사용 → FORBIDDEN_TONE_HINTS를 프롬프트에 직접 나열.
export function buildAssetGenerationPrompt(items, fields = ASSET_FIELDS) {
  const wantedFields = (Array.isArray(fields) && fields.length > 0 ? fields : ASSET_FIELDS)
    .filter((f) => ASSET_FIELDS.includes(f))
  const fieldList = wantedFields.length > 0 ? wantedFields : ASSET_FIELDS

  const system = [
    '당신은 한국 초·중등 영어 학습자를 위한 단어 학습 자료를 만드는 콘텐츠 보조입니다.',
    `입력으로 영단어(또는 구/숙어)와 한글 뜻을 받습니다. 다음 필드만 채우세요: ${fieldList.join(', ')}.`,
    '요청되지 않은 필드는 항상 null로 반환하세요.',
    '',
    '── 뜻(meaning) 해석 규칙 ──',
    '- 뜻이 세미콜론(;)으로 나뉘어 있으면(예: "답; 대답하다") 서로 다른 품사의 뜻일 가능성이 높습니다(예: 명사; 동사). 이 경우 예문에 쓸 뜻 하나를 선택하고, part_of_speech와 example_sentence가 반드시 그 선택한 뜻과 일치하게 하세요 — 서로 다른 뜻을 섞으면 안 됩니다.',
    '- 뜻이 괄호 부가설명을 포함하면(예: "(팔 등을) 올리다") 그 용법 힌트를 예문에 반영하세요.',
    '- 뜻이 쉼표로 여러 개 나열된 경우(예: "대양, 바다")는 서로 유사한 뜻이므로 자연스러운 것 하나를 골라 예문에 쓰면 됩니다.',
    '',
    '── 단어 형태 확인 ──',
    '- is_phrase가 true면(입력 표기에 공백 포함, 예: "a few", "according to") 단어 하나가 아니라 구/숙어입니다. pronunciation_uk를 단어 하나처럼 억지로 IPA로 만들지 마세요 — 확신이 없으면 반드시 null을 반환하세요.',
    '',
    '── 예문 규칙 ──',
    '- 대상은 한국 초·중등 학습자입니다. example_sentence는 짧고 쉬운 문장(간단한 어휘·문법)으로 쓰고, example_translation은 자연스러운 한국어 번역을 붙이세요.',
    `- 예문(영어/한국어 모두)에는 다음 표현을 포함하지 마세요(징벌·압박·비교·질책 톤 금지): ${FORBIDDEN_TONE_HINTS.join(', ')}`,
    '',
    '── 불확실하면 항상 null ──',
    '- 확신이 없으면 해당 필드는 null로 반환하세요. 특히 part_of_speech는 틀린 값이 비워두는 것보다 나쁩니다(이후 쓰기시험 채점 캐시 키를 오염시킬 수 있음) — 확실하지 않으면 반드시 null.',
    '- part_of_speech는 noun/verb/adjective/adverb 중 하나 또는 null만 반환하세요(그 외 품사 범주는 null).',
    '- cefr은 A1/A2/B1/B2/C1/C2 중 하나 또는 null만 반환하세요.',
    '',
    '각 입력 항목마다 지정된 스키마를 따르는 JSON 객체 하나씩 반환하세요.',
    '절대 임의로 다른 word_key를 만들어내지 마세요 — 입력에 있던 값만 정확히 그대로 돌려주세요.',
  ].join('\n')

  const user = JSON.stringify(items.map((it) => ({
    word_key: it.wordKey,
    word: it.word,
    meaning: it.meaning,
    is_phrase: isPhrase(it.word),
  })))

  return { system, user }
}

// ════════════════════════════════════════════════════════════════════════
// 응답 파싱/검증(§ 6번 구조화 출력 강제와 별개의 애플리케이션 레벨 방어 —
// 모델이 스키마를 지켜도 "내용"이 여전히 틀릴 수 있어, strict json_schema
// 만으로는 못 잡는 값(도메인 밖 enum, 금칙어 포함 예문, 구/숙어인데 IPA를
// 채운 경우)을 여기서 한 번 더 무력화한다)
// ════════════════════════════════════════════════════════════════════════

function normText(value) {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

// AI 원문(JSON 문자열, 최상위가 배열이거나 {results:[...]}로 감싼 객체)을
// 배열로 정규화 — providers.js normalizeDecisionsText(grade-writing-answers)
// 와 동일한 관용구(파싱 실패 시 원문 그대로 반환해 상위에서 안전하게
// 빈 배열로 처리되게 함).
export function normalizeAssetResponseText(rawText) {
  try {
    const parsed = JSON.parse(rawText)
    const arr = Array.isArray(parsed) ? parsed : (parsed?.results ?? [])
    return JSON.stringify(arr)
  } catch {
    return rawText
  }
}

// rawText(정규화된 배열 JSON 문자열) -> word_key -> 검증된(sanitize 완료)
// 결과 Map. 파싱 실패/배열 아님이면 빈 Map(그 배치 전체가 "생성 실패"로
// 처리 — 호출부는 원본 입력을 전부 null 필드로 채워 반환, 절대 예외로
// 전체 요청을 죽이지 않는다).
export function parseAssetGenerationResponse(rawText, { requestedWordKeys, fields = ASSET_FIELDS } = {}) {
  const map = new Map()
  let arr
  try {
    arr = JSON.parse(rawText)
  } catch {
    return map
  }
  if (!Array.isArray(arr)) return map

  const allowedKeys = requestedWordKeys instanceof Set ? requestedWordKeys : null

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const wordKey = typeof raw.word_key === 'string' ? raw.word_key.trim().toLowerCase() : ''
    if (!wordKey) continue
    // 모델이 입력에 없던 word_key를 지어낸 경우 무시(§ 프롬프트 지시와
    // 동일 원칙을 응답 파싱 단계에서 재확인).
    if (allowedKeys && !allowedKeys.has(wordKey)) continue

    map.set(wordKey, sanitizeGeneratedItem(raw, { wordKey, fields }))
  }
  return map
}

// 개별 항목 sanitize — 스키마를 통과했어도 도메인/톤을 다시 검증한다.
function sanitizeGeneratedItem(raw, { wordKey, fields }) {
  const wantCefr = fields.includes('cefr')
  const wantPos = fields.includes('part_of_speech')
  const wantPron = fields.includes('pronunciation_uk')
  const wantExample = fields.includes('example_sentence')

  const warnings = []

  let cefr = wantCefr ? normText(raw.cefr) : null
  if (cefr && !CEFR_LEVELS.has(cefr)) {
    warnings.push(`알 수 없는 cefr 값("${cefr}") — null로 대체`)
    cefr = null
  }

  let partOfSpeech = wantPos ? normText(raw.part_of_speech) : null
  if (partOfSpeech && !PART_OF_SPEECH_VALUES.has(partOfSpeech)) {
    warnings.push(`알 수 없는 part_of_speech 값("${partOfSpeech}") — null로 대체`)
    partOfSpeech = null
  }

  let pronunciationUk = wantPron ? normText(raw.pronunciation_uk) : null
  if (pronunciationUk && isPhrase(raw.word || wordKey)) {
    // § 요구사항 3 — 구/숙어에 단어 하나 취급 IPA를 채우면 안 됨. 프롬프트로
    // 이미 지시했지만, 모델이 그래도 값을 채울 가능성에 대비해 여기서
    // 무조건 무력화한다(신뢰보다 검증).
    warnings.push('구/숙어 항목에 pronunciation_uk가 채워져 있어 null로 대체')
    pronunciationUk = null
  }

  let exampleSentence = wantExample ? normText(raw.example_sentence) : null
  let exampleTranslation = wantExample ? normText(raw.example_translation) : null
  const toneHits = [
    ...findForbiddenToneHints(exampleSentence),
    ...findForbiddenToneHints(exampleTranslation),
  ]
  if (toneHits.length > 0) {
    warnings.push(`예문에서 금칙 톤 의심 표현 발견(${toneHits.join(', ')}) — 예문 전체를 null로 대체`)
    exampleSentence = null
    exampleTranslation = null
  }

  return {
    word_key: wordKey,
    cefr,
    part_of_speech: partOfSpeech,
    pronunciation_uk: pronunciationUk,
    example_sentence: exampleSentence,
    example_translation: exampleTranslation,
    warnings,
  }
}

// 입력 항목에 대응하는 결과가 없을 때(AI 미호출/예산 초과/응답 누락) 쓰는
// "전부 null" 기본값 — 호출부가 매번 같은 모양을 손으로 만들지 않도록.
export function emptyGeneratedItem(wordKey, note) {
  return {
    word_key: wordKey,
    cefr: null,
    part_of_speech: null,
    pronunciation_uk: null,
    example_sentence: null,
    example_translation: null,
    warnings: note ? [note] : [],
  }
}

// ════════════════════════════════════════════════════════════════════════
// OpenAI Structured Outputs 스키마(§ 요구사항 6 — 구조화 출력 강제)
// ════════════════════════════════════════════════════════════════════════
//
// grade-writing-answers/providers.js OPENAI_GRADING_JSON_SCHEMA의 호출
// 패턴(response_format: json_schema, strict:true)을 그대로 참고하되, 이
// 용도(단어 자산 생성)에 맞춰 새로 정의한다 — 그 상수를 재사용하지 않는다
// (스키마 모양이 완전히 다름, 채점 스키마와 결합시키면 두 기능의 응답
// 계약이 서로의 변경에 영향을 받게 되어 결합도만 올라간다는 지시사항의
// "grade-writing-answers에 넣지 않는다" 판단과 동일한 이유).
export const OPENAI_ASSET_JSON_SCHEMA = {
  name: 'word_asset_generation',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            word_key: { type: 'string' },
            cefr: { type: ['string', 'null'], enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', null] },
            part_of_speech: { type: ['string', 'null'], enum: ['noun', 'verb', 'adjective', 'adverb', null] },
            pronunciation_uk: { type: ['string', 'null'] },
            example_sentence: { type: ['string', 'null'] },
            example_translation: { type: ['string', 'null'] },
          },
          required: [
            'word_key', 'cefr', 'part_of_speech', 'pronunciation_uk',
            'example_sentence', 'example_translation',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  },
}

// api/_pinAuth.js checkAdminReauth / admin-content-write/index.ts
// verifyAdminPin / grade-writing-answers/pipeline.js verifyAdminPin과 정확히
// 동일한 비교 로직(문자열 완전일치) — 지시사항에 따라 admin-content-write의
// 패턴을 그대로 복제했다. 이 저장소에 이미 세 군데(그 이상)에 같은 함수가
// 독립 사본으로 존재하는데(Deno Edge Function 간에도 모듈을 공유할 IO 없는
// "순수 유틸 파일"을 만드는 대신 각 함수가 자기 사본을 갖는 것이 이 저장소의
// 기존 관례 — grade-writing-answers/pipeline.js 자체가 이미 이 방식), 이
// 함수도 같은 관례를 따른다. 어느 한 곳만 고치면 드리프트가 생기므로 PIN
// 비교 로직을 바꿀 때는 반드시 네 곳(api/_pinAuth.js, admin-content-write/
// index.ts, grade-writing-answers/pipeline.js, 여기) 전부 확인할 것.
export function verifyAdminPin(candidatePin, expectedPin) {
  if (!expectedPin) return false
  return typeof candidatePin === 'string' && candidatePin === expectedPin
}
