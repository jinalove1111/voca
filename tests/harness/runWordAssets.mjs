// tests/harness/runWordAssets.mjs — Word Asset Library(M2) 순수 로직 하네스.
// runReading.mjs/runAnalytics.mjs와 같은 자기완결형 — src/utils/wordAssets.js는
// 의도적으로 모듈 최상단에 static import가 없어(파일 헤더 주석 참고)
// esbuild 번들 없이 plain Node가 바로 import할 수 있다. 네트워크 함수
// (fetchWordAssetsByWords/upsertWordAsset(s))는 여기서 검증하지 않는다 —
// 순수 로직(mergeWordAsset/mergeWordAssetsIntoWords/wordAssetKey/
// normalizeWordAssetRow/filterWordAssetPayload)과, adminPin 부재 시
// 네트워크 호출 없이 admin_pin_required로 즉시 반환하는 계약만 확인한다.
import { readFileSync } from 'node:fs'
import {
  wordAssetKey,
  normalizeWordAssetRow,
  mergeWordAsset,
  mergeWordAssetsIntoWords,
  WORD_ASSET_WRITABLE_COLUMNS,
  filterWordAssetPayload,
  upsertWordAsset,
  upsertWordAssets,
  AI_FILLABLE_FIELDS,
  AI_GENERATE_MAX_WORDS_PER_RUN,
  selectAiGenerationCandidates,
  buildAiGeneratedAssetPayload,
  generateWordAssetsViaAi,
} from '../../src/utils/wordAssets.js'

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:word-assets] Word Asset Library — 클라이언트 읽기/쓰기 계층(M2) ===')

console.log('\n-- wordAssetKey')
check('trim + 소문자화(공백은 유지, wordSlug와 다름)', wordAssetKey('  Apple Pie  ') === 'apple pie')
check('빈/null/undefined 입력 -> 빈 문자열', wordAssetKey('') === '' && wordAssetKey(null) === '' && wordAssetKey(undefined) === '')
check('숫자 등 비문자열도 문자열화', wordAssetKey(123) === '123')

console.log('\n-- normalizeWordAssetRow')
const rawRow = {
  id: 'a1', word_key: 'apple', sense_key: '', word: 'Apple',
  meaning_primary: '사과', part_of_speech: 'n.', cefr: 'A1', pronunciation_uk: '/ˈæp.əl/',
  example_sentence: 'I ate an apple.', example_translation: '나는 사과를 먹었다.', example_source: 'import',
  difficulty: 2, image_prompt: null, image_url: null, image_status: 'none',
  gesture: null, emoji: '🍎', story_memory: 'apple = 사과',
  base_review_interval_days: 1, tags: 'not-an-array', synonyms: null, antonyms: undefined,
  source: 'import', approval_status: 'draft', pipeline_status: 'pending',
  generated_fields: null, ai_model: null, created_by: null,
  created_at: '2026-08-04T00:00:00Z', updated_at: '2026-08-04T00:00:00Z',
}
const norm = normalizeWordAssetRow(rawRow)
check('snake_case -> camelCase 매핑', norm.wordKey === 'apple' && norm.meaningPrimary === '사과' && norm.storyMemory === 'apple = 사과')
check('배열 컬럼이 배열이 아니면 빈 배열로 방어(tags/synonyms/antonyms)',
  Array.isArray(norm.tags) && norm.tags.length === 0 && Array.isArray(norm.synonyms) && norm.synonyms.length === 0 && Array.isArray(norm.antonyms) && norm.antonyms.length === 0)
check('null 입력 -> null(크래시 없음)', normalizeWordAssetRow(null) === null)

console.log('\n-- mergeWordAsset — 핵심 불변식')
const mappedWithTeacherData = {
  id: 'apple', word: 'apple', meaning: '사과(교사입력)', memoryTip: '교사가 쓴 팁',
  easyExample: 'Teacher example.', exampleText: 'Teacher example.', exampleTranslation: '교사 번역',
}
const asset = normalizeWordAssetRow({
  ...rawRow, meaning_primary: '자산뜻(절대 채점에 안 씀)', story_memory: 'asset story', example_sentence: 'Asset example.', example_translation: 'asset 번역',
})

check('① asset=null/undefined -> 무변경(동일 참조 또는 동등 내용)',
  mergeWordAsset(mappedWithTeacherData, null) === mappedWithTeacherData
  && mergeWordAsset(mappedWithTeacherData, undefined) === mappedWithTeacherData)
check('mappedWord가 falsy면 그대로 반환(크래시 없음)', mergeWordAsset(null, asset) === null && mergeWordAsset(undefined, asset) === undefined)

const mergedWithTeacherData = mergeWordAsset(mappedWithTeacherData, asset)
check('② 교사 meaning은 asset의 meaningPrimary로 절대 덮이지 않음', mergedWithTeacherData.meaning === '사과(교사입력)')
check('meaning은 assetMeaningPrimary라는 별도 필드로만 노출(채점 필드는 원본 유지)',
  mergedWithTeacherData.assetMeaningPrimary === '자산뜻(절대 채점에 안 씀)' && mergedWithTeacherData.meaning === '사과(교사입력)')
check('③-a 기존 memoryTip이 있으면 유지', mergedWithTeacherData.memoryTip === '교사가 쓴 팁')
check('기존 exampleText/exampleTranslation이 있으면 유지', mergedWithTeacherData.exampleText === 'Teacher example.' && mergedWithTeacherData.exampleTranslation === '교사 번역')

const mappedNoTeacherData = {
  id: 'apple', word: 'apple', meaning: '사과(교사입력)', memoryTip: '', easyExample: '', exampleText: null, exampleTranslation: null,
}
const mergedNoTeacherData = mergeWordAsset(mappedNoTeacherData, asset)
check('③-b memoryTip이 비어있으면 asset의 storyMemory로 채워짐', mergedNoTeacherData.memoryTip === 'asset story')
check('exampleText/easyExample이 비어있으면 asset의 exampleSentence로 채워짐',
  mergedNoTeacherData.exampleText === 'Asset example.' && mergedNoTeacherData.easyExample === 'Asset example.')
check('exampleTranslation이 비어있으면 asset 값으로 채워짐', mergedNoTeacherData.exampleTranslation === 'asset 번역')
check('meaning은 이 경우에도 asset으로 채워지지 않음(원본 그대로)', mergedNoTeacherData.meaning === '사과(교사입력)')

check('④ 신규 필드(cefr 등)가 추가됨',
  mergedWithTeacherData.cefr === 'A1' && mergedWithTeacherData.partOfSpeech === 'n.' && mergedWithTeacherData.emoji === '🍎'
  && mergedWithTeacherData.pronunciationUk === '/ˈæp.əl/' && mergedWithTeacherData.assetDifficulty === 2
  && mergedWithTeacherData.baseReviewIntervalDays === 1 && mergedWithTeacherData.assetApprovalStatus === 'draft'
  && Array.isArray(mergedWithTeacherData.tags) && Array.isArray(mergedWithTeacherData.synonyms) && Array.isArray(mergedWithTeacherData.antonyms))
check('원본 mappedWord 객체는 변경되지 않음(불변)', mappedWithTeacherData.cefr === undefined)

console.log('\n-- mergeWordAssetsIntoWords')
const words = [mappedWithTeacherData, mappedNoTeacherData]
check('⑤ 빈 assetMap이면 배열 참조가 동일(새 배열 생성 없음)',
  mergeWordAssetsIntoWords(words, new Map()) === words && mergeWordAssetsIntoWords(words, null) === words)
const assetMap = new Map([['apple', asset]])
const mergedWords = mergeWordAssetsIntoWords(words, assetMap)
check('assetMap이 있으면 새 배열을 반환(원본 배열과 다른 참조)', mergedWords !== words)
check('각 단어가 word 필드로 정규화 매칭됨(대소문자/공백 무시)', mergedWords[0].cefr === 'A1' && mergedWords[1].cefr === 'A1')
check('비배열 입력은 크래시 없이 그대로 반환', mergeWordAssetsIntoWords(null, assetMap) === null && mergeWordAssetsIntoWords('x', assetMap) === 'x')

console.log('\n-- WORD_ASSET_WRITABLE_COLUMNS / filterWordAssetPayload')
check('화이트리스트에 id/created_at/updated_at이 없음(서버 관리 컬럼 제외)',
  !WORD_ASSET_WRITABLE_COLUMNS.includes('id') && !WORD_ASSET_WRITABLE_COLUMNS.includes('created_at') && !WORD_ASSET_WRITABLE_COLUMNS.includes('updated_at'))
check('화이트리스트에 word_key/sense_key(충돌 키)가 포함됨', WORD_ASSET_WRITABLE_COLUMNS.includes('word_key') && WORD_ASSET_WRITABLE_COLUMNS.includes('sense_key'))
const filtered = filterWordAssetPayload({ id: 'should-drop', word_key: 'apple', sense_key: '', word: 'Apple', meaning_primary: '사과', created_at: 'should-drop', not_a_real_column: 'should-drop' })
check('화이트리스트 밖 키(id/created_at/미지정 컬럼) 제거', !('id' in filtered) && !('created_at' in filtered) && !('not_a_real_column' in filtered))
check('화이트리스트 안 키는 통과', filtered.word_key === 'apple' && filtered.meaning_primary === '사과')
check('null/undefined/비객체 입력 -> 빈 객체(크래시 없음)',
  Object.keys(filterWordAssetPayload(null)).length === 0 && Object.keys(filterWordAssetPayload(undefined)).length === 0 && Object.keys(filterWordAssetPayload('x')).length === 0)

console.log('\n-- upsertWordAsset / upsertWordAssets — adminPin 부재 시 네트워크 호출 없이 구조화된 실패')
const single = await upsertWordAsset({ word_key: 'apple', word: 'Apple' }, undefined)
check('adminPin 없으면 { ok:false, reason: admin_pin_required } (throw 없음)', single.ok === false && single.reason === 'admin_pin_required')
const bulk = await upsertWordAssets([{ word_key: 'apple' }, { word_key: 'banana' }], null)
check('배열 버전도 adminPin 없으면 동일 계약', bulk.ok === false && bulk.reason === 'admin_pin_required')
const singleNoKey = await upsertWordAsset({ meaning_primary: '뜻만 있고 word_key 없음' }, 'fake-pin')
check('adminPin이 있어도 word_key 없으면 invalid_payload(네트워크 호출 전에 거부)', singleNoKey.ok === false && singleNoKey.reason === 'invalid_payload')

console.log('\n-- selectAiGenerationCandidates — P2(AI 생성 배선) "어떤 단어를 요청할지" 결정')
{
  const makeRow = (overrides = {}) => ({
    wordKey: overrides.wordKey || 'apple', senseKey: '', word: overrides.word || 'apple',
    approvalStatus: 'draft', cefr: null, partOfSpeech: null, pronunciationUk: null,
    exampleSentence: null, exampleTranslation: null, source: 'rule', generatedFields: {},
    ...overrides,
  })

  check('AI_FILLABLE_FIELDS는 서버(generate-word-assets) 4필드 + example_translation 5개',
    AI_FILLABLE_FIELDS.length === 5 && AI_FILLABLE_FIELDS.includes('cefr') && AI_FILLABLE_FIELDS.includes('pronunciation_uk')
    && AI_FILLABLE_FIELDS.includes('example_sentence') && AI_FILLABLE_FIELDS.includes('example_translation') && AI_FILLABLE_FIELDS.includes('part_of_speech'))

  const allEmpty = makeRow({ wordKey: 'a1' })
  const oneFilledStillEligible = makeRow({ wordKey: 'a2', cefr: 'A1' }) // cefr만 채워짐 — 나머지 4개 여전히 비어 있음
  const fullyFilled = makeRow({
    wordKey: 'a3', cefr: 'A1', partOfSpeech: 'noun', pronunciationUk: '/x/',
    exampleSentence: 'ex', exampleTranslation: '번역',
  })
  const approvedButEmpty = makeRow({ wordKey: 'a4', approvalStatus: 'approved' })

  const r1 = selectAiGenerationCandidates([allEmpty, oneFilledStillEligible, fullyFilled, approvedButEmpty])
  check('전부 빈 필드인 행은 후보에 포함됨', r1.selected.some((r) => r.wordKey === 'a1'))
  check('일부만 채워진 행도 나머지 필드가 비어있으면 후보에 포함됨', r1.selected.some((r) => r.wordKey === 'a2'))
  check('5개 필드가 모두 채워진 행은 후보에서 제외됨(이미 필드 채움 배제)', !r1.selected.some((r) => r.wordKey === 'a3'))
  check('approval_status=approved인 행은 빈 필드가 있어도 후보에서 제외됨(승인 콘텐츠 보호)', !r1.selected.some((r) => r.wordKey === 'a4'))
  check('eligibleCount는 approved/완전채움 제외 실제 후보 수(2)', r1.eligibleCount === 2)
  check('상한 이하면 remainingCount는 0', r1.remainingCount === 0)

  check('AI_GENERATE_MAX_WORDS_PER_RUN은 50(서버 상한 100보다 보수적으로 낮음)', AI_GENERATE_MAX_WORDS_PER_RUN === 50)

  const manyRows = Array.from({ length: 60 }, (_, i) => makeRow({ wordKey: `w${i}`, word: `w${i}` }))
  const r2 = selectAiGenerationCandidates(manyRows)
  check('60개 후보 중 기본 상한 50개만 selected에 포함(cap-at-50)', r2.selected.length === 50)
  check('나머지 10개는 remainingCount로 정직하게 보고됨', r2.remainingCount === 10)
  check('eligibleCount는 전체 후보 수(60, cap과 무관)', r2.eligibleCount === 60)
  check('selected는 입력 순서 앞에서부터 선택됨(w0~w49)', r2.selected[0].wordKey === 'w0' && r2.selected[49].wordKey === 'w49')

  const r3 = selectAiGenerationCandidates(manyRows, { limit: 5 })
  check('limit 옵션으로 상한을 커스텀 가능', r3.selected.length === 5 && r3.remainingCount === 55)

  check('비배열 입력은 크래시 없이 빈 결과', selectAiGenerationCandidates(null).selected.length === 0 && selectAiGenerationCandidates(undefined).eligibleCount === 0)
  check('null/비객체 행은 안전하게 스킵', selectAiGenerationCandidates([null, undefined, 'x', allEmpty]).eligibleCount === 1)
}

console.log('\n-- buildAiGeneratedAssetPayload — P2(AI 생성 배선) "AI 결과 중 어떤 필드를 저장할지" 결정(덮어쓰기 방지 계약)')
{
  const existingAllEmpty = {
    wordKey: 'apple', senseKey: '', word: 'Apple', approvalStatus: 'draft',
    cefr: null, partOfSpeech: null, pronunciationUk: null, exampleSentence: null, exampleTranslation: null,
    source: 'rule', generatedFields: { difficulty: 'rule' },
  }
  const aiFull = {
    word_key: 'apple', cefr: 'A1', part_of_speech: 'noun', pronunciation_uk: '/ˈæp.əl/',
    example_sentence: 'I ate an apple.', example_translation: '나는 사과를 먹었다.', warnings: [],
  }

  const p1 = buildAiGeneratedAssetPayload(existingAllEmpty, aiFull)
  check('① 전부 빈 상태 + AI 전부 채움 -> 5개 필드 전부 payload에 포함',
    p1 && p1.cefr === 'A1' && p1.part_of_speech === 'noun' && p1.pronunciation_uk === '/ˈæp.əl/'
    && p1.example_sentence === 'I ate an apple.' && p1.example_translation === '나는 사과를 먹었다.')
  check('word_key/sense_key/word는 항상 포함(충돌 키)', p1.word_key === 'apple' && p1.sense_key === '' && p1.word === 'Apple')
  check('generated_fields가 기존 provenance(difficulty:rule)와 병합되고 새 필드는 ai로 기록',
    p1.generated_fields.difficulty === 'rule' && p1.generated_fields.cefr === 'ai' && p1.generated_fields.part_of_speech === 'ai')
  check('기존 source가 비어있지 않으면(rule) source는 payload에 포함되지 않음(덮어쓰지 않음)', !('source' in p1))

  const existingPartiallyFilled = { ...existingAllEmpty, cefr: 'B1', source: null }
  const p2 = buildAiGeneratedAssetPayload(existingPartiallyFilled, aiFull)
  check('② 이미 채워진 필드(cefr)는 AI가 다른 값을 줘도 payload에서 제외됨(덮어쓰기 방지)', !('cefr' in p2))
  check('빈 필드(part_of_speech 등)는 여전히 채워짐', p2.part_of_speech === 'noun')
  check('기존 source가 비어있으면(null) source:"ai"로 채워짐', p2.source === 'ai')

  const aiPartialNull = { word_key: 'apple', cefr: null, part_of_speech: null, pronunciation_uk: null, example_sentence: null, example_translation: null, warnings: ['불확실'] }
  const p3 = buildAiGeneratedAssetPayload(existingAllEmpty, aiPartialNull)
  check('③ AI가 전부 null 반환 -> 채울 게 없어 payload 자체가 null', p3 === null)

  const existingFullyFilled = {
    ...existingAllEmpty, cefr: 'A1', partOfSpeech: 'noun', pronunciationUk: '/x/', exampleSentence: 'ex', exampleTranslation: '번역',
  }
  const p4 = buildAiGeneratedAssetPayload(existingFullyFilled, aiFull)
  check('④ 기존에 5개 필드가 이미 전부 채워져 있으면 AI 결과와 무관하게 payload는 null', p4 === null)

  const approvedExisting = { ...existingAllEmpty, approvalStatus: 'approved' }
  const p5 = buildAiGeneratedAssetPayload(approvedExisting, aiFull)
  check('⑤ approval_status=approved인 행은 AI 결과가 있어도 통째로 null(승인 콘텐츠 보호)', p5 === null)

  check('⑥ existingAsset/aiResult가 없으면 크래시 없이 null', buildAiGeneratedAssetPayload(null, aiFull) === null && buildAiGeneratedAssetPayload(existingAllEmpty, null) === null)

  const aiWithBlankStrings = { word_key: 'apple', cefr: '  ', part_of_speech: null, pronunciation_uk: null, example_sentence: null, example_translation: null, warnings: [] }
  const p6 = buildAiGeneratedAssetPayload(existingAllEmpty, aiWithBlankStrings)
  check('⑦ AI가 공백뿐인 문자열을 주면 빈 값으로 취급(트림 후 제외)', p6 === null)
}

console.log('\n-- generateWordAssetsViaAi — adminPin 부재/빈 입력 시 네트워크 호출 없이 구조화된 실패(throw 없음)')
{
  const noPin = await generateWordAssetsViaAi([{ word: 'apple' }], undefined)
  check('adminPin 없으면 { ok:false, reason: admin_pin_required }', noPin.ok === false && noPin.reason === 'admin_pin_required')
  const emptyWords = await generateWordAssetsViaAi([], 'fake-pin')
  check('adminPin 있어도 words가 비어있으면 invalid_payload(네트워크 호출 전에 거부)', emptyWords.ok === false && emptyWords.reason === 'invalid_payload')
  const junkWords = await generateWordAssetsViaAi([{ notAWord: true }, null, 'x'], 'fake-pin')
  check('word 필드가 없는 항목만 있으면 필터 후 빈 목록으로 판정되어 invalid_payload', junkWords.ok === false && junkWords.reason === 'invalid_payload')
}

console.log('\n-- 코드 레벨(파일 계약)')
const src = readFileSync(new URL('../../src/utils/wordAssets.js', import.meta.url), 'utf8')
check('모듈 최상단에 static import가 없음(plain Node 직접 import 가능 설계)', !/^import /m.test(src))
check('supabaseClient/wordLibrary는 함수 내부에서만 동적 import', src.includes("await import('./supabaseClient')") && src.includes("await import('./wordLibrary')"))
// 문자열 "select('*')"는 주석("select('*') 금지" 안내문)에도 등장하므로
// 실제 호출 패턴(.select('*'))만 정밀 검사 — 주석 오탐 방지.
check('.select(\'*\') 호출 없음(컬럼 명시)', !/\.select\(\s*['"]\*['"]\s*\)/.test(src))
check('Math.random 없음(결정론)', !src.includes('Math.random'))

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  word-assets — Word Asset Library 클라이언트 계층(M2) (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  word-assets — ${failed}건: ${failures.join(', ')}`); process.exit(1)
