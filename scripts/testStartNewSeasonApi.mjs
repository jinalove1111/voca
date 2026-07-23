// Seasonal Progression — api/start-new-season.js 계약 테스트(2026-07-23,
// season-system-specialist). testStudentPinAuth.mjs/testComputeWordKingApi.mjs
// 의 "실제 (req,res) 핸들러를 직접 호출" 패턴을 그대로 쓰되, 이 API는
// word_king_history(class_id로 스코프된 테이블)와 달리 `seasons`가 **전역
// 단일 테이블**이라 QA용 격리 데이터를 만들 방법이 구조적으로 없다 — 실제
// insert/RPC를 한 번이라도 성공시키면 그 자체가 "진짜 새 시즌 시작"이 되어
// 프로덕션의 활성 시즌 경계와 하우스 팀 점수 표시가 실제로 바뀐다(금지
// 행동). 그래서 이 테스트는 두 계층으로 나눈다:
//
//   A) 인증/메서드 가드 — DB 호출 이전에 차단되므로 실제 핸들러를 실제
//      네트워크로 호출해도 100% 안전(GET 거부, adminPin 누락/오답 거부).
//   B) RPC/폴백 계약 — globalThis.fetch를 가로채 PostgREST 응답을
//      흉내내는 순수 mock으로 검증한다(실제 네트워크 요청 0건). 검증 대상:
//      ① 정상 RPC 응답을 올바르게 season 객체로 매핑하는지,
//      ② RPC 함수가 없는 환경(PGRST202/42883)에서 v2_8 시절 단순 insert로
//         정확히 폴백하는지(엔드포인트/바디 형태까지),
//      ③ 테이블 자체가 없는 환경(PGRST205/42P01)에서 ok:false,
//         reason:'table_missing'을 반환하는지(RPC 경로/레거시 경로 둘 다),
//      ④ RPC가 있지만 실행 중 실패(제약 위반 등)하면 code/details/hint를
//         있는 그대로 클라이언트에 표면화하는지(에러 삼킴 금지).
//
// 진짜 원자성/동시성 보장(advisory lock 직렬화, is_active partial unique
// index로 인한 unique_violation)은 Postgres 트랜잭션 자체의 성질이라 JS
// mock으로는 증명할 수 없다 — supabase_v3_5_season_lifecycle.sql이 아직
// 라이브에 미실행(2026-07-23 확인, seasons.season_number 조회 시
// 42703)이므로 이 부분은 "SQL 실행 후 검증 필요"로 정직하게 SKIP 처리한다
// (가짜 PASS 금지, CLAUDE.md 규칙 18).
import fs from 'node:fs'

for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}

let failures = 0
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}
function skip(label, reason) {
  console.log(`  SKIP  ${label} — ${reason}`)
}

function callHandler(handler, { method = 'POST', body } = {}) {
  return new Promise((resolve) => {
    const res = { _status: 200, status(c) { this._status = c; return this }, json(p) { resolve({ status: this._status, body: p }) } }
    handler({ method, body }, res)
  })
}

console.log('\n=== A. 인증/메서드 가드 — DB 호출 이전에 차단되므로 실제 핸들러를 그대로 호출해도 안전 ===')
{
  const { default: startNewSeason } = await import('../api/start-new-season.js')

  const getRes = await callHandler(startNewSeason, { method: 'GET', body: {} })
  check('GET 요청은 405로 거부(DB 호출 없음)', getRes.status === 405)

  if (!process.env.ADMIN_PIN) {
    skip('adminPin 거부 검증', 'ADMIN_PIN이 로컬에 없음(checkAdminReauth 자체가 500 반환 — 예상된 상태, api/_pinAuth.js 주석)')
  } else {
    const wrong = await callHandler(startNewSeason, { body: { adminPin: 'definitely-wrong-pin' } })
    check('틀린 adminPin -> not_authorized(DB 호출 없음)', wrong.body?.ok === false && wrong.body?.reason === 'not_authorized', wrong.body)
    const missing = await callHandler(startNewSeason, { body: {} })
    check('adminPin 누락 -> not_authorized(DB 호출 없음)', missing.body?.ok === false && missing.body?.reason === 'not_authorized', missing.body)
  }
}

console.log('\n=== B. RPC/폴백 계약 — fetch를 가로채는 순수 mock(실제 네트워크 요청 0건, 프로덕션 seasons 테이블 절대 건드리지 않음) ===')
{
  // 실제 시크릿과 절대 섞이지 않도록 이 섹션 전용 격리 env로 덮어쓴다.
  process.env.ADMIN_PIN = 'qa-mock-admin-pin-9999'
  process.env.SUPABASE_URL = 'https://qa-mock-project.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-mock-service-role-key'
  delete process.env.VITE_SUPABASE_URL // supabaseAdminUrl/Key가 SUPABASE_* 우선 사용하도록(주석 참고, api/_pinAuth.js)

  const calls = []
  let scenario = 'rpc_success'
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url)
    const method = opts?.method || 'GET'
    let parsedBody = null
    try { parsedBody = opts?.body ? JSON.parse(opts.body) : null } catch { /* 폼바디 아님 */ }
    calls.push({ url: urlStr, method, body: parsedBody })

    if (urlStr.includes('/rest/v1/rpc/start_new_season')) {
      if (scenario === 'rpc_missing') {
        return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.start_new_season(p_note) in the schema cache', details: null, hint: null }), { status: 404, headers: { 'content-type': 'application/json' } })
      }
      if (scenario === 'rpc_table_missing') {
        return new Response(JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.seasons' in the schema cache", details: null, hint: null }), { status: 404, headers: { 'content-type': 'application/json' } })
      }
      if (scenario === 'rpc_generic_error') {
        return new Response(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "idx_seasons_single_active"', details: 'Key (is_active)=(t) already exists.', hint: null }), { status: 409, headers: { 'content-type': 'application/json' } })
      }
      // rpc_success — `returns table(...)` 함수는 PostgREST가 행 배열로 반환.
      return new Response(JSON.stringify([{ id: 'qa-season-2', season_number: 2, started_at: '2026-07-23T00:00:00.000Z', ended_at: null, is_active: true, note: parsedBody?.p_note ?? null }]), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    if (urlStr.includes('/rest/v1/seasons') && method === 'POST') {
      // 레거시(v2_8) 단순 insert 폴백 경로.
      if (scenario === 'legacy_table_missing') {
        return new Response(JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.seasons' in the schema cache", details: null, hint: null }), { status: 404, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ id: 'qa-season-legacy', started_at: '2026-07-23T00:00:00.000Z', note: parsedBody?.note ?? null }), { status: 201, headers: { 'content-type': 'application/json' } })
    }

    throw new Error(`이 테스트가 예상하지 못한 실제 네트워크 요청: ${method} ${urlStr} (mock 커버리지 밖 — 실제 프로덕션 호출을 막기 위해 즉시 중단)`)
  }

  try {
    // 매 시나리오마다 핸들러를 새로 import(모듈은 캐시되지만 함수 자체는
    // 상태가 없어 재사용 가능 — 굳이 재-import 안 해도 됨, 아래서 재사용).
    const { default: startNewSeason } = await import('../api/start-new-season.js')

    console.log('\nB1. RPC 정상 응답 -> season 객체로 정확히 매핑(신규 필드 seasonNumber/endedAt/isActive 포함)')
    scenario = 'rpc_success'
    calls.length = 0
    const r1 = await callHandler(startNewSeason, { body: { adminPin: process.env.ADMIN_PIN, note: 'QA 노트' } })
    check('ok:true', r1.body?.ok === true, r1.body)
    check('RPC 엔드포인트(start_new_season)를 호출함', calls.some((c) => c.url.includes('/rpc/start_new_season')), calls)
    check('RPC 파라미터 이름이 p_note(SQL 함수 시그니처와 일치)', calls.find((c) => c.url.includes('/rpc/start_new_season'))?.body?.p_note === 'QA 노트', calls)
    check('seasonNumber 매핑됨(2)', r1.body?.season?.seasonNumber === 2, r1.body)
    check('isActive 매핑됨(true)', r1.body?.season?.isActive === true, r1.body)
    check('note가 요청한 값 그대로 왕복', r1.body?.season?.note === 'QA 노트', r1.body)
    check('레거시 insert 엔드포인트는 호출 안 됨(RPC 성공 시 폴백 없음)', !calls.some((c) => c.url.includes('/rest/v1/seasons') && c.method === 'POST'))

    console.log('\nB2. RPC 함수 없음(PGRST202, v3_5 미실행) -> v2_8 시절 단순 insert로 정확히 폴백')
    scenario = 'rpc_missing'
    calls.length = 0
    const r2 = await callHandler(startNewSeason, { body: { adminPin: process.env.ADMIN_PIN, note: 'QA 레거시' } })
    check('ok:true(폴백 성공)', r2.body?.ok === true, r2.body)
    check('RPC를 먼저 시도했음(1순위)', calls.some((c) => c.url.includes('/rpc/start_new_season')))
    check('RPC 실패 후 레거시 insert 엔드포인트로 폴백함', calls.some((c) => c.url.includes('/rest/v1/seasons') && c.method === 'POST'), calls)
    check('레거시 응답은 seasonNumber/isActive가 null(v3_5 미실행 상태를 정직하게 반영)', r2.body?.season?.seasonNumber === null && r2.body?.season?.isActive === null, r2.body)
    check('note는 레거시 경로에서도 정상 전달', r2.body?.season?.note === 'QA 레거시', r2.body)

    console.log('\nB3. 테이블 자체가 없음(PGRST205, v2_8도 미실행) -> RPC 경로에서 바로 table_missing')
    scenario = 'rpc_table_missing'
    calls.length = 0
    const r3 = await callHandler(startNewSeason, { body: { adminPin: process.env.ADMIN_PIN } })
    check('ok:false, reason:table_missing', r3.body?.ok === false && r3.body?.reason === 'table_missing', r3.body)
    check('HTTP 200(관리자 화면이 이 reason으로 안내 문구를 그림 — 500 아님)', r3.status === 200)

    console.log('\nB3.5. 레거시 폴백 경로에서도 테이블 없음이 같은 방식으로 처리됨')
    scenario = 'legacy_table_missing'
    calls.length = 0
    // RPC 자체는 PGRST202(함수 없음)로 응답하지만, 그 다음 레거시 insert가
    // PGRST205(테이블 없음)로 실패하는 조합 — fetch mock의 RPC 브랜치가
    // scenario를 'rpc_missing'으로 오인하지 않도록 별도 처리 필요.
    // (아래에서 fetch mock을 이 시나리오 전용으로 임시 교체)
    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url)
      const method = opts?.method || 'GET'
      let parsedBody = null
      try { parsedBody = opts?.body ? JSON.parse(opts.body) : null } catch { /* noop */ }
      calls.push({ url: urlStr, method, body: parsedBody })
      if (urlStr.includes('/rest/v1/rpc/start_new_season')) {
        return new Response(JSON.stringify({ code: 'PGRST202', message: 'function missing', details: null, hint: null }), { status: 404, headers: { 'content-type': 'application/json' } })
      }
      if (urlStr.includes('/rest/v1/seasons') && method === 'POST') {
        return new Response(JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.seasons' in the schema cache", details: null, hint: null }), { status: 404, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`예상 밖 요청: ${method} ${urlStr}`)
    }
    const r35 = await callHandler(startNewSeason, { body: { adminPin: process.env.ADMIN_PIN } })
    check('RPC 함수없음 -> 레거시 insert 시도 -> 테이블도 없음 -> table_missing으로 정직하게 보고', r35.body?.ok === false && r35.body?.reason === 'table_missing', r35.body)

    console.log('\nB4. RPC는 있는데 실행 중 실패(예: unique_violation) -> 에러를 삼키지 않고 code/details/hint까지 표면화')
    globalThis.fetch = async (url, opts) => {
      const urlStr = String(url)
      let parsedBody = null
      try { parsedBody = opts?.body ? JSON.parse(opts.body) : null } catch { /* noop */ }
      calls.push({ url: urlStr, method: opts?.method || 'GET', body: parsedBody })
      if (urlStr.includes('/rest/v1/rpc/start_new_season')) {
        return new Response(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "idx_seasons_single_active"', details: 'Key (is_active)=(t) already exists.', hint: null }), { status: 409, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`예상 밖 요청(레거시 폴백이 시도되면 안 됨 — table_missing이 아닌 일반 에러라 폴백하지 않는 게 맞음): ${urlStr}`)
    }
    calls.length = 0
    const r4 = await callHandler(startNewSeason, { body: { adminPin: process.env.ADMIN_PIN } })
    check('HTTP 500, ok 필드 없이 error로 표면화', r4.status === 500 && typeof r4.body?.error === 'string', r4.body)
    check('code가 삼켜지지 않고 그대로 전달됨(23505)', r4.body?.code === '23505', r4.body)
    check('details가 삼켜지지 않고 그대로 전달됨', r4.body?.details === 'Key (is_active)=(t) already exists.', r4.body)
    check('일반 에러는 레거시 insert로 폴백하지 않음(테이블 없음이 아니므로)', !calls.some((c) => c.url.includes('/rest/v1/seasons') && c.method === 'POST'))
  } finally {
    globalThis.fetch = realFetch
  }
}

console.log('\n=== C. Postgres 트랜잭션/동시성 고유 보장 — JS mock으로 증명 불가, 정직하게 SKIP ===')
skip('advisory lock에 의한 동시 요청 직렬화', 'pg_advisory_xact_lock은 실제 Postgres 세션/락 매니저가 있어야 검증 가능 — supabase_v3_5_season_lifecycle.sql 실행 후 스테이징/라이브에서 두 요청을 실제 동시에 보내 재현 필요')
skip('is_active partial unique index로 인한 활성 시즌 유일성 최종 방어', '실제 unique_violation 재현은 라이브 DB 제약이 있어야 함 — 위 B4에서 unique_violation "응답을 받았을 때 에러가 삼켜지지 않는지"는 검증했지만, 그 에러가 "실제로 발생하는지"는 SQL 실행 후 검증 필요')
skip('이전 시즌 season_number/ended_at이 실제로 채워지는지(라이브 e2e)', 'supabase_v3_5_season_lifecycle.sql 미실행(seasons.season_number 조회 시 42703, 2026-07-23 실측) — 컬럼 자체가 없어 라이브 검증 불가. SQL 실행 후 검증 필요')

console.log('\n=== D. 순수 로직 시뮬레이션(참고용) — 실제 Postgres 함수 알고리즘을 JS로 그대로 옮겨 시퀀셜 정합성만 확인 ===')
console.log('    (advisory lock/유니크 인덱스가 주는 진짜 동시성 보장은 위 C에서 SKIP 처리한 것과 별개 — 이 섹션은 "동시성 없이 순서대로 호출했을 때" 로직 자체가 맞는지만 확인)')
{
  // supabase_v3_5_season_lifecycle.sql의 start_new_season() 함수 로직을
  // 그대로 옮긴 순수 JS 시뮬레이션 — 실제 SQL 파일과 알고리즘이 어긋나지
  // 않는지 사람이 육안으로 대조할 수 있는 참고 자산이기도 하다.
  function simulateStartNewSeason(table, note) {
    for (const row of table) {
      if (row.is_active) { row.is_active = false; row.ended_at = 'NOW' }
    }
    const nextNumber = table.reduce((max, r) => Math.max(max, r.season_number || 0), 0) + 1
    const newRow = { id: `sim-${nextNumber}`, season_number: nextNumber, started_at: `T${nextNumber}`, ended_at: null, is_active: true, note: note ?? null }
    table.push(newRow)
    return newRow
  }

  const table = []
  const s1 = simulateStartNewSeason(table, '1학기')
  check('첫 시즌 번호는 1', s1.season_number === 1)
  check('첫 시즌은 활성', s1.is_active === true)

  const s2 = simulateStartNewSeason(table, '2학기')
  check('두번째 시즌 번호는 2(증가)', s2.season_number === 2)
  check('두번째 시즌만 활성(정확히 1개)', table.filter((r) => r.is_active).length === 1 && table.find((r) => r.is_active).id === s2.id)
  check('첫 시즌은 비활성 + 종료일 기록됨(삭제되지 않고 보존)', table[0].is_active === false && table[0].ended_at === 'NOW')
  check('첫 시즌 행 자체는 테이블에서 사라지지 않음(길이 2, append-only)', table.length === 2)

  const s3 = simulateStartNewSeason(table, null)
  check('세번째 시즌 번호는 3', s3.season_number === 3)
  check('활성 시즌은 여전히 정확히 1개', table.filter((r) => r.is_active).length === 1)
  check('이전 두 시즌 모두 여전히 테이블에 남아있음(이력 보존)', table.length === 3)
}

console.log(failures === 0 ? '\n전부 PASS(SKIP 포함, 위 C 섹션은 SQL 실행 후 라이브 검증 필요로 별도 표기)' : `\n${failures}개 FAIL`)
await new Promise((r) => setTimeout(r, 300))
process.exit(failures === 0 ? 0 : 1)
