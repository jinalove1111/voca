// tests/harness/runAll.mjs — 전체 도메인 순차 실행(npm run verify:all).
// SKIP 도메인은 실패로 세지 않음. 하나라도 FAIL이면 non-zero exit.
import { DOMAINS } from './registry.mjs'
import { runDomainHarness, summarize } from './runDomain.mjs'

const runs = []
for (const id of Object.keys(DOMAINS)) {
  runs.push(await runDomainHarness(id))
}

const ok = summarize(runs)
console.log(ok ? '\nALL DOMAINS: PASS (SKIP 도메인 제외)' : '\nALL DOMAINS: FAIL — 위 실패 도메인 확인')
process.exit(ok ? 0 : 1)
