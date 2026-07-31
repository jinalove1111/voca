# PAUL_EASY_VOCA_AI_DEVELOPMENT_PROTOCOL.md — AI 개발 운영 프로토콜

_작성: 2026-07-26. **순수 프로토콜 문서 — 코드/SQL을 이 세션에서 전혀
작성·실행하지 않았다.** `PAUL_EASY_VOCA_AI_AGENT_OS.md`(9-Agent 조직·
7단계 Workflow), `PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`,
`PAUL_EASY_VOCA_MASTER_PLAN.md`를 기반으로, "다음에 어떤 AI(Claude/
Fable/GPT 무엇이든)가 이 저장소에서 새 기능을 개발할 때 항상 같은
방식으로 움직이게" 만드는 것이 목적이다. 이 문서는 조직도가 아니라
**실행 절차서** — AI_AGENT_OS.md가 "누가 무엇인가"라면 이 문서는
"무엇을 언제 어떤 순서로"다._

## 이 문서와 AI_AGENT_OS.md의 관계 — 용어 정리 1건

`AI_AGENT_OS.md`는 9-Agent 설계에서 **"Planner" 역할을 별도 Agent로
만들지 않고 CTO Agent에 흡수**시켰다(에이전트 수 최소화 원칙). 이
프로토콜 문서의 §2/§3이 "CTO Agent 판단 기준"과 "Planner Agent 분석
방식"을 각각 별도 섹션으로 요청받았으므로, 여기서는 **CTO Agent가
수행하는 두 개의 서로 다른 모드**로 명확히 구분해 설명한다 — 신규
Agent를 추가하는 것이 아니라, 한 Agent가 순서대로 거치는 두 단계
(조사 모드 → 판단 모드)를 각각의 절차로 문서화하는 것뿐이다. 실제
운영에서 CTO Agent를 소집할 때는 이 두 모드를 한 세션이 순차 수행해도
되고, 위험도가 높은 작업만 분리해도 된다(`DEVELOPER_GUIDE.md` "1인
조직 운영" 원칙과 동일).

---

## 1. 새로운 기능 요청이 들어왔을 때 Workflow

```
운영자 요청/CTO 자체 발견
        │
        ▼
① CTO 접수 — 1줄 요약 + Planner 모드 조사 지시
        │
        ▼
② Planner 분석(§3) — 문서 조사 + 영향범위 + "이미 완료된 것 아닌가?" 확인
        │
        ├─ 이미 완료/진행 중 발견 → 여기서 즉시 중단, 그 사실만 CTO에 보고 (재작업 금지, CLAUDE.md 규칙 3)
        │
        ▼ (신규 확인됨)
③ CTO 판단(§2) — 우선순위(P0~P2) + 소집할 Agent 결정 + Go/No-Go
        │
        ├─ No-Go(미션 이탈/중복/승인범위 밖) → 반려, 사유 기록 후 종료
        │
        ▼ (Go)
④ 병렬 분석 — Product Manager(6축) + Learning Science(학습효과) +
   Cost Optimization(비용), 필요시에만 Database/Security 조기 참여
        │
        ▼
⑤ 개발 — Developer Agent(§4) 구현 + Database Agent(SQL 파일 작성, 필요시)
        │
        ▼
⑥ 검증 — QA Agent(§5) + Security Agent(§6, 해당 시 필수) + UX Agent(해당 시)
        │
        ├─ FAIL/NEEDS-WORK → ⑤로 반려(3회 연속 실패 시 설계 재검토로 전환)
        │
        ▼ (전부 PASS)
⑦ 배포 전 승인(§7 체크리스트) → 코드 배포 + (SQL 있으면) 운영자 수동 실행 안내
        │
        ▼
⑧ 학습 데이터 개선 — 실사용 데이터 축적 후 Learning Science Agent가 효과 재평가 → 다음 "요청"으로 피드백
```

**핵심 게이트 2개**: ②에서 "이미 있다"가 나오면 그 자리에서 끝(재작업
금지), ⑥에서 하나라도 FAIL이면 절대 ⑦로 못 넘어간다. 이 두 게이트만
지켜지면 나머지 단계는 유연하게 압축 가능(작은 작업은 ④를 생략하고
바로 ⑤로 갈 수도 있음 — 4명 상한 원칙, `MULTI_AGENT_WORKFLOW.md`).

---

## 2. CTO Agent 판단 기준

CTO Agent가 ③(Go/No-Go)에서 실제로 대조하는 체크리스트 — 전부 "예"가
아니어도 되지만, 특정 항목이 "아니오"면 자동으로 진행이 막힌다.

| # | 질문 | "아니오"일 때 |
|---|---|---|
| 1 | Planner 분석에서 "이미 완료/진행 중"이 아니라고 확인됐는가? | **자동 중단**(재작업 금지, 규칙 3) |
| 2 | 이 요청이 기존 안정적인 플로우(로그인/학습/퀴즈/동기화)를 위험하게 하지 않는가? | 범위 축소 또는 중단(규칙 1, 안정성 최우선) |
| 3 | 버그 수정 대기 항목보다 이 신규 요청이 정말 더 급한가? | 신규 요청을 뒤로 미루고 버그 수정 우선(규칙 2) |
| 4 | `PROJECT_PAUL_GOAL.md` 6축(Joy/Challenge/RealLearning/VisibleGrowth/Achievement/Continuation) 중 명백히 위반하는 축이 없는가? | Product Manager Agent에 REVISE 요청 후 재판단 |
| 5 | 학생 대상 신규 UI/게임화라면, 운영자의 **명시적** 승인이 이미 있는가? | **자동 중단**(규칙 12 — AI가 임의로 학생 기능을 확장하지 않는다) |
| 6 | AI/유료 API가 필요하다면 무료 대안을 먼저 검토했는가? | Cost Optimization Agent에 무료 대안 조사 재요청(규칙 7) |
| 7 | DB 스키마 변경이 필요하다면 Database Agent가 GRANT/폴백까지 설계에 포함했는가? | Database Agent에 반려(규칙 9, 10) |
| 8 | 동시에 다른 Agent/세션이 같은 파일을 작업 중이지 않은가?(Planner 확인 사항) | 그 파일은 읽기만, 쓰기 대상에서 제외(규칙 16) |

**우선순위 산정(P0~P2)**: P0 = 실사용자 대면 버그·보안 취약점·데이터
무결성 위험, P1 = 이미 설계/승인됐지만 배포 대기 중인 것의 완료, P2 =
순수 신규 기능. **P0 > P1 > P2 순서를 CTO가 임의로 뒤집지 않는다** —
이 저장소의 반복된 실제 패턴(게임화/쓰기AI보조 다수가 "코드 완료,
배포 대기"로 쌓여있는 것)을 볼 때, 실제로는 신규 개발보다 **이미
만든 것을 배포하는 P1 작업의 누적 가치가 더 큰 경우가 많다** — CTO는
이 사실을 판단에 반영한다.

---

## 3. Planner 분석 방식 (CTO Agent의 조사 모드)

②단계에서 CTO Agent가 수행하는 절차 — `DEVELOPER_GUIDE.md`의 기존
"AI 세션 표준 워크플로우" 1~4단계를 그대로 계승한다.

### 3.1 문서 조사 순서

1. `PROJECT_GUIDE.md`(항상, "헷갈리는 것 Top 5" 포함)
2. 화면/데이터 흐름이 걸리면 `ARCHITECTURE.md`
3. 테이블/컬럼/RLS가 걸리면 `DATABASE.md`
4. 새 테스트 작성이나 verify 실패 조사가 필요하면 `TESTING.md`
5. **"이거 이미 결정했던 거 아닌가?"가 궁금하면 `npm run wiki:search --
   "키워드"`로 먼저 훑고**, 확실히 하려면 `handoff.md`/`ROADMAP.md`/
   `docs/MASTER_ROADMAP.md`를 직접 검색

### 3.2 "이미 완료됐는가?" 확인 (가장 중요한 단계)

- `ROADMAP.md`/`docs/MASTER_ROADMAP.md`에서 유사 기능명 검색
- `PROJECT_BOARD.md`의 DONE/VERIFY 컬럼 확인
- `.ai-status/*.json`에서 관련 `task_id` 검색(이미 진행 중이거나
  최근 완료된 작업일 수 있음)
- **발견 시**: 코드를 한 줄도 보지 않고 CTO에게 "이미 v{n}에서
  완료됨/코드 완료·배포 대기 상태" 보고 → §1 게이트에서 즉시 중단

### 3.3 영향 범위 파악

- 관련 키워드로 `src/`/`api/`/`supabase/functions/` grep
- 영향받는 화면(학생/관리자/학부모 중 어디)과 그 화면이 `React.lazy`로
  분리돼 있는지(성능 영향)
- 영향받는 테이블과 그 테이블의 RLS/GRANT 상태(`DATABASE.md`)
- 예상 작업 단위 분해(5~30분 단위) — implementer(Developer Agent)가
  이어받을 수 있을 만큼 구체적으로

### 3.4 동시 작업 확인

- `git log`/`git status`로 최근 커밋·미커밋 변경 확인
- `.ai-status/`에서 `status: working`/`reviewing`인 다른 작업이 겹치는
  파일을 다루고 있지 않은지 확인
- 겹치면: 그 파일은 이번 작업 범위에서 제외(읽기만)

### 3.5 산출물

CTO의 판단 모드(§2)로 넘기는 표준 포맷:

```
[Planner 보고]
요청: <원문 요약>
완료 여부: 신규 확인됨 / 이미 완료(항목: ...) / 부분 완료(남은 것: ...)
영향 범위: <파일/테이블 목록>
작업 단위 분해: <1. ... 2. ... 3. ...>
리스크: <있으면>
동시작업 충돌: 없음 / <겹치는 파일 목록, 제외 처리>
```

---

## 4. Developer Agent 작업 규칙

`DEVELOPER_GUIDE.md` Development/Coding/Component/Hook/Database Rules
전체가 원본이며, 여기서는 **일일 작업에서 실제로 지켜야 하는 순서**만
압축한다.

1. CTO가 배분한 작업 단위(5~30분)를 하나씩, 순서대로 처리 — 여러 단위를
   한 번에 뒤섞지 않는다.
2. 새 파일은 `DEVELOPER_GUIDE.md` Naming Convention 표를 따른다.
3. **매 단위 작업 직후** `npm run build` — 에러/신규 경고 없어야 다음
   단위로 이동.
4. 관련 `npm run verify:<domain>` 실행(전체는 마지막에 한 번).
5. 실패 시 `CLAUDE.md` 규칙 15("수정 전 코드로 되돌려 FAIL 재현 확인")
   패턴 우선 적용 — 회귀인지 새 버그인지 먼저 구분.
6. **같은 문제로 3회 연속 실패하면 구현을 멈추고 CTO에게 설계 재검토
   요청** — 무한 재시도 금지.
7. 파일/기능 단위 소커밋 — 자신이 소유하지 않은 파일(§3.4에서 Planner가
   제외 표시한 파일)은 `git add` 범위에 절대 넣지 않는다.
8. 완료 후 QA Agent에게 검수 요청 — **자기 자신이 PASS 판정하지
   않는다.**

**절대 하지 않는 것(이 역할 전용 재확인)**: Supabase DDL 직접 실행(SQL
파일 작성까지만), `students`의 `pin_hash`/`pin_fail_count`/
`pin_locked_until`/`pin_setup_allowed` 조회, 학생 이름을 식별자로 쓰는
코드 작성.

---

## 5. QA Agent 테스트 기준

Developer Agent의 자체 보고를 **재실행 없이 신뢰하지 않는다** — 이
Agent 존재 이유 자체가 이 원칙이다.

### 5.1 판정 절차 (순서대로, 하나라도 실패하면 즉시 NEEDS-WORK)

1. `npm run build` **독립 재실행**(Developer가 이미 돌렸어도 다시 실행)
2. 건드린 도메인의 `npm run verify:<domain>` **독립 재실행**
3. `DEVELOPER_GUIDE.md` Code Review Checklist 8항목 대조:
   - 학생 식별에 `students.id` 사용(이름 아님)
   - 새 localStorage 키 대신 기존 `paul_easy_progress` 확장
   - 관리자/학부모/시험 전용 무거운 코드가 학생 메인 번들에 안 섞임
   - 조건부 early-return이 모든 훅 호출 뒤
   - 새 컬럼/테이블 부재 시 클라이언트 폴백
   - PIN 4컬럼 클라이언트 미조회
   - 파괴적 관리자 액션마다 `checkAdminReauth` 패턴
   - 외부 라이브러리 신규 추가 없음(예외 시 사유 명시)
4. 회귀 의심 시 `CLAUDE.md` 규칙 15 패턴(되돌려서 FAIL 재현) 재확인

### 5.2 판정 기준

- **PASS**: 1~4 전부 통과 + evidence(실행 로그 원문)를 CTO/Developer에
  제출
- **NEEDS-WORK**: 하나라도 실패 — 구체적 실패 위치(`파일:스크립트`)와
  stdout tail을 Developer에게 반환
- **판정 자체가 무효인 경우**: evidence(실제 실행 로그) 없이 "확인함"만
  적는 것 — 이 경우 판정을 다시 하도록 요구

---

## 6. Security Agent 검토 기준

### 6.1 언제 반드시 소집되는가 (조건부 소집이지만 이 목록은 필수)

- 인증/PIN 관련 코드 변경
- Supabase RLS/GRANT/컬럼권한 변경
- 클라이언트-서버 신뢰 경계가 바뀌는 변경(예: 지금까지 클라이언트가
  직접 쓰던 테이블에 서버 경유 게이트를 추가/제거)
- 관리자 파괴적 액션(삭제/초기화/일괄발급) 추가

### 6.2 검토 항목 (`DEVELOPER_GUIDE.md` Security Checklist 원문)

- PIN이 어떤 형태로도 로그에 남지 않는가
- PIN 검증이 서버(`api/*.js`, `_pinAuth.js`)에서만 이뤄지는가
- 민감한 신규 `students` 컬럼이 v1.9 패턴대로 컬럼권한에서 제외됐는가
- 관리자 재인증(`checkAdminReauth`)이 클라이언트 state만으로 우회
  가능한 구조가 아닌가
- 새 "anon 전체허용" RLS 정책을 추가하기 전에 그 테이블이 정말 이
  신뢰모델에 맞는지(민감 데이터가 없는지) 확인했는가

### 6.3 실측 원칙

- anon key로 읽기 전용 조회 + **0행 매칭 PATCH/DELETE까지만**(실 데이터
  변경 금지) — 실수로 실제 행을 생성했다면 그 자리에서 즉시 정리하고
  기록에 남긴다(v3_11 검토 세션의 실제 선례).
- service_role key는 절대 이 Agent가 직접 쓰지 않는다.

### 6.4 등급화 — 이 앱의 실제 위협모델 기준(과설계 금지)

Critical(전체 커리큘럼/학생 데이터 훼손·유출) > High(브루트포스 등
실질적 공격 표면) > Medium(제한된 영향, 학원 내부 한정) > Low(정보
노출 미미) — "결제/PII 없음, 학원 내부 랭킹 게임화 한정"이라는 기존
위협모델 전제를 벗어난 과도한 등급 상향을 하지 않는다(기존 감사
관례 그대로).

---

## 7. 배포 전 승인 체크리스트

`CLAUDE.md`의 "필수 완료 체크리스트"를 그대로 최종 게이트로 쓴다 —
여기서 새로 만들지 않고 그 원문을 배포 직전 마지막 확인표로 재사용한다.

- [ ] `npm run build` 통과(에러/신규 경고 없음)
- [ ] 건드린 도메인의 `npm run verify:<domain>`(또는 `verify:all`)
      QA Agent가 독립 재실행 완료
- [ ] Security Agent 리뷰 완료(§6.1 해당 조건이면 필수, 아니면 스킵
      명시)
- [ ] 관련 문서(`handoff.md` 최소, 필요 시 `ARCHITECTURE.md`/
      `DATABASE.md`/`DEVELOPER_GUIDE.md`/`TESTING.md`/`ROADMAP.md`)
      append 완료
- [ ] 자신이 소유하지 않은 파일이 커밋에 섞이지 않았는지 `git status`/
      `git diff --staged` 재확인
- [ ] 학생 식별에 UUID를 썼는지(이름 아님) 최종 확인
- [ ] 새 Supabase 컬럼/테이블에 GRANT·폴백이 빠짐없이 처리됐는지 확인
- [ ] 학생 대상 신규 기능/UI/게임화가 이번 배포 범위에 섞이지
      않았는지(운영자 명시 승인 없이는) 확인
- [ ] SQL 마이그레이션 파일이 있다면: **에이전트는 실행하지 않고**
      운영자에게 정확한 실행 순서(선행조건 포함)를 안내했는지 확인
- [ ] `.ai-status/`에 체크포인트 기록
- [ ] `PROJECT_BOARD.md` 카드를 `DONE`(또는 SQL 대기 중이면 `VERIFY`)로
      이동

---

## 8. 절대 하면 안 되는 행동 목록

전 Agent 공통(어떤 Agent든 예외 없음):

1. **Supabase에 DDL을 직접 실행한다** — SQL 파일 작성까지만, 실행은
   운영자만(규칙 8).
2. **학생을 이름으로 식별/매칭하는 코드를 작성한다** — 항상
   `students.id`(UUID)(규칙 4).
3. **`pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed`
   를 클라이언트 코드가 조회·로깅한다**(규칙 11).
4. **이미 완료된 것으로 확인된 작업을 재조사 없이 다시 구현한다**
   (규칙 3 — 과거 문자열 매칭 방식 재발 사고가 실제 근거).
5. **동시에 다른 세션이 작업 중인 파일을 손댄다**(규칙 16 — 커밋
   attribution 혼선 실사고 근거).
6. **검증(build/verify/QA/Security) 없이 "완료"로 선언한다.**
7. **학생 대상 신규 UI/게임화를 운영자의 명시적 승인 없이 진행한다**
   (규칙 12).
8. **비용이 드는 AI/유료 API를 무료 대안 검토 없이, 또는 운영자 명시
   승인 없이 활성화한다**(규칙 7, `DEVELOPER_GUIDE.md` "위험 작업
   승인법").
9. **append-only 문서(`handoff.md`/`ROADMAP.md`/`DEVELOPER_GUIDE.md`/
   `TESTING.md`/`DATABASE.md`/`PROJECT_GUIDE.md`)의 기존 섹션을
   삭제·재작성한다**(규칙 13 — `CLAUDE.md` 헌법 섹션과 워크플로우
   섹션만 예외).
10. **파괴적 SQL(DROP/TRUNCATE/무조건부 DELETE)을 작성 시도한다** —
    훅이 차단하지만, 애초에 이런 구문이 필요한 설계를 하지 않는 것이
    원칙(`checkDestructiveSql.mjs`에 기대지 않는다).
11. **자기 자신의 산출물을 스스로 최종 PASS 판정한다** — 특히 보안/
    DB 변경은 반드시 교차검증.
12. **컬럼/테이블을 DROP한다** — 이 저장소 전체에서 한 번도 쓰인 적
    없는 패턴, 하위호환 컬럼은 남겨둔다.

---

## 9. 실제 예시 시뮬레이션 — "학생 Writing AI 첨삭 기능 추가 요청"

운영자 요청(가정): *"학생이 영작한 문장을 AI가 첨삭해주는 기능을
추가해줘."*

### ① CTO 접수

> 1줄 요약: "학생 작문(문장 단위) AI 첨삭 기능 신규 요청."
> Planner 모드 조사 지시.

### ② Planner 분석

- `PROJECT_GUIDE.md`/`ROADMAP.md` 검색 → **"쓰기 답안 검토 AI 보조"**
  라는 매우 유사한 이름의 기능이 이미 v1~v1.3까지 여러 세션에 걸쳐
  구현된 것을 발견(`ROADMAP.md` 2026-07-23/24 다수 섹션).
- `handoff.md` 검색 → `supabase/functions/grade-writing-answers/
  pipeline.js`(rules→AI→stats-repeat 파이프라인), `src/utils/
  writingAnswerStatsApi.js`, `writing_answer_statistics` 테이블까지
  전부 코드 완료 상태 확인.
- **단, 범위를 자세히 대조하니 기존 시스템과 이번 요청은 완전히
  같지 않다는 것도 함께 발견**: 기존 시스템은 **단어 철자시험의
  답안 인정 여부**(`recieve` vs `receive`류, 단어/뜻 단위)를 다루고,
  이번 요청은 **학생이 스스로 쓴 영작 문장 전체의 첨삭**(문법/표현
  단위) — 입력 단위와 판정 기준 자체가 다르다.
- **Planner 보고**:
  ```
  완료 여부: 부분 완료 — "단어 단위 답안 검토 AI"는 이미 코드 완료/
             배포 대기(기존 자산 재사용 가능). "문장 단위 영작 첨삭"은
             신규(기존에 이런 입력 형태/판정 로직 없음).
  영향 범위(신규 부분): 신규 UI(작문 입력 화면), 신규 저장 테이블
             후보(문장 단위 결과), 기존 grade-writing-answers 파이프라인
             재사용 가능성 검토 필요, providers.js(Provider 추상화)
             재사용 가능.
  작업 단위 분해: 1) 기존 단어단위 시스템 우선 배포(P1, 별도 트랙)
             2) 문장 첨삭 요구사항 재확인(정말 필요한지, 대상 학년/
             난이도) 3) Learning Science/Cost 사전 검토 4) 신규 설계
  리스크: 문장 단위는 토큰량이 단어 단위보다 훨씬 큼 → 비용 재추정 필수.
             8~13세 학생의 자유 작문을 AI가 채점하는 것이 학습과학적으로
             적절한 난이도인지 미검증.
  동시작업 충돌: 없음(관련 파일 최근 활성 작업 없음).
  ```

### ③ CTO 판단

- §2 체크리스트 1번("이미 완료?")에서 **부분적으로 걸림** → 자동 중단
  대신 **요청을 둘로 분리**하는 것으로 판단(전부 막지 않고, 이미 있는
  부분은 별도 P1 트랙, 신규 부분만 P2로 신규 심사).
- 5번(학생 대상 신규 UI 승인) 확인 필요 → **운영자에게 "문장 단위
  작문 첨삭은 완전 신규 UI인데 승인 범위인지" 재확인 요청**(규칙 12).
- 6번(무료 대안) → Cost Optimization Agent에 사전 검토 배정.

### ④ 병렬 분석 (신규 부분만)

- **Product Manager Agent**: 6축 평가 — RealLearning(진짜 학습)에는
  긍정적이나 Achievement(성취감)를 해치지 않으려면 첨삭 피드백이 지적만
  하지 않고 격려 톤을 포함해야 함(REVISE 의견).
- **Learning Science Agent**: 자유 작문 첨삭은 초등 저학년에는 인지
  부하가 클 수 있음 — 대상 학년/난이도 밴드를 좁혀서 시작할 것을 제안
  (예: 이미 배운 문장 패턴 재구성 수준으로 축소).
- **Cost Optimization Agent**: 문장 단위는 단어 단위 대비 입력 토큰이
  많아 기존 일일 $2 상한으로는 부족할 수 있음 — 기존 캐시(word/meaning/
  answer 키)를 그대로 못 쓰므로(문장은 조합이 사실상 무한) 캐시 효과가
  낮다는 점을 명시, 요청당 상한을 훨씬 보수적으로 잡을 것을 제안.

### ⑤ 개발 (CTO가 최종 Go 판단했다고 가정)

- **Developer Agent**: 기존 `providers.js`(Provider 추상화) 재사용,
  신규 UI는 `React.lazy`로 학생 메인 번들과 분리.
- **Database Agent**: 문장 첨삭 결과 저장용 신규 테이블 설계(멱등 SQL
  작성만, 실행 안 함) — 기존 `writing_answer_statistics`와는 별개
  테이블(입력 단위가 다르므로 같은 테이블에 억지로 합치지 않음).

### ⑥ 검증

- **QA Agent**: build/verify 재실행, 신규 verify 도메인 필요 시
  `tests/harness/registry.mjs`에 추가 확인.
- **Security Agent**: 학생이 자유 텍스트를 서버로 보내는 새 경로 —
  요청당 길이 제한/요청 빈도 제한이 있는지, PII가 섞여 들어올 가능성
  (학생이 실명을 작문에 쓰는 경우 등)에 대한 저장 정책을 확인.
- **UX Agent**: 첨삭 결과가 아동에게 "틀렸다"가 아니라 "이렇게 하면
  더 좋아요" 톤으로 보이는지 실제 화면으로 확인.

### ⑦ 배포 전 승인

- §7 체크리스트 전체 대조 → SQL 파일은 운영자 수동 실행 대상으로
  안내(신규 테이블), 코드는 Vercel 자동 배포 트랙.

### ⑧ 학습 데이터 개선

- **Learning Science Agent**: 몇 주 실사용 후 "첨삭을 받은 학생이
  실제로 재작문 시 같은 오류를 덜 반복하는가"를 실측 데이터로 확인 —
  데이터가 쌓이기 전까지는 판단을 유보(추측 금지).

**이 시뮬레이션이 보여주는 핵심**: 겉보기엔 "새 기능 하나"처럼 들리는
요청이 실제로는 (a) 이미 완료돼 배포만 하면 되는 부분과 (b) 정말 신규인
부분이 섞여 있는 경우가 이 저장소에서는 매우 흔하다 — **Planner
분석(§3)이 이 둘을 정확히 갈라내지 못하면, Developer Agent가 이미
있는 것을 다시 만드는 실질적 낭비가 발생한다.** 이 프로토콜의 존재
이유가 바로 이 지점이다.

---

## 관련 문서

`PAUL_EASY_VOCA_AI_AGENT_OS.md`, `PAUL_EASY_VOCA_MASTER_PLAN.md`,
`PAUL_EASY_VOCA_SAAS_ARCHITECTURE_PLAN.md`, `CLAUDE.md`(18개 규칙 +
필수 완료 체크리스트 원문), `DEVELOPER_GUIDE.md`(AI 세션 표준
워크플로우 13단계, Code Review/Security Checklist 원문), `TESTING.md`,
`PROJECT_PAUL_GOAL.md`.
