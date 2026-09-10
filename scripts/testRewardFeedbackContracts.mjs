// scripts/testRewardFeedbackContracts.mjs
//
// QA 감사(qa/reward-audit-2026-09-10) — 보상 "표시" 계약 2건. 둘 다
// 지급/dedup 로직 자체(원장 append, grantReward, totalStars, 상한 등)는
// 손대지 않는다 — 순전히 학생이 보는 토스트/문구가 실제 지급 결과와
// 어긋나지 않는지만 검증한다.
//
// Finding A(표시, Low-Med) — grantLedgerReward(useStudent.js)의 사전 체크
// `hasRewardEntry(rewardLedger, key)`는 "이 렌더 클로저"의 rewardLedger만
// 본다. 실제 원장/별 지급의 최종 방어는 patch()의 updater 안에서
// appendRewardEntry가 prev를 다시 검사하는 것(그래서 원장 행 수·totalStars는
// 이미 항상 정확했다) — 하지만 그 아래 setRewardFeedback 호출까지는 막지
// 않아서, 같은 렌더 클로저를 공유하는 두 호출(React StrictMode의 동시
// effect 이중 실행, 또는 우발적 동시 호출)이 둘 다 사전 체크를 통과하면
// 토스트가 2개 뜬다. 고친 방법: postedLegacyKeysRef(이 파일 위쪽,
// grantReward 헤더 주석 — 마운트 수명 in-tick 가드)와 정확히 같은 패턴의
// ledgerGrantedKeysRef를 grantLedgerReward 안에 추가해 patch()/토스트
// 이전에 걸러낸다.
//
// Finding B(표시, Med) — markPronunciationOk(useStudent.js)가 내부
// grantReward(...)의 dedup 결과(boolean)를 버리고 아무것도 반환하지
// 않았다. QuizGame.jsx(PronStep)는 그 반환값을 확인하지 않고 녹음이
// 성공하기만 하면(blob.size>0) 무조건 "녹음 완료! ⭐ 1개 획득!"을
// 보여줬다 — 오늘 그 단어로 이미 별을 받은 경우에도 똑같이 표시돼
// 과장이었다(WordDetail.jsx의 SpeechBtn은 이미 이런 과장을 하지 않음).
// 고친 방법: markPronunciationOk가 grantReward의 boolean을 그대로
// 반환하도록, QuizGame.jsx의 handlePronSuccess(중간 래퍼)도 그 반환값을
// 그대로 전달하도록, PronStep의 onSuccess() 호출부도 그 반환값으로
// 문구를 분기하도록 세 지점을 연결했다.
//
// grantLedgerReward 자체는 useStudent()가 공개 API로 반환하지 않는다
// (usestudent.js 최종 return 목록에 없음) — 그래서 테스트 1은 그 함수를
// 정확히 한 줄로 감싸는 공개 앵커 recordExamCompleted(testId)(useStudent.js
// ~1815-1818, `grantLedgerReward('exam-complete', 'entrance-test',
// String(testId))`가 본문 전부)를 대리로 쓴다 — dedupKey가 testId 하나로만
// 결정되므로 "같은 key로 grantLedgerReward를 두 번" 시나리오를 그대로
// 재현한다.
//
// "같은 tick 동기 이중 호출"을 fakeReact.mjs 위에서 재현하는 법 —
// fakeReact.mjs의 setState는 배칭 없이 매 호출마다 즉시 동기 재렌더한다
// (실제 React의 이벤트 핸들러 배칭과 다름). 그래서 `host.result.fn`을 매번
// "새로" 읽어 두 번 부르면 두 번째 호출은 이미 갱신된(재렌더된) 새 클로저를
// 쓰게 돼 버그가 재현되지 않는다. 대신 함수 참조를 먼저 한 번만 캡처한 뒤
// (`const call = host.result.recordExamCompleted`) 그 같은 참조를 두 번
// 호출한다 — 클로저 안의 지역 변수(rewardLedger)는 그 특정 함수 인스턴스가
// 생성된 시점의 값으로 고정되므로(재호출로 값이 바뀌지 않음), 두 호출이
// 정확히 같은 "오래된" rewardLedger/hasRewardEntry 사전 체크 결과를 공유
// — 진짜 동시 호출과 동일한 조건이다. 반면 ledgerGrantedKeysRef/rewardLedger
// state cell 자체(useRef/useState가 감싼 객체)는 렌더와 무관하게 항상 같은
// 물리적 객체이므로(fakeReact.mjs useRef/useState 구현 참고), 오래된
// 클로저를 통해서도 최신 가드 상태를 정확히 공유·갱신한다 — 실제 React의
// ref/state 정체성 보장과 동일한 성질만 재사용, 새 하네스 발명 없음.
//
// 구동 방식은 scripts/testRewardFlow.mjs/testRewardIdempotencyStress.mjs와
// 동일(fakeReact.mjs 최소 hooks 런타임 + scripts/buildRaceBundle.mjs 산출물
// scripts/.tmp/useStudent.race.bundle.mjs + scripts/wordLibraryRaceStub.mjs
// 공유 재사용, 신규 esbuild 번들/스텁 없음). 네트워크 0, DB 접근 0.
//
// CLAUDE.md 규칙 15(FAIL-first) — 수정 전 코드(useStudent.js의
// ledgerGrantedKeysRef 가드 없음 + markPronunciationOk가 값을 반환하지
// 않음 + QuizGame.jsx가 onSuccess()의 반환값을 쓰지 않고 무조건 문구 표시)
// 상태로 이 파일을 먼저 실행해 실측했다: 테스트 1(rewardFeedback.length===1)
// FAIL(실제 2), 테스트 2(markPronunciationOk 첫 호출 true/둘째 false) FAIL
// (실제 undefined/undefined), 테스트 3(QuizGame.jsx 정적 계약) FAIL(무조건
// 문자열, 조건부 아님) — 3개 시나리오 모두 최소 1개 단언 FAIL. 구현(위 두
// 함수 + QuizGame.jsx 세 지점) 후 전체 PASS로 전환.
//
//   npm run verify:reward-feedback-contracts
// (내부적으로 scripts/buildRaceBundle.mjs를 먼저 실행한다.)
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createFakeClock, renderHook } from './fakeReact.mjs'

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
class FakeDocument {
  constructor() { this.visibilityState = 'visible'; this.listeners = {} }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn) }
  dispatch(type) { (this.listeners[type] || []).forEach(fn => fn()) }
}

let failures = 0
let asserted = 0
const scenarioFailures = {}
let currentScenario = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else {
    console.log(`  FAIL  ${label}`)
    failures++
    scenarioFailures[currentScenario] = (scenarioFailures[currentScenario] || 0) + 1
  }
}
const flush = () => new Promise((r) => process.nextTick(r))

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const bundle = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)
const { useStudent } = bundle

function freshEnv() {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
}

function mountFresh(id, name) {
  freshEnv()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id, name), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return { host, clock }
}

// fakeReact.mjs의 run()이 hookFn() 반환값을 effect 커밋 "전"에 캡처하는
// 특성 우회(testRewardFlow.mjs settle() 헤더 주석과 동일 근거).
function settle(host) {
  host.rerender()
  return host
}

console.log('=== 보상 표시 계약(Finding A: 토스트 중복 / Finding B: 별 과장 표시) ===')

// ── 시나리오 1(Finding A) — 같은 tick 동기 이중 호출 → 토스트 1개만 ──────
currentScenario = 1
console.log('\n시나리오 1 — 같은 tick에 오래된 클로저로 grantLedgerReward(대리: recordExamCompleted)를 동기 2회 호출')
{
  const ID = '33333333-0000-0000-0000-000000000001'
  const { host } = mountFresh(ID, 'QA_Feedback_DoubleToast')
  await flush(); await flush(); await flush()
  const before = host.result.stars
  const feedbackBefore = host.result.rewardFeedback.length
  // 위 헤더 주석 — 함수 참조를 먼저 한 번만 캡처해 "오래된" 클로저를 그대로
  // 두 번 호출한다(진짜 동시/같은-tick 호출과 동등한 조건 재현).
  const call = host.result.recordExamCompleted
  call('feedback-double-1')
  call('feedback-double-1')
  check('rewardLedger 행 수 === 1(원장/별 지급 자체는 이미 정확했음, 무회귀)',
    host.result.rewardLedger.filter((e) => e && e.reward_type === 'exam-complete').length === 1)
  check('totalStars 델타 === +2(exam-complete 1회분, 무회귀)', host.result.stars === before + 2)
  check('rewardFeedback 새 항목 정확히 1개(수정 전엔 2개 — 토스트 중복 버그)',
    host.result.rewardFeedback.length - feedbackBefore === 1)
}

// ── 시나리오 2(Finding B) — markPronunciationOk 반환값이 실제 지급 여부와 일치 ──
currentScenario = 2
console.log('\n시나리오 2 — markPronunciationOk(wordId) 반환값: 최초 호출 true, 같은 날 같은 단어 재호출 false')
{
  const ID = '33333333-0000-0000-0000-000000000002'
  const { host } = mountFresh(ID, 'QA_Feedback_PronReturn')
  await flush(); await flush(); await flush()
  const r1 = host.result.markPronunciationOk('w1')
  check('최초 호출 → true(수정 전엔 undefined)', r1 === true)
  settle(host)
  const r2 = host.result.markPronunciationOk('w1')
  check('같은 날 같은 단어 재호출 → false(오늘 이미 지급됨, 수정 전엔 undefined)', r2 === false)
  // 다른 단어는 정상적으로 별개 지급이므로 여전히 true여야 한다(회귀 방지 —
  // 이 계약이 "항상 false를 반환"하는 식으로 잘못 구현되지 않았는지 확인).
  const r3 = host.result.markPronunciationOk('w2')
  check('다른 단어는 여전히 true(무회귀 — 항상 false로 퇴행하지 않았는지 확인)', r3 === true)
}

// ── 시나리오 3(Finding B) — QuizGame.jsx 정적 계약: 별 문구는 실제 지급 여부에 조건부 ──
currentScenario = 3
console.log('\n시나리오 3 — QuizGame.jsx 정적 검사: "⭐ 1개 획득!" 문구가 onSuccess()의 반환값에 조건부인지')
{
  const quizGameSrc = fs.readFileSync(path.resolve('src/components/QuizGame.jsx'), 'utf8')
  check('onSuccess() 반환값을 캡처한다(const granted = onSuccess())',
    /const\s+granted\s*=\s*onSuccess\(\)/.test(quizGameSrc))
  check('setMsg가 granted 삼항으로 문구를 분기한다(수정 전엔 무조건 "⭐ 1개 획득!")',
    /setMsg\(\s*granted\s*\?\s*'녹음 완료! ⭐ 1개 획득!'\s*:\s*'[^']+'\s*\)/.test(quizGameSrc))
  check('무조건 호출(반환값 무시)이던 예전 형태(setMsg 뒤 곧바로 onSuccess())가 더는 없다',
    !/setMsg\('녹음 완료! ⭐ 1개 획득!'\)\s*\n\s*onSuccess\(\)/.test(quizGameSrc))
  check('handlePronSuccess(중간 래퍼)가 onMarkPronunciationOk의 반환값을 그대로 전달한다(return)',
    /return onMarkPronunciationOk\?\.\(current\?\.word\?\.dbId\)/.test(quizGameSrc))
}

// ── 결과 요약 ────────────────────────────────────────────────────────
console.log('\n─── 결과 요약 ───')
for (const n of Object.keys(scenarioFailures)) console.log(`시나리오 ${n} 실패 수: ${scenarioFailures[n]}`)
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0
  ? '\n모든 단언 통과 — 보상 표시 계약(토스트 중복/별 과장 표시) 확인 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
