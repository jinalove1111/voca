# 버그 분석 — ELLA, Writing(철자 쓰기) "정답 입력해도 다음 문제로 안 넘어감"

- 작성일: 2026-07-26
- 상태: **분석만 완료, 코드 미수정** (요청에 따라 분석 문서만 작성)
- 대상 학생: ELLA
- 환경: PC 브라우저
- 증상: 단어를 정확히 입력했는데 다음 문제로 넘어가지 않음 → 쓰기 숙제 완료 불가

이 문서는 코드를 고치지 않고, 실제 소스(`src/components/SpellingQuestion.jsx`,
`src/utils/spelling.js`, `src/components/WordDetail.jsx`, `src/App.jsx`,
`src/hooks/useStudent.js`, `src/utils/speech.js`)를 직접 읽어 확인한 사실만
근거로 작성했다. 재구현/재조사 없는 재작업 방지 원칙(`CLAUDE.md` 규칙 3)에
따라 기존 구현의 의도(주석)도 함께 인용한다.

---

## 1. Writing 입력 처리 Flow

세션 구조: `App.jsx`(단어 목록/인덱스 관리) → `WordDetail.jsx`(단계 진행,
`mode='write'`일 때 `buildSteps`가 `['spelling']` 한 단계만 구성,
`WordDetail.jsx:514`) → `SpellingQuestion.jsx`(문제 1개의 입력/판정/오답
단계 전담).

1. **input** — `SpellingQuestion.jsx:317,340`. `<input>`은 `type="text"`,
   `autoComplete="off"`, 무작위 `name`(자동완성 프로필 매칭 차단),
   `onPaste`/`onDrop`/`onCopy` 차단(`SpellingQuestion.jsx:236-251`). 값 변경은
   `setInput(e.target.value)`.
2. **제출 트리거** — 버튼 클릭(`submitAnswer`, `SpellingQuestion.jsx:321-324`)
   또는 `onKeyDown={e => e.key === 'Enter' && submitAnswer()}`
   (`SpellingQuestion.jsx:318, 341`). **IME(한글) 조합 상태 확인
   (`isComposing`) 없이 `Enter` 키 이벤트만 본다.**
3. **validation/정답 판정** — `submitAnswer()`(`SpellingQuestion.jsx:185-211`)
   이 `isSpellingCorrect(input, targetAnswer, opts)`
   (`src/utils/spelling.js:73-79`)를 호출.
   - `normalizeSpelling`: `trim()` + `toLowerCase()`만 적용(`spelling.js:6`).
   - 대소문자 무시, 앞뒤 공백 무시. **단어 내부 공백은 그대로 비교**(주석:
     "ice cream"을 "icecream"으로 쓰면 오답 처리되어야 하므로 의도적으로
     내부 공백 제거 안 함, `spelling.js:28-30`).
   - `kr2en`(뜻→영어 철자, 기본값)에서는 `acceptedMeanings` 후보가 비교에
     들어가지 않음(`SpellingQuestion.jsx:193`) — target은 오직
     `word.word` 원문 그대로.
4. **결과 분기** (`submitAnswer`, `SpellingQuestion.jsx:194-211`):
   - `input.trim()`이 빈 문자열이면 아무 판정도 하지 않고 포커스만 재설정
     (`SpellingQuestion.jsx:190`).
   - 정답이면 `markCorrect()` 호출, 오답이면 `wrongCount` 증가 →
     1~3번째는 `phase` 그대로 `'answer'` 유지(발음 잠금),
     4번째부터 `phase='reveal'`(정답 공개 + 자동 발음, 한 번 더 입력해야
     통과).
5. **next word 이동** — `markCorrect()`(`SpellingQuestion.jsx:175-183`):
   `setPhase('correct')` → `playSuccessSound()` →
   **`setTimeout(() => onDone?.(), 700)`**. 이 `onDone`이
   `WordDetail.jsx:647`에서 `goNext`로 연결되고, `write` 모드는 단계가
   `spelling` 하나뿐이라 `goNext`(`WordDetail.jsx:575-579`)가 즉시
   `onNext()` → `App.jsx`의 `handleNextWord()`(`App.jsx:444-463`)를 호출.
   - `handleNextWord`는 `selectedWordIdx+1`이 5의 배수이고 다음 단어가
     있으면 **`bonusChoice`(풍선 게임 제안) 화면으로 먼저 이동**
     (`App.jsx:447-450`) — 곧바로 다음 문제로 안 가고 학생의 선택을
     기다리는 별도 화면이 뜬다.
   - 그 외에는 `sessionWords[nextIdx]`로 다음 단어 진입, 마지막 단어면
     `write` 모드는 `spellingResult`(성적 요약) 화면으로 전환
     (`App.jsx:456-459`).
6. **progress 저장** — `onResult(correct, resolvedDirection, input.trim())`
   (`SpellingQuestion.jsx:195`, 정답/오답 확정 시점, 첫 시도에만
   `reportedRef` 가드로 1회) → `App.jsx:646` → `handleSpellingAnswer`
   (`App.jsx:361-374`) → `studentData.recordSpellingAnswer(wordId, correct)`
   (`useStudent.js:1107-1149`): 오늘 `history.spellingCorrect` 누적,
   `GOAL=5`(`useStudent.js:139`) 도달 시 "쓰기" 미션 카테고리 완료 처리 +
   `writing-complete` XP 지급. **이 단계는 로컬 상태 갱신이며, 실제 클라우드
   동기화는 `useStudent.js`의 별도 디바운스 sync 이펙트가 담당**(이번
   조사 범위 밖 — 증상은 "같은 화면에서 안 넘어감"이므로 동기화 지연과는
   별개 문제로 판단).

핵심 관찰: **"정답 화면(`phase==='correct'`)에는 다음 문제로 수동으로
넘어갈 수 있는 버튼이 전혀 없다.** 유일한 탈출구는 `markCorrect()` 안의
`setTimeout(..., 700)` 하나뿐이다(`SpellingQuestion.jsx:351-382`의
`correct` phase JSX 참고 — 진행 버튼 없음, `PronounceStep`과 달리 수동
"다음" 버튼이 없음). 이 타이머가 어떤 이유로든 실행되지 않으면, 학생은
정답을 맞혔다는 화면을 본 채로 아무 조작도 할 수 없는 상태에 갇힌다.

---

## 2. 가능한 원인 TOP 10 (우선순위순)

1. **`markCorrect()` 내 `setTimeout` 미실행 — 단일 실패 지점(SPOF)**
   (`SpellingQuestion.jsx:175-183`). `setTimeout(...)` 앞의
   `playSuccessSound()`(`speech.js:53-59` → `getSuccessAudio()`,
   `speech.js:44-51`)에서 동기 예외가 발생하면 그 다음 줄인
   `setTimeout` 자체가 아예 등록되지 않는다. `playSuccessSound()` 내부는
   `audio.play()` 실패를 캐치하지만 `getSuccessAudio()`의 `new Audio(...)`
   생성 자체는 캐치되지 않는다. 정답 화면에는 수동 진행 버튼이 없으므로,
   타이머가 안 걸리면 그 화면에서 영구 정지 — 증상과 정확히 일치.
2. **IME(한글) 조합 중 `Enter` 오처리** (`SpellingQuestion.jsx:318, 341`).
   `e.key === 'Enter'`만 확인하고 `isComposing`을 보지 않음. `en2kr`
   방향(영어 단어 보고 한글 뜻 입력)이거나 `mixed`/`random` 방향에 걸린
   경우, 조합 완성 전 Enter가 눌리며 `submitAnswer()`가 미완성 문자열로
   실행 → 오답 처리 후 `input`이 `setInput('')`으로 지워짐
   (`SpellingQuestion.jsx:198`) → 학생 입장에선 "분명 맞게 다 쳤는데
   갑자기 지워지고 안 넘어간다"로 보일 수 있음. (단, 이번 리포트가
   "단어"라는 표현을 쓴 것으로 보아 `kr2en`일 가능성이 높아 우선순위는
   1번보다 아래로 둠 — 정확한 `direction` 확인 필요, 5번 항목 참고.)
3. **`words.word` 원본 데이터에 보이지 않는 문자** (트레일링 공백,
   전각공백 이외의 유니코드 공백, zero-width space, 유사 문자 등). `trim()`
   은 표준 공백만 제거하며 단어 중간/끝의 비표준 문자는 제거하지 않는다.
   특정 단어 한정 재현이면 이 항목이 유력.
4. **복합어(공백 포함 영어 단어) 채점 정책과의 충돌**. `spelling.js:28-30`
   설계상 영어 target 내부 공백은 의도적으로 정규화하지 않음("ice cream"
   ≠ "icecream"). 학생이 스페이스바를 두 번 치거나 자동교정으로 공백이
   추가/치환되면 육안상 "정확"해 보여도 오답 처리됨.
5. **5번째 단어마다 뜨는 `bonusChoice`(풍선 게임 제안) 화면을 "멈춤"으로
   오인** (`App.jsx:447-450`). 코드 버그는 아니지만, 정답을 맞혔는데
   다음 "단어 문제"가 아니라 별도 게임 제안 화면이 뜨면 관찰자(학부모/
   원장)가 "다음 문제로 안 넘어간다"고 보고할 수 있음. ELLA가 딱 5번째
   문제에서 막혔다면 이 경로일 가능성.
6. **`wrongAnswerRepeatCount` 반 설정이 UI 상수와 분리돼 있음.**
   반 설정 스키마에는 `wrongAnswerRepeatCount`(기본 3, `WordDetail.jsx:311`
   주석)가 있지만, `SpellingQuestion.jsx:23`의 `UNLOCK_AT=3`과
   `submitAnswer`의 `next >= 4`(`SpellingQuestion.jsx:202`) 임계값은
   하드코딩이라 실제로 이 설정값을 반영하지 않는다. 오답을 여러 번 했는데
   "발음 듣기"/정답 공개 타이밍이 반 설정과 안 맞아 학생이 막혔다고
   느꼈을 가능성(기능 자체가 멈추는 것은 아니지만 사용자 인지상 혼란
   유발).
7. **React state 업데이트 문제 — `word.id` 충돌로 인한 컴포넌트 상태
   잔존.** `WordDetail.jsx:638`의 `key={word.id}`가 세션 내 다음 단어와
   겹치는 `id`를 가지면(데이터 중복/재사용 버그) React가 같은 컴포넌트
   인스턴스를 재사용한다. `useEffect`의 deps는 `[word, wordAudioUrl]`
   (`SpellingQuestion.jsx:161`, `word`는 문자열 prop)이라 텍스트가
   다르면 정상 리셋되지만, 텍스트까지 우연히 같은 극단 케이스에서는
   오답 카운트/phase가 이전 문제에서 이어질 수 있음. 발생 가능성은 낮음.
8. **버튼 `disabled` 조건 — 실제로는 해당 없음(확인용 기재).** "확인"
   버튼(`SpellingQuestion.jsx:321-324`, `344-347`)에는 `disabled` 속성이
   전혀 없다 — 클릭 자체가 막혀 있을 가능성은 코드상 없음. 사용자가
   "버튼이 반응 없다"고 느꼈다면 버튼 비활성화가 아니라 클릭 이벤트 자체가
   씹혔거나(모바일/브라우저 렌더링 문제) 이미 `phase==='correct'`로
   전환된 뒤 이전 화면 잔상을 보고 있었을 가능성.
9. **브라우저 자동완성/키보드 예측 텍스트가 시각적으로 안 보이는 문자를
   삽입.** `autoComplete="off"` + 무작위 `name`으로 대부분 차단하지만
   주석(`SpellingQuestion.jsx:218-230`)에 이미 "OS 키보드 앱 자체의 예측
   텍스트는 웹 속성으로 100% 차단 불가"라고 명시돼 있음 — PC에서도
   일부 IME/확장 프로그램이 자동완성을 강제 삽입하는 사례 존재.
10. **탭 백그라운드로 인한 `setTimeout` 스로틀.** 정답 확인 직후 학생이
    다른 탭/창으로 전환하면 브라우저가 백그라운드 탭의 `setTimeout`을
    수 초~수십 초까지 지연시킬 수 있음(700ms가 훨씬 늦게 실행). 다만
    "완전히 안 넘어감"이 아니라 "늦게 넘어감"에 더 가까운 증상이라
    우선순위 최하위.

---

## 3. 재현 테스트 시나리오

모두 **QA\_ 접두어 임시 학생/반**으로 프로덕션 DB에서 진행 후 즉시 정리
(`handoff.md`에 기록된 기존 QA 픽스처 규칙 준수, 이름은 `maxLength=10`
제약 고려).

| # | 시나리오 | 목적 | 기대 결과(정상) |
|---|---|---|---|
| A | PC 크롬에서 `write` 모드로 진입, 5번째 이전 단어에서 정답을 정확히 입력 후 Enter | 기본 정답→다음 흐름 확인 | 700ms 후 자동으로 다음 문제 |
| B | 동일하되 4번째 정답 시점에서 정확히 5번째 단어(`selectedWordIdx+1 % 5 === 0`)를 맞힘 | 원인 5(bonusChoice) 재현 | 다음 문제 대신 풍선게임 제안 화면 등장 — 학생이 "선택 안 함" 상태로 방치되는지 확인 |
| C | 개발자도구 Network를 오프라인으로 전환한 뒤 `playSuccessSound`가 참조하는 `/success.wav` 사전 캐시 여부와 무관하게 정답 제출 | 원인 1(오디오 예외) 근접 재현 — 오디오 리소스 실패 시 `setTimeout`이 걸리는지 콘솔 로그로 확인 | 캐치되지 않는 예외가 콘솔에 뜨는지, 뜬다면 다음 문제로 안 넘어가는지 |
| D | `direction=en2kr` 또는 `mixed`로 설정된 반에서, 한글 IME로 뜻을 입력하던 도중(조합 완료 전) Enter를 빠르게 누름 | 원인 2(IME) 재현 | 미완성 글자로 오답 처리되는지, 학생이 "분명 맞다"고 느낄 시각 상태인지 |
| E | `words` 테이블에서 특정 단어의 `word` 컬럼 끝에 임의로 공백/유니코드 공백을 넣은 QA 단어로 동일 테스트 | 원인 3 재현 | 육안상 동일한 입력이 오답 처리되는지 |
| F | 공백 포함 영어 단어("ice cream" 등)를 target으로 "icecream"/"ice  cream"(공백 2번)으로 입력 | 원인 4 재현 | 오답 처리되는지, 학생이 왜 틀렸는지 알기 어려운지 |
| G | 3회 연속 오답 후 4번째에서 정답 공개(reveal) 화면에 정답을 정확히 그대로 입력 | reveal 단계 판정 별도 확인 | `phase='reveal'`에서도 A와 동일하게 넘어가는지 |
| H | ELLA 실제 계정(또는 동일 조건 복제 QA 계정)의 `sessionWords`/`classWords`에서 해당 단어 앞뒤로 `id` 중복 여부를 DB에서 직접 조회 | 원인 7 배제/확정 | 중복 `id`가 실제로 존재하는지 |
| I | 정답 제출 직후 탭을 다른 창으로 전환해 30초 대기 후 복귀 | 원인 10 재현 | 복귀 즉시 다음 문제로 넘어가는지(지연이었을 뿐인지) |

가장 먼저 확보해야 할 사실 하나: **ELLA가 멈춘 그 단어의 `direction`
(kr2en/en2kr), 세션 내 몇 번째 단어였는지(5의 배수 여부), 그리고 해당
`words` 행의 `word` 컬럼 원문(공백/특수문자 유무)** — 이 3가지만 확인해도
원인 후보를 10개에서 2~3개로 좁힐 수 있다.

---

## 4. 우선순위 판단 (P0/P1/P2)

**P0 — 즉시 확인/조치 필요 (숙제 완료 자체를 막는 회귀급 이슈)**
- 원인 1(정답 화면 SPOF, 수동 진행 버튼 부재) — 코드 구조상 "정답을
  맞혀도 영원히 멈출 수 있는" 유일한 지점. 재현 여부와 무관하게 안전망
  (예: 정답 화면에도 수동 "다음 문제" 버튼을 두는 것)이 없다는 사실 자체가
  구조적 리스크.
- ELLA가 실제로 멈췄던 단어의 `direction`/순번/DB 원문 확인(위 "가장
  먼저 확보해야 할 사실") — 원인 좁히기 전제 조건.

**P1 — 이번 주 내 확인 (재현되면 다수 학생에게 영향 가능)**
- 원인 2(IME `isComposing` 미확인) — `en2kr`/`mixed` 반을 쓰는 모든
  학생에게 잠재적으로 동일하게 영향.
- 원인 3, 4(데이터/공백 이슈) — ELLA 개인 단어 데이터부터 확인, 재현되면
  같은 단어를 배정받은 다른 학생도 동일 증상일 것이므로 전수 확인 필요.
- 원인 5(bonusChoice 화면 UX 혼란) — 버그는 아니지만 "멈췄다"는 오인
  신고의 실제 원인일 가능성이 높아 우선 확인 대상.

**P2 — 여유 있을 때 (영향 범위 작거나 확인 우선순위 낮음)**
- 원인 6(설정값-상수 불일치) — 기능 정지가 아니라 UX 기대와의 불일치.
- 원인 7(key 충돌) — 발생 조건이 데이터 중복이라는 드문 케이스.
- 원인 8(disabled — 해당 없음 확인용), 9(키보드 예측 텍스트), 10(백그라운드
  탭 스로틀) — 코드로 통제 불가능하거나 이미 최대한 방어돼 있음.

---

## 5. 수정 전에 필요한 로그 위치 제안

코드 수정 없이도, 아래 지점에 **임시 진단 로그**(콘솔 또는 기존 로깅
패턴)를 추가하면 다음 재현 시 원인을 바로 특정할 수 있다. 실제 추가는
이번 작업 범위 밖(문서만 작성 요청)이라 위치만 제안한다.

1. **`SpellingQuestion.jsx:175` (`markCorrect` 진입 직후)** — `phase`
   전환 시각, `word`, `resolvedDirection`, `wrongCount` 기록. 정답 화면에
   진입은 했는지부터 확인.
2. **`SpellingQuestion.jsx:181` (`playSuccessSound()` 호출 전후)** —
   `try/catch`로 감싸 예외 발생 여부와 메시지를 콘솔에 기록(원인 1
   직접 검증). 지금은 예외가 나면 흔적 없이 `setTimeout` 등록이
   스킵되므로, 콘솔에조차 아무것도 안 남을 수 있음 — 이 자체가 진단
   공백.
3. **`SpellingQuestion.jsx:182` (`setTimeout` 콜백 내부, `onDone` 호출
   직전)** — 실제로 700ms 후 이 줄까지 도달하는지 타임스탬프 기록.
   도달 안 하면 1번 로그는 찍혔는데 이 로그가 안 찍힌 것으로 원인 1을
   확정할 수 있음.
4. **`SpellingQuestion.jsx:318, 341` (`onKeyDown` 핸들러)** — `Enter`
   이벤트 시점의 `e.nativeEvent.isComposing` 값과 `input` 원문을 기록
   (원인 2 직접 검증).
5. **`spelling.js:73` (`isSpellingCorrect` 진입/반환부)** — `input`,
   `target`의 각 문자를 `charCodeAt`으로 나열한 값(비표준 공백/유사문자
   확인용, 원인 3·4 검증), 그리고 최종 `true/false` 반환값.
6. **`App.jsx:444` (`handleNextWord` 진입부)** — `selectedWordIdx`,
   `sessionWords.length`, `completedCount % 5` 결과, 어느 분기(`bonusChoice`
   / 다음 단어 / `spellingResult` / `wordBrowser`)로 갔는지 기록(원인 5
   검증).
7. **`useStudent.js:1107` (`recordSpellingAnswer` 진입부)** — 호출
   여부·`wordId`·`correct` 기록. 이 로그가 안 찍히면 문제는
   `SpellingQuestion` 내부(제출 자체가 발생 안 함)로 범위가 좁혀지고,
   찍혔는데 화면이 안 넘어가면 문제는 오히려 `goNext`/`handleNextWord`
   쪽(원인 5, 7)으로 좁혀짐 — 이 로그 하나로 "판정 문제 vs. 화면전환
   문제"를 즉시 이분할 가능.

이 7개 지점의 로그를 켠 상태로 ELLA(또는 동일 반/동일 단어 QA 계정)의
재현을 한 번만 확보하면, 위 TOP 10 중 실제 원인을 사실상 확정할 수 있다.

---

## 참고 문서
- `TESTING.md` — 기존 verify 하네스 구조(향후 회귀 테스트 추가 시 참고)
- `handoff.md` — QA\_ 픽스처 규칙, `maxLength=10` 테스트 함정 등 기존 세션의
  검증 방법론
- `docs/agent-decisions/0002-writing-feature-design-review.md`,
  `docs/operations/task2-writing-analysis.md`,
  `docs/operations/task2-writing-report.md` — 쓰기(Writing) 기능 기존 설계/
  분석 문서

---

## 6. 후속 심층 분석(2026-07-27) — "correct phase 이동 실패" 원인 확정

**전제**: 이 절은 "판정 자체는 정답으로 확정됐다(`phase==='correct'` 진입)
는데, 그 다음 단어로 못 넘어간다"는 좁힌 범위만 다룬다. 판정 자체가
실패하는 경로(오답으로 잘못 처리되는 IME/데이터 원인 등, 위 1~10번 후보)는
이 절의 범위 밖이며, 여전히 "1번 확인해야 할 사실"(어느 phase에서 멈췄는지
직접 확인)이 최우선이라는 결론은 그대로 유지된다.

### 6-1. `markCorrect()` 전체 흐름 (실제 코드, `SpellingQuestion.jsx:175-183`)

```js
const markCorrect = (achievedCombo = 0) => {
  setPhase('correct')                                   // ① 동기, React state 업데이트 예약
  const isMilestone = achievedCombo >= 2 && spellingComboBonus(achievedCombo) > 0
  setCorrectPaul(...)                                    // ② 동기, React state 업데이트 예약
  playSuccessSound()                                     // ③ 동기 호출 — 여기서 던지면 ④는 등록조차 안 됨
  setTimeout(() => onDone?.(), 700)                       // ④ 유일한 "다음 문제 이동" 트리거
}
```

호출 경로: `submitAnswer()`(`SpellingQuestion.jsx:196`) → 사용자가
"확인" 버튼 클릭 또는 `Enter` 키 입력(React 합성 이벤트 핸들러 내부) →
`markCorrect(firstAttempt ? combo + 1 : 0)`.

### 6-2. `setTimeout(700ms)` 실행 조건

- **등록 조건**: `③ playSuccessSound()`가 예외를 던지지 않고 리턴해야
  `④`가 실행된다. `①②③④`는 전부 같은 동기 함수 호출 스택 안에 있으므로,
  `③`에서 던지는 예외는 `try/catch`가 전혀 없어 `markCorrect` 전체를
  중단시키고 `④`는 아예 실행되지 않는다(자바스크립트 기본 동작 — 그 다음
  줄로 진행 자체가 안 됨).
- **발화 조건**: 일단 등록되면 브라우저의 매크로태스크 큐에 들어가
    React의 렌더/커밋 사이클과 무관하게 독립적으로 700ms 후 실행된다
    (React가 타이머를 가로채거나 지연시키지 않음 — React 18의 자동
    배칭은 "state 업데이트를 몇 번 리렌더할지"만 제어하지, `setTimeout`
    자체의 발화 타이밍은 건드리지 않는다).
  - 단, **브라우저가 이 타이머를 지연시킬 수 있는 경우**가 있다 — 6-6절
    참고(백그라운드 탭 스로틀링).
- **정리(cleanup) 부재**: 컴포넌트의 유일한 `useEffect` cleanup
  (`SpellingQuestion.jsx:159`)은 `cancelRef.current?.()`와
  `stopCurrentAudio()`만 정리하고, 이 `setTimeout`의 id는 어디에도
  저장되지 않아 `clearTimeout`으로 취소될 수 없다 — 즉 한 번 등록되면
  컴포넌트가 언마운트돼도 콜백 자체는 살아서 실행된다(단, 언마운트된
  컴포넌트 내부 상태를 참조하진 않고 `onDone` prop 클로저만 호출하므로
  React 경고나 크래시는 나지 않는다).

### 6-3. `playSuccessSound()` 이후 state 변경 순서

**중요한 사실**: `①`/`②`(state 업데이트)가 `③`(`playSuccessSound`)
**이전에** 이미 호출된 상태다. 즉 `③`에서 무엇이 터지든, `phase`는 이미
`'correct'`로 바뀌는 리렌더가 예약돼 있다. 이는 "왜 학생이 실제로 초록색
정답 화면(`phase==='correct'`)을 보고 있는데도 안 넘어가는가"라는 관찰과
정확히 일치하는 코드 구조다 — **화면 전환(①②) 은 성공하고, 그 다음 단어
이동(④)만 실패하는 것이 구조적으로 가능**하다는 뜻.

### 6-4. 다음 문제 이동 함수명 (호출 체인)

`onDone?.()` (`SpellingQuestion.jsx:182`)
→ `onDone` prop = `goNext` (`WordDetail.jsx:647`, `step === 'spelling'`
렌더 블록에서 전달)
→ `goNext()`(`WordDetail.jsx:575-579`): `write` 모드는 `STEPS=['spelling']`
한 개뿐이라 `nextIdx(1) >= STEPS.length(1)` → `onNext()` 호출
→ `onNext` prop = `handleNextWord`(`App.jsx:576`에서 연결, 함수 본체
`App.jsx:444-463`) — 실제 "다음 단어로 배열 인덱스 이동" 로직.

/ 이 4단계 체인 중 어느 한 곳이라도 참조가 끊기면(예: prop이
`undefined`) 조용히 아무 일도 안 일어난다. 코드상 `onDone`/`onNext`는
`WordDetail`/`App.jsx` 렌더 시 항상 값이 채워지는 구조라 "prop 미배선"
자체의 가능성은 낮다(직접 확인함 — 조건부 전달 없음).

### 6-5. React state batching 문제 가능성 — **낮음, 사실상 배제**

- `markCorrect` 안의 `setPhase`/`setCorrectPaul`은 React 합성 이벤트
  핸들러(`onClick`/`onKeyDown`) 호출 스택 안에서 실행되므로 React 18
  자동 배칭으로 한 번의 리렌더로 묶인다 — 이건 **의도된 정상 동작**이지
  버그가 아니다.
- `setTimeout` 콜백 내부에서 실행되는 `handleNextWord`의 여러 `setState`
  호출(`setWord`/`setWordIdx`/`setLastWordIndex`)도 **React 18부터는
  타이머/프로미스 콜백 안에서도 자동 배칭이 적용**되므로(React 17까지만
  타이머 내부가 배칭 예외였음), 프로젝트가 React 18(`CLAUDE.md`/
  `ARCHITECTURE.md` 스택 기준)을 쓰는 한 "일부 state만 반영되고 나머지는
  누락"되는 배칭 관련 이상 리렌더 가능성은 낮다.
- 결론: **batching 자체가 이 버그의 원인일 가능성은 낮게 판단**한다(아래
  가능성 % 참고). 다만 "React 18 자동 배칭이 적용되려면 실제로
  `createRoot`로 마운트돼 있어야 한다"는 전제 자체를 실제 `main.jsx`
  진입점에서 확인하지 않았다는 점은 한 줄 남겨둔다(이번 조사에서 직접
  읽지 않음, 필요시 확인 대상).

### 6-6. "PC Chrome 환경에서만 발생 가능한 이유" 분석

증상이 PC 브라우저 한정으로 보고됐다는 전제하에, 코드 자체(`SpellingQuestion.jsx`)에는
플랫폼 분기 코드가 전혀 없다 — 즉 **코드가 PC/모바일을 구분해서 다르게
동작하는 지점은 없고**, 차이는 전적으로 "PC Chrome이라는 실행 환경의
특성"에서 와야 한다. 그 특성 후보:

1. **PC Chrome은 브라우저 확장 프로그램 생태계가 있다(모바일 Chrome은
   확장 프로그램을 지원하지 않음).** 광고 차단기/개인정보 보호
   확장(uBlock 계열 등)이 `HTMLMediaElement.prototype.play`를
   몽키패치해 자동재생을 막는 경우, 일부 구현은 **거부된 Promise를
   반환하는 대신 호출 즉시 동기적으로 예외를 던진다.** `playSuccessSound()`
   (`speech.js:53-59`)는 `audio.play()?.catch(() => {})`로 **Promise
   거부는 잡지만, `play()` 호출 자체가 동기적으로 throw하는 경우는 잡지
   못한다.** 이건 정확히 6-3에서 지목한 "`③`에서 던지면 `④`가 등록 안
   됨" 시나리오의 실제 트리거 후보이며, 모바일 Chrome/일반 브라우저보다
   **PC Chrome에서만 확장 프로그램이라는 변수가 존재**한다는 점과 정확히
   들어맞는다.
2. **Chrome의 백그라운드 탭 타이머 스로틀링("Intensive Throttling").**
   PC는 여러 탭을 동시에 띄워두고 전환하는 사용 패턴이 모바일보다 훨씬
   흔하다. 학생이 정답을 맞힌 직후 다른 탭/창으로 전환하면, Chrome은
   백그라운드 탭의 `setTimeout`을 초 단위~분 단위로 지연시킬 수 있다
   (모바일은 앱 전환 시 탭이 아니라 전체 브라우저가 백그라운드로 가는
   OS 레벨 동작이라 패턴이 다름). 700ms가 수 분 뒤로 밀리거나, 최악의
   경우(Chrome 메모리 절약 기능으로 탭 자체가 discard됨) 페이지 컨텍스트가
   통째로 사라져 다시 포커스해도 새로고침 전까진 영영 안 넘어간다.
3. (참고, 확률 낮음) PC 환경은 물리 키보드 + 데스크톱 IME 조합기를
   쓰므로 Enter 키 처리 미묘한 차이가 있을 수 있으나, 이 절의 범위(판정
   이후 단계)에는 직접 해당하지 않는다 — 판정 자체가 실패하는 경로는
   위 1~10번 후보 중 2번 참고.

---

## 7. 원인 후보 / 가능성 % / 최소 수정 위치 / 수정 방법 (설계 수준)

| # | 원인 후보 | 가능성 | 최소 수정 위치 | 수정 방법(설계 수준) |
|---|---|---|---|---|
| 1 | **PC Chrome 확장 프로그램(광고 차단/개인정보 보호 등)이 `HTMLMediaElement.play()`를 몽키패치해 동기 예외를 던짐 → `playSuccessSound()`가 `markCorrect()`를 중단시켜 `setTimeout(④)`이 아예 등록 안 됨** | **40%** | `SpellingQuestion.jsx:175-183` (`markCorrect` 내부 문장 순서) | `setTimeout(() => onDone?.(), 700)`을 `playSuccessSound()` **이전**으로 옮기거나(다음 이동을 사운드 재생 성공 여부와 완전히 독립시킴), `playSuccessSound()` 호출을 `try { } catch {}`로 감싸 어떤 예외도 `markCorrect` 흐름을 막지 못하게 함. 두 방법 중 어느 쪽이든 "정답 판정 → 다음 이동"이 "효과음 재생 성공"에 의존하지 않게 만드는 것이 핵심 설계 원칙. |
| 2 | **Chrome 백그라운드 탭 타이머 스로틀링/탭 디스카딩으로 700ms 타이머가 크게 지연되거나 탭 컨텍스트 자체가 소실됨** | **20%** | `SpellingQuestion.jsx:351-382` (`phase === 'correct'` 렌더 블록) | 이 파일 안에 이미 존재하는 패턴(`WordDetail.jsx:499-504`의 `PronounceStep` 완료 화면 — 자동 진행 없이 수동 "완료! 다음 단어 →" 버튼)을 `correct` phase에도 동일하게 도입 — 자동 타이머가 늦거나 실패해도 학생이 직접 눌러 빠져나갈 수 있는 탈출구를 마련. 새 기능이 아니라 같은 파일/형제 컴포넌트가 이미 쓰는 기존 패턴 재사용. |
| 3 | **`onDone`/`onNext` prop 체인 단절(미배선)** | **5%** (코드 직접 확인 결과 조건부 전달 없음 — 구조적으로 발생하기 어려움, 배제에 가까움) | 해당 없음(현재 코드에서 근거 없음) | 별도 조치 불필요 — 재현 시 `handleNextWord` 진입 로그(이전 절 6번 로그 위치)로 호출 자체가 왔는지만 확인하면 즉시 배제/확정 가능. |
| 4 | **React 18 자동 배칭 이상** | **5%** (구조상 배제에 가까움 — 위 6-5 참고) | 해당 없음 | 별도 조치 불필요. 단, `main.jsx`(또는 진입점)가 실제로 `ReactDOM.createRoot`를 쓰는지 1회성 확인 권장(이번 조사에서 미확인). |
| 5 | **`word.id` 중복으로 인한 `SpellingQuestion` 컴포넌트 재사용(리마운트 실패)** | **10%** | 데이터(해당 반의 `words`/단어 배정 테이블) — 코드 위치 아님 | 코드 수정이 아니라 데이터 정합성 확인(같은 세션 `sessionWords` 배열 내 `id` 중복 여부 SQL로 조회) 문제. 중복이 확인되면 근본 수정은 데이터 배정 로직 쪽(별도 조사 필요). |
| 6 | **탭 백그라운드 전환 없이 순수 오디오 리소스(`/success.wav`) 로드 실패가 동기 예외로 전파** | **15%** | `src/utils/speech.js:44-51`(`getSuccessAudio`) | `new Audio(...)` 생성부를 `try/catch`로 감싸, 실패 시 `play` 메서드만 가진 무해한 stub 객체를 반환하도록 방어 — `playSuccessSound()` 호출부(`markCorrect`)는 그대로 두고 오디오 유틸 내부에서만 방어. 항목 1의 보강책으로 함께 적용하면 가장 견고. |
| 7 | **원 증상이 사실 "correct phase 진입" 자체가 아니라 판정 실패(오답 반복)인데 관찰자가 정답 화면으로 착각** | **재분류 대상**(확률 산정 대상 아님) | 해당 없음 — 최초 문서 1~10번 후보 참고 | 재현 시 가장 먼저 `phase` 상태를 콘솔에서 직접 확인해 이 절(6~7)의 전제 자체가 맞는지부터 검증 필요. |

**최소 수정 세트(권장)**: 항목 1 + 6을 함께 적용하면(둘 다
`markCorrect`/`playSuccessSound` 경로를 "실패해도 진행을 막지 않게"
만드는 동일한 설계 방향) 가장 근본적인 SPOF가 닫힌다. 항목 2(수동 탈출
버튼)는 원인이 무엇이든 통하는 범용 안전망이라, 근본 원인을 100%
못 밝히더라도 이것 하나만으로 "정답 맞혔는데 영구히 멈추는" 증상 자체는
구조적으로 재발 불가능해진다 — 근본 원인 규명과 별개로 우선순위가 가장
높은 이유.

---

## 8. 수정 전 최종 설계 검토 (2026-07-27) — 여전히 코드 미수정

### 8-1. `markCorrect()` 내부에서 `playSuccessSound()`가 `await` 되는가 — **아니오**

`markCorrect`는 `async` 함수가 아니고, `playSuccessSound()` 호출 앞에
`await`이 없다(`SpellingQuestion.jsx:181`). `playSuccessSound()` 자체도
`return` 문이 없어 아무 값(Promise 포함)도 호출자에게 돌려주지 않는다
(`speech.js:53-59`). 즉 **"Promise를 안 기다려서 생기는 문제"는 아니다**
— `audio.play()`가 반환하는 Promise의 거부(reject)는 이미
`.catch(() => {})`(`speech.js:58`)로 **내부에서 완전히 소비되고
`markCorrect`까지 전파되지 않는다.**

**정확한 재진단**: 애초에 "40% — Promise 문제"라는 가설명은 부정확했다.
실제 위험은 Promise 비동기 거부가 아니라 **Promise가 만들어지기도 전에
발생하는 동기(synchronous) 예외**다 — 예: `getSuccessAudio()`
(`speech.js:44-51`)의 `new Audio(...)`가 실패하거나, PC Chrome 확장
프로그램이 `HTMLMediaElement.prototype.play`를 몽키패치해 **Promise를
반환하는 대신 호출 즉시 동기적으로 throw**하는 경우. 이런 동기 throw는
`?.catch()` 체이닝으로 절대 잡히지 않는다(체이닝은 "일단 Promise가
반환된 이후"에만 작동). 결론: 원인은 확인되나 이름이 "Promise 처리"가
아니라 **"동기 예외 미방어"**로 정정한다.

### 8-2. audio 실패가 다음 문제 이동을 block하는 구조인가 — **예, 확인됨**

`markCorrect()`의 4개 문장(`SpellingQuestion.jsx:175-183`)은 하나의
동기 호출 스택에서 순서대로 실행된다:

```
① setPhase('correct')            — 이미 실행됨(화면은 "정답!"으로 전환)
② setCorrectPaul(...)            — 이미 실행됨
③ playSuccessSound()             — ★ 여기서 동기 예외가 나면
④ setTimeout(() => onDone?.(), 700)   ← 이 줄 자체가 "실행되지 않는다"
```

자바스크립트는 예외가 발생하면 그 함수의 나머지 문장을 건너뛰고 즉시
빠져나간다 — `try/catch`가 없으므로 ③의 예외가 ④의 등록 자체를 막는다.
`①②`는 이미 끝난 뒤라 학생은 "정답이에요!" 화면을 보고 있지만, 다음
문제로 이동시켜줄 유일한 트리거(④)가 존재하지 않게 되고, `phase==='correct'`
화면에는 수동으로 넘어갈 수 있는 버튼이 전혀 없다(`SpellingQuestion.jsx:351-382`
확인 완료). **차단 구조가 실재함을 확인.**

### 8-3. 다음 문제 이동 로직을 audio 성공 여부와 독립시키는 설계안

설계 원칙 한 줄: **"다음 문제로 넘어가는 조건은 정답 판정 그 자체여야
하며, 축하음 재생 성공 여부에 절대 의존해서는 안 된다."**

```
[개선 구조]
markCorrect()
  ① setPhase('correct')
  ② setCorrectPaul(...)
  ③ setTimeout(() => onDone?.(), 700)      ← 먼저, 무조건 예약
  ④ try { playSuccessSound() } catch {}    ← 축하음은 "베스트 에포트"로 강등
                                              (실패해도 ③은 이미 예약된 뒤라 영향 없음)
```

- ③과 ④의 **순서를 맞바꾸는 것만으로** "다음 이동"과 "축하음 재생"이
  서로 독립된 문장이 된다 — 하나가 실패해도 다른 하나는 절대 영향받지
  않는다.
- 추가로 ④를 `try/catch`로 감싸면, 순서를 바꾸지 않은 경우에도(또는
  향후 누군가 순서를 다시 바꾸더라도) 이중으로 안전하다 — 두 방어가
  서로 다른 실패 모드를 막으므로 **둘 다 적용**을 권장(4-1 참고).
- **"절대 멈추지 않는 구조"라는 조건**은 사실 오디오 경로 하나만
  막아서는 완전히 충족되지 않는다(예: 향후 알려지지 않은 새로운 예외
  원인, 6-6절의 백그라운드 탭 타이머 지연 등은 오디오와 무관하게 여전히
  존재). 이를 문자 그대로 만족시키려면 `phase==='correct'` 화면에
  **수동 탈출 버튼**(이미 같은 파일의 `PronounceStep`이 쓰는
  "완료! 다음 단어 →" 버튼과 동일 패턴, `WordDetail.jsx:499-504` 참고 —
  새 UI 개념 도입 아님)을 안전망으로 병행하는 것이 원인 규명과 무관하게
  가장 확실하다.

### 8-4. 수정 시 최소 변경 방식 제안

| 구분 | 변경 내용 | 변경량 | 목적 |
|---|---|---|---|
| **핵심 최소 수정(A)** | `SpellingQuestion.jsx`의 `markCorrect()` 안에서 `setTimeout(...)` 문장을 `playSuccessSound()` 호출보다 **앞으로 이동** | 문장 2줄 순서 교환 | "이번에 분석된 40% 원인(오디오 관련 동기 예외)"을 구조적으로 차단 |
| **핵심 최소 수정(B)** | 이동 후에도 `playSuccessSound()` 호출을 `try { } catch {}`로 감싸기 | 3줄 추가(감싸기) | A만으로 막히는 것은 "이번 특정 원인"뿐 — B는 미래의 다른 오디오 관련 예외까지 포괄적으로 방어 |
| **구조적 보장(C, 조건 충족용)** | `phase === 'correct'` 렌더 블록에 지연 후 나타나는 수동 "다음 문제 →" 버튼 1개 추가(기존 `PronounceStep` 패턴 재사용) | JSX 블록 1개 추가, 기존 마크업/문구 변경 없음 | "학생이 절대 멈추지 않는 구조"라는 조건은 오디오 원인 이외의 미지 원인까지 커버해야 문자 그대로 성립 — A/B는 "이번에 밝혀진 원인"만 닫고, C가 있어야 "절대"가 성립 |

**A+B만 적용 시**: 이번에 분석된 40% 원인은 완전히 닫히지만, "절대
멈추지 않는 구조"라는 조건은 엄밀히는 미충족(다른 미지 원인엔 여전히
취약). **A+B+C 적용 시**: 조건 4가지(Writing 흐름 유지/축하음 유지/
모바일·PC 모두 동작/절대 안 멈춤)를 모두 만족 — A/B/C 어느 것도 판정
로직(`isSpellingCorrect`), 진행도 저장 경로(`onResult`/
`recordSpellingAnswer`), 단계 이동 체인(`goNext`/`handleNextWord`)을
전혀 건드리지 않으므로 Writing 학습 흐름은 100% 그대로 유지되고, 축하음은
여전히 재생 시도되며(베스트 에포트로 격하될 뿐 제거되지 않음), 플랫폼
분기가 없는 수정이라 모바일/PC 동일하게 적용됨.

### 8-5. 결과 요약

**현재 구조**: 정답 판정 → 화면 전환(성공) → 축하음 재생(★ 실패 시
예외 전파) → 다음 이동 타이머 등록(★ 위 예외로 인해 미실행 가능) →
탈출구 없음.

**개선 구조**: 정답 판정 → 화면 전환 → **다음 이동 타이머 선(先)
등록(무조건)** → 축하음 재생 시도(베스트 에포트, 실패해도 무관) → (보강)
수동 탈출 버튼 상시 대기.

**수정 파일**:
1. `src/components/SpellingQuestion.jsx` — 핵심(`markCorrect()` 함수
   내부 + `phase === 'correct'` JSX 블록).
2. (선택, P1 보강— 이번 최소 범위 밖) `src/utils/speech.js`의
   `getSuccessAudio()` — `new Audio(...)` 생성부 자체 방어. 호출부
   시그니처 불변이라 다른 caller에 영향 없음.

**수정 범위**: `SpellingQuestion.jsx` 한 파일, `markCorrect()` 함수
내부 4~5줄 순서 조정/감싸기 + `phase==='correct'` 블록에 조건부 버튼
1개 추가. `isSpellingCorrect`/`submitAnswer`/`direction`/
`acceptedMeanings`/`onResult`/`goNext`/`handleNextWord` 등 판정·진행도·
이동 로직은 전혀 변경하지 않음 — 영향 범위는 "정답 확정 이후, 다음
문제로 넘어가기 전"의 좁은 구간으로 완전히 국한됨.
