// 2026-10-10 문법 과정 5개(Easy·Intermediate·Advanced·Middle School·High School) — 데이터 계약 + 화면/App 소스 핀. 저장·네트워크 0.
import fs from 'node:fs'
import { GRAMMAR_COURSES } from '../src/utils/grammar/grammarCourses.js'
import { GRAMMAR_UNITS, SCHOOL_GRAMMAR_NOTE_KO, unitsForCourse, grammarUnitById, courseCounts, resolveChoice, validateGrammarUnit } from '../src/utils/grammar/grammarUnits.js'
import { UNITS } from '../src/utils/curriculum/units.js'

let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? '  ' + detail : ''}`); if (!ok) fail++ }
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── 데이터 ──
check('과정 5개 순서·영문명·종류(숙련도 3 + 학교 문법 2)', GRAMMAR_COURSES.map((c) => `${c.id}:${c.titleEn}:${c.kind}`).join() === 'easy:Easy:proficiency,intermediate:Intermediate:proficiency,advanced:Advanced:proficiency,middleSchool:Middle School:school,highSchool:High School:school' && GRAMMAR_COURSES.every((c) => c.titleKo && c.descKo))
check('단원 id 유일, 모든 단원이 validateGrammarUnit 통과', new Set(GRAMMAR_UNITS.map((u) => u.id)).size === GRAMMAR_UNITS.length && GRAMMAR_UNITS.every((u) => validateGrammarUnit(u).length === 0), GRAMMAR_UNITS.map((u) => validateGrammarUnit(u).join('|')).filter(Boolean).join('; '))
check('과정마다 단원이 있고(화면이 비지 않음) unitsForCourse가 order 오름차순', GRAMMAR_COURSES.every((c) => { const l = unitsForCourse(c.id); return l.length >= 2 && l.every((u, i) => u.courseId === c.id && (i === 0 || l[i - 1].order <= u.order)) }))
check('courseCounts 모양 { ready, total }, 합계 일치', GRAMMAR_COURSES.every((c) => { const k = courseCounts(c.id); return Number.isInteger(k.ready) && k.total === unitsForCourse(c.id).length && k.ready <= k.total }))
check('학교 문법 단원은 존재하는 기초(숙련도) 단원에 연결', GRAMMAR_UNITS.filter((u) => ['middleSchool', 'highSchool'].includes(u.courseId)).every((u) => grammarUnitById(u.basicsUnitId)?.courseId && ['easy', 'intermediate', 'advanced'].includes(grammarUnitById(u.basicsUnitId).courseId)))
// validateGrammarUnit 자체 검증 — 잘못된 ready 단원은 실제로 거부되어야 한다
const okReady = { id: 'x-1', courseId: 'easy', order: 1, titleKo: 't', goalKo: 'g', conceptId: 'c', prereqIds: [], status: 'ready', fromUnitId: 'u',
  examples: [{ en: 'I am Ben.', ko: 'a' }, { en: 'I am ten.', ko: 'b' }, { en: 'You are kind.', ko: 'c' }], explainKo: ['a', 'b'], structure: [{ s: 'I', v: 'am', rest: 'Ben', ko: '' }],
  errors: [{ wrong: 'I is Ben.', right: 'I am Ben.', whyKo: 'x' }, { wrong: 'You is Ben.', right: 'You are Ben.', whyKo: 'x' }],
  practice: { choice: [], blank: [{ en: 'I ___ Ben.', options: ['am', 'is'], correct: 0 }, { en: 'You ___ Ben.', options: ['are', 'am'], correct: 0 }], order: [{ words: ['b', 'a'], answers: [['a', 'b']] }, { words: ['d', 'c'], answers: [['c', 'd']] }], build: [{}, {}] }, use: { kind: 'speaking', promptKo: 'p', exampleEn: 'I am Ben.', exampleKo: 'k' }, sources: [] }
check('validateGrammarUnit: 올바른 ready 단원 통과, 부족한 예문/긴 문장/브랜드/잘못된 use는 거부', validateGrammarUnit(okReady).length === 0
  && validateGrammarUnit({ ...okReady, examples: okReady.examples.slice(0, 2) }).length > 0
  && validateGrammarUnit({ ...okReady, examples: [{ en: 'one two three four five six seven eight nine', ko: 'k' }, ...okReady.examples.slice(1)] }).length > 0
  && validateGrammarUnit({ ...okReady, explainKo: ['Unit 3 참고', 'b'] }).length > 0
  && validateGrammarUnit({ ...okReady, use: { kind: 'x' } }).length > 0
  && validateGrammarUnit({ ...okReady, fromUnitId: undefined }).length > 0
  && validateGrammarUnit({ ...okReady, courseId: 'middleSchool' }).length > 0
  && validateGrammarUnit({ ...okReady, prereqIds: ['nope'] }).length > 0
  && validateGrammarUnit({ ...okReady, practice: { ...okReady.practice, order: [{ words: ['b', 'a'], answers: [['a', 'x']] }, okReady.practice.order[1]] } }).length > 0)
const pilot = UNITS[0]
check('resolveChoice: fromUnitId면 시범 Unit의 문형 문항을 합치고, 없으면 자체 문항만', resolveChoice({ practice: { choice: [{ promptKo: 'own' }] }, fromUnitId: pilot.id }, UNITS).length === 1 + pilot.grammar.items.length
  && resolveChoice({ practice: { choice: [{ promptKo: 'own' }] } }, UNITS).length === 1 && resolveChoice({ fromUnitId: 'nope' }, UNITS).length === 0 && resolveChoice({ fromUnitId: pilot.id }, null).length === 0)


// ── 실제 데이터(2026-10-10 콘텐츠 초안, 교사 검수 전) ──
const cnt = (id) => courseCounts(id)
check('과정별 단원 수/준비: easy 8(2) · intermediate 8(1) · advanced 6(0) · middleSchool 6(0) · highSchool 6(0), 합계 34', ['easy:8:2', 'intermediate:8:1', 'advanced:6:0', 'middleSchool:6:0', 'highSchool:6:0'].every((x) => { const [id, t, r] = x.split(':'); return cnt(id).total === +t && cnt(id).ready === +r }) && GRAMMAR_UNITS.length === 34)
check('ready 단원은 g-easy-01·g-easy-02·g-int-01 세 개뿐', GRAMMAR_UNITS.filter((u) => u.status === 'ready').map((u) => u.id).join() === 'g-easy-01,g-easy-02,g-int-01')
check('학교 문법 단원의 basicsUnitId는 존재하고 easy/intermediate 소속', GRAMMAR_UNITS.filter((u) => u.courseId === 'middleSchool' || u.courseId === 'highSchool').every((u) => ['easy', 'intermediate'].includes(grammarUnitById(u.basicsUnitId)?.courseId)))
check('공통 개념 passive-voice·relative-clause·participle은 중등·고등 양쪽에 있음', ['passive-voice', 'relative-clause', 'participle'].every((c) => ['middleSchool', 'highSchool'].every((k) => GRAMMAR_UNITS.some((u) => u.courseId === k && u.conceptId === c))))
check('모든 prereqIds 실재, id 형식 g-*, 숙련도 단원 order가 1부터 연속', GRAMMAR_UNITS.every((u) => u.prereqIds.every((p) => grammarUnitById(p)) && /^g-/.test(u.id)) && GRAMMAR_COURSES.every((c) => unitsForCourse(c.id).every((u, i) => u.order === i + 1)))
const READY = GRAMMAR_UNITS.filter((u) => u.status === 'ready')
check('ready 단원의 영어 문장은 예문·빈칸·정답 순서·예시 모두 8단어 이하', READY.every((u) => [...u.examples.map((e) => e.en), ...u.practice.blank.map((b) => b.en), ...u.practice.order.flatMap((o) => o.answers.map((a) => a.join(' '))), ...u.practice.build.map((b) => b.exampleEn), u.use.exampleEn].every((t) => t.trim().split(/s+/).length <= 8)))
check('g-easy-02 예문에 desk 없음', !grammarUnitById('g-easy-02').examples.some((e) => /desk/i.test(e.en)))
check('ready 3개 resolveChoice = 시범 Unit 문형 문항 6개씩(fromUnitId 실재)', READY.every((u) => UNITS.some((p) => p.id === u.fromUnitId) && resolveChoice(u, UNITS).length === 6 && resolveChoice(u, UNITS).length === UNITS.find((p) => p.id === u.fromUnitId).grammar.items.length))
check('준비 중 단원은 ready 내용 없이 제목·목표만 검증, 학교 문법 안내문 export', GRAMMAR_UNITS.filter((u) => u.status === 'preparing').every((u) => u.titleKo && u.goalKo && validateGrammarUnit(u).length === 0) && /학교 문법/.test(SCHOOL_GRAMMAR_NOTE_KO))

// ── 화면 소스 ──
const sSrc = strip(read('src/components/GrammarCourseScreen.jsx'))
const ORDER = ['gu-goal', 'gu-examples', 'gu-explain', 'gu-structure', 'gu-compare', 'gu-errors', 'gu-practice', 'gu-use', 'gu-feedback']
const idxs = ORDER.map((t) => sSrc.indexOf(`data-testid="${t}"`))
check('화면: 9개 섹션 testid가 소스에 순서대로 존재', idxs.every((i) => i > 0) && idxs.every((v, i) => i === 0 || v > idxs[i - 1]), idxs.join())
const P = ['gu-step-choice', 'gu-step-blank', 'gu-step-order', 'gu-step-build'].map((t) => sSrc.indexOf(`data-testid="${t}"`))
check('화면: 연습 4단계 순서 선택 → 빈칸 → 순서 배열 → 문장 만들기', P.every((i) => i > 0) && P.every((v, i) => i === 0 || v > P[i - 1]))
check('화면: 필수 testid(과정/단원 목록, 듣기, 구조 S/V/+, 다시 풀기, 진행, 기초 링크, 뒤로)', ['grammar-course-${c.id}', 'grammar-unit-${u.id}', 'grammar-units-back', 'gu-example-${i}-listen', 'gu-structure-${i}', 'gu-error-${i}', 'gu-blank-${idx}-opt-${i}', '-retry`', 'gu-order-${idx}-word-${i}', 'gu-order-${idx}-answer', 'gu-order-${idx}-check', '-compare`', 'gu-use-done', 'gu-use-listen', 'gu-practice-status', 'gu-practice-done', 'gu-basics-link', 'gu-basics-back', 'data-testid="gu-back"', '준비 중', '예시는 하나의 답일 뿐이에요', '학교 문법 (제안)', '숙련도', 'grammar-school-note', 'SCHOOL_GRAMMAR_NOTE_KO', 'gu-preparing', 'data-status="preparing"', '이 단원은 준비 중이에요'].every((t) => sSrc.includes(t)))
check('화면: 저장·점수·네트워크 없음(localStorage/sessionStorage/fetch/supabase/점수)', !/localStorage|sessionStorage|fetch\(|supabase|markActivity|점수:/.test(sSrc))
check('화면: speak·stopSpeaking 재사용, Choice는 UnitScreen에서 import, units.js 직접 import 없음, 언마운트 시 stopSpeaking', /import \{ speak, stopSpeaking \} from '..\/utils\/speech'/.test(sSrc) && /import \{ Choice \} from '.\/UnitScreen'/.test(sSrc) && !/curriculum\/units/.test(sSrc) && /useEffect\(\(\) => \(\) => stopSpeaking\(\), \[\]\)/.test(sSrc))
check('화면: 준비 중 단원은 disabled(빈 화면 없음), 직접 쓴 글은 정오 판정 없음(compare만)', /disabled=\{!ready\}/.test(sSrc) && !/isCorrect|채점/.test(sSrc))

// ── App / 홈 / UnitScreen ──
const app = strip(read('src/App.jsx'))
check("App: QA_ONLY_SCREENS에 grammarCourses, 렌더가 qaTestStudent 게이팅, 문법 화면은 lazy + Suspense", /const QA_ONLY_SCREENS = \[[^\]]*'grammarCourses'\]/.test(app) && /qaTestStudent && screen === 'grammarCourses' && pilotUnits/.test(app) && /const GrammarCourseScreen = React\.lazy\(\(\) => import\('\.\/components\/GrammarCourseScreen'\)\)/.test(app) && /<GrammarCourseScreen units=\{pilotUnits\}/.test(app))
check("App: onGo grammar → grammarCourses, viaPicker에 grammar 없음, 선택기 intent에 grammar 없음", /t === 'grammar' \? 'grammarCourses'/.test(app) && !/const viaPicker = [^\n]*'grammar'/.test(app) && !/setUnitIntent\([^\n]*'grammar'/.test(app))
const u = strip(read('src/components/UnitScreen.jsx'))
check('UnitScreen: Choice를 named export, 선택기의 문법 intent·문법 모음 제거', /export function Choice\(/.test(u) && !/intent === 'grammar'/.test(u) && !u.includes('GrammarSetScreen'))
const home = read('src/components/StudentHome.jsx')
check('홈: student-home-grammar testid 유지, 문구 "문법 과정 (Easy ~ High School)"', home.includes('data-testid="student-home-grammar"') && home.includes('📘 문법 과정 (Easy ~ High School)'))

if (fail) { console.log(`\nFAILED ${fail}`); process.exit(1) }
console.log('\nALL PASS')
