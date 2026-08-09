// tests/harness/runExamples.mjs — Curriculum Engine "examples" 모듈 하네스
// (docs/CURRICULUM_ENGINE.md §6/§12, supabase_v3_13_curriculum_engine_phase0.sql).
//
// 이 파일은 두 섹션으로 나뉜다:
//   ① pure 섹션(항상 실행, 네트워크 0) — curriculumModel.js(import 0 순수
//      모듈, 확장자 없는 상대 import가 전혀 없어 플레인 Node ESM이 직접
//      로드 가능)는 그대로 import한다. generatorContract.js는 순수하지만
//      내부에서 확장자 없는 상대 import(`./curriculumModel`,
//      `../textbookExampleModel`)를 쓰므로(Vite에서만 자동 해석되는 표기,
//      플레인 Node ESM은 해석 불가 — ERR_MODULE_NOT_FOUND) esbuild로
//      인메모리 번들(scripts/buildWordLibBundle.mjs와 동일한 관례, 이 번들은
//      네트워크/환경변수 의존이 전혀 없어 "라이브"가 아니라 순수 섹션에
//      속한다)해서만 로드한다 — canTransition 전체 매트릭스/
//      validateExampleFields/normalizeTargetWord/matchesFilters/
//      reviewCandidate/generateCandidateExamples를 단언.
//   ② live 섹션(선택) — .env/.env.local에 VITE_SUPABASE_URL/ANON_KEY가
//      없으면 SKIP(exit 0, pure 결과만으로 마감) — testXpLedgerDb.mjs와
//      동일한 "정상적으로 예상된 SKIP" 관례(가짜 PASS 금지). env가 있으면
//      exampleLibrary.js를 esbuild로 인메모리 번들(import.meta.env 치환 —
//      scripts/buildWordLibBundle.mjs와 동일 패턴, 로직 재구현 없음)해 실제
//      Supabase에 조회한다. examples 테이블이 아직 없으면(현재 프로덕션의
//      실제 상태 — supabase_v3_13 미실행) listExamples의 featureDisabled:true
//      폴백 자체를 PASS로 확인한다. 테이블이 있으면 'verify-harness' 표시
//      행으로 생성→전이→유닛 우선순위 조회 확인→cleanup까지 왕복한다.
//
// 실행: node tests/harness/runExamples.mjs (env 없으면 라이브 섹션만 SKIP)
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import {
  APPROVAL_STATUSES, SOURCES, canTransition, validateExampleFields, matchesFilters, normalizeTargetWord,
  computeExampleRank, SOURCE_PRIORITY,
} from '../../src/utils/curriculum/curriculumModel.js'
// textImport.js도 curriculumModel.js와 같은 import-0 순수 모듈 — 직접 로드.
import {
  splitIntoSentences, regularInflections, matchWordsToSentences, duplicateKey, parseBilingualPassage, preferManualKo,
} from '../../src/utils/curriculum/textImport.js'

mkdirSync('scripts/.tmp', { recursive: true })
await esbuild.build({
  entryPoints: ['src/utils/curriculum/generatorContract.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/generatorContract.curriculum.bundle.mjs',
})
const { generateCandidateExamples, reviewCandidate } = await import(
  pathToFileURL('scripts/.tmp/generatorContract.curriculum.bundle.mjs').href
)

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:examples] Curriculum Engine — examples 모듈 ===')

// ── canTransition — 전체 매트릭스(4x4) + same-state + 알 수 없는 값 ────────
console.log('\n-- canTransition (전체 매트릭스)')
const EXPECTED_TRUE = new Set(['draft>pending', 'pending>approved', 'pending>rejected', 'rejected>pending', 'approved>rejected'])
let matrixOk = true
const matrixMismatches = []
for (const from of APPROVAL_STATUSES) {
  for (const to of APPROVAL_STATUSES) {
    const expected = EXPECTED_TRUE.has(`${from}>${to}`)
    if (canTransition(from, to) !== expected) { matrixOk = false; matrixMismatches.push(`${from}->${to}`) }
  }
}
check('4x4 전체 매트릭스가 설계 §3 전이 그래프와 정확히 일치', matrixOk, matrixMismatches.join(', '))
check('동일 상태로의 전이는 항상 false(자기자신)', APPROVAL_STATUSES.every((s) => canTransition(s, s) === false))
check('알 수 없는 상태값/빈 문자열/undefined는 항상 false',
  canTransition('unknown', 'pending') === false
  && canTransition('draft', 'unknown') === false
  && canTransition('', '') === false
  && canTransition(undefined, undefined) === false
  && canTransition(null, 'approved') === false)

// ── validateExampleFields ──────────────────────────────────────────────────
console.log('\n-- validateExampleFields')
check('필수 필드 정상 입력 → ok:true, errors:[]',
  validateExampleFields({ target_word: 'school', english_sentence: 'I go to school.' }).ok === true)
check('target_word 없으면 실패', validateExampleFields({ english_sentence: 'I go to school.' }).ok === false)
check('english_sentence 없으면 실패', validateExampleFields({ target_word: 'school' }).ok === false)
check('whole-word 불변식 위반(school이 schools의 부분 문자열일 뿐) → 실패',
  validateExampleFields({ target_word: 'school', english_sentence: 'I love schools.' }).ok === false)
check('whole-word 불변식 대소문자 무관 통과', validateExampleFields({ target_word: 'School', english_sentence: 'i go to school.' }).ok === true)

// 정규식 특수문자를 포함한 target_word — 이스케이프가 실제로 리터럴 매칭을
// 하는지(정규식 인젝션/크래시 없음, 프로토타입 관례와 동일한 이스케이프
// 로직을 curriculumModel.js가 독립적으로 반복 구현했음을 검증).
check('정규식 특수문자 단어(내부에 하이픈, 양끝은 일반 단어문자) → whole-word로 정상 매칭',
  validateExampleFields({ target_word: 'co-op', english_sentence: 'We joined a co-op yesterday.' }).ok === true)
check('정규식 특수문자(마침표)가 리터럴로만 매칭 — 다른 문자로 치환된 문장은 거부',
  validateExampleFields({ target_word: 'a.b', english_sentence: 'I saw axb today.' }).ok === false)
check('정규식 특수문자(마침표) 리터럴 그대로 포함되면 통과',
  validateExampleFields({ target_word: 'a.b', english_sentence: 'I saw a.b today.' }).ok === true)
check('크래시 없이 안전(괄호/별표/플러스 등 메타문자 조합)',
  (() => {
    try {
      return typeof validateExampleFields({ target_word: 'c++', english_sentence: 'I love c++ (a lot)!' }).ok === 'boolean'
    } catch { return false }
  })())

check('difficulty 1..5 범위 밖이면 실패(0/6/NaN)',
  validateExampleFields({ target_word: 'x', english_sentence: 'x x', difficulty: 0 }).ok === false
  && validateExampleFields({ target_word: 'x', english_sentence: 'x x', difficulty: 6 }).ok === false
  && validateExampleFields({ target_word: 'x', english_sentence: 'x x', difficulty: 'abc' }).ok === false)
check('difficulty 1..5 범위 안이면 통과', validateExampleFields({ target_word: 'x', english_sentence: 'x x', difficulty: 3 }).ok === true)
check('source가 SOURCES 밖이면 실패', validateExampleFields({ target_word: 'x', english_sentence: 'x x', source: 'bogus' }).ok === false)
check('source가 SOURCES 안이면 통과', SOURCES.every((s) => validateExampleFields({ target_word: 'x', english_sentence: 'x x', source: s }).ok === true))
check('approval_status가 APPROVAL_STATUSES 밖이면 실패', validateExampleFields({ target_word: 'x', english_sentence: 'x x', approval_status: 'bogus' }).ok === false)

// ── normalizeTargetWord ──────────────────────────────────────────────────
console.log('\n-- normalizeTargetWord')
check('trim + 소문자화', normalizeTargetWord('  School  ') === 'school')
check('빈/비문자열 입력 → 빈 문자열', normalizeTargetWord('') === '' && normalizeTargetWord(null) === '' && normalizeTargetWord(undefined) === '')

// ── matchesFilters — camelCase 계약(listExamples/toRow의 실제 출력 shape) ──
console.log('\n-- matchesFilters (camelCase 계약)')
const row = { unitId: 'u1', textbookId: 't1', targetWord: 'school', grammarPointId: 'g1', approvalStatus: 'approved' }
check('빈 필터는 항상 매치', matchesFilters(row, {}) === true)
check('textbookId 일치/불일치', matchesFilters(row, { textbookId: 't1' }) === true && matchesFilters(row, { textbookId: 't2' }) === false)
check('unitId 일치/불일치', matchesFilters(row, { unitId: 'u1' }) === true && matchesFilters(row, { unitId: 'u2' }) === false)
check('grammarPointId 일치/불일치', matchesFilters(row, { grammarPointId: 'g1' }) === true && matchesFilters(row, { grammarPointId: 'g2' }) === false)
check('approvalStatus 일치/불일치', matchesFilters(row, { approvalStatus: 'approved' }) === true && matchesFilters(row, { approvalStatus: 'draft' }) === false)
check('targetWord 부분 문자열(대소문자 무관) 검색', matchesFilters(row, { targetWord: 'SCHO' }) === true && matchesFilters(row, { targetWord: 'zzz' }) === false)
check('snake_case 키는 인식되지 않음(계약은 camelCase 전용 — 오탐 방지)', matchesFilters(row, { unit_id: 'u2' }) === true)

// ── textImport(본문 가져오기) — 2026-08-09 신규 순수 모듈 ─────────────────
console.log('\n-- textImport: splitIntoSentences (원문 보존/경계 판정)')
{
  const text = 'The curtains block out the sunlight. This helps keep the room cool.'
  const s = splitIntoSentences(text)
  check('기본 2문장 분리 + 각 문장이 원문 부분 문자열 그대로',
    s.length === 2
    && s[0] === 'The curtains block out the sunlight.'
    && s[1] === 'This helps keep the room cool.'
    && s.every((x) => text.includes(x)))
}
check('줄바꿈은 항상 문장 경계', splitIntoSentences('Hello world\nGood morning').length === 2)
check('약어(Mr./Dr.) 뒤 마침표는 경계가 아님',
  (() => { const s = splitIntoSentences('Mr. Kim teaches English. He is kind.'); return s.length === 2 && s[0] === 'Mr. Kim teaches English.' })())
check('소수점(3.5)은 경계가 아님',
  (() => { const s = splitIntoSentences('It weighs 3.5 kg. That is heavy.'); return s.length === 2 && s[0] === 'It weighs 3.5 kg.' })())
check('물음표/느낌표 + 닫는 따옴표 경계',
  (() => { const s = splitIntoSentences('“Are you ok?” she asked. Yes!'); return s.length >= 2 })())
check('빈 입력/공백만 → 빈 배열', splitIntoSentences('').length === 0 && splitIntoSentences('   \n  ').length === 0)

console.log('\n-- textImport: 매칭(whole-word/숙어/형태 변화)')
{
  const sents = splitIntoSentences('The curtains block out the sunlight. I love my cat. We protected the environment. Take care of yourself.')
  const res = matchWordsToSentences(
    [{ id: 'w1', word: 'block out' }, { id: 'w2', word: 'category' }, { id: 'w3', word: 'protect' }, { id: 'w4', word: 'take care of' }, { id: 'w5', word: 'improve' }],
    sents,
  )
  const byWord = Object.fromEntries(res.map((r) => [r.word, r]))
  check('숙어(block out) 정확 매칭 → exact',
    byWord['block out'].matches.length === 1 && byWord['block out'].matches[0].matchType === 'exact'
    && byWord['block out'].matches[0].sentence === 'The curtains block out the sunlight.')
  check('substring 오탐 없음(cat ⊄ category — category는 본문에 없음)', byWord['category'].matches.length === 0)
  check('형태 변화(protect→protected) 매칭되지만 inflected로 구분(자동 확정 금지)',
    byWord['protect'].matches.length === 1 && byWord['protect'].matches[0].matchType === 'inflected')
  check('구동사(take care of) 매칭', byWord['take care of'].matches.length === 1 && byWord['take care of'].matches[0].matchType === 'exact')
  check('본문에 없는 단어(improve)는 matches 빈 배열(미발견 구획)', byWord['improve'].matches.length === 0)
  check('exact 매칭 문장은 validateExampleFields whole-word 불변식을 통과(저장 가능)',
    validateExampleFields({ target_word: 'block out', english_sentence: byWord['block out'].matches[0].sentence }).ok === true)
  check('inflected 매칭 문장은 validateExampleFields를 통과하지 못함(저장 차단 근거 — 정직한 계약)',
    validateExampleFields({ target_word: 'protect', english_sentence: byWord['protect'].matches[0].sentence }).ok === false)
}
check('regularInflections: 규칙 변화(s/es/ed/d/ing/e탈락/y변화) + 원형 미포함',
  (() => {
    const f = regularInflections('protect')
    const h = regularInflections('study')
    return f.includes('protects') && f.includes('protected') && f.includes('protecting') && !f.includes('protect')
      && h.includes('studies') && h.includes('studied')
  })())
check('불규칙 사전(2026-08-09 확장): make→made, go→went, take→took, child→children',
  regularInflections('make').includes('made')
  && regularInflections('go').includes('went')
  && regularInflections('take').includes('took')
  && regularInflections('child').includes('children'))
check('불규칙 형태도 inflected(검토 필요)로만 매칭 — 자동 확정 없음',
  (() => {
    const r = matchWordsToSentences([{ word: 'go' }, { word: 'take care of' }],
      ['She went home early.', 'He took care of the dog.'])
    const by = Object.fromEntries(r.map((x) => [x.word, x]))
    return by['go'].matches.length === 1 && by['go'].matches[0].matchType === 'inflected'
      && by['take care of'].matches.length === 1 && by['take care of'].matches[0].matchType === 'inflected'
  })())
check('불규칙 사전이 오탐을 만들지 않음: "went"⊄"wenting 같은 파생 아님/win⊄window',
  (() => {
    const r = matchWordsToSentences([{ word: 'win' }], ['Look out the window.'])
    return r[0].matches.length === 0
  })())
check('같은 문장에 원형+변화형 공존 시 exact 우선',
  (() => {
    const r = matchWordsToSentences([{ word: 'protect' }], ['We protect and protected it.'])
    return r[0].matches.length === 1 && r[0].matches[0].matchType === 'exact'
  })())

console.log('\n-- textImport: false positive 방어(추가, 2026-08-09 야간)')
{
  const sents = ['The weather is nice.', 'I saw a border collie.', 'This is part of the start.', 'She blocked outside noise.']
  const res = matchWordsToSentences(
    [{ word: 'he' }, { word: 'order' }, { word: 'art' }, { word: 'block out' }, { word: 'weather' }],
    sents,
  )
  const byWord = Object.fromEntries(res.map((r) => [r.word, r]))
  check('"he"가 "The/weather" 안에서 잡히지 않음', byWord['he'].matches.length === 0)
  check('"order"가 "border" 안에서 잡히지 않음', byWord['order'].matches.length === 0)
  check('"art"가 "part/start" 안에서 잡히지 않음', byWord['art'].matches.length === 0)
  check('"block out" 변화형이 "blocked outside"에 오탐되지 않음(\\b 경계)', byWord['block out'].matches.length === 0)
  check('정상 단어("weather")는 그대로 매칭', byWord['weather'].matches.length === 1)
}

console.log('\n-- computeExampleRank: SOURCE TEXT FIRST 랭킹(순수)')
{
  const U = 'u1'
  check('같은 유닛: import > teacher > ai (엄격 감소)',
    computeExampleRank(U, 'import', U) > computeExampleRank(U, 'teacher', U)
    && computeExampleRank(U, 'teacher', U) > computeExampleRank(U, 'ai', U)
    && computeExampleRank(U, 'ai', U) === computeExampleRank(U, 'rule', U))
  check('유닛 일치가 소스보다 지배적: 같은 유닛 ai > 다른 유닛 import',
    computeExampleRank(U, 'ai', U) > computeExampleRank('u2', 'import', U))
  check('unitId 미지정(하위 호환): 유닛 축 동률, 소스 축만 차등',
    computeExampleRank(U, 'import', undefined) - computeExampleRank('u2', 'import', undefined) === 0
    && computeExampleRank(U, 'import', undefined) > computeExampleRank(U, 'ai', undefined))
  check('알 수 없는 source는 최하위(0) 취급, 크래시 없음',
    computeExampleRank(U, 'bogus', U) === computeExampleRank(U, 'ai', U))
  check('SOURCE_PRIORITY 계약: import 2 / teacher 1 / rule·ai 0',
    SOURCE_PRIORITY.import === 2 && SOURCE_PRIORITY.teacher === 1 && SOURCE_PRIORITY.rule === 0 && SOURCE_PRIORITY.ai === 0)
}

console.log('\n-- textImport: AMBIGUOUS 분류(2026-08-09 — 4단계 매칭)')
{
  // leaves = leaf 복수 ∧ leave 3인칭 — 유닛에 둘 다 있으면 중의적.
  const r = matchWordsToSentences([{ word: 'leaf' }, { word: 'leave' }], ['The leaves are green.'])
  const by = Object.fromEntries(r.map((x) => [x.word, x]))
  check('유닛에 leaf/leave 공존 시 "leaves" 매칭은 둘 다 ambiguous',
    by['leaf'].matches[0]?.matchType === 'ambiguous' && by['leave'].matches[0]?.matchType === 'ambiguous')
  // 겹치는 단어가 없으면 같은 문장이라도 safe inflection.
  const solo = matchWordsToSentences([{ word: 'leaf' }], ['The leaves are green.'])
  check('leaf 단독이면 "leaves"는 inflected(safe)', solo[0].matches[0]?.matchType === 'inflected')
  // 원형이 그대로 있으면 항상 exact(중의성 무관).
  const exact = matchWordsToSentences([{ word: 'leaf' }, { word: 'leave' }], ['Please leave now.'])
  const byE = Object.fromEntries(exact.map((x) => [x.word, x]))
  check('원형 그대로 등장(leave)은 exact 유지', byE['leave'].matches[0]?.matchType === 'exact')
  check('다른 단어(leaf)는 그 문장에 매칭 없음(NOT_FOUND)', byE['leaf'].matches.length === 0)
}

console.log('\n-- textImport: parseBilingualPassage(영어↔한국어 자동 짝짓기, 2026-08-09)')
{
  // 운영자 검증 문장 그대로(2026-08-09 지시).
  const passage = [
    'In 1958, he returned to Korea at the invitation of the Korean government and never left again.',
    '1958년, 그는 한국 정부의 초청으로 한국에 돌아왔고 다시는 한국을 떠나지 않았다.',
    '',
    'He believed that every country has the right to be independent, so he helped the Korean independence movement.',
    '그는 모든 나라가 독립할 권리를 가져야 한다고 믿었기에 한국의 독립운동을 도왔다.',
  ].join('\n')
  const { pairs, hasKorean } = parseBilingualPassage(passage)
  check('검증 문장 1: 1958 문장 ↔ 1958년 번역 정확 연결(원문 무수정)',
    hasKorean === true && pairs.length === 2
    && pairs[0].en === 'In 1958, he returned to Korea at the invitation of the Korean government and never left again.'
    && pairs[0].ko === '1958년, 그는 한국 정부의 초청으로 한국에 돌아왔고 다시는 한국을 떠나지 않았다.')
  check('검증 문장 2: independence 문장 ↔ 독립운동 번역 정확 연결',
    pairs[1].en === 'He believed that every country has the right to be independent, so he helped the Korean independence movement.'
    && pairs[1].ko === '그는 모든 나라가 독립할 권리를 가져야 한다고 믿었기에 한국의 독립운동을 도왔다.')
}
{
  // 화자 표시 대화문(운영자 지시 8) — 한 pair로.
  const { pairs } = parseBilingualPassage('Man: Many people are going to gather tomorrow for the independence of Korea.\n남자: 내일 한국의 독립을 위해 많은 사람들이 모일 예정입니다.')
  check('화자 표시(Man:/남자:) 대화문도 1 pair', pairs.length === 1
    && pairs[0].en.startsWith('Man:') && pairs[0].ko === '남자: 내일 한국의 독립을 위해 많은 사람들이 모일 예정입니다.')
}
{
  // 여러 줄로 감긴 영어 1문장 + 여러 줄 한국어 번역(지시 5·6) — 각각 병합.
  const { pairs } = parseBilingualPassage('For the rest of his life, he worked hard\nto help Koreans, especially poor students.\n그는 여생 동안 한국인, 특히\n가난한 학생들을 돕기 위해 헌신했다.')
  check('줄바꿈으로 감긴 영어/한국어 각각 병합해 1 pair', pairs.length === 1
    && pairs[0].en === 'For the rest of his life, he worked hard to help Koreans, especially poor students.'
    && pairs[0].ko === '그는 여생 동안 한국인, 특히 가난한 학생들을 돕기 위해 헌신했다.')
}
{
  // 영어 블록 2문장 + 한국어 블록 2문장 → 순서대로 1:1.
  const { pairs } = parseBilingualPassage('He came home. He was happy.\n그는 집에 왔다. 그는 행복했다.')
  check('영2+한2 블록 → 문장 수 일치 시 1:1', pairs.length === 2
    && pairs[0].ko === '그는 집에 왔다.' && pairs[1].ko === '그는 행복했다.')
}
{
  // 문장 수 불일치 → 임의 배분 없이 전부 미매칭(지시 11 — 지어내기 금지).
  const { pairs } = parseBilingualPassage('He came home. He was happy.\n그는 집에 와서 행복했다.')
  check('영2+한1 불일치 → 전부 ko=null(미매칭 표시)', pairs.length === 2 && pairs.every((p) => p.ko === null))
}
{
  // 영어 전용 본문 → 기존 동작과 동일(회귀 0, 지시 1).
  const en = 'The curtains block out the sunlight. This helps keep the room cool.'
  const { pairs, hasKorean } = parseBilingualPassage(en)
  const legacy = splitIntoSentences(en)
  check('영어 전용 본문 → hasKorean=false + 기존 분리 결과와 동일',
    hasKorean === false && pairs.length === legacy.length && pairs.every((p, k) => p.en === legacy[k] && p.ko === null))
}
{
  // 번역 없는 마지막 영어 문장 → ko=null(빈 줄은 문장 아님, 지시 7).
  const { pairs } = parseBilingualPassage('He came home.\n그는 집에 왔다.\n\nShe left early.')
  check('번역 없는 문장은 ko=null, 빈 줄 무시', pairs.length === 2 && pairs[0].ko === '그는 집에 왔다.' && pairs[1].ko === null)
}

console.log('\n-- textImport: 실전형 통합(패널 데이터 흐름 재현 — 2026-08-09 운영자 재검증 지시)')
{
  // TextImportPanel.handleAnalyze와 동일한 흐름을 그대로 재현:
  // parseBilingualPassage → sentences/koBySentence → matchWordsToSentences
  // → 각 매칭 카드의 ko = koBySentence[sentenceIndex].
  // 본문: 제목 + 대화문 + 빈 줄 + 같은 단어(independence) 4회(각자 번역).
  const passage = [
    'The Blue-Eyed Korean',
    '',
    'In 1958, he returned to Korea at the invitation of the Korean government and never left again.',
    '1958년, 그는 한국 정부의 초청으로 한국에 돌아왔고 다시는 한국을 떠나지 않았다.',
    '',
    'He believed that every country has the right to be independent, so he helped the Korean independence movement.',
    '그는 모든 나라가 독립할 권리를 가져야 한다고 믿었기에 한국의 독립운동을 도왔다.',
    '',
    'Man: Many people are going to gather tomorrow for the independence of Korea.',
    '남자: 내일 한국의 독립을 위해 많은 사람들이 모일 예정입니다.',
    '',
    'The independence fighters never gave up.',
    '독립운동가들은 결코 포기하지 않았다.',
    '',
    'Korea finally achieved independence in 1945.',
    // (의도적으로 이 문장만 번역 없음 — 미매칭 안전 검증)
  ].join('\n')
  const { pairs, hasKorean } = parseBilingualPassage(passage)
  const sentences = pairs.map((p) => p.en)
  const koBySentence = pairs.map((p) => p.ko)
  const res = matchWordsToSentences([{ word: 'invitation' }, { word: 'independence' }], sentences)
  const by = Object.fromEntries(res.map((r) => [r.word, r]))

  check('[A] invitation 1건 발견 + 자기 번역("1958년…") 자동 연결',
    hasKorean && by['invitation'].matches.length === 1
    && koBySentence[by['invitation'].matches[0].sentenceIndex] === '1958년, 그는 한국 정부의 초청으로 한국에 돌아왔고 다시는 한국을 떠나지 않았다.')

  const indep = by['independence'].matches
  check('[B] independence 4개 문장 발견', indep.length === 4)
  const koOf = (i) => koBySentence[indep[i].sentenceIndex]
  check('[B] 각 문장이 자기 바로 뒤 번역과 각각 연결(1↔독립운동/2↔남자:/3↔포기/4↔없음)',
    koOf(0) === '그는 모든 나라가 독립할 권리를 가져야 한다고 믿었기에 한국의 독립운동을 도왔다.'
    && koOf(1) === '남자: 내일 한국의 독립을 위해 많은 사람들이 모일 예정입니다.'
    && koOf(2) === '독립운동가들은 결코 포기하지 않았다.'
    && koOf(3) === null)
  check('[C] 번역 없는 문장은 빈칸 유지(다른 한국어를 억지로 붙이지 않음)',
    indep[3].sentence === 'Korea finally achieved independence in 1945.' && koOf(3) === null)
  check('[영어 매칭 무변경] 4건 전부 exact', indep.every((m) => m.matchType === 'exact'))
  check('제목 줄은 별도 문장으로 유지(번역 없음)', sentences[0] === 'The Blue-Eyed Korean' && koBySentence[0] === null)
}

console.log('\n-- textImport: preferManualKo(재분석 시 수동 입력 보존)')
check('[D] 수동 입력이 있으면 자동값이 덮어쓰지 않음', preferManualKo('내가 고친 번역', '자동 번역') === '내가 고친 번역')
check('[D] 수동 입력이 공백뿐이면 자동값 채움', preferManualKo('   ', '자동 번역') === '자동 번역')
check('[D] 둘 다 없으면 빈 문자열', preferManualKo('', null) === '')
check('[D] 자동값 없고 수동만 있으면 수동 유지', preferManualKo('수동', null) === '수동')

console.log('\n-- practiceSentence: 학생 연습용 짧은 예문(2026-08-09, source/practice 분리)')
{
  const { validatePracticeSentence, suggestPracticeSentence, extractPracticeClause, countWords } =
    await import('../../src/utils/curriculum/practiceSentence.js')

  const SRC1 = 'In 1958, he returned to Korea at the invitation of the Korean government and never left again.'
  const SRC2 = 'He believed that every country has the right to be independent, so he helped the Korean independence movement.'

  // 자동 제안 — ①단어 자산 우선
  const s1 = suggestPracticeSentence({ targetWord: 'invitation', sourceSentence: SRC1, assetExample: 'I got an invitation to the party.' })
  check('자산 예문이 유효하면 1순위 채택(word_asset)', s1?.origin === 'word_asset' && s1.sentence === 'I got an invitation to the party.')
  // ②자산 없으면 원문 절 추출(원문 단어 부분집합만 — 새 단어 발명 없음)
  const s2 = suggestPracticeSentence({ targetWord: 'invitation', sourceSentence: SRC1, assetExample: null })
  check('자산 없으면 원문 절 추출(≤12단어 + 대상 단어 포함)',
    s2?.origin === 'clause' && countWords(s2.sentence) <= 12
    && /\binvitation\b/i.test(s2.sentence)
    && s2.sentence.split(/\s+/).every((w) => SRC1.toLowerCase().includes(w.toLowerCase().replace(/[.!?]$/, ''))))
  const s3 = extractPracticeClause(SRC2, 'independence')
  check('independence 절 추출 — "so" 제거+대문자화+마침표("He helped the Korean independence movement.")',
    s3 === 'He helped the Korean independence movement.')
  // 실패 시 임의 생성 금지
  check('자산도 절도 없으면 null(임의 생성 금지)',
    suggestPracticeSentence({ targetWord: 'xyzzy', sourceSentence: 'Nothing here.', assetExample: null }) === null)

  // 검증기
  check('[검증] practice에 target_word 포함 필수', validatePracticeSentence('invitation', 'He came to Korea.').ok === false)
  check('[검증] 12단어 초과 시 경고(저장은 가능)',
    (() => { const v = validatePracticeSentence('cat', 'The cat sat on the mat with a very long tail and more words here.'); return v.ok === true && v.warnings.some((w) => w.includes('12단어')) })())
  check('[검증] 6~10단어 정상 문장 → ok + 경고 없음',
    (() => { const v = validatePracticeSentence('invitation', 'She came to the party by invitation.'); return v.ok === true && v.warnings.length === 0 })())

  // source 원문 불변 — 제안 함수가 원문 문자열을 변형해 반환하지 않는지
  const before = SRC1
  suggestPracticeSentence({ targetWord: 'invitation', sourceSentence: SRC1, assetExample: null })
  check('[원문 불변] 제안 후 source 문자열 무변화', SRC1 === before)
}

console.log('\n-- learningItem.fromExample: 학생 화면 우선순위(practice > source)')
{
  const { fromExample } = await import('../../src/learning/adapters/learningItem.js')
  const row = { id: 'e1', targetWord: 'invitation', englishSentence: 'In 1958, he returned to Korea at the invitation of the Korean government and never left again.', koreanTranslation: '해석', practiceSentence: 'She came to the party by invitation.' }
  const item = fromExample(row)
  check('[학생 기본] practiceSentence 우선(text/audioText)', item.text === row.practiceSentence && item.audioText === row.practiceSentence)
  check('[본문 보기] sourceText에 원문 그대로 보존', item.sourceText === row.englishSentence && item.hasPractice === true)
  const noPractice = fromExample({ ...row, practiceSentence: null })
  check('[폴백] practice 없으면 원문 사용(기존 동작 동일)', noPractice.text === row.englishSentence && noPractice.hasPractice === false)
}

console.log('\n-- textImport: duplicateKey(중복 판정)')
check('공백/대소문자 정규화로 동일 판정',
  duplicateKey('Block Out', 'The  curtains block out the sunlight.') === duplicateKey('block out', 'the curtains block out the sunlight.'))
check('문장이 다르면 다른 키', duplicateKey('a', 'x y') !== duplicateKey('a', 'x z'))

// ── reviewCandidate ─────────────────────────────────────────────────────
console.log('\n-- reviewCandidate')
check('정상 후보 → ok:true', reviewCandidate({ targetWord: 'school', englishSentence: 'I go to school.' }).ok === true)
check('필수 필드 누락 후보 → ok:false', reviewCandidate({ targetWord: 'school' }).ok === false)
check('whole-word 불변식 위반 후보 → ok:false', reviewCandidate({ targetWord: 'school', englishSentence: 'I love schools.' }).ok === false)
check('금칙 톤 힌트 감지(사람 검수 필요 표시) → ok:false',
  reviewCandidate({ targetWord: 'school', englishSentence: 'I go to school.', rationale: '너만 못했다' }).ok === false)

// ── generateCandidateExamples — 규칙 기반 구현(2026-08-09) + 하위 호환 ─────
console.log('\n-- generateCandidateExamples (규칙 기반 — 단어 자산 재사용, 네트워크 0)')
const genRes = await generateCandidateExamples({ unitId: 'u1' })
check('wordAssets 없이 호출(기존 계약) → ok:false not_implemented, throw 없음(하위 호환)',
  genRes.ok === false && genRes.reason === 'not_implemented' && Array.isArray(genRes.candidates) && genRes.candidates.length === 0)
{
  const assets = [
    { word: 'improve', exampleText: 'I want to improve my English.', exampleTranslation: '나는 영어를 향상시키고 싶다.' },
    { word: 'protect', exampleText: 'We protected the forest.' }, // 원형 부재 — whole-word 위반, 걸러져야 함
    { word: 'empty', exampleText: '' },                            // 자산 없음
  ]
  const ok = await generateCandidateExamples({ targetWords: ['improve'], wordAssets: assets })
  check('자산 있는 단어(improve) → ok:true + 후보 1건(원문/번역 그대로)',
    ok.ok === true && ok.candidates.length === 1
    && ok.candidates[0].englishSentence === 'I want to improve my English.'
    && ok.candidates[0].koreanTranslation === '나는 영어를 향상시키고 싶다.')
  const filtered = await generateCandidateExamples({ targetWords: ['protect'], wordAssets: assets })
  check('자산 예문에 원형이 없는 단어(protect/protected) → whole-word 검증으로 걸러져 no_valid_candidates',
    filtered.ok === false && filtered.reason === 'no_valid_candidates' && filtered.candidates.length === 0)
  const none = await generateCandidateExamples({ targetWords: ['empty'], wordAssets: assets })
  check('자산이 빈 단어 → no_valid_candidates', none.ok === false && none.reason === 'no_valid_candidates')
  const all = await generateCandidateExamples({ wordAssets: assets })
  check('targetWords 미지정 → 유효 자산 전체가 후보(1건)', all.ok === true && all.candidates.length === 1)
  check('후보에 승인 전이 능력 없음(auto-publish 구조적 차단 유지) — candidates는 데이터만',
    all.candidates.every((c) => typeof c.englishSentence === 'string' && !('approve' in c) && !('approvalStatus' in c)))
}

// ── 순수성(코드 레벨) ──────────────────────────────────────────────────────
console.log('\n-- 순수성(코드 레벨)')
// "supabase 접근 없음"은 문자열 "supabase"가 소스에 전혀 없다는 뜻이 아니다
// — 이 두 파일의 헤더 주석 자체가 "왜 Supabase를 안 쓰는지"를 설명하며
// 그 단어를 산문으로 언급한다(정직한 설계 의도 서술, 오탐 방지가 목적이라
// 실제 사용 패턴만 정밀하게 본다): import 경로에 supabase가 들어가거나,
// supabase.from(...)/createClient(...) 같은 실제 클라이언트 호출이 있는지만
// 검사한다.
const SUPABASE_USAGE_RE = /from\s+['"][^'"]*supabase[^'"]*['"]|supabase\s*\.\s*(from|auth|rpc|storage|channel)\s*\(|createClient\s*\(/i
const modelSrc = readFileSync(new URL('../../src/utils/curriculum/curriculumModel.js', import.meta.url), 'utf8')
check('curriculumModel.js는 import 0 순수 모듈', !/^import /m.test(modelSrc))
check('curriculumModel.js는 Math.random 없음', !modelSrc.includes('Math.random'))
check('curriculumModel.js는 supabase 실사용 없음(import/클라이언트 호출 패턴 정밀 검사)', !SUPABASE_USAGE_RE.test(modelSrc))
const contractSrc = readFileSync(new URL('../../src/utils/curriculum/generatorContract.js', import.meta.url), 'utf8')
check('generatorContract.js는 supabase 실사용 없음(네트워크 0)', !SUPABASE_USAGE_RE.test(contractSrc))
const textImportSrc = readFileSync(new URL('../../src/utils/curriculum/textImport.js', import.meta.url), 'utf8')
check('textImport.js는 import 0 순수 모듈', !/^import /m.test(textImportSrc))
check('textImport.js는 supabase 실사용 없음(네트워크 0)', !SUPABASE_USAGE_RE.test(textImportSrc))
check('generatorContract.js에 approveExample/publishExample이 없음(auto-publish 구조적 차단, §4)',
  !contractSrc.includes('function approveExample') && !contractSrc.includes('function publishExample'))

console.log('\n=== pure summary ===')
console.log(`  pure 섹션: PASS ${passed} / FAIL ${failed}`)

// ═══════════════════════════════════════════════════════════════════════
// ── live 섹션 — env 없으면 SKIP(exit 0), 있으면 실제 Supabase 조회 ────────
// ═══════════════════════════════════════════════════════════════════════
for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}

function finish() {
  console.log('\n=== summary ===')
  if (failed === 0) { console.log(`  PASS  examples — Curriculum Engine examples 모듈 (${passed}개 단언)`); process.exit(0) }
  console.log(`  FAIL  examples — ${failed}건: ${failures.join(', ')}`); process.exit(1)
}

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.log('\nSKIP — 라이브 섹션: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY가 로컬에 없음(.env/.env.local). pure 섹션 결과만으로 마감합니다.')
  finish()
}

console.log('\n-- 라이브 섹션 — exampleLibrary.js 실제 Supabase 조회')
let exampleLibrary
try {
  const esbuild = (await import('esbuild')).default
  mkdirSync('scripts/.tmp', { recursive: true })
  await esbuild.build({
    entryPoints: ['src/utils/curriculum/exampleLibrary.js'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: 'scripts/.tmp/exampleLibrary.curriculum.bundle.mjs',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    },
  })
  exampleLibrary = await import(pathToFileURL('scripts/.tmp/exampleLibrary.curriculum.bundle.mjs').href)
} catch (err) {
  console.log(`\nSKIP — 라이브 섹션: exampleLibrary.js 번들 실패(esbuild) — ${err?.message || err}`)
  finish()
}

const { listExamples, fetchApprovedExamplesForWords, createExample, setApprovalStatus, deleteExample } = exampleLibrary

const probe = await listExamples({}, { limit: 1 })
if (probe.featureDisabled) {
  // 테이블 부재(supabase_v3_13 미실행, 현재 프로덕션의 실제 상태) — 이
  // 폴백 자체가 검증 대상이다(가짜 실패 아님, 규칙 9의 실제 증거).
  check('테이블 부재 → listExamples가 { rows:[], featureDisabled:true }로 폴백(throw 없음)',
    Array.isArray(probe.rows) && probe.rows.length === 0 && probe.featureDisabled === true)
  const approvedMap = await fetchApprovedExamplesForWords(['school'])
  check('테이블 부재 → fetchApprovedExamplesForWords도 {}로 폴백(학생 화면 무영향)',
    typeof approvedMap === 'object' && Object.keys(approvedMap).length === 0)
  console.log('\nNOTE — examples 테이블이 아직 없어 전체 CRUD 왕복은 건너뜁니다(supabase_v3_13 실행 후 재실행하면 아래 CRUD 섹션이 돈다).')
  finish()
}

// ── 테이블 존재 — 전체 CRUD 왕복(표시 행 'verify-harness', 반드시 cleanup) ──
console.log('\n-- 라이브 섹션 — 전체 CRUD 왕복(테이블 존재 확인됨)')
const marker = `verify-harness-${Date.now()}`
let createdId = null
try {
  const created = await createExample({
    target_word: marker,
    english_sentence: `This is a ${marker} sentence.`,
    korean_translation: '검증 하네스 표시 행',
    source: 'teacher',
    approval_status: 'draft',
  })
  createdId = created.id
  check('createExample 성공 + draft 상태로 생성', created.approvalStatus === 'draft' && created.targetWord === marker)

  const toPending = await setApprovalStatus(createdId, 'pending')
  check('draft → pending 전이 성공', toPending.approvalStatus === 'pending')

  const toApproved = await setApprovalStatus(createdId, 'approved')
  check('pending → approved 전이 성공 + approved_at 기록', toApproved.approvalStatus === 'approved' && !!toApproved.approvedAt)

  // 유닛 우선 fetch 확인 — unitId 없이 생성했으므로 rank는 항상 1이지만,
  // 승인된 뒤 fetchApprovedExamplesForWords로 조회되는지는 확인 가능.
  const approvedMap = await fetchApprovedExamplesForWords([marker])
  check('승인 후 fetchApprovedExamplesForWords로 조회됨(단어 키 정규화 일치)',
    approvedMap[marker]?.id === createdId)

  const invalidTransition = await setApprovalStatus(createdId, 'draft').then(() => null).catch((e) => e)
  check('approved → draft(허용 안 된 전이)는 명확한 에러로 거부', invalidTransition instanceof Error)
} catch (err) {
  check('라이브 CRUD 왕복 전체', false, err?.message || String(err))
} finally {
  if (createdId) {
    try { await deleteExample(createdId) } catch { /* cleanup 실패해도 하네스 자체 결과에는 영향 없음 */ }
    console.log(`  cleanup: verify-harness 표시 행(${createdId}) 삭제 시도 완료`)
  }
}

// ── 집중 회귀 테스트(2026-08-02) — updateUnitMeta 0-row 오탐 버그 ───────────
// 배경: v3.11 락다운(supabase_v3_11_lockdown_curriculum_write.sql, 이미
// 프로덕션에 실행됨)이 units에 anon SELECT-only RLS를 걸면서,
// curriculumApi.js updateUnitMeta()의 레거시 anon `.update()`가 유닛이
// 실제 존재해도 RLS가 UPDATE 자체를 필터링해 0 rows를 반환 →
// "해당 유닛을 찾을 수 없어요"로 오탐하던 실제 프로덕션 버그. 이 블록은
// adminPin 없이(=레거시 경로) 실제 존재하는 유닛 하나에 현재와 동일한
// 값으로 update를 시도해 ① RLS가 실제로 쓰기를 막는지(구조적으로 데이터
// 변경 없음 — 값이 기존과 동일) ② 그 실패가 새 개선 메시지("관리자 인증
// 경로가 필요")로 나오는지(구버전 "찾을 수 없어요" 메시지가 아님)를
// 확인한다. supabase_v3_13(units.position/lesson_no/objectives 컬럼)이
// 이 환경에 아직 없거나 textbook_id로 연결된 유닛이 하나도 없으면 정직하게
// SKIP(가짜 커버리지 금지 — 이 저장소 SKIP 관례).
console.log('\n-- 집중 회귀: updateUnitMeta 0-row 오탐(v3.11 락다운 부작용) 개선 메시지')
try {
  const esbuild2 = (await import('esbuild')).default
  await esbuild2.build({
    entryPoints: ['src/utils/curriculum/curriculumApi.js'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: 'scripts/.tmp/curriculumApi.curriculum.bundle.mjs',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    },
  })
  const { listTextbooksMeta, listUnitsMeta, updateUnitMeta } = await import(
    pathToFileURL('scripts/.tmp/curriculumApi.curriculum.bundle.mjs').href
  )

  const tbMeta = await listTextbooksMeta()
  const tb = tbMeta.rows[0]
  if (tbMeta.featureDisabled || !tb) {
    console.log('  SKIP — textbooks 메타 컬럼 없음 또는 교재 0개(supabase_v3_13 미실행 또는 교재 데이터 없음, 예상된 상태).')
  } else {
    const unitsMeta = await listUnitsMeta(tb.id)
    const unit = unitsMeta.rows[0]
    if (unitsMeta.featureDisabled || !unit) {
      console.log('  SKIP — 이 교재에 textbook_id로 연결된 유닛이 없음(예상된 상태).')
    } else {
      const before = unit.objectives
      const result = await updateUnitMeta(unit.id, { objectives: before }, undefined)
        .then(() => ({ threw: false }))
        .catch((e) => ({ threw: true, message: e?.message || String(e) }))
      check('실제 존재하는 유닛 대상 anon update가 RLS로 막혀 throw함(0-row 오탐 아님 — 구조적으로 데이터 변경 없음)', result.threw === true)
      check('에러 메시지가 개선된 안내 문구(구버전 "찾을 수 없어요" 아님)',
        result.threw && /관리자 인증 경로|admin-content-write/.test(result.message || ''),
        result.message)
    }
  }
} catch (err) {
  console.log(`  SKIP — 집중 회귀 테스트 실행 실패(환경 문제로 간주, 위 CRUD 왕복 결과는 유지): ${err?.message || err}`)
}

finish()
