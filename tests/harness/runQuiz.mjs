// tests/harness/runQuiz.mjs — 퀴즈 스텝 리셋/리액션 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('quiz')
process.exit(summarize([result]) ? 0 : 1)
