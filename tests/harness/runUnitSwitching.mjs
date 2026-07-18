// tests/harness/runUnitSwitching.mjs — 유닛 전환/이어서 학습 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('unitSwitching')
process.exit(summarize([result]) ? 0 : 1)
