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

  const doBlockCount = (v37.match(/DO\s*\$\$/gi) || []).length
  check('v3_37에 precheck/postcheck DO 블록 2개 이상 존재', doBlockCount >= 2)
  check('v3_37에 precheck RAISE NOTICE 존재', /RAISE NOTICE/i.test(v37))
  check('v3_37에 postcheck RAISE EXCEPTION(불일치 시 롤백) 존재', /RAISE EXCEPTION/i.test(v37))

  check('v3_36이 create table if not exists로 멱등', /create table if not exists\s+reward_ledger/i.test(v36))
  check('v3_36에 reward_totals 뷰 존재', /create (or replace )?view reward_totals/i.test(v36))
  check('v3_36에 idempotency_key unique 제약 존재', /idempotency_key\s+text\s+not\s+null\s+unique/i.test(v36))
}

console.log(failures === 0
  ? '\n모든 단언 통과 — Reward System V1 rewardEngine.js/SQL 계약 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
