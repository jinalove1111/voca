// 2026-10-10 문법 과정 5개(Easy·Intermediate·Advanced·Middle School·High School) — 데이터 계약 + 화면/App 소스 핀. 저장·네트워크 0.
import fs from 'node:fs'
import { GRAMMAR_COURSES } from '../src/utils/grammar/grammarCourses.js'
import { GRAMMAR_UNITS, SCHOOL_GRAMMAR_NOTE_KO, unitsForCourse, grammarUnitById, courseCounts, resolveChoice, validateGrammarUnit, FUNCTION_WORDS, isComplete, reviewStatusOf, practiceCounts } from '../src/utils/grammar/grammarUnits.js'
import { buildFrame, validateScene, layoutSentence, countsMatch, sceneCards, layoutItems, relationSpots, positionFrame, viewOf, displayOrder } from '../src/utils/grammar/sceneMission.js'
import { PROPS, ACTIONS, RELATIONS, CHARACTERS, BACKGROUNDS } from '../src/utils/grammar/sceneProps.js'
import easyScenes from '../src/utils/grammar/scenes/easy.js'
import intScenes from '../src/utils/grammar/scenes/int.js'
import advScenes from '../src/utils/grammar/scenes/adv.js'
import midScenes from '../src/utils/grammar/scenes/mid.js'
import highScenes from '../src/utils/grammar/scenes/high.js'
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
const FULL = decks.filter(({ u }) => u.scene?.mode === 'full') // 시범 g-easy-05(mode full)만 덱 모양이 다르다 — 아래 scene 핀에서 따로 검증
const STD = decks.filter(({ u }) => u.scene?.mode !== 'full') // scene 없는 단원 + mode 'add' 단원(표준 덱 + 장면 카드)
const nsc = (d) => d.filter((c) => c.kind !== 'scene') // 장면 카드를 뺀 표준 카드
const scn = (u) => (u.scene ? sceneCards(u).length : 0)
check('덱: ready 34개 전부 buildDeck가 던지지 않고(시범 full 1개 제외 33개는) 장면 카드를 뺀 종류 순서가 goal→examples→explain→structure→[compare]→error→choice→blank→order→build→use→summary', decks.length === 34 && FULL.length === 1 && STD.length === 33 && STD.every(({ d }) => d && nsc(d).map((c) => KIND_ORDER.indexOf(c.kind)).every((v, i, a) => v >= 0 && (i === 0 || v >= a[i - 1])) && d[0].kind === 'goal' && d.at(-1).kind === 'summary'), decks.filter((x) => x.err).map((x) => x.u.id + x.err).join())
// add 단원: 기존 카드는 id·종류·순서 그대로(장면을 뺀 단원의 덱과 같다), 장면 카드는 정확히 두 자리(설명 = structure 바로 뒤, 연습 = 마지막 error 바로 뒤)
const ADDD = STD.filter(({ u }) => u.scene)
const headLen = (u) => 3 + u.explainKo.length + (u.compare ? 1 : 0) + u.errors.length // goal·examples·explain들·structure·[compare]·error들
check('덱 add: 장면 카드를 빼면 기존 덱과 id·종류·순서가 완전히 같음(장면을 뺀 단원의 buildDeck)', ADDD.every(({ u, d }) => { const base = buildDeck({ ...u, scene: undefined }, UNITS); return nsc(d).map((c) => `${c.kind}:${c.id}`).join() === base.map((c) => `${c.kind}:${c.id}`).join() }), ADDD.map((x) => x.u.id).join())
check('덱 add: 장면 카드가 정확히 두 자리에만 — 설명 슬롯은 structure 바로 뒤 연속, 연습 슬롯은 마지막 error 바로 뒤(첫 선택 앞) 연속, 그 밖에 장면 카드 없음', ADDD.every(({ u, d }) => {
  const sc = sceneCards(u), ex = sc.filter((c) => c.slot === 'explain'), pr = sc.filter((c) => c.slot === 'practice'), iS = d.findIndex((c) => c.kind === 'structure'), h = headLen(u)
  const pStart = h + ex.length // 연습 슬롯 시작 위치 = 표준 앞부분 + 설명 장면
  return sc.length === ex.length + pr.length && ex.length >= 1 && pr.length >= 1
    && d.slice(iS + 1, iS + 1 + ex.length).map((c) => c.id).join() === ex.map((c) => c.id).join()
    && d.slice(pStart, pStart + pr.length).map((c) => c.id).join() === pr.map((c) => c.id).join()
    && d[pStart - 1].kind === (u.errors.length ? 'error' : u.compare ? 'compare' : 'scene') && d[pStart + pr.length].kind === 'choice'
    && d.map((c, i) => (c.kind === 'scene' ? i : -1)).filter((i) => i >= 0).every((i) => (i > iS && i <= iS + ex.length) || (i >= pStart && i < pStart + pr.length))
    && ex.every((c) => ['discover', 'compare'].includes(c.sceneKind)) && pr.every((c) => ['choose', 'build', 'read', 'listen'].includes(c.sceneKind))
}), ADDD.map((x) => x.u.id).join())
check('덱: 카드 id 단원 안에서 유일, 모든 카드에 kind·stepKo·title', decks.every(({ d }) => new Set(d.map((c) => c.id)).size === d.length && d.every((c) => c.kind && c.stepKo && c.title)))
const D1 = buildDeck(grammarUnitById('g-easy-01'), UNITS), D2 = buildDeck(grammarUnitById('g-int-01'), UNITS)
const D1o = nsc(D1) // 장면이 붙어도 표준 카드는 그대로
check('덱 g-easy-01: 표준 카드 23(설명 4줄), 총 카드 = 23 + 장면 카드 수(scene 없으면 23), compare 없음, 선택 6·빈칸 2·순서 2·만들기 2, 종류 순서 고정', D1.length === 23 + scn(grammarUnitById('g-easy-01')) && D1o.length === 23 && !D1.some((c) => c.kind === 'compare') && JSON.stringify(deckCounts(D1o)) === '{"cards":23,"explain":4,"practice":10,"build":2}'
  && D1o.map((c) => c.kind).join() === 'goal,examples,explain,explain,explain,explain,structure,error,error,choice,choice,choice,choice,choice,choice,blank,blank,order,order,build,build,use,summary', D1.map((c) => c.kind).join())
check('덱 g-int-01: compare 카드가 구조 다음 오류 앞에 있음', D2.some((c) => c.kind === 'compare') && D2.slice(D2.findIndex((c) => c.kind === 'structure') + 1, D2.findIndex((c) => c.kind === 'compare')).every((c) => c.kind === 'scene' && c.slot === 'explain') && D2.findIndex((c) => c.kind === 'compare') > D2.findIndex((c) => c.kind === 'structure') && D2.findIndex((c) => c.kind === 'compare') < D2.findIndex((c) => c.kind === 'error'), D2.map((c) => c.kind).join())
check('덱: 카드 수 = 1+1+설명줄+1+compare+오류+연습+활용+마무리 + sceneCards 수 (시범 full 제외 33개 단원, scene 없으면 +0)', STD.every(({ u, d }) => { const pc = practiceCounts(u, UNITS); return d.length === 1 + 1 + u.explainKo.length + 1 + (u.compare ? 1 : 0) + u.errors.length + pc.choice + pc.blank + pc.order + pc.build + 1 + 1 + scn(u) }))
check('덱: 설명 카드는 줄마다 예문 하나(예문[i], 없으면 첫 예문)를 함께 가짐, 목표 카드는 상황·basicsUnitId', D1.filter((c) => c.kind === 'explain').every((c, i) => c.example === grammarUnitById('g-easy-01').examples[i] && c.line === grammarUnitById('g-easy-01').explainKo[i]) && D1[0].situationKo === grammarUnitById('g-easy-01').examples[0].ko && 'basicsUnitId' in D1[0])
check('덱: deckSteps 순서·중복 없음, isPractice는 선택·빈칸·순서만, cardIndexById', deckSteps(D1o).join() === '목표,예문,설명,구조,오류,연습 · 선택,연습 · 빈칸,연습 · 순서,연습 · 만들기,활용,마무리' && D1o.filter(isPractice).length === 10 && D1o.filter(isPractice).every((c) => ['choice', 'blank', 'order'].includes(c.kind)) && D1.filter(isPractice).length === 10 + sceneCards(grammarUnitById('g-easy-01')).filter(isPractice).length && cardIndexById(D1, 'summary') === 22 + scn(grammarUnitById('g-easy-01')) && cardIndexById(D1, 'nope') === -1)
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
check('scene: 장면 단원 = 시범 g-easy-05(full) + add 단원들뿐, scene 없는 단원 덱엔 장면 카드 없음·기존 구성 그대로, g-easy-01은 scene 없으면 23장 있으면 23 + 장면 카드 수', GRAMMAR_UNITS.filter((x) => x.scene).every((x) => x.id === 'g-easy-05' ? x.scene.mode === 'full' : x.scene.mode === 'add') && GRAMMAR_UNITS.some((x) => x.id === 'g-easy-05' && x.scene) && STD.filter(({ u }) => !u.scene).every(({ d }) => !d.some((c) => c.kind === 'scene')) && buildDeck(grammarUnitById('g-easy-01'), UNITS).length === 23 + scn(grammarUnitById('g-easy-01')))
check('scene: 순수 모듈(React·PNG·localStorage 없음), 화면은 scene 카드를 SceneCards로 렌더하고 sceneCanAdvance로 잠금', !/from 'react'|\.png|localStorage/.test(SM) && sSrc.includes("case 'scene'") && sSrc.includes('<SceneCards') && sSrc.includes('sceneCanAdvance(c, a)'))
const STG = strip(read('src/components/grammar/Stage.jsx'))
const PSW = read('src/components/grammar/ParkScene.jsx')
const PRP = read('src/utils/grammar/sceneProps.js')
check("scene: 그림 — sceneProps가 nature/tree·decorations/bench·animals/puppy를 지정하고 Stage가 townAsset + Paul 이미지, 인라인 svg(viewBox 360x220, role img), 공은 SVG 원, 장면 testid·data-counts·spot·obj, ParkScene은 Stage(park) 포장", ["tree: o('나무', 48, 64, 'nature/tree')", "bench: o('벤치', 54, 36, 'decorations/bench')", "dog: a('강아지', 54, 40, 'animals/puppy')"].every((x) => PRP.includes(x)) && /townAsset\(PROPS\[obj\]\.asset\)/.test(STG) && /from '..\/..\/assets\/paul'/.test(STG) && STG.includes('viewBox="0 0 360 220"') && STG.includes('role="img"') && STG.includes('<circle') && ['park-scene', 'data-counts', 'scene-spot-${i}', 'scene-obj-${obj}-${i}', '여기에 놓기', 'tabIndex', 'onKeyDown', 'data-testid="scene-paul"'].every((t) => STG.includes(t)) && read('src/components/grammar/Stage.jsx').includes('TODO assets') && !/localStorage/.test(STG) && /<Stage bg="park"/.test(PSW) && /export const artUrl/.test(PSW))
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

// ── Scene v2 (2026-10-10): mode add · 그림 방식 · 위치 놓기 · 배치 기하 · 장면 데이터 병합 ──
const keys = (o) => Object.keys(o).join()
check('scene v2: PROPS 키가 brief §2와 정확히 같음(캐릭터 10 + 동물 5 + 스프라이트 물건 12 + 임시 도형 물건 42)',
  keys(PROPS) === 'paul,cookie,mia,tom,mom,dad,teacher,kid,grandma,driver,dog,cat,owl,bird,fish,tree,bench,flower,lamp,postbox,fountain,house,school,cafe,shop,bridge,tower,ball,box,book,bag,pencil,cup,apple,bike,car,bus,phone,chair,table,bed,door,umbrella,hat,letter,cake,pizza,milk,egg,key,map,clock,guitar,kite,tv,computer,window,desk,board,money,ticket,gift,shoes,jacket,homework,newspaper,medal,trophy', keys(PROPS))
check('scene v2: PROPS 값 모양 {ko, kind, w, h}, asset은 Town 키이며 town/index.js에 등록돼 있음, 요구된 16개(cookie 포함)만 asset 보유',
  Object.values(PROPS).every((p) => p.ko && ['character', 'animal', 'object'].includes(p.kind) && p.w > 0 && p.h > 0)
  && Object.entries(PROPS).filter(([, p]) => p.asset).map(([k, p]) => `${k}=${p.asset}`).join() === 'cookie=animals/puppy,dog=animals/puppy,cat=animals/cat,owl=animals/owl,tree=nature/tree,bench=decorations/bench,flower=nature/flower-garden,lamp=decorations/street-lamp,postbox=decorations/red-post-box,fountain=decorations/stone-fountain,house=buildings/my-house,school=special/english-school,cafe=buildings/cafe,shop=buildings/book-shop,bridge=special/bridge,tower=special/clock-tower'
  && Object.values(PROPS).filter((p) => p.asset).every((p) => read('src/assets/town/index.js').includes(`'${p.asset}'`)))
check('scene v2: ACTIONS 37개(emoji·ko, like 포함, play는 ⚽), RELATIONS 6, CHARACTERS 10, BACKGROUNDS 5',
  keys(ACTIONS) === 'run,walk,read,eat,drink,sleep,play,sing,swim,cook,study,write,draw,clean,sit,jump,dance,talk,ride,wash,open,close,watch,listen,cry,laugh,wait,think,buy,call,drive,paint,fix,help,carry,wave,like' && ACTIONS.like.emoji === '❤️' && ACTIONS.like.ko === '좋아해요' && ACTIONS.play.emoji === '⚽' && Object.values(ACTIONS).every((a) => a.ko && a.emoji)
  && RELATIONS.join() === 'in,on,under,next to,behind,in front of' && CHARACTERS.join() === 'paul,cookie,mia,tom,mom,dad,teacher,kid,grandma,driver' && BACKGROUNDS.join() === 'park,home,school,street,plain')
check('scene v2: sceneProps는 순수 데이터(import·React·PNG 없음)', !/^\s*import /m.test(strip(PRP)) && !/react|\.png|localStorage/.test(strip(PRP)))

// 최소 add 장면(g-easy-01 단원 위에 얹는다)
const SYN = {
  id: 'syn', mode: 'add', titleKo: '합성', bgKo: '집 거실', bg: 'home', characters: ['paul'],
  objects: { ball: { en: 'ball', ko: '공' }, box: { en: 'box', ko: '상자' } },
  steps: [
    { kind: 'discover', stepKo: '발견', promptKo: '공을 눌러 보세요.', layout: [{ obj: 'box' }, { obj: 'ball', at: 'in', ref: 'box' }], tap: { obj: 'ball', en: 'The ball is in the box.', ko: '공이 상자 안에 있어.' } },
    { kind: 'choose', stepKo: '선택', items: [{ promptKo: '고르세요', layout: [{ obj: 'box' }, { obj: 'ball', at: 'on', ref: 'box' }], frame: 'The ball is ___ the box.', options: ['in', 'on', 'under'], correct: 1, whyKo: '공이 상자 위에 있어요.' }] },
    { kind: 'build', stepKo: '놓기', promptKo: '공을 상자 위에 놓아 보세요.', place: { obj: 'ball', ref: 'box', relations: ['in', 'on', 'under'] }, frameEn: 'The ball is ___ the box.', whyKo: '놓은 곳이 문장이 돼요.' },
    { kind: 'listen', stepKo: '듣기', items: [{ en: 'The ball is in the box.', options: [{ layout: [{ obj: 'box' }, { obj: 'ball', at: 'in', ref: 'box' }] }, { layout: [{ obj: 'box' }, { obj: 'ball', at: 'under', ref: 'box' }] }], correct: 0, whyKo: 'in은 안이에요.' }] },
    { kind: 'read', stepKo: '읽기', promptKo: '짝을 지어요.', pairs: [{ en: 'The ball is in the box.', layout: [{ obj: 'box' }, { obj: 'ball', at: 'in', ref: 'box' }] }, { en: 'The ball is on the box.', layout: [{ obj: 'box' }, { obj: 'ball', at: 'on', ref: 'box' }] }] },
  ],
}
const U1 = grammarUnitById('g-easy-01')
const SYNU = { ...U1, scene: SYN }
const errs = (sceneObj, o = { course: 'easy', unit: SYNU }) => validateScene(sceneObj, o)
const withSteps = (f) => ({ ...SYN, steps: f(SYN.steps) })
const mapKind = (k, f) => withSteps((st) => st.map((x) => (x.kind === k ? f(x) : x)))
const has = (list, sub) => list.some((x) => x.includes(sub))
check('scene v2: 올바른 최소 add 장면은 오류 0(코스 easy·어휘 규칙 포함)', errs(SYN).length === 0, errs(SYN).join('; '))
check('scene v2: add 규칙 — 설명 종류 누락·연습 종류 누락·speak/write/finish 금지·mode 없음(9종류 아님)이 거부됨',
  has(errs(withSteps((st) => st.filter((x) => x.kind !== 'discover'))), 'discover 또는 compare 필요') && has(errs(withSteps((st) => st.filter((x) => x.kind === 'discover'))), 'choose·listen·read·build')
  && has(errs(withSteps((st) => [...st, { kind: 'speak', stepKo: 'x' }])), '쓸 수 없는 종류: speak') && has(errs({ ...SYN, mode: undefined }), 'mode 없음') && has(errs({ ...SYN, mode: 'zzz' }), 'mode 오류') && has(errs({ ...SYN, bg: undefined }), 'bg 필요') && has(errs({ ...SYN, bg: 'moon' }), 'bg 오류'))
check('scene v2: 물건 규칙 — 알 수 없는 prop·objects에 없는 obj·at에 ref 없음·ref가 layout에 없음·size/dist/action 오류·n<1·영어 labelKo가 거부됨',
  has(errs({ ...SYN, objects: { ...SYN.objects, foo: { en: 'foo', ko: '푸' } } }), '알 수 없는 prop foo')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'dog' }] }))), 'objects에 없는 obj dog')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'box' }, { obj: 'ball', at: 'in' }] }))), 'at에는 같은 layout의 다른 ref 필요')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'ball', at: 'in', ref: 'box' }] }))), 'at에는 같은 layout의 다른 ref 필요')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'box' }, { obj: 'ball', at: 'over', ref: 'box' }] }))), 'at 오류')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'box', size: 'xl' }] }))), 'size는')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'box', dist: 'mid' }] }))), 'dist는')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'box', action: 'fly' }] }))), '알 수 없는 action')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'box', n: 0 }] }))), 'n은 1 이상')
  && has(errs(mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'ball', dist: 'far', labelKo: 'ball' }] }))), 'labelKo는 한국어만'))
check('scene v2: 대화·시간 그림 규칙 — 대화 en이 보기/정답/채운 틀/듣기 문장과 같으면 거부, who·ko·lines 개수, panels 2~4·라벨',
  has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], lines: [{ who: 'paul', ko: '어디?', en: 'On' }] }] }))), '대화 en이')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], lines: [{ who: 'paul', ko: '어디?', en: 'The ball is on the box.' }] }] }))), '대화 en이')
  && has(errs(mapKind('listen', (x) => ({ ...x, items: [{ ...x.items[0], options: x.items[0].options.map((o, i) => (i === 0 ? { ...o, lines: [{ who: 'paul', ko: '공', en: 'the ball is in the box' }] } : o)) }] }))), '대화 en이')
  && has(errs(mapKind('read', (x) => ({ ...x, pairs: x.pairs.map((p, i) => (i === 0 ? { ...p, lines: [{ who: 'paul', ko: '공', en: 'The ball is on the box.' }] } : p)) }))), '대화 en이')
  && errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], lines: [{ who: 'paul', ko: '어디 있어?', en: 'The box.' }] }] }))).length === 0
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], lines: [{ who: 'ghost', ko: '어디?' }] }] }))), 'who 오류')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], lines: [] }] }))), 'lines 1~4개')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], panels: [{ labelKo: '어제', layout: x.items[0].layout }] }] }))), 'panels 2~4개')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], panels: [{ labelKo: 'now', layout: x.items[0].layout }, { labelKo: '내일', layout: x.items[0].layout }] }] }))), 'labelKo 필요(한국어만)')
  && errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], panels: [{ labelKo: '어제', layout: x.items[0].layout }, { labelKo: '지금', layout: x.items[0].layout }], focus: 1 }] }))).length === 0
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], view: 'cinema' }] }))), 'view 오류'))
check('scene v2: 틀·보기·듣기·읽기 규칙 — ___ 정확히 1개, 보기 2~4개·correct 범위, 듣기 보기 그림 중복 거부, 읽기 그림 중복 거부',
  has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], frame: 'The ball is in the box.' }] }))), '틀에 ___ 하나 필요')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], frame: 'The ___ is ___ the box.' }] }))), '틀에 ___ 하나 필요')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], options: ['in'], correct: 0 }] }))), '보기 2~4개')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], options: ['in', 'on', 'under', 'in', 'on'], correct: 0 }] }))), '보기 2~4개')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], correct: 3 }] }))), 'correct 범위')
  && errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], options: ['in', 'on', 'under'], correct: 2 }] }))).length === 0
  && has(errs(mapKind('listen', (x) => ({ ...x, items: [{ ...x.items[0], options: [x.items[0].options[0], x.items[0].options[0]] }] }))), '보기 그림이 서로 달라야 함')
  && has(errs(mapKind('listen', (x) => ({ ...x, items: [{ ...x.items[0], correct: 2 }] }))), 'listen: 보기 2~3개·correct')
  && has(errs(mapKind('read', (x) => ({ ...x, pairs: [x.pairs[0], { ...x.pairs[1], layout: x.pairs[0].layout }] }))), 'read: 그림이 서로 달라야 함')
  && has(errs(mapKind('read', (x) => ({ ...x, pairs: [x.pairs[0]] }))), 'read: pairs 2개 이상'))
check('scene v2: 코스별 단어 수 — easy 7·int 9·mid 12 초과 거부, 코스 없으면 8',
  (() => { const long = mapKind('discover', (x) => ({ ...x, tap: { ...x.tap, en: 'The ball is in the box here sure.' } })); const l8 = mapKind('discover', (x) => ({ ...x, tap: { ...x.tap, en: 'The ball is in the box here sure box.' } }))
    return has(errs(long), '영어 7단어 이하') && errs(long, { course: 'intermediate' }).length === 0 && errs(long, { course: 'middleSchool' }).length === 0 && errs(long, {}).length === 0 && has(errs(l8, {}), '영어 8단어 이하') && errs(l8, { course: 'int' }).length === 0 })())
check('scene v2: 위치 놓기 규칙 — ref 필수·relations 2개 이상·RELATIONS 안·frameEn ___ 하나·obj≠ref·layout에 ref',
  has(errs(mapKind('build', (x) => ({ ...x, place: { ...x.place, relations: ['in'] } }))), 'relations 2개 이상')
  && has(errs(mapKind('build', (x) => ({ ...x, place: { ...x.place, relations: ['in', 'over'] } }))), 'relations 2개 이상')
  && has(errs(mapKind('build', (x) => ({ ...x, place: { ...x.place, ref: 'book' } }))), 'place.obj·place.ref가 objects에 없음')
  && has(errs(mapKind('build', (x) => ({ ...x, place: { ...x.place, ref: 'ball' } }))), 'obj와 ref가 같음')
  && has(errs(mapKind('build', (x) => ({ ...x, frameEn: 'The ball is in the box.' }))), '틀에 ___ 하나 필요')
  && has(errs(mapKind('build', (x) => ({ ...x, layout: [{ obj: 'ball' }] }))), 'layout에 ref가 있어야 함'))
check('scene v2: 어휘 규칙 — 단원에 없는 단어(next, front)와 장면에 없는 단어가 채운 틀·대화에서도 잡힘, allowed 직접 지정도 가능',
  has(errs(mapKind('build', (x) => ({ ...x, place: { ...x.place, relations: ['in', 'next to'] } }))), '어휘: 배우지 않은 단어 next')
  && has(errs(mapKind('build', (x) => ({ ...x, place: { ...x.place, relations: ['in', 'in front of'] } }))), 'front')
  && has(errs(mapKind('choose', (x) => ({ ...x, items: [{ ...x.items[0], options: ['in', 'on', 'beside'], correct: 1 }] }))), 'beside')
  && has(errs(mapKind('discover', (x) => ({ ...x, tap: { ...x.tap, en: 'The ball is in the pizza.' } }))), 'pizza')
  && errs(mapKind('build', (x) => ({ ...x, place: { ...x.place, relations: ['in', 'next to'] } })), { course: 'easy', allowed: new Set(['the', 'ball', 'is', 'in', 'on', 'under', 'next', 'to', 'box']) }).length === 0
  && errs(mapKind('build', (x) => ({ ...x, place: { ...x.place, relations: ['in', 'next to'] } })), { course: 'easy' }).length === 0)

// 덱 순서(add): 설명 장면 카드는 structure 뒤, 연습 장면 카드는 마지막 error 뒤(choice 앞), 기존 id는 그대로
// 합성 장면(SYN)과 비교할 기준 덱 = 실제 장면을 뗀 g-easy-01(실제 장면이 붙어도 23장 기준이 유지되게)
const baseDeck = buildDeck({ ...U1, scene: undefined }, UNITS), synDeck = buildDeck(SYNU, UNITS)
const synScene = synDeck.filter((c) => c.kind === 'scene')
const noScene = synDeck.filter((c) => c.kind !== 'scene')
const iStruct = synDeck.findIndex((c) => c.kind === 'structure'), lastErr = synDeck.map((c) => c.kind).lastIndexOf('error'), firstChoice = synDeck.findIndex((c) => c.kind === 'choice')
check('scene v2: add 덱 — 기존 카드 id·순서 그대로(장면 카드를 빼면 g-easy-01 기존 덱과 같음), 장면 카드 5장 추가(23→28)', baseDeck.length === 23 && synDeck.length === 28 && noScene.map((c) => c.id).join() === baseDeck.map((c) => c.id).join() && synScene.length === 5 && new Set(synDeck.map((c) => c.id)).size === 28)
check('scene v2: add 덱 — 설명 슬롯(discover)은 structure 바로 뒤, 연습 슬롯(choose·build·listen·read)은 마지막 error 바로 뒤·choice-0 앞, 카드 id scene-<kind>-<i>',
  synDeck[iStruct + 1].sceneKind === 'discover' && synDeck[iStruct + 1].slot === 'explain' && synDeck.slice(lastErr + 1, firstChoice).map((c) => c.sceneKind).join() === 'choose,build,listen,read' && synDeck.slice(lastErr + 1, firstChoice).every((c) => c.slot === 'practice')
  && synScene.map((c) => c.id).join() === 'scene-discover-0,scene-choose-1,scene-build-2,scene-listen-3,scene-read-4' && synDeck[firstChoice].id === 'choice-0')
check('scene v2: add 덱 — 위치 놓기 build·choose·listen·read는 연습으로 셈(isPractice), discover는 아님, 카드 수 = 기존 + 5 (연습 +4)',
  synScene.filter(isPractice).length === 4 && !isPractice(synScene[0]) && deckCounts(synDeck).practice === deckCounts(baseDeck).practice + 4 && sceneCards(SYNU).find((c) => c.sceneKind === 'build').title === '그림 만들기')
check('scene v2: 시범 g-easy-05는 mode full·덱 15장·카드 id 그대로·add 슬롯 태그 없음', sc.mode === 'full' && D5.length === 15 && D5.every((c) => !('slot' in c)) && D5.map((c) => c.id).join() === 'goal,scene-discover-0,scene-compare-1,scene-choose-2,scene-choose-3,scene-choose-4,scene-build-5,scene-read-6,scene-listen-7,scene-listen-8,scene-speak-9,scene-speak-10,scene-write-11,scene-finish-12,summary', D5.map((c) => c.id).join())
check('scene v2: mode 없는 9종류 scene은 full로 인정, 종류 일부만 있는 mode 없는 scene은 거부', validateScene({ ...sc, mode: undefined }).length === 0 && validateScene({ ...sc, mode: undefined, steps: sc.steps.slice(0, 5) }).some((x) => x.includes('mode 없음')))

// 위치·배치 기하
const ps = positionFrame(SYN.steps[2])
check('scene v2: positionFrame — 틀은 frameEn, 보기는 relations, correctFor(관계) = 보기 번호(없는 관계 -1)', ps.frame === 'The ball is ___ the box.' && ps.options.join() === 'in,on,under' && ps.correctFor('in') === 0 && ps.correctFor('under') === 2 && ps.correctFor('behind') === -1)
const box = { x: 100, y: 188, w: 30, h: 24 }
const sp = relationSpots(box), spBy = Object.fromEntries(sp.map((x) => [x.relation, x]))
check('scene v2: relationSpots — 6개 관계, on이 in보다 위·in이 under보다 위, next to는 오른쪽, behind는 왼쪽 위·작게, in front of는 오른쪽 아래, 모두 viewBox 안',
  sp.map((x) => x.relation).join() === RELATIONS.join() && spBy.on.y < spBy.in.y && spBy.in.y < spBy.under.y && spBy['next to'].x > box.x + box.w / 2 && spBy.behind.x < box.x && spBy.behind.y < box.y && spBy.behind.scale < 1
  && spBy['in front of'].x > box.x && spBy['in front of'].y > box.y && sp.every((x) => x.x >= 0 && x.x <= 360 && x.y >= 0 && x.y <= 220 && x.size > 0))
const LI = (l, o) => layoutItems(l, o)
const two = LI([{ obj: 'tree', n: 2 }])
check('scene v2: layoutItems 기본 — n개로 펼침, 한 줄(x 66부터 슬롯), 바닥 188, 물건별 번호 i, 크기 1(나무 48 맞음)', two.length === 2 && two[0].x === 98 && two[1].x === 162 && two.every((t) => t.y === 188 && t.scale === 1 && t.w === 48 && t.h === 64) && two.map((t) => t.i).join() === '0,1')
check('scene v2: layoutItems center — 가운데 정렬(한 개면 x=180), 여러 종류 섞어도 layout 순서·물건별 번호',
  LI([{ obj: 'box' }], { center: true })[0].x === 180 && LI([{ obj: 'dog' }, { obj: 'tree' }, { obj: 'dog' }]).map((t) => `${t.obj}${t.i}`).join() === 'dog0,tree0,dog1')
const sz = (s) => LI([{ obj: 'ball', size: s }])[0].scale
check('scene v2: layoutItems size — s 0.7 · m 1 · l 1.3(기본 m), dist far = 0.6배·22 위, 둘 다 곱해짐', sz('s') === 0.7 && sz('m') === 1 && sz('l') === 1.3 && sz(undefined) === 1
  && LI([{ obj: 'ball', dist: 'far' }])[0].scale === 0.6 && LI([{ obj: 'ball', dist: 'far' }])[0].y === 166 && Math.abs(LI([{ obj: 'ball', dist: 'far', size: 'l' }])[0].scale - 0.78) < 1e-9)
const onBox = LI([{ obj: 'box' }, { obj: 'ball', at: 'on', ref: 'box' }]), inBox = LI([{ obj: 'ball', at: 'in', ref: 'box' }, { obj: 'box' }]), behind = LI([{ obj: 'box' }, { obj: 'ball', at: 'behind', ref: 'box' }]), front = LI([{ obj: 'box' }, { obj: 'ball', at: 'in front of', ref: 'box' }])
check('scene v2: layoutItems at/ref — on = 상자 윗면(y=상자 바닥−높이)·같은 x·상자 뒤에 그려지지 않음, ref가 뒤에 와도 해석(in), behind는 먼저 그림·작게, in front of는 나중에·아래',
  onBox[1].x === onBox[0].x && onBox[1].y === onBox[0].y - onBox[0].h && onBox[1].z > onBox[0].z && onBox[1].at === 'on' && onBox[1].ref === 'box'
  && inBox[0].x === inBox[1].x && inBox[0].y < inBox[1].y && inBox[0].z > inBox[1].z && behind[1].z < behind[0].z && behind[1].scale < 1 && front[1].y > front[0].y && front[1].z > front[0].z)
const three = LI([{ obj: 'box' }, { obj: 'ball', n: 3, at: 'on', ref: 'box' }]).filter((t) => t.obj === 'ball')
check('scene v2: layoutItems — 관계 물건 n개는 x로 퍼짐, action·labelKo 전달, 못 찾는 ref도 던지지 않음, enlarge는 ref를 최소 48로 키움',
  three.length === 3 && new Set(three.map((t) => t.x)).size === 3 && LI([{ obj: 'mia', action: 'read', labelKo: '미아' }])[0].action === 'read' && LI([{ obj: 'mia', labelKo: '미아' }])[0].labelKo === '미아'
  && LI([{ obj: 'ball', at: 'on', ref: 'box' }]).length === 1 && LI([{ obj: 'box' }], { enlarge: 'box' })[0].w >= 48 && LI([{ obj: 'box' }])[0].w === 30 && LI([{ obj: 'tree' }], { enlarge: 'tree' })[0].scale === 1)
check('scene v2: viewOf — view 명시 > panels(timeline) > lines(dialogue) > scene', viewOf({ layout: [] }) === 'scene' && viewOf({ panels: [] }) === 'timeline' && viewOf({ lines: [] }) === 'dialogue' && viewOf({ view: 'scene', panels: [] }) === 'scene')

// 장면 데이터 병합: scenes/<course>.js 지도와 grammarUnits 연결(내용은 아직 비어 있어도 됨)
const sceneMaps = { easy: easyScenes, int: intScenes, adv: advScenes, mid: midScenes, high: highScenes }
const GU = read('src/utils/grammar/grammarUnits.js')
check('scene v2: scenes/{easy,int,adv,mid,high}.js는 { 단원id: { scene, wordsAdd } } 지도(단원 id가 실제로 존재), grammarUnits가 다섯 개 모두 import해 export 시점에 합침',
  Object.values(sceneMaps).every((m) => m && typeof m === 'object' && Object.entries(m).every(([id, d]) => grammarUnitById(id) && d.scene && (d.wordsAdd === undefined || Array.isArray(d.wordsAdd))))
  && ["from './scenes/easy.js'", "from './scenes/int.js'", "from './scenes/adv.js'", "from './scenes/mid.js'", "from './scenes/high.js'"].every((t) => GU.includes(t)) && GU.includes('.map(withScene)'))
const filled = Object.keys({ ...easyScenes, ...intScenes, ...advScenes, ...midScenes, ...highScenes })
check('scene v2: 장면 지도가 비어 있는 동안(단원 없는 단원 기존 그대로) g-easy-01 덱 23장·시범 외 scene 없음 — 채워지면 이 핀은 "채운 단원만 scene"으로 바뀜',
  (filled.length === 0 && buildDeck(U1, UNITS).length === 23 && GRAMMAR_UNITS.filter((x) => x.scene).map((x) => x.id).join() === 'g-easy-05') || (filled.length > 0 && GRAMMAR_UNITS.filter((x) => x.scene && x.id !== 'g-easy-05').map((x) => x.id).sort().join() === filled.sort().join()))
check('scene v2: 모든 단원이 병합 뒤에도 validateGrammarUnit 통과, 채운 장면은 validateScene 0 오류(코스·어휘 규칙 포함)',
  GRAMMAR_UNITS.every((u) => validateGrammarUnit(u).length === 0) && GRAMMAR_UNITS.filter((u) => u.scene && u.id !== 'g-easy-05').every((u) => validateScene(u.scene, { course: u.courseId, unit: u }).length === 0),
  GRAMMAR_UNITS.filter((u) => u.scene && u.id !== 'g-easy-05').flatMap((u) => validateScene(u.scene, { course: u.courseId, unit: u }).map((e) => u.id + ' ' + e)).join('; '))

// Stage 소스: 배경 5종·시간/대화 보기·testid·TODO assets·저장 없음
const ST = read('src/components/grammar/Stage.jsx')
check('scene v2: Stage — 배경 5종(park·home·school·street·plain) 분기, data-bg·data-counts·data-action, timeline(scene-panel-<i>)·dialogue(scene-line-<i>·data-who), 기본 testid park-scene',
  ["case 'home'", "case 'school'", "case 'street'", "case 'plain'", 'default:'].every((t) => STG.includes(t)) && ['data-bg', 'data-counts', 'data-action', 'scene-panel-${i}', 'scene-line-${i}', 'data-who', "testId = 'park-scene'", 'data-view="timeline"', 'data-view="dialogue"'].every((t) => STG.includes(t)))
check('scene v2: Stage — TODO assets 목록이 임시 도형 물건 42개·캐릭터 9명·동물 2종을 모두 이름으로 적음', (() => { const todo = ST.slice(ST.indexOf('TODO assets'), ST.indexOf('export const BG_KO')); return Object.entries(PROPS).filter(([k, p]) => !p.asset && k !== 'paul').every(([k]) => new RegExp(`\\b${k}\\b`).test(todo)) })())
check('scene v2: Stage — 임시 도형이 없는 PROPS 키가 없음(스프라이트·paul 제외 전부 GLYPH 보유)', Object.entries(PROPS).filter(([k, p]) => !p.asset && k !== 'paul').every(([k]) => new RegExp(`(^|[\\s,{])${k}:\\s*(fig\\(|\\(|\\w+ =>)`, 'm').test(STG)), Object.entries(PROPS).filter(([k, p]) => !p.asset && k !== 'paul').filter(([k]) => !new RegExp(`(^|[\\s,{])${k}:\\s*(fig\\(|\\(|\\w+ =>)`, 'm').test(STG)).map(([k]) => k).join())
check('scene v2: Stage — 정답/문장이 그림에 새지 않음(영어 라벨은 시범 Cookie뿐), aria-label은 한국어 설명', !/aria-label=\{`[^`]*(frameEn|\.en\b)/.test(STG) && STG.includes('aria-label={`${BG_KO[bg]') && (STG.match(/>\s*Cookie\s*</g) || []).length === 1)
const SCS = strip(read('src/components/grammar/SceneCards.jsx'))
check('scene v2: SceneCards — 모든 카드 그림이 Stage(Pic)를 거치고 위치 놓기(relationSpots·positionFrame·correctFor)·scene-tray·scene-spot 키보드 경로 유지, 듣기 영어는 확인 뒤에만',
  SCS.includes('stageProps(o)') && SCS.includes('relationSpots(') && SCS.includes('positionFrame(step)') && SCS.includes('pf.correctFor(placed[0]?.relation)') && SCS.includes('scene-tray-${place.obj}') && SCS.includes('onTapSpot={onSpot}') && !/<ParkScene layout=/.test(SCS))
// ── Scene v2 데이터 핀: 장면이 있는 모든 단원(시범 포함) ──
const SU = GRAMMAR_UNITS.filter((u) => u.scene)
const AU = SU.filter((u) => u.scene.mode === 'add')
const picsOf = (s) => (s.kind === 'discover' ? [s] : s.kind === 'compare' ? [s.left, s.right] : s.kind === 'choose' ? s.items : s.kind === 'read' ? s.pairs : s.kind === 'listen' ? s.items.flatMap((i) => i.options) : s.kind === 'build' && s.layout ? [s] : [])
const layoutsOf = (p) => [...(p.layout || []), ...(p.panels || []).flatMap((x) => x.layout || [])]
const picKey = (p) => JSON.stringify({ layout: p.layout, panels: p.panels, lines: p.lines })
const fillOf = (frame, o) => frame.replace('___', o)
const nz = (s) => String(s || '').toLowerCase().replace(/[.,!?]+$/g, '').replace(/\s+/g, ' ').trim()
const sceneErr = (u) => (u.scene.mode === 'full' ? validateScene(u.scene) : validateScene(u.scene, { course: u.courseId, unit: u })).map((e) => u.id + ' ' + e)
const hasExplain = (u) => u.scene.steps.some((s) => ['discover', 'compare'].includes(s.kind))
const hasPractice = (u) => u.scene.steps.some((s) => ['choose', 'listen', 'read', 'build'].includes(s.kind))
check(`scene 데이터: 장면이 있는 ${SU.length}개 단원 전부 validateScene 0 오류(add는 코스 단어 수·어휘 규칙 포함)`, SU.every((u) => sceneErr(u).length === 0), SU.flatMap(sceneErr).join('; '))
check('scene 데이터: 모든 add 장면에 설명 종류(discover|compare) ≥1 과 연습 종류(choose|listen|read|build) ≥1', AU.every((u) => hasExplain(u) && hasPractice(u)), AU.filter((u) => !(hasExplain(u) && hasPractice(u))).map((u) => u.id).join())
check('scene 데이터: scene.id가 단원 사이에서 유일(+ 모든 scene에 id·mode)', new Set(SU.map((u) => u.scene.id)).size === SU.length && SU.every((u) => u.scene.id && ['add', 'full'].includes(u.scene.mode)), SU.map((u) => u.scene.id).join())
const chooseBad = SU.flatMap((u) => u.scene.steps.filter((s) => s.kind === 'choose').flatMap((s) => s.items.map((it, k) => {
  const opts = it.options, good = fillOf(it.frame, opts[it.correct])
  const bad = []
  if (!opts.every((o) => typeof o === 'string' && o.trim())) bad.push('보기가 문자열 아님')
  if (new Set(opts.map((o) => nz(o))).size !== opts.length) bad.push('보기 중복')
  if (opts.some((o, j) => j !== it.correct && nz(fillOf(it.frame, o)) === nz(good))) bad.push('채운 오답 문장이 정답 문장과 같음')
  return bad.length ? `${u.id} choose#${k}: ${bad.join(',')}` : null
}))).filter(Boolean)
check('scene 데이터: choose 보기는 서로 다른 문자열이고, 채운 정답 틀은 채운 오답 틀 어느 것과도 다름', chooseBad.length === 0 && SU.some((u) => u.scene.steps.some((s) => s.kind === 'choose')), chooseBad.join('; '))
const leakBad = SU.flatMap((u) => u.scene.steps.flatMap((s) => {
  const out = []
  const chk = (pics, secrets, w) => pics.forEach((p) => (p.lines || []).forEach((l) => { if (l.en !== undefined && secrets.map(nz).includes(nz(l.en))) out.push(`${u.id} ${w}: 대화 en '${l.en}'이 정답·보기·채운 틀·문장과 같음`) }))
  if (s.kind === 'discover') chk([s], [s.tap.en], 'discover')
  if (s.kind === 'compare') chk([s.left, s.right], [s.left.en, s.right.en], 'compare')
  if (s.kind === 'choose') s.items.forEach((it, k) => chk([it], [...it.options, ...it.options.map((o) => fillOf(it.frame, o))], `choose#${k}`))
  if (s.kind === 'listen') s.items.forEach((it, k) => chk(it.options, [it.en], `listen#${k}`))
  if (s.kind === 'read') chk(s.pairs, s.pairs.map((p) => p.en), 'read')
  if (s.kind === 'build' && s.layout && s.place.relations) chk([s], [...s.place.relations, ...s.place.relations.map((r) => fillOf(s.frameEn, r))], 'build')
  return out
}))
check('scene 데이터: 어떤 대화(lines) en도 같은 단계의 채운 틀·보기·정답 문장·듣기/읽기 문장과 같지 않음', leakBad.length === 0, leakBad.join('; '))
const distinctBad = SU.flatMap((u) => u.scene.steps.flatMap((s) => {
  const out = []
  if (s.kind === 'listen') s.items.forEach((it, k) => { if (new Set(it.options.map(picKey)).size !== it.options.length) out.push(`${u.id} listen#${k}: 보기 그림이 같음`) })
  if (s.kind === 'read' && new Set(s.pairs.map(picKey)).size !== s.pairs.length) out.push(`${u.id} read: 그림이 같음`)
  return out
}))
check('scene 데이터: listen 보기 그림끼리·read 짝 그림끼리 서로 다름', distinctBad.length === 0 && SU.some((u) => u.scene.steps.some((s) => s.kind === 'listen')) && SU.some((u) => u.scene.steps.some((s) => s.kind === 'read')), distinctBad.join('; '))
const propBad = SU.flatMap((u) => {
  const out = [], ok = (o, w) => { if (!PROPS[o]) out.push(`${u.id} ${w}: PROPS에 없는 ${o}`) }
  Object.keys(u.scene.objects).forEach((o) => ok(o, 'objects'))
  u.scene.steps.forEach((s) => {
    picsOf(s).forEach((p) => layoutsOf(p).forEach((x) => { ok(x.obj, s.kind); if (x.ref) ok(x.ref, s.kind); if (x.action && !ACTIONS[x.action]) out.push(`${u.id} ${s.kind}: ACTIONS에 없는 ${x.action}`) }))
    picsOf(s).forEach((p) => (p.lines || []).forEach((l) => { if (!(PROPS[l.who]?.kind === 'character' || (u.scene.characters || []).includes(l.who))) out.push(`${u.id} ${s.kind}: 화자 ${l.who}`) }))
    if (s.kind === 'discover') ok(s.tap.obj, 'tap')
    if (s.kind === 'build') { ok(s.place.obj, 'place'); if (s.place.ref) ok(s.place.ref, 'place.ref') }
  })
  return out
})
check('scene 데이터: 모든 layout/place/tap의 obj·ref가 sceneProps PROPS에 있고, action은 ACTIONS, 대화 화자는 캐릭터', propBad.length === 0, propBad.join('; '))
check('scene 데이터: 장면이 붙은 뒤에도 34개 단원 전부 validateGrammarUnit 0 오류', GRAMMAR_UNITS.length === 34 && GRAMMAR_UNITS.every((u) => validateGrammarUnit(u).length === 0), GRAMMAR_UNITS.flatMap((u) => validateGrammarUnit(u).map((e) => u.id + ' ' + e)).join('; '))
const needAll = process.env.SCENE_ALL === '1' || SU.length === GRAMMAR_UNITS.length
console.log(`scene units: ${SU.length}/${GRAMMAR_UNITS.length}`)
check(`scene 커버리지: scene units ${SU.length}/${GRAMMAR_UNITS.length}${needAll ? ' — 34개 전부 필요' : ' (진행 중: SCENE_ALL=1이면 34개 필요)'}`, needAll ? SU.length === GRAMMAR_UNITS.length : SU.length >= 1, GRAMMAR_UNITS.filter((u) => !u.scene).map((u) => u.id).join())

// Scene v2 보기 순서·범례
const seeds = Array.from({ length: 60 }, (_, i) => `g-x-${i}scene-choose-${i}`)
check('scene v2: displayOrder — 결정적 순열, n>=3은 항등 아님, n=2는 seed에 따라 두 순서가 모두 나옴', seeds.every((sd) => [2, 3, 4].every((n) => { const o = displayOrder(n, sd); return o.length === n && [...o].sort().join() === Array.from({ length: n }, (_, i) => i).join() && displayOrder(n, sd).join() === o.join() && (n < 3 || o.some((v, i) => v !== i)) })) && new Set(seeds.map((sd) => displayOrder(2, sd).join())).size === 2 && new Set(seeds.map((sd) => displayOrder(3, sd).join())).size >= 4)
const SCX = read('src/components/grammar/SceneCards.jsx'), STX = read('src/components/grammar/Stage.jsx')
check('scene v2: SceneCards — 보기 표시만 섞고(add 한정, 시범 full은 데이터 순서) testid·선택은 데이터 번호, 듣기 번호표는 표시 위치', SCX.includes("c.unitScene.mode === 'add' ? displayOrder(n, c.seed)") && (SCX.match(/ordFor\(c,/g) || []).length >= 3 && SCX.includes('data-testid={`scene-opt-${j}`}') && SCX.includes('data-testid={`scene-pic-${j}`}') && SCX.includes('ord.indexOf(it.correct)'))
check('scene v2: Stage 범례 — 작은 무대(패널·sm)에 scene-legend 칩(한국어 이름·action 이모지·ko), 작은 무대의 동작 배지는 크게', STX.includes('data-testid="scene-legend"') && (STX.match(/<Legend /g) || []).length >= 3 && STX.includes('mini ? 22 : 10') && STX.includes('mini ? 30 : 12') && STX.includes('ACTIONS[it.action].ko'))
// Scene v2 기하 보정 1~5 (순수 함수 핀)
const bb = (t) => ({ l: t.x - t.w / 2, r: t.x + t.w / 2, t: t.y - t.h, b: t.y })
const ovX = (a, c) => Math.max(0, Math.min(a.r, c.r) - Math.max(a.l, c.l)), ovY = (a, c) => Math.max(0, Math.min(a.b, c.b) - Math.max(a.t, c.t))
const PAIRS = [['box', 'cat'], ['house', 'ball'], ['tree', 'dog'], ['table', 'cat'], ['bench', 'ball'], ['box', 'ball']]
const rel1 = (ref, it, at, extra = {}) => { const o = LI([{ obj: ref }, { obj: it, at, ref, ...extra }]); return { r: o[0], t: o[1] } }
check('scene v2 기하1: behind = ref보다 먼저 그리고 ref에 가려짐(옆 이동 ≤25%, 위로 올림, 가로 겹침 ≥40%, 세로 겹침 있음) / in front of = 나중·아랫부분을 가림(중심 ±25%) / next to = 같은 바닥선·겹침 0·간격 ≥6 — 어떤 크기 조합에서도',
  PAIRS.every(([ref, it]) => {
    const b = rel1(ref, it, 'behind'), f = rel1(ref, it, 'in front of'), n = rel1(ref, it, 'next to')
    const mw = (a, c) => Math.min(a.w, c.w)
    const okB = b.t.z < b.r.z && ovX(bb(b.t), bb(b.r)) >= 0.4 * mw(b.t, b.r) - 1e-9 && ovY(bb(b.t), bb(b.r)) > 0 && b.t.x < b.r.x && b.r.x - b.t.x <= 0.25 * b.r.w + 1e-9 && b.t.y < b.r.y
    const okF = f.t.z > f.r.z && ovX(bb(f.t), bb(f.r)) >= 0.4 * mw(f.t, f.r) - 1e-9 && ovY(bb(f.t), bb(f.r)) > 0 && Math.abs(f.t.x - f.r.x) <= 0.25 * f.r.w + 1e-9 && f.t.y > f.r.y
    const gap = bb(n.t).l - bb(n.r).r
    const okN = ovX(bb(n.t), bb(n.r)) === 0 && gap >= 6 - 1e-9 && n.t.y === n.r.by
    return okB && okF && okN
  }))
check('scene v2 기하1: 세 관계의 자리가 서로 다름(behind·in front·next to 중심이 모두 다름)', PAIRS.every(([ref, it]) => new Set(['behind', 'in front of', 'next to'].map((a) => { const t = rel1(ref, it, a).t; return `${t.x},${t.y}` })).size === 3))
const catIn = rel1('box', 'cat', 'in'), ballInHouse = rel1('house', 'ball', 'in')
check('scene v2 기하2: in — 고양이(40×34)가 상자(30×24) 안: 상자가 물건 너비의 1.4배 이상으로 커지고 물건은 ref의 70% 이하, 큰 집 안 공도 70% 이하 / on = 윗면 / under = ref를 들어올리고 그 아래 바닥',
  catIn.r.w > 30 && catIn.r.w >= 1.4 * catIn.t.w - 1e-9 && catIn.t.w <= 0.7 * catIn.r.w + 1e-9 && catIn.t.h <= 0.7 * catIn.r.h + 1e-9 && catIn.t.y < catIn.r.y && catIn.t.y - catIn.t.h > catIn.r.y - catIn.r.h
  && ballInHouse.t.w <= 0.7 * ballInHouse.r.w + 1e-9 && ballInHouse.t.h <= 0.7 * ballInHouse.r.h + 1e-9 && rel1('box', 'cat', 'on').t.y === rel1('box', 'cat', 'on').r.y - rel1('box', 'cat', 'on').r.h
  && (() => { const u = rel1('table', 'cat', 'under'); return u.r.y < u.r.by && u.t.y === u.r.by && u.t.y - u.t.h >= u.r.y - 1e-9 && ovY(bb(u.t), bb(u.r)) === 0 })())
const hse = LI([{ obj: 'house' }, { obj: 'paul', at: 'in', ref: 'house' }, { obj: 'mia', at: 'in', ref: 'house' }])
check('scene v2 기하3: 같은 at+ref 물건은 옆으로 나란히(x가 다름, 모두 ref 안), 간격은 물건 폭 이상', new Set(hse.map((t) => t.x)).size === 3 && hse.slice(1).every((t) => bb(t).l >= bb(hse[0]).l - 1e-9 && bb(t).r <= bb(hse[0]).r + 1e-9) && ovX(bb(hse[1]), bb(hse[2])) < 1e-9 + 0.2 * Math.min(hse[1].w, hse[2].w)
  && (() => { const o = LI([{ obj: 'box' }, { obj: 'ball', n: 2, at: 'behind', ref: 'box' }]); return o[1].x !== o[2].x })())
const adv4 = LI([{ obj: 'house' }, { obj: 'umbrella' }, { obj: 'paul', at: 'next to', ref: 'house' }]), adv4b = LI([{ obj: 'umbrella' }, { obj: 'house' }, { obj: 'paul', at: 'next to', ref: 'house' }, { obj: 'tree' }])
check('scene v2 기하4: next to 물건은 한 줄의 다른 물건(우산·나무)과 겹치지 않음(ref 오른쪽 칸을 비워 둠) — 눌리는 대상은 맨 위(tapObj) 소스 핀',
  [adv4, adv4b].every((o) => { const pa = o.find((t) => t.obj === 'paul'); return o.filter((t) => t !== pa).every((t) => ovX(bb(pa), bb(t)) === 0 || t.obj === 'house' && ovX(bb(pa), bb(t)) === 0) })
  && STX.includes('tapObj') && STX.includes('it.z + 1000') && SCX.includes('tapObj={step.tap.obj}'))
const mix = LI([{ obj: 'ball', size: 'l' }, { obj: 'box', size: 's' }]), mix2 = LI([{ obj: 'mia', size: 'l' }, { obj: 'cat', size: 's' }]), mix3 = LI([{ obj: 'ball', size: 'm' }, { obj: 'ball', size: 's' }])
check('scene v2 기하5: size가 섞이면 큰 쪽이 작은 쪽의 1.5배 이상(가로·세로) — 공 l vs 상자 s, 사람 l vs 고양이 s, 같은 공 m vs s',
  [[mix[0], mix[1]], [mix2[0], mix2[1]], [mix3[0], mix3[1]]].every(([a, c]) => a.w >= 1.5 * c.w - 1e-9 && a.h >= 1.5 * c.h - 1e-9))
const ppl = LI([{ obj: 'paul' }, { obj: 'mia' }, { obj: 'tom' }, { obj: 'teacher' }]), kid = LI([{ obj: 'kid' }, { obj: 'mom' }])
check('scene v2 기하5: 같은 size의 사람은 키가 같음(paul·mia·tom·teacher), 아이는 더 작음, 크기가 같은 물건 그림(나무)은 기존 그대로', ppl.every((t) => Math.abs(t.h - ppl[0].h) < 1e-9) && kid[0].h < kid[1].h && hse.length === 3 && LI([{ obj: 'tree', n: 2 }])[0].scale === 1
  && LI([{ obj: 'paul', size: 'l' }, { obj: 'mia', size: 'l' }]).every((t, _, a) => Math.abs(t.h - a[0].h) < 1e-9))
const spb = relationSpots({ x: 100, y: 188, w: 60, h: 48 }, PROPS.cat)
check('scene v2 기하: relationSpots — 놓인 물건의 실제 자리(px·py·scale·z): behind는 ref보다 먼저(z<0)·위·왼쪽, in front는 나중·아래, in은 70% 이하, 표시 자리(x·y)는 서로 떨어져 있음',
  spb.length === 6 && spb.find((x) => x.relation === 'behind').z < 0 && spb.find((x) => x.relation === 'behind').px < 100 && spb.find((x) => x.relation === 'behind').py < 188 && spb.find((x) => x.relation === 'in front of').py > 188 && spb.find((x) => x.relation === 'in front of').z > 0
  && spb.find((x) => x.relation === 'in').scale * 40 <= 0.7 * 60 + 1e-9 && spb.every((a, i) => spb.every((c, j) => i === j || Math.hypot(a.x - c.x, a.y - c.y) >= 14)))
// Scene v2 A~D: neg 표시 · 통 안(in) · 작은 무대 최소 크기
const lyN = (extra) => mapKind('discover', (x) => ({ ...x, layout: [{ obj: 'box' }, { obj: 'ball', ...extra }] }))
check('scene v2 A: neg — action과 함께 쓰는 boolean만 허용(action 없이·boolean 아님은 거부), layoutItems가 neg·action을 전달, Stage는 data-neg와 빨간 ✕ 선, 범례 칩은 "✕"로 끝남',
  errs(lyN({ action: 'like', neg: true })).length === 0 && has(errs(lyN({ neg: true })), 'neg는 action과 함께') && has(errs(lyN({ action: 'like', neg: 'yes' })), 'neg는 action과 함께')
  && LI([{ obj: 'paul', action: 'like', neg: true }])[0].neg === true && LI([{ obj: 'paul', action: 'like' }])[0].neg === undefined
  && STX.includes("'data-neg': 'true'") && STX.includes('data-testid="scene-neg"') && STX.includes('#dc2626') && STX.includes("${it.neg ? ' ✕' : ''}") && !/paulSad|paul_sad|neg \? paul/.test(STX))
const inBox2 = LI([{ obj: 'box' }, { obj: 'ball', at: 'in', ref: 'box' }]), onBox2 = LI([{ obj: 'box' }, { obj: 'ball', at: 'on', ref: 'box' }]), inHouse2 = LI([{ obj: 'house' }, { obj: 'ball', at: 'in', ref: 'house' }])
check('scene v2 C: 통(box·bag·cup) 안(in) — 물건이 안쪽 표시(inside)·통에 frontClip(앞벽 시작선)이 물건 윗면과 바닥 사이(아래 40%를 덮음), on·under·집 안은 앞벽 없음, Stage는 앞벽을 다시 그림(data-front-of)',
  ['box', 'bag', 'cup'].every((c) => { const o = LI([{ obj: c }, { obj: 'ball', at: 'in', ref: c }]); const [r, t] = o; return t.inside === true && r.frontClip != null && Math.abs(r.frontClip - (t.y - 0.4 * t.h)) < 1e-9 && r.frontClip > t.y - t.h && r.frontClip < t.y && t.z > r.z })
  && onBox2[0].frontClip === undefined && inHouse2[0].frontClip === undefined && LI([{ obj: 'table' }, { obj: 'cat', at: 'under', ref: 'table' }])[0].frontClip === undefined
  && STX.includes('data-front-of') && STX.includes('clipPath') && STX.includes('rb.frontClip') && SCX.includes('ref: place.ref'))
const miniBall = LI([{ obj: 'ball' }], { mini: true })[0], miniFar = LI([{ obj: 'ball', dist: 'far' }], { mini: true })[0], miniPen = LI([{ obj: 'pencil' }], { mini: true })[0], nearBall = LI([{ obj: 'ball' }])[0]
check('scene v2 D: 작은 무대(mini) — 가장 긴 변 ≥22(공 16→22), far는 0.6배지만 16 아래로 내려가지 않고 near보다 작음, 연필 같은 얇은 물건도 ≥22, 큰 무대는 그대로, Stage sm이 mini를 켬',
  Math.max(miniBall.w, miniBall.h) >= 22 - 1e-9 && Math.max(miniFar.w, miniFar.h) >= 16 - 1e-9 && miniFar.w < miniBall.w && Math.max(miniPen.w, miniPen.h) >= 22 && nearBall.w === 16 && LI([{ obj: 'ball', dist: 'far' }])[0].w === 9.6 && STX.includes("mini: size === 'sm'")
  && ['pencil', 'key', 'ball', 'egg', 'phone', 'medal', 'money'].every((k) => { const t = LI([{ obj: k }], { mini: true })[0]; return Math.max(t.w, t.h) >= 22 - 1e-9 }))
// 2026-10-10 그림 담당(공원 실제 이미지 + 이모지 줄이기)
check('scene v2 park: 공원 배경은 기존 backgrounds 실파일(하늘·산울타리)만 import, env/ 폴더는 import 안 함, 작은 무대(mini)에선 산울타리 생략, 파일은 실제로 존재',
  /import skyBackdrop from '\.\.\/\.\.\/assets\/town\/backgrounds\/village-sky-backdrop\.webp'/.test(STG) && /import hedgeBorder from '\.\.\/\.\.\/assets\/town\/backgrounds\/village-hedge-border\.webp'/.test(STG)
  && !/assets\/town\/env/.test(STG) && STG.includes('{!mini && <>') && fs.existsSync(new URL('../src/assets/town/backgrounds/village-sky-backdrop.webp', import.meta.url)) && fs.existsSync(new URL('../src/assets/town/backgrounds/village-hedge-border.webp', import.meta.url)))
check('scene v2 park: 손으로 그린 해·구름 도형 없음(default 배경에 노란 원·흰 타원 없음)', (() => { const d = STG.slice(STG.indexOf('default: return'), STG.indexOf('const fig =')); return !/#fde047|ellipse cx="80"|ellipse cx="108"/.test(d) })())
check('scene v2 이모지: SceneCards에 🔊·✅ 글자 없음, 듣기 버튼은 인라인 SVG 스피커 + aria-label "듣기" 유지(testid 그대로), 동작 배지(ACTIONS)는 그대로',
  !/🔊|✅/.test(SC) && SC.includes('const Speaker = () => <svg aria-hidden="true"') && SC.includes('aria-label="듣기"') && SC.includes('<Speaker />') && /ACTIONS\.run|emoji: '🏃'/.test(read('src/utils/grammar/sceneProps.js')))
if (fail) { console.log(`\nFAILED ${fail}`); process.exit(1) }
console.log('\nALL PASS')
