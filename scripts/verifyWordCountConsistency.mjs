// 단어 수 전수 일치 검증 (2026-08-14) — DB vs 앱 적재 vs UI 소스 3중 대조
//
// 배경(실사고 2건): ①words 1000행 절단으로 24개 유닛에서 뒤쪽 단어가 앱에서
// 조용히 사라짐(전하은 "2개 부족" 제보의 원인) ②getClassWords 임의 폴백.
// 이 검증은 "특정 학생 한 명"이 아니라 **모든 반/교재/유닛**에 대해 세 숫자
// 가 일치하는지 자동 확인한다:
//   DB    = REST 페이지네이션으로 직접 센 진실값
//   APP   = 실제 앱 코드(refreshWordLibrary)가 적재한 수
//   UI    = 학생/관리자 화면이 쓰는 조회 경로(getWordsByUnitId)가 주는 수
// 셋 중 하나라도 다르면 FAIL — "DB 40 / APP 40 / UI 38" 류의 은닉 버그를
// 전 유닛에서 잡는다.
//
// 100% READ-ONLY(SELECT만). .env 없으면 정직한 SKIP(exit 0).
// 실행: npm run verify:word-count  (사전: node scripts/buildWordLibBundle.mjs)
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { execSync } from 'node:child_process'

for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue
  for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const B = process.env.VITE_SUPABASE_URL, K = process.env.VITE_SUPABASE_ANON_KEY
if (!B || !K) { console.log('SKIP — VITE_SUPABASE_URL/ANON_KEY 없음(.env). 라이브 전용.'); process.exit(0) }
const H = { apikey: K, Authorization: `Bearer ${K}` }
const all = async (p) => {
  let out = [], from = 0
  for (;;) {
    const r = await fetch(`${B}/rest/v1/${p}`, { headers: { ...H, Range: `${from}-${from + 999}` } })
    if (!r.ok) throw new Error(`${p} -> ${r.status}`)
    const j = await r.json()
    out = out.concat(j)
    if (j.length < 1000) break
    from += 1000
  }
  return out
}

// DB 진실값(직접 페이지네이션)
const [units, classes, words] = await Promise.all([
  all('units?select=id,class_id,name'),
  all('classes?select=id,name'),
  all('words?select=id,unit_id'),
])
const dbCount = new Map()
for (const w of words) dbCount.set(w.unit_id, (dbCount.get(w.unit_id) || 0) + 1)
const clsById = new Map(classes.map((c) => [c.id, c]))
console.log(`DB 진실값: 반 ${classes.length} / 유닛 ${units.length} / 단어 ${words.length}`)

// 앱 번들(실코드) 적재 — buildWordLibBundle 산출물 필요(하네스가 빌드해 줌)
const BUNDLE = path.resolve(process.env.WORDLIB_BUNDLE || 'scripts/.tmp/wordLibrary.bundle.mjs')
if (!existsSync(BUNDLE)) {
  console.log('번들 없음 — buildWordLibBundle.mjs 실행')
  execSync('node scripts/buildWordLibBundle.mjs', { stdio: 'inherit' })
}
const lib = await import(pathToFileURL(BUNDLE).href)
await lib.refreshWordLibrary()

let failures = 0
let checked = 0
const rows = []
for (const u of units) {
  const db = dbCount.get(u.id) || 0
  // APP: 캐시 트리에 적재된 단어 수 / UI: 화면 조회 경로
  const appUnit = lib.getUnitById(u.id)
  const app = appUnit ? (appUnit.words || []).length : 0
  const ui = (lib.getWordsByUnitId(u.id) || []).length
  checked++
  const ok = db === app && app === ui
  if (!ok) {
    failures++
    console.log(`  FAIL  ${clsById.get(u.class_id)?.name} / "${u.name}"  DB=${db} APP=${app} UI=${ui}`)
  }
  rows.push({ cls: clsById.get(u.class_id)?.name, unit: u.name, db, app, ui })
}

// 합계 대조(절단이 있으면 합계부터 어긋난다)
const totalApp = rows.reduce((n, r) => n + r.app, 0)
console.log(`\n합계: DB ${words.length} / APP ${totalApp}  ${words.length === totalApp ? '(일치)' : '*** 불일치 ***'}`)
if (words.length !== totalApp) failures++

// 이름 경로(getClassWords)도 동일해야 함 — 전하은 케이스의 실제 화면 경로
const HAEUN_UNIT = units.find((u) => clsById.get(u.class_id)?.name === '고1 능률 민병천' && u.name === 'Unit3')
if (HAEUN_UNIT) {
  const byName = lib.getClassWords('고1 능률 민병천', 'Unit3')
  const okH = byName.length === (dbCount.get(HAEUN_UNIT.id) || 0)
  console.log(`전하은 검증점: 민병천 Unit3 이름 경로 = ${byName.length}개 (DB ${dbCount.get(HAEUN_UNIT.id)})  depend on=${byName.some((w) => w.word === 'depend on')} make sense=${byName.some((w) => w.word === 'make sense')}`)
  if (!okH || !byName.some((w) => w.word === 'depend on') || !byName.some((w) => w.word === 'make sense')) failures++
}

console.log(`\n검사 유닛 ${checked}개 / 불일치 ${failures}건`)
console.log(failures === 0 ? '모든 유닛 DB=APP=UI 일치 ✅' : '불일치 발견 ❌')
console.log('※ READ-ONLY — 쓰기 0건.')
process.exit(failures > 0 ? 1 : 0)
