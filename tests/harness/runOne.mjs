// tests/harness/runOne.mjs — CLI: node tests/harness/runOne.mjs <domainId>
import { runDomainHarness, summarize } from './runDomain.mjs'

const domainId = process.argv[2]
if (!domainId) {
  console.error('Usage: node tests/harness/runOne.mjs <domainId>')
  process.exit(1)
}

const result = await runDomainHarness(domainId)
const ok = summarize([result])
process.exit(ok ? 0 : 1)
