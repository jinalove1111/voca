// scripts/seedLesson5.mjs — "완결된 레슨 1개"(Lesson 5) 파일럿 시드 (2026-07-23)
//
// 무엇을 심는가: 중2 YMB 박준원 "Unit 5"(unit_id 아래 상수 — 실행 시 라이브
// DB에서 이름/단어 존재를 재확인하고 안 맞으면 아무것도 쓰지 않고 중단)에
// 지문 1개("Lesson 5 — 오늘의 핵심 문장") + 문장 3개를 넣는다. 문장은 이
// 유닛의 실제 단어로 조합했다:
//   1) (핵심 문장, 중요도 5, 수동 청크 4개, 문법 포인트) explore/future/path
//   2) favorite/hobby/writer   3) proud/ability/society
//
// 정직한 한계: 이 문장들은 파일럿 검증용 시드 콘텐츠다(교과서 원문이
// 아니다). 선생님이 관리자 화면의 지문 편집기(PassageEditor)에서 검토하고
// 실제 교과서 본문/핵심 문장으로 교체하는 것을 전제로 한다.
//
// 실행 방식: mock 없이 esbuild로 번들한 진짜 배포 코드(src/utils/
// readingApi.js — createPassage/saveSentences)를 그대로 사용한다
// (scripts/testReadingLive.mjs와 동일 관례). DDL 없음 — v3.3/v3.4 스키마는
// 이미 운영자가 실행 완료(handoff.md 2026-07-23 3차).
//
// 멱등: 같은 제목의 지문이 이 유닛에 이미 있으면 아무것도 만들지 않고 종료.
// 실행: node scripts/seedLesson5.mjs
import esbuild from 'esbuild'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

// 대상 유닛 — 조사(2026-07-23): 3개 중2 교재 컨테이너(중2 YMB 박준원/중2
// 능률 김기택/중2 천재 이상기) 중 이름이 5인 유닛은 YMB "Unit 5"(41단어)와
// 능률 "Unit 5"(40단어) 2개였고, 컨테이너 나열 순서상 첫 일치인 YMB를 택함.
const UNIT_ID = 'b35c9bfd-3755-478c-b488-77044c39e6e9' // 중2 YMB 박준원 · Unit 5
const PASSAGE_TITLE = 'Lesson 5 — 오늘의 핵심 문장'

// 문장 3개 — 전부 이 유닛의 실제 단어 2~3개씩으로 구성(위 헤더 참고).
// 1번만 핵심 문장: SentenceLearningFlow 6단계의 대상이 된다. pickBlank는
// 유닛 단어 첫 일치("explore")를 결정론적으로 빈칸으로 뚫는다.
const SENTENCES = [
  {
    english: 'I want to explore my future and find my own path.',
    korean: '나는 내 미래를 탐험하고 나만의 길을 찾고 싶어요.',
    isKeySentence: true,
    importanceLevel: 5,
    grammarPoint: "want to + 동사원형: '~하고 싶다'",
    chunks: ['I want to explore', 'my future', 'and find', 'my own path'],
  },
  {
    english: 'My favorite hobby is writing, so I want to be a writer.',
    korean: '내가 가장 좋아하는 취미는 글쓰기라서, 나는 작가가 되고 싶어요.',
    isKeySentence: false,
    importanceLevel: 3,
    grammarPoint: '',
    chunks: null,
  },
  {
    english: 'We are proud of our ability to help our society.',
    korean: '우리는 우리 사회를 도울 수 있는 능력이 자랑스러워요.',
    isKeySentence: false,
    importanceLevel: 3,
    grammarPoint: '',
    chunks: null,
  },
]

const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
await esbuild.build({
  entryPoints: ['src/utils/readingApi.js'], bundle: true, format: 'esm', platform: 'node',
  outfile: 'scripts/.tmp/readingApi.lesson5.bundle.mjs',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
  },
})
const api = await import(pathToFileURL('scripts/.tmp/readingApi.lesson5.bundle.mjs').href)

const H = { apikey: key, Authorization: `Bearer ${key}` }
const rest = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: H })).json()

// ── 0) 대상 유닛 실측 재확인 — 이름에 5가 있고 단어가 있어야 함 ──────────
const units = await rest(`units?id=eq.${UNIT_ID}&select=id,name,class_id`)
const unit = units?.[0]
if (!unit) { console.error(`중단: unit ${UNIT_ID} 이 존재하지 않음`); process.exit(1) }
if (!/5/.test(unit.name)) { console.error(`중단: unit 이름("${unit.name}")이 5와 무관 — 대상 재확인 필요`); process.exit(1) }
const words = await rest(`words?unit_id=eq.${UNIT_ID}&select=id,word`)
if (!Array.isArray(words) || words.length === 0) {
  console.error('중단: 이 유닛에 단어가 없음 — 시드 대상이 아님'); process.exit(1)
}
console.log(`대상 유닛 확인: "${unit.name}" (${UNIT_ID}) — 단어 ${words.length}개`)

// 시드 문장에 쓴 단어가 실제로 유닛에 있는지 정직하게 확인(경고만 — 차단 아님)
const wordSet = new Set(words.map((w) => String(w.word).toLowerCase()))
for (const used of ['explore', 'future', 'path', 'favorite', 'hobby', 'writer', 'proud', 'ability', 'society']) {
  if (!wordSet.has(used)) console.warn(`  경고: 시드 문장에 쓴 "${used}"가 유닛 단어 목록에 없음`)
}

// ── 1) 멱등 가드 — 같은 제목의 지문이 이미 있으면 스킵 ──────────────────
const existing = await api.fetchPassagesForUnit(UNIT_ID)
const dup = existing.find((p) => p.title === PASSAGE_TITLE)
if (dup) {
  console.log(`이미 존재(멱등 스킵): "${PASSAGE_TITLE}" (passage ${dup.id}, 문장 ${dup.sentences.length}개)`)
  process.exit(0)
}

// ── 2) 시드 — 진짜 readingApi(createPassage/saveSentences) 경유 ───────────
const passage = await api.createPassage(UNIT_ID, PASSAGE_TITLE, existing.length)
await api.saveSentences(passage.id, SENTENCES)
const after = await api.fetchPassagesForUnit(UNIT_ID)
const mine = after.find((p) => p.id === passage.id)
const keyCount = mine?.sentences?.filter((s) => s.isKeySentence).length ?? 0
console.log(`시드 완료: passage ${passage.id} — 문장 ${mine?.sentences?.length}개(핵심 ${keyCount}개)`)
console.log('주의: 파일럿 시드 콘텐츠입니다 — 선생님이 PassageEditor에서 검토/교체해 주세요.')
process.exit(keyCount === 1 && mine?.sentences?.length === 3 ? 0 : 1)
