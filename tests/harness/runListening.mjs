// tests/harness/runListening.mjs — 듣기(발음 재생) 도메인. 정직한 SKIP 자리표시자(registry.mjs 참고).
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('listening')
process.exit(summarize([result]) ? 0 : 1)
