// tests/harness/runPersistence.mjs — 진행도 저장/복원/병합 + DB 무결성 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('persistence')
process.exit(summarize([result]) ? 0 : 1)
