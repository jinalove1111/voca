# 버그 분석 — 별(Stars) 중복 획득 (Liam/Dain 제보)

- 작성일: 2026-07-27
- 상태: **분석만 완료, 코드 미수정**
- 제보 증상: 학습 완료 후 별 획득 → 뒤로가기 → 같은 학습 화면 재진입 →
  다시 별 획득 가능(반복 가능해 보임)
- 이 문서는 코드를 고치지 않고, 실제 소스(`src/App.jsx`,
  `src/hooks/useStudent.js`, `src/components/WordDetail.jsx`)를 직접 읽어
  확인한 사실만 근거로 작성했다.

---

## 확인 결과 요약 (질문 1~6)

### 1. 별 지급 함수 위치

`addStars(n)` — `src/hooks/useStudent.js:753-756`:

```js
const addStars = useCallback((n = 1) => {
  patch(prev => ({ totalStars: prev.totalStars + n }))
  bumpHistory(day => ({ starsEarned: day.starsEarned + n }))
}, [patch, bumpHistory])
```

**이 함수 자체에는 어떤 중복 방지 로직도 없다.** 호출될 때마다
`totalStars`에 `n`을 무조건 더하는 순수 가산 함수 — "오늘 이미 줬는지",
"이 단어에 대해 이미 줬는지" 같은 검사가 전혀 없다. 즉 안전장치는 100%
**호출하는 쪽(caller)의 책임**으로 설계돼 있다.

코드베이스 전체에서 `addStars()`를 호출하는 지점은 정확히 6곳:

| 위치 | 트리거 | 중복 방지 존재? |
|---|---|---|
| `src/App.jsx:529` | `WordDetail`(가이드 세션)의 `onMarkPronunciationOk` | **없음** ← 제보와 정확히 일치 |
| `src/App.jsx:579` | `WordDetail`(일반 학습)의 `onMarkPronunciationOk` | **없음** ← 제보와 정확히 일치 |
| `src/hooks/useStudent.js:844` | `answerMission()` — 레벨업 미션(단어당 퀴즈 3연속 정답) 클리어 | 있음(`missions[].done` 플래그, 영구 상태) |
| `src/hooks/useStudent.js:892` | `grantSticker()` — 뽑기에서 중복 스티커가 나왔을 때 보너스 전환 | 해당 없음(중복 자체가 트리거 조건이라 설계상 매번 지급이 맞음) |
| `src/hooks/useStudent.js:959` | 오늘의 미션 4/4 완료 보너스 | 있음(`handledRoundRef` + round 즉시 리셋, 검증 완료 — 아래 "안전한 것으로 확인된 경로" 참고) |
| `src/hooks/useStudent.js:1136` | 쓰기시험 콤보 마일스톤(3/5/10) 보너스 | 있음(`round.spellingCombo` 서버 미러링 카운터, 오답 시 0으로 리셋 + `spellingComboBonus()`가 마일스톤 값에서만 양수 반환) |

**결론: 6곳 중 정확히 2곳(둘 다 발음 성공 콜백)만 중복 방지가 전혀 없고,
이 2곳이 제보된 증상의 정확한 발생 지점이다.**

### 2. 별 지급 Trigger 조건

`src/App.jsx:529, 579`:

```js
onMarkPronunciationOk={() => { markPronunciationOk(); addStars(1) }}
```

`WordDetail.jsx`의 `PronounceStep`(`WordDetail.jsx:255-350`)이 첫 번째
학습 단계다. 내부의 `SpeechBtn`(`WordDetail.jsx:20-246`)이 실제 트리거를
쥐고 있다:

- 학생이 녹음 버튼을 누르고 아무 소리든 녹음에 성공하면(`blob.size > 0`
  — 실제 발음 정확도는 채점하지 않음, `ARCHITECTURE.md:129`에 이미
  문서화된 의도적 설계) `finish('success', ..., { success: true })`가
  호출되고(`WordDetail.jsx:130-153`), 그 안에서
  `onSuccess?.()`(`WordDetail.jsx:81`) → 즉 `onMarkPronunciationOk` →
  `addStars(1)`가 실행된다.
- **컴포넌트 마운트 1회당 정확히 1번만 실행되도록 지역적으로는 막혀
  있다** — `handleClick`(`WordDetail.jsx:179-193`)이
  `phase === 'success'`일 때 버튼을 완전히 비활성화하므로
  (`disabled={phase === 'speaking' || phase === 'success'}`,
  `WordDetail.jsx:197`), **같은 화면에 머무는 동안** 녹음 버튼을
  연타해서 별을 여러 번 받는 것은 불가능함을 코드로 직접 확인했다.
- **그러나 `phase`는 `useState('idle')`(`WordDetail.jsx:21`)로, 이
  컴포넌트가 통째로 리마운트되면 완전히 초기화된다.** `WordDetail.jsx`는
  단어가 바뀌면(그리고 같은 단어로 재진입해도) `useEffect(() => {
  setStep(STEPS[0]) }, [word.id, mode])`(`WordDetail.jsx:551-569`
  부근)로 항상 첫 단계(`pronounce`)부터 다시 시작한다. 즉 **"뒤로가기 →
  같은 단어 다시 클릭"은 `PronounceStep`/`SpeechBtn`을 완전히 새
  인스턴스로 마운트시키고, `phase`는 다시 `'idle'`로 돌아가 녹음 버튼이
  다시 활성화된다.** 여기서 한 번 더 녹음에 성공하면 `onSuccess`가 다시
  호출되고, `addStars(1)`이 다시 실행된다 — **몇 번이든 반복 가능**.

### 3. 완료 상태 저장 위치

발음 성공 여부를 세는 카운터는 `round.pronunciationOk`
(`src/hooks/useStudent.js:882-884`):

```js
const markPronunciationOk = useCallback(() => {
  patch(prev => ({ round: { ...prev.round, pronunciationOk: (prev.round.pronunciationOk || 0) + 1 } }))
}, [patch])
```

이것도 `addStars`와 마찬가지로 **단순 증가 카운터**다. 비교를 위해
바로 근처(`useStudent.js:867-872`)의 `markWordViewed(wordId)`를 보면:

```js
const markWordViewed = useCallback((wordId) => {
  patch(prev => prev.round.wordsViewed.includes(wordId)
    ? {}
    : { round: { ...prev.round, wordsViewed: [...prev.round.wordsViewed, wordId] } })
  ...
}, [patch, bumpHistory])
```

`wordsViewed`는 **단어 id별로 중복을 거르는 배열(사실상 Set)**이다 —
같은 단어를 다시 봐도 배열에 또 안 들어간다. **`pronunciationOk`에는
이 패턴이 없다.** "이 단어에 대해 오늘 이미 발음 별을 받았는가"를
저장하는 곳이 코드베이스 어디에도 없다 — 즉 "완료 상태"라는 개념 자체가
발음 카테고리에는 존재하지 않고, 오직 "오늘 몇 번 성공했는가"라는 총량만
존재한다.

### 4. DB(student_progress 등) 저장 여부

`round`(그 안의 `pronunciationOk` 포함)와 `totalStars`는 둘 다 학생의
`progress_data` 클라우드 백업 blob의 최상위 필드이며(`useStudent.js`의
`normalizeRecord`/동기화 경로, 기존 세션에서 이미 확인된 아키텍처),
디바운스 자동 동기화를 통해 **Supabase `student_progress` 테이블에 실제
저장된다.** 즉 이 중복 획득은 새로고침하면 사라지는 화면상의 착시가
아니라 **영구적으로 클라우드에 기록되는 실제 데이터 오염**이다.

멀티 디바이스 병합 로직(`useStudent.js:472, 486`)도 확인했다:

```js
totalStars: maxNum(local.totalStars, cloud.totalStars),
...
pronunciationOk: maxNum(local.round.pronunciationOk, cloud.round.pronunciationOk),
```

`maxNum`(두 값 중 큰 쪽 채택)은 "기기 A와 기기 B가 서로 다른 값을 들고
있을 때 더 진행된 쪽을 신뢰한다"는 **기기 간 동기화 목적**의 로직이지,
"이 값이 실제로 정당하게 쌓인 값인지" 검증하는 로직이 아니다. 이미 한
기기에서 부풀려진 값은 병합을 거쳐도 그대로(오히려 더 큰 값으로 채택되어
확정)이다.

### 5. React state만으로 처리되는 부분

`addStars`/`markPronunciationOk` 둘 다 **서버 검증이 전혀 없는 순수
클라이언트 상태 변경**이다(`patch()`는 로컬 React state를 바꾸고, 그
결과가 나중에 디바운스로 클라우드에 그대로 업로드되는 구조 — 서버가
"이 학생이 정말 오늘 5번 발음에 성공했는지"를 재계산/검증하는 절차는
없음). 이는 이 앱의 별/포인트 경제 전체가 원래 갖고 있는 구조적 특성이다
(서버 권위 경제가 아니라 클라이언트 신뢰 + 클라우드 백업 구조) — 이번
버그가 유독 새로 만든 취약점이 아니라, 그 구조 위에서 **개별 트리거
지점에 반드시 있어야 할 "멱등성 가드"가 딱 이 2곳에서만 빠졌다**는
문제다.

### 6. 새로고침/재접속 시 검증 여부

없다. 새로고침/재로그인은 클라우드에 저장된 `totalStars`/
`round.pronunciationOk` 값을 **있는 그대로** 복원할 뿐, "이 값이
실제 학습 행동 횟수와 일치하는가"를 재계산하거나 감사(audit)하는
절차가 없다. 한 번 부풀려진 값은 새로고침/재접속으로 저절로 교정되지
않고 그대로 유지된다.

---

## 발생 원인 후보

1. **(확정, 최우선) `onMarkPronunciationOk` 콜백의 `addStars(1)`이
   단어별/일별 중복 방지 없이 매 성공마다 무조건 실행됨.** 정상적인
   UI 조작(뒤로가기 → 같은 단어 재선택 → 발음 성공)만으로 재현 가능 —
   비정상적인 해킹/devtools 조작이 전혀 필요 없다. `WordDetail.jsx`가
   단어 재진입 시 항상 `pronounce` 단계부터 새로 시작하도록 설계된 것
   자체는 정상 UX(다시 연습하고 싶을 수 있으므로)이고, 문제는 오직
   "다시 연습하는 것"과 "다시 별을 받는 것"이 분리되지 않았다는 점.
2. **(부수적, 별도 이슈에 가까움) `examplesHeard`/`quizSolved`도
   `pronunciationOk`와 동일하게 단어별 중복 방지가 없다.** 다만 이
   둘은 직접 `addStars`에 연결돼 있지 않고 "오늘의 미션 4/4"
   카테고리 카운터로만 쓰이는데, 그 4/4 완료 보너스 자체는 아래
   "안전한 것으로 확인된 경로"에서 보듯 `handledRoundRef` +
   `round` 즉시 리셋으로 이미 안전하게 막혀 있다. 그래도 같은 단어를
   반복해서 "5개 채우기" 목표를 비정상적으로 쉽게 채울 수 있다는 점은
   설계 의도(다양한 단어 5개)와 어긋나는 부수적 결함으로 별도 기록해
   둔다 — 이번 "별 중복 획득" 버그의 핵심 원인은 아니다.
3. **(배제) 서버 측 검증 부재 자체를 "원인"으로 볼 수도 있지만**, 이
   앱 전체의 별/XP 경제가 원래 클라이언트-신뢰 구조로 설계돼 있고
   (질문 5 참고), 이 구조를 바꾸는 것은 이번 버그 수정의 범위를 크게
   벗어난다 — 근본 원인은 "그 구조 안에서 이 2곳에만 멱등성 가드가
   빠졌다"는 것으로 좁혀서 본다.

### 안전한 것으로 확인된 경로 (오해 방지용 — 조사했으나 버그 아님)

"오늘의 미션 4/4 완료" 보너스(`useStudent.js:952-983`,
`addStars(MISSION_BONUS_STARS)`)도 처음엔 의심했으나, 실제로는:

- `handledRoundRef.current === signature` 가드로 같은 라운드에서 중복
  지급을 막고,
- 지급 즉시 `patch(() => ({ round: freshRound() }))`
  (`useStudent.js:981`)로 `round`(발음/예문/퀴즈/단어 카운터 전부)가
  **즉시 0으로 리셋**되므로, 반복 지급이 일어나려면 매번 4개 카테고리를
  전부 처음부터(각 5회씩) 다시 채워야 한다 — 이는 "미션은 하루 종일
  반복된다"는 기존 의도된 게임 설계(`useStudent.js:947-951` 주석)이지
  버그가 아니다.
- `grantXp`/`grantTicket`은 날짜 단위 idempotent 키로 별도 보호되어
  하루 1회만 지급(`useStudent.js:960-976`) — 별(`addStars`)만 반복
  가능한 것도 의도된 차이(주석에 명시)다.

레벨업 미션 클리어(`answerMission`, `useStudent.js:824-858`)도
`missions[].done` 플래그가 **영구 상태**(session/day가 아니라 학생
진행도 자체에 저장)라, 뒤로가기 후 재진입해도 이미 클리어한 단어의
미션을 다시 클리어할 방법이 없음을 확인했다(`m.done`이면
`answerMission`이 즉시 no-op).

---

## 관련 파일

| 파일 | 역할 |
|---|---|
| `src/App.jsx:529, 579` | 버그의 실제 발생 지점 — `onMarkPronunciationOk` 콜백에서 `addStars(1)` 무조건 호출 |
| `src/hooks/useStudent.js:753-756` | `addStars()` 정의 — 멱등성 없는 순수 가산 함수 |
| `src/hooks/useStudent.js:882-884` | `markPronunciationOk()` 정의 — 단어별 중복 방지 없는 raw 카운터 |
| `src/hooks/useStudent.js:867-872` | `markWordViewed()` — 대조군. 단어 id 기준 중복 방지가 이미 구현된 참고 패턴 |
| `src/hooks/useStudent.js:579-586` | `countCategoriesCompleted()` — `pronunciationOk`가 "오늘의 미션" 4개 카테고리 중 하나로 집계되는 지점 |
| `src/hooks/useStudent.js:472, 486` | 멀티 디바이스 병합 — `maxNum` 방식이라 부풀려진 값도 그대로 채택됨 |
| `src/components/WordDetail.jsx:20-246` | `SpeechBtn` — 발음 성공 판정(`finish(..., {success:true})`)과 `onSuccess` 호출 지점. 같은 마운트 내 재시도는 이미 막혀있음(`phase==='success'`면 버튼 비활성화) — 리마운트에는 무방비 |
| `src/components/WordDetail.jsx:255-350` | `PronounceStep` — 단어 진입 시 항상 이 단계부터 새로 시작(정상 UX) |
| `src/components/WordDetail.jsx:551-569` 부근 | 단어 변경/재진입 시 `step`을 항상 첫 단계로 리셋하는 `useEffect` — 리마운트 트리거의 근원 |

---

## 현재 흐름

```
[학생] 단어 목록에서 단어 클릭
  → WordDetail 마운트, step='pronounce' (SpeechBtn phase='idle')
  → 녹음 버튼 클릭 → 녹음 성공(blob.size>0)
  → SpeechBtn.finish(success:true) → onSuccess() → onMarkPronunciationOk()
      → markPronunciationOk()  (round.pronunciationOk += 1, 중복 방지 없음)
      → addStars(1)            (totalStars += 1, 중복 방지 없음)
  → phase='success' → 버튼 비활성화(같은 화면에 머무는 동안은 안전)
  → 학생이 "← 단어 목록"으로 이탈 (WordDetail 언마운트, 아무 것도 롤백 안 됨)
  → 같은 단어를 다시 클릭
  → WordDetail 다시 마운트(새 인스턴스), step='pronounce', phase='idle'  ← 완전 초기화
  → 다시 녹음 성공 → onMarkPronunciationOk() 다시 호출
      → round.pronunciationOk 또 +1, totalStars 또 +1  ← 중복 발생 지점
  → (반복 가능)
  → 디바운스 동기화로 totalStars/round가 Supabase student_progress에 그대로 업로드
  → 새로고침/재접속해도 부풀려진 값이 검증 없이 그대로 복원됨
```

---

## 수정 방향

핵심 원칙: **"발음 연습은 몇 번이든 다시 할 수 있어야 하지만(정상 UX,
`WordDetail.jsx` 주석에 이미 "다시 공부" 버튼 등으로 명시된 의도),
그 연습에 대한 보상(별)은 같은 단어에 대해 하루 한 번만 지급돼야
한다."** 즉 학습 흐름/재시도 UX는 전혀 바꾸지 않고, **보상 지급에만
`markWordViewed`와 동일한 패턴(단어 id 기준 중복 방지 Set)을 적용**하는
것이 가장 좁고 안전한 수정 범위다.

두 가지 설계 후보:

### 안 A (권장) — `pronunciationOk`를 카운터에서 "단어 id Set"으로 교체

`markWordViewed`가 이미 쓰고 있는 정확히 같은 패턴을 재사용:

```
// 설계 스케치 — 실제 코드 아님, 방향만 제시
round.pronunciationOkWordIds: string[]   // wordsViewed와 동일한 모양

markPronunciationOk(wordId) {
  이미 pronunciationOkWordIds에 있으면: 아무 것도 안 함 (별도 지급 안 함)
  없으면: pronunciationOkWordIds에 추가 + addStars(1) 호출
}
```

- 장점: `wordsViewed`와 완전히 같은 검증된 패턴이라 새로운 개념을
  도입하지 않음(코드 리뷰/이해 부담 최소). `countCategoriesCompleted`가
  `pronunciationOk >= GOAL`을 쓰던 자리를
  `pronunciationOkWordIds.length >= GOAL`로 바꾸면 "오늘의 미션" 로직도
  자연스럽게 같이 정확해짐(현재는 카운터라 우연히 GOAL과 일치하지만,
  Set으로 바꾸면 "서로 다른 단어 5개"라는 원래 의도가 코드로 강제됨 —
  현재 코드가 이미 그런 의도였다는 근거는 `wordsViewed`가 이미 그렇게
  돼 있다는 사실 자체).
- 주의: `markPronunciationOk`가 지금은 인자를 받지 않는데(`wordId`
  없음), `App.jsx:529, 579`의 호출부와 `WordDetail.jsx`가
  `onMarkPronunciationOk`에 `word.id`를 실어 보내도록 함께 바뀌어야
  함 — 영향 범위가 `useStudent.js` 한 곳이 아니라 콜백 시그니처를 타고
  `WordDetail.jsx`/`App.jsx`까지 이어지는 점을 감안해야 한다(여전히
  판정/UX 로직 변경은 없음, 순수 배선).
- 기존 저장 데이터 호환: `round.pronunciationOk`(숫자)를 읽던 기존
  로컬/클라우드 데이터가 있으므로, 필드명을 바꾸면 과거 값과의 하위
  호환(폴백) 처리가 필요(기존 세션들이 이미 여러 번 쓴 "새 필드 추가 +
  구 필드 폴백" 패턴 재사용 가능, 스키마/DB 변경 없이 `progress_data`
  blob 안의 필드 추가라 규칙 8/9 위반 아님).

### 안 B (최소 변경, 대안) — `addStars(1)` 호출부에만 별도의 "오늘 이미
받았는지" Set을 하나 더 두고 가드

`round.pronunciationOk` 카운터는 지금 그대로 두고(미션 집계용), 별
지급에만 쓰는 별도의 얇은 상태(`round.pronunciationStarredWordIds`
같은 이름)를 하나 더 추가해서 `App.jsx`의 콜백에서 `addStars(1)` 호출
직전에만 체크.

- 장점: 기존 `pronunciationOk` 카운터의 의미(미션 집계용 "이번
  라운드에 발음 성공한 횟수")를 전혀 안 건드려서 회귀 위험이 안 A보다
  더 작다.
- 단점: 상태가 하나 더 늘어나 "왜 카운터와 Set이 둘 다 있는지" 설명이
  필요(문서화 부담). 미션 집계용 숫자가 여전히 "같은 단어 반복도
  카운트"라는 부정확함(발생 원인 후보 2번)은 그대로 남는다.

**권장: 안 A.** 이미 검증된 `wordsViewed` 패턴을 그대로 재사용하는
쪽이 새로운 개념을 안 만들고, 부수적으로 발견한 원인 후보 2번(예문/퀴즈
카운터의 같은 결함)까지 같은 패턴으로 한 번에 정리할 길을 열어준다 —
단, 이번 수정 범위를 "발음 별 중복" 하나로 좁히고 싶다면 예문/퀴즈
쪽은 손대지 않고 발음만 먼저 고치는 것도 유효한 선택.

---

## 안전한 수정 방법 (구현 시 지켜야 할 것 — 아직 구현 금지, 방향 제시)

1. **판정/UX는 절대 안 건드린다.** "다시 연습하기"는 계속 몇 번이든
   가능해야 하고, 녹음 성공 판정 로직(`blob.size>0`, STT 비교 등)도
   그대로 유지. 바뀌는 것은 오직 "별을 주는 조건"뿐.
2. **하루 단위로 리셋되어야 한다.** `wordsViewed`가 `round`(자정
   롤오버되는 오늘 라운드) 안에 있는 것과 동일하게, 새 dedup 상태도
   `round` 안에 둬서 다음 날은 같은 단어로 다시 별을 받을 수 있어야
   한다(영구 잠금이 아님 — 매일 반복 학습이 이 앱의 핵심 설계).
3. **기존 데이터 폴백 필수(규칙 9).** `round.pronunciationOk`(숫자)만
   있고 새 필드가 없는 기존 학생 레코드에서도 앱이 절대 깨지면 안 됨 —
   새 필드 부재 시 빈 배열/0으로 안전 폴백.
4. **DB 스키마 변경 없음(규칙 8 해당 없음).** `progress_data`는 이미
   JSON blob이라 새 최상위 필드 추가는 SQL/GRANT가 필요 없다(기존
   `spellingReviewQueue`/`ticketLedger` 등과 동일 패턴) — 다만 실제
   구현 시 정말 새 컬럼이 아니라 blob 내부 필드인지 재확인.
5. **멀티 디바이스 병합 갱신.** `useStudent.js:472, 486` 근방의 병합
   로직에 새 필드에 대한 병합 규칙(두 기기의 dedup Set을 합집합으로
   합치는 것이 `unionList` 패턴과 일치 — `wordsViewed`가 이미
   `unionList(local.round.wordsViewed, cloud.round.wordsViewed)`를
   쓰고 있음, `useStudent.js:483`)을 함께 추가해야 두 기기 간 병합
   시에도 별이 또 중복되지 않는다. 이걸 빠뜨리면 "한 기기 안에서는
   고쳤는데 기기 A에서 받고 기기 B에서 또 받는" 새로운 변종이 남는다.
6. **기존에 이미 부풀려진 데이터(Liam/Dain 등)는 이번 코드 수정의
   범위가 아니다.** 코드를 고쳐도 이미 저장된 `totalStars`는 자동으로
   교정되지 않는다 — 필요하다면 별도의(운영자 승인하의) 데이터 보정
   작업으로 다뤄야 하며, 이는 코드 버그 수정과는 분리해서 판단할 사안.
7. **검증 시나리오(구현 후 필수)**: 같은 단어 반복 재진입 시 2번째부터
   별이 안 늘어나는지, 다른 단어는 정상적으로 별을 받는지, 자정이
   지나면(또는 새 `round`가 시작되면) 같은 단어로도 다시 받을 수
   있는지, 기존(새 필드 없는) 학생 레코드로 로그인해도 에러 없이
   동작하는지, 두 기기에서 각각 다른 단어를 학습한 뒤 병합해도 합계가
   정확한지 — 총 5가지를 `scripts/test*.mjs` 패턴으로 확인 필요(이번
   문서 작성 범위 밖, 구현 단계에서 진행).

---

## 참고 문서

- `docs/bugs/2026-07-26-ella-writing-spelling-stuck.md` — 이번 조사와
  같은 방법론(코드 직접 읽기 + file:line 인용)으로 작성된 선행 사례
- `ARCHITECTURE.md:129` — 발음 판정이 정확도 채점이 아니라 "녹음 성공 =
  연습 완료"라는 의도적 설계임을 명시한 기존 문서
- `GAME_DESIGN.md`, `handoff.md` (`addStars()` 4곳 관련 기술 부채 논의) —
  별 지급 경로에 대한 기존 설계 논의 배경
