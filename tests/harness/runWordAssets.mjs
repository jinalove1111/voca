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
