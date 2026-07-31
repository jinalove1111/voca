# PAUL_EASY_VOCA_AI_LEARNING_ENGINE_PLAN.md — 데이터 기반 성장형 AI 학습 시스템 설계

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL을 이 세션에서 전혀
작성·실행하지 않았다.** `PAUL_EASY_VOCA_MASTER_PLAN.md`(§1 Memory
Engine 설계 원본), `PAUL_EASY_VOCA_CURRENT_STATUS.md`(§I 쓰기 AI 분석),
`PAUL_EASY_VOCA_AI_AGENT_OS.md`/`PAUL_EASY_VOCA_AI_DEVELOPMENT_
PROTOCOL.md`(이 설계를 실제로 만들 때 따를 조직/절차), `docs/research/
memory-engine.md`/`paul-memory-engine-design.md`/`student-engagement-
psychology.md`를 종합한다. 겹치는 상세(6-box Leitner 알고리즘 선정
근거 등)는 반복하지 않고 원본을 인용한다._

**목표 재확인**: "보카 앱"에서 "학생 데이터를 보고 스스로 더 똑똑해지는
학습 시스템"으로 — 단, `PROJECT_PAUL_GOAL.md`의 가드레일(조작적
참여 유도 금지, 수치 경쟁이 아닌 성장 중심)을 벗어나지 않는 범위에서.
**이미 있는 데이터/기능을 최대한 재사용**하고, 정말 없는 것만 새로
설계한다 — 이 문서 전체를 관통하는 원칙.

---

## 1. 학생 학습 데이터 수집 구조

### 1.1 지금 이미 수집되고 있는 것 (재사용 대상)

| 신호 | 저장 위치 | 성격 |
|---|---|---|
| 단어별 상태(알아요/모름/스킵/숙달) | `word_status` | 학생 자기신고 + 시스템 판정 혼합 |
| 일별 학습 요약 | `student_daily_progress`(퀴즈 정답률, 발음 시도횟수, 오답 단어 목록) | **집계값**(개별 시도가 아니라 하루 단위 합) |
| 반복 오답 패턴 | `writing_answer_statistics`(단어×뜻×정규화답안, count/accepted/rejected) | 이미 개별 답안 수준까지 촘촘함 |
| 입실시험 결과 | `entrance_test_results` | 서버 재채점된 신뢰 가능한 신호 |
| XP 이벤트 원장 | `xp_ledger` | 행동 단위(학습이 아니라 "무엇을 했는지") |
| 익명 행동 로그 | `product_events` | **의도적으로 비식별**(재조인 불가) — 개인화 용도 아님, 제품 차원 리텐션 통계 전용 |

### 1.2 진짜 빠진 것 — 통합 학습 이벤트 로그

위 표를 보면 알 수 있듯, 지금 데이터는 **"하루 요약"이나 "단어별
누적"수준**이지, "학생 X가 몇 시 몇 분에 단어 Y를 보고 Z라고 답해서
틀렸다"는 **개별 사건(event) 단위 기록**이 아니다. 약점분석(§2)·오답
패턴(§3)·복습추천(§4) 전부 결국 이 개별 사건이 있어야 정밀해진다.

**설계 제안(개념만, 실제 컬럼/SQL 아님)**: `product_events`와 같은
append-only 패턴이되, **`product_events`는 프라이버시를 위해 의도적
으로 비식별화**된 반면, 이건 개인화가 목적이므로 `student_id`를
그대로 갖는 별도 이벤트 로그(가칭 `learning_events`)로 설계한다 —
두 로그는 목적이 다르므로 하나로 합치지 않는다(구조 판단):

```
learning_events (개념)
  student_id, word_id(nullable — 발음/퀴즈처럼 단어 무관 이벤트 있음),
  event_type('word_viewed'|'pronunciation_attempt'|'quiz_answer'|
             'spelling_answer'|'review_completed' 등),
  is_correct(nullable), response_time_ms(nullable),
  occurred_at
```

**설계 판단 근거**: 학생 식별은 항상 `students.id`(CLAUDE.md 규칙 4),
새 저장 인프라를 만들기 전에 기존 `student_daily_progress`/`word_
status`로 충분한지 먼저 검토(규칙 3 재구현 금지 정신) — **결론: 집계
수준(§2 약점분석)은 지금 데이터로도 상당 부분 가능하지만, 진짜 정밀한
개인화 추천(§4)과 응답시간 기반 신뢰도 판단은 이 신규 로그 없이는
한계가 있다.** 그래서 이 로그는 "당장 필수"가 아니라 "Memory Engine이
성숙하는 단계(§10 로드맵)에서 필요"로 분류한다 — 처음부터 만들지 않는다.

---

## 2. 학생별 약점 분석 시스템

### 2.1 약점의 정의 (경쟁이 아니라 개인 기준)

`PROJECT_PAUL_GOAL.md`의 "자기 비교 우선" 원칙에 따라, 약점은 **다른
학생과 비교한 순위가 아니라 이 학생 자신의 카테고리별 상대적 저성과**로
정의한다.

### 2.2 분석 축

| 축 | 데이터 소스 | 신뢰도 |
|---|---|---|
| 단어 숙련도 | `word_status`(mastered 비율) + `word_king_history`류 계산 로직 재사용 | 높음 |
| 철자/쓰기 정확도 | `student_daily_progress.quiz_correct/quiz_total` + `writing_answer_statistics` | 높음 |
| 문법/표현 유형별(문장학습 연계 시) | `docs/reading/05-grammar-taxonomy.md`의 문법 태그 + `sentence_progress` | 중간(Reading Foundation 학생 UI 자체가 아직 OFF — §10에서 다룸) |
| **발음 정확도** | `pronunciation_attempts`(횟수만) | **낮음 — 실제 정확도 신호 없음(§6·§10에서 상세)** |

### 2.3 산출 방식 (규칙 기반, AI 호출 없음)

- 카테고리별 정답률을 계산해 학생 개인의 전체 평균 대비 낮은 카테고리를
  "이번 주 약점 후보"로 표시 — **순수 통계 계산**, 비용 발생 AI 불필요
  (규칙 7 무료 우선 원칙).
- 표시 톤은 "이 단어들이 아직 헷갈려요" 같은 격려형 — `weeklyReport.js`
  가 이미 채택한 규칙기반 템플릿 관례를 그대로 따른다.

---

## 3. 오답 패턴 분석

### 3.1 이미 있는 실측 데이터로 시작

`docs/operations/task2-writing-analysis.md`(99건 표본 실측)가 이미
오답을 카테고리화했다 — 이 분류 체계를 그대로 재사용:

| 오답 유형 | 실측 비율(99건 기준) | 처리 방식 |
|---|---|---|
| 단순 오타(편집거리 1~2) | 약 19% | 규칙(Levenshtein)만으로 자동 인정, AI 불필요 |
| 동의어/다른 표현 | 약 15% | `accepted_meanings`에 등록되면 이후 자동 인정 |
| 굴절/품사 변형 | 약 10% | lemma/POS 힌트로 처리 |
| 명백한 오답(다른 단어 혼동) | 약 20~24% | AI/교사 판단 필요 |
| 애매(맥락 의존) | 약 15% | AI/교사 판단 필요 |

### 3.2 개인 vs 반 전체 패턴 구분

- **개인 패턴**: 한 학생이 반복적으로 같은 유형(예: 항상 철자 순서를
  바꿔 씀)의 실수를 하면 → §2 약점 분석에 반영, 그 학생 전용 복습
  추천(§4)에 가중치.
- **반 전체 패턴**: `writing_answer_statistics.distinct_student_ids`가
  이미 "몇 명이 같은 오답을 냈는지"를 담고 있다 — 이 값이 높으면
  **개별 학생 문제가 아니라 커리큘럼/설명 방식 문제일 가능성**
  → 교사 Dashboard(§9)에 "이 단어, 반 전체가 헷갈려함" 알림.

**핵심 설계 판단**: 오답 패턴 분석 인프라(`writing_answer_statistics`)
는 **이미 다 만들어져 있다** — 이 섹션에서 새로 설계할 것은 "그 데이터를
개인별/반별 두 관점으로 나눠 보여주는 것"뿐, 새 수집 인프라가 필요
없다.

---

## 4. 개인별 복습 추천 알고리즘

### 4.1 이미 있는 것 — 단어 수준 추천

`writingAnswerStatsApi.js`의 `fetchLearningRecommendations`(관리자
화면 "AI 추천 학습" 카드, `DATABASE.md` 확인 사실)가 이미 **반복
오답 Top50**을 산출하고 있다 — 단, 이건 "이 단어가 반에서 자주
틀린다"는 **집계 수준** 추천이지 "이 학생에게 지금 이 단어를 복습
시켜야 한다"는 **개인화 스케줄**은 아니다.

### 4.2 개인화 추천 점수 설계 (개념 공식)

```
추천우선순위(학생, 단어) =
    w1 × (6 - box_level)           -- Leitner 박스가 낮을수록 우선(§5)
  + w2 × 최근_오답_빈도(그 학생·그 단어)
  + w3 × 경과일수(마지막 학습 이후)
  - w4 × 이미_오늘_복습함 여부(중복 방지)
```

가중치(`w1~w4`)는 실측 데이터가 쌓인 뒤 조정 — 지금 시점에는 **정밀한
튜닝보다 "박스 낮은 것 + 최근 오답" 두 신호만으로 시작**하는 것을
권장(단순한 것부터, 검증 가능한 단위로 확장).

### 4.3 기존 기능과의 통합 지점

- 지금 "오늘 학습 종료 시 오답 자동복습"은 **당일 한정**(자정 리셋).
  이 알고리즘은 그 위에 **여러 날에 걸친 스케줄**을 얹는 것 — 기존
  로직을 대체하지 않고 확장.
- `spelling_review_queue`/`spelling_ai_grading_cache`가 이미 처리한
  판정 결과(accept/reject)는 재사용 — 추천 대상에서 이미 "인정됨"
  처리된 답안은 제외.

---

## 5. Spaced Repetition 적용 방법

`PAUL_EASY_VOCA_MASTER_PLAN.md` §1이 이미 6-box Leitner 시스템을
알고리즘 선정 근거(FSRS/HLR 기각 이유 포함)까지 확정했다 — 여기서는
재도출하지 않고 **어떻게 지금 시스템에 끼워 넣는지**만 다룬다.

### 5.1 박스 전환 규칙 (요약, 상세는 MASTER_PLAN §1)

- 정답 → 다음 박스로 승급(간격 즉시→1→3→7→14→30일)
- 오답 → **1단계만 강등**(전체 리셋 아님 — 아동 정서 보호, `docs/
  research/memory-engine.md` 설계 근거)

### 5.2 기존 시스템과의 접점

| 기존 요소 | 이 설계와의 관계 |
|---|---|
| `word_status.status='mastered'` | 박스 5(최고 단계) 도달과 동기화 — 별도 판정 기준을 새로 만들지 않는다 |
| Garden(텃밭) 시각화 | **최고 ROI 연동 지점**(MASTER_PLAN §1) — 입력을 "학습여부(y/n)"에서 "box_level"로 바꾸기만 하면 신규 화면 0개로 SRS가 눈에 보이게 됨 |
| 오늘의 미션(단어/예문/퀴즈/발음 4/4) | 그대로 유지 — SRS는 "오늘 무엇을 볼지"를 결정할 뿐, 미션 완료 판정 로직 자체는 안 바꿈 |
| Interleaving(신규/복습 혼합) | 오늘 배정 단어 순서를 순수 함수 하나로 재배열 — `daily_assignments`/`getStudentWords()` 폴백 체인은 그대로 |

---

## 6. AI Teacher 역할

### 6.1 무엇을 하는 존재인가 — "새 챗봇"이 아니라 "기존 폴 캐릭터의 확장"

이 앱은 이미 "폴 선생님" 캐릭터(마스코트 이미지, "폴의 기억" Attachment
시스템, `paulReactions.js` 리액션 로직)를 갖고 있다 — **새로운 AI
페르소나를 만들지 않고 이 기존 캐릭터가 하는 말을 더 똑똑하게 만드는
것**이 AI Teacher의 정체다.

### 6.2 역할 3단계 (비용/안전 순으로 제한)

| 단계 | 내용 | AI 호출 여부 |
|---|---|---|
| 1. 격려/동기부여 메시지 | "3일 연속 학습했어요!" 류 — `weeklyReport.js`가 이미 쓰는 규칙기반 템플릿 패턴 | **없음**(비용 0, 규칙 7 원칙) |
| 2. 학습 힌트 | 철자 힌트(`spelling_hint_enabled`, 이미 있음), 오답 시 "정답은 이런 형태예요" | **없음**(기존 규칙기반) |
| 3. 개방형 첨삭/피드백(문장 단위 작문 등) | 정형화된 입력·출력만(예: "이 표현이 더 자연스러워요") | **제한적 AI**(기존 Provider 추상화 재사용, 캐시/비용상한 적용) |

### 6.3 안전 원칙 (아동 대상 AI의 핵심 제약)

- **자유 대화형 챗봇은 설계하지 않는다.** 8~13세 학생이 통제되지 않은
  LLM과 열린 대화를 나누는 것은 콘텐츠 안전/정서적 안전
  (`PROJECT_PAUL_GOAL.md` 가드레일) 관점에서 위험이 크다 — AI Teacher의
  모든 출력은 **정형화된 템플릿 + 제한된 슬롯 채우기**(예: "OO 단어를
  다시 연습해볼까요?" 류) 또는 §6.2 3단계처럼 **입력·출력 형태가 미리
  정의된 좁은 태스크**로 한정한다.
- AI 호출이 필요한 3단계도 기존 쓰기 AI 보조와 동일하게 **관리자 승인
  전에는 학생에게 직접 노출하지 않는 것을 기본값**으로 검토(신뢰
  경계 원칙 재사용) — 단, 이건 실제 구현 단계에서 Learning Science
  Agent + Security Agent가 함께 재확인할 사항(`PAUL_EASY_VOCA_AI_
  DEVELOPMENT_PROTOCOL.md` §6 절차 그대로 적용).

---

## 7. 학생 성장 Score 설계

### 7.1 XP와 절대 혼동하지 않는다 — 이것이 핵심 설계 결정

지금 이미 있는 `xp_ledger`/`total_xp`는 **"무엇을 했는지"(행동 단위)**
를 측정한다 — 많이 할수록 오른다. 반면 **성장 Score는 "얼마나 잘하게
됐는지"(성과 단위)**를 측정해야 한다. 이 둘을 섞으면 정확히
`PROJECT_PAUL_GOAL.md`가 경계하는 "보상 파밍"(학습 없이 활동만으로
보상 획득)이 성장 지표에까지 스며든다 — **별도 지표로 반드시 분리**.

### 7.2 구성 요소 (전부 기존 데이터에서 파생, 신규 저장 컬럼 없음)

| 요소 | 계산 방법 | 데이터 소스 |
|---|---|---|
| 숙달률 | `mastered` 단어 수 / 전체 학습 시도 단어 수 | `word_status` |
| **유지율(가장 중요)** | 한 번 숙달된 단어가 시간이 지나도 다시 안 틀리는 비율 | `word_status` + SRS 박스 이력(§5) — "진짜 학습"의 가장 강력한 증거 |
| 향상 추세 | 최근 2주 정확도 vs 이전 2주 정확도(자기 자신과 비교만, 반 평균과 비교 안 함) | `student_daily_progress` |
| 복습 성실도 | 추천된 복습(§4)을 실제로 완료한 비율 | 신규 이벤트(§1) 또는 `spellingReviewQueue` 완료 이력 |

### 7.3 표시 원칙

- **다른 학생과의 순위/백분위로 절대 표시하지 않는다** — 기존 "성장
  앨범+타임머신"(밀스톤 자동 감지, 주간 비교)이 이미 이 원칙으로
  만들어져 있으므로, 성장 Score는 그 기존 시스템의 **새 지표 하나를
  추가하는 것**으로 설계(완전히 새 화면을 만들지 않음).
- 숫자 하나로 뭉뚱그리기보다 "무엇이 늘었는지"(숙달 단어 수, 유지율)를
  구체적으로 보여주는 것이 `PROJECT_PAUL_GOAL.md`의 VisibleGrowth
  축에 더 부합.

---

## 8. 학부모 리포트 시스템

### 8.1 이미 있는 것

`ParentScreen.jsx` + `weeklyReport.js`(`computeStudentStats`/
`buildWeeklyReport`, AI 호출 없는 규칙기반) — 관리자 대시보드와 동일
소스를 공유해 두 화면이 항상 같은 숫자를 보여준다.

### 8.2 최저비용 확장 지점 — 이미 있는데 안 쓰이는 데이터

`docs/research/parent-dashboard.md`(기존 리서치, 이미 실측 확인된
사실): **`fetchDashboardData()`가 이미 60일치 데이터를 가져오는데
UI는 최근 7일치만 쓴다.** 즉 아래 항목은 **새 쿼리 없이** 바로
추가 가능:

| 신규 표시 항목 | 근거 데이터 |
|---|---|
| 요일별 학습 패턴 | 기존 60일 윈도우 재활용 |
| 결석 후 회복 속도 | 동일 |
| 2주 정확도 추세 | 동일 |
| 반복 vs 일회성 오답 구분 | 동일 |

### 8.3 이번 설계로 추가하는 것

- §7 성장 Score(유지율 중심)를 학부모 화면에 추가 — 숫자보다 "이런
  단어들을 이제 확실히 알아요" 같은 구체적 문장으로.
- §3의 "반 전체 패턴"과 구분되는, 순수 개인 오답 요약(격려 톤 유지 —
  "부족하다"가 아니라 "지금 연습 중인 것" 프레이밍).
- **하지 않는 것**: 다른 학생과 비교하는 어떤 수치도 학부모 화면에
  넣지 않는다(`PAUL_PRINCIPLES.md` §7 "학부모가 압박 대신 성장을
  보는 이유" 원칙 재확인).

---

## 9. 선생님 Dashboard 활용

`PAUL_EASY_VOCA_AI_AGENT_OS.md`/`SAAS_ARCHITECTURE_PLAN.md`에서 이미
"Teacher" 역할을 신규 정의했다 — 이 대시보드가 그 역할이 실제로 매일
쓰는 화면이다.

| 기능 | 데이터 소스 | 교사가 얻는 가치 |
|---|---|---|
| 반 전체 약점 히트맵 | §3의 "반 전체 패턴"(`distinct_student_ids` 활용) | 어떤 단어/문법을 다음 수업에서 다시 설명해야 하는지 즉시 파악 — **수업 계획에 직접 반영 가능** |
| 개입 필요 학생 자동 플래그 | §7 향상 추세가 "정체/퇴보"인 학생 | 성적표를 다 읽지 않아도 누구를 먼저 봐야 하는지 앎 |
| 복습 검토 큐(기존 확장) | `writing_answer_statistics`/`spelling_review_queue` (이미 있는 관리자 패널) | "선생님이 같은 검토를 두 번 안 하는" 기존 원칙을 개인화 추천까지 확장 |
| 반별 SRS 진행 현황 | §5 박스 분포 집계 | 반 전체가 어느 단계에 몰려있는지(복습 밀림 여부) 파악 |

**설계 원칙**: 이 대시보드도 신규 화면을 처음부터 만들기보다 기존
`AdminScreen.jsx`의 대시보드 컴포넌트(이미 `React.lazy` 분리, 이미
컴포넌트 분해 진행 중)에 탭/카드를 추가하는 방식을 권장 — `PAUL_
EASY_VOCA_AI_DEVELOPMENT_PROTOCOL.md`의 Planner 원칙("이미 있는 것을
재조사 없이 다시 만들지 않는다")과 동일.

---

## 10. 1년 후 AI 학습 플랫폼 구조

### 10.1 통합 아키텍처 (최종 상태)

```
[학생 학습 행동]
     │
     ▼
learning_events(신규, §1) ──┬──► §2 약점 분석(규칙기반, 무료)
     │                       ├──► §3 오답 패턴(기존 인프라 확장)
     │                       └──► §5 SRS 스케줄러(6-box Leitner)
     │                                    │
     │                                    ▼
     │                          §4 개인별 복습 추천
     │                                    │
     │                                    ▼
     │                          §6 AI Teacher(규칙기반 우선 + 제한적 AI)
     │
     ▼
§7 성장 Score(유지율 중심, XP와 분리) ──┬──► §8 학부모 리포트
                                        └──► §9 교사 Dashboard
                                                    │
                                                    ▼
                                    (다학원 확장 시) 학원 간 익명 집계
                                    → 커리큘럼/교재 개선 인사이트
                                    (PAUL_EASY_VOCA_SAAS_ARCHITECTURE_
                                     PLAN.md와 연결, product_events류
                                     비식별 원칙 재사용)
```

### 10.2 분기별 로드맵 (정직한 페이싱)

`PAUL_EASY_VOCA_MASTER_PLAN.md`의 90일 로드맵(Week1-2/3-4/Month2)을
그대로 흡수하고 그 이후를 잇는다 — 이미 계획된 것을 다시 만들지 않는다.

| 분기 | 내용 |
|---|---|
| **Q1**(기존 90일 로드맵과 동일) | 커리큘럼 보안수정 배포, 쓰기 AI 보조 실운영화, `word_review_schedule`(SRS 기본 테이블) 설계 착수, Garden-Leitner 연동 |
| **Q2** | Interleaving 구현, §2~4(약점분석/오답패턴/추천) 규칙기반 버전 완성 — **전부 무료, AI 호출 없음** 단계까지 |
| **Q3** | §1의 `learning_events` 통합 로그 도입 검토(그 시점 실사용 데이터로 "정말 필요한가" 재확인 — Learning Science Agent가 판단), §6 AI Teacher 1~2단계(규칙기반) 배포, §7 성장 Score 1차 버전 |
| **Q4** | §6 AI Teacher 3단계(제한적 AI 첨삭, Security/Cost Optimization Agent 승인 하에), §9 교사 Dashboard 히트맵, 다학원 확장(`SAAS_ARCHITECTURE_PLAN.md`)과 맞물리는 시점이면 학원 간 익명 집계 설계 착수 |

### 10.3 발음 신호 문제 — 반드시 별도로 해결해야 하는 선행 과제

`docs/research/student-engagement-psychology.md`가 이미 지적한 사실을
이 설계에서도 재확인한다: **녹음 성공(`blob.size>0`)을 곧 발음 성공으로
처리**하는 지금 구조 위에서는, §2(약점분석)와 §7(성장 Score)이 발음
영역만큼은 **정확할 수 없다.** 이 설계 전체가 "데이터 기반"을
표방하는 만큼, **발음 채점 신호를 최소한 파형 자기비교 수준(무료,
STT 불필요)으로라도 개선하는 것이 이 플랫폼의 신뢰도에 발음 영역
확장보다 선행돼야 한다** — Q2~Q3 사이 어딘가에 반드시 포함할 것을
권장.

### 10.4 지키는 것 (1년 뒤에도 변하지 않아야 하는 원칙)

- 순위/경쟁 대신 자기 성장 비교(§7)
- 무료 규칙기반 우선, AI는 정말 필요한 좁은 지점에만(§6)
- 아동과의 열린 대화형 AI는 만들지 않는다(§6.3)
- 학생 식별은 항상 UUID(§1)
- 이미 있는 기능(Garden/성장앨범/AI추천학습/writing_answer_
  statistics)을 재사용하고 중복 인프라를 만들지 않는다(전 섹션 공통)

---

## 관련 문서

`PAUL_EASY_VOCA_MASTER_PLAN.md`(§1 원본), `PAUL_EASY_VOCA_CURRENT_
STATUS.md`(§I), `PAUL_EASY_VOCA_AI_AGENT_OS.md`, `PAUL_EASY_VOCA_AI_
DEVELOPMENT_PROTOCOL.md`, `PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`,
`docs/research/memory-engine.md`, `docs/research/paul-memory-engine-
design.md`, `docs/research/student-engagement-psychology.md`,
`docs/research/parent-dashboard.md`, `docs/operations/task2-writing-
analysis.md`, `DATABASE.md`(`writing_answer_statistics` 섹션),
`PROJECT_PAUL_GOAL.md`, `PAUL_PRINCIPLES.md`.
