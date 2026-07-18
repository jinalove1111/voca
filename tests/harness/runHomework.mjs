// tests/harness/runHomework.mjs — 숙제(daily_assignments + categories_completed) 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('homework')
process.exit(summarize([result]) ? 0 : 1)
