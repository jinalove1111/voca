// [1회성 운영 DML — 2026-07-17] 쓰기시험 출제 방향 기본값 변경에 따른 기존
// 반 일괄 전환: spelling_direction='kr2en'(옛 기본값, 아무도 의도적으로 고른
// 적 없음 — 기능이 이날 나옴)인 모든 반을 'mixed'로 UPDATE.
//
// 안전 장치:
//   - 'kr2en'인 행만 대상(eq 필터) — 이후 누군가 의도적으로 고른 en2kr/random
//     등은 절대 건드리지 않음. 재실행해도 kr2en으로 "직접 되돌린" 반을 다시
//     mixed로 바꿔버리므로, 이 스크립트는 전환 당일 1회만 실행할 것.
//   - 전/후 방향별 반 수를 로그로 남김(감사 기록).
//
// 실행: node scripts/opsSetAllClassesMixed.mjs
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const snapshot = async (label) => {
  const r = await fetch(`${BASE}/rest/v1/classes?select=name,spelling_direction`, { headers: H })
  const rows = await r.json()
  const byDir = {}
  for (const c of rows) byDir[c.spelling_direction] = (byDir[c.spelling_direction] || 0) + 1
  console.log(`${label} — 총 ${rows.length}개 반:`, JSON.stringify(byDir))
  for (const c of rows) console.log(`  - ${c.name}: ${c.spelling_direction}`)
  return rows
}

console.log('\n=== 기존 반 spelling_direction 일괄 전환 (kr2en -> mixed) ===')
await snapshot('[전]')

const patch = await fetch(`${BASE}/rest/v1/classes?spelling_direction=eq.kr2en`, {
  method: 'PATCH',
  headers: { ...H, Prefer: 'return=representation' },
  body: JSON.stringify({ spelling_direction: 'mixed' }),
})
if (!patch.ok) {
  console.error('UPDATE 실패:', patch.status, (await patch.text()).slice(0, 300))
  process.exit(1)
}
const updated = await patch.json()
console.log(`\n[전환] ${updated.length}개 반을 mixed로 변경:`, updated.map((c) => c.name).join(', ') || '(없음)')

const after = await snapshot('[후]')
const remaining = after.filter((c) => c.spelling_direction === 'kr2en').length
console.log(remaining === 0 ? '\n완료 ✅ — kr2en 잔여 0' : `\n주의: kr2en 잔여 ${remaining}개`)
