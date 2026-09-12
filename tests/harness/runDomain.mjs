// tests/harness/runDomain.mjs
//
// 공용 러너 엔진. 도메인 하나(registry.mjs의 DOMAINS[id])를 받아:
//   1) 필요한 builders를 (중복 없이) 한 번씩 `node scripts/buildXBundle.mjs`로 실행
//   2) 각 check의 `node scripts/testX.mjs`를 child_process로 실행(필요한 BUNDLE
//      env var 주입), 실제 스크립트의 stdout/exit code를 그대로 존중
//   3) 표준 헤더(PASS/FAIL/SKIP, 파일:스크립트, 실패 시 stdout tail)로 재포맷
//
// 로직 재구현 없음 — 전부 기존 scripts/*.mjs를 그대로 실행하고 결과만 파싱한다.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILDERS, DOMAINS } from './registry.mjs'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..')

function run(cmd, args, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env } })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { out += d.toString() })
    child.on('close', (code) => resolvePromise({ code, out }))
  })
}

async function ensureBuilt(builderIds, builtCache) {
  const env = {}
  for (const id of builderIds) {
    const b = BUILDERS[id]
    if (!b) throw new Error(`Unknown builder: ${id}`)
    if (!builtCache.has(id)) {
      process.stdout.write(`  [build] node ${b.build}\n`)
      const res = await run('node', [b.build])
      if (res.code !== 0) {
        builtCache.set(id, false)
        process.stdout.write(res.out.split('\n').map((l) => `    ${l}`).join('\n') + '\n')
      } else {
        builtCache.set(id, true)
      }
    }
    if (b.env) env[b.env] = path.join(ROOT, b.out)
    if (builtCache.get(id) === false) return { ok: false, env }
  }
  return { ok: true, env }
}

function tail(text, n = 15) {
  const lines = text.trim().split('\n')
  return lines.slice(-n).join('\n')
}

// ── 2026-09-12 CI 신뢰성: 일시적 네트워크 장애 1회 재시도 ──────────────────
// Release Gate 라이브 Supabase 하네스가 간헐적으로 Gateway Timeout 등으로
// 실패하는 사례(scripts/testDailyAssignment.mjs, scripts/testRlsSecurity.mjs)가
// 관찰돼, "일반 assertion 실패"와 "일시적 네트워크 오류"를 stdout+stderr
// 패턴으로 구분해 후자만 5초 뒤 정확히 1회 재시도한다. 순수 함수로 분리해
// child_process 스폰 없이 단위 테스트 가능(scripts/testHarnessTransientRetry.mjs).
export const TRANSIENT_FAILURE_PATTERN =
  /gateway timeout|etimedout|econnreset|fetch failed|502 bad gateway|503 service unavailable|\b504\b|socket hang up/i

/**
 * @param {string} output 스크립트의 stdout+stderr 전체
 * @returns {boolean} 일시적 네트워크 오류로 보이는지
 */
export function isTransientFailure(output) {
  return TRANSIENT_FAILURE_PATTERN.test(String(output ?? ''))
}

/**
 * 일반 assertion 실패는 절대 재시도하지 않는다 — code===0(성공)이거나
 * 출력이 TRANSIENT_FAILURE_PATTERN에 매치하지 않으면 첫 결과를 그대로 쓴다.
 * @param {() => Promise<{code:number, out:string}>} runFn 주입 가능한 실행기(테스트에서 spawn 없이 교체)
 * @param {{delayMs?:number, wait?:(ms:number)=>Promise<void>, label?:string, log?:(msg:string)=>void}} [opts]
 * @returns {Promise<{code:number, out:string, retried:number}>}
 */
export async function runWithTransientRetry(runFn, opts = {}) {
  const {
    delayMs = 5000,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    label = '',
    log = (msg) => console.log(msg),
  } = opts

  const first = await runFn()
  if (first.code === 0 || !isTransientFailure(first.out)) {
    return { ...first, retried: 0 }
  }

  log(`  RETRY (transient network) ${label} — 1/1`)
  await wait(delayMs)
  const second = await runFn()
  return { ...second, retried: 1 }
}

/**
 * @param {string} domainId
 * @returns {Promise<{domainId:string, label:string, skip?:string, results:Array, ok:boolean}>}
 */
export async function runDomainHarness(domainId) {
  const domain = DOMAINS[domainId]
  if (!domain) throw new Error(`Unknown domain: ${domainId}`)

  console.log(`\n=== [harness:${domainId}] ${domain.label} ===`)

  if (domain.skip) {
    console.log(`  SKIP  ${domain.skip}`)
    return { domainId, label: domain.label, skip: domain.skip, results: [], ok: true }
  }

  const builtCache = new Map()
  const results = []
  for (const check of domain.checks) {
    const scriptRel = check.script
    const tag = check.extra ? ' (extra, 13개 필수 도메인 밖)' : ''
    console.log(`\n-- ${scriptRel}${tag}`)
    if (check.note) console.log(`   note: ${check.note}`)

    const built = await ensureBuilt(check.builders, builtCache)
    if (!built.ok) {
      console.log(`  FAIL  build step failed — see build output above (${scriptRel})`)
      results.push({ script: scriptRel, ok: false, reason: 'build-failed' })
      continue
    }

    const execTarget = check.execPath || scriptRel
    const res = await runWithTransientRetry(
      () => run('node', [execTarget], built.env),
      { label: scriptRel }
    )
    const ok = res.code === 0
    console.log(tail(res.out, ok ? 6 : 25))
    console.log(ok ? `  PASS  ${scriptRel} (exit 0)` : `  FAIL  ${scriptRel} (exit ${res.code}) — 실패 위치: 위 stdout tail 참고, 파일 ${scriptRel}`)
    results.push({ script: scriptRel, ok, exitCode: res.code, extra: !!check.extra })
  }

  const required = results.filter((r) => !r.extra)
  const ok = required.every((r) => r.ok)
  return { domainId, label: domain.label, results, ok }
}

export function summarize(runs) {
  console.log('\n=== summary ===')
  let anyFail = false
  for (const r of runs) {
    if (r.skip) { console.log(`  SKIP  ${r.domainId} — ${r.label}`); continue }
    const failed = r.results.filter((x) => !x.ok && !x.extra)
    const failedExtra = r.results.filter((x) => !x.ok && x.extra)
    if (failed.length === 0) {
      console.log(`  PASS  ${r.domainId} — ${r.label} (${r.results.length}개 스크립트)${failedExtra.length ? ` [extra FAIL: ${failedExtra.map((x) => x.script).join(', ')}]` : ''}`)
    } else {
      anyFail = true
      console.log(`  FAIL  ${r.domainId} — ${r.label} — 실패: ${failed.map((x) => x.script).join(', ')}`)
    }
  }
  return !anyFail
}
