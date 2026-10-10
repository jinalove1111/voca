// scripts/testQaGate.mjs — QA 테스트 전용 화면 게이트 정적 회귀(2026-10-04, 205차).
// qaTestAccounts.js 동작 + App.jsx 소스 배선 + Pilot A 허용목록 불변. 네트워크 0.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n')
let passed = 0
const failures = []
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

const PILOT_A = '1c585815-98c8-461e-81fc-0187ffdcfa1c'
const FIXTURE = 'e2e00000-0000-4000-8000-00000000a001'
const QA_IDS = [
  '335a9560-d1f1-4628-bd8d-26bcaa8eaee7',
  'a63923a1-473d-4ba1-bca6-6b8685848cd3',
  '738443f3-2676-4b89-9f17-cc7f22aa993c',
  FIXTURE,
]

const mod = await import(pathToFileURL(path.join(ROOT, 'src/config/qaTestAccounts.js')).href)
check('Set이 정확히 4개 id', mod.QA_TEST_STUDENT_IDS.size === 4 && QA_IDS.every((i) => mod.QA_TEST_STUDENT_IDS.has(i)))
check('QA id 전부 true', QA_IDS.every((i) => mod.isQaTestStudent(i)))
check('대소문자 무시', mod.isQaTestStudent(QA_IDS[0].toUpperCase()))
check('비문자열 false', [undefined, null, 1, {}, []].every((v) => mod.isQaTestStudent(v) === false))
check('Pilot A id false', mod.isQaTestStudent(PILOT_A) === false)
check('이름 "cookie" false(이름 매칭 없음)', mod.isQaTestStudent('cookie') === false)

const app = read('src/App.jsx')
const lineOf = (re) => app.split('\n').find((l) => re.test(l)) || ''
check('App.jsx가 isQaTestStudent import', /import \{ isQaTestStudent, isTownWorldTester \} from '\.\/config\/qaTestAccounts'/.test(app))
check('studentHomeEnabled가 qaTestStudent와 AND', /const studentHomeEnabled =.*&& qaTestStudent/.test(lineOf(/const studentHomeEnabled =/)))
check('초기 screen useState가 isQaTestStudent(studentId) 사용', /const \[screen, setScreen\].*isQaTestStudent\(studentId\)/.test(lineOf(/const \[screen, setScreen\]/)))
check('paulTown2_5dEnabled가 qaTestStudent와 AND', /&& qaTestStudent/.test(lineOf(/const paulTown2_5dEnabled =/)))
check('QA_ONLY_SCREENS 7개(245차 townWorld는 별도 가드로 분리; 224차 unit, 2026-10-10 grammarCourses·grammarVillage 추가)', /const QA_ONLY_SCREENS = \['home', 'speaking', 'growth', 'proto25d', 'unit', 'grammarCourses', 'grammarVillage'\]/.test(app))
check('직접 진입 차단 effect', /useEffect\(\(\) => \{ if \(!qaTestStudent && QA_ONLY_SCREENS\.includes\(screen\)\) setScreen\('dashboard'\) \}, \[qaTestStudent, screen\]\)/.test(app))
for (const k of ['home', 'speaking', 'growth']) {
  check(`screen === '${k}' 렌더가 qaTestStudent로 게이팅`, new RegExp(`qaTestStudent && screen === '${k}' &&`).test(app))
}
check('App.jsx에 이름 기반 게이팅 없음', !/TEST_ACCOUNT_NAMES|isTestAccountStudent/.test(app))

const pilot = read('src/config/pilotTown.js')
const pilotIds = [...pilot.matchAll(/'([0-9a-f-]{36})'/g)].map((m) => m[1])
check('pilotTown.js Pilot A id 5개 그대로', pilotIds.length === 5 && pilotIds[0] === PILOT_A
  && pilotIds.slice(1).join() === ['9f115c32-6a4b-4659-a026-f9905a5cc2e2', 'e0fe0f50-8927-44d9-9331-e454620524d9', 'd4bd8d3d-afda-47ad-9e5e-a12c8376c892', '3cff7b25-02cd-45a0-8488-a7b84a6d8a58'].join())

console.log(`\n${passed} passed, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)
