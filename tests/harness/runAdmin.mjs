// tests/harness/runAdmin.mjs — 관리자 대시보드/반별 설정 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('admin')
process.exit(summarize([result]) ? 0 : 1)
