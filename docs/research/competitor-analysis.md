# 경쟁 제품 분석 — Duolingo / Quizlet / Wordwall / Baamboozle / Khan Academy Kids

_작성: 2026-07-23. 담당: researcher(문서 전용 세션, 소스 코드/SQL 미수정).
목적: Paul Easy Voca(폴이지보카)의 게임화/리텐션 설계에 참고할 수 있는
공개 자료 기반 메커니즘 분석. **기능 나열이 아니라 "어떤 심리적 메커니즘으로
몰입/리텐션/동기/매일 습관을 달성하는가"에 집중했습니다.**

## 조사 방법론 및 표기 규칙

- WebSearch로 조사한 공식 블로그·업계 분석 글·리뷰를 근거로 작성했습니다.
  각 섹션 하단에 출처 URL을 남깁니다.
- **[실측]** = 조사한 출처(공식 발표, 애널리틱스 회사 분석, 리뷰 매체)에
  명시적으로 언급된 내용. 단, 이 문서의 출처는 대부분 1차 자료(Duolingo/
  Quizlet 공식)가 아니라 2차 분석 글이므로, 수치(%, 배수 등)는 "해당 매체가
  주장/인용한 값"이지 이 조사가 직접 검증한 값이 아닙니다 — 그대로 의사결정
  근거로 쓰기보다 방향성 참고용으로 취급하세요.
- **[추정]** = 검색 결과에 직접 언급되지 않았지만 여러 자료의 정황상
  합리적으로 추론한 내용, 또는 Paul Easy Voca 코드베이스 문서(`ROADMAP.md`/
  `.ai-status/`)를 근거로 이 조사자가 판단한 비교 지점.
- Khan Academy Kids(미취학~초등 저학년 대상 앱)는 성인용 Khan Academy 본
  플랫폼과 스트릭/배지 정책이 다릅니다. 검색 결과 상당수가 본 플랫폼
  자료였기에, Kids 앱 고유 정보로 확인된 것만 [실측]으로 표기하고 나머지는
  구분해 [추정]으로 남겼습니다.
- 이 문서는 **연구 문서**입니다. `CLAUDE.md` 규칙 12(학생 대상 신규 기능/
  게임화는 이번 AI 개발 운영체제 구축 범위에서 절대 금지)에 따라, 여기 담긴
  "적용 시사점"은 구현 지시가 아니라 향후 별도 의사결정 세션을 위한 조사
  결과일 뿐입니다.

---

## 1. Duolingo — 손실 회피(loss aversion) + 가변 보상(variable reward) 설계의 교과서

### 몰입 (Engagement)
XP 시스템이 **가변 비율 강화(variable-ratio reinforcement)** 로 설계돼
있습니다 — 같은 레슨이라도 때로는 10XP, 때로는 20XP, 때로는 보너스가
붙는 식으로 보상량이 예측 불가능합니다. 도박 기계와 같은 강화 스케줄로,
보상이 예측 가능하면 뇌가 습관화되어 도파민 반응이 줄어들지만 예측
불가능하면 몰입이 급증한다는 것이 근거로 인용됩니다[실측, 인용 출처
기준]. 리그(주간 리더보드)는 무작위로 배정된 20~30명의 소규모 집단으로
경쟁을 스코프해, "노력하면 상위 5위 안에 들 수 있다"는 승산 있는
경쟁으로 느껴지게 설계했습니다(비슷한 학습 페이스끼리 매칭) — 이 설계가
세션 시작 수/완주율을 동시에 끌어올렸다는 사내 실험 결과가 인용됩니다
[실측, 2차 출처].

### 리텐션 (Retention)
스트릭(연속 학습일) 자체가 리텐션 엔진의 중심입니다. 심리적 기제는
**손실 회피**입니다 — "181일째를 채우고 싶다"가 아니라 "180일을
잃고 싶지 않다"는 동기가 핵심으로 분석됩니다. 대략 7일차 전후로
손실 회피가 작동하기 시작해 이탈 가능성이 급격히 낮아진다는 분석이
있습니다. 스트릭을 iOS 위젯으로 상시 노출했을 때 사용자 커밋먼트가
60% 증가했다는 수치, 스트릭 내기(wager) 기능이 14일차 리텐션을 14%p
끌어올렸다는 수치가 인용됩니다[실측, 2차 출처 — 정확한 방법론은
확인 불가]. 스트릭 기능 하나에만 4년간 600회 이상 실험을 돌렸다는
설명도 있어, 단일 정답이 아니라 지속적 A/B 튜닝의 산물임을 시사합니다.

### 동기 (Motivation)
하트/에너지 시스템(오답 시 하트 소모 → 소진 시 대기 또는 결제)이 동기
설계와 수익화를 의도적으로 결합한 지점입니다 — "실수해도 벌칙 없이
계속하려면 유료 구독"이라는 프레임입니다. 최근에는 하트→에너지(정답/오답
무관 1유닛 소모) 체계로 전환했는데, 표면적으로는 "더 건강한 학습 습관"을
내세우지만 무료 사용자가 벽에 부딪히는 지점을 만들어 수익화 경로와
맞물려 있다는 비판적 분석이 있습니다[실측, 2차 출처 — 논쟁적 해석 포함].
친구 스트릭·친구 대결·XP 부스트 선물 같은 소셜 레이어도 리그 위에
추가로 존재합니다.

### 매일 습관 (Daily Habit)
Hook 모델(트리거→저마찰 행동→가변 보상→투자)로 설명되며, 스트릭이
가장 강력한 "투자" 요소로 다음 트리거(알림/위젯)의 효과를 증폭시킵니다.
Duolingo 자체 보고로 리텐션이 12%→55%로 개선됐다는 주장이 있으나
[실측, 2차 출처 — 기간/코호트 정의 불명확, 방향성 참고용], 매일 상기
장치(위젯/푸시)가 스트릭과 결합돼야 습관 루프가 완성된다는 것이 여러
출처의 공통 진단입니다.

**출처**: [Duolingo — Streak System Detailed Breakdown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f), [Streak Design: 4 Rules Behind Duolingo's Loop](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/), [Duolingo gamification explained (StriveCloud)](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo), [Duolingo Gamification Strategy: A Full Case Study (trophy.so)](https://trophy.so/blog/duolingo-gamification-case-study), [Duolingo Leagues & Leaderboards (duoplanet)](https://duoplanet.com/duolingo-leagues-the-essential-guide-everything-you-need-to-know/), [Duolingo Leagues: How Weekly Leaderboards Drive +25% Lesson Completion (Deconstructor of Fun)](https://duolingo.deconstructoroffun.com/mechanics/leagues), [Duolingo Energy System (duoplanet)](https://duoplanet.com/duolingo-energy-system/), [How does Duolingo turn attention into revenue?](https://medium.com/analysts-corner/how-does-duolingo-turn-attention-into-revenue-b5756bf9050c)

---

## 2. Quizlet — 학습 모드 전환을 통한 지루함 회피 + 능동 회상(active recall)

### 몰입 (Engagement)
플래시카드/Learn/Test/Match/Quizlet Live 등 **같은 학습 세트를 여러
모드로 전환**할 수 있다는 것이 핵심 설계입니다 — 반복 암기가 단조로워
지치는 문제를, 콘텐츠는 그대로 두고 상호작용 형식만 바꿔 새로움을
만드는 방식으로 대응합니다. Quizlet Live는 교실 실시간 팀전 모드로,
정답마다 점수가 오르고 오답 시 진행이 리셋되는 방식이라 긴장감이 학습
개인 모드와 질적으로 다릅니다.

### 리텐션 (Retention)
간격 반복(spaced repetition)과 능동 회상을 학습 설계의 근거로 명시적으로
내세웁니다 — 정보를 점점 넓어지는 간격으로 복습시켜 장기 기억 전이를
돕는다는 것이 공식 설명입니다. 다만 여러 3자 리뷰는 Quizlet의 Learn
모드가 "간격 반복처럼 작동하긴 하지만, 전용 SRS 앱만큼 투명하고 엄밀한
알고리즘은 아니다"라고 지적합니다[실측, 2차 출처 — 정확한 알고리즘은
비공개]. 2026년 기준 AI 기반 Learn 모드가 "학습자가 곧 잊어버릴 시점"을
예측해 그 타이밍에 복습을 유도하는 방향으로 개선됐다는 설명이 있습니다.

### 동기 (Motivation)
스트릭·포인트·리더보드가 있다고 설명되지만, 이 조사에서 확인한 자료는
대부분 Quizlet Live의 **팀 단위 실시간 경쟁**(리더보드가 교실 화면에
표시, 정답마다 순위 변동)에 집중돼 있습니다 — 개인 대 개인 소셜 그래프
경쟁(Duolingo 친구 대결류)보다는 "그 순간의 교실 안 팀전"이 동기의
중심입니다.

### 매일 습관 (Daily Habit)
공식 콘텐츠는 "간격 반복 학습 스케줄 만들기" 가이드처럼 학습자가
스스로 복습 일정을 설계하도록 안내하는 쪽에 가깝고, Duolingo류의
자동 스트릭/알림 강제 루프보다는 학생 개인·교사의 자발적 계획에 더
의존하는 것으로 보입니다[추정 — 이 조사에서 Quizlet의 자체 푸시 알림/
리마인더 체계에 대한 구체 자료는 확보하지 못함].

**출처**: [The Science Behind Spaced Repetition Learning (Quizlet)](https://quizlet.com/content/science-behind-spaced-repetition), [Creating a Spaced Repetition Learning Schedule (Quizlet)](https://quizlet.com/content/spaced-repetition-learning-schedule), [Spaced Repetition Quizlet: The Ultimate Guide (FlashRecall)](https://flashrecall.app/blog/spaced-repetition-quizlet), [Quizlet Live: Revolutionizing Classroom Engagement](https://explore.st-aug.edu/exp/quizlet-live-revolutionizing-classroom-engagement-through-interactive-learning), [Quizlet Live | Classroom Learning Game (공식)](https://quizlet.com/features/live), [Introducing Quizlet Live (공식 블로그)](https://quizlet.com/blog/introducing-our-first-collaborative-learning-game-for-the-classroom-quizlet-live)

---

## 3. Wordwall — 콘텐츠 재사용 × 게임 형식 다양성으로 소진 방지

### 몰입 (Engagement)
40종 이상의 게임 템플릿(빈칸 채우기/매칭/랜덤 휠/게임쇼 등)에 **같은
콘텐츠를 그대로 넣고 형식만 클릭 한 번으로 바꿀 수 있다**는 것이 핵심
차별점입니다 — 교사가 반복 학습을 시킬 때 학생이 "또 똑같은 퀴즈"라고
느끼지 않도록 콘텐츠 소진(content fatigue)을 형식 전환으로 우회합니다.

### 리텐션 / 매일 습관
Wordwall은 구조적으로 **교사가 발행하고 학생이 세션 단위로 접속하는
교실 도구**입니다 — 학생이 매일 스스로 여는 개인 앱이 아니라 교사가
과제(URL 공유/임베드)로 트리거하는 방식입니다. 숙제로 배정하고 완료
여부를 추적하는 기능이 있다는 점이 Baamboozle과의 핵심 차이로 지목되며,
이 "완료 추적"이 리텐션/습관 루프에 가장 근접한 장치입니다[실측]. 다만
개인 스트릭·개인 알림·개인 리더보드 같은 자기주도 리텐션 장치는 이
조사에서 확인되지 않았습니다[추정 — 부재를 직접 증명하는 자료보다는
"교사 주도 구조"라는 정황 근거].

### 동기 (Motivation)
포인트/배지/랭크가 표시되는 리더보드 기능이 있다는 언급이 있으나
[실측, 근거 자료 신뢰도 낮음 — 일반적 게임화 설명과 혼재된 출처], 이는
개별 활동 세션 단위 동기부여이지 Duolingo 리그처럼 주 단위로 지속되는
사회적 지위 구조는 아닌 것으로 보입니다.

**출처**: [How to Create and Customize Wordwall Games](https://www.ask.com/lifestyle/create-customize-wordwall-games-effective-learning), [Wordwall Game Builder: A Teacher's Guide (SuperTeacher)](https://blog.super-teacher.net/forteachers/wordwall-teachers-guide/), [Wordwall Revolutionizes Educational Engagement](https://explore.st-aug.edu/exp/wordwall-revolutionizes-educational-engagement-platform-deep-dive), [Baamboozle Alternatives for ESL Teachers (Wordwall과의 비교 포함)](https://thekingdomofenglish.com/articles/baamboozle-alternatives-esl.php)

---

## 4. Baamboozle — 기기 없는 즉시성으로 몰입을 극대화, 리텐션은 구조적으로 없음

### 몰입 (Engagement)
가장 뚜렷한 차별점은 **학생 개인 기기가 필요 없다**는 것입니다 — 교실
화면 하나로 전체 학급이 같은 화면을 보며 팀 대항전(보통 2~4팀)을
합니다. 준비 시간이 거의 필요 없고("최소 준비"가 교사 리뷰에서 반복
언급), 매 판이 달라 학생·교사 모두에게 "새로운 경험"으로 느껴진다는
평가가 있습니다.

### 동기 (Motivation)
팀 단위 협력 + 즉흥적 경쟁(친구 vs 친구가 아니라 팀 vs 팀)이 동기의
핵심 구조입니다. 이는 Quizlet Live/House 시스템류의 팀전과 유사한
심리 기제(개인 실패 부담을 팀으로 분산 + 소속감)를 씁니다.

### 리텐션 / 매일 습관
Baamboozle은 **로그인·개인 계정·저장되는 개인 진행도가 구조적으로
없는** 순간적 교실 도구로 보입니다[추정 — 검색 자료에 "계정" 기반
리텐션 기능 언급이 전혀 없고, "한 화면으로 전체 학급이 플레이"라는
설명과 일관됨]. 즉 몰입은 최상급이지만 개인 단위 리텐션·매일 습관
설계는 애초에 이 제품의 설계 목표가 아닌 것으로 판단됩니다 — Duolingo/
Quizlet과 동일 선상에서 비교할 축이 아니라, "그 순간의 참여도"를 극대화
하는 다른 카테고리의 도구입니다.

**출처**: [Baamboozle for Teaching and Making Learning Fun](https://www.studentcenteredworld.com/baamboozle/), [Baamboozle Game - Teacher's Guide (Educators Technology)](https://www.educatorstechnology.com/2023/01/baamboozle-review-for-teachers-tons-of.html), [Engage Your Students with Baamboozle (TCEA)](https://blog.tcea.org/baamboozle/), [Baamboozle Review (eslmaterials.org)](https://eslmaterials.org/baamboozle/)

---

## 5. Khan Academy Kids — 저연령 대상, 손실 회피 없는 수집형 내재적 동기

### 몰입 / 동기 (Engagement / Motivation)
성인용 Khan Academy 본 플랫폼과 달리, Kids(미취학~초등 저학년) 앱은
**가상 화폐/구매/리더보드 같은 경쟁형 장치를 쓰지 않고** 캐릭터
동반 학습 + 수집(벌레·모자·장난감을 캐릭터에게 모아주는 방식)으로
동기를 설계한다는 점이 명확히 확인됩니다[실측]. 한 사례 연구는 특정
아동(베트남인 5세 미취학 아동의 영어 학습)에서 내재적 동기와 외재적
동기가 함께 작동했다고 보고합니다. 애니메이션 캐릭터가 학습을
안내하는 서사형 진행(내러티브 레이어)이 동기 설계의 중심입니다.

### 리텐션 / 매일 습관 (Retention / Daily Habit)
이 연령대 앱 특성상 **손실 회피형 스트릭(Duolingo류)이나 사회적
경쟁(리더보드)이 확인되지 않았습니다**[실측 — 확인된 것은 부재
자체이며, 검색된 스트릭/배지 자료는 대부분 성인용 본 플랫폼 것이었음].
저연령 학습은 부모가 세션을 열어주는 경우가 많아, "아이가 스스로
습관을 만든다"기보다 "부모가 매일 여는 루틴에 아이가 협조하도록
설계됐다"는 쪽에 가깝다고 추정됩니다[추정]. 적응형 커리큘럼("Learning
Path")이 매 세션의 학습 난이도를 조정해 아이가 좌절 없이 이어가게
하는 것이 리텐션 장치에 가장 가깝습니다.

**출처**: [Understanding Khan Academy Kids (edu.com)](https://www.edu.com/blog/understanding-khan-academy-kids-a-complete-guide-for-k-2-teachers-and-parents), [THE USE OF KHAN ACADEMY KIDS... (academia.edu 사례연구)](https://www.academia.edu/121170123/THE_USE_OF_KHAN_ACADEMY_KIDS_APPLICATION_TO_INCREASE_THE_MOTIVATION_IN_LEARNING_ENGLISH_FOR_PRESCHOOLERS_A_CASE_STUDY_OF_A_VIETNAMESE_5_YEAR_OLD_GIRL), [Khan Academy Kids Review (Nerdisa)](https://nerdisa.com/khanacademykids-org/)

_참고: Khan Academy(성인/일반 학생용) 본 플랫폼은 2021년 스트릭 기능을
제거했다가 이후 배지·레벨과 함께 재도입한 이력이 있습니다[실측, 본
플랫폼 한정 — Kids 앱과 별개]. 출처: [Update: Streaks are going away
(Khan Academy Help Center)](https://support.khanacademy.org/hc/en-us/community/posts/360075847492-Update-Streaks-are-going-away-on-January-4-2021), [New Badges + Re-Introduction of Streaks](https://support.khanacademy.org/hc/en-us/community/posts/20720259907981-New-Badges-Re-Introduction-of-Streaks-to-Help-Students-Stay-Focused)_

---

## 6. 축별 비교 요약

| 축 | Duolingo | Quizlet | Wordwall | Baamboozle | Khan Academy Kids |
|---|---|---|---|---|---|
| 몰입 | 가변 보상(XP 랜덤) + 승산 있게 스코프된 리그 | 학습모드 전환으로 단조로움 회피 | 콘텐츠 고정+형식 40종 전환 | 기기 불필요 즉흥 팀전 | 캐릭터 동반 수집 서사 |
| 리텐션 | 손실 회피(스트릭) + 위젯/알림 | 간격 반복(공식 주장, 알고리즘 비공개) | 숙제 배정+완료 추적(교사 주도) | 구조적으로 없음(계정 자체 없음) | 적응형 난이도(좌절 방지) |
| 동기 | 개인 지위(리그 순위) + 소셜(친구 대결) | 팀전 실시간 경쟁 | 배지/포인트(세션 단위) | 팀 소속감 + 즉흥 경쟁 | 내재적(수집) — 경쟁 요소 없음 |
| 매일 습관 | Hook 모델 완결(트리거→보상→투자) | 학습자 자기설계 의존, 강제 루프 약함 | 교사가 트리거(학생 자발 아님) | 습관 개념 자체 없음(1회성 이벤트) | 부모 매개 루틴 |

---

## 7. Paul Easy Voca 적용 시사점

_전제: Paul Easy Voca는 이미 Paul Rank(XP/모자 5단계)·Ticket 경제
(적립-환급 원장)·House System(4팀, 주간/시즌 점수)·Word King(주간
챔피언, 서버 재계산)·Seasonal Progression·Attachment 시스템(모자
컬렉션/단어 박물관/성장 앨범/폴의 기억/잉글리시 정원)·3분 데일리
리추얼(적응형 마이크로 세션)·Paul Town(마을=내비게이션)을 갖춘,
이미 상당히 성숙한 게임화 제품입니다. 아래는 "이미 있다"와 "없다"를
구분한 시사점이며, 구현 지시가 아닌 조사 결과입니다(규칙 12)._

### 몰입 (Engagement)
- **이미 있는 것**: House 팀전(4팀 주간/시즌 집계)이 Duolingo 리그의
  "스코프된 소규모 경쟁" 철학과 유사한 구조를 이미 구현. Word King
  주간 챔피언은 승산 있는 목표(반 평균 보정으로 소표본 왜곡 방지)를
  이미 갖춤. Attachment 시스템의 모자/박물관 수집은 Khan Academy
  Kids식 수집형 몰입과 유사한 궤도.
- **없는 것**: Duolingo/Quizlet Live류의 **실시간 동기화 팀 대항전**
  (같은 순간 여러 학생이 화면을 보며 경쟁하는 라이브 이벤트)은 없음
  — House/Word King은 비동기 집계 방식이라 "그 순간의 긴장감"을 주는
  구조가 아님. Duolingo의 XP 가변 보상(랜덤성)은 의도적으로 배제돼
  있음(`ROADMAP.md`: "무작위·뽑기·화폐·결제·스트릭징벌 없음") — 이는
  갭이 아니라 명시적 제품 원칙(도박 기제 회피)으로 해석해야 함.

### 리텐션 (Retention)
- **이미 있는 것**: `student_progress`에 스트릭 필드가 존재하지만
  **명시적으로 "스트릭징벌 없음"** — Duolingo의 손실 회피 핵심 기제를
  의도적으로 채택하지 않은 것으로 보임(하트/에너지 소모 같은 처벌형
  장치도 없음). Seasonal Progression이 "레벨/뱃지/스트릭류는 유지,
  티켓/하우스 점수만 리셋"으로 설계돼 있어 Duolingo 리그의 "주기적
  리셋으로 재도전 기회를 준다"는 장점을 취하면서도 장기 정체성 자산은
  보호하는 절충을 이미 하고 있음.
- **없는 것**: Duolingo형 **외부 트리거(푸시 알림/홈 위젯)** 는
  `PROJECT_GUIDE.md`/`ARCHITECTURE.md` 전체에서 확인되지 않음 —
  앱을 열어야만 시작되는 루프이고, "이제 슬슬 열어볼 시점"을 앱 밖에서
  상기시키는 장치가 없음. Quizlet Learn 모드식 **망각곡선 기반 복습
  타이밍 예측**도 없음(현재는 유닛 순차 배정 구조). 이 두 갭을 메울지
  여부를 실제로 검증할 수 있는 인프라(익명 관찰 레이어, `product_events`
  1/3/7일 복귀율 대시보드)는 방금 코드 완료됐으나 아직 SQL 미실행·데이터
  미수집 상태 — "무엇이 리텐션을 올리는지"를 추측 대신 실측할 준비 단계.

### 동기 (Motivation)
- **이미 있는 것**: House(팀 소속감)·Word King(개인 지위, 주간 한정)·
  Ticket 상점(결정론적 보상 교환)·모자 컬렉션(수집)까지, Khan Academy
  Kids(내재적/수집)와 Duolingo(사회적 지위) 두 축을 이미 균형 있게
  갖춤. "폴의 기억"/성장 앨범처럼 실데이터 기반 서사 레이어도 Khan
  Academy Kids의 캐릭터 서사와 유사한 정서적 동기 장치.
- **없는 것**: 개인 대 개인 **친구 대결/소셜 그래프 경쟁**(Duolingo
  친구 스트릭 등)은 없음 — 다만 이는 PIN 로그인만 존재하고 학생 간
  소셜 그래프 자체가 설계상 없는 구조(개인정보/안전 측면에서 오히려
  의도적 결핍일 가능성 높음, [추정]). 학급 내 실시간 팀전(Baamboozle/
  Quizlet Live류)도 없음 — House는 있지만 "그 순간 다 같이 본다"는
  라이브 이벤트성은 아님.

### 매일 습관 (Daily Habit)
- **이미 있는 것**: 3분 데일리 리추얼(적응형 마이크로 세션, 배정량
  기반 밴드 조정)은 Hook 모델의 "저마찰 행동"에 해당하는 장치를 이미
  구현 — 원탭 가이드 세션으로 진입 장벽을 낮춤. Paul Town(정원/박물관/
  시계탑)은 매일 조금씩 달라지는 "돌아올 이유"를 실데이터 파생으로
  제공.
- **없는 것**: 트리거(알림/위젯) 부재는 위 리텐션 항목과 동일한 갭 —
  "저마찰 행동"은 있는데 그걸 시작시키는 외부 신호가 없음. 학부모
  채널은 읽기 전용 조회이지 "아이에게 오늘 학습을 상기시키는" 능동
  넛지 채널이 아님(`PROJECT_GUIDE.md` 사용자 역할 정의 기준).

---

## 핵심 요약 (축별 1줄)

- **몰입**: House/Word King이 이미 스코프된 팀·개인 경쟁을 갖췄으나,
  Duolingo/Quizlet Live식 "실시간 동기화 라이브 대항전"은 없음.
- **리텐션**: 스트릭 처벌(손실 회피)을 의도적으로 배제한 것은 제품
  철학이지만, 그 대체로서의 외부 트리거(푸시/위젯)도 없어 "앱을 열게
  만드는 장치"가 구조적으로 약함 — 마침 이를 실측할 관찰 인프라가
  막 완료됨.
- **동기**: Khan Academy Kids형 내재적 수집과 Duolingo형 사회적 지위를
  이미 균형 있게 갖췄고, 개인 소셜 경쟁 부재는 안전 설계로 볼 여지가
  큼.
- **매일 습관**: 저마찰 진입(3분 리추얼)은 있으나 트리거(알림)가 없어
  Hook 모델이 절반만 완성된 상태 — Quizlet식 망각곡선 기반 복습
  타이밍 예측도 미구현.
