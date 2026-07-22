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
import { HAT_CATALOG, HAT_THRESHOLDS, HAT_COLOR_STYLE, evaluateHatUnlocks, hatById } from '../../src/utils/attachment/hatSystem.js'
import { detectNewMilestones, sortMilestonesForAlbum } from '../../src/utils/attachment/milestones.js'
import { pickPaulMemory, PAUL_MEMORY_TEMPLATE_IDS } from '../../src/utils/attachment/paulMemory.js'
import { pickTodaysDiscovery, starSeedState, gardenBandSummary, retroWelcome, TOWN_PLACES, townPlacesState, TODAYS_DISCOVERY_TEMPLATE_IDS, timeWindows, paulHomeDeco, HOME_DECO_ITEMS } from '../../src/utils/attachment/paulTown.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WORLD_STAGES, computeWorldState, gardenPlots } from '../../src/utils/attachment/worldProgress.js'
import { buildStoryChapter, getBookshelf, STORY_TEMPLATES, formatTextbookTitle, getTextbookBooks } from '../../src/utils/attachment/storyFoundation.js'

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
// Paul Town v2.0 리컬러: 8종(레거시 7종 id 불변 + hat_rose). id가 바뀌면
// 프로덕션 인벤토리의 획득 모자가 고아가 되므로 정확한 id 집합을 고정한다.
const EXPECTED_HAT_IDS = ['hat_starter', 'hat_explorer', 'hat_chef', 'hat_scientist', 'hat_wizard', 'hat_graduation', 'hat_crown', 'hat_rose']
check('카탈로그는 정확히 8종(레거시 7 + hat_rose)', HAT_CATALOG.length === 8)
check('8종 id 유일', new Set(HAT_CATALOG.map(h => h.id)).size === 8)
check('레거시 7종 id 정확히 보존 + hat_rose 추가', JSON.stringify(HAT_CATALOG.map(h => h.id)) === JSON.stringify(EXPECTED_HAT_IDS))
check('전 모자가 동일 톱햇 디자인(🎩) + colorName/colorHex 보유', HAT_CATALOG.every(h => h.emoji === '🎩' && h.colorName && /^#[0-9a-fA-F]{6}$/.test(h.colorHex)))
check('색상 hex 스펙 일치(rose=#F48FB1, wizard=#9575CD)', hatById('hat_rose').colorHex === '#F48FB1' && hatById('hat_wizard').colorHex === '#9575CD')
check('HAT_COLOR_STYLE 헬퍼 = 카탈로그에서 파생(id별 색 정보)', HAT_COLOR_STYLE.hat_crown.colorHex === '#FFD54F' && Object.keys(HAT_COLOR_STYLE).length === 8)
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
check('임계값 상수 노출(조정 가능한 설정)', HAT_THRESHOLDS.explorerCleared === 10 && hatById('hat_wizard').name === '보라색 폴 모자')
// hat_rose — 한 주 5일 학습 규칙: 결정론 + 멱등(evaluateHatUnlocks 경유).
// NOW(수요일)로는 이번 주가 최대 3일이라, 같은 주 금요일 시점을 쓴다
// (주간 버킷은 월요일 시작 — Jul 20(월)~24(금) 5일 학습).
const ROSE_NOW = new Date(2026, 6, 24, 12, 0, 0) // 2026-07-24 금요일
const roseFix = {
  ...fixture,
  history: {
    ...fixture.history,
    [dayKey(2)]: day(),  // Jul 20 (월)
    [dayKey(-1)]: day(), // Jul 23 (목)
    [dayKey(-2)]: day(), // Jul 24 (금)
  },
}
const roseStats = deriveAttachmentStats(roseFix, ROSE_NOW)
check('이번 주 5일 학습 → hat_rose 획득', evaluateHatUnlocks(roseStats, {}, [], ROSE_NOW).some(u => u.hatId === 'hat_rose'))
check('hat_rose 결정론(같은 입력 → 같은 결과)', JSON.stringify(evaluateHatUnlocks(roseStats, {}, [], ROSE_NOW)) === JSON.stringify(evaluateHatUnlocks(roseStats, {}, [], ROSE_NOW)))
check('hat_rose 멱등(이미 소유 → 재지급 없음)', !evaluateHatUnlocks(roseStats, {}, ['hat_rose'], ROSE_NOW).some(u => u.hatId === 'hat_rose'))
check('이번 주 4일 이하 → hat_rose 미획득', !evaluateHatUnlocks(stats, {}, [], NOW).some(u => u.hatId === 'hat_rose'))
check('주가 리셋돼도 소유 모자는 평가가 안 건드림(회수 없음)', evaluateHatUnlocks(stats, {}, ['hat_rose'], NOW).every(u => u.hatId !== 'hat_rose'))

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

// ── 8) Paul Town — 오늘의 발견 / 별→씨앗 / 홈 밴드 / 소급 환영 ──
console.log('\n-- 8) Paul Town — 순수 파생 엔진(오늘의 발견/별→씨앗/홈 밴드/소급 환영)')
// 순수성(운영자 아키텍처 규칙): paulTown.js는 DB 클라이언트/브라우저
// 저장소를 import하지 않는 순수 모듈 — 파일 텍스트 부재로 회귀 방지.
const paulTownSrc = readFileSync(fileURLToPath(new URL('../../src/utils/attachment/paulTown.js', import.meta.url)), 'utf8')
check('paulTown.js는 supabase/localStorage 문자열 자체가 없는 순수 모듈', !/supabase/i.test(paulTownSrc) && !paulTownSrc.includes('localStorage'))
check('paulTown.js의 import는 worldProgress(순수 모듈)뿐', [...paulTownSrc.matchAll(/^import .*from '(.+)'/gm)].every(m => m[1] === './worldProgress.js'))
check('paulTown.js에 Math.random 없음(결정론)', !paulTownSrc.includes('Math.random'))

const discCtx = { wordTextById }
const disc1 = pickTodaysDiscovery(stats, discCtx, NOW)
const disc2 = pickTodaysDiscovery(stats, discCtx, NOW)
check('오늘의 발견 — 같은 날 + 같은 데이터 → 같은 메시지(결정론)', JSON.stringify(disc1) === JSON.stringify(disc2))
// 날이 바뀌면 바뀔 수 있음 — 후보군이 있는 픽스처로 10일 창에서 2종 이상
const discIds = new Set()
for (let i = 0; i < 10; i++) {
  const d = new Date(2026, 6, 22 + i, 12, 0, 0)
  discIds.add(pickTodaysDiscovery(stats, discCtx, d).id)
}
check('오늘의 발견 — 날짜가 바뀌면 다른 발견이 나옴(10일 창에서 2종 이상)', discIds.size >= 2)
check('발견 템플릿 수 ≥ 8(+폴백)', TODAYS_DISCOVERY_TEMPLATE_IDS.length >= 9)
check('데이터 전무 → 정직한 환영 폴백(없는 발견을 지어내지 않음)', pickTodaysDiscovery(emptyStats, {}, NOW).id === 'discovery-welcome')
check('발견 텍스트에 undefined/null 누출 없음', !disc1.text.includes('undefined') && !disc1.text.includes('null'))
// "어제 심은 별" 주장은 history[어제].starsEarned>0일 때만 후보가 된다 —
// 어제 기록이 없는 픽스처에선 10일 창 전체에서 한 번도 안 나와야 한다
const noYestStats = deriveAttachmentStats({ cleared: ['w1'], history: { [dayKey(0)]: day({ starsEarned: 0 }) } }, NOW)
let sproutClaimed = false
for (let i = 0; i < 10; i++) {
  if (pickTodaysDiscovery(noYestStats, {}, new Date(2026, 6, 22 + i)).id === 'discovery-star-sprout') sproutClaimed = true
}
check('어제 별 기록 없음 → "어제 심은 별" 주장 절대 안 함', !sproutClaimed)

// 별→씨앗 — history 파생(새 영속 상태 없음)
const seed = starSeedState(stats, NOW)
check('오늘 별 획득 → todayPlanted', seed.todayPlanted === true)
check('어제 별 획득 → yesterdaySprouted + 라벨', seed.yesterdaySprouted === true && seed.sproutLabel === '어제 네 별이야.')
check('빈 history → 심은 것도 새싹도 없음', starSeedState(emptyStats, NOW).todayPlanted === false && starSeedState(emptyStats, NOW).yesterdaySprouted === false)
check('별→씨앗 결정론(같은 날 같은 history → 같은 상태)', JSON.stringify(starSeedState(stats, NOW)) === JSON.stringify(seed))

// 홈 밴드 요약 — computeWorldState 재사용, 꽃 수 = masteredCount
const band = gardenBandSummary(stats, {}, NOW)
check('홈 밴드 꽃 수 = masteredCount', band.flowerCount === stats.masteredCount)
check('홈 밴드 오늘 심은 별 = history[오늘].starsEarned', band.seedsToday === 2)
check('홈 밴드 growthPoints = clearedCount(월드 엔진 재사용)', band.growthPoints === stats.clearedCount && band.text.length > 0)

// 소급 환영 — 정직한 숫자, 신규 학생은 null
check('신규 학생(클리어 0) → 소급 환영 null', retroWelcome(emptyStats) === null)
const retro = retroWelcome(stats)
check('기존 학생 → 실제 클리어 수로 정직한 환영', retro.text.includes('12개') && retro.growthLevel >= 1)
// growthLevel 단조성 — clearedCount가 늘면 절대 줄지 않음
let prevLevel = 0
let retroMonotonic = true
for (const n of [1, 30, 100, 250]) {
  const lv = retroWelcome(deriveAttachmentStats({ cleared: Array.from({ length: n }, (_, i) => `w${i}`) }, NOW)).growthLevel
  if (lv < prevLevel) retroMonotonic = false
  prevLevel = lv
}
check('소급 환영 growthLevel 단조 증가', retroMonotonic)

// ── 9) Paul Town 장소 데이터 모델 ──
console.log('\n-- 9) TOWN_PLACES — 데이터 모델(UI 없음)')
check('정원/폴의 집은 열려 있음', TOWN_PLACES.find(p => p.id === 'garden').open && TOWN_PLACES.find(p => p.id === 'paulHome').open)
check('폴의 집에 모자걸이(hatRack)', TOWN_PLACES.find(p => p.id === 'paulHome').features.includes('hatRack'))
check('건물(박물관/도서관/시계탑)은 paulTownBuildings 플래그 뒤', ['museum', 'library', 'clockTower'].every(id => TOWN_PLACES.find(p => p.id === id).requiresFlag === 'paulTownBuildings'))
const flagOff = townPlacesState(stats, () => false)
check('플래그 OFF → 건물 미발견(열린 곳만)', flagOff.filter(p => p.discovered).every(p => p.open))
const bigStats = deriveAttachmentStats({ cleared: Array.from({ length: 120 }, (_, i) => `w${i}`) }, NOW)
const flagOn = townPlacesState(bigStats, () => true)
check('플래그 ON + 진행 충족 → 점진 발견(120클리어: 박물관/도서관 O, 시계탑 X)', flagOn.find(p => p.id === 'museum').discovered && flagOn.find(p => p.id === 'library').discovered && !flagOn.find(p => p.id === 'clockTower').discovered)

// ── 10) 폴의 기억 v2 — 템플릿 확장 검증 ──
console.log('\n-- 10) 폴의 기억 v2 — 템플릿 ≥15 + 신규 원천 데이터 가드')
check('기억 템플릿 id ≥ 15종', PAUL_MEMORY_TEMPLATE_IDS.length >= 15)
check('새 모자 획득 순간(ctx.recentHatName) → new-hat 기억', pickPaulMemory(emptyStats, { recentHatName: '분홍색 폴 모자' }, NOW).id === 'new-hat')
check('교재 완주 ctx → textbook-complete 기억(교재명 포함)', pickPaulMemory(stats, { completedTextbooks: [{ classId: 'c1', className: '초등 필수' }] }, NOW).text.includes('초등 필수'))
check('유닛 완주 ctx → unit-complete 기억', pickPaulMemory(stats, { completedUnits: [{ unitId: 'u1', unitName: 'Unit 1' }] }, NOW).id === 'unit-complete')
const bigGardenMem = pickPaulMemory(bigStats, {}, NOW)
check('정원 성장(클리어 파생) 기억 — 120클리어 → garden 계열', bigGardenMem.id === 'garden-tree' || bigGardenMem.id === 'garden-flower')
const fiveDayFix = { history: Object.fromEntries([0, 1, 2, 3, 4].map(i => [dayKey(i), day()])) }
check('이번 달 학습일 5일 이상(history 월 창 지원) → month-days', pickPaulMemory(deriveAttachmentStats(fiveDayFix, NOW), {}, NOW).id === 'month-days')
const spellingFix = {
  ...fixture,
  spellingReviewQueue: [{ wordId: 'hardword' }],
  history: { [dayKey(0)]: day({ starsEarned: 0 }) }, // 어제 기록 제거(우선순위 상위 차단)
}
check('받아쓰기 큐에 있던 단어 극복 → spelling-improved(실단어)', pickPaulMemory(deriveAttachmentStats(spellingFix, NOW), { wordTextById }, NOW).text.includes('banana'))
check('스트릭 기억에 죄책감 언어 없음', PAUL_MEMORY_TEMPLATE_IDS.includes('streak-going') && !pickPaulMemory(deriveAttachmentStats({ streak: 5, cleared: ['a'], history: { [dayKey(0)]: day({ starsEarned: 0 }) } }, NOW), {}, NOW).text.includes('왜'))
check('기억 ctx 없는 기존 호출(하위 호환) — 시그니처 그대로 동작', pickPaulMemory(stats, { wordTextById }, NOW).id === 'yesterday-hard-word')

// ── 11) Paul Town 월드 — 시계탑(timeWindows) / 방 꾸미기 / 도서관 책 ──
console.log('\n-- 11) Paul Town 월드 — 타임머신 창/방 소품/책장 확장(전부 파생·단조)')

// timeWindows — 결정론 + 실제 이력만(없는 창을 지어내지 않음)
const tw1 = timeWindows(stats, NOW)
const tw2 = timeWindows(stats, NOW)
check('timeWindows 결정론(같은 stats+now → 같은 결과)', JSON.stringify(tw1) === JSON.stringify(tw2))
check('창 4개(어제/지난주/한 달 전/일 년 전 오늘) 순서 고정', JSON.stringify(tw1.map(w => w.id)) === JSON.stringify(['yesterday', 'lastWeek', 'monthAgo', 'yearAgo']))
const wYest = tw1.find(w => w.id === 'yesterday')
check('어제 창 — 실측 집계(1일·⭐5·정답률 90%)', wYest.present && wYest.daysStudied === 1 && wYest.starsEarned === 5 && wYest.accuracy === 90)
check('어제 창 — 틀렸다가 이겨낸 단어(word3: 어제 오답→클리어됨)', wYest.overcomeWordIds.includes('word3'))
const wLast = tw1.find(w => w.id === 'lastWeek')
check('지난주 창 — 7~13일 전 집계(2일·⭐7·9/18=50%)', wLast.present && wLast.daysStudied === 2 && wLast.starsEarned === 7 && wLast.accuracy === 50)
check('지난주 창 — hardword(2회 오답→미션 완료) 극복 목록 포함', wLast.overcomeWordIds.includes('hardword'))
const wMonth = tw1.find(w => w.id === 'monthAgo')
check('한 달 전 기록 없음 → present=false(정직한 빈 창 — 숫자 지어내지 않음)', wMonth.present === false && wMonth.daysStudied === 0 && wMonth.accuracy === null)
const wYear = tw1.find(w => w.id === 'yearAgo')
check('일 년 전 오늘 — 그 날짜 기록 없으면 present=false + hideWhenAbsent', wYear.present === false && wYear.hideWhenAbsent === true)
// 일 년 전 정확히 같은 달력 날짜(2025-07-22)에 기록이 실존하면 present
const yearFix = { ...fixture, history: { ...fixture.history, [new Date(2025, 6, 22).toDateString()]: day({ starsEarned: 3, quizCorrect: 4, quizTotal: 5 }) } }
const twYear = timeWindows(deriveAttachmentStats(yearFix, NOW), NOW).find(w => w.id === 'yearAgo')
check('일 년 전 오늘 기록 실존 → present + 실측 값 + 날짜 라벨', twYear.present === true && twYear.starsEarned === 3 && twYear.dateLabel.includes('2025'))
check('빈 레코드 → 모든 창 present=false(창을 지어내지 않음)', timeWindows(emptyStats, NOW).every(w => w.present === false))

// paulHomeDeco — 방 소품 파생(결정론·단조·잠긴 목록 없음)
check('방 소품 결정론(같은 stats → 같은 소품)', JSON.stringify(paulHomeDeco(stats)) === JSON.stringify(paulHomeDeco(stats)))
check('빈 레코드 → 소품 없음(지어내지 않음)', paulHomeDeco(emptyStats).length === 0)
check('픽스처(클리어 12, 마스터 2, 학습 4일) → 화분 하나만', JSON.stringify(paulHomeDeco(stats).map(d => d.id)) === JSON.stringify(['deco-pot']))
check('소품 카탈로그 ≥ 5종 + id 유일', HOME_DECO_ITEMS.length >= 5 && new Set(HOME_DECO_ITEMS.map(d => d.id)).size === HOME_DECO_ITEMS.length)
let prevDeco = -1
let decoMonotonic = true
for (const n of [0, 5, 20, 60, 200]) {
  const s = deriveAttachmentStats({
    cleared: Array.from({ length: n }, (_, i) => `w${i}`),
    wordStatus: Object.fromEntries(Array.from({ length: Math.floor(n / 4) }, (_, i) => [`db${i}`, 'mastered'])),
    history: Object.fromEntries(Array.from({ length: Math.min(n, 40) }, (_, i) => [dayKey(i), day({ starsEarned: 2 })])),
  }, NOW)
  const cnt = paulHomeDeco(s).length
  if (cnt < prevDeco) decoMonotonic = false
  prevDeco = cnt
}
check('진행이 늘수록 소품이 절대 줄지 않음(단조)', decoMonotonic)

// 책장 단조성 — 클리어가 늘수록 책이 절대 줄지 않는다
let prevBooks = -1
let shelfMonotonic = true
for (const clearedList of [[], ['word0'], ['word0', 'word1'], ['word0', 'word1', 'notyet']]) {
  const cs = new Set(clearedList)
  const books = getBookshelf(units, completedUnits(units, cs)).length
  if (books < prevBooks) shelfMonotonic = false
  prevBooks = books
}
check('클리어 증가 → 책이 절대 줄지 않음(단조)', shelfMonotonic && prevBooks === 2)

// 교재 책 — 실명 제목만(지어내지 않음)
check('formatTextbookTitle — 출판사 있으면 "YBM(박준원)" 꼴', formatTextbookTitle({ name: '박준원', publisherName: 'YBM' }) === 'YBM(박준원)')
check('formatTextbookTitle — 출판사 없으면 이름 그대로/폴백은 실명', formatTextbookTitle({ name: '박준원' }) === '박준원' && formatTextbookTitle(null, '중2 반') === '중2 반')
const tbBooks = getTextbookBooks([{ classId: 'c1', className: '중2 YMB 박준원' }], units, new Map([['c1', 'YBM(박준원)']]))
check('완주 교재 → 두꺼운 책(주입 제목 + 단어 수 합산)', tbBooks.length === 1 && tbBooks[0].title === 'YBM(박준원)' && tbBooks[0].wordCount === 4)
check('제목 맵 없으면 실제 반 이름 폴백 / 완주 없으면 책 없음', getTextbookBooks([{ classId: 'c1', className: '중2 YMB 박준원' }], units)[0].title === '중2 YMB 박준원' && getTextbookBooks([], units).length === 0)

// townPlacesState — 발견 단조성(진행이 늘면 발견된 곳이 절대 줄지 않음)
let prevPlaces = -1
let placesMonotonic = true
for (const n of [0, 30, 100, 150, 300]) {
  const s = deriveAttachmentStats({ cleared: Array.from({ length: n }, (_, i) => `w${i}`) }, NOW)
  const cnt = townPlacesState(s, () => true).filter(p => p.discovered).length
  if (cnt < prevPlaces) placesMonotonic = false
  prevPlaces = cnt
}
check('마을 발견 단조성(클리어 증가 → 발견 감소 없음, 300이면 전부)', placesMonotonic && prevPlaces === TOWN_PLACES.length)
check('건물 카드의 이동 화면 id — 박물관/도서관/시계탑', TOWN_PLACES.find(p => p.id === 'museum').screen === 'wordMuseum' && TOWN_PLACES.find(p => p.id === 'library').screen === 'bookshelf' && TOWN_PLACES.find(p => p.id === 'clockTower').screen === 'timeMachine')

// storyFoundation.js 순수성 — import 0(부수효과/저장소 접근 자체가 불가)
const storySrc = readFileSync(fileURLToPath(new URL('../../src/utils/attachment/storyFoundation.js', import.meta.url)), 'utf8')
check('storyFoundation.js는 import 0의 순수 모듈(supabase/localStorage/random 없음)', ![...storySrc.matchAll(/^import /gm)].length && !/supabase/i.test(storySrc) && !storySrc.includes('localStorage') && !storySrc.includes('Math.random'))

// ── summary ──
console.log('\n=== summary ===')
if (failed === 0) {
  console.log(`  PASS  attachment — 애착 시스템 순수 로직 (${passed}개 단언)`)
  process.exit(0)
} else {
  console.log(`  FAIL  attachment — ${failed}/${passed + failed} 실패: ${failures.join(', ')}`)
  process.exit(1)
}
