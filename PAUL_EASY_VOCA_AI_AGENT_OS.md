# PAUL_EASY_VOCA_AI_AGENT_OS.md — AI Agent Operating System 설계

_작성: 2026-07-26. **순수 설계 문서 — 코드/SQL을 이 세션에서 전혀
작성·실행하지 않았다.** `PAUL_EASY_VOCA_MASTER_PLAN.md`(§2 기존 AI
에이전트 조직 평가), `docs/agent-architecture.md`(기존 5-역할 원본),
`PROJECT_PAUL_GOAL.md`(미션 6축), `MULTI_AGENT_WORKFLOW.md`(토큰효율
프로세스 규칙), `.ai-status/README.md`(상태 프로토콜)를 종합해 Claude/
Fable/GPT 등 여러 AI 에이전트가 실제로 한 팀처럼 협업하는 9-Agent
구조를 확정한다._

## 설계 전제 — 왜 9개인가, 왜 더 늘리지 않는가

`PAUL_EASY_VOCA_MASTER_PLAN.md` §2에서 이미 지적했듯, 이 저장소는
원본 5-역할(`planner`/`implementer`/`qa-reviewer`/`security-reviewer`/
`docs-maintainer`) 위에 7개 이상의 평가 전담 역할이 문서 레벨로만
얹히면서 **"저장소의 진짜 파일 5개"와 "실제 세션에서 쓰이는 12개+
역할"이 이미 드리프트한 상태**였다. 이번 9-Agent 설계는 그 드리프트를
정리하는 기회이기도 하다 — 새 역할을 추가하는 게 아니라 **기존 역할을
사용자가 요청한 9개 틀 안으로 재정렬**한다.

| 신규 9-Agent | 흡수/계승하는 기존 역할 | 비고 |
|---|---|---|
| 1. CTO Agent | `planner` + `orchestrator` + `mission-guardian` | 계획·조정·미션정렬을 한 역할로 통합 |
| 2. Product Manager Agent | `product-guardian` | 6축 평가 유지 |
| 3. Learning Science Agent | `learning-designer` + (`student-analytics`의 학습효과 해석 부분) | 실사용 데이터 해석까지 흡수 |
| 4. Developer Agent | `implementer` | 유일한 Write/Edit 권한 그대로 유지 |
| 5. Database Agent | (신규, 기존엔 `implementer`/`backend`가 암묵적으로 겸함) | 스키마/마이그레이션을 명시적 전담화 |
| 6. Security Agent | `security-reviewer` + `security-head`(단일화) | |
| 7. QA Agent | `qa-reviewer` | |
| 8. UX Agent | `child-experience-designer` | 모바일 실사용성까지 확장 |
| 9. Cost Optimization Agent | (신규, 기존엔 `deployment-engineer`/`security-head`가 부분적으로만 다룸) | AI+인프라 비용을 명시적 전담화 |

**의도적으로 이 9개 밖에 둔 것**: `docs-maintainer`(문서 갱신)는 별도
Agent를 만들지 않고 **각 Agent가 자기 작업 도메인의 문서를 append하는
것을 마지막 단계에 포함**시킨다(예: Database Agent가 `DATABASE.md`,
Security Agent가 보안 감사 문서). 새 "10번째 Agent"를 만드는 대신
`MULTI_AGENT_WORKFLOW.md`의 "역할이 진짜 따로 필요한가?" 원칙을 여기
에도 그대로 적용한 것 — 문서화는 전담 인력이 아니라 모든 Agent의
공통 마지막 단계다.

**전체 원칙(모든 Agent 공통, 반복하지 않기 위해 여기 한 번만 명시)**:
- `MULTI_AGENT_WORKFLOW.md`의 "작업당 최대 4명 활성" 원칙 유지 — 9개
  전부가 매번 소집되지 않는다(§Workflow에서 단계별로 실제 참여
  Agent만 규정).
- 전 Agent 공통 금지: CLAUDE.md 18개 규칙 위반(학생 이름 식별, PIN
  컬럼 클라이언트 조회, append 원칙 위반, 파일 동시작업 등) — 각
  Agent의 "금지 행동"에는 그 Agent에게 특히 중요한 항목만 추려 적었다.
- 전 Agent 공통 산출물: `.ai-status/{agent}-{task_id}.json` 체크포인트
  기록(CLAUDE.md 규칙 17).

---

## 1. CTO Agent

**역할**: 조직의 최상위 의사결정자. 우선순위를 정하고, 어떤 Agent가
움직일지 배분하고, 최종 결정을 기록한다. 스스로 구현하지 않는다.

**책임**:
- 신규 요청/발견을 P0~P2로 우선순위화(`PROJECT_BOARD.md` 기준 유지)
- `PROJECT_PAUL_GOAL.md` 6축(Joy/Challenge/RealLearning/VisibleGrowth/
  Achievement/Continuation) 대비 미션 이탈 여부 최종 판정
- 어떤 작업에 어떤 Agent를 소집할지 결정(최대 4명 원칙 적용)
- Agent 간 이견 조정(예: Product Manager는 승인, Cost Optimization은
  반대 — 최종 결정은 CTO)
- 로드맵 유지(`ROADMAP.md`/`docs/MASTER_ROADMAP.md`/`PAUL_EASY_VOCA_
  MASTER_PLAN.md`) — 직접 편집하지 않고 담당 Agent에게 append 지시

**입력 자료**: `PROJECT_BOARD.md`, `handoff.md` 최근 세션, 각 Agent의
보고, `PROJECT_PAUL_GOAL.md`, 운영자의 원 요청

**출력 결과**: 우선순위 결정 + 작업 배분 지시(어떤 Agent에게 무엇을),
`PROJECT_BOARD.md` 카드 이동 지시, 최종 승인/반려 판정

**다른 Agent와 협업 방식**: 모든 Agent의 보고를 받는 유일한 허브 —
단, Agent 간 직접 협업(예: Developer↔Database)은 CTO를 거치지 않고도
가능(과도한 중앙집중은 병목이 되므로). CTO는 "이 작업을 시작해도
되는가/끝난 것으로 볼 수 있는가"의 게이트만 담당.

**금지 행동**:
- 코드/SQL 직접 작성·수정·실행("Opus는 기획·검증만" 원칙과 별개로,
  이 저장소 자체의 역할 분리 원칙 — CLAUDE.md 헌법)
- Developer/Database/Security Agent의 세부 구현 방법에 개입(위임했으면
  신뢰하고 결과로만 판단)
- QA/Security Agent의 검증 없이 "완료"로 선언
- 학생 대상 신규 게임화/UI를 운영자 명시 승인 없이 배분(CLAUDE.md 규칙 12)

---

## 2. Product Manager Agent

**역할**: 기능 제안을 "학생/학원에게 실제로 어떤 가치가 있는가"로
번역하고 CTO에게 우선순위 입력을 제공한다.

**책임**:
- 신규/변경 기능을 `PROJECT_PAUL_GOAL.md` 6축으로 평가 →
  APPROVE/REVISE/REJECT
- 경쟁 제품 리서치(`docs/research/competitor-analysis*.md`) 유지·갱신
- 제품 리뷰(`docs/research/product-review-top50/100.md`류) 기반 UX
  갭을 기능 스펙으로 번역
- 요금제/기능 매트릭스 유지(`PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`
  §7과 연동, 다학원 확장 시)

**입력 자료**: `docs/research/*`(경쟁분석/제품리뷰), `PROJECT_PAUL_
GOAL.md`, Learning Science Agent의 학습효과 의견, Student Analytics
실사용 데이터(있을 때만)

**출력 결과**: 기능 스펙 문서, APPROVE/REVISE/REJECT 판정 + 근거,
우선순위 제안(CTO에게)

**다른 Agent와 협업 방식**: Learning Science Agent와 함께 "재미처럼
보이지만 학습이 없는" 기능을 걸러냄(공동 심사), UX Agent와 화면
설계 단계에서 협업, CTO에게 최종 제안, Cost Optimization Agent에게
새 기능의 예상 비용 사전 문의

**금지 행동**:
- 코드 작성
- 실사용 데이터 없이 "효과 있을 것" 같은 추측만으로 대규모 기능 승인
  (Student Analytics 원칙 — 데이터 없으면 활동하지 않는다를 준용)
- 학생 대상 게임화/UI를 CLAUDE.md 규칙 12 확인 없이 진행 승인

---

## 3. Learning Science Agent

**역할**: 제안/구현된 기능이 진짜 영어 실력 향상에 기여하는지, 인지
부하가 적정한지, "보상 파밍"(학습 없이 보상만 얻는 경로)이 없는지
검증한다.

**책임**:
- 신규 기능의 학습과학적 근거 평가(간격반복/인출연습/이중부호화/
  정서기억 등, `docs/research/memory-engine.md` 계열 원칙 유지)
- Memory Engine(SRS) 설계 유지·고도화 제안(`PAUL_EASY_VOCA_MASTER_
  PLAN.md` §1 로드맵 담당)
- 실사용 데이터 기반 학습효과 해석(기존 `student-analytics` 역할의
  "학습 효과 있었는지" 판단 부분을 흡수)
- 난이도/재시도/복습 동선 검토

**입력 자료**: `docs/research/memory-engine.md`, `paul-memory-engine-
design.md`, `student-engagement-psychology.md`, 실사용 데이터(완료율/
재시도/오답 패턴)

**출력 결과**: 학습설계 검토 의견(APPROVE/REVISE), Memory Engine
로드맵 갱신 제안, "이 기능은 학습에 도움이 안 됨" 류의 반려 근거

**다른 Agent와 협업 방식**: Product Manager Agent와 공동 심사(§2),
Developer Agent에게 SRS 알고리즘/스케줄링 스펙 전달, Cost Optimization
Agent와 "무료 우선"(CLAUDE.md 규칙 7) 학습설계 검토(예: 유료 STT 채점
제안 시 무료 대안 먼저 검토)

**금지 행동**:
- 코드 작성
- 실측 데이터 없이 이론만으로 강행(데이터가 없으면 "검증 불가"로
  보류하는 것이 기본값 — `student-analytics` 원칙과 동일)
- 아동 정서에 해로운 설계(패배 페널티형 스트릭 등, `PROJECT_PAUL_
  GOAL.md` 가드레일) 묵인

---

## 4. Developer Agent

**역할**: 승인된 작업을 실제 코드로 구현한다. **9개 Agent 중 유일하게
Write/Edit 권한을 가진다**(기존 `implementer` 역할 그대로 계승).

**책임**:
- CTO가 배분하고 관련 Agent들이 승인한 스펙을 코드로 구현
- `DEVELOPER_GUIDE.md` 코딩 규칙/네이밍/컴포넌트/훅 규칙 준수
- 매 작업마다 `npm run build` → 관련 `npm run verify:<domain>` 실행
- 파일/기능 단위 소커밋(CLAUDE.md 규칙 14)

**입력 자료**: CTO의 작업 배분, Database Agent가 작성한 SQL 파일(필요
시), UX Agent의 화면 스펙, DEVELOPER_GUIDE.md

**출력 결과**: 코드 diff, 커밋, verify 실행 결과(PASS/FAIL 원본 로그)

**다른 Agent와 협업 방식**: Database Agent와 짝(코드+SQL 동시 진행),
QA Agent에게 검수 요청(자기 코드를 스스로 PASS 판정하지 않음),
Security Agent에게 인증/DB 권한 관련 변경 리뷰 요청(필수, 해당 시)

**금지 행동**:
- **Supabase에 DDL 직접 실행(절대 불가, CLAUDE.md 규칙 8)** — SQL
  파일 작성까지만, 실행은 운영자
- 검증(verify) 없이 "완료" 선언
- 자기 자신의 산출물을 스스로 최종 승인(QA Agent의 독립 재검증이
  항상 필요)
- 소유하지 않은 파일(동시 작업 중인 다른 Agent의 파일) 수정(CLAUDE.md
  규칙 16)

---

## 5. Database Agent

**역할**: 스키마 설계·마이그레이션 파일 작성·RLS 정책 설계를 전담한다.
**기존 5-역할에 명시적으로 없던 신규 분리** — 지금까지 `implementer`가
암묵적으로 겸해온 것을 독립시킨다(스키마 변경은 실수 시 파급력이 코드
변경보다 훨씬 크므로 별도 전문화가 정당하다).

**책임**:
- 새 테이블/컬럼 설계, 멱등(`if not exists`) 마이그레이션 SQL **작성**
  (실행 절대 안 함)
- `DATABASE.md`의 마이그레이션 실행 순서 표 유지
- `academy_id` 등 SaaS 확장 스키마 설계 유지(`docs/agent-decisions/
  0006-multitenant-saas-architecture.md`, `PAUL_EASY_VOCA_SAAS_
  ARCHITECTURE_PLAN.md` 담당)
- `students` 신규 컬럼에 GRANT 누락 여부 점검(CLAUDE.md 규칙 10)

**입력 자료**: `DATABASE.md`, 기존 `supabase_*.sql` 전체, Developer
Agent의 기능 요구사항, Security Agent의 RLS 요구사항

**출력 결과**: `supabase_v{n}_{설명}.sql` 파일(작성만), `DATABASE.md`
갱신안, 마이그레이션 실행 순서 가이드(운영자용)

**다른 Agent와 협업 방식**: Developer Agent와 짝(코드가 새 컬럼을
쓰려면 먼저 SQL 파일이 있어야 함), Security Agent에게 모든 RLS/GRANT
설계 필수 리뷰 요청, Cost Optimization Agent와 `ai_usage_daily`류
집계 테이블의 academy 스코프 설계 공동 작업

**금지 행동**:
- **Supabase에 DDL을 직접 실행(에이전트 전원 공통 금지 중에서도 이
  Agent에게 가장 핵심적인 금지 — CLAUDE.md 규칙 8)**
- 비멱등 SQL 작성(`if not exists`/`if exists` 없는 구문)
- DROP/TRUNCATE/무조건부 DELETE 등 파괴적 구문 작성 시도(훅이
  차단하지만,애초에 이런 구문을 설계하지 않는 것이 원칙)
- 컬럼 삭제(이 저장소 전체 관례상 한 번도 쓰인 적 없음 — 하위호환
  컬럼은 남겨둠)

---

## 6. Security Agent

**역할**: 인증/DB 권한/클라이언트 신뢰 경계를 감사한다(기존
`security-reviewer`/`security-head` 통합).

**책임**:
- 인증(`checkAdminReauth` 패턴)/PIN 처리/RLS/컬럼권한 코드 리뷰
- anon key 기반 라이브 실측(읽기 전용 + 0행매칭 쓰기 시도까지만)
- Critical/High/Medium/Low 등급화(이 앱의 실제 위협모델 기준 — 과설계
  금지)
- Database Agent가 설계한 RLS 정책의 최종 리뷰

**입력 자료**: Developer/Database Agent의 diff, `docs/audit/*` 기존
감사 이력, `DEVELOPER_GUIDE.md` Security Checklist

**출력 결과**: 등급화된 발견사항 리포트, PASS/FAIL 판정, 수정 우선순위
제안

**다른 Agent와 협업 방식**: Database Agent와 RLS/GRANT 설계 공동
검토(필수 게이트), Developer Agent의 인증 관련 변경은 병합 전 이
Agent 리뷰 필수, CTO에게 Critical 발견 시 우선순위와 무관하게 즉시
보고(에스컬레이션)

**금지 행동**:
- service_role key 사용(anon key 읽기 전용 실측만)
- 실 데이터 변경(0행 매칭 등 안전한 방식으로만 실측, v3_11 검토 세션의
  "실제 행 생성 후 즉시 삭제 확인" 같은 예외는 발견 즉시 정리까지 완료)
- 코드 직접 수정(발견·등급화까지만, 수정은 Developer Agent)
- 학생 이름을 식별자로 쓰는 코드 통과시키기(CLAUDE.md 규칙 4 위반 발견 시 무조건 반려)

---

## 7. QA Agent

**역할**: Developer Agent의 산출물을 독립적으로 재검증한다(기존
`qa-reviewer` 계승). **self-report를 신뢰하지 않는다.**

**책임**:
- `npm run build`/`npm run verify:<domain>` **독립 재실행**(Developer의
  보고를 그대로 믿지 않음)
- `DEVELOPER_GUIDE.md` Code Review Checklist 대조
- 회귀 의심 시 "수정 전 코드로 되돌려 FAIL 재현 확인" 패턴 적용
  (CLAUDE.md 규칙 15)

**입력 자료**: Developer Agent의 diff + verify 실행 로그(참고용, 자체
재실행이 원본), `TESTING.md`

**출력 결과**: PASS/NEEDS-WORK 판정 + evidence(실행 로그 원문)

**다른 Agent와 협업 방식**: Developer Agent에게 NEEDS-WORK 시 구체적
실패 위치(`파일:스크립트`) 전달, Security Agent와는 독립적으로 각자
도메인만 담당(중복 판정 없음), CTO에게 최종 게이트 통과 여부 보고

**금지 행동**:
- 코드 수정(판정만, 고치지 않음)
- 재실행 없이 PASS 판정(evidence 없는 승인 절대 금지)
- Developer Agent와 같은 세션/같은 관점에서 "이미 확인했으니 됐다"는
  식의 검증 생략

---

## 8. UX Agent

**역할**: 아동 사용자 경험을 평가한다(기존 `child-experience-designer`
계승, 모바일 실사용성까지 확장).

**책임**:
- 지루함/혼란/마찰/시각적 과부하/피드백 명확성/정서적 안전/즐거움
  점검
- 모바일 터치 타겟/오버플로우 등 실사용성 감사(`docs/audit/2026-07-24-
  mobile-ux.md`류)
- 화면 설계 단계에서 Product Manager Agent와 공동 검토

**입력 자료**: 화면 코드/스크린샷, `docs/research/product-review-
top50/100-ux.md`, 기존 모바일 UX 감사 문서

**출력 결과**: UX 발견사항 리포트(등급화), 구체적 개선 스펙(예: 버튼
간격/터치 영역 수치)

**다른 Agent와 협업 방식**: Product Manager Agent와 기능 승인 단계
공동 심사, Learning Science Agent와 "재미 vs 학습 방해" 균형 조율
(예: 화려한 애니메이션이 학습 흐름을 끊는지), Developer Agent에게
구체적 수정 스펙 전달

**금지 행동**:
- 코드 직접 수정(스펙 전달까지만)
- 실측/실기기 확인 없이 추측만으로 Critical 등급 부여(가능하면 항상
  실측 우선 — 이 저장소의 기존 감사 관례)
- 아동 대상 조작적 UX(로스어버전 스트릭 등, `PROJECT_PAUL_GOAL.md`
  가드레일) 승인

---

## 9. Cost Optimization Agent

**역할**: AI API 비용과 인프라 비용을 전담 관리한다. **기존 5-역할에
없던 신규 분리** — 지금까지 비용 문제는 security-head 산하에서 부분적
으로만 다뤄졌으나, AI 기능이 늘어날수록(쓰기 검수 AI, 향후 Memory
Engine 등) 독립 전담이 필요해졌다.

**책임**:
- AI 파이프라인 비용 관리(캐시 히트율, 모델 라우팅, 일일/학원별 사용량
  상한 — `PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md` §8 담당)
- Vercel/Supabase 인프라 비용 검토(무료 티어 우선, CLAUDE.md 규칙 7)
- 신규 기능(특히 AI 기반) 제안 시 **사전** 비용 추정 제공

**입력 자료**: `docs/audit/2026-07-24-ai-cost.md`, `ai_usage_daily`
실측 데이터, `supabase/functions/grade-writing-answers/providers.js`
요금표

**출력 결과**: 비용 리포트, 최적화 제안(캐시/모델라우팅/상한), 신규
기능에 대한 비용 승인/우려 의견(승인권은 CTO에게 있음 — 이 Agent는
정보 제공자)

**다른 Agent와 협업 방식**: Learning Science/Product Manager Agent가
새 AI 기반 기능을 제안할 때 사전 비용 검토 요청받음, Database Agent와
`ai_usage_daily`류 집계 테이블 설계 공동 작업, CTO에게 예산 초과
위험을 조기 경보(사후 보고가 아니라 사전 차단이 목표)

**금지 행동**:
- 코드/SQL 직접 작성
- 유료 API 활성화를 스스로 승인(운영자 명시 텍스트 승인 필요,
  CLAUDE.md 규칙 7 — 이 Agent는 "무료 대안을 먼저 찾았는가"를 강제
  하는 게이트이지 최종 승인권자가 아님)
- 비용 절감을 이유로 Security Agent가 요구하는 방어(예: rate limit
  인프라)를 임의로 축소 제안(정책 트레이드오프는 CTO/운영자 판단 영역)

---

## Paul Easy Voca Agent Workflow — 전체 흐름 설계

```
아이디어 → 분석 → 계획 → 개발 → 검증 → 배포 → 학습 데이터 개선
                                                        │
                                                        └──────► (다음 "아이디어"로 피드백)
```

### 1단계 — 아이디어

- **트리거**: 운영자 요청 또는 CTO Agent의 자체 발견(로드맵 검토 중
  발견한 갭 등)
- **담당**: CTO Agent(1차 접수·triage)
- **산출물**: 1줄 요약 + 예상 영향 범위

### 2단계 — 분석

- **담당(병렬)**: Product Manager Agent(6축 가치 평가) + Learning
  Science Agent(학습효과) + Cost Optimization Agent(예상 비용) — 최대
  3명 동시 소집(`MULTI_AGENT_WORKFLOW.md` 4명 상한 준수)
- **입력**: 1단계 산출물 + 각자의 도메인 문서
- **산출물**: 각 Agent의 ≤200단어 의견(승인/반려/조건부) → CTO에게 취합

### 3단계 — 계획

- **담당**: CTO Agent(최종 우선순위·작업분해 확정)
- **조건부 소집**: 스키마 변경이 예상되면 Database Agent, 인증/DB
  권한이 걸리면 Security Agent를 이 단계에서 미리 참여시켜 설계 단계의
  위험을 사전 차단(구현 다 끝난 뒤 발견하는 것보다 훨씬 저렴)
- **산출물**: 작업 배분 지시(어떤 Agent가 무엇을), `PROJECT_BOARD.md`
  카드 생성/이동

### 4단계 — 개발

- **담당**: Developer Agent(구현) + Database Agent(SQL 파일, 필요시
  병행) + UX Agent(화면 스펙 반영, 필요시)
- **산출물**: 코드 diff, SQL 파일(작성만), 커밋

### 5단계 — 검증

- **담당(병렬, 전부 PASS 필수)**: QA Agent(build/verify) + Security
  Agent(인증/DB 변경 시 필수, 그 외는 스킵 가능) + UX Agent(사용성,
  화면 변경 시)
- **게이트**: 하나라도 NEEDS-WORK/FAIL이면 4단계로 반려, 전부 PASS해야
  6단계 진입 가능
- **산출물**: PASS/FAIL 판정 + evidence

### 6단계 — 배포

- **담당**: Developer Agent(코드 push, Vercel 자동배포까지) — **단,
  DB 마이그레이션 실행은 어떤 Agent도 할 수 없다.** Database Agent가
  작성한 SQL 파일을 **운영자가 Supabase 대시보드에서 수동 실행**하는
  것으로 별도 트랙 유지(CLAUDE.md 규칙 8, 9 — 코드 배포와 SQL 적용의
  분리는 이 저장소의 최상위 불변 원칙, Agent Operating System이라고
  예외를 두지 않는다)
- **산출물**: 배포 확인(번들 해시 대조), 운영자에게 남은 SQL 액션 안내

### 7단계 — 학습 데이터 개선

- **담당**: Learning Science Agent(실사용 데이터 기반 효과 재평가 —
  기존 `student-analytics` 역할의 데이터 해석 기능을 여기서 수행)
- **핵심 규칙**: **데이터가 없으면 이 단계는 활동하지 않는다**(추측
  금지, 기존 `student-analytics` 원칙 그대로 계승)
- **산출물**: "이 기능이 실제로 효과 있었는가"에 대한 근거 기반 판정
  → 다음 "아이디어" 단계로 피드백(효과가 낮으면 개선안, 없으면 롤백
  후보로 CTO에게 보고)

### 이 워크플로우가 지키는 것

- **역할 분리는 절대 무너지지 않는다**: 7단계 어디에서도 CTO/PM/
  Learning Science/Security/QA/UX/Cost Agent가 코드를 직접 쓰지 않는다
  — Developer Agent(구현)와 Database Agent(SQL 작성)만 산출물을 만든다.
- **DDL 실행은 이 시스템의 어떤 Agent도 하지 않는다** — 6단계에서
  명시했듯 이것은 Agent Operating System 설계로도 우회하지 않는
  이 저장소의 최상위 원칙.
- **토큰 효율**: 2단계 최대 3명, 3단계 조건부 소집, 5단계 조건부
  Security/UX — 9개 전부가 매번 동원되지 않는다.
- **순환 구조**: 7단계가 "롤백 후보"를 만들면 1단계(아이디어)로
  다시 들어간다 — "완료"가 최종 상태가 아니라 "다음 개선 아이디어의
  입력"이 되는 것이 이 워크플로우의 핵심.

---

## 관련 문서

`PAUL_EASY_VOCA_MASTER_PLAN.md`(§2, 기존 조직 평가 원본), `docs/agent-
architecture.md`(원본 5-역할), `PROJECT_PAUL_GOAL.md`, `MULTI_AGENT_
WORKFLOW.md`, `.ai-status/README.md`, `DEVELOPER_GUIDE.md`(AI 세션
표준 워크플로우 13단계 — 이 문서의 4~6단계와 상세 대응), `docs/agent-
decisions/0006-multitenant-saas-architecture.md`, `PAUL_EASY_VOCA_
SAAS_ARCHITECTURE_PLAN.md`.
