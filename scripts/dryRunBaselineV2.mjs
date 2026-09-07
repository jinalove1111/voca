// scripts/dryRunBaselineV2.mjs — supabase_v3_48_reward_legacy_baseline_v2.sql
// (per-student reconcile RPC 재설계) 드라이런. 2026-09-07(2026-09-07 보정 —
// earned 프록시 수정, 아래 "왜 프록시를 보정했는가" 절 참고). READ-ONLY,
// anon key, GET만 사용 — SQL을 전혀 실행하지 않는다(Production WRITE = 0).
//
// ── 왜 이 스크립트가 필요한가(전역 스냅샷이 아니라 per-student 규칙을 미리보기) ──
// v3_48은 더 이상 마이그레이션 시점에 전체 학생을 한 번에 계산하지 않는다
// — 각 학생이 로그인할 때 자기 스냅샷을 들고 reconcile_legacy_baseline()을
// 호출한다. 이 스크립트는 "지금 이 순간 모든 학생이 동시에 로그인해서
// reconcile을 호출한다면 어떻게 라우팅될지"를 근사로 미리 보여준다 —
// scripts/lib/baselineV2Guards.mjs의 evaluateReconcile()을 SQL 함수의 b/f/
// g/h 단계와 동일하게 그대로 재사용한다(단일 진실 원천, 드리프트 방지).
//
// ── 왜 서버 reward_ledger/reward_totals를 직접 읽지 않는가 ────────────────
// anon key로는 reward_ledger/reward_totals가 42501(permission denied)로
// 막혀 있다(supabase_v3_36 헤더 — 의도된 최소 권한, service_role 전용).
// 그래서 이 스크립트는 근사 프록시로 `earned`(reward_totals.earned_stars에
// 해당)를 추정한다. **이 가정은 근사치이며 정확한 값이 아니다** — 실제
// reconcile_legacy_baseline() 실행 결과와 다를 수 있다(운영자가 반드시
// 감안할 것).
//
// ── 왜 프록시를 보정했는가(2026-09-07, 최초 버전의 결함) ─────────────────
// 최초 버전은 `earned ≈ client rewardLedger mirror(progress_data.
// rewardLedger 배열 합)`만으로 근사했다. 그런데 실제 서버 원장
// (reward_ledger)에는 v1 legacy-baseline 행(supabase_v3_37 — 그 학생이
// v3_37 실행 시점에 갖고 있던 total_stars 전체를 1회성으로 심은 행)이
// **거의 모든 학생에게 이미 존재한다.** `progress_data.rewardLedger`
// 클라이언트 미러 배열은 이 v1 baseline 행을 포함하지 않는다(그 배열은
// 클라이언트가 실시간으로 지급을 기록한 것이지, 서버가 마이그레이션으로
// 심은 v1 행을 클라이언트가 나중에 되받아 자기 미러에 추가하지 않기
// 때문). 그 결과 최초 버전은 거의 모든 학생의 `earned`를 실제보다 크게
// 낮게 추정했고, `delta_est = total_stars − earned`가 과도하게 커져
// review 라우팅이 187명 중 60명(32%)까지 치솟았다 — 이는 실제 v1 baseline
// 존재를 반영하지 못한 **프록시 결함**이지, per-student 규칙 자체의
// 결함이 아니다.
//
// 보정된 프록시는 다음을 가정한다: 서버의 실제 `earned`는 대략
//   earned ≈ (v1 baseline 몫) + (v1 이후 실제 서버 지급 몫)
// 이고, v1 baseline 몫은 "그 시점의 total_stars"이므로 지금 시점
// `total_stars`에서 "v1 이후 실제로 번 별"(history 블록으로 근사)을 빼면
// 역산할 수 있다. `ledger_mirror`(클라이언트가 v1 이후 실시간으로 기록한
// 미러)를 v1 이후 실제 서버 지급의 근사로 함께 더한다:
//
//   earned_proxy = max(0, total_stars − historySince0823) + ledger_mirror
//   delta_est    = max(0, total_stars − earned_proxy)
//                = max(0, historySince0823 − ledger_mirror)  (total_stars ≥ historySince0823인 통상적인 경우)
//
// **가정을 명시적으로 밝힌다**: `historySince0823`은 2026-08-23 0시(UTC)
// 이후 `progress_data.history`에 기록된 `starsEarned` 합계다 — v3_37(v1)
// 실행 시각을 anon key로 직접 조회할 수 없어(`reward_migration_log`도
// service_role 전용) "2026-08-23 무렵"을 v1/원장 시작 시점의 근사로
// 가정한다(v3_37 마이그레이션 파일 작성/실행 시기와 대략 일치). 이 근사가
// 어긋나면(v1이 실제로 그보다 훨씬 전/후에 실행됐다면) `earned_proxy`도
// 함께 어긋난다 — 운영자가 감안할 것.
//
// snapshot/uploadedTotal 둘 다 이 스크립트가 읽을 수 있는 유일한 값인
// student_progress.total_stars를 그대로 쓴다 — 실제 운영에서는 클라이언트가
// 들고 오는 "그 순간의 로컬 스냅샷"과 서버에 이미 반영된 값이 몇 건
// 차이날 수 있지만(SNAPSHOT_SLACK이 그 여유), 이 드라이런은 둘 다 서버에서
// 읽은 같은 값이라 SNAPSHOT_SLACK 가드가 항상 통과하는 것으로 나온다 —
// 실제 호출 시점의 근사가 아니라 "정적 스냅샷" 근사임을 감안할 것.
//
// 실행: node scripts/dryRunBaselineV2.mjs  (.env 없으면 SKIP exit 0)
import { loadSupabaseEnv } from './lib/prodDataLoader.mjs'
import { evaluateReconcile, TOLERANCE, MAX_INDIVIDUAL, SNAPSHOT_SLACK, SNAPSHOT_MAX } from './lib/baselineV2Guards.mjs'

const V1_CUTOFF_DATE = new Date('2026-08-23T00:00:00Z') // v1/원장 시작 시점의 근사(가정 — 위 헤더 참고)
const QA_NAME_RE = /^(cookie|paul|jinaa|barry|테스트|test)/i
const HISTORY_KEY_RE = /^[A-Za-z]{3} [A-Za-z]{3} [0-9]{2} [0-9]{4}$/
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

/** progress_data.history 키(예: "Mon Jan 05 2026")에서 cutoff(2026-08-23)
 * 이후 starsEarned 합계를 근사한다(historySince0823). 형식이 다른 키/
 * 파싱 실패 키는 조용히 건너뛴다(SQL 함수의 정규식 필터 + begin/exception
 * 개별 스킵과 동일 정신).
 */
function sumHistorySince(historyObj, cutoff) {
  if (!historyObj || typeof historyObj !== 'object') return 0
  let sum = 0
  for (const [key, val] of Object.entries(historyObj)) {
    if (!HISTORY_KEY_RE.test(key)) continue
    const d = new Date(key)
    if (Number.isNaN(d.getTime())) continue
    if (d < cutoff) continue
    const v = Number(val?.starsEarned)
    if (Number.isFinite(v) && v > 0) sum += v
  }
  return sum
}

async function main() {
  const supabase = loadSupabaseEnv()
  if (!supabase) {
    console.log('SKIP — .env(VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) 없음')
    process.exit(0)
  }
  const { base, key } = supabase
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  console.log('\n=== [dry-run] reconcile_legacy_baseline() per-student 규칙 시뮬레이션 ===')
  console.log('READ-ONLY(anon key, GET만) — SQL을 실행하지 않는다.')
  console.log(`가정: v1/원장 시작 ≈ ${V1_CUTOFF_DATE.toDateString()}(anon key로 v3_37 실행 시각을 직접 조회할 수 없어 근사). earned_proxy = max(0, total_stars − historySince0823) + ledger_mirror(v1 baseline이 client rewardLedger 미러에 없다는 것을 보정 — 아래 요약 4a 참고). **이 근사는 정확한 서버 원장 값이 아니다.** snapshot==uploadedTotal==total_stars(정적 스냅샷 근사 — 실제 SNAPSHOT_SLACK 여유는 이 드라이런에서 검증되지 않음).\n`)

  const students = await selectAll(base, headers, 'students', 'select=id,name')
  const progress = await selectAll(base, headers, 'student_progress', 'select=student_id,total_stars,progress_data')

  const nameById = new Map(students.map((s) => [s.id, s.name || '']))

  const rows = []
  for (const p of progress) {
    const name = nameById.get(p.student_id) || ''
    const isQa = QA_NAME_RE.test(name)
    const progressData = p.progress_data
    const ledger = Array.isArray(progressData?.rewardLedger) ? progressData.rewardLedger : []
    const ledgerMirror = ledger.reduce((sum, e) => {
      const v = Number(e?.stars_delta)
      return (Number.isFinite(v) && v >= 0) ? sum + v : sum
    }, 0)
    const snapshot = Number(p.total_stars) || 0
    const historySince0823 = sumHistorySince(progressData?.history, V1_CUTOFF_DATE)

    // 구 프록시(2026-09-06, 결함 있음) — v1 baseline을 반영하지 못해
    // earned를 과소 추정한다. 비교용으로만 남겨둔다(§4a 참고).
    const earnedProxyOld = ledgerMirror
    const resultOld = evaluateReconcile({
      snapshot, earned: earnedProxyOld, uploadedTotal: snapshot, historySince: historySince0823,
    })

    // 보정 프록시(2026-09-07) — v1 baseline 몫(≈ total_stars − v1 이후
    // 실제로 번 별)을 ledger_mirror에 더해 earned를 다시 추정한다.
    const earnedProxyNew = Math.max(0, snapshot - historySince0823) + ledgerMirror
    const resultNew = evaluateReconcile({
      snapshot, earned: earnedProxyNew, uploadedTotal: snapshot, historySince: historySince0823,
    })

    rows.push({
      studentId: p.student_id, name, isQa,
      snapshot, ledgerMirror, historySince0823, plausibleMax: historySince0823 + TOLERANCE,
      earnedProxyOld, reasonOld: resultOld.reason, deltaOld: resultOld.delta,
      earnedProxyNew, reasonNew: resultNew.reason, deltaNew: resultNew.delta,
    })
  }

  const real = rows.filter((r) => !r.isQa)
  const qa = rows.filter((r) => r.isQa)

  // ── 이하 "보정 프록시"(New)를 canonical 결과로 사용한다 ──────────────────
  const reconciled = real.filter((r) => r.reasonNew === 'ok')
  const nothing = real.filter((r) => r.reasonNew === 'nothing_to_reconcile')
  const review = real.filter((r) => r.reasonNew === 'review' || r.reasonNew === 'invalid_snapshot')
  const totalDelta = reconciled.reduce((sum, r) => sum + r.deltaNew, 0)

  console.log('=== 1. 라우팅 결과 요약(보정 프록시 기준, 실학생만, QA/테스트 제외) ===')
  console.log(`  실학생 전체: ${real.length}`)
  console.log(`  reconciled(원장 삽입 후보, delta>0): ${reconciled.length}`)
  console.log(`  nothing_to_reconcile(delta<=0): ${nothing.length}`)
  console.log(`  review(SNAPSHOT_SLACK 또는 타당성 검사 초과): ${review.length}`)
  console.log(`  reconciled 총 delta 합계: ${totalDelta}`)

  // ── 4a. 구 프록시 vs 보정 프록시 한 줄 비교 — 왜 구 버전의 review=60이
  // 틀렸는지 운영자가 한눈에 보게 한다.
  const reconciledOld = real.filter((r) => r.reasonOld === 'ok')
  const nothingOld = real.filter((r) => r.reasonOld === 'nothing_to_reconcile')
  const reviewOld = real.filter((r) => r.reasonOld === 'review' || r.reasonOld === 'invalid_snapshot')
  const totalDeltaOld = reconciledOld.reduce((sum, r) => sum + r.deltaOld, 0)
  console.log(`\n[프록시 비교] 구(mirror-only): reconciled=${reconciledOld.length} nothing=${nothingOld.length} review=${reviewOld.length} total_delta=${totalDeltaOld}  vs  보정(v1 baseline 반영): reconciled=${reconciled.length} nothing=${nothing.length} review=${review.length} total_delta=${totalDelta}  ← 구 프록시는 v1 baseline 몫을 earned에서 누락시켜 review를 과다 산출했다`)

  console.log('\n=== 2. Top 5 deltas(보정 프록시, 실학생, student_id 앞 8자만 표기 — 이름 비노출) ===')
  const top5 = [...reconciled].sort((a, b) => b.deltaNew - a.deltaNew).slice(0, 5)
  for (const r of top5) {
    console.log(`  ${r.studentId.slice(0, 8)}…  snapshot=${r.snapshot}  ledger_mirror=${r.ledgerMirror}  history_since_0823=${r.historySince0823}  earned_proxy=${r.earnedProxyNew}  delta=${r.deltaNew}`)
  }
  if (top5.length === 0) console.log('  (없음 — reconciled 대상 학생 0명)')

  console.log('\n=== 3. review로 라우팅된 전체 학생(보정 프록시, 실학생, student_id 앞 8자만) ===')
  for (const r of review) {
    console.log(`  ${r.studentId.slice(0, 8)}…  snapshot=${r.snapshot}  ledger_mirror=${r.ledgerMirror}  history_since_0823=${r.historySince0823}  earned_proxy=${r.earnedProxyNew}  plausible_max=${r.plausibleMax}  reason=${r.reasonNew}`)
  }
  if (review.length === 0) console.log('  (없음)')

  console.log('\n=== 4. QA/테스트 계정(이름 매칭, 실학생 통계에서 완전히 분리, 보정 프록시) ===')
  console.log(`  QA/테스트로 분류된 계정 수: ${qa.length}`)
  const qaSorted = [...qa].sort((a, b) => b.deltaNew - a.deltaNew)
  for (const r of qaSorted) {
    console.log(`  ${r.name || '(이름 없음)'}  snapshot=${r.snapshot}  ledger_mirror=${r.ledgerMirror}  history_since_0823=${r.historySince0823}  earned_proxy=${r.earnedProxyNew}  reason=${r.reasonNew}  delta=${r.deltaNew}`)
  }
  if (qaSorted.length === 0) console.log('  (없음)')

  console.log('\n=== 요약 ===')
  console.log(`  students=${students.length}  student_progress=${progress.length}  실학생=${real.length}  QA/테스트=${qa.length}`)
  console.log(`  가드 상수: TOLERANCE=${TOLERANCE} MAX_INDIVIDUAL=${MAX_INDIVIDUAL} SNAPSHOT_SLACK=${SNAPSHOT_SLACK} SNAPSHOT_MAX=${SNAPSHOT_MAX}`)
  console.log('  ⚠ earned_proxy는 근사치다(위 헤더 "왜 프록시를 보정했는가" 절의 가정 참고) — 실제 SQL 실행 결과와 다를 수 있다.')

  console.log('\nDRY RUN ONLY — no SQL executed, Production WRITE 0')
}

main().catch((err) => {
  console.error('INFRA_ERROR —', err?.message || err)
  process.exit(1)
})
