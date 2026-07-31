// tests/harness/runLearningEngine.mjs — Learning Engine 코어 순수 하네스
// (docs/CURRICULUM_ENGINE.md §13). runSentenceLearning.mjs/runReading.mjs와
// 동일한 자기완결형 관례 — src/learning의 순수 모듈(registry.js/
// adapters/learningItem.js)만 쓴다. LearningEngine.jsx/primitives/*.jsx는
// React 컴포넌트(JSX)라 이 Node 하네스가 직접 import하지 않는다 — 이 파일이
// 검증하는 것은 그 컴포넌트들이 소비하는 순수 설정/어댑터 계층(레지스트리
// 계약, 어댑터 shape, 결정론)이다.
//
// learningItem.js는 import 0 순수 모듈이라 플레인 Node ESM이 직접 로드
// 가능하지만, registry.js는 내부에서 확장자 없는 상대 import
// (`../../utils/textbookExampleModel`)를 쓴다(Vite에서만 자동 해석되는
// 표기) — 플레인 Node ESM은 이를 해석하지 못해 ERR_MODULE_NOT_FOUND가
// 나므로, registry.js만 esbuild로 인메모리 번들(scripts/buildWordLibBundle.mjs
// 와 동일 관례, 네트워크/환경변수 의존 없음 — 여전히 pure 섹션)해서 로드한다.
import { readFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { fromExample, fromWord } from '../../src/learning/adapters/learningItem.js'

mkdirSync('scripts/.tmp', { recursive: true })
await esbuild.build({
  entryPoints: ['src/learning/engine/registry.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/registry.learningEngine.bundle.mjs',
})
const { MODES } = await import(pathToFileURL('scripts/.tmp/registry.learningEngine.bundle.mjs').href)

let passed = 0, failed = 0
const failures = []
const check = (n, c, d = '') => { if (c) { passed++; console.log(`  PASS  ${n}`) } else { failed++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`) } }

console.log('\n=== [harness:learning-engine] Learning Engine — 순수 코어 ===')

// ── MODES 레지스트리 완결성 ────────────────────────────────────────────────
console.log('\n-- MODES 레지스트리')
const MODE_NAMES = Object.keys(MODES)
check('Phase 0 모드 5종 전부 존재(learn/fill_blank/listen/shadowing/write)',
  ['learn', 'fill_blank', 'listen', 'shadowing', 'write'].every((m) => MODE_NAMES.includes(m)))
check('모든 모드 항목이 primitives(비어있지 않은 배열)를 가짐',
  MODE_NAMES.every((m) => Array.isArray(MODES[m].primitives) && MODES[m].primitives.length > 0))
check('모든 모드 항목이 prepare(함수)를 가짐', MODE_NAMES.every((m) => typeof MODES[m].prepare === 'function'))
check('review/exam은 모드가 아니라 플랜 생성기라 레지스트리에 없음(§13.3)',
  !MODE_NAMES.includes('review') && !MODE_NAMES.includes('exam'))

// ── fill_blank prepare/grade 왕복(기존 textbookExampleModel.js 재사용 확인) ──
console.log('\n-- fill_blank prepare/grade 왕복')
const item = { id: 'x', text: 'I went to school yesterday.', targetWord: 'school', translation: '나는 어제 학교에 갔다', audioText: 'I went to school yesterday.' }
const prepared = MODES.fill_blank.prepare(item, {})
check('prepare가 빈칸 프롬프트(____)와 answer를 돌려줌', prepared.prompt.includes('____') && prepared.answer === 'school')
check('grade(checkAnswer) 대소문자 무관 정답 인정', MODES.fill_blank.grade('School', prepared.answer) === true)
check('grade(checkAnswer) 앞뒤 공백/구두점 무시', MODES.fill_blank.grade('  school. ', prepared.answer) === true)
check('grade(checkAnswer) 오답 거부', MODES.fill_blank.grade('park', prepared.answer) === false)

// 특수문자(정규식 메타문자)를 포함한 targetWord — makeFillBlank가 내부적으로
// 이스케이프하므로 정규식 인젝션/크래시 없이 안전하게 prepare가 동작해야 함.
const specialItem = { id: 'y', text: 'I love c++ (a lot)!', targetWord: 'c++' }
const preparedSpecial = MODES.fill_blank.prepare(specialItem, {})
check('특수문자 단어(target_word에 정규식 메타문자)여도 크래시 없이 prepare 반환',
  typeof preparedSpecial.prompt === 'string' && typeof preparedSpecial.answer === 'string' && preparedSpecial.answer === 'c++')

// ── 어댑터 fromExample/fromWord — LearningItem 정규형 shape ────────────────
console.log('\n-- 어댑터 fromExample/fromWord')
const exampleRow = { id: 'e1', targetWord: 'school', englishSentence: 'I go to school.', koreanTranslation: '나는 학교에 간다' }
const le = fromExample(exampleRow)
check('fromExample: id/contentType/text/translation/targetWord/audioText/distractorPool 계약',
  le.id === 'e1' && le.contentType === 'example' && le.text === 'I go to school.'
  && le.translation === '나는 학교에 간다' && le.targetWord === 'school'
  && le.audioText === 'I go to school.' && Array.isArray(le.distractorPool) && le.distractorPool.length === 0)
check('fromExample: 필드 없어도 크래시 없이 안전한 기본값', (() => {
  const empty = fromExample(null)
  return empty.text === '' && empty.targetWord === '' && Array.isArray(empty.distractorPool)
})())

const wordRow = { id: 'w1', word: 'apple', meaning: '사과', exampleText: 'I eat an apple.', exampleTranslation: '나는 사과를 먹는다' }
const lw = fromWord(wordRow)
check('fromWord: 예문 있으면 text=exampleText, translation=exampleTranslation',
  lw.id === 'w1' && lw.contentType === 'word' && lw.text === 'I eat an apple.' && lw.translation === '나는 사과를 먹는다' && lw.targetWord === 'apple')
const wordRowNoExample = { id: 'w2', word: 'banana', meaning: '바나나' }
const lw2 = fromWord(wordRowNoExample)
check('fromWord: 예문 없으면 text=단어 자체(learn/listen 모드 최소 동작 보장), translation=meaning 폴백',
  lw2.text === 'banana' && lw2.translation === '바나나' && lw2.audioText === 'banana')

// ── 결정론 — 같은 입력(seed 역할의 item) → 같은 prepared 결과 ──────────────
console.log('\n-- 결정론(순수성)')
const p1 = MODES.fill_blank.prepare(item, {})
const p2 = MODES.fill_blank.prepare(item, {})
check('fill_blank.prepare(item)은 순수(동일 입력 → 동일 출력, 여러 번 호출해도 동일)', JSON.stringify(p1) === JSON.stringify(p2))
check('learn/listen/shadowing/write.prepare는 identity(입력 참조 그대로 반환, 파생 없음)',
  MODES.learn.prepare(item) === item && MODES.listen.prepare(item) === item
  && MODES.shadowing.prepare(item) === item && MODES.write.prepare(item) === item)

// ── 순수성(코드 레벨) — registry.js/learningItem.js ────────────────────────
console.log('\n-- 순수성(코드 레벨)')
// "supabase 접근 없음"은 문자열 "supabase"가 소스에 전혀 없다는 뜻이 아니다
// — 두 파일의 헤더 주석 자체가 "왜 Supabase를 안 쓰는지" 산문으로 설명한다
// (오탐 방지 — 실제 사용 패턴만 정밀 검사): import 경로에 supabase가
// 들어가거나 supabase.from(...)/createClient(...) 같은 실제 클라이언트
// 호출이 있는지만 본다.
const SUPABASE_USAGE_RE = /from\s+['"][^'"]*supabase[^'"]*['"]|supabase\s*\.\s*(from|auth|rpc|storage|channel)\s*\(|createClient\s*\(/i

const registrySrc = readFileSync(new URL('../../src/learning/engine/registry.js', import.meta.url), 'utf8')
check('registry.js는 Math.random 없음(결정론 — seed/기존 shuffleDeterministic만 허용)', !registrySrc.includes('Math.random'))
check('registry.js는 supabase 실사용 없음(순수 설정 객체, import/클라이언트 호출 패턴 정밀 검사)', !SUPABASE_USAGE_RE.test(registrySrc))
check('registry.js는 React import 없음(모드=데이터, JSX 없음)', !registrySrc.includes("from 'react'") && !registrySrc.includes('from "react"'))

const adapterSrc = readFileSync(new URL('../../src/learning/adapters/learningItem.js', import.meta.url), 'utf8')
check('learningItem.js는 import 0 순수 모듈', !/^import /m.test(adapterSrc))
check('learningItem.js는 Math.random 없음', !adapterSrc.includes('Math.random'))
check('learningItem.js는 supabase 실사용 없음(import/클라이언트 호출 패턴 정밀 검사)', !SUPABASE_USAGE_RE.test(adapterSrc))

console.log('\n=== summary ===')
if (failed === 0) { console.log(`  PASS  learning-engine — Learning Engine 순수 코어 (${passed}개 단언)`); process.exit(0) }
console.log(`  FAIL  learning-engine — ${failed}건: ${failures.join(', ')}`); process.exit(1)
