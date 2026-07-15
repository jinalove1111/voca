// Verifies syncStudentProgress() actually lands rows in the live Supabase
// project (student_progress + student_daily_progress), using a disposable
// QA student cleaned up at the end (cascade-deletes both synced rows via
// the FK `on delete cascade`, same pattern as testStudentLogin.mjs).
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const {
  initWordLibrary, addStudent, removeStudent, getClassNames, syncStudentProgress,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

// Independent client (not the app's internal one) purely to verify what
// landed in Supabase — same env vars, read via .env directly.
const envText = fs.readFileSync('.env', 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}
const supabaseForTest = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// Local-timezone date, matching wordLibrary.js's localIsoDateStr() (KST on
// the deployed app). `toISOString()` is UTC and gives the wrong calendar
// date between midnight and 9am KST — this bit the test itself once
// already (2026-07-09 fix was in app code only, not here).
function localIsoDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const anyClass = getClassNames()[0]
if (!anyClass) throw new Error('No class exists to test against — aborting')

const NAME = 'QA_SyncTest'
console.log('\n1. 동기화 대상 학생 생성')
// P0(2026-07-15): addStudent가 id(UUID)를 반환 — syncStudentProgress는
// 이제 그 id를 직접 FK로 쓴다(캐시 조회 없이).
const STUDENT_ID = await addStudent(NAME, anyClass, 'Unit 1')

console.log('\n2. syncStudentProgress 호출 (누적 + 오늘자 기록)')
await syncStudentProgress(STUDENT_ID, {
  totalStars: 42,
  clearedCount: 7,
  streak: 3,
  stickersCount: 2,
  daily: {
    categoriesCompleted: 4,
    starsEarned: 10,
    quizCorrect: 3,
    quizTotal: 5,
    pronunciationAttempts: 6,
    missedWordIds: ['apple', 'apple', 'banana'],
  },
})

console.log('\n3. 실제 Supabase에 반영됐는지 조회로 확인')
const studentId = STUDENT_ID
check('addStudent가 반환한 id가 실제 DB row와 일치', (await supabaseForTest.from('students').select('id').eq('id', studentId).single()).data?.id === studentId)

const { data: prog } = await supabaseForTest.from('student_progress').select('*').eq('student_id', studentId).single()
check('student_progress.total_stars === 42', prog.total_stars === 42)
check('student_progress.cleared_count === 7', prog.cleared_count === 7)
check('student_progress.streak === 3', prog.streak === 3)
check('student_progress.stickers_count === 2', prog.stickers_count === 2)
check('student_progress.last_studied_date가 오늘 날짜', prog.last_studied_date === localIsoDateStr())

const today = localIsoDateStr()
const { data: daily } = await supabaseForTest.from('student_daily_progress').select('*').eq('student_id', studentId).eq('date', today).single()
check('student_daily_progress.categories_completed === 4', daily.categories_completed === 4)
check('student_daily_progress.quiz_correct === 3 / quiz_total === 5', daily.quiz_correct === 3 && daily.quiz_total === 5)
check('student_daily_progress.pronunciation_attempts === 6', daily.pronunciation_attempts === 6)
check('student_daily_progress.missed_word_ids에 apple이 2번 기록됨',
  daily.missed_word_ids.filter(w => w === 'apple').length === 2)

console.log('\n4. 같은 날 두 번째 동기화 -> upsert로 갱신되는지 (새 row 안 생기는지)')
await syncStudentProgress(STUDENT_ID, {
  totalStars: 50, clearedCount: 8, streak: 4, stickersCount: 2,
  daily: { categoriesCompleted: 4, starsEarned: 15, quizCorrect: 4, quizTotal: 6, pronunciationAttempts: 7, missedWordIds: ['banana'] },
})
const { data: dailyRows } = await supabaseForTest.from('student_daily_progress').select('*').eq('student_id', studentId).eq('date', today)
check('같은 날 재동기화해도 row가 1개로 유지됨 (upsert)', dailyRows.length === 1)
check('재동기화 값으로 갱신됨 (quiz_total === 6)', dailyRows[0].quiz_total === 6)

console.log('\n5. 정리 — 학생 삭제 시 진행도 row도 cascade 삭제되는지')
await removeStudent(STUDENT_ID)
const { data: progAfter } = await supabaseForTest.from('student_progress').select('*').eq('student_id', studentId)
const { data: dailyAfter } = await supabaseForTest.from('student_daily_progress').select('*').eq('student_id', studentId)
check('학생 삭제 후 student_progress row도 함께 삭제됨', progAfter.length === 0)
check('학생 삭제 후 student_daily_progress row도 함께 삭제됨', dailyAfter.length === 0)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
