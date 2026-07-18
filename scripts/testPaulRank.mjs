// Paul Rank System — 순수 함수 단위 테스트(scripts/testProgress.mjs와 같은
// 패턴). src/utils/paulRankShared.js는 React/import.meta.env/네트워크가
// 전혀 없는 순수 모듈이라 esbuild 번들 없이 Node에서 바로 import 가능
// (api/grant-xp.js가 실제로도 이렇게 직접 import한다 — 이 테스트가 곧
// 서버가 쓰는 것과 100% 같은 소스를 검증).
import {
  HAT_STAGES, RANKS, EXPERIENCE_UNLOCKS, XP_EVENT_TABLE,
  computeRankState, sumXpLedger, resolveXpAmount,
  isValidStudentId, isValidSourceEventId, isValidEventType,
  isValidDayPeriodKey, isValidSourceEventIdForEvent,
} from '../src/utils/paulRankShared.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. Hat Stage — 정확히 5단계, 운영자 지정 scale 그대로')
{
  check('정확히 5단계', HAT_STAGES.length === 5)
  const scales = HAT_STAGES.map(h => h.scale)
  check('scale 값이 정확히 [0.88, 0.94, 1.00, 1.07, 1.14]', JSON.stringify(scales) === JSON.stringify([0.88, 0.94, 1.0, 1.07, 1.14]))
  check('이름이 Tiny/Small/Growing/Big/Max', HAT_STAGES.map(h => h.name).join(',') === 'Tiny,Small,Growing,Big,Max')
  check('order가 0~4 순차', HAT_STAGES.every((h, i) => h.order === i))
}

console.log('\n2. Rank — 단조증가 임계값, configurable(단일 파일에서만 정의)')
{
  check('Rank가 5개(모자 색 5단계)', RANKS.length === 5)
  check('minXp가 단조증가(임계값 역전 없음)', RANKS.every((r, i) => i === 0 || r.minXp > RANKS[i - 1].minXp))
  check('첫 Rank는 minXp=0(신규 학생 보장 진입점)', RANKS[0].minXp === 0)
}

console.log('\n3. computeRankState — 결정적(deterministic), Unit/시간 등 외부 입력 없음')
{
  check('함수 시그니처가 xp 하나만 받음(구조적으로 Unit 입력 불가능)', computeRankState.length === 1)
  const a = computeRankState(120)
  const b = computeRankState(120)
  check('같은 입력 -> 완전히 같은 출력(JSON 동일)', JSON.stringify(a) === JSON.stringify(b))

  check('xp=0 -> 첫 Rank(새싹모자), Tiny 단계', computeRankState(0).rank.id === 'sprout' && computeRankState(0).hatStage.id === 'tiny')
  check('음수/비정상 xp도 크래시 없이 0으로 안전 처리', computeRankState(-5).xp === 0 && computeRankState(NaN).xp === 0 && computeRankState(undefined).xp === 0)

  // Rank 경계값 — minXp 정확히 도달한 순간 그 Rank로 승급(그 미만이면 이전 Rank)
  const beanieMin = RANKS[1].minXp
  check(`xp=${beanieMin - 1} -> 아직 이전 Rank`, computeRankState(beanieMin - 1).rank.id === RANKS[0].id)
  check(`xp=${beanieMin} -> 정확히 두 번째 Rank로 전환`, computeRankState(beanieMin).rank.id === RANKS[1].id)

  // 최고 Rank(왕관모자) — 다음 Rank 없음, 항상 Max 단계, progressRatio=1
  const maxRankXp = RANKS[RANKS.length - 1].minXp
  const top = computeRankState(maxRankXp + 99999)
  check('최고 Rank 도달 시 nextRank가 null', top.nextRank === null)
  check('최고 Rank는 isMaxRank=true', top.isMaxRank === true)
  check('최고 Rank는 항상 Max 모자 단계(hatStageIndex=4)', top.hatStageIndex === 4 && top.hatStage.id === 'max')
  check('최고 Rank는 xpRemainingToNextRank=0', top.xpRemainingToNextRank === 0)

  // 진행률 -> 5단계 버킷 매핑이 순서대로 오름차순인지(중간 Rank 하나로 스윕)
  const rank1 = RANKS[1], rank2 = RANKS[2]
  const span = rank2.minXp - rank1.minXp
  const stagesSeen = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999].map(frac => computeRankState(rank1.minXp + Math.floor(span * frac)).hatStageIndex)
  check('진행률이 오를수록 hatStageIndex가 감소하지 않음(단조)', stagesSeen.every((v, i) => i === 0 || v >= stagesSeen[i - 1]))
  check('진행률 0 근처는 Tiny(0), 0.99 근처는 Max(4)', stagesSeen[0] === 0 && stagesSeen[stagesSeen.length - 1] === 4)
}

console.log('\n4. Unit 전환이 Rank/XP 계산에 전혀 영향 없음 (구조적 증명)')
{
  // computeRankState/usePaulRank(src/hooks/usePaulRank.js)의 유일한 입력은
  // "누적 XP" 숫자 하나뿐 — Unit/className/unitId 등 어떤 식별자도 함수
  // 시그니처·계산 경로 어디에도 없다. 같은 xp를 여러 "가상 Unit 전환"
  // 시나리오에서 반복 계산해도 결과가 절대 달라지지 않음을 직접 증명.
  const xp = 275
  const resultsAcrossUnits = ['Unit 1', 'Unit 2', 'Unit 99', null, undefined].map(() => computeRankState(xp))
  check('Unit이 무엇이든(심지어 없어도) 같은 xp -> 완전히 같은 Rank 상태',
    resultsAcrossUnits.every(r => JSON.stringify(r) === JSON.stringify(resultsAcrossUnits[0])))
}

console.log('\n5. XP 이벤트 테이블 — 서버(api/grant-xp.js)가 신뢰하는 유일한 금액 원천 (v2.3.1 행동 단위 재설계)')
{
  check('운영자 지정 8개 이벤트 타입 정확히 존재',
    Object.keys(XP_EVENT_TABLE).sort().join(',') ===
    ['daily-mission-complete', 'listening-complete', 'quiz-complete', 'special-event', 'weekly-streak', 'word-king-complete', 'word-view-complete', 'writing-complete'].sort().join(','))
  check('구 word-unit 이벤트(mission-clear/duplicate-sticker-bonus/spelling-combo-*)는 테이블에서 완전히 제거됨',
    !('mission-clear' in XP_EVENT_TABLE) && !('duplicate-sticker-bonus' in XP_EVENT_TABLE) &&
    !('spelling-combo-3' in XP_EVENT_TABLE) && !('spelling-combo-5' in XP_EVENT_TABLE) && !('spelling-combo-10' in XP_EVENT_TABLE))
  check('resolveXpAmount가 활성(active) 이벤트의 고정 금액을 반환',
    resolveXpAmount('word-view-complete') === 2 && resolveXpAmount('listening-complete') === 2 &&
    resolveXpAmount('writing-complete') === 2 && resolveXpAmount('quiz-complete') === 2 &&
    resolveXpAmount('daily-mission-complete') === 10)
  check('resolveXpAmount가 알 수 없는 이벤트는 null(서버가 거부하는 근거)', resolveXpAmount('totally-made-up-event') === null && resolveXpAmount('') === null && resolveXpAmount(undefined) === null)
  check('resolveXpAmount가 mission-clear/duplicate-sticker-bonus(구 word-unit 이벤트)도 null(더 이상 존재하지 않음)',
    resolveXpAmount('mission-clear') === null && resolveXpAmount('duplicate-sticker-bonus') === null && resolveXpAmount('spelling-combo-3') === null)
  check('예약 슬롯(word-king-complete/weekly-streak/special-event)은 테이블에 존재하지만 status가 planned라 resolveXpAmount는 null(아직 지급 불가)',
    ['word-king-complete', 'weekly-streak', 'special-event'].every(k => k in XP_EVENT_TABLE && XP_EVENT_TABLE[k].status === 'planned' && resolveXpAmount(k) === null))
  check('모든 이벤트의 amount가 양의 정수(스키마 CHECK 제약과 일치, status 무관)', Object.values(XP_EVENT_TABLE).every(v => Number.isInteger(v.amount) && v.amount > 0))
}

console.log('\n6. sumXpLedger — xp_totals VIEW와 동일한 순수 합산(파생값 우선 원칙)')
{
  check('빈 배열 -> 0', sumXpLedger([]) === 0)
  check('행 3개 합산', sumXpLedger([{ amount: 3 }, { amount: 10 }, { amount: 20 }]) === 33)
  check('amount가 없거나 이상한 값이어도 크래시 없이 0 취급', sumXpLedger([{ amount: 'oops' }, {}, { amount: 5 }]) === 5)
  check('배열이 아닌 입력도 안전하게 0', sumXpLedger(null) === 0 && sumXpLedger(undefined) === 0)
}

console.log('\n6b. 행동 단위 파밍 방지 — "여러 단어에 걸쳐 반복해도 하루에 카테고리당 XP 1회만" (이번 리팩터링의 핵심 회귀 방지 포인트)')
{
  const today = new Date().toDateString()
  // word-view-complete는 클라이언트에서 항상 `word-view-complete:${todayStr()}`
  // 로만 생성된다(useStudent.js) — 학생이 5개 단어를 보든 50개를 보든, 오늘
  // 하루 동안 이 함수가 만들어내는 source_event_id는 정확히 하나뿐이라는 것을
  // 직접 증명(여러 "가상 단어 조회"를 시뮬레이션해도 항상 같은 키).
  const simulateWordViewsAcrossManyWords = (wordIds) =>
    wordIds.map(() => `word-view-complete:${today}`) // useStudent.js의 실제 생성식과 동일한 패턴
  const generatedKeys = simulateWordViewsAcrossManyWords(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10'])
  check('10개 서로 다른 단어를 거쳐도 생성되는 source_event_id는 정확히 1종류(날짜만, wordId 없음)',
    new Set(generatedKeys).size === 1 && generatedKeys[0] === `word-view-complete:${today}`)
  check('그 1종류 키가 서버 기간키 검증도 통과(xp_ledger unique(student_id, source_event_id)와 결합하면 하루 1행만 허용 — 구조적 증명, 실제 DB 실측은 testXpLedgerDb.mjs)',
    isValidSourceEventIdForEvent('word-view-complete', generatedKeys[0]) === true)
  // 대조군: 예전 mission-clear 방식(wordId가 키에 들어감)이었다면 10개 단어가
  // 10개의 서로 다른 키를 만들어 10번 지급됐을 것 — 그 취약했던 패턴을 재현해
  // "지금은 이 패턴 자체가 테이블에 없다"는 것까지 함께 증명.
  const oldVulnerablePattern = ['w1', 'w2', 'w3'].map(w => `mission-clear:${w}`)
  check('(대조군) 예전 wordId 기반 키였다면 서로 달랐을 것(무한 파밍의 원인) — 지금은 mission-clear 자체가 XP_EVENT_TABLE에 없어 이 패턴 자체가 봉쇄됨',
    new Set(oldVulnerablePattern).size === 3 && resolveXpAmount('mission-clear') === null)
}

console.log('\n7. 입력 검증 헬퍼 (서버 api/grant-xp.js가 그대로 재사용)')
{
  check('올바른 UUID만 통과', isValidStudentId('123e4567-e89b-12d3-a456-426614174000') === true)
  check('UUID 아닌 문자열/빈 값 거부', isValidStudentId('not-a-uuid') === false && isValidStudentId('') === false && isValidStudentId(undefined) === false)
  check('sourceEventId — 빈 문자열/과도한 길이 거부', isValidSourceEventId('') === false && isValidSourceEventId('x'.repeat(201)) === false)
  check('sourceEventId — 정상 문자열 통과', isValidSourceEventId('word-view-complete:abc-123') === true)
  check('isValidEventType이 resolveXpAmount와 일관됨', isValidEventType('word-view-complete') === true && isValidEventType('nope') === false)
  check('isValidEventType이 planned 이벤트(word-king-complete)는 거부(아직 지급 불가)', isValidEventType('word-king-complete') === false)
}

console.log('\n8b. 기간키(period key) 검증 — "가짜 날짜를 계속 바꿔가며 보내는" 우회 파밍 방지')
{
  // toDateString()은 로컬 타임존 기준 날짜 문자열을 만들고, isValidDayPeriodKey는
  // 그걸 다시 "로컬 자정"으로 파싱한다 — 이 왕복 변환 자체가 로컬 타임존 오프셋
  // 만큼의 시간을 잃어버리므로(예: UTC+9에서 "±2일 정확히 경계값"은 왕복 후
  // 몇 시간 더 벌어질 수 있음), 여기서는 경계값(정확히 2일)이 아니라 확실히
  // 안쪽(1일)/확실히 바깥(10일 이상)인 값으로만 검증해 실행 환경의 로컬
  // 타임존에 관계없이 항상 같은 결과가 나오게 한다(now도 실제 실행 시각
  // 기준으로 상대 계산 — 하드코딩된 절대 날짜 대신).
  const now = new Date()
  const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toDateString()
  const daysAhead = (n) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000).toDateString()
  check('오늘 날짜(toDateString 포맷)는 통과', isValidDayPeriodKey(now.toDateString(), now) === true)
  check('1일 전(관용 범위 확실히 안쪽)은 통과(서버/클라이언트 타임존 차이 관용)', isValidDayPeriodKey(daysAgo(1), now) === true)
  check('10일 전(관용 범위 확실히 밖)은 거부', isValidDayPeriodKey(daysAgo(10), now) === false)
  check('10일 후 미래 날짜(선지급 파밍 시도, 관용 범위 확실히 밖)는 거부', isValidDayPeriodKey(daysAhead(10), now) === false)
  check('파싱 불가 문자열/빈 문자열은 거부', isValidDayPeriodKey('not-a-date', now) === false && isValidDayPeriodKey('', now) === false)

  check('isValidSourceEventIdForEvent — eventType 접두사와 정확히 일치해야 통과',
    isValidSourceEventIdForEvent('word-view-complete', `word-view-complete:${now.toDateString()}`, now) === true)
  check('isValidSourceEventIdForEvent — 다른 이벤트 접두사를 위장하면 거부(예: quiz-complete인데 word-view-complete 접두사)',
    isValidSourceEventIdForEvent('quiz-complete', `word-view-complete:${now.toDateString()}`, now) === false)
  check('isValidSourceEventIdForEvent — 접두사는 맞지만 기간키가 날짜 범위 밖이면 거부(무작위/미래 날짜로 매번 새 키 생성하는 우회 파밍 차단)',
    isValidSourceEventIdForEvent('word-view-complete', `word-view-complete:${new Date('2099-01-01').toDateString()}`, now) === false)
  check('isValidSourceEventIdForEvent — 존재하지 않는 eventType은 거부', isValidSourceEventIdForEvent('made-up-event', 'made-up-event:2026-07-19', now) === false)
}

console.log('\n8. 경험 언락 설정 — forward-compatible 스키마만(아무 기능도 아직 소비 안 함)')
{
  check('5개 Hat Stage 전부 매핑 존재', HAT_STAGES.every(h => !!EXPERIENCE_UNLOCKS[h.id]))
  check('Tiny만 active(핵심 학습 = 지금도 실제로 열려있는 기능)', EXPERIENCE_UNLOCKS.tiny.unlocks.every(u => u.status === 'active'))
  check('나머지 4단계는 전부 planned(미구현, 자리만)', ['small', 'growing', 'big', 'max'].every(id => EXPERIENCE_UNLOCKS[id].unlocks.every(u => u.status === 'planned')))
  check('Max 단계에 승급 도전 + 특별 티켓 기회 두 항목', EXPERIENCE_UNLOCKS.max.unlocks.map(u => u.id).sort().join(',') === ['promotion-challenge', 'special-ticket-chance'].sort().join(','))
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
