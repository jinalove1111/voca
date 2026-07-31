# PAUL_EASY_VOCA_MASTER_PLAN.md — 다음 단계 전략 (CTO 종합 실행계획)

_작성: 2026-07-25. `PAUL_EASY_VOCA_CURRENT_STATUS.md`(현황 진단)의 후속
전략 문서. 마찬가지로 순수 조사 산출물(코드/SQL/DB/배포 무변경) —
`docs/MASTER_ROADMAP.md`(기존 Priority 1-28 전체표) 및 `docs/research/*`
(메모리 엔진 2건, 학생 몰입 심리학, 경쟁분석 2부)를 재조사 없이 종합·
재구성했다. 이 문서와 `docs/MASTER_ROADMAP.md`가 충돌하면 후자가 더
상세한 근거(6개 감사 교차검증)를 가지므로 우선한다 — 이 문서는 그것을
CTO 실행계획 포맷(Memory Engine/에이전트 조직/90일 로드맵/경영보고)으로
재배치한 것이다._

---

## 0. 경영 요약 (Executive Summary)

### 현재 상황

Paul Easy Voca는 111명 실사용 학생 기준으로 **production-ready 판정을
이미 받은 성숙한 제품**이다(핵심 학습 루프/게임화 대부분/Attachment
시스템/다중교재 전부 라이브 또는 코드완료). 문제는 신기능 부재가 아니라
**"이미 완성된 코드가 운영자의 SQL 실행/배포 액션을 기다리며 쌓여있는
상태"**다 — Paul Rank류 게임화 5종, 쓰기 AI 보조, 커리큘럼 보안수정까지
전부 이 패턴.

### 가장 큰 문제 (우선순위순)

1. **커리큘럼 전체가 인증 없이 쓰기 가능한 Critical 보안 취약점이
   여전히 라이브에 열려 있다** — 수정 코드는 이미 존재, 배포만 안 됨.
2. **다학원 확장을 시도하는 순간 4개 벽에 동시에 부딪힌다**: DB 무필터
   전체조회, Vercel 함수 12/12 한도, 전역 단일 관리자 PIN, Vercel Hobby
   ToS(비상업 한정) — 지금 규모에선 안 보이지만 학원 수가 늘면 확정적으로
   드러남.
3. **이미 설계된 좋은 결정들이 배포 지연 때문에 가치를 못 내고 있다** —
   특히 쓰기 AI 보조(투자 대비 이미 최적화 완료)와 Memory Engine 전
   단계 연구(6-box Leitner 설계 완료, 구현 0%).

### Top 우선순위 (Top 3, 상세는 3장 90일 로드맵)

1. 커리큘럼 보안수정 배포(5단계 순서 엄수) — **1주 이내**
2. Memory Engine 최소 구현(6-box Leitner + Garden 연동, 신규 화면 0개)
   — **1개월 이내, 최고 ROI 학습효과 개선**
3. 쓰기 AI 보조 실운영화(Edge Function 배포 + SQL 2건 + flag ON) —
   **2주 이내, 이미 완성된 자산 회수**

### 권장 다음 액션

- 이번 주: 운영자가 `docs/MASTER_ROADMAP.md` §4의 5단계 순서대로
  보안수정 배포. GitHub Pages Settings→Source→None 전환.
- 2주 내: 쓰기 AI 보조 SQL 2건 + Edge Function 배포 + 시크릿 설정 +
  flag ON.
- 1개월 내: Memory Engine(SRS) 최소 구현 — 아래 1장 상세.
- **다학원 확장은 사업적 결정이 먼저 나야 착수** — 기술 설계를 지금
  미리 할 필요는 없지만, 이 결정이 코드 재설계를 요구한다는 것을
  경영진이 인지하고 있어야 함(4개 벽이 동시에 열림).

### 아키텍처 개선 (우선순위순)

1. 무필터 전체조회 → `class_id` 스코핑(다학원 결정 시에만 착수, 15+
   호출부 대규모 설계 세션 필요).
2. AI 배치 채점 N+1 → batch select/upsert(저위험, 언제든 착수 가능).
3. Vercel 함수 신규 추가 금지, 기존 dispatch 패턴 계속 유지.
4. 핵심 4테이블 DDL 백필(재해복구 대비, 운영자 1회성 작업).

### AI 에이전트 로드맵

기존 5-역할 체계(planner/implementer/qa-reviewer/security-reviewer/
docs-maintainer)는 이미 잘 설계돼 있고 그 위에 새로 얹힌 7개 이상의
평가 전담 역할은 통합 여지가 크다 — 상세는 2장.

### 제품 성장 전략

경쟁 리서치(`docs/research/competitor-analysis*.md`)가 이미 결론 낸
"절대 하지 말 것"(UGC 플래시카드 플랫폼화, 가챠/확률형 보상, 코스메틱
상점 확장)을 그대로 유지하고, 신규 투자는 **재방문 트리거 부재**(푸시/
위젯 없음)와 **동기적 팀 경쟁 부재**(House/Word King이 전부 비동기
집계)라는 두 개의 명확한 갭에 집중하는 것이 리서치 근거상 타당하다.
상업화(다학원 SaaS화)는 별도 트랙 — Vercel ToS/인프라 격리 문제부터
해결한 뒤에만 검토.

---

## 1. Memory Engine 설계 (진짜 장기기억을 만드는 단어 학습 시스템)

### 원칙: 이미 연구·설계 완료, 구현률 0%

`docs/research/memory-engine.md`(2026-07-23)와
`docs/research/paul-memory-engine-design.md`(2026-07-24)가 이미
이 설계를 끝냈다 — 이 문서는 재설계하지 않고 그 결론을 채택한다.

- **알고리즘**: SM-2/FSRS/Duolingo HLR 등을 이 프로젝트 제약(무료 API만,
  최소 의존성, 학생당 리뷰 수가 개인화 ML에 필요한 200~1,000회에 못
  미침, 아동 정서에 가혹한 패널티 부적합)과 대조해 **6-box Leitner
  시스템**을 채택 결정함(FSRS/HLR은 명시적으로 기각 — 서버 ML 인프라
  비용 + 잦은 실수 학생에게 더 가혹해지는 부작용).
- 오답은 박스를 완전히 리셋하지 않고 **1단계만 강등**(아동 정서 보호).

### 플로우 (요청하신 6단계 그대로, 설계 문서 기준)

```
신규 단어 등록
   ↓
첫 학습(발음+예문, 기존 WordDetail.jsx 그대로)
   ↓
연습(퀴즈+쓰기, 기존 그대로) — [Active Recall/생성 효과: 이미 타이핑
   쓰기시험이 이 역할을 하고 있음 — 별도 구현 불필요]
   ↓
오답 감지(기존 word_status + writing_answer_statistics) — 신규 아님
   ↓
【신규】복습 스케줄 — word_review_schedule(box_level 0~5, next_review_date)
   ↓
숙달(mastered) — 기존 word_status.status='mastered'와 연동
```

### 필요 데이터 (신규 최소, 기존 재사용 최대)

| 테이블/컬럼 | 목적 | 상태 |
|---|---|---|
| `word_review_schedule`(신규) — `student_id`/`word_id`/`box_level`(0-5)/`next_review_date`/`correct_streak`/`last_result` | SRS 스케줄 원천 | 설계 완료, **미구현** |
| `student_progress.review_data`(jsonb, 기존 컬럼) | 현재 미사용(dead) — 신규 테이블 대신 이 컬럼 재사용 여지 검토 필요 | 기존 존재, 미사용 |
| `words.image_emoji`(신규, 선택) | Dual Coding(이미지 없이 이모지로 저비용 구현) | 설계 제안, **미구현** |
| `word_student_notes`(신규, 선택) | 학생 자신의 연상법(elaborative encoding) | 설계 제안, **미구현** |

### 인지심리학 원칙 대조 — 이미 구현된 것 vs 진짜 공백

`paul-memory-engine-design.md`의 핵심 발견: **원칙 대부분이 이미 다른
이름으로 구현돼 있다.**

| 원칙 | 이미 구현? | 근거 |
|---|---|---|
| Retrieval Practice(인출 연습) | ✅ | 타이핑 쓰기시험 자체가 생성효과 |
| Emotional Memory(정서적 기억) | ✅ | "폴의 기억" Attachment 시스템 |
| Elaborative Encoding(정교화) | 부분 | `memoryTip` 필드 존재, 활용도 낮음 |
| Gamification | ✅ | House/Ticket/Season 전부 |
| **Spaced Repetition(간격 반복)** | ❌ | **진짜 공백 — 이 문서의 핵심 제안** |
| **Dual Coding(이중부호화, 이미지)** | ❌ | `words` 테이블에 이미지 컬럼 자체가 없음 |
| **Interleaving(교차 연습)** | ❌ | 오늘 배정 단어는 항상 순차적, 신규/복습 혼합 없음 |

### 최고 ROI 제안 (연구 문서 §6, 그대로 채택 권장)

**기존 Garden(텃밭) 시각화의 입력을 "학습 여부(y/n)"에서 "Leitner
box_level"로 바꾸기만 하면 된다 — 신규 화면 0개.** SRS + 게임화 +
정서적 기억이 한 번의 변경으로 연결되는 유일한 지점. `word_review_
schedule`이 먼저 있어야 가능(선행조건).

### 진짜 이상적 시스템이 되려면 남은 것 (연구가 명시한 갭)

1. Interleaving 구현 — 순수 함수(`orderForInterleaving`) 하나로 가능,
   엔지니어링 비용 최저.
2. Dual coding — 이모지 컬럼(이미지 URL/AI 생성 이미지 대비 비용 0에
   가까움, 규칙 7 부합).
3. **가장 근본적인 갭(교차 연구에서 새로 드러남)**: 발음 연습의 피드백
   자체가 가짜다(`docs/research/student-engagement-psychology.md`) —
   녹음 성공(`blob.size>0`)을 곧 "발음 성공"으로 처리, 실제 정확도는
   전혀 채점하지 않음. **SRS로 스케줄링할 "복습 대상"을 결정하는
   신호 자체가 부정확할 수 있다는 뜻** — Memory Engine을 발음 영역까지
   확장하기 전에, 최소한 파형 자기비교(STT 없이 저비용) 같은 신뢰
   가능한 신호부터 만드는 게 순서상 맞다. 세 연구 문서 모두 이 교차
   지점을 명시적으로 지적하지 않았다는 것 자체가 이번 종합에서 발견한
   갭이다.

### 실행 권장 (90일 로드맵과 연동, 3장 참고)

1주 내 설계 확정 → 2주 내 `word_review_schedule` SQL 작성(멱등, 기존
관례) → 클라이언트 순수 함수(박스 승급/강등 로직) → Garden 연동 → (
2차) Interleaving → (3차, 별도 트랙) 발음 신호 개선.

---

## 2. AI 에이전트 조직 설계 — 최소 강력 조직

### 현 상태 평가

기존 5-역할 체계(`docs/agent-architecture.md`, `.claude/agents/*.md`)는
**이미 이 프로젝트 규모에 맞게 잘 설계돼 있다**: 역할별 도구 스코프
엄격 분리(Write는 implementer만), self-report 불신(qa-reviewer가
항상 재실행), 명시적 중단조건, append-only 문서화, `MULTI_AGENT_
WORKFLOW.md`의 "작업당 최대 4명, 도전 라운드 1회, 매번 9개 역할 전부
소집 안 함" 토큰효율 원칙까지 갖춤.

**문제는 그 위에 얹힌 확장이다.** 원본 5개 파일 위에 문서 레벨로만
7개 신규 평가 역할(mission-guardian/orchestrator/product-guardian/
learning-designer/child-experience-designer/deployment-engineer/
student-analytics)이 추가됐고, 실제 세션에서는 이보다도 더 많은
부서장급 역할(security-head/qa-head/engineering-head/planning-agent/
doctrine-auditor 등)이 존재한다 — `agent-architecture.md` 자신이 이
불일치를 인지해 "실제 저장소 파일은 5개뿐, 나머지는 라벨 동의어"라는
면책 조항을 별도로 써야 했을 정도. **product-guardian/learning-
designer/child-experience-designer는 서로 인접한 평가 범위(제품
방향성/학습효과/아동경험)를 가져 하나의 "Product & Learning Guardian"
으로 통합 가능한 여지가 크다** — `MULTI_AGENT_WORKFLOW.md` 자신의
"역할이 진짜 따로 필요한가?" 원칙을 이 확장에는 적용한 흔적이 안 보임.

### 권장: 최소 강력 조직 (5 실행 + 3 평가 = 8개 상한)

새 역할을 추가하는 게 아니라 **기존 역할을 이 5+3 구조로 재정렬/통합**
하는 것을 권장한다.

| 역할 | 입력 | 출력 | 규칙 | 금지행동 |
|---|---|---|---|---|
| **CTO Planner**(기존 planner+orchestrator 통합) | 운영자 요청, 문서 현황 | 우선순위+작업분해+영향범위 | 완료 여부 재확인(규칙3), 동시작업 확인(규칙16) 선행 필수 | 코드 작성 금지 |
| **Implementer**(기존 그대로) | 승인된 작업 계획 | 코드/SQL파일/스크립트 | build→verify→소커밋, 3회 연속 실패 시 중단 | DDL 직접 실행, 문서 덮어쓰기 |
| **QA Reviewer**(기존 그대로) | implementer 산출물 | PASS/NEEDS-WORK | build/verify 독립 재실행(self-report 불신) | 코드 수정 |
| **Security Reviewer**(기존 그대로) | 인증/DB권한/신뢰경계 변경 | Critical~Low 등급 발견 | anon key 읽기전용 실측만 | service_role 사용, 실데이터 변경 |
| **Docs Maintainer**(기존 그대로) | 완료된 변경 | `*.md`/`.ai-status` append | append-only | 코드/설정 파일 변경 |
| **Product & Learning Guardian**(신규 통합 — product-guardian+learning-designer+child-experience-designer 흡수) | 제안/구현된 변경 | APPROVE/REVISE/REJECT(6축: Joy/Challenge/RealLearning/VisibleGrowth/Achievement/Continuation + 학습효과 + 아동경험 한 번에 평가) | `PROJECT_PAUL_GOAL.md` 6축 기준, 코드 미작성 | 코드 작성, 구현 승인 없이 배포 승인 |
| **Deployment Engineer**(기존 그대로) | 배포 요청 | 배포 상태/함수개수/ToS 위반여부 확인 | 무료 아키텍처 우선, 코드 미수정 | 코드 수정, 유료 전환 임의 결정 |
| **Student Analytics**(기존 그대로, 실사용 데이터 있을 때만 소집) | 실측 데이터 | 효과 검증 리포트 | 관측 데이터만, 추측 금지 | 데이터 없으면 활동 안 함(이미 이 원칙 보유) |
| **Mission Guardian** | 조직 전체 결정 | 미션 이탈 여부 판정 | `PROJECT_PAUL_GOAL.md` 최상위 가드레일 | 코드/문서 직접 생성 |

Security Head/QA Head/Engineering Head 같은 "부서장" 레이어는
1인 조직 규모에서 실질적 가치보다 조율 오버헤드가 크다 — `MULTI_
AGENT_WORKFLOW.md`가 이미 명시한 "작업당 최대 4명" 원칙을 지키려면
부서장 레이어 없이 위 8개 역할에서 작업당 필요한 역할만 직접
소집하는 것이 이 프로젝트 규모(1인 운영, 111명 학생)에 더 맞다.

### 이 프로젝트가 이미 잘하고 있는 것 (계속 유지)

- 파일당 소유자 1명(규칙 16), evidence 기반 PASS 판정, append-only
  문서, `.ai-status/` 파일 기반 좌표 — 전부 유지.
- 파괴적 SQL 훅 차단, DDL 직접실행 금지, 유료 API 자동승인 게이트
  없음(정직한 한계로 기록) — 전부 유지.
- "학생 대상 신규 기능/게임화는 AI 개발 인프라 구축 범위 밖"(CLAUDE.md
  규칙 12) — 조직 설계와 제품 기능을 명확히 분리하는 이 원칙 자체가
  Agent 조직이 스코프 크립하지 않도록 막는 핵심 장치.

---

## 3. 향후 90일 로드맵

### Week 1-2 (안정성/보안 우선 — 신기능 없음)

- [ ] 커리큘럼 보안수정 배포(`v3_11` SQL + Edge Function, 5단계 순서
      엄수) — **P0, 최우선**
- [ ] GitHub Pages Settings→Source→None 전환(운영자)
- [ ] AI 배치 채점 N+1 수정(batch select/upsert, 저위험)
- [ ] 쓰기 AI 보조 SQL 2건(`v3_6`/`v3_9`) 실행 + Edge Function 배포 +
      시크릿 설정 + flag ON — 이미 완성된 자산 회수
- [ ] Vercel/Supabase 무료 내장 모니터링 알림 활성화(비용 0, 즉시 가능)
- [ ] 관리자 PIN 강도 검증 실제 차단 로직(현재 경고만)

### Week 3-4 (Memory Engine 최소 구현 착수)

- [ ] `word_review_schedule` SQL 작성(멱등, 기존 마이그레이션 관례)
- [ ] 6-box Leitner 순수 함수 구현(승급/강등 로직, 회귀 테스트 우선)
- [ ] 기존 오늘 학습 종료 시 자동복습 로직과 통합(중복 스케줄러 만들지
      않기)
- [ ] Paul Rank류 게임화 SQL(v2.5~v2.8) 운영자 일괄 실행 검토 — 이미
      코드 완료, VERIFY 단계에서 대기 중인 항목들 검수 마무리

### Month 2 (AI 통합 심화 + 참여도 개선)

- [ ] Garden 시각화 → Leitner box_level 연동(신규 화면 0개, 최고 ROI)
- [ ] Interleaving(신규/복습 단어 혼합) 순수 함수 구현
- [ ] AI 배치 채점 동일오답 사전 그룹핑(비용 최적화)
- [ ] 발음 피드백 진짜 신호화 1단계 — 파형 자기비교(STT 없이, 무료)
- [ ] Reading Foundation 학생 UI 착수 여부 운영자 판단(백엔드는 이미
      완료)

### Month 3 (참여/재방문 + 상업화 판단)

- [ ] 재방문 트리거 설계(푸시 없이 가능한 저비용 대안부터: 이메일
      요약, 학부모 공유 카드 등 — 경쟁분석이 지목한 명확한 갭)
- [ ] 동기적 팀 경쟁 요소 검토(House/Word King을 비동기→동기 이벤트로
      확장할지 여부, 제품 가드레일 대조 필수)
- [ ] **다학원 확장 여부 사업적 결정** — Yes일 경우: Vercel 유료 전환 +
      `academy_id` 인프라 격리 설계 착수(별도 스프린트, 이번 90일 밖).
      No일 경우: 현재 구조 유지, 위 확장성 항목들은 백로그 보류.
- [ ] Dual coding(이모지 컬럼) — 남는 여력에 따라 착수

### 공통 원칙 (전체 90일 관통)

1. 안정성 최우선 — 신기능보다 배포 대기 중인 완성 코드 회수가 항상
   먼저.
2. 새 Supabase 컬럼/테이블은 전부 멱등 SQL + GRANT 동반.
3. 학생 대상 신규 게임화 기능은 이 로드맵 범위 밖(운영자 별도 승인
   필요, CLAUDE.md 규칙 12).
4. 다학원 인프라는 사업 결정 이전에 선제적으로 설계하지 않는다(과설계
   방지) — 단, 결정이 나면 4개 벽(DB조회/함수한도/PIN격리/ToS)이 동시에
   막힌다는 것은 미리 공유되어야 한다.

---

## 관련 문서

`PAUL_EASY_VOCA_CURRENT_STATUS.md`(선행 진단), `docs/MASTER_ROADMAP.md`
(Priority 1-28 전체표, 더 상세한 근거), `docs/research/memory-engine.md`,
`docs/research/paul-memory-engine-design.md`,
`docs/research/student-engagement-psychology.md`,
`docs/research/competitor-analysis.md`,
`docs/research/competitor-analysis-part2.md`,
`docs/agent-architecture.md`, `PROJECT_PAUL_GOAL.md`,
`MULTI_AGENT_WORKFLOW.md`, `PROJECT_BOARD.md`.
