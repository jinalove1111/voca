// 2026-10-04 상황 보고 말하기 — 콘텐츠/힌트/로컬 기록/복습 휴리스틱 단위 테스트(순수, 번들·네트워크 불필요)
import fs from 'node:fs'
import { SITUATION_EXPRESSIONS as EX, SITUATION_SCENES as SC, sceneFor } from '../src/utils/situation/situationContent.js'
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
const FORBID = /인사|만나|미안|사과|고마|감사|선물|도와|도움|곤란|놀자|같이 놀|안녕/
check('examAlt: 10장면 모두 있고 말하기 행위 단어/표현 문장 없음', SC.every((x) => x.examAlt && x.examAlt.length > 5 && !FORBID.test(x.examAlt) && !/[A-Za-z]/.test(x.examAlt)
  && EX.every((e) => !x.examAlt.includes(e.ko.replace(/[.!?]/g, '')) && !x.examAlt.includes(e.ko))))
// 207차: 시험 화면은 SceneCard 대신 SituationGuide(exam)를 쓴다. 그림은 최종 일러스트가 있을 때만 SituationGuide 안에서
// SceneCard exam으로 나오므로(examAlt 사용 유지), 연결 구조 보존을 함께 확인한다.
check('시험은 SituationGuide exam 사용 + SceneCard는 examAlt 유지', /<SituationGuide exam /.test(fs.readFileSync(new URL('../src/components/SpeakingExam.jsx', import.meta.url), 'utf8')) && /scene\.examAlt/.test(fs.readFileSync(new URL('../src/components/SceneCard.jsx', import.meta.url), 'utf8')))
check('cue 이모지 있음', SC.every((s) => s.cue))
check('alternatives: 표현마다 비어있지 않은 문자열 배열', EX.every((e) => Array.isArray(e.alternatives) && e.alternatives.length >= 2 && e.alternatives.every((a) => typeof a === 'string' && a.trim())))

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
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const read = (f) => fs.readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8')
const exam = read('SpeakingExam.jsx'); const practice = read('SpeakingPractice.jsx'); const item = read('SpeakingPracticeItem.jsx')
check('SituationRecall.jsx 삭제됨', !fs.existsSync(new URL('../src/components/SituationRecall.jsx', import.meta.url)))
check('시험이 세션을 stage exam으로, 공개 후 자기확인/녹음일 때만 저장', /if \(!expr \|\| !revealed \|\| !\(selfReport \|\| recorded\)\) return/.test(exam) && /stage: 'exam'/.test(exam))
check('stage exam/practice 저장 허용', (saveSession(many, U2, 'help', sess('2026-10-02', 'can', 'exam')), loadRecords(many, U2).help.sessions[0].stage === 'exam'))
const nextBody = (exam.match(/const next = \(\) => \{[\s\S]*?\n  \}/) || [''])[0]
check('시험 next(): 공개/다시 연습 상태를 초기화(setRevealed(false), setRetrying(false))', nextBody.includes('setRevealed(false)') && nextBody.includes('setRetrying(false)'))
const tern = exam.indexOf('{!revealed ? ('); const retryAt = exam.indexOf('exam-retry')
check('exam-retry는 revealed 분기(else)에만 렌더', tern > 0 && retryAt > exam.indexOf(') : (', tern) && exam.indexOf('exam-retry') === exam.lastIndexOf('exam-retry') && exam.indexOf('exam-reveal') < retryAt)
check('UI 문구에 ✅/정답/합격/완료/숙달/점수/별 없음', [exam, practice, item].every((t) => !/✅|정답|합격|완료|숙달|마스터|점수|⭐/.test(strip(t))))
check('시험: EN/KO/듣기는 revealed 조건부 마운트(hidden 금지)', /\{revealed && \(\s*<div[^>]*>\s*(<p data-testid="exam-answer-label"[^<]*<\/p>\s*)?<p data-testid="exam-answer"[\s\S]*?exam-meaning[\s\S]*?exam-listen/.test(exam) && !/hidden[^"]*"[^>]*exam-answer/.test(exam))
check('시험: 자기 확인은 revealed 조건부', /\{revealed && \(\s*<div[^>]*role="group"/.test(exam))
check('시험: 공개 전 EN 소스(expr.en)는 exam-answer 블록에서만 사용', (strip(exam).match(/expr\.en/g) || []).length === 2) // exam-answer 표시 + exam-listen
check('시험 요약 외 EN 노출(summary)은 summary 분기에서만', /summary \? \(/.test(exam))

// ── 207차 한글 상황 기반 Speaking ─────────────────────────────────────
const KO_FORBIDDEN = ['안녕', '반가', '인사', '도와', '도움', '부탁', '미안', '죄송', '사과', '고마', '감사', '놀자', '같이 놀', '함께 놀']
check('situationKo: 10장면 모두 비어 있지 않은 문자열', SC.length === 10 && SC.every((s) => typeof s.situationKo === 'string' && s.situationKo.trim().length > 0))
check('situationKo: 45자 이하(짧고 쉽게)', SC.every((s) => s.situationKo.length <= 45), SC.map((s) => s.situationKo.length).join(','))
check('situationKo: 영어 글자 없음(첫 단어 힌트 금지)', SC.every((s) => !/[A-Za-z]/.test(s.situationKo)))
check('situationKo: 목표 표현 뜻/말하기 행위 어간 없음', SC.every((s) => !KO_FORBIDDEN.some((w) => s.situationKo.includes(w))), SC.filter((s) => KO_FORBIDDEN.some((w) => s.situationKo.includes(w))).map((s) => s.id).join(','))
check('situationKo: 한국어 뜻 문장 자체를 포함하지 않음', SC.every((s) => !EX.some((e) => s.situationKo.includes(e.ko.replace(/[.!?]$/, '')))))
const sceneCardSrc = read('SceneCard.jsx')
check('그림은 최종 일러스트가 있을 때만(hasFinalArt) — 임시 합성은 화면에 안 나옴', /export const hasFinalArt = \(sceneId\) => Boolean\(FINAL_ART\[sceneId\]\)/.test(sceneCardSrc) && /\{hasFinalArt\(scene\.id\) && <SceneCard /.test(item))
check('연습 문항은 SituationGuide로 시작(문장/뜻/듣기 앞)', item.indexOf('<SituationGuide scene={scene} />') > 0 && item.indexOf('<SituationGuide scene={scene} />') < item.indexOf('data-testid="practice-sentence"'))
check('이름 변경: 메뉴/시험 제목/완료 버튼/홈 바로 가기 = 한글 보고 말하기', practice.includes('📝 한글 보고 말하기') && exam.includes('>한글 보고 말하기</h1>') && read('SpeakingPracticeMode.jsx').includes('📝 한글 보고 말하기 시작') && read('StudentHome.jsx').includes('📝 한글 보고 말하기 바로 가기'))
check('학생 UI에 "그림 보고"/"그림 시험" 문구 없음', ['SpeakingExam.jsx', 'SpeakingPractice.jsx', 'SpeakingPracticeMode.jsx', 'SpeakingPracticeItem.jsx', 'StudentHome.jsx'].every((f) => !/그림 보고|그림 시험/.test(strip(read(f)))))
check('공개 후 안내 = "이렇게 말할 수 있어요" + 다른 표현 허용 문구', /data-testid="exam-answer-label"[^>]*>이렇게 말할 수 있어요</.test(exam) && /data-testid="exam-other-ways"/.test(exam))
check('학생 화면에 alternatives(교사용) 미표시', [exam, practice, item].every((t) => !/alternatives/.test(strip(t))))

console.log(fail ? `\nFAILED ${fail}` : '\nALL PASS')
process.exit(fail ? 1 : 0)
