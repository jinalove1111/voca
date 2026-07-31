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
} from '../../src/utils/curriculum/curriculumModel.js'

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

// ── reviewCandidate ─────────────────────────────────────────────────────
console.log('\n-- reviewCandidate')
check('정상 후보 → ok:true', reviewCandidate({ targetWord: 'school', englishSentence: 'I go to school.' }).ok === true)
check('필수 필드 누락 후보 → ok:false', reviewCandidate({ targetWord: 'school' }).ok === false)
check('whole-word 불변식 위반 후보 → ok:false', reviewCandidate({ targetWord: 'school', englishSentence: 'I love schools.' }).ok === false)
check('금칙 톤 힌트 감지(사람 검수 필요 표시) → ok:false',
  reviewCandidate({ targetWord: 'school', englishSentence: 'I go to school.', rationale: '너만 못했다' }).ok === false)

// ── generateCandidateExamples — 미구현 계약(네트워크 0) ────────────────────
console.log('\n-- generateCandidateExamples (미구현 계약)')
const genRes = await generateCandidateExamples({ unitId: 'u1' })
check('ok:false, reason: not_implemented, candidates: 빈 배열, throw 없음',
  genRes.ok === false && genRes.reason === 'not_implemented' && Array.isArray(genRes.candidates) && genRes.candidates.length === 0)

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

finish()
