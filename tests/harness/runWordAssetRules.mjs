// tests/harness/runWordAssetRules.mjs — Word Asset Library M3b(규칙 기반
// 생성기) 순수 로직 하네스. runWordAssets.mjs와 같은 자기완결형 —
// src/utils/wordAssetRules.js는 import 0개(진짜 순수)라 esbuild 번들 없이
// plain Node가 바로 import한다. src/utils/wordAssets.js도 모듈 최상단
// static import가 없어(파일 헤더 주석) 동일하게 plain Node 직접 import
// 가능 — 화이트리스트 정합성 검증에 재사용한다. src/learning/memory/
// leitner.js도 import 0개라 BOX_INTERVALS_DAYS를 직접 가져와 도메인 교차
// 검증에 쓴다(값 복제 대신 원본 상수 재사용 — 두 파일이 어긋나면 이 값
// 자체가 달라져서 테스트가 자동으로 잡아낸다).
import {
  guessPartOfSpeech,
  isValidPartOfSpeech,
  estimateSyllables,
  estimateDifficulty,
  defaultReviewIntervalDays,
  buildImagePrompt,
  buildRuleBasedAsset,
  buildRuleBasedAssets,
} from '../../src/utils/wordAssetRules.js'
import { WORD_ASSET_WRITABLE_COLUMNS } from '../../src/utils/wordAssets.js'
import { BOX_INTERVALS_DAYS } from '../../src/learning/memory/leitner.js'

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:word-asset-rules] Word Asset Library — 규칙 기반 생성기(M3b, AI 호출 0건) ===')

// ── 실제 단어 샘플(짧은 것/긴 것/접미사 다양하게, 38개) ────────────────────
const SAMPLE_WORDS = [
  'cat', 'dog', 'book', 'water', 'family', 'reply', 'the', 'run',
  'information', 'temperature', 'decision', 'expansion', 'government',
  'kindness', 'activity', 'friendship', 'childhood',
  'dangerous', 'beautiful', 'careless', 'comfortable', 'terrible', 'active', 'national',
  'quickly', 'quietly', 'slowly', 'rapidly',
  'organize', 'realize', 'clarify', 'celebrate',
  'apple', 'table', 'middle', 'circle', 'computer', 'orange',
]
check('샘플 단어 수 30개 이상', SAMPLE_WORDS.length >= 30, `실제: ${SAMPLE_WORDS.length}`)

console.log('\n-- 1) 결정론(같은 입력 -> 완전히 같은 출력)')
{
  let allDeterministic = true
  const detailFails = []
  for (const w of SAMPLE_WORDS) {
    const input = { word: w, meaning: '뜻', exampleText: `I like ${w}.`, exampleTranslation: '번역', memoryTip: '팁' }
    const a = buildRuleBasedAsset({ ...input })
    const b = buildRuleBasedAsset({ ...input })
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      allDeterministic = false
      detailFails.push(w)
    }
  }
  check('buildRuleBasedAsset: 동일 입력 2회 호출 결과가 JSON 문자열로 완전히 동일', allDeterministic, detailFails.join(', '))

  const g1 = guessPartOfSpeech('beautiful')
  const g2 = guessPartOfSpeech('beautiful')
  check('guessPartOfSpeech 결정론', g1 === g2)
  const d1 = estimateDifficulty('temperature')
  const d2 = estimateDifficulty('temperature')
  check('estimateDifficulty 결정론', d1 === d2)
  const p1 = buildImagePrompt('apple', '사과')
  const p2 = buildImagePrompt('apple', '사과')
  check('buildImagePrompt 결정론', p1 === p2)
}

console.log('\n-- 2) 도메인 준수(difficulty 1~5 정수, base_review_interval_days ∈ BOX_INTERVALS_DAYS) — 가장 중요, 깨지면 DB CHECK 위반')
{
  let allDifficultyValid = true
  let allIntervalValid = true
  const badDifficulty = []
  const badInterval = []
  for (const w of SAMPLE_WORDS) {
    const asset = buildRuleBasedAsset({ word: w, meaning: '뜻' })
    const diff = asset.difficulty
    if (!Number.isInteger(diff) || diff < 1 || diff > 5) {
      allDifficultyValid = false
      badDifficulty.push(`${w}=${diff}`)
    }
    const interval = asset.base_review_interval_days
    if (!BOX_INTERVALS_DAYS.includes(interval)) {
      allIntervalValid = false
      badInterval.push(`${w}=${interval}`)
    }
  }
  check('difficulty가 1~5 정수(전수, 38개 단어)', allDifficultyValid, badDifficulty.join(', '))
  check('base_review_interval_days가 BOX_INTERVALS_DAYS=[0,1,3,7,14,30]에 포함(전수, 38개 단어)', allIntervalValid, badInterval.join(', '))

  // estimateDifficulty/defaultReviewIntervalDays 단독 함수도 동일 도메인 보장(경계값 포함 폭넓게).
  const boundaryWords = ['a', 'ab', 'abc', 'internationalization', 'antidisestablishmentarianism']
  let boundaryOk = true
  for (const w of boundaryWords) {
    const d = estimateDifficulty(w)
    if (!Number.isInteger(d) || d < 1 || d > 5) boundaryOk = false
    const interval = defaultReviewIntervalDays(d)
    if (!BOX_INTERVALS_DAYS.includes(interval)) boundaryOk = false
  }
  check('estimateDifficulty/defaultReviewIntervalDays 극단 길이 입력에서도 도메인 유지', boundaryOk)

  // defaultReviewIntervalDays: 이상 입력(범위 밖/비정수/null/undefined) -> 폴백도 도메인 내
  const weirdInputs = [0, 6, -1, 1.5, null, undefined, 'x', NaN]
  let weirdOk = true
  for (const wi of weirdInputs) {
    const interval = defaultReviewIntervalDays(wi)
    if (!BOX_INTERVALS_DAYS.includes(interval)) weirdOk = false
  }
  check('defaultReviewIntervalDays: 도메인 밖/비정수 입력도 안전한 폴백(항상 BOX_INTERVALS_DAYS 안)', weirdOk)
}

console.log('\n-- 3) 품사 보수성(애매하면 null, family/reply가 adverb로 오분류되지 않음)')
{
  const ambiguous = ['the', 'run', 'book', 'water', 'family', 'reply']
  let allNull = true
  const notNull = []
  for (const w of ambiguous) {
    const pos = guessPartOfSpeech(w)
    if (pos !== null) {
      allNull = false
      notNull.push(`${w}=${pos}`)
    }
  }
  check('애매한 단어(the/run/book/water/family/reply) 전부 null', allNull, notNull.join(', '))
  check('family가 adverb로 오분류되지 않음', guessPartOfSpeech('family') !== 'adverb')
  check('reply가 adverb로 오분류되지 않음', guessPartOfSpeech('reply') !== 'adverb')
  check('supply/apply/only/early/ugly/friendly도 adverb로 오분류되지 않음',
    ['supply', 'apply', 'only', 'early', 'ugly', 'friendly'].every((w) => guessPartOfSpeech(w) !== 'adverb'))

  // 고확신 케이스 — 확실히 맞는 값만 나와야 함.
  const confident = {
    information: 'noun', decision: 'noun', government: 'noun', kindness: 'noun',
    activity: 'noun', friendship: 'noun', childhood: 'noun', expansion: 'noun',
    dangerous: 'adjective', beautiful: 'adjective', careless: 'adjective',
    comfortable: 'adjective', terrible: 'adjective', active: 'adjective', national: 'adjective',
    quickly: 'adverb', quietly: 'adverb', slowly: 'adverb', rapidly: 'adverb',
    organize: 'verb', realize: 'verb', clarify: 'verb', celebrate: 'verb',
  }
  let allConfidentOk = true
  const wrongConfident = []
  for (const [w, expected] of Object.entries(confident)) {
    const got = guessPartOfSpeech(w)
    if (got !== expected) {
      allConfidentOk = false
      wrongConfident.push(`${w}: expected ${expected}, got ${got}`)
    }
  }
  check('고확신 접미사 단어(noun/adjective/adverb/verb 각 예시)들이 기대한 품사로 정확히 분류', allConfidentOk, wrongConfident.join('; '))

  check('3글자 이하 단어는 무조건 null', guessPartOfSpeech('cat') === null && guessPartOfSpeech('run') === null && guessPartOfSpeech('the') === null)

  // 반환 도메인 검증 — 전체 샘플에 대해 4종 또는 null만 나오는지.
  const allPosValid = SAMPLE_WORDS.every((w) => isValidPartOfSpeech(guessPartOfSpeech(w)))
  check('전체 샘플 단어의 guessPartOfSpeech 반환값이 4종(noun/verb/adjective/adverb) 또는 null만 나옴', allPosValid)
}

console.log('\n-- 4) AI 슬롯 미오염(buildRuleBasedAsset 결과에 AI 전용 컬럼 키가 아예 없어야 함)')
{
  const asset = buildRuleBasedAsset({ word: 'apple', meaning: '사과', exampleText: 'I ate an apple.', exampleTranslation: '나는 사과를 먹었다.', memoryTip: 'a-apple' })
  const forbiddenKeys = ['cefr', 'pronunciation_uk', 'gesture', 'emoji', 'tags', 'synonyms', 'antonyms', 'image_url', 'ai_model']
  const present = forbiddenKeys.filter((k) => Object.prototype.hasOwnProperty.call(asset, k))
  check('cefr/pronunciation_uk/gesture/emoji/tags/synonyms/antonyms/image_url/ai_model 키가 결과 객체에 존재하지 않음', present.length === 0, present.join(', '))

  check('pipeline_status는 partial(AI 슬롯 미채움 반영)', asset.pipeline_status === 'partial')
  check('source는 rule', asset.source === 'rule')
  check('approval_status는 draft', asset.approval_status === 'draft')

  check('generated_fields에 null 필드는 기록되지 않음(예문 없는 경우)',
    (() => {
      const noExample = buildRuleBasedAsset({ word: 'zebra' })
      return !('example_sentence' in noExample.generated_fields)
        && !('example_translation' in noExample.generated_fields)
        && !('story_memory' in noExample.generated_fields)
    })())
  check('generated_fields는 사실만 기록(difficulty/base_review_interval_days는 항상 rule로 기록됨)',
    asset.generated_fields.difficulty === 'rule' && asset.generated_fields.base_review_interval_days === 'rule')
}

console.log('\n-- 5) 화이트리스트 정합(WORD_ASSET_WRITABLE_COLUMNS와 대조)')
{
  const asset = buildRuleBasedAsset({ word: 'beautiful', meaning: '아름다운' })
  const keys = Object.keys(asset)
  const outside = keys.filter((k) => !WORD_ASSET_WRITABLE_COLUMNS.includes(k))
  check('buildRuleBasedAsset 반환 객체의 모든 키가 WORD_ASSET_WRITABLE_COLUMNS에 포함됨', outside.length === 0, outside.join(', '))

  // 여러 단어(각기 다른 분기: 예문 있음/없음, 품사 있음/없음)에 대해서도 전수 검증.
  const inputs = [
    { word: 'apple', meaning: '사과', exampleText: 'ex', exampleTranslation: 'tr', memoryTip: 'tip' },
    { word: 'zebra' },
    { word: 'beautiful', meaning: '아름다운' },
  ]
  let allWhitelisted = true
  const badKeys = []
  for (const inp of inputs) {
    const a = buildRuleBasedAsset(inp)
    for (const k of Object.keys(a)) {
      if (!WORD_ASSET_WRITABLE_COLUMNS.includes(k)) {
        allWhitelisted = false
        badKeys.push(`${inp.word}.${k}`)
      }
    }
  }
  check('여러 입력 분기(예문 유/무, 품사 유/무)에서도 전부 화이트리스트 안', allWhitelisted, badKeys.join(', '))
}

console.log('\n-- 6) 빈/공백 word -> null')
{
  check('word가 빈 문자열이면 null', buildRuleBasedAsset({ word: '' }) === null)
  check('word가 공백뿐이면 null', buildRuleBasedAsset({ word: '   ' }) === null)
  check('word가 없으면(undefined) null', buildRuleBasedAsset({}) === null)
  check('word가 null이면 null', buildRuleBasedAsset({ word: null }) === null)
  check('buildImagePrompt: word 빈 값이면 null', buildImagePrompt('', '사과') === null && buildImagePrompt('   ', '사과') === null)
  check('buildImagePrompt: word 있으면 문자열, meaning 없어도 크래시 없음', typeof buildImagePrompt('apple', undefined) === 'string')
}

console.log('\n-- buildRuleBasedAssets(배열 버전) — 중복 제거 + null 제외')
{
  const results = buildRuleBasedAssets([
    { word: 'Apple', meaning: '사과1' },
    { word: '  apple ', meaning: '사과2(중복, 무시되어야 함)' }, // 같은 word_key -> 첫 번째만 유지
    { word: '' }, // null -> 제외
    { word: 'Banana', meaning: '바나나' },
    null, // 비객체 입력도 안전 처리
  ])
  check('중복 word_key는 첫 번째만 유지(2개만 남음)', results.length === 2)
  check('첫 번째 apple 입력이 유지됨(뜻이 사과1)', results.find((r) => r.word_key === 'apple')?.meaning_primary === '사과1')
  check('null/빈 입력은 결과에서 제외', results.every((r) => r && r.word_key))
  check('word_key 정규화(trim + lowercase) 반영', results.find((r) => r.word_key === 'apple')?.word === 'Apple')
  check('비배열 입력은 빈 배열(크래시 없음)', Array.isArray(buildRuleBasedAssets(null)) && buildRuleBasedAssets(null).length === 0)
}

console.log('\n-- estimateSyllables — 방어적 스팟 체크(완벽 분리기는 아님, 최소 1 보장만 계약)')
{
  check('빈 문자열도 최소 1', estimateSyllables('') >= 1)
  check('모든 샘플 단어가 1 이상의 정수', SAMPLE_WORDS.every((w) => Number.isInteger(estimateSyllables(w)) && estimateSyllables(w) >= 1))
}

console.log('\n-- 코드 레벨(순수성 계약)')
{
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../src/utils/wordAssetRules.js', import.meta.url), 'utf8')
  // 이 파일의 헤더 주석 자체가 "Math.random()/Date.now()/new Date() 금지"를
  // 문서화하며 그 문자열들을 그대로 언급하므로, 순수 .includes() 검사는
  // 주석에 걸려 오탐(false FAIL)한다 — 전체 줄이 `//`로 시작하는 순수 주석
  // 줄만 제거한 "코드만" 버전에서 검사한다(이 파일은 블록 주석을 쓰지
  // 않으므로 충분).
  const codeOnly = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  check('모듈에 import 문이 전혀 없음(진짜 순수, plain Node 직접 실행 가능)', !/^import /m.test(src))
  check('Math.random 없음(결정론, 주석 제외 코드 기준)', !codeOnly.includes('Math.random'))
  check('Date.now 없음(결정론, 주석 제외 코드 기준)', !codeOnly.includes('Date.now('))
  check('new Date( 없음(결정론 — "지금" 추측 금지, 주석 제외 코드 기준)', !codeOnly.includes('new Date('))
}

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  word-asset-rules — 규칙 기반 단어 자산 생성기(M3b) (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  word-asset-rules — ${failed}건: ${failures.join(', ')}`); process.exit(1)
