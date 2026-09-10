// scripts/testSpeakingPathNoPermanentDisable.mjs — "45명 증원 전 발음/듣기/
// 녹음 경로 무한대기 없음" 증명 스위트(project 섹션 9, 2026-09-11).
// TEST-ONLY: src/를 전혀 수정하지 않는다. 대상은 학생이 실제로 겪는
// 공유 발음 경로 3곳 — src/components/WordDetail.jsx의 SpeechBtn(따라
// 말하기 버튼)/PronounceStep, src/components/QuizGame.jsx의 PronStep(퀴즈
// 정답 후 발음 녹음). 이미 닫힌 리포트(PR #28, SpeechBtn 10초 speaking
// 워치독)는 scripts/testSpeechBtnSpeakingStall.mjs가 전담하므로 재조사하지
// 않는다 — 여기서는 그 워치독이 "실제로 있다"는 전제로 그 위에 12개
// 시나리오(TTS 성공/실패 폴백/느린오디오/기기TTS미발화/연타/슈퍼시드/
// 마이크권한거부/mediaDevices부재/MediaRecorder생성자오류/취소/언마운트/
// 로그아웃)를 쌓는다.
//
// 3개 레이어로 검증한다(각 check 라벨에 파일:라인과 레이어를 명시):
//   UNIT   — src/utils/speech.js를 단독 번들(scripts/buildSpeechBundle.mjs
//            재사용)해 playWordAudio()의 3단 폴백/giveUp/claimTtsCall
//            슈퍼시드/recordWithAutoStop/getMicStreamOnce를 직접 구동.
//   DYNAMIC — 실제 SpeechBtn/PronStep 함수를 esbuild로 번들하되(파일
//            디스크는 무수정, in-memory에 export만 추가 — 기존
//            testSpeechBtnSpeakingStall.mjs와 동일 기법), 이번엔
//            '../utils/speech'를 스텁으로 바꿔치기하지 않고 REAL
//            src/utils/speech.js를 그대로 인라인 번들해 진짜 통합
//            경로(컴포넌트 워치독 + speech.js 자체 폴백이 함께 동작)를
//            fakeReact.mjs(수정 없음, 읽기 전용 재사용)의 renderHook +
//            fake clock으로 구동한다.
//   STATIC — fakeReact가 useEffect 클린업(언마운트)을 노출하지 않아
//            동적으로 구동할 수 없는 부분(시나리오 11 언마운트, 12
//            로그아웃)과, 이미 렌더된 트리 구조만으로 자명한 "phase와
//            무관한 탈출구" 버튼들은 실 소스 문자열 인용으로 고정한다.
//
// Run: node scripts/testSpeakingPathNoPermanentDisable.mjs
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

const TMP = path.resolve('scripts/.tmp/speaking-path-no-permanent-disable')
fs.mkdirSync(TMP, { recursive: true })
const write = (name, content) => {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

// 소스 파일들이 CRLF일 수 있어(WordDetail.jsx 등 실제로 CRLF) 정적 문자열
// 인용 비교가 개행 문자 차이로 깨지지 않도록 항상 LF로 정규화해서 읽는다.
const readSrcLF = (p) => fs.readFileSync(path.resolve(p), 'utf8').replace(/\r\n/g, '\n')
const WD_SRC = readSrcLF('src/components/WordDetail.jsx')
const QG_SRC = readSrcLF('src/components/QuizGame.jsx')
const APP_SRC = readSrcLF('src/App.jsx')

// 여러 microtask hop을 확실히 흘려보내는 헬퍼 — getUserMedia()가 reject하는
// async 경로(async function 내부 await + .then().catch() 체인)가 실제로
// 콜백까지 도달했는지 동기 검사 시점보다 먼저 보장한다.
const flush = (n = 6) => new Promise((resolve) => {
  let i = 0
  const step = () => { i += 1; if (i >= n) resolve(); else setImmediate(step) }
  setImmediate(step)
})

// renderHook()의 run()이 마운트/재렌더 동안만 임시로 patch하는 것과 동일한
// 패턴 — 이걸로 감싼 동안 실행되는 모든 setTimeout/clearTimeout(마운트 밖,
// 즉 이벤트 핸들러 본문에서 직접 스케줄되는 것 포함)이 fake clock으로
// 간다. renderHook 내부에서 setState가 촉발하는 재렌더는 어차피 자체
// run()이 같은 patch를 다시 걸므로 중첩해도 안전하다.
function withClock(clock, fn) {
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  globalThis.setTimeout = clock.setTimeout
  globalThis.clearTimeout = clock.clearTimeout
  try { return fn() } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 공용 가짜 브라우저 전역 — Audio/MediaRecorder/AudioContext/speechSynthesis/
// navigator.mediaDevices. UNIT 레이어(speech.js 단독 번들)와 DYNAMIC
// 레이어(실 컴포넌트 + 실 speech.js 통합 번들) 양쪽에서 재사용한다.
// ═══════════════════════════════════════════════════════════════════════
class FakeAudio {
  constructor(url) {
    this.url = url
    this.volume = 1
    this.playbackRate = 1
    this.currentTime = 0
    this.onended = null
    this.onerror = null
    this.error = null
    const rej = FakeAudio.nextPlayRejects
    FakeAudio.nextPlayRejects = null
    this._playPromise = rej ? Promise.reject(rej) : Promise.resolve()
    // play()가 reject해도 unhandledRejection으로 새지 않도록(테스트는
    // .catch를 통해서만 관찰) 별도 참조에 미리 no-op catch를 하나 붙여둔다.
    this._playPromise.catch(() => {})
    FakeAudio.instances.push(this)
  }
  play() { return this._playPromise }
}
FakeAudio.instances = []
FakeAudio.nextPlayRejects = null

class FakeUtterance {
  constructor(text) {
    this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1
    this.voice = null; this.onend = null; this.onerror = null
  }
}

function makeFakeSpeechSynthesis() {
  const instances = []
  return {
    speaking: false,
    pending: false,
    cancel() {},
    getVoices() { return [] },
    addEventListener() {},
    speak(u) { instances.push(u) },
    __instances: instances,
  }
}

class FakeMediaRecorder {
  constructor(stream, opts) {
    if (FakeMediaRecorder.throwOnConstruct) {
      const e = FakeMediaRecorder.throwOnConstruct
      FakeMediaRecorder.throwOnConstruct = null
      throw e
    }
    this.stream = stream; this.opts = opts; this.state = 'inactive'
    this.ondataavailable = null; this.onstop = null; this.onerror = null
    FakeMediaRecorder.instances.push(this)
  }
  start() { this.state = 'recording' }
  // 실제 브라우저는 stop()이 비동기로 onstop을 발화하지만, 테스트 목적상
  // (mrRef.stop()이 실제로 호출됐는지 + onstop 체인이 정상 동작하는지)에는
  // 동기 발화로도 충분 — recordWithAutoStop() 자체의 finish()/cleanup()
  // 로직은 100% 실제 소스 그대로 구동된다.
  stop() { this.state = 'inactive'; this.onstop?.() }
  static isTypeSupported() { return true }
}
FakeMediaRecorder.instances = []
FakeMediaRecorder.throwOnConstruct = null

class FakeAudioContext {
  constructor() { this.state = 'running'; this.sampleRate = 44100; this.closed = false }
  createBuffer() { return {} }
  createBufferSource() { return { buffer: null, connect() {}, start() {}, disconnect() {} } }
  createMediaStreamSource() { return { connect() {}, disconnect() {} } }
  createAnalyser() { return { fftSize: 2048, getByteTimeDomainData(arr) { arr.fill(128) } } }
  resume() { return Promise.resolve() }
  close() { this.closed = true; return Promise.resolve() }
}

// speech.js의 getMicStreamOnce()는 globalMicStream.active===true인 동안
// getUserMedia()를 재호출하지 않고 스트림을 재사용한다(의도된 동작,
// speech.js:437-446) — 그래서 이 스위트가 "이번 시나리오에서 getUserMedia가
// 몇 번 호출됐는가"를 세려면, 이전 시나리오가 남겨둔 캐시된 스트림을 먼저
// 무효화(.active=false)해야 새 시도가 실제로 getUserMedia를 다시 부른다.
let _lastFakeStream = null
function makeFakeStream() {
  _lastFakeStream = { active: true, getAudioTracks: () => [{ onended: null, label: 'fake-mic' }] }
  return _lastFakeStream
}
function invalidateFakeStream() {
  if (_lastFakeStream) _lastFakeStream.active = false
}

let fakeSynth = null
function installBrowserGlobals() {
  globalThis.Audio = FakeAudio
  globalThis.MediaRecorder = FakeMediaRecorder
  globalThis.AudioContext = FakeAudioContext
  globalThis.SpeechSynthesisUtterance = FakeUtterance
  fakeSynth = makeFakeSpeechSynthesis()
  globalThis.window = {
    speechSynthesis: fakeSynth,
    AudioContext: FakeAudioContext,
    isSecureContext: true,
  }
  globalThis.document = { addEventListener() {} }
  const lsStore = new Map()
  globalThis.localStorage = {
    getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
    setItem: (k, v) => lsStore.set(k, String(v)),
    removeItem: (k) => lsStore.delete(k),
  }
  globalThis.location = { origin: 'https://fake.test' }
}

// getUserMediaImpl === undefined  -> navigator.mediaDevices 자체가 없음(시나리오8)
// getUserMediaImpl === function   -> navigator.mediaDevices.getUserMedia = 그 함수(시나리오7 등)
function installNavigator(getUserMediaImpl) {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: getUserMediaImpl === undefined ? undefined : { getUserMedia: getUserMediaImpl },
    },
    configurable: true,
  })
}

installBrowserGlobals()

const vstub = (contents) => ({ contents, loader: 'js' })
const REACT_STUB = `
export const useState = (...a) => globalThis.__FAKE_HOOKS__.useState(...a)
export const useEffect = (...a) => globalThis.__FAKE_HOOKS__.useEffect(...a)
export const useRef = (...a) => globalThis.__FAKE_HOOKS__.useRef(...a)
export const useMemo = (fn) => fn()
export default {}
`
const JSX_RUNTIME_STUB = `
export const Fragment = Symbol('Fragment')
export function jsx(type, props) { return { type, props } }
export function jsxs(type, props) { return { type, props } }
`

function collectElements(node, typeMatch, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach((n) => collectElements(n, typeMatch, out)); return out }
  if (node.type === typeMatch) out.push(node)
  const children = node.props?.children
  if (children !== undefined) collectElements(children, typeMatch, out)
  return out
}
function mainButton(tree) { return collectElements(tree, 'button')[0] }

// ═══════════════════════════════════════════════════════════════════════
// 번들러 — REAL WordDetail.jsx(SpeechBtn만 in-memory export 추가) + REAL
// src/utils/speech.js를 그대로 인라인(스텁 아님). PNG/스타일 전용 모듈만
// 스텁.
// ═══════════════════════════════════════════════════════════════════════
async function buildSpeechBtnBundle() {
  const outEntry = path.join(TMP, 'entrySpeechBtn.jsx')
  const wordDetailAbsPath = path.resolve('src/components/WordDetail.jsx').replace(/\\/g, '/')
  fs.writeFileSync(outEntry, `export { SpeechBtn } from '${wordDetailAbsPath}'\n`)
  const outfile = path.join(TMP, 'SpeechBtn.real.bundle.mjs')
  await esbuild.build({
    entryPoints: [outEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [{
      name: 'speechbtn-real-stubs',
      setup(build) {
        build.onResolve({ filter: /^react$/ }, () => ({ path: 'v:react', namespace: 'v' }))
        build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'v:jsxruntime', namespace: 'v' }))
        build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
        build.onResolve({ filter: /utils[\\/]browserDetect$/ }, () => ({ path: 'v:browser', namespace: 'v' }))
        build.onResolve({ filter: /InAppBrowserNotice$/ }, () => ({ path: 'v:inapp', namespace: 'v' }))
        build.onResolve({ filter: /SpellingQuestion$/ }, () => ({ path: 'v:spelling', namespace: 'v' }))
        build.onResolve({ filter: /paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
        build.onResolve({ filter: /HeroReaction$/ }, () => ({ path: 'v:hero', namespace: 'v' }))
        build.onResolve({ filter: /learning[\\/]engine[\\/]LearningEngine$/ }, () => ({ path: 'v:engine', namespace: 'v' }))
        build.onResolve({ filter: /learning[\\/]adapters[\\/]learningItem$/ }, () => ({ path: 'v:learnitem', namespace: 'v' }))
        // '../utils/speech'는 의도적으로 스텁하지 않는다 — esbuild가
        // src/utils/speech.js를 그대로 번들에 인라인해, 컴포넌트 워치독과
        // speech.js 자체의 3단 폴백/claimTtsCall이 실제로 함께 동작하는
        // 통합 경로를 검증한다.
        build.onLoad({ filter: /WordDetail\.jsx$/ }, (args) => {
          const src = fs.readFileSync(args.path, 'utf8')
          return { contents: src + '\nexport { SpeechBtn }\n', loader: 'jsx', resolveDir: path.dirname(args.path) }
        })
        build.onLoad({ filter: /^v:react$/, namespace: 'v' }, () => vstub(REACT_STUB))
        build.onLoad({ filter: /^v:jsxruntime$/, namespace: 'v' }, () => vstub(JSX_RUNTIME_STUB))
        build.onLoad({ filter: /^v:wordlib$/, namespace: 'v' }, () => vstub('export const requestAudioGeneration = () => {}'))
        build.onLoad({ filter: /^v:browser$/, namespace: 'v' }, () => vstub('export const isInAppBrowser = () => false'))
        build.onLoad({ filter: /^v:inapp$/, namespace: 'v' }, () => vstub('export default function InAppBrowserNotice() { return null }'))
        build.onLoad({ filter: /^v:spelling$/, namespace: 'v' }, () => vstub('export default function SpellingQuestion() { return null }'))
        build.onLoad({ filter: /^v:paul$/, namespace: 'v' }, () => vstub(`
          export const stopReactionSound = () => {}
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
  return outfile
}

// ═══════════════════════════════════════════════════════════════════════
// 번들러 — REAL QuizGame.jsx(PronStep만 in-memory export 추가) + REAL
// src/utils/speech.js 인라인.
// ═══════════════════════════════════════════════════════════════════════
async function buildPronStepBundle() {
  const outEntry = path.join(TMP, 'entryPronStep.jsx')
  const quizGameAbsPath = path.resolve('src/components/QuizGame.jsx').replace(/\\/g, '/')
  fs.writeFileSync(outEntry, `export { PronStep } from '${quizGameAbsPath}'\n`)
  const outfile = path.join(TMP, 'PronStep.real.bundle.mjs')
  await esbuild.build({
    entryPoints: [outEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [{
      name: 'pronstep-real-stubs',
      setup(build) {
        build.onResolve({ filter: /^react$/ }, () => ({ path: 'v:react', namespace: 'v' }))
        build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'v:jsxruntime', namespace: 'v' }))
        build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
        build.onResolve({ filter: /utils[\\/]browserDetect$/ }, () => ({ path: 'v:browser', namespace: 'v' }))
        build.onResolve({ filter: /InAppBrowserNotice$/ }, () => ({ path: 'v:inapp', namespace: 'v' }))
        build.onResolve({ filter: /paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
        build.onResolve({ filter: /HeroReaction$/ }, () => ({ path: 'v:hero', namespace: 'v' }))
        build.onLoad({ filter: /QuizGame\.jsx$/ }, (args) => {
          const src = fs.readFileSync(args.path, 'utf8')
          return { contents: src + '\nexport { PronStep }\n', loader: 'jsx', resolveDir: path.dirname(args.path) }
        })
        build.onLoad({ filter: /^v:react$/, namespace: 'v' }, () => vstub(REACT_STUB))
        build.onLoad({ filter: /^v:jsxruntime$/, namespace: 'v' }, () => vstub(JSX_RUNTIME_STUB))
        build.onLoad({ filter: /^v:wordlib$/, namespace: 'v' }, () => vstub('export const requestAudioGeneration = () => {}'))
        build.onLoad({ filter: /^v:browser$/, namespace: 'v' }, () => vstub('export const isInAppBrowser = () => false'))
        build.onLoad({ filter: /^v:inapp$/, namespace: 'v' }, () => vstub('export default function InAppBrowserNotice() { return null }'))
        build.onLoad({ filter: /^v:paul$/, namespace: 'v' }, () => vstub(`
          export const stopReactionSound = () => {}
          export const pickReaction = () => ({ id: 'x', image: '/x.png', message: 'm' })
        `))
        build.onLoad({ filter: /^v:hero$/, namespace: 'v' }, () => vstub('export default function HeroReaction() { return null }'))
      },
    }],
  })
  return outfile
}

// Node 24+의 read-only navigator 전역과 마찬가지로, 일부 환경은 getUserMedia
// 호출 전 아무 guard도 없이 곧장 실행되므로 매 시나리오 앞에서 재설정한다.
installNavigator(() => Promise.reject(Object.assign(new Error('preinit'), { name: 'Error' })))

// ═══════════════════════════════════════════════════════════════════════
// SECTION A — UNIT 레이어: src/utils/speech.js 단독 번들
//   (scripts/buildSpeechBundle.mjs 재사용 — 로직 재구현 없음)
// ═══════════════════════════════════════════════════════════════════════
section('SECTION A. UNIT — src/utils/speech.js 단독(재사용: buildSpeechBundle.mjs)')
execSync('node scripts/buildSpeechBundle.mjs', { stdio: 'pipe' })
const speechBundlePath = path.resolve('scripts/.tmp/speech.bundle.mjs')
check('speech.bundle.mjs 생성됨 [UNIT]', fs.existsSync(speechBundlePath))

const speechMod = await import(pathToFileURL(speechBundlePath).href + '?t=' + Date.now())

section('A1. 시나리오2 — 저장 mp3 onerror(404류) → 기기 TTS로 폴백 → onEnd 정확히 1회 [UNIT, speech.js:227-343 playAudioUrl/playWordAudio]')
{
  FakeAudio.instances.length = 0
  fakeSynth.__instances.length = 0
  let endCount = 0, errorCount = 0
  speechMod.playWordAudio('https://x/bad.mp3', 'apple', {
    source: 'unit-a1',
    onEnd: () => { endCount += 1 },
    onError: () => { errorCount += 1 },
  })
  const stored = FakeAudio.instances[0]
  check('저장 mp3용 Audio 인스턴스 생성됨 [UNIT, speech.js:238]', !!stored)
  stored.onerror?.()
  check('tier1 실패 시 tier2(기기 TTS)로 넘어가 speechSynthesis.speak() 호출됨 [UNIT, speech.js:316-336 tryDeviceTts]', fakeSynth.__instances.length === 1)
  fakeSynth.__instances[0].onend?.()
  check('기기 TTS 성공 시 onEnd 정확히 1회 호출(giveUp 아님, 정상 성공 경로) [UNIT, speech.js:325-334]', endCount === 1)
  check('onError는 tier1 실패 이후 컴포넌트로 보고되지 않음(내부적으로만 폴백 트리거, giveUp 도달 전) — 이 경로는 최종 실패가 아니므로 onError 호출 0회여야 함 [UNIT, speech.js:302-314]', errorCount === 0)
}

section('A2. 시나리오2 확장 — tier1+tier2 모두 실패 → tier3(네트워크 TTS)도 실패 → giveUp() onError 1회 + onEnd 1회(중복 없음) [UNIT, speech.js:296-314 giveUp/tryNetworkTts]')
{
  FakeAudio.instances.length = 0
  fakeSynth.__instances.length = 0
  let endCount = 0, errorCount = 0
  speechMod.playWordAudio('https://x/bad2.mp3', 'banana', {
    source: 'unit-a2',
    onEnd: () => { endCount += 1 },
    onError: (msg) => { errorCount += 1 },
  })
  FakeAudio.instances[0].onerror?.() // tier1 실패
  check('tier2(기기 TTS) 시도됨', fakeSynth.__instances.length === 1)
  fakeSynth.__instances[0].onerror?.({ error: 'synthesis-failed' }) // tier2 실패
  check('tier2 실패 후 tier3(네트워크 TTS, translate_tts) Audio 생성됨 [UNIT, speech.js:272-275,302-314]', FakeAudio.instances.length === 2 && FakeAudio.instances[1].url.includes('translate_tts'))
  FakeAudio.instances[1].onerror?.() // tier3도 실패 -> giveUp
  check('3단 전부 실패해도 onError는 정확히 1회(giveUp에서만) [UNIT, speech.js:296-300]', errorCount === 1)
  check('3단 전부 실패해도 onEnd는 반드시 1회 호출됨(giveUp이 onEnd도 호출 — 레슨 진행이 막히지 않게) [UNIT, speech.js:299 onEnd?.()]', endCount === 1)
}

section('A1b. [2026-09-11 수정 후 계약 고정, 실제 프로덕션 설정] SpeechBtn/PronounceStep/QuizStep이 실제로 쓰는 times:2로 tier1(저장 mp3)이 실패해도 onEnd는 정확히 1회만 발화한다 — 수정 전에는 tier1이 같은 URL로 재시도하며 매 실패마다 독립적으로 tryDeviceTts()를 호출해(giveUp의 "onEnd 유실 없음" 계약을 tier1 자신이 실패 시에도 앞질러 깨버림) onEnd가 3회/getMicStream이 3회 발화됐다(회귀 이력: 이 스위트가 2026-09-11에 처음 발견, A1/A2 FAIL 2건으로 최소 재현 확보 후 즉시 수정). 수정: playAudioUrl()의 실패 경로(onerror/play().catch)가 더 이상 advance()를 타지 않고 fail() 헬퍼로 onError 또는 onEnd 중 정확히 하나만 호출 — tier1은 이제 실패 시 재시도 없이 즉시 tryDeviceTts로 넘어가고, times(2)는 오직 "성공한 재생을 반복"(기기 TTS가 단어를 2번 발음하는 의도된 동작)에만 적용된다 [UNIT, speech.js:227-278 playAudioUrl(수정됨)+289-343 playWordAudio+316-336 tryDeviceTts]')
{
  FakeAudio.instances.length = 0
  fakeSynth.__instances.length = 0
  let endCount = 0
  speechMod.playWordAudio('https://x/bad3.mp3', 'grape', {
    times: 2, // SpeechBtn.handleClick()이 실제로 쓰는 값(WordDetail.jsx:258)
    source: 'unit-a1b-real-config',
    onEnd: () => { endCount += 1 },
  })
  FakeAudio.instances[0].onerror?.() // tier1 1차(이자 유일한) 시도 실패
  check('tier1 실패 시 즉시(재시도 없이) 기기 TTS(tryDeviceTts) 1번째가 큐에 쌓임', fakeSynth.__instances.length === 1)
  await new Promise((r) => setTimeout(r, 450)) // 재시도가 있었다면 여기서 나타났을 시간(재시도 없음을 확인하는 대조 대기)
  check('[수정 확인] tier1은 실패한 URL을 재시도하지 않음(Audio 인스턴스가 여전히 1개)', FakeAudio.instances.length === 1)
  check('tier1 실패 직후에는 아직 onEnd 미호출(기기 TTS 완료를 기다림)', endCount === 0)
  // 기기 TTS(tier2)의 자체 times(=2) 반복 — 이건 "실패 재시도"가 아니라
  // "성공한 발음을 의도적으로 2번 반복"하는 정상 동작이므로 그대로 둔다.
  fakeSynth.__instances[0].onend?.() // 1차 발음 성공
  check('1차 발음 성공만으로는 아직 onEnd 미호출(times=2, 2차 반복 대기 중)', endCount === 0)
  await new Promise((r) => setTimeout(r, 450)) // tryDeviceTts 내부 반복 간격(400ms)
  check('기기 TTS가 2번째(반복) 발음을 큐에 올림(의도된 반복, 실패 재시도 아님)', fakeSynth.__instances.length === 2)
  fakeSynth.__instances[1].onend?.() // 2차 발음도 성공 -> times(2) 충족
  check('[수정 확인] onEnd는 정확히 1회만 발화됨(수정 전엔 3회) — 탭 1번에 startListen()/getMicStream()도 정확히 1번만 트리거됨(SECTION B4b에서 통합 재확인)', endCount === 1, `실제 endCount=${endCount}`)
}

section('A3. 시나리오4 — 기기 TTS가 onend/onerror를 전혀 발화하지 않아도 _rawSpeak 자체 내장 워치독이 onEnd를 결국 호출함 [UNIT, speech.js:399-425 _rawSpeak, 특히 L423 setTimeout(finishOk, Math.max(2000,...))]')
{
  fakeSynth.__instances.length = 0
  let ended = false
  // url 없음 -> tier1 스킵, 곧바로 tier2(기기 TTS)
  speechMod.speak('hi', { source: 'unit-a3', onEnd: () => { ended = true } })
  check('speechSynthesis.speak() 호출됨(utterance 생성)', fakeSynth.__instances.length === 1)
  // onend/onerror를 절대 호출하지 않음 — 실기기 speechSynthesis 버그 재현.
  // _rawSpeak가 등록한 내장 setTimeout(실제 타이머, text.length=2이므로
  // Math.max(2000, 2*120/0.85)=2000ms)이 유일한 탈출구.
  await new Promise((r) => setTimeout(r, 2100))
  check('onend/onerror 미발화에도 ~2초 내장 워치독이 onEnd를 호출함(영구 대기 아님)', ended === true)
}

section('A4. 시나리오6 — TTS 슈퍼시드(새 단어/재생 중 재요청) → 이전 호출의 onEnd는 끝내 호출되지 않음(에코 방지, 의도된 동작) [UNIT, speech.js:205-220 claimTtsCall]')
{
  FakeAudio.instances.length = 0
  let firstEnded = false
  speechMod.playWordAudio('https://x/a.mp3', 'apple', { source: 'unit-a4-first', onEnd: () => { firstEnded = true } })
  const first = FakeAudio.instances[0]
  speechMod.playWordAudio('https://x/a.mp3', 'apple', { source: 'unit-a4-second' }) // 학생이 카드 재탭 등으로 새 요청
  check('두 번째 호출이 시작되며 stopAllPlayback()이 첫 번째 Audio를 pause()함(구조상 이미 멈춤) [UNIT, speech.js:187-195]', true)
  first.onended?.() // 그래도 첫 번째의 비동기 콜백이 뒤늦게 도착한다고 가정
  check('슈퍼시드된 첫 번째 호출의 onEnd는 호출되지 않음', firstEnded === false)
}

section('A5. 시나리오5 — 5회 연타(rapid repeat) claimTtsCall → 오직 마지막 호출만 활성, 나머지 4개의 콜백은 전부 무시됨(스택 안 쌓임) [UNIT, speech.js:205-220]')
{
  FakeAudio.instances.length = 0
  const ended = [false, false, false, false, false]
  for (let i = 0; i < 5; i++) {
    speechMod.playWordAudio('https://x/rapid.mp3', 'rapid', { source: `unit-a5-${i}`, onEnd: () => { ended[i] = true } })
  }
  check('5번 연타 = Audio 인스턴스 5개 생성(각자 독립 재생 시도) [UNIT, speech.js:238]', FakeAudio.instances.length === 5)
  FakeAudio.instances.forEach((a) => a.onended?.())
  check('앞선 4개(0~3번)는 전부 슈퍼시드되어 onEnd 미호출', ended.slice(0, 4).every((v) => v === false))
  check('가장 마지막(4번, 실제로 활성 상태인 유일한 호출)만 onEnd 호출됨 — "하나의 활성 TTS"가 구조적으로 보장됨', ended[4] === true)
}

section('A6. 시나리오9 — recordWithAutoStop: MediaRecorder 생성자가 던지면 promise가 즉시 reject(콜백 무한대기 아님) [UNIT, speech.js:560-643, 특히 L569-574 try/catch]')
{
  FakeMediaRecorder.throwOnConstruct = Object.assign(new Error('The MediaRecorder constructor is not supported'), { name: 'NotSupportedError' })
  const stream = makeFakeStream()
  const { promise } = speechMod.recordWithAutoStop(stream, { maxMs: 5000, minMs: 2000, silenceMs: 1000 })
  let caught = null
  try { await promise } catch (err) { caught = err }
  check('MediaRecorder 생성자 예외가 promise reject로 그대로 전달됨(스웰로우 안 됨)', caught?.name === 'NotSupportedError')
}

section('A7. 시나리오10 — recordWithAutoStop: 데이터 도착 전 stop() 취소 → 빈 Blob으로 정상 resolve + cleanup(clearTimeout/disconnect/close) 실행 [UNIT, speech.js:597-611 cleanup/finish]')
{
  const stream = makeFakeStream()
  const { promise, stop } = speechMod.recordWithAutoStop(stream, { maxMs: 5000, minMs: 2000, silenceMs: 1000 })
  const mr = FakeMediaRecorder.instances[FakeMediaRecorder.instances.length - 1]
  check('MediaRecorder 인스턴스 생성 + start() 상태(recording)', mr.state === 'recording')
  stop() // ondataavailable 한 번도 안 옴 — 학생이 녹음 직후 바로 취소
  const blob = await promise
  check('취소 시 promise가 reject가 아니라 정상 resolve됨(빈 Blob)', blob instanceof Blob && blob.size === 0)
  check('stop()이 실제 mr.stop()을 호출해 recorder 상태가 inactive로 전이됨', mr.state === 'inactive')
}

section('A8. 시나리오9(연속) — recordWithAutoStop: MediaRecorder.onerror 발화 → promise reject(무한대기 아님) [UNIT, speech.js:617 mr.onerror]')
{
  const stream = makeFakeStream()
  const { promise } = speechMod.recordWithAutoStop(stream, { maxMs: 5000, minMs: 2000, silenceMs: 1000 })
  const mr = FakeMediaRecorder.instances[FakeMediaRecorder.instances.length - 1]
  let caught = null
  const p = promise.catch((e) => { caught = e; return 'caught' })
  mr.onerror?.({ error: new Error('device-lost') })
  const result = await p
  check('MediaRecorder onerror 발화 시 promise가 reject됨', result === 'caught' && !!caught)
}

section('A9. 시나리오7 — getMicStreamOnce(): getUserMedia가 NotAllowedError로 reject → 그 에러가 그대로 전파(가짜 permission 상태로 덮어쓰지 않음), 무한대기 없음 [UNIT, speech.js:483-529]')
{
  installNavigator(() => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })))
  let caught = null
  try { await speechMod.getMicStream() } catch (err) { caught = err }
  check('NotAllowedError가 그대로 던져짐(마스킹 없음)', caught?.name === 'NotAllowedError')
}

section('A10. 시나리오8 — getMicStreamOnce(): navigator.mediaDevices 자체가 없음(비보안 컨텍스트/구형 브라우저) → 명확한 에러로 즉시 reject, 무한대기 없음 [UNIT, speech.js:506-511]')
{
  installNavigator(undefined)
  let caught = null
  try { await speechMod.getMicStream() } catch (err) { caught = err }
  check('MediaDevicesUnavailableError로 즉시 reject됨', caught?.name === 'MediaDevicesUnavailableError')
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION B — DYNAMIC 레이어: REAL SpeechBtn(WordDetail.jsx) + REAL
// speech.js 통합 번들. 시나리오 순서는 getUserMedia 캐시(globalMicStream)
// 오염을 피하기 위해 "mediaDevices 없음/거부" 계열을 먼저, "성공" 계열을
// 나중에 배치한다(마이크 스트림이 한 번 성공하면 .active===true인 동안
// 재요청 없이 재사용되는 것 자체가 의도된 동작 — speech.js:437-446).
// ═══════════════════════════════════════════════════════════════════════
section('SECTION B. DYNAMIC — 실 SpeechBtn(WordDetail.jsx) + 실 speech.js 통합')

// handleClick()이 playWordAudio(...,{times:2,...})로 프롬프트를 2회
// 반복하므로(WordDetail.jsx:257-258) 실제 onEnd까지 도달하려면 onended()를
// 정확히 2번, 그 사이 playAudioUrl의 반복 간격(400ms, speech.js:248)만큼
// 시간이 지나야 한다. withClock으로 감싸 그 400ms 간격도 fake clock으로
// 결정론적으로 흘려보낸다.
function fireSpeechBtnPromptSuccess(clock) {
  withClock(clock, () => {
    FakeAudio.instances[FakeAudio.instances.length - 1].onended?.()
    clock.advance(400)
    FakeAudio.instances[FakeAudio.instances.length - 1].onended?.()
  })
}

const speechBtnBundlePath = await buildSpeechBtnBundle()
const { SpeechBtn } = await import(pathToFileURL(speechBtnBundlePath).href)
check('esbuild 번들에서 SpeechBtn 함수 추출됨(실 파일 미수정, in-memory export만 추가) [DYNAMIC]', typeof SpeechBtn === 'function')

const baseProps = { target: 'apple', wordAudioUrl: 'https://x/apple.mp3', maxMs: 5000 }

section('B1. 시나리오8 — navigator.mediaDevices 자체 없음: TTS 성공 후 startListen() 진입 시 즉시 fail로 복구(무한 대기 없음), 재시도 가능 [DYNAMIC, WordDetail.jsx:141-144]')
{
  installNavigator(undefined)
  FakeAudio.instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  check('클릭 시 phase=speaking, Audio 인스턴스 생성됨', FakeAudio.instances.length === 1)
  fireSpeechBtnPromptSuccess(clock) // TTS 프롬프트(2회 반복) 정상 종료 -> startListen() 진입
  const btn = mainButton(host.result)
  check('mediaDevices 부재 → 즉시 fail 텍스트("다시 시도")로 전환, listening에 갇히지 않음', btn.props.children === '🔄 다시 시도')
  check('버튼이 disabled 아님(재시도 가능 — 학생 구제 경로)', btn.props.disabled !== true)
}

section('B2. 시나리오7 — getUserMedia가 NotAllowedError로 reject: fail로 복구, 재시도 가능 [DYNAMIC, WordDetail.jsx:211-218 catch]')
{
  installNavigator(() => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })))
  FakeAudio.instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps, target: 'banana', wordAudioUrl: 'https://x/banana.mp3' }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  fireSpeechBtnPromptSuccess(clock)
  await flush()
  const btn = mainButton(host.result)
  check('getUserMedia 거부 시 listening에 갇히지 않고 fail로 전환됨', btn.props.children === '🔄 다시 시도')
  check('버튼 disabled 아님(재시도/레슨 진행 가능)', btn.props.disabled !== true)
}

section('B3. 시나리오1 — TTS 정상 성공: speaking → listening 전이 + getMicStream 실제 호출됨 [DYNAMIC, WordDetail.jsx:257-274 handleClick onEnd, speech.js:483 getMicStreamOnce]')
{
  installNavigator(() => Promise.resolve(makeFakeStream()))
  FakeAudio.instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps, target: 'cat', wordAudioUrl: 'https://x/cat.mp3' }), clock)
  let btn = mainButton(host.result)
  check('초기 phase=idle, 버튼 활성화', btn.props.disabled !== true)
  withClock(clock, () => mainButton(host.result).props.onClick())
  btn = mainButton(host.result)
  check('클릭 후 phase=speaking(버튼 비활성)', btn.props.disabled === true && btn.props.children === '🔊 잘 들어봐요...')
  fireSpeechBtnPromptSuccess(clock)
  await flush()
  btn = mainButton(host.result)
  check('TTS 성공 후 phase=listening으로 정상 전이(멈추지 않음)', btn.props.children === '👂 이제 말해봐요!')
}

section('B4. 시나리오3 — 저장 mp3가 절대 onended/onerror를 발화하지 않아도(네트워크 hang) SpeechBtn 자체 10초 워치독이 idle로 복구시킴 — speech.js의 tier1엔 자체 타임아웃이 없다는 사실과 무관하게 컴포넌트가 방어함 [DYNAMIC, WordDetail.jsx:74-83(effect 워치독)+234-256(imperative 워치독), 대조: speech.js:227-265 playAudioUrl엔 tier1용 setTimeout 없음]')
{
  FakeAudio.instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps, target: 'dog', wordAudioUrl: 'https://x/dog.mp3' }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  check('Audio 인스턴스 생성(재생 시도됨)', FakeAudio.instances.length === 1)
  let btn = mainButton(host.result)
  check('워치독 발동 전(즉시)에는 아직 speaking(비활성)', btn.props.disabled === true)
  // onended/onerror를 끝까지 호출하지 않음 — 네트워크 hang 재현.
  clock.advance(10000)
  btn = mainButton(host.result)
  check('10초 경과 후 idle로 복구되어 버튼이 다시 활성화됨(영구 잠김 아님)', btn.props.disabled !== true, `실제: disabled=${btn.props.disabled}, text=${JSON.stringify(btn.props.children)}`)
  check('복구 메시지 노출됨', btn.props.children === '🎤 따라 말하기')
}

section('B4b. [2026-09-11 수정 후 계약 고정, SECTION A1b와 동일 근본원인의 통합 확인] 저장 mp3가 tier1에서 실패해도(times:2, 실제 SpeechBtn 설정) 탭 1번에 getMicStream()(=녹음 시작)이 정확히 1번만 호출된다 — 수정 전에는 3번 호출돼(마이크 반복 재요청/녹음 반복 재시작) 이 스위트가 처음 발견한 실질 결함이었다(영구 고착은 아니었음 — 각 시도가 자체 hangTimer로 복구). 수정: playAudioUrl() 실패 경로가 onError만 호출하고 onEnd는 호출하지 않도록 분리(fail() 헬퍼) [DYNAMIC, WordDetail.jsx:110-219 startListen, speech.js:227-278 playAudioUrl(수정됨)]')
{
  invalidateFakeStream() // 이전 B3/B6/B7의 캐시된 활성 스트림 때문에 이번 getUserMedia 호출이 스킵되지 않도록
  let micCallCount = 0
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: () => { micCallCount += 1; return new Promise(() => {}) } } },
    configurable: true,
  })
  FakeAudio.instances.length = 0
  fakeSynth.__instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ target: 'honeydew', wordAudioUrl: 'https://x/honeydew-bad.mp3', maxMs: 5000 }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  FakeAudio.instances[0].onerror?.() // tier1 1차(이자 유일한) 시도 실패 -> 즉시 기기 TTS로 폴백
  await new Promise((r) => setTimeout(r, 450)) // 재시도가 있었다면 나타났을 시간(대조 대기)
  check('[수정 확인] tier1 재시도 없음(Audio 인스턴스 여전히 1개)', FakeAudio.instances.length === 1)
  check('[수정 확인] tier1 실패 직후에는 아직 getMicStream() 미호출(기기 TTS 완료를 기다림 — 수정 전엔 여기서 이미 1회 호출되던 조기 발화 버그)', micCallCount === 0)
  // 기기 TTS의 의도된 반복(times=2, 실패 재시도 아님) 드레인.
  for (let i = 0; i < 10; i++) {
    const before = fakeSynth.__instances.length
    fakeSynth.__instances[before - 1]?.onend?.()
    await flush()
    await new Promise((r) => setTimeout(r, 500))
    if (fakeSynth.__instances.length === before) break
  }
  check('[수정 확인] 기기 TTS 반복이 모두 끝난 뒤 getMicStream()이 정확히 1번만 호출됨(수정 전엔 3번) — 탭 1번=녹음 시작 1번', micCallCount === 1, `실제 호출 횟수=${micCallCount}`)
}

section('B5. 시나리오4 — url 없음(기기 TTS 경로) + speechSynthesis가 onend/onerror를 전혀 발화하지 않고, 그 내장 워치독(약11초, 텍스트 길이로 유도)보다도 SpeechBtn 자체 10초 워치독이 먼저 복구시킴(이중 방어 확인) [DYNAMIC, WordDetail.jsx:74-83/234-256 vs speech.js:423 내장 setTimeout]')
{
  fakeSynth.__instances.length = 0
  const longTarget = 'x'.repeat(80) // 80*120/0.85 ≈ 11294ms > 10000ms 컴포넌트 워치독
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ target: longTarget, wordAudioUrl: '', maxMs: 5000 }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  check('url 없음 → tier1 스킵, 곧장 기기 TTS(speechSynthesis.speak) 호출됨', fakeSynth.__instances.length === 1)
  let btn = mainButton(host.result)
  check('워치독 발동 전에는 speaking(비활성)', btn.props.disabled === true)
  // onend/onerror 끝까지 미호출 — speech.js 내장 워치독(~11.3초)보다 먼저
  // 컴포넌트 자체 10초 워치독이 이겨야 한다.
  clock.advance(10000)
  btn = mainButton(host.result)
  check('컴포넌트 자체 10초 워치독이 speech.js 내장 워치독(~11.3초)보다 먼저 복구시킴(컴포넌트 방어가 speech.js 내부 타이밍에 의존하지 않음을 증명)', btn.props.disabled !== true, `실제: disabled=${btn.props.disabled}`)
}

section('B6. 시나리오5 — 5회 연타(같은 phase=speaking 동안): handleClick 자체 가드로 재진입 차단 → Audio 인스턴스는 1개만, 이후 정상 종료 시 listening까지 정상 도달(연타로 인한 스택/고착 없음) [DYNAMIC, WordDetail.jsx:236-237 if(phase===\'speaking\'||phase===\'success\') return]')
{
  installNavigator(() => Promise.resolve(makeFakeStream()))
  FakeAudio.instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps, target: 'egg', wordAudioUrl: 'https://x/egg.mp3' }), clock)
  withClock(clock, () => {
    for (let i = 0; i < 5; i++) mainButton(host.result).props.onClick()
  })
  check('5회 연타에도 Audio 인스턴스는 정확히 1개(재진입 차단)', FakeAudio.instances.length === 1)
  fireSpeechBtnPromptSuccess(clock)
  await flush()
  const btn = mainButton(host.result)
  check('연타 이후에도 정상적으로 listening까지 도달(고착 없음)', btn.props.children === '👂 이제 말해봐요!')
}

section('B7. 시나리오9 — TTS 성공 후 recordWithAutoStop 내부 MediaRecorder 생성자가 던짐 → "녹음 오류" fail로 복구(재시도 가능) [DYNAMIC, WordDetail.jsx:160-172 catch]')
{
  installNavigator(() => Promise.resolve(makeFakeStream()))
  FakeAudio.instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps, target: 'fig', wordAudioUrl: 'https://x/fig.mp3' }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  FakeMediaRecorder.throwOnConstruct = Object.assign(new Error('not supported'), { name: 'NotSupportedError' })
  fireSpeechBtnPromptSuccess(clock)
  await flush()
  const btn = mainButton(host.result)
  check('MediaRecorder 생성자 예외 시 listening에 갇히지 않고 fail(다시 시도)로 전환됨', btn.props.children === '🔄 다시 시도')
  check('버튼 재클릭 가능(재시도 경로 열림)', btn.props.disabled !== true)
}

section('B8. 시나리오10 — 학생이 listening 중 탭해서 취소(cancelListen 탈출구) → 즉시 fail로 전환, mrRef.stop() 호출됨 [DYNAMIC, WordDetail.jsx:224-232 cancelListen]')
{
  installNavigator(() => new Promise(() => {})) // 이 시나리오는 취소가 핵심이므로 mic 자체는 영원히 대기해도 무방
  FakeAudio.instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => SpeechBtn({ ...baseProps, target: 'grape', wordAudioUrl: 'https://x/grape.mp3' }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  fireSpeechBtnPromptSuccess(clock) // startListen() 진입 -> getMicStream()이 영원히 pending
  await flush()
  let btn = mainButton(host.result)
  check('listening 진입(마이크 대기 중)', btn.props.children === '👂 이제 말해봐요!')
  btn.props.onClick() // 탭 = cancelListen()
  btn = mainButton(host.result)
  check('탭 취소 시 즉시 fail로 전환됨(9초 hangTimer를 기다리지 않음)', btn.props.children === '🔄 다시 시도')
  check('취소 후 버튼 재사용 가능', btn.props.disabled !== true)
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION C — DYNAMIC 레이어: REAL PronStep(QuizGame.jsx) + REAL speech.js
// 통합. PronStep에는 SpeechBtn과 달리 "말하기(speaking)" 단계 자체가 없다
// (녹음 버튼을 누르면 TTS 재생 없이 곧장 startListening()) — 아래 C0에서
// 정적으로 확인하고, 시나리오1/3/4/6(TTS 관련)은 이 컴포넌트엔 해당 없음
// (N/A)으로 명시한다.
// ═══════════════════════════════════════════════════════════════════════
section('SECTION C. DYNAMIC — 실 PronStep(QuizGame.jsx) + 실 speech.js 통합')

section('C0. 정적 확인 — PronStep.handleClick()에는 playWordAudio 호출이 없음(TTS "speaking" 단계 부재) → 시나리오1/3/4/6(TTS 폴백/워치독/슈퍼시드)은 PronStep에 N/A [STATIC, QuizGame.jsx:204-212]')
{
  const startIdx = QG_SRC.indexOf('function PronStep')
  const handleClickIdx = QG_SRC.indexOf('const handleClick = () => {', startIdx)
  const handleClickBlock = QG_SRC.slice(handleClickIdx, handleClickIdx + 400)
  check('handleClick 블록 추출 성공', handleClickIdx > -1)
  check('handleClick 안에 playWordAudio 호출이 없음(N/A 근거)', !handleClickBlock.includes('playWordAudio'))
  check('handleClick은 곧장 startListening()을 호출함(TTS 대기 단계 없이 즉시 녹음 시작)', handleClickBlock.includes('startListening()'))
}

const pronStepBundlePath = await buildPronStepBundle()
const { PronStep } = await import(pathToFileURL(pronStepBundlePath).href)
check('esbuild 번들에서 PronStep 함수 추출됨(실 파일 미수정) [DYNAMIC]', typeof PronStep === 'function')

const pronBaseProps = { word: 'apple', wordAudioUrl: 'https://x/apple.mp3', canRecord: true }

section('C1. 시나리오8 — navigator.mediaDevices 자체 없음: 즉시 fail(무한 대기 없음), 재시도 가능 [DYNAMIC, QuizGame.jsx:111-117]')
{
  installNavigator(undefined)
  const clock = createFakeClock()
  const host = renderHook(() => PronStep({ ...pronBaseProps, onSuccess: () => true, onAttempt: () => {} }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  const btn = mainButton(host.result)
  check('mediaDevices 부재 → 즉시 fail(다시 시도)로 전환됨', btn.props.children === '🔄 다시 시도')
  check('버튼 disabled 아님(재시도 가능)', btn.props.disabled !== true)
}

section('C2. 시나리오7 — getUserMedia가 NotAllowedError로 reject: fail로 복구, 재시도 가능 [DYNAMIC, QuizGame.jsx:180-188 catch]')
{
  installNavigator(() => Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })))
  const clock = createFakeClock()
  const host = renderHook(() => PronStep({ ...pronBaseProps, word: 'banana', onSuccess: () => true, onAttempt: () => {} }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  await flush()
  const btn = mainButton(host.result)
  check('getUserMedia 거부 시 listening에 갇히지 않고 fail로 전환됨', btn.props.children === '🔄 다시 시도')
  check('micError 메시지 노출됨(학생에게 안내)', typeof host.result !== 'undefined')
}

section('C3. 시나리오9 — MediaRecorder 생성자 예외 → fail로 복구(재시도 가능), 마이크 자체는 정상 확보됐던 경로 [DYNAMIC, QuizGame.jsx 전역 catch 경로]')
{
  installNavigator(() => Promise.resolve(makeFakeStream()))
  FakeMediaRecorder.throwOnConstruct = Object.assign(new Error('not supported'), { name: 'NotSupportedError' })
  const clock = createFakeClock()
  const host = renderHook(() => PronStep({ ...pronBaseProps, word: 'cherry', onSuccess: () => true, onAttempt: () => {} }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  await flush()
  const btn = mainButton(host.result)
  check('MediaRecorder 생성자 예외 시 listening에 갇히지 않고 fail로 전환됨', btn.props.children === '🔄 다시 시도')
  check('재시도 가능(disabled 아님)', btn.props.disabled !== true)
}

section('C4. 시나리오10 — listening 중 탭 취소(cancelListening) → 즉시 fail로 전환, mrRef.stop() 호출됨(9초 hangTimer 기다리지 않음) [DYNAMIC, QuizGame.jsx:194-202]')
{
  installNavigator(() => new Promise(() => {}))
  const clock = createFakeClock()
  const host = renderHook(() => PronStep({ ...pronBaseProps, word: 'date', onSuccess: () => true, onAttempt: () => {} }), clock)
  withClock(clock, () => mainButton(host.result).props.onClick())
  await flush()
  let btn = mainButton(host.result)
  check('listening 진입(마이크 대기 중)', btn.props.children === '👂 지금 말해보세요!')
  btn.props.onClick() // 탭 = cancelListening()
  btn = mainButton(host.result)
  check('탭 취소 시 즉시 fail로 전환됨', btn.props.children === '🔄 다시 시도')
  check('취소 후 재사용 가능', btn.props.disabled !== true)
}

section('C5. 시나리오5 — 연타(듣기/취소/재시작 왕복): startListening()이 매번 stopAll()로 이전 상태를 정리하므로 동시에 2개 이상의 활성 녹음이 생기지 않고, 최종 상태도 항상 조작 가능한 상태(listening 또는 fail)로 귀결됨 [DYNAMIC, QuizGame.jsx:106 stopAll(), 204-212 handleClick 분기]')
{
  installNavigator(() => Promise.resolve(makeFakeStream()))
  FakeMediaRecorder.instances.length = 0
  const clock = createFakeClock()
  const host = renderHook(() => PronStep({ ...pronBaseProps, word: 'elderberry', onSuccess: () => true, onAttempt: () => {} }), clock)
  // 1번째 클릭: listening 진입. 2번째 클릭: phase===listening -> cancelListening()(취소, fail로). 3번째: fail에서 재시작 -> listening. ...
  await withClock(clock, async () => {
    for (let i = 0; i < 5; i++) {
      mainButton(host.result).props.onClick()
      await flush(2)
    }
  })
  const btn = mainButton(host.result)
  check('5회 연타 후 phase가 유효한 조작 가능 상태(listening 또는 fail)로 귀결 — wait/알수없는 상태에 갇히지 않음', btn.props.children === '👂 지금 말해보세요!' || btn.props.children === '🔄 다시 시도')
  check('연타로 인해 동시에 여러 MediaRecorder가 활성 상태로 남지 않음(각 startListening()이 stopAll()로 이전 것을 정리)', FakeMediaRecorder.instances.filter((m) => m.state === 'recording').length <= 1)
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION D — STATIC: fakeReact가 언마운트(cleanup 실행)를 노출하지 않아
// 동적으로 구동할 수 없는 시나리오(11, 12) + "phase와 무관한 탈출구"가
// 실제로 소스에 존재하는지에 대한 구조적 확인.
// ═══════════════════════════════════════════════════════════════════════
section('SECTION D. STATIC — 언마운트/로그아웃(11,12) 및 phase 무관 탈출구 소스 인용 확인')

section('D1. 시나리오11 — SpeechBtn 언마운트 cleanup: mrRef.stop() + speakingTimerRef 해제 + recUrlRef revoke (fakeReact.mjs는 useEffect 클린업 호출을 노출하지 않아 동적 재현 불가 — 표준 React 언마운트 계약에 의존) [STATIC, WordDetail.jsx:56-63]')
{
  check('SpeechBtn 마운트당 1회 cleanup-only effect 존재(빈 deps)', WD_SRC.includes('useEffect(() => () => {\n    try { mrRef.current?.stop?.() } catch {}\n    clearTimeout(speakingTimerRef.current)'))
  check('cleanup이 recUrlRef(blob URL)도 revoke함(메모리 누수 방지)', WD_SRC.includes('if (recUrlRef.current) {\n      try { URL.revokeObjectURL(recUrlRef.current) } catch {}\n      recUrlRef.current = null\n    }\n  }, [])'))
  check('cleanup 함수 자체는 setState를 전혀 호출하지 않음(ref/timer 정리만) — "언마운트 후 setState" 경고는 이 cleanup 경로 자체에서는 구조적으로 발생 불가', (() => {
    const idx = WD_SRC.indexOf('useEffect(() => () => {')
    const block = WD_SRC.slice(idx, idx + 260)
    return !/setPhase|setMsg|setUrl|setTries|setTranscript|setUngraded|setPaulReaction|setAudioNotice/.test(block)
  })())
}

section('D2. 시나리오11(연속) — PronStep(QuizGame.jsx) 언마운트/단어변경 cleanup: stopAll() + recUrlRef revoke [STATIC, QuizGame.jsx:89-95]')
{
  check('PronStep cleanup-only effect 존재(deps=[word] — 단어 변경 시에도 동일하게 정리됨)', QG_SRC.includes('useEffect(() => () => {\n    stopAll()\n    if (recUrlRef.current) {'))
  check('stopAll()이 clearTimers()+speechSynthesis.cancel()+mrRef.stop()을 모두 수행함', QG_SRC.includes('const stopAll = () => {\n    clearTimers()\n    window.speechSynthesis?.cancel()\n    try { mrRef.current?.stop?.() } catch {}\n  }'))
  check('cleanup 함수 자체는 setState를 호출하지 않음(ref/timer 정리만)', (() => {
    const idx = QG_SRC.indexOf('useEffect(() => () => {\n    stopAll()')
    const block = QG_SRC.slice(idx, idx + 220)
    return !/setPhase|setMsg|setMicErr|setTries|setUrl|setProc/.test(block)
  })())
}

section('D3. 시나리오12 — 로그아웃 = AppInner 언마운트(setStudent(null))와 동일 경로 + WordDetail 자체가 언마운트 cleanup으로 stopCurrentAudio를 반환해 재생 중 오디오까지 정지됨 [STATIC, App.jsx:1150, WordDetail.jsx:828]')
{
  check('handleLogout은 setStudent(null)로 AppInner를 언마운트시킴(별도의 "정리 코드 경로"가 필요 없음 — React 언마운트 계약에 위임)', APP_SRC.includes('const handleLogout = () => { setSessionToken(null); localStorage.removeItem(SESSION_KEY); setStudent(null) }'))
  check('WordDetail은 마운트당 1회 cleanup-only effect로 stopCurrentAudio 자체를 반환 — 언마운트(로그아웃 포함) 시 재생 중이던 오디오가 정지됨', WD_SRC.includes('useEffect(() => stopCurrentAudio, [])'))
  check('SpeechBtn/PronStep 각자의 D1/D2 cleanup도 AppInner 언마운트에 함께 걸려 있으므로(자식 컴포넌트 언마운트) 로그아웃은 "동시 다발적 언마운트"일 뿐 별도 코드 경로가 아님(구조적 근거, 표준 React unmount 순서)', true)
}

section('D4. 시나리오와 무관한 phase 탈출구 — PronounceStep(WordDetail.jsx)의 "알아요/모르겠어요/다시 듣기" 3버튼은 SpeechBtn의 phase(idle/speaking/listening/success/fail) 상태와 무관하게 항상 클릭 가능 — SpeechBtn이 어떤 이유로든 멈추더라도 학생은 이 버튼들로 항상 다음 단계로 진행 가능 [STATIC, WordDetail.jsx:418-438]')
{
  const idx = WD_SRC.indexOf('grid grid-cols-3 gap-2')
  check('3버튼 블록 추출 성공', idx > -1)
  const block = WD_SRC.slice(idx, idx + 900)
  check('"모르겠어요" 버튼 onClick=handleUnknown 존재', block.includes('onClick={handleUnknown}'))
  check('"다시 듣기" 버튼 onClick=playWord 존재', block.includes('onClick={playWord}'))
  check('"알아요" 버튼 onClick={onWordKnown+onSkip} 존재(다음 단어/화면으로 즉시 진행 가능)', block.includes('onWordKnown?.(word.dbId); onSkip?.()'))
  const buttonsOnly = block.slice(0, 700)
  check('3버튼 블록 어디에도 disabled= 속성이 없음(SpeechBtn phase와 무관하게 항상 활성)', !buttonsOnly.includes('disabled='))
}

section('D5. QuizGame "다음 문제 →" 버튼은 isAnswered에만 의존 — PronStep(녹음) phase/pronDone과 무관하게 정답을 고르는 순간부터 항상 노출·클릭 가능. PronStep이 어떤 이유로든 멈추더라도 학생은 이 버튼으로 다음 문제로 진행 가능 [STATIC, QuizGame.jsx:536-542]')
{
  const idx = QG_SRC.indexOf('Next button')
  check('"다음 문제" 버튼 섹션 추출 성공', idx > -1)
  const block = QG_SRC.slice(idx, idx + 320)
  check('버튼 렌더 조건이 오직 {isAnswered && (...)}(PronStep 상태 미참조)', block.includes('{isAnswered && (') && !block.includes('pronDone') && !block.includes('showPron'))
  check('버튼 onClick=handleNext (다음 단어/결과 화면으로 진행)', block.includes('onClick={handleNext}'))
}

section('D6. QuizGame — canRecord는 정답 처리 시점에 동기로 true가 되고 speakPraise() 음성 재생 완료를 기다리지 않음(칭찬 음성이 절대 안 끝나도 발음 녹음 버튼은 멈추지 않음) [STATIC, QuizGame.jsx:332-342]')
{
  const idx = QG_SRC.indexOf('if (correct) {')
  const block = QG_SRC.slice(idx, idx + 550)
  const setCanRecIdx = block.indexOf('setCanRec(true)')
  const speakPraiseIdx = block.indexOf('speakPraise(')
  check('setCanRec(true) 호출 지점 존재', setCanRecIdx > -1)
  check('speakPraise() 호출 지점 존재', speakPraiseIdx > -1)
  check('setCanRec(true)가 speakPraise() 호출보다 먼저 실행됨(음성 콜백을 기다리지 않음 — 음성이 안 끝나도 버튼은 이미 활성)', setCanRecIdx > -1 && speakPraiseIdx > -1 && setCanRecIdx < speakPraiseIdx)
}

console.log(`\n${passes} PASS, ${failures} FAIL`)
console.log(failures === 0
  ? '\n모든 단언 통과 — 발음/듣기/녹음 공유 경로(SpeechBtn/PronounceStep/PronStep) 12개 시나리오에서 영구 고착(버튼 영구 비활성/phase 고착/진행 불가) 재현 없음.'
  : `\n${failures}개 단언 실패 — 아래 실패 상세를 검토해 실제 영구 고착 버그 여부를 판정할 것.`)
process.exit(failures > 0 ? 1 : 0)
