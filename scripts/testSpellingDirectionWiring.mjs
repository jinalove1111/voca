// 쓰기시험 방향 배선(wiring) 검증 — "mixed로 설정하면 화면에 정말 영↔한이
// 섞여 나오는가"를 실제 클라이언트 컴포넌트 코드로 확인한다(2026-07-17,
// 운영자 "여전히 한→영만 나온다" 리포트의 원인 격리용).
//
// 방법: 진짜 SpellingQuestion.jsx / WordDetail.jsx를 esbuild로 번들해
// react-dom/server(SSR)로 렌더 — 문제 프롬프트와 입력 placeholder가
// direction대로 갈리는지 HTML 문자열로 단언한다. 브라우저 전용 모듈
// (speech/paulReactions/useStudent/wordLibrary 등)은 렌더에 필요한 만큼만
// 가상 스텁으로 대체(채점·방향 로직은 전부 실제 소스 그대로).
//
// 검증 체인 (App.jsx의 mixed 흐름 전체):
//   assignDirections(n,'mixed') [실제 소스] → WordDetail
//   spellingDirectionOverride prop [실제 소스] → SpellingQuestion
//   direction prop [실제 소스] → promptText/placeholder 렌더
//
// 실행: node scripts/testSpellingDirectionWiring.mjs
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assignDirections } from '../src/utils/entranceTest.js'

const stub = (contents) => ({ contents, loader: 'js' })
const VIRTUAL = {
  speech: stub(`
    export const playWordAudio = () => {}
    export const playRepeating = () => () => {}
    export const stopCurrentAudio = () => {}
    export const playSuccessSound = () => {}
    export const getMicStream = () => Promise.reject(new Error('stub'))
    export const recordWithAutoStop = () => ({ promise: Promise.resolve(new Blob ? null : null), stop() {} })
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
  entryPoints: ['src/components/WordDetail.jsx', 'src/components/SpellingQuestion.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: 'scripts/.tmp/wiring',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  plugins: [{
    name: 'browser-stubs',
    setup(build) {
      build.onResolve({ filter: /utils[\\/]speech$/ }, (a) => ({ path: 'v:speech', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
      build.onResolve({ filter: /hooks[\\/]useStudent$/ }, () => ({ path: 'v:student', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]browserDetect$/ }, () => ({ path: 'v:browser', namespace: 'v' }))
      build.onResolve({ filter: /hooks[\\/]useMicReady$/ }, () => ({ path: 'v:mic', namespace: 'v' }))
      build.onResolve({ filter: /InAppBrowserNotice$/ }, () => ({ path: 'v:inapp', namespace: 'v' }))
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

const React = (await import('react')).default
const { renderToStaticMarkup } = await import('react-dom/server')
const SpellingQuestion = (await import(pathToFileURL(path.resolve('scripts/.tmp/wiring/SpellingQuestion.js')).href)).default
const WordDetail = (await import(pathToFileURL(path.resolve('scripts/.tmp/wiring/WordDetail.js')).href)).default

let failures = 0
const check = (label, cond) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const KR_PLACEHOLDER = '한글로 뜻을 입력하세요' // en2kr 문제의 입력창
const EN_PLACEHOLDER = '영어로 철자를 입력하세요' // kr2en 문제의 입력창

console.log('\n1. SpellingQuestion 단독 — direction prop이 화면을 실제로 가르는지')
{
  const en2kr = renderToStaticMarkup(React.createElement(SpellingQuestion, { word: 'order', meaning: '주문하다', direction: 'en2kr' }))
  check('en2kr: 문제로 영어 단어(order) 표시', en2kr.includes('order'))
  check('en2kr: 한글 입력 placeholder', en2kr.includes(KR_PLACEHOLDER))
  check('en2kr: 문제 화면에 정답(주문하다) 미노출', !en2kr.includes('주문하다'))
  const kr2en = renderToStaticMarkup(React.createElement(SpellingQuestion, { word: 'order', meaning: '주문하다', direction: 'kr2en' }))
  check('kr2en: 문제로 한글 뜻(주문하다) 표시', kr2en.includes('주문하다'))
  check('kr2en: 영어 입력 placeholder', kr2en.includes(EN_PLACEHOLDER))
}

console.log('\n2. WordDetail(쓰기 모드) — spellingDirectionOverride가 반 설정을 이기는지 (App.jsx mixed 경로)')
{
  const word = { id: 'order', dbId: null, word: 'order', meaning: '주문하다', wordAudioUrl: null }
  const html = renderToStaticMarkup(React.createElement(WordDetail, {
    word, classWords: [word], mode: 'write',
    spellingSettings: { spellingTestEnabled: true, spellingHintEnabled: false, spellingDirection: 'kr2en' },
    spellingDirectionOverride: 'en2kr',
  }))
  check('반 설정 kr2en + override en2kr -> 화면은 en2kr(한글 입력)', html.includes(KR_PLACEHOLDER) && !html.includes(EN_PLACEHOLDER))
  const html2 = renderToStaticMarkup(React.createElement(WordDetail, {
    word, classWords: [word], mode: 'write',
    spellingSettings: { spellingTestEnabled: true, spellingHintEnabled: false, spellingDirection: 'mixed' },
    spellingDirectionOverride: 'kr2en',
  }))
  check('반 설정 mixed + override kr2en -> 화면은 kr2en(영어 입력)', html2.includes(EN_PLACEHOLDER))
  const html3 = renderToStaticMarkup(React.createElement(WordDetail, {
    word, classWords: [word], mode: 'write',
    spellingSettings: { spellingTestEnabled: true, spellingHintEnabled: false, spellingDirection: 'en2kr' },
    spellingDirectionOverride: null,
  }))
  check('override 없음(비 mixed) -> 반 설정 그대로(en2kr)', html3.includes(KR_PLACEHOLDER))
}

console.log('\n3. App.jsx mixed 전체 체인 시뮬레이션 — 20문제 정확히 10:10으로 렌더')
{
  const dirs = assignDirections(20, 'mixed') // App.jsx가 세션 시작 시 하는 것과 동일
  const words = Array.from({ length: 20 }, (_, i) => ({ id: `w${i}`, word: `word${i}`, meaning: `뜻${i}`, wordAudioUrl: null }))
  let krInput = 0, enInput = 0
  words.forEach((w, i) => {
    const html = renderToStaticMarkup(React.createElement(WordDetail, {
      word: w, classWords: words, mode: 'write',
      spellingSettings: { spellingTestEnabled: true, spellingHintEnabled: false, spellingDirection: 'mixed' },
      spellingDirectionOverride: dirs[i] || 'kr2en', // App.jsx 렌더 prop과 동일식
    }))
    if (html.includes(KR_PLACEHOLDER)) krInput++
    if (html.includes(EN_PLACEHOLDER)) enInput++
  })
  check(`20문제 중 영→한(한글 입력) 정확히 10개 (실측 ${krInput})`, krInput === 10)
  check(`20문제 중 한→영(영어 입력) 정확히 10개 (실측 ${enInput})`, enInput === 10)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅ — 배선 정상(mixed 설정 시 실제로 섞임)' : `\n${failures}개 테스트 실패 ❌ — 배선 버그 존재`)
process.exit(failures === 0 ? 0 : 1)
