// tests/harness/runAttachment.mjs — 애착 시스템(Attachment & Growth) 하네스.
//
// runDailyRitual.mjs와 같은 자기완결형 패턴: 검증 대상이 전부 TESTING.md
// 카테고리 1의 순수 모듈(src/utils/attachment/*)이라 직접 import해서
// 단언한다. 출력 포맷(PASS/FAIL/summary/exit code)은 runDomain.mjs와 동일.
//
// 검증 축:
//   1) 파생 통계(deriveAttachmentStats) 정확성 — 진실 원천 중복 없음
//   2) 모자 규칙 결정론·멱등·no-random·no-revoke
//   3) 밀스톤 중복 방지·소급(backfilled) 정직성
//   4) 폴의 기억 진실성 — 없는 데이터를 기억하는 척 금지
//   5) 유닛 완료 판정
//   6) 월드 진행 엔진 단조성(진행이 늘면 잠금해제가 절대 줄지 않음)
//   7) 이야기 파운데이션 결정론(같은 단어 → 같은 이야기)
import { deriveAttachmentStats, completedUnits, masteryTierFor } from '../../src/utils/attachment/attachmentCore.js'
import { HAT_CATALOG, HAT_THRESHOLDS, evaluateHatUnlocks, hatById } from '../../src/utils/attachment/hatSystem.js'
import { detectNewMilestones, sortMilestonesForAlbum } from '../../src/utils/attachment/milestones.js'
import { pickPaulMemory } from '../../src/utils/attachment/paulMemory.js'
import { WORLD_STAGES, computeWorldState, gardenPlots } from '../../src/utils/attachment/worldProgress.js'
import { buildStoryChapter, getBookshelf, STORY_TEMPLATES } from '../../src/utils/attachment/storyFoundation.js'

let passed = 0
let failed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n=== [harness:attachment] 애착 시스템 — 공유 데이터 레이어 + 모자/밀스톤/기억/월드/이야기 ===')

// 고정 "현재" — 하네스 결정론(수요일이라 이번 주에 월~수 3일이 들어감)
const NOW = new Date(2026, 6, 22, 12, 0, 0) // 2026-07-22 수요일
const dayKey = (offset) => new Date(2026, 6, 22 - offset).toDateString()

// 대표 레코드 픽스처 — useStudent record의 실제 필드 모양 그대로
const day = (over = {}) => ({
  studied: true, categoriesCompleted: 0, giftsToday: 0, starsEarned: 0,
  stickersEarned: [], gamesPlayed: {}, quizCorrect: 0, quizTotal: 0,
  pronunciationAttempts: 0, missedWordIds: [], spellingCorrect: 0, spellingTotal: 0, ...over,
})
const fixture = {
  cleared: Array.from({ length: 12 }, (_, i) => `word${i}`),
  wordStatus: { 'db-1': 'mastered', 'db-2': 'mastered', 'db-3': 'known', 'db-4': 'unknown' },
  missions: [
    { wordId: 'word1', correctCount: 3, done: true },
    { wordId: 'hardword', correctCount: 3, done: true }, // 2회 이상 틀렸다가 극복
  ],
  streak: 3,
  spellingReviewQueue: [],
  history: {
    [dayKey(8)]: day({ quizCorrect: 4, quizTotal: 8, starsEarned: 3, missedWordIds: ['hardword', 'hardword'] }),
    [dayKey(7)]: day({ quizCorrect: 5, quizTotal: 10, starsEarned: 4, categoriesCompleted: 4 }),
    [dayKey(1)]: day({ quizCorrect: 9, quizTotal: 10, starsEarned: 5, missedWordIds: ['word3'] }),
    [dayKey(0)]: day({ quizCorrect: 6, quizTotal: 7, starsEarned: 2 }),
  },
}

// ── 1) 파생 통계 ──
console.log('\n-- 1) deriveAttachmentStats — 파생 정확성')
const stats = deriveAttachmentStats(fixture, NOW)
check('clearedCount = cleared.length', stats.clearedCount === 12)
check('masteredCount는 wordStatus mastered만 센다', stats.masteredCount === 2)
check('totalQuizCorrect = history 합', stats.totalQuizCorrect === 4 + 5 + 9 + 6)
check('missedCounts 빈도 집계(hardword 2회)', stats.missedCounts.hardword === 2)
check('오늘 학습했으므로 absenceDays=0', stats.absenceDays === 0)
check('firstMissionDayKey = 4/4 달성한 그 날짜', stats.firstMissionDayKey === dayKey(7))
check('improvedWordIds에 hardword(2회 틀림→미션 완료) 포함', stats.improvedWordIds.includes('hardword'))
check('improvedWordIds에 안 극복한 단어 미포함', !stats.improvedWordIds.includes('word3'))
check('thisWeek(월~오늘)에 이번 주 학습일만', stats.thisWeek.daysStudied === 2 && stats.thisWeek.quizCorrect === 15)
check('lastWeek에 지난주 학습일만', stats.lastWeek.daysStudied === 2 && stats.lastWeek.quizCorrect === 9)
const emptyStats = deriveAttachmentStats({}, NOW)
check('빈 레코드도 크래시 없이 0 통계', emptyStats.clearedCount === 0 && emptyStats.absenceDays === null)

// ── 2) 모자 규칙 ──
console.log('\n-- 2) 모자 컬렉션 — 결정론·멱등')
check('카탈로그는 정확히 7종', HAT_CATALOG.length === 7)
check('7종 id 유일', new Set(HAT_CATALOG.map(h => h.id)).size === 7)
const unlocks1 = evaluateHatUnlocks(stats, { completedUnits: [] }, [], NOW)
const unlocks2 = evaluateHatUnlocks(stats, { completedUnits: [] }, [], NOW)
check('같은 입력 → 같은 획득 목록(결정론, 무작위 없음)', JSON.stringify(unlocks1) === JSON.stringify(unlocks2))
const ids1 = unlocks1.map(u => u.hatId)
check('스타터(첫 미션 4/4) 획득', ids1.includes('hat_starter'))
check('탐험가(10 클리어) 획득', ids1.includes('hat_explorer'))
check('요리사(7일 스트릭) 미획득 — streak 3', !ids1.includes('hat_chef'))
check('왕관(200 클리어) 미획득', !ids1.includes('hat_crown'))
check('졸업(유닛 완주)은 completedUnits 있어야만', evaluateHatUnlocks(stats, { completedUnits: [{ unitId: 'u1' }] }, [], NOW).some(u => u.hatId === 'hat_graduation'))
const owned = ids1
check('이미 가진 모자는 다시 안 나옴(멱등)', evaluateHatUnlocks(stats, { completedUnits: [] }, owned, NOW).length === 0)
// no-revoke: 스트릭이 끊겨도(streak 0) 획득 "평가"는 줄어들 뿐, 인벤토리 회수 API 자체가 없다 — 여기선 평가가 소유목록을 절대 안 건드리는지로 확인
const statsNoStreak = deriveAttachmentStats({ ...fixture, streak: 0 }, NOW)
check('스트릭이 끊겨도 기존 소유 모자에 영향 없음(평가는 미소유분만)', evaluateHatUnlocks(statsNoStreak, {}, ['hat_chef'], NOW).every(u => u.hatId !== 'hat_chef'))
check('임계값 상수 노출(조정 가능한 설정)', HAT_THRESHOLDS.explorerCleared === 10 && hatById('hat_wizard').name === '마법사 모자')

// ── 3) 밀스톤 ──
console.log('\n-- 3) 밀스톤 — 중복 방지·backfilled 정직성')
const ms1 = detectNewMilestones(stats, { completedUnits: [], completedTextbooks: [], newHats: [] }, [], NOW)
const msIds = ms1.map(m => m.id)
check('first-mission-day 감지', msIds.includes('first-mission-day'))
check('cleared-10 감지(12개 클리어)', msIds.includes('cleared-10'))
check('cleared-50 미감지', !msIds.includes('cleared-50'))
check('기존 id는 다시 안 나옴(중복 방지)', detectNewMilestones(stats, {}, msIds, NOW).every(m => !msIds.includes(m.id)))
check('과거 데이터 있는 계정의 소급 감지는 backfilled=true', ms1.find(m => m.id === 'cleared-10')?.backfilled === true)
check('first-mission-day는 실제 날짜가 있어 backfilled=false', ms1.find(m => m.id === 'first-mission-day')?.backfilled === false)
check('improved 이벤트에 극복 단어 목록 포함', ms1.find(m => m.id.startsWith('improved-'))?.data.wordIds.includes('hardword'))
// 컴백: 7일 공백 후 오늘 학습한 픽스처
const comebackFix = { ...fixture, history: { [dayKey(9)]: day(), [dayKey(0)]: day() } }
const cbStats = deriveAttachmentStats(comebackFix, NOW)
const cbMs = detectNewMilestones(cbStats, {}, [], NOW)
check('7일+ 공백 후 오늘 학습 → comeback 감지', cbMs.some(m => m.id === `comeback-${dayKey(0)}`))
check('공백 없는 픽스처에선 comeback 미감지', !msIds.some(id => id.startsWith('comeback-')))
const sorted = sortMilestonesForAlbum([{ at: '2026-07-01T00:00:00Z' }, { at: '2026-07-20T00:00:00Z' }])
check('앨범 정렬은 최신 우선', new Date(sorted[0].at) > new Date(sorted[1].at))

// ── 4) 폴의 기억 진실성 ──
console.log('\n-- 4) 폴의 기억 — 없는 데이터를 기억하는 척 금지')
const noData = pickPaulMemory(deriveAttachmentStats({}, NOW), {}, NOW)
check('데이터 전무 → 정직한 폴백 인사', noData.id === 'fallback-new')
const wordTextById = new Map([['word3', 'apple'], ['hardword', 'banana']])
const mem = pickPaulMemory(stats, { wordTextById }, NOW)
check('어제 오답 실존 → 어제 어려웠던 단어 언급(실단어)', mem.id === 'yesterday-hard-word' && mem.text.includes('apple'))
// 컴백이 최우선
const cbMem = pickPaulMemory(deriveAttachmentStats({ ...fixture, history: { [dayKey(9)]: day() } }, NOW), {}, NOW)
check('9일 공백 → 컴백 인사 최우선 + 실제 공백일 수 명시', cbMem.id === 'comeback' && cbMem.text.includes('9일'))
// 어제 기록이 없으면 "어제" 주장 금지
const noYesterday = pickPaulMemory(deriveAttachmentStats({ ...fixture, history: { [dayKey(0)]: day({ starsEarned: 1 }) } }, NOW), { wordTextById }, NOW)
check('어제 기록 없음 → 어제 관련 주장 안 함', !noYesterday.id.startsWith('yesterday'))
// 표본 부족 시 주간 비교 주장 금지
const fewQuiz = deriveAttachmentStats({ ...fixture, improvedWordIds: [], missions: [], history: { [dayKey(1)]: day({ quizCorrect: 2, quizTotal: 2 }), [dayKey(8)]: day({ quizCorrect: 1, quizTotal: 2 }) } }, NOW)
check('퀴즈 표본 <5 → 주간 향상 비교 주장 안 함', pickPaulMemory(fewQuiz, {}, NOW).id !== 'week-improved')
check('같은 입력 → 같은 한마디(결정론)', pickPaulMemory(stats, { wordTextById }, NOW).id === mem.id)

// ── 5) 유닛 완료 + 숙달 티어 ──
console.log('\n-- 5) 유닛 완료 판정 + 박물관 티어')
const units = [
  { unitId: 'u1', unitName: 'Unit 1', words: [{ id: 'word0' }, { id: 'word1' }] },
  { unitId: 'u2', unitName: 'Unit 2', words: [{ id: 'word1' }, { id: 'notyet' }] },
  { unitId: 'u3', unitName: 'Empty', words: [] },
]
const done = completedUnits(units, stats.clearedSet)
check('모든 단어 클리어된 유닛만 완료', done.length === 1 && done[0].unitId === 'u1')
check('빈 유닛은 완료로 안 침', !done.some(u => u.unitId === 'u3'))
check('mastered → gold', masteryTierFor({ id: 'x', dbId: 'db-1' }, stats) === 'gold')
check('미션 done → gold', masteryTierFor({ id: 'word1', dbId: null }, stats) === 'gold')
check('cleared만 → silver', masteryTierFor({ id: 'word5', dbId: 'db-9' }, stats) === 'silver')
check('미수집 → none', masteryTierFor({ id: 'zzz', dbId: 'db-8' }, stats) === 'none')

// ── 6) 월드 진행 엔진 ──
console.log('\n-- 6) 잉글리시 월드 — 단조성/결정론')
check('6개 구역(정원→집→다리→도서관→마을→왕국)', WORLD_STAGES.length === 6 && WORLD_STAGES[0].id === 'garden' && WORLD_STAGES[5].id === 'kingdom')
const world = computeWorldState(stats)
check('정원은 항상 잠금해제(첫 구역, 임계 0)', world.stages[0].unlocked === true)
check('진행 포인트 = clearedCount', world.growthPoints === stats.clearedCount)
// 단조성: cleared가 늘수록 잠금해제 수가 절대 줄지 않음
let prevUnlocked = -1
let monotonic = true
for (const n of [0, 10, 30, 60, 100, 150, 250, 500]) {
  const s = deriveAttachmentStats({ cleared: Array.from({ length: n }, (_, i) => `w${i}`) }, NOW)
  const unlockedCount = computeWorldState(s).stages.filter(st => st.unlocked).length
  if (unlockedCount < prevUnlocked) monotonic = false
  prevUnlocked = unlockedCount
}
check('진행 증가 시 잠금해제가 절대 줄지 않음(단조)', monotonic)
check('250 클리어면 왕국까지 전부 해제', prevUnlocked === 6)
const plots = gardenPlots(stats)
check('정원 텃밭은 9칸 고정 격자', plots.length === 9)
check('클리어 0이면 전부 빈 칸', gardenPlots(emptyStats).every(p => p.stage === 'empty'))
check('같은 입력 → 같은 정원(결정론)', JSON.stringify(gardenPlots(stats)) === JSON.stringify(plots))

// ── 7) 이야기/책장 파운데이션 ──
console.log('\n-- 7) 책장·이야기 파운데이션 — 결정론 템플릿')
const learned = [{ id: 'apple', word: 'apple', meaning: '사과' }, { id: 'run', word: 'run', meaning: '달리다' }, { id: 'happy', word: 'happy', meaning: '행복한' }]
const ch1 = buildStoryChapter(learned, 0)
check('배운 단어가 이야기에 실제 포함', learned.some(w => ch1.text.includes(w.word)))
check('같은 단어 → 같은 이야기(결정론, AI/무작위 없음)', buildStoryChapter(learned, 0).text === ch1.text)
check('챕터 인덱스별 다른 템플릿', buildStoryChapter(learned, 1).templateId !== ch1.templateId)
check('단어 부족 시 정직한 안내(빈 이야기 지어내지 않음)', buildStoryChapter([], 0).insufficient === true)
check('템플릿 수 ≥ 3(순환 구조)', STORY_TEMPLATES.length >= 3)
const shelf = getBookshelf([{ unitId: 'u1', unitName: 'Unit 1', words: [{ id: 'w' }] }], done)
check('책장 책 = 완료 유닛에서 파생(중복 저장 없음)', shelf.length === 1 && shelf[0].unitId === 'u1')

// ── summary ──
console.log('\n=== summary ===')
if (failed === 0) {
  console.log(`  PASS  attachment — 애착 시스템 순수 로직 (${passed}개 단언)`)
  process.exit(0)
} else {
  console.log(`  FAIL  attachment — ${failed}/${passed + failed} 실패: ${failures.join(', ')}`)
  process.exit(1)
}
