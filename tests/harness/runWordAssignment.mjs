// tests/harness/runWordAssignment.mjs — 반/날짜별 단어 배정(word-assignment) 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('wordAssignment')
process.exit(summarize([result]) ? 0 : 1)
