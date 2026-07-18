// tests/harness/runAudioTts.mjs — TTS 중복 호출 방지(에코 가드) 도메인 하네스.
import { runDomainHarness, summarize } from './runDomain.mjs'

const result = await runDomainHarness('audioTts')
process.exit(summarize([result]) ? 0 : 1)
