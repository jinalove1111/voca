// 2026-10-10 문법 과정 5개(Easy·Intermediate·Advanced·Middle School·High School) — 데이터 계약 + 화면/App 소스 핀. 저장·네트워크 0.
import fs from 'node:fs'
import { GRAMMAR_COURSES } from '../src/utils/grammar/grammarCourses.js'
import { GRAMMAR_UNITS, SCHOOL_GRAMMAR_NOTE_KO, unitsForCourse, grammarUnitById, courseCounts, resolveChoice, validateGrammarUnit, FUNCTION_WORDS, isComplete, reviewStatusOf, practiceCounts } from '../src/utils/grammar/grammarUnits.js'
import { buildFrame, validateScene, layoutSentence, countsMatch, sceneCards } from '../src/utils/grammar/sceneMission.js'
import { buildDeck, deckSteps, isPractice, deckCounts, cardIndexById } from '../src/utils/grammar/grammarDeck.js'
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


const READY = GRAMMAR_UNITS.filter((u) => u.status === 'ready')
const READY_IDS = READY.map((u) => u.id)
// ── 실제 데이터(2026-10-10 콘텐츠 초안, 교사 검수 전) ──
const cnt = (id) => courseCounts(id)
check('과정별 단원 수/준비: easy 8(8) · intermediate 8(8) · advanced 6(6) · middleSchool 6(6) · highSchool 6(6), 합계 34', ['easy:8:8', 'intermediate:8:8', 'advanced:6:6', 'middleSchool:6:6', 'highSchool:6:6'].every((x) => { const [id, t, r] = x.split(':'); return cnt(id).total === +t && cnt(id).ready === +r }) && GRAMMAR_UNITS.length === 34)
check('ready 단원은 34개 전부(Easy 8 + Intermediate 8 + Advanced 6 + Middle 6 + High 6), preparing 0개', READY_IDS.length === 34 && GRAMMAR_UNITS.every((u) => u.status === 'ready') && GRAMMAR_UNITS.filter((u) => u.status === 'preparing').length === 0)
check('학교 문법 단원의 basicsUnitId는 존재하고 easy/intermediate 소속이며 ready·isComplete', GRAMMAR_UNITS.filter((u) => u.courseId === 'middleSchool' || u.courseId === 'highSchool').every((u) => ['easy', 'intermediate'].includes(grammarUnitById(u.basicsUnitId)?.courseId) && grammarUnitById(u.basicsUnitId).status === 'ready' && isComplete(grammarUnitById(u.basicsUnitId))))
check('공통 개념 passive-voice·relative-clause·participle은 중등·고등 양쪽에 있음', ['passive-voice', 'relative-clause', 'participle'].every((c) => ['middleSchool', 'highSchool'].every((k) => GRAMMAR_UNITS.some((u) => u.courseId === k && u.conceptId === c))))
check('모든 prereqIds 실재, id 형식 g-*, 숙련도 단원 order가 1부터 연속', GRAMMAR_UNITS.every((u) => u.prereqIds.every((p) => grammarUnitById(p)) && /^g-/.test(u.id)) && GRAMMAR_COURSES.every((c) => unitsForCourse(c.id).every((u, i) => u.order === i + 1)))
check('ready 단원의 영어 문장은 예문·빈칸·정답 순서·예시 모두 문장당 8단어 이하(use 예시는 여러 문장 가능)', READY.every((u) => [...u.examples.map((e) => e.en), ...u.practice.blank.map((b) => b.en), ...u.practice.order.flatMap((o) => o.answers.map((a) => a.join(' '))), ...u.practice.build.map((b) => b.exampleEn), u.use.exampleEn].flatMap((t) => t.split(/(?<=[.?!])\s+/)).every((t) => t.trim().split(/\s+/).length <= 8)))
check('g-easy-02 예문에 desk 없음', !grammarUnitById('g-easy-02').examples.some((e) => /desk/i.test(e.en)))
check('fromUnitId 있는 ready 3개 resolveChoice = 시범 Unit 문형 문항 6개씩(fromUnitId 실재)', READY.filter((u) => u.fromUnitId).length === 3 && READY.filter((u) => u.fromUnitId).every((u) => UNITS.some((p) => p.id === u.fromUnitId) && resolveChoice(u, UNITS).length === 6 && resolveChoice(u, UNITS).length === UNITS.find((p) => p.id === u.fromUnitId).grammar.items.length))
check('준비 중 단원은 ready 내용 없이 제목·목표만 검증, 학교 문법 안내문 export', GRAMMAR_UNITS.filter((u) => u.status === 'preparing').every((u) => u.titleKo && u.goalKo && validateGrammarUnit(u).length === 0) && /학교 문법/.test(SCHOOL_GRAMMAR_NOTE_KO))

// ── 화면 소스 ──
const sSrc = strip(read('src/components/GrammarCourseScreen.jsx'))
const dSrc = strip(read('src/utils/grammar/grammarDeck.js'))
const KIND_ORDER = ['goal', 'examples', 'explain', 'structure', 'compare', 'error', 'choice', 'blank', 'order', 'build', 'use', 'summary']
const decks = READY.map((u) => { try { return { u, d: buildDeck(u, UNITS) } } catch (e) { return { u, err: String(e) } } })
const OLD = decks.filter(({ u }) => !u.scene) // scene 단원(g-easy-05)은 아래 scene 핀에서 따로 검증
check('덱: ready 34개 전부 buildDeck가 던지지 않고(scene 1개 제외 33개는) 종류 순서가 goal→examples→explain→structure→[compare]→error→choice→blank→order→build→use→summary', decks.length === 34 && OLD.length === 33 && OLD.every(({ d }) => d && d.map((c) => KIND_ORDER.indexOf(c.kind)).every((v, i, a) => v >= 0 && (i === 0 || v >= a[i - 1])) && d[0].kind === 'goal' && d.at(-1).kind === 'summary'), decks.filter((x) => x.err).map((x) => x.u.id + x.err).join())
check('덱: 카드 id 단원 안에서 유일, 모든 카드에 kind·stepKo·title', decks.every(({ d }) => new Set(d.map((c) => c.id)).size === d.length && d.every((c) => c.kind && c.stepKo && c.title)))
const D1 = buildDeck(grammarUnitById('g-easy-01'), UNITS), D2 = buildDeck(grammarUnitById('g-int-01'), UNITS)
check('덱 g-easy-01: 카드 23(설명 4줄), compare 없음, 선택 6·빈칸 2·순서 2·만들기 2, 종류 순서 고정', D1.length === 23 && !D1.some((c) => c.kind === 'compare') && JSON.stringify(deckCounts(D1)) === '{"cards":23,"explain":4,"practice":10,"build":2}'
  && D1.map((c) => c.kind).join() === 'goal,examples,explain,explain,explain,explain,structure,error,error,choice,choice,choice,choice,choice,choice,blank,blank,order,order,build,build,use,summary', D1.map((c) => c.kind).join())
check('덱 g-int-01: compare 카드가 구조 다음 오류 앞에 있음', D2.some((c) => c.kind === 'compare') && D2.findIndex((c) => c.kind === 'compare') === D2.findIndex((c) => c.kind === 'structure') + 1 && D2.findIndex((c) => c.kind === 'compare') < D2.findIndex((c) => c.kind === 'error'), D2.map((c) => c.kind).join())
check('덱: 카드 수 = 1+1+설명줄+1+compare+오류+연습+활용+마무리 (scene 아닌 33개 단원)', OLD.every(({ u, d }) => { const pc = practiceCounts(u, UNITS); return d.length === 1 + 1 + u.explainKo.length + 1 + (u.compare ? 1 : 0) + u.errors.length + pc.choice + pc.blank + pc.order + pc.build + 1 + 1 }))
check('덱: 설명 카드는 줄마다 예문 하나(예문[i], 없으면 첫 예문)를 함께 가짐, 목표 카드는 상황·basicsUnitId', D1.filter((c) => c.kind === 'explain').every((c, i) => c.example === grammarUnitById('g-easy-01').examples[i] && c.line === grammarUnitById('g-easy-01').explainKo[i]) && D1[0].situationKo === grammarUnitById('g-easy-01').examples[0].ko && 'basicsUnitId' in D1[0])
check('덱: deckSteps 순서·중복 없음, isPractice는 선택·빈칸·순서만, cardIndexById', deckSteps(D1).join() === '목표,예문,설명,구조,오류,연습 · 선택,연습 · 빈칸,연습 · 순서,연습 · 만들기,활용,마무리' && D1.filter(isPractice).length === 10 && D1.filter(isPractice).every((c) => ['choice', 'blank', 'order'].includes(c.kind)) && cardIndexById(D1, 'summary') === 22 && cardIndexById(D1, 'nope') === -1)
check('덱 모듈: 순수(React·PNG·units import 없음)', !dSrc.includes("from 'react'") && !dSrc.includes('.png') && !dSrc.includes('curriculum/units'))
const sKeys = ['gd-root', 'gd-step', 'gd-progress', 'gd-bar', 'gd-card', 'gd-prev', 'gd-next', 'gd-next-hint', 'gd-check', 'gd-result', 'gd-why', 'gd-retry', 'gd-build-input', 'gd-build-compare', 'gd-build-example', 'gd-use-done', 'gd-use-listen', 'gd-use-input', 'gd-use-compare', 'gd-summary', 'gd-retry-wrong', 'gd-to-list', 'gd-order-clear', 'gd-order-answer', 'gd-order-word-', 'gd-blank-opt-', 'gd-example-', 'gd-structure-', 'gd-error', 'gd-explain', 'gd-compare', 'gd-goal', 'gu-basics-link', 'gu-review-status']
check('화면: 카드 덱 testid가 소스에 모두 있음', sKeys.every((t) => sSrc.includes(t)), sKeys.filter((t) => !sSrc.includes(t)).join())
check('화면: go()에서 stopSpeaking·window.scrollTo, 제목에 focus, Choice는 initialPicked로 복원, 다음은 확인 전 disabled, 보기 카드 max-h·overflow-y-auto', ['const go = (i) => { stopSpeaking(); window.scrollTo({ top: 0 })', 'headingRef.current?.focus()', 'initialPicked={a.picked', 'data-testid="gd-next" disabled={!ok}', 'max-h-[52vh] sm:max-h-[64vh] overflow-y-auto', 'deckStates = useRef(new Map())'].every((t) => sSrc.includes(t)))
check('화면: 자동으로 다음 카드로 넘어가지 않음(go 호출은 prev·next·retry-wrong 3곳뿐)', sSrc.split('go(').length - 1 === 3 && sSrc.includes('const go ='), String(sSrc.split('go(').length - 1))
check('화면: 필수 testid(과정/단원 목록, 듣기, 구조 S/V/+, 다시 풀기, 진행, 기초 링크, 뒤로)', ['grammar-course-${c.id}', 'grammar-unit-${u.id}', 'grammar-units-back', 'gd-example-${i}-listen', 'gu-basics-link', 'gu-basics-back', 'data-testid="gu-back"', '준비 중', '예시는 하나의 답일 뿐이에요', '학교 문법 (제안)', '숙련도', 'grammar-school-note', 'SCHOOL_GRAMMAR_NOTE_KO', 'gu-preparing', 'data-status="preparing"', '이 단원은 준비 중이에요'].every((t) => sSrc.includes(t)))
check('화면: 저장·점수·네트워크 없음(localStorage/sessionStorage/fetch/supabase/점수)', !/localStorage|sessionStorage|fetch\(|supabase|markActivity|점수:/.test(sSrc))
check('화면: speak·stopSpeaking 재사용, Choice는 UnitScreen에서 import, units.js 직접 import 없음, 언마운트 시 stopSpeaking', /import \{ speak, stopSpeaking \} from '..\/utils\/speech'/.test(sSrc) && /import \{ Choice \} from '.\/UnitScreen'/.test(sSrc) && !/curriculum\/units/.test(sSrc) && /useEffect\(\(\) => \(\) => stopSpeaking\(\), \[\]\)/.test(sSrc))
check('화면: 준비 중 단원은 disabled(빈 화면 없음), 직접 쓴 글은 정오 판정 없음(compare만)', /disabled=\{!ready\}/.test(sSrc) && !/isCorrect|채점/.test(sSrc))

// ── App / 홈 / UnitScreen ──
const app = strip(read('src/App.jsx'))
check("App: QA_ONLY_SCREENS에 grammarCourses, 렌더가 qaTestStudent 게이팅, 문법 화면은 lazy + Suspense", /const QA_ONLY_SCREENS = \[[^\]]*'grammarCourses'\]/.test(app) && /qaTestStudent && screen === 'grammarCourses' && pilotUnits/.test(app) && /const GrammarCourseScreen = React\.lazy\(\(\) => import\('\.\/components\/GrammarCourseScreen'\)\)/.test(app) && /<GrammarCourseScreen units=\{pilotUnits\}/.test(app))
check("App: onGo grammar → grammarCourses, viaPicker에 grammar 없음, 선택기 intent에 grammar 없음", /t === 'grammar' \? 'grammarCourses'/.test(app) && !/const viaPicker = [^\n]*'grammar'/.test(app) && !/setUnitIntent\([^\n]*'grammar'/.test(app))
const u = strip(read('src/components/UnitScreen.jsx'))
check('UnitScreen: Choice를 named export, 선택기의 문법 intent·문법 모음 제거', /export function Choice\(/.test(u) && !/intent === 'grammar'/.test(u) && !u.includes('GrammarSetScreen'))
check('UnitScreen Choice: initialPicked 선택 prop(기본 null)이 초기 상태로만 쓰임, 화면은 Choice를 initialPicked로 사용', u.includes('onPick, initialPicked = null }') && u.includes('useState(initialPicked)') && sSrc.includes('initialPicked={'))
const home = read('src/components/StudentHome.jsx')
check('홈: 문법 카드(id grammar → student-home-menu-grammar, onPress go grammar), 작은 버튼 제거', home.includes("id: 'grammar'") && home.includes("go('grammar', 'grammar')") && !home.includes('student-home-grammar'))

// ── 구현 상태 vs 검수 상태 · 어휘 규칙 ──
check('FUNCTION_WORDS에 내용어 없음(borrow·like·have·play·pencil·bag 등), 문법어는 있음', ['borrow', 'like', 'have', 'play', 'pencil', 'bag', 'box', 'chair'].every((w) => !FUNCTION_WORDS.has(w)) && ['a', 'the', 'is', 'can', 'where', 'in', 'under'].every((w) => FUNCTION_WORDS.has(w)))
check('ready 34개: reviewStatus unreviewed, words 있음, 어휘 규칙 통과, isComplete', READY.every((u) => u.reviewStatus === 'unreviewed' && u.words.length > 0 && validateGrammarUnit(u).length === 0 && isComplete(u)))
const withWords = { ...okReady, words: [{ en: 'Ben', ko: '벤' }, { en: 'ten', ko: '열' }, { en: 'kind', ko: '친절' }, { en: 'b c d', ko: '문자' }] }
const bad = { ...withWords, examples: [...withWords.examples.slice(0, 2), { en: 'I play tennis.', ko: 'x' }] }
check('어휘 규칙: words가 있으면 통과, 미학습 단어(play, tennis)가 있으면 단어명을 담아 거부', validateGrammarUnit(withWords).length === 0 && validateGrammarUnit(bad).some((e) => /play/.test(e) && /tennis/.test(e)))
check('어휘 규칙: 선수 단원 words는 전이적으로 허용, easy는 g-easy-01/02 어휘 허용, wrong 오류 예시는 검사 제외', validateGrammarUnit({ ...withWords, courseId: 'intermediate', prereqIds: ['g-easy-02'], examples: [{ en: 'I am Ben.', ko: 'a' }, { en: 'I am ten.', ko: 'b' }, { en: 'Is it in the bag?', ko: 'c' }] }).length === 0
  && validateGrammarUnit({ ...withWords, examples: [{ en: 'I am Ben.', ko: 'a' }, { en: 'I am ten.', ko: 'b' }, { en: 'Can I borrow a ruler?', ko: 'c' }] }).length === 0
  && validateGrammarUnit({ ...withWords, errors: [{ wrong: 'I tennis Ben.', right: 'I am Ben.', whyKo: 'x' }, withWords.errors[1]] }).length === 0)
check('reviewStatus 기본값 unreviewed, 잘못된 값 거부, 개요(preparing)는 isComplete 아님', reviewStatusOf({ status: 'ready' }) === 'unreviewed' && reviewStatusOf({ reviewStatus: 'reviewed' }) === 'reviewed' && validateGrammarUnit({ ...okReady, reviewStatus: 'x' }).length > 0 && GRAMMAR_UNITS.filter((u) => u.status === 'preparing').every((u) => !isComplete(u)))
check('courseCounts.reviewed === 0 (검수 완료는 데이터에 없음)', GRAMMAR_COURSES.every((c) => courseCounts(c.id).reviewed === 0) && GRAMMAR_UNITS.every((u) => reviewStatusOf(u) === 'unreviewed'))
check("화면: gu-review-status·data-review·'검수 전'·'검수 완료'·과정 버튼 'ready n/total · 검수 r'", sSrc.includes('gu-review-status') && sSrc.includes('data-review') && sSrc.includes('검수 전') && sSrc.includes('검수 완료') && sSrc.includes('ready {ready}/{total} · 검수 {reviewed}'))

const EASY = unitsForCourse('easy')
const pc = (id) => JSON.stringify(practiceCounts(grammarUnitById(id), UNITS))
check('Easy 8개 전부 ready·courseCounts {8,8,0}', EASY.length === 8 && EASY.every((u) => u.status === 'ready' && isComplete(u)) && JSON.stringify(courseCounts('easy')) === '{"ready":8,"reviewed":0,"total":8}')
check('Easy 단원마다 선택 ≥3(또는 fromUnitId)·빈칸 2·순서 2·만들기 2·예문 3~4·오류 2·use', EASY.every((u) => { const c = practiceCounts(u, UNITS); return c.choice >= 3 && c.blank >= 2 && c.order >= 2 && c.build >= 2 && u.examples.length >= 3 && u.examples.length <= 4 && u.errors.length === 2 && u.use })
  && EASY.filter((u) => !u.fromUnitId).every((u) => u.practice.choice.length >= 3))
check('practiceCounts: g-int-02·g-adv-04 {3,2,2,2}', pc('g-int-02') === '{"choice":3,"blank":2,"order":2,"build":2}' && pc('g-adv-04') === '{"choice":3,"blank":2,"order":2,"build":2}', pc('g-int-02') + pc('g-adv-04'))
const PRO = ['intermediate', 'advanced'].flatMap((c) => unitsForCourse(c))
check('Intermediate·Advanced: conceptId 유일, 모든 ready 단원 reviewStatus unreviewed·prereq 실재', new Set(['easy', 'intermediate', 'advanced'].flatMap((c) => unitsForCourse(c).map((u) => u.conceptId))).size === 22 && PRO.every((u) => u.reviewStatus === 'unreviewed' && u.prereqIds.every((p) => grammarUnitById(p))))
check('practiceCounts: g-easy-01 {6,2,2,2}, g-easy-03 {3,2,2,2}', pc('g-easy-01') === '{"choice":6,"blank":2,"order":2,"build":2}' && pc('g-easy-03') === '{"choice":3,"blank":2,"order":2,"build":2}', pc('g-easy-01') + pc('g-easy-03'))
check('Easy 03~08: 다음 단원 어휘 의존 없음(paul·mia 허용, 숫자 two는 단원 words)', ['g-easy-03', 'g-easy-04', 'g-easy-05', 'g-easy-06', 'g-easy-07', 'g-easy-08'].every((id) => validateGrammarUnit(grammarUnitById(id)).length === 0) && validateGrammarUnit({ ...grammarUnitById('g-easy-03'), examples: [...grammarUnitById('g-easy-03').examples.slice(0, 3), { en: 'I am Tom.', ko: 'x' }] }).some((e) => /tom/.test(e)))

const SCH = ['middleSchool', 'highSchool'].flatMap((c) => unitsForCourse(c))
check('학교 문법 12개 전부 ready·unreviewed·isComplete, 예문 3~4·오류 2·explainKo 3', SCH.length === 12 && SCH.every((u) => u.status === 'ready' && u.reviewStatus === 'unreviewed' && isComplete(u) && u.examples.length >= 3 && u.examples.length <= 4 && u.errors.length === 2 && u.explainKo.length === 3))
check('모든 ready 단원: 예문 3~4·오류 2·explainKo 3', READY.every((u) => u.examples.length >= 3 && u.examples.length <= 4 && u.errors.length === 2 && u.explainKo.length >= 2 && u.explainKo.length <= 4) && SCH.every((u) => u.explainKo.length === 3))
check('공통 개념(passive-voice·relative-clause·participle): 중등·고등 titleKo 다르고 예문 en이 하나도 겹치지 않음', ['passive-voice', 'relative-clause', 'participle'].every((c) => { const m = SCH.find((u) => u.courseId === 'middleSchool' && u.conceptId === c); const h = SCH.find((u) => u.courseId === 'highSchool' && u.conceptId === c); return m && h && m.titleKo !== h.titleKo && !m.examples.some((e) => h.examples.some((x) => x.en === e.en)) }))
check('practiceCounts: g-mid-01·g-high-01 {3,2,2,2}', pc('g-mid-01') === '{"choice":3,"blank":2,"order":2,"build":2}' && pc('g-high-01') === '{"choice":3,"blank":2,"order":2,"build":2}', pc('g-mid-01') + pc('g-high-01'))

// ── 그림 상황 미션(scene): g-easy-05 Paul Town 공원 ──
const SM = strip(read('src/utils/grammar/sceneMission.js'))
const PS = strip(read('src/components/grammar/ParkScene.jsx'))
const SC = strip(read('src/components/grammar/SceneCards.jsx'))
const E5 = grammarUnitById('g-easy-05')
const sc = E5.scene
const D5 = buildDeck(E5, UNITS)
check('scene: g-easy-05.scene이 validateScene 통과(종류 순서·8단어·보기 수·acceptEn에 answerEn)', validateScene(sc).length === 0, validateScene(sc).join('; '))
check('scene: validateScene이 잘못된 데이터를 실제로 거부(단계 누락·긴 문장·보기 3개·place>slots·acceptEn 누락·listen 보기 1개)', validateScene({ ...sc, steps: sc.steps.slice(1) }).length > 0
  && validateScene({ ...sc, steps: sc.steps.map((s) => s.kind === 'write' ? { ...s, exampleEn: 'There are two trees in the big green park today.' } : s) }).length > 0
  && validateScene({ ...sc, steps: sc.steps.map((s) => s.kind === 'choose' ? { ...s, items: [{ ...s.items[0], options: ['is', 'are', 'am'] }] } : s) }).length > 0
  && validateScene({ ...sc, steps: sc.steps.map((s) => s.kind === 'build' ? { ...s, slots: 1 } : s) }).length > 0
  && validateScene({ ...sc, steps: sc.steps.map((s) => s.kind === 'build' ? { ...s, acceptEn: [] } : s) }).length > 0
  && validateScene({ ...sc, steps: sc.steps.map((s) => s.kind === 'listen' ? { ...s, items: [{ ...s.items[0], options: [s.items[0].options[0]] }] } : s) }).length > 0)
check("scene: layoutSentence 'There is a dog.' · 'There are three dogs.' · 'There are two trees.'", layoutSentence(sc, [{ obj: 'dog', n: 1 }]) === 'There is a dog.' && layoutSentence(sc, [{ obj: 'dog', n: 3 }]) === 'There are three dogs.' && layoutSentence(sc, [{ obj: 'tree', n: 2 }]) === 'There are two trees.')
check('scene: countsMatch는 종류·개수가 모두 같을 때만 true(배치 물건 {obj,x,y}도 1개로 센다)', countsMatch([{ obj: 'tree', n: 2 }], [{ obj: 'tree', x: 1, y: 1 }, { obj: 'tree', x: 2, y: 1 }]) && !countsMatch([{ obj: 'tree', n: 2 }], [{ obj: 'tree', x: 1, y: 1 }]) && !countsMatch([{ obj: 'tree', n: 2 }], [{ obj: 'dog', n: 2 }]))
check('scene: sceneCards 순서 discover→compare→choose→build→read→listen→speak→write→finish, choose·listen 문항마다, speak 2장(연습·시험)', (() => { const k = sceneCards(E5).map((c) => c.sceneKind); const first = [...new Set(k)].join(); return first === 'discover,compare,choose,build,read,listen,speak,write,finish' && k.filter((x) => x === 'choose').length === sc.steps[2].items.length && k.filter((x) => x === 'listen').length === sc.steps[5].items.length && k.filter((x) => x === 'speak').length === 2 && sceneCards(E5).filter((c) => c.sceneKind === 'speak').map((c) => c.mode).join() === 'practice,exam' })())
check('scene: g-easy-05 덱 = goal + 장면 카드 + summary (15장), 카드 id 유일', D5.length === 15 && D5[0].kind === 'goal' && D5.at(-1).kind === 'summary' && D5.slice(1, -1).every((c) => c.kind === 'scene' && /^scene-[a-z]+-\d+$/.test(c.id)) && new Set(D5.map((c) => c.id)).size === 15, String(D5.length))
check('scene: 연습 판정 — choose·listen·build·read·speak 시험은 연습, speak 연습·discover·compare·write·finish는 아님', isPractice(D5.find((c) => c.sceneKind === 'choose')) && isPractice(D5.find((c) => c.sceneKind === 'listen')) && isPractice(D5.find((c) => c.sceneKind === 'build')) && isPractice(D5.find((c) => c.sceneKind === 'read')) && isPractice(D5.find((c) => c.mode === 'exam')) && !isPractice(D5.find((c) => c.mode === 'practice')) && ['discover', 'compare', 'write', 'finish'].every((k) => !isPractice(D5.find((c) => c.sceneKind === k))))
check('scene: 나머지 33개 단원은 scene 없음·기존 카드 구성 그대로(g-easy-01 23장)', GRAMMAR_UNITS.filter((x) => x.scene).map((x) => x.id).join() === 'g-easy-05' && OLD.every(({ d }) => !d.some((c) => c.kind === 'scene')) && buildDeck(grammarUnitById('g-easy-01'), UNITS).length === 23)
check('scene: 순수 모듈(React·PNG·localStorage 없음), 화면은 scene 카드를 SceneCards로 렌더하고 sceneCanAdvance로 잠금', !/from 'react'|\.png|localStorage/.test(SM) && sSrc.includes("case 'scene'") && sSrc.includes('<SceneCards') && sSrc.includes('sceneCanAdvance(c, a)'))
check('scene: ParkScene — townAsset nature/tree·decorations/bench·animals/puppy + Paul 이미지, 인라인 svg(viewBox 360x220, role img), 공은 SVG 원, 장면 testid·data-counts·spot·obj', ["townAsset('nature/tree')", "townAsset('decorations/bench')", "townAsset('animals/puppy')"].every((x) => PS.replace(/key: '([^']+)'/g, "townAsset('$1')").includes(x)) && /from '..\/..\/assets\/paul'/.test(PS) && PS.includes('viewBox="0 0 360 220"') && PS.includes('role="img"') && PS.includes('<circle') && ['park-scene', 'data-counts', 'scene-spot-${i}', 'scene-obj-${obj}-${i}', '여기에 놓기', 'tabIndex', 'onKeyDown'].every((t) => PS.includes(t)) && read('src/components/grammar/ParkScene.jsx').includes('TODO assets') && !/localStorage/.test(PS))
const sceneIds = ['scene-caption', 'scene-opt-${j}', 'scene-check', 'scene-result', 'scene-why', 'scene-retry', 'scene-tray-${place.obj}', 'scene-placed-count', 'scene-sent-${i}', 'scene-pic-${j}', 'scene-listen-play', 'scene-sentence', 'scene-model-listen', 'scene-said', 'scene-reveal', 'scene-write-input', 'scene-write-compare', 'scene-finish']
check('scene: SceneCards 필수 testid가 소스에 모두 있음', sceneIds.every((t) => SC.includes(t)), sceneIds.filter((t) => !SC.includes(t)).join())
const examSrc = SC.slice(SC.indexOf('function SpeakExam'), SC.indexOf('function Write'))
const beforeReveal = examSrc.slice(0, examSrc.indexOf('{revealed && ('))
check('scene: 말하기 시험 카드 — 공개 전 영어(modelEn·alternatives·모범 음성)가 DOM에 없음(revealed && 가지 안에서만 렌더)', examSrc.includes('{revealed && (') && !/modelEn|alternatives|model-listen/.test(beforeReveal) && examSrc.indexOf('modelEn') > examSrc.indexOf('{revealed && ('))
const listenSrc = SC.slice(SC.indexOf('function ListenPick'), SC.indexOf('function SpeakPractice'))
check('scene: 듣기 — 영어 문장(it.en)은 speak 호출과 확인 뒤 scene-sentence에서만 쓰임', (listenSrc.match(/it\.en/g) || []).length === 2 && listenSrc.indexOf('<p data-testid="scene-sentence"') > listenSrc.indexOf('!a.checked ?') && !/aria-label=\{[^}]*it\.en/.test(listenSrc))
check('scene: 만들기 — 선택 후 탭(aria-pressed)과 포인터 드래그(setPointerCapture·elementFromPoint·touch-none)를 모두 지원, countsMatch로 놓은 수로 판정', SC.includes('aria-pressed={sel}') && SC.includes('setPointerCapture') && SC.includes('elementFromPoint') && SC.includes('touch-none') && SC.includes('picked === correct') && SC.includes('buildFrame(') && SC.includes('layoutSentence(c.unitScene'))
check('scene: 끝내기 — trackEvent grammar_scene_finish 한 번(보상·XP 없음), 저장 없음', SC.includes("trackEvent?.(studentId, 'grammar_scene_finish')") && !/localStorage|sessionStorage|fetch\(|supabase|addXp|reward\(/.test(SC) && sSrc.includes('studentId'))

const bs = sc.steps.find((x) => x.kind === 'build')
const f0 = buildFrame(sc, bs, 0), f1 = buildFrame(sc, bs, 1), f2 = buildFrame(sc, bs, 2), f3 = buildFrame(sc, bs, 3)
check("scene: 만들기 문장틀이 놓은 수를 따름 — 0개 데이터 틀·보기 없음, 1개 'There is ___ tree.'(정답 a), 2개 'There are ___ trees.'(정답 two), 3개 정답 three", f0.frame === bs.frameEn && f0.options.length === 0
  && f1.frame === 'There is ___ tree.' && f1.options[f1.correct] === 'a' && f1.frame.replace('___', 'a') === layoutSentence(sc, [{ obj: 'tree', n: 1 }])
  && f2.frame === 'There are ___ trees.' && f2.options[f2.correct] === 'two' && f2.frame.replace('___', 'two') === layoutSentence(sc, [{ obj: 'tree', n: 2 }])
  && f3.options[f3.correct] === 'three' && f3.frame.replace('___', 'three') === layoutSentence(sc, [{ obj: 'tree', n: 3 }]))
if (fail) { console.log(`\nFAILED ${fail}`); process.exit(1) }
console.log('\nALL PASS')
