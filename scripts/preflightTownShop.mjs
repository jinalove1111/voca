// scripts/preflightTownShop.mjs — Town Shop(v3_47)/legacy baseline v2(v3_48)
// 배포 전후 READ-ONLY 프리플라이트. anon key GET(+ 카운트용 HEAD)만
// 사용한다 — POST/PATCH/PUT/DELETE 경로가 이 파일에 전혀 없다(Production
// WRITE 0). Supabase에 SQL을 전혀 실행하지 않는다.
//
// ── purchase_town_item RPC를 절대 호출하지 않는 이유 ─────────────────────
// anon으로 POST /rest/v1/rpc/purchase_town_item을 호출해 "함수가 있으면
// 42501, 없으면 404"를 확인하는 방법도 있어 보이지만, 이 함수가 실제로
// 존재하고 실수로라도 anon/authenticated에 EXECUTE 권한이 열려 있는
// 상태라면 이 프리플라이트 자체가 실제 구매(WRITE)를 유발할 수 있다 —
// READ-ONLY 절대 원칙(운영자 지시)에 위배된다. 그래서 RPC는 호출 대신
// PostgREST OpenAPI 루트(`/rest/v1/`)에서 함수 존재 여부만 읽으려
// 시도하고, 이 프로젝트에서는 그 엔드포인트 자체가 secret key 전용이라
// anon으로는 401을 받는다(실측, 2026-09-06) — 이 경우 SKIP으로 표기하고
// 절대 RPC를 직접 두드리지 않는다.
//
// 실행: node scripts/preflightTownShop.mjs --expect pre|post-v3_47|post-v3_48
// .env 없으면 SKIP exit 0.
import fs from 'node:fs'
import path from 'node:path'
import { loadSupabaseEnv } from './lib/prodDataLoader.mjs'

const MODES = ['pre', 'post-v3_47', 'post-v3_48']

function parseArgs(argv) {
  const idx = argv.indexOf('--expect')
  const mode = idx !== -1 ? argv[idx + 1] : null
  return { mode }
}

let passCount = 0
let failCount = 0
let skipCount = 0
function report(label, status, detail) {
  const line = `  ${status}  ${label}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (status === 'PASS') passCount++
  else if (status === 'FAIL') failCount++
  else skipCount++
}

async function getJson(base, headers, table, query) {
  const url = `${base}/rest/v1/${table}?${query}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
  let body = null
  try { body = await res.json() } catch { /* 본문이 JSON이 아닐 수 있음(에러 텍스트 등) */ }
  return { status: res.status, body }
}

async function headCount(base, headers, table, selectCol) {
  const url = `${base}/rest/v1/${table}?select=${selectCol}`
  const res = await fetch(url, { method: 'HEAD', headers: { ...headers, Prefer: 'count=exact' }, signal: AbortSignal.timeout(20000) })
  const range = res.headers.get('content-range') || ''
  const m = /\/(\d+)$/.exec(range)
  return { status: res.status, count: m ? Number(m[1]) : null }
}

// 테이블/뷰가 "없음"으로 판정되는 대표 에러 코드 3종(PostgREST 스키마
// 캐시 미인식/실제 부재) — 파일 헤더에서 요구한 404/42P01/PGRST205 전부
// 커버한다.
function isAbsent(status, body) {
  if (status === 404) return true
  const code = body?.code
  return code === '42P01' || code === 'PGRST205'
}

// 권한 자체는 있지만(테이블 존재) 접근이 차단된 경우(anon/authenticated
// GRANT 0건) — 401 또는 42501.
function isBlocked(status, body) {
  if (status === 401) return true
  return body?.code === '42501'
}

async function checkMustNotChange(base, headers, snapshot) {
  console.log('\n=== must_not_change baseline (변하면 안 되는 핵심 카운트) ===')
  const students = await headCount(base, headers, 'students', 'id')
  const progress = await headCount(base, headers, 'student_progress', 'student_id')
  const xp = await headCount(base, headers, 'xp_ledger', 'id')
  const words = await headCount(base, headers, 'words', 'id')
  snapshot.mustNotChange = {
    students: students.count, studentProgress: progress.count, xpLedger: xp.count, words: words.count,
  }
  console.log(`  students=${students.count}  student_progress=${progress.count}  xp_ledger=${xp.count}  words=${words.count}`)
  report('must_not_change 카운트 4종 조회 성공(HEAD, 값 자체의 PASS/FAIL 판정은 diff 시점에)',
    [students, progress, xp, words].every((r) => r.status === 200 || r.status === 206) ? 'PASS' : 'FAIL')
}

async function checkPre(base, headers, snapshot) {
  console.log('\n=== --expect pre: 아직 아무것도 배포/실행되지 않은 상태 ===')

  const townItems = await getJson(base, headers, 'town_items', 'select=id&limit=1')
  report('town_items 테이블 부재(404/42P01/PGRST205)', isAbsent(townItems.status, townItems.body) ? 'PASS' : 'FAIL',
    `status=${townItems.status} code=${townItems.body?.code || '-'}`)
  snapshot.townItems = townItems

  const starPurchases = await getJson(base, headers, 'star_purchases', 'select=id&limit=1')
  report('star_purchases 테이블 부재(404/42P01/PGRST205)', isAbsent(starPurchases.status, starPurchases.body) ? 'PASS' : 'FAIL',
    `status=${starPurchases.status} code=${starPurchases.body?.code || '-'}`)
  snapshot.starPurchases = starPurchases

  // RPC 함수 존재 여부 — 절대 RPC를 직접 호출하지 않는다(파일 헤더 설명).
  // OpenAPI 루트로만 확인 시도하고, 이 프로젝트에서는 secret key 전용이라
  // anon으로는 401 — SKIP으로 표기.
  const openapi = await getJson(base, headers, '', '')
  if (openapi.status === 200 && openapi.body?.paths) {
    const paths = Object.keys(openapi.body.paths)
    const hasPurchase = paths.includes('/rpc/purchase_town_item')
    const hasGetState = paths.includes('/rpc/get_town_shop_state')
    report('purchase_town_item RPC 부재(OpenAPI paths 기준)', !hasPurchase ? 'PASS' : 'FAIL')
    report('get_town_shop_state RPC 부재(OpenAPI paths 기준)', !hasGetState ? 'PASS' : 'FAIL')
  } else {
    report('purchase_town_item/get_town_shop_state RPC 존재 확인', 'SKIP',
      `OpenAPI 루트가 anon에 401/비JSON(status=${openapi.status}) — 이 프로젝트에서는 secret key 전용, RPC를 직접 호출하지 않으므로 SKIP`)
  }
}

async function checkPostV347(base, headers, snapshot) {
  console.log('\n=== --expect post-v3_47: v3_47(town_items/star_purchases/RPC 2종) 실행 후 ===')

  const townItems = await getJson(base, headers, 'town_items', 'select=id,name,price,active')
  const rows = Array.isArray(townItems.body) ? townItems.body : []
  const active = rows.filter((r) => r.active)
  const lamp = active.find((r) => r.id === 'shop-lamp')
  report('town_items 조회 가능(공개 카탈로그)', townItems.status === 200 ? 'PASS' : 'FAIL', `status=${townItems.status}`)
  report('활성 아이템이 정확히 shop-lamp 1개, price=60', (active.length === 1 && lamp?.price === 60) ? 'PASS' : 'FAIL',
    `active_count=${active.length} lamp_price=${lamp?.price ?? '-'}`)
  snapshot.townItems = townItems

  const starPurchases = await getJson(base, headers, 'star_purchases', 'select=id&limit=1')
  report('star_purchases anon 접근 차단(401/42501, 부재 아님)', isBlocked(starPurchases.status, starPurchases.body) ? 'PASS' : 'FAIL',
    `status=${starPurchases.status} code=${starPurchases.body?.code || '-'}`)
  snapshot.starPurchases = starPurchases

  const rewardLedger = await getJson(base, headers, 'reward_ledger', 'select=id&limit=1')
  report('reward_ledger 여전히 42501(v3_36과 동일 최소 권한, v3_47이 안 건드림)', isBlocked(rewardLedger.status, rewardLedger.body) ? 'PASS' : 'FAIL',
    `status=${rewardLedger.status} code=${rewardLedger.body?.code || '-'}`)
}

async function checkPostV348(base, headers, snapshot) {
  console.log('\n=== --expect post-v3_48: v3_48(legacy baseline v2) 실행 후 ===')
  console.log('  anon key로는 reward_ledger/reward_baseline_review/reward_migration_log를 읽을 수 없다(전부 42501/RLS 정책 0).')
  console.log('  아래는 운영자가 Supabase SQL Editor(service_role)에서 직접 실행할 SELECT 스니펫이다(READ-ONLY, 이 스크립트는 실행하지 않는다):\n')
  console.log("    select count(*) from reward_ledger where reward_type='legacy-baseline' and source_type='migration' and source_id='v2';")
  console.log("    select count(*) from reward_baseline_review where migration_name='v3_48_reward_legacy_baseline_v2';")
  console.log("    select * from reward_migration_log where migration_name='v3_48_reward_legacy_baseline_v2';")

  const rewardLedger = await getJson(base, headers, 'reward_ledger', 'select=id&limit=1')
  report('reward_ledger anon 접근 여전히 차단(42501) — 예상된 상태, 위 SELECT는 운영자가 직접 실행', isBlocked(rewardLedger.status, rewardLedger.body) ? 'PASS' : 'FAIL',
    `status=${rewardLedger.status} code=${rewardLedger.body?.code || '-'}`)
}

async function main() {
  const { mode } = parseArgs(process.argv.slice(2))
  if (!mode || !MODES.includes(mode)) {
    console.error(`사용법: node scripts/preflightTownShop.mjs --expect ${MODES.join('|')}`)
    process.exit(1)
  }

  const supabase = loadSupabaseEnv()
  if (!supabase) {
    console.log('SKIP — .env(VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) 없음')
    process.exit(0)
  }
  const { base, key } = supabase
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  console.log(`\n=== [preflight] Town Shop / legacy baseline v2 — mode=${mode} ===`)
  console.log('READ-ONLY(anon key, GET/HEAD만) — SQL을 전혀 실행하지 않는다. Production WRITE 0.')

  const snapshot = { mode, generatedAt: new Date().toISOString(), projectRef: supabase.projectRef || null }

  try {
    if (mode === 'pre') await checkPre(base, headers, snapshot)
    if (mode === 'post-v3_47') await checkPostV347(base, headers, snapshot)
    if (mode === 'post-v3_48') await checkPostV348(base, headers, snapshot)
    await checkMustNotChange(base, headers, snapshot)
  } catch (err) {
    console.error('INFRA_ERROR —', err?.message || err)
    process.exit(1)
  }

  const tmpDir = path.join('scripts', '.tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  const ts = snapshot.generatedAt.replace(/[:.]/g, '-')
  const outPath = path.join(tmpDir, `preflight-${mode}-${ts}.json`)
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2))
  console.log(`\n스냅샷 저장: ${outPath} (다음 단계와의 diff용)`)

  console.log(`\n=== 요약: PASS=${passCount} FAIL=${failCount} SKIP=${skipCount} ===`)
  console.log('DRY RUN ONLY(READ-ONLY) — no SQL executed, Production WRITE 0')
  process.exit(failCount > 0 ? 1 : 0)
}

main()
