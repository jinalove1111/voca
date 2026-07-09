// 2026-07-10 회귀 테스트 — 관리자의 "전체 초기화"(resetWordStatus)가
// word_status 테이블만 지우고 student_progress.progress_data(전체 백업)
// 안의 wordStatus는 그대로 남겨두던 버그. 이 상태로는 이 학생이 나중에
// 정말 기기를 잃어버려 새 기기에서 fetchFullProgress()로 복구하면, 방금
// 관리자가 초기화한 값이 조용히 되살아난다. resetWordStatus가 이제
// 백업 blob의 wordStatus도 함께 비우는지 검증한다(다른 백업 필드는
// 그대로 유지되는지도 함께 확인).
// 실행: WORDLIB_BUNDLE=<esbuild output path> node scripts/testResetWordStatusBackup.mjs
import { pathToFileURL } from 'node:url'
const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')
const {
  initWordLibrary, createClass, deleteClass, setClassWords, addStudent, removeStudent,
  getStudentWords, setWordStatus, resetWordStatus, syncStudentProgress, fetchFullProgress,
} = await import(pathToFileURL(BUNDLE).href)
await initWordLibrary()

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const CLASS = 'QA_ResetWordStatusTest'
const NAME = 'QA_ResetWordStatusKid'

console.log('\n1. 테스트 반/학생/단어 준비')
await createClass(CLASS)
await setClassWords(CLASS, [{ word: 'dog', meaning: '개' }, { word: 'cat', meaning: '고양이' }], 'Unit 1')
await addStudent(NAME, CLASS, 'Unit 1')
const words = getStudentWords(NAME)
const dogId = words.find(w => w.word === 'dog').dbId

console.log('\n2. word_status 표시 + 전체 기록 백업(progress_data.wordStatus)에도 반영')
await setWordStatus(NAME, dogId, 'known')
await syncStudentProgress(NAME, {
  totalStars: 5, clearedCount: 1, streak: 0, stickersCount: 0,
  fullRecord: { studentId: NAME, totalStars: 5, stickers: [], diaryPlacements: [], missions: [], cleared: ['dog'],
    round: {}, history: {}, milestoneStreak: 0, starBadgeThreshold: 0, lastGamePlayed: null, lastWordIndex: 0,
    wordStatus: { [dogId]: 'known' } },
  daily: { categoriesCompleted: 0, starsEarned: 0, quizCorrect: 0, quizTotal: 0, pronunciationAttempts: 0, missedWordIds: [] },
})

const beforeBackup = await fetchFullProgress(NAME)
check('초기화 전: 백업(progress_data)에 wordStatus.dog === known이 저장됨', beforeBackup?.wordStatus?.[dogId] === 'known')

console.log('\n3. 관리자 "전체 초기화" 실행')
await resetWordStatus(NAME)

const afterBackup = await fetchFullProgress(NAME)
check('초기화 후: 백업(progress_data)의 wordStatus도 함께 비워짐 (재발 방지 확인 대상)',
  !afterBackup?.wordStatus || Object.keys(afterBackup.wordStatus).length === 0)
check('초기화 후: 백업의 다른 필드(totalStars 등)는 그대로 유지됨 — wordStatus만 비움',
  afterBackup?.totalStars === 5 && Array.isArray(afterBackup?.cleared) && afterBackup.cleared.includes('dog'))

console.log('\n4. 정리')
await removeStudent(NAME)
await deleteClass(CLASS)

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
