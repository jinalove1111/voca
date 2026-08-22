// scripts/testGameRewardPolicy.mjs
//
// 게임 보상 정책 (2026-08-23 운영자 확정). 야간 감사에서 확정된 P0 —
// 게임이 별 경제의 69~78%를 찍어내고 학생 6명은 별의 100%를 게임으로만
// 벌었다(실데이터, 최다 사례는 하루 게임 18회 935별). 확정 정책:
//
//   1) 라운드당 별: 10 -> 4
//   2) 게임 보상: 하루 1세션까지만 (플레이 횟수는 무제한)
//   3) 당일 학습 목표 3/4 달성 전에는 보상 0 — 단 **플레이는 항상 허용**
//      (게임을 막는 게 아니라 "보상 자격"만 분리한다는 운영자 설계)
//
// 값 근거(가정이 아니라 실데이터 시뮬레이션 — 실학생 37명/학생-일자 313건).
// 게이트 x 라운드당별 x 일일세션 18조합 전수 탐색 결과:
//   4/4 · 3별 · 2세션 : 게임비중 11%  접근 46%  체감 1:0.81  -> 목표대역 미달
//   3/4 · 3별 · 2세션 : 게임비중 21%  접근 81%  체감 1:1.43  -> 달성일 역전
//   3/4 · 4별 · 1세션 : 게임비중 20%  접근 81%  체감 1:0.96  -> 채택
// "게임 비중 20~30% + 달성일 역전 없음"을 동시에 만족하는 유일 조합.
// 4/4는 중등 접근률이 27%(달성일 5%)에 그쳐 사실상 닿지 않는 보상이었다.
//
// 상태 저장 설계: 새 영속 필드를 만들지 않는다. round.date가 바뀌면
// freshRound()가 starGrantLog를 비우므로(useStudent.js), 오늘 보상받은
// 게임 세션 수는 round.starGrantLog 안의 `matchgame:<sessionId>:...` 키에서
// 서로 다른 sessionId 개수로 그대로 파생된다 — 마이그레이션 0건, 기존
// 학생 레코드 무변경(규칙 9).
//
// ── 하루 1세션으로 내리면서 새로 생긴 함정(이 파일 9절이 전담 고정) ──
// 한도가 2였을 때는 드러나지 않았지만, 1이 되면 "한 판의 1라운드에서 별을
// 받는 순간 countRewardedGameSessions가 1이 되어 같은 판의 2~5라운드가
// 즉시 차단"된다 — 즉 하루 1회가 하루 1라운드가 된다. 그래서 보상 자격은
// **판 시작 시점에 확정(latch)** 되어야 한다. MatchGameShell이 startGame()
// 에서 rewardBlockedReason을 세션 ref에 굳히고, 그 판이 끝날 때까지 그 값을
// 쓴다. App은 게이팅을 위해 함수를 null로 바꾸지 않고 항상 grantReward를
// 넘기며, 차단 판정은 latch된 사유가 담당한다(이중으로 막으면 위 함정이
// 그대로 재발한다).
//
// 규칙 15에 따라 구현 전에 먼저 작성됐고, 수정 전 소스에서 FAIL하는 것을
// 실측한 뒤 구현했다.
//
// 등록: npm run verify:game-reward
// 순수 함수 + 소스 정적 검사 + 세션 시뮬레이션. 네트워크 0, Supabase 0.

import fs from 'node:fs'

let failures = 0, asserted = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

let mg = {}
try { mg = await import('../src/utils/matchGame.js') } catch (e) { console.log('  (matchGame.js import 실패: ' + e.message + ')') }
const {
  STAR_PER_CORRECT, ROUNDS, GAME_REWARD_DAILY_LIMIT, GAME_REWARD_GOAL_CATEGORIES,
  countRewardedGameSessions, gameRewardEligibility,
} = mg
const safeCount = (log) => { try { return countRewardedGameSessions(log) } catch { return '<미구현>' } }
const safeElig = (arg) => { try { return gameRewardEligibility(arg) } catch { return { eligible: '<미구현>', reason: '<미구현>' } } }

console.log('\n1. 상수 — 라운드당 4별, 하루 보상 1세션, 게이트 3/4')
check('STAR_PER_CORRECT === 4 (기존 10에서 인하)', STAR_PER_CORRECT === 4)
check('ROUNDS === 5 (무변경)', ROUNDS === 5)
check('GAME_REWARD_DAILY_LIMIT === 1', GAME_REWARD_DAILY_LIMIT === 1)
check('GAME_REWARD_GOAL_CATEGORIES === 3 (4/4 -> 3/4 완화)', GAME_REWARD_GOAL_CATEGORIES === 3)
check('하루 게임 별 이론 상한 = 1 x 5 x 4 = 20', (GAME_REWARD_DAILY_LIMIT * ROUNDS * STAR_PER_CORRECT) === 20)

console.log('\n2. countRewardedGameSessions — starGrantLog에서 오늘 보상받은 세션 수 파생')
check('빈 로그 -> 0', safeCount([]) === 0)
check('null/undefined -> 0 (방어)', safeCount(null) === 0 && safeCount(undefined) === 0)
check('한 세션의 5라운드 -> 1', safeCount([
  'matchgame:S1:0:w1', 'matchgame:S1:1:w2', 'matchgame:S1:2:w3', 'matchgame:S1:3:w4', 'matchgame:S1:4:w5',
]) === 1)
check('두 세션 -> 2', safeCount([
  'matchgame:S1:0:w1', 'matchgame:S1:1:w2', 'matchgame:S2:0:w3', 'matchgame:S2:1:w4',
]) === 2)
check('게임 외 dedupKey는 세지 않음(발음/미션/콤보 등)', safeCount([
  'pronunciation:w1:Fri Aug 22 2026', 'mission-clear:w2', 'spelling-combo:w3:3:Fri Aug 22 2026',
  'daily-mission-bonus:sig', 'matchgame:S1:0:w1',
]) === 1)
check('형식 가정 위반에도 크래시 없음', typeof safeCount(['matchgame:', 'matchgame']) === 'number')

console.log('\n3. gameRewardEligibility — 3/4 미만이면 보상 0 (플레이는 별개)')
check('0/4 -> 보상 불가', safeElig({ categoriesCompleted: 0, starGrantLog: [] }).eligible === false)
check('2/4 -> 보상 불가', safeElig({ categoriesCompleted: 2, starGrantLog: [] }).eligible === false)
check('사유가 goal-not-met', safeElig({ categoriesCompleted: 2, starGrantLog: [] }).reason === 'goal-not-met')
check('3/4 달성 -> 보상 가능 (게이트 완화의 핵심)', safeElig({ categoriesCompleted: 3, starGrantLog: [] }).eligible === true)
check('4/4 달성 -> 보상 가능', safeElig({ categoriesCompleted: 4, starGrantLog: [] }).eligible === true)
check('3/4 달성 + 이미 1세션 보상 -> 한도 도달', safeElig({
  categoriesCompleted: 3, starGrantLog: ['matchgame:S1:0:w1', 'matchgame:S1:4:w5'],
}).eligible === false)
check('사유가 daily-limit', safeElig({
  categoriesCompleted: 4, starGrantLog: ['matchgame:S1:0:w1'],
}).reason === 'daily-limit')
check('둘 다 해당이면 goal-not-met 우선(안내 문구 일관성)', safeElig({
  categoriesCompleted: 1, starGrantLog: ['matchgame:S1:0:w1'],
}).reason === 'goal-not-met')
check('보상 가능할 때 reason은 null', safeElig({ categoriesCompleted: 3, starGrantLog: [] }).reason === null)
check('인자 누락에도 크래시 없이 불가 처리(방어)', safeElig({}).eligible === false)

console.log('\n4. App.jsx — 플레이는 막지 않고, 게이팅은 latch로 넘긴다')
{
  const appRaw = fs.readFileSync('src/App.jsx', 'utf8')
  // 주석 서술이 코드로 오탐되지 않게 `//` 이후를 제거(CRLF 안전 — `.`은 `\r`을
  // 매치하지 않아 CRLF 체크아웃에서 주석 제거가 실패하는 함정 회피).
  const app = appRaw.split('\n').map((l) => l.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n')
  check('gameRewardEligibility를 import해서 사용', /gameRewardEligibility/.test(app))
  check('차단 사유를 게임 화면에 전달(rewardBlockedReason)', /rewardBlockedReason=/.test(app))
  check('onGrantReward를 세션 도중 null로 바꾸지 않는다(9절 함정 방지)',
    /onGrantReward=\{grantReward\}/.test(app) && !/onGrantReward=\{[^}]*\?[^}]*:\s*null\}/.test(app))
  check('startRandomGame에는 목표 달성 조건이 없다(플레이 자유)', (() => {
    const m = app.match(/const startRandomGame = \(\) => \{[\s\S]*?\n  \}/)
    return !!m && !/categoriesCompleted|eligible|missionFullyDone/.test(m[0])
  })())
}

console.log('\n5. MatchGameShell.jsx — 세션 시작 시 자격 latch + 정직한 UI')
{
  const shellRaw = fs.readFileSync('src/components/MatchGameShell.jsx', 'utf8')
  const shell = shellRaw.split('\n').map((l) => l.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n')
  check('rewardBlockedReason prop을 받음', /rewardBlockedReason/.test(shell))
  check('세션 자격을 ref에 latch (startGame 시점 확정)', /sessionBlockedRef/.test(shell))
  check('startGame에서 latch를 갱신', /sessionBlockedRef\.current\s*=/.test(shell))
  check('라운드 지급이 latch된 값을 참조(실시간 prop이 아님)',
    /sessionBlockedRef\.current[\s\S]{0,200}onGrantReward\?\.|!sessionBlockedRef\.current/.test(shell))
  check('결과 화면 별 표시가 차단 여부를 반영', !/const totalStars = score \* STAR_PER_CORRECT\s*$/m.test(shell))
  check('차단 시 안내 문구가 존재(왜 별이 없는지 설명)', /목표|공부|먼저|내일/.test(shell))
  check('onGrantReward는 여전히 옵셔널 호출', /onGrantReward\?\./.test(shell))
}

console.log('\n6. 경제 불변식 — 하루 게임 상한 vs 학습 유래 별')
{
  const RATE = 0.942                 // 실측 퀴즈 정답률(게임 첫시도 정답률 대리 지표)
  const LEARN_MEDIAN_ON_3OF4 = 20    // 실데이터: 3/4 달성일의 학습 유래 별 중앙값
  const gameMax = (GAME_REWARD_DAILY_LIMIT || 0) * (ROUNDS || 0) * (STAR_PER_CORRECT || 0) * RATE
  check(`게임 하루 기대 상한 ${gameMax.toFixed(0)}별 <= 학습 중앙값 ${LEARN_MEDIAN_ON_3OF4}별 (역전 없음)`, gameMax <= LEARN_MEDIAN_ON_3OF4)
  check('하루 2세션이었다면 역전(1세션이 필요한 이유)', (2 * ROUNDS * STAR_PER_CORRECT * RATE) > LEARN_MEDIAN_ON_3OF4)
  check('구 정책(10별x무제한, 하루 5세션 가정) 대비 상한 90% 이상 감소',
    1 - (GAME_REWARD_DAILY_LIMIT * ROUNDS * STAR_PER_CORRECT) / (5 * ROUNDS * 10) >= 0.9)
}

console.log('\n7. 기존 학생 데이터 무변경 — 소급 차감/마이그레이션 없음')
{
  const shell = fs.readFileSync('src/components/MatchGameShell.jsx', 'utf8')
  const app = fs.readFileSync('src/App.jsx', 'utf8')
  const mgSrc = fs.readFileSync('src/utils/matchGame.js', 'utf8')
  const all = shell + app + mgSrc
  check('totalStars를 감소시키는 코드 없음', !/totalStars\s*[-]=|totalStars\s*-\s*\d/.test(all))
  check('새 영속 필드를 만들지 않음', !/gameRewardCount|rewardedGamesToday\s*:/.test(all))
  check('starGrantLog에서 파생만 함(쓰기 아님)', !/starGrantLog\s*=/.test(mgSrc))
}

console.log('\n8. 우회 시나리오 — 하루 1회 한도를 뚫을 수 있는가')
{
  const GOAL = GAME_REWARD_GOAL_CATEGORIES || 3
  // 한 세션이 끝난 뒤의 로그(5라운드분)
  const afterOne = ['matchgame:S1:0:a', 'matchgame:S1:1:b', 'matchgame:S1:2:c', 'matchgame:S1:3:d', 'matchgame:S1:4:e']
  check('① 연속 게임("한 번 더 하기") -> 2번째 판은 보상 불가',
    safeElig({ categoriesCompleted: GOAL, starGrantLog: afterOne }).eligible === false)
  check('② 새로고침/재로그인 — 같은 starGrantLog가 복원되면 여전히 불가',
    safeElig({ categoriesCompleted: GOAL, starGrantLog: [...afterOne] }).eligible === false)
  check('③ 여러 탭 — 두 탭 로그를 합집합해도 세션 수는 1, 한도 유지',
    safeCount([...afterOne, ...afterOne]) === 1 &&
    safeElig({ categoriesCompleted: GOAL, starGrantLog: [...afterOne, ...afterOne] }).eligible === false)
  check('④ 여러 탭에서 각각 다른 판 -> 세션 2개로 집계되어 역시 불가',
    safeCount([...afterOne, 'matchgame:S2:0:x']) === 2 &&
    safeElig({ categoriesCompleted: GOAL, starGrantLog: [...afterOne, 'matchgame:S2:0:x'] }).eligible === false)
  check('⑤ 자정 리셋 — round가 새로 시작(로그 비움)되면 다시 보상 가능',
    safeElig({ categoriesCompleted: GOAL, starGrantLog: [] }).eligible === true)
  check('⑥ 목표를 나중에 채워도 이미 쓴 보상은 되살아나지 않음',
    safeElig({ categoriesCompleted: 4, starGrantLog: afterOne }).eligible === false)
  check('⑦ 무보상 플레이는 한도를 깎지 않는다(로그에 안 남으므로)',
    safeElig({ categoriesCompleted: GOAL, starGrantLog: [] }).eligible === true)
  // 자정 리셋이 실제로 로그를 비우는지 = useStudent.js 계약 확인
  const us = fs.readFileSync('src/hooks/useStudent.js', 'utf8')
  check('⑧ useStudent가 날짜 변경 시 round를 freshRound()로 교체(로그 초기화)',
    /round\.date !== todayStr\(\)/.test(us) && /round: freshRound\(\)/.test(us))
  check('⑨ freshRound의 starGrantLog 초기값이 빈 배열', /starGrantLog: \[\]/.test(us))
  check('⑩ 다중 탭 병합이 starGrantLog를 합집합으로 처리(유실/중복 없음)',
    /starGrantLog: unionList\(local\.round\.starGrantLog, cloud\.round\.starGrantLog\)/.test(us))
}

console.log('\n9. 세션 latch 시뮬레이션 — 한 판 5라운드가 통째로 지급되는가')
{
  const GOAL = GAME_REWARD_GOAL_CATEGORIES || 3
  // latch 없이 매 라운드 실시간 판정하면 1라운드 뒤 막힌다는 것을 먼저 보인다
  {
    const log = []
    let granted = 0
    for (let r = 0; r < ROUNDS; r++) {
      if (gameRewardEligibility({ categoriesCompleted: GOAL, starGrantLog: log }).eligible) {
        granted++; log.push(`matchgame:S1:${r}:w`)
      }
    }
    check(`latch 없이 실시간 판정하면 ${granted}/5라운드만 지급된다(= 하루 1회가 하루 1라운드로 붕괴)`, granted === 1)
  }
  // latch가 있으면 판 전체가 지급되고, 다음 판이 막힌다
  {
    const log = []
    const sessionBlocked = !gameRewardEligibility({ categoriesCompleted: GOAL, starGrantLog: log }).eligible
    let granted = 0
    for (let r = 0; r < ROUNDS; r++) if (!sessionBlocked) { granted++; log.push(`matchgame:S1:${r}:w`) }
    check('latch 적용 시 1판 = 5라운드 전부 지급', granted === 5)
    check(`1판 지급액 = ${ROUNDS * STAR_PER_CORRECT}별`, granted * STAR_PER_CORRECT === 20)
    const secondBlocked = !gameRewardEligibility({ categoriesCompleted: GOAL, starGrantLog: log }).eligible
    check('두 번째 판은 시작 시점에 차단(latch가 daily-limit을 잡음)', secondBlocked === true)
    let granted2 = 0
    for (let r = 0; r < ROUNDS; r++) if (!secondBlocked) granted2++
    check('두 번째 판 지급 0라운드', granted2 === 0)
    check('하루 총 지급이 상한 20별을 넘지 않음', (granted + granted2) * STAR_PER_CORRECT <= GAME_REWARD_DAILY_LIMIT * ROUNDS * STAR_PER_CORRECT)
  }
}

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0 ? '모든 단언 통과 — 게임 보상 정책 고정 ✅' : `${failures}개 단언 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
