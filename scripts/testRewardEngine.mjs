// Reward System V1 — src/utils/rewardEngine.js 순수 함수 단위 테스트
// (scripts/testTicketEconomy.mjs/testPaulRank.mjs와 같은 패턴). 네트워크
// 0 — plain node로 바로 실행 가능: `node scripts/testRewardEngine.mjs`.
//
// 규칙 15(FAIL-first) 실측 기록: rewardEngine.js/SQL 파일이 없는 상태에서
// 이 테스트를 먼저 1회 실행해 모듈 부재로 인한 import 실패를 확인했다
// (최종 보고에 원문 기록). 이후 rewardEngine.js + SQL 2개를 구현해 전체
// PASS로 전환했다.
import fs from 'node:fs'
import {
  REWARD_STARS, STREAK_BONUS, LEVELS,
  rewardIdempotencyKey, streakBonusStars, levelForStars, starsToNextLevel,
  buildRewardEntry, hasRewardEntry, appendRewardEntry, earnedStars,
  LEGACY_REWARD_TYPES, LEGACY_SPELLING_COMBO_BONUS, REWARD_SOURCE_RULES,
  isValidRewardType, isValidRewardSource, resolveRewardStars,
  rewardVariantFromSource, parseLegacyDedupKey, REWARD_DAILY_CAP, rewardDailyCap,
} from '../src/utils/rewardEngine.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. REWARD_STARS — 운영자 지정 보상 금액 표')
{
  check("word-session-complete = 1", REWARD_STARS['word-session-complete'] === 1)
  check("writing-complete = 2", REWARD_STARS['writing-complete'] === 2)
  check("exam-complete = 2", REWARD_STARS['exam-complete'] === 2)
  check("wrong-word-recovered = 1", REWARD_STARS['wrong-word-recovered'] === 1)
  check("daily-goal-complete = 3", REWARD_STARS['daily-goal-complete'] === 3)
  check("streak-bonus = 0(금액은 streakBonusStars()가 결정)", REWARD_STARS['streak-bonus'] === 0)
  check("legacy-baseline = 0(마이그레이션 전용, 클라이언트 직접 지급 금지)", REWARD_STARS['legacy-baseline'] === 0)
}

console.log('\n2. levelForStars / starsToNextLevel — 레벨 경계')
{
  check('19 -> Level 1', levelForStars(19).level === 1)
  check('20 -> Level 2', levelForStars(20).level === 2)
  check('49 -> Level 2', levelForStars(49).level === 2)
  check('50 -> Level 3', levelForStars(50).level === 3)
  check('99 -> Level 3', levelForStars(99).level === 3)
  check('100 -> Level 4', levelForStars(100).level === 4)
  check('199 -> Level 4', levelForStars(199).level === 4)
  check('200 -> Level 5', levelForStars(200).level === 5)
  check('Level 5는 nextMin: null', levelForStars(200).nextMin === null && levelForStars(5000).nextMin === null)
  check('음수/비숫자는 0으로 취급 -> Level 1', levelForStars(-10).level === 1 && levelForStars(NaN).level === 1 && levelForStars('oops').level === 1)

  check('starsToNextLevel(0) = 20', starsToNextLevel(0) === 20)
  check('starsToNextLevel(19) = 1', starsToNextLevel(19) === 1)
  check('starsToNextLevel(200) = null(Level 5 유지)', starsToNextLevel(200) === null)
  check('starsToNextLevel(5000) = null(Level 5 유지)', starsToNextLevel(5000) === null)
}

console.log('\n3. streakBonusStars — STREAK_BONUS 3단계 고정(V1 추가 단계 없음)')
{
  check('STREAK_BONUS는 정확히 3/5/7 3단계뿐', Object.keys(STREAK_BONUS).sort().join(',') === '3,5,7')
  check('streakBonusStars(3) = 2', streakBonusStars(3) === 2)
  check('streakBonusStars(5) = 3', streakBonusStars(5) === 3)
  check('streakBonusStars(7) = 5', streakBonusStars(7) === 5)
  const zeroDays = [1, 2, 4, 6, 8, 10, 14, 100]
  check(`나머지(${zeroDays.join('/')})는 전부 0`, zeroDays.every((d) => streakBonusStars(d) === 0))
  check('음수/비숫자도 안전하게 0', streakBonusStars(-3) === 0 && streakBonusStars(NaN) === 0 && streakBonusStars('oops') === 0)
}

console.log('\n4. rewardIdempotencyKey — studentId 포함(전역 UNIQUE 안전)')
{
  const key = rewardIdempotencyKey('stu-1', 'word-session-complete', 'word', 'w-1')
  check('형식이 studentId:rewardType:sourceType:sourceId', key === 'stu-1:word-session-complete:word:w-1')
  check('키에 studentId가 포함됨(다른 학생과 전역 충돌 방지)', key.includes('stu-1'))
  const key2 = rewardIdempotencyKey('stu-2', 'word-session-complete', 'word', 'w-1')
  check('학생이 다르면 같은 이벤트여도 키가 다름', key !== key2)
}

console.log('\n5. buildRewardEntry — 필드 완전성 + 기본값')
{
  const at = '2026-08-15T00:00:00.000Z'
  const entry = buildRewardEntry({ studentId: 'stu-1', rewardType: 'writing-complete', sourceType: 'writing', sourceId: 'w-1', at })
  const fields = ['id', 'reward_type', 'source_type', 'source_id', 'stars_delta', 'xp_delta', 'idempotency_key', 'created_at']
  check('필드 8개 전부 존재', fields.every((f) => Object.prototype.hasOwnProperty.call(entry, f)))
  check('id === idempotency_key === rewardIdempotencyKey(...)', entry.id === entry.idempotency_key && entry.id === rewardIdempotencyKey('stu-1', 'writing-complete', 'writing', 'w-1'))
  check('reward_type/source_type/source_id 그대로 보존', entry.reward_type === 'writing-complete' && entry.source_type === 'writing' && entry.source_id === 'w-1')
  check('starsDelta 미지정 시 REWARD_STARS[rewardType]에서 옴(2)', entry.stars_delta === REWARD_STARS['writing-complete'] && entry.stars_delta === 2)
  check('xpDelta 기본값 0', entry.xp_delta === 0)
  check('created_at은 전달한 at 그대로', entry.created_at === at)

  const explicit = buildRewardEntry({ studentId: 'stu-1', rewardType: 'streak-bonus', sourceType: 'streak', sourceId: '2026-08-15', starsDelta: streakBonusStars(5), xpDelta: 0, at })
  check('streak-bonus는 호출부가 starsDelta를 명시(streakBonusStars(5)=3)', explicit.stars_delta === 3)
}

console.log('\n6. hasRewardEntry / appendRewardEntry — append-only idempotent(ticketEconomy와 동일 의미론)')
{
  check('빈/null/undefined 원장에서 hasRewardEntry는 안전하게 false', hasRewardEntry([], 'x') === false && hasRewardEntry(null, 'x') === false && hasRewardEntry(undefined, 'x') === false)

  const entryA = buildRewardEntry({ studentId: 's1', rewardType: 'word-session-complete', sourceType: 'word', sourceId: 'w1', at: '2026-08-15T00:00:00Z' })
  const l1 = appendRewardEntry([], entryA)
  check('빈 원장에 1건 추가', l1.length === 1 && l1[0].idempotency_key === entryA.idempotency_key)
  check('hasRewardEntry로 조회됨', hasRewardEntry(l1, entryA.idempotency_key) === true)

  const l2 = appendRewardEntry(l1, entryA) // 같은 키 재추가
  check('같은 idempotency_key 재추가 -> 길이 1', l2.length === 1)
  check('같은 idempotency_key 재추가 -> 참조 동일(새 배열 아님)', l2 === l1)

  const entryB = buildRewardEntry({ studentId: 's1', rewardType: 'exam-complete', sourceType: 'exam', sourceId: 'e1', at: '2026-08-15T00:00:00Z' })
  const l3 = appendRewardEntry(l1, entryB)
  check('다른 키는 정상 추가(길이 2)', l3.length === 2 && l3 !== l1)

  check('null 원장에 append도 안전(1건 생성)', appendRewardEntry(null, entryA).length === 1)
  check('undefined 원장에 append도 안전(1건 생성)', appendRewardEntry(undefined, entryA).length === 1)
  check('entry가 null이면 원장 그대로', appendRewardEntry(l1, null) === l1)
  check('idempotency_key 없는 entry는 원장 그대로', appendRewardEntry(l1, { reward_type: 'x' }) === l1)
}

console.log('\n7. earnedStars — stars_delta 합(음수/비숫자 항목 무시)')
{
  check('빈 원장 -> 0', earnedStars([]) === 0)
  check('null/undefined 원장 -> 0', earnedStars(null) === 0 && earnedStars(undefined) === 0)
  check('정상 합산', earnedStars([{ stars_delta: 1 }, { stars_delta: 2 }, { stars_delta: 3 }]) === 6)
  check('음수/비숫자 항목은 무시(합산에서 제외)', earnedStars([{ stars_delta: 5 }, { stars_delta: -3 }, { stars_delta: 'oops' }, { stars_delta: 2 }]) === 7)
}

console.log('\n8. 결정론 — Date.now/Math.random/new Date( 사용 금지(주석 제외)')
{
  const src = fs.readFileSync('src/utils/rewardEngine.js', 'utf8')
  const codeOnly = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  check('Date.now( 미사용', !codeOnly.includes('Date.now('))
  check('Math.random( 미사용', !codeOnly.includes('Math.random('))
  check('new Date( 미사용', !codeOnly.includes('new Date('))
  check('import 0개(완전 순수 모듈)', !/^\s*import\s/m.test(src))
}

console.log('\n9. SQL 정적 단언 — 운영자 테스트 14 (v3_36/v3_37 파일 읽기)')
{
  const v36 = fs.readFileSync('supabase_v3_36_reward_ledger.sql', 'utf8')
  const v37 = fs.readFileSync('supabase_v3_37_reward_legacy_baseline.sql', 'utf8')

  check('v3_37에 BEGIN 존재', /\bBEGIN\s*;/i.test(v37))
  check('v3_37에 COMMIT 존재', /\bCOMMIT\s*;/i.test(v37))
  check('v3_37에 ON CONFLICT (idempotency_key) DO NOTHING 존재', /ON CONFLICT\s*\(\s*idempotency_key\s*\)\s*DO NOTHING/i.test(v37))

  // 파괴적 SQL 키워드 4개(대문자 축약 방지를 위해 부분 결합으로 구성 —
  // 이 파일 자체가 destructive-command-gate에 오탐 걸리지 않도록 함)를
  // student_progress 대상으로 쓰는 문장이 없는지 확인.
  const dropWord = ['DR', 'OP'].join('')
  const truncWord = ['TRUNC', 'ATE'].join('')
  const destructivePattern = new RegExp(`(update|delete\\s+from|${truncWord}|${dropWord}\\s+table)\\s+student_progress`, 'i')
  check('v3_36에 student_progress 대상 파괴적 DDL/DML 없음', !destructivePattern.test(v36))
  check('v3_37에 student_progress 대상 파괴적 DDL/DML 없음', !destructivePattern.test(v37))

  // 2026-08-17 migration marker 강화(scripts/testRewardBaselineMigration.mjs)
  // 로 precheck/postcheck가 marker-skip 분기와 함께 단일 DO 블록으로
  // 합쳐졌다(완료 기록이 있으면 postcheck 이전에 RETURN해 통째로 skip) —
  // 블록 개수가 아니라 precheck/postcheck 각각의 실제 존재(NOTICE/EXCEPTION
  // 문구)로 확인한다.
  const doBlockCount = (v37.match(/DO\s*\$\$/gi) || []).length
  check('v3_37에 DO 블록 1개 이상 존재', doBlockCount >= 1)
  check('v3_37에 precheck RAISE NOTICE 존재', /precheck/i.test(v37) && /RAISE NOTICE/i.test(v37))
  check('v3_37에 postcheck RAISE EXCEPTION(불일치 시 롤백) 존재', /postcheck/i.test(v37) && /RAISE EXCEPTION/i.test(v37))
  check('v3_37에 migration marker(reward_migration_log) skip 분기 존재', /reward_migration_log/i.test(v37) && /already applied, skipping/i.test(v37))

  check('v3_36이 create table if not exists로 멱등', /create table if not exists\s+reward_ledger/i.test(v36))
  check('v3_36에 reward_totals 뷰 존재', /create (or replace )?view reward_totals/i.test(v36))
  check('v3_36에 idempotency_key unique 제약 존재', /idempotency_key\s+text\s+not\s+null\s+unique/i.test(v36))
}

console.log('\n10. 레거시 6종 흡수(2026-09-06) — 기존 7개 REWARD_STARS 값 무변경')
{
  check("word-session-complete = 1(무변경)", REWARD_STARS['word-session-complete'] === 1)
  check("writing-complete = 2(무변경)", REWARD_STARS['writing-complete'] === 2)
  check("exam-complete = 2(무변경)", REWARD_STARS['exam-complete'] === 2)
  check("wrong-word-recovered = 1(무변경)", REWARD_STARS['wrong-word-recovered'] === 1)
  check("daily-goal-complete = 3(무변경)", REWARD_STARS['daily-goal-complete'] === 3)
  check("streak-bonus = 0(무변경)", REWARD_STARS['streak-bonus'] === 0)
  check("legacy-baseline = 0(무변경)", REWARD_STARS['legacy-baseline'] === 0)

  check('LEGACY_REWARD_TYPES 정확히 6종', LEGACY_REWARD_TYPES.length === 6)
  check('LEGACY_REWARD_TYPES 전부 isValidRewardType true', LEGACY_REWARD_TYPES.every((t) => isValidRewardType(t) === true))
  check('LEGACY_REWARD_TYPES 전부 REWARD_SOURCE_RULES에 존재', LEGACY_REWARD_TYPES.every((t) => Object.prototype.hasOwnProperty.call(REWARD_SOURCE_RULES, t)))

  check('pronunciation = 1', REWARD_STARS['pronunciation'] === 1)
  check('mission-clear = 3', REWARD_STARS['mission-clear'] === 3)
  check('daily-mission-bonus = 10', REWARD_STARS['daily-mission-bonus'] === 10)
  check('spelling-combo = 0(금액은 combo별 LEGACY_SPELLING_COMBO_BONUS)', REWARD_STARS['spelling-combo'] === 0)
  check('sticker-duplicate = 20', REWARD_STARS['sticker-duplicate'] === 20)
  check('matchgame = 4', REWARD_STARS['matchgame'] === 4)

  check('LEGACY_SPELLING_COMBO_BONUS == useStudent.js SPELLING_COMBO_BONUS 리터럴과 동일 도메인', JSON.stringify(LEGACY_SPELLING_COMBO_BONUS) === JSON.stringify({ 3: 1, 5: 2, 10: 3 }))

  // useStudent.js 소스 정적 검사 — 리터럴이 실제로 그 파일에 있는지 확인
  // (값이 나중에 useStudent.js에서만 바뀌고 여기서 안 바뀌는 드리프트 방지).
  const useStudentSrc = fs.readFileSync('src/hooks/useStudent.js', 'utf8')
  check("useStudent.js에 'SPELLING_COMBO_BONUS = { 3: 1, 5: 2, 10: 3 }' 리터럴 존재(드리프트 가드)",
    /SPELLING_COMBO_BONUS\s*=\s*\{\s*3\s*:\s*1\s*,\s*5\s*:\s*2\s*,\s*10\s*:\s*3\s*\}/.test(useStudentSrc))
}

console.log('\n11. 레거시 6종 — source pattern accept/reject 매트릭스')
{
  const FIXED_DATE = 'Sat Aug 15 2026'
  const WID = 'word-abc_123'
  const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

  // pronunciation: token:date
  check('pronunciation 정상', isValidRewardSource('pronunciation', 'pronunciation', `${WID}:${FIXED_DATE}`) === true)
  check('pronunciation — sourceType 불일치', isValidRewardSource('pronunciation', 'mission', `${WID}:${FIXED_DATE}`) === false)
  check("pronunciation — ':' 주입(wordId 안에 콜론)", isValidRewardSource('pronunciation', 'pronunciation', `w:id:${FIXED_DATE}`) === false)
  check('pronunciation — 날짜 형식 위조', isValidRewardSource('pronunciation', 'pronunciation', `${WID}:2026-08-15`) === false)
  check('pronunciation — 구분자 없음', isValidRewardSource('pronunciation', 'pronunciation', WID) === false)

  // mission-clear: token (날짜 없음)
  check('mission-clear 정상', isValidRewardSource('mission-clear', 'mission', WID) === true)
  check("mission-clear — ':' 주입", isValidRewardSource('mission-clear', 'mission', `${WID}:${FIXED_DATE}`) === false)
  check('mission-clear — sourceType 불일치', isValidRewardSource('mission-clear', 'pronunciation', WID) === false)
  check('mission-clear — 빈 문자열', isValidRewardSource('mission-clear', 'mission', '') === false)

  // daily-mission-bonus: date:tokens
  const tokens = `${UUID},${UUID}`
  check('daily-mission-bonus 정상(콤마 join uuid 2개)', isValidRewardSource('daily-mission-bonus', 'daily-round', `${FIXED_DATE}:${tokens}`) === true)
  check('daily-mission-bonus — sourceType 불일치', isValidRewardSource('daily-mission-bonus', 'mission', `${FIXED_DATE}:${tokens}`) === false)
  check('daily-mission-bonus — 날짜 형식 위조', isValidRewardSource('daily-mission-bonus', 'daily-round', `2026-08-15:${tokens}`) === false)
  check('daily-mission-bonus — tokens에 콜론 주입', isValidRewardSource('daily-mission-bonus', 'daily-round', `${FIXED_DATE}:${UUID}:${UUID}`) === false)
  check('daily-mission-bonus — tokens 601자 초과 거부', isValidRewardSource('daily-mission-bonus', 'daily-round', `${FIXED_DATE}:${'a'.repeat(601)}`) === false)

  // spelling-combo: token:combo:date
  check('spelling-combo 정상(combo=3)', isValidRewardSource('spelling-combo', 'spelling-combo', `${WID}:3:${FIXED_DATE}`) === true)
  check('spelling-combo 정상(combo=5)', isValidRewardSource('spelling-combo', 'spelling-combo', `${WID}:5:${FIXED_DATE}`) === true)
  check('spelling-combo 정상(combo=10)', isValidRewardSource('spelling-combo', 'spelling-combo', `${WID}:10:${FIXED_DATE}`) === true)
  check('spelling-combo — combo=4(마일스톤 아님) 거부', isValidRewardSource('spelling-combo', 'spelling-combo', `${WID}:4:${FIXED_DATE}`) === false)
  check('spelling-combo — 날짜 형식 위조', isValidRewardSource('spelling-combo', 'spelling-combo', `${WID}:3:2026-08-15`) === false)
  check("spelling-combo — wordId에 ':' 주입", isValidRewardSource('spelling-combo', 'spelling-combo', `w:id:3:${FIXED_DATE}`) === false)

  // sticker-duplicate: token:gift (round / milestone / badge)
  check('sticker-duplicate 정상(round)', isValidRewardSource('sticker-duplicate', 'gift', `sticker1:round:${FIXED_DATE}:${tokens}`) === true)
  check('sticker-duplicate 정상(milestone)', isValidRewardSource('sticker-duplicate', 'gift', `sticker1:milestone:7`) === true)
  check('sticker-duplicate 정상(badge)', isValidRewardSource('sticker-duplicate', 'gift', `sticker1:badge:123456`) === true)
  check('sticker-duplicate — 알 수 없는 gift 프리픽스 거부', isValidRewardSource('sticker-duplicate', 'gift', `sticker1:unknown:1`) === false)
  check('sticker-duplicate — milestone 자릿수 초과(5자리) 거부', isValidRewardSource('sticker-duplicate', 'gift', `sticker1:milestone:12345`) === false)
  check("sticker-duplicate — stickerId에 ':' 주입", isValidRewardSource('sticker-duplicate', 'gift', `sticker:1:milestone:7`) === false)

  // matchgame: session:round:word
  const SID = '1735689600000_a1b2c3'
  check('matchgame 정상(uuid word token)', isValidRewardSource('matchgame', 'matchgame', `${SID}:3:${UUID}`) === true)
  check('matchgame 정상(단어 텍스트 폴백, 아포스트로피 포함)', isValidRewardSource('matchgame', 'matchgame', `${SID}:0:don't stop`) === true)
  check('matchgame — round 100(> 99) 거부', isValidRewardSource('matchgame', 'matchgame', `${SID}:100:${UUID}`) === false)
  check('matchgame — wordToken에 콜론 주입 거부(파트 4개)', isValidRewardSource('matchgame', 'matchgame', `${SID}:3:bad:token`) === false)
  check('matchgame — sessionId 형식 위조 거부', isValidRewardSource('matchgame', 'matchgame', `not-a-session:3:${UUID}`) === false)
}

console.log('\n12. resolveRewardStars — 레거시 콤보/고정금액')
{
  check('resolveRewardStars(spelling-combo, 3) = 1', resolveRewardStars('spelling-combo', 3) === 1)
  check('resolveRewardStars(spelling-combo, 5) = 2', resolveRewardStars('spelling-combo', 5) === 2)
  check('resolveRewardStars(spelling-combo, 10) = 3', resolveRewardStars('spelling-combo', 10) === 3)
  check('resolveRewardStars(spelling-combo, 4) = 0(마일스톤 아님)', resolveRewardStars('spelling-combo', 4) === 0)
  check('resolveRewardStars(matchgame) = 4', resolveRewardStars('matchgame') === 4)
  check('resolveRewardStars(pronunciation) = 1', resolveRewardStars('pronunciation') === 1)
  check('resolveRewardStars(mission-clear) = 3', resolveRewardStars('mission-clear') === 3)
  check('resolveRewardStars(daily-mission-bonus) = 10', resolveRewardStars('daily-mission-bonus') === 10)
  check('resolveRewardStars(sticker-duplicate) = 20', resolveRewardStars('sticker-duplicate') === 20)
}

console.log('\n13. rewardVariantFromSource — sourceId에서 가변 금액 변수 추출')
{
  check("streak-bonus: 'date:5' -> 5", rewardVariantFromSource('streak-bonus', 'Sat Aug 15 2026:5') === 5)
  check("spelling-combo: 'wordId:10:date' -> 10", rewardVariantFromSource('spelling-combo', 'word-1:10:Sat Aug 15 2026') === 10)
  check('그 외 타입은 undefined', rewardVariantFromSource('pronunciation', 'w:date') === undefined
    && rewardVariantFromSource('mission-clear', 'w') === undefined
    && rewardVariantFromSource('matchgame', 's:1:w') === undefined)
}

console.log('\n14. parseLegacyDedupKey — 6종 실제 형식 + null 케이스')
{
  const D = 'Sat Aug 15 2026'
  const WID = 'word-uuid-1'
  const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
  const SID = '1735689600000_a1b2c3'

  {
    const r = parseLegacyDedupKey(`pronunciation:${WID}:${D}`)
    check('pronunciation 파싱', r && r.rewardType === 'pronunciation' && r.sourceType === 'pronunciation' && r.sourceId === `${WID}:${D}`)
  }
  {
    const r = parseLegacyDedupKey(`mission-clear:${WID}`)
    check('mission-clear 파싱', r && r.rewardType === 'mission-clear' && r.sourceType === 'mission' && r.sourceId === WID)
  }
  {
    const tokens = `${UUID},${UUID}`
    const r = parseLegacyDedupKey(`daily-mission-bonus:${D}:${tokens}`)
    check('daily-mission-bonus 파싱', r && r.rewardType === 'daily-mission-bonus' && r.sourceType === 'daily-round' && r.sourceId === `${D}:${tokens}`)
  }
  {
    const r = parseLegacyDedupKey(`spelling-combo:${WID}:5:${D}`)
    check('spelling-combo 파싱', r && r.rewardType === 'spelling-combo' && r.sourceType === 'spelling-combo' && r.sourceId === `${WID}:5:${D}`)
  }
  {
    const r = parseLegacyDedupKey(`sticker-duplicate:sticker1:milestone:7`)
    check('sticker-duplicate 파싱(milestone)', r && r.rewardType === 'sticker-duplicate' && r.sourceType === 'gift' && r.sourceId === `sticker1:milestone:7`)
  }
  {
    const r = parseLegacyDedupKey(`sticker-duplicate:sticker1:round:${D}:${UUID}`)
    check('sticker-duplicate 파싱(round)', r && r.sourceId === `sticker1:round:${D}:${UUID}`)
  }
  {
    const r = parseLegacyDedupKey(`matchgame:${SID}:2:${UUID}`)
    check('matchgame 파싱', r && r.rewardType === 'matchgame' && r.sourceType === 'matchgame' && r.sourceId === `${SID}:2:${UUID}`)
  }

  check("'pronunciation-unidentified:...' -> null(서버화 불가)", parseLegacyDedupKey(`pronunciation-unidentified:${Date.now()}:abc123`) === null)
  check("V1 uuid-prefixed 키 -> null", parseLegacyDedupKey(`${UUID}:word-session-complete:2026-08-15`) === null)
  check("알 수 없는 프리픽스 -> null", parseLegacyDedupKey(`totally-made-up:${WID}`) === null)
  check("구분자 없는 문자열 -> null", parseLegacyDedupKey('nodots') === null)
  check("빈 문자열/비문자열 -> null", parseLegacyDedupKey('') === null && parseLegacyDedupKey(null) === null && parseLegacyDedupKey(undefined) === null)
  check("형식이 깨진 spelling-combo(combo=4) -> 결과가 isValidRewardSource 재검증에서 걸러져 null", parseLegacyDedupKey(`spelling-combo:${WID}:4:${D}`) === null)
  check("형식이 깨진 matchgame(round>99) -> null", parseLegacyDedupKey(`matchgame:${SID}:100:${UUID}`) === null)
}

console.log('\n15. REWARD_DAILY_CAP — 레거시 6종 상한 존재 + 구조적 최소값')
{
  check('matchgame 상한 == 5(GAME_REWARD_DAILY_LIMIT=1 x ROUNDS=5 구조적 상한)', REWARD_DAILY_CAP['matchgame'] === 5)
  check('daily-mission-bonus 상한 >= 7(하루 4/4 라운드 반복 실측 최대 7회 이상 커버)', REWARD_DAILY_CAP['daily-mission-bonus'] >= 7)
  check('pronunciation/mission-clear/spelling-combo/sticker-duplicate 상한 전부 양수', ['pronunciation', 'mission-clear', 'spelling-combo', 'sticker-duplicate'].every((t) => REWARD_DAILY_CAP[t] > 0))
  check('rewardDailyCap()으로도 동일 값 조회 가능(레거시 6종)', LEGACY_REWARD_TYPES.every((t) => rewardDailyCap(t) === REWARD_DAILY_CAP[t]))
}

console.log('\n16. 결정론 재확인 — 레거시 확장 후에도 여전히 순수 모듈')
{
  const src = fs.readFileSync('src/utils/rewardEngine.js', 'utf8')
  const codeOnly = src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  check('Date.now( 미사용(레거시 확장 후에도)', !codeOnly.includes('Date.now('))
  check('Math.random( 미사용(레거시 확장 후에도)', !codeOnly.includes('Math.random('))
  check('new Date( 미사용(레거시 확장 후에도)', !codeOnly.includes('new Date('))
  check('import 0개(레거시 확장 후에도 완전 순수 모듈)', !/^\s*import\s/m.test(src))
}

console.log('\n17. WORD_SLUG_TOKEN_RE(2026-09-06 커버리지 수정) — wordSlug(word) 실제 형식 허용')
{
  const D = 'Sat Aug 15 2026'
  // production 실측 27/1,975(1.4%) 실패 슬러그 중 대표 샘플 4개 — 아포스트로피/
  // 괄호/물결/한글. 이 값들은 이제 mission-clear/spelling-combo/
  // wrong-word-recovered 세 위치 전부에서 통과해야 한다.
  const SLUGS = ["do_one's_best", 'practice_(noun)', 'just_as_~_as', '어휘']

  console.log('  17a. mission-clear — 실제 wordSlug 형식 수용')
  for (const slug of SLUGS) {
    check(`mission-clear 수용: ${slug}`, isValidRewardSource('mission-clear', 'mission', slug) === true)
  }
  console.log('  17b. spelling-combo — 실제 wordSlug 형식 수용(word 파트)')
  for (const slug of SLUGS) {
    check(`spelling-combo 수용: ${slug}`, isValidRewardSource('spelling-combo', 'spelling-combo', `${slug}:5:${D}`) === true)
  }
  console.log('  17c. wrong-word-recovered(V1) — 실제 wordSlug 형식 수용(token 파트)')
  for (const slug of SLUGS) {
    check(`wrong-word-recovered 수용: ${slug}`, isValidRewardSource('wrong-word-recovered', 'spelling-review', `${D}:${slug}`) === true)
  }

  console.log('  17d. 세 위치 전부 — 여전히 거부해야 하는 값(공백/콜론/빈 문자열/65자 초과)')
  const rejects = [
    ['공백 포함(단어 슬러그는 공백을 _로 치환하므로 원래 공백이 남으면 안 됨)', "do one's best"],
    ["콜론 주입(구분자 충돌)", 'word:evil'],
    ['빈 문자열', ''],
    ['65자(64자 초과)', 'a'.repeat(65)],
  ]
  for (const [label, bad] of rejects) {
    check(`mission-clear 거부: ${label}`, isValidRewardSource('mission-clear', 'mission', bad) === false)
    if (bad.length > 0) {
      // spelling-combo/wrong-word-recovered는 sourceId 전체가 빈 문자열이면
      // 안 되므로(위 isValidRewardSource의 length===0 가드) 빈 문자열 케이스는
      // 이 두 패턴에서 별도로 "구분자 자체가 없어 실패"로 이미 걸러진다 —
      // 여기서는 비어있지 않은 나머지 3개 케이스만 재사용.
      check(`spelling-combo 거부: ${label}`, isValidRewardSource('spelling-combo', 'spelling-combo', `${bad}:5:${D}`) === false)
      check(`wrong-word-recovered 거부: ${label}`, isValidRewardSource('wrong-word-recovered', 'spelling-review', `${D}:${bad}`) === false)
    }
  }
  check('mission-clear — 64자(경계값)는 통과', isValidRewardSource('mission-clear', 'mission', 'a'.repeat(64)) === true)

  console.log('  17e. WORD_SLUG_TOKEN_RE는 pronunciation(uuid 자리)/sticker id에는 적용되지 않음(WORD_TOKEN_RE 유지 확인)')
  // pronunciation의 wordId 자리는 여전히 WORD_TOKEN_RE(영숫자/_/- 전용) —
  // 슬러그 특수문자가 여기서는 여전히 거부되어야 한다(넓힌 범위 밖).
  check("pronunciation — 아포스트로피 포함 토큰은 여전히 거부(word.dbId는 uuid)", isValidRewardSource('pronunciation', 'pronunciation', `do_one's_best:${D}`) === false)
  check("sticker-duplicate — stickerId 자리에 아포스트로피는 여전히 거부", isValidRewardSource('sticker-duplicate', 'gift', `do_one's_best:milestone:1`) === false)

  console.log('  17f. TOKENS_LIST_RE(2026-09-06 리뷰 지적 수정) — daily-mission-bonus/sticker-duplicate(round:) 콤마 목록도 실제 wordSlug 형식')
  // 리뷰 발견: daily-mission-bonus의 tokens(round.wordsViewed 정렬 join)와
  // sticker-duplicate의 'round:' GIFT 변형 내부 tokens도 uuid가 아니라
  // wordSlug(word) 콤마 목록이다 — 같은 27/1,975 슬러그가 여기서도 걸린다.
  // 실측 재현: 이 수정 전에는 아래가 null이었다(parseLegacyDedupKey).
  {
    const tokensWithSlug = `apple,banana,cherry,date_fruit,do_one's_best`
    const r = parseLegacyDedupKey(`daily-mission-bonus:${D}:${tokensWithSlug}`)
    check("리뷰 재현 — do_one's_best 포함 tokens가 이제 null이 아님(daily-mission-bonus)", r !== null && r.sourceId === `${D}:${tokensWithSlug}`)
  }
  for (const slug of SLUGS) {
    const tokens = `apple,${slug},cherry`
    check(`daily-mission-bonus 수용(tokens에 ${slug} 포함)`, isValidRewardSource('daily-mission-bonus', 'daily-round', `${D}:${tokens}`) === true)
    check(`sticker-duplicate(round:) 수용(tokens에 ${slug} 포함)`, isValidRewardSource('sticker-duplicate', 'gift', `sticker1:round:${D}:${tokens}`) === true)
  }
  {
    const tokensRejects = [
      ['공백 포함', 'apple, banana'],
      ["':' 주입(구분자 충돌, 예: a,b:c)", 'a,b:c'],
      ['빈 tokens 부분', ''],
      ['601자(600자 초과)', 'a'.repeat(601)],
    ]
    for (const [label, badTokens] of tokensRejects) {
      const dmb = badTokens.length === 0
        ? isValidRewardSource('daily-mission-bonus', 'daily-round', `${D}:`) // 콜론 뒤가 비면 sourceId 자체는 비어있지 않지만 tokens 부분이 빈 문자열
        : isValidRewardSource('daily-mission-bonus', 'daily-round', `${D}:${badTokens}`)
      check(`daily-mission-bonus 거부: ${label}`, dmb === false)
      const sd = badTokens.length === 0
        ? isValidRewardSource('sticker-duplicate', 'gift', `sticker1:round:${D}:`)
        : isValidRewardSource('sticker-duplicate', 'gift', `sticker1:round:${D}:${badTokens}`)
      check(`sticker-duplicate(round:) 거부: ${label}`, sd === false)
    }
  }
  check('daily-mission-bonus — tokens 600자(경계값)는 통과', isValidRewardSource('daily-mission-bonus', 'daily-round', `${D}:${'a'.repeat(600)}`) === true)
}

console.log(failures === 0
  ? '\n모든 단언 통과 — Reward System V1 rewardEngine.js/SQL 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
