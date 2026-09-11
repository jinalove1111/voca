// scripts/testPronunciationRewardOnce.mjs — 발음 별
// `pronunciation:${wordId}:${todayStr()}` "학생·단어·일자당 최대 1회" 계약
// 고정(2026-09-11, qa/town-loop-hardening-2026-09-11 PHASE 2-B)
//
// 배경 — src/hooks/useStudent.js markPronunciationOk(~1309-1323행)는
// wordId가 있으면 grantReward(1, `pronunciation:${wordId}:${today}`)를
// 호출한다(별 지급 단일 경로, grantReward 헤더 주석 950행대). dedup은
// round.starGrantLog(로컬, grantReward 내부 이중 확인 — 렌더 클로저 사전
// 체크 + patch() updater 안 재확인)가 담당하고, 2026-09-06 레거시 6종 서버
// 원장 흡수 이후로는 parseLegacyDedupKey가 이 dedupKey를 { rewardType:
// 'pronunciation', sourceType: 'pronunciation', sourceId: `${wordId}:${today}` }
// 로 파싱해 postRewardEvent(fire-and-forget)도 함께 나간다(postedLegacyKeysRef
// in-tick 가드 — grantReward 헤더 "2026-09-06" 주석). wordId가 없으면
// (word.dbId 미배정 레거시 단어) 2026-09-12 P1 수정
// (docs/design/REWARD_PATH_AUDIT_2026-09-11.md) 이후로는 호출자가 함께
// 넘기는 wordText를 정규화한 토큰으로 결정적 키
// `pronunciation-unidentified:${token}:${today}`를 만들어 grantReward를
// 부른다 — 같은 학생/같은 단어 텍스트/같은 날이면 dedup되어 최대 1개만
// 지급된다(이전엔 매 호출마다 타임스탬프+랜덤 키라 무제한 반복 지급이던
// 버그, 이 파일 시나리오 8이 새 계약으로 갱신됨). parseLegacyDedupKey는
// 여전히 'pronunciation-unidentified' 프리픽스를 인식하는 분기가 없어
// null을 돌려주므로(그 함수 헤더 "null을 돌려주는 경우" 목록 1번) 서버에는
// 전혀 포스트되지 않는다 — 이 부분은 의도된 그대로 유지.
//
// 하네스 — scripts/testWritingCompleteBoundary.mjs의 real-React 기법을
// 그대로 재사용한다(재구현 아님, 그 파일 헤더 주석과 동일 근거): REAL
// React 18(react-dom/client createRoot + react-dom/test-utils act, 손수
// DOM 셔임 — jsdom 아님, 규칙 6 신규 의존성 금지)으로 실제
// src/hooks/useStudent.js를 esbuild로 번들하고, scripts/wordLibraryRaceStub.mjs
// 를 export *로 그대로 재수출하되 postRewardEvent/postXpEvent 두 함수만
// 호출 캡처용으로 오버라이드한 스텁을 scripts/.tmp/에 런타임 생성해 위에
// 얹는다(testDoubleEvents.mjs/testRewardIdempotencyStress.mjs/
// testWritingCompleteBoundary.mjs와 동일 패턴).
//
// 시나리오(과제 지시 8종 그대로):
//   1) 같은 tick 안 빠른 더블클릭 — markPronunciationOk(wordId) 2회 연속
//      동기 호출 → 별 1개, reward POST 1건.
//   2) 저장 mp3 실패 → 기기 TTS 폴백(PR #33) 경로 — onSuccess가 두 번(별도
//      렌더/틱) 호출되는 것으로 시뮬레이션 → 여전히 별 1개(두 번째 호출은
//      바깥 사전 체크에서 아예 지급 시도 자체가 막힘).
//   3) 서버 POST 네트워크 재시도 — 동일 payload로 postRewardEvent를 직접
//      두 번 호출 → 캡처된 두 항목이 완전히 동일(서버 UNIQUE(idempotency_key)
//      가 23505로 흡수 가능한 형태) — 로컬 원장/별과는 무관(직접 스텁
//      호출은 훅 경로를 거치지 않음, testWritingCompleteBoundary.mjs
//      시나리오 6과 동일 원칙).
//   4) onEnd 다중 발화 — 컴포넌트가 onMarkPronunciationOk를 같은 tick에
//      3회 호출 → 별 1개.
//   5) 재렌더(언마운트 없음)·재마운트(새로고침, 로컬 유지) 둘 다 같은 날
//      안에서는 여전히 1개.
//   6) 다음날 — 가짜 시계로 날짜 이동 후 같은 단어에 별도 day 기간키로
//      1개 추가.
//   7) 서로 다른 두 단어 — 각각 독립적으로 1개씩, 총 2개.
//   8) pronunciation-unidentified 분기(wordId 미상) — 2026-09-12 P1 수정
//      후: wordText를 정규화한 결정적 키로 같은 학생/같은 단어 텍스트/
//      같은 날이면 최대 1개만 지급(더블클릭/재시도/onEnd 다중 발화/대소문자
//      공백 차이/재렌더/재마운트 전부 dedup), 다른 단어 텍스트나 다음날은
//      독립적으로 다시 지급, 텍스트 없음(null/undefined)은 'unknown'
//      토큰으로 합쳐짐. 서버 reward POST는 여전히 0건(parseLegacyDedupKey가
//      이 프리픽스를 인식하지 못해 서버 원장에는 기록되지 않음, 의도된
//      그대로 유지).
//
// 네트워크 0, DB 0, production 코드 무수정(src/ 전부 읽기만).
// 등록: npm run build 없이 node scripts/testPronunciationRewardOnce.mjs로
// 직접 실행 가능(자체 esbuild 번들 내장) / tests/harness/registry.mjs
// rewardSystem 도메인, extra:false.
import esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REWARD_STARS, parseLegacyDedupKey } from '../src/utils/rewardEngine.js'

let failures = 0
let passes = 0
function check(label, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${label}`) }
  else { failures++; console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`) }
}
function section(title) { console.log(`\n${title}`) }

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { act } = await import('react-dom/test-utils')

// ── 최소 DOM 셔임(testWritingCompleteBoundary.mjs와 동일 기법의 그대로
// 복제 — 공유 모듈로 뽑혀 있지 않아 각 real-react 하네스 파일이 자체
// 보유하는 게 이 저장소의 기존 관례). ───────────────────────────────────
class FakeNode {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType
    this.nodeName = nodeName
    this.childNodes = []
    this._listeners = new Map()
  }
  get ownerDocument() { return globalThis.document }
  appendChild(child) { this.childNodes.push(child); return child }
  insertBefore(child) { this.childNodes.push(child); return child }
  removeChild(child) { this.childNodes = this.childNodes.filter((c) => c !== child); return child }
  addEventListener(type, fn, opts) { (this._listeners.get(type) || this._listeners.set(type, []).get(type)).push({ fn, opts }) }
  removeEventListener() {}
  getRootNode() { return this }
  contains() { return false }
  hasChildNodes() { return this.childNodes.length > 0 }
}
function installDomShim() {
  const doc = new FakeNode(9, '#document')
  doc.documentElement = new FakeNode(1, 'HTML')
  doc.createElement = (tag) => new FakeNode(1, String(tag).toUpperCase())
  doc.createTextNode = () => new FakeNode(3, '#text')
  doc.createComment = () => new FakeNode(8, '#comment')
  doc.activeElement = null
  globalThis.document = doc
  globalThis.window = globalThis
  if (!globalThis.HTMLIFrameElement) globalThis.HTMLIFrameElement = class HTMLIFrameElement {}
}
installDomShim()

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}

// ══════════════════════════════════════════════════════════════════════════
// 0) 자체 번들 — postRewardEvent/postXpEvent 호출을 캡처하는 전용
//    wordLibrary 스텁(scripts/testDoubleEvents.mjs §0/
//    scripts/testWritingCompleteBoundary.mjs §0과 동일 패턴: 실제
//    wordLibraryRaceStub.mjs를 export *로 그대로 재수출하되 두 함수만
//    캡처용으로 오버라이드 — wordLibraryRaceStub.mjs 자체는 무수정) +
//    REAL react(react만 external)로 실제 src/hooks/useStudent.js를 번들.
// ══════════════════════════════════════════════════════════════════════════
const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })
const raceStubUrl = pathToFileURL(path.resolve('scripts/wordLibraryRaceStub.mjs')).href
const capturingStubPath = path.join(TMP, 'wordLibraryPronunciationRewardOnceStub.mjs')
fs.writeFileSync(capturingStubPath, `// AUTO-GENERATED by scripts/testPronunciationRewardOnce.mjs — do not edit by hand.
export * from ${JSON.stringify(raceStubUrl)}
export const xpCalls = []
export async function postXpEvent(studentId, eventType, sourceEventId) {
  xpCalls.push({ studentId, eventType, sourceEventId })
}
export const rewardCalls = []
export async function postRewardEvent(studentId, rewardType, sourceType, sourceId) {
  rewardCalls.push({ studentId, rewardType, sourceType, sourceId })
}
`, 'utf8')
const capturingStubUrl = pathToFileURL(capturingStubPath).href

const outfile = path.join(TMP, 'useStudent.pronunciationRewardOnce.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/hooks/useStudent.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  plugins: [{
    name: 'pronunciation-reward-once-stubs',
    setup(build) {
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: capturingStubUrl, external: true }))
      // react는 의도적으로 미처리 — esbuild가 기본으로 external 처리하고,
      // 아래 import()가 노드의 정상 ESM 해석으로 실제 react 패키지를 로드한다.
    },
  }],
  external: ['react'],
})
console.log('bundled -> ' + outfile)

const stub = await import(capturingStubUrl)
const bundle = await import(pathToFileURL(outfile).href)
const { useStudent, todayStr } = bundle

function newRoot() {
  const container = new FakeNode(1, 'DIV')
  container.tagName = 'DIV'
  container.namespaceURI = null
  return { container, root: createRoot(container) }
}

function rewardCallsFor(id, type) {
  return stub.rewardCalls.filter((c) => c.studentId === id && c.rewardType === type)
}
function freshLocalStorage() { globalThis.localStorage = new FakeStorage() }
function readPersistedRecord(id) {
  const raw = globalThis.localStorage.getItem('paul_easy_progress')
  if (!raw) return null
  try { const store = JSON.parse(raw); return store[id] || null } catch { return null }
}

async function mountWithBackup(id, name, backup) {
  stub.resetFetchFullProgressDeferred()
  let latest = null
  function Host(props) { latest = useStudent(props.id, props.name); return null }
  const { root } = newRoot()
  await act(async () => {
    root.render(React.createElement(Host, { id, name }))
    stub.fetchFullProgressDeferred.resolve(backup ?? null)
  })
  return {
    get: () => latest,
    rerender: () => act(async () => { root.render(React.createElement(Host, { id, name })) }),
    unmount: () => act(async () => { root.unmount() }),
  }
}

// pronunciation dedupKey는 REWARD_STARS['pronunciation']이 아니라
// markPronunciationOk 안의 리터럴 grantReward(1, ...)를 직접 쓴다(코드
// 그대로, useStudent.js ~1322행) — 값 자체는 REWARD_STARS.pronunciation과
// 우연히 같은 1이므로 아래 상수로 그 사실을 명시적으로 교차 확인한다.
const PRONUNCIATION_STAR_AMOUNT = 1
check('sanity — REWARD_STARS.pronunciation === markPronunciationOk의 리터럴 지급액(1)', REWARD_STARS.pronunciation === PRONUNCIATION_STAR_AMOUNT)
check('sanity — parseLegacyDedupKey는 pronunciation-unidentified 프리픽스를 인식하지 못해 null', parseLegacyDedupKey('pronunciation-unidentified:123456:ab12cd') === null)
check('sanity — parseLegacyDedupKey(pronunciation:<uuid>:<date>)는 { rewardType, sourceType, sourceId }를 정확히 돌려줌', (() => {
  const wid = '33333333-cccc-0000-0000-000000000099'
  const today = todayStr()
  const parsed = parseLegacyDedupKey(`pronunciation:${wid}:${today}`)
  return !!parsed && parsed.rewardType === 'pronunciation' && parsed.sourceType === 'pronunciation' && parsed.sourceId === `${wid}:${today}`
})())

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 1 — 같은 tick 빠른 더블클릭: markPronunciationOk(wordId) 2회
// 연속 동기 호출(await 없이 같은 act 콜백 안) → 별 1개, reward POST 1건.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 1 — 같은 tick 빠른 더블클릭(동기 2연속 호출) → 별 1개, reward POST 1건')
freshLocalStorage()
const idA = '22222222-cccc-0000-0000-000000000001'
const nameA = 'PRO_SessionA'
let hostA = await mountWithBackup(idA, nameA, null)
const today = todayStr()
const wordX = '33333333-cccc-0000-0000-000000000001'

check('마운트 직후 stars === 0', hostA.get().stars === 0)
check('마운트 직후 round.pronunciationOk === 0', hostA.get().round.pronunciationOk === 0)
check('마운트 직후 reward POST 0건', rewardCallsFor(idA, 'pronunciation').length === 0)

await act(async () => {
  hostA.get().markPronunciationOk(wordX)
  hostA.get().markPronunciationOk(wordX)
})
check('더블클릭 후 stars 정확히 +1(중복 지급 없음)', hostA.get().stars === PRONUNCIATION_STAR_AMOUNT, `실제 ${hostA.get().stars}`)
check('더블클릭 후 round.pronunciationOk 원시 카운터는 2(호출 2회 모두 카운트, dedup은 별 지급에만 적용)', hostA.get().round.pronunciationOk === 2)
check('더블클릭 후 round.pronunciationOkWordIds에 wordX가 정확히 1번만 들어있음', hostA.get().round.pronunciationOkWordIds.filter((w) => w === wordX).length === 1)
check('더블클릭 후 round.starGrantLog에 pronunciation dedupKey가 정확히 1개', hostA.get().round.starGrantLog.filter((k) => k === `pronunciation:${wordX}:${today}`).length === 1)
check('더블클릭 후 reward POST 정확히 1건(postedLegacyKeysRef in-tick 가드)', rewardCallsFor(idA, 'pronunciation').length === 1, `실제 ${rewardCallsFor(idA, 'pronunciation').length}건`)
const rc1 = rewardCallsFor(idA, 'pronunciation')[0]
check('reward POST payload — rewardType === pronunciation', rc1?.rewardType === 'pronunciation')
check('reward POST payload — sourceType === pronunciation', rc1?.sourceType === 'pronunciation')
check('reward POST payload — sourceId === `${wordId}:${date}`', rc1?.sourceId === `${wordX}:${today}`)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 2 — 저장 mp3 실패 → 기기 TTS 폴백(PR #33) 경로: onSuccess가
// 두 번(별도 act/렌더, 같은 tick 아님) 호출되는 것으로 시뮬레이션 →
// 여전히 별 1개(두 번째 호출은 바깥 사전 체크에서 아예 지급 시도가 막힘,
// reward POST도 추가되지 않음).
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 2 — mp3 실패→TTS 폴백 onSuccess 2회(별도 렌더) → 여전히 별 1개, reward POST 추가 0건')
const wordY = '33333333-cccc-0000-0000-000000000002'
await act(async () => { hostA.get().markPronunciationOk(wordY) })
check('폴백 1차 onSuccess 후 stars +1(누적 2)', hostA.get().stars === PRONUNCIATION_STAR_AMOUNT * 2, `실제 ${hostA.get().stars}`)
check('폴백 1차 onSuccess 후 reward POST 정확히 1건(wordY 기준)', rewardCallsFor(idA, 'pronunciation').filter((c) => c.sourceId === `${wordY}:${today}`).length === 1)
await act(async () => { hostA.get().markPronunciationOk(wordY) })
check('폴백 2차 onSuccess(별도 렌더) 후에도 stars 불변(추가 지급 없음)', hostA.get().stars === PRONUNCIATION_STAR_AMOUNT * 2, `실제 ${hostA.get().stars}`)
check('폴백 2차 onSuccess 후에도 wordY reward POST 여전히 정확히 1건', rewardCallsFor(idA, 'pronunciation').filter((c) => c.sourceId === `${wordY}:${today}`).length === 1)
check('폴백 2차 onSuccess도 round.pronunciationOk 원시 카운터는 계속 증가(2+1+1=4)', hostA.get().round.pronunciationOk === 4, `실제 ${hostA.get().round.pronunciationOk}`)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 3 — 서버 POST 네트워크 재시도: 동일 payload로 postRewardEvent를
// 직접 두 번 호출 → 캡처된 두 항목이 완전히 동일(서버 UNIQUE
// (idempotency_key)가 23505로 흡수 가능한 형태). 직접 스텁 호출은 훅
// 경로를 거치지 않으므로 로컬 별/원장과는 무관 — testWritingCompleteBoundary.mjs
// 시나리오 6과 동일 원칙을 정직하게 그대로 문서화.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 3 — 네트워크 재시도(동일 payload 직접 2회 POST) → 캡처된 두 항목 완전 동일')
// wordR — 이 시나리오 전용 격리된 단어 id. wordX를 재사용하면 이 직접
// stub 호출(훅을 거치지 않는 순수 시뮬레이션)이 시나리오 1/5/6이 나중에
// `${wordX}:${today}` sourceId 건수를 세는 assertion을 오염시킨다(실제로
// 처음 이 파일을 작성할 때 wordX를 재사용해 시나리오 5/6이 FAIL했었다 —
// 그 FAIL은 markPronunciationOk의 실제 중복 지급이 아니라 이 시뮬레이션
// 자체가 만든 여분 캡처 항목이 원인이었음을 격리 후 재현으로 확인,
// 규칙 15와 동일 정신). 실제 프로덕션에서는 이 sourceId가 항상
// markPronunciationOk가 만든 것과 동일한 값이므로 아무 문제가 없다 —
// 순수하게 이 테스트 파일 안에서의 격리 목적.
const wordR = '33333333-cccc-0000-0000-000000000099'
const starsBeforeRetry = hostA.get().stars
const retryCountBefore = rewardCallsFor(idA, 'pronunciation').length
await stub.postRewardEvent(idA, 'pronunciation', 'pronunciation', `${wordR}:${today}`)
await stub.postRewardEvent(idA, 'pronunciation', 'pronunciation', `${wordR}:${today}`)
const retryCalls = rewardCallsFor(idA, 'pronunciation').slice(retryCountBefore)
check('재시도 시뮬레이션으로 캡처 배열에 정확히 2건 추가됨(스텁 자체는 dedupe하지 않음 — 실제 dedupe는 서버 UNIQUE 제약 소관)', retryCalls.length === 2, `실제 ${retryCalls.length}`)
check('재시도 2건의 payload가 완전히 동일(studentId/rewardType/sourceType/sourceId 전부)', JSON.stringify(retryCalls[0]) === JSON.stringify(retryCalls[1]))
check('재시도 시뮬레이션은 로컬 stars에 전혀 영향 없음(직접 스텁 호출은 훅의 patch() 경로를 거치지 않음)', hostA.get().stars === starsBeforeRetry)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 4 — onEnd 다중 발화: 컴포넌트가 onMarkPronunciationOk를 같은
// tick에 3회 호출(App.jsx onMarkPronunciationOk={markPronunciationOk}가
// 그대로 markPronunciationOk 자신이므로, "3번 호출"을 직접 재현) → 별 1개.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 4 — onEnd 다중 발화(같은 tick 3회 호출) → 별 1개')
const wordZ = '33333333-cccc-0000-0000-000000000003'
const starsBeforeZ = hostA.get().stars
await act(async () => {
  hostA.get().markPronunciationOk(wordZ)
  hostA.get().markPronunciationOk(wordZ)
  hostA.get().markPronunciationOk(wordZ)
})
check('3연속 onEnd 발화 후 stars 정확히 +1', hostA.get().stars === starsBeforeZ + PRONUNCIATION_STAR_AMOUNT, `실제 ${hostA.get().stars}`)
check('3연속 onEnd 발화 후 round.pronunciationOkWordIds에 wordZ 정확히 1번', hostA.get().round.pronunciationOkWordIds.filter((w) => w === wordZ).length === 1)
check('3연속 onEnd 발화 후 wordZ reward POST 정확히 1건', rewardCallsFor(idA, 'pronunciation').filter((c) => c.sourceId === `${wordZ}:${today}`).length === 1)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 5 — 재렌더(언마운트 없음) 및 재마운트(새로고침, 로컬 유지)
// 둘 다 같은 날 안에서는 여전히 1개(추가 지급 없음).
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 5 — 재렌더/재마운트(같은 날, 로컬 유지) 후에도 wordX 별 여전히 1개')
const starsBeforeRerender = hostA.get().stars
await hostA.rerender()
check('재렌더(언마운트 없음) 직후 stars 불변', hostA.get().stars === starsBeforeRerender)
await act(async () => { hostA.get().markPronunciationOk(wordX) })
check('재렌더 후 같은 단어(wordX) 재호출해도 stars 불변(당일 이미 지급됨)', hostA.get().stars === starsBeforeRerender)
check('재렌더 후 wordX reward POST 추가 0건(여전히 정확히 1건 누적)', rewardCallsFor(idA, 'pronunciation').filter((c) => c.sourceId === `${wordX}:${today}`).length === 1)

const persistedBeforeRefresh = readPersistedRecord(idA)
check('언마운트 전 로컬 persisted record에 wordX pronunciation dedupKey가 저장돼 있음', (persistedBeforeRefresh?.round?.starGrantLog || []).includes(`pronunciation:${wordX}:${today}`))
await hostA.unmount()
let hostA2 = await mountWithBackup(idA, nameA, null) // 새로고침 = 로컬 유지, 클라우드 백업 없음
check('재마운트(새로고침) 직후 stars가 로컬에서 그대로 복원됨', hostA2.get().stars === starsBeforeRerender)
await act(async () => { hostA2.get().markPronunciationOk(wordX) })
check('새로고침 후 같은 단어(wordX) 재호출해도 stars 불변(당일 이미 지급됨, ref 리셋과 무관 — starGrantLog가 로컬에서 복원됨)', hostA2.get().stars === starsBeforeRerender)
check('새로고침 후 wordX reward POST 여전히 정확히 1건 누적(추가 없음)', rewardCallsFor(idA, 'pronunciation').filter((c) => c.sourceId === `${wordX}:${today}`).length === 1)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 6 — 다음날: 가짜 시계로 날짜 이동 후 같은 단어(wordX)에 별도
// day 기간키로 1개 추가.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 6 — 다음날: 같은 단어(wordX)도 별도 day 기간키로 1개 추가')
const RealDate = globalThis.Date
async function withFakeToday(offsetDays, fn) {
  const offsetMs = offsetDays * 24 * 60 * 60 * 1000
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offsetMs)
      else super(...args)
    }
    static now() { return RealDate.now() + offsetMs }
  }
  globalThis.Date = FakeDate
  try {
    return await fn()
  } finally {
    globalThis.Date = RealDate
  }
}

const starsBeforeTomorrow = hostA2.get().stars
await withFakeToday(1, async () => {
  const tomorrow = todayStr()
  check('가짜 시계로 이동한 "다음날" 문자열이 오늘과 다름', tomorrow !== today)
  await act(async () => { hostA2.get().markPronunciationOk(wordX) })
  check('다음날 wordX 재호출 → stars 정확히 +1 추가(별도 day 기간키)', hostA2.get().stars === starsBeforeTomorrow + PRONUNCIATION_STAR_AMOUNT, `실제 ${hostA2.get().stars}`)
  check('다음날 wordX reward POST가 새 sourceId(`wordX:다음날`)로 정확히 1건 추가', rewardCallsFor(idA, 'pronunciation').filter((c) => c.sourceId === `${wordX}:${tomorrow}`).length === 1)
  check('다음날에도 오늘자 wordX reward POST 누적은 그대로 1건(교차 없음)', rewardCallsFor(idA, 'pronunciation').filter((c) => c.sourceId === `${wordX}:${today}`).length === 1)
  await act(async () => { hostA2.get().markPronunciationOk(wordX) })
  check('다음날 같은 단어 재호출(2번째)은 추가 지급 없음', hostA2.get().stars === starsBeforeTomorrow + PRONUNCIATION_STAR_AMOUNT)
})
check('withFakeToday 종료 후 실제 Date로 정상 복원됨', globalThis.Date === RealDate)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 7 — 서로 다른 두 단어: 각각 독립적으로 1개씩, 총 2개.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 7 — 서로 다른 두 단어 → 각각 1개씩, 총 2개')
freshLocalStorage()
const idB = '22222222-cccc-0000-0000-000000000002'
let hostB = await mountWithBackup(idB, 'PRO_SessionB', null)
const wordP = '33333333-cccc-0000-0000-000000000010'
const wordQ = '33333333-cccc-0000-0000-000000000011'
check('B 최초 마운트 시 stars === 0', hostB.get().stars === 0)
await act(async () => { hostB.get().markPronunciationOk(wordP) })
check('단어 P 지급 후 stars === 1', hostB.get().stars === PRONUNCIATION_STAR_AMOUNT)
await act(async () => { hostB.get().markPronunciationOk(wordQ) })
check('단어 Q 지급 후 stars === 2(두 단어 독립적으로 각 1개)', hostB.get().stars === PRONUNCIATION_STAR_AMOUNT * 2)
check('단어 P reward POST 정확히 1건', rewardCallsFor(idB, 'pronunciation').filter((c) => c.sourceId === `${wordP}:${todayStr()}`).length === 1)
check('단어 Q reward POST 정확히 1건', rewardCallsFor(idB, 'pronunciation').filter((c) => c.sourceId === `${wordQ}:${todayStr()}`).length === 1)
await act(async () => { hostB.get().markPronunciationOk(wordP) })
await act(async () => { hostB.get().markPronunciationOk(wordQ) })
check('두 단어 모두 재호출해도 stars 불변(각자 당일 이미 지급됨)', hostB.get().stars === PRONUNCIATION_STAR_AMOUNT * 2)

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 8 — pronunciation-unidentified 분기(wordId 미상, word.dbId
// 배정 안 된 레거시 단어): 2026-09-12 P1 수정(docs/design/
// REWARD_PATH_AUDIT_2026-09-11.md) 이후 새 계약을 고정. wordText를
// 정규화한 토큰(공백 trim+소문자화+내부 공백을 _로)으로 결정적 키
// `pronunciation-unidentified:${token}:${today}`를 만들므로, "같은
// 학생/같은 단어 텍스트/같은 날" 조합이면 wordId 식별 경로(시나리오
// 1~7)와 동일하게 최대 1회만 지급된다 — 더블클릭/재시도/onEnd 다중
// 발화/재렌더/재마운트 전부 dedup되고, 대소문자·공백 차이는 같은 논리
// 이벤트로 합쳐진다. 다른 단어 텍스트나 다음날은 독립적인 새 이벤트로
// 다시 지급 가능(정상 동작, 버그 아님). 서버 reward POST는 이전과
// 동일하게 여전히 0건 — parseLegacyDedupKey가 'pronunciation-
// unidentified' 프리픽스를 인식하는 분기가 없어 null을 돌려주므로(그
// 함수 헤더 "null을 돌려주는 경우" 목록 1번) 서버 원장에는 기록되지
// 않는다(이 부분은 이번 수정 범위 밖, 의도된 그대로 유지).
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 8 — pronunciation-unidentified(wordId 미상) — wordText 결정적 키로 학생·단어텍스트·일자당 최대 1회(2026-09-12 P1 수정)')
freshLocalStorage()
const idC = '22222222-cccc-0000-0000-000000000003'
let hostC = await mountWithBackup(idC, 'PRO_SessionC', null)
check('C 최초 마운트 시 stars === 0', hostC.get().stars === 0)

// 8a — 같은 tick 동기 2연속 호출(apple pie) → stars 1, 원시 카운터는 2.
const pOkBefore8a = hostC.get().round.pronunciationOk
await act(async () => {
  hostC.get().markPronunciationOk(null, 'apple pie')
  hostC.get().markPronunciationOk(null, 'apple pie')
})
check('8a — 같은 tick 동기 2연속 호출(apple pie) → stars 정확히 1', hostC.get().stars === PRONUNCIATION_STAR_AMOUNT, `실제 ${hostC.get().stars}`)
check('8a — round.pronunciationOk 원시 카운터는 호출 2회 모두 카운트(dedup은 별 지급에만 적용)', hostC.get().round.pronunciationOk === pOkBefore8a + 2)

// 8b — 별도 act(재시도/TTS 폴백 2차 onSuccess)로 재호출 → 여전히 1.
await act(async () => { hostC.get().markPronunciationOk(null, 'apple pie') })
check('8b — 별도 act(재시도/TTS 폴백) 재호출 → stars 여전히 1', hostC.get().stars === PRONUNCIATION_STAR_AMOUNT)

// 8c — 같은 tick 3회 호출(onEnd 다중 발화) → 여전히 1, 원시 카운터는 +3.
const pOkBefore8c = hostC.get().round.pronunciationOk
await act(async () => {
  hostC.get().markPronunciationOk(null, 'apple pie')
  hostC.get().markPronunciationOk(null, 'apple pie')
  hostC.get().markPronunciationOk(null, 'apple pie')
})
check('8c — 같은 tick 3회 호출(onEnd 다중 발화) → stars 여전히 1', hostC.get().stars === PRONUNCIATION_STAR_AMOUNT)
check('8c — round.pronunciationOk 원시 카운터는 3회 모두 카운트', hostC.get().round.pronunciationOk === pOkBefore8c + 3)

// 8d — 대소문자/공백만 다른 같은 단어("Apple  Pie ") → 같은 논리 이벤트.
await act(async () => { hostC.get().markPronunciationOk(null, 'Apple  Pie ') })
check('8d — 다른 대소문자/공백("Apple  Pie ") → 같은 논리 이벤트로 취급, stars 여전히 1', hostC.get().stars === PRONUNCIATION_STAR_AMOUNT)

// 8e — 재렌더(언마운트 없음) 후 재호출, 그리고 재마운트(새로고침, 로컬
// 유지) 후 재호출 → 둘 다 여전히 1.
await hostC.rerender()
await act(async () => { hostC.get().markPronunciationOk(null, 'apple pie') })
check('8e — 재렌더(언마운트 없음) 후 재호출 → stars 여전히 1', hostC.get().stars === PRONUNCIATION_STAR_AMOUNT)
await hostC.unmount()
let hostC2 = await mountWithBackup(idC, 'PRO_SessionC', null) // 새로고침 = 로컬 유지, 클라우드 백업 없음
check('8e — 재마운트(새로고침) 직후 stars가 로컬에서 그대로 복원됨', hostC2.get().stars === PRONUNCIATION_STAR_AMOUNT)
await act(async () => { hostC2.get().markPronunciationOk(null, 'apple pie') })
check('8e — 재마운트 후 재호출 → stars 여전히 1', hostC2.get().stars === PRONUNCIATION_STAR_AMOUNT)

// 8f — 다른 단어 텍스트(banana) → 독립적인 새 이벤트로 총 2, 키 2개가
// 정확히 결정적 문자열로 존재.
await act(async () => { hostC2.get().markPronunciationOk(null, 'banana') })
check('8f — 다른 단어 텍스트(banana) → stars 총 2(독립 이벤트)', hostC2.get().stars === PRONUNCIATION_STAR_AMOUNT * 2, `실제 ${hostC2.get().stars}`)
const unidentifiedKeysF = hostC2.get().round.starGrantLog.filter((k) => k.startsWith('pronunciation-unidentified:'))
check('8f — starGrantLog에 pronunciation-unidentified 키가 정확히 2개', unidentifiedKeysF.length === 2, `실제 ${unidentifiedKeysF.length}`)
check('8f — 키가 정확히 결정적 문자열(apple_pie/banana)과 일치', new Set(unidentifiedKeysF).size === 2 &&
  unidentifiedKeysF.includes(`pronunciation-unidentified:apple_pie:${today}`) &&
  unidentifiedKeysF.includes(`pronunciation-unidentified:banana:${today}`))

// 8g — wordText 없이 null/undefined 2회 → 'unknown' 토큰으로 합쳐져
// 총 +1만.
const starsBefore8g = hostC2.get().stars
await act(async () => { hostC2.get().markPronunciationOk(null) })
await act(async () => { hostC2.get().markPronunciationOk(undefined) })
check('8g — wordText 없이 null/undefined 호출 2회 → stars 총 +1만(unknown 토큰으로 dedup)', hostC2.get().stars === starsBefore8g + PRONUNCIATION_STAR_AMOUNT, `실제 ${hostC2.get().stars}`)
check('8g — starGrantLog에 pronunciation-unidentified:unknown 키가 정확히 1개', hostC2.get().round.starGrantLog.filter((k) => k === `pronunciation-unidentified:unknown:${today}`).length === 1)

// 8h — 다른 학생 D(새 uuid, 새 마운트), 같은 단어(apple pie) → D는 1,
// C는 영향 없음(학생별 독립, 이름 아닌 UUID로 식별).
const idD = '22222222-cccc-0000-0000-000000000004'
let hostD = await mountWithBackup(idD, 'PRO_SessionD', null)
const starsCBefore8h = hostC2.get().stars
await act(async () => { hostD.get().markPronunciationOk(null, 'apple pie') })
check('8h — 다른 학생 D, 같은 단어(apple pie) → D는 stars 1', hostD.get().stars === PRONUNCIATION_STAR_AMOUNT)
check('8h — C의 stars는 변하지 않음(학생별 독립, 잘못된 학생에게 0 지급)', hostC2.get().stars === starsCBefore8h)

// 8i — 다음날: 가짜 시계로 날짜 이동 후 같은 단어(apple pie) → 별도 day
// 기간키로 1개 추가, 당일 키는 그대로.
const starsCBefore8i = hostC2.get().stars
await withFakeToday(1, async () => {
  const tomorrow = todayStr()
  check('8i — 가짜 시계로 이동한 "다음날" 문자열이 오늘과 다름', tomorrow !== today)
  await act(async () => { hostC2.get().markPronunciationOk(null, 'apple pie') })
  check('8i — 다음날 같은 단어(apple pie) 재호출 → stars +1 추가', hostC2.get().stars === starsCBefore8i + PRONUNCIATION_STAR_AMOUNT, `실제 ${hostC2.get().stars}`)
  check('8i — 오늘자 apple_pie 키는 여전히 정확히 1개(교차 없음)', hostC2.get().round.starGrantLog.filter((k) => k === `pronunciation-unidentified:apple_pie:${today}`).length === 1)
  check('8i — 다음날자 apple_pie 키도 정확히 1개 추가됨', hostC2.get().round.starGrantLog.filter((k) => k === `pronunciation-unidentified:apple_pie:${tomorrow}`).length === 1)
})

// 8j — 시나리오 8 전체에서 rewardType pronunciation 서버 POST는 C/D 모두
// 0건(미식별 경로는 여전히 서버화 대상이 아님), parseLegacyDedupKey도
// 여전히 이 프리픽스에 대해 null.
check('8j — 시나리오 8 전체에서 rewardType pronunciation 서버 POST는 C/D 모두 0건', rewardCallsFor(idC, 'pronunciation').length === 0 && rewardCallsFor(idD, 'pronunciation').length === 0)
check('8j — parseLegacyDedupKey(pronunciation-unidentified:apple_pie:<today>) === null', parseLegacyDedupKey(`pronunciation-unidentified:apple_pie:${today}`) === null)

// 8k — round.pronunciationOk 원시 카운터는 매 호출마다 계속 증가(발음
// 연습 자체는 정상 기록), pronunciationOkWordIds는 wordId가 항상
// null/undefined였으므로 계속 빈 배열.
check('8k — round.pronunciationOkWordIds는 wordId===null 호출만으로는 채워지지 않음(빈 배열 유지)', hostC2.get().round.pronunciationOkWordIds.length === 0)
check('8k — D의 round.pronunciationOkWordIds도 동일하게 빈 배열', hostD.get().round.pronunciationOkWordIds.length === 0)
check('8k — C의 round.pronunciationOk 원시 카운터는 8a~8i 전체 호출 수(13회)만큼 누적(dedup 없이 매번 카운트)', hostC2.get().round.pronunciationOk === 13, `실제 ${hostC2.get().round.pronunciationOk}`)

console.log('\n─── 결과 요약 ───')
console.log(`총 ${passes + failures}개 단언 중 PASS ${passes}, FAIL ${failures}`)
console.log(failures === 0
  ? '\n모든 단언 통과 — pronunciation 별 지급 학생·단어·일자당 최대 1회 계약을 식별 경로(wordId)와 미식별 경로(wordText 결정적 키, 2026-09-12 P1 수정) 모두에서 확인(실 React) ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
