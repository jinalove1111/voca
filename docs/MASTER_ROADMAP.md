# Paul Easy Voca — Phase 5 Master Roadmap

_작성: 2026-07-24. 담당: docs-maintainer. 이 문서는 같은 날 완료된 Phase 1
(Production Readiness 감사 5종 + 안전 수정)과 Phase 2~4(Memory Engine 설계,
경쟁앱 분석 2부, 학생 몰입 심리학 연구)의 산출물을 종합한 최종 전략
문서입니다. 우선순위 판단(무엇이 P1인지, ROI 근거)은 조정자가 사전에
확정한 프레임을 그대로 따랐고, 이 세션은 ① 각 항목의 사실관계를 원본
문서를 직접 읽어 검증, ② 문서 형식 완성, ③ 원본 문서 속 추가 근거 보강을
수행했습니다. 코드/SQL은 전혀 수정하지 않았습니다(docs-maintainer 역할
범위)._

_이 문서에 담긴 우선순위/제안은 전부 향후 별도 planner/implementer
세션을 위한 계획 문서이며, 그 자체로 구현 지시가 아닙니다. 학생 대상
신규 기능/UI/게임화는 `CLAUDE.md` 규칙 12에 따라 이번 "AI 개발 운영체제
구축" 범위에서 절대 금지이고, 이 로드맵에 담긴 학생 경험 관련 항목(SRS/
Interleaving/파형 피드백 등) 전부 "설계·조사 완료, 구현은 별도 세션"
상태입니다._

---

## 0. 사실검증 메모 (원본 프레임 대비 확인 사항)

조정자가 제시한 원본 프레임을 검증하는 과정에서 확인한 사항을 먼저
기록합니다(요청된 "사실검증 중 발견한 오류/수정 사항").

1. **`docs/audit/2026-07-24-deployment-scale.md`는 이 세션이 최초로
   9개 필수 선행 문서를 훑을 때는 존재하지 않았고, 작업 도중(조정자가
   별도 세션에서 생성) 새로 추가됐습니다.** 지시문이 전제한 6종 감사
   문서(보안/성능DB/모바일UX/코드품질/배포확장성/AI비용) 중 배포확장성
   문서만 초기 읽기 목록에 빠져 있었던 것을 조정자의 후속 지시로
   확인했고, 이 문서를 추가로 읽어 아래 §0-5·§5 표·§9에 전부 반영했습니다
   — 최종 문서는 6종 감사 전부를 반영한 상태입니다.
2. **GitHub Pages 병행 배포(`.github/workflows/deploy.yml`)는 실존하며
   `main` push마다 자동 트리거됩니다.** 코드 직접 확인 결과 `on: push:
   branches: [main]`으로 무조건 트리거되고, `npm run build` 산출물
   (`dist/`, 순수 정적 SPA)을 GitHub Pages에 배포합니다 — `api/*.js`
   서버리스 함수가 전혀 없는 호스팅이라 로그인/PIN 검증 등 전체가
   깨지는 "그림자 배포"가 코드상으로는 확실히 활성 상태입니다. 다만
   **저장소 Settings → Pages에서 실제로 GitHub Pages 기능 자체가 켜져
   있는지는 이 환경(파일 읽기 전용 조사)에서 확인할 수 없습니다** —
   원본 프레임이 요구한 대로 "운영자 확인 필요" 사실을 그대로 유지합니다.
   **`docs/audit/2026-07-24-deployment-scale.md`(§0-5 참고)도 독립적으로
   같은 파일을 확인해 동일하게 "활성 여부 확정 불가, 운영자 Settings
   확인 필요"로 결론지어 이 사실이 교차 확인됐습니다.**
3. **보안 감사가 지적한 Critical(`classes`/`units`/`words` anon 전체
   쓰기)은 원본 프레임이 "코드는 완성, 배포+SQL만 남음"이라 서술한 것보다
   한 단계 더 진행돼 있었습니다.** 검증 결과 `.ai-status/` 5개 세션
   (`implementer-security-lockdown-curriculum`, `-adminpin-wiring`,
   `-adminpin-writing-review-gap`, `implementer-test-arity-fix`, 그리고
   `implementer-adminscreen-split`과의 동시성 조율)이 전부 완료 상태로
   확인되어, **AdminScreen.jsx 호출부 11곳 + `spellingReviewAiApi.js`의
   `executeAccept`/`executeBulkAccept`까지 adminPin 배선이 끝났고
   테스트 arity 단언도 갱신 완료**입니다. 즉 "코드 완료, 배포 대기"가
   아니라 "코드+배선+테스트 전부 완료, 정확히 5단계 순서로 배포·SQL
   실행만 남음"이 더 정확한 서술이라 이 로드맵의 P1-1 항목에 그 5단계를
   그대로 옮겼습니다.
4. **오류로 분류할 사항은 발견하지 못했습니다.** Reading Foundation의
   "백엔드/스키마만 완료, 학생 UI 의도적 미구현" 서술은 `ROADMAP.md`
   2026-07-23(2차) 원문("학생 학습 UI는 의도적 제외")과 정확히 일치해
   재분류가 필요 없었습니다. `getTextbookById` 데드코드 후보도 코드품질
   감사 원문·재확인 문구("여전히 export되지만 외부 참조 0건") 그대로
   확인됐습니다.
5. **`docs/audit/2026-07-24-deployment-scale.md`(deployment-engineer,
   100명×20학원 가정) 신규 반영 — 4개 HIGH 등급 발견을 §5 표/§6/§7에
   추가했습니다.**
   - **서버리스 함수 12/12, 여유 0(재확인)**: `git ls-tree` 실측으로
     정확히 12개 — 이 감사가 직접 짚었듯, 오늘 보안 수정이 신규 `api/
     *.js` 대신 Supabase Edge Function(`admin-content-write`)으로
     구현된 것 자체가 "이 제약을 실제 설계 결정에 반영한 사례"입니다.
   - **[신규, 가장 심각] Vercel Hobby 플랜은 ToS상 비상업적 용도
     전제인데, 20학원(상업 SaaS)으로 확장하면 기술적 용량보다 **약관
     위반으로 인한 서비스 정지가 먼저 올 수 있음**[추정 — 이 감사
     세션은 실시간 웹 접근이 차단돼 있어 Vercel 공식 약관 원문을 직접
     확인하지 못했고, 공개적으로 알려진 Hobby 약관 취지에 근거한
     추정입니다. **운영자가 Vercel 공식 약관 페이지에서 최신 조항을
     직접 재확인하기 전까지 사실로 단정하지 말 것**을 원 감사 문서가
     명시적으로 경고합니다].
   - **관리자 PIN·Supabase 키가 전역 단일값, RLS 없음 → 학원 간 인프라
     격리가 인프라 레벨에서 전혀 없음**(HIGH) — 보안 감사가 실측 확인한
     `classes` 테이블에 `academy_id` 경계 컬럼 자체가 없다는 사실과
     **서로 다른 각도(인프라 vs DB 스키마)에서 독립적으로 교차
     확인**된 동일 결론입니다.
   - **모니터링/알림 사실상 전무**(HIGH) — "장애가 나도 학생/학부모
     신고 전까지 아무도 모르는 구조". 단, 이 감사는 "Vercel/Supabase의
     기본 제공 알림(배포 실패 이메일 등)을 켜는 것이 새 유료 도구
     도입보다 우선"이라는 **무료 티어 내에서 지금 바로 가능한 완화책**을
     함께 제시했습니다 — 이는 20학원 확장 여부와 무관하게 지금(단일
     학원, 111명 규모)도 적용 가능한 저비용 조치라 이 로드맵에서는
     P4(확장 조건부)가 아니라 P3(즉시 가능)로 재배치했습니다(§5 표
     참고, §0의 "오류 수정"에 준하는 우선순위 조정).
   - 빌드 번들 크기(메인 청크 gzip 185KB, 학생용)는 LOW~MEDIUM — 관리자
     전용 청크(AdminScreen/pdf, 500KB+ 경고)는 이미 React.lazy로
     코드분할돼 있어 학생 로딩과 무관함을 실측 확인, 추가 조치 우선순위
     낮음.
   - Supabase 무료/저가 티어의 정확한 용량/연결 한도는 코드로 판별
     불가 — 운영자의 대시보드 직접 확인이 선행돼야 함(기존 `wiki/
     api-costs.md`에도 이미 같은 제약이 기록돼 있어 신규 발견은 아님).

---

## 1. 현재 기능 (as-is)

`ROADMAP.md` 최신 섹션들(2026-07-18 Production Readiness 판정 이후)
기준으로 확인한 실제 구현 상태입니다.

| 기능 | 상태 | 근거 |
|---|---|---|
| 핵심 단어학습 루프(듣기/발음녹음/퀴즈/쓰기) | 완료, 운영 중(111명) | `PROJECT_GUIDE.md` 한 줄 요약 |
| Paul Rank(XP/모자 5단계) | 완료 | `ROADMAP.md` 2026-07-19 세션들, `.ai-status/engineering-head-paul-rank-*` |
| House System(4팀, 주간/시즌 집계) | 완료 | `.ai-status/engineering-head-house-weekly-events.json` |
| Ticket 경제(결정론적 적립-환급, 화폐/뽑기 아님) | 완료 | `ROADMAP.md` 149행 "무작위·뽑기·화폐·결제·스트릭징벌 없음" |
| Seasonal Progression(레벨/뱃지 유지, 티켓/하우스만 리셋) | 완료 | `.ai-status/engineering-head-seasonal-progression.json`, 2026-07-23(6차) 생애주기 버그 3건 수리 완료 |
| Attachment 시스템(모자컬렉션/단어박물관/성장앨범/폴의기억/잉글리시정원) | 완료(기본 ON), 월드확장/책장/이야기는 플래그 OFF 파운데이션 | `ROADMAP.md` 2026-07-22(2차) |
| 3분 데일리 리추얼(적응형 마이크로 세션) | 완료 | `ROADMAP.md` 2026-07-22 |
| PaulTown(마을=내비게이션, 정원/집/도서관/박물관/시계탑) | 완료 | `ROADMAP.md` 2026-07-22(7~8차) |
| Reading Foundation | **백엔드/스키마/API/관리자 지문편집기만 완료 — 학생 UI는 `readingStudentUI` 예약 플래그로 의도적 미구현** | `ROADMAP.md` 2026-07-23(2차) 원문 그대로 확인, 재분류 불필요 |
| Sentence Learning | 완료 | `.ai-status/implementer-sentence-engine.json`, `-sentence-ui.json` |
| Multi-Textbook(반 불변, 교재별 유닛/진도 분리) | 완료(v3.1 SQL 실행 완료) | `ROADMAP.md` 2026-07-22(4~6차) |
| Writing Review AI 보조(v1~v1.3) | 완료, Provider 추상화(OpenAI/Gemini/Anthropic) + 캐시 + 2단 비용상한 + in-run 중복제거(오늘 신규) | `ROADMAP.md` 2026-07-23(6~8차)/2026-07-24(9~10차), `.ai-status/implementer-ai-dedup-optimization.json` |
| 자동학습 통계/추천 시스템 | 완료(관리자 카드 3종: LearningRecommendationsCard/AiSavingsCard/LearningRateCard) | `.ai-status/docs-maintainer-learning-system.json`, 오늘 `AdminScreen.jsx`→`src/components/admin/`로 추출 완료 |
| Entrance Test(입실시험) | 완료, 서버 재채점 적용 | `ROADMAP.md` 386행, `.ai-status/engineering-head-entrance-result-server-verify.json` |
| 학부모 읽기전용 대시보드 | 완료(`ParentScreen.jsx`) | `ROADMAP.md` 511~513행 |
| 관리자 대시보드/분석(`AnalyticsPanel`/`StudentDirectory`) | 완료 | `ROADMAP.md` 2026-07-22(6차) |
| **Phase 1(오늘, 2026-07-24)** — 보안수정 | **코드+배선+테스트 완료, 배포/SQL 실행 대기**(§0-3 참고) | `docs/audit/2026-07-24-security.md`, 5개 `.ai-status/implementer-security-*`/`-test-arity-fix.json` |
| **Phase 1(오늘)** — AdminScreen.jsx 분리 | 완료(2410→1521줄, 37% 감소), 커밋 대기 | `.ai-status/implementer-adminscreen-split.json` |
| **Phase 1(오늘)** — AI 파이프라인 in-run 중복제거 | 완료(pipeline.js `classifyBatch` 그룹핑), 커밋 대기 | `.ai-status/implementer-ai-dedup-optimization.json` |
| **Phase 1(오늘)** — 모바일 UX 수정 6건 | 완료(CSS-only), 커밋 대기 | `.ai-status/implementer-mobile-ux-fixes.json` |

---

## 2. 삭제해야 할 기능 (Priority 5 — 낮은 긴급도, 명시적 기록)

1. **`src/utils/wordLibrary.js`의 `getTextbookById`** — export되지만
   외부 참조 0건(코드품질 감사 원 조사 + 이번 세션 재확인 문구 "변경
   없음, 이번 신규 기능이 건드리지 않음"). 삭제 후보, 리스크 최저(순수
   미사용 export 제거).
2. **`.github/workflows/deploy.yml`의 GitHub Pages 병행 배포** — §0-2에서
   확인한 대로 `main` push마다 자동 트리거되는 정적 호스팅 배포이며,
   `api/*.js` 서버리스 함수가 전혀 없어 배포되면 로그인/PIN 검증 등
   전체 플로우가 깨지는 "그림자 배포" 위험입니다. **운영자 확인이
   선행돼야 합니다**: (a) 저장소 Settings → Pages에서 GitHub Pages 기능
   자체가 비활성 상태라면 이 워크플로 파일 삭제는 안전하고 시급하지
   않은 정리 작업(Priority 5). (b) 만약 활성 상태라면, 파일 삭제보다
   **Settings에서 GitHub Pages를 즉시 비활성화하는 것이 더 시급**하며
   이는 삭제 항목이 아니라 P1급 운영 조치로 별도 취급해야 합니다(§5
   표에 조건부 항목으로 반영).
3. 코드품질 감사가 추가로 지적한 항목(`isMissingRelationError` 중복,
   Seoul-offset 날짜 계산 중복 등)은 **삭제가 아니라 리팩터(통합)
   대상**이라 이 절이 아니라 §5 Priority 3 표에 별도로 배치했습니다 —
   "다른 명백한 죽은 기능"은 코드품질 감사 전체(§1~§6)를 재확인한 결과
   위 2건 외에는 발견되지 않았습니다.

---

## 3. 절대 추가하면 안 되는 기능

원본 연구 문서와 `ROADMAP.md` 기존 원칙에서 근거를 그대로 인용합니다.

| 금지 항목 | 근거 |
|---|---|
| 스트릭 손실회피형 징벌 | `ROADMAP.md` 149행 "무작위·뽑기·화폐·결제·스트릭징벌 없음"(기존 명시 원칙). `competitor-analysis.md` 1장 — Duolingo 손실회피 스트릭이 리텐션 엔진의 핵심이지만, 이 저장소는 `student_progress`에 스트릭 필드가 있음에도 처벌 로직을 의도적으로 배제. `competitor-analysis-part2.md` 4장 — Memrise의 스트릭 손실회피도 반면교사로 재확인. |
| 무작위/뽑기 보상 | 동일 근거(`ROADMAP.md` 149행). `competitor-analysis.md` 1장 — Duolingo의 가변 비율 강화(XP 랜덤)가 도박 기제와 동일 구조임을 명시. |
| 인앱 화폐·결제 | 동일 근거. Ticket 경제는 "결정론적 교환"으로 이미 화폐/뽑기 요소를 배제(`ROADMAP.md`). |
| **범용 콘텐츠 공유/플래시카드 플랫폼** | `competitor-analysis-part2.md` 5장 — Tinycards가 Quizlet에 밀려 2020년 종료. "이미 압도적 강자가 있는 범용 카테고리에 콘텐츠 생태계 없이 진입하지 않는다"는 명시적 반면교사(같은 문서 320~334행, "Phase 5 로드맵 근거"로 직접 지목됨). |
| **학습과 분리된 코스메틱 상점형 보상** | `competitor-analysis-part2.md` 2~3장 — Reading Eggs(Eggy Bank 저축-소비 경제)/Raz-Kids(Raz Rocket 방 꾸미기) 둘 다 "교사가 별을 벌기 위해 실제 읽기 대신 클릭한다"고 독립적으로 보고됨(교사 리뷰 다수, 두 회사 독립 사례). 기존 무화폐 원칙(`ROADMAP.md` 149행)과 정확히 배치. |
| 학생에게 노출되는 SRS 스케줄/설정 화면 | `competitor-analysis-part2.md` 6장 — Anki는 "리뷰 큐를 사용자가 직접 관리"하는 설계라 아동에게 메타인지 부담을 전가, 진입장벽으로 작용. `memory-engine.md` 6.3절 — Leitner 설계 자체가 "파라미터 튜닝 없음, 스케줄링은 시스템이 전담"을 전제로 채택됨. 스케줄링은 항상 숨김 유지. |
| 진짜 서버 ML 기반 개인화(FSRS/Duolingo HLR급) | `memory-engine.md` 2.3/2.5/5절 — FSRS는 개인화에 200~1000+ 리뷰 필요(이 프로젝트 학생당 리뷰량 부족), Duolingo HLR/Birdbrain은 수백만~수천만 건 크로스유저 로그+서버 ML 인프라 전제, 규칙 7(유료 API 금지) 위반 위험. 완화형 Leitner 채택이 이미 확정 결론. |
| 개인 대 개인 소셜그래프/친구대결 | `competitor-analysis.md` 7장 — PIN 로그인만 존재하고 학생 간 소셜 그래프 자체가 설계상 없음, "개인정보/안전 측면에서 오히려 의도적 결핍일 가능성 높음"[추정]으로 명시. `competitor-analysis-part2.md` 8절도 재확인. |
| 무료 대안 검토 없는 유료 AI 신기능 | `CLAUDE.md` 규칙 7. `memory-engine.md` 5절 표에서 FSRS/HLR 모두 이 규칙 위반 위험으로 배제됨을 재확인. `student-engagement-psychology.md` 5절 — 발음 채점 개선안(설계1)도 "AI/STT 비용 없이" 조건을 명시적으로 지킴. |

---

## 4. ROI 최고 기능 (Top 3)

### 1위 — 보안 수정 배포 완결

오늘 코드는 이미 완성됐고(§0-3 참고, 5개 세션에 걸쳐 배선·테스트까지
완료), 배포+SQL 실행만 남았습니다. **빌드 비용은 사실상 0**(이미 작성된
코드를 실행에 옮기는 것뿐)이고, 안 할 경우의 잠재 손실은 **무한대에
가깝습니다** — 보안 감사가 라이브 실측으로 확인한 바로는 `classes`/
`units`/`words` 3테이블이 anon key만으로(PIN조차 불필요) 인터넷 누구나
접근 가능한 완전 개방 CRUD 상태이며, curl 몇 줄로 학원 전체 커리큘럼
(반/유닛/단어 정답 포함)을 rename/삭제/오염시킬 수 있습니다(Security
Score 45~50/100, 기존 90/100 대비 대폭 하락). 정확한 배포 순서(순서를
지키지 않으면 관리자 반/유닛/단어 CRUD가 전부 깨짐, `implementer-
security-adminpin-wiring.json` next_action 원문 인용):

1. 프론트엔드 재배포(`wordLibrary.js`/`AdminScreen.jsx`/
   `SpellingReviewQueuePanel.jsx`/`spellingReviewAiApi.js` 포함).
2. `supabase functions deploy admin-content-write`(시크릿은
   `grade-writing-answers`와 프로젝트 단위 공유 가능성 높음, `supabase
   secrets list`로 먼저 확인).
3. 운영자가 관리자 화면에 실제 로그인해 반 생성/이름변경/유닛 추가/
   단어 저장/삭제/쓰기검수 AI 수락 버튼까지 한 번씩 눌러 새
   `admin-content-write` 경로가 정상 동작하는지 실사용 테스트(네트워크
   탭에서 호출 확인).
4. 3번이 전부 정상 확인된 뒤에만 `supabase_v3_11_lockdown_curriculum_
   write.sql` 실행(SQL 파일 이미 저장소에 존재, 미실행 상태) — 이
   순서를 지키지 않으면 adminPin 없는 레거시 경로가 즉시 42501로
   막혀버립니다.
5. (선택, 권장) qa-reviewer가 SQL 실행 전 staging에서 8개 action
   (class.create/rename/delete, unit.create/delete, words.bulk_replace,
   word.accepted_meanings.update, class.update_settings) 왕복 테스트로
   마지막 안전망 확인.

### 2위 — 정원(Garden) 시각화를 Leitner 박스 레벨에 연동

`paul-memory-engine-design.md` 6절이 명시한 최고 ROI 아이디어: **신규
화면 0개**로 기존 게임화(`gardenPlots`)·정서기억(Attachment)·SRS를 한
번에 연결합니다. 지금 정원은 "학습 여부"(단순 clearedCount 임계값)만
반영하는데, 이걸 Leitner 박스 레벨(=실제 기억 정착도)로 바꾸면 "게임화가
진짜 기억과 연결"되는 상태가 됩니다 — 이는 `student-engagement-
psychology.md` 1-9절이 지적한 일반적 약점("게임화는 하게 만드는 힘은
강하지만 그 자체로는 기억 정착과 무관")을 정확히 메우는 지점입니다.
**단, 이 항목은 `word_review_schedule` 테이블(`memory-engine.md` 7절
설계)이 먼저 구현돼야 가능** — 순서상 SRS 기본 구현이 선행 조건이며,
§5 표에서 P2로 별도 배치했습니다.

### 3위 — 신규 단어/복습 인터리빙

현재(`dailyRitual.js`)는 배정 순서 그대로 순차 슬라이스만 하고 신규/복습
단어를 섞는 로직이 없습니다(코드 grep으로 부재 확인, `paul-memory-
engine-design.md` 1.2절). `memory-engine.md`/`paul-memory-engine-
design.md` 3.4절이 공통으로 강한 학습과학 근거(interleaved 연습이
blocked practice보다 장기 파지·전이에 유리, 아동 철자 학습 연구에서
즉시·8주 후 추적검사 모두 오류 감소 확인)를 제시합니다. **DB 스키마
변경 없이 배정 로직 함수(`orderForInterleaving`) 하나만 추가**하면
되는 저비용·고효과 변경이나, "복습 대상" 개념 자체가 SRS(`word_review_
schedule`)에서 나오므로 실질적으로 SRS 구현과 같은 시기(P2)에 착수하는
것이 자연스럽습니다. 예외로, 발음(pronunciation) 학습은 interleaving
대상에서 제외해야 한다는 연구 단서(blocked practice가 발음에는 더
유리)를 반영해야 합니다(`paul-memory-engine-design.md` 3.4절).

---

## 5. Priority 1~5 전체표

| # | 항목 | 우선순위 | 근거 | 예상 공수 | 의존관계 |
|---|---|---|---|---|---|
| 1 | 보안 수정 배포 완결(5단계, §4 1위) | **P1** | 잠재 손실 무한대(교육과정 전체 훼손 가능), 코드/배선/테스트 완료 | 소(운영자 배포 절차 ~반나절) | 없음, 즉시 착수 |
| 2 | 오늘 완료된 감사대응 4건 커밋(AdminScreen 분리/AI in-run 중복제거/모바일 UX 6건) | **P1** | build+verify 이미 PASS, 회귀위험 낮음, 조정자 커밋만 남음 | 소(리뷰+커밋) | 서로 독립, 각각 소커밋 권장(규칙 14) |
| 3 | GitHub Pages 활성 여부 운영자 확인 → 활성 시 즉시 비활성화 | **P1(조건부)** | §0-2/§2-2 — 활성 상태라면 API 없는 그림자 배포가 실사용자에게 지금도 노출 중일 수 있음. `docs/audit/2026-07-24-deployment-scale.md`(6)도 독립적으로 활성 여부를 확정 못 해 동일 조치를 권고(§0-5) | 소(Settings 클릭 또는 워크플로 파일 삭제) | 없음, 확인만 하면 즉시 처리 가능 |
| 3b | Vercel Hobby 플랜 ToS(비상업적 용도 조항) 최신 원문 직접 확인 | **P1(사실확인)** | `docs/audit/2026-07-24-deployment-scale.md`(§0-5) 신규 발견[추정] — 20학원 상업 SaaS 운영이 기술적 용량 문제보다 **약관 위반으로 인한 서비스 정지**를 먼저 유발할 수 있음. 이 감사 세션은 실시간 웹 접근이 차단돼 원문을 확인 못 했다고 명시 | 소(Vercel 공식 약관 페이지 열람뿐, 무료) | 없음. 이 확인 결과가 항목 19(Vercel 유료 전환)의 시급성을 P4에서 앞당겨야 할지 결정하는 게이트 |
| 4 | SRS 기본 구현(`word_review_schedule`, Leitner 6단계) | **P2** | `memory-engine.md` 완성 설계(FSRS/HLR 배제 근거 포함), ROI Top3 #2·#3의 선행 조건 | 중(신규 테이블+클라이언트 갱신 로직+"오늘의 복습" 조회, [추정] 1~2주) | 없음(그린필드), 단 이후 항목 5·6·9의 선행조건 |
| 5 | 신규/복습 인터리빙(`orderForInterleaving`) | **P2** | ROI Top3 #3, 학습과학 근거 강함(interleaving 연구 다수), DB변경 0 | 소(순수 함수 1개) | 항목 4(SRS) 선행 필요 — "복습 대상" 목록이 있어야 교차 배치 가능 |
| 6 | 정원(Garden) 입력값을 Leitner 박스 레벨로 교체 | **P2** | ROI Top3 #2, `paul-memory-engine-design.md` 최고ROI, 신규 화면 0개 | 중(`gardenPlots` 계산 함수 입력 교체) | 항목 4(SRS) 필수 선행 |
| 7 | Reading Foundation 학생 UI | **P2** | 백엔드/스키마/API/관리자 편집기 이미 완료(v3.3), sunk cost 회수, `readingStudentUI` 플래그만 대기 | 중~대(신규 학생 컴포넌트) | 없음(백엔드 이미 구현됨), Raz-Kids 조사(ZPD 원칙)를 UI 설계 참고자료로 활용 권장 |
| 8 | 발음 판정 개선(client-side 파형 비교) | **P2** | AI/STT 비용 0(규칙 7 부합), `student-engagement-psychology.md`가 "가장 근본적 격차"로 진단(발음 녹음이 항상 성공 처리 — 정보성 0인 피드백) | 중(Web Audio API 파형 캡처/시각화, 채점 아님을 UI로 명확히) | 없음 |
| 9 | 관리자 PIN 형식/최소 강도 서버측 검증 | **P3** | 보안 감사 Medium — 학생 PIN엔 `isWeakPin()` 서버 거부가 있으나 관리자 PIN엔 형식 검증 자체가 없음 | 소(독립 소패치) | 없음 |
| 10 | 학원 스코프 쿼리 필터링(`refreshWordLibrary`/`refreshStudents`/`AnalyticsPanel`/`StudentDirectory`) | **P3** | 성능 감사 §1/§3 Critical/High — 현재 무필터 전체 테이블 로드, 2000명 스케일에서 O(전체)로 실행됨. 단 현재 111명 단일학원이라 체감 영향 낮음 | 대(15개 이상 호출부 재검증 필요, 감사 스스로 "별도 설계 세션 필요"로 명시) | `academy_id` 스키마 여부(항목 15)와 설계가 얽힘 — 먼저 확정 권장 |
| 11 | 인덱스 SQL(`supabase_v3_10_perf_indexes.sql`) 실행+효과 측정 | **P3** | 성능 감사 §5, `words.unit_id`/`units.class_id`/`students.class_id` FK 인덱스 부재 — 파일은 이미 존재(`if not exists`, 안전) | 소(운영자 실행 1회 + 실행 전후 쿼리 시간 비교) | 없음, 즉시 실행 가능하나 111명 규모에선 체감 차이 없어 우선순위상 P3 |
| 12 | 관리자 대시보드에 반복오답/Leitner 통계 노출(반별 기억정착률/어려운단어 Top N/복습 밀린 학생) | **P3** | `paul-memory-engine-design.md` 4.6절 설계, 읽기전용 집계라 안전 | 중 | 항목 4(SRS) 데이터 축적 필요 |
| 13 | AI Edge Function N+1 배치화(`bumpWritingAnswerStatAfterAiJudgment`, 최대 400쿼리/요청) | **P3** | 성능 감사 §2 High, fire-and-forget이라 회귀 위험 상대적으로 낮음 | 중 | 없음 |
| 14 | 코드품질 리팩터 B/C(`isMissingRelationError`→`isMissingTableError` 통합, Seoul-offset 날짜 계산 중복 통합) | **P3** | 코드품질 감사 §1-1/§1-2, 09-audit R3 권고가 신규 파일에 전달 안 된 재발 패턴 | 소(순수 predicate/함수 교체) | `useStudent.js`의 `todayStr()`는 절대 건드리지 말 것(09-audit High-risk 명시) |
| 15 | `product_events.limit(20000)` 초과 경고 로그 + 포커스 리프레시 지터 추가 | **P3** | 성능 감사 §3(조용한 데이터 손실 위험)/§4(b)(동시 발화 완화) | 소 | 없음 |
| 15b | 기본 무료 알림 켜기(Vercel/Supabase 기본 제공 배포실패/장애 이메일) | **P3** | `docs/audit/2026-07-24-deployment-scale.md`(6, §0-5) — "장애가 나도 아무도 모르는 구조"가 HIGH로 지적됐으나 무료 티어 내에서 지금(단일 학원, 20학원 확장 여부와 무관) 바로 켤 수 있는 완화책이 명시돼 원 감사의 "새 유료 도구보다 우선" 권고를 그대로 반영해 P4에서 P3로 앞당김 | 소(대시보드 설정 클릭뿐) | 없음 |
| 16 | `getTextbookById` 삭제 | **P5** | 코드품질 감사 §4, 외부 참조 0건 확인 | 소 | 없음 |
| 17 | GitHub Pages 워크플로 삭제(비활성 확인 후) | **P5** | §2-2 — 활성이면 항목 3으로 긴급 처리, 비활성이면 정리만 | 소 | 항목 3의 확인 결과에 따라 분기 |
| 18 | `academy_id` 멀티테넌시 스키마+RLS 재설계 | **P4(조건부)** | 성능/보안 감사 공통 지적 — 현재 스키마에 academy 개념 0, 20학원 확장 시에만 필요. `docs/audit/2026-07-24-deployment-scale.md`(4, §0-5)가 "관리자 PIN·Supabase 키 전역 단일값, RLS 없음"을 **인프라 관점에서 독립적으로 교차 확인**(보안 감사는 DB 스키마 관점) — 두 감사가 서로 다른 각도에서 같은 결론에 도달해 근거가 한층 강해짐 | 대(스키마+RLS+다수 코드 경로 전면 수정) | **실제 20학원 확장이 사업적으로 확정된 경우에만** 착수 |
| 19 | Vercel Hobby→유료 전환 또는 대안 검토 | **P4(조건부, 단 항목 3b 결과에 따라 격상 가능)** | `handoff.md` 다수 세션에서 반복 기록된 "함수 12/12, 여유 0" 제약(deployment-scale 감사가 실측 재확인). **신규 근거**: 같은 감사가 발견한 Vercel Hobby ToS 비상업적 조항[추정, §0-5] — 만약 항목 3b 확인 결과 20학원 상업 운영이 실제로 ToS 위반이라면, 이 항목은 "학생 수 증가로 인한 기술적 필요"가 아니라 "약관 위반으로 인한 서비스 정지 회피"가 되어 P4보다 훨씬 앞당겨져야 함 | 소~중(플랜 변경 자체는 소, 이후 함수 통합 관례 유지 필요) | 확장 결정 + 항목 3b(ToS 확인) 결과 |
| 20 | 관리자 PIN 학원별 분리 | **P4(조건부)** | 현재 전역 단일 `ADMIN_PIN` — deployment-scale 감사(4)가 "학원별 인프라 격리 인프라 레벨에서 전혀 없음"으로 재확인, 무료 티어 내에서 가능한 조치로 명시 | 중 | 항목 18(academy_id) 선행 |
| 21 | 정교한 모니터링/알림 인프라 구축(장애 자동 탐지, 학원별 대시보드 등) | **P4(조건부)** | 확장 시 필요한 본격 인프라 — 즉시 가능한 기본 알림은 항목 15b로 분리해 앞당김, 이 항목은 그 이상의 체계(예: 학원별 SLA 모니터링)가 필요해지는 확장 확정 이후로 유지 | 중~대 | 확장 결정 |
| 22 | 진짜 rate limit(공유 KV 스토어, 관리자 PIN 병렬 브루트포스 방어) | **P4(정책 결정)** | 보안 감사 — Vercel 서버리스 수평확장 특성상 고정 지연만으론 병렬 공격에 무력. 단 규칙 6(외부 의존성 최소화)과 정면 충돌, 운영자가 이미 여러 세션째 보류 결정 | 중(신규 외부 의존성 필요) | 운영자 정책 결정 선행 |
| 23 | `api/generate-audio.js` 모델 전환 검토(Claude Haiku→gpt-5-nano급) | **P5** | AI비용 감사 발견5 — 단가 20배(입력)/12.5배(출력) 차이지만 호출 빈도 낮아(신규 단어 등록 1회성) 절대 임팩트 작음 | 소 | 없음, 우선순위 낮게 유지 |
| 24 | 발음 즉시 재도전/난이도 실시간 조정/정원 배치/콤보 연출/순서 선택권(설계 2~6) | **P5(탐색적)** | `student-engagement-psychology.md` 격차 2~6, 전부 opt-in·저위험이나 UI 상호작용 구현 공수 큼 | 중(항목별 상이) | 항목 8(설계1, 파형 피드백) 이후 순차 진행 권장(원 문서 6절) |
| 25 | Dual Coding(`image_emoji`)/학생 연상메모/신체화 힌트/Montessori 순서선택권/교사 정착률 대시보드 | **P5(탐색적)** | `paul-memory-engine-design.md` 4절, "1~3 이후 순차 진행 권장"(원문 6절) | 항목별 상이(소~중) | 항목 4·5·6(SRS/interleaving/정원) 이후 |
| 26 | 학부모 넛지 채널(무료 옵션 조사 후) | **P5(탐색적)** | `competitor-analysis.md`가 지적한 "외부 트리거(알림/위젯) 부재" 갭 — 2부 조사에서도 대체 아이디어 못 찾음 | 미정(무료 대안 조사 선행 필요) | 규칙 7(무료 대안 우선) 검토 선행 |
| 27 | 반단위 통계 기반 SRS 간격표 미세조정 | **P5(탐색적)** | `memory-engine.md` 8절 "향후 확장 경로, 지금 하지 않음" | 소(반 평균 정답률 반영 정도) | 항목 4(SRS) 실운영 데이터 축적 필요 |
| 28 | `studentId` 호출자 바인딩(세션 토큰) | **P5(백로그)** | 보안 감사 Low — 위협모델(결제/PII 없음, 학원 내부 랭킹 한정)상 우선순위 낮음, 설계 변경 범위 큼 | 대(세션 토큰 아키텍처 도입) | 없음, 낮은 우선순위 유지 |

---

## 6. 6개월 로드맵

**목표: P1 전부 + P2 전부 완료 + P3 착수.**

- **0~1주차**: P1 전체 처리(§5 항목 1~3, 3b) — 보안 수정 5단계 배포,
  오늘 완료된 4건 커밋, GitHub Pages 활성 여부 확인 및 필요 시 비활성화,
  Vercel Hobby ToS 원문 확인(항목 3b — 무료, 열람만 하면 됨). 이 항목들은
  코드가 이미 완성돼 있거나(보안수정/4건 커밋) 순수 사실확인(Pages/ToS)
  이라 "구현"이 아니라 "실행/확인" 작업이 대부분이며, 지연될수록 §4
  1위의 "무한대에 가까운 잠재 손실"이 계속 노출된 상태로 유지됩니다.
  항목 3b의 확인 결과에 따라 항목 19(Vercel 유료 전환)의 착수 시점이
  이 6개월 로드맵 안으로 앞당겨질 수 있음을 4~6개월차 계획에 반영해
  두었습니다.
- **1주~1개월차**: SRS 기본 구현(`word_review_schedule`, 항목 4) 착수.
  `memory-engine.md` 7절 설계를 그대로 SQL 파일화(운영자 실행) →
  클라이언트 갱신 로직(퀴즈/쓰기시험 채점 직후 upsert) → "오늘의 복습"
  조회 함수까지. 이 항목이 완료돼야 항목 5·6·12가 순차로 열립니다.
- **1~2개월차**: 인터리빙(항목 5) + 정원-Leitner 연동(항목 6)을 SRS
  완료 직후 이어서 착수 — 둘 다 신규 화면 0개, DB 변경도 항목 6만
  "기존 계산 함수 입력 교체" 수준이라 상대적으로 빠르게 완료 가능.
- **2~3개월차**: Reading Foundation 학생 UI(항목 7) — 이미 완성된
  백엔드 위에 신규 UI를 얹는 작업이라 가장 공수가 크지만(sunk cost가
  이미 투입돼 있어 회수 가치가 큼), 원장/교사가 체감할 수 있는 신규
  학습 영역이라 P2 중 우선순위를 앞쪽에 둘 근거가 있습니다.
- **3~4개월차**: 발음 판정 개선(파형 비교, 항목 8) — `student-
  engagement-psychology.md`가 "가장 근본적 격차"로 지목한 항목이므로
  P2 중 순서상 마지막이더라도 6개월 내 반드시 착수.
- **4~6개월차**: P3 착수 — 우선순위는 §5 표 순서대로: 관리자 PIN 강도
  검증(항목 9, 즉시 가능한 저위험) → 인덱스 SQL 실행+효과측정(항목 11,
  운영자 액션만 필요) → **기본 무료 알림 켜기(항목 15b, 배포실패/장애
  이메일 — deployment-scale 감사가 "새 유료 도구보다 우선"으로 명시한
  거의 무비용 조치라 이 구간에서 가장 먼저 처리해도 무방)** →
  `product_events` 경고 로그+포커스 지터(항목 15, 저위험) → 코드품질
  리팩터 B/C(항목 14) 순으로, 완료 여력에 따라 Leitner 통계 노출(항목
  12)·AI Edge Function 배치화(항목 13)·학원 스코프 쿼리 필터링(항목 10,
  가장 큰 설계 결정이므로 6개월 시점에는 "설계 착수"까지만 목표로 잡는
  것을 권장)까지 진행. 만약 0~1주차 항목 3b(Vercel ToS 확인) 결과가
  "20학원 상업 운영은 명백한 ToS 위반"으로 나온다면, 이 구간에 항목
  19(Vercel 유료 전환)의 최소 조치(플랜 업그레이드 자체)를 조기 편입하는
  것을 권장합니다 — 이 경우는 "확장 결정"이 아니라 "약관 준수" 사유이므로
  §5의 조건부 표기와 별개로 예외 처리합니다.

---

## 7. 1년 로드맵

**목표: P3 완료 + P4 조건부 착수(확장 결정이 내려진 경우).**

- **6~9개월차**: P3 잔여 항목 완료 — 특히 학원 스코프 쿼리 필터링
  (항목 10)은 가장 큰 설계 결정(회귀 위험 높음, 감사 스스로 "별도 설계
  세션 필요"로 명시)이므로 이 구간에서 전담 세션을 배정해 마무리를
  권장합니다. 이 시점에 `academy_id` 스키마 필요 여부(항목 18)에 대한
  운영자 사업 결정이 함께 내려지는 것이 이상적 — 두 결정이 얽혀 있어
  (§5 항목 10 의존관계 참고) 따로 두 번 설계하는 것보다 한 번에
  정리하는 편이 효율적입니다.
- **9~12개월차**: 만약 이 시점까지 **실제 20학원 확장이 사업적으로
  확정**됐다면 P4 착수 — `academy_id` 스키마+RLS 재설계(항목 18) →
  Vercel Hobby→유료 전환(항목 19, 단 항목 3b의 ToS 확인 결과가 이미
  0~1주차에 나와 있어야 함) → 관리자 PIN 학원별 분리(항목 20) → 정교한
  모니터링/알림 인프라(항목 21) 순. 확장이 확정되지 않았다면 이 구간은
  P5 탐색 항목(§8) 중 데이터가 이미 쌓인 것(SRS 실운영 데이터 기반
  항목 27 등)을 검토하는 시간으로 대체합니다 — **확장 여부가 불확실한
  채로 P4를 선제 구현하는 것은 헌법 규칙 6(외부/불필요 복잡도 최소화)
  위반**이라는 점을 `docs/audit/2026-07-24-ai-cost.md` 발견 6이 이미
  명시적으로 경고했고, `docs/audit/2026-07-24-deployment-scale.md`의
  academy 격리 부재(4)·Vercel ToS(§0-5) 발견도 "지금 당장 구현"이 아니라
  "확장 결정이 내려지는 순간 즉시 착수할 수 있도록 설계만 미리 정리해
  둔다"는 같은 원칙으로 다뤄야 합니다.
- **정책 결정 필요 항목**: 진짜 rate limit(항목 22)은 1년 시점에도
  "운영자 정책 결정 대기" 상태로 남을 수 있습니다 — 이는 방치가 아니라
  이 저장소가 반복적으로 내려온 의도된 트레이드오프(규칙 6 vs 보안
  강화)이므로, 매 분기 재검토 체크포인트로만 유지하고 강제 완료 기한을
  두지 않는 것을 권장합니다.

---

## 8. 세계 최고 수준까지의 로드맵 (지속적 데이터 기반 재평가 루프)

이 절의 결론은 "완성"이 아니라 **"계속 실측하며 조정한다"**입니다 —
`memory-engine.md`가 Leitner 설계의 마지막 원칙으로 못박은 "파라미터
튜닝은 자동 재학습 파이프라인이 아니라 운영 데이터 기반 수동 조정"
철학을 이 문서 전체의 결론으로 그대로 계승합니다.

- **P5 탐색 항목(§5 항목 23~28)은 고정된 착수 시점이 없습니다.** 각
  항목은 선행 항목(SRS 실운영, 파형 피드백 실사용 반응 등)이 실제
  데이터를 만들어낸 뒤에만 착수 여부를 재평가합니다 — 예: 항목 27(반단위
  간격표 미세조정)은 SRS가 몇 달 이상 실운영돼 반별 정답/오답 로그가
  "수천 건 이상" 쌓인 뒤에야 의미가 생깁니다(`memory-engine.md` 8절
  원문 조건).
- **관찰 인프라(익명 관찰 레이어, `product_events` 1/3/7일 복귀율
  대시보드)가 이미 코드 완료 상태입니다**(`ROADMAP.md` 2026-07-23,
  SQL 미실행 대기) — 이 로드맵의 P2/P3 항목들이 배포된 뒤, "무엇이
  리텐션을 실제로 올렸는지"를 추측이 아니라 이 대시보드로 실측하는
  것이 세계 최고 수준으로 가는 핵심 루프입니다. `competitor-
  analysis.md`가 지적한 "외부 트리거(알림/위젯) 부재"라는 남은 갭도,
  새 기능을 먼저 만들기보다 이 실측 인프라로 "정말 필요한지"부터
  검증하는 순서를 권장합니다.
- **분기별 재평가 체크포인트를 두는 것을 권장합니다**: (1) SRS/
  Interleaving/정원 연동(P2) 배포 후 1개월 — `product_events` 복귀율
  변화 확인. (2) 발음 파형 피드백(P2) 배포 후 1개월 — 학생이 실제로
  이 화면에서 얼마나 머무는지, 발음 재시도율이 늘었는지 관찰. (3)
  분기마다 이 문서 §5 표를 재검토해 완료 항목을 걷어내고, 새로 발견된
  기술부채/감사 결과를 추가하는 append(신규 섹션 삽입, 기존 섹션은
  보존) 방식으로 갱신.
- **"세계 최고 수준"의 정의 자체가 이 프로젝트에서는 특정 기능 집합이
  아니라 프로세스입니다**: (a) 학생 대상 신규 기능은 절대 이번
  "AI 개발 운영체제" 세션 범위에서 구현하지 않는다는 규칙 12를 계속
  지키면서, (b) 매 분기 실측 데이터로 §3의 금지 목록과 §5의 우선순위를
  재확인하고, (c) 경쟁 제품이 실패한 패턴(Tinycards의 무차별화 UGC,
  Reading Eggs/Raz-Kids의 코스메틱 상점, Memrise의 손실회피 스트릭)을
  반면교사로 계속 참고하되 성공 패턴(Duolingo의 승산 있게 스코프된
  경쟁, Raz-Kids의 ZPD 원칙, Quizlet의 형식 다양성)은 이미 흡수했거나
  흡수 중인 상태를 유지하는 것 — 이것이 "계속 실측하며 조정"이라는
  결론의 구체적 실천 방법입니다.

---

## 9. 출처

오늘(2026-07-24) 생성된 문서 전부와, 이 로드맵 작성 근거가 된 기존
문서를 함께 남깁니다.

**감사 문서(6개 — §0-1에서 확인한 대로 `deployment-scale.md`는 이 세션의
최초 읽기 시점엔 없었고 작업 도중 조정자가 생성해 추가로 읽고 반영함)**:
- `C:\voca\docs\audit\2026-07-24-security.md`
- `C:\voca\docs\audit\2026-07-24-performance-db.md`
- `C:\voca\docs\audit\2026-07-24-mobile-ux.md`
- `C:\voca\docs\audit\2026-07-24-code-quality.md`
- `C:\voca\docs\audit\2026-07-24-ai-cost.md`
- `C:\voca\docs\audit\2026-07-24-deployment-scale.md`(§0-5·§5 표
  항목 3b/15b/18~21 근거 — 서버리스 함수 12/12, Vercel Hobby ToS[추정],
  학원별 인프라 격리 부재, 모니터링 전무 4개 HIGH 발견)

**연구 문서(5개)**:
- `C:\voca\docs\research\memory-engine.md`
- `C:\voca\docs\research\paul-memory-engine-design.md`
- `C:\voca\docs\research\competitor-analysis.md`
- `C:\voca\docs\research\competitor-analysis-part2.md`
- `C:\voca\docs\research\student-engagement-psychology.md`

**기존 저장소 문서(사실 검증에 사용)**:
- `C:\voca\ROADMAP.md`
- `C:\voca\PROJECT_GUIDE.md`
- `C:\voca\DATABASE.md`
- `C:\voca\CLAUDE.md`(저장소 헌법 18개 규칙)
- `C:\voca\handoff.md`(Vercel Hobby 12/12 함수 한도 반복 기록 등)
- `C:\voca\.github\workflows\deploy.yml`(GitHub Pages 병행 배포, 직접 코드 확인)
- `C:\voca\.ai-status\implementer-security-lockdown-curriculum.json`
- `C:\voca\.ai-status\implementer-security-adminpin-wiring.json`
- `C:\voca\.ai-status\implementer-security-adminpin-writing-review-gap.json`
- `C:\voca\.ai-status\implementer-test-arity-fix.json`
- `C:\voca\.ai-status\implementer-adminscreen-split.json`
- `C:\voca\.ai-status\implementer-mobile-ux-fixes.json`
- `C:\voca\.ai-status\implementer-ai-dedup-optimization.json`
- `C:\voca\.ai-status\docs-maintainer-audit-transcription.json`
- `C:\voca\supabase_v3_10_perf_indexes.sql`(이미 파일 존재, 미실행)
- `C:\voca\supabase_v3_11_lockdown_curriculum_write.sql`(이미 파일 존재, 미실행)
