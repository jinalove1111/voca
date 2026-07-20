# Decision 0002 — Writing(Spelling) 기능 재설계 설계 리뷰

_2026-07-20. 최초 설계 리뷰 기록. 승인/구현 경과는 하단 "승인 및 구현
완료" 섹션 참고._

## 소집

Product Guardian, Learning Designer, Child Experience Designer,
Student Analytics(미래 지표 정의만). Engineer 역할(현재 구현 조사)은
본 세션이 직접 수행. QA Reviewer/Deployment Engineer는 코드 변경이
없어 미소집(`MULTI_AGENT_WORKFLOW.md` 규칙).

## 이견

없음 — 4개 전문가 전원이 동일한 핵심 원인(자정 리셋으로 인한 익일 복습
단절)을 독립적으로 지목, 코드 라인 근거도 서로 일치
(`useStudent.js:651` freshRound, `wordLibrary.js:863/1199-1206`).

## 최종 결정(최초 리뷰 시점)

아래 채팅 응답의 "권장 MVP"를 승인 대기 상태로 제시. 구현은 운영자
승인 후 별도 세션에서 진행.

---

## 승인 및 구현 완료 (2026-07-20)

운영자가 아래 MVP를 원래 의도한 설계와 일치한다고 승인했고, 실제로
구현·QA까지 완료됐다. 이 섹션이 그 최종 확정 스펙이다.

### 문제 정의(재확인)

`useStudent.js`의 `round`(하루 단위 진행 상태, `spellingWrongToday`
포함)는 자정마다 `freshRound()`로 통째로 리셋된다. 리셋 직전까지 학생이
못 끝낸(다시 안 맞힌) 철자 오답 단어는 이 리셋과 함께 그대로 사라져,
익일 복습으로 이어지지 않았다 — 이것이 진단된 근본 원인이다.

### 범위(In)

기존 `round.spellingWrongToday`(매일 리셋)와는 별도로, `progress_data`
jsonb 블록 안에 **영구(자정 리셋에서 살아남는) 대기열**
`spellingReviewQueue: []`를 추가한다. 스키마/컬럼 변경 없음 — 기존
jsonb 블롭 안의 새 필드일 뿐이다.

1. **`src/hooks/useStudent.js`**
   - `freshRecord()`가 `spellingReviewQueue: []`로 초기화.
   - `normalizeRecord()`가 필드 누락된 구버전 레코드를 빈 배열로
     정규화하고, 로드 시점에 날짜 경계를 넘은 것(`r.date !==
     todayStr()`)을 감지하면 `round`를 리셋하기 직전에 그날
     `spellingWrongToday`를 `spellingReviewQueue`에 합집합(union)으로
     이월한다(유실 방지).
   - 세션이 자정을 넘겨 계속 켜져 있는 경우를 위해 30초 주기
     `useEffect`가 동일한 롤오버 로직을 반복 수행.
   - `mergeProgressRecords()`가 기존 `stickers`/`cleared`와 같은
     패턴으로 기기 간 `spellingReviewQueue`를 합집합 병합(유실 없음).
   - `recordSpellingAnswer`/`clearSpellingReviewWord`가 정답 시 해당
     단어를 큐에서 제거.
   - 훅이 `spellingReviewQueue`를 소비자에게 반환.
2. **`src/App.jsx`** — 훅에서 받은 `spellingReviewQueue`를 복습 범위
   `reviewWordIds` 계산, 선물(gift) 닫을 때 자동 복습 화면 진입 조건,
   `WordDetail`(prop `spellingReviewQueue`)과 `SpellingReview`(기존
   `wrongWordIds`에 병합 + 별도로 `comebackWordIds`)에 연결.
3. **`src/components/SpellingQuestion.jsx`** — 새 선택 prop
   `isComebackWord`(기본 `false`). 참이면 정답 시 "🎉 예전에 틀렸던
   단어를 완전히 익혔어요!" 배지를 보여주고 기존 `levelup` Paul
   리액션을 재사용. 리뷰 중 발견된 무관한 소규모 UX 수정 하나 포함 —
   빈 답 제출 시 아무 반응 없던 것을 입력창 refocus로 변경.
4. **`src/components/SpellingReview.jsx`** — 새 선택 prop
   `comebackWordIds`(기본 `[]`), `SpellingQuestion`에 `isComebackWord`로
   전달. 헤더 문구를 "오늘 틀린 단어 복습" → "틀린 단어 복습"으로 변경
   (큐가 이제 오늘 것만이 아니라 여러 날 전 단어도 포함하므로).
5. **`src/components/WordDetail.jsx`** — 새 선택 prop
   `spellingReviewQueue`(기본 `[]`), `SpellingQuestion`에
   `isComebackWord`로 전달 — 배지가 전용 복습 화면뿐 아니라 일반 학습
   중에도 보이도록.
6. **`scripts/testMergeProgress.mjs`** — 롤오버(어제 `spellingWrongToday`
   → 큐 이월), 이월 시 유실 없는 합집합, 같은 날짜는 no-op, 구버전
   레코드 정규화, 기기 간 병합을 검증하는 테스트 섹션 추가. 전부 통과.

### 범위(Out) — 명시적으로 하지 않은 것

- 새 Supabase 컬럼/테이블 없음(기존 `progress_data` jsonb 재사용,
  GRANT 불필요).
- 새 화면/스크린 없음 — 기존 `SpellingReview` 복습 화면을 재사용.
- 학생 대상 게임화 요소 추가 없음(배지는 기존 리액션 시스템 재사용).

### QA 결과

`npm run build` PASS(에러 0). `npm run verify:writing` PASS.
`npm run verify:persistence` PASS(8/8, 신규 롤오버/병합 케이스 포함).
`npm run verify:student` PASS. 저장소 헌법 위반 없음 확인(학생 식별
UUID 일관, jsonb 재사용이라 스키마/GRANT 갭 없음, PIN/관리자 노출
없음, 소유하지 않은 파일 미변경). 불필요한 추상화/신규 의존성 없음.
