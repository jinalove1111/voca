// scripts/dryRunBaselineV2.mjs — supabase_v3_48_reward_legacy_baseline_v2.sql
// 드라이런(2026-09-06). READ-ONLY, anon key, GET만 사용 — SQL을 전혀
// 실행하지 않는다(Production WRITE = 0).
//
// ── 왜 서버 reward_ledger/reward_totals를 직접 읽지 않는가 ────────────────
// anon key로는 reward_ledger/reward_totals가 42501(permission denied)로
// 막혀 있다(supabase_v3_36 헤더 — 의도된 최소 권한, service_role 전용).
// 그래서 이 스크립트는 클라이언트 미러(student_progress.progress_data.
// rewardLedger 배열)를 "서버 V1 원장(2026-08-23 이후 실제 지급분)의
// 근사 대리값"으로 사용한다. **이 가정은 근사치이며 정확한 값이 아니다**
// — 실제 v3_48 실행 결과와 다를 수 있다(운영자가 반드시 감안할 것).
//
// ── v1 baseline 가정 ──────────────────────────────────────────────────────
// v1 baseline(supabase_v3_37)은 "2026-08-23 무렵의 total_stars 스냅샷"을
// 이관한 것으로 간주한다(실제 v3_37 실행 시각은 anon key로 조회 불가 —
// reward_migration_log도 service_role 전용이라 이 스크립트가 정확한 실행
// 시각을 알 방법이 없다). 그래서 "2026-08-23 이후 신규로 번 별"만
// student_daily_progress에서 합산해 earned_since로 쓴다.
//
// 실행: node scripts/dryRunBaselineV2.mjs  (.env 없으면 SKIP exit 0)
import { loadSupabaseEnv } from './lib/prodDataLoader.mjs'
import { evaluateBaselineGuards, CANDIDATES_MIN, CANDIDATES_MAX, TOTAL_MIN, TOTAL_MAX, MAX_INDIVIDUAL, PROGRESS_ROWS_MIN, PROGRESS_ROWS_MAX } from './lib/baselineV2Guards.mjs'

const V1_CUTOFF_DATE = '2026-08-23'
const QA_NAME_RE = /^(cookie|paul|jinaa|barry|테스트|test)/i
const PAGE = 1000

async function selectAll(base, headers, table, query) {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const url = `${base}/rest/v1/${table}?${query}&limit=${PAGE}&offset=${offset}`
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`INFRA_ERROR ${table}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

async function main() {
  const supabase = loadSupabaseEnv()
  if (!supabase) {
    console.log('SKIP — .env(VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) 없음')
    process.exit(0)
  }
  const { base, key } = supabase
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  console.log('\n=== [dry-run] supabase_v3_48_reward_legacy_baseline_v2.sql 시뮬레이션 ===')
  console.log('READ-ONLY(anon key, GET만) — SQL을 실행하지 않는다.')
  console.log(`가정: v1 baseline ≈ ${V1_CUTOFF_DATE} 시점 total_stars 스냅샷, 서버 V1 원장 근사치 = progress_data.rewardLedger 미러 배열(정확한 값 아님).\n`)

  const students = await selectAll(base, headers, 'students', 'select=id,name')
  const progress = await selectAll(base, headers, 'student_progress', 'select=student_id,total_stars,progress_data')
  const daily = await selectAll(
    base, headers, 'student_daily_progress',
    `select=student_id,date,stars_earned&date=gte.${V1_CUTOFF_DATE}`,
  )

  // duplicate key 점검 — student_progress.student_id는 이론상 학생당 1행
  // 이어야 한다(pagination 버그/실제 중복 행 여부를 실측으로 확인).
  const progressCountByStudent = new Map()
  for (const row of progress) {
    progressCountByStudent.set(row.student_id, (progressCountByStudent.get(row.student_id) || 0) + 1)
  }
  const duplicateStudentIds = [...progressCountByStudent.entries()].filter(([, n]) => n > 1)

  // student_daily_progress를 학생별로 합산.
  const earnedSinceByStudent = new Map()
  for (const row of daily) {
    const v = Number(row.stars_earned) || 0
    earnedSinceByStudent.set(row.student_id, (earnedSinceByStudent.get(row.student_id) || 0) + v)
  }

  const nameById = new Map(students.map((s) => [s.id, s.name || '']))

  let emptyProgressDataCount = 0
  const rows = []
  for (const p of progress) {
    const name = nameById.get(p.student_id) || ''
    const isQa = QA_NAME_RE.test(name)
    const progressData = p.progress_data
    if (!progressData || typeof progressData !== 'object' || Object.keys(progressData).length === 0) {
      emptyProgressDataCount++
    }
    const ledger = Array.isArray(progressData?.rewardLedger) ? progressData.rewardLedger : []
    const ledgerMirror = ledger.reduce((sum, e) => {
      const v = Number(e?.stars_delta)
      return (Number.isFinite(v) && v >= 0) ? sum + v : sum
    }, 0)
    const earnedSince = earnedSinceByStudent.get(p.student_id) || 0
    const rawDelta = earnedSince - ledgerMirror // 클램프 전(참고용, 음수 가능)
    const deltaEst = Math.max(0, rawDelta)
    const plausibleMax = earnedSince + 50
    const flagged = deltaEst > plausibleMax
    const sumCheckOk = (ledgerMirror + deltaEst) === earnedSince
    rows.push({
      studentId: p.student_id, name, isQa,
      totalStars: p.total_stars, earnedSince, ledgerMirror, rawDelta, deltaEst,
      plausibleMax, flagged, sumCheckOk,
    })
  }

  const real = rows.filter((r) => !r.isQa)
  const qa = rows.filter((r) => r.isQa)

  const baselineCandidates = real.filter((r) => r.deltaEst > 0)
  const baselineTotalAmount = baselineCandidates.reduce((sum, r) => sum + r.deltaEst, 0)
  const negativeBaselineCount = real.filter((r) => r.deltaEst < 0).length // 항상 0(max(0,·)로 클램프되므로 구조상 음수 불가)
  const rawNegativeCount = real.filter((r) => r.rawDelta < 0).length // 참고용 — 클램프 전 raw delta가 음수인 학생 수(미러가 daily-progress 합보다 큰 경우)
  const flaggedCount = real.filter((r) => r.flagged).length // 이 근사 프록시로는 항상 0이어야 정상(아래 설명)
  const sumCheckFailCount = real.filter((r) => !r.sumCheckOk).length

  console.log('=== 1. baseline 대상(실학생만, QA/테스트 제외) ===')
  console.log(`  baseline 대상 학생 수(delta_est>0): ${baselineCandidates.length} / 실학생 전체 ${real.length}`)
  console.log(`  baseline 총액(delta_est 합계): ${baselineTotalAmount}`)
  console.log(`  음수 baseline 개수(구조상 0이어야 함, max(0,·) 클램프): ${negativeBaselineCount}`)
  console.log(`  참고: 클램프 전 raw delta가 음수인 학생 수(미러가 daily-progress 합보다 큼): ${rawNegativeCount}`)
  console.log(`  duplicate student_progress 행 개수(학생당 1행이어야 정상): ${duplicateStudentIds.length}`)
  if (duplicateStudentIds.length) {
    console.log(`    -> ${duplicateStudentIds.map(([id, n]) => `${id.slice(0, 8)}×${n}`).join(', ')}`)
  }
  console.log(`  plausible_max 초과(flagged, 이 근사 프록시로는 항상 0이어야 정상 — earned_since+50 >= delta_est가 항상 성립하므로): ${flaggedCount}`)
  console.log(`  sum-check(ledger_mirror+delta_est==earned_since) 실패 개수(hold/fail): ${sumCheckFailCount}`)
  console.log(`  progress_data가 비어 있는 학생 수: ${emptyProgressDataCount}`)

  console.log('\n=== 2. Top 10 deltas (실학생, student_id 앞 8자만 표기 — 이름 비노출) ===')
  const top10 = [...baselineCandidates].sort((a, b) => b.deltaEst - a.deltaEst).slice(0, 10)
  for (const r of top10) {
    console.log(`  ${r.studentId.slice(0, 8)}…  total_stars=${r.totalStars}  earned_since=${r.earnedSince}  ledger_mirror=${r.ledgerMirror}  delta_est=${r.deltaEst}`)
  }
  if (top10.length === 0) console.log('  (없음 — baseline 대상 학생 0명)')

  console.log('\n=== 3. QA/테스트 계정(이름 매칭, 실학생 통계에서 완전히 분리) ===')
  console.log(`  QA/테스트로 분류된 계정 수: ${qa.length}`)
  const qaSorted = [...qa].sort((a, b) => b.deltaEst - a.deltaEst)
  for (const r of qaSorted) {
    console.log(`  ${r.name || '(이름 없음)'}  total_stars=${r.totalStars}  earned_since=${r.earnedSince}  ledger_mirror=${r.ledgerMirror}  delta_est=${r.deltaEst}`)
  }
  if (qaSorted.length === 0) console.log('  (없음)')

  console.log('\n=== 요약 ===')
  console.log(`  students=${students.length}  student_progress=${progress.length}  student_daily_progress(>=${V1_CUTOFF_DATE})=${daily.length}`)
  console.log(`  실학생=${real.length}  QA/테스트=${qa.length}`)

  // ── 가드 평가(supabase_v3_48_reward_legacy_baseline_v2.sql과 동일 상수,
  // scripts/lib/baselineV2Guards.mjs) ────────────────────────────────────
  // EXACT 가드(이 근사 클라이언트 미러 프록시로는 구조상 항상 성립 — 실제
  // 서버 SQL 실행 시점에는 이 스크립트가 아니라 SQL 자체의 postcheck가
  // 최종 판정한다. 여기서는 dry-run 스냅샷이 이상 신호를 보이지 않는지만
  // 참고로 보여준다).
  console.log('\n=== 4. EXACT 가드(참고용 — 근사 프록시 기준, 최종 판정은 실제 SQL 실행 시 postcheck) ===')
  console.log(`  ${negativeBaselineCount === 0 ? 'PASS' : 'FAIL'}  negative delta(클램프 후) === 0 (실측 ${negativeBaselineCount})`)
  console.log(`  ${duplicateStudentIds.length === 0 ? 'PASS' : 'FAIL'}  duplicate student_progress 행 === 0 (실측 ${duplicateStudentIds.length})`)
  console.log(`  ${sumCheckFailCount === 0 ? 'PASS' : 'FAIL'}  unexplained mismatch(sum-check 실패) === 0 (실측 ${sumCheckFailCount})`)

  console.log('\n=== 5. BOUNDED 가드(scripts/lib/baselineV2Guards.mjs와 동일 상수) ===')
  const guardSnapshot = {
    candidates: baselineCandidates.length,
    total: baselineTotalAmount,
    maxIndividual: baselineCandidates.reduce((m, r) => Math.max(m, r.deltaEst), 0),
    progressRows: progress.length,
  }
  const guardResult = evaluateBaselineGuards(guardSnapshot)
  const failedGuards = new Set(guardResult.failures.map((f) => f.guard))
  console.log(`  ${failedGuards.has('candidates') ? 'FAIL' : 'PASS'}  candidates=${guardSnapshot.candidates} ∈ [${CANDIDATES_MIN},${CANDIDATES_MAX}]`)
  console.log(`  ${failedGuards.has('total') ? 'FAIL' : 'PASS'}  total=${guardSnapshot.total} ∈ [${TOTAL_MIN},${TOTAL_MAX}]`)
  console.log(`  ${failedGuards.has('maxIndividual') ? 'FAIL' : 'PASS'}  maxIndividual=${guardSnapshot.maxIndividual} ≤ ${MAX_INDIVIDUAL}`)
  console.log(`  ${failedGuards.has('progressRows') ? 'FAIL' : 'PASS'}  progressRows=${guardSnapshot.progressRows} ∈ [${PROGRESS_ROWS_MIN},${PROGRESS_ROWS_MAX}]`)
  console.log(`  종합: ${guardResult.ok ? 'PASS — 이 스냅샷 기준으로는 SQL의 BOUNDED 가드를 통과할 것으로 예상' : 'FAIL — 이 스냅샷 그대로 실행하면 SQL이 RAISE EXCEPTION으로 중단될 것으로 예상(값 재확인 필요)'}`)

  console.log('\nDRY RUN ONLY — no SQL executed, Production WRITE 0')
}

main().catch((err) => {
  console.error('INFRA_ERROR —', err?.message || err)
  process.exit(1)
})
