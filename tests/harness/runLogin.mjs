// tests/harness/runLogin.mjs — 로그인/PIN 인증 도메인 하네스.
// 실제 검증 로직은 scripts/testStudentLogin.mjs 등에 있음(registry.mjs 참고) — 여기는 오케스트레이션만.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('login')
process.exit(summarize([result]) ? 0 : 1)
