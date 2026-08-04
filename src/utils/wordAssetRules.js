// src/utils/wordAssetRules.js — Word Asset Library M3b: 규칙 기반(AI 미사용)
// 단어 자산 생성 순수 함수 모듈.
//
// ── 순수성 계약(이 파일 전체) ────────────────────────────────────────────
// import 0개(모듈 최상단은 물론 함수 내부 동적 import도 없음), 네트워크
// 호출 0건, `Math.random()`/`Date.now()`/`new Date()`(인자 없이) 절대 금지.
// 같은 입력에는 항상 같은 출력(완전 결정론) — 이 저장소는 "엔진은
// 결정론적이어야 한다"를 불변식으로 삼는다(leitner.js 헤더 주석과 동일
// 원칙, src/learning/memory/leitner.js 참고).
//
// ── 이 모듈이 하지 않는 것 ───────────────────────────────────────────────
// AI로 채울 슬롯(cefr/pronunciation_uk/gesture/emoji/tags/synonyms/
// antonyms/image_url/ai_model)은 절대 만들어내지 않는다 — 규칙으로 지어낸
// 값을 그 컬럼에 넣으면 나중에 실제 AI 생성물과 구분이 불가능해지고,
// "규칙이 만든 그럴듯한 값"이 "AI가 검증한 값"으로 오인될 위험이 있다.
// 이미지 생성도 하지 않는다 — buildImagePrompt는 프롬프트 문자열만 만든다.
//
// ── 어디에도 배선되지 않음(M3b 범위) ─────────────────────────────────────
// 이 파일은 아직 AdminScreen.jsx/wordLibrary.js 어디에서도 import되지
// 않는다. 순수 계산 계층만 먼저 만들고 배선은 이후 단계(M4 이후) 몫이다.
//
// ── 컬럼/도메인 근거 ─────────────────────────────────────────────────────
// supabase_v3_15_word_assets.sql의 CHECK 제약을 그대로 따른다:
//   difficulty            int, 1~5
//   base_review_interval_days  int, {0,1,3,7,14,30}(leitner.js의
//                          BOX_INTERVALS_DAYS와 정확히 동일 — 새 값을
//                          임의로 추가하면 DB CHECK 위반으로 백필 전체가
//                          실패한다)
//   image_status          {'none','prompt_ready','queued','generating','ready','failed'}
//   example_source        {'none','import','ai','teacher'}
//   source                {'teacher','import','rule','ai'}
//   approval_status       {'draft','pending','approved','rejected'}
//   pipeline_status       {'pending','partial','complete','failed'}
// 쓰기 화이트리스트는 src/utils/wordAssets.js의 WORD_ASSET_WRITABLE_COLUMNS
// (이 파일은 그 파일을 import하지 않는다 — 순수성 유지를 위해 컬럼명만
// 문자열로 재사용하되, 최종 정합성 검증은 tests/harness/runWordAssetRules.mjs가
// wordAssets.js를 import해서 대조한다).

// ════════════════════════════════════════════════════════════════════════
// 1. guessPartOfSpeech — 접미사 기반 고확신 휴리스틱
// ════════════════════════════════════════════════════════════════════════
//
// 원칙: 확신이 높을 때만 값을 낸다. 애매하면 무조건 null. 이 값은 향후
// 쓰기시험 채점 캐시 키로 쓰일 예정이라, 틀린 값 하나가 캐시 전체를
// 오염시킬 수 있다 — "틀리게 채우기"보다 "비워두기"가 항상 안전하다.
//
// 접미사는 길이가 긴 것부터 확인할 필요는 없다 — noun/adjective/adverb/
// verb 네 카테고리가 서로 겹치는 실제 접미사 문자열이 없도록 이미
// 골랐으므로(tion/sion/ment/ness/ity/ship/hood vs ous/ful/less/able/
// ible/ive/al vs ly vs ize/ise/ify/ate), 카테고리 간 순서는 noun →
// adjective → adverb → verb 고정 순서로 충분하다.
const NOUN_SUFFIXES = ['tion', 'sion', 'ment', 'ness', 'ity', 'ship', 'hood']
const ADJECTIVE_SUFFIXES = ['ous', 'ful', 'less', 'able', 'ible', 'ive', 'al']
const VERB_SUFFIXES = ['ize', 'ise', 'ify', 'ate']

// "-ly로 끝나지만 실제로는 부사가 아니거나(형용사/명사) 접미사 파생이
// 아닌" 흔한 예외. family/reply/supply/apply는 어근+ly 파생이 아니라
// 단어 자체가 그렇게 끝날 뿐이고, only/early/ugly는 실제로는 형용사로도
// 흔히 쓰이며, friendly는 형용사다(부사 아님) — 지시사항 예외 목록 그대로.
const ADVERB_LY_EXCEPTIONS = new Set([
  'family', 'reply', 'supply', 'apply', 'only', 'early', 'ugly', 'friendly',
])

const VALID_PARTS_OF_SPEECH = new Set(['noun', 'verb', 'adjective', 'adverb'])

export function guessPartOfSpeech(word) {
  const w = String(word ?? '').trim().toLowerCase()
  if (w.length <= 3) return null

  for (const suf of NOUN_SUFFIXES) {
    if (w.length > suf.length && w.endsWith(suf)) return 'noun'
  }
  for (const suf of ADJECTIVE_SUFFIXES) {
    if (w.length > suf.length && w.endsWith(suf)) return 'adjective'
  }
  if (w.endsWith('ly') && w.length > 2 && !ADVERB_LY_EXCEPTIONS.has(w)) {
    return 'adverb'
  }
  for (const suf of VERB_SUFFIXES) {
    if (w.length > suf.length && w.endsWith(suf)) return 'verb'
  }
  return null
}

// 방어적 재확인(내부 헬퍼 없이도 도메인이 항상 4종 중 하나 또는 null임을
// 보장하고 싶을 때 하네스가 재사용할 수 있도록 export).
export function isValidPartOfSpeech(value) {
  return value === null || VALID_PARTS_OF_SPEECH.has(value)
}

// ════════════════════════════════════════════════════════════════════════
// 2. estimateSyllables — 모음군 개수 + 묵음 e 보정(근사치, 난이도 신호용)
// ════════════════════════════════════════════════════════════════════════
//
// 완벽한 음절 분리기가 아니다 — estimateDifficulty의 입력 신호로만 쓰인다.
// 알고리즘: 연속된 모음 문자(a/e/i/o/u/y)를 하나의 "모음군"으로 세고,
// 단어가 자음+e로 끝나면(예: make/hope/time) 그 e는 대개 묵음이라 모음군
// 수에서 1을 빼되, "-le"로 끝나는 경우(apple/table/middle처럼 실제로 e
// 앞의 l이 음절을 이룸)는 빼지 않는다. 최소 1을 보장한다(빈 문자열도 1로
// 취급 — "음절 0개"인 실제 단어는 없다).
export function estimateSyllables(word) {
  const w = String(word ?? '').trim().toLowerCase()
  if (!w) return 1

  const groups = w.match(/[aeiouy]+/g) || []
  let count = groups.length

  if (w.length > 2 && w.endsWith('e') && !w.endsWith('le') && count > 1) {
    count -= 1
  }

  return Math.max(1, count)
}

// ════════════════════════════════════════════════════════════════════════
// 3. estimateDifficulty — 1~5 정수(길이 + 음절 수 결정론적 계산)
// ════════════════════════════════════════════════════════════════════════
//
// 근거(주석으로 남기라는 지시): 짧고 1음절인 단어(cat/dog/book)는
// 학습자가 가장 먼저 접하는 기초 어휘라 난이도 1, 길고 다음절인 단어
// (information/temperature)는 난이도 5가 되도록 계수를 정했다.
//   - 길이 항: 3글자를 "기준선"(가장 흔한 짧은 단어 길이)으로 삼고, 그
//     이상 1글자당 0.3점씩 가산 — 10글자 안팎에서 2점대가 되도록 완만하게.
//   - 음절 항: 1음절을 기준선으로 삼고, 그 이상 1음절당 1.0점씩 가산 —
//     음절 수가 난이도에 더 직접적인 신호라 가중치를 길이보다 높게 잡음.
//   - 최종적으로 반올림 후 1~5로 clamp(DB CHECK 도메인, 절대 벗어나면
//     안 됨 — 벗어나면 백필 INSERT 전체가 실패한다).
// 정확한 구간 경계는 임의 결정(추측)이다 — "결정론 + 도메인 준수"만
// 불변식으로 보장하고, 특정 단어의 "정확한" 난이도 판단은 이후 교사
// 검수가 최종 권한을 갖는다(approval_status='draft'로 시작하는 이유).
export function estimateDifficulty(word) {
  const w = String(word ?? '').trim()
  if (!w) return 1

  const len = w.length
  const syl = estimateSyllables(w)

  const rawScore = 1 + (len - 3) * 0.3 + (syl - 1) * 1.0
  const rounded = Math.round(rawScore)
  return Math.min(5, Math.max(1, rounded))
}

// ════════════════════════════════════════════════════════════════════════
// 4. defaultReviewIntervalDays — difficulty -> BOX_INTERVALS_DAYS 값 매핑
// ════════════════════════════════════════════════════════════════════════
//
// leitner.js의 BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30]과 정확히 같은
// 도메인이어야 한다(DB CHECK). 어려운 단어(difficulty 높음)일수록 더
// 자주(짧은 간격) 복습하도록, 쉬운 단어일수록 길게 매핑한다. 0(당일
// 즉시 복습)은 "이미 한 번 틀린 학생별 실제 상태"를 뜻하는 leitner 박스
// 0 전용 의미가 강해, 콘텐츠의 "기본 권장 간격"으로는 쓰지 않는다(1이
// 가장 짧은 기본값).
const DIFFICULTY_TO_INTERVAL_DAYS = { 1: 30, 2: 14, 3: 7, 4: 3, 5: 1 }
const DEFAULT_INTERVAL_DAYS_FALLBACK = 7 // 입력이 도메인 밖이면 중간값(7일)로 안전 폴백

export function defaultReviewIntervalDays(difficulty) {
  const d = Number(difficulty)
  if (!Number.isInteger(d) || d < 1 || d > 5) return DEFAULT_INTERVAL_DAYS_FALLBACK
  return DIFFICULTY_TO_INTERVAL_DAYS[d]
}

// ════════════════════════════════════════════════════════════════════════
// 5. buildImagePrompt — 이미지 생성 없이 프롬프트 문자열만 결정론적으로 조립
// ════════════════════════════════════════════════════════════════════════
export function buildImagePrompt(word, meaningPrimary) {
  const w = String(word ?? '').trim()
  if (!w) return null

  const meaning = String(meaningPrimary ?? '').trim()
  const meaningHint = meaning ? ` (Korean meaning hint: "${meaning}")` : ''

  return (
    `A simple, colorful, child-friendly flashcard illustration of "${w}"${meaningHint}. ` +
    'Plain uncluttered background, single clear subject, no text or letters anywhere in ' +
    'the image, no watermark, gentle cartoon illustration style suitable for elementary ' +
    'school English learners.'
  )
}

// ════════════════════════════════════════════════════════════════════════
// 6/7. buildRuleBasedAsset / buildRuleBasedAssets
// ════════════════════════════════════════════════════════════════════════

// 값이 없거나 공백뿐이면 null, 있으면 trim한 문자열을 돌려주는 내부 헬퍼.
// (export하지 않음 — 이 파일 안에서만 쓰는 순수 유틸.)
function normText(value) {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

export function buildRuleBasedAsset(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const word = normText(raw.word)
  if (!word) return null

  const wordKey = word.toLowerCase()
  const meaning = normText(raw.meaning)
  const exampleText = normText(raw.exampleText)
  const exampleTranslation = normText(raw.exampleTranslation)
  const memoryTip = normText(raw.memoryTip)

  const partOfSpeech = guessPartOfSpeech(word)
  const difficulty = estimateDifficulty(word)
  const baseReviewIntervalDays = defaultReviewIntervalDays(difficulty)
  const imagePrompt = buildImagePrompt(word, meaning)
  const imageStatus = imagePrompt ? 'prompt_ready' : 'none'
  const exampleSource = exampleText ? 'import' : 'none'

  // 사실만 기록 — 추론/신뢰도 점수 없음. 값이 null인 필드는 넣지 않는다.
  const generatedFields = {}
  if (partOfSpeech) generatedFields.part_of_speech = 'rule'
  generatedFields.difficulty = 'rule'
  generatedFields.base_review_interval_days = 'rule'
  if (imagePrompt) generatedFields.image_prompt = 'rule'
  if (exampleText) generatedFields.example_sentence = 'import'
  if (exampleTranslation) generatedFields.example_translation = 'import'
  if (memoryTip) generatedFields.story_memory = 'import'

  return {
    word_key: wordKey,
    sense_key: '',
    word,
    meaning_primary: meaning,
    part_of_speech: partOfSpeech,
    difficulty,
    base_review_interval_days: baseReviewIntervalDays,
    image_prompt: imagePrompt,
    image_status: imageStatus,
    example_sentence: exampleText,
    example_translation: exampleTranslation,
    story_memory: memoryTip,
    example_source: exampleSource,
    source: 'rule',
    approval_status: 'draft',
    // 규칙으로 채울 수 있는 필드만 채웠다(cefr/pronunciation_uk/gesture/
    // emoji/tags/synonyms/antonyms/image_url/ai_model은 이 함수가 절대
    // 만들어내지 않음 — AI 전용 슬롯) — 그래서 'complete'가 아니라 'partial'.
    pipeline_status: 'partial',
    generated_fields: generatedFields,
  }
}

export function buildRuleBasedAssets(inputs) {
  const list = Array.isArray(inputs) ? inputs : []
  const seen = new Set()
  const out = []
  for (const item of list) {
    const asset = buildRuleBasedAsset(item)
    if (!asset) continue
    if (seen.has(asset.word_key)) continue
    seen.add(asset.word_key)
    out.push(asset)
  }
  return out
}
