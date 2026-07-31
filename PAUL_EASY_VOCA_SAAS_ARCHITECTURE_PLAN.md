# PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md — 100~500학원 SaaS 확장 설계

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL/Migration/배포를 이
세션에서 전혀 실행하지 않았다.** `docs/audit/2026-07-26-saas-multi-
tenant-security-top10.md`, `PAUL_EASY_VOCA_CURRENT_STATUS.md`,
`PAUL_EASY_VOCA_MASTER_PLAN.md`, `docs/agent-decisions/0006-
multitenant-saas-architecture.md`를 종합·재구성한 최종 결과물이다.
겹치는 상세 근거(전체 테이블 grep 조사, FK 체인 등)는 반복하지 않고
`0006` 문서를 원본으로 인용한다 — 이 문서는 그 위에 결제/AI비용/
Dashboard/6개월 로드맵을 새로 채운 확장판이자 단일 참조용 통합본이다._

**목표를 다시 명확히**: 지금 있는 기능(핵심 학습 루프, 게임화, 다중
교재, 쓰기 AI 보조)을 **하나도 깨뜨리지 않으면서**, 학원 A와 학원 B의
데이터가 **절대 섞이지 않는** 구조로 확장하는 가장 안전한 경로를 찾는
것. "지금 당장 구현"이 아니라 "사업적으로 다학원 확장이 결정됐을 때
바로 착수할 수 있는 설계도"다.

---

## 1. 현재 상태

| 항목 | 현재 |
|---|---|
| 규모 | 학원 1곳, 학생 111명, production-ready 판정 완료 |
| 테넌트 개념 | **없음** — `classes` 테이블에 학원을 구분하는 컬럼 자체가 없음 |
| 인증 | 학생(이름+PIN, 서버 scrypt) / 관리자(**전역 단일** `ADMIN_PIN`) 2단계뿐. "선생님"이라는 역할 자체가 없음 |
| DB 접근 모델 | Supabase Auth 미사용 — 전부 anon key(공개) + 일부만 service_role 경유 서버리스/Edge Function |
| 최근 보안 상태 | Critical 취약점(커리큘럼 무인증 쓰기) 코드 수정 완료·배포 대기(`v3_11`) — `docs/audit/2026-07-26-v3_11-*.md` 참고 |
| 게임화 | Paul Rank/House/Ticket/Word King/Season 전부 코드 완료, SQL 대부분 실행 대기 |
| 쓰기 AI 보조 | Provider 추상화(OpenAI/Gemini/Anthropic)+캐시+일일비용상한까지 코드 완료, Edge Function 배포 대기 |
| 배포 인프라 | Vercel Hobby(서버리스 함수 12/12, 여유 0) + Supabase 무료/저가 티어, **비상업적 용도로 ToS 한정 확인됨** |
| 결제/구독 | 개념 자체 없음(학원 1곳, 계약 관계가 시스템 밖에 있음) |

상세 근거: `PAUL_EASY_VOCA_CURRENT_STATUS.md` 전체.

---

## 2. 문제점 (멀티테넌트 관점에서 지금 구조가 안 되는 이유)

| # | 문제 | 왜 100~500학원에서 치명적인가 |
|---|---|---|
| 1 | `classes`에 학원 경계 컬럼 0개 | 단일 Supabase 프로젝트로 여러 학원을 서빙하는 순간 전체 커리큘럼이 뒤섞여 조회됨 |
| 2 | 관리자 인증이 전역 단일 `ADMIN_PIN` | 학원이 2곳만 돼도 한쪽 관리자가 다른 학원 데이터를 그대로 조작 가능 |
| 3 | "선생님" 역할 자체가 없음 | 원장 1인 이상의 운영 인력을 가진 학원(현실적으로 대다수)을 애초에 지원 못함 |
| 4 | RLS가 "전체허용/전체차단" 이분법 | 학원 스코프라는 중간 개념이 없어 지금 패턴을 그대로 100학원에 못 씀 |
| 5 | 무필터 전체조회(로그인/포커스마다 6쿼리) | `docs/audit/2026-07-24-performance-db.md` Critical — 학원 수가 늘수록 이 병목이 그대로 재현 |
| 6 | `ai_usage_daily`에 FK 없음(전역 집계) | 학원별 AI 비용 과금·상한 자체가 불가능, 한 학원이 전체 예산 소진 가능 |
| 7 | `seasons`이 FK 없는 전역 단일 테이블 | "최신 행 = 현재 시즌" 로직이 학원 여러 곳에서는 아예 의미를 잃음 |
| 8 | Vercel Hobby ToS(비상업 한정) | 상업 SaaS 자체가 계약 위반, 유료 전환이 선택이 아니라 전제조건 |
| 9 | 결제/구독 개념 없음 | 매출을 받을 수 있는 시스템이 아직 아님 |
| 10 | 플랫폼 운영 대시보드 없음 | 지금의 `AdminScreen.jsx`는 학원 내부용 — 전 학원을 횡단 관리할 화면이 없음 |

---

## 3. 목표 구조 (Multi Tenant Architecture)

### 3.1 신규 테이블 4종 (개념 설계)

| 테이블 | 역할 |
|---|---|
| **`academies`** | 테넌트 루트. 학원 1곳 = 1행. 플랜/과금상태의 실제 주인 |
| **`academy_roles`** | 역할 정의를 코드가 아니라 데이터로(고정 enum 대신) — `owner`/`teacher` 외에 향후 커스텀 역할(예: "보조교사", "회계담당") 추가가 스키마 변경 없이 가능 |
| **`academy_members`** | "이 사람이 이 학원에서 어떤 역할인가"의 매핑(`academy_id` + 인증 계정 + `academy_roles` 참조) |
| **`academy_settings`** | 학원 단위 설정(브랜딩/기능플래그/알림 설정 등) — 기존 `classes`의 반별 설정(`spelling_test_enabled` 등)과는 다른 레벨(학원 전체 vs 반 하나) |

### 3.2 관계 트리 — 요청하신 구조를 실제 테이블에 매핑

```
academy (academies)
 │
 ├── teachers      → academy_members(role='teacher'|'owner') — 인증 계정
 │
 ├── classes       → classes.academy_id(신규 직접 컬럼, §4)
 │
 ├── students      → students.academy_id(신규 직접 컬럼, §4)
 │
 ├── curriculum    → units/words/textbooks/class_textbooks
 │                    (전부 classes를 거쳐 상속 — 직접 컬럼 불필요)
 │
 └── learning records → student_progress/student_daily_progress/word_status/
                        xp_ledger/entrance_test_results/sentence_progress/
                        writing 관련 4종 등
                        (전부 students 또는 words를 거쳐 상속)
```

### 3.3 왜 이 구조가 필요한가

- **`academies`가 없으면** "학원"이라는 개념 자체가 시스템에 존재하지
  않는다 — 결제(§7)도, 플랫폼 대시보드(§9)도 이 테이블을 기준으로
  움직이므로 모든 것의 시작점.
- **`academy_roles`를 별도 테이블로 분리한 이유**: "선생님" 하나만
  있다가 나중에 "보조교사"/"회계담당" 같은 역할이 필요해질 때 코드
  배포 없이 데이터(행 추가)만으로 대응 가능 — 이 저장소가 이미
  `xp_ledger.event_type`처럼 화이트리스트를 DB CHECK가 아니라
  애플리케이션 레벨에 두어 유연성을 확보한 선례와 같은 방향.
- **`academy_members`가 인증 계정과 학원을 분리하는 이유**: 한 사람이
  여러 학원에 소속될 가능성(예: 프랜차이즈 순회 강사)을 원천 차단하지
  않으면서도, 기본적으로는 "1인 1학원"을 자연스럽게 표현.
- **`academy_settings`가 `classes` 설정과 분리된 이유**: `classes.
  gamification_enabled` 같은 기존 설정은 "이 반에서 게임화를 켤지"
  결정이고, 학원 단위 설정(로고/색상 테마, 알림 수신 이메일 등)은
  전혀 다른 레벨의 결정 — 섞으면 나중에 "학원 전체 설정을 반 개수만큼
  중복 저장"하는 비정규화 버그가 생긴다.

---

## 4. DB 전략

### 4.1 전체 테이블 분석 (현재 역할 → 문제점 → 변경 방향 → 위험도)

`0006` 문서에서 이미 저장소의 모든 `supabase_*.sql`을 전수 조사했다
(30개+ 테이블). 여기서는 그 결과를 "현재역할→문제점→변경방향→위험도"
포맷으로 재정리한다.

| 테이블 | 현재 역할 | 멀티테넌트 전환 시 문제점 | 필요한 변경 방향 | 위험도 |
|---|---|---|---|---|
| `classes` | 반(=교재 컨테이너) | 학원 경계 컬럼 0개 — anchor 부재 | `academy_id` **직접 추가**(anchor) | 낮음(순수 추가) |
| `units` | 반의 하위 유닛 | `class_id` 경유로 학원 판별 가능하나 지금은 그 경계가 무의미 | 컬럼 추가 불필요, RLS에서 조인 상속 | 낮음 |
| `words` | 단어 원장 | 동일(2홉 상속) | 컬럼 추가 불필요 | 낮음 |
| `students` | 학생 계정 | `class_id`가 **nullable**(반 미배정 상태 실존) — 체인만으로는 학원 경계 밖으로 떨어질 수 있음 | `academy_id` **직접 추가** | 낮음(단, GRANT 필수 — CLAUDE.md 규칙 10) |
| `student_progress` | 학생 누적 진행도 | `student_id` 경유 상속, 문제 없음 | 컬럼 추가 불필요 | 낮음 |
| `student_daily_progress`(요청하신 "daily_study_log"에 해당하는 실제 테이블) | 일별 학습 기록 | `student_id` 경유 상속 | 컬럼 추가 불필요 | 낮음 |
| `writing 관련 4종`(`spelling_review_queue`/`writing_answer_statistics`/`spelling_ai_grading_cache`/`word_accepted_variants`) | 쓰기 답안 검토/캐시/통계 | `word_id` 경유 상속(3홉) — `spelling_review_queue.student_id`는 nullable이지만 `word_id`는 not null이라 체인은 안 끊김 | 컬럼 추가 불필요 | 낮음 |
| `ai_usage_daily` | AI 사용량/비용 일별 집계 | **FK 자체가 없는 전역 테이블** — 학원별 과금 불가 | `academy_id` **직접 추가**(anchor급) | 중간(§7 결제와 직결, 설계 오류 시 과금 오류로 이어짐) |
| `xp_ledger`/`word_king_history`/`entrance_tests`/`entrance_test_results`/`daily_assignments`/`word_status`/`student_class_assignments` | 게임화/시험/숙제/다중교재 | `student_id` 또는 `class_id` 경유 상속 | 컬럼 추가 불필요 | 낮음 |
| `textbooks`/`class_textbooks` | 다중 교재 모델(0004 결정) | `textbooks.owner_class_id`가 nullable(교재 재사용 설계) | `textbooks.academy_id` **직접 추가** | 낮음~중간(교재 공유 정책과 맞물림, §4.3) |
| `seasons` | 시즌 경계(전역 단일 행) | **FK 자체가 없고, "최신 행=현재 시즌" 로직 자체가 학원별로 안 나뉨** | `academy_id` **직접 추가 + 로직 변경**(단순 컬럼 추가로 안 끝나는 유일한 케이스) | **높음**(로직 재설계 필요) |
| `product_events` | 익명 관찰 로그 | `anon_id`가 `sha256(student_id)`라 역조인 불가(의도된 설계) — 체인 상속 자체가 안 됨 | `academy_id` **직접 추가**(평문, 재식별 위험 없음) | 낮음 |
| `passages`/`passage_sentences`/`sentence_progress`/`sentence_words` | Reading Foundation | `unit_id`/`student_id` 경유 상속(3~4홉) | 컬럼 추가 불필요, RLS 성능만 주의(§6) | 낮음(단 조인 깊이로 성능 검토 필요) |

**결론(0006과 동일): 직접 `academy_id` 컬럼이 필요한 테이블은 6개
(`classes`/`students`/`textbooks`/`seasons`/`ai_usage_daily`/
`product_events`)뿐이고, `seasons`만 유일하게 컬럼 추가 이상의 로직
재설계가 필요하다.**

### 4.2 요청하신 8개 테이블 — YES/NO 형식 분석

| 테이블명 | 필요 여부 | 이유 | 적용 위치 | 위험 |
|---|---|---|---|---|
| **`classes`** | **YES** | 테넌트 anchor, 모든 하위 테이블의 경계가 여기서 시작 | `classes` 테이블에 직접 컬럼 | 낮음 — 순수 추가, 기존 쿼리 무영향(컬럼 없어도 안전 폴백 관례 그대로 적용 가능) |
| **`students`** | **YES** | `class_id`가 nullable이라 체인 상속만으로는 "반 미배정 학생"이 학원 경계 밖으로 유실될 수 있음 | `students` 테이블에 직접 컬럼 | 낮음 — 단 GRANT 누락 시 기존 조회까지 fail-closed로 깨지는 v1.9 패턴 재확인 필요(CLAUDE.md 규칙 10) |
| **`student_progress`** | **NO** | `student_id`(not null, unique) 경유로 100% 상속 가능 | 컬럼 추가 없음, RLS 정책에서 `students` 조인 | 낮음 |
| **`daily_study_log`**(실제 테이블명: `student_daily_progress`) | **NO** | 위와 동일(`student_id` not null) | 컬럼 추가 없음 | 낮음 |
| **`writing_answer`**(실제로는 4개 테이블: `spelling_review_queue`/`writing_answer_statistics`/`spelling_ai_grading_cache`/`word_accepted_variants`) | **NO** | 전부 `word_id`(not null) 경유 3홉 상속 — `spelling_review_queue.student_id`가 nullable이어도 `word_id` 체인은 안 끊김 | 컬럼 추가 없음 | 낮음 — 단 4개 테이블이라는 것 자체를 다음 세션이 놓치지 않도록 이 문서에 명시 |
| **`words`** | **NO** | `unit_id`(not null) 경유 2홉 상속 | 컬럼 추가 없음 | 낮음 |
| **`units`** | **NO** | `class_id`(not null) 경유 1홉 상속 | 컬럼 추가 없음 | 낮음 |
| **`AI usage logs`**(`ai_usage_daily`) | **YES** | FK가 아예 없는 전역 집계 테이블 — 결제(§7)에 필수, 없으면 학원별 과금·상한 불가능 | `ai_usage_daily` 테이블에 직접 컬럼 | **중간** — 이미 쌓인 데이터(마이그레이션 이전 사용량)를 어느 학원 것으로 볼지 백필 규칙이 필요(현재는 학원 1곳뿐이라 전량 academy #1로 귀속 처리하면 됨 — 지금이 아니면 나중엔 더 복잡해짐) |

### 4.3 특수 판단이 필요한 것 — 교재(`textbooks`) 재사용 정책

`textbooks`에 `academy_id`를 직접 넣으면, 지금 설계(교재가 여러
**반**에서 재사용됨, 0004 결정)의 "재사용 범위"가 자동으로 "**같은
학원 안에서만**"으로 좁혀진다. 이것이 맞는 기본값이다(다른 학원의
교재를 마음대로 가져다 쓰면 콘텐츠 소유권/저작권 문제) — 단, 향후
"검증된 시판 교재 콘텐츠를 여러 학원이 공유하는 마켓플레이스"를 만들고
싶다면 `textbooks.is_shared_template boolean`류 별도 플래그가 필요하다
(지금 설계 범위 밖, 아이디어만 기록).

---

## 5. 권한 전략

| 역할 | 볼 수 있는 데이터 | 수정 가능한 데이터 | 금지 데이터 |
|---|---|---|---|
| **1. Platform Owner**(서비스 운영자) | 전 학원의 메타데이터(이름/플랜/과금상태/사용량/에러로그), 감사로그를 통한 임시 지원 접근 | 학원 생성/정지/삭제, 플랜 변경, 지원 목적 계정 상태 조정 | 감사로그 없는 학생 개인 학습 데이터 열람(사유 없는 접근 금지 원칙), 결제수단 원본(애초에 시스템에 저장 안 함, §7) |
| **2. Academy Owner**(원장) | 자기 학원의 반/학생/교재/진행도/결제상태 전체 | 반/유닛/단어, 교사 초대·해제, 학생 관리, 결제 플랜 변경 | 다른 학원의 모든 데이터, 플랫폼 전체 통계, 다른 학원 결제정보 |
| **3. Teacher**(선생님) | 자기 학원의 반/학생/교재/진행도(원장이 담당 반으로 범위를 더 좁힐 수도 있음, 선택적 세분화) | 담당 반의 반/유닛/단어/숙제/쓰기검토 | 교사 초대·해제, 결제/플랜 변경, 학원 삭제, 다른 학원 데이터 |
| **4. Student**(학생) | 자기 진행도 + 자기 반의 커리큘럼(단어/유닛) | 자기 진행도(퀴즈/쓰기 답안 제출, 스티커 배치 등) | 다른 학생 데이터, 커리큘럼 쓰기(반/단어 편집), 다른 학원 전체, **자기 PIN 해시 자체도 조회 불가**(기존 v1.9 원칙 그대로 유지) |
| **5. Parent**(향후) | 자기 자녀 학생의 진행도(읽기 전용) | **없음**(기존 `ParentScreen.jsx`의 읽기 전용 원칙 그대로 유지 — 새로 쓰기 권한을 주지 않는다) | 다른 학생 데이터, 자녀 데이터 수정, 학원 관리 기능 전체 |

**설계 판단**: Teacher를 Owner의 완전한 부분집합으로 두고(교사 초대/
결제/삭제만 제외) 별도의 세밀한 권한 매트릭스를 처음부터 만들지
않는다 — `MULTI_AGENT_WORKFLOW.md`의 "방대한 추측성 설계 금지" 원칙과
같은 이유로, 실제 학원 운영에서 "교사 A는 반 관리만, 교사 B는 결제도"
같은 세분화 요구가 실제로 나타난 뒤에 `academy_roles`(§3.1)에 역할을
추가하는 것이 과설계를 피하는 길이다.

---

## 6. RLS 전략 (+ 데이터 완전 분리 방법)

### 6.1 정책 방향 (의사코드, 실제 SQL 아님)

```
Platform Owner
   ↓
모든 academy 접근 (Supabase Auth + academy_id 클레임 없음 = "전체" 의미,
   단 접근 자체가 감사로그에 항상 기록됨)

Academy Owner
   ↓
본인 academy_id만 접근 (JWT app_metadata.academy_id == 행의 academy_id
   또는 그 체인)

Teacher
   ↓
담당 academy_id + (선택) 담당 class_id로 추가 필터
   — 기본은 Owner와 동일 스코프, 세분화는 academy_roles 확장 시 추가

Student
   ↓
본인 student_id 데이터만 (진행도류) +
본인 소속 academy_id의 커리큘럼만 SELECT (words/units 등, 조회 전용)

Parent
   ↓
지정된 자녀 student_id의 진행도만 SELECT (조회 전용, 그 외 전부 차단)
```

상세 구현 패턴(`current_academy_id()` 같은 SECURITY DEFINER 헬퍼로
매 정책마다 깊은 조인을 반복하지 않는 방법, `admin-content-write`
Edge Function을 academy 인식형으로 확장하는 방법)은 `0006` 문서
§4 전체 참고 — 여기서는 "누가 무엇에 접근하는가"의 정책 방향만 다룬다.

### 6.2 데이터 완전 분리 3가지 방법 비교

| 방법 | 설명 | 장점 | 단점 | 비용(100학원 기준, 대략) |
|---|---|---|---|---|
| **① RLS(논리적 분리)** | 단일 Supabase 프로젝트 + `academy_id` + RLS 정책 | 구현/운영 단순, 마이그레이션 1회로 전체 적용, 전사 집계(플랫폼 대시보드) 쉬움 | 정책 버그 시 전체 노출 위험(단, defense-in-depth로 완화 가능, §6.3) | Supabase 단일 프로젝트 요금제 1개분(수십~수백 달러/월 수준, 학생 수 비례) — **가장 저렴** |
| **② 스키마 분리** | 단일 프로젝트, 학원별 Postgres schema(`academy_42.classes`) | RLS보다 격리 강도 높음 | 마이그레이션을 학원 수만큼 반복 실행(운영 부담이 학원 수에 비례해 커짐), 전사 집계가 스키마를 가로지르는 쿼리 필요 | ①과 비슷한 프로젝트 비용 + **운영 인건비가 크게 증가**(자동화 없이는 100회 반복 작업) |
| **③ 프로젝트 물리적 분리** | 학원별 독립 Supabase 프로젝트 | 최고 수준의 격리, 계약상 "완전 별도 인프라" 요구에 대응 가능 | 100개 프로젝트 = 100배 관리 비용, 전사 통계 불가(집계 파이프라인 별도 구축 필요), 마이그레이션 100회 | 프로젝트당 기본요금 × 100 — **①의 수십~100배 이상** |

**100학원 기준 추천: ①(RLS 논리적 분리)을 기본 티어로, ③(물리적 분리)
을 Enterprise 한정 옵션으로.** ②(스키마 분리)는 ①의 단순함도, ③의
강한 격리도 없이 운영 부담만 학원 수에 비례해 커지는 중간지대라
권장하지 않는다(`0006` §5.2와 동일 결론).

### 6.3 Defense in Depth (RLS 하나만 믿지 않는다)

1. RLS(DB 최종 방어) → 2. 애플리케이션 공용 쿼리 헬퍼(코드 리뷰 단계
가시성) → 3. 감사 로그(사후 탐지, §9). 상세는 `0006` §5.3.

---

## 7. 결제 전략

### 7.1 신규 테이블 4종 (개념 설계)

| 테이블 | 역할 |
|---|---|
| **`plans`** | 요금제 정의(이름/학생수 상한/AI 일일예산/기능 플래그/월 가격) — 데이터로 관리해 요금제 변경이 배포 없이 가능 |
| **`subscriptions`** | `academy_id` ↔ `plans` 매핑 + 상태(`trial`/`active`/`past_due`/`cancelled`) + 결제 주기 |
| **`billing_history`** | 청구/결제 이력(성공/실패/환불) — 분쟁 대응, 세금계산서 근거 |
| **`academy_usage`** | 청구 주기별 실사용량 집계(피크 학생 수, AI 사용 건수/비용, 스토리지) — 초과 경고·정산 근거, `ai_usage_daily`(§4)를 학원별로 이미 태깅해뒀다면 그 집계를 그대로 재사용 |

### 7.2 요금제 설계

| 요금제 | 학생 수 | AI 사용량(일일 상한, 기존 $2/일=26,000~30,000건 기준선에서 스케일) | 기능 제한 |
|---|---|---|---|
| **Free(체험)** | ≤ 20명 | AI 검수 미사용(규칙기반 채점만) 또는 월 소량 체험 | 핵심 학습 루프만 — 게임화/다중교재/입실시험 전부 OFF |
| **Starter** | ≤ 150명(현재 111명 규모가 표준) | 일 $2 상당(기존 기본 상한 그대로 재사용) | 게임화 기본(Paul Rank/House/Ticket), 다중 교재, 입실시험 |
| **Professional** | ≤ 500명(여러 반, 여러 교사) | 일 $5~10 상당 | Starter 전체 + 학부모 리포트 + 다중 교사 계정(Teacher 역할) + Word King/Season |
| **Enterprise** | 협의(500명 초과·다지점 프랜차이즈) | 협의/종량제 | 전체 기능 + §6.2의 물리적 격리 옵션 + SLA + 전담 지원 + 커스텀 브랜딩 |

**구체 금액(₩/월)은 사업 결정 영역이라 이 설계 문서에서 정하지 않는다**
— 구조(무엇을 기준으로 등급을 나누는가: 학생 수 + AI 사용량 + 기능
플래그 3축)만 확정한다.

### 7.3 구독 상태에 따른 앱 동작

`0006` §6.4와 동일 원칙 재확인: `past_due`가 되어도 학생 학습 화면은
계속 정상 동작(수업 중단이 가장 큰 피해), 관리자 쓰기 액션만 제한 —
"컬럼/기능 부재 시 안전 폴백"이라는 이 저장소의 기존 관례를 결제
게이팅에도 그대로 적용.

### 7.4 결제 연동 원칙

- 카드번호 등 결제수단 원본은 이 시스템에 저장하지 않음(PG 호스팅
  체크아웃으로 위임) — PIN을 해시로만 다루는 기존 최소노출 원칙과
  같은 방향.
- 결제 웹훅은 Vercel `api/*.js`가 아니라 Supabase Edge Function으로
  (12개 함수 한도 문제, 기존 `admin-content-write`/`grade-writing-
  answers` 선례 재사용).
- 세금계산서 등 국내 회계 요구사항은 법무/회계 영역이라 이 문서가
  답을 내리지 않음(PG 선택 시 별도 확인 필요 항목으로만 표기).

---

## 8. AI 비용 전략 (100학원 규모)

### 8.1 문제 정의

지금 파이프라인(rules-first + 캐시 + Provider 추상화 + 일일 $2 상한)은
`docs/audit/2026-07-24-ai-cost.md`가 이미 "학원 1곳 기준 최적화 완료"로
평가했다. 100개 학원이 동시에 쓰면 **GPT/AI 비용이 학원 수에 비례해
증가**하는 것 자체는 당연하지만, 문제는 "비례해서 늘어나는 것"이 아니라
**"통제 없이 늘어나는 것"** — 지금 구조엔 학원별 상한이 없다(§4의
`ai_usage_daily` FK 부재 문제와 동일 뿌리).

### 8.2 설계

| 축 | 지금 상태 | 100학원 대응 설계 |
|---|---|---|
| **AI Cache** | (단어,뜻,답안) 조합 캐시, 5필드 키(모델 무관) | `academy_id` 적용 후에도 캐시는 자연히 학원별로 분리됨(word_id가 학원마다 다른 행이므로 별도 조치 불필요). **확장 아이디어(지금 당장 불필요)**: 동일 시판 교재(예: 능률/YBM 특정 단원)를 쓰는 여러 학원 간 "교재 콘텐츠 수준 캐시 공유" — 캐시 키에 학생 식별 정보가 전혀 없어(word/meaning/answer만) 프라이버시 문제 없이 공유 가능, 학원 수가 많아질수록 캐시 히트율이 기하급수적으로 오를 여지 |
| **Usage limit** | 전역 일일 $2 상한(`MAX_DAILY_COST`) | `ai_usage_daily.academy_id`(§4) 기준 **학원별** 일일 상한으로 전환, 요금제(§7)별 예산 차등. 상한 초과 시 기존에 이미 있는 "budgetExceeded 강등"(AI 미호출, 규칙기반/사람 검토로 폴백) 로직을 그대로 재사용 — 새 메커니즘 불필요, 스코프만 학원 단위로 좁히면 됨 |
| **Model routing** | `providers.js`가 이미 OpenAI/Gemini/Anthropic 팩토리로 추상화돼 있음(기본 gpt-5-nano) | 이 추상화 위에 **정책 레이어만 추가**: 기본(대부분의 애매한 답안)은 계속 gpt-5-nano로 처리, 반복적으로 낮은 confidence가 나오는 케이스나 Enterprise 요금제에는 더 정밀한 모델(예: Claude Haiku급)로 승격 옵션 제공 — 새 인프라 불필요, 기존 팩토리에 라우팅 규칙만 얹는 것 |
| **GPT nano 사용 영역** | 현재 전량 | 일반 요금제(Free/Starter/Professional)의 기본 채점 — 비용 대비 이미 충분히 검증됨(감사 문서 기준 정확도/비용 균형 양호) |
| **고급 모델 사용 영역** | 없음 | Enterprise 요금제 옵션, 또는 반복 저신뢰(low-confidence) 케이스의 2차 재검증에 한정 — "전부 고급 모델로"가 아니라 "필요한 곳만" |
| **배치 중복 제거** | 미구현(감사에서 지목된 남은 최적화) | 동일 배치 내 여러 학생의 동일 오답을 사전 그룹핑 후 1회만 AI 호출 — 학원 수가 늘수록(동시 접속 학생 수 증가) 이 효과가 커짐, 100학원 규모에서는 이게 오히려 캐시보다 더 큰 절감 레버가 될 수 있음 |

### 8.3 핵심 결론

100학원 규모의 AI 비용 문제는 **"AI를 어떻게 더 싸게 쓰느냐"가 아니라
"학원별로 얼마나 쓰는지 계량하고 그 안에서 자동으로 제어되게 하느냐"**
의 문제다 — 계량 인프라(`ai_usage_daily.academy_id`)만 있으면 나머지
(캐시/모델선택/상한강등)는 전부 지금 이미 있는 메커니즘의 스코프만
좁히는 일이다. 새로 발명할 것이 거의 없다는 것 자체가 이 파이프라인이
애초에 잘 설계됐다는 방증.

---

## 9. Dashboard 전략

### 9.1 Platform Admin Dashboard (신규, Platform Owner 전용)

`0006` §7.1의 경고를 재확인: **`AdminScreen.jsx`에 탭 하나 추가하는
방식이 아니라 완전히 별도의 화면·인증·라우트**로 만든다(권한 경계가
가장 쉽게 무너지는 지점).

| 기능 | 데이터 소스 |
|---|---|
| 전체 학원 수 | `academies` count |
| 활성 사용자 | `students`/`academy_members` 최근 활동 기준 집계 |
| AI 비용 | `ai_usage_daily`(§4·§8, 학원별+전체 합산) |
| 매출 | `subscriptions`/`billing_history`(§7) |
| 사용량 | `academy_usage`(§7) |
| 오류 모니터링 | SaaS TOP10 문서 10번(모니터링/알림)과 연동 |
| 고객 지원 | 학원별 문의 이력(향후 별도 헬프데스크 도구 연동 지점 — 이 설계 범위는 "자리"만 확보) |
| 학원 생명주기 | 온보딩(신규 academy 생성+owner 초대), 정지, 오프보딩(SaaS TOP10 8번) |
| 지원용 임시 접근 | 시간제한 + 자동 감사로그 + 대상 학원에도 접속 사실이 보이는 구조(`0006` §7.2 참고) |

### 9.2 Academy Dashboard (기존 `AdminScreen.jsx` 확장)

| 기능 | 상태 |
|---|---|
| 학생 관리 | **기존 그대로 유지** — 이미 완성돼 있음 |
| 숙제 관리 | **기존 그대로 유지** |
| 학습 리포트 | **기존 그대로 유지**(`fetchDashboardData`/`weeklyReport.js` 공유 구조) |
| 결제 상태 | **신규 탭** — 현재 플랜, 다음 결제일, 이번 주기 사용량(학생수/AI) 대비 상한, 업그레이드 버튼 |

**핵심 원칙 재확인**: 학원 내부 대시보드는 거의 손대지 않는다 — 결제
상태 탭 하나만 추가하는 것이 "현재 만들어진 기능을 최대한 유지"라는
목표에 정확히 부합한다.

---

## 10. 최종 6개월 Architecture Roadmap

_`PAUL_EASY_VOCA_MASTER_PLAN.md`의 90일 로드맵과 겹치는 Month 1은
그것을 그대로 흡수 — 새로 만들지 않는다._

### Month 1 — 현재 앱 안정화

- `v3_11` 보안 패치 실제 배포(`docs/audit/2026-07-26-v3_11-1hour-
  runbook.md` 체크리스트 그대로)
- 게임화 SQL(v2.5~v2.8) 실행 + qa-reviewer/security-reviewer 검수 마무리
- 쓰기 AI 보조 Edge Function 배포 + flag ON
- 무필터 전체조회(성능 Critical) — **구현은 아니지만 스코핑 설계
  착수**(Month 2의 `academy_id` 설계와 자연스럽게 합쳐짐)

### Month 2 — Multi-tenant 준비

- `academies`/`academy_roles`/`academy_members`/`academy_settings`
  스키마 확정(§3)
- 6개 anchor 테이블(§4) `academy_id` 마이그레이션 **설계 확정**(실행은
  실제 상업화 결정 이후) + 기존 학원을 "academy #1"로 백필하는 계획
- `seasons` 로직 재설계(유일하게 단순 컬럼 추가 이상이 필요한 케이스)

### Month 3 — AI Learning Engine

- Memory Engine(SRS, `PAUL_EASY_VOCA_MASTER_PLAN.md` §1) 최소 구현 —
  다학원 확장과 별개로 학습 효과 자체의 핵심 개선
- §8의 AI 모델 라우팅 정책 도입(`providers.js` 위에 정책 레이어)
- `ai_usage_daily.academy_id` 적용 + 학원별 상한 메커니즘 전환

### Month 4 — SaaS Admin

- Platform Admin Dashboard 구현(§9.1)
- 원장/교사 Supabase Auth 전환(`0006` §3.4) — `academy_members` 실사용
  시작
- Academy Dashboard에 결제 상태 탭 추가(§9.2, 아직 결제 미연동이면
  "준비 중" 상태로 노출)

### Month 5 — 결제 시스템

- `plans`/`subscriptions`/`billing_history`/`academy_usage`(§7) 실제
  테이블 도입 + PG 연동(웹훅은 Supabase Edge Function)
- Vercel 유료 플랜 전환 완료(ToS 준수 — 상업화와 동시 필수, 선택 아님)
- 요금제별 게이팅(§7.3) 실동작 확인

### Month 6 — 상용 서비스 준비

- 격리 검증: `academy_id` 필터 하나로 학원 데이터 export/삭제가 실제로
  완전히 되는지 실측(§6.3 defense-in-depth 최종 확인)
- 부하 테스트: 100학원·2,000명 합성 데이터로 무필터 전체조회 이슈가
  실제로 해소됐는지 재현 테스트
- 감사 로그·모니터링 가동(SaaS TOP10 7·10번)
- **소수 파일럿 학원**으로 먼저 검증 후 확대 — "6개월 후 100~500개
  학원이 실제로 쓰고 있다"가 아니라 **"기술적으로 그 규모를 받아낼
  준비가 끝났다"**가 이 로드맵의 정직한 목표(`0006` §8.1과 동일
  전제 — 실제 계약 확보는 별도의 영업 타임라인).

---

## 관련 문서

`docs/agent-decisions/0006-multitenant-saas-architecture.md`(전체 FK
체인·RLS 구현 패턴 상세 원본), `docs/audit/2026-07-26-saas-multi-
tenant-security-top10.md`, `PAUL_EASY_VOCA_CURRENT_STATUS.md`,
`PAUL_EASY_VOCA_MASTER_PLAN.md`, `docs/agent-decisions/0004-multi-
textbook-architecture.md`, `docs/audit/2026-07-24-performance-db.md`,
`docs/audit/2026-07-24-ai-cost.md`, `docs/audit/2026-07-24-deployment-
scale.md`, `DATABASE.md`.
