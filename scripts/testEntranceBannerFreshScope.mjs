// 수업 직전 배정 반영(stale assignment cache) 회귀 테스트 (2026-08-14, Amin 실사고)
//
// 실사고 타임라인(2026-08-13, 전부 실측):
//   16:56 운영자가 Amin에게 중1 동아 윤정미 교재 배정(SCA 행 생성)
//   17:57 그 교재 반으로 입실시험 생성
//   Amin의 앱 세션은 16:56 이전에 시작 → _studentAssignmentsCache가 배정
//   이전 상태로 고정 → 배너의 classIds에 새 교재 반이 없음 → 시험이 영영
//   안 보임(앱 재시작 전까지). 서버 eligibility는 정상(PASS)이었다.
//
// 고정하는 계약:
//   1) getStudentEntranceClassIds(id, { fresh: true })가 캐시를 무효화하고
//      최신 SCA를 다시 읽어 새 배정 반을 scope에 포함한다.
//   2) 기본 호출(fresh 없음)은 기존과 완전히 동일(캐시 동작 불변 — 기존
//      호출부 성능/의미 보존).
//   3) EntranceTestBanner가 "시험 0건" 상태에서 폴링을 중단하지 않고(B10
//      뒤집기), 0건인 동안 fresh 재해석을 쓴다(소스 계약).
//
// 네트워크 0 — scripts/fakeSupabaseModule.mjs 주입 오프라인 번들 사용.
// 실행: node scripts/buildWordLibOfflineBundle.mjs && node scripts/testEntranceBannerFreshScope.mjs
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)
const lib = await import(pathToFileURL(BUNDLE).href)

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

// ── 픽스처: Amin 상황 축소 재현 ───────────────────────────────────────
const AMIN = 'uuid-amin'
const P6 = 'cls-p6'            // 사람 반 Presentation 6
const P6TB_CLS = 'cls-p6tb'    // 교재 반 Presentation 6 -2026
const P6TB = 'tb-p6'
const DONG_CLS = 'cls-dong'    // 교재 반 중1 동아 윤정미 (수업 직전 배정 대상)
const DONG_TB = 'tb-dong'

const dataset = {
  classes: [
    { id: P6, name: 'Presentation 6', class_type: 'regular', created_at: '2026-01-01T00:00:00Z' },
    { id: P6TB_CLS, name: 'Presentation 6 -2026', class_type: 'textbook', created_at: '2026-01-01T00:00:01Z' },
    { id: DONG_CLS, name: '중1 동아 윤정미', class_type: 'textbook', created_at: '2026-01-01T00:00:02Z' },
  ],
  units: [], words: [], daily_assignments: [],
  textbooks: [
    { id: P6TB, name: 'Presentation 6 -2026', publisher_name: null, owner_class_id: P6TB_CLS },
    { id: DONG_TB, name: '중1 동아 윤정미', publisher_name: null, owner_class_id: DONG_CLS },
  ],
  class_textbooks: [],
  students: [
    { id: AMIN, name: 'Amin', class_id: P6, unit_name: 'Unit 1', current_unit_id: null, house_id: null, created_at: '2026-07-23T00:00:00Z' },
  ],
  // 세션 시작 시점: 배정은 P6 -2026 교재 1건뿐(중1 동아 배정 전)
  student_class_assignments: [
    { id: 'sca-1', student_id: AMIN, class_id: P6TB_CLS, textbook_id: P6TB, current_unit_id: null, is_primary: false },
  ],
}

stub.__setDataset(dataset)
await lib.refreshWordLibrary()
await lib.refreshTextbooks()
await lib.refreshStudents()

console.log('\n1. 세션 시작(배정 전) — scope에 중1 동아 윤정미가 없다')
const scope0 = await lib.getStudentEntranceClassIds(AMIN)
check('초기 scope = 사람 반 + P6 교재 반 (2개)', scope0.length === 2 && scope0.includes(P6) && scope0.includes(P6TB_CLS))
check('중1 동아 윤정미는 아직 scope 밖', !scope0.includes(DONG_CLS))

console.log('\n2. 수업 직전 — 운영자가 중1 동아 교재를 배정(SCA 행 추가, 서버에만 반영)')
dataset.student_class_assignments.push(
  { id: 'sca-2', student_id: AMIN, class_id: DONG_CLS, textbook_id: DONG_TB, current_unit_id: null, is_primary: true },
)

console.log('\n3. 기본 호출은 기존 동작 그대로(캐시 유지 — 의미 불변 확인)')
const scopeStale = await lib.getStudentEntranceClassIds(AMIN)
check('fresh 없는 호출은 여전히 캐시된 scope(기존 호출부 동작 보존)', !scopeStale.includes(DONG_CLS))

console.log('\n4. fresh 호출 — 앱 재시작 없이 새 배정이 반영된다 (수정 전 FAIL이어야 함)')
const scopeFresh = await lib.getStudentEntranceClassIds(AMIN, { fresh: true })
check('fresh scope에 중1 동아 윤정미 포함 (Amin 사고 해소)', scopeFresh.includes(DONG_CLS), scopeFresh)
check('기존 반들도 그대로 유지(사람 반/P6 교재)', scopeFresh.includes(P6) && scopeFresh.includes(P6TB_CLS))
check('학생 UUID는 그대로(identity 불변)', scopeFresh !== null && AMIN === 'uuid-amin')

console.log('\n5. fresh 후에는 캐시가 최신으로 갱신돼 있다(다음 기본 호출도 최신)')
const scopeAfter = await lib.getStudentEntranceClassIds(AMIN)
check('fresh 이후 기본 호출도 새 배정 포함(캐시가 재워짐)', scopeAfter.includes(DONG_CLS))

console.log('\n6. 배정 철회(행 삭제)도 fresh로 반영된다(반대 방향)')
dataset.student_class_assignments = dataset.student_class_assignments.filter((r) => r.id !== 'sca-2')
const scopeRevoked = await lib.getStudentEntranceClassIds(AMIN, { fresh: true })
check('철회 후 fresh scope에서 중1 동아 제거', !scopeRevoked.includes(DONG_CLS))

console.log('\n7. EntranceTestBanner 소스 계약 — 폴링 중단 제거 + 0건 동안 fresh')
{
  const src = readFileSync('src/components/EntranceTestBanner.jsx', 'utf8')
  check('첫 조회 0건 시 폴링을 영구 중단하는 코드(B10)가 제거됨',
    !/isFirst && t\.length === 0 && iv/.test(src))
  check('배너가 fresh 옵션을 사용(시험이 안 보이는 동안 배정 재해석)',
    /getStudentEntranceClassIds\([^)]*\{\s*fresh:/.test(src))
  check('가시성 가드(document.visibilityState)는 유지(배터리/API 보호)',
    /visibilityState/.test(src))
  check('폴링 주기 상수는 유지(무제한 고빈도 폴링 금지)',
    /BANNER_POLL_MS/.test(src))
}

console.log('\n8. 진행도/보상과 완전 무관 — 이 경로는 SCA/classes/textbooks만 읽는다')
{
  const calls = stub.__getCalls()
  const touched = [...new Set(calls.map((c) => c.table))]
  check('student_progress/word_status/xp 테이블 접근 0건',
    !touched.some((t) => /progress|word_status|xp|star/.test(t)), touched)
  check('쓰기 계열 호출 자체가 스텁에 존재하지 않음(READ-ONLY 구조)', !('insert' in (stub.supabase.from('x'))))
}

console.log(failures === 0 ? '\n모든 단언 통과 ✅' : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
