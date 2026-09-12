// scripts/testHarnessTransientRetry.mjs — CI 일시적 네트워크 오류 재시도
// 회귀 테스트 (2026-09-12).
//
// 배경: Release Gate 라이브 Supabase 하네스 2개(scripts/testDailyAssignment.mjs,
// scripts/testRlsSecurity.mjs)가 지난 24h 동안 `{"message":"Gateway Timeout"}`
// 로 실패했다가 동일 코드로 재실행 시 통과한 사례가 관찰됐다
// (docs/operations/CI_FLAKE_CLASSIFICATION_2026-09-12.md 참고). 이를 대응해
// tests/harness/runDomain.mjs 에 "출력이 일시적 네트워크 오류 패턴에 매치할
// 때만" 5초 뒤 정확히 1회 재시도하는 순수 로직(isTransientFailure /
// runWithTransientRetry)을 추가했다 — 이 파일은 그 순수 로직만 검증한다
// (child_process 스폰 없음, 네트워크 0).
//
// 이 파일이 검증하는 것:
//   1절 — isTransientFailure: 지시된 패턴(Gateway Timeout/ETIMEDOUT/
//     ECONNRESET/fetch failed/502/503/504/socket hang up) + 실측 문자열
//     2종은 true, 일반 assertion 실패 문구는 false.
//   2절 — runWithTransientRetry: 재시도 성공/재시도해도 실패/비-transient는
//     재시도 안 함/최초 성공은 재시도 안 함을 주입된 가짜 runFn + 가짜
//     delay 로 검증(실제 5초 대기 없음).
//   3절 — 정적: release-gate.yml 이 timeout-minutes: 30 을 갖고,
//     tests/harness/runDomain.mjs 가 실제로 재시도 헬퍼를 import/사용하는지.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTransientFailure, runWithTransientRetry } from '../tests/harness/runDomain.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}

console.log('\n=== 1절. isTransientFailure — 패턴 매치 ===')
{
  const transientSamples = [
    'Gateway Timeout',
    'gateway timeout',
    'connect ETIMEDOUT 1.2.3.4:443',
    'read ECONNRESET',
    'TypeError: fetch failed',
    '502 Bad Gateway',
    '503 Service Unavailable',
    'upstream connect error: 504',
    'Error: socket hang up',
    '{"message":"Gateway Timeout"}',
    "{ message: 'Gateway Timeout' }",
    'FAIL [보안] SELECT pin_hash 거부(42501) — {"message":"Gateway Timeout"}',
  ]
  for (const s of transientSamples) {
    check(`transient로 판정: ${JSON.stringify(s)}`, isTransientFailure(s) === true)
  }

  const ordinarySamples = [
    '총 55개 단언 중 실패 1개',
    'AssertionError',
    'Error: expected 31 got 41',
    'permission denied for table students',
    '42501',
    'PASS  전체 통과',
    '',
  ]
  for (const s of ordinarySamples) {
    check(`일반 실패로 판정(재시도 대상 아님): ${JSON.stringify(s)}`, isTransientFailure(s) === false)
  }

  check('null 입력도 안전(false)', isTransientFailure(null) === false)
  check('undefined 입력도 안전(false)', isTransientFailure(undefined) === false)
}

console.log('\n=== 2절. runWithTransientRetry — 재시도 정책 ===')
function fakeWait(calls) {
  return (ms) => { calls.push(ms); return Promise.resolve() }
}

{
  const waitCalls = []
  let callCount = 0
  const runFn = () => {
    callCount++
    if (callCount === 1) return Promise.resolve({ code: 1, out: 'Gateway Timeout' })
    return Promise.resolve({ code: 0, out: 'PASS' })
  }
  const res = await runWithTransientRetry(runFn, { wait: fakeWait(waitCalls), label: 'x', log: () => {} })
  check('첫 시도 transient 실패 → 두번째 성공 시 code 0', res.code === 0)
  check('retried === 1', res.retried === 1)
  check('runFn이 정확히 2회 호출됨', callCount === 2)
  check('wait이 정확히 1회 호출됨(실제 대기 아님, 값 주입)', waitCalls.length === 1)
}

{
  const waitCalls = []
  let callCount = 0
  const runFn = () => {
    callCount++
    return Promise.resolve({ code: 1, out: 'connect ECONNRESET' })
  }
  const res = await runWithTransientRetry(runFn, { wait: fakeWait(waitCalls), label: 'x', log: () => {} })
  check('두 번 다 transient 실패 → 최종 실패(code !== 0)', res.code !== 0)
  check('retried === 1 (never 2 — 정확히 1회만 재시도)', res.retried === 1)
  check('runFn이 정확히 2회만 호출됨(무한 재시도 금지)', callCount === 2)
}

{
  const waitCalls = []
  let callCount = 0
  const runFn = () => {
    callCount++
    return Promise.resolve({ code: 1, out: '총 55개 단언 중 실패 1개' })
  }
  const res = await runWithTransientRetry(runFn, { wait: fakeWait(waitCalls), label: 'x', log: () => {} })
  check('non-transient 실패는 재시도하지 않는다', res.retried === 0)
  check('runFn이 정확히 1회만 호출됨', callCount === 1)
  check('wait이 호출되지 않음', waitCalls.length === 0)
  check('code가 최초 실패값 그대로 보존됨', res.code === 1)
}

{
  const waitCalls = []
  let callCount = 0
  const runFn = () => {
    callCount++
    return Promise.resolve({ code: 0, out: 'PASS' })
  }
  const res = await runWithTransientRetry(runFn, { wait: fakeWait(waitCalls), label: 'x', log: () => {} })
  check('최초 성공은 재시도하지 않는다', res.retried === 0)
  check('runFn이 정확히 1회만 호출됨', callCount === 1)
  check('wait이 호출되지 않음', waitCalls.length === 0)
}

{
  // delay 주입 확인 — 기본 delayMs(5000)를 opts로 오버라이드할 수 있고,
  // 실제 setTimeout이 아니라 주입된 wait만 호출됨을 재확인.
  let sawDelay = null
  const runFn = (() => {
    let n = 0
    return () => {
      n++
      return Promise.resolve(n === 1 ? { code: 1, out: 'Gateway Timeout' } : { code: 0, out: 'PASS' })
    }
  })()
  const res = await runWithTransientRetry(runFn, {
    delayMs: 123,
    wait: (ms) => { sawDelay = ms; return Promise.resolve() },
    label: 'x',
    log: () => {},
  })
  check('delayMs 오버라이드가 wait 호출에 그대로 전달됨(실제 대기 없음)', sawDelay === 123)
  check('재시도 후 최종 성공', res.code === 0 && res.retried === 1)
}

console.log('\n=== 3절. 정적 — release-gate.yml / runDomain.mjs 배선 ===')
{
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/release-gate.yml'), 'utf8')
  check('release-gate.yml에 timeout-minutes: 30 이 존재', /timeout-minutes:\s*30\b/.test(workflow))

  const runDomainSrc = fs.readFileSync(path.join(ROOT, 'tests/harness/runDomain.mjs'), 'utf8')
  check('runDomain.mjs가 runWithTransientRetry를 정의(export)', /export\s+(async\s+)?function\s+runWithTransientRetry/.test(runDomainSrc))
  check('runDomain.mjs가 isTransientFailure를 정의(export)', /export\s+function\s+isTransientFailure/.test(runDomainSrc))
  check('runDomainHarness 본문이 runWithTransientRetry를 실제로 호출', /runWithTransientRetry\(/.test(runDomainSrc))
}

console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
