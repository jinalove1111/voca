// tests/harness/runDailyStudy.mjs — 주간 학습 리포트(daily-study) 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('dailyStudy')
process.exit(summarize([result]) ? 0 : 1)
