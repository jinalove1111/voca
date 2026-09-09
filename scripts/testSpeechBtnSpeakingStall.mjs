// scripts/testSpeechBtnSpeakingStall.mjs — FAIL-first reproduction for the
// "따라 말하기 이후 speaking에서 멈춤" 학생 리포트(2026-09, bug/
// speechbtn-speaking-stall 브랜치). TEST-ONLY: does not modify any
// src/ product code. Network 0, DB 0, browser 0 — pure esbuild bundle +
// a minimal hand-rolled hook/JSX-tree simulation (fakeReact 시뮬레이션
// 패턴, TESTING.md §2), reusing scripts/fakeReact.mjs's renderHook/
// createFakeClock read-only (no edits to that shared file).
//
// Suspected defect (see handoff for full writeup):
//   src/components/WordDetail.jsx SpeechBtn.handleClick() sets
//   phase='speaking' and calls playWordAudio(..., { onEnd: startListen,
//   onError: ...startListen }) with NO watchdog timer for the 'speaking'
//   phase itself (the only hang timer lives inside startListen(), i.e.
//   AFTER listening has already begun). src/utils/speech.js's
//   claimTtsCall() guard means starting ANY other TTS call (student taps
//   the pronunciation card / "다시 듣기" / a quiz sound) while the 2x
//   prompt is still playing permanently suppresses SpeechBtn's onEnd —
//   phase stays 'speaking' (button disabled) until the word changes.
//   A second, independent path to the same stall: some Android in-app
//   browsers' speechSynthesis never fires onend/onerror at all — no
//   supersede needed, same permanent stall.
//
// Three parts:
//   A. speech.js layer (offline bundle) — documents the supersede/guard
//      behavior itself is INTENTIONAL and already correct (echo guard).
//      Labeled "전제" — this part PASSES today.
//   B. SpeechBtn component layer — the actual bug reproduction. Bundles
//      the REAL src/components/WordDetail.jsx (unmodified on disk; only
//      the esbuild in-memory copy gets `export { SpeechBtn }` appended)
//      with browser-only imports stubbed, and drives it with a tiny
//      hooks+JSX-tree simulation (no real DOM, no jsdom — none is a
//      project dependency, rule 6 no-new-deps). FAILS today (no
//      watchdog exists).
//   C. Static asymmetry check — startListen() DOES have a hang timer
//      (hangTimerRef + maxMs+4000). PASSES today, contrasted against B.
//
// Run: node scripts/testSpeechBtnSpeakingStall.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { createFakeClock, renderHook } from './fakeReact.mjs'

let failures = 0
let passes = 0
function check(label, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${label}`) }
  else { failures++; console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`) }
}
function section(title) { console.log(`\n${title}`) }

const TMP = path.resolve('scripts/.tmp/speechbtn-stall')
fs.mkdirSync(TMP, { recursive: true })
const write = (name, content) => {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

// ═══════════════════════════════════════════════════════════════════════
// A. speech.js layer — claimTtsCall supersede guard (전제, PASSES today)
// ═══════════════════════════════════════════════════════════════════════
section('A. speech.js 레이어 — claimTtsCall 슈퍼시드 가드 (전제, 오늘 PASS 예상)')
{
  execSync('node scripts/buildSpeechBundle.mjs', { stdio: 'pipe' })
  const bundlePath = path.resolve('scripts/.tmp/speech.bundle.mjs')
  if (!fs.existsSync(bundlePath)) {
    check('speech.bundle.mjs 생성됨', false, 'buildSpeechBundle.mjs 실행 후에도 파일 없음')
  } else {
    // Minimal browser globals playWordAudio's playAudioUrl()/claimTtsCall's
    // stopAllPlayback() touch — mirrors scripts/testTtsSingleton.mjs.
    class FakeAudio {
      constructor(url) {
        this.url = url
        this.volume = 1
        this.playbackRate = 1
        this.onended = null
        this.onerror = null
        FakeAudio.instances.push(this)
      }
      play() { return Promise.resolve() }
    }
    FakeAudio.instances = []
    globalThis.Audio = FakeAudio
    globalThis.window = {
      speechSynthesis: { speaking: false, pending: false, cancel: () => {} },
    }
    // getSpeechRate()/setSpeechRate() read/write localStorage directly (not
    // via window.localStorage) — stub the bare global too.
    const lsStore = new Map()
    globalThis.localStorage = {
      getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
      setItem: (k, v) => lsStore.set(k, String(v)),
      removeItem: (k) => lsStore.delete(k),
    }
    const { playWordAudio } = await import(pathToFileURL(bundlePath).href)

    let endFired = false
    playWordAudio('https://x/a.mp3', 'apple', {
      times: 2,
      source: 'speechbtn-prompt',
      onEnd: () => { endFired = true },
    })
    const first = FakeAudio.instances[0]
    check('첫 재생(SpeechBtn 프롬프트) Audio 인스턴스 생성됨', !!first)

    // Student taps the pronunciation card / "다시 듣기" while the prompt is
    // still playing — a second independent playWordAudio call starts.
    playWordAudio('https://x/a.mp3', 'apple', { source: 'pronounce-word' })
    const second = FakeAudio.instances[1]
    check('두 번째 재생(카드탭/다시듣기) Audio 인스턴스 생성됨', !!second)

    // The FIRST call's audio element eventually fires onended (its own
    // async lifecycle continuing regardless of the newer call) — twice,
    // to also prove the guard isn't a one-shot fluke.
    first.onended?.()
    first.onended?.()
    check('슈퍼시드된 첫 번째 호출의 onEnd는 끝내 호출되지 않음(에코 방지 — 의도된 동작)', endFired === false)
  }
}

// ═══════════════════════════════════════════════════════════════════════
// B. SpeechBtn component layer — dynamic reproduction (FAILS today)
// ═══════════════════════════════════════════════════════════════════════
section('B. SpeechBtn 컴포넌트 레이어 — 동적 재현 (오늘 FAIL 예상, 실제 버그)')

// ── B-0. 컨트롤 가능한 speech 스텁을 실 파일로 기록 ────────────────────────
// 번들된 WordDetail.jsx와 이 테스트 스크립트가 "같은" 모듈 인스턴스를 공유해야
// (calls[] 배열을 서로 보고 조작) 하므로, scripts/wordLibraryRaceStub.mjs와
// 동일하게 실 파일 + 같은 file:// URL import 패턴을 쓴다(인메모리 가상 모듈은
// 번들 내부에서만 보이고 테스트 스크립트에서 재사용할 수 없음).
const fakeSpeechPath = write('fakeSpeech.mjs', `
// calls[i] = { url, fallbackText, opts, superseded }
export const calls = []
export const getMicStreamCalls = []
export function playWordAudio(url, fallbackText, opts = {}) {
  // Mirrors src/utils/speech.js claimTtsCall(): starting a NEW call always
  // marks every PREVIOUS call stale/superseded — that guard itself is
  // exercised for real in part A above; here it's just recorded so the
  // test can decide whether a given call's onEnd/onError is still "live".
  calls.forEach((c) => { c.superseded = true })
  calls.push({ url, fallbackText, opts, superseded: false })
  return calls.length - 1
}
export function fireOnEnd(id) {
  const c = calls[id]
  if (!c || c.superseded) return false
  c.opts.onEnd?.()
  return true
}
export function fireOnError(id, msg) {
  const c = calls[id]
  if (!c || c.superseded) return false
  c.opts.onError?.(msg)
  return true
}
export function reset() { calls.length = 0; getMicStreamCalls.length = 0 }
export function stopCurrentAudio() {}
export function unlockAudio() {}
// startListen()'s own dependencies — a never-resolving promise is enough:
// the test only needs to assert startListen was ENTERED and getMicStream
// was called, not to run recording/STT to completion.
export function getMicStream() { getMicStreamCalls.push(1); return new Promise(() => {}) }
export function recordWithAutoStop() { return { promise: new Promise(() => {}), stop() {} } }
export async function transcribeViaServerSTT() { return null }
export const SUCCESS_MSGS = ['ok']
export const FAIL_MSGS = ['no']
export const rndMsg = (a) => a[0]
`)

// ── B-1. esbuild 번들: 진짜 WordDetail.jsx + export { SpeechBtn } 추가 ─────
// (in-memory only — 실 파일은 절대 건드리지 않음). react / react/jsx-runtime은
// hookIndex 기반 최소 훅 런타임(fakeReact.mjs의 renderHook이 기대하는
// globalThis.__FAKE_HOOKS__)과, 트리를 평범한 객체({type,props})로만
// 만드는 jsx()로 대체한다 — 실제 DOM/리컨실러 없이도 handleClick의
// onClick 핸들러와 disabled/텍스트 상태를 그대로 검사할 수 있다.
const OUT_ENTRY = path.join(TMP, 'entry.jsx')
const wordDetailAbsPath = path.resolve('src/components/WordDetail.jsx').replace(/\\/g, '/')
fs.writeFileSync(OUT_ENTRY, `export { SpeechBtn } from '${wordDetailAbsPath}'\n`)

const vstub = (contents) => ({ contents, loader: 'js' })
const REACT_STUB = `
export const useState = (...a) => globalThis.__FAKE_HOOKS__.useState(...a)
export const useEffect = (...a) => globalThis.__FAKE_HOOKS__.useEffect(...a)
export const useRef = (...a) => globalThis.__FAKE_HOOKS__.useRef(...a)
// SpeechBtn itself never calls useMemo — this export only exists so the
// file's top-level \`import { useMemo } from 'react'\` resolves (other
// functions in the same module use it; those functions are never invoked
// by this test).
export const useMemo = (fn) => fn()
export default {}
`
const JSX_RUNTIME_STUB = `
export const Fragment = Symbol('Fragment')
export function jsx(type, props) { return { type, props } }
export function jsxs(type, props) { return { type, props } }
`

await esbuild.build({
  entryPoints: [OUT_ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: path.join(TMP, 'SpeechBtn.bundle.mjs'),
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [{
    name: 'speechbtn-test-stubs',
    setup(build) {
      // WordDetail.jsx's own SpeechBtn function isn't exported by the real
      // file — the wrapper entry.jsx above re-exports it, which esbuild
      // resolves through the SAME loader esbuild would normally use for a
      // .jsx file (this onResolve/onLoad pair is NOT overriding the real
      // file's contents, only routing the import graph).
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'v:react', namespace: 'v' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'v:jsxruntime', namespace: 'v' }))
      // external:true — leave this import unbundled so Node's own ESM loader
      // resolves it separately, giving the test script (which imports the
      // exact same file:// URL below) the SAME live module singleton (the
      // wordLibraryRaceStub.mjs/testStudentPathContracts.mjs convention —
      // without external:true, esbuild would inline a disconnected copy).
      build.onResolve({ filter: /utils[\\/]speech$/ }, () => ({ path: pathToFileURL(fakeSpeechPath).href, external: true }))
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]browserDetect$/ }, () => ({ path: 'v:browser', namespace: 'v' }))
      build.onResolve({ filter: /InAppBrowserNotice$/ }, () => ({ path: 'v:inapp', namespace: 'v' }))
      build.onResolve({ filter: /SpellingQuestion$/ }, () => ({ path: 'v:spelling', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
      build.onResolve({ filter: /HeroReaction$/ }, () => ({ path: 'v:hero', namespace: 'v' }))
      build.onResolve({ filter: /learning[\\/]engine[\\/]LearningEngine$/ }, () => ({ path: 'v:engine', namespace: 'v' }))
      build.onResolve({ filter: /learning[\\/]adapters[\\/]learningItem$/ }, () => ({ path: 'v:learnitem', namespace: 'v' }))

      // WordDetail.jsx does not export SpeechBtn — read the REAL file's
      // source unmodified from disk and append one export line to esbuild's
      // in-memory copy only (the file on disk is never touched).
      build.onLoad({ filter: /WordDetail\.jsx$/ }, (args) => {
        const src = fs.readFileSync(args.path, 'utf8')
        return { contents: src + '\nexport { SpeechBtn }\n', loader: 'jsx', resolveDir: path.dirname(args.path) }
      })

      build.onLoad({ filter: /^v:react$/, namespace: 'v' }, () => vstub(REACT_STUB))
      build.onLoad({ filter: /^v:jsxruntime$/, namespace: 'v' }, () => vstub(JSX_RUNTIME_STUB))
      build.onLoad({ filter: /^v:wordlib$/, namespace: 'v' }, () => vstub('export const requestAudioGeneration = () => {}'))
      build.onLoad({ filter: /^v:browser$/, namespace: 'v' }, () => vstub('export const isInAppBrowser = () => false'))
      build.onLoad({ filter: /^v:inapp$/, namespace: 'v' }, () => vstub("export default function InAppBrowserNotice() { return null }"))
      build.onLoad({ filter: /^v:spelling$/, namespace: 'v' }, () => vstub('export default function SpellingQuestion() { return null }'))
      build.onLoad({ filter: /^v:paul$/, namespace: 'v' }, () => vstub(`
        export const pickReaction = () => ({ id: 'x', image: '/x.png', message: 'm' })
        export const playReactionSound = () => {}
        export const getReactionById = () => ({ id: 'x', image: '/x.png', message: 'm' })
      `))
      build.onLoad({ filter: /^v:hero$/, namespace: 'v' }, () => vstub('export default function HeroReaction() { return null }'))
      build.onLoad({ filter: /^v:engine$/, namespace: 'v' }, () => vstub('export default function LearningEngine() { return null }'))
      build.onLoad({ filter: /^v:learnitem$/, namespace: 'v' }, () => vstub('export const fromExample = () => null'))
    },
  }],
})

const { SpeechBtn } = await import(pathToFileURL(path.join(TMP, 'SpeechBtn.bundle.mjs')).href)
const speechStub = await import(pathToFileURL(fakeSpeechPath).href)
check('esbuild 번들에서 SpeechBtn 함수 추출됨(실 파일 미수정, in-memory export만 추가)', typeof SpeechBtn === 'function')

// ── B-2. 최소 JSX 트리 워커 (실 DOM/리컨실러 없음 — jsx()가 만든 {type,props}
// 순수 객체 트리를 그대로 순회) ─────────────────────────────────────────────
function collectElements(node, typeMatch, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach((n) => collectElements(n, typeMatch, out)); return out }
  if (node.type === typeMatch) out.push(node)
  const children = node.props?.children
  if (children !== undefined) collectElements(children, typeMatch, out)
  return out
}
function mainButton(tree) { return collectElements(tree, 'button')[0] }

// setTimeout/clearTimeout 레코더 — handleClick 실행 동안(테스트가 직접 부르는
// 시점, fakeReact.mjs의 renderHook()이 실행되는 run() 구간 밖) 실제로 예약된
// 타이머가 있는지 관찰한다. speaking phase watchdog이 있다면 여기 잡혀야 함.
function withTimerRecorder(fn) {
  const scheduled = []
  const realSetTimeout = global.setTimeout
  const realClearTimeout = global.clearTimeout
  global.setTimeout = (cb, ms, ...rest) => { const id = realSetTimeout(cb, ms, ...rest); scheduled.push({ id, ms }); return id }
  global.clearTimeout = (id) => { realClearTimeout(id); const i = scheduled.findIndex((t) => t.id === id); if (i >= 0) scheduled.splice(i, 1) }
  try { fn() } finally { global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout }
  return scheduled
}

// startListen()이 navigator.mediaDevices.getUserMedia 존재 여부만 확인하고
// 실제 스트림은 speech 스텁의 getMicStream()으로 받으므로, truthy 값만 있으면 됨.
// Node 24+ has a built-in read-only `navigator` global — override via
// defineProperty instead of a plain assignment (which throws).
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: { getUserMedia: () => {} } },
  configurable: true,
})

const baseProps = { target: 'apple', wordAudioUrl: 'https://x/apple.mp3', maxMs: 5000 }

section('B1. 재생 중 슈퍼시드(카드탭/다시듣기) → onEnd 영원히 안 옴 → 15초 후에도 버튼 여전히 잠김 (FAIL 예상)')
{
  speechStub.reset()
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps }), clock)
  let btn = mainButton(host.result)
  check('초기 phase=idle: 버튼 활성화', btn?.props?.disabled !== true)

  const scheduled = withTimerRecorder(() => { mainButton(host.result).props.onClick() })
  btn = mainButton(host.result)
  check("클릭 후 phase='speaking': 버튼 비활성화", btn?.props?.disabled === true)
  check("클릭 후 phase='speaking': 버튼 텍스트 '🔊 잘 들어봐요...'", btn?.props?.children === '🔊 잘 들어봐요...')
  check('speaking phase 진입 시 예약된 워치독 타이머 없음(원인) — 있어야 하는데 없음', scheduled.length > 0, `실제 예약된 타이머 개수=${scheduled.length} (기대: 1개 이상, watchdog)`)

  check('speechbtn-prompt playWordAudio 호출 기록됨', speechStub.calls.length === 1 && speechStub.calls[0].opts.source === 'speechbtn-prompt')

  // 학생이 2배속 프롬프트가 재생되는 동안 발음 카드를 다시 탭하거나
  // "🔁 다시 듣기"를 누름 — PronounceStep/원어민 재생 버튼이 실제로 하는 것과
  // 동일하게 새로운 playWordAudio 호출을 발생시켜 이전 호출을 슈퍼시드시킨다.
  speechStub.playWordAudio(baseProps.wordAudioUrl, baseProps.target, { source: 'pronounce-word' })
  const supersededFired = speechStub.fireOnEnd(0)
  check('슈퍼시드된 SpeechBtn 프롬프트 onEnd는 호출되지 않음(가드 자체는 정상)', supersededFired === false)

  clock.advance(15000) // 대칭성을 위해 fakeReact의 fake clock도 그대로 진행 — 워치독이 있었다면 여기서 발동했을 것
  btn = mainButton(host.result)
  check(
    '15초 경과 후 버튼이 다시 활성화(phase idle/listening)되어야 함 — 학생 구제 경로',
    btn?.props?.disabled !== true,
    `실제: disabled=${btn?.props?.disabled}, text=${JSON.stringify(btn?.props?.children)} (계속 'speaking'에 갇힘 — 이번 리포트의 핵심 증상)`
  )
}

section('B2. 슈퍼시드 없이 onEnd 정상 도착 → startListen 진입 (대조군, 오늘 PASS 예상)')
{
  speechStub.reset()
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps }), clock)
  mainButton(host.result).props.onClick()
  const fired = speechStub.fireOnEnd(0)
  check('onEnd 정상 호출됨(슈퍼시드 없음)', fired === true)
  const btn = mainButton(host.result)
  check("onEnd 이후 phase='listening'으로 전이", btn?.props?.children === '👂 이제 말해봐요!')
  check('startListen()이 실제로 getMicStream()을 호출함', speechStub.getMicStreamCalls.length === 1)
}

section('B3. 기기 TTS onend/onerror 미발화(안드로이드 WebView 버그) — 슈퍼시드 없이도 영구 정지 (FAIL 예상)')
{
  speechStub.reset()
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps }), clock)
  withTimerRecorder(() => { mainButton(host.result).props.onClick() })
  check('speechbtn-prompt playWordAudio 호출 기록됨(2)', speechStub.calls.length === 1)
  // 아무 것도 fire하지 않음 — 기기 speechSynthesis의 onend가 그냥 안 옴.
  clock.advance(15000)
  const btn = mainButton(host.result)
  check(
    '기기 콜백 미발화 + 슈퍼시드도 없음 — 그래도 15초 후 복구되어야 함',
    btn?.props?.disabled !== true,
    `실제: disabled=${btn?.props?.disabled}, text=${JSON.stringify(btn?.props?.children)}`
  )
}

// ═══════════════════════════════════════════════════════════════════════
// C. 정적 비대칭성 — startListen()엔 hang timer가 있음 (오늘 PASS, 대조)
// ═══════════════════════════════════════════════════════════════════════
section('C. 정적 검사 — startListen()의 hang timer 존재 확인 (오늘 PASS, B와 대조)')
{
  const source = fs.readFileSync(path.resolve('src/components/WordDetail.jsx'), 'utf8')
  const hangTimerMatch = source.match(/hangTimerRef\.current\s*=\s*setTimeout\([\s\S]*?maxMs\s*\+\s*4000/)
  check('startListen()에 hangTimerRef + setTimeout(maxMs+4000) 워치독 존재', !!hangTimerMatch)

  const handleClickMatch = source.match(/const handleClick = \(\) => \{[\s\S]*?\n  \}/)
  check('handleClick 블록 추출 성공(정적 대조용)', !!handleClickMatch)
  if (handleClickMatch) {
    const body = handleClickMatch[0]
    const hasSpeakingWatchdog = /setTimeout\([^)]*\)/.test(body) || /speakingTimerRef|speakingWatchdog/.test(body)
    check(
      "handleClick()(speaking phase 진입 지점)에는 그 자체로 워치독이 없음 — 이번 리포트의 근본 원인(기대: 없음=현재/실패해야 정상 수정 후 PASS로 전환)",
      hasSpeakingWatchdog,
      'handleClick 안에 setTimeout/speakingTimerRef가 전혀 없음 — speaking phase에는 자체 타임아웃이 없다(startListen 진입 전까지 무방비)'
    )
  }
}

console.log(`\n${passes} PASS, ${failures} FAIL`)
console.log(failures === 0
  ? '\n모든 단언 통과 — SpeechBtn speaking phase 워치독 정상 동작(수정 완료 후 상태)'
  : `\n${failures}개 단언 실패 ❌ — SpeechBtn speaking phase 워치독 부재 재현됨(수정 전 상태, 실제 학생 리포트와 일치)`)
// 표준 관례(testWritingDirectionResolution.mjs 등)와 동일: FAIL이 있으면
// exit 1. 이 스크립트는 지금(수정 전) exit 1이 나오는 것이 "재현 성공"을
// 뜻한다 — 수정 후에는 exit 0으로 뒤집혀야 회귀 고정이 완료된 것이다.
process.exit(failures > 0 ? 1 : 0)
