// scripts/testLesson5Journey.mjs — "완결된 레슨 1개"(Lesson 5) 학생 여정
// LIVE 검증 (2026-07-23)
//
// 시뮬레이션하는 여정(실제 학생 플로우와 동일한 데이터 경로):
//   유닛 열기(단어 존재) → 오늘의 단어 학습(GuidedSession — 단어별 진행은
//   기존 useStudent 경로라 여기선 존재만 확인) → 세션 완료 카드의 "오늘의
//   핵심 문장 도전!" 오퍼 판정(fetchPassagesForUnit + fetchSentenceProgress
//   — GuidedSession이 하는 것과 동일한 판정) → SentenceLearningFlow 6단계
//   (read→chunk→puzzle→one_blank→ko_to_en→mastered)를 엔진 리듀서
//   (applyStageResult)로 걷고 매 단계 upsertSentenceProgress 저장 →
//   mastered 확인 → DB 재조회로 이어하기(resume) 상태 확인.
//
// mock 없음: readingApi/sentenceProgressApi는 esbuild로 번들한 진짜 배포
// 코드, sentenceLearning.js는 import-0 순수 모듈이라 직접 import. 대상은
// 프로덕션 DB이며 실제 학생은 절대 건드리지 않는다 — 전용 QA 학생
// (_QA_Lesson5_20260723, 이후 조회는 전부 UUID)만 사용. sentence_progress
// QA 행은 실행 시작 시 리셋(재실행 멱등)하고 종료 시엔 검토용으로 남긴다
// (QA 학생 소유 행 — 실데이터 아님).
//
// 실행: node scripts/testLesson5Journey.mjs
import esbuild from 'esbuild'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  STAGES, chunksOf, pickBlank, shuffleDeterministic, checkChunkOrder,
  checkBlank, applyStageResult, nextStage,
} from '../src/utils/sentenceLearning.js'

const UNIT_ID = 'b35c9bfd-3755-478c-b488-77044c39e6e9' // 중2 YMB 박준원 · Unit 5 (seedLesson5.mjs와 동일)
const UNIT_CLASS_ID = '9e9ce482-d7c0-4771-8e01-37966ee64d79' // 중2 YMB 박준원
const PASSAGE_TITLE = 'Lesson 5 — 오늘의 핵심 문장'
const QA_STUDENT_NAME = '_QA_Lesson5_20260723'

const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

await esbuild.build({
  entryPoints: ['src/utils/readingApi.js', 'src/utils/sentenceProgressApi.js'],
  bundle: true, format: 'esm', platform: 'node',
  outdir: 'scripts/.tmp/lesson5',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
  },
})
const readingApi = await import(pathToFileURL('scripts/.tmp/lesson5/readingApi.js').href)
const progressApi = await import(pathToFileURL('scripts/.tmp/lesson5/sentenceProgressApi.js').href)
const supabase = createClient(url, key)

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

console.log('=== Lesson 5 학생 여정 LIVE 검증 (프로덕션 DB, 실제 배포 코드) ===')

// ── Step 1) 유닛 열기 — 오늘의 단어가 실제로 있어야 여정이 시작된다 ──────
console.log('\n[Step 1] 유닛 열기 — 단어 존재')
const { data: words, error: wErr } = await supabase
  .from('words').select('id,word').eq('unit_id', UNIT_ID)
check('유닛 단어 조회 성공 + 비어있지 않음', !wErr && Array.isArray(words) && words.length > 0, wErr?.message || words?.length)
const unitWordSlugs = (words || []).map((w) => w.word).filter(Boolean)

// ── Step 2) 세션 완료 카드의 핵심 문장 오퍼 판정과 동일한 조회 ────────────
console.log('\n[Step 2] 지문/핵심 문장 조회 (GuidedSession 완료 카드와 동일 경로)')
const passages = await readingApi.fetchPassagesForUnit(UNIT_ID)
const lesson = passages.find((p) => p.title === PASSAGE_TITLE)
check(`지문 "${PASSAGE_TITLE}" 존재`, !!lesson, passages.map((p) => p.title))
const keySentence = lesson?.sentences?.find((s) => s.isKeySentence)
const nonKeys = (lesson?.sentences || []).filter((s) => !s.isKeySentence)
check('핵심 문장 정확히 1개', lesson?.sentences?.filter((s) => s.isKeySentence).length === 1)
check('핵심 문장 중요도 5', keySentence?.importanceLevel === 5, keySentence?.importanceLevel)
check('핵심 문장 수동 청크(2개 이상) 존재', Array.isArray(keySentence?.chunks) && keySentence.chunks.length >= 2, keySentence?.chunks)
check('비핵심 문장 존재(보기/듣기 전용 대상)', nonKeys.length >= 1, nonKeys.length)

// ── Step 3) QA 학생 준비 (있으면 재사용, 없으면 생성 — 이후 UUID로만 식별) ─
console.log('\n[Step 3] QA 학생 준비')
let { data: qa } = await supabase
  .from('students').select('id,name').eq('name', QA_STUDENT_NAME).limit(1)
let studentId = qa?.[0]?.id || null
if (!studentId) {
  // addStudent와 동일 컬럼 구성(name/class_id/unit_name/current_unit_id) —
  // QA 픽스처라 house/배정 테이블은 생략(이 여정 검증과 무관).
  const { data: ins, error: insErr } = await supabase
    .from('students')
    .insert({ name: QA_STUDENT_NAME, class_id: UNIT_CLASS_ID, unit_name: 'Unit 5', current_unit_id: UNIT_ID })
    .select('id').single()
  if (insErr) { console.log('  FAIL  QA 학생 생성', insErr.message); failures++; }
  studentId = ins?.id || null
}
check('QA 학생 확보(UUID)', /^[0-9a-f-]{36}$/i.test(studentId || ''), studentId)

// 재실행 멱등 — 이전 실행이 남긴 이 QA 학생의 sentence_progress만 리셋
// (student_id+sentence_id 범위 한정, QA 학생 소유 행 — 실학생 데이터 아님).
if (studentId && lesson) {
  await supabase.from('sentence_progress')
    .delete().eq('student_id', studentId)
    .in('sentence_id', lesson.sentences.map((s) => s.id))
}

// ── Step 4) 완료 카드 오퍼 판정 — "아직 마스터 안 한 핵심 문장" 존재 ──────
console.log('\n[Step 4] 핵심 문장 도전 오퍼 판정 (fetchSentenceProgress)')
const progBefore = await progressApi.fetchSentenceProgress(studentId, lesson.sentences.map((s) => s.id))
check('진행도 없음 = 처음부터(오퍼 표시 조건 충족)', keySentence && !progBefore[keySentence.id]?.masteredAt)

// ── Step 5) 엔진 유틸 실측 — 이 문장으로 실제 단계 화면이 성립하는지 ──────
console.log('\n[Step 5] 엔진 유틸 (청크/셔플/빈칸/채점)')
const chunks = chunksOf(keySentence)
check('chunksOf — 수동 청크 그대로 사용', chunks.length >= 2 && chunks.join(' ').startsWith('I want'), chunks)
const shuffled = shuffleDeterministic(chunks, String(keySentence.id))
check('shuffleDeterministic — 원본 순서와 다름(결정론)', JSON.stringify(shuffled) !== JSON.stringify(chunks), shuffled)
check('checkChunkOrder — 정답 순서 채점', checkChunkOrder(chunks, chunks) === true && checkChunkOrder(shuffled, chunks) === false)
const blank = pickBlank(keySentence.english, unitWordSlugs)
check('pickBlank — 유닛 단어를 빈칸으로 선택', !!blank && unitWordSlugs.map((w) => w.toLowerCase()).includes(blank.answer.toLowerCase()), blank)
check('checkBlank — 대소문자/공백 무관 채점', blank && checkBlank(` ${blank.answer.toUpperCase()} `, blank.answer) === true)

// ── Step 6) 6단계 여정 — 매 단계 applyStageResult + upsert(실 저장) ───────
console.log('\n[Step 6] 6단계 학습 여정 (단계마다 DB upsert)')
let row = {} // 처음부터 — applyStageResult가 안전 기본값을 채운다
const walkStages = STAGES.filter((s) => s !== 'mastered') // read..ko_to_en
// 오답 1회를 먼저 겪는 실제 시나리오(puzzle에서 한 번 틀림 — 단계 유지 확인)
row = applyStageResult(row, 'read', true)
await progressApi.upsertSentenceProgress(studentId, keySentence.id, row)
check('read 통과 → chunk로 전진', row.current_stage === 'chunk', row.current_stage)
row = applyStageResult(row, 'chunk', true)
await progressApi.upsertSentenceProgress(studentId, keySentence.id, row)
row = applyStageResult(row, 'puzzle', false) // 오답 — 벌점 없이 단계 유지
await progressApi.upsertSentenceProgress(studentId, keySentence.id, row)
check('puzzle 오답 → 단계 유지 + wrong_count 기록', row.current_stage === 'puzzle' && row.wrong_count === 1, row)
row = applyStageResult(row, 'puzzle', true)
await progressApi.upsertSentenceProgress(studentId, keySentence.id, row)
row = applyStageResult(row, 'one_blank', true)
await progressApi.upsertSentenceProgress(studentId, keySentence.id, row)
row = applyStageResult(row, 'ko_to_en', true)
const savedFinal = await progressApi.upsertSentenceProgress(studentId, keySentence.id, row)
check('전 단계 통과 → current_stage=mastered', row.current_stage === 'mastered', row.current_stage)
check('mastered_at 기록됨', !!row.mastered_at, row.mastered_at)
check('완료 단계 목록 = read..ko_to_en 전부', walkStages.every((s) => row.completed_stages.includes(s)), row.completed_stages)
check('최종 upsert 저장 성공(true)', savedFinal === true, savedFinal)

// ── Step 7) DB 재조회 — 이어하기/미션 완료 상태가 영속됐는지 ─────────────
console.log('\n[Step 7] DB 재조회 (resume-from-DB)')
const progAfter = await progressApi.fetchSentenceProgress(studentId, lesson.sentences.map((s) => s.id))
const saved = progAfter[keySentence.id]
check('재조회 — current_stage=mastered', saved?.currentStage === 'mastered', saved)
check('재조회 — mastered_at 존재(완료 카드의 "다시 도전" 상태)', !!saved?.masteredAt)
check('재조회 — 시도/오답 카운트 보존', saved?.attemptCount === 6 && saved?.wrongCount === 1, saved)

// ── Step 8) 비핵심 문장 — 단계 진입 불가(보기/듣기 전용) ─────────────────
console.log('\n[Step 8] 비핵심 문장은 학습 단계에 진입하지 않음')
check('nextStage(read, 비핵심) === null', nonKeys.every((s) => nextStage('read', s.isKeySentence) === null))
check('비핵심 문장 진행도 행 없음(만들어지지 않음)', nonKeys.every((s) => !progAfter[s.id]))

console.log(`\n=== ${failures === 0 ? '전부 PASS' : `FAIL ${failures}건`} — QA 학생 ${QA_STUDENT_NAME}(${studentId})의 sentence_progress 행은 검토용으로 남김 ===`)
process.exit(failures === 0 ? 0 : 1)
