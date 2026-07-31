# PAUL_EASY_VOCA_CURRENT_STATUS.md — 현재 상태 종합 리포트

_작성: 2026-07-25. CTO/PM/Learning Science/Architect 관점 종합 감사(순수
조사, 코드/SQL/DB/배포 무변경). 이 문서는 새로 리서치한 것이 아니라
`PROJECT_GUIDE.md`/`ARCHITECTURE.md`/`DATABASE.md`/`ROADMAP.md`/
`PROJECT_BOARD.md`/`docs/MASTER_ROADMAP.md`/`docs/audit/2026-07-24-*.md`
5종 + `docs/research/*`를 종합·재구조화한 것이다(CLAUDE.md 규칙 3 — 재조사
금지). 상세 근거는 각 섹션에 원본 문서를 명시했다. `docs/MASTER_ROADMAP.md`
가 이미 Priority 1-28 전체표로 이 내용의 상당수를 다루고 있으므로, 이
문서는 그것을 대체하지 않고 CTO 브리핑 포맷(P0/P1/P2)으로 재구성한
요약판이다._

---

## A. 아키텍처 맵

```
[학생/관리자/학부모 브라우저]
   React 18 SPA (Vite) — 역할 분기는 클라이언트 라우팅뿐, 별도 서버 라우트 없음
        │                              │
        │ anon key 직접 CRUD           │ PIN 관련 요청만
        ▼                              ▼
   Supabase(Postgres)  ◄────── Vercel 서버리스 함수(api/*.js, service_role)
   classes→units→words                 │ PIN 해시(scrypt)/관리자 재인증
   진행도/시험/설정 테이블              │
        ▲                              │
        │ Deno Edge Function           │
        └── grade-writing-answers ─────┘ (AI 보조 쓰기 채점, 미배포)
```

- **프런트엔드**: React 18 + Vite + Tailwind. 전역 상태관리 라이브러리 없음
  — `useStudent.js`가 진행도 중앙 훅, `wordLibrary.js`가 반/유닛/단어
  모듈스코프 캐시.
- **백엔드**: Vercel 서버리스 함수(`api/*.js`, 현재 12/12 — Hobby 플랜
  한도 도달, 여유 0). Supabase Auth 없음 — 신뢰 경계는 anon key vs
  service_role key로만 구분.
- **Supabase**: 핵심 4테이블(`students`/`classes`/`units`/`words`, 원본
  DDL 저장소에 없음 — 기술부채) + 기능별 테이블 15종. RLS 대신 컬럼권한
  (`students` PIN 4컬럼만 차단) 전략, `classes`/`units`/`words`는
  **인증 없이 anon key로 전체 CRUD 가능**(아래 E번 Critical 참고).
- **Edge Function**: `grade-writing-answers`(Deno, Vercel 함수 12개 한도
  회피 목적으로 의도적으로 별도 인프라) — 코드 완료, 배포 대기.
- **인증**: 학생(이름+PIN, 서버 scrypt 검증) / 관리자(단일 `ADMIN_PIN`,
  파괴적 액션마다 재검증) 완전히 분리된 2종. 학부모는 인증 없음(조회
  전용, 기존 학생 신뢰모델 재사용).
- **관리자 시스템**: `AdminScreen.jsx`(2,410줄, 분해 진행 중) — 반/단어
  업로드, 학생 관리, 숙제 배정, 대시보드, Word King/House/Season 패널.
- **학생 학습 플로우**: 로그인 → 유닛 선택 → 단어학습(발음+예문) →
  퀴즈 → 쓰기시험(반별 opt-in) → 미션 4/4 → 스티커 뽑기 → 캘린더/다이어리.
- **배포**: `git push`(main) → Vercel 자동 빌드/배포. DB는 별도 트랙 —
  운영자가 Supabase 대시보드에서 SQL 수동 실행. GitHub Pages 그림자
  배포는 발견·차단됨(운영자 Settings 조치 1건 남음).

상세는 `ARCHITECTURE.md`/`DATABASE.md` 원본 참고 — 이 섹션은 CTO 브리핑용
압축판이다.

---

## B. 완료된 기능 (프로덕션 운영 중, 111명 실사용)

- 핵심 학습 루프: 단어(발음+예문)/퀴즈/쓰기시험(양방향 혼합)/미션/캘린더/
  스티커
- Paul Rank(XP 원장, 행동 단위 지급) + House System + Ticket Economy +
  Seasonal Progression — **기능 코드 완료, SQL 대부분 미실행**(v2.5~v2.8)
- Attachment & Growth(모자 컬렉션/단어 박물관/성장 앨범/Paul Town) — DB
  변경 0, 전부 기존 데이터 파생
- 3분 데일리 리추얼(적응형 마이크로 세션)
- 다중 교재(Multi-Textbook) 동시 배정 — **SQL 실행 완료, 라이브 검증 완료**
- 입실시험 + 서버 재검증(조작 방지) — SQL(RLS 강화) 실행 대기
- 학부모 대시보드(읽기 전용, 관리자와 동일 소스)
- 쓰기 답안 AI 보조 v1.3(Provider 추상화, 캐시, 일일 비용 상한) — **코드
  완료, Edge Function 미배포 + SQL 2건 미실행 + flag OFF**
- "선생님이 같은 검토를 두 번 안 하는" 반복오답 통계(`writing_answer_
  statistics`) — 코드 완료, SQL 미실행
- 개발 인프라: 6개 문서 체계 + `.ai-status/` + `PROJECT_BOARD.md` +
  `npm run verify:*` 14도메인 + 로컬 위키 검색 + 대시보드

## C. 현재 잘 동작 중인 기능

위 B 항목 중 SQL 실행/배포까지 끝난 것들은 **실사용 정상 동작**:
핵심 학습 루프, 다중 교재, Attachment/Paul Town, 3분 리추얼, 학부모
대시보드. 나머지(Paul Rank류 게임화, 입실시험 RLS 강화, 쓰기 AI 보조)는
"코드는 있지만 운영자 SQL/배포 액션 대기"라 학생 화면에는 아직 보이지
않거나 부분 동작.

## D. 부분 완료 기능

| 기능 | 코드 | SQL/배포 | 학생 노출 |
|---|---|---|---|
| Paul Rank/Hat/House/Ticket/Word King/Season | 완료 | v2.3~v2.8 대부분 미실행 | `gamification_enabled`(기본 false) 뒤 숨김 |
| 쓰기 AI 보조(rules→AI→stats-repeat) | 완료(v1.3) | Edge Function 미배포, v3.6/v3.9 SQL 미실행, `ANTHROPIC_API_KEY` 미설정 | flag OFF |
| 입실시험 서버 재검증 RLS 강화 | 완료 | `v2_4` 미실행(서버 재검증 자체는 이미 1차 방어로 동작 중) | 이미 안전 |
| Reading Foundation(지문/문장) | 스키마+API+관리자 편집기 완료 | `v3_3` 실행 완료 | 학생 UI 의도적 OFF(`readingStudentUI`) |
| 커리큘럼 쓰기 잠금(Critical 보안수정) | 완료 | `v3_11` **미실행 — 아래 Critical 참고** | 취약점 여전히 열려있음 |

## E. 알려진 버그 / 보안 취약점 (실측 근거: `docs/audit/2026-07-24-*.md`)

### P0 — 즉시 (학생 실사용 전 반드시 해결)

1. **[Critical, 보안] `classes`/`units`/`words` 전체 무인증 CRUD** —
   anon key만 있으면 누구나 전체 커리큘럼을 읽기/쓰기/삭제 가능함을 라이브
   curl로 실측 확인. **코드 수정은 이미 완료**(Edge Function
   `admin-content-write` + `wordLibrary.js` adminPin 배선) — `supabase_
   v3_11_lockdown_curriculum_write.sql` 실행 + 배포 순서(정확한 5단계는
   `docs/MASTER_ROADMAP.md` §4 참고, 순서를 어기면 관리자 CRUD 자체가
   깨짐)만 남음. **이 저장소에서 가장 시급한 단일 항목.**
2. **[Critical, 성능] 전교생 무필터 전체조회** — 로그인/포커스 복귀마다
   `classes`/`units`/`words`/`students` 전체를 `.eq()`/`.limit()` 없이
   조회(쿼리 6개). 111명에서는 무해하지만 2,000명+/20학원 규모에서
   치명적 — 15개 이상 호출부에 `class_id` 스코핑 필요(별도 설계 세션
   필요 규모로 감사 문서 자체가 명시).
3. **[High→실질 Critical, 성능] AI 배치 채점 N+1** — Edge Function이
   요청당 최대 400개 쿼리 발생 가능. batch select/upsert로 수정 가능,
   회귀 위험 낮음(fire-and-forget 경로).

### P1 — 중요 (다음 스프린트)

4. 관리자 PIN에 형식/강도 검증 없음(학생 PIN엔 있음) — 진단 경고만
   추가된 상태(최근 커밋), 실제 차단 로직은 아직.
5. 관리자 PIN 병렬 요청에 대한 rate limit 없음(1.5초 지연만) — Vercel
   서버리스 특성상 수평 확장 공격에 취약.
6. `AnalyticsPanel`/학생 디렉터리도 학원/반 스코프 없이 전체 로스터 로드.
7. `product_events` 조회가 20,000행 상한에 조용히 잘림 — 일 333명+
   활동 시 복귀율 통계 자체가 왜곡됨.
8. FK 인덱스 부재(`words.unit_id`/`units.class_id`/`students.class_id`)
   — SQL 초안(`v3_10`)만 있고 미실행.
9. `writingAnswerStatsApi.js`가 기존 `isMissingTableError`를 재사용하지
   않고 자체 `isMissingRelationError` 재구현(직전 감사의 중복제거 수정이
   신규 파일에 전파 안 됨) — 안전하지만 중복.

### P2 — 보통

10. 학생 자기등록 중 PIN 저장만 실패하면 계정이 고아 상태(관리자 수동
    복구 가능, 크래시/유실 없음).
11. 엑셀 업로드 빈 파일 방어 없음.
12. 다중 탭 동시 사용 시 `localStorage` last-writer-wins 잔여 유실 창
    (초등 공부방 단일기기 패턴상 실사용 위험 낮음, 기록만 하고 보류 결정됨).
13. `AdminScreen.jsx` 2,410줄(하루새 57%↑) — 분해 세션 이미 진행 중.

## F. 기술 부채

- 핵심 4테이블(`students`/`classes`/`units`/`words`) 원본 DDL이 저장소에
  없음 — 재해복구 시 이 저장소만으로 스키마 재현 불가(Medium, 운영자가
  `information_schema` 백필 필요).
- `classes`/`units`/`words`에 RLS/GRANT SQL 자체가 저장소에 없음(같은
  뿌리의 기술부채, 위 E-1과 직결).
- Seoul-offset 날짜 계산이 2개 파일에 중복(공용화 진행 중, `useStudent.js`
  의 `todayStr()`는 건드리지 않기로 결정됨 — 회귀 위험).
- CI 자동화 없음(verify는 전부 사람이 수동 실행).
- ESLint/tsconfig 부재.
- `pdf.worker.min.mjs`(1.2MB) 등 번들 크기 재검토 후보(제거 대상 아님).

## G. 실사용 전 위험 영역 종합 (P0/P1/P2)

**P0(반드시)**: E-1(커리큘럼 무인증 쓰기), E-2(전체조회 확장성),
E-3(AI 채점 N+1) — 이 3개는 각각 "데이터 무결성/보안", "다학원 확장",
"AI 비용 폭주" 세 축 모두에 걸쳐 있어 최우선.

**P1(중요)**: 관리자 PIN 강도/rate-limit, 대시보드 미스코프 조회,
`product_events` 상한, FK 인덱스.

**P2(추후)**: 코드 정리류, 자기등록 엣지케이스, 엑셀 방어.

**배포/인프라 자체의 구조적 위험(신규 발견, `docs/audit/2026-07-24-
deployment-scale.md`)**:
- Vercel Hobby 플랜은 **비상업적 용도로 한정**(ToS 확정 재확인) — 학원비를
  받는 상업 서비스로 확장 시 계정 정지 실제 선례 있음. 상업화 전 유료
  플랜 전환이 선택이 아니라 필수.
- 학원 단위 인프라 격리가 전혀 없음(전역 단일 `ADMIN_PIN`/Supabase 키,
  RLS 없음) — 지금은 학원 1곳 규모라 문제 없지만 멀티테넌시 사업모델로
  갈 경우 설계 전면 재검토 필요.
- 모니터링/알림이 사실상 전무 — Vercel/Supabase 무료 내장 실패 알림
  활성화만으로도 즉시 개선 가능(비용 0).
- 서버리스 함수 12/12(Hobby 한도) — 신규 API 추가 여지 0, 기존 액션
  통합 패턴(`admin-pin-actions.js` 선례)을 계속 따라야 함.

---

## H. 실제 학원 시뮬레이션 — 100명·다중 반·매일 숙제·모바일 기준

가정: 100~2,000명(1개~20개 학원), 반별 숙제 매일 배정, 교사가 매일
진도 확인, 학생은 대부분 모바일.

### 무엇이 먼저 깨지나 (심각도순)

1. **DB 조회 폭주(E-2)** — 100명 규모(현재 111명과 거의 동일)까지는
   무필터 전체조회가 체감상 문제 없다. 하지만 **20개 학원(2,000명대)
   로 확장하는 순간** 로그인/포커스 복귀마다 전체 커리큘럼+전체 학생을
   내려받는 구조가 그대로 병목이 된다 — 이는 "언젠가"가 아니라 학원 수가
   늘어나는 그 시점에 확정적으로 발생.
2. **Vercel 서버리스 함수 12/12 한도** — 학원별 기능(예: 학원별 관리자
   PIN, 학원별 대시보드 API)을 추가하려는 순간 즉시 막힌다. 기존 액션
   통합(dispatch 패턴) 없이는 신규 API를 한 개도 못 늘림.
3. **관리자 PIN 단일 전역 값** — 여러 학원이 같은 `ADMIN_PIN`을
   공유하게 되는 구조라, 한 학원 관리자가 다른 학원 데이터를 그대로
   조작 가능(현재는 학원 1곳이라 노출 안 됨).
4. **AI 비용** — 현재 파이프라인(rules-first+cache+provider추상화)은
   1개 학원 기준 최적화돼 있어 학원당 하루 $2 상한으로 26,000~30,000건
   여유가 있다. 하지만 **동시-동일오답 중복 처리**(여러 학생이 같은
   실수를 했을 때 캐시가 채워지기 전에 각각 AI를 호출)는 학생 수에
   선형으로 비례해 커진다 — 20개 학원 동시 운영 시 이 비효율이 실비용
   누적으로 체감됨(그룹핑 최적화 필요, 미구현).
5. **교사 관리 워크로드** — 현재 관리자 화면은 "학원 1곳, 관리자 1인"
   전제(단일 로그인, 단일 대시보드 스코프 없음). 학원이 늘어나면 교사가
   자기 학원 데이터만 보는 스코프 분리 UI가 없어 관리 자체가 불가능
   해진다(기능 문제가 아니라 데이터 격리 문제).
6. **모바일 UX** — 실사용 관점에서 가장 눈에 띄는 문제는 이미 대부분
   수정됨(터치 타겟 6건, 같은 날 수정 완료). 남은 리스크는 기능적이라기
   보다 성능(느린 3G/저사양 기기에서 무필터 전체조회 체감 지연)에서 온다
   — 즉 E-2와 같은 뿌리.

### 해법 요약

| 축 | 문제 | 해법 | 우선순위 |
|---|---|---|---|
| DB 확장성 | 무필터 전체조회 | `class_id`/`academy_id` 스코핑을 15+ 호출부에 순차 적용(설계 세션 필요) | P0(다학원 확장 결정 시) |
| API/함수 한도 | Vercel 12/12 | 신규 API는 무조건 기존 액션에 dispatch 패턴으로 흡수 | 상시 |
| AI 비용 | 동일오답 중복 AI 호출 | `classifyBatch` 진입 전 캐시키 기준 사전 그룹핑 | P1 |
| 인프라 격리 | 전역 단일 PIN/키 | `academy_id` 개념 도입 + 학원별 RLS(신규 설계, 현재 스키마엔 없음) | 상업화 결정 시에만 착수 |
| 배포 플랜 | Vercel Hobby ToS | 상업 서비스 전환 전 유료 플랜 전환 필수(선택 아님) | 상업화 결정과 동시 |
| 모니터링 | 알림 전무 | Vercel/Supabase 무료 내장 알림 활성화(비용 0) | 즉시 가능 |
| 교사 워크로드 | 학원별 스코프 분리 UI 없음 | 위 인프라 격리와 함께 설계(단독으로는 의미 없음) | 상업화 결정 시 |

**핵심 결론**: 지금 규모(111명, 학원 1곳)에서는 구조적으로 안전하다.
**"몇 학원까지 확장할 것인가"라는 사업적 결정이 나기 전까지는 다학원
인프라 재설계에 먼저 뛰어들 필요가 없다** — 반대로 그 결정이 나는 순간
E-2/함수한도/PIN격리/Vercel ToS 4개가 동시에 막힌다는 것을 미리 인지하고
있어야 한다(`docs/audit/2026-07-24-deployment-scale.md`의 4개 HIGH가
전부 이 지점에서 만난다).

---

## I. 쓰기 답안 AI 시스템 분석

### 목표 대비 현재 구현 상태

요청하신 이상적 플로우(오류 감지→의도 이해→인정 판단→오답 패턴 저장→
복습 추천→향후 연습 생성) 기준으로, **이미 5/6단계가 코드 레벨로
구현돼 있다** — 남은 것은 운영자의 SQL/배포/시크릿 액션이다.

| 단계 | 이상적 목표 | 현재 구현 | 상태 |
|---|---|---|---|
| 1. 오류 감지 | `recieve` vs `receive` 같은 오탈자 인식 | `spelling.js` 규칙엔진(대소문자/공백 무시, 콤마분리 복수정답, 괄호제거) | **라이브(v2.0)** |
| 2. 의도 이해 | 오탈자인지 다른 단어인지 판단 | rules(exact/accepted_meanings) → lemma/POS 힌트 → Levenshtein 편집거리 → (미해결분만) AI(Claude/GPT/Gemini, provider 추상화) | **코드 완료, 미배포** |
| 3. 인정 여부 결정 | accept/review/reject 판정 | AI가 3분류 판정하되 **자동 반영 없음** — 관리자가 기존 accept/dismiss UI로 최종 승인(안전장치 유지) | **코드 완료, 미배포** |
| 4. 오답 패턴 저장 | 반복 오답 기록 | `writing_answer_statistics`(word×meaning×정규화답안 unique, count/accepted_count/rejected_count, distinct_student_ids) | **코드 완료, SQL 미실행** |
| 5. 복습 추천 | 반복 오답을 다시 검토 큐에 올림 | `spelling_review_queue`(교사 검토) — 이미 v2.0부터 라이브 | **라이브** |
| 6. 향후 연습 생성 | 취약 단어 재출제 | **미구현** — 현재는 "오늘 학습 종료 시 오답 자동복습"(당일 한정)만 있고, 여러 날에 걸친 재출제 스케줄링은 없음(H항목의 Memory Engine 설계와 직결, `PAUL_EASY_VOCA_MASTER_PLAN.md` 참고) | **설계만, 미구현** |

### 실제 파이프라인 (코드 기준, `supabase/functions/grade-writing-answers/`)

```
학생 제출 → normalize(NFKC) → ①정확일치 → ②accepted_meanings 대조
→ ③lemma/POS 힌트 → ④Levenshtein 편집거리
→ (미해결만) ⑤ writing_answer_statistics 반복조회(같은 실수 재판정 스킵)
→ (그래도 미해결만) ⑥ AI 호출(캐시 우선, Provider 추상화)
→ 결과: accept/review/reject_candidate (자동반영 안 됨, 관리자 승인 필요)
```

- **실측 데이터(99건 표본, 관리자 검토 대기 큐 수동 분류)**: 규칙만으로
  해결 0%, 편집거리+lemma로 약 29% 해결, 나머지 55~60%가 AI/사람 판단
  필요. 이 비율 자체가 "AI 없이는 안 되는 실질 니즈"의 증거.
- **비용**: 99건 전체를 Haiku 4.5로 처리해도 $0.10 미만(추정). 일일 상한
  $2(운영자 설정)로 26,000~30,000건 여유 — 현재 학원 1곳 규모에서는
  사실상 비용 걱정 없는 수준.
- **배포 미결 항목**: Edge Function 미배포, `v3_6`(캐시)/`v3_9`(통계)
  SQL 미실행, `ANTHROPIC_API_KEY` 등 시크릿 미설정, feature flag
  `writingReviewAiAssist` 기본 OFF.

### DB 구조 제안 — 이미 설계·구현된 것을 그대로 채택 권장

새로 설계할 필요 없이 기존 코드가 이미 최적 구조를 갖추고 있다:
- `words.accepted_meanings`(jsonb) — 채점 관대화
- `spelling_review_queue` — 교사 1차 검토 큐
- `writing_answer_statistics` — 반복 패턴 통계(unique 제약이 곧
  idempotency, `distinct_student_ids` 200개 상한으로 무한 성장 방지)
- `spelling_ai_grading_cache`(SQL 작성됨, 미실행) — (단어,뜻,답안) 조합
  캐시로 재과금 방지

### AI 워크플로우 권장사항

**추가 설계 불필요, 배포만 하면 됨.** 순서는 `docs/MASTER_ROADMAP.md`
§4의 5단계 배포 시퀀스를 그대로 따를 것(순서를 어기면 다른 기능이
깨질 수 있음 — 이미 문서화됨). 굳이 신규로 제안할 것은:

1. **동일 배치 내 중복 답안 사전 그룹핑**(위 H 섹션 AI비용 항목과 동일
   이슈) — `classifyBatch` 진입 전에 캐시키 기준 사전 dedupe. 유일하게
   기존 감사에서 "다음 라운드 필요"로 명시된 실질 개선점.
2. **6단계(향후 연습 생성)는 별도 스프린트로 분리** — 이건 Writing AI
   시스템의 범위가 아니라 Memory Engine(SRS) 설계의 일부로 흡수하는 것이
   구조적으로 맞다(`PAUL_EASY_VOCA_MASTER_PLAN.md` Phase 5 참고) — 별도
   테이블을 새로 만들지 않고 SRS의 `word_review_schedule`이 이 역할을
   흡수하도록 설계할 것을 권장.

### 비용 최적화 전략 (이미 구현된 것 확인)

- Rules-first(AI 호출 전 최대한 규칙으로 해결) — 이미 구현.
- 6필드 캐시 키 버저닝(prompt/model 변경 시 캐시 오염 방지) — 이미 구현.
- Provider 추상화(OpenAI/Gemini/Anthropic 팩토리, 비용표 기반
  `estimateCost`) — 이미 구현.
- 일일 비용 상한(`MAX_DAILY_COST`, 기본 $2) + 요청당 상한 — 이미 구현.
- 반복오답 스킵(`writing_answer_statistics`) — 코드 완료, 배포 대기.
- **결론**: 이 영역은 추가 설계가 필요한 게 아니라 "이미 잘 설계된 것을
  배포만 하면 되는" 상태 — CTO 관점에서 가장 ROI 높은 단일 액션.

---

## 관련 문서

`ARCHITECTURE.md`, `DATABASE.md`, `ROADMAP.md`, `PROJECT_BOARD.md`,
`docs/MASTER_ROADMAP.md`, `docs/audit/2026-07-24-security.md`,
`docs/audit/2026-07-24-performance-db.md`,
`docs/audit/2026-07-24-mobile-ux.md`,
`docs/audit/2026-07-24-code-quality.md`,
`docs/audit/2026-07-24-ai-cost.md`,
`docs/audit/2026-07-24-deployment-scale.md`,
`docs/operations/task2-writing-analysis.md`,
`docs/operations/task2-writing-report.md`. 후속 전략은
`PAUL_EASY_VOCA_MASTER_PLAN.md` 참고.
