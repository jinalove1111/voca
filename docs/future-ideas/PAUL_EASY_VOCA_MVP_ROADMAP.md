# PAUL_EASY_VOCA_MVP_ROADMAP.md — 판매 가능 서비스로 가는 단계별 계획

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL/DB를 이 세션에서 전혀
변경하지 않았다.** 이 대화에서 작성된 전체 문서(`PAUL_EASY_VOCA_
CURRENT_STATUS.md`/`MASTER_PLAN.md`/`SAAS_ARCHITECTURE_PLAN.md`/
`AI_AGENT_OS.md`/`AI_DEVELOPMENT_PROTOCOL.md`/`AI_LEARNING_ENGINE_
PLAN.md`/`LEARNING_ANALYTICS_PLAN.md`/`BUSINESS_MODEL_PLAN.md`)를
하나의 실행 순서로 압축한 최종 로드맵이다. 각 항목이 어느 문서의
어느 섹션에서 왔는지 괄호로 표시했다 — 이 문서가 새로 발명한 내용은
"단계 구분과 각 단계의 스코프 결정" 자체다._

**핵심 원칙**: 각 단계는 **이전 단계가 실제로 끝나야 다음 단계로
넘어간다.** 기술 준비가 영업보다 앞서가야 한다(`SAAS_ARCHITECTURE_
PLAN.md` §8.1 원칙) — Phase 2를 시작하기 전에 Phase 1의 "절대 필요한
버그 수정"이 끝나 있지 않으면, 외부 학원 데이터가 섞이거나 유실되는
사고로 이어질 수 있다.

---

## Phase 1 — 현재 학원 내부 사용 (지금, 1개 학원·111명)

**목표**: 지금 있는 것을 안정화한다. 신규 기능 없음.

### 필수 기능
- 핵심 학습 루프(발음/예문/퀴즈/쓰기, 이미 완료·운영 중)
- 이미 코드 완료·배포 대기 중인 것들의 **실제 배포**(신규 개발이
  아니라 회수): 쓰기 AI 보조 v1.3, 게임화 SQL 실행(`CURRENT_STATUS.md`
  §B/D)

### 절대 필요한 버그 수정
| 항목 | 근거 | 순서 |
|---|---|---|
| **커리큘럼 무인증 쓰기 취약점(v3_11)** | `CURRENT_STATUS.md` E-1, Critical | **최우선 — Phase 2 진입 전 무조건 완료**, `docs/audit/2026-07-26-v3_11-1hour-runbook.md` 체크리스트 그대로 |
| GitHub Pages 그림자 배포 완전 차단 | 운영자 Settings 액션 1건 남음 | Phase 1 내 완료 |
| 관리자 PIN 강도 검증 | `CURRENT_STATUS.md` E-4, 저비용 | Phase 1 내 완료(외부 학원 받기 전 최소 위생) |

### 필요한 운영 시스템
- 기존 문서 체계(`handoff.md`/`PROJECT_BOARD.md`/`.ai-status/`) 그대로
  유지 — 새로 만들 것 없음
- Vercel/Supabase 무료 내장 알림 활성화(비용 0, `SAAS_ARCHITECTURE_
  PLAN.md` §9.1 최소 모니터링)

### 필요하지 않은 기능 (아직)
- `academy_id`/멀티테넌트 스키마(학원이 1곳이라 의미 없음)
- 결제 시스템
- Teacher 역할(원장 1인 운영에 다중 관리자 불필요)
- Platform Admin Dashboard
- Memory Engine(SRS) 고도화 — 있으면 좋지만 **"판매 가능"의 전제조건은
  아니다**, Phase 2 이후 병행 가능

---

## Phase 2 — 첫 외부 학원 5곳

**목표**: "학원 1곳 전용 앱"에서 "여러 학원이 안전하게 격리되는 앱"
으로의 **가장 위험한 전환점**. 5곳이라는 작은 숫자여도 데이터 격리가
안 되면 사고 확률은 1곳일 때와 질적으로 다르다.

### 필수 기능
- `academy_id` 최소 구현 — `classes`/`students`/`textbooks`/`seasons`/
  `ai_usage_daily`/`product_events` 6개 anchor 테이블(`SAAS_
  ARCHITECTURE_PLAN.md` §4, 이미 6개뿐이라는 것까지 확정됨)
- **전역 단일 `ADMIN_PIN` 폐지** — 학원별 관리자 인증(`SAAS_
  ARCHITECTURE_PLAN.md` §3.4) — 5곳이 같은 비밀번호를 공유하는 순간
  치명적
- Vercel **유료 플랜 전환** — 외부 판매 자체가 상업적 이용이므로 이
  시점부터 Hobby ToS 위반(`BUSINESS_MODEL_PLAN.md` §4.2, `docs/audit/
  2026-07-24-deployment-scale.md`)
- `academies` 테이블(플랜/상태 추적용, 실제 자동결제 연동은 아직 아님
  — §Phase 3)

### 절대 필요한 버그 수정
- Phase 1의 v3_11이 여기서도 여전히 최우선 전제조건(순서상 이미
  끝나 있어야 함)
- **데이터 격리 실측 검증** — `academy_id` 필터 하나로 한 학원의
  데이터가 다른 학원과 완전히 분리되는지 실제로 테스트(`SAAS_
  ARCHITECTURE_PLAN.md` §6.3 defense-in-depth 검증)

### 필요한 운영 시스템
- 5개 학원용 최소 CS 채널(이메일/카톡 정도로 충분, 전담 인력 불필요)
- 학원별 데이터 export/삭제 절차 **최소 버전**(수동으로라도 — 계약
  해지 문의가 나올 수 있는 규모, `SAAS TOP10` 8번)
- 감사 로그 최소 버전(누가 무엇을 바꿨는지 — 5곳이면 아직 사람이
  직접 로그를 봐도 되는 규모)

### 필요하지 않은 기능 (아직)
- 완전한 Platform Admin Dashboard(5곳은 스프레드시트로도 관리 가능)
- 자동 결제 시스템(계좌이체/수동 인보이스로 충분)
- Teacher 역할 세분화(이 규모 학원은 대부분 원장 1인일 가능성 높음)
- Enterprise 물리적 격리 옵션(대형 고객 없음)
- 학습 예측 모델(§`LEARNING_ANALYTICS_PLAN.md` §6·§7) — 5곳 데이터로는
  통계적 의미가 없음, 아직 규칙기반 단계도 이르다

---

## Phase 3 — 20개 학원

**목표**: 수동 운영이 한계에 도달하는 지점 — 자동화 착수.

### 필수 기능
- **실제 결제 시스템**(`subscriptions`/`plans`/`billing_history`,
  `SAAS_ARCHITECTURE_PLAN.md` §7 + `BUSINESS_MODEL_PLAN.md` §2 요금제
  실적용) — 20곳을 수동 인보이스로 관리하는 것은 이 지점부터 비효율
- **Teacher 역할 실제 구현**(`SAAS_ARCHITECTURE_PLAN.md` §3) — 소형~
  중형 학원이 섞이기 시작하는 규모
- **학원별 AI 사용량 상한 실적용**(`ai_usage_daily.academy_id` 스코프,
  `AI_LEARNING_ENGINE_PLAN.md` §8) — 한 학원이 전체 예산을 소진할
  리스크가 현실화되는 규모
- Academy Owner Dashboard(결제상태/사용량 탭, `SAAS_ARCHITECTURE_
  PLAN.md` §9.2)
- **위험 학생 예측 1단계(규칙기반)** 도입 검토 — `LEARNING_ANALYTICS_
  PLAN.md`가 명시한 "1단계는 지금도 착수 가능"(if-then 규칙, ML 아님)
  단계, 20개 학원이면 규칙의 유효성을 여러 학원에 걸쳐 확인 가능

### 절대 필요한 버그 수정
- **무필터 전체조회(E-2, Critical)** — `CURRENT_STATUS.md`가 "다학원
  확장 순간 확정적으로 터진다"고 명시한 바로 그 지점, 20개 학원부터
  체감 시작
- AI 배치 채점 N+1(E-3) — 학원 수 증가로 동시 요청이 늘어나는 시점에
  해결 권장

### 필요한 운영 시스템
- 셀프서비스 온보딩 일부 자동화(신규 학원 가입~초기 설정 사람 개입
  최소화, `BUSINESS_MODEL_PLAN.md` §4.3 "진짜 원가는 사람" 결론과
  직결)
- 최소 모니터링/알림 체계 완성(`SAAS TOP10` 10번)
- 감사 로그 완성(1단계 위험 예측이 사람 검토 없이 자동 통보되지
  않도록 보장하는 절차 포함, `LEARNING_ANALYTICS_PLAN.md` §"예측 결과
  사용 원칙")

### 필요하지 않은 기능 (아직)
- Enterprise 물리적 격리(아직 그 규모 고객 없음)
- 통계 기반(2단계) 예측 모델(데이터량 아직 부족, 규칙기반으로 충분)
- 신규 과목/해외 확장

---

## Phase 4 — 100개 학원

**목표**: `SAAS_ARCHITECTURE_PLAN.md` §10이 정의한 "기술적으로 이
규모를 받아낼 준비"의 최종 완성.

### 필수 기능
- **완전한 Platform Admin Dashboard**(전체 학원수/MRR/AI비용/오류
  모니터링/고객지원, `SAAS_ARCHITECTURE_PLAN.md` §9.1)
- **Enterprise 티어 실제 제공**(물리적 격리 옵션, `SAAS_ARCHITECTURE_
  PLAN.md` §6.2) — 이 규모에서 처음으로 대형/프랜차이즈 고객이 현실적
- 학원 간 익명 집계(`LEARNING_ANALYTICS_PLAN.md` §5 Platform Admin
  Dashboard, 커리큘럼/교재 품질 개선 인사이트)
- 부하 테스트 통과(100학원·수천 명 합성 데이터로 E-2 해소 재검증,
  `SAAS_ARCHITECTURE_PLAN.md` §10.3 Month6)

### 절대 필요한 버그 수정
- 이 시점까지 Phase 1~3의 모든 항목이 누적 해소돼 있어야 함(새 항목
  이라기보다 "빠짐없이 됐는지 재확인"이 핵심)
- DB 커넥션/스케일 한계 재점검(Supabase 플랜 단계적 상향 검토,
  `BUSINESS_MODEL_PLAN.md` §4.2)

### 필요한 운영 시스템
- 전담 CS 인력 또는 명확한 셀프서비스 구조 중 하나로 확정(§Phase3의
  "진짜 원가는 사람" 결론을 여기서 실제 조직 결정으로 전환)
- Enterprise 대상 SLA 체계
- 정기 부하테스트/모니터링 루틴(1회성이 아니라 반복 가능한 절차로)

### 필요하지 않은 기능 (이 규모에서도 아직 이르다)
- 통계모델을 넘어서는 본격 ML(3단계, `LEARNING_ANALYTICS_PLAN.md`가
  "정말 필요해질 때만, 100학원+·수년치 데이터"로 이미 조건을 걸어둠 —
  100개 학원에 막 도달한 시점은 "수년치 데이터"가 아직 아님)
- 신규 과목 확장(영어 외) — 가능해 보이는 시점이지만 `PROJECT_PAUL_
  GOAL.md` 미션 재심사가 선행돼야 함(아래 TOP10 7번과 연결)

---

## 지금 만들면 안 되는 기능 TOP 10

Phase 1~4 어디에도 넣지 않은, **훨씬 나중까지도 신중해야 하거나
이 앱의 원칙상 아예 안 만드는 게 맞는** 항목들 — 전부 이 대화의
문서들이 이미 실측/원칙으로 근거를 남긴 것들이다.

1. **확률형 보상(가챠) / 랜덤 뽑기형 시스템** — 이미 명시적으로
   금지(`docs/agent-decisions`, `MASTER_ROADMAP.md` §3 절대금지 목록).
2. **학생 간 공개 순위·리더보드** — `PROJECT_PAUL_GOAL.md`의 자기비교
   원칙과 정면 배치, House/Word King도 이미 "등수 비노출"로 설계됨.
3. **로스어버전 스트릭 페널티**(연속 학습이 끊기면 불이익) — 아동
   정서 안전 가드레일 위반.
4. **범용 UGC 플래시카드 공유 플랫폼화** — Tinycards의 2020년 셧다운이
   이미 이 방향의 실패 선례로 문서화됨(`docs/research/competitor-
   analysis.md`).
5. **학습과 무관한 코스메틱 상점 확장** — Reading Eggs/Raz-Kids 사례
   (아이들이 장식 파밍에 몰두, 학습 이탈)가 이미 반례로 확인됨.
6. **아동 대상 자유 대화형 AI 챗봇** — `AI_LEARNING_ENGINE_PLAN.md`
   §6.3이 이미 명시적으로 배제(정형화된 슬롯/좁은 태스크만 허용).
7. **신규 과목 확장(수학 등)** — Phase 4까지도 "가능해 보이지만 미션
   재심사 필요"로 유보. 지금(Phase 1~3)은 명백히 시기상조.
8. **딥러닝/본격 ML 예측 모델** — `LEARNING_ANALYTICS_PLAN.md`가 데이터
   규모상 지금은 과적합/거짓확신만 만든다고 이미 결론냄, 규칙기반부터.
9. **학원별 물리적 격리(독립 Supabase 프로젝트)를 기본값으로 채택** —
   `SAAS_ARCHITECTURE_PLAN.md` §6.2가 이미 "Enterprise 한정 예외"로만
   설계, 기본 티어에 적용하면 100배 운영비용 증가.
10. **해외/다국어 확장** — `BUSINESS_MODEL_PLAN.md` §8이 "가능성으로만
    언급, 지금 단정 안 함"으로 유보한 항목 — Phase 4 완료 전에는 논의
    자체가 이르다.

---

## 관련 문서

이 로드맵이 압축한 8개 원본 문서: `PAUL_EASY_VOCA_CURRENT_STATUS.md`,
`PAUL_EASY_VOCA_MASTER_PLAN.md`, `docs/agent-decisions/0006-
multitenant-saas-architecture.md`(구 SAAS_ARCHITECTURE_PLAN.md는
2026-07-31 병합됨), `PAUL_EASY_VOCA_AI_LEARNING_ENGINE_PLAN.md`,
`PAUL_EASY_VOCA_LEARNING_ANALYTICS_PLAN.md`, `PAUL_EASY_VOCA_BUSINESS_
MODEL_PLAN.md`. (구 `PAUL_EASY_VOCA_AI_AGENT_OS.md`/`PAUL_EASY_VOCA_AI_
DEVELOPMENT_PROTOCOL.md`는 삭제됨 — CLAUDE.md 헌법/DEVELOPER_GUIDE.md
워크플로우로 대체, 실행 시 절차는 그쪽을 따른다)
