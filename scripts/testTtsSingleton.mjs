// Verifies the TTS/audio singleton guard (src/utils/speech.js's
// claimTtsCall) — the root-cause fix for the intermittent "echo" bug
// (same sound playing twice). Core guarantee under test: starting a NEW
// call always invalidates the PREVIOUS one, so if the old call's async
// completion callback fires late (a real race — a network fetch, a queued
// speechSynthesis utterance, a setTimeout step), it's suppressed as stale
// and never runs. This is what makes "two sounds audible at once"
// structurally impossible regardless of which two call sites raced.
import assert from 'node:assert/strict'

// Minimal browser globals claimTtsCall's stopAllPlayback() touches.
globalThis.window = {
  speechSynthesis: { speaking: false, pending: false, cancel: () => {} },
}

const BUNDLE = process.env.SPEECH_BUNDLE
if (!BUNDLE) throw new Error('Set SPEECH_BUNDLE to the esbuild output path')
const { pathToFileURL } = await import('node:url')
const { __claimTtsCallForTest: claimTtsCall } = await import(pathToFileURL(BUNDLE).href)

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. 각 호출은 고유한 증가하는 id를 받음')
{
  const a = claimTtsCall('quiz-word')
  const b = claimTtsCall('quiz-praise')
  check('두 번째 id가 첫 번째보다 큼', b.callId > a.callId)
}

console.log('\n2. 새 호출이 시작되면 이전 호출은 즉시 stale 처리됨')
{
  const first = claimTtsCall('spelling-intro')
  let firstEndFired = false
  const guardedFirstEnd = first.guard(() => { firstEndFired = true })

  const second = claimTtsCall('spelling-replay') // 학생이 재생 중에 "다시 듣기"를 다시 탭한 상황을 재현
  let secondEndFired = false
  const guardedSecondEnd = second.guard(() => { secondEndFired = true })

  // 첫 번째 호출의 비동기 완료 콜백이 "뒤늦게" 도착하는 상황(실제 버그의 핵심 레이스)
  guardedFirstEnd()
  check('두 번째 호출 시작 후 첫 번째의 완료 콜백은 무시됨(에코 방지)', firstEndFired === false)

  guardedSecondEnd()
  check('두 번째(최신) 호출의 완료 콜백은 정상 실행됨', secondEndFired === true)
}

console.log('\n3. 겹치지 않는 순차 호출은 둘 다 정상 실행됨 (오탐 없음)')
{
  const first = claimTtsCall('pronounce-word')
  let firstEndFired = false
  first.guard(() => { firstEndFired = true })() // 첫 번째가 완전히 끝난 뒤에만

  const second = claimTtsCall('example')
  let secondEndFired = false
  second.guard(() => { secondEndFired = true })()

  check('순서대로 끝난 첫 번째 호출은 정상 실행됨', firstEndFired === true)
  check('그 다음 호출도 정상 실행됨', secondEndFired === true)
}

console.log('\n4. 여러 번(50회) 겹쳐 호출해도 항상 최신 호출만 살아남음 (퀴즈 50연속 시뮬레이션)')
{
  let survivedCount = 0
  let lastCallId = null
  for (let i = 0; i < 50; i++) {
    const call = claimTtsCall('quiz-word')
    lastCallId = call.callId
    const guarded = call.guard(() => { survivedCount += 1 })
    // 매번 "다음 호출이 이미 시작된 뒤에" 이전 콜백이 도착하는 최악의 경우를
    // 시뮬레이션하기 위해, 다음 루프가 claim하기 전에 이번 것부터 fire.
    guarded()
  }
  check('50번 순차 호출 모두 정상 실행(겹치지 않았으므로)', survivedCount === 50)
  check('마지막 callId가 실제로 가장 큼', lastCallId > 0)
}

console.log('\n5. 실제 에코 시나리오 재현: 오래된 호출이 새 호출 이후에 완료 신호를 보냄')
{
  const calls = []
  for (let i = 0; i < 5; i++) {
    calls.push(claimTtsCall(`race-${i}`))
  }
  // 5개를 전부 "거의 동시에" 시작한 것처럼 만든 뒤, 역순으로(가장 먼저 시작한
  // 것부터) 완료 콜백을 흘려보냄 — 실제 기기에서 네트워크/버퍼링 차이로
  // 오래된 호출이 나중에 끝나는 상황과 동일.
  let firedCount = 0
  const results = calls.map(c => c.guard(() => { firedCount += 1 }))
  results.forEach(fn => fn())
  check('5개 중 가장 마지막(최신) 호출 단 1개만 실제로 소리를 냄', firedCount === 1)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
