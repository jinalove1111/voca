// 독립 퀴즈(QuizGame.jsx) "같은 뜻 선택지 중복" 회귀 테스트
// (2026-09-10 초등 5반 준비 — P1 채점 결함).
//
// 근본 원인: makeOptions(correctWord, allWords)가 정답을 제외한 모든 단어
// 중에서 오답 3개를 무작위로 뽑았고(뜻 텍스트를 전혀 확인하지 않음), 채점은
// opts.indexOf(correctWord.meaning)로 "정답 뜻 문자열이 처음 나오는 위치"만
// 본다. 같은 유닛 안에 뜻이 동일한 단어 쌍이 실제로 존재하면(예:
// delicious/tasty 둘 다 "맛있는", piece/chip 둘 다 "명 조각") 버튼 두 개가
// 같은 텍스트로 보이는데, 학생이 그중 정답이 아닌 위치(indexOf가 가리키지
// 않는 쪽)를 눌러도 텍스트상으로는 똑같이 맞는 답을 골랐음에도 오답 처리된다.
// 수정: src/components/WordDetail.jsx의 QuizStep이 이미 쓰는 가드(빈 뜻/
// 정답과 동일한 뜻인 후보 제외)를 QuizGame.makeOptions에도 미러링하고,
// 오답 후보끼리도 뜻 텍스트 중복을 제거한다.
//
// 방법: 실제 src/components/QuizGame.jsx를 esbuild로 번들해 makeOptions를
// named export로 가져와 순수 함수로 직접 호출한다(React 렌더 없음, 네트워크
// 0) — scripts/testQuizStepReset.mjs가 쓰는 "실제 소스를 esbuild로 번들,
// 브라우저 전용 모듈만 가상 치환" 패턴 그대로.
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const stub = (contents) => ({ contents, loader: 'js' })
const VIRTUAL = {
  react: stub(`
    const h = (n) => (...a) => globalThis.__FAKE_HOOKS__[n](...a)
    export const useState = h('useState')
    export const useEffect = h('useEffect')
    export const useRef = h('useRef')
    export default { useState, useEffect, useRef }
  `),
  jsxRuntime: stub(`
    export const Fragment = Symbol.for('fake.Fragment')
    export const jsx = (type, props, key) => ({ $$el: true, type, key: key === undefined ? null : key, props: props || {} })
    export const jsxs = jsx
  `),
  speech: stub(`
    export const playWordAudio = () => {}
    export const stopCurrentAudio = () => {}
    export const getMicStream = () => Promise.reject(new Error('stub'))
    export const recordWithAutoStop = () => ({ promise: Promise.resolve(null), stop() {} })
    export const speakPraise = () => {}
    export const unlockAudio = () => {}
    export const playSuccessSound = () => {}
  `),
  paulReactions: stub(`
    export const pickReaction = () => ({ id: 'x', image: '/x.png', message: 'm' })
  `),
  wordLibrary: stub('export const requestAudioGeneration = () => {}'),
  browserDetect: stub('export const isInAppBrowser = () => false'),
  inApp: stub('export default function InAppBrowserNotice() { return null }'),
  hero: stub('export default function HeroReaction() { return null }'),
}

await esbuild.build({
  entryPoints: ['src/components/QuizGame.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: 'scripts/.tmp/quizgameoptions',
  jsx: 'automatic',
  plugins: [{
    name: 'virtual-shims',
    setup(build) {
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'v:jsx', namespace: 'v' }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'v:react', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]speech$/ }, () => ({ path: 'v:speech', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]paulReactions$/ }, () => ({ path: 'v:paul', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
      build.onResolve({ filter: /utils[\\/]browserDetect$/ }, () => ({ path: 'v:browser', namespace: 'v' }))
      build.onResolve({ filter: /InAppBrowserNotice$/ }, () => ({ path: 'v:inapp', namespace: 'v' }))
      build.onResolve({ filter: /HeroReaction$/ }, () => ({ path: 'v:hero', namespace: 'v' }))
      build.onLoad({ filter: /^v:jsx$/, namespace: 'v' }, () => VIRTUAL.jsxRuntime)
      build.onLoad({ filter: /^v:react$/, namespace: 'v' }, () => VIRTUAL.react)
      build.onLoad({ filter: /^v:speech$/, namespace: 'v' }, () => VIRTUAL.speech)
      build.onLoad({ filter: /^v:paul$/, namespace: 'v' }, () => VIRTUAL.paulReactions)
      build.onLoad({ filter: /^v:wordlib$/, namespace: 'v' }, () => VIRTUAL.wordLibrary)
      build.onLoad({ filter: /^v:browser$/, namespace: 'v' }, () => VIRTUAL.browserDetect)
      build.onLoad({ filter: /^v:inapp$/, namespace: 'v' }, () => VIRTUAL.inApp)
      build.onLoad({ filter: /^v:hero$/, namespace: 'v' }, () => VIRTUAL.hero)
    },
  }],
})

const { makeOptions } = await import(pathToFileURL(path.resolve('scripts/.tmp/quizgameoptions/QuizGame.js')).href)

let failures = 0
const check = (label, cond) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const w = (id, meaning) => ({ id, meaning, word: `word${id}` })

console.log('\n1. 같은 뜻을 가진 다른 단어가 풀에 있어도 선택지가 중복되지 않음 (200회 랜덤)')
{
  const correctWord = w('c', '맛있는') // delicious
  const pool = [
    correctWord,
    w('t', '맛있는'),   // tasty — 정답과 동일한 뜻(제외 대상)
    w('a', '사과'),
    w('b', '바나나'),
    w('d', '조각'),
    w('e', '접시'),
  ]
  let dupFound = false
  let correctMissing = false
  let correctDuped = false
  for (let i = 0; i < 200; i++) {
    const { opts, correctIdx } = makeOptions(correctWord, pool)
    const seen = new Set()
    for (const o of opts) { if (seen.has(o)) dupFound = true; seen.add(o) }
    const correctCount = opts.filter((o) => o === correctWord.meaning).length
    if (correctCount === 0) correctMissing = true
    if (correctCount > 1) correctDuped = true
    if (opts[correctIdx] !== correctWord.meaning) correctMissing = true
  }
  check('200회 동안 선택지 문자열 중복이 한 번도 없음', !dupFound)
  check('200회 동안 정답 뜻이 항상 정확히 1번만 포함됨', !correctMissing && !correctDuped)
}

console.log('\n2. 오답 후보끼리 뜻이 같은 경우도 중복 제거 (piece/chip 둘 다 "명 조각")')
{
  const correctWord = w('c', '사과')
  const pool = [
    correctWord,
    w('p', '명 조각'), // piece
    w('h', '명 조각'), // chip — p와 동일한 뜻(오답끼리 중복)
    w('x', '바나나'),
    w('y', '포도'),
  ]
  let dupFound = false
  for (let i = 0; i < 200; i++) {
    const { opts } = makeOptions(correctWord, pool)
    const seen = new Set()
    for (const o of opts) { if (seen.has(o)) dupFound = true; seen.add(o) }
  }
  check('오답끼리 뜻이 같아도 200회 동안 선택지 중복 없음', !dupFound)
}

console.log('\n3. 깨끗한 풀(뜻 전부 다름) — 옵션 4개, 정답 정확히 1번')
{
  const correctWord = w('c', '사과')
  const pool = [correctWord, w('a', '바나나'), w('b', '포도'), w('d', '수박'), w('e', '딸기')]
  const { opts, correctIdx } = makeOptions(correctWord, pool)
  check('옵션 개수 4개', opts.length === 4)
  check('정답 뜻이 정확히 1번 포함', opts.filter((o) => o === correctWord.meaning).length === 1)
  check('correctIdx가 실제 정답 위치를 가리킴', opts[correctIdx] === correctWord.meaning)
}

console.log('\n4. 다른 단어가 2개뿐인 풀 — 크래시 없이 정답 정확히 1번, 옵션 3개 이하')
{
  const correctWord = w('c', '사과')
  const pool = [correctWord, w('a', '바나나'), w('b', '포도')]
  const { opts, correctIdx } = makeOptions(correctWord, pool)
  check('크래시 없이 opts 배열 반환', Array.isArray(opts))
  check('정답 뜻이 정확히 1번 포함', opts.filter((o) => o === correctWord.meaning).length === 1)
  check('옵션 개수는 정답 포함 3개 이하(다른 단어가 2개뿐이므로)', opts.length <= 3)
  check('correctIdx가 실제 정답 위치를 가리킴', opts[correctIdx] === correctWord.meaning)
}

console.log(failures === 0
  ? '\n모든 테스트 통과 ✅'
  : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
