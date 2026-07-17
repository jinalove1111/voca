// v2.0(쓰기시험 양방향 혼합형) 라이브 DB 활성화 검증 — supabase_v2_0_
// spelling_mixed.sql 실행 직후 돌리는 e2e. QA 전용 임시 반(QA_SpellingV2)을
// 만들어 검증 후 스스로 삭제한다(실제 학생/반 데이터는 일절 안 건드림).
//
// 실행:
//   node scripts/buildWordLibBundle.mjs
//   node -e "process.env.WORDLIB_BUNDLE='scripts/.tmp/wordLibrary.bundle.mjs'; import('./scripts/testSpellingV2Db.mjs')"
//
// 검증 항목(운영자 SQL 실행 전에는 전부 불가능했던 경로들):
//   1. spelling_direction 라운드트립 — 'mixed' 저장/조회(관리자 설정 경로)
//   2. words.accepted_meanings 라운드트립 + 채점 반영(등록 유사 뜻 정답 처리)
//   3. spelling_review_queue 기록(upsert 중복 무시)/조회/원클릭 인정 흐름
//      (인정 → accepted_meanings 반영 → 재채점 시 정답)
//   4. 반 삭제 cascade로 큐 행 자동 정리(고아 행 없음)
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { isSpellingCorrect } from '../src/utils/spelling.js'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')
const {
  initWordLibrary, refreshWordLibrary, refreshClassSettings, createClass, deleteClass,
  getClassSettings, setClassSettings, setClassWords, getClassWords, setWordAcceptedMeanings,
} = await import(pathToFileURL(BUNDLE).href)

// 검토 큐는 앱에서 spellingReviewApi.js가 담당 — 여기서는 같은 REST 경로를
// 직접 호출해 검증(번들에 미포함이라 raw fetch, 로직 자체가 단순 upsert/select).
const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const BASE = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const rest = async (method, path, body, headers = {}) => {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

let failures = 0
const check = (label, cond) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const QA_CLASS = 'QA_SpellingV2'
const QA_UNIT = 'Unit 1'

await initWordLibrary()

// 혹시 이전 실행이 남긴 잔재 정리
try { await deleteClass(QA_CLASS) } catch { /* 없으면 무시 */ }

try {
  console.log('\n0. QA 반/단어 준비')
  await createClass(QA_CLASS)
  await setClassWords(QA_CLASS, [{ word: 'order', meaning: '주문하다' }], QA_UNIT)
  await refreshWordLibrary()
  const qaWord = (getClassWords(QA_CLASS, QA_UNIT) || [])[0]
  check('QA 단어 생성됨(order/주문하다)', !!qaWord?.id)

  console.log('\n1. spelling_direction 라운드트립 — mixed 저장/조회')
  await setClassSettings(QA_CLASS, { spellingDirection: 'mixed' })
  await refreshClassSettings()
  check("'mixed' 저장 후 조회 일치", getClassSettings(QA_CLASS).spellingDirection === 'mixed')
  await setClassSettings(QA_CLASS, { spellingDirection: 'en2kr' })
  await refreshClassSettings()
  check("'en2kr'로 변경도 정상 반영", getClassSettings(QA_CLASS).spellingDirection === 'en2kr')

  console.log('\n2. accepted_meanings 라운드트립 + 채점 반영')
  check('저장 전: "질서"는 오답', !isSpellingCorrect('질서', qaWord.meaning, { acceptedMeanings: qaWord.acceptedMeanings }))
  await setWordAcceptedMeanings(qaWord.id, ['질서', '질서', ' 질 서 ']) // 중복/공백 변형은 1개로
  const after = (getClassWords(QA_CLASS, QA_UNIT) || [])[0]
  check('DB 저장 후 조회: acceptedMeanings === ["질서"] (중복 제거됨)',
    JSON.stringify(after.acceptedMeanings) === JSON.stringify(['질서']))
  check('저장 후: "질서"가 정답 처리(채점 반영)', isSpellingCorrect('질서', after.meaning, { acceptedMeanings: after.acceptedMeanings }))
  check('기존 뜻 "주문하다"도 여전히 정답', isSpellingCorrect('주문하다', after.meaning, { acceptedMeanings: after.acceptedMeanings }))

  console.log('\n3. spelling_review_queue — 기록/중복 무시/조회/인정 흐름')
  const upsertRow = { word_id: after.id, student_id: null, submitted_answer: '순서', direction: 'en2kr', status: 'pending' }
  const upsertHeaders = { Prefer: 'resolution=ignore-duplicates', 'Content-Type': 'application/json' }
  await rest('POST', 'spelling_review_queue?on_conflict=word_id,submitted_answer', upsertRow, upsertHeaders)
  await rest('POST', 'spelling_review_queue?on_conflict=word_id,submitted_answer', upsertRow, upsertHeaders) // 중복 — 무시돼야 함
  let rows = await rest('GET', `spelling_review_queue?word_id=eq.${after.id}&select=id,submitted_answer,status,words(word,meaning,accepted_meanings)`)
  check('같은 (단어,답) 2회 기록해도 큐에는 1행', rows.length === 1)
  check('pending 상태로 저장됨', rows[0]?.status === 'pending')
  check('words FK embed 조회 동작(관리자 패널 경로)', rows[0]?.words?.word === 'order')

  // 원클릭 "인정" 흐름 = setWordAcceptedMeanings(기존+제출답) + status 전환
  await setWordAcceptedMeanings(after.id, [...after.acceptedMeanings, rows[0].submitted_answer])
  await rest('PATCH', `spelling_review_queue?id=eq.${rows[0].id}`, { status: 'accepted' })
  const afterAccept = (getClassWords(QA_CLASS, QA_UNIT) || [])[0]
  check('인정 후 acceptedMeanings에 "순서" 추가됨', afterAccept.acceptedMeanings.includes('순서'))
  check('인정된 답 "순서"가 재채점 시 정답', isSpellingCorrect('순서', afterAccept.meaning, { acceptedMeanings: afterAccept.acceptedMeanings }))
  rows = await rest('GET', `spelling_review_queue?word_id=eq.${after.id}&status=eq.pending&select=id`)
  check('인정 처리 후 pending 큐에서 사라짐', rows.length === 0)

  console.log('\n4. 반 삭제 cascade — 큐 행 자동 정리')
  const wordId = afterAccept.id
  await deleteClass(QA_CLASS)
  const orphans = await rest('GET', `spelling_review_queue?word_id=eq.${wordId}&select=id`)
  check('반 삭제 후 그 단어의 큐 행도 cascade 삭제(고아 행 0)', orphans.length === 0)
} finally {
  try { await deleteClass(QA_CLASS) } catch { /* 이미 삭제됨 */ }
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
