import { useState, useCallback, useEffect, useRef } from 'react'
import { getRandomSticker, getMilestoneSticker, STICKERS } from '../data/stickers'

// Student roster + class assignment live in Supabase (shared across every
// device) — see utils/wordLibrary.js. Per-student progress (stars, stickers,
// diary, missions, daily history) is stored device-local (localStorage) as
// the fast/primary copy — every value here is 100% private per student and
// never shared with other students.
//
// P0 (2026-07-15) identity 리팩터링 — 이 파일의 로컬 저장은 원래 학생
// "이름"을 키로 썼다(STORE_KEY 아래 `{ [name]: record }`). 동명이인 학생이
// (다른 반이라도) 서로의 별/포인트/캘린더/학습기록을 덮어쓰는 실사고의
// 직접 원인이었다 — 지금은 studentId(UUID, Supabase students.id)를 키로
// 쓴다. 기존 이름 키 레코드는 **절대 삭제하지 않고** 그대로 둔 채(다른
// 학생이 그 이름으로 여전히 접근할 수 있으므로), 로그인 성공 시점에
// "이 기기가 지금 로그인하는 그 학생"의 정확한 id로만 lazy(온디맨드)
// 복사한다 — 전역 자동 매칭은 동명이인 상황에서 위험해서 하지 않는다
// (아래 loadRecord/migrateOldData 참고, 이미 있던 paulEasyVoca_{name}_
// {field} → 통합 STORE_KEY 마이그레이션과 정확히 같은 패턴을 재사용).
//
// 2026-07-09: localStorage does NOT travel with the student (a new phone, a
// cleared browser, or a wiped app has none of it) — an earlier version of
// this comment claimed re-logging in "restores fresh from whatever device is
// used," which was never actually true and was the root cause of reports of
// progress "disappearing." Every change is now ALSO backed up to Supabase
// (student_progress.full_record, fire-and-forget, see syncStudentProgress),
// and if a login's local record ever comes up empty, restoreFromCloudBackup()
// below tries that backup before assuming this is a genuinely brand-new
// student. Local storage stays authoritative whenever it actually has data —
// the cloud copy is a safety net, never a silent overwrite.
export { getStudents, addStudent, removeStudent, findStudentByName } from '../utils/wordLibrary'
import { syncStudentProgress, fetchFullProgress, fetchProgressBackupStrict, setWordStatus as syncWordStatus, postXpEvent, postRewardEvent } from '../utils/wordLibrary'
// Paul Rank System(2026-07-19) — XP는 totalStars에서 파생시키지 않는다
// (판단 근거: src/utils/paulRankShared.js 헤더).
// v2.3.1(2026-07-19, 행동 단위 리팩터링) — 운영자가 실제 프로덕션에서
// XP가 "단어" 단위(레벨업 미션 클리어가 wordId를 source_event_id로 씀)로
// 지급되어 무한 파밍이 가능함을 발견, "행동(그날의 학습 카테고리 완료)"
// 단위로 재설계. addStars()는 기존 4곳 그대로 유지(별 경제는 안 건드림)
// 하지만 grantXp()는 더 이상 그 4곳과 1:1 대응하지 않는다 — 상세 매핑과
// 제거/추가 사유는 src/utils/paulRankShared.js의 XP_EVENT_TABLE 헤더
// 주석과 wiki/decisions.md #10 참고.
import { resolveXpAmount } from '../utils/paulRankShared'
// Ticket Economy(2026-07-19, GAME_DESIGN.md 4·7·10번 섹션) — 별(XP)과
// 완전히 분리된, 소비 가능한(감소하는) 화폐라 append-only 원장 +
// 순수 합산(sumTicketBalance)만 쓴다(원시 잔액 저장 금지 — 판단 근거는
// ticketEconomy.js 헤더 주석). 서버 없이 로컬 우선(progress_data 백업)
// 관례를 따르는 판단 근거도 같은 파일에 문서화.
import { grantTicket, sumTicketBalance, mergeTicketLedgers, redeemReward } from '../utils/ticketEconomy'
// Reward System V1(2026-08-15, Phase 2 배선) — "언제 몇 별을 줄지"의 순수
// 규칙은 전부 rewardEngine.js(수정 금지, 63단언 계약 고정)가 담당하고,
// 이 파일은 그 규칙을 기존 별 지급 단일 경로(grantReward, 945행)에
// 얹기만 한다(재구현 금지, CLAUDE.md 규칙 3). earnedStars는 쓰지 않는다 —
// totalStars의 원본은 여전히 record.totalStars(레거시 별 포함) 그대로이고,
// rewardLedger에서 재계산하지 않는다(운영자 결정, 레거시 별 보존).
import { REWARD_STARS, rewardIdempotencyKey, streakBonusStars, levelForStars, starsToNextLevel, buildRewardEntry, hasRewardEntry, appendRewardEntry } from '../utils/rewardEngine'
// Session Reward Summary(P1 "즉각적인 보상 피드백", 2026-09-03) — 순수 요약
// 계산은 전부 rewardSummary.js(zero-import, rewardEngine.js와 무관한
// 독립 모듈)가 담당, 여기서는 그 결과를 grantLedgerReward의 기존 지급
// 경로(재구현 없음, CLAUDE.md 규칙 3)에 얹어 상태로 노출만 한다.
import { buildSessionRewardSummary } from '../utils/rewardSummary'
// 계층 계약(레이어 계약, scripts/testGardenGrowthFlow.mjs 10번 시나리오가
// 정적으로 고정) — 이 파일은 attachment 폴더 아래 어떤 모듈도 import하지
// 않고, 정원 "단계" 계산과 관련된 어떤 식별자도 담지 않는다(정원 단계 계산
// 전담 파일은 attachment 폴더에만 있다 — 애착 레이어는 useAttachment를
// 통해서만 파생된다는 저장소 계약). 이 파일은 아래 computeGardenPoints가
// 계산하는 "실제로 학습한 서로 다른 단어 수"라는 원시(raw) 숫자만 계산해
// rewardSummary에 그대로 넘기고, 그 숫자를 "정원 단계 변화량"으로 바꾸는
// 일은 SessionRewardCard.jsx(컴포넌트 레이어, attachment import 허용)가
// 전담한다(2026-09-03 P1 회귀 수정 — 최초 구현은 이 변환을 여기 뒀다가
// 계약 위반으로 되돌림, 아래 gardenRawBefore/gardenRawAfter 참고).
import { isFeatureEnabled } from '../config/features'

// ── Single unified progress store ───────────────────────────────────────
// Every per-student value the app tracks (stars, stickers, today's mission
// progress, permanent calendar history, streak bookkeeping, diary, level-up
// missions...) lives under ONE localStorage key, keyed by studentId (was:
// student name — see P0 identity note above). This replaces the old
// scattered paulEasyVoca_{name}_{field} keys — the bug where the Dashboard,
// calendar, and reward popup could show different numbers for "today" came
// from those being read/written independently; one record read by every
// screen makes that impossible by construction.
const STORE_KEY = 'paul_easy_progress'
const OLD_PREFIX = 'paulEasyVoca'
const oldKey = (name, type) => `${OLD_PREFIX}_${name}_${type}`

function loadStore() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY))
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}
  } catch { return {} }
}
// P7 감사(2026-07-16): setItem은 저장 공간 부족(QuotaExceededError)이나
// 일부 프라이빗 브라우징 모드에서 throw할 수 있다. saveStore는 patch()의
// setState updater "안"에서 불리므로, 여기서 throw하면 렌더 중 예외가 돼
// 앱 전체가 크래시했다. 쓰기 실패는 삼키고 경고만 남긴다 — in-memory
// 상태(React state)는 정상 갱신되고 클라우드 동기화(doSync)도 그 state를
// 읽으므로, 학습 세션과 서버 백업은 계속 동작한다(이 기기 로컬 영속화만
// 실패). 동작 불변: 정상 경로는 완전히 동일.
let _storeWriteWarned = false
function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch (err) {
    if (!_storeWriteWarned) {
      _storeWriteWarned = true
      console.warn('[useStudent] 로컬 저장 실패(저장 공간 부족?) — 화면/클라우드 동기화는 계속 동작:', err?.message || err)
    }
  }
}
function readOld(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def }
}

// v1.5 Stability Milestone — per-device, per-student sync health, so the
// hidden admin Debug page can show "did this device's last cloud sync
// actually succeed" instead of the previous silent .catch(() => {}) that
// left no trace of failures anywhere. Deliberately NOT part of the main
// progress record (STORE_KEY) — this is telemetry about the sync
// mechanism itself, not student progress data, and must never be backed up
// / restored / compared as if it were.
const SYNC_META_KEY = 'paul_easy_sync_meta'
function loadSyncMetaStore() {
  try {
    const v = JSON.parse(localStorage.getItem(SYNC_META_KEY))
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}
  } catch { return {} }
}
function saveSyncMetaStore(store) {
  // saveStore와 같은 이유의 방어 — 동기화 텔레메트리 기록 실패가 동기화
  // 자체(마킹을 호출한 .then/.catch 체인)를 깨뜨리면 안 된다.
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(store))
  } catch { /* 텔레메트리 기록 실패는 무시 — 학습 데이터 아님 */ }
}
function freshSyncMeta() {
  return { status: 'idle', lastType: null, lastAttemptAt: null, lastSuccessAt: null, failedCount: 0, lastError: null }
}
function patchSyncMeta(name, patchFn) {
  const store = loadSyncMetaStore()
  const cur = store[name] || freshSyncMeta()
  store[name] = { ...cur, ...patchFn(cur) }
  saveSyncMetaStore(store)
}
const markSyncAttempt = (name, type) =>
  patchSyncMeta(name, () => ({ status: 'syncing', lastType: type, lastAttemptAt: new Date().toISOString() }))
const markSyncSuccess = (name, type) =>
  patchSyncMeta(name, () => ({ status: 'success', lastType: type, lastSuccessAt: new Date().toISOString(), failedCount: 0, lastError: null }))
const markSyncFailure = (name, type, err) =>
  patchSyncMeta(name, (cur) => ({ status: 'error', lastType: type, failedCount: (cur.failedCount || 0) + 1, lastError: (err && err.message) || String(err) }))

// Read-only accessors for the Debug page (DebugPage.jsx) — never mutate
// state, safe to call outside a component/hook. Both now take studentId
// (see P0 identity note above) — DebugPage.jsx passes the id it got from
// getStudents().
export function getSyncMeta(studentId) {
  return loadSyncMetaStore()[studentId] || freshSyncMeta()
}
export function getLocalRecordRaw(studentId) {
  return loadStore()[studentId] || null
}

const GOAL = 5
const MISSION_BONUS_STARS = 10
const DUPLICATE_BONUS_STARS = 20
// M4b(2026-08-04) Cleared Stars — 파생(derived) 전용 상수. clearedWords는
// 영구 append-only이고(단일 기록 지점 markWordCleared가 patch updater 안에서
// includes 검사 후에만 append, 멀티기기 병합은 unionList — mergeProgressRecords
// 참고) `new Set(clearedWords).size === clearedWords.length`가 구조적
// 불변식이다. 그래서 "지급 상태"를 저장하지 않고 매번
// `clearedWords.length * CLEARED_STAR_PER_WORD`로 다시 계산하면 중복 지급이
// 애초에 존재할 수 없다(저장된 지급 기록 자체가 없으므로) — 아래
// clearedStars/starsDisplay 참고. 발음 성공 1별과 같은 급으로 두고 레벨업
// 미션 클리어(MISSION_BONUS_STARS=10)보다 낮게 유지해 기존 별 보상 위계를
// 보존한다. totalStars/stars 자체와 뱃지 판정(STAR_BADGES)은 이 상수와
// 무관하게 그대로 stars(=totalStars)를 쓴다 — 절대 여기서 파생시키지 않는다.
// src/utils/weeklyReport.js가 이 값을 복제해서 쓴다(그 파일의 "bare node
// 실행 가능" 불변조건 때문에 import 불가 — 값을 바꾸면 그 파일도 함께 갱신).
export const CLEARED_STAR_PER_WORD = 1
// P3 쓰기시험 게임화 — 연속 "첫 시도 정답"(콤보)이 아래 마일스톤에 처음
// 도달하는 순간 한 번씩만 주는 보너스 별. 기존 별 경제를 인플레이션시키지
// 않도록 의도적으로 보수적(미션 보너스 10 / 중복 스티커 20 대비 1~3개
// 수준, 콤보가 한 번 끊기기 전까지 최대 +6). 10을 넘긴 뒤에는 콤보가
// 끊겨 다시 올라올 때까지 추가 보너스 없음.
export const SPELLING_COMBO_BONUS = { 3: 1, 5: 2, 10: 3 }
export function spellingComboBonus(combo) {
  return SPELLING_COMBO_BONUS[combo] || 0
}
const STREAK_MILESTONES = [3, 7, 14, 30]
// Star-count badges — guaranteed special stickers awarded once per
// threshold, independent of the gacha/streak systems (never duplicated).
export const STAR_BADGES = [
  { threshold: 100,  stickerId: 'ukflag1' },
  { threshold: 300,  stickerId: 'crown1' },
  { threshold: 500,  stickerId: 'guard1' },
  { threshold: 1000, stickerId: 'lion' },
]

const todayStr = () => new Date().toDateString()
// v2.3.1 — 예전엔 여기 randEventId()(무작위 idempotency 키 생성 헬퍼)가
// 있었다. 유일한 소비처(duplicate-sticker-bonus의 grantXp 호출)를 XP
// 지급 트리거에서 제거하면서(위 grantSticker 주석 참고) 이 헬퍼도 죽은
// 코드가 되어 함께 제거했다 — 재발명 시 참고: 무작위 키는 "네트워크 재시도
// 중복"만 막고 "코드 버그성 중복 호출"은 못 막는다는 한계가 있었다(그래서
// v2.3.1이 이 트리거 자체를 없앤 것).
const freshRound = () => ({
  date: todayStr(),
  wordsViewed: [],
  examplesHeard: 0,
  quizSolved: 0,
  pronunciationOk: 0,
  // "오늘 이 단어로 이미 발음 별을 받았는가"를 단어 id 기준으로 기억하는
  // 배열(wordsViewed와 동일한 배열-dedup 패턴, 2026-07-27 도입). 2026-07-28
  // 별 지급 단일 경로 리팩터링 이후 실제 별 지급 dedup은 아래
  // starGrantLog(grantReward 전용)가 담당하고, 이 배열은 순수 이력/표시
  // 용도로 유지(멀티기기 병합에도 그대로 참여, unionList). pronunciationOk
  // (raw 카운터)는 미션 카테고리 집계/표시용으로 의미가 그대로라 손대지
  // 않는다 — markPronunciationOk 참고.
  pronunciationOkWordIds: [],
  spellingWrongToday: [], // wordIds missed at least once in a spelling test today (deduped) — the "오답노트" queue the end-of-day review cycles through
  spellingCombo: 0,       // P3 게임화 — 오늘 쓰기시험 연속 "첫 시도 정답" 수. 첫 시도 오답이면 0으로 리셋, 자정에 round와 함께 리셋. 기존 저장 레코드엔 없을 수 있으므로 읽을 땐 항상 (|| 0)로 방어
  // 별 지급 단일 경로(Single Reward Flow, 2026-07-28,
  // docs/fixes/star-reward-single-flow-design.md) — grantReward()가 실제로
  // totalStars를 늘린 모든 dedupKey를 기록하는 로그. pronunciationOkWordIds와
  // 같은 정신(문자열 dedup 배열)이지만 발음 하나에 국한되지 않고 grantReward를
  // 거치는 모든 이벤트(발음/미션클리어/콤보보너스/일일미션보너스/게임정답 등)가
  // 공유한다. round와 함께 자정에 리셋되므로, "영구히 다시 지급되면 안 되는"
  // 이벤트(예: 미션 클리어)의 진짜 방어는 이 로그가 아니라 그 이벤트 자체의
  // 영구 상태(missions[].done/cleared 등)가 맡는다 — 이 로그는 "같은 tick/같은
  // 세션 안에서의 우발적 중복 호출"을 막는 2차 안전망 역할.
  starGrantLog: [],
  // Phase 2 M4a(2026-08-04, 관측 배선) — 영구 completedWords(M3, 멱등)를
  // XP/미션 판정에 그대로 쓰면 "유닛을 한 바퀴 돈 뒤 복습하는 날"에는
  // 이미 완료 표시된 단어라 다시 append되지 않아 그날 XP/미션 슬롯이 0이
  // 되는 회귀가 생긴다(복습일 함정). wordsViewed와 정확히 같은 성격의
  // 일별(자정 리셋) dedup 카운터를 completedWords와 별도로 둬서, 향후
  // "오늘 학습완료 수"를 보상 판정에 연결해야 할 때 이 축을 쓴다 — 이번
  // 마일스톤에서는 어떤 보상 판정도 이 필드를 읽지 않는다(순수 관측 배선).
  completedToday: [],
})
const freshHistoryDay = () => ({
  studied: true,
  categoriesCompleted: 0, // 0-4: how many of today's 4 mission categories reached goal — THE single "완료한 미션" number shown everywhere
  giftsToday: 0,          // how many full 4/4 rounds were completed today (missions repeat all day) — internal bookkeeping only, never shown as "완료한 미션"
  starsEarned: 0,
  stickersEarned: [],
  gamesPlayed: {},        // gameId -> play count today, e.g. { balloon: 2, fishing: 1 }
  quizCorrect: 0,         // v1.3 admin analytics — every quiz answer, right or wrong (see recordQuizAnswer)
  quizTotal: 0,
  pronunciationAttempts: 0, // every pronunciation recording attempt, success or fail (see markPronunciationAttempt)
  missedWordIds: [],      // wordIds answered wrong today (duplicates allowed — frequency = how often missed)
  spellingCorrect: 0,     // spelling test analytics — first-try correct count
  spellingTotal: 0,       // spelling test analytics — total first attempts
  // Phase 2 M4d(2026-08-05, 관측 배선) — measurement-m4d-gate-2026-08-05
  // 측정에서 round.completedToday(자정 리셋)의 "그날 최종 개수"가 어디에도
  // 영구 저장되지 않아 daily-mission-complete 전환 게이트를 과거 데이터로
  // 소급 측정할 수 없다고(NOT_MEASURABLE) 확인됐다 — 이 필드는 그 관측
  // 공백을 메우는 순수 스냅샷이다. categoriesCompleted와 동일한 패턴(그날
  // 안에서는 절대 감소하지 않는 high-water mark, 자정마다 새 history[date]
  // 엔트리와 함께 0에서 다시 시작)으로 유지되며, 자정 롤오버 훅이 아니라
  // completedToday가 바뀔 때마다(useEffect, 아래 categoriesCompleted
  // high-water 로직 바로 옆) 즉시 기록한다 — 자정 훅에만 의존하면 그날
  // 이후로 앱을 다시 열지 않은 학생의 스냅샷이 영영 유실된다(정확히
  // measurement-m4d-gate가 실측한 f8e50877 사례). 아직 어떤 보상 판정/
  // XP/UI도 이 필드를 읽지 않는다(다음 측정 세션이 student_progress를 통해
  // 읽을 예정) — 순수 관측 배선.
  completedTodayCount: 0,
  // P5(복습/숙달 보상 강화, 2026-09-03) — 오답노트 회복(wrong-word-recovered,
  // 레거시 앵커, 하루 반복 가능) 성공 횟수. spellingCorrect와 동일 성격
  // (flag와 무관하게 항상 카운트되는 순수 관측, 그날 자정 리셋) — 지급
  // 자체(review-session-bonus, 3회 임계)만 masteryReward flag로 게이팅한다.
  recoveredToday: 0,
})

// id는 이제 실제 Supabase students.id(UUID) — 예전엔 이름 문자열이 그대로
// 들어가서 필드 이름(studentId)과 실제 값(이름)이 어긋나 있었다(P0 진단
// 기록 참고). 지금은 이름 그대로 정확하다.
function freshRecord(id) {
  return {
    studentId: id,
    totalStars: 0,
    stickers: [],          // owned sticker ids — badges (star/streak milestones) are just specific sticker ids granted via a guaranteed (non-gacha) path, tracked in this same collection rather than a separate list
    diaryPlacements: [],
    // v2.2 다중 기기 병합 — 삭제된 다이어리 배치 id의 tombstone. 이 레코드에서
    // 유일하게 "삭제"가 일어나는 영속 데이터가 diaryPlacements라서(스티커/
    // cleared/미션/히스토리는 전부 추가만 됨), 합집합 병합이 다른 기기/백업에
    // 남아있던 삭제된 스티커를 계속 부활시키는 걸 막으려면 삭제 사실 자체를
    // 기록해야 한다. removePlacement가 추가하고 mergeProgressRecords가 양쪽
    // 합집합에서 빼는 데만 쓴다. 상한(DIARY_TOMBSTONE_CAP)으로 무한 성장 방지.
    diaryRemovedIds: [],
    // Ticket Economy(2026-07-19) — append-only 원장(diaryPlacements와 같은
    // 패턴, tombstone은 불필요 — 소비도 새 항목 추가로 표현되므로 삭제가
    // 없음). 잔액은 저장하지 않고 항상 sumTicketBalance(ticketLedger)로
    // 파생시킨다(ticketEconomy.js 참고).
    ticketLedger: [],
    // Reward System V1(2026-08-15) — 별개 append-only 원장(ticketLedger와
    // 동일 정신, tombstone 불필요 — 지급만 있고 삭제/소비는 없음). 잔액이
    // 아니라 "이 idempotency_key로 이미 지급했는가"의 진실 원천으로만
    // 쓰인다 — totalStars 자체는 여전히 grantReward(위)가 유일하게 늘리고,
    // 이 원장에서 재계산하지 않는다(rewardEngine.js 헤더 주석과 동일 판단).
    rewardLedger: [],
    missions: [],          // level-up boss missions
    cleared: [],
    // Phase 2 M3(2026-08-03, 학습 신호 2종) — 아래 두 필드는 기존
    // cleared(레벨업 미션 3연속 정답 클리어 — 모자/유닛완주/마을/성장앨범
    // 밀스톤이 읽는 훨씬 엄격한 의미)와 완전히 별개다. cleared의 의미·쓰기
    // 지점(answerMission)은 이 마일스톤에서 한 줄도 바꾸지 않는다 — 새 신호는
    // 병행 도입되는 신규 필드일 뿐(스키마 변경 0, 둘 다 word 텍스트 슬러그
    // 축, wordLibrary.js mapWordRow의 id: wordSlug(cw.word)와 동일).
    //   completedWords — GuidedSession 본 코스에서 그 단어의 필수 학습
    //     단계(WordDetail STEPS)를 전부 통과한 순간 기록. "학습 진행률" 축.
    //     중간 이탈(홈으로 나가기 등)은 기록하지 않음(goNext가 마지막
    //     스텝을 실제로 넘어갈 때만 markWordCompleted 호출, 아래 참고).
    //   clearedWords — 퀴즈를 한 번이라도 맞히면(첫 시도/재시도 무관) 기록.
    //     "실력 판단" 축. recordQuizAnswer(모든 퀴즈 정답 경로의 단일
    //     choke point — WordDetail.QuizStep/GuidedSession 재시도/QuizGame이
    //     전부 이 함수를 거친다)가 정답일 때만 markWordCleared를 부른다.
    // 둘 다 markWordCompleted/markWordCleared로만 추가되고 멱등(이미 있으면
    // no-op) — 보상 판정(모자/완주/밀스톤)은 이번 마일스톤에서 이 축을
    // 전혀 쓰지 않는다(표시 전용 파생값만 attachmentCore.js에 추가, M4에서
    // 별도 결정).
    completedWords: [],
    clearedWords: [],
    round: freshRound(),
    history: {},            // date string -> freshHistoryDay()
    milestoneStreak: 0,      // highest streak milestone already celebrated
    starBadgeThreshold: 0,   // highest star badge already granted
    lastGamePlayed: null,
    // v2.9(2026-07-21, decision 0004 다중 교재) — 2개 이상 교재가 배정된
    // 학생이 마지막으로 선택했던 교재의 classId. 서버(students.class_id,
    // student_class_assignments.is_primary)가 이미 "주 교재"를 권위 있게
    // 기억하므로 이 값은 그 서버 값을 대체하지 않는다 — App.jsx의 교재
    // 선택기가 배정 목록이 아직 로드되지 않은 첫 렌더 순간에도 즉시 올바른
    // 값을 하이라이트할 수 있도록 하는 클라이언트 측 UX 캐시일 뿐(디자인
    // 요구사항: ticketLedger와 동일하게 로컬 진행도 블롭에 저장, 새 DB
    // 컬럼 없음). 배정이 1개뿐인 기존 111명 학생에게는 항상 null로 남고
    // 어떤 화면에도 영향 없음.
    lastTextbookClassId: null,
    lastWordIndex: 0,
    // v2.1 학생-Unit 분리 — 유닛별 "이어서 학습" 위치(unitId(UUID) -> index).
    // lastWordIndex(전역, 하위호환)는 계속 병행 기록: 구버전 레코드/백업과
    // 양방향 호환되고, 유닛 id를 모르는 상황의 폴백으로도 쓰인다. 진행도
    // (별/스티커/cleared/미션)는 원래 유닛 독립(word 슬러그/dbId 기준)이라
    // 여기 말고는 유닛 종속 필드가 없다 — 전환 시 아무것도 리셋되지 않는 근거.
    lastWordIndexByUnit: {},
    wordStatus: {},          // v1.5 Skip 기능 — word.dbId -> 'known' | 'unknown' | 'skipped' | 'mastered'
    // Writing MVP(2026-07-20, Project Paul Multi-Agent Framework 첫 구현) —
    // round.spellingWrongToday(오늘 하루치, 자정에 사라짐)와 별개로, 자정을
    // 넘겨도 안 지워지는 영구 복습 대기열. 새 항목은 실시간으로 안 쌓이고
    // "하루가 바뀌는 순간"(normalizeRecord 로드 시점 또는 30초 롤오버
    // interval)에 그날 못 끝낸 spellingWrongToday만 이월된다 — 그래서 이
    // 큐에 있는 단어는 전부 "적어도 하루 이상 전에 놓친" 단어라는 성질이
    // 보장된다(오늘 막 틀린 단어와 섞이지 않음, SpellingQuestion의
    // isComebackWord 배지가 이 성질에 기대어 판단함). 정답을 다시 맞히면
    // (일반 학습이든 복습화면이든) recordSpellingAnswer/clearSpellingReviewWord
    // 양쪽에서 제거. 스키마 변경 없음 — 기존 progress_data blob 안의 새
    // 최상위 필드일 뿐(stickers/ticketLedger와 동일 패턴).
    spellingReviewQueue: [],
    // 애착 시스템(2026-07-22) — 아래 3필드도 위와 동일 판단(새 DB 테이블/
    // 컬럼 없음, 진행도 블롭의 새 최상위 필드 — 티켓 원장과 같은 "코스메틱/
    // 저가치라 클라이언트 로컬 우선" 관례, 근거는 ticketEconomy.js 헤더와
    // DATABASE.md Ticket Economy 절 참고). 획득/달성 "판정"은 여기 없다 —
    // 전부 src/utils/attachment/의 순수 함수가 기존 필드에서 파생하고,
    // 여기는 판정 결과(이벤트)만 append-only로 보관한다.
    hatInventory: [],    // [{hatId, earnedAt(ISO), source}] — 모자는 한 번 얻으면 회수 없음
    equippedHatId: null, // 학생 아바타가 장착 중인 모자(코스메틱 표시 전용)
    milestones: [],      // [{id, type, at, backfilled, emoji, title, desc, data}] — 성장 앨범 이벤트
  }
}

// One-time migration from the old scattered paulEasyVoca_{name}_{field} keys
// into the unified record, so existing students' progress isn't lost. Old
// keys are left in place untouched (harmless, just unused going forward).
// P0(2026-07-15): the ancient scattered keys were always named by the login
// NAME (never changed), but the record we build now is stored under the
// resolved studentId — so this takes both: `name` to read the old keys,
// `id` for the new record's identity.
function migrateOldData(name, id) {
  const rec = freshRecord(id)
  rec.totalStars = readOld(oldKey(name, 'stars'), 0) || 0
  rec.stickers = readOld(oldKey(name, 'stickerTypes'), [])
  rec.diaryPlacements = readOld(oldKey(name, 'diaryPlacements'), [])
  rec.missions = readOld(oldKey(name, 'missions'), [])
  rec.cleared = readOld(oldKey(name, 'cleared'), [])
  const oldRound = readOld(oldKey(name, 'round'), null)
  if (oldRound && oldRound.date === todayStr()) rec.round = { spellingWrongToday: [], spellingCombo: 0, ...oldRound }
  const oldHistory = readOld(oldKey(name, 'history'), {})
  // Old history used `missionsCompleted` as a repeat counter — map it onto
  // the new fields as a best-effort guess (>=1 repeat implies all 4
  // categories were completed at least once that day).
  rec.history = Object.fromEntries(Object.entries(oldHistory).map(([date, day]) => [date, {
    studied: true,
    categoriesCompleted: (day.missionsCompleted || 0) > 0 ? 4 : 0,
    giftsToday: day.missionsCompleted || 0,
    starsEarned: day.starsEarned || 0,
    stickersEarned: day.stickersEarned || [],
    gamesPlayed: {},
    quizCorrect: 0,
    quizTotal: 0,
    pronunciationAttempts: 0,
    missedWordIds: [],
    spellingCorrect: 0,
    spellingTotal: 0,
    completedTodayCount: 0, // M4d — 구버전 기록엔 이 개념 자체가 없었음, 안전한 기본값
  }]))
  rec.milestoneStreak = readOld(oldKey(name, 'milestoneStreak'), 0) || 0
  rec.starBadgeThreshold = readOld(oldKey(name, 'starBadgeThreshold'), 0) || 0
  rec.lastGamePlayed = readOld(oldKey(name, 'lastGamePlayed'), null)
  rec.lastWordIndex = readOld(oldKey(name, 'lastWordIndex'), 0) || 0
  return rec
}

// P0(2026-07-17) 로그인 직후 크래시 수정 — 외부에서 들어오는 record는
// 전부 이 함수를 통과시켜 freshRecord() 기본형과 merge한다. "외부"란:
//   1) 클라우드 백업 blob(student_progress.progress_data) — 옛 앱 버전이
//      업로드한 blob에는 나중에 추가된 필드가 없다. 실사고: 2026-07-07
//      쓰기시험 기능 이전 스키마의 round(spellingWrongToday 없음)가 blob에
//      남아 있으면, 복원 직후 App.jsx의 `spellingWrongToday.forEach(...)`가
//      TypeError로 앱 전체를 크래시시켰다. 크래시가 재동기화(2s 디바운스
//      sync)마저 막아서 blob이 영영 옛 스키마로 남는 악순환 — PIN 초기화/
//      재설정 후 재로그인하는 학생이 정확히 이 복원 경로를 탄다.
//   2) localStorage 파싱 결과 — 이름 키 시절(v1.6 이전) 저장된 레코드,
//      또는 옛 앱 버전이 저장한 id 키 레코드. 같은 이유로 필드가 빠져
//      있을 수 있다(v1.6 마이그레이션은 이름 키 레코드를 그대로 복사했다).
// round는 날짜가 오늘이 아니면 통째로 리셋한다 — 자정 롤오버 인터벌
// (30s 주기)과 정확히 같은 의미인데, 이걸 로드 시점에 하면 "지난 날짜
// round가 첫 30초 동안 오늘 진행도로 잘못 계산되는" 부수 버그도 함께
// 사라진다. 오늘 날짜 round는 진행값을 전부 보존하고 누락 필드만 채운다.
const asArray = (v) => (Array.isArray(v) ? v : [])
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
function normalizeRecord(raw, id) {
  const rec = { ...freshRecord(id), ...asObject(raw), studentId: id }
  rec.totalStars = Number(rec.totalStars) || 0
  rec.stickers = asArray(rec.stickers)
  rec.diaryPlacements = asArray(rec.diaryPlacements)
  rec.diaryRemovedIds = asArray(rec.diaryRemovedIds) // v2.2 이전 레코드/백업엔 없음 — 빈 배열로 채움
  rec.ticketLedger = asArray(rec.ticketLedger) // Ticket Economy 이전 레코드/백업엔 없음 — 빈 배열로 채움
  rec.rewardLedger = asArray(rec.rewardLedger) // Reward System V1 이전 레코드/백업엔 없음 — 빈 배열로 채움
  rec.missions = asArray(rec.missions)
  rec.cleared = asArray(rec.cleared)
  // Phase 2 M3 — 이전 레코드/백업엔 없음(새 필드) — 빈 배열로 채움, 절대 크래시 없음.
  rec.completedWords = asArray(rec.completedWords)
  rec.clearedWords = asArray(rec.clearedWords)
  rec.milestoneStreak = Number(rec.milestoneStreak) || 0
  rec.starBadgeThreshold = Number(rec.starBadgeThreshold) || 0
  rec.lastWordIndex = Number(rec.lastWordIndex) || 0
  rec.lastWordIndexByUnit = asObject(rec.lastWordIndexByUnit) // v2.1 이전 레코드/백업엔 없음 — 빈 객체로 채움
  rec.wordStatus = asObject(rec.wordStatus)
  rec.spellingReviewQueue = asArray(rec.spellingReviewQueue) // 기존 레코드/백업엔 없음 — 빈 배열로 채움
  // 애착 시스템(2026-07-22) — 이전 레코드/백업엔 없음. 배열/스칼라 방어 정규화.
  rec.hatInventory = asArray(rec.hatInventory)
  rec.milestones = asArray(rec.milestones)
  rec.equippedHatId = typeof rec.equippedHatId === 'string' ? rec.equippedHatId : null
  // v2.9 다중 교재 — 문자열이 아니면(옛 레코드에 필드 자체가 없어 undefined인
  // 경우 포함) null로 정규화. 서버 권위 값이 아니므로 잘못된 타입이 남아도
  // 위험하지 않지만(단순 UX 힌트), 다른 필드와 같은 방어 관례를 따른다.
  rec.lastTextbookClassId = typeof rec.lastTextbookClassId === 'string' ? rec.lastTextbookClassId : null
  const r = asObject(rec.round)
  if (r.date === todayStr()) {
    rec.round = { ...freshRound(), ...r, wordsViewed: asArray(r.wordsViewed), pronunciationOkWordIds: asArray(r.pronunciationOkWordIds), spellingWrongToday: asArray(r.spellingWrongToday), starGrantLog: asArray(r.starGrantLog), completedToday: asArray(r.completedToday) }
  } else {
    // 하루가 바뀌어 round가 리셋되기 직전 — 어제(또는 그 전) 못 끝낸
    // spellingWrongToday를 영구 복습 대기열로 이월(유실 방지, freshRecord()
    // 헤더 주석 참고).
    rec.spellingReviewQueue = unionList(rec.spellingReviewQueue, asArray(r.spellingWrongToday))
    rec.round = freshRound()
  }
  rec.history = Object.fromEntries(Object.entries(asObject(rec.history)).map(([date, day]) => {
    const d = { ...freshHistoryDay(), ...asObject(day) }
    d.stickersEarned = asArray(d.stickersEarned)
    d.missedWordIds = asArray(d.missedWordIds)
    d.gamesPlayed = asObject(d.gamesPlayed)
    return [date, d]
  }))
  return rec
}

// ── v2.2 (2026-07-17) 다중 기기 진행도 병합 ─────────────────────────────
// 문제(실유실 시나리오): 기존 동기화는 로컬 레코드로 클라우드 blob을 통째로
// 덮어썼다(last-writer-wins). 학생이 기기 A(별 50)→기기 B(복원 후 +10, 백업
// 60)→다시 A로 돌아오면, A의 레코드(별 50, B의 진행분 없음)가 백업 60을
// 덮어써 B의 진행분이 영구 유실됐다. restoreChecked(2026-07-10)는 "빈 로컬"
// 레이스만 막았고, "양쪽 다 데이터가 있는" 교차 사용은 못 막았다.
//
// 해결: 업로드 직전 클라우드 blob을 읽어(fetchProgressBackupStrict) 이
// 순수 함수로 병합한 결과만 업로드한다. 병합 원칙 = "파괴적 축소 방지":
// 어느 쪽에만 있는 데이터도 절대 사라지지 않는다. 필드 성질별 규칙:
//   · 집합(stickers/cleared/미션/다이어리 배치/히스토리 날짜/오늘 round의
//     wordsViewed·spellingWrongToday): 합집합. 같은 키 충돌 시 "더 진전된
//     쪽"(미션 done>correctCount, 히스토리 필드별 max), 동률이면 로컬 우선.
//   · 카운터(totalStars/starBadgeThreshold/milestoneStreak/lastWordIndex류):
//     공통 조상이 없어 정확한 합산이 불가능하므로 max(local, cloud) — 과소
//     지급(학생 진행분 증발)을 막는 게 1순위고, 이론상 가능한 약간의 과다
//     집계는 학생에게 유리한 방향이라 수용(교차 사용 자체가 드묾).
//   · wordStatus: 단어별 "더 진전된 상태" 우선(mastered>known>unknown>
//     skipped), 동률/판단불가 시 로컬 우선. 관리자용 정밀 데이터는 어차피
//     word_status 테이블(단어별 즉시 upsert)이 담당 — blob은 복원용 백업.
//   · round(오늘 세션): normalizeRecord가 오늘 아닌 round를 이미 리셋하므로
//     여기 도달하면 양쪽 다 "오늘" — 필드별 max/합집합(같은 날 기기를
//     바꿔도 오늘 미션 진행이 이어짐).
//   · diaryPlacements 삭제: tombstone(diaryRemovedIds) 합집합을 배치
//     합집합에서 뺀다 — 순수 합집합이면 삭제한 스티커가 병합 때마다
//     부활한다(이 레코드에서 유일하게 삭제가 존재하는 영속 필드).
// 알려진 한계(의도된 트레이드오프, handoff 참고): spellingWrongToday는
// tombstone이 없어 "복습 완료로 큐에서 뺀 단어"가 같은 날 재로그인 시
// 되살아날 수 있다(한 번 더 복습하게 될 뿐 — 무해). diaryPlacements의
// 위치/회전 수정 충돌은 로컬 우선(데이터 유실 아님, 위치만).
const WORD_STATUS_RANK = { mastered: 3, known: 2, unknown: 1, skipped: 0 }
const DIARY_TOMBSTONE_CAP = 300
const unionList = (a, b) => {
  const seen = new Set(a)
  const out = [...a]
  for (const v of b) if (!seen.has(v)) { seen.add(v); out.push(v) }
  return out
}
const maxNum = (a, b) => Math.max(Number(a) || 0, Number(b) || 0)
// Reward System V1(2026-08-15) — mergeTicketLedgers(ticketEconomy.js)와
// 정확히 같은 의미론(id 기준 대신 idempotency_key 기준 합집합, local
// 순서 우선). 별도 파일로 뽑지 않은 이유: rewardEngine.js는 완전 순수/
// import 0개 계약이 고정돼 있어(수정 금지) 이 병합 로직을 거기 추가할
// 수 없고, ticketEconomy.js의 함수를 재사용하지도 않는다(키 필드명이
// 다름 — id vs idempotency_key).
function mergeRewardLedgers(localLedger, cloudLedger) {
  const local = Array.isArray(localLedger) ? localLedger : []
  const cloud = Array.isArray(cloudLedger) ? cloudLedger : []
  const localKeys = new Set(local.map((e) => e && e.idempotency_key))
  return [...local, ...cloud.filter((e) => e && !localKeys.has(e.idempotency_key))]
}

function mergeHistoryDay(a, b) {
  const games = {}
  for (const k of new Set([...Object.keys(a.gamesPlayed), ...Object.keys(b.gamesPlayed)]))
    games[k] = maxNum(a.gamesPlayed[k], b.gamesPlayed[k])
  return {
    ...a,
    studied: Boolean(a.studied || b.studied),
    categoriesCompleted: maxNum(a.categoriesCompleted, b.categoriesCompleted),
    giftsToday: maxNum(a.giftsToday, b.giftsToday),
    starsEarned: maxNum(a.starsEarned, b.starsEarned),
    stickersEarned: unionList(a.stickersEarned, b.stickersEarned),
    gamesPlayed: games,
    quizCorrect: maxNum(a.quizCorrect, b.quizCorrect),
    quizTotal: maxNum(a.quizTotal, b.quizTotal),
    pronunciationAttempts: maxNum(a.pronunciationAttempts, b.pronunciationAttempts),
    // 빈도 목록(중복 허용) — 합치면 공통 조상 항목이 이중 계산되므로 더 긴 쪽
    missedWordIds: b.missedWordIds.length > a.missedWordIds.length ? b.missedWordIds : a.missedWordIds,
    spellingCorrect: maxNum(a.spellingCorrect, b.spellingCorrect),
    spellingTotal: maxNum(a.spellingTotal, b.spellingTotal),
    // M4d — categoriesCompleted와 동일한 성격(그날 안의 high-water mark)이라
    // 같은 규칙(max)으로 병합. maxNum 자체가 Number(...)||0 방어를 포함하므로
    // 구버전 blob(필드 없음, undefined)도 안전하게 0으로 취급된다.
    completedTodayCount: maxNum(a.completedTodayCount, b.completedTodayCount),
    // P5(2026-09-03) — completedTodayCount와 동일 규칙(그날 안의 high-water
    // mark, max 병합). maxNum 자체가 Number(...)||0 방어를 포함하므로 이
    // 필드가 없는 구버전 blob도 안전하게 0으로 취급된다.
    recoveredToday: maxNum(a.recoveredToday, b.recoveredToday),
  }
}

export function mergeProgressRecords(localRaw, cloudRaw, id) {
  const local = normalizeRecord(localRaw, id)
  if (!cloudRaw) return local
  const cloud = normalizeRecord(cloudRaw, id)

  // 다이어리: tombstone 합집합을 배치 합집합에서 제거(위 주석 참고).
  // 같은 placementId 충돌은 로컬 우선(placementId는 timestamp+random이라
  // 기기 간 충돌은 사실상 자기 자신 — 위치 수정은 로컬이 최신).
  const removed = unionList(local.diaryRemovedIds, cloud.diaryRemovedIds).slice(-DIARY_TOMBSTONE_CAP)
  const removedSet = new Set(removed)
  const localPlacementIds = new Set(local.diaryPlacements.map((p) => p.placementId))
  const diaryPlacements = [
    ...local.diaryPlacements,
    ...cloud.diaryPlacements.filter((p) => !localPlacementIds.has(p.placementId)),
  ].filter((p) => !removedSet.has(p.placementId))

  // 미션: wordId별 합집합, 더 진전된 쪽(done > correctCount, 동률 로컬)
  const missionsById = new Map()
  for (const m of [...cloud.missions, ...local.missions]) {
    const prev = missionsById.get(m.wordId)
    if (!prev) { missionsById.set(m.wordId, m); continue }
    const better = (m.done && !prev.done) ||
      (!!m.done === !!prev.done && (Number(m.correctCount) || 0) >= (Number(prev.correctCount) || 0))
    if (better) missionsById.set(m.wordId, m)
  }

  // 히스토리: 없는 날짜는 합치고, 같은 날짜는 필드별 max/합집합
  const history = {}
  for (const date of new Set([...Object.keys(local.history), ...Object.keys(cloud.history)])) {
    const a = local.history[date], b = cloud.history[date]
    history[date] = a && b ? mergeHistoryDay(a, b) : (a || b)
  }

  // wordStatus: 단어별 더 진전된 상태, 동률/알 수 없는 상태값은 로컬 우선
  const wordStatus = { ...cloud.wordStatus }
  for (const [wid, st] of Object.entries(local.wordStatus)) {
    const other = wordStatus[wid]
    if (other === undefined || (WORD_STATUS_RANK[st] ?? -1) >= (WORD_STATUS_RANK[other] ?? -1)) wordStatus[wid] = st
  }

  const lastWordIndexByUnit = {}
  for (const k of new Set([...Object.keys(local.lastWordIndexByUnit), ...Object.keys(cloud.lastWordIndexByUnit)]))
    lastWordIndexByUnit[k] = maxNum(local.lastWordIndexByUnit[k], cloud.lastWordIndexByUnit[k])

  return {
    ...local,
    totalStars: maxNum(local.totalStars, cloud.totalStars),
    stickers: unionList(local.stickers, cloud.stickers),
    diaryPlacements,
    diaryRemovedIds: removed,
    // Ticket Economy — id 기준 합집합(mergeTicketLedgers, diaryPlacements와
    // 같은 정신이지만 tombstone 불필요, ticketEconomy.js 헤더 참고).
    ticketLedger: mergeTicketLedgers(local.ticketLedger, cloud.ticketLedger),
    // Reward System V1 — ticketLedger와 동일 이유(위 mergeRewardLedgers 주석).
    rewardLedger: mergeRewardLedgers(local.rewardLedger, cloud.rewardLedger),
    missions: [...missionsById.values()],
    cleared: unionList(local.cleared, cloud.cleared),
    // Phase 2 M3 — wordsViewed/spellingReviewQueue와 동일한 이유로 합집합
    // (append-only, 삭제 없음 — 두 기기 각각에서 이미 기록된 신호가 병합
    // 후에도 유실되지 않도록).
    completedWords: unionList(local.completedWords, cloud.completedWords),
    clearedWords: unionList(local.clearedWords, cloud.clearedWords),
    round: {
      ...local.round,
      wordsViewed: unionList(local.round.wordsViewed, cloud.round.wordsViewed),
      examplesHeard: maxNum(local.round.examplesHeard, cloud.round.examplesHeard),
      quizSolved: maxNum(local.round.quizSolved, cloud.round.quizSolved),
      pronunciationOk: maxNum(local.round.pronunciationOk, cloud.round.pronunciationOk),
      // 두 기기 각각에서 서로 다른 단어로 이미 별을 받았을 수 있으므로
      // wordsViewed와 동일하게 합집합(둘 중 하나에만 있어도 "이미 받음"
      // 유지 — 병합 후 그 단어로 다시 별을 주면 안 되므로).
      pronunciationOkWordIds: unionList(local.round.pronunciationOkWordIds, cloud.round.pronunciationOkWordIds),
      spellingWrongToday: unionList(local.round.spellingWrongToday, cloud.round.spellingWrongToday),
      spellingCombo: maxNum(local.round.spellingCombo, cloud.round.spellingCombo),
      // grantReward dedupKey 로그도 wordsViewed/pronunciationOkWordIds와 동일한
      // 이유로 합집합 — 두 기기 각각에서 이미 지급된 이벤트가 병합 후 다시
      // 지급되지 않도록.
      starGrantLog: unionList(local.round.starGrantLog, cloud.round.starGrantLog),
      // Phase 2 M4a — completedToday도 wordsViewed와 동일한 이유로 합집합
      // (두 기기 각각에서 오늘 이미 완료 기록된 단어가 병합 후에도 유실되지
      // 않도록).
      completedToday: unionList(local.round.completedToday, cloud.round.completedToday),
    },
    history,
    milestoneStreak: maxNum(local.milestoneStreak, cloud.milestoneStreak),
    starBadgeThreshold: maxNum(local.starBadgeThreshold, cloud.starBadgeThreshold),
    lastGamePlayed: local.lastGamePlayed ?? cloud.lastGamePlayed,
    // v2.9 다중 교재 — lastGamePlayed와 같은 정신(단순 최신값 선호, 로컬
    // 우선 — 이 기기에서 방금 고른 교재가 다른 기기 백업보다 최신일 가능성이
    // 높다는 동일한 가정).
    lastTextbookClassId: local.lastTextbookClassId ?? cloud.lastTextbookClassId,
    lastWordIndex: maxNum(local.lastWordIndex, cloud.lastWordIndex),
    lastWordIndexByUnit,
    wordStatus,
    spellingReviewQueue: unionList(local.spellingReviewQueue, cloud.spellingReviewQueue),
    // 애착 시스템(2026-07-22) — 두 컬렉션 모두 append-only라 tombstone 불필요
    // (diaryPlacements와 달리 삭제가 없음). 키 기준 합집합, 같은 키면 더
    // 이른 획득/달성 시각을 보존한다(늦게 동기화된 기기가 "처음 얻은 날"을
    // 덮어쓰지 않게 — 성장 앨범의 날짜 정직성).
    hatInventory: mergeByKeyEarliest(local.hatInventory, cloud.hatInventory, (h) => h.hatId, (h) => h.earnedAt),
    milestones: mergeByKeyEarliest(local.milestones, cloud.milestones, (m) => m.id, (m) => m.at),
    // 장착 모자는 lastGamePlayed와 같은 정신(단순 최신 선호, 로컬 우선) —
    // 이 기기에서 방금 장착한 모자가 다른 기기 백업보다 최신일 가능성이 높다.
    equippedHatId: local.equippedHatId ?? cloud.equippedHatId,
  }
}

// 애착 시스템(2026-07-22) — 키 기준 합집합 + 같은 키는 더 이른 시각 우선.
// hatInventory/milestones 전용(위 mergeProgressRecords 참고).
function mergeByKeyEarliest(localArr, cloudArr, keyOf, atOf) {
  const byKey = new Map()
  for (const item of [...asArray(cloudArr), ...asArray(localArr)]) {
    const k = keyOf(item)
    if (!k) continue
    const prev = byKey.get(k)
    if (!prev) { byKey.set(k, item); continue }
    const a = new Date(atOf(item) || 0).getTime()
    const b = new Date(atOf(prev) || 0).getTime()
    if (a && (!b || a < b)) byKey.set(k, item)
  }
  return [...byKey.values()]
}

// P0(2026-08-12) 이름 키 소유권 가드 — 실사고 재현: 같은 기기에서 같은
// 표시이름("권교빈")으로 나중에 생긴 "다른" studentId(동명이인 신규 계정)가
// 로그인하면, 아래 loadRecord가 먼저 생긴 계정의 이름 키 레코드(별 119개)를
// 그대로 "물려받아" 마운트 즉시 그 값이 되고 2초 디바운스 동기화가 새 UUID로
// 클라우드에 업로드까지 해버린다(scripts/testStarDeltaOnEntry.mjs 시나리오
// ②로 재현 고정). 이름은 전역 유일 키가 아니므로(P0 identity 리팩터링의
// 원래 이유와 동일한 종류의 문제) "이 기기에서 이 이름 키를 누가 처음
// 정당하게 채택했는가"를 별도로 기록해, 그 뒤로는 다른 studentId가 같은
// 이름 키(또는 아래 migrateOldData가 읽는 더 오래된 흩어진 키)를 가로채지
// 못하게 막는다.
//   - 아직 아무도 채택한 적 없는 이름: 지금 이 studentId가 최초 채택자 —
//     허용하고 기록한다(기존 정상 마이그레이션 경로 그대로 — 새 기기에서
//     첫 로그인하는 기존 학생은 계속 정상 동작, testIdentityMigration.mjs
//     참고).
//   - 이미 이 studentId 본인이 채택자로 기록돼 있는 이름: 허용(자기 자신
//     재로그인).
//   - 이미 "다른" studentId가 채택자로 기록된 이름: 거부 — 이름 키를
//     채택하지 않고 아래 loadRecord가 freshRecord(id)로 시작하게 한다.
// legacyName은 항상 "이번 로그인이 실제로 성공한 이름"이라(useStudent 헤더
// 주석) — 이미 store[id]가 존재하는 경우(과거에 이미 정당하게 마이그레이션을
// 마친 기존 학생)도 "이 studentId가 이 이름의 정당한 소유자"라는 뜻이므로
// 함께 소급 기록한다. 이 패치 배포 이전에 이미 마이그레이션을 마친 학생도
// 다음 로그인 한 번으로 보호망에 들어온다(그 사이 같은 기기에 동명이인
// 신규 계정이 먼저 로그인하는 극히 드문 순서만 이 소급 기록으로 못 막는
// 잔여 리스크 — 아래 loadRecord 주석 참고).
const NAME_CLAIM_KEY = 'paul_easy_name_claims'
function loadNameClaims() {
  try {
    const v = JSON.parse(localStorage.getItem(NAME_CLAIM_KEY))
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}
  } catch { return {} }
}
function saveNameClaims(claims) {
  // saveStore와 같은 이유의 방어 — 기록 실패가 로그인 자체를 깨뜨리면 안 됨
  // (최악의 경우 다음 로그인에서 다시 시도될 뿐, 학습 데이터 아님).
  try { localStorage.setItem(NAME_CLAIM_KEY, JSON.stringify(claims)) } catch { /* 무시 */ }
}
function claimName(legacyName, id) {
  if (!legacyName) return true
  const claims = loadNameClaims()
  const owner = claims[legacyName]
  if (owner === id) return true
  if (owner === undefined) {
    claims[legacyName] = id
    saveNameClaims(claims)
    return true
  }
  return false // 이미 "다른" studentId가 이 이름을 채택함 — 가로채기 차단
}

// P0(2026-07-15) Phase 2 identity 마이그레이션 — lazy/on-demand, 로그인
// 시점에만 실행. 우선순위:
//   1) 이미 studentId 키로 저장된 레코드가 있으면 그대로 사용(이미 마이그
//      레이션됐거나, 애초에 새 방식으로 시작한 기기).
//   2) legacyName이 주어졌고(=이번 로그인이 실제로 그 이름으로 성공했다는
//      뜻, 모호함 없음) STORE_KEY 아래 그 이름 키로 저장된 통합 레코드가
//      있고, 위 claimName()이 이 studentId의 채택을 허용하면 studentId로
//      "복사"한다 — 원본 이름 키는 절대 지우지 않음(다른 기기/다른 세션이
//      아직 그 키를 참조 중일 수 있고, 안전 원칙상 기존 데이터 삭제는 금지).
//   3) 그것도 없으면(또는 claimName이 거부하면) 더 오래된 흩어진
//      paulEasyVoca_{name}_{field} 키에서 마이그레이션 시도 — 단, 이 경로도
//      claimName 허용 여부를 함께 따른다(같은 이름 가로채기 벡터).
//   4) legacyName조차 없거나 claimName이 거부했으면 완전히 새 레코드.
// 전역적으로 모든 이름 키를 훑어 자동 매칭하지 않는다 — 동명이인 상황에서
// "어느 이름 키가 이 학생 것인지" 알 방법이 없어 위험하기 때문(로그인
// 시점에 정확히 어느 학생인지 알고 있는 지금이 유일하게 안전한 시점).
function loadRecord(id, legacyName) {
  const store = loadStore()
  // claimName은 항상 먼저 호출한다(store[id] 존재 여부와 무관) — 이미 자기
  // 레코드를 가진 기존 학생의 소급 기록(위 헤더 주석)도 이 호출 한 번으로
  // 처리된다.
  const canClaimName = claimName(legacyName, id)
  // 모든 경로가 normalizeRecord를 통과한다(위 주석 참고) — 이미 id 키로
  // 저장된 레코드도 예외 없음: 옛 앱 버전이 저장했거나 과거 마이그레이션이
  // 그대로 복사해둔 옛 스키마 레코드가 지금도 남아있을 수 있다.
  const source = store[id]
    ? store[id]
    : legacyName && canClaimName && store[legacyName]
      ? store[legacyName] // 이름 키 → id 키 복사(원본 이름 키는 절대 삭제 안 함)
      : legacyName && canClaimName ? migrateOldData(legacyName, id) : freshRecord(id)
  const migrated = normalizeRecord(source, id)
  store[id] = migrated
  saveStore(store)
  return migrated
}

// Streak = consecutive days (walking back from today) with a fully
// completed mission (4/4 categories). If today has nothing yet, today
// isn't counted but doesn't zero out an existing streak either.
function calcStreak(history) {
  let streak = 0
  const d = new Date()
  if (!(history[d.toDateString()]?.categoriesCompleted >= 4)) d.setDate(d.getDate() - 1)
  while (history[d.toDateString()]?.categoriesCompleted >= 4) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// 0-4: how many of today's 4 mission categories (단어/예문/퀴즈/발음) are at
// or above GOAL right now — the single formula behind "완료한 미션",
// computed identically wherever it's needed (Dashboard, calendar, tests).
function countCategoriesCompleted(round) {
  return [
    round.wordsViewed.length >= GOAL,
    round.examplesHeard >= GOAL,
    round.quizSolved >= GOAL,
    (round.pronunciationOk || 0) >= GOAL,
  ].filter(Boolean).length
}

// "이 기기에 실제로 진행도가 있는가?" — 진짜 신규 학생과 "로컬스토리지가
// 비워져서 신규처럼 보이는" 학생을 구분할 수는 없지만(둘 다 이 함수 기준
// true), 어느 쪽이든 클라우드 백업을 확인해보는 게 안전하다 — 진짜
// 신규라면 백업도 없을 테니 조회만 하고 아무 일도 안 일어난다.
function isEmptyRecord(rec) {
  return rec.totalStars === 0 &&
    rec.stickers.length === 0 &&
    rec.missions.length === 0 &&
    rec.cleared.length === 0 &&
    rec.diaryPlacements.length === 0 &&
    Object.keys(rec.history).length === 0 &&
    Object.keys(rec.wordStatus || {}).length === 0
}

// P4 다이어리 레이어 순서(2026-07-16) — placement 배열의 순서 자체가 그리기
// 순서(뒤에 있을수록 위에 그려짐, DiaryPage가 배열 순서대로 렌더 + 동일
// z-index)라서, 새 필드 없이 배열 재정렬만으로 "앞으로/뒤로 보내기"를
// 구현한다. 저장 스키마가 기존과 완전히 동일하므로 기존 학생들의 다꾸
// 배치 데이터·클라우드 백업과 100% 하위호환. 한 번에 한 칸씩만 이동
// (dir: 'front' = 한 칸 앞으로/위로, 'back' = 한 칸 뒤로/아래로).
// 이동할 수 없으면(끝에 있거나 id 없음) 원본 배열을 그대로 반환.
export function movePlacementInList(list, placementId, dir) {
  const i = list.findIndex(p => p.placementId === placementId)
  const j = dir === 'front' ? i + 1 : i - 1
  if (i < 0 || j < 0 || j >= list.length) return list
  const arr = [...list]
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  return arr
}

// v2.1 — 현재 유닛의 이어서-학습 위치(pure, 테스트 가능). 우선순위:
//   ① 그 유닛의 저장 지점(lastWordIndexByUnit[unitId])
//   ② 유닛별 기록이 하나라도 있으면(=v2.1 이후 데이터) 처음 가보는 유닛은 0
//   ③ 아무 유닛별 기록이 없으면(구버전 데이터) 기존 전역 lastWordIndex 폴백
//      — 배포 직후 기존 학생의 "이어서 학습하기"가 끊기지 않는 하위호환.
// unitId를 모르면(캐시 미비/마이그레이션 전) 항상 ③.
export function resumeIndexForUnit(record, unitId) {
  const map = asObject(record?.lastWordIndexByUnit) // 배열 등 오염 값도 빈 객체 취급
  if (unitId && map[unitId] !== undefined) return Number(map[unitId]) || 0
  if (unitId && Object.keys(map).length > 0) return 0
  return Number(record?.lastWordIndex) || 0
}

// Pure helpers exported for testing (see scripts/testProgress.mjs) — no
// behavior change, just visibility into the same logic the hook uses.
export { freshRecord, freshRound, freshHistoryDay, migrateOldData, calcStreak, countCategoriesCompleted, todayStr, GOAL, isEmptyRecord, normalizeRecord, DIARY_TOMBSTONE_CAP }

// ── Session Reward Summary(P1, 2026-09-03) 정원 스냅샷 헬퍼 ────────────
// attachmentCore.deriveAttachmentStats의 gardenSet 공식(cleared ∪
// completedWords ∪ clearedWords, 실제로 학습한 서로 다른 단어 수)을 값만
// 그대로 재사용한다(전체 deriveAttachmentStats는 훨씬 무거운 파생값을
// 같이 계산하므로 여기서는 이 세 배열 합집합 크기만 필요, attachmentCore.js
// 수정 없음 — 재구현이 아니라 이미 문서화된 같은 공식을 그대로 씀).
function computeGardenPoints(clearedArr, completedArr, clearedWordArr) {
  return new Set([...(asArray(clearedArr)), ...(asArray(completedArr)), ...(asArray(clearedWordArr))]).size
}

// 세션(앱 실행 1회) 동안 보여준 요약 카드가 같은 원장 항목으로 다시
// 뜨지 않게 막는 새 dedup은 만들지 않는다 — grantLedgerReward의 기존
// hasRewardEntry(rewardLedger, key) 조기반환(945행 근방, 무변경)이 이미
// "이 rewardType+sourceId 조합은 하루/이벤트당 한 번만 이 함수 본문을
// 통과한다"를 보장하므로, 요약 생성 코드를 그 조기반환 "뒤"에만 두면
// 자동으로 idempotent하다(재지급 로직을 전혀 새로 만들지 않음).
// P4(유닛 완료 보상, 2026-09-03, docs/REWARD_LOOP_AUDIT_2026-09-03.md §14) —
// unit-complete도 "의미있는 학습 완료" 앵커다. sessionRewardSummary
// 플래그가 꺼져 있으면(오늘) grantLedgerReward 안의 게이팅이 이 목록
// 자체를 절대 안 읽으므로(위 if 문 참고) 동작에 영향이 없다.
const SESSION_COMPLETE_REWARD_TYPES = new Set(['word-session-complete', 'writing-complete', 'exam-complete', 'daily-goal-complete', 'unit-complete'])

// studentId: Supabase students.id(UUID) — 이 학생의 유일한 식별자, 모든
// 저장/동기화가 이걸로 이뤄진다. legacyName: 이번 로그인이 실제로 성공한
// "이름"(선택) — 이 기기에 그 이름 키로 저장된 예전 레코드가 있으면 딱
// 한 번 studentId로 복사해온다(loadRecord 참고). 새 계정으로 처음부터
// 로그인하는 경우 등 없어도 무방.
export function useStudent(studentId, legacyName) {
  const [record, _setRecord] = useState(() => loadRecord(studentId, legacyName))
  const handledRoundRef = useRef(null)
  // v2.3.1 — "오늘 이 카테고리를 이미 XP 신청했는가"(word-view/listening/
  // quiz-complete) 클라이언트측 1차 방어. 서버가 날짜 기간키로 최종
  // 중복지급을 막아주지만(진짜 권위), 라운드가 하루 여러 번 리셋·재완료돼도
  // (missions repeat all day) 매번 불필요한 네트워크 요청을 보내지 않도록
  // 여기서 먼저 걸러낸다 — ref라 리렌더와 무관하게 유지, 날짜가 바뀌면
  // 아래 effect가 스스로 초기화.
  const dailyCategoryXpFiredRef = useRef({ date: null, fired: new Set() })

  // Every mutation goes through here — one place that both updates React
  // state and persists the ENTIRE record back to the one unified key, so no
  // field can ever be written to a stale/partial place.
  const patch = useCallback((patchFn) => {
    _setRecord(prev => {
      const next = { ...prev, ...patchFn(prev) }
      const store = loadStore()
      store[studentId] = next
      saveStore(store)
      return next
    })
  }, [studentId])

  // 이 로그인(마운트) 시점에 로컬 기록이 비어있으면(진짜 신규이거나,
  // 기기가 초기화/교체됐거나) 딱 한 번 클라우드 백업을 확인해서 복구를
  // 시도한다 — 로컬에 이미 데이터가 있으면 절대 건드리지 않음(덮어쓰기
  // 위험 없음). AppInner는 학생이 바뀔 때마다 통째로 마운트/언마운트되므로
  // (App.jsx의 `!student` 분기 참고) 이 useEffect는 로그인마다 정확히
  // 한 번씩 실행된다.
  //
  // 2026-07-10 안정성 버그 수정: 아래 sync effect는 record가 바뀔 때마다
  // 2초 후 클라우드에 fullRecord를 업로드한다. 복구 대상 학생(로컬 비어
  // 있음)이 로그인한 순간에도 record는 여전히 "비어있는" freshRecord라서,
  // fetchFullProgress()가 (느린 네트워크/Supabase 콜드스타트 등으로) 2초
  // 보다 늦게 끝나면 sync effect가 먼저 발동해 "빈 기록"으로 그 학생의
  // 진짜 클라우드 백업을 덮어써버린다 — 이 기기의 로컬 복구는 그 후
  // 정상적으로 성공하지만, 클라우드 백업 자체가 조용히 파괴되어 이
  // 학생이 나중에 정말로 기기를 잃어버리면 복구가 불가능해진다.
  // restoreChecked로 sync effect를 게이팅해서, 복구가 필요 없는 학생은
  // (이미 로컬에 데이터 있음) 전혀 기다리지 않고, 복구가 필요한 학생은
  // "복구 시도가 끝날 때까지"(성공/실패/타임아웃 무관) sync를 미룬다.
  const [restoreChecked, setRestoreChecked] = useState(() => !isEmptyRecord(record))
  useEffect(() => {
    if (!isEmptyRecord(record)) {
      setRestoreChecked(true)
      // v2.2 병합 복원 — 로컬에 데이터가 있어도 클라우드 백업에 다른
      // 기기에서 쌓인 진행분이 더 있으면 병합해 로컬에도 반영한다(B에서
      // 얻은 별이 A 화면에도 보이도록). 화면을 막지 않는 백그라운드
      // fire-and-forget: 실패해도 로컬 무영향, 업로드 경로의 병합(doSync)이
      // 백업 유실은 별도로 이미 막고 있다. 병합 결과가 로컬과 완전히
      // 같으면 patch를 건너뛰어(no-op) 불필요한 재동기화를 만들지 않는다.
      let cancelledMergeRestore = false
      fetchFullProgress(studentId).then((backup) => {
        if (cancelledMergeRestore || !backup) return
        patch((prev) => {
          const merged = mergeProgressRecords(prev, backup, studentId)
          return JSON.stringify(merged) === JSON.stringify(prev) ? {} : merged
        })
      }).catch(() => {})
      return () => { cancelledMergeRestore = true }
    }
    let cancelled = false
    // 네트워크가 완전히 죽어도 동기화가 영구히 막히지 않도록 상한선.
    const timeout = setTimeout(() => { if (!cancelled) setRestoreChecked(true) }, 5000)
    fetchFullProgress(studentId).then((backup) => {
      if (cancelled || !backup) return
      // 백업 blob은 반드시 정규화 후 반영 — 옛 스키마 blob(필드 누락)이
      // 그대로 record가 되면 로그인 직후 렌더에서 크래시(normalizeRecord
      // 주석의 실사고 참고).
      patch((prev) => (isEmptyRecord(prev) ? normalizeRecord(backup, studentId) : {}))
    }).catch(() => {}).finally(() => {
      if (!cancelled) { clearTimeout(timeout); setRestoreChecked(true) }
    })
    return () => { cancelled = true; clearTimeout(timeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  const { round, history, stickers: stickerTypes, diaryPlacements, missions, cleared, completedWords, clearedWords, milestoneStreak, starBadgeThreshold, lastGamePlayed, lastTextbookClassId, lastWordIndex, totalStars: stars, wordStatus, ticketLedger, spellingReviewQueue, hatInventory, equippedHatId, milestones, rewardLedger } = record
  // Ticket Economy — 화면은 항상 이 파생값만 읽는다(원시 잔액을 저장하지
  // 않는 이유는 ticketEconomy.js 헤더 참고).
  const ticketBalance = sumTicketBalance(ticketLedger)
  // M4b Cleared Stars — 순수 파생값(저장하지 않음). clearedWords는 위
  // CLEARED_STAR_PER_WORD 주석에서 설명한 구조적 불변식(길이 = 유니크 개수)을
  // 가지므로 이 곱셈이 곧 "지금까지 클리어로 번 별"의 정확한 총합이다.
  // stars(=totalStars)는 절대 건드리지 않고, 화면 표시용 합산(starsDisplay)만
  // 새로 제공한다.
  const clearedStars = clearedWords.length * CLEARED_STAR_PER_WORD
  const starsDisplay = stars + clearedStars
  // Reward System V1 — 파생 전용(저장하지 않음), stars(=totalStars) 그대로
  // 사용(starsDisplay가 아님 — 레벨 판정은 실제 지급된 별 총량 기준).
  const rewardLevel = levelForStars(stars)
  const rewardStarsToNext = starsToNextLevel(stars)

  const [giftQueue, setGiftQueue] = useState([])

  // Mission round resets at midnight even mid-session (not just on reopen).
  // Writing MVP: 리셋 직전 그날 못 끝낸 spellingWrongToday를 spellingReviewQueue로
  // 이월(normalizeRecord의 로드 시점 롤오버와 동일 규칙 — 세션이 자정을
  // 넘겨 켜져 있는 드문 경우까지 커버).
  useEffect(() => {
    const check = () => {
      if (round.date !== todayStr()) {
        patch(prev => ({
          spellingReviewQueue: unionList(prev.spellingReviewQueue || [], prev.round.spellingWrongToday || []),
          round: freshRound(),
        }))
      }
    }
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [round.date, patch])

  const bumpHistory = useCallback((patchFn) => {
    const today = todayStr()
    patch(prev => {
      const day = prev.history[today] || freshHistoryDay()
      return { history: { ...prev.history, [today]: { ...day, ...patchFn(day) } } }
    })
  }, [patch])

  // ── 별 지급 단일 경로(Single Reward Flow, 2026-07-28) ──────────────────
  // docs/fixes/star-reward-single-flow-design.md 참고. 이 함수가 이 파일
  // (그리고 앱 전체)에서 totalStars를 바꾸는 유일한 지점이다 — 예전
  // addStars() 직접 호출 6곳(내부) + 2곳(QuizGame/MatchGameShell, raw
  // addStars를 prop으로 그대로 받아 호출)을 전부 이 함수로 대체했다.
  // dedupKey는 필수 — "왜/언제 이 지급이 일어나는지"를 호출자가 항상
  // 명시하게 강제해서, 다음에 새 호출부가 추가돼도 dedup을 깜빡할 방법이
  // 구조적으로 없게 한다.
  //
  // 왜 이렇게 짰는가(실사고 두 건의 공통 원인) — markPronunciationOk와
  // answerMission 둘 다 원래 "patch(prev => {...})의 updater 안에서만
  // 설정되는 지역 변수를, patch() 호출 직후 밖에서 읽어 별 지급 여부를
  // 판단"하는 패턴이었다. React는 그 updater를 patch() 호출과 같은 tick
  // 안에서 "이미 실행 완료했다"고 보장하지 않는다(실측: 실제 브라우저에서
  // markPronunciationOk가 이 패턴 때문에 발음 성공 시 별을 아예 0개
  // 지급하는 회귀를 냈다 — scripts/fakeReact.mjs 스텁 하네스는 setState
  // 업데이터를 더 관대하게(동기적으로 가깝게) 처리해서 이 회귀를 못
  // 잡았다). 그래서 이 함수는:
  //   1) "이미 지급했는가"를 이 렌더의 클로저에서 이미 알 수 있는 값
  //      (round.starGrantLog, 또는 호출자가 patch() 호출 전에 이미
  //      동기적으로 계산해 넘긴 값)으로만 판단한다 — patch() 호출 뒤에
  //      그 결과를 다시 읽지 않는다.
  //   2) patch()의 updater 안에서도 prev.round.starGrantLog를 한 번 더
  //      확인한다 — React 함수형 updater는 같은 tick에 여러 번 큐잉돼도
  //      항상 그 시점까지 누적된 최신 prev를 받으므로(이게 React state
  //      updater의 실제 보장 사항), 이 함수가 같은 tick에 같은 dedupKey로
  //      여러 번 불려도(예: 더블탭/중복 이벤트) 정확히 한 번만 지급되는
  //      진짜 안전망은 바로 이 안쪽 확인이다. 바깥(1번)은 흔한 경우(같은
  //      렌더에서 "이미 지난 날/이전 이벤트로 이미 받았다"는 걸 아는 경우)
  //      불필요한 patch() 호출을 피하는 최적화일 뿐, 정확성은 여기 담보.
  // 반환값(true=이번 호출이 실제로 지급을 발생시켰다고 판단)은 호출 시점
  // 클로저 스냅샷 기준 낙관적 값이라 UI 피드백 등 참고용으로만 쓸 것 —
  // 위 1번과 같은 이유로 극히 드문 "같은 tick 연속 호출" 상황에서는 실제
  // 지급 여부와 어긋날 수 있다(지급 자체의 정확성은 2번이 담보하지,
  // 반환값이 지급 여부를 좌우하는 게이트가 아니다).
  const grantReward = useCallback((amount, dedupKey) => {
    if (!dedupKey) {
      console.warn('[grantReward] dedupKey 없이 호출됨 — 지급 거부(호출부 버그)')
      return false
    }
    if (round.starGrantLog.includes(dedupKey)) return false
    const today = todayStr()
    patch(prev => {
      if (prev.round.starGrantLog.includes(dedupKey)) return {}
      const day = prev.history[today] || freshHistoryDay()
      return {
        totalStars: prev.totalStars + amount,
        round: { ...prev.round, starGrantLog: [...prev.round.starGrantLog, dedupKey] },
        history: { ...prev.history, [today]: { ...day, starsEarned: day.starsEarned + amount } },
      }
    })
    return true
  }, [patch, round.starGrantLog])

  // ── Reward System V1(2026-08-15, Phase 2) — rewardEngine.js 규칙을
  // grantReward(위, 별 지급 단일 경로) 위에 얹는 유일한 지급 함수. "언제
  // 몇 별"인지는 전혀 재구현하지 않는다(REWARD_STARS/rewardIdempotencyKey
  // 그대로 사용, rewardEngine.js 헤더 주석). 이중 방어 구조:
  //   1) hasRewardEntry(record.rewardLedger, key) — 이 렌더 클로저 기준
  //      사전 체크. record.rewardLedger가 이미 그 key를 가지고 있으면
  //      patch()조차 호출하지 않는다(불필요한 재렌더 회피 + 피드백/레벨업
  //      판정을 중복 발생시키지 않기 위한 최적화) — grantReward 헤더 주석의
  //      "1번"과 정확히 같은 성격(참고용 최적화, 정확성의 최종 담보는 아님).
  //   2) appendRewardEntry가 patch()의 updater "안"에서 prev.rewardLedger를
  //      다시 검사(idempotency_key 기준) — 같은 tick에 우발적으로 여러 번
  //      불려도 원장에는 정확히 한 번만 append된다.
  //   3) grantReward(rewardStars, key) — 같은 key를 grantReward의
  //      dedupKey로 그대로 재사용해 round.starGrantLog가 totalStars 증가
  //      자체의 최종 방어를 담당(2차 방어, grantReward 헤더 주석과 동일
  //      구조). 즉 rewardLedger append와 totalStars 증가가 서로 다른 두
  //      저장소에 나뉘어 있어도 항상 "둘 다 되거나 둘 다 안 되거나"에
  //      가깝게 움직인다(완전한 원자성은 아니지만, 같은 key를 공유하므로
  //      독립적으로 어긋날 여지가 구조적으로 없다).
  // totalStars 자체는 절대 rewardLedger에서 재계산하지 않는다(운영자 결정
  // — 레거시 별 보존, rewardEngine.js earnedStars()는 여기서 쓰지 않음).
  // 레벨업 판정은 "이 호출 직전 record.totalStars"(클로저 stars) 기준
  // before/after를 순수 계산만으로 비교한다 — grantReward처럼 patch() 이후
  // 상태를 다시 읽지 않는다(같은 이유, 위 grantReward 헤더 주석 참고).
  const rewardFeedbackIdRef = useRef(0)
  const [rewardFeedback, setRewardFeedback] = useState([])
  const dismissRewardFeedback = useCallback((id) => {
    setRewardFeedback((q) => q.filter((f) => f.id !== id))
  }, [])
  // Session Reward Summary(P1, 2026-09-03) — "세션 시작 시점" 정원 성장치
  // 스냅샷. useRef의 초기값 인자는 최초 렌더 1번만 쓰이므로(React 보장),
  // 이 값은 이 훅이 이 studentId로 처음 마운트됐을 때의 cleared/
  // completedWords/clearedWords(로컬 우선 로드, loadRecord 결과)를 그대로
  // 담는다 — 이후 재렌더에도 다시 계산되지 않는다(의도된 "세션 시작"
  // 정의). 새 Supabase 컬럼/저장 없음(순수 파생값의 순간 스냅샷일 뿐).
  const sessionGardenSnapshotRef = useRef(computeGardenPoints(cleared, completedWords, clearedWords))
  const [sessionRewardSummary, setSessionRewardSummary] = useState(null)
  const dismissSessionRewardSummary = useCallback(() => setSessionRewardSummary(null), [])
  const grantLedgerReward = useCallback((rewardType, sourceType, sourceId, starsOverride, label, xpAmountHint) => {
    const key = rewardIdempotencyKey(studentId, rewardType, sourceType, sourceId)
    const rewardStars = (starsOverride === undefined || starsOverride === null)
      ? (REWARD_STARS[rewardType] || 0)
      : starsOverride
    if (rewardStars <= 0) return false
    if (hasRewardEntry(rewardLedger, key)) return false
    const entry = buildRewardEntry({
      studentId, rewardType, sourceType, sourceId, starsDelta: rewardStars, at: new Date().toISOString(),
    })
    patch((prev) => ({
      rewardLedger: appendRewardEntry(prev.rewardLedger || [], entry),
    }))
    grantReward(rewardStars, key)
    // 서버 원장(reward_ledger) 쓰기 — fire-and-forget(await 없음). 로컬
    // append + grantReward가 이미 위에서 끝났으므로, 이 호출이 실패해도
    // 학습 흐름/로컬 별 지급에는 전혀 영향이 없다(postRewardEvent 헤더
    // 주석 참고, postXpEvent와 동일 원칙 — CLAUDE.md 규칙 1).
    postRewardEvent(studentId, rewardType, sourceType, sourceId)
    const levelBefore = levelForStars(stars)
    const levelAfter = levelForStars(stars + rewardStars)
    rewardFeedbackIdRef.current += 1
    const feedbackId = `${key}:${rewardFeedbackIdRef.current}`
    setRewardFeedback((q) => [...q, { id: feedbackId, text: label || `⭐ +${rewardStars}` }])
    if (levelAfter.level > levelBefore.level) {
      rewardFeedbackIdRef.current += 1
      setRewardFeedback((q) => [...q, { id: `${feedbackId}:levelup`, text: 'Level Up! 🎉' }])
    }
    // Session Reward Summary(P1, 2026-09-03) — 플래그 OFF면 이 블록 전체가
    // 스킵되어(setSessionRewardSummary 호출 자체가 없음) sessionRewardSummary
    // 상태는 영원히 null, App.jsx는 그 상태로만 카드를 조건부 마운트하므로
    // 오늘과 완전히 동일하다. 위 hasRewardEntry 조기반환을 통과했을 때만
    // 이 지점에 도달하므로(같은 rewardType+sourceId 조합은 이 함수 본문을
    // 다시 통과하지 못함), 같은 세션 항목이 두 번째 카드를 만들 방법이
    // 없다 — 새 dedup을 추가한 게 아니라 기존 지급 단일 경로의 가드를
    // 그대로 재사용(CLAUDE.md 규칙 3). 4종 앵커(word-session-complete/
    // writing-complete/exam-complete/daily-goal-complete)만 대상 — 그 외
    // (streak-bonus/wrong-word-recovered)는 기존 RewardToast만 그대로 뜬다.
    if (isFeatureEnabled('sessionRewardSummary') && SESSION_COMPLETE_REWARD_TYPES.has(rewardType)) {
      const gardenRawNow = computeGardenPoints(cleared, completedWords, clearedWords)
      // 원시(raw) 정원 숫자만 넘긴다 — "정원 단계 변화량"으로의 변환은
      // 레이어 계약상 이 파일이 아니라 SessionRewardCard.jsx(컴포넌트,
      // attachment 폴더의 정원 단계 변환 함수 사용)가 담당(위 import 주석
      // 참고).
      const summary = buildSessionRewardSummary({
        entries: [entry],
        xpEvents: (typeof xpAmountHint === 'number' && xpAmountHint > 0) ? [xpAmountHint] : [],
        gardenRawBefore: sessionGardenSnapshotRef.current,
        gardenRawAfter: gardenRawNow,
        streak: calcStreak(history),
        totalStars: stars + rewardStars,
      })
      setSessionRewardSummary(summary)
    }
    return true
  }, [studentId, rewardLedger, patch, grantReward, stars, cleared, completedWords, clearedWords, history])

  // Paul Rank System(2026-07-19) XP 지급 — totalStars와 완전히 분리된
  // 원장(xp_ledger, 서버 전용 쓰기)에 독립적으로 쌓는다. eventType은
  // XP_EVENT_TABLE의 키와 정확히 일치해야 하고, 금액은 여기서 절대 계산/
  // 전송하지 않는다(서버 api/grant-xp.js가 XP_EVENT_TABLE에서 조회하는
  // 유일한 권위). fire-and-forget — postXpEvent가 이미 네트워크 실패를
  // 삼키므로 학습 흐름에 절대 영향 없음.
  const grantXp = useCallback((eventType, sourceEventId) => {
    // v2.3.1 — status:'planned'(예약만 된 미구현 이벤트, 예: word-king-
    // complete)까지 여기서 걸러낸다(단순 존재 체크가 아니라 resolveXpAmount
    // 로 status까지 확인) — 서버도 동일 테이블로 최종 거부하지만, 클라이언트
    // 단계에서 먼저 막으면 불필요한 네트워크 요청 자체가 안 나감.
    if (resolveXpAmount(eventType) === null) return
    postXpEvent(studentId, eventType, sourceEventId)
  }, [studentId])

  // Ticket Economy — Rewards 티켓 상점 구매(GAME_DESIGN.md 10번). 순수
  // redeemReward()가 잔액/소유 여부를 전부 확인하므로 여기서는 결과를
  // 그대로 record에 반영만 한다(answerMission/grantSticker와 같은 "patch
  // 안에서 결과를 만들고 클로저 변수로 즉시 반환"패턴 재사용). 실패해도
  // ledger/stickers 어느 쪽도 바뀌지 않는다(redeemReward가 ok:false일 때
  // 원본 ledger를 그대로 반환).
  const redeemTicketReward = useCallback((rewardId) => {
    let outcome = { ok: false, reason: 'unknown-reward' }
    patch(prev => {
      outcome = redeemReward(prev.ticketLedger, prev.stickers, rewardId)
      if (!outcome.ok) return {}
      return {
        ticketLedger: outcome.ledger,
        stickers: [...prev.stickers, outcome.reward.stickerId],
      }
    })
    return outcome
  }, [patch])

  // ── 애착 시스템(2026-07-22) — 모자/밀스톤 append-only 반영 API ──
  // 판정(어떤 모자를 얻는가)은 전부 src/utils/attachment/의 순수 함수가
  // 하고, 여기 세 함수는 그 결과 이벤트를 record에 멱등하게 붙이기만
  // 한다(redeemTicketReward와 같은 patch 패턴). 이미 있는 키는 무시 —
  // 어떤 경로로 중복 호출돼도 인벤토리/앨범이 부풀지 않는다.
  const grantHats = useCallback((events) => {
    patch(prev => {
      const owned = new Set(prev.hatInventory.map((h) => h.hatId))
      const fresh = (Array.isArray(events) ? events : []).filter((e) => e?.hatId && !owned.has(e.hatId))
      if (fresh.length === 0) return {}
      return { hatInventory: [...prev.hatInventory, ...fresh] }
    })
  }, [patch])

  const addMilestones = useCallback((events) => {
    patch(prev => {
      const seen = new Set(prev.milestones.map((m) => m.id))
      const fresh = (Array.isArray(events) ? events : []).filter((e) => e?.id && !seen.has(e.id))
      if (fresh.length === 0) return {}
      return { milestones: [...prev.milestones, ...fresh] }
    })
  }, [patch])

  // 장착: 인벤토리에 있는 모자만(코스메틱 표시 전용 — 검증은 UI 신뢰가
  // 아니라 여기서 최종). null이면 기본 아바타(👑)로 해제.
  const equipHat = useCallback((hatId) => {
    patch(prev => {
      if (hatId !== null && !prev.hatInventory.some((h) => h.hatId === hatId)) return {}
      return { equippedHatId: hatId }
    })
  }, [patch])

  // Phase 2 M3(2026-08-03) — 학습 신호 2종의 유일한 쓰기 지점. 둘 다
  // 멱등(이미 슬러그가 있으면 patch 자체를 건너뛰어 no-op) — 어떤 경로로
  // 중복 호출돼도(더블탭, 재시도 등) 배열이 부풀지 않는다. 기존
  // answerMission/cleared(레벨업 미션)와는 완전히 독립된 필드라 서로의
  // 쓰기를 절대 건드리지 않는다(freshRecord 헤더 주석 참고).
  // Phase 2 M4a(2026-08-04) — 영구 completedWords(기존 동작, 한 줄도 안
  // 바뀜)에 더해, round.completedToday(일별, wordsViewed와 동일한 자정
  // 리셋/dedup 성격)도 같은 patch에서 함께 멱등 append한다. 두 필드는
  // 서로 다른 배열이라 각자 독립적으로 dedup 판단(완료일에 이미 있어도
  // 오늘 처음이면 completedToday에는 추가됨 — 복습일 시나리오의 정확한
  // 의도). 보상 판정은 이번 마일스톤에서 이 필드를 전혀 읽지 않는다(순수
  // 관측 배선, freshRound 헤더 주석 참고).
  const markWordCompleted = useCallback((slug) => {
    if (!slug) return
    patch(prev => {
      const alreadyPermanent = prev.completedWords.includes(slug)
      const alreadyToday = prev.round.completedToday.includes(slug)
      if (alreadyPermanent && alreadyToday) return {}
      return {
        completedWords: alreadyPermanent ? prev.completedWords : [...prev.completedWords, slug],
        round: alreadyToday ? prev.round : { ...prev.round, completedToday: [...prev.round.completedToday, slug] },
      }
    })
  }, [patch])

  const markWordCleared = useCallback((slug) => {
    if (!slug) return
    patch(prev => prev.clearedWords.includes(slug) ? {} : { clearedWords: [...prev.clearedWords, slug] })
  }, [patch])

  const addMission = useCallback((wordId) => {
    patch(prev => ({
      missions: prev.missions.some(m => m.wordId === wordId)
        ? prev.missions
        : [...prev.missions, { wordId, correctCount: 0, done: false }],
    }))
  }, [patch])

  // 별 지급 단일 경로 마이그레이션(2026-07-28) — 이전엔 markPronunciationOk와
  // 정확히 같은 클래스의 버그가 있었다: `didClear`를 patch()의 updater
  // 안에서만 true로 설정하고 그 직후 밖에서 읽어 addStars(3) 호출 여부를
  // 판단했는데, React가 그 updater를 patch() 호출 시점에 "이미 실행
  // 완료했다"고 보장하지 않아 3번째 정답에서도 미션 클리어 별이 지급되지
  // 않을 수 있는 회귀 가능성이 구조적으로 존재했다(markPronunciationOk와
  // 동일 원인 클래스 — grantReward 헤더 주석 참고). 여기서는 판정
  // (willClear)을 patch() 호출 "전에" 이 렌더의 클로저(missions, 이미
  // 최신 record에서 destructure된 값)만으로 동기적으로 계산해서 그 문제를
  // 원천 차단한다. wordId별 재지급 방지 자체는 원래도(그리고 지금도)
  // missions[].done(영구, round처럼 자정에 리셋되지 않음)이 담당 —
  // grantReward의 dedupKey는 "같은 tick 안에서 이 함수가 우발적으로 두 번
  // 불려도" 대비하는 2차 안전망일 뿐(예: 빠른 연속 정답 제출).
  const answerMission = useCallback((wordId) => {
    const mission = missions.find(m => m.wordId === wordId)
    const willClear = !!mission && !mission.done && mission.correctCount + 1 >= 3
    patch(prev => ({
      missions: prev.missions.map(m => {
        if (m.wordId !== wordId || m.done) return m
        const next = m.correctCount + 1
        if (next >= 3) return { ...m, correctCount: 3, done: true }
        return { ...m, correctCount: next }
      }),
    }))
    if (willClear) {
      patch(prev => ({ cleared: prev.cleared.includes(wordId) ? prev.cleared : [...prev.cleared, wordId] }))
      grantReward(3, `mission-clear:${wordId}`)
      // v2.3.1 — 여기 있던 grantXp('mission-clear', `mission-clear:${wordId}`)
      // 를 제거했다. 이게 바로 운영자가 실측 발견한 "XP가 단어 단위로
      // 지급되는" 정확한 원인이었다 — wordId를 source_event_id로 써서
      // 학생이 (특히 오답으로 미션 큐에 들어간) 단어를 계속 넘길 때마다
      // XP가 단어 개수만큼 무한히 쌓였다(별 grantReward(3, ...)는 원래도
      // 단어별 지급이 의도였으므로 그대로 유지 — XP만 이 트리거에서 분리).
      // 레벨업 미션 클리어는 정의상 단어 단위 이벤트라 "행동(일별 카테고리
      // 완료)" 축으로 자연스럽게 변환할 방법이 없고, 운영자 지정 8개 XP
      // 이벤트 목록에도 포함되지 않아 XP 지급 트리거에서 완전히 제거하는
      // 쪽으로 판단했다(상세 근거: src/utils/paulRankShared.js
      // XP_EVENT_TABLE 헤더, wiki/decisions.md #10).
    }
    return willClear
  }, [patch, missions, grantReward])

  // v1.5 버그 수정: 예전엔 오늘 카테고리 하나(5개)를 다 채워야만
  // history[오늘]이 생겨서, 단어를 1~4개만 본 날은 대시보드도 캘린더도
  // "공부 기록 없음"으로 조용히 일치했다 — 사용자에겐 "홈엔 진행률이
  // 보이는데 캘린더는 비어있다"는 불일치처럼 보였다. 실제 학습 흐름에서
  // 가장 먼저 일어나는 이 액션(단어 화면 진입)에서 오늘 기록을 만들어두면
  // (studied:true, categoriesCompleted는 그대로 0) 캘린더 팝업이 정확한
  // "공부했어요! 0/4"를 보여주고, streak 계산(4/4 필요)에는 전혀 영향 없음.
  const markWordViewed = useCallback((wordId) => {
    patch(prev => prev.round.wordsViewed.includes(wordId)
      ? {}
      : { round: { ...prev.round, wordsViewed: [...prev.round.wordsViewed, wordId] } })
    bumpHistory(() => ({}))
  }, [patch, bumpHistory])

  const markExampleHeard = useCallback(() => {
    patch(prev => ({ round: { ...prev.round, examplesHeard: prev.round.examplesHeard + 1 } }))
  }, [patch])

  const markQuizSolved = useCallback(() => {
    patch(prev => ({ round: { ...prev.round, quizSolved: prev.round.quizSolved + 1 } }))
  }, [patch])

  // 별 중복 지급 방지(2026-07-27/28, docs/fixes/star-reward-single-flow-design.md,
  // Option A → 단일 grantReward 경로로 재마이그레이션) — wordId가
  // 주어지면(WordDetail/GuidedSession/QuizGame의 발음 연습 경로, 전부
  // word.dbId를 실어 보냄) "오늘 이 단어로 이미 발음 별을 받았는지"를
  // dedupKey(`pronunciation:${wordId}:${today}`)로 grantReward에 위임한다
  // — 뒤로가기 후 같은 단어를 다시 연습해도(연습 자체는 몇 번이든 계속
  // 가능, 학습 흐름 변경 없음) 별은 오늘 그 단어에 대해 한 번만 지급된다.
  // pronunciationOkWordIds는 countCategoriesCompleted가 쓰지 않으므로(그
  // 계산은 round.pronunciationOk 원시 카운터를 그대로 쓴다) 여기서는 순수
  // 표시/이력 목적으로만 유지 — 실제 지급 dedup은 grantReward의
  // starGrantLog가 담당(원래 이 배열이 dedup까지 겸했던 걸 단일 경로로
  // 이전, 배열 자체는 데이터 유실 없이 계속 채워짐 — 멀티기기 병합에도
  // 그대로 참여).
  // wordId가 없는 호출(예: word.dbId가 아직 배정되지 않은 단어)은 "이
  // 단어를 특정할 수 없다"는 뜻이라 dedup 자체가 불가능 — 매번 지급하는
  // 기존 레거시 동작을 그대로 유지(매번 고유 키를 생성해 grantReward를
  // 통과시킴, 무제한 반복 지급이 아니라 "이 특정 호출은 항상 새 이벤트로
  // 취급"이라는 뜻).
  const markPronunciationOk = useCallback((wordId) => {
    patch(prev => ({
      round: {
        ...prev.round,
        pronunciationOk: (prev.round.pronunciationOk || 0) + 1,
        pronunciationOkWordIds: (wordId != null && !prev.round.pronunciationOkWordIds.includes(wordId))
          ? [...prev.round.pronunciationOkWordIds, wordId]
          : prev.round.pronunciationOkWordIds,
      },
    }))
    if (wordId == null) {
      grantReward(1, `pronunciation-unidentified:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`)
      return
    }
    grantReward(1, `pronunciation:${wordId}:${todayStr()}`)
  }, [patch, grantReward])

  // Grants a sticker directly, bypassing the gift-box gacha (used for
  // guaranteed streak/star-badge rewards). Duplicates still convert to
  // stars so a guaranteed pull is never wasted either.
  const grantSticker = useCallback((sticker) => {
    const isDuplicate = stickerTypes.includes(sticker.id)
    if (isDuplicate) {
      // 별 지급 단일 경로(2026-07-28) — 뽑기 하나하나가 그 자체로 별개
      // 이벤트라(중복=이 뽑기의 결과일 뿐, "같은 이벤트의 재발생"이
      // 아님) dedupKey를 매 호출마다 새로 만들어(타임스탬프+랜덤,
      // diaryPlacements의 placementId와 동일한 패턴) grantReward가 항상
      // 지급하게 한다 — 여전히 단일 경로를 통과하되, 기존처럼 뽑을
      // 때마다 매번 지급되는 동작은 그대로 유지.
      grantReward(DUPLICATE_BONUS_STARS, `sticker-duplicate:${sticker.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`)
      // v2.3.1 — 여기 있던 grantXp('duplicate-sticker-bonus', ...)를
      // 제거했다. 운영자가 지정한 8개 XP 이벤트 목록에 없을 뿐 아니라,
      // 오늘의 미션(4/4)이 하루 여러 번 반복 완료될 수 있다는 기존 설계
      // (아래 daily-mission-complete 주석 참고) 때문에 이 트리거도
      // 무작위 키(randEventId)로 반복마다 별개 지급되는, mission-clear와
      // 같은 성격의 무제한 반복 지급 경로였다 — 별(grantReward) 지급은
      // 그대로 유지.
    } else {
      patch(prev => ({ stickers: [...prev.stickers, sticker.id] }))
      bumpHistory(day => ({ stickersEarned: [...day.stickersEarned, sticker.id] }))
    }
    return isDuplicate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickerTypes, grantReward, patch, bumpHistory])

  // Keeps today's "완료한 미션" (0-4 categories) as a running high-water
  // mark, independent of the round auto-resetting after a full completion —
  // this is the ONE value the Dashboard, calendar, and reward popup all read,
  // so they can never disagree about how many of today's 4 categories are done.
  useEffect(() => {
    const count = countCategoriesCompleted(round)
    const today = todayStr()
    const existing = history[today]?.categoriesCompleted || 0
    if (count > existing) bumpHistory(() => ({ categoriesCompleted: count }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  // Phase 2 M4d(2026-08-05, 관측 배선) — round.completedToday(자정 리셋,
  // M4a)의 "그날 최종 개수"를 history[오늘].completedTodayCount에
  // high-water mark로 스냅샷한다. 위 categoriesCompleted 효과와 정확히
  // 같은 패턴(round가 바뀔 때마다 확인, 더 커졌을 때만 기록 — 절대
  // 줄어들지 않음)을 completedToday 축에 그대로 적용한 것뿐이다. 자정
  // 롤오버 인터벌(위 round.date 체크 useEffect)에 의존하지 않는 이유:
  // round는 그 인터벌이 아니라 "다음에 이 학생이 앱을 여는 시점"에 리셋될
  // 수 있고(30초 주기 setInterval도 결국 세션이 열려 있어야만 동작),
  // 그러면 자정 시점 값이 아니라 재접속 시점 값을 스냅샷하게 돼 이미 지난
  // 하루치 값이 아예 사라진다(measurement-m4d-gate-2026-08-05가 실측한
  // f8e50877 사례 — 다음날 재접속 전 round가 이미 freshRound()로 리셋돼
  // 있었음). round가 바뀔 때마다(길이가 늘 때마다) 즉시 기록해두면 이
  // 유실 창이 아예 생기지 않는다 — 자정이 지나 새 history[date] 엔트리가
  // 열려도 이전 날짜의 엔트리는 bumpHistory가 건드리지 않으므로 그대로
  // 보존된다. 어떤 보상 판정/XP/UI도 이 필드를 아직 읽지 않는다(순수 관측
  // 배선 — freshHistoryDay 헤더 주석 참고).
  useEffect(() => {
    const count = round.completedToday.length
    const today = todayStr()
    const existing = history[today]?.completedTodayCount || 0
    if (count > existing) bumpHistory(() => ({ completedTodayCount: count }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  // v2.3.1 — Paul Rank XP, "그날 그 카테고리를 처음 완료한 순간" 단위(운영자
  // 지정 word-view-complete/listening-complete/quiz-complete). round의
  // 기존 카운터가 GOAL(5)에 처음 도달하는 순간에만 grantXp — "여러 단어를
  // 거쳐야 도달하는 일별 1회성 이벤트"라 단어 단위 파밍이 구조적으로 불가능
  // (mission-clear 사고와 질적으로 다름: source_event_id가 날짜만이라
  // 어떤 단어를 거쳤든 하루에 한 종류당 정확히 한 행만 만들어짐).
  // pronunciationOk(발음)는 이번 8개 이벤트 목록에 없어 그대로 daily-
  // mission-complete의 4/4 게이트에만 계속 기여(개별 XP 이벤트 없음) —
  // writing-complete는 발음이 아니라 쓰기시험(recordSpellingAnswer)에서
  // 별도로 트리거된다(아래 참고, paulRankShared.js 헤더에 판단 근거).
  // Phase 2 M4c(2026-08-04) — word-view-complete의 트리거만
  // round.wordsViewed(단순 열람)에서 round.completedToday(실제 "완료"
  // 판정, markWordCompleted가 쓰는 필드)로 교체했다. 이벤트 타입 이름
  // (word-view-complete)·XP 금액·source_event_id 형식(`${eventType}:${날짜}`,
  // 날짜 기간키)은 전부 동결 — grantXp 호출부/XP_EVENT_TABLE 어느 쪽도
  // 안 바뀌었으므로 서버(api/grant-xp.js) 재배포가 이 변경의 전제조건이
  // 아니다(프런트 배포만으로 안전 전환/롤백). 미션 슬롯 판정
  // (countCategoriesCompleted, 위 useEffect)은 이번 변경 범위 밖 — 여전히
  // round.wordsViewed 등 기존 필드를 그대로 읽는다.
  useEffect(() => {
    const today = todayStr()
    if (dailyCategoryXpFiredRef.current.date !== today) {
      dailyCategoryXpFiredRef.current = { date: today, fired: new Set() }
    }
    const fired = dailyCategoryXpFiredRef.current.fired
    const tryFire = (key, eventType) => {
      // Session Reward Summary(P1, 2026-09-03) — 반환값은 "이번 호출로
      // 실제 grantXp가 새로 발화됐는지"의 XP 금액(resolveXpAmount, 실제
      // 조회값)이다. 기존 XP 지급 판정(fired 셋, 무변경)에는 전혀 영향
      // 없음 — 호출부(아래)가 이 값을 grantLedgerReward의 xpAmountHint로
      // 넘겨 카드에 "+N XP"를 정확히 표시하는 데만 쓴다.
      if (fired.has(key)) return undefined
      fired.add(key)
      grantXp(eventType, `${eventType}:${today}`)
      return resolveXpAmount(eventType) ?? undefined
    }
    if (round.completedToday.length >= GOAL) {
      const xpFired = tryFire('word-view', 'word-view-complete')
      // Reward System V1 앵커(word-session-complete, +1) — tryFire의
      // dailyCategoryXpFiredRef(XP 전용 1차 방어)와는 완전히 독립된 별도
      // dedup(rewardLedger.idempotency_key, 날짜:${today} 키라 하루 1회).
      // tryFire "밖"에 둔 이유: tryFire는 XP 이벤트 이름/금액을 인자로
      // 받는 헬퍼일 뿐이라 별 지급 원장 항목을 만들 수 없다.
      grantLedgerReward('word-session-complete', 'daily-words', today, undefined, undefined, xpFired)
    }
    if (round.examplesHeard >= GOAL) tryFire('listening', 'listening-complete')
    if (round.quizSolved >= GOAL) tryFire('quiz', 'quiz-complete')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.completedToday.length, round.examplesHeard, round.quizSolved])

  // Full round completion: all 4 daily categories reached goal → open a
  // gift box (rarity-weighted random sticker, duplicates become bonus stars
  // instead of a second copy), award a flat completion bonus, log it in
  // today's history (feeds the diary calendar + streak), then immediately
  // start the next round — missions repeat all day, not once.
  useEffect(() => {
    const allDone = countCategoriesCompleted(round) >= 4
    if (!allDone) return
    // 2026-08-23 — signature가 이번 라운드를 실제로 식별하게 만든다.
    // 예전에는 `date:wordsViewed.length:examplesHeard:quizSolved:pronunciationOk`
    // 였는데 4/4 시점엔 항상 `date:5:5:5:5`라서 **하루의 모든 라운드가 같은
    // 값**이었다. 지급 직후 starGrantLog를 통째로 비우고 있었기 때문에 그
    // 충돌이 겉으로 드러나지 않았을 뿐이다(그게 곧 이 버그의 원인).
    // 이제 로그를 보존하므로, 라운드 구분은 "이번 라운드에 실제로 본 단어
    // 집합"이 담당한다 — 병합으로 되살아난 같은 라운드는 같은 단어 집합이라
    // 같은 값(차단), 새로 공부한 라운드는 다른 단어 집합이라 다른 값(지급).
    // handledRoundRef(마운트 내 가드)와 dedupKey(영속 가드)가 같은 값을 써야
    // 둘의 판정 범위가 어긋나지 않는다.
    const signature = `${round.date}:${[...round.wordsViewed].sort().join(',')}`
    if (handledRoundRef.current === signature) return
    handledRoundRef.current = signature

    // 별 지급 단일 경로(2026-07-28) — dedupKey는 의도적으로 signature
    // (라운드별 고유값, handledRoundRef가 원래 쓰던 것과 동일 granularity)
    // 를 그대로 쓴다. 아래 grantXp/grantTicket처럼 순수 날짜 키
    // (`daily-mission-bonus:${todayStr()}`)로 하면 별도 하루 한 번만
    // 지급되게 바뀌는데, 이 useEffect 헤더 주석과 바로 아래 XP 주석이 이미
    // 명시하듯 "별/스티커는 라운드가 반복될 때마다(missions repeat all
    // day) 매번 지급"이 기존에 검증된 의도된 게임 경제다(XP만 하루 1회로
    // 의도적으로 분리된 것 — v2.3.1 판단 근거는 바로 아래). signature 키는
    // handledRoundRef가 막던 것과 정확히 같은 범위(같은 라운드 반복 호출만
    // 차단, 새 라운드는 항상 재지급)라 기존 별 지급 빈도를 전혀 바꾸지
    // 않으면서 grantReward의 starGrantLog로도 구조적으로 안전해진다(순수
    // 구조 이전 — 규칙 1 "기존 플로우를 위험하게 하지 않는다"에 따라 날짜
    // 키로의 변경은 별도 운영자 승인 없이는 하지 않음).
    // 2026-08-23 — dedupKey가 라운드를 실제로 식별하게 만든다. 위 signature는
    // wordsViewed.length(항상 5)만 쓰므로 **모든 라운드가 같은 키**를 갖는다.
    // 예전엔 지급 직후 starGrantLog를 통째로 비워서 그 충돌이 드러나지
    // 않았을 뿐이다(그게 바로 이 버그의 원인). 로그를 보존하도록 고치면
    // 같은 키 때문에 정상적인 2번째 라운드까지 막히므로, 키에 "이번 라운드에
    // 실제로 본 단어들"을 넣어 라운드를 구분한다 — 병합으로 되살아난 같은
    // 라운드는 같은 단어 집합이라 같은 키(차단 ✅), 새로 공부한 라운드는
    // 다른 단어 집합이라 다른 키(정상 지급 ✅).
    // 알려진 한계: 같은 날 정확히 같은 5개 단어로 라운드를 다시 채우면
    // 보수적으로 차단된다(보상 누락 방향의 안전한 오차).
    const bonusGranted = grantReward(MISSION_BONUS_STARS, `daily-mission-bonus:${signature}`)
    // v2.3.1 — 이벤트 이름을 운영자 지정 8종 표준 이름(daily-mission-
    // complete)으로 재명명하면서, source_event_id도 signature(라운드별
    // 고유값) 대신 **날짜만**(day 기간키)으로 바꿨다. 별/스티커(grantReward/
    // grantSticker)는 여전히 라운드가 반복될 때마다(위 주석 "missions
    // repeat all day") 매번 지급되어 기존 게임 경험이 그대로지만, XP는
    // 오늘 첫 4/4 완료 1회만 지급된다 — 같은 날짜 키로 두 번째 요청부터는
    // 서버 unique 제약이 자연스럽게 막는다(예전 signature 방식은 반복
    // 완료마다 XP가 계속 쌓였는데, 이것도 "같은 행동 반복 시 XP 무한 획득"
    // 이 되므로 이번 리팩터링 범위에 포함해 함께 정리했다).
    grantXp('daily-mission-complete', `daily-mission-complete:${todayStr()}`)
    // Reward System V1 앵커(daily-goal-complete, +3) — 운영자 결정: 위
    // 레거시 MISSION_BONUS_STARS(+10, signature 키, 라운드 반복마다 매번
    // 재지급)는 이번 마일스톤에서 한 글자도 바꾸지 않고 그대로 유지한다.
    // 신규 원장 지급만 grantXp/grantTicket과 동일한 **날짜** 기간키를 써서
    // 하루 1회로 별도 제한 — 레거시 재지급 동작과 무관하게 공존한다(레거시
    // +10은 이 날짜 키 하루 제한과 별개로 라운드가 반복될 때마다 계속
    // 지급됨, 위 signature 키 주석 참고).
    // xpAmountHint: resolveXpAmount(순수 조회, 실제 조회값)를 그대로 넘긴다
    // — grantXp 호출 자체는 위처럼 라운드마다(하루 여러 번) 실행되지만,
    // 이 grantLedgerReward는 날짜 키로 하루 1회만 실제로 통과하므로(기존
    // hasRewardEntry 가드, 무변경) 힌트가 실제로 쓰이는 시점도 항상 그날
    // 첫 통과와 일치한다(Session Reward Summary, P1, 2026-09-03).
    grantLedgerReward('daily-goal-complete', 'daily-goal', todayStr(), undefined, undefined, resolveXpAmount('daily-mission-complete') ?? undefined)
    // Ticket Economy(GAME_DESIGN.md 7번) — 같은 트리거에 병행 후킹만, 새
    // 트래킹 로직 없음. grantTicket이 `daily-mission-complete:${날짜}`를
    // id로 써서(위 grantXp와 동일한 day 기간키) idempotent하게 append하므로,
    // 이 useEffect가 하루 중 몇 번을 더 반복(missions repeat all day)해도
    // 오늘 첫 4/4 완료 1회만 티켓이 지급된다(XP 쪽 "오늘 이미 지급했는지"
    // 가드와 동일한 원리 재사용, ticketEconomy.js 참고).
    patch(prev => ({ ticketLedger: grantTicket(prev.ticketLedger, 'daily-mission-complete', todayStr()) }))
    // 2026-08-23 — 선물상자/스티커도 위 별 지급과 같은 판정에 묶는다.
    // 예전엔 grantReward의 dedup 밖에 있어서, 별이 차단된 재실행에서도
    // giftsToday가 계속 오르고 grantSticker가 매번 뽑혔다(중복 스티커면
    // +20별이 랜덤 dedupKey로 무제한 지급 — production 실측 이상분 180별).
    // bonusGranted가 false면 "이 라운드 보상은 이미 나갔다"는 뜻이므로
    // 선물상자도 나가지 않는 것이 맞다. 정상적인 새 라운드는 여전히
    // bonusGranted=true라 기존과 똑같이 선물상자를 받는다.
    if (bonusGranted) {
      bumpHistory(day => ({ giftsToday: day.giftsToday + 1 }))
      const sticker = getRandomSticker()
      const isDuplicate = grantSticker(sticker)
      setGiftQueue(q => [...q, { sticker, isDuplicate, isMilestone: false }])
    }
    // 2026-08-23 중복 지급 수정 — 예전엔 `round: freshRound()`로 통째로
    // 갈아끼웠는데, freshRound()의 starGrantLog가 []라서 바로 위
    // grantReward(MISSION_BONUS_STARS, `daily-mission-bonus:...`)가 방금
    // 기록한 dedup 키를 같은 tick에 지워버렸다. 이 이벤트에는 영구 상태
    // 가드가 없고(유일한 가드 handledRoundRef는 useRef라 재마운트마다
    // 초기화됨), 병합은 wordsViewed=unionList / examplesHeard·quizSolved·
    // pronunciationOk=maxNum이라 리셋된 카운터를 4/4로 되살린다 — 그래서
    // 새로고침/재로그인/탭 전환만으로 학습 액션 0개에 +10과 선물상자가
    // 재발했다(production 실측: 학생 16명 로그에 daily-mission-bonus 키
    // 0개, 권교빈 2026-07-23 선물상자 37개 vs 필요 퀴즈 185회 대비 실제
    // 20회, 이상 지급 570별).
    //
    // 카운터는 의도대로 리셋하되 dedup 기억만 이어받는다. 자정 롤오버는
    // 별도 경로(round.date !== todayStr() -> round: freshRound())가 담당하므로
    // 일별 초기화 동작은 전혀 바뀌지 않는다.
    patch(prev => ({ round: { ...freshRound(), starGrantLog: prev.round.starGrantLog } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  // Streak milestones (3/7/14/30 consecutive fully-completed days) —
  // checked whenever history changes, guarded by the highest milestone
  // already celebrated so it only fires once per threshold, ever.
  useEffect(() => {
    const streak = calcStreak(history)
    const nextMilestone = STREAK_MILESTONES.find(m => streak >= m && m > milestoneStreak)
    if (!nextMilestone) return
    patch(() => ({ milestoneStreak: nextMilestone }))
    const sticker = getMilestoneSticker()
    const isDuplicate = grantSticker(sticker)
    setGiftQueue(q => [...q, { sticker, isDuplicate, isMilestone: true, streakDays: nextMilestone }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  // Reward System V1 — streak-bonus(가변 금액, rewardEngine.streakBonusStars).
  // 위 STREAK_MILESTONES(3/7/14/30, 스티커 전용) 효과와 완전히 별개 —
  // milestoneStreak/스티커 지급 로직은 한 글자도 건드리지 않는다. 날짜:
  // 연속일수 조합 키라 streak 값 자체가 바뀌지 않는 한(=오늘 이미 지급한
  // 연속일수 그대로인 한) 재지급되지 않는다.
  useEffect(() => {
    const streak = calcStreak(history)
    const bonus = streakBonusStars(streak)
    if (bonus > 0) grantLedgerReward('streak-bonus', 'streak', `${todayStr()}:${streak}`, bonus, `🔥 ${streak}일 연속! ⭐ +${bonus}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  // Star-count badges (100/300/500/1000⭐) — same guaranteed-once pattern as
  // streak milestones, just gated by total stars instead of days.
  useEffect(() => {
    const nextBadge = STAR_BADGES.find(b => stars >= b.threshold && b.threshold > starBadgeThreshold)
    if (!nextBadge) return
    patch(() => ({ starBadgeThreshold: nextBadge.threshold }))
    const sticker = STICKERS.find(s => s.id === nextBadge.stickerId)
    if (!sticker) return
    const isDuplicate = grantSticker(sticker)
    setGiftQueue(q => [...q, { sticker, isDuplicate, isBadge: true, badgeThreshold: nextBadge.threshold }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars])

  const dismissGift = useCallback(() => setGiftQueue(q => q.slice(1)), [])

  const placeSticker = useCallback((stickerId, x, y) => {
    patch(prev => ({
      diaryPlacements: [...prev.diaryPlacements, {
        placementId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        stickerId, x, y, rotation: 0, scale: 1,
      }],
    }))
  }, [patch])

  const updatePlacement = useCallback((placementId, patchFields) => {
    patch(prev => ({
      diaryPlacements: prev.diaryPlacements.map(p => p.placementId === placementId ? { ...p, ...patchFields } : p),
    }))
  }, [patch])

  // v2.2: 삭제 시 tombstone(diaryRemovedIds)도 함께 기록 — 클라우드 백업/
  // 다른 기기와의 합집합 병합에서 삭제한 스티커가 부활하지 않도록
  // (mergeProgressRecords 주석 참고). 상한 초과 시 가장 오래된 것부터 버림.
  const removePlacement = useCallback((placementId) => {
    patch(prev => ({
      diaryPlacements: prev.diaryPlacements.filter(p => p.placementId !== placementId),
      diaryRemovedIds: [...(prev.diaryRemovedIds || []), placementId].slice(-DIARY_TOMBSTONE_CAP),
    }))
  }, [patch])

  // P4 레이어 순서 — movePlacementInList(위 pure helper) 참고. 이동 불가
  // 상황이면 아무 것도 저장하지 않음(불필요한 re-render/sync 방지).
  const movePlacementLayer = useCallback((placementId, dir) => {
    patch(prev => {
      const next = movePlacementInList(prev.diaryPlacements, placementId, dir)
      return next === prev.diaryPlacements ? {} : { diaryPlacements: next }
    })
  }, [patch])

  const setLastGamePlayed = useCallback((gameId) => patch(() => ({ lastGamePlayed: gameId })), [patch])

  // v2.9(decision 0004) — App.jsx의 교재 선택기가 setPrimaryAssignment 성공
  // 직후 호출해 "마지막으로 쓴 교재"를 로컬에 기억(요구사항 5, 새 DB 컬럼
  // 없음). 서버(students.class_id/is_primary)가 이미 권위 있는 값이라
  // 이 setter 실패/미호출이 기능을 깨뜨리지 않는다 — 다음 로그인 시 첫
  // 렌더 하이라이트용 힌트일 뿐.
  const setLastTextbookClassId = useCallback((classId) => patch(() => ({ lastTextbookClassId: classId })), [patch])

  // Logs one play of a mini-game into today's history (calendar "게임 결과
  // 히스토리") — separate from setLastGamePlayed, which only tracks the most
  // recent game for the no-repeat rotation, not a per-day count.
  const recordGamePlayed = useCallback((gameId) => {
    bumpHistory(day => ({
      gamesPlayed: { ...(day.gamesPlayed || {}), [gameId]: (day.gamesPlayed?.[gameId] || 0) + 1 },
    }))
  }, [bumpHistory])

  // v1.3 admin-dashboard analytics — deliberately separate from
  // markQuizSolved (which only fires on a CORRECT answer and drives the
  // existing mission/round logic, unchanged). This fires on every answer,
  // right or wrong, purely for the "퀴즈 정답률"/"많이 틀린 단어" admin view.
  const recordQuizAnswer = useCallback((wordId, correct) => {
    bumpHistory(day => ({
      quizTotal: (day.quizTotal || 0) + 1,
      quizCorrect: (day.quizCorrect || 0) + (correct ? 1 : 0),
      missedWordIds: correct ? (day.missedWordIds || []) : [...(day.missedWordIds || []), wordId],
    }))
    // Phase 2 M3 — recordQuizAnswer는 퀴즈 정답 경로 3곳(WordDetail.QuizStep
    // 본 코스, GuidedSession 오답 재시도, QuizGame 홈 퀴즈) 전부가 이미
    // 공유하는 단일 choke point(App.jsx가 세 화면 모두 studentData.
    // recordQuizAnswer를 그대로 꽂아 쓴다) — clearedWords 기록을 이 안에
    // 얹으면 세 경로 각각에 별도 배선을 추가할 필요가 없다. 첫 시도든
    // 재시도든 무관, "한 번이라도 맞히면"이 정의라 correct일 때만 호출.
    if (correct) markWordCleared(wordId)
  }, [bumpHistory, markWordCleared])

  // v1.3 admin-dashboard analytics ("발음 연습 횟수") — every attempted
  // recording, success or fail. Separate from markPronunciationOk, which
  // only fires on success and still drives the star/mission logic unchanged.
  const markPronunciationAttempt = useCallback(() => {
    bumpHistory(day => ({ pronunciationAttempts: (day.pronunciationAttempts || 0) + 1 }))
  }, [bumpHistory])

  // 쓰기 시험(Spelling Test) — 정답률 통계는 history(오늘 하루 누적)에,
  // 오답노트 큐는 round(오늘 하루치, 자정에 초기화)에 따로 둠. 큐는
  // "오늘 학습이 끝나면 자동 복습" 화면이 그대로 순회할 목록이라 굳이
  // history에 겹쳐 넣지 않고 round 쪽에만 둠 — 두 값 모두 자정 리셋
  // 타이밍이 같아서 항상 같은 날짜 범위를 가리킴.
  // P3 게임화 추가(2026-07-16): 위 통계/오답노트 로직은 그대로 두고,
  // 연속 "첫 시도 정답" 콤보만 얹었다 — 이 함수는 SpellingQuestion의
  // reportedRef 덕에 문제당 정확히 첫 시도에만 불리므로, 호출 횟수 =
  // 첫 시도 수라는 성질을 그대로 콤보 카운트에 쓴다. 콤보가 마일스톤
  // (3/5/10)에 도달하는 그 순간에만 grantReward(별 지급 단일 경로)로
  // 보너스를 준다. round.spellingCombo는 기존 저장 데이터에 없을 수
  // 있어 항상 (|| 0)로 읽는다(하위호환 — freshRound 주석 참고).
  // v2.3.1 — 예전엔 여기서 콤보 마일스톤(3/5/10)마다 grantXp('spelling-
  // combo-N', `spelling-combo-N:날짜:wordId`)를 호출했다. source_event_id
  // 에 wordId가 들어가 있어, 같은 날 서로 다른 단어에서 콤보가 반복
  // 도달할 때마다 별개 지급이 가능했다(운영자가 이 지점도 함께 의심
  // 지목). 콤보 별 보너스(grantReward)는 그대로 유지하되, XP는 운영자 지정
  // 'writing-complete' 이벤트로 교체 — "오늘 쓰기시험 카테고리를 처음
  // 완료한 순간"(history.spellingCorrect가 오늘 처음 GOAL에 도달하는
  // 순간, 다른 3개 카테고리(word-view/listening/quiz)와 동일한 day
  // 기간키 패턴) 단위로만 지급한다 — 몇 번째 단어/몇 번째 콤보에서
  // 도달했는지는 더 이상 지급 여부에 영향을 주지 않는다.
  // ── P5 "복습/숙달 보상 강화"(2026-09-03, docs/REWARD_LOOP_AUDIT_2026-09-03.md
  // §4·14, flag masteryReward) ────────────────────────────────────────
  // 기존 wrong-word-recovered(레거시, 하루 반복 가능, 무변경)가 실제로 새
  // 원장 항목을 만든 순간에만(=호출부가 grantLedgerReward의 반환값 true를
  // 확인한 뒤) 불린다 — 새 dedup을 만들지 않고 기존 hasRewardEntry 조기
  // 반환을 그대로 재사용한다(CLAUDE.md 규칙 3, sessionRewardSummary와
  // 동일한 설계 원칙).
  //   1) recoveredToday(freshHistoryDay, 위)는 flag와 무관하게 항상 증가
  //      (spellingCorrect와 동일 성격의 순수 관측 카운터).
  //   2) word-mastered(+1, 평생 1회) — flag ON일 때만, 회복될 때마다 매번
  //      호출하되 sourceId가 wordId뿐(날짜 없음)이라 실제 지급은
  //      grantLedgerReward 내부 hasRewardEntry가 평생 1회로 자동 제한한다
  //      (day2에 같은 단어가 다시 회복돼도 word-mastered는 재지급되지 않음).
  //   3) review-session-bonus(+2, 하루 1회) — recoveredToday가 이번 호출로
  //      "2 -> 3"을 처음 넘는 순간에만, flag ON일 때만 시도한다. sourceId가
  //      오늘 날짜뿐이라 하루 안에서 몇 번을 넘겨도(4/5회째) 재지급되지
  //      않는다(REWARD_SOURCE_RULES 'daily-review' 패턴 + 서버 일일상한 1).
  const grantMasteryRewards = useCallback((wordId) => {
    let justReachedThree = false
    bumpHistory((day) => {
      const prev = day.recoveredToday || 0
      const next = prev + 1
      if (prev < 3 && next >= 3) justReachedThree = true
      return { recoveredToday: next }
    })
    if (!isFeatureEnabled('masteryReward')) return
    if (wordId) {
      grantLedgerReward('word-mastered', 'spelling-review-mastery', String(wordId), undefined, '🧠 다시 익혔어요')
    }
    if (justReachedThree) {
      grantLedgerReward('review-session-bonus', 'daily-review', todayStr(), undefined, '🔁 복습 보너스')
    }
  }, [bumpHistory, grantLedgerReward])

  const recordSpellingAnswer = useCallback((wordId, correct) => {
    let justCompletedWriting = false
    bumpHistory(day => {
      const prevCorrect = day.spellingCorrect || 0
      const nextCorrect = prevCorrect + (correct ? 1 : 0)
      if (prevCorrect < GOAL && nextCorrect >= GOAL) justCompletedWriting = true
      return {
        spellingTotal: (day.spellingTotal || 0) + 1,
        spellingCorrect: nextCorrect,
      }
    })
    if (justCompletedWriting) {
      grantXp('writing-complete', `writing-complete:${todayStr()}`)
      // Reward System V1 앵커(writing-complete, +2) — grantXp와 동일한
      // day 기간키(하루 1회), justCompletedWriting은 정의상 하루에 한
      // 번만 true가 되므로(prevCorrect가 GOAL을 넘으면 다시 false로
      // 내려가지 않음) 이 조건 안에서만 호출해도 안전하다.
      // xpAmountHint(Session Reward Summary, P1, 2026-09-03) — 이 if
      // 블록에 들어왔다는 것 자체가 justCompletedWriting(하루 정확히 1번)
      // 이라, 바로 위 grantXp 호출과 같은 tick에 항상 같이 발화된다.
      grantLedgerReward('writing-complete', 'daily-writing', todayStr(), undefined, undefined, resolveXpAmount('writing-complete') ?? undefined)
    }
    if (correct) {
      // 콤보/보너스를 같은 클로저 값에서 계산 — 표시되는 콤보 수와 실제
      // 지급된 보너스가 절대 어긋나지 않게. (쓰기 답안은 사람이 타이핑하는
      // 속도로만 들어오므로 stale closure가 실제로 문제될 간격이 아님.)
      const combo = (round.spellingCombo || 0) + 1
      // Reward System V1 앵커(wrong-word-recovered, +1) — patch() 호출
      // "전"(제거 전) 클로저 값(spellingReviewQueue, 위 destructure)으로
      // 판단해서, 아래 clearSpellingReviewWord와 정확히 같은 판단 시점을
      // 공유한다(둘 다 "제거 직전 상태" 기준). 날짜:wordId 키를 공유하므로
      // 어느 경로로 먼저 해소되든 정확히 한 번만 지급된다.
      const wasInReviewQueue = spellingReviewQueue.includes(wordId)
      patch(prev => ({
        round: { ...prev.round, spellingCombo: combo },
        // Writing MVP — 이 단어가 영구 복습 대기열에 있었다면(=적어도
        // 하루 전에 놓쳤던 단어) 이번 정답으로 해소됐으니 큐에서 뺀다.
        // isComebackWord 배지는 App.jsx가 렌더 시점에 미리 계산해서
        // 보여주므로(스냅샷), 여기서 별도 반환값을 만들 필요는 없다.
        spellingReviewQueue: prev.spellingReviewQueue.includes(wordId)
          ? prev.spellingReviewQueue.filter(id => id !== wordId)
          : prev.spellingReviewQueue,
      }))
      if (wasInReviewQueue) {
        const recoveredNew = grantLedgerReward('wrong-word-recovered', 'spelling-review', `${todayStr()}:${wordId}`)
        if (recoveredNew) grantMasteryRewards(wordId)
      }
      const bonus = spellingComboBonus(combo)
      if (bonus > 0) {
        // 별 지급 단일 경로(2026-07-28) — combo/wordId/날짜 조합 dedupKey:
        // 같은 날 다른 단어/다른 콤보값에서 마일스톤에 도달하면 각각 별개
        // 이벤트로 지급되고(의도된 반복 보상), 정확히 같은 wordId+combo+
        // 날짜 조합이 우발적으로 두 번 들어오는 경우에만(예: 같은 tick
        // 중복 호출) grantReward가 막는다. combo는 이미 위에서 이 렌더의
        // 클로저(round.spellingCombo)로부터 patch() 호출 전에 동기적으로
        // 계산됐으므로 안전.
        grantReward(bonus, `spelling-combo:${wordId}:${combo}:${todayStr()}`)
      }
    } else {
      patch(prev => ({
        round: {
          ...prev.round,
          spellingCombo: 0,
          spellingWrongToday: prev.round.spellingWrongToday.includes(wordId)
            ? prev.round.spellingWrongToday
            : [...prev.round.spellingWrongToday, wordId],
        },
      }))
    }
  }, [bumpHistory, patch, grantReward, round.spellingCombo, grantXp, grantLedgerReward, spellingReviewQueue, grantMasteryRewards])

  // 복습 화면에서 한 단어를 맞히면 오답노트 큐에서 제거 — 큐가 비면
  // "틀린 단어 복습"이 끝난 것. Writing MVP: 영구 복습 대기열
  // (spellingReviewQueue)에서도 함께 제거 — 복습 화면은 오늘치 큐와
  // 영구 큐를 합쳐서 보여주므로(App.jsx), 어느 쪽에서 온 단어든 여기서
  // 한 번에 정리된다.
  const clearSpellingReviewWord = useCallback((wordId) => {
    // Reward System V1 앵커(wrong-word-recovered, +1) — 제거 "전"(이
    // patch 호출 이전) 클로저 값을 기준으로만 판단한다. 이 화면 자체가
    // 오늘치 오답(spellingWrongToday)과 영구 복습 대기열(spellingReviewQueue)
    // 을 합쳐서 보여주므로, 둘 중 어느 쪽에 있었어도 "이번 호출로 회복
    // 됐다"고 본다. recordSpellingAnswer의 정답 경로와 날짜:wordId 키를
    // 공유해서 두 경로가 교차 호출돼도 정확히 한 번만 지급된다.
    if (spellingReviewQueue.includes(wordId) || round.spellingWrongToday.includes(wordId)) {
      const recoveredNew = grantLedgerReward('wrong-word-recovered', 'spelling-review', `${todayStr()}:${wordId}`)
      if (recoveredNew) grantMasteryRewards(wordId)
    }
    patch(prev => ({
      round: { ...prev.round, spellingWrongToday: prev.round.spellingWrongToday.filter(id => id !== wordId) },
      spellingReviewQueue: prev.spellingReviewQueue.includes(wordId)
        ? prev.spellingReviewQueue.filter(id => id !== wordId)
        : prev.spellingReviewQueue,
    }))
  }, [patch, spellingReviewQueue, round.spellingWrongToday, grantLedgerReward, grantMasteryRewards])

  // Reward System V1 앵커(exam-complete, +2) — EntranceTest.jsx가
  // submitEntranceResult() 성공(서버 저장 확정) 직후에만 호출한다(실패
  // 경로에서는 호출되지 않음, EntranceTest.jsx 주석 참고). testId별
  // idempotency_key라 같은 시험 재제출 시도(재시도 버튼)로 재지급되지
  // 않는다.
  const recordExamCompleted = useCallback((testId) => {
    if (!testId) return
    grantLedgerReward('exam-complete', 'entrance-test', String(testId))
  }, [grantLedgerReward])

  // Reward System V1 앵커(unit-complete, +5, P4 2026-09-03) — 유닛 하나를
  // 완주했을 때 학생당 unitId 1회 평생(sourceId에 날짜가 없음 —
  // rewardEngine.js REWARD_SOURCE_RULES 'unit-complete' 주석 참고). 호출부
  // (useAttachment.js의 전이 감지기)는 "새로 완료된 유닛"에만 이 함수를
  // 부르지만, 실제 중복지급 방지의 최종 담보는 언제나처럼
  // grantLedgerReward 안의 hasRewardEntry 조기반환이다(호출부가 실수로
  // 같은 unitId를 여러 번 넘겨도 안전). 반환값은 "이번 호출이 실제로 새
  // 원장 항목을 만들었는가"(grantLedgerReward의 반환값 그대로) — 호출부가
  // 참고용으로만 쓸 것(grantReward 헤더 주석과 동일한 낙관적 성질).
  const recordUnitCompleted = useCallback((unitId) => {
    if (!unitId) return false
    if (!isFeatureEnabled('unitCompleteReward')) return false
    return grantLedgerReward('unit-complete', 'unit', String(unitId), undefined, '📘 유닛 완료!')
  }, [grantLedgerReward])

  // v2.1: unitId(현재 유닛 UUID)를 같이 주면 유닛별 위치도 기록 — 다른
  // 유닛에 다녀와도 각 유닛의 "이어서 학습" 지점이 따로 보존된다. unitId가
  // 없으면(캐시 미비 등) 기존 전역 필드만 갱신(완전 하위호환).
  const setLastWordIndex = useCallback((idx, unitId) => patch((prev) => ({
    lastWordIndex: idx,
    ...(unitId ? { lastWordIndexByUnit: { ...prev.lastWordIndexByUnit, [unitId]: idx } } : {}),
  })), [patch])

  const getResumeIndexForUnit = useCallback(
    (unitId) => resumeIndexForUnit(record, unitId),
    [record]
  )

  // v1.5 "알아요"/"모르겠어요" (Skip 기능) — 로컬(즉시, 새로고침에도 안전)
  // 과 Supabase word_status 테이블(관리자 조회용) 둘 다에 반영한다. 로컬
  // 기록은 patch()가 항상 하던 대로 즉시 저장되고, Supabase 쪽은 기존
  // syncStudentProgress와 동일하게 실패해도 학습 흐름을 막지 않도록
  // fire-and-forget으로 던진다. wordDbId가 없으면(아직 감사/생성 중인
  // 단어 등) 조용히 무시 — 로컬 상태도 안 바뀜.
  const setWordKnownState = useCallback((wordDbId, status) => {
    if (!wordDbId) return
    patch((prev) => ({ wordStatus: { ...prev.wordStatus, [wordDbId]: status } }))
    markSyncAttempt(studentId, 'wordStatus')
    syncWordStatus(studentId, wordDbId, status)
      .then(() => markSyncSuccess(studentId, 'wordStatus'))
      .catch((err) => markSyncFailure(studentId, 'wordStatus', err))
  }, [patch, studentId])
  const setWordKnown = useCallback((wordDbId) => setWordKnownState(wordDbId, 'known'), [setWordKnownState])
  const setWordUnknown = useCallback((wordDbId) => setWordKnownState(wordDbId, 'unknown'), [setWordKnownState])

  const dailyProgress = {
    words:          Math.min(round.wordsViewed.length, GOAL),
    examples:       Math.min(round.examplesHeard, GOAL),
    quizzes:        Math.min(round.quizSolved, GOAL),
    pronunciations: Math.min(round.pronunciationOk || 0, GOAL),
  }
  const today = todayStr()
  const todayHistory = history[today]
  const missionsCompletedToday = todayHistory?.categoriesCompleted || 0 // 0-4, all-day high-water mark — never decreases once hit, used for streak/homework-done semantics. Do NOT use this for a "is the CURRENT round done" display (see liveMissionsCompleted below).
  const missionFullyDoneToday = missionsCompletedToday >= 4
  // 0-4, live count for the round in progress right now (resets to 0 when the
  // round auto-resets) — unlike missionsCompletedToday above, this is NOT a
  // high-water mark, so it correctly reflects "not done yet" after a fresh
  // round starts following an earlier full completion today. Only for
  // display of the CURRENT cycle's progress (e.g. Dashboard's "오늘 미션 N/4"
  // badge); do not use this for streak/homework-done logic, which must keep
  // using missionsCompletedToday.
  const liveMissionsCompleted = countCategoriesCompleted(round)
  const giftsToday = todayHistory?.giftsToday || 0 // how many full 4/4 rounds today — for "studied a lot" nudges only, never displayed as "완료한 미션"
  const todayStars = todayHistory?.starsEarned || 0
  const streak = calcStreak(history)

  // v1.3 admin dashboard — fire-and-forget sync to Supabase so the admin can
  // see a student's progress from a different device, WITHOUT changing how
  // progress is stored locally (localStorage stays the source of truth for
  // this student's own device; a sync failure here must never affect it).
  // Debounced 2s after the record settles so rapid successive updates (e.g.
  // a quiz streak) don't fire a network write per keystroke.
  // v1.4: also sends the full record as a cloud backup (fullRecord) — see
  // the restore-on-mount effect above and fetchFullProgress() in
  // wordLibrary.js. Same fire-and-forget/never-blocks guarantee.
  //
  // doSyncRef holds the LATEST sync closure (updated every render) so both
  // the debounce timer below and the visibility-flush effect always send
  // the current record, never a stale one from whichever render scheduled
  // them.
  //
  // v2.2 (2026-07-17) 다중 기기 병합 업로드 — last-writer-wins 유실 수정.
  // 업로드 직전 클라우드 blob을 읽어(fetchProgressBackupStrict, 쿼리 1회
  // 추가 — 2초 디바운스라 부하 미미) mergeProgressRecords로 병합한 결과만
  // 올린다. 로컬 레코드(localStorage/React state)는 여기서 절대 건드리지
  // 않는다 — 병합은 업로드 blob에만 적용(로컬 반영은 로그인 시 병합 복원
  // 경로가 담당, 위 restore effect 참고). 읽기 실패 시 업로드 자체를
  // 포기하고 markSyncFailure만 기록 — "클라우드 상태를 모르는 채로
  // 덮어쓰기"가 정확히 기존 유실 경로였고, 로컬 데이터는 그대로라 다음
  // 디바운스/visibility flush/재로그인에서 자연 재시도된다. 관리자 요약
  // 컬럼(total_stars 등)과 daily 값도 병합본 기준 — 백업 blob과 관리자
  // 대시보드 숫자가 항상 같은 레코드에서 나오도록.
  //
  // P1(2026-07-18) 영속성 감사 — "중복 요청" 시나리오에서 발견한 실유실
  // 경로 수정: 2초 디바운스 타이머가 연속으로 두 번(빠른 연타) 발동하면
  // doSync 호출 두 개가 동시에 진행 중일 수 있다. 각자 fetchProgressBackupStrict
  // (네트워크 read)를 기다리는데, 먼저 시작한 호출의 응답이 나중에 시작한
  // 호출의 응답보다 "늦게" 도착하면(느린 커넥션/재시도 등, 순서 보장 없음)
  // 오래된 호출이 자신의 stale local 스냅샷으로 병합한 결과를 나중에
  // upsert해 방금 성공한 최신 업로드를 덮어썼다 — Supabase upsert가
  // student_id 단일 row를 조건 없이 통째로 교체하기 때문에 낙관적 동시성
  // 체크가 없었음(재현: scripts/testMultiTabRace.mjs 시나리오 "중복
  // 업로드"). syncGenRef로 세대를 매겨, 자신이 네트워크 read를 마쳤을 때
  // 이미 더 새 doSync 호출이 시작돼 있으면(자신은 추월당함) 업로드를
  // 포기한다 — 더 새 호출의 local 스냅샷은 이 호출의 local보다 항상
  // 같거나 더 진행된 상태이므로(같은 탭의 연속 렌더, record는 patch로만
  // 누적) 그 호출이 알아서 이 변경분까지 포함해 업로드한다. 그 호출이
  // 실패하더라도 기존 동작과 동일(다음 patch/visibility/재로그인에서
  // 자연 재시도) — 새로 나빠지는 경로 없음.
  const doSyncRef = useRef(null)
  const syncGenRef = useRef(0)
  useEffect(() => {
    doSyncRef.current = async () => {
      const myGen = ++syncGenRef.current
      markSyncAttempt(studentId, 'progress')
      try {
        const backup = await fetchProgressBackupStrict(studentId)
        if (myGen !== syncGenRef.current) return // 추월당함 — 더 새 호출이 이어서 업로드
        const merged = mergeProgressRecords(record, backup, studentId)
        const day = merged.history[todayStr()]
        await syncStudentProgress(studentId, {
          totalStars: merged.totalStars,
          clearedCount: merged.cleared.length,
          streak: calcStreak(merged.history),
          stickersCount: merged.stickers.length,
          fullRecord: merged,
          daily: {
            categoriesCompleted: day?.categoriesCompleted || 0,
            starsEarned: day?.starsEarned || 0,
            quizCorrect: day?.quizCorrect || 0,
            quizTotal: day?.quizTotal || 0,
            pronunciationAttempts: day?.pronunciationAttempts || 0,
            missedWordIds: day?.missedWordIds || [],
          },
        })
        markSyncSuccess(studentId, 'progress')
      } catch (err) {
        markSyncFailure(studentId, 'progress', err)
      }
    }
  })

  // restoreChecked가 false인 동안은 절대 동기화하지 않는다 — 위 복구
  // effect의 레이스 컨디션 수정 참고.
  useEffect(() => {
    if (!restoreChecked) return
    const t = setTimeout(() => doSyncRef.current?.(), 2000)
    return () => clearTimeout(t)
  }, [studentId, record, restoreChecked])

  // 2026-07-10 안정성 보강: 지금까지는 2초 디바운스 타이머가 끝나기 전에
  // 학생이 탭을 닫거나 다른 앱으로 전환하면 그 마지막 변경분이 영영
  // 동기화되지 않을 수 있었다. visibilitychange(hidden)는 모바일에서
  // beforeunload보다 훨씬 안정적으로 발생하므로(홈 버튼/앱 전환/화면
  // 꺼짐 전부 포함), 탭이 숨겨지는 순간 대기 중인 동기화를 기다리지
  // 않고 즉시 flush한다.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && restoreChecked) doSyncRef.current?.()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [restoreChecked])

  return {
    // 로그인 직후 로딩 게이트(App.jsx) — 복원 확인이 끝나기 전에 Dashboard가
    // 복원 전 빈 record로 렌더되지 않도록. 로컬에 데이터가 있으면 처음부터
    // true(대기 0), 없으면 복원 성공/실패/5s 타임아웃 어느 쪽이든 끝나면 true.
    restoreChecked,
    stars, stickerTypes, diaryPlacements, missions,
    activeMissions: missions.filter(m => !m.done),
    cleared, round, dailyProgress,
    missionsCompletedToday, missionFullyDoneToday, liveMissionsCompleted, giftsToday, todayStars,
    history, streak,
    lastGamePlayed, setLastGamePlayed, recordGamePlayed,
    lastTextbookClassId, setLastTextbookClassId,
    recordQuizAnswer, markPronunciationAttempt,
    recordSpellingAnswer, clearSpellingReviewWord, spellingWrongToday: round.spellingWrongToday,
    spellingCombo: round.spellingCombo || 0,
    spellingReviewQueue, // Writing MVP(2026-07-20) — 자정을 넘겨도 유지되는 복습 대기열
    lastWordIndex, setLastWordIndex, getResumeIndexForUnit,
    pendingGift: giftQueue[0] || null, dismissGift,
    // 별 지급 단일 경로(2026-07-28, docs/fixes/star-reward-single-flow-design.md)
    // — grantReward가 totalStars를 바꾸는 유일한 공개 API. 예전 raw
    // addStars(가드 없는 단순 가산 primitive)는 더 이상 반환하지 않는다 —
    // App.jsx/QuizGame.jsx/MatchGameShell.jsx 등 어떤 화면도 이걸 직접
    // 호출해 dedup 없이 별을 늘릴 방법이 없다(모든 컴포넌트는 반드시
    // dedupKey를 명시해야 하는 grantReward를 통해서만 별을 지급받는다).
    grantReward, addMission, answerMission,
    markWordViewed, markExampleHeard, markQuizSolved, markPronunciationOk,
    // Phase 2 M3(2026-08-03) — 학습 신호 2종(completed/cleared). 기존
    // cleared(레벨업 미션, 위)와 완전히 별개 필드 — 표시/파생 전용
    // (attachmentCore.deriveAttachmentStats의 completedSet/clearedWordSet),
    // 보상 판정에는 이번 마일스톤에서 쓰이지 않는다.
    completedWords, clearedWords, markWordCompleted, markWordCleared,
    // M4b(2026-08-04) Cleared Stars — 파생 전용(저장 안 함), 위
    // CLEARED_STAR_PER_WORD 헤더 주석 참고. stars는 그대로 totalStars.
    clearedStars, starsDisplay,
    placeSticker, updatePlacement, removePlacement, movePlacementLayer,
    wordStatus, setWordKnown, setWordUnknown,
    // Ticket Economy(2026-07-19) — ticketBalance는 항상 ticketLedger에서
    // 파생된 값(sumTicketBalance), 절대 별도 저장하지 않는다.
    ticketBalance, ticketLedger, redeemTicketReward,
    // 애착 시스템(2026-07-22) — 모자 인벤토리/장착/성장 앨범. 판정은
    // src/utils/attachment/ 순수 함수, 여기는 append-only 반영만.
    hatInventory, equippedHatId, milestones,
    grantHats, addMilestones, equipHat,
    // Reward System V1(2026-08-15, Phase 2) — 원장/피드백/파생 표시값.
    // grantReward(별 지급 단일 경로) 위에 얹은 계층일 뿐, totalStars(stars)
    // 자체는 여전히 grantReward만 바꾼다(rewardLedger에서 재계산 안 함).
    rewardLedger, rewardFeedback, dismissRewardFeedback, recordExamCompleted,
    // P4(유닛 완료 보상, 2026-09-03) — useAttachment.js의 전이 감지기가
    // 새로 완료된 유닛에만 이 함수를 부른다. flag unitCompleteReward OFF면
    // 항상 false만 반환하고 어떤 상태도 바꾸지 않는다(recordUnitCompleted
    // 헤더 주석 참고).
    recordUnitCompleted,
    rewardLevel, rewardStarsToNext,
    // Session Reward Summary(P1 "즉각적인 보상 피드백", 2026-09-03) —
    // sessionRewardSummary(config/features.js) 플래그 OFF면 이 값은 영원히
    // null(grantLedgerReward 안의 게이팅 참고) — App.jsx가 이 값으로만
    // SessionRewardCard를 조건부 마운트하므로 플래그 OFF는 오늘과 바이트
    // 단위로 동일한 동작을 보장한다.
    sessionRewardSummary, dismissSessionRewardSummary,
  }
}
