// scripts/dryRunUnitNaming.mjs — unit_naming_20260809 마이그레이션 드라이런
// (2026-08-09 야간 2차). 100% READ-ONLY — 실제 UPDATE 없이 01_precheck의
// 조건, 03_migration의 가드 3개, 04_verify의 기대 결과를 라이브 데이터로
// 시뮬레이션한다. 운영자가 03을 실행하기 전 "지금 실행하면 어떻게 되는가"를
// 언제든 재확인하는 용도.
//
// 실행: node scripts/dryRunUnitNaming.mjs  (.env 필요 — 없으면 SKIP exit 0)
import { readFileSync, existsSync } from 'node:fs'

for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const URL_BASE = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!URL_BASE || !KEY) { console.log('SKIP — env 없음'); process.exit(0) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function getAll(path, params) {
  const out = []
  for (let off = 0; ; off += 1000) {
    const q = new URLSearchParams({ ...params, limit: '1000', offset: String(off) })
    const r = await fetch(`${URL_BASE}/rest/v1/${path}?${q}`, { headers: H })
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// 03_migration.sql의 매핑과 반드시 동일해야 한다(단일 원천은 SQL 파일 —
// 여기 사본이 어긋나면 아래 self-check가 잡는다).
const MAPPING = [
  ['e402499b-e2c7-4c93-a35b-e2b8f3449048', 'Unit1', 'Unit 1'],
  ['5d9db813-3fc9-45fd-8fe5-bc5e369f1eba', 'Unit1', 'Unit 1'],
  ['4488e97a-4ad3-4a44-8560-a45b8746c796', 'Unit1', 'Unit 1'],
  ['407dee3e-7aed-40af-afcb-fa8c7ad8b717', 'Unit10', 'Unit 10'],
  ['adbccbb3-862b-43df-84ba-dde20c2ae186', 'Unit2', 'Unit 2'],
  ['e06226c1-63c8-495c-97d5-c96a3d834d8d', 'Unit2', 'Unit 2'],
  ['052d0326-db84-4ed5-b6a5-17d81c3edd36', 'Unit2', 'Unit 2'],
  ['6ec4b139-6eb1-431b-be67-6f6bb4fc36b4', 'Unit3', 'Unit 3'],
  ['ba173837-7711-407c-bc24-f38e1ac5eba5', 'Unit3', 'Unit 3'],
  ['e74c2247-4ee5-42f9-bb9d-575698e8127a', 'Unit6', 'Unit 6'],
  ['3b4a003d-7b71-4c14-a65f-864d5abf81ba', 'Unit6', 'Unit 6'],
  ['4fe5a398-7352-415c-b92f-572fc2ecfef9', 'Unit6', 'Unit 6'],
  ['e35c4acd-080a-414f-9af9-ad1be7b5dc48', 'Unit7', 'Unit 7'],
  ['a54e1d31-99ea-49dc-b6e5-22e134e2b33d', 'Unit8', 'Unit 8'],
  ['0755e971-a6b2-4a7f-b83f-3b20d9e5ceb4', 'Unit9', 'Unit 9'],
]

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [dry-run] unit_naming_20260809 — 라이브 시뮬레이션 ===')

// self-check: 스크립트 사본 매핑이 03_migration.sql과 문자 그대로 일치하는가
const sqlSrc = readFileSync('sql_migrations/unit_naming_20260809/03_migration.sql', 'utf8')
check('self-check: 이 스크립트의 매핑 15건이 03_migration.sql에 전부 존재',
  MAPPING.every(([id, old, neu]) => sqlSrc.includes(`('${id}', '${old}',`) && sqlSrc.includes(`'${neu}')`)))

const units = await getAll('units', { select: 'id,name,textbook_id', order: 'id' })
const uById = Object.fromEntries(units.map(u => [u.id, u]))

// 가드 1 시뮬레이션: (id, old_name) 15건 일치?
const matched = MAPPING.filter(([id, old]) => uById[id]?.name === old)
const alreadyNew = MAPPING.filter(([id, , neu]) => uById[id]?.name === neu)
if (matched.length === 15) check('가드1: 매핑 15/15 일치 — 지금 실행 가능', true)
else if (alreadyNew.length === 15) check('가드1: 15건 전부 이미 새 이름 — 03 적용 완료 상태(재실행 시 가드가 안전 중단)', true)
else check('가드1: 매핑 상태 혼합 — 03 실행 전 원인 확인 필요', false, `old ${matched.length} / new ${alreadyNew.length} / 기타 ${15 - matched.length - alreadyNew.length}`)

// 가드 2 시뮬레이션: rename 후 교재 내 충돌?
const clashes = []
for (const [id, , neu] of MAPPING) {
  const u = uById[id]
  if (!u) continue
  const clash = units.find(o => o.textbook_id === u.textbook_id && o.id !== id && o.name === neu)
  if (clash) clashes.push(`${neu}@${u.textbook_id?.slice(0, 8)}`)
}
check('가드2: rename 후 교재 내 이름 충돌 0', clashes.length === 0, clashes.join(', '))

// 04_verify 기대 시뮬레이션: 적용 후 공백 없는 UnitN 표기 잔존 0이 되는가
const renamedSet = new Set(MAPPING.map(([id]) => id))
const wouldRemain = units.filter(u => u.textbook_id && /^[Uu]nit[0-9]+$/.test(u.name) && !renamedSet.has(u.id))
check('04 기대: 매핑 밖의 공백 없는 UnitN 표기 0건(적용 후 잔존 없음)', wouldRemain.length === 0,
  wouldRemain.map(u => `${u.name}(${u.id.slice(0, 8)})`).join(', '))

// students.unit_name 동기화 영향 규모(정보성)
const stu = await getAll('students', { select: 'id,unit_name,current_unit_id', order: 'id' })
const affected = stu.filter(s => renamedSet.has(s.current_unit_id))
console.log(`  INFO  unit_name 동기화 대상 학생: ${affected.length}명(문자열만 변경, FK/기록 무접촉)`)
const stringOnly = stu.filter(s => !s.current_unit_id && MAPPING.some(([, old]) => s.unit_name === old))
check('01 check4: 문자열 폴백만으로 old 이름을 쓰는 학생 0명', stringOnly.length === 0, `${stringOnly.length}명`)

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  unit-naming-dry-run (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  unit-naming-dry-run — ${failed}건: ${failures.join(', ')}`)
process.exit(1)
