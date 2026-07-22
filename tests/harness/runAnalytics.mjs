// tests/harness/runAnalytics.mjs — 익명 관찰 레이어 순수 집계 하네스.
// runDailyRitual.mjs와 같은 자기완결형. 수집(trackEvent)은 I/O라 여기선
// 집계 함수의 수학·결정론·프라이버시만 단언한다.
import { readFileSync } from 'node:fs'
import { EV, computeReturnRates, computeGardenRevisits, computeAvgSessionMinutes, computeFeatureCounts } from '../../src/utils/analyticsMath.js'

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:analytics] 익명 관찰 레이어 — 순수 집계 ===')

const row = (anon, event, day, hour = 12) => ({ anon_id: anon, event, day, created_at: `${day}T${String(hour).padStart(2, '0')}:00:00Z` })
// 픽스처: A는 정원 본 다음날 복귀, B는 안 함
const rows = [
  row('aaaa', EV.gardenOpened, '2026-07-20', 9),
  row('aaaa', EV.appOpened, '2026-07-21', 9),
  row('aaaa', EV.gardenOpened, '2026-07-21', 10),
  row('bbbb', EV.gardenOpened, '2026-07-20'),
  row('aaaa', EV.paulTownOpened, '2026-07-20', 15),
]

console.log('\n-- 복귀율/재방문')
const rates = computeReturnRates(rows)
const garden = rates.find((r) => r.event === EV.gardenOpened)
check('정원 익일 복귀율 = 열람 3회 중 1회(7/20 A만 다음날 복귀, 7/21 두 건은 미복귀)', garden.opens === 3 && Math.abs(garden.d1 - 1 / 3) < 1e-9, JSON.stringify(garden))
check('결과가 익일 복귀율 내림차순 정렬', rates.every((r, i) => i === 0 || rates[i - 1].d1 >= r.d1))
check('열람 0회 기능은 목록에 없음(0으로 지어내지 않음)', !rates.some((r) => r.event === EV.bookshelfOpened))
const rev = computeGardenRevisits(rows)
check('정원 1일 재방문(7/20→7/21 A만) = 1/3', Math.abs(rev.d1 - 1 / 3) < 1e-9)
check('결정론(같은 입력 → 같은 출력)', JSON.stringify(computeReturnRates(rows)) === JSON.stringify(rates))

console.log('\n-- 세션/카운트/경계')
const avg = computeAvgSessionMinutes(rows)
check('세션 근사: (360+60+1)/3분 — 단일 이벤트 날은 1분 바닥', avg > 0 && Math.abs(avg - (360 + 60 + 1) / 3) < 1e-6, String(avg))
check('빈 입력 → 0/빈 결과, 크래시 없음', computeAvgSessionMinutes([]) === 0 && computeReturnRates([]).length === 0 && Object.keys(computeFeatureCounts([])).length === 0)
check('카운트 집계 정확', computeFeatureCounts(rows)[EV.gardenOpened] === 3)

console.log('\n-- 프라이버시(코드 레벨)')
const src = readFileSync(new URL('../../src/utils/productEvents.js', import.meta.url), 'utf8')
const mathSrc = readFileSync(new URL('../../src/utils/analyticsMath.js', import.meta.url), 'utf8')
check('insert payload에 이름/원본 id 필드 없음(anon_id/event만)', /insert\(\{ anon_id: anonId, event \}\)/.test(src))
check('sha256 단방향 해시 사용 + 16hex 절단', src.includes("digest('SHA-256'") && src.includes('.slice(0, 16)'))
check('Math.random 없음(결정론)', !src.includes('Math.random') && !mathSrc.includes('Math.random'))
check('집계 모듈은 import 0 순수', !/^import /m.test(mathSrc))

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  analytics — 익명 관찰 집계 (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  analytics — ${failed}건: ${failures.join(', ')}`); process.exit(1)
