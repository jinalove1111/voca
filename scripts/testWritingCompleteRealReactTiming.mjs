// scripts/testWritingCompleteRealReactTiming.mjs — FAIL-first reproduction
// (2026-09-10, qa/reward-audit-2026-09-10) for a MISSING REWARD defect in
// src/hooks/useStudent.js recordSpellingAnswer(): `let justCompletedWriting
// = false` was mutated INSIDE the bumpHistory(day => {...}) functional
// updater and read immediately after (outside patch()) to decide whether to
// call grantXp('writing-complete', ...) / grantLedgerReward('writing-
// complete', ...) — the exact same anti-pattern already fixed once in this
// file for markPronunciationOk (see header comment ~useStudent.js:951-976)
// and answerMission (~1203-1230): a value set inside a setState functional
// updater is NOT guaranteed by React to be available synchronously right
// after the setState call that scheduled it.
//
// scripts/fakeReact.mjs (used by testRewardFlow.mjs and most other reward
// tests) is blind to this class of bug — its useState setter invokes the
// updater fully synchronously and unconditionally (see fakeReact.mjs
// `setState`), which is why testRewardFlow.mjs 테스트 5(writing-complete)
// has been green the whole time despite the defect existing in production.
// This test bundles the REAL src/hooks/useStudent.js (via
// scripts/buildUseStudentRealReactBundle.mjs, unmodified on disk) and
// drives it with the REAL `react` + `react-dom` packages already in
// node_modules (react-dom/client createRoot + react-dom/test-utils act),
// against a minimal hand-rolled DOM shim (no jsdom — not a project
// dependency, rule 6 no-new-deps; the shim only implements the handful of
// Node-like methods react-dom's commit phase touches when the rendered
// tree has zero host elements — see FakeNode below, ~25 lines).
//
// ── What was actually observed (real React 18.3.1, via act()) ──────────
// The task hypothesis going in was that the bug is INTERLEAVING-DEPENDENT
// (React's dispatchSetState eager-bailout optimization — see
// react-dom/cjs/react-dom.development.js dispatchSetState, the
// `fiber.lanes === NoLanes` fast path that runs a state updater
// synchronously to check for a same-state bailout — only skips a fiber
// that already has another queued update in the same tick). Empirically,
// in THIS harness (real React 18.3.1 + react-dom/client + act(), Node
// 24), the eager path was NEVER observed to fire for this hook's `patch`
// dispatcher — not even for a single, isolated, first-of-tick
// recordSpellingAnswer() call on an otherwise fully-settled fiber (traced
// with temporary console.log instrumentation directly in the esbuild
// output at scripts/.tmp/useStudent.realReact.bundle.mjs — never in
// source — during investigation; not present in the final version of this
// file). In other words the defect reproduces UNCONDITIONALLY here, which
// is a strictly stronger (worse) finding than the interleaving-dependent
// hypothesis, not a weaker one — the same root cause class, just with a
// 100% hit rate instead of a conditional one in this exact execution
// environment. Both the originally-hypothesized interleaved scenario
// (Scenario 2 below) and a plain isolated/control scenario (Scenario 1)
// are kept and BOTH fail before the fix, to document this precisely.
// Scenario 3 is the actual control that proves the harness itself is
// sound: it exercises an EFFECT-based reward anchor (word-session-complete,
// granted from a useEffect that reads `round` fresh at commit time, never
// a value mutated inside a setState updater and read synchronously after)
// under the same harness, and — as expected — passes both before and
// after the fix, isolating the defect to the specific read-after-patch
// pattern rather than to the harness or to rewards in general.
//
// Network 0, DB 0, browser 0. Run: node scripts/testWritingCompleteRealReactTiming.mjs
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { act } = await import('react-dom/test-utils')

let failures = 0
let passes = 0
function check(label, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${label}`) }
  else { failures++; console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`) }
}
function section(title) { console.log(`\n${title}`) }

// ── Minimal DOM shim — just enough for react-dom/client's createRoot +
// commit phase when the rendered component tree always returns null (no
// host elements ever mounted). Built empirically (see header) against
// react-dom 18.3.1's actual runtime requirements: container needs
// nodeType/tagName/namespaceURI (getRootHostContext), appendChild/
// insertBefore/removeChild (never actually invoked here since there are no
// host children, but required to exist), addEventListener (root event
// delegation setup), and a `document` global with activeElement (selection
// bookkeeping in prepareForCommit) + createElement/createTextNode/
// createComment (unused here, present for completeness) + a global
// `window` (getCurrentEventPriority reads window.event) and a global
// `HTMLIFrameElement` class (getActiveElementDeep does `instanceof
// win.HTMLIFrameElement`).
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

// ── Build the real-React bundle of the real src/hooks/useStudent.js ────
execSync('node scripts/buildUseStudentRealReactBundle.mjs', { stdio: 'pipe' })
const bundlePath = path.resolve('scripts/.tmp/useStudent.realReact.bundle.mjs')
if (!fs.existsSync(bundlePath)) {
  check('useStudent.realReact.bundle.mjs 생성됨', false, 'buildUseStudentRealReactBundle.mjs 실행 후에도 파일 없음')
  console.log(`\n${passes} PASS, ${failures} FAIL`)
  process.exit(1)
}
const raceStub = await import(pathToFileURL(path.resolve('scripts/wordLibraryRaceStub.mjs')).href)
const bundle = await import(pathToFileURL(bundlePath).href)
const { useStudent, todayStr } = bundle

function newRoot() {
  const container = new FakeNode(1, 'DIV')
  container.tagName = 'DIV'
  container.namespaceURI = null
  return { container, root: createRoot(container) }
}

function ledgerCount(latest, type) {
  return Array.isArray(latest?.rewardLedger) ? latest.rewardLedger.filter((e) => e && e.reward_type === type).length : 0
}

async function mountFresh(id, name) {
  globalThis.localStorage = new FakeStorage()
  raceStub.resetFetchFullProgressDeferred()
  let latest = null
  function Host(props) { latest = useStudent(props.id, props.name); return null }
  const { root } = newRoot()
  await act(async () => {
    root.render(React.createElement(Host, { id, name }))
    raceStub.fetchFullProgressDeferred.resolve(null)
  })
  return { get: () => latest }
}

async function mountSeeded(id, name, seedRecord) {
  globalThis.localStorage = new FakeStorage()
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({ [id]: seedRecord }))
  raceStub.resetFetchFullProgressDeferred()
  let latest = null
  function Host(props) { latest = useStudent(props.id, props.name); return null }
  const { root } = newRoot()
  await act(async () => {
    root.render(React.createElement(Host, { id, name }))
    raceStub.fetchFullProgressDeferred.resolve(null)
  })
  return { get: () => latest }
}

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 1 — 대조군(control): 5번의 정답을 각각 별도 act()(=별도 렌더
// 틱, 실제 학생이 한 번에 한 문제씩 답하는 것과 동일한 타이밍)로 호출.
// 마지막(5번째, GOAL 도달) 호출은 그 tick의 유일한 상태 변경 —
// interleaving 전혀 없음. 가설상 "오늘 PASS해야 하는 대조군"이었으나,
// 실측 결과 이 시나리오도 수정 전에는 FAIL한다(위 헤더 "실제 관찰된 것"
// 참고) — 정직하게 그대로 기록.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 1(대조군) — recordSpellingAnswer 5회를 각각 별도 act()로 호출(interleaving 없음)')
{
  const s = await mountFresh('11111111-aaaa-0000-0000-000000000001', 'RT_Control')
  for (let i = 0; i < 4; i++) {
    await act(async () => { s.get().recordSpellingAnswer(`ctl${i}`, true) })
  }
  const beforeFifth = ledgerCount(s.get(), 'writing-complete')
  const starsBeforeFifth = s.get().stars
  check('5번째(임계값 통과) 호출 전 writing-complete 0건', beforeFifth === 0)
  await act(async () => { s.get().recordSpellingAnswer('ctl4', true) })
  check(
    '5번째 호출(단독, 같은 tick 다른 상태변경 없음) 직후 writing-complete 정확히 1건',
    ledgerCount(s.get(), 'writing-complete') === 1,
    `실제 ${ledgerCount(s.get(), 'writing-complete')}건`,
  )
  const entry = (s.get().rewardLedger || []).find((e) => e.reward_type === 'writing-complete')
  check('writing-complete stars_delta === 2', entry && entry.stars_delta === 2)
  check('totalStars에 +2 반영됨(대조군)', s.get().stars >= starsBeforeFifth + 2, `이전 ${starsBeforeFifth}, 이후 ${s.get().stars}`)
}

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 2 — 원 가설대로의 interleave: history.spellingCorrect를
// GOAL-1(=4)로 미리 시딩(오늘 이미 커밋된 상태 — 이번 act() burst 안에서
// 만들어진 값이 아님)한 뒤, ONE act() 안에서 다른 상태 변경 액션
// (markWordViewed)을 먼저 호출하고 곧바로 recordSpellingAnswer(임계값
// 통과)를 호출한다.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 2 — markWordViewed 먼저 호출 후 recordSpellingAnswer(임계값 통과)를 같은 act() 안에서 호출')
{
  const ID = '11111111-aaaa-0000-0000-000000000002'
  const today = todayStr()
  const seed = {
    studentId: ID,
    totalStars: 0,
    round: { date: today, wordsViewed: [], examplesHeard: 0, quizSolved: 0, pronunciationOk: 0, pronunciationOkWordIds: [], spellingWrongToday: [], spellingCombo: 0, starGrantLog: [], completedToday: [] },
    history: { [today]: { spellingCorrect: 4, spellingTotal: 4 } },
  }
  const s = await mountSeeded(ID, 'RT_Interleaved', seed)
  check('시딩된 오늘 spellingCorrect === 4(마운트 직후 커밋된 값)', s.get().history?.[today]?.spellingCorrect === 4)
  const starsBefore = s.get().stars
  await act(async () => {
    s.get().markWordViewed('other-word-interleave')
    s.get().recordSpellingAnswer('final-word-interleave', true)
  })
  check(
    'interleave 후 writing-complete 정확히 1건(핵심 회귀 어서션)',
    ledgerCount(s.get(), 'writing-complete') === 1,
    `실제 ${ledgerCount(s.get(), 'writing-complete')}건 — 수정 전에는 0건(지급 누락)이어야 정상 재현`,
  )
  check('interleave 후 totalStars에 +2 반영됨', s.get().stars >= starsBefore + 2, `이전 ${starsBefore}, 이후 ${s.get().stars}`)
}

// ═══════════════════════════════════════════════════════════════════════
// 시나리오 3 — 대조(harness sanity): 이펙트 기반 보상 앵커(word-session-
// complete, useEffect 안에서 매 커밋마다 최신 round를 읽어 판단 — patch()
// 호출 직후 밖에서 클로저 플래그를 읽는 패턴이 아님)는 이 하네스에서
// 수정 전/후 모두 정상 동작해야 한다. 이게 깨지면 하네스 자체가 잘못된
// 것 — 실패 원인이 recordSpellingAnswer 고유 결함이 아니라 하네스
// 결함이라는 뜻.
// ═══════════════════════════════════════════════════════════════════════
section('시나리오 3(하네스 대조) — 이펙트 기반 word-session-complete 앵커는 정상 동작해야 함')
{
  const s = await mountFresh('11111111-aaaa-0000-0000-000000000003', 'RT_HarnessSanity')
  await act(async () => {
    for (let i = 0; i < 5; i++) s.get().markWordCompleted(`hs${i}`)
  })
  check(
    'word-session-complete 정확히 1건(이펙트 기반 — 하네스 정상 동작 증거)',
    ledgerCount(s.get(), 'word-session-complete') === 1,
    `실제 ${ledgerCount(s.get(), 'word-session-complete')}건`,
  )
}

console.log('\n─── 결과 요약 ───')
console.log(`총 ${passes + failures}개 단언 중 PASS ${passes}, FAIL ${failures}`)
console.log(failures === 0
  ? '\n모든 단언 통과 — recordSpellingAnswer writing-complete 타이밍 결함 수정 확인(실 React) ✅'
  : `\n${failures}개 단언 실패 ❌ — 수정 전이면 시나리오 1/2가 FAIL하는 것이 정상 재현(위 헤더 참고), 시나리오 3은 항상 PASS해야 함`)
process.exit(failures > 0 ? 1 : 0)
