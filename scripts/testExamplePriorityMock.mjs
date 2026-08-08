// scripts/testExamplePriorityMock.mjs — 학생 예문 노출 우선순위 mock 검증
// (2026-08-09 야간 3차). 실제 배포 코드(exampleLibrary.fetchApprovedExamplesForWords)
// 를 esbuild로 번들하고 global fetch를 가로채 canned PostgREST 응답을 주입 —
// **네트워크/DB 접근 0회**로 SOURCE TEXT FIRST 우선순위를 학생 소비 함수
// 레벨에서 검증한다(curriculumExamplesStudentUI 플래그를 프로덕션에서 켜기
// 전에 mock으로 충분히 검증하라는 운영자 지시).
//
// 실행: node scripts/testExamplePriorityMock.mjs (env 불필요 — 전부 mock)
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'

mkdirSync('scripts/.tmp', { recursive: true })
await esbuild.build({
  entryPoints: ['src/utils/curriculum/exampleLibrary.js'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: 'scripts/.tmp/exampleLibrary.prioritymock.bundle.mjs',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://mock.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('mock-key'),
  },
})

let cannedRows = []
globalThis.fetch = async () => new Response(JSON.stringify(cannedRows), {
  status: 200, headers: { 'Content-Type': 'application/json' },
})
const { fetchApprovedExamplesForWords } = await import(
  pathToFileURL('scripts/.tmp/exampleLibrary.prioritymock.bundle.mjs').href
)

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

const base = { target_word: 'prioritycheck', approval_status: 'approved', korean_translation: null }

console.log('\n=== 학생 예문 우선순위(SOURCE TEXT FIRST) — mock ===')
// 1) 같은 유닛: 본문(import, 가장 오래됨) > 교사 > AI(가장 최신) — 최신순을 뒤집는지
cannedRows = [
  { ...base, id: 'ai', source: 'ai', unit_id: 'u1', english_sentence: 'AI prioritycheck.', created_at: '2026-08-09T03:00:00Z' },
  { ...base, id: 'teacher', source: 'teacher', unit_id: 'u1', english_sentence: 'Teacher prioritycheck.', created_at: '2026-08-09T02:00:00Z' },
  { ...base, id: 'import', source: 'import', unit_id: 'u1', english_sentence: 'Textbook prioritycheck.', created_at: '2026-08-09T01:00:00Z' },
]
let map = await fetchApprovedExamplesForWords(['prioritycheck'], { unitId: 'u1' })
check('1순위: 교과서 본문(import)이 최신 AI/교사보다 우선', map.prioritycheck?.id === 'import', map.prioritycheck?.id)

// 2) 본문 없으면 교사
cannedRows = cannedRows.filter((r) => r.id !== 'import')
map = await fetchApprovedExamplesForWords(['prioritycheck'], { unitId: 'u1' })
check('2순위: 본문 없으면 교사 작성', map.prioritycheck?.id === 'teacher', map.prioritycheck?.id)

// 3) 교사도 없으면 승인 AI
cannedRows = cannedRows.filter((r) => r.id !== 'teacher')
map = await fetchApprovedExamplesForWords(['prioritycheck'], { unitId: 'u1' })
check('3순위: 승인된 AI 예문 폴백', map.prioritycheck?.id === 'ai', map.prioritycheck?.id)

// 4) 유닛 일치가 소스보다 지배적(기존 동작 보존)
cannedRows = [
  { ...base, id: 'import-other', source: 'import', unit_id: 'u2', english_sentence: 'Other prioritycheck.', created_at: '2026-08-09T03:00:00Z' },
  { ...base, id: 'ai-this', source: 'ai', unit_id: 'u1', english_sentence: 'This prioritycheck.', created_at: '2026-08-09T01:00:00Z' },
]
map = await fetchApprovedExamplesForWords(['prioritycheck'], { unitId: 'u1' })
check('유닛 일치 우선(다른 유닛의 본문보다 이 유닛의 AI)', map.prioritycheck?.id === 'ai-this', map.prioritycheck?.id)

// 5) 승인 하드코딩 — canned에 draft/pending을 섞어도 데이터 계층 필터는
//    쿼리 레벨(eq approval_status=approved)이라 mock에선 검증 불가 대신,
//    호출 결과가 approved 행만으로 구성됨을 구조로 확인(전 행 approved).
cannedRows = [
  { ...base, id: 'ok', source: 'teacher', unit_id: 'u1', english_sentence: 'OK prioritycheck.', created_at: '2026-08-09T01:00:00Z' },
]
map = await fetchApprovedExamplesForWords(['prioritycheck'], { unitId: 'u1' })
check('반환 행이 존재하고 approvalStatus가 approved로 매핑됨(학생 노출 가드 계약)',
  map.prioritycheck?.approvalStatus === 'approved')

// 6) fetch 실패 시 {} 폴백(학생 화면 무영향 계약)
globalThis.fetch = async () => { throw new Error('network down') }
map = await fetchApprovedExamplesForWords(['prioritycheck'], { unitId: 'u1' })
check('네트워크 실패 → {} 폴백(절대 throw하지 않음)', typeof map === 'object' && Object.keys(map).length === 0)

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  example-priority-mock (${passed}개 단언, 네트워크 0)`); process.exit(0) }
console.log(`  FAIL  example-priority-mock — ${failed}건: ${failures.join(', ')}`)
process.exit(1)
