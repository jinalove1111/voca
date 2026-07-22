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
import { syncStudentProgress, fetchFullProgress, fetchProgressBackupStrict, setWordStatus as syncWordStatus, postXpEvent } from '../utils/wordLibrary'
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
const STAR_BADGES = [
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
  spellingWrongToday: [], // wordIds missed at least once in a spelling test today (deduped) — the "오답노트" queue the end-of-day review cycles through
  spellingCombo: 0,       // P3 게임화 — 오늘 쓰기시험 연속 "첫 시도 정답" 수. 첫 시도 오답이면 0으로 리셋, 자정에 round와 함께 리셋. 기존 저장 레코드엔 없을 수 있으므로 읽을 땐 항상 (|| 0)로 방어
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
    missions: [],          // level-up boss missions
    cleared: [],
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
  rec.missions = asArray(rec.missions)
  rec.cleared = asArray(rec.cleared)
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
    rec.round = { ...freshRound(), ...r, wordsViewed: asArray(r.wordsViewed), spellingWrongToday: asArray(r.spellingWrongToday) }
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
    missions: [...missionsById.values()],
    cleared: unionList(local.cleared, cloud.cleared),
    round: {
      ...local.round,
      wordsViewed: unionList(local.round.wordsViewed, cloud.round.wordsViewed),
      examplesHeard: maxNum(local.round.examplesHeard, cloud.round.examplesHeard),
      quizSolved: maxNum(local.round.quizSolved, cloud.round.quizSolved),
      pronunciationOk: maxNum(local.round.pronunciationOk, cloud.round.pronunciationOk),
      spellingWrongToday: unionList(local.round.spellingWrongToday, cloud.round.spellingWrongToday),
      spellingCombo: maxNum(local.round.spellingCombo, cloud.round.spellingCombo),
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

// P0(2026-07-15) Phase 2 identity 마이그레이션 — lazy/on-demand, 로그인
// 시점에만 실행. 우선순위:
//   1) 이미 studentId 키로 저장된 레코드가 있으면 그대로 사용(이미 마이그
//      레이션됐거나, 애초에 새 방식으로 시작한 기기).
//   2) legacyName이 주어졌고(=이번 로그인이 실제로 그 이름으로 성공했다는
//      뜻, 모호함 없음) STORE_KEY 아래 그 이름 키로 저장된 통합 레코드가
//      있으면 studentId로 "복사"한다 — 원본 이름 키는 절대 지우지 않음
//      (다른 기기/다른 세션이 아직 그 키를 참조 중일 수 있고, 안전 원칙상
//      기존 데이터 삭제는 금지).
//   3) 그것도 없으면 더 오래된 흩어진 paulEasyVoca_{name}_{field} 키에서
//      마이그레이션(기존 migrateOldData 경로, id 부여만 다름).
//   4) legacyName조차 없으면(순수 신규 등록 — 처음부터 id로 로그인) 완전히
//      새 레코드.
// 전역적으로 모든 이름 키를 훑어 자동 매칭하지 않는다 — 동명이인 상황에서
// "어느 이름 키가 이 학생 것인지" 알 방법이 없어 위험하기 때문(로그인
// 시점에 정확히 어느 학생인지 알고 있는 지금이 유일하게 안전한 시점).
function loadRecord(id, legacyName) {
  const store = loadStore()
  // 모든 경로가 normalizeRecord를 통과한다(위 주석 참고) — 이미 id 키로
  // 저장된 레코드도 예외 없음: 옛 앱 버전이 저장했거나 과거 마이그레이션이
  // 그대로 복사해둔 옛 스키마 레코드가 지금도 남아있을 수 있다.
  const source = store[id]
    ? store[id]
    : legacyName && store[legacyName]
      ? store[legacyName] // 이름 키 → id 키 복사(원본 이름 키는 절대 삭제 안 함)
      : legacyName ? migrateOldData(legacyName, id) : freshRecord(id)
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

  const { round, history, stickers: stickerTypes, diaryPlacements, missions, cleared, milestoneStreak, starBadgeThreshold, lastGamePlayed, lastTextbookClassId, lastWordIndex, totalStars: stars, wordStatus, ticketLedger, spellingReviewQueue, hatInventory, equippedHatId, milestones } = record
  // Ticket Economy — 화면은 항상 이 파생값만 읽는다(원시 잔액을 저장하지
  // 않는 이유는 ticketEconomy.js 헤더 참고).
  const ticketBalance = sumTicketBalance(ticketLedger)

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

  // Every star gain (quiz, pronunciation, level-up mission, mission bonus,
  // duplicate sticker) funnels through here, so the daily history's
  // starsEarned total is always accurate without touching every call site.
  const addStars = useCallback((n = 1) => {
    patch(prev => ({ totalStars: prev.totalStars + n }))
    bumpHistory(day => ({ starsEarned: day.starsEarned + n }))
  }, [patch, bumpHistory])

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

  const addMission = useCallback((wordId) => {
    patch(prev => ({
      missions: prev.missions.some(m => m.wordId === wordId)
        ? prev.missions
        : [...prev.missions, { wordId, correctCount: 0, done: false }],
    }))
  }, [patch])

  const answerMission = useCallback((wordId) => {
    let didClear = false
    patch(prev => ({
      missions: prev.missions.map(m => {
        if (m.wordId !== wordId || m.done) return m
        const next = m.correctCount + 1
        if (next >= 3) { didClear = true; return { ...m, correctCount: 3, done: true } }
        return { ...m, correctCount: next }
      }),
    }))
    if (didClear) {
      patch(prev => ({ cleared: prev.cleared.includes(wordId) ? prev.cleared : [...prev.cleared, wordId] }))
      addStars(3)
      // v2.3.1 — 여기 있던 grantXp('mission-clear', `mission-clear:${wordId}`)
      // 를 제거했다. 이게 바로 운영자가 실측 발견한 "XP가 단어 단위로
      // 지급되는" 정확한 원인이었다 — wordId를 source_event_id로 써서
      // 학생이 (특히 오답으로 미션 큐에 들어간) 단어를 계속 넘길 때마다
      // XP가 단어 개수만큼 무한히 쌓였다(별 addStars(3)은 원래도 단어별
      // 지급이 의도였으므로 그대로 유지 — XP만 이 트리거에서 분리).
      // 레벨업 미션 클리어는 정의상 단어 단위 이벤트라 "행동(일별 카테고리
      // 완료)" 축으로 자연스럽게 변환할 방법이 없고, 운영자 지정 8개 XP
      // 이벤트 목록에도 포함되지 않아 XP 지급 트리거에서 완전히 제거하는
      // 쪽으로 판단했다(상세 근거: src/utils/paulRankShared.js
      // XP_EVENT_TABLE 헤더, wiki/decisions.md #10).
    }
    return didClear
  }, [patch, addStars])

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

  const markPronunciationOk = useCallback(() => {
    patch(prev => ({ round: { ...prev.round, pronunciationOk: (prev.round.pronunciationOk || 0) + 1 } }))
  }, [patch])

  // Grants a sticker directly, bypassing the gift-box gacha (used for
  // guaranteed streak/star-badge rewards). Duplicates still convert to
  // stars so a guaranteed pull is never wasted either.
  const grantSticker = useCallback((sticker) => {
    const isDuplicate = stickerTypes.includes(sticker.id)
    if (isDuplicate) {
      addStars(DUPLICATE_BONUS_STARS)
      // v2.3.1 — 여기 있던 grantXp('duplicate-sticker-bonus', ...)를
      // 제거했다. 운영자가 지정한 8개 XP 이벤트 목록에 없을 뿐 아니라,
      // 오늘의 미션(4/4)이 하루 여러 번 반복 완료될 수 있다는 기존 설계
      // (아래 daily-mission-complete 주석 참고) 때문에 이 트리거도
      // 무작위 키(randEventId)로 반복마다 별개 지급되는, mission-clear와
      // 같은 성격의 무제한 반복 지급 경로였다 — 별(addStars) 지급은
      // 그대로 유지.
    } else {
      patch(prev => ({ stickers: [...prev.stickers, sticker.id] }))
      bumpHistory(day => ({ stickersEarned: [...day.stickersEarned, sticker.id] }))
    }
    return isDuplicate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickerTypes, addStars, patch, bumpHistory])

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
  useEffect(() => {
    const today = todayStr()
    if (dailyCategoryXpFiredRef.current.date !== today) {
      dailyCategoryXpFiredRef.current = { date: today, fired: new Set() }
    }
    const fired = dailyCategoryXpFiredRef.current.fired
    const tryFire = (key, eventType) => {
      if (fired.has(key)) return
      fired.add(key)
      grantXp(eventType, `${eventType}:${today}`)
    }
    if (round.wordsViewed.length >= GOAL) tryFire('word-view', 'word-view-complete')
    if (round.examplesHeard >= GOAL) tryFire('listening', 'listening-complete')
    if (round.quizSolved >= GOAL) tryFire('quiz', 'quiz-complete')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.wordsViewed.length, round.examplesHeard, round.quizSolved])

  // Full round completion: all 4 daily categories reached goal → open a
  // gift box (rarity-weighted random sticker, duplicates become bonus stars
  // instead of a second copy), award a flat completion bonus, log it in
  // today's history (feeds the diary calendar + streak), then immediately
  // start the next round — missions repeat all day, not once.
  useEffect(() => {
    const allDone = countCategoriesCompleted(round) >= 4
    if (!allDone) return
    const signature = `${round.date}:${round.wordsViewed.length}:${round.examplesHeard}:${round.quizSolved}:${round.pronunciationOk}`
    if (handledRoundRef.current === signature) return
    handledRoundRef.current = signature

    addStars(MISSION_BONUS_STARS)
    // v2.3.1 — 이벤트 이름을 운영자 지정 8종 표준 이름(daily-mission-
    // complete)으로 재명명하면서, source_event_id도 signature(라운드별
    // 고유값) 대신 **날짜만**(day 기간키)으로 바꿨다. 별/스티커(addStars/
    // grantSticker)는 여전히 라운드가 반복될 때마다(위 주석 "missions
    // repeat all day") 매번 지급되어 기존 게임 경험이 그대로지만, XP는
    // 오늘 첫 4/4 완료 1회만 지급된다 — 같은 날짜 키로 두 번째 요청부터는
    // 서버 unique 제약이 자연스럽게 막는다(예전 signature 방식은 반복
    // 완료마다 XP가 계속 쌓였는데, 이것도 "같은 행동 반복 시 XP 무한 획득"
    // 이 되므로 이번 리팩터링 범위에 포함해 함께 정리했다).
    grantXp('daily-mission-complete', `daily-mission-complete:${todayStr()}`)
    // Ticket Economy(GAME_DESIGN.md 7번) — 같은 트리거에 병행 후킹만, 새
    // 트래킹 로직 없음. grantTicket이 `daily-mission-complete:${날짜}`를
    // id로 써서(위 grantXp와 동일한 day 기간키) idempotent하게 append하므로,
    // 이 useEffect가 하루 중 몇 번을 더 반복(missions repeat all day)해도
    // 오늘 첫 4/4 완료 1회만 티켓이 지급된다(XP 쪽 "오늘 이미 지급했는지"
    // 가드와 동일한 원리 재사용, ticketEconomy.js 참고).
    patch(prev => ({ ticketLedger: grantTicket(prev.ticketLedger, 'daily-mission-complete', todayStr()) }))
    bumpHistory(day => ({ giftsToday: day.giftsToday + 1 }))
    const sticker = getRandomSticker()
    const isDuplicate = grantSticker(sticker)
    setGiftQueue(q => [...q, { sticker, isDuplicate, isMilestone: false }])
    patch(() => ({ round: freshRound() }))
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
  }, [bumpHistory])

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
  // (3/5/10)에 도달하는 그 순간에만 addStars(기존 별 지급 단일 경로)로
  // 보너스를 준다. round.spellingCombo는 기존 저장 데이터에 없을 수
  // 있어 항상 (|| 0)로 읽는다(하위호환 — freshRound 주석 참고).
  // v2.3.1 — 예전엔 여기서 콤보 마일스톤(3/5/10)마다 grantXp('spelling-
  // combo-N', `spelling-combo-N:날짜:wordId`)를 호출했다. source_event_id
  // 에 wordId가 들어가 있어, 같은 날 서로 다른 단어에서 콤보가 반복
  // 도달할 때마다 별개 지급이 가능했다(운영자가 이 지점도 함께 의심
  // 지목). 콤보 별 보너스(addStars)는 그대로 유지하되, XP는 운영자 지정
  // 'writing-complete' 이벤트로 교체 — "오늘 쓰기시험 카테고리를 처음
  // 완료한 순간"(history.spellingCorrect가 오늘 처음 GOAL에 도달하는
  // 순간, 다른 3개 카테고리(word-view/listening/quiz)와 동일한 day
  // 기간키 패턴) 단위로만 지급한다 — 몇 번째 단어/몇 번째 콤보에서
  // 도달했는지는 더 이상 지급 여부에 영향을 주지 않는다.
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
    if (justCompletedWriting) grantXp('writing-complete', `writing-complete:${todayStr()}`)
    if (correct) {
      // 콤보/보너스를 같은 클로저 값에서 계산 — 표시되는 콤보 수와 실제
      // 지급된 보너스가 절대 어긋나지 않게. (쓰기 답안은 사람이 타이핑하는
      // 속도로만 들어오므로 stale closure가 실제로 문제될 간격이 아님.)
      const combo = (round.spellingCombo || 0) + 1
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
      const bonus = spellingComboBonus(combo)
      if (bonus > 0) {
        addStars(bonus)
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
  }, [bumpHistory, patch, addStars, round.spellingCombo, grantXp])

  // 복습 화면에서 한 단어를 맞히면 오답노트 큐에서 제거 — 큐가 비면
  // "틀린 단어 복습"이 끝난 것. Writing MVP: 영구 복습 대기열
  // (spellingReviewQueue)에서도 함께 제거 — 복습 화면은 오늘치 큐와
  // 영구 큐를 합쳐서 보여주므로(App.jsx), 어느 쪽에서 온 단어든 여기서
  // 한 번에 정리된다.
  const clearSpellingReviewWord = useCallback((wordId) => {
    patch(prev => ({
      round: { ...prev.round, spellingWrongToday: prev.round.spellingWrongToday.filter(id => id !== wordId) },
      spellingReviewQueue: prev.spellingReviewQueue.includes(wordId)
        ? prev.spellingReviewQueue.filter(id => id !== wordId)
        : prev.spellingReviewQueue,
    }))
  }, [patch])

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
    addStars, addMission, answerMission,
    markWordViewed, markExampleHeard, markQuizSolved, markPronunciationOk,
    placeSticker, updatePlacement, removePlacement, movePlacementLayer,
    wordStatus, setWordKnown, setWordUnknown,
    // Ticket Economy(2026-07-19) — ticketBalance는 항상 ticketLedger에서
    // 파생된 값(sumTicketBalance), 절대 별도 저장하지 않는다.
    ticketBalance, ticketLedger, redeemTicketReward,
    // 애착 시스템(2026-07-22) — 모자 인벤토리/장착/성장 앨범. 판정은
    // src/utils/attachment/ 순수 함수, 여기는 append-only 반영만.
    hatInventory, equippedHatId, milestones,
    grantHats, addMilestones, equipHat,
  }
}
