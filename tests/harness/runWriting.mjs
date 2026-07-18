// tests/harness/runWriting.mjs — 쓰기시험(스펠링 채점/방향 배선) 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('writing')
process.exit(summarize([result]) ? 0 : 1)
