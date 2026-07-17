// 퀴즈 모드 "두 번째 문제부터 이미 답이 선택돼 보이는" 버그 회귀 테스트
// (2026-07-18, 운영자 실기기 리포트).
//
// 근본 원인: 6dcd521이 mode==='quiz' → STEPS=['quiz'] 단일 단계 모드를
// 도입하면서, 단어가 바뀌어도 step이 안 바뀌어 React가 같은 위치의 같은
// 타입 컴포넌트(QuizStep)를 재사용 → selected 상태가 다음 단어로 이월.
// 수정: WordDetail이 각 step 컴포넌트를 key={word.id}로 렌더 → 단어마다
// 완전 remount(재사용 대신 rebuild).
//
// 방법: 진짜 WordDetail.jsx를 esbuild로 번들하되 react를 미니 훅 런타임으로
// 치환(scripts/fakeReact.mjs 선례 — 실제 소스 코드를 그대로 실행, 손으로
// 베낀 로직 아님). React의 문서화된 재조정 규칙(같은 type+key ⇒ 인스턴스
// 재사용, key 다름 ⇒ unmount+새 mount)을 그대로 구현한 호스트로 문제 전환
// 30회를 구동하고, 매 문제가 완전 초기 상태로 시작하는지 렌더 트리로
// 단언한다. key를 무시하는 컨트롤 런(수정 전 React 동작 재현)이 실제로
// 실패 상태를 만드는 것도 확인 — 이 테스트가 원래 버그를 잡아냄을 증명.
//
// 실행: node scripts/testQuizStepReset.mjs
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createFakeClock } from './fakeReact.mjs'

// ── 1. 실제 WordDetail 번들 (react/브라우저 모듈만 가상 치환) ────────────────
const stub = (contents) => ({ contents, loader: 'js' })
const VIRTUAL = {
  react: stub(`
    const h = (n) => (...a) => globalThis.__FAKE_HOOKS__[n](...a)
    export const useState = h('useState')
    export const useEffect = h('useEffect')
    export const useRef = h('useRef')
    export const useMemo = h('useMemo')
    export const useCallback = h('useCallback')
    export default { useState, useEffect, useRef, useMemo, useCallback }
  `),
  jsxRuntime: stub(`
    export const Fragment = Symbol.for('fake.Fragment')
    export const jsx = (type, props, key) => ({ $$el: true, type, key: key === undefined ? null : key, props: props || {} })
    export const jsxs = jsx
  `),
  speech: stub(`
    export const playWordAudio = () => {}
    export const playRepeating = () => () => {}
    export const stopCurrentAudio = () => {}
    export const playSuccessSound = () => {}
    export const getMicStream = () => Promise.reject(new Error('stub'))
    export const recordWithAutoStop = () => ({ promise: Promise.resolve(null), stop() {} })
    export const transcribeViaServerSTT = () => Promise.resolve(null)
    export const SUCCESS_MSGS = ['ok']; export const FAIL_MSGS = ['no']
    export const rndMsg = (a) => a[0]
    export const unlockAudio = () => {}
  `),
  paulReactions: stub(`
    export const getReactionById = () => ({ id: 'x', image: '/x.png', message: 'm' })
    export const pickReaction = () => ({ id: 'x', image: '/x.png', message: 'm' })
    export const playReactionSound = () => {}
  `),
  useStudent: stub('export const spellingComboBonus = () => 0'),
  wordLibrary: stub('export const requestAudioGeneration = () => {}'),
  browserDetect: stub('export const isInAppBrowser = () => false'),
  useMicReady: stub('export const useMicReady = () => false'),
  inApp: stub('export default function InAppBrowserNotice() { return null }'),
}

await esbuild.build({
  entryPoints: ['src/components/WordDetail.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: 'scripts/.tmp/quizreset',
  jsx: 'automatic',
  plugins: [{
    name: 'virtual-shims',
    setup(build) {
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'v:jsx', namespace: 'v' }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'v:react', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]speech$/ }, () => ({ path: 'v:speech', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
      build.onResolve({ filter: /hooks[\\/]useStudent$/ }, () => ({ path: 'v:student', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]browserDetect$/ }, () => ({ path: 'v:browser', namespace: 'v' }))
      build.onResolve({ filter: /hooks[\\/]useMicReady$/ }, () => ({ path: 'v:mic', namespace: 'v' }))
      build.onResolve({ filter: /InAppBrowserNotice$/ }, () => ({ path: 'v:inapp', namespace: 'v' }))
      build.onLoad({ filter: /^v:jsx$/, namespace: 'v' }, () => VIRTUAL.jsxRuntime)
      build.onLoad({ filter: /^v:react$/, namespace: 'v' }, () => VIRTUAL.react)
      build.onLoad({ filter: /^v:speech$/, namespace: 'v' }, () => VIRTUAL.speech)
      build.onLoad({ filter: /^v:paul$/, namespace: 'v' }, () => VIRTUAL.paulReactions)
      build.onLoad({ filter: /^v:student$/, namespace: 'v' }, () => VIRTUAL.useStudent)
      build.onLoad({ filter: /^v:wordlib$/, namespace: 'v' }, () => VIRTUAL.wordLibrary)
      build.onLoad({ filter: /^v:browser$/, namespace: 'v' }, () => VIRTUAL.browserDetect)
      build.onLoad({ filter: /^v:mic$/, namespace: 'v' }, () => VIRTUAL.useMicReady)
      build.onLoad({ filter: /^v:inapp$/, namespace: 'v' }, () => VIRTUAL.inApp)
    },
  }],
})

const WordDetail = (await import(pathToFileURL(path.resolve('scripts/.tmp/quizreset/WordDetail.js')).href)).default

// ── 2. 미니 컴포넌트 호스트 (fakeReact.mjs 패턴 + useMemo/unmount/props) ────
function depsEqual(a, b) {
  if (a === undefined || b === undefined) return false
  if (a.length !== b.length) return false
  return a.every((v, i) => Object.is(v, b[i]))
}

function mountComponent(fn, initialProps, clock) {
  const cells = []
  let cursor = 0
  let unmounted = false
  const inst = { tree: null, props: initialProps }

  const api = {
    useState(initial) {
      const i = cursor++
      if (!(i in cells)) cells[i] = { kind: 's', value: typeof initial === 'function' ? initial() : initial }
      const cell = cells[i]
      return [cell.value, (u) => {
        if (unmounted) return
        const next = typeof u === 'function' ? u(cell.value) : u
        if (!Object.is(next, cell.value)) { cell.value = next; render() }
      }]
    },
    useRef(initial) {
      const i = cursor++
      if (!(i in cells)) cells[i] = { kind: 'r', current: initial }
      return cells[i]
    },
    useMemo(factory, deps) {
      const i = cursor++
      const prev = cells[i]
      if (!prev || !depsEqual(prev.deps, deps)) cells[i] = { kind: 'm', value: factory(), deps }
      return cells[i].value
    },
    useCallback(cb, deps) { return api.useMemo(() => cb, deps) },
    useEffect(effectFn, deps) {
      const i = cursor++
      cells[i] = cells[i] || { kind: 'e' }
      cells[i].pending = { effectFn, deps }
    },
  }

  const withClock = (body) => {
    const st = globalThis.setTimeout, ct = globalThis.clearTimeout
    globalThis.setTimeout = clock.setTimeout
    globalThis.clearTimeout = clock.clearTimeout
    const prevHooks = globalThis.__FAKE_HOOKS__
    globalThis.__FAKE_HOOKS__ = api
    try { return body() }
    finally { globalThis.setTimeout = st; globalThis.clearTimeout = ct; globalThis.__FAKE_HOOKS__ = prevHooks }
  }

  function render(nextProps) {
    if (nextProps !== undefined) inst.props = nextProps
    withClock(() => {
      cursor = 0
      inst.tree = fn(inst.props)
      for (const cell of cells) {
        if (!cell || cell.kind !== 'e' || !cell.pending) continue
        const { effectFn, deps } = cell.pending
        cell.pending = null
        if (!('committedDeps' in cell) || !depsEqual(cell.committedDeps, deps)) {
          if (typeof cell.cleanup === 'function') cell.cleanup()
          cell.cleanup = effectFn() || undefined
          cell.committedDeps = deps
        }
      }
    })
  }

  inst.render = render
  inst.unmount = () => {
    unmounted = true
    withClock(() => {
      for (const cell of cells) if (cell?.kind === 'e' && typeof cell.cleanup === 'function') cell.cleanup()
    })
  }
  render(initialProps)
  return inst
}

// ── 3. 렌더 트리 검사 헬퍼 ──────────────────────────────────────────────────
function walk(node, visit) {
  if (node == null || node === false || node === true) return
  if (Array.isArray(node)) { node.forEach(n => walk(n, visit)); return }
  if (typeof node === 'string' || typeof node === 'number') { visit(node); return }
  if (node.$$el) {
    visit(node)
    // 호스트 요소만 내부로 — 자식 컴포넌트(HeroReaction 등)는 불투명 취급
    if (typeof node.type === 'string' || node.type === Symbol.for('fake.Fragment')) walk(node.props.children, visit)
  }
}
const textOf = (node) => {
  let out = ''
  walk(node, n => { if (typeof n === 'string' || typeof n === 'number') out += n })
  return out
}
const allButtons = (tree) => {
  const out = []
  walk(tree, n => { if (n?.$$el && n.type === 'button') out.push(n) })
  return out
}
const optionButtons = (tree) => allButtons(tree).filter(b => 'disabled' in b.props)
const hasClass = (tree, cls) => {
  let found = false
  walk(tree, n => { if (n?.$$el && typeof n.props?.className === 'string' && n.props.className.includes(cls)) found = true })
  return found
}
const findStepEl = (tree, word) => {
  let el = null
  walk(tree, n => {
    if (n?.$$el && typeof n.type === 'function' && (n.props?.word === word || n.props?.word === word.word) && n.props?.onDone) el = n
  })
  return el
}

// 완전 초기 상태인가? (선택 없음 / 하이라이트 없음 / 버튼 전부 활성 / 피드백 없음)
function isPristine(tree) {
  const opts = optionButtons(tree)
  return (
    opts.length === 4 &&
    opts.every(b => b.props.disabled === false) &&
    allButtons(tree).length === 4 && // "완료! 다음 단어" 버튼 없음
    !hasClass(tree, 'border-green-400') &&
    !hasClass(tree, 'border-red-400') &&
    !textOf(tree).includes('✅') && !textOf(tree).includes('❌')
  )
}

let failures = 0
const check = (label, cond) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// ── 4. 30문제 연속 전환 시뮬레이션 (quiz 모드 — 버그가 났던 경로 그대로) ──
const N = 30
const words = Array.from({ length: N }, (_, i) => ({
  id: `w${i}`, dbId: null, word: `word${i}`, meaning: `뜻${i}`, wordAudioUrl: null,
}))

console.log(`\n1. quiz 모드 ${N}문제 연속 — 매 문제 완전 초기 상태 + 정답/오답/연타/타이머 정리`)
{
  const clock = createFakeClock()
  let quizAnswerCalls = []
  let advanceRequested = false
  const baseProps = {
    classWords: words, mode: 'quiz',
    onNext: () => { advanceRequested = true },
    onBack: () => {},
    onMarkViewed: () => {}, onMarkQuizSolved: () => {},
    onQuizAnswer: (id, correct) => quizAnswerCalls.push({ id, correct }),
  }

  // WordDetail 인스턴스는 App.jsx처럼 단어가 바뀌어도 재사용(=key 없음)
  const wd = mountComponent(WordDetail, { ...baseProps, word: words[0] }, clock)

  // React 재조정 규칙으로 step 슬롯 관리: 같은 type+key ⇒ 재사용, 다름 ⇒ remount
  let stepInst = null, prevType = null, prevKey = null
  const seenKeys = new Set()
  const reconcileStep = (word) => {
    const el = findStepEl(wd.tree, word)
    if (!el) throw new Error(`step element not found for ${word.id}`)
    seenKeys.add(String(el.key))
    if (stepInst && el.type === prevType && String(el.key) === String(prevKey)) {
      stepInst.render(el.props) // React: 같은 key → 인스턴스 재사용 (상태 유지)
    } else {
      stepInst?.unmount()
      stepInst = mountComponent(el.type, el.props, clock)
    }
    prevType = el.type; prevKey = el.key
    return stepInst
  }

  let perWordFail = 0
  for (let i = 0; i < N; i++) {
    const w = words[i]
    if (i > 0) wd.render({ ...baseProps, word: w })
    const q = reconcileStep(w)

    // (a) 새 문제는 완전 초기 상태로 시작해야 한다
    if (!isPristine(q.tree)) { console.log(`  FAIL  문제 ${i + 1}(${w.id}): 초기 상태 아님 — 이전 선택/하이라이트 이월`); perWordFail++ }
    // (b) 이전 문제의 자동 넘김 타이머가 남아있으면 안 된다
    if (clock.pendingCount() !== 0) { console.log(`  FAIL  문제 ${i + 1}: 잔여 타이머 ${clock.pendingCount()}개`); perWordFail++ }

    // (c) 정답/오답 번갈아 풀기
    const opts = optionButtons(q.tree)
    const correctBtn = opts.find(b => textOf(b).includes(w.meaning))
    const wrongBtn = opts.find(b => !textOf(b).includes(w.meaning))
    const answerCorrect = i % 2 === 0
    const before = quizAnswerCalls.length
    ;(answerCorrect ? correctBtn : wrongBtn).props.onClick()

    const answered = q.tree
    const optsAfter = optionButtons(answered)
    if (!optsAfter.every(b => b.props.disabled === true)) { console.log(`  FAIL  문제 ${i + 1}: 답 선택 후 버튼이 비활성화되지 않음`); perWordFail++ }
    if (!hasClass(answered, 'border-green-400')) { console.log(`  FAIL  문제 ${i + 1}: 정답 하이라이트 없음`); perWordFail++ }
    if (!answerCorrect && !hasClass(answered, 'border-red-400')) { console.log(`  FAIL  문제 ${i + 1}: 오답 하이라이트 없음`); perWordFail++ }
    if (quizAnswerCalls.length !== before + 1) { console.log(`  FAIL  문제 ${i + 1}: onQuizAnswer 기록 누락`); perWordFail++ }

    // (d) 연타 가드: 이미 답했는데 다른 보기를 눌러도 아무 일 없어야 함
    const other = optionButtons(q.tree).find(b => b !== (answerCorrect ? correctBtn : wrongBtn))
    other.props.onClick()
    if (quizAnswerCalls.length !== before + 1) { console.log(`  FAIL  문제 ${i + 1}: 연타로 onQuizAnswer 중복 기록`); perWordFail++ }

    // (e) 다음 문제로 — 짝수 문제는 1.8초 자동 넘김, 홀수 문제는 "완료" 버튼 탭
    advanceRequested = false
    if (i % 2 === 0) {
      clock.advance(1800)
    } else {
      const doneBtn = allButtons(q.tree).find(b => !('disabled' in b.props) && textOf(b).includes('다음 단어'))
      if (!doneBtn) { console.log(`  FAIL  문제 ${i + 1}: "완료! 다음 단어" 버튼 없음`); perWordFail++; continue }
      doneBtn.props.onClick()
    }
    if (!advanceRequested) { console.log(`  FAIL  문제 ${i + 1}: 다음 단어 이동이 요청되지 않음`); perWordFail++ }
  }

  check(`${N}문제 전부: 초기 상태 시작 / 채점 표시 / 연타 가드 / 타이머 정리 (세부 실패 ${perWordFail}건)`, perWordFail === 0)
  check(`step key가 단어마다 유일 (${seenKeys.size}/${N}) — key={word.id} 배선 확인`, seenKeys.size === N)
  check(`onQuizAnswer 정확히 ${N}회 기록 (실측 ${quizAnswerCalls.length}) — testProgress 카운트 경로 보존`, quizAnswerCalls.length === N)
  stepInst?.unmount(); wd.unmount()
}

// ── 5. 컨트롤: key 무시(=수정 전 React 동작)면 이 테스트가 실제로 잡아내는가 ──
console.log('\n2. 컨트롤(회귀 재현) — key 없이 인스턴스를 재사용하면 두 번째 문제가 오염되는가')
{
  const clock = createFakeClock()
  const props = (w) => ({
    word: w, classWords: words, mode: 'quiz',
    onNext: () => {}, onBack: () => {}, onMarkViewed: () => {},
    onMarkQuizSolved: () => {}, onQuizAnswer: () => {},
  })
  const wd = mountComponent(WordDetail, props(words[0]), clock)
  const el1 = findStepEl(wd.tree, words[0])
  const q = mountComponent(el1.type, el1.props, clock)
  optionButtons(q.tree)[0].props.onClick() // 1번 문제에 답함
  clock.advance(1800)

  // 수정 전 동작 재현: 단어가 바뀌어도 같은 인스턴스에 새 props만 흘려보냄
  wd.render(props(words[1]))
  const el2 = findStepEl(wd.tree, words[1])
  q.render(el2.props)
  check('key를 무시하고 재사용하면 2번째 문제가 초기 상태가 아님(=원래 버그를 이 검사가 잡음)', !isPristine(q.tree))
  check('수정본은 단어마다 다른 key를 내려보냄 (w0 ≠ w1)', String(el1.key) !== String(el2.key) && el1.key != null)
  q.unmount(); wd.unmount()
}

// ── 6. study/write 모드도 단어별 key 배선 확인 (같은 결함 클래스 예방) ──────
console.log('\n3. study/write 모드 — 단일 단계 모드 전부 단어별 key 배선')
{
  const clock = createFakeClock()
  for (const mode of ['study', 'write']) {
    const props = (w) => ({
      word: w, classWords: words, mode,
      spellingSettings: { spellingTestEnabled: true, spellingHintEnabled: false, spellingDirection: 'kr2en' },
      onNext: () => {}, onBack: () => {}, onMarkViewed: () => {},
    })
    const wd = mountComponent(WordDetail, props(words[0]), clock)
    const k0 = findStepEl(wd.tree, words[0])?.key
    wd.render(props(words[1]))
    const k1 = findStepEl(wd.tree, words[1])?.key
    check(`${mode} 모드: step key가 단어마다 다름 (${String(k0)} → ${String(k1)})`, k0 != null && k1 != null && String(k0) !== String(k1))
    wd.unmount()
  }
}

console.log(failures === 0
  ? '\n모든 테스트 통과 ✅ — 새 문제마다 완전 초기 상태로 시작함'
  : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
