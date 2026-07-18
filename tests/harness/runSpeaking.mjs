// tests/harness/runSpeaking.mjs — 말하기(녹음) 도메인. 정직한 SKIP 자리표시자(registry.mjs 참고).
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('speaking')
process.exit(summarize([result]) ? 0 : 1)
