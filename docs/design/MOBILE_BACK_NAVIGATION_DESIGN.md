# 모바일 뒤로가기(시스템 Back) 앱 이탈 문제 — 설계 문서

_작성일 2026-09-09 · 브랜치 `qa/overnight-2026-09-09` · 상태: 설계만(코드 미구현)_
_이 문서는 조사 결과 + 설계 제안이며, 구현은 본 세션 범위 밖이다. 모든
주장은 파일 경로/줄번호로 검증했고, 실기기 검증이 필요한 항목은 "미검증"
으로 명시한다._

## 0. 결론 요약

- **원인 확정**: `src/App.jsx`를 포함해 `src/` 전체에 `history.pushState`/
  `popstate`/`hashchange`/`location.hash` 조작이 **단 한 곳도 없다**
  (`grep -rn "location.hash|window.history|popstate|pushState|hashchange"`
  결과, 실제 히스토리 API 사용 0건 — `useStudent.js:1928`의 매치는
  "beforeunload"라는 **단어가 주석 안에** 있을 뿐 실제 리스너 아님).
  화면 전환은 전부 `AppInner`의 `const [screen, setScreen] = useState('dashboard')`
  (`src/App.jsx:175`) 메모리 state 하나로만 이뤄진다. 브라우저 입장에서는
  이 앱이 로드된 뒤로 **페이지 이동이 한 번도 없었던 것**과 동일하므로,
  탭의 세션 히스토리 엔트리 수가 늘지 않는다 — 시스템/브라우저 Back을
  누르면 이 탭에 남은 "이전" 항목(그 앱을 열기 전 페이지, 또는 없음)으로
  바로 넘어가 사실상 **앱을 나가거나 탭이 닫힌다**.
- **라우터 없음 확정**: `package.json`의 `dependencies`에 `react-router` 등
  라우팅 라이브러리가 없다(`react`/`react-dom`/`@supabase/supabase-js`/
  `pdfjs-dist`/`xlsx`/`@anthropic-ai/sdk`뿐, `package.json:123-130`).
- **PWA/standalone 아님 확정**: `public/manifest*.json` 없음(`find` 결과
  0건), `index.html`(`C:\voca\index.html:1-17`)에 `<link rel="manifest">`
  없음, `src/main.jsx`에 서비스워커 등록 코드 없음(파일 전체 6줄, 순수
  `ReactDOM.createRoot(...).render(<App/>)`뿐). 즉 학생은 항상 **일반
  브라우저 탭**(또는 카카오톡 등 인앱 브라우저)에서 이 앱을 연다 —
  주소창이 있는 상태이므로 "시스템 Back"은 대부분 iOS Safari 좌측 엣지
  스와이프 또는 Android 브라우저의 뒤로가기 버튼/제스처를 의미한다.
- **실사용 시나리오상 심각도가 특히 높은 이유**: 학생/학부모는 보통
  카카오톡·문자로 공유된 링크를 눌러 앱을 "새로" 연다. 이 경우 그 탭의
  히스토리에는 이 사이트 진입 시점 항목이 **딱 하나**뿐이라, 로그인 직후
  Dashboard에서 Back을 한 번만 눌러도 즉시 카카오톡/홈으로 튕겨나간다 —
  실측 필요 없이 구조적으로 100% 재현되는 경로다.

## 1. 내비게이션 아키텍처 지도

### 1.1 상태 구조

`src/App.jsx`는 두 레벨의 화면 전환 상태를 갖는다.

| 레벨 | 소유 컴포넌트 | 상태 | 값 종류 |
|---|---|---|---|
| 루트(로그인 이전/관리자/학부모) | `App()` (`App.jsx:1023`) | `student`(세션), `showAdmin`, `showParent` | 로그인 여부로 `StudentSelect`/`AdminScreen`/`ParentScreen`/`AppInner` 4갈래 분기(`App.jsx:1174-1208`) |
| 학생 메인 화면 | `AppInner()` (`App.jsx:174`) | `screen` (`App.jsx:175`, 문자열 state) | 아래 1.2 표의 20개 값 |

`AdminScreen`/`ParentScreen` 진입·이탈도 `showAdmin`/`showParent` boolean
토글일 뿐 히스토리 개입이 없다(`App.jsx:1174-1201`, `onBack={() =>
setAdmin(false)}` / `onBack={() => setParent(false)}`).

### 1.2 `screen` 값과 뒤로가기(in-app ←) 대응표

`AppInner`가 렌더하는 20개 `screen` 값과 각 화면의 인앱 "뒤로" 동작을
`App.jsx`에서 실제로 읽어 정리했다(값/줄번호는 실제 JSX 조건문 기준).

| screen 값 | 진입 트리거(발췌) | 인앱 뒤로가기(`onBack`/`onDone` 등) | 근거 줄 |
|---|---|---|---|
| `dashboard` (초기값) | 앱 최초 진입 | (최상위 — 뒤로가기 버튼 없음, 로그아웃만) | `App.jsx:175`, `730-743` |
| `guidedSession` | `startGuidedSession()`(대시보드 CTA) | `onDone={() => setScreen('dashboard')}` — **`onBack` prop 자체가 없음** (자체 종료 버튼만) | `App.jsx:499`, `744-793` |
| `sentenceFlow` | GuidedSession의 "핵심 문장 도전" 오퍼 | `onClose={() => { setPendingKeySentence(null); setScreen('dashboard') }}` | `App.jsx:507`, `794-810` |
| `wordBrowser` | 대시보드/WordDetail 등에서 이동 | `onBack={() => setScreen('dashboard')}` | `App.jsx:812` |
| `wordDetail` | `handleWordSelect`/`goToWordIndex`/`goToPendingWord` | `onBack={() => setScreen('wordBrowser')}` | `App.jsx:830` |
| `quiz` | 대시보드 게임/미션 경로 | `onBack={() => setScreen('dashboard')}` | `App.jsx:856` |
| `levelUpMission` | 대시보드 | `onBack={() => setScreen('dashboard')}` | `App.jsx:863` |
| `diary` | 대시보드 | `onBack={() => setScreen('dashboard')}` | `App.jsx:864` |
| `studyCalendar` | 대시보드 | `onBack={() => setScreen('dashboard')}` | `App.jsx:865` |
| `hatCollection`/`wordMuseum`/`growthAlbum`/`englishGarden` | 대시보드 "더 많은 메뉴" | 전부 `onBack={() => setScreen('dashboard')}` | `App.jsx:877-891` |
| `paulTown` | 홈 밴드 "구경가기" | `onBack={() => setScreen('dashboard')}` | `App.jsx:899` |
| `bookshelf`/`timeMachine` | PaulTown 건물 카드 | `onBack={() => setScreen('paulTown')}` (대시보드 아님 — 마을로) | `App.jsx:907`, `911` |
| `bonusChoice` | `handleNextWord()` 5단어마다 | `onPlayGame`(게임행) / `onContinue={goToPendingWord}` — 명시적 "뒤로" 없음, 선택 강제형 화면 | `App.jsx:671-674`, `915-922` |
| `game` | `startRandomGame()`/보너스 선택 | `onBack={balloonFromLesson ? goToPendingWord : () => setScreen('dashboard')}` (분기형) | `App.jsx:941` |
| `entranceTest` | 대시보드 배너 | `onBack={() => setScreen('dashboard')}` | `App.jsx:968` |
| `spellingResult` | 쓰기모드 마지막 단어 | `onDone={() => { setWriteSessionStats([]); setScreen('wordBrowser') }}` | `App.jsx:975` |
| `spellingReview` | 선물함 닫힘/복습 진입 | `onDone={() => setScreen('dashboard')}` | `App.jsx:987` |

**핵심 관찰**: 대다수 화면은 `onBack`이 이미 명확히 배선돼 있어 "뒤로가기가
가야 할 곳"이 코드에 이미 정의돼 있다 — 즉 popstate를 그 화면의 기존
`onBack`/`onDone` 콜백에 매핑하기만 하면 되는 화면이 많다. 예외는
`guidedSession`(뒤로 버튼 없이 완료/종료만 있음)과 `bonusChoice`(강제
선택형, 뒤로 개념 자체가 없음) — 이 둘은 4장에서 별도 취급이 필요하다.

### 1.3 히스토리/포커스 관련 기존 리스너 전수 조사

`popstate|pushState|hashchange|onbeforeunload|beforeunload` 정규식으로
`src/` 전체를 검색한 결과 매치는 `src/hooks/useStudent.js` 한 파일뿐이며,
실제 내용은 다음과 같다(리스너 아님, 주석 언급):

```
useStudent.js:1925-1934
  // 2026-07-10 안정성 보강: ... beforeunload보다 훨씬 안정적으로
  // 발생하므로(홈 버튼/앱 전환/화면 꺼짐 전부 포함) ...
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && restoreChecked) doSyncRef.current?.()
    }
    ...
  }, [studentId, record, restoreChecked])
```

즉 실제로 등록된 것은 `visibilitychange`(hidden 시 진행도 flush)뿐이고,
`beforeunload` 리스너는 어디에도 없다. `App.jsx:628-634`에도 동일하게
`visibilitychange`/`focus`(포그라운드 복귀 시 재조회, `foregroundRefreshGate.js`
쿨다운 적용)만 있다. **`popstate`/`pushState`는 코드베이스 전체에 0건.**

## 2. 실제 이탈(Exit) 경로 표

히스토리 엔트리가 늘지 않으므로, 아래는 전부 "Back 1회로 사이트/탭을
완전히 벗어나는" 경로다(표기: 실제 검증된 화면 전이 로직 기준 — 구조적
확정, 실기기 스와이프 동작 자체는 3.3절에서 별도 표기).

| # | 경로 | Back 1회 결과 | 위험도 |
|---|---|---|---|
| 1 | 카카오톡 링크 클릭 → 로그인 화면(`StudentSelect`) | 카카오톡/홈으로 즉시 이탈 | 높음 — 가장 흔한 진입 경로 |
| 2 | 로그인 → `dashboard` | 이탈(로그인 화면으로도 안 돌아가고 바로 나감) | 높음 — 매 세션 최초 상호작용 |
| 3 | `dashboard` → `wordBrowser` → `wordDetail`(학습/퀴즈/철자 진행 중) | 이탈 — `wordBrowser`/`dashboard`를 전부 건너뛰고 사이트 이탈, 학습 화면 자체가 통째로 unmount | 높음 — 진행 중 데이터 유실 체감(단, 이미 채점 완료된 단어별 기록은 `recordSpellingAnswer` 등으로 이미 저장돼 있어 영구 유실은 아님 — 체감 UX 문제) |
| 4 | `dashboard` → `guidedSession`(3분 리추얼 진행 중) | 이탈 — 리추얼 완료 카드까지 못 보고 나감 | 중~높 |
| 5 | `dashboard` → `paulTown` → `bookshelf`/`timeMachine` | 이탈(마을로도 안 돌아가고 나감) | 중 |
| 6 | `dashboard` → `entranceTest`(입실시험 응시 중) | 이탈 — 응시 중단 | 중 |
| 7 | 관리자 로그인 → `AdminScreen`(모바일 사용 시) | 이탈 | 낮음(관리자는 주로 데스크톱) |
| 8 | `spellingReview`/`SpellingQuestion` 답 입력 중 | 이탈 — 미제출 입력값만 손실(이미 채점된 단어는 유지) | 중 |

## 3. 기존 가드/관련 인프라

### 3.1 명시적 확인창(confirm)

- 로그아웃: `window.confirm('정말 로그아웃할까요?\n다시 들어오려면 이름과
  PIN이 필요해요.')` — `src/components/Dashboard.jsx:499`.
- 유닛 전환: `window.confirm(...)` — `Dashboard.jsx:420`.
- 이 둘은 **버튼 탭에서만** 발동하며 Back 버튼과는 무관 — Back이 이 확인창을
  거치지 않고 화면을 완전히 벗어나는 것이 정확히 이번 이슈다.

### 3.2 `beforeunload` 부재는 의도적 선택

`useStudent.js:1925-1930` 주석이 밝히듯, `beforeunload`는 모바일에서
신뢰성이 낮아(홈버튼/앱전환/화면꺼짐에서 발동 안 함) 의도적으로
`visibilitychange`로 대체했다 — 즉 "탭이 실제로 닫히기 직전 확인창을
띄운다"는 접근 자체가 이미 한 번 검토·폐기된 방향이다. 이는 이번 설계에서
`beforeunload` 기반 "정말 나가시겠어요?" 네이티브 확인창에 의존하지 않고
(모바일에서 신뢰 불가 + 지원 브라우저마다 문구 강제 등 UX 제약도 있음),
**`history.pushState` + `popstate` 가로채기로 애초에 진짜 이탈이 발생하기
전에 앱 내부에서 선점 처리**하는 접근이 이 저장소의 기존 판단과 일치함을
시사한다.

### 3.3 브라우저/인앱 브라우저별 차이 (`src/utils/browserDetect.js`)

- `isInAppBrowser()`(`browserDetect.js:18-21`): 카카오톡/인스타그램/
  페이스북/라인/네이버인앱/밴드/제네릭 Android WebView UA 패턴 감지.
- `isAndroid()`(`browserDetect.js:23-25`), `openInChrome()`
  (`browserDetect.js:35-44`): Android에서만 `intent://` 스킴으로 Chrome
  탈출 가능, iOS는 프로그래밍적 탈출 수단이 없어 안내 문구만
  (`InAppBrowserNotice.jsx:18-29`, "다른 브라우저로 열기" 메뉴 안내).
- 이 인프라는 마이크 권한 문제 때문에 만들어졌지만, **"인앱 브라우저는
  일반 브라우저와 다르게 행동한다"는 이미 검증된 전례**로 재사용 가능 —
  단, 인앱 브라우저(특히 카카오톡 WebView)의 Back 버튼은 OS/앱 버전에
  따라 **WebView 자체의 히스토리 스택이 아니라 카카오톡 앱 자체의 오버레이
  종료 제스처로 우선 처리되는 경우가 있어, `popstate`로 항상 가로챌 수
  있는지는 실기기 검증 없이는 확정할 수 없음 — 미검증, 리스크로 4.4절에
  기록**.
- iOS Safari 좌측 엣지 스와이프, Android Chrome/Samsung Internet 제스처
  내비게이션은 전부 표준 `popstate` 이벤트를 발생시키는 것이 일반적이나,
  이 저장소 안에서 실기기로 검증된 바는 없음 — **미검증**.

### 3.4 IME/키보드 — SpellingQuestion

`src/components/` 내 스펠링 입력 컴포넌트(`SpellingQuestion` 계열,
`WordDetail.jsx` 내부 write step)는 텍스트 `<input>` 기반이며, 이번 조사
범위에서 `onKeyDown`으로 popstate/히스토리를 가로채는 코드는 발견되지
않았다. 모바일 IME(한글 자동완성 등)가 열려 있는 상태에서 하드웨어/제스처
Back을 누르면 **1차로 IME/키보드만 닫히고 페이지 이동은 안 일어나는 것이
플랫폼 표준 동작**(iOS/Android 공통) — 즉 "키보드가 떠 있는 동안의 Back"은
이번 설계가 걱정할 필요가 없는 경우가 대부분이나, 이 역시 실기기 확인 없이
100% 단정하기 어려워 **미검증**으로 표기한다.

### 3.5 리마운트에 민감한 `key=` 사용처

`App.jsx` 전체에서 `key=`는 두 곳뿐:

- `GuidedSession key={currentUnitId ?? 'no-unit'}` (`App.jsx:758`) — 유닛이
  바뀔 때만 강제 리마운트(안전망, 현재는 유닛 전환이 항상 대시보드 경유라
  실질 영향 없음, `App.jsx:753-757` 주석).
- `GiftReveal key={...}` (`App.jsx:949`) — 스티커 종류/마일스톤별 리마운트.

popstate 핸들러가 **`screen`이 바뀌지 않는 popstate**(예: 이미 `dashboard`인
상태에서 sentinel 재삽입)를 잘못 처리해 `setScreen`을 매번 새 값으로 호출하면
`GuidedSession`이 불필요하게 리마운트될 수 있다 — 설계 시 "같은 화면으로의
멱등 popstate는 setScreen을 호출하지 않는다" 규칙이 필요하다(5장 반영).

## 4. 최소 안전 설계 제안

### 4.1 개요 — `src/utils/navHistory.js` (신규, 미구현)

순수 상태머신 + 얇은 DOM 바인딩 두 층으로 분리한다(테스트 용이성 —
`foregroundRefreshGate.js`가 순수 판정 함수만 분리하고 실제 리스너 배선은
`App.jsx`에 남긴 기존 관례를 그대로 따름, `foregroundRefreshGate.js:1-17`
헤더 참고).

```js
// 순수 함수 — DOM/history 접촉 없음, 단위 테스트 대상
export function nextHistoryAction(currentStack, event) { ... }
// currentStack: [{ screen, seq }], event: { type: 'push'|'pop', screen? }
// 반환: { stack, action: 'popToScreen'|'reinsertSentinel'|'allowExit'|'noop', targetScreen? }
```

DOM 바인딩(`App.jsx`에 배선, 신규 함수는 `navHistory.js`가 export):

- `pushScreen(screen)`: `screen`이 바뀔 때만(멱등 가드) `history.pushState({ navSeq, screen }, '', location.href)` 호출. `location.href`를 그대로 재사용해 실제 URL은 절대 바꾸지 않는다(딥링크/북마크 전략은 4장 범위 밖, 페이즈 4 참고) — SPA의 `screen` 문자열만 `state` 객체에 싣는다.
- 루트 sentinel: `AppInner` 최초 마운트 시 1회, 실제 화면 push 이전에 `history.replaceState({ navSeq: 0, screen: '__root__' }, '', location.href)` 후 첫 화면(`dashboard`)을 push — 이렇게 하면 "가장 처음"으로 Back했을 때 우리가 등록한 `__root__` 엔트리에서 멈춘다.
- `onPopState(event)`: `event.state`가 없거나(=우리가 만들지 않은, 사이트 진입 이전 엔트리로 넘어가려는 시도) `event.state.screen === '__root__'`이면 **"한 번 더 누르면 종료" 처리**(4.2절) — 그 외에는 `event.state.screen`을 `setScreen`에 그대로 반영(4.3절 매핑표 참고, 대부분 이미 있는 `onBack` 타깃과 동일 값이 되도록 push 시점에 저장).

### 4.2 루트에서 Back — "한 번 더 누르면 종료" (권장안)

- 1차 Back(스택이 `__root__`로 pop됨): 실제 이탈을 막기 위해 즉시
  `history.pushState`로 같은 `__root__` 엔트리를 재삽입(스택 깊이 원복) +
  화면 하단에 "한 번 더 뒤로가면 종료돼요" 토스트 표시(신규 소형 컴포넌트,
  `RewardToast.jsx` 패턴 재사용 — 모달 아님, 다른 입력 안 막음).
- 토스트가 떠 있는 동안(예: 2~3초) 2차 Back이 들어오면 재삽입을 **하지
  않고** 그대로 통과시켜 실제 브라우저 이탈이 일어나게 둔다.
- 토스트 타임아웃 후에는 다시 1차 Back 취급으로 리셋.
- 대안(비권장)으로 "루트에서 Back → 그냥 대시보드에 머무름(토스트 없이
  무조건 흡수)"도 가능하지만, 이 경우 학생이 "뒤로가기가 고장났다"고
  느끼며 반복해서 누르다 예기치 않게 앱을 벗어날 수 있어 — Android 표준
  "두 번 눌러 종료" 관례를 따르는 위 권장안이 더 안전하다고 판단.

### 4.3 화면별 popstate → 대응 매핑 (기존 `onBack`과 최대한 동일하게)

popstate 발생 시 `setScreen`을 직접 호출하는 대신, **가능한 한 이미
존재하는 `onBack`/`onDone` 콜백을 그대로 호출**한다(새 분기 로직 최소화,
1.2절 표의 "인앱 뒤로가기" 열을 그대로 재사용) — 예:

- `wordDetail`에서 Back → 기존 `onBack={() => setScreen('wordBrowser')}`과
  동일 효과.
- `guidedSession`/`bonusChoice`처럼 `onBack`이 없는 화면은 안전한 기본값
  (`() => setScreen('dashboard')`)으로 폴백 — 단, `guidedSession`은 진행
  중인 리추얼을 중단시키는 조작이므로 페이즈 2에서 "정말 그만할까요?"
  경량 확인을 추가할지 별도 검토(1인 확인창 남용 방지 원칙과 균형 필요).
- `bonusChoice`는 애초에 강제 선택형 화면(보상 로직과 직결, `App.jsx:915-922`)
  이라 Back으로 우회 가능하게 두면 게임 보상 정책을 무력화할 리스크가
  있다 — **이 화면에서는 Back을 완전히 무시(흡수)하는 것을 권장**(사용자가
  둘 중 하나를 명시적으로 눌러야만 진행).

### 4.4 리스크

1. **미검증 실기기 동작**: iOS Safari 엣지 스와이프, Android
   Chrome/Samsung Internet 제스처, 카카오톡 인앱 WebView Back 버튼이
   실제로 표준 `popstate`를 안정적으로 발생시키는지는 이 저장소 조사만으로
   확정 불가 — 구현 단계에서 반드시 실기기 스모크 테스트 필요.
2. **인앱 브라우저 예외**: 카카오톡 등 일부 인앱 브라우저는 Back을
   WebView 히스토리가 아니라 오버레이 자체를 닫는 제스처로 먼저 소비할 수
   있음 — 이 경우 `popstate` 자체가 발동하지 않아 이번 설계로 못 막는
   경로가 남을 수 있다(플랫폼 한계, `InAppBrowserNotice.jsx`처럼 "Chrome
   에서 열어주세요" 안내로 우회하는 것이 유일한 대응일 수 있음).
3. **StrictMode 이중 렌더**: `main.jsx`가 `React.StrictMode`를 사용 —
   개발 모드에서 effect가 mount→unmount→mount로 두 번 실행되므로
   `pushScreen`을 effect 안에서 호출하면 개발 모드에서 히스토리 엔트리가
   중복 push될 수 있다(멱등 가드 필수, `navSeq`/`screen` 동일 시 skip).
4. **`GuidedSession` key 리마운트와의 상호작용**: 3.5절 — 멱등하지 않은
   popstate 처리가 불필요한 `setScreen` 재호출을 유발하면
   `currentUnitId` 자체는 안 바뀌어도 `screen` state 재설정으로 인한
   불필요 리렌더 가능성 — 실질 버그는 아니나 성능 상 유의.
5. **`AdminScreen`/`ParentScreen`은 `AppInner` 밖(`App()` 레벨) 상태**라
   이번 `navHistory.js`가 `AppInner`에만 배선되면 커버되지 않는다 — 3장
   설계(페이즈 3)에서 별도 처리 필요, 1~2단계 범위에서는 명시적으로 제외.

## 5. 회귀 대상 테스트 서베이

| 테스트 | 방식 | 이번 변경과의 관계 |
|---|---|---|
| `scripts/testStudentPathContracts.mjs` | esbuild 번들 + `react-dom/server`(SSR), 네트워크·브라우저 0 (`testStudentPathContracts.mjs:1-32`) | SSR 환경엔 진짜 `window.history`가 없음(jsdom/가상 스텁 여부 확인 필요) — `navHistory.js`의 DOM 바인딩부는 `typeof window === 'undefined'` 가드로 SSR 경로에서 완전히 no-op이어야 이 스위트가 안 깨짐. 순수 상태머신부(`nextHistoryAction`)는 이 스위트가 직접 쓰지 않으므로 무관. |
| `scripts/testUiStabilityGuards.mjs` | `App.jsx` 소스 텍스트 정규식 검사, 예: `/<GuidedSession\s+([\s\S]*?)\n\s*\/>/`로 JSX 블록 추출 후 `key={currentUnitId ?? ...}` 존재 확인(`testUiStabilityGuards.mjs:38-48`) | `<GuidedSession .../>` JSX 블록의 정확한 텍스트(특히 `key={currentUnitId ?? 'no-unit'}`)를 그대로 유지해야 함 — `navHistory` 배선은 이 블록 밖(useEffect)에서 이뤄지므로 직접 충돌은 없지만, 구현 시 이 정규식이 걸리는 리터럴을 건드리지 않도록 diff 리뷰 필요. |
| `scripts/testQuizStepReset.mjs` | 실제 `WordDetail.jsx`를 esbuild+가짜 React 훅 런타임으로 번들, `window.history` 자체가 존재하지 않는 격리 환경(`testQuizStepReset.mjs:24-50`, React/JSX만 스텁) | `screen` 레벨 히스토리는 `App.jsx` 소관이라 `WordDetail`의 `key={word.id}` 스텝 리셋 로직과는 완전히 별개 층 — 이번 설계가 `WordDetail` 내부 `step` state를 전혀 건드리지 않는 한 무관. **단, 설계상 요구사항("Back이 문제 중 답을 리셋하지 않음")을 지키려면 popstate가 `wordDetail`→`wordBrowser`처럼 화면째로 이동할 때만 이 리셋이 발생해야 하고, `wordDetail` 화면 안에서의 세부 스텝 이동에는 popstate를 절대 연결하지 않아야 한다** — 이 경계를 넘으면 이 테스트가 검증하는 계약이 깨질 수 있음. |
| `tests/e2e/student.spec.mjs` | 실제 Playwright 브라우저, mock 네트워크(`installMocks`), 시나리오 A1~A7 (`student.spec.mjs:1-19`) | 기존 시나리오는 `page.goBack()`을 쓰지 않으므로 직접 회귀 위험은 낮음 — 단, 신규 `page.goBack()` 테스트를 **이 파일에 추가**하는 것이 가장 자연스러운 위치(로그인 fixture `login()` 헬퍼 재사용 가능, `student.spec.mjs:12-19`). |

### 신규로 고정(pin)해야 할 테스트

1. **순수 상태머신 단위 테스트**(`scripts/testNavHistory.mjs`, `testUiStabilityGuards.mjs`류 순수 함수 테스트 패턴 재사용): `nextHistoryAction`에 대해 — (a) 루트에서 1차 Back → `reinsertSentinel` + 토스트, (b) 토스트 타임아웃 내 2차 Back → `allowExit`, (c) `wordDetail`→`wordBrowser` 등 정상 화면 전이의 매핑 정확성, (d) 동일 화면으로의 멱등 popstate → `noop`(GuidedSession 불필요 리마운트 방지, 3.5절).
2. **E2E — 3단계 깊이 `page.goBack()`**: `dashboard → wordBrowser`(깊이1), `dashboard → wordBrowser → wordDetail`(깊이2), `dashboard → wordBrowser → wordDetail`(철자 입력 중, 미제출) → `goBack()`(깊이3) 각각에서 (i) 페이지가 실제 이탈하지 않고 여전히 앱 DOM이 존재하는지(`page.url()` 불변, 로그인 화면으로 안 튕겨나감), (ii) 도달한 화면이 기대한 화면인지(예: 깊이1 back → 여전히 dashboard 표시 요소 존재).
3. **새로고침/재개(resume) 시맨틱**: 히스토리 스택은 메모리 전용(새로고침 시 리셋)이라, 새로고침 후에는 기존 `readSession()`/`restoreChecked` 로직(`App.jsx:1011-1021`, `705-722`)만으로 정상 진입해야 함 — `navHistory.js`가 새로고침 직후 `history.state`를 읽어 이전 `screen`으로 **되돌리려 시도하지 않는지**(그런 시도는 기존 로그인 게이트 로직과 충돌할 위험) 확인하는 회귀 테스트 필요.
4. **루트 "두 번째 Back에서만 종료"**: E2E로 완전한 "탭 닫힘"까지는 재현 불가하므로, 1차 `goBack()` 후 `page.url()`이 그대로이고 토스트 텍스트가 보이는지까지만 스모크 테스트, 실제 이탈 허용 여부는 4.1의 상태머신 단위 테스트가 커버.

## 6. 단계별 구현 계획 (PR 단위, 기기 로컬 플래그 `mobileBackGuard` 기본 OFF)

플래그는 `src/config/features.js`의 기존 `DEFAULT_FEATURES` 패턴을 그대로
따른다 — 신규 키 추가 시 `getFeaturesByCategory`의 어느 카테고리에도
넣을지 결정 필요(기존 파일 소유권 규칙 16 — 실제 구현 세션이 그 파일을
직접 소유해야 함, 이 문서는 제안만).

### 페이즈 1 — 최소 골격: 루트 sentinel + 이미 `onBack`이 있는 화면만
- 대상 화면: `wordBrowser`, `wordDetail`, `quiz`, `levelUpMission`, `diary`,
  `studyCalendar`, `hatCollection`/`wordMuseum`/`growthAlbum`/`englishGarden`,
  `paulTown`, `bookshelf`/`timeMachine`, `entranceTest`, `spellingResult`,
  `spellingReview` — 전부 1.2절 표에서 이미 명확한 1탭 `onBack`/`onDone`이
  있는 화면.
- 명시적 제외: `guidedSession`, `bonusChoice`, `game`, `sentenceFlow`(페이즈 2),
  `AdminScreen`/`ParentScreen`(페이즈 3).
- 파일: `src/utils/navHistory.js`(신규, 순수 상태머신 + DOM 바인딩,
  약 100~130줄), `src/App.jsx`(`AppInner`에 배선 — `useEffect([screen])`로
  push, 최상위에 `popstate` 리스너 1개 등록, 약 40~60줄 diff),
  `src/config/features.js`(`mobileBackGuard: false` 1줄 + 카테고리 등록
  1줄, 약 5줄 diff).
- 테스트: `scripts/testNavHistory.mjs`(신규, 순수 함수 단위 테스트만).
  E2E는 아직 추가하지 않음(플래그 OFF 상태 검증만).

### 페이즈 2 — E2E 검증 + 종료 토스트 + 나머지 화면 매핑
- `guidedSession`/`bonusChoice`/`game`/`sentenceFlow`에 대한 명시적(안전)
  매핑 확정(4.3절), "한 번 더 누르면 종료" 토스트 컴포넌트 추가.
- 파일: `src/components/ExitConfirmToast.jsx`(신규, `RewardToast.jsx` 패턴
  참고, 약 30~40줄), `src/App.jsx`(매핑 확장 + 토스트 렌더 배선, 약
  20~30줄 diff), `src/utils/navHistory.js`(토스트 타임아웃 상태 추가, 약
  20줄 diff).
- 테스트: `tests/e2e/student.spec.mjs`(또는 신규
  `tests/e2e/backNavigation.spec.mjs`)에 5장 "신규 테스트" 2·3·4번 추가.

### 페이즈 3 — Admin/Parent 진입점 + 파괴적 화면(입실시험 등) 확인창
- `App()` 레벨(`showAdmin`/`showParent`)에도 동일 sentinel 패턴 적용,
  `EntranceTest` 응시 중 Back에 대한 확인창 여부 검토(운영자 정책 결정
  필요 — 이 문서는 옵션만 제시).
- 파일: `src/App.jsx`(루트 `App()` 함수에 별도 sentinel 배선, 약 20~30줄
  diff), 필요 시 `src/components/EntranceTest.jsx`에 확인창 추가(소유
  세션 확인 필요, 규칙 16).
- **권장**: 이 페이즈는 페이즈 1~2가 실제 운영에서 최소 하루 이상
  모니터링을 거친 뒤 진행 — Admin은 원장의 매일 도구라 회귀 시 파급이
  가장 크다.

### 페이즈 4 — (금지: 이번 범위/하룻밤 작업 대상 아님) 진짜 URL 라우터 전환
- `screen` 문자열 state 전체를 실제 경로 기반 라우팅(딥링크 가능,
  `GuidedSession` 스텝까지 포함한 완전한 Back 복원)으로 재설계하는 것 —
  **대규모 아키텍처 변경**이다. 이유:
  - 20개 이상 화면 전부와 그 화면들의 `onBack` prop 배선을 동시에
    재작성해야 함.
  - `scripts/testStudentPathContracts.mjs`(SSR 문자열 단언),
    `scripts/testUiStabilityGuards.mjs`(App.jsx 리터럴 정규식 검사),
    `tests/e2e/*.spec.mjs`(현재 화면 전환 방식 전제) 전부 동시 재작성
    필요.
  - `currentUnitId`/`refreshTick` 기반 캐시 재검증(`App.jsx:263-270`,
    2026-08-15 stale-cache 감사 이력)처럼 컴포넌트 마운트/언마운트
    타이밍에 민감한 기존 로직들과의 상호작용을 전부 재검증해야 함 —
    저장소 헌법 규칙 15("회귀 의심 시 되돌려서 먼저 FAIL 확인")를 지키려면
    전용 세션에서 회귀 우선 검증 없이는 손대면 안 되는 범위.
  - **결론: 페이즈 1~3로 실사용 이탈 문제를 먼저 해소하고, 진짜 라우터
    전환은 별도의, 충분한 시간이 확보된 전용 작업으로 분리한다.**

## 7. 참고 — 이번 조사에서 확인한 파일/줄번호 목록

- `src/App.jsx:174-1210` (AppInner 전체, screen state 및 20개 분기)
- `src/App.jsx:1023-1209` (App() 루트, student/showAdmin/showParent)
- `src/hooks/useStudent.js:1925-1934` (visibilitychange, beforeunload 아님)
- `src/utils/foregroundRefreshGate.js:1-17` (순수 함수 분리 관례 참고)
- `src/config/features.js:1-30, 205-230` (플래그 정의/카테고리 패턴)
- `src/components/Dashboard.jsx:420, 499` (기존 confirm 2건)
- `src/utils/browserDetect.js:1-44`, `src/components/InAppBrowserNotice.jsx:1-33`
- `src/components/GuidedSession.jsx:65, 242, 315, 356, 391` (onDone만 있고 onBack 없음)
- `src/components/WordDetail.jsx:769, 800-840` (STEPS/step state, key={word.id} 리마운트 관례)
- `scripts/testStudentPathContracts.mjs:1-60`
- `scripts/testUiStabilityGuards.mjs:1-60`
- `scripts/testQuizStepReset.mjs:1-50`
- `tests/e2e/student.spec.mjs:1-60`
- `package.json:123-140` (의존성 — 라우터 없음)
- `index.html:1-17`, `public/manifest*.json`(없음), `src/main.jsx:1-9`(SW 없음)

---

## 8. 설계 대안 비교 + 결정론적 테스트 하네스 (2026-09-09 추가, 별도 세션)

_작성일 2026-09-09 · 브랜치 `qa/session-2026-09-09-b` · 상태: 설계 심화 +
격리 프로토타입 구현(코드 여전히 미구현 — `src/` 무변경). 위 1~7장은
2026-09-09 초안 세션이 작성한 원본이며 그대로 둔다. 이 8장은 운영자 요청에
따라 "제품 코드를 건드리기 전에" 대안 비교·결정론적 하네스·격리 프로토타입을
추가한 것이다. 소유 파일: 본 문서(이 섹션만 append), 신규
`docs/design/prototypes/navHistoryModel.mjs`, 신규
`scripts/testNavHistoryModel.mjs` — `src/`, `api/`,
`tests/harness/registry.mjs`, `package.json`은 전혀 건드리지 않았다(다른
세션이 등록 예정)._

### 8.1 비교 대상 3안

**대안 A — 화면당 1 history-entry 매핑 + 루트 sentinel** (1~7장이 이미
제안한 안, 4.1~4.3절). popstate가 발생할 때마다 event.state에 실려온
`screen` 값을 그대로 `setScreen`에 반영 — 즉 "브라우저가 자연스럽게
드러내는 이전 entry"가 곧 기존 `onBack` 목표와 같아지도록 push 시점을
설계한다.

**대안 B — 단일 sentinel "트랩" 방식** (신규 비교 대상, 이번 세션 추가).
화면이 몇 단계를 이동하든 실제 `history` 스택은 **절대 건드리지 않고**,
sentinel entry 하나만 유지한다. Back이 눌리면 무조건 "정말 나가시겠어요"
트랩만 판정하고, 화면 간 이동은 여전히 100% 인앱 버튼(`onBack`/`onDone`)이
전담한다 — popstate는 화면 전환에 전혀 관여하지 않는다.

**대안 C — 최상위 화면만 hash-router** (옵션, 비권장). `#wordBrowser` 같은
해시로 최상위 화면만 라우팅하고, `wordDetail` 내부 스텝/모달류는 여전히
메모리 state로 남긴다. 실제 URL이 화면마다 바뀌므로 딥링크/새로고침 복원
가능성이 생긴다.

### 8.2 결정 매트릭스

| 기준 | A: 화면당 entry + 루트 sentinel | B: 단일 sentinel 트랩 | C: 최상위 hash-router |
|---|---|---|---|
| 건드릴 제품 파일 수 | 3개(`navHistory.js` 신규, `App.jsx` diff, `features.js` 1줄) | 3개(동일 구성이나 `App.jsx` diff가 더 작음 — push 배선이 마운트+popstate 리스너뿐, 화면 전환 시점마다 손댈 필요 없음) | 4개 이상(`navHistory.js`, `App.jsx`(20개 이상 분기 각각 hash 동기화 필요), `index.html`(base href 검토), 잠재적으로 `WordDetail.jsx` 경계 재검토) |
| `GuidedSession key={currentUnitId}` 리마운트 위험 | 낮음 — `guidedSession`을 스택 추적 대상에서 제외하고, 멱등 가드(동일 화면 재호출 시 `setScreen` 재호출 없음)로 방지. 프로토타입 12절 테스트로 "screenChanged===false" 실측 고정 | 없음 —애초에 popstate가 `setScreen`을 절대 호출하지 않으므로 구조적으로 리마운트 경로 자체가 없음 | 중~높음 — URL 파싱 effect 타이밍이 StrictMode 이중 렌더와 얽히면 A/B에는 없는 추가 리렌더 트리거 여지가 생김 |
| 퀴즈/철자 진행 중 안전성 | 높음 — popstate는 `screen`(AppInner 최상위) 레벨에서만 개입, `WordDetail` 내부 `step` state는 절대 건드리지 않음(프로토타입이 애초에 그 레벨 개념을 갖지 않음) | 최고 — popstate가 화면 전환 자체에 전혀 관여하지 않으므로 구조적으로 영향 0 | 중 — "최상위만" 조건은 A와 동급 보호를 주지만, 해시가 북마크/공유 가능해지며 새로고침 후 "해시는 wordDetail인데 세션 상태는 없음" 같은 새로운 불일치 클래스가 생김 |
| 루트에서 Back 동작 | Android 표준 "두 번 눌러 종료"(1차 트랩+토스트, 2차 이탈) — 명시적, 테스트 가능 | 동일(트랩 로직 자체는 A와 완전히 같음 — sentinel 판정 부분만 재사용 가능) | 별도 이득 없음 — 결국 A/B와 동일한 sentinel 로직을 URL 스킴 아래 한 겹 더 얹는 것뿐 |
| iOS 스와이프 Back | 표준 `popstate` 발생 가정(업계 일반적이나 이 저장소에서 실기기 미검증 — 3안 공통 리스크) | 동일(공통 리스크) | 동일(공통 리스크), 추가 이득 없음 |
| 인앱 브라우저(카카오톡) | 미해결 — WebView가 popstate 이전에 오버레이 종료 제스처로 Back을 먼저 소비할 가능성(3.3절), A는 이를 해결하지 못하지만 악화시키지도 않음 | 동일(공통 리스크). 다만 스택 조작 자체가 없어 "우리가 잘못 조작해 상태가 꼬일" 여지는 A보다 작음 | 동일(공통 리스크) + 해시 변경이 카카오톡 인앱 오버레이의 URL 표시(제목표시줄)에 노출될 수 있어 부작용 표면이 더 큼 |
| 새로고침/딥링크 | 새로고침 시 전부 리셋, 이전 화면 복원 시도 없음(설계 문서 5장 결정과 일치, 프로토타입 13절로 고정) | 동일(스택 자체가 없으니 복원할 것도 없음 — 가장 단순) | 새로고침 후 URL 해시로 "이전 화면"을 복원할 유혹이 생기는데, 이는 5장에서 이미 내린 "복원 시도 없음" 결정과 정면 충돌 — 재검토 없이는 채택 불가 |
| 오프라인 테스트 용이성 | 높음 — 순수 상태머신, DOM 0(본 절 8.3~8.4) | 매우 높음 — 상태 공간이 A보다 작아 테스트 표면도 더 작음(sentinel 여부만 판정) | 중 — 해시 파싱/직렬화(인코딩, trailing slash 등) 엣지케이스가 A/B엔 없는 추가 테스트 대상을 만듦 |
| 기존 `onBack` 표와의 부합도 (신규 기준 — 이번 세션 추가) | **1:1에 가까움** — "depth-3 Back이 문서화된 정확한 부모로 돌아간다"를 프로토타입 6절이 실측(예: `paulTown→bookshelf` Back이 `dashboard`가 아니라 `paulTown`으로) | **부합 안 함** — B는 화면 간 이동에 popstate를 아예 안 쓰므로, 학생이 하드웨어 Back으로 "한 단계만 되돌아가기"를 기대해도 트랩 판정 전까지는 아무 일도 안 일어남(안전하지만 Android 사용자의 일반적 Back 기대와 어긋남) | A와 동급이나, 4장 기준 그대로 재구현 필요 |

### 8.3 결정 — 대안 A 채택 (단, 페이즈 1 스코프는 6장 그대로 축소 적용)

**대안 A를 채택한다.** 근거:

1. 이번 작업 자체가 요구하는 결정론적 테스트("depth-3 Back이 문서화된
   정확한 부모로 복귀", "wordDetail mid-quiz Back이 인앱 ← 버튼과 동일
   목표")는 구조적으로 **B로는 만족시킬 수 없다** — B는 popstate를 화면
   전환에 아예 연결하지 않으므로 "Back → 특정 부모 화면" 자체가 정의되지
   않는다. B가 안전성 면에서 더 낫지만, 이미 코드 전역에 배선된 20여 개
   `onBack` 콜백이 암묵적으로 약속한 "Back은 곧 그 화면의 onBack과 같다"는
   사용자 기대(Android 관례)를 충족하지 못해 "고장난 뒤로가기"로 체감될
   위험이 있다 — 원 이슈("Back 누르면 앱을 완전히 나간다")보다는 낫지만
   완전한 해결책은 아니다.
2. C는 A 대비 이득이 없다(8.2절 "새로고침/딥링크" 행 — 이미 5장에서 내린
   "새로고침 시 화면 복원 안 함" 결정과 충돌) — 게다가 4장(원 설계)이 이미
   "페이즈 4: 진짜 라우터 전환은 이번 범위 밖"으로 명시적으로 금지한
   방향과 사실상 동일한 종류의 변경이라 재론의 실익이 없다.
3. A의 유일한 약점(B 대비 `App.jsx` diff가 조금 더 큼, `GuidedSession`
   리마운트에 이론상 더 노출됨)은 **6장이 이미 정의한 "페이즈 1 축소
   스코프"**(추적 대상 화면을 이미 `onBack`이 있는 16개 + `dashboard`로
   한정, `guidedSession`/`bonusChoice`/`game`/`sentenceFlow`는 스택에서
   완전히 제외)로 상쇄된다 — 제외된 화면 위에서 Back이 눌리면 스택은 그
   화면 진입 이전 상태 그대로이므로, 자연스럽게 "가장 가까운 추적 조상"
   또는 "루트 트랩"으로 흡수되고, **이 경로에서 `setScreen`이 전혀
   호출되지 않아 리마운트 위험이 사실상 B와 동일한 수준으로 낮아진다**
   (8.4절 프로토타입 12절 테스트로 실측 고정).

즉, "기존 상태 머신을 가장 적게 깨는 안"은 A 그 자체가 아니라 **"6장
스코프로 축소된 A"**다 — B의 안전성과 A의 기능 부합도를 모두 취하는
절충이다.

### 8.4 결정론적 테스트 하네스 설계

**순수 모델**(`docs/design/prototypes/navHistoryModel.mjs`, 이번 세션 구현,
DOM/React/window 접촉 0): `createNavHistoryModel()` 팩토리가 `{ navigate,
back, refresh, exitIntent, getState }`를 반환한다.

- `navigate(screen)` — 화면 전환(CTA든 `onBack`/`onDone` 콜백이든 전부
  `AppInner`의 `setScreen(...)` 호출 지점 하나로 귀결) 이벤트. 규칙:
  같은 화면이면 no-op(멱등), 스택에 이미 있는 조상이면 그 지점까지만
  남기고 위 항목을 정리(브라우저가 물리적으로 그만큼 되돌아간 것과 동일
  효과 — 안 이러면 같은 화면 이름이 중복 누적되어 다음 실제 popstate가
  엉뚱한 옛 화면을 되살림), 완전히 새 화면이면 push. **6장 페이즈 1
  스코프대로 `EXCLUDED_SCREENS`(`guidedSession`/`bonusChoice`/`game`/
  `sentenceFlow`)는 스택에 아예 반영하지 않는다.**
- `back()` — popstate 1회. 스택에서 정확히 entry 1개만 pop(더블팝 방지),
  드러난 다음 entry가 루트 sentinel이면 트랩(재삽입 + 토스트, 2차 Back
  시에만 이탈 허용), 일반 화면이면 그 화면으로 복귀.
- `refresh()` — 스택을 전부 리셋하고 `dashboard`로 재부팅(5장 요구사항대로
  "이전 화면 복원 시도 없음"을 그대로 구현).
- `exitIntent()` — 토스트 타임아웃 만료를 모델링하는 4번째 이벤트(과제
  스펙에 이름만 주어지고 의미는 비어 있어 이번 세션이 정의함): "실제
  두 번째 Back"이 아니라 "확인 대기 상태가 시간 경과로 해제됨"을
  나타낸다(4.2절 "토스트 타임아웃 후에는 다시 1차 Back 취급으로 리셋"과
  1:1 대응). 타이머 자체(setTimeout)는 DOM 어댑터 소관이며 순수 모델은
  "타임아웃이 발생했다"는 사실만 받는다.

반환 스냅샷은 과제 스펙 그대로 `{ screen, historyDepth, shouldConfirmExit,
toast }`에 더해 테스트 편의를 위한 `screenChanged`(이번 이벤트로 실제
`setScreen`이 호출됐는지 — 리마운트 위험 판정에 직접 씀)와
`exited`(모델 관점에서 진짜 이탈이 확정됐는지)를 추가로 노출한다.

**DOM 바인딩(서술만, 미구현)**: 실제 `src/utils/navHistory.js`가 위 순수
모델을 감싸는 `bindNavHistory(model, { history, window, setScreen,
renderToast })` 형태의 어댑터를 export한다고 가정한다.

- 마운트 시 1회(StrictMode 이중 실행 가드 필수, ref로 방지 — 4.4절 리스크
  3번 그대로): `history.replaceState({screen:'__root__'}, ...)` →
  `history.pushState({screen:'dashboard'}, ...)`.
- `screen` 변경 useEffect: `model.navigate(screen)` 호출 후 반환된
  `stack`(디버그 필드)과 실제 `history.length`를 비교해 필요한 DOM 연산을
  결정한다 — 새 push는 `history.pushState(...)` 1회, 조상으로의 점프는
  브라우저의 유일한 "다중 entry 이동" 원자적 API인 `history.go(-(n))`
  **1회** 호출로 처리한다(entry를 낱개로 여러 번 `history.back()` 하는
  방식은 매 호출이 비동기 popstate를 유발해 재진입 방지 로직이 더
  복잡해지므로 비권장 — 이번 설계는 `history.go` 단일 호출 방식을
  권장안으로 남긴다).
- `popstate` 리스너: `model.back()` 호출 → `exited`면 아무 것도 안 함(이미
  브라우저가 이탈 중), `screenChanged`면 `setScreen(result.screen)`,
  `toast`가 있으면 토스트 렌더 후 고정 시간(예: 2.5초) 뒤
  `model.exitIntent()`를 어댑터가 직접 호출(타이머는 순수 모델 밖).

**DOM 바인딩은 이번 세션에서 구현하지 않는다** — 위는 설계 서술이며,
실제 구현은 `src/App.jsx`/`src/utils/navHistory.js` 소유 세션(페이즈 1
구현 세션)이 맡는다.

### 8.5 프로토타입 → `src/utils/navHistory.js` 승격 경로

1. `docs/design/prototypes/navHistoryModel.mjs`의 export
   (`createNavHistoryModel`, `ALL_SCREENS`, `TRACKED_SCREENS`,
   `EXCLUDED_SCREENS`, `ONBACK_TARGETS`, `ROOT_SENTINEL`, `TRAP_MESSAGE`)를
   **그대로**(재작성 없이) `src/utils/navHistory.js`의 순수 함수 절반으로
   옮긴다.
2. 같은 파일 안에 8.4절의 `bindNavHistory(...)` DOM 바인딩 함수를 추가한다
   (`foregroundRefreshGate.js`의 "순수 함수만 분리, 배선은 호출부" 관례와
   달리, 4.1절이 이미 `navHistory.js` 한 파일에 순수+DOM 바인딩을 함께
   두기로 설계했으므로 그 결정을 그대로 따른다).
3. `src/App.jsx`의 `AppInner`에 `bindNavHistory` 호출 1곳(마운트 시)만
   추가 — 화면 전환마다 새 코드를 쓰는 게 아니라 기존 `screen` state를
   구독하는 `useEffect([screen])` 하나면 충분(설계 문서 4.1절 그대로).
4. `scripts/testNavHistoryModel.mjs`를 `scripts/testNavHistory.mjs`로
   승격(모델 경로만 `docs/design/prototypes/...` → `src/utils/navHistory.js`
   named export로 교체, 단언 로직은 재사용) — 이 등록/이름 변경은
   `tests/harness/registry.mjs`를 소유한 세션이 수행한다(이번 세션은
   손대지 않음, 운영자 지시대로).

### 8.6 단계별 계획 (6장을 대체하지 않음 — 페이즈 1 실행 방법을 구체화)

- **페이즈 1** (변경 없음, 구체화만): 순수 모델 승격 + `bindNavHistory`
  작성 + `mobileBackGuard: false`(기본 OFF) 배선. 플래그가 꺼져 있으면
  `bindNavHistory` 호출 자체를 하지 않아(또는 호출하되 내부에서 즉시
  no-op 반환) 기존 20개 화면 전환/`GuidedSession` 리마운트/퀴즈-철자 로직에
  **코드 경로 수준에서 아무 영향이 없다** — 이번 세션이 만든 프로토타입
  테스트(`scripts/testNavHistoryModel.mjs`, 59개 단언 전부 PASS)가 순수
  로직의 정확성을 미리 고정해두므로, 페이즈 1 구현 세션은 "옮기고
  배선"만 하면 된다.
- **페이즈 2~4**: 6장 원안 그대로(변경 없음) — 종료 토스트/나머지 화면
  매핑(페이즈 2), Admin/Parent(페이즈 3), 진짜 라우터는 금지(페이즈 4).

### 8.7 이번 세션 산출물

- `docs/design/prototypes/navHistoryModel.mjs` (신규, 약 230줄) — 순수
  상태머신, `ALL_SCREENS`(21개, `App.jsx` 실측 재확인) /
  `TRACKED_SCREENS`(17개) / `EXCLUDED_SCREENS`(4개) / `ONBACK_TARGETS` 상수
  포함.
- `scripts/testNavHistoryModel.mjs` (신규) — `check()`/PASS-FAIL/exit-code
  관례(`scripts/testWritingDirectionResolution.mjs`와 동일 스타일), **59개
  단언 전부 PASS**(`node scripts/testNavHistoryModel.mjs` 실행 확인,
  2026-09-09). 커버: 루트 1차/2차 Back, `exitIntent` 타임아웃 재무장,
  `wordDetail` mid-quiz Back 목표, depth-3 Back의 정확한 부모 복귀(문서
  `ONBACK_TARGETS`와 교차 검증), 멱등 가드(중복 push 방지), 조상 재방문 시
  스택 정리(옛 화면 되살아나지 않음), `game`/`bonusChoice` 분기, **
  `guidedSession` 위 Back이 `screenChanged===false`임을 실측(리마운트 없음
  보장)**, 새로고침 전체 리셋, 이탈 후 반복 이벤트 안전성.
- 본 8장(문서 append) — 대안 비교/결정 매트릭스, 하네스 설계, 승격 경로,
  페이즈 1 구체화.
- `src/`, `api/`, `tests/harness/registry.mjs`, `package.json` **무변경**
  (소유권 범위 준수).

### 8.8 남은 리스크 (1~7장의 "미검증" 항목과 동일 — 재확정만)

이번 세션은 순수 로직만 결정론적으로 검증했다. 아래는 여전히 실기기
검증 전까지 확정 불가(4.4절과 동일 항목, 새로 발견된 것 없음):

1. iOS Safari 엣지 스와이프 / Android 제스처 내비게이션이 실제로 표준
   `popstate`를 발생시키는지.
2. 카카오톡 등 인앱 브라우저가 Back을 WebView 히스토리가 아니라 자체
   오버레이 종료 제스처로 먼저 소비하는 OS/버전 조합이 있는지.
3. `history.go(-(n))` 단일 호출 방식이 실제 모바일 브라우저에서 항상
   기대한 개수만큼 정확히 이동하는지(브라우저마다 `go()` 좌표 시스템/
   타이밍 미묘한 차이 가능성 — 프로토타입 9~10절은 스택 정리 "로직"만
   검증했고, 그 로직을 구현한 실제 `history.go` 호출의 실기기 동작은
   페이즈 1 구현 세션이 스모크 테스트해야 함).

**VERDICT: IMPLEMENTATION READY** — 설계 대안 비교가 끝났고(A 채택,
근거 명시), 순수 상태머신은 격리 프로토타입으로 구현·59개 단언 전부
PASS로 결정론적 검증까지 마쳤다. 페이즈 1은 플래그 기본 OFF로 기존
동작에 영향이 없는 범위이므로 운영자의 추가 설계 결정 없이 바로
구현 세션으로 넘어갈 수 있다 — 남은 항목(8.8절 1~3번)은 "설계를 못
정해서" 막힌 게 아니라 구현 세션이 배선을 마친 뒤 수행할 실기기
스모크 테스트 항목일 뿐이다.
