// tests/harness/runStudent.mjs — 학생 식별자/반 소속 무결성 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('student')
process.exit(summarize([result]) ? 0 : 1)
