// 2026-10-08(224차) 통합 과정 공통 구조 + 시범 Unit(교실에서 물건 빌리기) — 순수 모듈·데이터 계약·기록 저장·화면 소스 핀
import fs from 'node:fs'
import { COURSES, CONVERSATION_BLOCKS, SUPPORT_STAGES, SUPPORT_AREAS, RECORD_FLAGS, APP_SETTABLE_FLAGS, ACTIVITY_KINDS, validateUnit, PERFORMANCE_LEVELS, UNIT_PROFILE_KEYS, blocksForCourse, blockLabelKo, isBlockProposed } from '../src/utils/curriculum/courseModel.js'
import { EPISODE_PLACEMENT, placementErrors, listCatalog, courseCount, findEntry, grammarForUnit, grammarSetForBlock } from '../src/utils/curriculum/catalog.js'
import { writingItemsForEpisode } from '../src/utils/writing/writingItems.js'
import { recordsKey, loadUnitRecords, markActivity, setSupportStage, activityState, nextActivityId } from '../src/utils/curriculum/unitRecords.js'
import { COMM_GOALS } from '../src/utils/curriculum/commGoals.js'
import { UNIT_BORROW } from '../src/utils/curriculum/unitBorrow.js'
import { UNIT_LOST_BAG } from '../src/utils/curriculum/unitLostBag.js'
import { UNIT_FIND_AGAIN } from '../src/utils/curriculum/unitFindAgain.js'
import { UNITS } from '../src/utils/curriculum/units.js'
import { STORY_ITEMS } from '../src/utils/situation/storyEpisodes.js'
import { WRITING_ITEMS } from '../src/utils/writing/writingItems.js'

let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? '  ' + detail : ''}`); if (!ok) fail++ }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')

// ── 공통 구조 ──
check('과정 6개·블록 id 유일, 회화 블록 6개가 과정 블록과 일치하고 목표 id 실재', COURSES.length === 6 && new Set(COURSES.flatMap((c) => c.blocks)).size === COURSES.flatMap((c) => c.blocks).length && CONVERSATION_BLOCKS.map((b) => b.id).join() === COURSES.find((c) => c.id === 'conversation').blocks.slice(0, 6).join() && CONVERSATION_BLOCKS.every((b) => b.goalIds.every((g) => COMM_GOALS.some((x) => x.id === g))))
check('기간은 "가안" 표기, 영국 학년·CEFR·교재 권수 필드 없음', COURSES.every((c) => /가안|맞춤/.test(c.monthsKo)) && !/cefr|year ?\d|band|권/i.test(JSON.stringify(COURSES) + JSON.stringify(CONVERSATION_BLOCKS)))
check('228차: 과정 6개 순서(phonics,conversation,presentation,reading,middle,news)·영문명·news 병행·단계 라벨·제안', COURSES.map((c) => c.id).join() === 'phonics,conversation,presentation,reading,middle,news' && COURSES.every((c) => c.titleEn) && COURSES.find((c) => c.id === 'news').parallel === true && blockLabelKo('PM') === '중등 준비' && blockLabelKo('N1') === '뉴스 1' && isBlockProposed('conversation', 'C1') === true)
check('지원 단계 4개(모범과 함께/단서로/혼자/새 상황에서), 영역 2개(말하기/읽기·쓰기)', SUPPORT_STAGES.map((s) => s.titleKo).join() === '모범과 함께,단서로,혼자,새 상황에서' && SUPPORT_AREAS.join() === 'speaking,literacy')
check('기록 플래그 5개 중 앱이 켤 수 있는 것은 completed·selfChecked뿐', RECORD_FLAGS.length === 5 && APP_SETTABLE_FLAGS.join() === 'completed,selfChecked' && RECORD_FLAGS.includes('teacherObserved') && RECORD_FLAGS.includes('demonstratedIndependent'))

// ── 시범 Unit 데이터 계약 ──
const errs = validateUnit(UNIT_BORROW)
check('시범 Unit이 데이터 계약을 통과(validateUnit)', errs.length === 0, errs.join(','))
check('활동 7종이 설계 순서(어휘→듣기→읽기→말하기→문형→쓰기→복습), id 유일', UNIT_BORROW.activities.map((a) => a.kind).join() === ACTIVITY_KINDS.join() && new Set(UNIT_BORROW.activities.map((a) => a.id)).size === UNIT_BORROW.activities.length)
check('말하기 활동은 기존 흐름(ep02 한 문장)·연습으로, 쓰기는 기존 w-s02-03으로 연결(중복 구현 없음)', UNIT_BORROW.activities.find((a) => a.kind === 'speaking').setId === 'ep02' && ['key', 'practice'].includes(UNIT_BORROW.activities.find((a) => a.kind === 'speaking').flow) && WRITING_ITEMS.some((w) => w.id === UNIT_BORROW.activities.find((a) => a.kind === 'writing').writingItemId))
check('핵심 표현 = 기존 s02-03 "Can I borrow a pencil?", 목표 requesting', STORY_ITEMS.find((i) => i.id === UNIT_BORROW.keyItemId)?.en === 'Can I borrow a pencil?' && UNIT_BORROW.goalId === 'requesting')
const allEn = [...UNIT_BORROW.listening.turns.map((t) => t.en), UNIT_BORROW.reading.text, ...UNIT_BORROW.review.map((r) => r.model)].join(' ').toLowerCase()
check('어휘는 Unit 텍스트(듣기·읽기·복습)에 실제로 나오는 말만', UNIT_BORROW.vocab.every((v) => allEn.includes(v.en.toLowerCase())), UNIT_BORROW.vocab.filter((v) => !allEn.includes(v.en.toLowerCase())).map((v) => v.en).join(','))
check('듣기 대화 ≤45단어·화자 Paul/Mia만, 읽기 ≤70단어·문장 ≤9단어', UNIT_BORROW.listening.turns.reduce((n, t) => n + t.en.split(/\s+/).length, 0) <= 45 && UNIT_BORROW.reading.text.split(/\s+/).length <= 70 && UNIT_BORROW.reading.text.split(/[.!?]["']?\s+/).every((s) => s.trim().split(/\s+/).length <= 9))
check('복습 상황에 영어·"빌려/빌리" 없음(회상 과제: 공개 전 답 미노출)', UNIT_BORROW.review.every((r) => !/[A-Za-z]|빌려|빌리/.test(r.situationKo)))
check('문형 문항: 정답 보기 외에 자연스러운 대체(Could I…)를 오답으로 두지 않음', UNIT_BORROW.grammar.items.every((q) => q.options.every((o, i) => (Array.isArray(q.correct) ? q.correct.includes(i) : i === q.correct) || !/^could i borrow/i.test(o))))
check('출처 기록: 공식 목표·연구 근거·자체 결정 구분 표기', UNIT_BORROW.sources.length >= 3 && UNIT_BORROW.sources.every((s) => ['official', 'research', 'own'].includes(s.kind) && s.what && s.basis))
check('Unit 텍스트에 특정 교재 브랜드·단원 번호 없음', !/let'?s ?smile|\bunit ?\d|lesson ?\d|\d\s*권/i.test(JSON.stringify(UNIT_BORROW)))

// ── 225차: 두 번째 Unit(잃어버린 물건 위치 묻기) — 공통 템플릿 재사용 검증 ──
const U2 = UNIT_LOST_BAG
const errs2 = validateUnit(U2)
check('Unit 2가 같은 데이터 계약을 통과(validateUnit), UNITS 목록 2개·id 유일', errs2.length === 0 && UNITS.length === 3 && new Set(UNITS.map((u) => u.id)).size === 3 && UNITS[1] === U2, errs2.join(','))
check('Unit 2: 목표 asking-info(실재), 활동 7종 같은 순서, 말하기는 Unit 안 3단계(따라 하기→물건 바꾸기→모범 없이)', U2.goalId === 'asking-info' && COMM_GOALS.some((g) => g.id === 'asking-info') && U2.activities.map((a) => a.kind).join() === ACTIVITY_KINDS.join() && U2.activities.find((a) => a.kind === 'speaking').steps.map((s) => s.kind).join() === 'repeat,swap,recall')
check('Unit 2 말하기: 물건 바꾸기 틀에 ___ 1개·칩 ≥2, 모범 없이 단계는 한국어 상황만(영어 없음)·모범·대답·대체 있음', (() => { const [, sw, rc] = U2.speaking.steps; return sw.frameEn.split('___').length === 2 && sw.slots.length >= 2 && sw.replyFrame.split('___').length === 2 && !/[A-Za-z]/.test(rc.situationKo + rc.roleKo) && rc.model && rc.reply?.en && rc.alternatives.length >= 1 })())
check('Unit 2 쓰기는 inline 문항 w-u2-under(이야기 회차 없음)로 연결, 주제 finding', (() => { const w = WRITING_ITEMS.find((x) => x.id === U2.activities.find((a) => a.kind === 'writing').writingItemId); return !!w?.inline && w.topic === 'finding' && !w.itemId })())
const allEn2 = [...U2.listening.turns.map((t) => t.en), U2.reading.text, ...U2.review.map((r) => r.model), ...U2.speaking.steps.flatMap((s) => [...(s.lines || []).map((l) => l.en), ...(s.slots || []).map((x) => x.en), ...(s.replySlots || []).map((x) => x.en)])].join(' ').toLowerCase()
check('Unit 2 어휘는 Unit 텍스트에 실제로 나오는 말만, 위치 말은 under·in·on 3개 이하', U2.vocab.every((v) => allEn2.includes(v.en.toLowerCase())) && U2.vocab.filter((v) => /^(under|in|on)$/.test(v.en)).length <= 3, U2.vocab.filter((v) => !allEn2.includes(v.en.toLowerCase())).map((v) => v.en).join(','))
check('Unit 2 듣기 ≤45단어·Paul/Mia만, 읽기 ≤70단어·문장 ≤9단어', U2.listening.turns.reduce((n, t) => n + t.en.split(/\s+/).length, 0) <= 45 && U2.listening.turns.every((t) => ['Paul', 'Mia'].includes(t.speaker)) && U2.reading.text.split(/\s+/).length <= 70 && U2.reading.text.split(/[.!?]["']?\s+/).every((s) => s.trim().split(/\s+/).length <= 9))
check('Unit 2 복습·회상 상황에 영어 없음, 읽기 근거는 본문에 그대로', U2.review.every((r) => !/[A-Za-z]/.test(r.situationKo)) && U2.reading.items.every((q) => U2.reading.text.includes(q.evidence)))
check('Unit 2 문형: Where is…(대체)를 오답으로 두지 않음, 출처 official/research/own 구분, 교재 브랜드·단원 번호 없음', U2.grammar.items.every((q) => /틀린/.test(q.promptKo) || q.options.every((o, i) => (Array.isArray(q.correct) ? q.correct.includes(i) : i === q.correct) || !/^where is my/i.test(o))) && U2.sources.every((s) => ['official', 'research', 'own'].includes(s.kind) && s.what && s.basis) && !/let'?s ?smile|\bunit ?\d|lesson ?\d|\d\s*권/i.test(JSON.stringify(U2)))
check('두 Unit의 문장·문항이 서로 섞이지 않음(핵심 문장이 다른 Unit 텍스트에 없음)', !JSON.stringify(U2).includes('Can I borrow') && !JSON.stringify(UNIT_BORROW).includes("Where's my"))
const uSrc = strip(read('src/components/UnitScreen.jsx'))
check('화면: Unit 목록(unit-list/unit-pick)·Unit 안 말하기 3단계(repeat/swap/recall)·답 확인 전 모범 미마운트·녹음기 재사용', ['data-testid="unit-list"', 'unit-pick-${e.id}', "st.kind === 'repeat'", "st.kind === 'swap'", "st.kind === 'recall'", 'RecorderControls rec={rec}', 'useLocalRecorder()'].every((t) => uSrc.includes(t)) && /revealed \? \(\s*<div data-testid="unit-speaking-answer"/.test(uSrc) && /a\.kind === 'speaking' && !a\.steps\) onSpeaking/.test(uSrc))

// ── 기록 저장 ──
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }
const UID = 'e2e00000-0000-4000-8000-00000000a001'
const st = mem()
check('키는 UUID만(이름 → null·저장 거부)', recordsKey('Paul') === null && !markActivity(st, 'Paul', 'u', 'a', { completed: true }) && recordsKey(UID).endsWith(UID))
check('앱은 completed·selfChecked만 켤 수 있고 teacherObserved·demonstratedIndependent는 무시됨', markActivity(st, UID, 'u1', 'vocab', { completed: true, teacherObserved: true, demonstratedIndependent: true, score: 100 }) && (() => { const a = activityState(loadUnitRecords(st, UID), 'u1', 'vocab'); return a.completed === true && a.teacherObserved === false && a.demonstratedIndependent === false && a.score === undefined })())
check('플래그 아닌 값만 주면 저장 거부', !markActivity(st, UID, 'u1', 'vocab', { score: 1 }) && !markActivity(st, UID, 'u1', 'vocab', { completed: 'yes' }))
check('다음 활동 = 아직 안 끝낸 첫 활동, 전부 끝나면 null', nextActivityId(loadUnitRecords(st, UID), 'u1', ['vocab', 'listening']) === 'listening' && (markActivity(st, UID, 'u1', 'listening', { completed: true }), nextActivityId(loadUnitRecords(st, UID), 'u1', ['vocab', 'listening']) === null))
check('지원 단계는 영역별·유효 단계만, 수준 필드와 별개', setSupportStage(st, UID, 'u1', 'speaking', 'with-cues') && setSupportStage(st, UID, 'u1', 'literacy', 'alone') && !setSupportStage(st, UID, 'u1', 'grammar', 'alone') && !setSupportStage(st, UID, 'u1', 'speaking', 'expert') && (() => { const u = loadUnitRecords(st, UID).u1; return u.support.speaking === 'with-cues' && u.support.literacy === 'alone' && !('level' in u.support) })())
st.setItem(recordsKey(UID), '{{bad')
check('깨진 JSON → {}', JSON.stringify(loadUnitRecords(st, UID)) === '{}')
check('저장 레코드에 점수·숙달·진급 값 없음', (() => { const m2 = mem(); markActivity(m2, UID, 'u', 'a', { completed: true, selfChecked: true }); return !/score|master|promot|grade|level/i.test(m2.getItem(recordsKey(UID))) })())

// ── 화면 소스 핀 ──
const u = strip(read('src/components/UnitScreen.jsx'))
const app = strip(read('src/App.jsx'))
const home = strip(read('src/components/StudentHome.jsx'))
check('화면: 다음 활동 강조(unit-next)·활동 순서 목록·도움 정도(영역별)·임시 저장 안내', ['data-testid="unit-next"', 'unit-act-', 'unit-support-', 'unit-storage-note', '점수나 진급은 아니에요'].every((t) => u.includes(t)))
check('화면: 복습은 공개 전 영어·음성 미마운트(revealed 조건), 듣기 대화는 버튼으로만 재생(자동 재생 없음)', /\{revealed\[i\] \? \(/.test(u) && !/useEffect\([^)]*speak\(/.test(u) && /onClick=\{playAll\}/.test(u))
check('화면: 말하기·쓰기는 기존 화면으로(onSpeaking/onWriting), 채점·숙달·진급 문구 없음', /a\.kind === 'speaking' && !a\.steps\) onSpeaking\(a\)/.test(u) && /a\.kind === 'writing'\) onWriting\(a\)/.test(u) && !/점수를|숙달|진급했|합격|정답률/.test(u))
check('App: unit 화면은 QA 계정만(QA_ONLY_SCREENS 포함), 홈 [오늘의 학습] 진입, Speaking/Writing은 unitLink로 복귀', /QA_ONLY_SCREENS = \[[^\]]*'unit'/.test(app) && /\{qaTestStudent && screen === 'unit' && pilotUnits && \(/.test(app) && /menuExits=\{!!unitLink\}/.test(app) && /if \(unitLink\) setScreen\('unit'\)/.test(app) && home.includes('student-home-unit'))
// 225차 독립 QA 결함 수정 핀: 첫 응답만 완료 카운트, 재생 체인은 언마운트 시 중단, 말하기/쓰기 복귀 시 completed만, 자기 확인 미응답 상태
check('225차 QA 수정: 첫 응답만 카운트·재생 alive 가드·returnedFrom 복귀 기록·자기 확인 미응답 구분·"해 봤어요" 표기', (u.match(/if \(picked === null\) onAnswered\?\.\(\)/g) || []).length === 2 && /alive\.current && i < L\.turns\.length/.test(u) && /returnedFrom && unit\.activities\.find/.test(u) && /aria-pressed=\{selfPicked\[active\.id\] === false\}/.test(u) && !/끝냈어요/.test(u) && /returnedFrom=\{unitLink \? \(unitLink\.writingItemId \? 'writing' : 'speaking'\) : null\}/.test(app))
check('225차 QA 콘텐츠: 듣기 1번은 상황문으로 풀리지 않음(미아의 연필 수), 복습 단어 ruler·ball이 어휘에 있음, 방어 가능한 오답 없음', /얼마나/.test(UNIT_BORROW.listening.questions[0].promptKo) && ['ruler', 'ball'].every((w) => UNIT_BORROW.vocab.some((v) => v.en === w)) && !JSON.stringify(UNIT_BORROW.grammar.items).includes('I can borrow a pencil?'))
check('225차 e2e 발견 수정: 복귀 기록(returnedFrom)은 돌아온 Unit(initialUnitId)에만 1회 적용, 목록에서 다른 Unit을 열면 비움', /returnedFrom=\{unit\.id === initial\?\.id \? pendingReturn : null\}/.test(uSrc) && /const pick = \(id\) => \{ setPendingReturn\(null\); if \(!id\) setOpenKind\(null\); setUnitId\(id\) \}/.test(uSrc) && /onClick=\{\(\) => pick\(e\.id\)\}/.test(uSrc))
check('226차: Unit 청크 로드 실패 → 안내(unit-load-failed) + 홈 버튼, 로딩 중도 홈 가능; 쓰기 Unit 링크는 "← 이 단원으로"(독립 Writing은 nextLabel 없음)', /\.catch\(\(\) => setPilotUnitsFailed\(true\)\)/.test(app) && /pilotUnitsFailed \? 'unit-load-failed' : 'unit-loading'/.test(app) && app.includes('data-testid="unit-load-home"') && app.includes('data-testid="unit-load-reload"') && app.includes('새로고침해 주세요') && /linkLabel=\{unitLink \? \(unitLink\.storyId \? '← 단원 목록으로' : '← 이 단원으로'\) : null\}/.test(app) && (() => { const w = strip(read('src/components/WritingPractice.jsx')); return /onNext=\{linked && linkLabel \? onBack : next\}/.test(w) && /nextLabel \|\| \(index \+ 1 < total \? '다음 문장 →' : '목록으로'\)/.test(w) })())
// ── 227차: 인접 단계(C2 발전) Unit — 같은 목표·상황 가족에서 수행이 실제로 다른가 ──
const U3 = UNIT_FIND_AGAIN
check('Unit 3(C2 발전): 계약 통과, 같은 목표 asking-info·C2, performance developing/developing(Unit 2는 basic/basic)', validateUnit(U3).length === 0 && U3.block === 'C2' && U3.goalId === U2.goalId && U3.performance.speaking === 'developing' && U3.performance.writing === 'developing' && U2.performance.speaking === 'basic', validateUnit(U3).join(','))
check('Unit 3 말하기: 따라 하기 3턴(질문→짧은 답→되묻기), 바꾸기 틀은 Is it ___?, 회상에 followUp(되묻기에 다시 답) — Unit 2엔 없음', (() => { const [rp, sw, rc] = U3.speaking.steps; return rp.lines.length === 3 && /^Is it /.test(sw.frameEn) && /What about/.test(sw.replyFrame) && /^Is it /.test(rc.model) && rc.followUp && rc.followUp.model && rc.followUp.alternatives.length >= 1 && !/[A-Za-z]/.test(rc.followUp.promptKo) && !U2.speaking.steps[2].followUp })())
check('Unit 3 쓰기 inline 문항은 2~3문장(Unit 2는 1문장) — 복사·개명 아님', (() => { const w3 = WRITING_ITEMS.find((x) => x.id === 'w-c2-find'); const w2 = WRITING_ITEMS.find((x) => x.id === 'w-u2-under'); const n = (t) => t.split(/[.!?]\s+|[.!?]$/).filter(Boolean).length; return w3?.inline && n(w3.inline.en) >= 2 && n(w3.inline.en) <= 3 && n(w2.inline.en) === 1 && w3.inline.en !== w2.inline.en && !w3.inline.en.includes(w2.inline.en) })())
check('Unit 3 문장이 Unit 2 문장의 라벨 교체가 아님: 듣기 대화·읽기 지문·복습 모범이 전부 다르고, C1 핵심 Where\'s my bag?은 Unit 3 핵심 아님', U3.listening.turns.map((t) => t.en).join() !== U2.listening.turns.map((t) => t.en).join() && U3.reading.text !== U2.reading.text && U3.review.every((r) => !U2.review.some((q) => q.model === r.model)) && !U3.speaking.steps.some((s) => s.model === "Where's my bag?") && U3.profile.recycleKo.some((s) => s.includes('1단계')))
const allEn3 = [...U3.listening.turns.map((t) => t.en), U3.reading.text, ...U3.review.map((r) => r.model), ...U3.speaking.steps.flatMap((s) => [...(s.lines || []).map((l) => l.en), ...(s.slots || []).map((x) => x.en), ...(s.replySlots || []).map((x) => x.en), s.model || '', s.reply?.en || ''])].join(' ').toLowerCase()
check('Unit 3 어휘는 Unit 텍스트에 실제로 나오는 말만, 듣기 ≤45단어·읽기 ≤70단어·문장 ≤9단어, 복습 상황 영어 없음', U3.vocab.every((v) => allEn3.includes(v.en.toLowerCase())) && U3.listening.turns.reduce((n, t) => n + t.en.split(/\s+/).length, 0) <= 45 && U3.reading.text.split(/\s+/).length <= 70 && U3.reading.text.split(/[.!?]["']?\s+/).every((s) => s.trim().split(/\s+/).length <= 9) && U3.review.every((r) => !/[A-Za-z]/.test(r.situationKo)), U3.vocab.filter((v) => !allEn3.includes(v.en.toLowerCase())).map((v) => v.en).join(','))
check('화면: 회상 followUp은 2차 답 확인 전 영어 미마운트(unit-speaking-followup-reveal → -en)', /followRevealed \? \(/.test(uSrc) && uSrc.includes('data-testid="unit-speaking-followup-reveal"') && uSrc.includes('data-testid="unit-speaking-followup-en"') && /setFollowRevealed\(false\); setStep\(i\)/.test(uSrc))

// ── 227차: 수행 수준 사다리·교육 프로필·과정→단계→Unit 선택 ──
check('수행 수준 5단계(입문·기초·발전·확장·발표), 말하기·쓰기 설명 따로, blocksForCourse/blockLabelKo', PERFORMANCE_LEVELS.map((p) => p.titleKo).join() === '입문,기초,발전,확장,발표' && PERFORMANCE_LEVELS.every((p) => p.speakingKo && p.writingKo && p.speakingKo !== p.writingKo) && blocksForCourse('conversation').length === 6 && blocksForCourse('nope').length === 0 && blockLabelKo('C2') === '2단계' && blockLabelKo('PR1') === '1단계')
check('두 Unit에 performance(말하기·쓰기 따로)와 profile 8항목(선수·행동·언어·활동·교사 확인·도움·확장·복습) 있음, validateUnit 통과', UNITS.every((u) => u.performance && u.profile && UNIT_PROFILE_KEYS.every((k) => u.profile[k].length > 0) && validateUnit(u).length === 0))
check('validateUnit: 잘못된 performance·profile은 거부, 없으면 허용(기존 데이터 호환)', validateUnit({ ...UNIT_BORROW, performance: { speaking: 'pro', writing: 'basic' } }).includes('performance') && validateUnit({ ...UNIT_BORROW, profile: { canDoKo: [] } }).includes('profile') && (() => { const { performance, profile, ...rest } = UNIT_BORROW; return validateUnit(rest).length === 0 })())
check('화면: 과정 → 단계 → 항목 3단 선택(unit-course/unit-block/unit-pick, data-level), 없는 과정·단계는 EMPTY_LABEL_KO(콘텐츠 준비 중) 비활성(미제작 아님), 영문 과정명·intent·선택 콜백·이야기 카드 버튼, 선택 저장 없음, 말하기 → 쓰기 연결 버튼', ['unit-course-${c.id}', 'unit-block-${b}', 'unit-pick-', 'data-level={level}', 'EMPTY_LABEL_KO', 'aria-disabled={n === 0}', 'data-testid="unit-speaking-to-writing"', '운영 계획', 'story-practice-', 'story-write-', 'titleEn', 'intent', 'onSelectionChange'].every((t) => uSrc.includes(t)) && !uSrc.includes('미제작') && read('src/utils/curriculum/catalog.js').includes("'콘텐츠 준비 중'") && !/localStorage|sessionStorage/.test(uSrc.slice(uSrc.indexOf('export default function UnitScreen'))))
check('Speaking 루트: initialMode key/practice + menuExits', /initialMode === 'key' && initialSetId \? 'key'/.test(strip(read('src/components/SpeakingPractice.jsx'))) && /if \(menuExits\) \{ onBack\(\); return \}/.test(strip(read('src/components/SpeakingPractice.jsx'))))

// ── 228차: 통합 진입 카탈로그 ──
const catSrc = strip(read('src/utils/curriculum/catalog.js'))
const ids = (l) => l.map((e) => e.id).join()
check('228차: 배치 불변식 통과(회차 중복·미배치·미지의 과정/단계/수행 없음), 회차 10개 각각 한 번씩', placementErrors().length === 0 && Object.keys(EPISODE_PLACEMENT).length === 10 && (() => { const seen = COURSES.flatMap((c) => c.blocks.flatMap((b) => listCatalog(UNITS, c.id, b).filter((e) => e.kind === 'story').map((e) => e.id))); return seen.length === 10 && new Set(seen).size === 10 })(), placementErrors().join(','))
check('228차: 회화 C1 = Unit 2개 먼저 + ep01·ep02, C2 = c2 Unit + ep03', ids(listCatalog(UNITS, 'conversation', 'C1')) === 'c1-borrow-classroom,c1-lost-bag-classroom,ep01,ep02' && ids(listCatalog(UNITS, 'conversation', 'C2')) === 'c2-find-together-classroom,ep03')
check('228차: 뉴스 N1 비어 있음·뉴스 과정 0개(콘텐츠 준비 중)', listCatalog(UNITS, 'news', 'N1').length === 0 && courseCount(UNITS, 'news') === 0)
check('228차: 회차별 Writing 문항(5화 5개, 2화에 w-s02-03), findEntry로 회차·Unit 복원', writingItemsForEpisode(5).length === 5 && writingItemsForEpisode(2).some((w) => w.id === 'w-s02-03') && findEntry(UNITS, 'ep05').kind === 'story' && findEntry(UNITS, 'c2-find-together-classroom').kind === 'unit' && findEntry(UNITS, 'nope') === null)
check('228차: catalog.js는 저장소(localStorage) 없음·units.js import 없음(lazy 청크 유지)', !/localStorage|sessionStorage/.test(catSrc) && !/from ['"][^'"]*units\.js['"]/.test(catSrc))

// ── 문법 진입(shared picker intent 'grammar'): 문법은 과정이 아니라 Unit 안의 활동 ──
check('문법 진입: grammarForUnit(UNITS[0]) 관찰 2·문항 6, 문법 없는 Unit은 null', grammarForUnit(UNITS[0])?.itemCount === 6 && grammarForUnit(UNITS[0]).noticingCount === 2 && grammarForUnit({ activities: [] }) === null)
check('문법 진입: 회화 C1 = Unit 2개·이야기 없음, C3 = 0개, 회화 과정 = 3개', (() => { const l = listCatalog(UNITS, 'conversation', 'C1', { intent: 'grammar' }); return l.length === 2 && l.every((e) => e.kind === 'unit' && e.grammar) })() && listCatalog(UNITS, 'conversation', 'C3', { intent: 'grammar' }).length === 0 && courseCount(UNITS, 'conversation', { intent: 'grammar' }) === 3)
check('문법 진입(2026-10-10 개편): 선택기는 grammar intent를 다루지 않고, 홈은 문법 카드(student-home-menu-<id> 체계, grammarEnabled 게이트)만 두며 작은 student-home-grammar 버튼은 없다', !/intent === 'grammar'/.test(uSrc) && !/grammar: '문법'/.test(uSrc) && (() => { const h = read('src/components/StudentHome.jsx'); return /id: 'grammar'/.test(h) && h.includes('grammarEnabled') && !h.includes('student-home-grammar') && h.indexOf("id: 'writing'") < h.indexOf("id: 'grammar'") && h.indexOf("id: 'grammar'") < h.indexOf("id: 'growth'") })())

// ── 231차: 문법도 수행 수준(초중급)으로 나눠 단계 단위로 풀기 ──
check('231차: PERFORMANCE_LEVELS 전부 grammarKo, U1/U2 grammar basic·U3 developing, validateUnit이 잘못된 grammar 수준 거부', PERFORMANCE_LEVELS.every((p) => p.grammarKo) && UNITS[0].performance.grammar === 'basic' && UNITS[1].performance.grammar === 'basic' && UNITS[2].performance.grammar === 'developing' && validateUnit({ ...UNITS[0], performance: { ...UNITS[0].performance, grammar: 'nope' } }).includes('performance') && validateUnit(UNITS[0]).length === 0)
check('231차: grammarForUnit 수준(기초)·grammarSetForBlock C1 12문항/Unit 2개, C2 6문항/1개, C3 null', grammarForUnit(UNITS[0]).levelKo === '기초' && grammarForUnit(UNITS[2]).levelKo === '발전' && (() => { const a = grammarSetForBlock(UNITS, 'conversation', 'C1'); const b = grammarSetForBlock(UNITS, 'conversation', 'C2'); return a.itemCount === 12 && a.units.length === 2 && a.levelKo === '기초' && a.id === 'set-conversation-C1' && b.itemCount === 6 && b.units.length === 1 && b.levelKo === '발전' })() && grammarSetForBlock(UNITS, 'conversation', 'C3') === null)
check('2026-10-10: 선택기의 문법 모음 화면(GrammarSetScreen)은 문법 과정 화면으로 대체되어 제거, Choice는 export(문법 과정 화면이 재사용), 오늘의 학습 문형 활동(unit-grammar-q)은 유지', !uSrc.includes('GrammarSetScreen') && !uSrc.includes('grammar-set-') && /export function Choice\(/.test(uSrc) && uSrc.includes('unit-grammar-q'))

if (fail) { console.log(`\nFAILED ${fail}`); process.exit(1) }
console.log('\nALL PASS')
