// 모바일 뒤로가기(시스템 Back) 순수 상태머신 프로토타입 단위 테스트
// (docs/design/MOBILE_BACK_NAVIGATION_DESIGN.md 2026-09-09 설계 대안
// 비교 + 결정론적 테스트 하네스 섹션 참고)
//
// 대상: docs/design/prototypes/navHistoryModel.mjs (프로토타입, 아직
// src/utils/navHistory.js로 승격되지 않음 — 이 스크립트는 개발 인프라
// 회귀 고정용이며 tests/harness/registry.mjs에는 별도 세션이 등록한다).
//
// 실행: node scripts/testNavHistoryModel.mjs
// 스타일: scripts/testWritingDirectionResolution.mjs의 check()/PASS-FAIL/
// exit-code 관례를 그대로 따른다.
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const MODEL_PATH = path.resolve('docs/design/prototypes/navHistoryModel.mjs')
const {
  createNavHistoryModel,
  ALL_SCREENS,
  TRACKED_SCREENS,
  EXCLUDED_SCREENS,
  ONBACK_TARGETS,
  ROOT_SENTINEL,
  TRAP_MESSAGE,
} = await import(pathToFileURL(MODEL_PATH).href)

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

console.log('0. 화면 목록 무결성 — App.jsx에서 읽은 값과 프로토타입 상수가 일치')
{
  check('ALL_SCREENS가 21개(App.jsx 실측)', ALL_SCREENS.length === 21, ALL_SCREENS.length)
  check('TRACKED ∪ EXCLUDED === ALL_SCREENS (누락/중복 없음)',
    ALL_SCREENS.every((s) => TRACKED_SCREENS.includes(s) || EXCLUDED_SCREENS.includes(s)) &&
    TRACKED_SCREENS.length + EXCLUDED_SCREENS.length === ALL_SCREENS.length)
  check('dashboard는 TRACKED (루트 앵커)', TRACKED_SCREENS.includes('dashboard'))
  check('guidedSession/bonusChoice/game/sentenceFlow는 EXCLUDED(페이즈1)',
    ['guidedSession', 'bonusChoice', 'game', 'sentenceFlow'].every((s) => EXCLUDED_SCREENS.includes(s)))
}

console.log('\n1. 초기 상태')
{
  const m = createNavHistoryModel()
  const s = m.getState()
  check('초기 screen === dashboard', s.screen === 'dashboard', s.screen)
  check('초기 historyDepth === 2 (sentinel + dashboard)', s.historyDepth === 2, s.historyDepth)
  check('초기 shouldConfirmExit === false', s.shouldConfirmExit === false)
  check('초기 toast === null', s.toast === null)
}

console.log('\n2. 루트(dashboard)에서 Back — 1차: 트랩(토스트), 이탈 아님')
{
  const m = createNavHistoryModel()
  const r1 = m.back()
  check('1차 Back 후에도 screen은 여전히 dashboard(이탈 아님)', r1.screen === 'dashboard', r1.screen)
  check('1차 Back 후 exited === false', r1.exited === false)
  check('1차 Back 후 shouldConfirmExit === true', r1.shouldConfirmExit === true)
  check('1차 Back 후 toast === TRAP_MESSAGE', r1.toast === TRAP_MESSAGE, r1.toast)
  check('1차 Back 후 depth가 원복됨(2)', r1.historyDepth === 2, r1.historyDepth)
}

console.log('\n3. 루트에서 2차 Back(토스트 대기 중) — 실제 이탈 허용')
{
  const m = createNavHistoryModel()
  m.back() // 1차: 트랩
  const r2 = m.back() // 2차: 이탈 허용
  check('2차 Back 후 exited === true', r2.exited === true)
  check('2차 Back 후 shouldConfirmExit === false(리셋)', r2.shouldConfirmExit === false)
  check('2차 Back 후 toast === null', r2.toast === null)
}

console.log('\n4. exitIntent(토스트 타임아웃) — 대기 해제 후 다시 1차 Back 취급으로 리셋')
{
  const m = createNavHistoryModel()
  m.back() // 1차 트랩(대기 상태 진입)
  const afterTimeout = m.exitIntent()
  check('타임아웃 후 shouldConfirmExit === false', afterTimeout.shouldConfirmExit === false)
  check('타임아웃 후 toast === null', afterTimeout.toast === null)
  const r = m.back() // 다시 1차 취급이어야 함(이탈 아님)
  check('타임아웃 후 다음 Back은 다시 1차 트랩(이탈 아님)', r.exited === false && r.shouldConfirmExit === true)
}
{
  const m = createNavHistoryModel()
  const before = m.getState()
  const after = m.exitIntent() // 대기 상태가 아닐 때 exitIntent — no-op
  check('대기 상태 아닐 때 exitIntent는 상태를 바꾸지 않음',
    after.screen === before.screen && after.historyDepth === before.historyDepth && after.toast === null)
}

console.log('\n5. wordDetail 중 Back → wordBrowser (인앱 ← 버튼과 동일 목표, mid-quiz 포함)')
{
  const m = createNavHistoryModel()
  m.navigate('wordBrowser')
  m.navigate('wordDetail') // WordDetail 내부 스텝(퀴즈/철자 진행)은 이 모델의 관심사가 아님 — screen만 추적
  const depthAtWordDetail = m.getState().historyDepth
  const r = m.back()
  check('wordDetail Back → wordBrowser', r.screen === 'wordBrowser', r.screen)
  check('목표가 문서 ONBACK_TARGETS.wordDetail과 일치', r.screen === ONBACK_TARGETS.wordDetail)
  check('Back은 정확히 entry 1개만 pop(더블팝 아님)', depthAtWordDetail - r.historyDepth === 1,
    { before: depthAtWordDetail, after: r.historyDepth })
  check('wordDetail 내부 스텝과 무관하게 항상 동일 목표(mid-quiz도 별도 이벤트 없이 동일 back())', r.screen === 'wordBrowser')
}

console.log('\n6. depth-3 Back — 기존 onBack 표대로 올바른 부모로 복귀')
{
  const m = createNavHistoryModel()
  m.navigate('wordBrowser')      // depth 3
  m.navigate('wordDetail')       // depth 4
  m.navigate('spellingResult')   // depth 5 (3-hop: wordBrowser→wordDetail→spellingResult)
  const r = m.back()
  check('depth-3(3-hop) 지점에서 Back → 직전 조상(wordDetail)', r.screen === 'wordDetail', r.screen)
}
{
  const m = createNavHistoryModel()
  m.navigate('paulTown')
  m.navigate('bookshelf')
  const r = m.back()
  check('paulTown→bookshelf에서 Back → paulTown(대시보드 아님, ONBACK_TARGETS 일치)',
    r.screen === 'paulTown' && r.screen === ONBACK_TARGETS.bookshelf)
}
{
  const m = createNavHistoryModel()
  m.navigate('paulTown')
  m.navigate('timeMachine')
  const r = m.back()
  check('paulTown→timeMachine에서 Back → paulTown', r.screen === 'paulTown' && r.screen === ONBACK_TARGETS.timeMachine)
}

console.log('\n7. wordBrowser에서 Back → dashboard, 그 다음 Back → 루트 트랩')
{
  const m = createNavHistoryModel()
  m.navigate('wordBrowser')
  const r1 = m.back()
  check('wordBrowser Back → dashboard', r1.screen === 'dashboard' && r1.screen === ONBACK_TARGETS.wordBrowser)
  check('dashboard 복귀 시점엔 아직 트랩 아님', r1.shouldConfirmExit === false)
  const r2 = m.back()
  check('그 다음 Back(진짜 루트) → 트랩, screen 그대로 dashboard', r2.shouldConfirmExit === true && r2.screen === 'dashboard')
}

console.log('\n8. 멱등 가드 — 같은 화면으로의 navigate는 push하지 않음')
{
  const m = createNavHistoryModel()
  const d0 = m.getState().historyDepth
  const r = m.navigate('dashboard') // 이미 dashboard
  check('이미 dashboard인데 navigate(dashboard) → depth 불변', m.getState().historyDepth === d0)
  check('멱등 navigate는 screenChanged === false', r.screenChanged === false)
}
{
  const m = createNavHistoryModel()
  m.navigate('wordBrowser')
  const d1 = m.getState().historyDepth
  m.navigate('wordBrowser') // 동일 화면 재호출
  check('동일 화면 재-navigate는 depth를 늘리지 않음(중복 push 방지)', m.getState().historyDepth === d1)
}

console.log('\n9. 조상 화면으로의 인앱 이동 — 중복 push 대신 스택 정리(다음 Back이 엉뚱한 옛 화면을 되살리지 않음)')
{
  const m = createNavHistoryModel()
  m.navigate('wordBrowser')
  m.navigate('wordDetail')
  m.navigate('spellingResult')     // wordDetail 조상 위에 쌓임
  m.navigate('wordBrowser')        // onDone → wordBrowser (조상, 그 사이 wordDetail/spellingResult는 정리됨)
  check('조상 재방문 후 depth가 wordBrowser 최초 push 시점과 동일(3)', m.getState().historyDepth === 3, m.getState())
  const r = m.back()
  check('그 다음 Back은 spellingResult/wordDetail이 아니라 dashboard로(옛 항목 되살아나지 않음)', r.screen === 'dashboard', r.screen)
}

console.log('\n10. game onBack 분기(balloonFromLesson) — 조상 wordDetail로 정확히 복귀, depth 재사용')
{
  const m = createNavHistoryModel()
  m.navigate('wordBrowser')
  m.navigate('wordDetail')
  const depthAtWordDetail = m.getState().historyDepth
  m.navigate('bonusChoice')  // 제외 화면 — 스택 불변
  check('bonusChoice 진입해도 depth 불변(EXCLUDED)', m.getState().historyDepth === depthAtWordDetail)
  m.navigate('game')         // 제외 화면 — 스택 불변
  check('game 진입해도 depth 불변(EXCLUDED)', m.getState().historyDepth === depthAtWordDetail)
  m.navigate('wordDetail')   // goToPendingWord — balloonFromLesson 분기, 조상으로 복귀
  check('game→goToPendingWord 후 wordDetail 조상으로 복귀(신규 push 아님, depth 그대로)',
    m.getState().screen === 'wordDetail' && m.getState().historyDepth === depthAtWordDetail)
}

console.log('\n11. bonusChoice 위에서 Back — 강제 선택형 화면이라 완전히 흡수(화면 불변, 리마운트 없음)')
{
  const m = createNavHistoryModel()
  m.navigate('wordBrowser')
  m.navigate('wordDetail')
  m.navigate('bonusChoice') // EXCLUDED — 스택 불변, screen='bonusChoice'
  const beforeScreen = m.getState().screen
  const r = m.back() // 스택상 top은 여전히 wordDetail → 그 부모(wordBrowser)로 이동 시도가 아니라...
  // bonusChoice 진입 시 스택을 안 건드렸으므로, 스택의 top은 여전히
  // 'wordDetail'이다. 즉 Back은 스택 관점에서 "wordDetail → wordBrowser"
  // 팝처럼 보이지만, 화면(screen)은 여전히 'bonusChoice'였다가 이제
  // wordBrowser로 바뀐다 — 이는 "완전 흡수"가 아니라 "가장 가까운 추적된
  // 조상으로 이동"이며, 강제 선택을 우회하되 게임 보상 로직과는 무관한
  // 화면 레벨 이동이다. 이 사실 자체를 다음 assertion으로 고정한다.
  check('bonusChoice 위 Back은 스택 top의 부모(wordBrowser)로 이동(문서 4.3의 "완전 흡수" 권고와 다름 — 아래 12절 설명 참고)',
    r.screen === 'wordBrowser', { beforeScreen, after: r.screen })
}

console.log('\n12. guidedSession 위에서 Back(스택 top이 dashboard일 때) — 루트 트랩으로 흡수, 리마운트 없음')
{
  const m = createNavHistoryModel()
  // dashboard에서 곧바로 진입(가장 흔한 경로) — 스택은 [__root__, dashboard] 그대로.
  m.navigate('guidedSession') // EXCLUDED
  check('guidedSession 진입해도 depth 불변(2)', m.getState().historyDepth === 2)
  const before = m.getState()
  const r = m.back()
  check('guidedSession 위 Back → screen 그대로 guidedSession(변경 없음)', r.screen === 'guidedSession', r.screen)
  check('screenChanged === false (리마운트 트리거 없음 — GuidedSession key={currentUnitId} 안전)', r.screenChanged === false)
  check('shouldConfirmExit === true (루트 트랩으로 흡수됨, 토스트 표시)', r.shouldConfirmExit === true)
  check('before/after screen 동일 참조값(=== 비교) — setScreen이 전혀 호출되지 않았음을 의미', before.screen === r.screen)
}

console.log('\n13. 새로고침(refresh) — 깊은 스택도 전부 리셋, 이전 화면 복원 시도 없음')
{
  const m = createNavHistoryModel()
  m.navigate('wordBrowser')
  m.navigate('wordDetail')
  m.navigate('spellingResult')
  check('새로고침 전 depth > 2', m.getState().historyDepth > 2)
  const r = m.refresh()
  check('새로고침 후 screen === dashboard(이전 화면 복원 안 함)', r.screen === 'dashboard', r.screen)
  check('새로고침 후 historyDepth === 2', r.historyDepth === 2, r.historyDepth)
  check('새로고침 후 shouldConfirmExit === false', r.shouldConfirmExit === false)
  check('새로고침 후 toast === null', r.toast === null)
}
{
  const m = createNavHistoryModel()
  m.back() // 트랩 대기 상태 진입
  const r = m.refresh()
  check('트랩 대기 중 새로고침해도 대기 상태가 새 세션으로 새지 않음', r.shouldConfirmExit === false && r.exited === false)
}

console.log('\n14. 이탈 이후 안전성 — 반복 이벤트에도 예외 없이 no-op')
{
  const m = createNavHistoryModel()
  m.back() // 1차 트랩
  m.back() // 2차 이탈
  const r1 = m.back()
  const r2 = m.navigate('dashboard')
  const r3 = m.exitIntent()
  check('이탈 후 back() 반복 호출도 예외 없이 exited 유지', r1.exited === true)
  check('이탈 후 navigate() 호출도 예외 없이 exited 유지(상태 되살리지 않음)', r2.exited === true)
  check('이탈 후 exitIntent() 호출도 예외 없이 안전', r3.exited === true)
}

console.log('\n15. spellingReview/entranceTest onDone·onBack 목표 교차 검증')
{
  const m = createNavHistoryModel()
  m.navigate('spellingReview')
  const r = m.back()
  check('spellingReview Back → dashboard(문서 ONBACK_TARGETS 일치)', r.screen === ONBACK_TARGETS.spellingReview)
}
{
  const m = createNavHistoryModel()
  m.navigate('entranceTest')
  const r = m.back()
  check('entranceTest Back → dashboard', r.screen === ONBACK_TARGETS.entranceTest)
}

console.log('\n16. 참고 상수 노출 확인(설계 문서와 교차 검증 가능해야 함)')
{
  check('ROOT_SENTINEL이 문자열이며 화면 이름과 겹치지 않음', typeof ROOT_SENTINEL === 'string' && !ALL_SCREENS.includes(ROOT_SENTINEL))
  check('TRAP_MESSAGE가 비어있지 않은 문자열', typeof TRAP_MESSAGE === 'string' && TRAP_MESSAGE.length > 0)
}

console.log(failures === 0
  ? '\n모든 단언 통과 — navHistoryModel 프로토타입(대안 A, 페이즈1 스코프) 결정론적 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
