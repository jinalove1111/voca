// scripts/verifyGameP0Baseline.mjs — Game P0 충돌 검증 (P0-3, 2026-08-10)
//
// v2_5 실행·테스트 반 토글 이후, 테스트 계정(Cookie/Paul/Jinaa)의 별/XP/
// 진도가 게임화 UI 점등 때문에 **변형·중복 지급되지 않았는지**를 기준선
// (sql_migrations/v2_5_pilot_20260810/baseline_20260810.json, 2026-08-10
// 점등 전 실측)과 비교한다. 100% READ-ONLY.
//
// 판정 규칙:
//   - total_stars/total_xp/cleared_count: 감소 = FAIL(훼손).
//     증가는 그 계정으로 실제 학습(테스트 조작)을 했을 때만 정상 —
//     "점등만 하고 학습 안 한" 계정은 정확히 동일해야 한다.
//   - xp_ledger 행 수: 감소 = FAIL(append-only 위반).
//   - word_status 행 수: 감소 = FAIL.
// 사용법: node scripts/verifyGameP0Baseline.mjs  (.env 필요)
import { readFileSync, existsSync } from 'node:fs'

for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const URL_BASE = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!URL_BASE || !KEY) { console.log('SKIP — env 없음'); process.exit(0) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const get = async (p, q) => (await fetch(`${URL_BASE}/rest/v1/${p}?` + new URLSearchParams(q), { headers: H })).json()
const count = async (p, q) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${p}?` + new URLSearchParams({ ...q, limit: '1' }), { method: 'HEAD', headers: { ...H, Prefer: 'count=exact' } })
  return Number((r.headers.get('content-range') || '*/0').split('/')[1] || 0)
}

const baseline = JSON.parse(readFileSync('sql_migrations/v2_5_pilot_20260810/baseline_20260810.json', 'utf8'))
let pass = 0, fail = 0
const check = (l, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); c ? pass++ : fail++ }

console.log(`기준선: ${baseline.snapshotAt} (점등 전)\n`)
for (const b of baseline.accounts) {
  const pr = (await get('student_progress', { select: 'total_stars,total_xp,cleared_count,streak', student_id: 'eq.' + b.id }))[0] || {}
  const xp = await count('xp_ledger', { select: 'id', student_id: 'eq.' + b.id })
  const ws = await count('word_status', { select: 'id', student_id: 'eq.' + b.id })
  console.log(`${b.name}: 별 ${b.progress?.total_stars}→${pr.total_stars} | xp_ledger ${b.xpLedgerRows}→${xp} | word_status ${b.wordStatusRows}→${ws}`)
  check(`${b.name} 별/XP/완료 감소 없음(훼손 0)`,
    (pr.total_stars ?? 0) >= (b.progress?.total_stars ?? 0)
    && (pr.total_xp ?? 0) >= (b.progress?.total_xp ?? 0)
    && (pr.cleared_count ?? 0) >= (b.progress?.cleared_count ?? 0))
  check(`${b.name} xp_ledger append-only(감소 없음)`, xp >= b.xpLedgerRows)
  check(`${b.name} word_status 감소 없음`, ws >= b.wordStatusRows)
  const delta = (pr.total_stars ?? 0) - (b.progress?.total_stars ?? 0)
  if (delta > 0) console.log(`  INFO  ${b.name} 별 +${delta} — 이 계정으로 실제 학습했을 때만 정상(중복 지급 의심 시 xp_ledger의 source_event_id로 사유 확인)`)
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`)
process.exit(fail === 0 ? 0 : 1)
