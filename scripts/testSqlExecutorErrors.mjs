// Production Safety Harness — sqlExecutor Management API 실행기 오류 문자열
// 진단성 회귀 테스트 (FAIL-first, 네트워크 0)
// (2026-09-09)
//
// 확정된 결함: createManagementApiExecutor().run()(scripts/lib/sqlExecutor.mjs)
// 의 catch가 err?.message만 반환한다. undici(Node 내장 fetch) 네트워크 실패는
// err.message가 항상 정확히 'fetch failed'이고 실제 원인(DNS/TLS/타임아웃 등)
// 은 err.cause에 들어있는데 그걸 버렸다. 2026-09-09 권교빈 유령 포인터
// 핫픽스 적용 시도가 정확히 "fetch failed"만 남기고 두 번 실패해(DB WRITE 0)
// 아무도 원인을 알 수 없었던 사고의 재발 방지 회귀다.
//
// 하네스 방식: 실제 fetch/네트워크/DB 호출 0건 — fetchImpl을 매 케이스마다
// 가짜 함수로 주입해 run()의 반환값(ok/error/rows)만 검증한다.
// prodHotfix/prodPlan은 이 테스트에서 import/실행하지 않는다(과제 지시).
//
// 실행: node scripts/testSqlExecutorErrors.mjs
import { createManagementApiExecutor } from './lib/sqlExecutor.mjs'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const TOKEN = 'sbp_TESTTOKEN_123'
const baseOpts = { projectRef: 'proj-ref-test', accessToken: TOKEN }

console.log('\na. undici 네트워크 실패(ENOTFOUND) — cause.code가 error 문자열에 포함')
{
  const executor = createManagementApiExecutor({
    ...baseOpts,
    fetchImpl: async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.supabase.com'), { code: 'ENOTFOUND' }),
      })
    },
  })
  const res = await executor.run('select 1')
  check('ok === false', res.ok === false, res)
  check("error에 'fetch failed' 포함", typeof res.error === 'string' && res.error.includes('fetch failed'), res)
  check("error에 'ENOTFOUND' 포함(cause.code 전파)", typeof res.error === 'string' && res.error.includes('ENOTFOUND'), res)
}

console.log('\nb. undici TLS 인증서 오류 — cause.code(문자열 code, message 필드만 있는 plain object cause)가 error 문자열에 포함')
{
  const executor = createManagementApiExecutor({
    ...baseOpts,
    fetchImpl: async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: { message: 'unable to get local issuer certificate', code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' },
      })
    },
  })
  const res = await executor.run('select 1')
  check('ok === false', res.ok === false, res)
  check("error에 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' 포함", typeof res.error === 'string' && res.error.includes('UNABLE_TO_GET_ISSUER_CERT_LOCALLY'), res)
}

console.log('\nc. 타임아웃/AbortError(cause 없음) — name 또는 message가 error 문자열에 포함, undefined 노출 없음')
{
  const executor = createManagementApiExecutor({
    ...baseOpts,
    fetchImpl: async () => {
      const err = new Error('The operation was aborted due to timeout')
      err.name = 'TimeoutError'
      throw err
    },
  })
  const res = await executor.run('select 1')
  check('ok === false', res.ok === false, res)
  check(
    "error에 'TimeoutError' 또는 타임아웃 메시지 포함",
    typeof res.error === 'string' && (res.error.includes('TimeoutError') || res.error.includes('The operation was aborted due to timeout')),
    res
  )
  check("error에 'undefined' 문자열이 섞여 나오지 않음", typeof res.error === 'string' && !res.error.includes('undefined'), res)
}

console.log('\nd. HTTP 401 + JSON body — 기존 동작 그대로(error === "HTTP 401: Unauthorized")')
{
  const executor = createManagementApiExecutor({
    ...baseOpts,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    }),
  })
  const res = await executor.run('select 1')
  check('ok === false', res.ok === false, res)
  check("error === 'HTTP 401: Unauthorized'(불변)", res.error === 'HTTP 401: Unauthorized', res)
}

console.log('\ne. HTTP 200 + JSON rows — 기존 동작 그대로({ ok:true, rows })')
{
  const fakeRows = [{ id: 1 }, { id: 2 }]
  const executor = createManagementApiExecutor({
    ...baseOpts,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => fakeRows,
    }),
  })
  const res = await executor.run('select * from x')
  check('ok === true', res.ok === true, res)
  check('rows가 fetch 응답 그대로(불변)', JSON.stringify(res.rows) === JSON.stringify(fakeRows), res)
}

console.log('\nf. projectRef/accessToken 누락 — 기존 조기 반환 그대로(fetchImpl 호출 자체가 안 됨)')
{
  let fetchCalled = false
  const executor = createManagementApiExecutor({
    projectRef: '',
    accessToken: '',
    fetchImpl: async () => { fetchCalled = true; return { ok: true, status: 200, json: async () => [] } },
  })
  const res = await executor.run('select 1')
  check('ok === false', res.ok === false, res)
  check("error === 'management-api executor: projectRef/accessToken 누락'(불변)",
    res.error === 'management-api executor: projectRef/accessToken 누락', res)
  check('fetchImpl이 호출되지 않음(조기 반환)', fetchCalled === false)
}

console.log('\ng. 토큰 미노출 — 어떤 오류 경로의 error 문자열에도 accessToken 원문이 절대 섞이지 않음')
{
  const cases = [
    () => createManagementApiExecutor({ ...baseOpts, fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(`auth failed for token ${TOKEN}`), { code: 'ECONNRESET' }) }) } }),
    () => createManagementApiExecutor({ ...baseOpts, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) }) }),
  ]
  for (const [i, make] of cases.entries()) {
    const executor = make()
    const res = await executor.run('select 1')
    check(`케이스 g-${i + 1} — error에 토큰 원문(${TOKEN}) 미포함`,
      typeof res.error === 'string' && !res.error.includes(TOKEN), res)
  }
}

console.log(failures === 0
  ? '\n모든 단언 통과 — Management API 실행기 오류 진단성 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
