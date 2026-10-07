// 2026-10-07(222차) Writing 첫 버전 — 문항·저장 순수 모듈 검사 + 화면 소스 핀(브라우저·번들·네트워크 불필요)
import fs from 'node:fs'
import { WRITING_ITEMS, listWritingTopics, writingItem, writingItemForSpeaking } from '../src/utils/writing/writingItems.js'
import { draftsKey, loadDrafts, saveDraft, hasContent, sameSentence } from '../src/utils/writing/writingDrafts.js'
import { STORY_ITEMS, STORY_EPISODES } from '../src/utils/situation/storyEpisodes.js'
import { SPEAKING_TOPICS, STORY_CARDS } from '../src/utils/situation/speakingTopics.js'

let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? '  ' + detail : ''}`); if (!ok) fail++ }
const read = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const stripEnd = (s) => s.replace(/[.!?。…\s]+$/g, '')

// ── 문항: 기존 Speaking 문항 id만 가리키고(복사 없음), 주제는 Speaking 주제 id, 학교생활·쇼핑 5개씩 ──
const topics = listWritingTopics()
check('문항 10개, id 유일, 모두 기존 STORY_ITEMS를 가리킴', WRITING_ITEMS.length === 10 && new Set(WRITING_ITEMS.map((w) => w.id)).size === 10 && WRITING_ITEMS.every((w) => STORY_ITEMS.some((i) => i.id === w.itemId) && w.id === `w-${w.itemId}`))
check('주제는 Speaking 주제 id, 학교생활·쇼핑만(각 5개), 빈 주제 없음', topics.map((t) => `${t.id}:${t.items.length}`).join(',') === 'school:5,shopping:5' && topics.every((t) => SPEAKING_TOPICS.some((s) => s.id === t.id && s.titleKo === t.titleKo)))
check('문항의 회차가 그 주제의 Speaking 회차 안에 있음', WRITING_ITEMS.every((w) => { const t = SPEAKING_TOPICS.find((s) => s.id === w.topic); const ep = STORY_ITEMS.find((i) => i.id === w.itemId).episode; return t.episodes.includes(STORY_EPISODES.find((e) => e.n === ep).id) }))
check('화면용 문항: 상황·역할·영어·뜻·대체 답안·상대 대답을 원본에서 읽음(값 동일)', WRITING_ITEMS.every((w) => { const v = writingItem(w.id); const s = STORY_ITEMS.find((i) => i.id === w.itemId); return v && v.situationKo === s.situationKo && v.roleKo === s.roleKo && v.en === s.en && v.ko === s.ko && JSON.stringify(v.alternatives) === JSON.stringify(s.alternatives || []) && JSON.stringify(v.reply) === JSON.stringify(s.reply || null) }))
check('promptKo: ≤45자·영어 없음·"써 보세요"로 끝남·문항의 뜻(ko)을 그대로 담지 않음', WRITING_ITEMS.every((w) => { const s = STORY_ITEMS.find((i) => i.id === w.itemId); return w.promptKo.length <= 45 && !/[A-Za-z]/.test(w.promptKo) && /써 보세요\.$/.test(w.promptKo) && !w.promptKo.includes(stripEnd(s.ko)) }), WRITING_ITEMS.filter((w) => !(w.promptKo.length <= 45 && !/[A-Za-z]/.test(w.promptKo) && /써 보세요\.$/.test(w.promptKo))).map((w) => w.id).join(','))
check('hintWords: 1~3개, 전부 목표 문장 안의 단어/덩어리, 문장 전체 아님', WRITING_ITEMS.every((w) => { const en = STORY_ITEMS.find((i) => i.id === w.itemId).en.toLowerCase(); return w.hintWords.length >= 1 && w.hintWords.length <= 3 && w.hintWords.every((h) => en.includes(h.toLowerCase()) && h.length < en.length - 3) }))
check('noteKo ≤50자, acceptNoteKo(있으면) ≤40자', WRITING_ITEMS.every((w) => w.noteKo && w.noteKo.length <= 50 && (!w.acceptNoteKo || w.acceptNoteKo.length <= 40)))
check('Speaking 연결: 2화·5화 핵심 표현에 Writing 문항 있음, 1·3화 등은 없음', !!writingItemForSpeaking(STORY_CARDS.ep02.keyItemId) && !!writingItemForSpeaking(STORY_CARDS.ep05.keyItemId) && ['ep01', 'ep03', 'ep04', 'ep06'].every((e) => !writingItemForSpeaking(STORY_CARDS[e].keyItemId)))

// ── 저장: UUID 키만, 초안 라운드트립, 깨진 값 방어, 판정 값 없음 ──
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m } }
const UID = 'e2e00000-0000-4000-8000-00000000a001'
const OTHER = 'e2e00000-0000-4000-8000-00000000a002'
const st = mem()
check('키는 UUID만(이름·빈 값 → null), 저장 거부', draftsKey('Paul') === null && draftsKey('') === null && !saveDraft(st, 'Paul', 'w-s02-03', { first: 'x' }) && draftsKey(UID).endsWith(UID))
check('초안 라운드트립(first/helped/compared/revised 부분 갱신), 계정별 분리', saveDraft(st, UID, 'w-s02-03', { first: 'Can I borrow a pencil', helped: true }) && saveDraft(st, UID, 'w-s02-03', { compared: true }) && saveDraft(st, UID, 'w-s02-03', { revised: 'Can I borrow a pencil?' }) && (() => { const d = loadDrafts(st, UID)['w-s02-03']; return d.first === 'Can I borrow a pencil' && d.helped === true && d.compared === true && d.revised === 'Can I borrow a pencil?' && !!d.updatedAt })() && Object.keys(loadDrafts(st, OTHER)).length === 0)
check('저장 레코드에 점수·정답·숙달·선생님 확인 값 없음', !/score|correct|pass|master|teacher|grade/i.test(JSON.stringify(loadDrafts(st, UID))))
st.setItem(draftsKey(UID), '{{{not json')
check('깨진 JSON → {} (화면 계속)', JSON.stringify(loadDrafts(st, UID)) === '{}')
const boom = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
check('storage 예외 → {} / false', JSON.stringify(loadDrafts(boom, UID)) === '{}' && saveDraft(boom, UID, 'w-s02-03', { first: 'a' }) === false)
check('hasContent: 빈 문자열·공백만은 false', !hasContent('') && !hasContent('   \n') && hasContent(' a ') && !hasContent(null))
check('sameSentence: 대소문자·문장부호·공백 차이는 같은 문장, 단어가 다르면 다른 문장', sameSentence('can i borrow a pencil', 'Can I borrow a pencil?') && sameSentence('  Can I  borrow a pencil ?', 'Can I borrow a pencil?') && !sameSentence('Can I use a pencil?', 'Can I borrow a pencil?'))

// ── 화면 소스 핀 ──
const w = strip(read('components/WritingPractice.jsx'))
const app = strip(read('App.jsx'))
const mode = strip(read('components/SpeakingPracticeMode.jsx'))
const root = strip(read('components/SpeakingPractice.jsx'))
check('화면: 예시 영어(item.en)·듣기·대체 답안은 write 단계에 없음(step !== write 블록 안에서만)', (w.match(/\{item\.en\}/g) || []).length === 1 && /\{step !== 'write' && \(/.test(w) && w.indexOf('{item.en}') > w.indexOf("{step !== 'write' && (") && w.indexOf('writing-alternatives') > w.indexOf("{step !== 'write' && ("))
const writeBlockStart = w.indexOf("{step !== 'write' && (")
check('화면: 뜻(item.ko)·상대 대답(item.reply)·듣기(writing-listen)도 비교 블록 안에서만', ['{item.ko}', 'item.reply.en', 'data-testid="writing-listen"'].every((t) => w.indexOf(t) > writeBlockStart && w.lastIndexOf(t) > writeBlockStart))
check('문항 상황(situationKo)에 영어·뜻 문장 없음', WRITING_ITEMS.every((wi) => { const s = STORY_ITEMS.find((i) => i.id === wi.itemId); return !/[A-Za-z]/.test(s.situationKo) && !s.situationKo.includes(stripEnd(s.ko)) }))
check('화면: 도움은 단어만(hintWords.join), 공백 입력은 비교 불가(hasContent), 수정 전/후 구분(writing-first/writing-revised)', /hintWords\.join/.test(w) && /disabled=\{!canCompare\}/.test(w) && w.includes('data-testid="writing-first"') && w.includes('data-testid="writing-revised"') && /혼자 썼어요|도움 보고 썼어요/.test(w))
check('화면: 예시는 유일한 정답이 아님 문구, 자동 채점·정답·합격·숙달·점수 문구 없음', w.includes('이렇게 쓸 수 있어요 (예시)') && w.includes('다른 말도 괜찮아요') && !/정답|합격|숙달|점수|오답|틀렸/.test(w))
check('화면: 임시 저장·미전송 안내, 선생님 확인은 안내만(기록 없음)', w.includes('이 기기에 임시 저장되며 선생님에게 자동 전송되지 않아요') && w.includes('확인 기록을 저장하지 않아요'))
check('화면: DB·업로드·AI 없음(supabase/fetch/SpeechRecognition 없음), 저장은 writingDrafts만', !/supabase|fetch\(|SpeechRecognition|openai|anthropic/i.test(w) && /from '\.\.\/utils\/writing\/writingDrafts'/.test(w) && !/localStorage\.(setItem|getItem)\(/.test(w.replace(/const safeStorage[^\n]*\n/, '')))
check('App: Writing 화면은 QA 계정만(qaTestStudent && screen === writingCoach), 홈 카드도 QA면 활성, Speaking → Writing 링크·복귀', /\{qaTestStudent && screen === 'writingCoach' && \(/.test(app) && /writingEnabled=\{isFeatureEnabled\('writingCoachEnabled'\) \|\| qaTestStudent\}/.test(app) && /setWritingLink\(\{ writingItemId, setId \}\); setScreen\('writingCoach'\)/.test(app) && /setSpeakingMode\('practiceDone'\); setScreen\('speaking'\)/.test(app) && /if \(t === 'writingCoach'\) setWritingLink\(null\)/.test(app) && /onHome=\{\(\) => \{ setWritingLink\(null\); setScreen\('home'\) \}\}/.test(app))
check('Speaking: 연습 끝 화면 [이 표현 써보기]는 Writing 문항이 있는 세트만, 돌아오면 그 세트의 연습 끝(startDone)', /\{writing && \(/.test(mode) && mode.includes('practice-write') && /useState\(startDone\)/.test(mode) && /initialMode === 'practiceDone' && initialSetId \? 'practice'/.test(root) && /startDone=\{resume && initialSetId === setId\}/.test(root) && /const goMenu = \(\) => \{ setResume\(false\);/.test(root))
check('일반 학생 경로 무변경: 기존 WritingCoach는 !qaTestStudent에서만, 플래그 기본 OFF', /\{!qaTestStudent && screen === 'writingCoach' && \(/.test(app) && /writingCoachEnabled: false/.test(read('config/features.js')))

if (fail) { console.log(`\nFAILED ${fail}`); process.exit(1) }
console.log('\nALL PASS')
