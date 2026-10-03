// 2026-10-04 상황 보고 말하기 — 콘텐츠/힌트/로컬 기록/복습 휴리스틱 단위 테스트(순수, 번들·네트워크 불필요)
import fs from 'node:fs'
import { SITUATION_EXPRESSIONS as EX, SITUATION_SCENES as SC, MAX_HINT, hintText, sceneFor } from '../src/utils/situation/situationContent.js'
import { loadRecords, saveSession, dueForReview, storeKey, MAX_SESSIONS } from '../src/utils/situation/situationStore.js'

let fail = 0
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail++ }
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), _m: m } }
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const sess = (date, selfReport = null, stage = 'recall') => ({ date, scene: 'hello-a', stage, hintLevel: 0, selfReport, recorded: false })

// 콘텐츠
check('표현 5개, id 고유', EX.length === 5 && new Set(EX.map((e) => e.id)).size === 5)
check('표현 id 순서 hello/help/sorry/thanks/play', EX.map((e) => e.id).join() === 'hello,help,sorry,thanks,play')
check('en/ko 비어있지 않음, en ≤6단어', EX.every((e) => e.en && e.ko && e.en.split(/\s+/).length <= 6))
check('장면 10개, id 고유', SC.length === 10 && new Set(SC.map((s) => s.id)).size === 10)
check('표현마다 a/b 장면', EX.every((e) => sceneFor(e.id, 'a') && sceneFor(e.id, 'b')))
check('alt 비어있지 않음', SC.every((s) => s.alt.length > 5))
check('alt가 영어 표현 문구를 노출하지 않음', SC.every((s) => !/[A-Za-z]/.test(s.alt)))
const townSrc = fs.readFileSync(new URL('../src/assets/town/index.js', import.meta.url), 'utf8')
const paulSrc = fs.readFileSync(new URL('../src/assets/paul/index.js', import.meta.url), 'utf8')
check('backdrop/partner 키가 TOWN_ASSETS에 존재', SC.every((s) => townSrc.includes(`'${s.backdrop}':`) && townSrc.includes(`'${s.partner}':`)))
check('paulSticker가 paul/index.js export에 존재', SC.every((s) => new RegExp(`as ${s.paulSticker} `).test(paulSrc)))
check('cue 이모지 있음', SC.every((s) => s.cue))

// 힌트
check('MAX_HINT === 3', MAX_HINT === 3)
check('힌트1: Can ___ ___ ___ ___', hintText('Can you help me, please?', 1) === 'Can ___ ___ ___ ___')
check("힌트1: I'm ___", hintText("I'm sorry.", 1) === "I'm ___")
check('힌트2: EN 전체', hintText('Thank you so much!', 2) === 'Thank you so much!')
check('힌트0: 빈 문자열', hintText('Thank you so much!', 0) === '')
check('힌트1: 5개 표현 모두 첫 단어 + 단어 수만큼', EX.every((e) => {
  const w = e.en.split(/\s+/); const h = hintText(e.en, 1).split(' ')
  return h.length === w.length && h[0] === w[0] && h.slice(1).every((x) => x === '___')
}))

// 저장소
const s = mem()
check('빈 저장소 -> {}', JSON.stringify(loadRecords(s, U1)) === '{}')
check('저장 성공', saveSession(s, U1, 'hello', { ...sess('2026-10-01', 'can'), hintLevel: 2, recorded: true }) === true)
const r1 = loadRecords(s, U1)
check('round-trip', r1.hello.lastPracticedDate === '2026-10-01' && r1.hello.sessions.length === 1 && r1.hello.sessions[0].hintLevel === 2 && r1.hello.sessions[0].recorded === true && r1.hello.sessions[0].selfReport === 'can')
check('키에 UUID 포함', storeKey(U1) === `paulEasyVoca_situationRecall_${U1}` && s._m.has(storeKey(U1)))
check('다른 UUID는 분리', JSON.stringify(loadRecords(s, U2)) === '{}')
check('이름 studentId 거부(키 null, 저장 false, 로드 {})', storeKey('김민준') === null && saveSession(s, '김민준', 'hello', sess('2026-10-01')) === false && JSON.stringify(loadRecords(s, '김민준')) === '{}' && s._m.size === 1)
check('null/빈 studentId 거부', storeKey(null) === null && storeKey('') === null)
check('잘못된 selfReport는 null', (saveSession(s, U1, 'help', { ...sess('2026-10-01'), selfReport: 'mastered' }), loadRecords(s, U1).help.sessions[0].selfReport === null))
const bad = mem(); bad.setItem(storeKey(U1), '{not json')
check('깨진 JSON -> {}', JSON.stringify(loadRecords(bad, U1)) === '{}')
const arr = mem(); arr.setItem(storeKey(U1), '[1,2]')
check('배열 JSON -> {}', JSON.stringify(loadRecords(arr, U1)) === '{}')
const thrower = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
check('storage 예외 -> 빈/false', JSON.stringify(loadRecords(thrower, U1)) === '{}' && saveSession(thrower, U1, 'hello', sess('2026-10-01')) === false)
const many = mem(); for (let i = 1; i <= 12; i++) saveSession(many, U1, 'play', sess(`2026-10-${String(i).padStart(2, '0')}`))
check(`세션은 최근 ${MAX_SESSIONS}개만`, loadRecords(many, U1).play.sessions.length === MAX_SESSIONS && loadRecords(many, U1).play.lastPracticedDate === '2026-10-12')

// 복습 휴리스틱
const rec = (date, reports) => ({ lastPracticedDate: date, sessions: reports.map((x) => sess(date, x)) })
check('같은 날 recall(can)+transfer(can)는 3일 규칙 아님(1일 후 복습)', dueForReview({ hello: { lastPracticedDate: '2026-10-03', sessions: [sess('2026-10-03', 'can', 'recall'), sess('2026-10-03', 'can', 'transfer')] } }, '2026-10-04').join() === 'hello')
check('stage가 저장됨', (saveSession(many, U2, 'hello', sess('2026-10-01', 'can', 'transfer')), loadRecords(many, U2).hello.sessions[0].stage === 'transfer'))
check('손상 레코드(sessions 문자열/알 수 없는 id) 안전', (() => { try { return dueForReview({ zzz: { lastPracticedDate: '2026-10-01', sessions: 'x' } }, '2026-10-04').join() === 'zzz' } catch { return false } })())
const bad2 = mem(); bad2.setItem(storeKey(U1), JSON.stringify({ hello: { lastPracticedDate: '2026-10-01', sessions: 'x' } }))
check('sessions 비배열이어도 저장 가능', saveSession(bad2, U1, 'hello', sess('2026-10-02', 'can')) && loadRecords(bad2, U1).hello.sessions.length === 1)
check('같은 날은 복습 아님', dueForReview({ hello: rec('2026-10-04', [null]) }, '2026-10-04').length === 0)
check('1일 지나면 복습', dueForReview({ hello: rec('2026-10-03', ['hard']) }, '2026-10-04').join() === 'hello')
check('미보고(null)도 1일 후 복습', dueForReview({ hello: rec('2026-10-03', [null]) }, '2026-10-04').join() === 'hello')
check("마지막 두 번 'can'이면 2일 후는 아직", dueForReview({ hello: rec('2026-10-01', ['can', 'can']) }, '2026-10-03').length === 0)
check("마지막 두 번 'can'이면 3일 후 복습", dueForReview({ hello: rec('2026-10-01', ['can', 'can']) }, '2026-10-04').join() === 'hello')
check("'can' 한 번뿐이면 1일 규칙", dueForReview({ hello: rec('2026-10-03', ['can']) }, '2026-10-04').join() === 'hello')
check("hard가 섞이면 1일 규칙", dueForReview({ hello: rec('2026-10-03', ['can', 'hard']) }, '2026-10-04').join() === 'hello')
check('오래된 순 정렬', dueForReview({ a: rec('2026-10-02', [null]), b: rec('2026-09-28', [null]), c: rec('2026-10-01', [null]) }, '2026-10-05').join() === 'b,c,a')
check('월 경계 일수 계산', dueForReview({ hello: rec('2026-09-30', [null]) }, '2026-10-01').join() === 'hello')
check('빈/이상한 레코드 안전', dueForReview({}, '2026-10-04').length === 0 && dueForReview(null, '2026-10-04').length === 0 && dueForReview({ x: { lastPracticedDate: 'bad' } }, '2026-10-04').length === 0)

// 숙달/완료 필드 금지
const srcs = ['situationContent.js', 'situationStore.js'].map((f) => fs.readFileSync(new URL(`../src/utils/situation/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')).join('\n')
check("저장 코드/콘텐츠에 mastered/completed/score 필드 없음", !/mastered|completed|score|stars?\b/i.test(srcs))
check('저장된 JSON에 mastered 키 없음', !/mastered|completed/i.test(JSON.stringify([...s._m.values()])))
const ui = fs.readFileSync(new URL('../src/components/SituationRecall.jsx', import.meta.url), 'utf8')
check('persist가 무활동이면 저장 안 함(가드 존재)', /if \(!\(hintLevel > 0 \|\| selfReport \|\| recorded\)\) return/.test(ui))
check('알 수 없는 id는 steps에 못 들어감(EXPR 필터)', ui.includes('.filter((id) => EXPR[id])'))
check('무상호작용 통과 시 기록 없음(저장 호출 0)', JSON.stringify(loadRecords(mem(), U1)) === '{}')
check('UI 문구에 ✅/완료/숙달/점수/별 없음', !/✅|완료|숙달|마스터|점수|⭐/.test(ui.replace(/\/\/.*$/gm, '')))

console.log(fail ? `\nFAILED ${fail}` : '\nALL PASS')
process.exit(fail ? 1 : 0)
