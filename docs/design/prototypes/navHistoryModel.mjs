// 순수 상태머신 프로토타입 — 모바일 뒤로가기(시스템 Back) 앱 이탈 문제
// (docs/design/MOBILE_BACK_NAVIGATION_DESIGN.md 2026-09-09 설계 + 2026-09-09
// 후속 "설계 대안 비교 + 결정론적 테스트 하네스" 섹션 참고)
//
// 이 파일은 격리된 프로토타입이다 — React/window/DOM 접촉 0, 실제
// src/App.jsx나 src/utils/navHistory.js(미구현)를 import하지 않는다.
// 순수하게 이벤트 → 다음 상태를 계산하는 함수/팩토리만 담는다.
//
// 채택한 설계: 대안 A(화면당 1 history-entry + 루트 sentinel), 단
// "Phase 1 매핑 대상" 화면만 실제로 스택에 push하고, 그 외 화면
// (guidedSession/bonusChoice/game/sentenceFlow)은 스택에 아예 손대지
// 않는다 — 설계 문서 6장 "페이즈 1" 스코프와 동일. 상세 근거는 설계
// 문서의 "설계 대안 비교" 섹션 참고.
//
// 이벤트 4종(과제 스펙 그대로):
//   navigate(screen) — 화면 전환(대시보드 CTA, 인앱 "뒤로"/"완료" 버튼 등
//                       screen state를 바꾸는 모든 경로를 통칭. 즉 App.jsx의
//                       setScreen(...) 호출 지점 전부가 이 이벤트에 대응).
//   back()           — popstate(시스템/브라우저 Back, iOS 스와이프,
//                       Android 제스처/버튼 전부 동일하게 popstate로
//                       도착한다고 가정 — 이 가정 자체는 "미검증", 설계
//                       문서 4.4절/본 문서 리스크 섹션 참고).
//   refresh()        — 새로고침. 히스토리 스택은 메모리 전용이라 전부
//                       리셋된다(설계 문서 5장 "신규로 고정해야 할 테스트"
//                       3번 요구사항 그대로 구현).
//   exitIntent()     — "한 번 더 누르면 종료" 토스트의 타임아웃 만료를
//                       모델링한다(설계 문서 4.2절 "토스트 타임아웃 후에는
//                       다시 1차 Back 취급으로 리셋"). back()과 별도 이벤트로
//                       분리한 이유는 설계 문서 부속 섹션 "exitIntent 이벤트
//                       정의" 참고 — 실제 두 번째 Back 그 자체가 아니라
//                       "확인 대기 상태가 시간 경과로 해제됨"을 나타낸다.

// src/App.jsx에서 실제로 읽어(grep으로 21개 screen === '...' 분기 확인,
// App.jsx:730-995) 그대로 옮긴 값 — 절대 임의로 추가/축약하지 않는다.
export const ALL_SCREENS = Object.freeze([
  'dashboard',
  'guidedSession',
  'sentenceFlow',
  'wordBrowser',
  'wordDetail',
  'quiz',
  'levelUpMission',
  'diary',
  'studyCalendar',
  'hatCollection',
  'wordMuseum',
  'growthAlbum',
  'englishGarden',
  'paulTown',
  'bookshelf',
  'timeMachine',
  'bonusChoice',
  'game',
  'entranceTest',
  'spellingResult',
  'spellingReview',
])

// 설계 문서 6장 "페이즈 1" 목록 — 이미 명확한 1탭 onBack/onDone이 있는
// 화면만 스택에 push해 popstate가 그 화면으로 자연스럽게 돌아오게 한다.
// dashboard는 루트 sentinel 바로 위 앵커로 항상 포함(최초 마운트 시 push).
export const TRACKED_SCREENS = Object.freeze([
  'dashboard',
  'wordBrowser',
  'wordDetail',
  'quiz',
  'levelUpMission',
  'diary',
  'studyCalendar',
  'hatCollection',
  'wordMuseum',
  'growthAlbum',
  'englishGarden',
  'paulTown',
  'bookshelf',
  'timeMachine',
  'entranceTest',
  'spellingResult',
  'spellingReview',
])

// 페이즈 1 명시적 제외(설계 문서 6장) — 스택에 push하지 않는다. Back이
// 이 화면들 위에서 눌리면, 스택은 "이 화면에 들어오기 직전" 상태 그대로라
// 자연스럽게 그 이전 지점(대부분 dashboard 또는 그 아래 sentinel)을
// 기준으로 트랩/이동이 판정된다 — 즉 이 화면 자체로는 절대 setScreen이
// 호출되지 않는다(4.4/3.5절 GuidedSession key 리마운트 우려에 대한 답).
export const EXCLUDED_SCREENS = Object.freeze([
  'guidedSession',
  'bonusChoice',
  'game',
  'sentenceFlow',
])

// 문서화 목적 + 테스트에서 "자연스러운 경로로 이동했을 때 popstate가
// 실제로 이 목표와 일치하는가"를 교차 검증하기 위한 참고표(설계 문서
// 1.2절 표를 그대로 옮김). onDone류(spellingResult/spellingReview)도
// 포함 — 이들은 popstate가 아니라 버튼이 트리거하지만, 그 목표 화면이
// 스택 상 조상이라 아래 navigate() 규칙으로 동일하게 처리된다.
export const ONBACK_TARGETS = Object.freeze({
  wordBrowser: 'dashboard',
  wordDetail: 'wordBrowser',
  quiz: 'dashboard',
  levelUpMission: 'dashboard',
  diary: 'dashboard',
  studyCalendar: 'dashboard',
  hatCollection: 'dashboard',
  wordMuseum: 'dashboard',
  growthAlbum: 'dashboard',
  englishGarden: 'dashboard',
  paulTown: 'dashboard',
  bookshelf: 'paulTown',
  timeMachine: 'paulTown',
  entranceTest: 'dashboard',
  spellingResult: 'wordBrowser',
  spellingReview: 'dashboard',
})

export const ROOT_SENTINEL = '__root__'
export const TRAP_MESSAGE = '한 번 더 뒤로가면 종료돼요'

const isTracked = (screen) => TRACKED_SCREENS.includes(screen)

/**
 * 순수 상태머신 팩토리. DOM/history/React 접촉 없음 — 전부 메모리 내
 * 배열/문자열 연산이다. 반환된 인스턴스는 event를 받아 다음 상태를
 * 계산하고, 매 이벤트 호출마다 { screen, historyDepth, shouldConfirmExit,
 * toast, screenChanged, exited } 스냅샷을 돌려준다.
 */
export function createNavHistoryModel() {
  // AppInner 최초 마운트 시 1회: replaceState(__root__) 후 dashboard를
  // push한다는 설계 문서 4.1절을 그대로 초기 스택으로 표현.
  let stack = [ROOT_SENTINEL, 'dashboard']
  let screen = 'dashboard'
  let shouldConfirmExit = false
  let toast = null
  let exited = false

  const snapshot = (screenChanged) => ({
    screen,
    historyDepth: stack.length,
    shouldConfirmExit,
    toast,
    screenChanged,
    exited,
    // 디버그/테스트 전용 — 실제 구현은 이 배열을 그대로 노출할 필요 없음.
    stack: stack.slice(),
  })

  function navigate(nextScreen) {
    if (exited) return snapshot(false) // 이미 이탈한 뒤에는 no-op(방어적)
    const prevScreen = screen
    screen = nextScreen

    // 어떤 실제 화면 전환이든(뒤로가기 버튼이든 CTA든) 진짜 내비게이션이
    // 일어났다는 뜻이므로 "한 번 더 누르면 종료" 대기 상태는 해제한다.
    if (shouldConfirmExit) { shouldConfirmExit = false; toast = null }

    if (!isTracked(nextScreen)) {
      // 페이즈 1 제외 화면 — 스택 불변. guidedSession/bonusChoice/game/
      // sentenceFlow로 들어가도 history entry가 생기지 않는다.
      return snapshot(prevScreen !== screen)
    }

    const top = stack[stack.length - 1]
    if (nextScreen === top) {
      // 멱등 가드 — 같은 화면으로의 재호출은 push하지 않는다(3.5절
      // GuidedSession 불필요 리마운트 방지 규칙과 동일 정신을 여기 화면
      // 레벨에도 적용).
      return snapshot(prevScreen !== screen)
    }

    const existingIdx = stack.indexOf(nextScreen)
    if (existingIdx !== -1) {
      // 조상 화면으로 되돌아가는 인앱 버튼(예: bookshelf onBack → paulTown,
      // spellingResult onDone → wordBrowser) — 새 entry를 push하는 대신
      // 그 조상 지점까지만 남기고 그 위 항목들을 전부 들어낸다(브라우저가
      // 물리적으로 그만큼 pop한 상태를 흉내). 이렇게 하지 않으면 같은
      // 화면 이름이 스택에 중복 누적되어, 그 다음 실제 popstate가 "직전
      // 화면"이 아니라 엉뚱한 옛 화면을 되살리게 된다.
      stack = stack.slice(0, existingIdx + 1)
      return snapshot(prevScreen !== screen)
    }

    // 완전히 새로운 전진 이동 — push.
    stack.push(nextScreen)
    return snapshot(prevScreen !== screen)
  }

  function back() {
    if (exited) return snapshot(false)
    const prevScreen = screen

    if (stack.length === 0) {
      // 이미 우리 sentinel 밖으로 나간 상태 — 더 이상 모델이 관여할 수
      // 없는 진짜 탭 이탈. 반복 호출에도 안전하게 no-op.
      exited = true
      return snapshot(false)
    }

    stack.pop() // 브라우저가 popstate로 이미 한 칸 이동한 것을 반영
    const newTop = stack[stack.length - 1]

    if (newTop === undefined) {
      exited = true
      return snapshot(false)
    }

    if (newTop === ROOT_SENTINEL) {
      if (shouldConfirmExit) {
        // 토스트가 떠 있는 동안의 2차 Back — 재삽입하지 않고 그대로
        // 이탈을 허용한다(설계 문서 4.2절).
        stack.pop()
        shouldConfirmExit = false
        toast = null
        exited = true
        return snapshot(false)
      }
      // 1차 Back — 같은 sentinel을 재삽입해 깊이를 원복하고 토스트를
      // 띄운다. 화면(screen)은 절대 건드리지 않는다 — 이 분기가
      // guidedSession/bonusChoice 같은 페이즈1 제외 화면 위에서 Back이
      // 눌렸을 때도 그대로 타는 경로이며, screen을 안 바꾸는 것이 곧
      // "GuidedSession이 리마운트되지 않는다"는 보장이다.
      stack.push(ROOT_SENTINEL)
      shouldConfirmExit = true
      toast = TRAP_MESSAGE
      return snapshot(false)
    }

    // 일반 화면으로의 복귀 — 기존 onBack 콜백과 동일한 목적지가 되도록,
    // push 시점에 쌓인 조상 순서를 그대로 되짚는다.
    shouldConfirmExit = false
    toast = null
    if (newTop !== screen) {
      screen = newTop
      return snapshot(true)
    }
    return snapshot(false)
  }

  function refresh() {
    // 히스토리 스택은 메모리 전용 — 새로고침 시 전부 리셋. navHistory가
    // history.state를 읽어 이전 화면으로 되돌리려 시도하지 않는다는
    // 설계 문서 5장 요구사항을 그대로 구현: 항상 dashboard로 재부팅.
    const prevScreen = screen
    stack = [ROOT_SENTINEL, 'dashboard']
    screen = 'dashboard'
    shouldConfirmExit = false
    toast = null
    exited = false
    return snapshot(prevScreen !== screen)
  }

  function exitIntent() {
    // 토스트 타임아웃 만료 모델링 — 대기 상태만 해제, 스택/화면 불변.
    if (shouldConfirmExit) {
      shouldConfirmExit = false
      toast = null
    }
    return snapshot(false)
  }

  function getState() {
    return snapshot(false)
  }

  return { navigate, back, refresh, exitIntent, getState }
}
