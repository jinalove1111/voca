# 간격 반복(Spaced Repetition) 엔진 비교 연구 및 아키텍처 추천

_작성: 2026-07-23. 순수 문서 조사 세션(researcher) — 소스코드/SQL/설정 파일은
수정하지 않았습니다. 아래 스키마 스케치는 **설계 초안**이며 실제
`supabase_v*.sql` 파일 생성/실행은 이 작업 범위에 포함되지 않습니다
(저장소 헌법 규칙 8 — DDL 실행은 운영자 전담)._

## 0. 요약 (TL;DR)

폴이지보카 학생(8~15세, 현재 111명 규모)을 위한 "오늘 이 단어를 다시
보여줄까?" 판단 엔진으로 **FSRS나 Duolingo류 ML 기반 모델이 아니라,
완화된 승급/강등 규칙을 가진 레벨형 라이트너(Leitner) 시스템**을
추천합니다. 이유는 3가지로 요약됩니다.

1. **데이터 요구량 불일치**: FSRS는 사용자당 최소 수백~1000회 리뷰가
   쌓여야 개인화 파라미터 최적화가 의미 있고(그 전엔 커뮤니티 기본값에
   의존), Duolingo의 HLR/Birdbrain은애초에 수백만~수천만 건의 리뷰
   로그로 학습된 서버 사이드 모델입니다. 이 프로젝트는 학생 1인당
   리뷰 이력이 적고(일일 학습량 제한적) 유료 ML 인프라도 금지(헌법
   규칙 7)라 두 방식 모두 전제 조건이 안 맞습니다.
2. **아동 정서 적합성**: SuperMemo/FSRS류의 지수·거듭제곱 망각곡선
   기반 알고리즘은 "실패=간격 급격 초기화"가 기본이며, 실제로 FSRS
   v5로 넘어오면서 "Again(오답)을 자주 누르는 소수 사용자군에게
   퇴행(regression)"이 보고된 바 있습니다 — 이는 정확히 아동이 겪는
   패턴(잦은 lapse)과 겹칩니다. SuperMemo 개발진 스스로도 "어린
   아이에게 SuperMemo는 위험할 수 있다"고 명시적으로 경고합니다.
3. **튜닝/구현 부담**: Leitner는 파라미터가 사실상 "박스 개수 + 박스별
   간격 표" 하나뿐이라 외부 패키지·서버 트레이닝 없이 순수 JS 수십
   줄로 구현 가능(헌법 규칙 6 "외부 의존성 최소화"와 정합). FSRS를
   제대로 구현하려면 difficulty/stability/retrievability 3변수와
   13~17개 모델 파라미터, 거듭제곱 망각곡선 공식이 필요해 이 프로젝트
   규모엔 과설계입니다.

권장 스키마: 기존 `word_status`(v1.5, 단어별 "알아요/모르겠어요" 자기
신고 플래그)를 건드리지 않고, 신규 테이블 `word_review_schedule`을
추가해 박스 레벨/다음 복습일을 별도로 관리하는 안입니다(7절).

## 1. 조사 범위와 방법

WebSearch로 조사한 1차 자료(전부 9절에 URL 명시):

- SM-2 원본 공식 및 파생 구현
- Anki가 SM-2를 실제로 어떻게 변형했는지(4버튼, 이지팩터 하한 등)
- FSRS v4 → v4.5 → v5(파라미터 13→17개, 망각곡선 함수 변화, 콜드스타트/
  최적화에 필요한 리뷰 수)
- Leitner 박스 시스템(원본 5박스 및 단순화 3박스 변형)
- Duolingo의 Half-Life Regression(HLR, 2016 ACL 논문) 및 후속
  Birdbrain 딥러닝 모델(2023~)
- 아동(5~12세, 9~12세) 대상 간격반복 앱 설계 문헌 — 세션 길이,
  실패 경험의 정서적 영향, SuperMemo 공식 위키의 "SuperMemo does not
  work for kids" 항목

이 세션 환경에서는 WebFetch(URL 본문 전체 조회)가 훅에 의해 차단되어
있어, 검색 결과 스니펫(제목+요약)만으로 근거를 구성했습니다 — 원문을
더 깊이 확인하려면 9절의 URL을 직접 열어 검증하는 후속 세션이
필요합니다.

또한 이 저장소의 `PROJECT_GUIDE.md`/`DATABASE.md`를 읽고, 기존 코드에서
간격반복류 스케줄링 로직이 이미 있는지 확인했습니다(`review_data`
jsonb 컬럼이 `student_progress`에 존재하지만 `useStudent.js`에서 실제로
읽고 쓰는 코드는 없음 — 예약만 되어 있고 미사용. `word_status` 테이블은
간격/일정이 아니라 단순 상태 플래그(`known`/`unknown`/`skipped`/
`mastered`)라 이번 설계와 목적이 다름). 즉 이 영역은 그린필드이며, 헌법
규칙 3("완료 선언된 작업 재구현 금지")에 해당하는 기존 완성 로직은
없습니다.

## 2. 알고리즘별 개요

### 2.1 SM-2 (SuperMemo 2, Piotr Woźniak, 1987)

- 입력: quality(0~5), repetitions, 이전 이지팩터(EF), 이전 간격.
- `EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))`, EF 하한 1.3.
- 정답(q≥3)일 때: 1회차 1일 → 2회차 6일 → 이후 `간격 = 이전 간격 × EF`.
- 오답(q<3)이면 repetitions를 0으로 리셋(=처음부터 다시).
- 공개 도메인, 사실상 Anki/구 Duolingo/대부분 플래시카드 앱의 조상.

### 2.2 Anki의 SM-2 변형

- 6단계 quality를 **Again/Hard/Good/Easy 4버튼**으로 단순화.
- 학습 초기 단계(learning steps)는 관리자가 자유 설정(SM-2의 고정
  1일→6일 대신).
- Easy 보너스, 이지팩터 하한 130%, 오답 시 "간격 리셋" 대신 "간격
  일부만 감소"를 선택 가능하게 완화 — SM-2 원본보다 이미 아동 친화적
  방향으로 손질된 사례.

### 2.3 FSRS (Free Spaced Repetition Scheduler)

- DSR(Difficulty–Stability–Retrievability) 모델. 매 리뷰마다 난이도·
  안정성을 갱신하고, 목표 회상확률(desired retention)에 맞춰 다음
  복습일을 역산.
- v4→v4.5: 지수함수 망각곡선을 거듭제곱함수로 교체(적합도 개선).
  v4.5→v5: 같은 거듭제곱 곡선 유지, 초기 안정성 추정/짧은 간격 리뷰
  처리 개선, 파라미터 13→17개로 증가.
- **개인화 최적화(Optimizer)에 필요한 데이터량**: 실무 가이드는
  200~1000회 리뷰 이상을 권장(그 이하는 과적합 위험, Anki 공식
  포럼/Neurako 블로그). 학술적으로는 16회부터 기본값보다 낫다는
  벤치마크도 있으나, "이론상 가능"과 "실무에서 신뢰 가능"은 다르다는
  경고가 같은 스레드에 명시됨.
- 자바스크립트 구현체(`ts-fsrs`, TypeScript/오픈소스)가 존재하긴
  하지만, 이 프로젝트 헌법 규칙 6(외부 의존성 최소화)에 비춰보면 이런
  전용 패키지를 추가하는 것 자체가 이미 이 프로젝트 관례(PIN 해싱도
  bcrypt 대신 Node 내장 crypto로 직접 구현)와 어긋납니다.
- v5로 넘어오며 "Again을 자주 누르는 소수 사용자(=잦은 오답자)에게
  퇴행"이 Anki 공식 포럼에서 이슈로 제기됨 — 아동처럼 lapse가 잦은
  사용자군에는 구조적으로 불리할 수 있음을 시사.

### 2.4 Leitner 시스템 (Sebastian Leitner, 1972)

- 카드를 박스(레벨) 여러 개에 나눠 담고, 정답이면 다음 박스로 승급,
  오답이면 첫 박스로 되돌림(또는 변형에서는 한 단계만 강등).
- 박스별 복습 주기는 고정 표(예: 1일/2일/4일/1주/2주)로, EF 같은
  실수 연산이 전혀 없어 어떤 언어로도 수십 줄이면 구현 가능.
- 단순함 때문에 "카드 100~500장 규모의 개인 학습자에게는 SM-2급
  복잡한 알고리즘과 실질적 차이가 별로 없다"는 평가가 다수.

### 2.5 Duolingo: HLR → Birdbrain

- **HLR(2016, ACL 논문, Settles & Meeder)**: 단어별 기억의
  "반감기(half-life)"를 선형회귀+지수 망각모델로 추정. 학습 데이터는
  1,300만 건의 user-word 쌍. 기존 베이스라인 대비 회상률 예측 오차
  45%+ 감소.
- **Birdbrain(2023~, CMU 공동연구)**: 문항별 정답 확률을 예측하는
  딥러닝 모델로 확장. v2가 5억 건의 학습 세션으로 훈련됨.
- 둘 다 "대량의 크로스유저 로그 + 서버 사이드 모델 학습/서빙 인프라"가
  전제이며, 개별 학원(111명 규모)이 재현할 수 있는 스케일이 아닙니다.
  또한 학습 파이프라인 자체가 유료 컴퓨팅 자원을 전제하므로 헌법 규칙
  7(유료 AI/API 금지, 무료 대안 우선)과 정면으로 배치됩니다.

## 3. 비교표

| 축 | SM-2(원본) | Anki(SM-2 변형) | FSRS(v4/v5) | Leitner | Duolingo HLR/Birdbrain |
|---|---|---|---|---|---|
| 알고리즘 복잡도 | 중(이지팩터 실수 연산) | 중(+버튼 단순화) | 높음(3변수, 13~17 파라미터, 거듭제곱 곡선) | 매우 낮음(정수 레벨+표 조회) | 매우 높음(회귀/딥러닝 모델 학습·서빙) |
| 필요 데이터량(1인 기준) | 리뷰 1회부터 동작 | 리뷰 1회부터 동작 | 기본값은 즉시 가능하나 **개인화엔 200~1000+ 리뷰 권장** | 리뷰 1회부터 동작 | 개인화 불가(모델은 전체 유저 로그로 사전 학습, 수백만~수천만 건) |
| 오프라인/클라이언트 구현 | 쉬움(순수 함수) | 쉬움 | 어려움(직접 구현 시 공식 오류 위험, 라이브러리 쓰면 외부 의존성 추가) | 매우 쉬움(순수 함수, 배열/정수 연산) | 사실상 불가능(서버 ML 인프라 필수) |
| 아동 적합성(세션 길이) | 별도 제약 없음(설계자가 정해야) | 별도 제약 없음 | 알고리즘이 이상적 간격을 자동 산출 → 짧은 세션 관례와 충돌 가능 | 박스 간격 표를 설계 시 직접 아동 친화적으로 고정 가능 | 앱 자체 UX가 처리(엔진은 세션 길이 무관) |
| 아동 적합성(실패의 정서적 영향) | 오답 시 repetitions 리셋 → 체감 손실 큼 | 오답 시 리셋 완화 옵션 있음 | 오답 잦은 사용자에 구조적으로 불리(v5 회귀 사례) | **박스 1단계만 강등하는 변형 채택 시 손실 최소화 가능** | 앱 차원 게임화로 완충(엔진 자체는 무관) |
| 예측 정확도 요구 수준 | 학습 앱 수준으로 충분 | 충분 | 고정밀 회상률 예측이 필요한 헤비 유저용(과설계) | 학습 앱 수준으로 충분, 오히려 예측 가능성이 낮아 학부모/원장이 이해하기 쉬움 | 매우 높음(대신 이 프로젝트엔 불필요한 정밀도) |
| 파라미터 튜닝 부담 | 낮음(EF 공식 고정) | 낮음 | **높음**(사용자별 재학습 없인 커뮤니티 기본값에 의존, 최적화하려면 리뷰 로그 파이프라인 필요) | **없음**(박스 표는 설계 시 1회 결정, 이후 튜닝 불필요) | 매우 높음(전담 ML 팀·인프라 필요) |

## 4. 아동(8~15세) 적합성 심층 분석

- **세션 길이**: 조사된 아동 학습 문헌은 5~8세 5~10분, 9~12세
  10~15분 세션을 권장하고, "짧고 잦은 세션이 길고 드문 세션보다
  우월"하다고 일관되게 강조합니다. 이는 알고리즘이 산출하는 이상적
  간격보다, **앱이 강제하는 세션/카드 수 상한**이 실질적으로 더 중요한
  설계 변수라는 뜻입니다. 어떤 엔진을 쓰든 "오늘 복습 대상이 아무리
  많아도 한 세션에 N개까지만" 같은 상한 로직은 이 스케줄러 위에
  별도로 얹어야 합니다.
- **실패 경험의 정서적 영향**: SuperMemo 공식 위키("SuperMemo does not
  work for kids")는 어린이의 잦은 기억 lapse가 "정상"이며, 이를
  성인 기준 알고리즘(간격 급증→급락)에 그대로 태우면 "가장 어려운
  문제만 계속 폭격당하는" 부정적 경험이 된다고 명시적으로 경고합니다.
  9~12세부터, 그것도 보호자 감독 하에서만 SuperMemo류가 그나마
  동작한다고 언급됩니다. 이는 이 프로젝트의 8~15세 폭넓은 연령대
  전체에 성인용 알고리즘을 그대로 적용하면 안 된다는 강한 신호입니다.
- **아동 대상 실제 구현 사례**: 조사된 한 아동용(6~9세) 앱은
  1/3/7/14/21/30일의 **고정 간격 표**를 사용합니다 — SM-2/FSRS식 동적
  계산이 아니라 Leitner류 고정 표 방식입니다. 이는 "아동에게는 예측
  가능하고 단순한 규칙이 낫다"는 이번 조사의 결론과 일치합니다.
- **예측 정확도 요구 수준**: 이 프로젝트는 "학생이 며칠 뒤 이 단어를
  몇 % 확률로 기억할지"를 정밀 예측할 필요가 없습니다(그런 정밀도는
  헤비 유저의 리뷰 총량을 최소화하려는 성인용 Anki 파워유저 시나리오에
  의미가 있음). 학원 숙제/복습 맥락에서는 "최근에 틀린/새로 배운 단어를
  더 자주 보여준다" 수준의 대략적 우선순위만으로 충분합니다.

## 5. 프로젝트 제약과의 정합성 체크

| 제약(출처) | FSRS | Duolingo HLR/Birdbrain | Leitner(완화형) |
|---|---|---|---|
| 유료 API 금지(CLAUDE.md 규칙 7) | 위반 없음(알고리즘 자체는 무료) | **위반 위험** — 서버 ML 학습/추론 인프라 비용 발생 | 위반 없음 |
| 외부 패키지 최소화(규칙 6) | `ts-fsrs` 등 전용 라이브러리 없이 직접 구현 시 공식 오류 위험 큼 → 사실상 라이브러리 추가 유인 | 자체 구현 자체가 비현실적 | **직접 구현이 가장 쉬움, 패키지 불필요** |
| 클라이언트 React+Supabase, anon key 직접 CRUD | 클라이언트에서 stability/difficulty 갱신 가능은 하나 로직이 무겁고 검증 어려움 | 클라이언트에서 불가능(모델 서빙 필요) | 클라이언트 로직으로 충분(순수 함수) |
| 기존 스키마 패턴(예: `word_status`, `student_daily_progress`의 단순 컬럼 구조) | 컬럼 3~4개(difficulty/stability/last_review/due) 필요, 큰 위화감은 없음 | 원시 로그 테이블 + 별도 모델 서빙 필요, 기존 패턴과 이질적 | 컬럼 2~3개(box_level/next_review_date)로 기존 패턴과 가장 자연스럽게 정합 |
| DB 마이그레이션 멱등/폴백 요구(규칙 9) | 가능(신규 테이블+기본값 폴백) | 가능하나 모델 부재 시 폴백이 "스케줄링 전면 미동작"이라 리스크가 큼 | 가능, 폴백도 단순("컬럼 없으면 전체 유닛 순서대로 보여주기"로 자연스럽게 후퇴) |

결론적으로 Leitner 계열만이 5개 제약을 전부 무리 없이 통과합니다.

## 6. 최종 추천: 완화형 레벨 라이트너(Graduated Leitner)

### 6.1 FSRS/HLR을 배제한 이유(요약)

- FSRS: 개인화의 이점을 살리려면 리뷰 수백~1000+건이 쌓여야 하는데,
  이 프로젝트는 학생 1인당 일일 학습량이 제한적이라 그 정도 볼륨이
  쌓이기까지 오래 걸리고, 그동안은 커뮤니티 기본값(성인 Anki 유저
  기준으로 튜닝됨)에 의존하게 되어 애초에 아동에게 안 맞을 리스크를
  그대로 안고 갑니다. 구현 복잡도도 헌법 규칙 6과 충돌합니다.
- Duolingo HLR/Birdbrain: 서버 ML 인프라와 대량 크로스유저 로그가
  전제라 이 프로젝트 규모·예산과 맞지 않습니다.

### 6.2 SM-2(원본/Anki변형)보다 순수 Leitner를 더 선호하는 이유

SM-2/Anki 이지팩터 방식도 구현은 가능하지만, 아동 적합성 축에서
Leitner보다 이점이 없고(둘 다 카드 수백 장 규모에서는 체감 차이가
거의 없다는 게 다수 문헌의 결론) 오답 처리 시 "이지팩터 하락 + 간격
리셋"이라는 이중 페널티 구조가 있어 완화 로직을 얹기에 Leitner보다
설명하기 어렵습니다. Leitner는 "박스를 하나 올리거나 내린다"는 규칙
하나뿐이라 학생·학부모·원장 모두에게 투명합니다.

### 6.3 권장 알고리즘 명세

**박스(레벨) 0~5, 6단계**, 박스별 다음 복습까지의 최소 간격(일):

| 박스 | 간격 | 의미 |
|---|---|---|
| 0 | 즉시(같은 세션 내 재출제 가능) | 처음 보는 단어 / 방금 틀린 단어 |
| 1 | 1일 | |
| 2 | 3일 | |
| 3 | 7일 | |
| 4 | 14일 | |
| 5 | 30일 | 사실상 "숙달"(기존 `word_status.status='mastered'`와 개념적으로 대응) |

규칙:

- **정답**: 박스 +1 (최대 5).
- **오답**: 박스 **-1**(0 미만 방지) — 원본 Leitner의 "무조건 박스 0으로
  리셋"이 아니라 **한 단계만 강등**하는 완화형을 채택합니다. 이는
  4절에서 확인한 "아동의 실패 경험은 최대한 손실을 작게" 원칙을 그대로
  반영한 설계 선택이며, Anki가 SM-2를 손질한 방향(간격 전면 리셋 대신
  부분 감소 옵션)과도 같은 결입니다.
- **세션당 노출 상한**: 이 테이블만으로는 안 풀리는 문제(4절) — "오늘의
  복습 대상"을 계산한 뒤 앱단에서 학년/연령 프로필별 상한(예: 10~15개)
  을 적용하는 로직은 이 스케줄러의 소비자(호출부) 책임으로 분리합니다.
- **동률/우선순위**: `next_review_date`가 오늘 이전인 단어를 오래
  묵은 순으로 우선 노출, 그다음 아직 한 번도 안 본 단어(박스 없음)를
  채워 넣는 2단계 우선순위면 충분합니다(정밀 확률 계산 불필요, 4절).
- **파라미터 튜닝**: 없음. 위 6단계 간격 표가 유일한 "파라미터"이고,
  운영 데이터가 쌓여 이 표가 안 맞는다는 근거가 나오면 표 자체를
  수동으로 조정하면 됩니다(자동 재학습 파이프라인 불필요).

## 7. 기존 스키마 위 설계 (신규 테이블 스케치 — DDL 실행 금지, 설계 참고용)

### 7.1 왜 `word_status`를 확장하지 않고 신규 테이블을 제안하는가

`word_status`(v1.5)는 학생이 직접 누르는 "알아요/모르겠어요" **자기
신고** 플래그이자 Skip 기능의 근거 데이터입니다(`DATABASE.md`,
`wordLibrary.js` 1678행 주석). 이번에 설계하는 박스 레벨은 **퀴즈/발음
채점 등 시스템이 자동으로 갱신**하는 값으로 의미가 다릅니다. 같은
컬럼에 "학생이 누른 값"과 "시스템이 계산한 값"을 섞으면 두 기능이
서로의 의미를 오염시킬 위험이 있어(헌법 규칙 1 "기존 플로우를 위험하게
하지 않는다"), 기존 `word_status`는 그대로 두고 별도 테이블로
분리하는 편이 안전합니다.

### 7.2 신규 테이블 스케치: `word_review_schedule`

```sql
-- 설계 스케치 — 실제 파일/실행은 운영자 담당 (CLAUDE.md 규칙 8)
-- 예상 파일명: supabase_v2_10_word_review_schedule.sql (버전 번호는
-- 실제 작업 시점의 DATABASE.md "마이그레이션 실행 순서" 최신 항목 다음
-- 번호로 재확인 필요 — 이 문서 작성 시점 최신은 v2.9)

create table if not exists public.word_review_schedule (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  box_level smallint not null default 0 check (box_level between 0 and 5),
  next_review_date date not null default current_date,
  correct_streak integer not null default 0,
  last_result text check (last_result in ('correct', 'incorrect')),
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (student_id, word_id)
);

create index if not exists idx_word_review_schedule_student_due
  on public.word_review_schedule (student_id, next_review_date);

alter table public.word_review_schedule enable row level security;

create policy "allow anon all" on public.word_review_schedule
  for all using (true) with check (true);
```

설계 근거:

- `student_id`/`word_id` 둘 다 UUID FK, cascade — 헌법 규칙 4(이름
  아닌 UUID 식별)와 기존 `word_status`/`entrance_test_results` 패턴을
  그대로 따름.
- `unique(student_id, word_id)` — `word_status`와 동일한 upsert
  키 패턴, 클라이언트 코드 재사용성 높음.
- RLS는 `xp_ledger`/`word_king_history`(서버 전용 쓰기, 보상이 걸려
  조작 유인 큼)가 아니라 `word_status`/`student_progress`와 같은
  "allow anon all" 그룹으로 분류했습니다 — 이 값은 보상/랭킹에 직접
  연결되지 않는 순수 학습 스케줄 데이터라 조작 유인이 낮고, 학생 자기
  자신의 학습 진행 데이터를 클라이언트가 직접 갱신하는 기존 다수
  테이블과 성격이 같습니다(`DATABASE.md` RLS 절 분류 기준).
- `students`/`classes` 테이블처럼 **컬럼 단위 GRANT가 필요한 테이블이
  아니므로**(신규 테이블 자체에 RLS 정책을 걸면 됨) 헌법 규칙 10의
  "새 컬럼 추가 시 GRANT" 요건은 이 설계에는 해당하지 않습니다. 다만
  혹시 이 값을 캐시하려고 **`students`에 컬럼을 추가하는 방향으로
  바뀐다면** 그때는 규칙 10에 따라 GRANT를 반드시 함께 실행해야
  합니다 — 이번 설계는 그 경로를 피하려고 의도적으로 별도 테이블을
  선택했습니다.
- 멱등성(규칙 9): `create table if not exists` + 컬럼 전부 `default`
  보유. 이 SQL 미실행 상태에서 클라이언트는 `isMissingTableError()`
  (기존 `wordLibrary.js`에 이미 export되어 있는 헬퍼, `9c09537` 커밋
  참고)로 테이블 부재를 감지해 "박스 레벨 없이 기존 유닛 순서 그대로
  보여주기"로 안전 폴백해야 합니다 — `student_class_assignments`(v2.9)
  가 이미 이 폴백 패턴을 쓰고 있어 그대로 재사용 가능합니다.

### 7.3 클라이언트 갱신 지점(설계만, 구현은 별도 세션)

- 퀴즈/쓰기시험 채점 직후, 그 문항의 `word_id`에 대해 upsert
  (`box_level`을 정답이면 +1, 오답이면 -1, `next_review_date`를 6.3의
  표로 재계산).
- "오늘의 복습 단어" 조회는 `next_review_date <= 오늘` 조건으로 select
  후, 없으면(신규 학생 등) 기존 `daily_assignments`/유닛 순서 폴백을
  그대로 유지 — 기존 숙제 배정 로직(`daily_assignments`)과는 **독립적인
  보조 신호**로만 얹고, 기존 "오늘의 단어" 배정 로직 자체를 대체하지
  않는 것을 권장합니다(헌법 규칙 1 — 기존 플로우 안정성 최우선).

## 8. 향후 확장 경로 (지금 하지 않음, 참고용)

- 운영 데이터가 충분히 쌓이면(반별 수천 건 이상의 정답/오답 로그),
  6.3의 고정 간격 표 대신 "반 평균 정답률"만 반영하는 아주 단순한
  1~2개 파라미터 보정(예: 오답률이 높은 반은 간격을 20% 단축) 정도는
  고려할 수 있습니다 — 이는 FSRS의 사용자별 최적화가 아니라 반 단위
  집계 통계이므로 클라이언트에서도 계산 가능하고 튜닝 부담이 거의
  없습니다.
- Duolingo가 참고했던 "Leitner queue + half-life 포인트 프로세스"
  결합 모델(PNAS 2019, Tabibian et al., "Enhancing human learning via
  spaced repetition optimization")은 이론적으로는 Leitner의 단순함과
  half-life 모델의 정밀함을 절충하지만, 여전히 최적화 계산이 필요해
  이번 규모에는 과설계로 판단해 채택하지 않았습니다. 참고 링크는
  9절.

## 9. 출처

- SM-2: [GitHub thyagoluciano/sm2](https://github.com/thyagoluciano/sm2), [SATHEE SM-2 Algorithm](https://sathee.iitk.ac.in/pyqs/spaced-repetition/algorithms/sm2-algorithm/), [Wordrop — SM-2 Algorithm Explained](https://wordrop.studio/blog/sm2-algorithm-spaced-repetition-explained), [PyPI supermemo2](https://pypi.org/project/supermemo2/)
- Anki의 SM-2 변형: [RemNote — The Anki SM-2 Spaced Repetition Algorithm](https://help.remnote.com/en/articles/6026144-the-anki-sm-2-spaced-repetition-algorithm), [Anki FAQs — What algorithm does Anki use?](https://faqs.ankiweb.net/what-spaced-repetition-algorithm.html)
- FSRS: [DeepWiki — The FSRS Algorithm (py-fsrs)](https://deepwiki.com/open-spaced-repetition/py-fsrs/5-the-fsrs-algorithm), [GitHub open-spaced-repetition/free-spaced-repetition-scheduler](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler), [fsrs4anki tutorial](https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md), [Expertium — A technical explanation of FSRS](https://expertium.github.io/Algorithm.html), [LessWrong — The History of FSRS for Anki](https://www.lesswrong.com/posts/G7fpGCi8r7nCKXsQk/the-history-of-fsrs-for-anki), [Anki Forums — FSRS>=5 regression for users who click Again a lot](https://forums.ankiweb.net/t/fsrs-5-is-a-significant-regression-for-a-minority-of-users-who-use-again-a-lot-on-new-and-learn-cards/66593), [RemNote — The FSRS Spaced Repetition Algorithm](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)
- FSRS 데이터 요구량/최적화: [GitHub ankitects/anki Issue #3094](https://github.com/ankitects/anki/issues/3094), [Neurako — FSRS Parameter Optimization: When It Helps and When It Hurts](https://www.neurako.com/blog/fsrs-optimizer-guide), [Anki Forums — How many reviews for accurate optimization?](https://forums.ankiweb.net/t/how-many-reviews-for-accurate-optimization/53320)
- FSRS JS 구현체(참고, 채택하지 않음): [ts-fsrs (npm)](https://www.npmjs.com/package/ts-fsrs), [GitHub open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- Leitner: [Wikipedia — Leitner system](https://en.wikipedia.org/wiki/Leitner_system), [My Senpai — Leitner System Guide](https://my-senpai.com/insights/exploring-leitner-system.html), [FluentFlash — Leitner Box](https://fluentflash.com/guides/leitner-box)
- Duolingo HLR: [Duolingo Research — A Trainable Spaced Repetition Model for Language Learning (ACL16 PDF)](https://research.duolingo.com/papers/settles.acl16.pdf), [GitHub duolingo/halflife-regression](https://github.com/duolingo/halflife-regression)
- Duolingo Birdbrain(후속): [buildmvpfast — Duolingo AI Personalization: How Birdbrain Works](https://www.buildmvpfast.com/blog/ai-learning-personalization-duolingo-ai-driven-lessons-2026), [Millennial Partners — AI-Driven Learning Personalization](https://millennial.ae/ai-driven-learning-personalization-how-duolingo-revolutionized-language-education-with-machine-learning/)
- Leitner+half-life 절충 모델(참고, 8절): [PNAS — Enhancing human learning via spaced repetition optimization](https://www.pnas.org/doi/10.1073/pnas.1815156116)
- 아동 대상 간격반복: [supermemo.guru — SuperMemo does not work for kids](https://supermemo.guru/wiki/SuperMemo_does_not_work_for_kids), [supermemo.guru — Childhood amnesia](https://supermemo.guru/wiki/Childhood_amnesia), [initiateHUB — How spaced repetition actually works for ages 5–12](https://initiatehub.com/blog/spaced-repetition-flashcards/), [GitHub jon49/child-spaced-repetition](https://github.com/jon49/child-spaced-repetition)

## 10. 이 문서가 다루지 않은 것 (범위 밖)

이 문서는 헌법 규칙 12("학생 대상 신규 기능/UI/게임화는 이번 AI 개발
운영체제 구축 범위에서 절대 금지")의 적용을 받는 순수 조사·설계
문서입니다. 실제 구현(SQL 실행, `wordLibrary.js`/`useStudent.js`
연동, 학생 화면 UI 변경)은 이 세션의 범위가 아니며, 별도의
계획(planner)·구현(implementer) 세션에서 이 문서를 근거로 진행해야
합니다.
