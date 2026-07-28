# 별(Stars) 지급 단일 경로(Single Reward Flow) — 설계 + 구현 기록

- 작성일: 2026-07-28
- 상태: **설계+구현 완료, 커밋/배포는 별도 회귀 단계 이후**(운영자가
  직접 진행)
- 선행 문서: `docs/bugs/star-duplicate-reward-analysis.md`(최초 원인
  분석), `docs/fixes/star-reward-idempotency-design.md`(Option A 설계,
  발음 하나만 좁게 다룸), `handoff.md` 2026-07-27 14차(그 Option A의
  1차 구현 — 이번 문서가 대체/확장한다).

## 0. 이 문서가 왜 필요한가 — 14차 구현의 실측 회귀

2026-07-27 14차(`markPronunciationOk`에 `wordId` dedup 추가)는
`scripts/fakeReact.mjs` 스텁 하네스 기준으로는 PASS였지만, **실제
브라우저 회귀 테스트에서 발음 성공 시 별이 아예 0개 지급되는 회귀**를
냈다. 원인: `markPronunciationOk`가

```js
let firstTimeForWord = wordId == null
patch(prev => {
  ...
  if (!already) { firstTimeForWord = true; ... }
  return { round: nextRound }
})
if (firstTimeForWord) addStars(1)   // ← patch() 호출 직후, 밖에서 읽음
```

처럼 `patch(prev => {...})`의 **updater 함수 안에서만 설정되는 지역
변수를 patch() 호출 직후 밖에서 읽어** 지급 여부를 판단했다. React는
그 updater가 `patch()` 호출과 같은 tick 안에서 "이미 실행 완료됐다"고
보장하지 않는다 — 그래서 실제 브라우저에서는 `firstTimeForWord`가 항상
초기값(`wordId == null`이 아니면 `false`)으로 읽혀 별이 지급되지
않았다. `scripts/fakeReact.mjs`는 setState 업데이터를 더 관대하게(거의
동기적으로) 처리해서 이 회귀를 잡지 못했다 — 이번 세션은 실제 브라우저
회귀 테스트로 이 문제가 확정된 뒤 시작됐다.

운영자 지시: 이 한 지점만 다시 좁게 고치지 말고, **앱 전체의 모든
별 지급 지점을 전수 조사해서 하나의 검증된 공유 함수로 교체**해
이 버그 클래스 자체를 구조적으로 불가능하게 만든다.

## 1. 전수 조사 — 예전 별 지급 지점 전부

`addStars(n)`(예전 raw primitive, `src/hooks/useStudent.js`, 가드 없는
단순 `totalStars += n`)를 직접/간접 호출하던 지점 8곳:

| # | 위치 | 트리거 | 예전 dedup 상태 |
|---|---|---|---|
| 1 | `useStudent.js` `answerMission` | 레벨업 미션 3번째 정답(클리어) | **있어 보였지만 실은 버그** — `didClear`를 `patch()` updater 안에서만 설정하고 직후 밖에서 읽음(0번 항목과 동일 클래스 버그, 아래 2장 참고) |
| 2 | `useStudent.js` `markPronunciationOk` | 발음 연습 성공(WordDetail/GuidedSession) | **버그(0장)** — 이번 세션의 발단 |
| 3 | `useStudent.js` `grantSticker`(중복 분기) | 뽑기 중복 스티커 → 별 전환 | 없음(설계상 매번 지급 — 문제 아님) |
| 4 | `useStudent.js` 4/4 미션 완료 useEffect | 오늘의 미션 4/4 완료 보너스 | 있음(`handledRoundRef`, patch() 호출 **전** 동기적으로 판정 — 안전한 패턴) |
| 5 | `useStudent.js` `recordSpellingAnswer` | 쓰기시험 첫 시도 정답 콤보 마일스톤(3/5/10) | 있음(`combo`를 patch() 호출 **전** 클로저에서 계산 — 안전한 패턴) |
| 6 | `App.jsx:601` → `QuizGame.jsx` `handlePronSuccess` | 퀴즈 체크포인트 발음 성공 | **없음 + 이중 지급 가능** — `onMarkPronunciationOk?.()`(wordId 없이, "레거시 항상 지급" 분기를 탐) 와 `onAddStars?.(1)`을 **둘 다** 호출 |
| 7 | `App.jsx:668` → `MatchGameShell.jsx` `handleTap` | 미니게임(풍선/낚시/피자/기차) 라운드 첫 시도 정답 | 없음 — `firstTryUsed`가 컴포넌트 로컬 state라 리마운트(뒤로가기 재진입/새로고침)에 취약 |

이 중 **1번(`answerMission`)이 이번 조사로 새로 확정한 두 번째
회귀 지점**이다 — 아래 2장.

## 2. 두 번째 확정 버그 — `answerMission`(레벨업 미션 클리어)

수정 전 코드:

```js
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
  if (didClear) {                 // ← patch() 호출 직후, 밖에서 읽음
    patch(prev => ({ cleared: ... }))
    addStars(3)
  }
  return didClear
}, [patch, addStars])
```

`markPronunciationOk`와 **정확히 같은 클래스의 버그**: `didClear`가
`patch()`의 updater 함수 안에서만 설정되고, `patch()` 호출 직후 밖에서
읽힌다. 실제 브라우저에서는 3번째 정답에서도 `didClear`가 `false`로
읽혀 미션 클리어 별(+3)이 지급되지 않을 가능성이 구조적으로 있었다
(이번 세션에서 실측 재현은 안 했지만 — 운영자 지시가 "실측 우선, 최소
같은 클래스면 구조적으로 고칠 것"이었고, 코드 구조가 markPronunciationOk와
100% 동일해 별도 실측 없이도 수정 대상으로 확정할 수 있었다). `missions[]`
의 `done`/`cleared[]` 자체는 **patch()의 `prev` 체인으로 갱신되므로
멱등성 자체는 안전**했다 — 깨졌던 건 오직 "그래서 별을 지급할지" 판단
로직이었다.

## 3. 새 설계 — `grantReward(amount, dedupKey)`

`src/hooks/useStudent.js`의 **유일하게 `totalStars`를 바꾸는 함수**.
예전 `addStars`를 완전히 대체(반환 객체에서도 제거 — 아래 4장).

```js
const grantReward = useCallback((amount, dedupKey) => {
  if (!dedupKey) { console.warn(...); return false }
  if (round.starGrantLog.includes(dedupKey)) return false   // (A) 빠른 경로
  const today = todayStr()
  patch(prev => {
    if (prev.round.starGrantLog.includes(dedupKey)) return {}  // (B) 진짜 안전망
    const day = prev.history[today] || freshHistoryDay()
    return {
      totalStars: prev.totalStars + amount,
      round: { ...prev.round, starGrantLog: [...prev.round.starGrantLog, dedupKey] },
      history: { ...prev.history, [today]: { ...day, starsEarned: day.starsEarned + amount } },
    }
  })
  return true
}, [patch, round.starGrantLog])
```

### 왜 이 모양인가 — 두 겹 방어

- **(A) 바깥의 조기 반환**은 "이미 지급했는가"를 **이 렌더의 클로저에서
  이미 알 수 있는 값**(`round.starGrantLog`, 마지막으로 완료된 렌더
  기준)으로만 판단한다. `patch()` 호출 뒤에 그 결과를 다시 읽지
  않는다 — 0장/2장 버그가 정확히 이 규칙을 어겼었다. 이건 성능
  최적화(불필요한 `patch()` 호출 회피)이자 흔한 케이스(다른 렌더/다른
  이벤트에서 이미 지급됨을 아는 경우)의 정확한 처리다.
- **(B) `patch()`의 updater 안에서의 재확인**이 진짜 정확성 보증이다.
  React의 함수형 setState updater는 같은 tick에 여러 번 큐잉돼도 항상
  그 시점까지 누적된 최신 `prev`를 받는다(이건 React state updater의
  실제 보장 사항 — "updater가 이미 실행됐는지"와는 다른 차원의
  보장). 그래서 `grantReward`가 같은 tick에 같은 `dedupKey`로 여러 번
  불려도(예: 더블탭 레이스, `answerMission`이 초고속 연타로 두 번
  불리는 경우) 정확히 한 번만 `totalStars`가 늘어난다 — 두 번째
  호출의 updater가 실행될 시점엔 `prev.round.starGrantLog`에 이미 첫
  번째 호출이 추가한 키가 들어있기 때문.

반환값(`true`/`false`)은 (A)와 같은 이유로 낙관적 스냅샷이라 UI
피드백 등 참고용일 뿐, 지급 자체의 게이트가 아니다 — 지급의 정확성은
전적으로 (B)가 담보한다.

### `starGrantLog`가 사는 곳과 이유

`round.starGrantLog: string[]` — `round`(자정에 리셋, 이미
`pronunciationOkWordIds`/`wordsViewed`가 쓰는 배열-dedup 컨테이너)
안에 둔다. 멀티기기 병합(`mergeProgressRecords`)에도 같은 `unionList`
패턴으로 참여(두 기기 각각에서 이미 지급된 이벤트가 병합 후 다시
지급되지 않도록).

**중요한 설계 판단**: `starGrantLog`가 자정에 리셋되므로, "영구히 다시
지급되면 안 되는" 이벤트(미션 클리어)의 진짜 보호는 이 로그가 아니라
그 이벤트 자체의 영구 상태다:

- 미션 클리어 → `missions[].done`(영구, 절대 리셋 안 됨) +
  `cleared[]`(영구, append-only) — `answerMember`은 `willClear`를
  판정할 때 이미 이 영구 상태를 클로저에서 읽는다. `starGrantLog`의
  `mission-clear:${wordId}` 키는 오직 "같은 tick 안 우발적 중복
  호출"만 막는 2차 안전망.
- 발음/콤보/일일미션보너스는 애초에 "오늘" 스코프 이벤트라 자정 리셋이
  정확히 의도된 동작(내일 다시 발음 성공하면 다시 별을 받아야 함).

## 4. 이벤트별 dedupKey 확정안

| 이벤트 | 함수 | dedupKey | 비고 |
|---|---|---|---|
| 레벨업 미션 클리어 | `answerMission` | `mission-clear:${wordId}` | 진짜 방어는 `missions[].done`(영구) — 위 3장 |
| 발음 연습 성공(단어 특정 가능) | `markPronunciationOk` | `pronunciation:${wordId}:${today}` | WordDetail/GuidedSession/QuizGame 3개 호출부가 전부 동일 키 스킴 공유 — "오늘 이 단어 발음 성공"이 하나의 이벤트로 통합됨 |
| 발음 연습 성공(단어 특정 불가 — `wordId` null/undefined) | `markPronunciationOk` | `pronunciation-unidentified:${Date.now()}:${random}` | dedup 자체가 불가능한 입력이므로 항상 새 키 — "매번 지급"이라는 기존 레거시 동작 그대로(무제한 반복 지급이 아니라, 이 특정 호출은 항상 새 이벤트로 취급). 현재 3개 호출부 모두 wordId를 실어 보내므로 사실상 도달 안 함(안전망) |
| 뽑기 중복 스티커 보너스 | `grantSticker`(중복 분기) | `sticker-duplicate:${sticker.id}:${Date.now()}:${random}` | 매 뽑기가 별개 이벤트(의도적으로 항상 지급) — 타임스탬프+랜덤으로 항상 유니크, diaryPlacements의 placementId와 동일 패턴 |
| 오늘의 미션 4/4 완료 보너스 | 해당 `useEffect` | `daily-mission-bonus:${signature}` | **의도적으로 날짜 키가 아니라 `signature`(라운드별 고유값, `handledRoundRef`가 원래 쓰던 것과 동일 granularity)를 씀** — 아래 4-1 참고 |
| 쓰기시험 콤보 마일스톤(3/5/10) | `recordSpellingAnswer` | `spelling-combo:${wordId}:${combo}:${today}` | 같은 날 다른 단어/다른 콤보값은 별개 이벤트(의도된 반복 보상), 정확히 같은 조합만 dedup |
| 미니게임 라운드 첫 시도 정답 | `MatchGameShell.handleTap` | `matchgame:${sessionId}:${round}:${target?.dbId ?? target?.word}` | `sessionId`는 `startGame()`에서 매 플레이 세션마다 새로 발급(타임스탬프+랜덤) — 아래 4-2 참고 |

### 4-1. 왜 `daily-mission-bonus`를 날짜 키로 안 했는가

아래 3줄에서 `grantXp`/`grantTicket`은 이미 `${eventType}:${todayStr()}`
같은 순수 날짜 키를 쓴다(하루 1회만 지급). 처음엔 별 보너스도 같은
키 스킴(`daily-mission-bonus:${today}`)으로 맞추는 게 "일관성" 있어
보였지만, 기존 코드 주석(이 useEffect 헤더, v2.3.1 XP 분리 주석)이
**명시적으로** "별/스티커는 라운드가 반복될 때마다(하루 중 4/4를 여러
번 완료 가능 — "missions repeat all day") 매번 지급되는 게 의도된
게임 경제, XP만 하루 1회로 의도적으로 분리했다"고 기록하고 있다. 순수
날짜 키로 바꾸면 이 별 보상 빈도를 하루 1회로 **암묵적으로 축소**하게
되는데, 이건 "구조 버그 수정"이 아니라 "보상 경제 변경"이라 저장소
헌법 규칙 1(기존 플로우를 위험하게 하지 않는다)과 이번 작업 지시의
"Explicitly NOT in scope: don't unify different reward amounts/trigger
types" 원칙에 따라 **별도 운영자 승인 없이는 하지 않는다**. 대신
`signature`(기존 `handledRoundRef`가 쓰던 것과 완전히 같은 범위 — 같은
라운드의 중복 호출만 차단, 새 라운드는 항상 재지급)를 키로 써서 구조는
`grantReward`로 통일하되 **지급 빈도는 1바이트도 안 바꿨다**.

### 4-2. 왜 MatchGameShell은 날짜/영구 dedup이 아니라 세션 스코프인가

이 미니게임은 "한 번 더 하기"/재입장으로 몇 번이든 다시 플레이해서
별을 다시 얻는 게 원래 설계 의도(결과 화면의 "한 번 더 하기" 버튼이
그 증거)다 — 다른 이벤트들과 달리 **반복 자체가 정상 플레이**다.
그래서 dedupKey에 날짜나 영구 상태를 넣지 않고, "이 특정 플레이
세션의 이 특정 라운드 슬롯"만 유일하게 식별한다:

- `sessionId`는 `startGame()`(=인트로 화면에서 "🎮 시작하기"를 누른
  시점)마다 새로 발급 → 새 세션은 항상 새 dedupKey 스코프를 얻으므로
  반복 플레이 보상은 전혀 막히지 않는다.
- `round`(0~4, 그 세션 안에서의 라운드 인덱스) — 같은 세션 안에서
  같은 단어가 두 번 등장해도(라운드 3에서 다시 나올 수 있음,
  `pickNextTarget`이 "직전 라운드와 다른 단어"만 보장) 서로 다른
  라운드 인덱스라 독립적으로 지급된다(이게 기존 의도된 동작).
- 이 조합이 "같은 세션의 같은 라운드 인스턴스에 대한 우발적 중복
  호출"(더블탭 레이스 등)만 막는다 — 요청에서 지적한 "뒤로가기/새로고침
  중 `firstTryUsed`(컴포넌트 로컬 state)가 리셋되어 재지급 가능"
  시나리오도, 뒤로가기/새로고침은 컴포넌트 전체를 언마운트시켜
  `sessionIdRef`도 함께 사라지므로 결과적으로 "새 세션" 취급되는데,
  이건 정확히 "한 번 더 하기"와 동일한 의도된 반복 플레이라 문제가
  아니다.

## 5. 반환 API 변경 (외부에서 별을 지급하는 유일한 통로)

`useStudent()`의 반환 객체에서 `addStars`(가드 없는 raw primitive)를
완전히 제거하고 `grantReward`(dedupKey 필수)로 교체했다. 이제
`src/hooks/useStudent.js` 밖의 어떤 코드도 raw star 지급 primitive를
가질 방법이 없다 — 모든 소비처는 `grantReward(amount, dedupKey)`를
호출해야 하고, dedupKey를 안 넘기면 콘솔 경고와 함께 거부된다(호출부
버그를 조용히 삼키지 않음).

- `src/App.jsx` — `QuizGame`에는 더 이상 star 지급 prop을 넘기지
  않는다(발음 성공은 `onMarkPronunciationOk`만으로 충분, 아래 6-1
  참고). `game` 화면(`CurrentGame` → `MatchGameShell`)에는
  `onAddStars={addStars}` 대신 `onGrantReward={grantReward}`를 넘긴다.
- `src/components/MatchGameShell.jsx` — prop 이름을 `onAddStars` →
  `onGrantReward`로 변경, 자체 `sessionIdRef`로 dedupKey 생성(4-2 참고).
  `BalloonGame`/`FishingGame`/`PizzaGame`/`TrainGame`은 전부
  `{...props}`로 그대로 전달하는 얇은 테마 래퍼라 별도 수정 불필요.

## 6. 외부 컴포넌트 2곳 수정

### 6-1. `QuizGame.jsx` `handlePronSuccess` — 이중 지급 제거

수정 전:

```js
const handlePronSuccess = () => {
  setPronD(true)
  playSuccessSound()
  onMarkPronunciationOk?.()   // wordId 없음 → "레거시 항상 지급" 분기
  onAddStars?.(1)             // + 별도로 또 지급
}
```

수정 후:

```js
const handlePronSuccess = () => {
  setPronD(true)
  playSuccessSound()
  onMarkPronunciationOk?.(current?.word?.dbId)
}
```

`current.word.dbId`를 실어 보내면 `markPronunciationOk`가
WordDetail/GuidedSession 경로와 **완전히 동일한**
`pronunciation:${wordId}:${today}` dedupKey를 쓰게 되어, "오늘 이
단어 발음 성공"이 화면(WordDetail/GuidedSession/QuizGame) 3곳 어디서
일어나든 **하나의 공유 이벤트**로 취급된다 — 어느 화면에서 먼저
성공하든 그날 그 단어로는 한 번만 지급, 구조적으로 이중 지급이
불가능해졌다(별도 `onAddStars` 호출 자체가 사라졌으므로).

### 6-2. `MatchGameShell.jsx` `handleTap` — dedupKey 배선

```js
if (!firstTryUsed) {
  setScore(s => s + 1)
  onGrantReward?.(STAR_PER_CORRECT, `matchgame:${sessionIdRef.current}:${round}:${target?.dbId || target?.word}`)
}
```

## 7. 기존 데이터 호환 (규칙 9)

`round.starGrantLog`가 없는 기존 로컬/클라우드 레코드(리팩터링 이전
데이터)는 `normalizeRecord`의 `asArray(r.starGrantLog)` 폴백으로 항상
빈 배열로 안전하게 채워진다(오늘 날짜 round를 보존하는 기존 경로에
필드 하나 추가). `progress_data` jsonb blob 안의 새 최상위 필드일
뿐이라 **SQL 마이그레이션/GRANT 불필요**(규칙 8 해당 없음 —
`spellingReviewQueue`/`ticketLedger`가 이미 쓴 패턴과 동일).

## 8. 검증

- `npm run build` — PASS(신규 에러/경고 없음).
- `npm run verify:persistence` — 8개 스크립트 전부 PASS(이번에 건드린
  `round`/병합 로직의 직접 회귀 범위 — `scripts/testMultiTabRace.mjs`가
  `tab.result.addStars(...)`를 직접 호출하던 부분을
  `tab.result.grantReward(amount, uniqueDedupKey)`로 갱신, 검증하려는
  다중 탭/디바운스/추월 로직 자체는 변경 없음).
- `npm run verify:student` — 4개 스크립트 전부 PASS.
- 추가로(요청 범위 밖이지만 이 리팩터링이 `useStudent.js`/`QuizGame.jsx`/
  `App.jsx`를 광범위하게 건드려 보수적으로 함께 확인) `verify:quiz`,
  `verify:writing`, `verify:daily-ritual`, `verify:analytics`,
  `verify:admin`, `verify:speaking`(SKIP — 마이크 하드웨어 필요, 기존과
  동일하게 커버리지 없음) 전부 PASS/정상 SKIP.

## 9. 불변식 확인(요청된 4가지 grep)

- `grep -n "addStars" src/` — 남은 결과는 전부 주석(설명/역사 기록)뿐,
  실제 호출/참조 0건.
- `grep -n "totalStars +" src/hooks/useStudent.js` — 정확히 1곳
  (`grantReward` 안).
- `onAddStars`/raw star 지급 함수를 prop으로 받는 컴포넌트 0개 —
  `QuizGame`은 아예 안 받고, `MatchGameShell`은 `onGrantReward`(dedupKey
  필수 가드)만 받는다.
- 모든 dedupKey 판정은 patch() 호출 **전** 클로저/ref에서 동기적으로
  계산되고, `grantReward` 내부의 재확인도 `patch()` updater의 `prev`
  에서만 이뤄진다 — patch() 호출 후 밖에서 updater-internal 변수를
  읽는 곳 0곳.

## 10. 범위 밖으로 명시적으로 남긴 것

- `grantXp`/`grantTicket`(XP·티켓)은 손대지 않음 — 이미 서버 unique
  제약/날짜 원장으로 독립적으로 보호됨(운영자 지시).
- `SpellingQuestion.jsx`의 쓰기시험 진행(advance) 버그 수정은 무관한
  별도 작업, 이번 세션에서 손대지 않음.
- 보상 트리거 종류/금액 자체(미션클리어 +3, 발음 +1, 중복스티커
  보너스, 콤보보너스, 미니게임 정답)는 통합하지 않음 — "단일 지급
  경로/메커니즘"이지 "단일 이벤트 종류"가 아니라는 요청 범위를 그대로
  따름.
- `daily-mission-bonus` dedupKey를 날짜 키가 아니라 `signature`로
  결정한 것(4-1)은 요청 문서의 문자 그대로의 제안과 다르다 — 기존 별
  지급 빈도(하루 중 반복 지급)를 보존하기 위한 의도적 판단이며, 운영자가
  원래 의도가 "하루 1회로 조이는 것"이었다면 이 부분만 별도로 조정
  가능(코드 한 줄, `signature` → `todayStr()` 교체).

## 참고 문서

- `docs/bugs/star-duplicate-reward-analysis.md`
- `docs/fixes/star-reward-idempotency-design.md`
- `handoff.md` 2026-07-27(14차), 2026-07-28(이번 세션 항목)
