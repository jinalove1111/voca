# Lazy Chunk 구조 가드 — 2026-09-12

`scripts/testLazyChunkGuards.mjs`(harness 등록: `quiz` 도메인,
`npm run verify:quiz` 또는 `npm run verify:all`에 포함, 단독 실행은
`node scripts/testLazyChunkGuards.mjs`) 문서.

## 왜 필요한가 (131차 사고 배경)

배포마다 Vite가 모든 `React.lazy` 코드 스플릿 청크의 파일명을 해시째로
바꾼다. 배포 전에 이미 앱을 열어둔 학생 세션이 배포 이후 처음으로 lazy
동적 `import()`를 실행하면, 브라우저가 이미 사라진 옛 청크 URL로 요청을
보내 404가 나고 `React.lazy`가 reject한다 — React가 그 reject를 캐시하므로
"그냥 다시 시도"(setState 리셋)로는 복구되지 않고, 학생 화면에는 "앱 오류가
발생했어요"만 남는다(P1, `handoff.md` 131차 세션).

PR #40이 이 문제를 자동 단일 새로고침으로 고쳤다:

- `src/utils/staleChunkRecovery.js` — 오류가 stale 청크인지 판정
  (`isStaleChunkError`) + 60초 가드로 세션당 1회만 새로고침
  (`tryRecoverFromStaleChunk`, `scheduleGuardReset`, `clearStaleChunkGuard`).
- `src/App.jsx`의 `AppErrorBoundary.componentDidCatch`가 `throw`로 도착하는
  경로에서 이 판정/복구를 호출.
- `src/main.jsx`가 `vite:preloadError` 이벤트(throw 없이 이 이벤트만 쏘는
  브라우저/타이밍)에도 같은 판정/복구를 배선.

이 안전망은 **모든 code-split 화면이 실제로 `<React.Suspense>` 안에서,
그리고 그 `Suspense`가 `<AppErrorBoundary>`로 보호된 상태에서 렌더된다**는
전제 위에서만 동작한다. 누군가 새 lazy 화면을 이 전제 밖에 추가하거나,
`main.jsx`/`App.jsx`의 복구 배선 자체를 실수로 지우면 이 안전망은 조용히
무력화된다 — 런타임에서 발견하기 전에는 아무 신호도 없다. 이 가드는 그
불변식을 CI/로컬 빌드마다 정적으로 고정한다.

## 무엇을 검사하는가

전부 순수 소스 텍스트 분석(정규식 + 스택 기반 마커 페어링)이며, 섹션 6을
제외하면 React 렌더/네트워크/DB 접촉이 전혀 없다.

1. **`src/App.jsx`의 `React.lazy` 선언 수집** — 현재 11개
   (AdminScreen/ParentScreen/EntranceTest/HatCollection/WordMuseum/
   GrowthAlbum/EnglishGarden/PaulTown/Bookshelf/TimeMachine/TownScreen)
   전부 존재하는지, 개수가 11개 이상인지.
2. **각 lazy 이름마다** — JSX 사용처(`<Name ...>`)가 최소 1곳 존재하고,
   그 사용처가 `<React.Suspense>...</React.Suspense>` 블록 안에 있고, 그
   Suspense 블록이 `<AppErrorBoundary>`로 보호되는지.
   - **보호 판정은 "직접" 또는 "AppInner 경유 간접" 둘 다 인정한다.**
     실제 `App.jsx` 구조상 애착/Paul Town 계열 Suspense(HatCollection~
     TownScreen)는 `AppInner` 함수 *내부*에 있고, 그 `AppInner`를 감싸는
     `<AppErrorBoundary>`는 파일 훨씬 뒤(`export default function App()`
     안, `<AppErrorBoundary><AppInner .../></AppErrorBoundary>` 한 줄)에만
     있다 — `AppInner`의 JSX 텍스트 자체에는 `<AppErrorBoundary>` 문자열이
     없다. "가장 가까운 앞쪽 `<AppErrorBoundary>` 태그만 보는" 순진한
     스캔은 이 구조에서 정상 코드를 전부 오탐 FAIL 처리하므로 채택하지
     않았다. 대신 "Suspense가 `AppInner` 함수 범위 안에 있고, `AppInner`의
     *모든* JSX 사용처가 직접 `AppErrorBoundary`로 보호됨"까지 1단계
     간접 포함으로 인정한다(AdminScreen/ParentScreen처럼 직접 감싸인
     경우는 그대로 직접 판정).
3. **`AppErrorBoundary` 클래스 배선** — `static getDerivedStateFromError`/
   `componentDidCatch` 존재, `staleChunkRecovery`에서 두 함수 import,
   `tryRecoverFromStaleChunk({ storage: window.sessionStorage, reload: ()
   => window.location.reload() })` 호출, "그냥 다시 시도"/"로그아웃 후
   다시 시작" 버튼 문구·동작 유지.
4. **`src/main.jsx`** — `vite:preloadError` 리스너 등록, 부팅 시
   `scheduleGuardReset(window.sessionStorage)` 호출, 리스너가
   `tryRecoverFromStaleChunk(...)` 호출, `event.preventDefault()`가 항상
   `result.reloaded` 가드 안에서만 호출되는지(무조건 preventDefault 금지 —
   그러면 stale이 아닌 preloadError도 새로고침 없이 이벤트만 삼켜버릴 수
   있음).
5. **`src/utils/staleChunkRecovery.js`** — 4개 export가 함수인지,
   `STALE_CHUNK_GUARD_WINDOW_MS === 60_000`, `scheduleGuardReset` 기본
   지연이 `30_000`ms인지(fake timer 주입으로 실제 호출해 확인), 파일 안
   어디에도 `localStorage`를 쓰지 않는지(가드는 탭 범위 `sessionStorage`
   전용이어야 로그아웃/기기 간 잔존이 없다).
6. **빌드 산출물 가드(`dist/` 존재할 때만)** — 이 스크립트 자체는 빌드를
   실행하지 않는다. `dist/`가 있으면: 11개 lazy 이름 각각에
   `dist/assets/<Name>-*.js` 청크가 정확히 1개, `dist/index.html`이
   `assets/index-*.js`를 정확히 1개만 참조, 그 메인 번들 문자열에
   `staleChunkReloadAt`(가드 키 상수)와 `vite:preloadError`가 포함되는지.
   `dist/`가 없으면 SKIP(FAIL 아님) — CI/로컬 어디서든 `npm run build`
   없이 돌려도 이 스크립트 전체가 죽지 않는다.
7. **부정 대조군(규칙 15 — "테스트가 실제로 잡아내는지" 확인)** — 원본
   파일은 절대 건드리지 않고, 메모리 안 사본 텍스트에만 문자열 수술을
   가한 뒤 같은 스캐너 함수를 재실행해 위반이 실제로 감지되는지 확인.
   1) `TownScreen` 사용처를 그 Suspense 블록 밖으로 이동 → 위반 감지 +
      같은 사본의 무관한 `AdminScreen`은 여전히 정상 판정(수술이 전역을
      깨지 않음도 함께 확인).
   2) `main.jsx`의 `addEventListener('vite:preloadError'` 호출부 문자열만
      제거(헤더 주석에도 같은 문자열이 있어 첫 occurrence만 지우는 단순
      `replace`는 거짓양성 위험이 있음 — 호출부를 명시적으로 타겟) →
      리스너 등록 검사가 실패로 뒤집힘.
   3) `App()`의 `<AppErrorBoundary><AppInner .../></AppErrorBoundary>`
      최종 반환 줄에서 `AppErrorBoundary`를 제거 → `AppInner` 내부
      lazy 화면(EntranceTest)의 간접 보호 판정이 실패로 뒤집힘(간접
      판정 로직 자체가 실제로 이 조건에 의존함을 확인).

현재 76개 단언 전체 PASS.

## 새 lazy 화면을 추가할 때 이 가드를 어떻게 확장하는가

1. `src/App.jsx`에 `const NewScreen = React.lazy(() => import('./components/NewScreen'))`
   를 추가하고, JSX 사용처를 반드시 `<React.Suspense fallback={...}>...
   </React.Suspense>` 안에 두고, 그 Suspense가 `<AppErrorBoundary>`로
   직접 감싸여 있거나(새 최상위 화면이면 이 방식을 권장) `AppInner` 함수
   범위 안에 있어야 한다(기존 애착/Paul Town 화면처럼 대시보드 하위
   화면이면 이 방식이 자연스럽다 — 이 경우 `AppInner`를 감싸는
   `<AppErrorBoundary>`가 계속 남아있는 한 자동으로 보호된다).
2. 이 가드 스크립트는 정규식으로 `React.lazy` 선언을 전부 스캔하므로
   **이름을 코드에 새로 추가하기만 하면 자동으로 섹션 2 검사 대상에
   포함된다** — `expected` 배열(현재 기준 11개 이름 목록)에 새 이름을
   추가할 필요는 없다(그 배열은 "지금 몇 개가 있는지"의 스냅샷 회귀
   감지용이지 화이트리스트가 아니다). 다만 새 화면 추가 시 그 배열에도
   이름을 넣어 "11개 → N개로 늘었다"는 사실을 커밋 diff에 명시적으로
   남기는 것을 권장한다.
3. `npm run build` 후 `dist/assets/NewScreen-*.js`가 정확히 1개 생기는지
   섹션 6이 자동으로 함께 검사한다(이름이 lazyDecls 목록에 있으므로 별도
   설정 불필요).
4. 새 화면이 `AppInner`도 `AppErrorBoundary` 직접 감싸기도 아닌 제3의
   구조(예: 완전히 새로운 컴포넌트 함수가 그 함수를 감싸는 또 다른 상위
   컴포넌트)로 진입한다면, `isProtected()`의 "AppInner 경유" 간접 판정
   로직을 그 새 구조에 맞게 일반화해야 한다(현재는 `AppInner`라는 이름을
   하드코딩) — 이 문서의 "무엇을 검사하는가" 2번 항목을 먼저 갱신할 것.
