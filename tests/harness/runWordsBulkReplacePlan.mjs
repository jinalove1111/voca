// tests/harness/runWordsBulkReplacePlan.mjs — P0 데이터 손실 회귀 하네스
// (2026-08-04, word_status FK 보존).
//
// ── 배경(재조사 없이 확정된 버그, 이미 증거로 확인됨) ─────────────────────
// word_status.word_id는 슬러그가 아니라 words.id UUID 그 자체를 참조하고
// `on delete cascade`가 걸려 있다(supabase_v1_5_word_status.sql:33-35,
// src/utils/wordLibrary.js setWordStatus가 wordDbId로 저장). 그런데 예전
// setClassWords()/handleWordsBulkReplace()는 유닛을 저장할 때마다 그 유닛의
// words를 전부 delete()한 뒤 insert()했다 — 새로 insert된 행은 매번 새
// gen_random_uuid()를 받으므로, 교사가 유닛에 단어를 "하나만 추가"해도
// 그 유닛 전체 학생의 "알아요/모르겠어요/mastered" 기록이 CASCADE로 통째로
// 사라졌다(실측: "중2 YMB 박준원" Unit 5 — 단어 40개에 word_status 174행).
//
// ── 이 하네스가 검증하는 것 ────────────────────────────────────────────
// src/utils/wordLibrary.js가 export하는 순수 함수 planWordsBulkReplace(
// existingRows, newWords)가:
//   1) 겹치는 단어(word 텍스트, 대소문자 무시)는 기존 id를 보존한 채
//      UPDATE 계획에 들어간다(→ word_status FK가 안 끊긴다).
//   2) 새 단어만 INSERT 계획에 들어간다.
//   3) 새 목록에서 빠진 단어만 DELETE 계획에 들어간다(정당한 삭제).
//   4) carry-forward 대상 필드(word_audio_url/example_audio_url/
//      example_text/memory_tip/example_translation)는 기존 값이 있으면
//      새 업로드가 빈 값이어도 덮어쓰지 않는다.
//   5) position은 새 목록 순서를 그대로 반영한다.
//   6) 같은 unit 안에 이미 중복 word(대소문자 무시) 행이 있으면, 매칭에는
//      처음 만난 행만 쓰고 나머지 중복은 DELETE 계획으로 보낸다.
//   7) 새 목록 안에 같은 word가 두 번 나오는 방어적 케이스에서도 같은
//      기존 id를 두 번 UPDATE하지 않는다(두 번째부터는 INSERT).
//   8) [배포 순서 안전판, 2026-08-04 코디네이터 지시로 추가] wordLibrary.js
//      가 export하는 buildAdminBulkReplaceRows(existingRows, newWords)가
//      admin-content-write words.bulk_replace로 보낼 각 행에 옛(현재
//      프로덕션에 배포돼 있을 수 있는) handleWordsBulkReplace가 그대로
//      읽는 5개 컬럼(word_audio_url/example_audio_url/example_text/
//      memory_tip/example_translation)을 전부 포함시킨다 — Vercel(클라
//      이언트)과 Supabase Edge Function(admin-content-write)은 독립적으로
//      배포되고 그 순서/간격은 운영자 손에 달려 있어서(CLAUDE.md 규칙 9와
//      동일 원칙), 클라이언트가 먼저 나가고 서버가 아직 옛 코드인 배포
//      간격 동안 이 5개 컬럼이 빠진 얇은 payload를 보내면 그 유닛 전체의
//      오디오·예문·번역·암기팁이 전부 null로 insert된다 — 지금 고치는
//      word_status 버그보다 더 나쁜 사고. 이 단언은 나중에 누가 다시
//      payload를 줄이면(예: "서버가 이제 다시 계산하니 필요 없다"고
//      오판하고) 바로 잡아내기 위한 것이다.
//
// 비교 대상으로, "고쳐지기 전 실제 운영 코드가 하던 방식"(유닛 전체
// delete 후 새 목록 전체를 새 id로 insert, 기존 id는 절대 재사용하지
// 않음)을 이 파일 안에 그대로 재현한 oldDeleteThenInsertAllPlan도 함께
// 두고, "그 방식이었다면 겹치는 단어의 id가 하나도 보존되지 않았을 것"을
// 대조 증거로 고정한다(§ 1단계 회귀 재현 — 수정 전에는 이 파일의
// planWordsBulkReplace import/behavior 단언이 FAIL하고, oldDeleteThenInsertAllPlan
// 단언만 PASS했다. 실제 FAIL 로그는 handoff/구현 보고서에 인용).
//
// ── 네트워크 0, 라이브 DB 변경 0 ───────────────────────────────────────
// planWordsBulkReplace는 순수 함수(입력 -> {updates,inserts,deleteIds}
// 계획 객체 반환)라 실제 Supabase 호출이 전혀 없다. wordLibrary.js는
// 모듈 최상단에서 './supabaseClient'(import.meta.env.VITE_SUPABASE_URL을
// 모듈 평가 시점에 읽는 Vite 전용 문법)를 import해서 plain Node가 파일을
// 직접 import하면 즉시 크래시한다 — scripts/buildWordLibBundle.mjs와 동일
// 관례로 esbuild 인메모리 번들 + import.meta.env 치환을 이 파일 안에서
// 직접 수행한다(더미 값 사용 — 이 하네스는 실제 Supabase 자격증명이 전혀
// 필요 없다, 실제 네트워크 함수를 한 번도 호출하지 않기 때문).
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'

mkdirSync('scripts/.tmp', { recursive: true })
const OUTFILE = 'scripts/.tmp/wordLibrary.bulkReplacePlan.bundle.mjs'
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: OUTFILE,
  define: {
    // 더미 값 — createClient(url,key)는 생성 시점에 네트워크 호출을 하지
    // 않으므로(지연 평가) 실제 자격증명이 전혀 필요 없다. 이 하네스는
    // planWordsBulkReplace(순수 함수)만 호출하고 supabase 객체의 메서드는
    // 절대 호출하지 않는다.
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://localhost.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('dummy-anon-key-not-used'),
  },
})

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:words-bulk-replace-plan] P0 — word_status FK 보존(유닛 재저장 시 id 유지) ===')

// ── 대조군: 고쳐지기 전 실제 운영 코드가 하던 방식(유닛 전체 delete 후
// 새 목록 전체를 새 id로 insert) — planWordsBulkReplace와 나란히 두고
// "이 방식이었다면 겹치는 단어의 id가 하나도 보존되지 않았을 것"을 증명하는
// 용도. wordLibrary.js의 실제 소스가 아니라(그 코드는 이제 교체됨) 교체되기
// 전 동작을 그대로 옮겨 적은 순수 함수 — planWordsBulkReplace 도입 이전
// handleWordsBulkReplace/setClassWords가 정확히 이렇게 동작했다(§ 위 헤더
// 인용, admin-content-write/index.ts git 이력의 delete-then-insert 참고).
function oldDeleteThenInsertAllPlan(existingRows, newWords) {
  const existing = Array.isArray(existingRows) ? existingRows : []
  const words = Array.isArray(newWords) ? newWords : []
  return {
    updates: [], // 옛 방식은 UPDATE라는 개념 자체가 없었다 — 항상 전부 delete+insert.
    inserts: words.map((w, i) => ({ word: w.word, meaning: w.meaning, position: i })),
    deleteIds: existing.map((r) => r.id),
  }
}

console.log('\n-- 0) 대조군: 옛 delete-then-insert-all 방식은 겹치는 단어라도 id를 절대 보존하지 않음')
{
  const existingRows = [
    { id: 'id-apple', word: 'apple', word_audio_url: 'a.mp3', example_audio_url: null, example_text: 'I eat an apple.', memory_tip: 'a-apple', example_translation: '나는 사과를 먹는다.' },
    { id: 'id-banana', word: 'banana', word_audio_url: 'b.mp3', example_audio_url: null, example_text: null, memory_tip: null, example_translation: null },
  ]
  const newWords = [{ word: 'apple', meaning: '사과' }, { word: 'banana', meaning: '바나나' }, { word: 'cherry', meaning: '체리' }]
  const oldPlan = oldDeleteThenInsertAllPlan(existingRows, newWords)
  check('옛 방식: updates가 항상 빈 배열(UPDATE 개념 없음)', oldPlan.updates.length === 0)
  check('옛 방식: apple/banana가 겹치는데도 inserts에 id가 하나도 없음(전부 새 UUID를 받게 됨)',
    oldPlan.inserts.every((r) => !('id' in r)))
  check('옛 방식: 기존 apple/banana id 둘 다 deleteIds(=CASCADE 삭제 대상)에 포함',
    oldPlan.deleteIds.includes('id-apple') && oldPlan.deleteIds.includes('id-banana'))
  console.log('     (이게 바로 그 버그다 — apple/banana의 word_status가 이 delete로 CASCADE 삭제되고, 재삽입된 새 apple/banana는 새 id라 학생 학습기록과 다시는 연결되지 않는다.)')
}

// ── 본 검증: 새 diff 기반 planWordsBulkReplace ─────────────────────────
// 수정 전(이 함수가 아직 wordLibrary.js에 없던 시점)에는 아래 import가
// `planWordsBulkReplace is not a function`(undefined)로 즉시 실패해 이
// 섹션 전체가 FAIL했다 — § 구현 보고서에 그 실제 실행 로그 인용.
const { planWordsBulkReplace, buildAdminBulkReplaceRows } = await import(pathToFileURL(OUTFILE).href)
check('wordLibrary.js가 planWordsBulkReplace를 함수로 export함(수정 전에는 undefined)',
  typeof planWordsBulkReplace === 'function')
check('wordLibrary.js가 buildAdminBulkReplaceRows를 함수로 export함(배포 순서 안전판)',
  typeof buildAdminBulkReplaceRows === 'function')

console.log('\n-- 1) 겹치는 단어는 UPDATE로 id 보존(핵심 회귀 — 이게 P0 버그의 직접 반증)')
{
  const existingRows = [
    { id: 'id-apple', word: 'apple', word_audio_url: 'a.mp3', example_audio_url: null, example_text: 'I eat an apple.', memory_tip: 'a-apple', example_translation: '나는 사과를 먹는다.' },
    { id: 'id-banana', word: 'banana', word_audio_url: 'b.mp3', example_audio_url: null, example_text: null, memory_tip: null, example_translation: null },
  ]
  const newWords = [{ word: 'apple', meaning: '사과(수정)' }, { word: 'banana', meaning: '바나나' }, { word: 'cherry', meaning: '체리' }]
  const plan = planWordsBulkReplace(existingRows, newWords)

  check('updates에 apple/banana 둘 다 원래 id 그대로 포함',
    plan.updates.some((u) => u.id === 'id-apple' && u.word === 'apple') &&
    plan.updates.some((u) => u.id === 'id-banana' && u.word === 'banana'),
    JSON.stringify(plan.updates))
  check('updates 길이 2(겹치는 단어 수와 일치)', plan.updates.length === 2, `실제: ${plan.updates.length}`)
  check('inserts에는 새 단어 cherry만(id 없음)', plan.inserts.length === 1 && plan.inserts[0].word === 'cherry', JSON.stringify(plan.inserts))
  check('deleteIds가 비어있음(빠진 기존 단어 없음)', plan.deleteIds.length === 0, JSON.stringify(plan.deleteIds))
  check('apple의 meaning은 새 값으로 갱신(항상 새로 덮어씀, carry-forward 대상 아님)',
    plan.updates.find((u) => u.id === 'id-apple')?.meaning === '사과(수정)')
}

console.log('\n-- 2) 새 목록에서 빠진 단어만 DELETE(정당한 삭제, 교사가 실제로 뺀 것)')
{
  const existingRows = [
    { id: 'id-apple', word: 'apple' },
    { id: 'id-banana', word: 'banana' },
    { id: 'id-cherry', word: 'cherry' },
  ]
  const newWords = [{ word: 'apple', meaning: '사과' }]
  const plan = planWordsBulkReplace(existingRows, newWords)
  check('apple만 UPDATE', plan.updates.length === 1 && plan.updates[0].id === 'id-apple')
  check('banana/cherry 둘 다 삭제 대상', plan.deleteIds.includes('id-banana') && plan.deleteIds.includes('id-cherry'), JSON.stringify(plan.deleteIds))
  check('삭제 대상이 정확히 2개(그 이상/이하 아님)', plan.deleteIds.length === 2, `실제: ${plan.deleteIds.length}`)
  check('inserts 없음', plan.inserts.length === 0)
}

console.log('\n-- 3) carry-forward: 기존 값 있으면 새 업로드가 비워도 유지(빈 값으로 덮어쓰지 않음)')
{
  const existingRows = [
    { id: 'id-apple', word: 'apple', word_audio_url: 'a.mp3', example_audio_url: 'ex.mp3', example_text: 'I eat an apple.', memory_tip: 'a-apple', example_translation: '나는 사과를 먹는다.' },
  ]
  // 새 업로드는 word/meaning만 있고 audio/example/memory_tip/translation 정보가 전혀 없음(엑셀 재업로드 시나리오).
  const newWords = [{ word: 'apple', meaning: '사과(새 업로드)' }]
  const plan = planWordsBulkReplace(existingRows, newWords)
  const u = plan.updates[0]
  check('word_audio_url 유지', u.word_audio_url === 'a.mp3')
  check('example_audio_url 유지', u.example_audio_url === 'ex.mp3')
  check('example_text 유지', u.example_text === 'I eat an apple.')
  check('memory_tip 유지(M3a에서 고친 것과 동일 계약 — 이번 수정도 깨면 안 됨)', u.memory_tip === 'a-apple')
  check('example_translation 유지(M3a와 동일 계약)', u.example_translation === '나는 사과를 먹는다.')
}

console.log('\n-- 4) carry-forward: 기존에 없던 예문은 새 업로드의 example로 채움(원본 의미론 그대로)')
{
  const existingRows = [{ id: 'id-apple', word: 'apple', word_audio_url: null, example_audio_url: null, example_text: null, memory_tip: null, example_translation: null }]
  const newWords = [{ word: 'apple', meaning: '사과', example: '  I like apples.  ' }]
  const plan = planWordsBulkReplace(existingRows, newWords)
  check('example_text가 새 example(trim됨)로 채워짐', plan.updates[0].example_text === 'I like apples.', plan.updates[0].example_text)
}

console.log('\n-- 5) position은 새 목록 순서를 그대로 반영')
{
  const existingRows = [{ id: 'id-a', word: 'a' }, { id: 'id-b', word: 'b' }]
  const newWords = [{ word: 'b', meaning: 'ㄴ' }, { word: 'a', meaning: 'ㄱ' }, { word: 'c', meaning: 'ㄷ' }]
  const plan = planWordsBulkReplace(existingRows, newWords)
  check('b(새 순서 0번)의 position=0', plan.updates.find((u) => u.id === 'id-b')?.position === 0)
  check('a(새 순서 1번)의 position=1', plan.updates.find((u) => u.id === 'id-a')?.position === 1)
  check('c(새 순서 2번, 신규)의 position=2', plan.inserts.find((r) => r.word === 'c')?.position === 2)
}

console.log('\n-- 6) 기존 DB에 이미 중복 word(대소문자 무시)가 있으면 첫 행만 매칭, 나머지는 삭제')
{
  const existingRows = [
    { id: 'id-apple-1', word: 'Apple', word_audio_url: 'first.mp3', example_audio_url: null, example_text: null, memory_tip: null, example_translation: null },
    { id: 'id-apple-2', word: 'apple', word_audio_url: 'second.mp3', example_audio_url: null, example_text: null, memory_tip: null, example_translation: null },
  ]
  const newWords = [{ word: 'apple', meaning: '사과' }]
  const plan = planWordsBulkReplace(existingRows, newWords)
  check('updates에 정확히 1개(중복 중 하나만 매칭)', plan.updates.length === 1, `실제: ${plan.updates.length}`)
  check('매칭된 쪽이 먼저 만난 행(id-apple-1)', plan.updates[0].id === 'id-apple-1', plan.updates[0].id)
  check('매칭 안 된 중복(id-apple-2)은 삭제 대상', plan.deleteIds.includes('id-apple-2'), JSON.stringify(plan.deleteIds))
  check('inserts 없음(중복이 신규로 오인되지 않음)', plan.inserts.length === 0)
}

console.log('\n-- 7) 새 목록 안에 같은 word가 두 번 나오는 방어적 케이스 — 같은 기존 id를 두 번 UPDATE하지 않음')
{
  const existingRows = [{ id: 'id-apple', word: 'apple', word_audio_url: 'a.mp3' }]
  const newWords = [{ word: 'apple', meaning: '사과1' }, { word: 'apple', meaning: '사과2(중복, 방어적 케이스)' }]
  const plan = planWordsBulkReplace(existingRows, newWords)
  check('updates에 id-apple이 정확히 한 번만 등장', plan.updates.filter((u) => u.id === 'id-apple').length === 1, JSON.stringify(plan.updates))
  check('첫 번째(사과1)가 UPDATE로 매칭', plan.updates[0]?.meaning === '사과1')
  check('두 번째(사과2)는 신규 INSERT로 처리(id 충돌 회피)', plan.inserts.some((r) => r.meaning === '사과2(중복, 방어적 케이스)'))
  const totalOutputIds = new Set(plan.updates.map((u) => u.id))
  check('출력 전체에서 같은 id로 두 번 UPDATE가 계획되지 않음(무결성)', totalOutputIds.size === plan.updates.length)
}

console.log('\n-- 8) 완전 신규 유닛(기존 행 0개) — 전부 insert, updates/deletes 없음(가장 흔한 케이스, 회귀 없음 확인)')
{
  const plan = planWordsBulkReplace([], [{ word: 'apple', meaning: '사과' }, { word: 'banana', meaning: '바나나' }])
  check('updates 없음', plan.updates.length === 0)
  check('deleteIds 없음', plan.deleteIds.length === 0)
  check('inserts에 2개 전부', plan.inserts.length === 2)
}

console.log('\n-- 9) 새 목록이 완전히 비어있으면(반 전체 비우기) 기존 전부 삭제, insert/update 없음')
{
  const existingRows = [{ id: 'id-a', word: 'a' }, { id: 'id-b', word: 'b' }]
  const plan = planWordsBulkReplace(existingRows, [])
  check('updates 없음', plan.updates.length === 0)
  check('inserts 없음', plan.inserts.length === 0)
  check('기존 전부 삭제 대상(반 비우기 — setClassWords/handleWordsBulkReplace 둘 다 이 경우 별도 빠른 경로로 처리하지만, 순수 함수 자체도 같은 결론을 내야 함)',
    plan.deleteIds.includes('id-a') && plan.deleteIds.includes('id-b') && plan.deleteIds.length === 2)
}

console.log('\n-- 10) 방어: 비배열/undefined 입력에도 크래시 없이 안전한 빈 계획')
{
  const p1 = planWordsBulkReplace(undefined, undefined)
  check('existingRows/newWords 둘 다 undefined -> 크래시 없이 빈 계획', p1.updates.length === 0 && p1.inserts.length === 0 && p1.deleteIds.length === 0)
  const p2 = planWordsBulkReplace(null, [{ word: 'x', meaning: 'y' }])
  check('existingRows가 null이어도 insert만 정상 계획', p2.inserts.length === 1 && p2.updates.length === 0)
}

// ── 11) 배포 순서 안전판(2026-08-04, 코디네이터 지시로 추가) ──────────────
// Vercel(클라이언트)과 Supabase Edge Function(admin-content-write)은
// 독립적으로 배포되고 그 순서/간격은 운영자 손에 달려 있다(CLAUDE.md 규칙
// 9 "코드보다 먼저 실행되든 나중에 실행되든 앱이 깨지지 않아야 한다"와
// 동일 원칙 — SQL뿐 아니라 이 클라이언트/서버 배포 경계에도 적용). 클라
// 이언트가 buildAdminBulkReplaceRows로 만들어 admin-content-write
// words.bulk_replace로 보낼 각 행에는, 아직 옛(현재 프로덕션에 배포돼
// 있을 수 있는) handleWordsBulkReplace가 그대로 읽는 5개 컬럼이 반드시
// 들어있어야 한다 — 하나라도 빠지면 배포 간격 동안 그 컬럼이 전부 null로
// insert되어 그 유닛 전체의 오디오/예문/번역/암기팁이 소실된다(지금 고치는
// word_status 버그보다 더 나쁜 사고). 이 섹션은 나중에 누가 payload를
// 다시 줄이면(예: "서버가 이제 다시 계산하니 필요 없다"고 오판) 바로
// 잡아내기 위한 것이다.
console.log('\n-- 11) 배포 순서 안전판: buildAdminBulkReplaceRows가 옛 서버 호환 컬럼을 전부 포함')
{
  // 옛(현재 배포돼 있을 수 있는) handleWordsBulkReplace가 그대로 읽는 컬럼
  // 목록 — coordinator 지시문의 스니펫(word_audio_url/example_audio_url/
  // example_text) + M3a가 추가한 memory_tip/example_translation(이미
  // 배포됐을 수도, 아직 안 배포됐을 수도 있어 더 엄격한 쪽으로 5개 전부
  // 요구).
  const OLD_SERVER_REQUIRED_COLUMNS = ['word_audio_url', 'example_audio_url', 'example_text', 'memory_tip', 'example_translation']

  const existingRows = [
    { id: 'id-apple', word: 'apple', word_audio_url: 'a.mp3', example_audio_url: 'ex-a.mp3', example_text: 'I eat an apple.', memory_tip: 'a-apple', example_translation: '나는 사과를 먹는다.' },
  ]
  const newWords = [
    { word: 'apple', meaning: '사과(재저장)' }, // 겹치는 단어 — carry-forward 대상
    { word: 'banana', meaning: '바나나', example: 'I like bananas.' }, // 완전 신규 단어
  ]
  const rows = buildAdminBulkReplaceRows(existingRows, newWords)

  check('buildAdminBulkReplaceRows가 새 단어 수만큼 행을 반환(2개)', rows.length === 2, `실제: ${rows.length}`)

  let allColumnsPresent = true
  const missingByWord = []
  for (const row of rows) {
    for (const col of OLD_SERVER_REQUIRED_COLUMNS) {
      if (!Object.prototype.hasOwnProperty.call(row, col)) {
        allColumnsPresent = false
        missingByWord.push(`${row.word}.${col}`)
      }
    }
  }
  check(
    '모든 행이 옛 서버 호환 5개 컬럼(word_audio_url/example_audio_url/example_text/memory_tip/example_translation)을 전부 포함 — 하나라도 빠지면 배포 간격 동안 콘텐츠 소실',
    allColumnsPresent,
    missingByWord.join(', '),
  )
  check('word/meaning/position도 포함(옛 서버의 insertRows 매핑이 그대로 읽음)',
    rows.every((r) => typeof r.word === 'string' && typeof r.meaning === 'string' && Number.isInteger(r.position)))

  const appleRow = rows.find((r) => r.word === 'apple')
  const bananaRow = rows.find((r) => r.word === 'banana')
  check('겹치는 apple 행은 기존 carry-forward 값을 실제로 담고 있음(옛 서버가 그대로 insert해도 오디오/예문/번역/암기팁이 살아남음)',
    appleRow?.word_audio_url === 'a.mp3' && appleRow?.example_audio_url === 'ex-a.mp3' &&
    appleRow?.example_text === 'I eat an apple.' && appleRow?.memory_tip === 'a-apple' && appleRow?.example_translation === '나는 사과를 먹는다.')
  check('신규 banana 행은 audio/translation/tip이 null(과거 값 없음 — 정상), example_text는 admin이 입력한 예문',
    bananaRow?.word_audio_url === null && bananaRow?.example_translation === null && bananaRow?.example_text === 'I like bananas.')
  check('반환된 행에는 클라이언트 쪽 id가 남아있지 않음(옛/새 서버 둘 다 insert payload의 id를 읽지 않음 — 실수로 남아있어도 무해하지만 깨끗하게 제거함을 확인)',
    rows.every((r) => !('id' in r)))
}

console.log('\n-- 12) 배포 순서 안전판: words가 빈 배열이면 buildAdminBulkReplaceRows도 빈 배열(반 비우기 payload 모양 불변)')
{
  const rows = buildAdminBulkReplaceRows([{ id: 'id-a', word: 'a' }], [])
  check('빈 words -> 빈 rows(옛/새 서버 둘 다 rows:[] -> delete-only로 해석)', Array.isArray(rows) && rows.length === 0)
}

console.log('\n-- 13) 코드 레벨: setClassWords의 adminPin 분기가 실제로 buildAdminBulkReplaceRows를 사용함(회귀 방지)')
{
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../src/utils/wordLibrary.js', import.meta.url), 'utf8')
  const fnStart = src.indexOf('export async function setClassWords')
  check('setClassWords 함수를 소스에서 찾음', fnStart !== -1)
  const fnBlock = src.slice(fnStart, fnStart + 2500)
  check('setClassWords의 adminPin 분기가 buildAdminBulkReplaceRows(...)를 호출함(얇은 {word,meaning,example} payload로 되돌아가지 않았는지 확인)',
    /buildAdminBulkReplaceRows\(/.test(fnBlock))
  check('setClassWords가 words.map 직접 호출로 얇은 행을 만들지 않음(word_audio_url 등 carry-forward 없는 회귀 방지)',
    !/words\.map\(\s*\(w\)\s*=>\s*\(\{\s*word:\s*w\.word,\s*meaning:\s*w\.meaning,\s*example:/.test(fnBlock))
}

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  words-bulk-replace-plan — P0 word_status FK 보존(유닛 재저장 시 id 유지) + 배포 순서 안전판 (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  words-bulk-replace-plan — ${failed}건: ${failures.join(', ')}`); process.exit(1)
