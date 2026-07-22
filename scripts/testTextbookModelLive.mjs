// v3.1 교재 도메인 모델 LIVE 검증(2026-07-22) — 반 → 교재 → 유닛 → 단어.
// supabase_v3_1_textbooks.sql 실행 "후"에 돌리는 검증. 실행 전이면 전부
// 스킵하고 명확히 안내(테이블 부재 감지 — 실패로 치지 않음).
//
// 운영자 요구 테스트 매핑:
//   1 반1교재(기존 반 자동 동작)  2 반多교재(연결)  3 교재 재사용(타 반 연결)
//   4 김기택→천재→김기택 전환      5 교재별 현재 유닛 분리
//   6 교재별 진도 분리(유닛 위치)  7 재조회(로그아웃/인) 영속
//   8 기존 학습 이력 무변경       9 업로드(반+교재+유닛) — 컨테이너=교재 확인
//  10 교차 교재 단어 누수 없음
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testTextbookModelLive.mjs
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const restGet = async (p) => (await fetch(`${BASE}/rest/v1/${p}`, { headers: H })).json()

const lib = await import(pathToFileURL(process.env.WORDLIB_BUNDLE).href)
const {
  initWordLibrary, refreshStudents, refreshTextbooks, isTextbookMode,
  getAllTextbooks, getClassTextbooks, getTextbookUnits, getStudentPrimaryTextbook,
  getClassNames, getClassIdByName, addStudent, getStudentClassId, getStudentUnitId,
  getStudentClassAssignments, setPrimaryTextbook, linkTextbookToClass,
  getStudentWords, getStudentClass,
} = lib
await initWordLibrary()

if (!isTextbookMode()) {
  console.log('SKIP — textbooks/class_textbooks 테이블 없음 또는 백필 전 (supabase_v3_1_textbooks.sql 미실행). 실행 후 다시 돌리세요.')
  process.exit(0)
}

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}
const wordIdSet = (ws) => new Set(ws.map((w) => w.dbId || w.id))
const disjoint = (a, b) => [...a].every((x) => !b.has(x))

// 교재 인벤토리 + 리뷰 보고(출판사 미분류)
const tbs = getAllTextbooks()
console.log(`교재 ${tbs.length}개 로드:`)
for (const t of tbs) console.log(`  - "${t.name}" 출판사=${t.publisherName ?? 'NULL(수동 분류 필요)'}`)

// 시나리오 반/교재: 사람 반 = "중2 YMB 박준원", 교재 = 김기택/천재
const HUMAN = '중2 YMB 박준원'
const humanId = getClassIdByName(HUMAN)
const tbKim = tbs.find((t) => t.name.includes('김기택'))
const tbChun = tbs.find((t) => t.name.includes('천재'))
if (!humanId || !tbKim || !tbChun) { console.log('SKIP — 시나리오 반/교재를 찾을 수 없음'); process.exit(0) }

// ── 2/3) 반多교재 + 교재 재사용: 박준원 반에 두 교재 연결(멱등) ──
console.log('\n── 2/3) 사람 반에 교재 연결(재사용 — 단어 중복 없음)')
await linkTextbookToClass(humanId, tbKim.id, 1)
await linkTextbookToClass(humanId, tbChun.id, 2)
const linked = getClassTextbooks(humanId)
check('박준원 반에 교재 3개(자기 것+김기택+천재)', linked.length === 3, linked.map((t) => t.name))
check('김기택 단어는 복제되지 않고 원본 컨테이너 그대로(교재 재사용)', getTextbookUnits(tbKim.id).length === 5)

// ── 1) 반1교재 기존 동작: 연결 안 한 반은 자동 교재 1개 ──
const solo = getClassNames().find((n) => n === 'Presentation 6 -2026')
check('1교재 반은 선택지 1개(선택기 비렌더 = 기존 화면 변화 0)', getClassTextbooks(getClassIdByName(solo)).length === 1)

// ── "송" 픽스처: 박준원 반 소속 기존 학생 모양 ──
const NAME = '_QA_Song_TextbookModel_20260722'
const existing = await restGet(`students?name=eq.${encodeURIComponent(NAME)}&select=id`)
const unitsPJ = getTextbookUnits(linked.find((t) => t.ownerClassId === humanId)?.id || '')
const song = existing.length ? existing[0].id : await addStudent(NAME, HUMAN, unitsPJ[0]?.name)
await getStudentClassAssignments(song) // 상태 캐시 워밍
const beforeProgress = await restGet(`students?id=eq.${song}&select=class_id,current_unit_id,unit_name`)

// ── 4/5/6) 김기택 → 천재 → 김기택 전환 + 교재별 유닛/진도 분리 ──
console.log('\n── 4/5/6) 송: 김기택→천재→김기택 (반 불변 + 유닛 분리)')
await setPrimaryTextbook(song, tbKim.id)
check('김기택 전환 후에도 사람 반은 박준원 그대로(반 불변!)', getStudentClassId(song) === humanId)
const kimUnit1 = getStudentUnitId(song)
const kimWords = getStudentWords(song)
check('김기택 유닛이 김기택 교재 소속', getTextbookUnits(tbKim.id).some((u) => u.id === kimUnit1))
check('김기택 단어 로드됨', kimWords.length > 0)

await setPrimaryTextbook(song, tbChun.id)
check('천재 전환 후에도 사람 반 박준원 그대로', getStudentClassId(song) === humanId)
const chunUnit = getStudentUnitId(song)
const chunWords = getStudentWords(song)
check('천재 유닛은 천재 교재 소속(김기택 유닛과 다름 — 유닛 분리)', getTextbookUnits(tbChun.id).some((u) => u.id === chunUnit) && chunUnit !== kimUnit1)
check('천재 단어 로드됨', chunWords.length > 0)
// 10) 교차 누수
check('김기택/천재 단어 집합 서로소(누수 없음)', disjoint(wordIdSet(kimWords), wordIdSet(chunWords)))

await setPrimaryTextbook(song, tbKim.id)
check('김기택 복귀: 유닛 정확히 복원(교재별 진도 보존)', getStudentUnitId(song) === kimUnit1)

// ── 7) 재조회 영속(로그아웃/로그인 상당 — 캐시 전체 재로드) ──
console.log('\n── 7) 재조회 영속')
await refreshStudents(); await refreshTextbooks()
const list = await getStudentClassAssignments(song)
check('상태 행에 두 교재 모두 존재 + primary=김기택 유지',
  list.some((a) => a.textbookId === tbKim.id && a.isPrimary) && list.some((a) => a.textbookId === tbChun.id))
check('재조회 후에도 반=박준원', getStudentClass(song) === HUMAN)

// ── 8) 기존 학습 이력/계정 무변경 ──
console.log('\n── 8) 무손실')
const after = await restGet(`students?id=eq.${song}&select=class_id,unit_name`)
check('class_id 불변(전환이 반을 절대 안 바꿈)', after[0].class_id === beforeProgress[0].class_id)
check('unit_name(레거시 필드) 불변', after[0].unit_name === beforeProgress[0].unit_name)

// ── 9) 업로드 축 — 컨테이너 반 = 교재(자동 연결) 확인 ──
check('업로드 대상 컨테이너마다 교재 정체성 존재(반+교재+유닛 축 성립)',
  tbs.every((t) => !t.ownerClassId || getClassTextbooks(t.ownerClassId).some((x) => x.id === t.id)))

console.log(`\n=== ${failures === 0 ? '전부 PASS' : `FAIL ${failures}건`} ===`)
console.log(`픽스처: ${NAME} (운영자 검토용으로 남김)`)
process.exit(failures === 0 ? 0 : 1)
