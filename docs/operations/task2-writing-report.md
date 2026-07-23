# Task 2 — 쓰기 답안 검토 AI 보조 구현 보고서

**작성**: writing-review-specialist(코디네이터 지시로 writing-review-analyst에서 전환)
**작성일**: 2026-07-23
**기준 HEAD(작업 시작)**: `0845d4f`(Task 1 시즌 생애주기 커밋 직후)
**커밋/push**: 하지 않음 — 코디네이터 리뷰 후 단독 커밋 예정(작업 트리에만 반영)
**전제 문서**: `docs/operations/task2-writing-analysis.md`(분석 단계 산출물 — 조사 근거/아키텍처 선정 이유는 그 문서 참고, 여기서는 반복 안 함)

---

## 0. 요약

분석 문서(§16)가 권고한 아키텍처 그대로 구현했다: Supabase Edge Function(`grade-writing-answers`) + 판정 캐시 테이블(`spelling_ai_grading_cache`, v3.6) + `writingReviewAiAssist` feature flag(기본 OFF) + 기존 `SpellingReviewQueuePanel` 확장(기존 수동 인정/무시 로직은 1줄도 안 바꿈). 규칙 기반 파이프라인(1~9단계)과 배치/캐시/AI 오류 처리 로직은 전부 순수 함수(`supabase/functions/grade-writing-answers/pipeline.js`)로 작성해 Deno(Edge Function 실제 실행)와 Node(테스트 하네스) 양쪽에서 그대로 재사용한다. **AI 호출은 전부 mock으로 테스트**(로컬에 `ANTHROPIC_API_KEY` 없음, 실제 Anthropic API 호출 0회). `npm run build` PASS, `npm run verify:all` — writing 도메인 포함 전 도메인 PASS(login FAIL은 기지 로컬 환경 한계, 아래 §5에서 실측 확인). 라이브 DB는 이번 구현 세션에서 SELECT조차 하지 않았다(테스트가 전부 픽스처 기반).

---

## 1. 변경 파일 (기존 파일 수정)

| 파일 | 변경 내용 |
|---|---|
| `src/components/AdminScreen.jsx` | `SpellingReviewQueuePanel`에 AI 보조 섹션 추가(§3). 기존 `load`/`accept`/`dismiss` 함수와 두 버튼(✅ 인정/무시)은 **문자 그대로 보존**(diff 실측: 제거된 22줄 전부 재작성 범위 내, `season` 관련 줄 0건 — Task 1 파일 불가침 확인). 렌더 호출부에 `adminPin={pin}` prop 추가. |
| `src/config/features.js` | `writingReviewAiAssist: false` 플래그 추가(기본 OFF). |
| `tests/harness/registry.mjs` | `writing` 도메인 `checks` 배열에 `scripts/testWritingReviewAiPipeline.mjs`를 `extra: true`로 등록(13개 필수 도메인 밖, 보너스 커버리지 — 기존 관례 그대로). |

`git diff --stat HEAD`: 3 files changed, 213 insertions(+), 21 deletions(-) — Task 1 소유 파일(`seasonApi.js`/`api/start-new-season.js`)은 diff에 전혀 등장하지 않음(건드리지 않았음, 실측 확인).

## 2. 신규 파일

| 파일 | 역할 |
|---|---|
| `supabase/functions/grade-writing-answers/pipeline.js` | 순수 로직(정규화/편집거리/lemma 힌트/배치/캐시키/AI 프롬프트·응답 파싱/비용 추정/adminPin 비교) — Deno와 Node 양쪽에서 import. 외부 의존성은 `src/utils/spelling.js`(재사용, 규칙 3) 하나뿐. |
| `supabase/functions/grade-writing-answers/index.ts` | Deno Edge Function 본체 — admin 재인증 → pending SELECT(쓰기 없음) → pipeline.js로 분류 → Anthropic raw fetch(unresolved만) → 캐시 upsert(성공한 AI 판정만) → 제안 배열 + 토큰/비용 응답. **배포는 운영자 수동**(§6). |
| `supabase_v3_6_writing_review_ai_cache.sql` | 캐시 테이블 DDL(멱등, 미실행) — §6. |
| `src/utils/spellingReviewBulkPlan.js` | 클라이언트 일괄 액션 "계획" 순수 로직(선택 필터, 중복 답안 탐색, 인정 계획, high-confidence 선별, 필터, 완료 요약). supabaseClient 의존 없음 — Node에서 직접 테스트. |
| `src/utils/spellingReviewAiApi.js` | 브라우저 전용 실행 레이어 — Edge Function 호출(미리보기) + 기존 `setWordAcceptedMeanings`/`resolveSpellingReview` 재사용(인정/무시 실제 실행). 새 DB 쓰기 경로 추가 없음. |
| `scripts/testWritingReviewAiPipeline.mjs` | 26개 섹션, 약 80개 단언 — §5. |

## 3. 관리자 UI(요구 항목 대조)

`SpellingReviewQueuePanel`에 `writingReviewAiAssist` 플래그가 켜졌을 때만 나타나는 섹션 추가:

- **AI 자동분류 미리보기** 버튼("분석 시작") — 클릭 시 `previewAiClassification`으로 Edge Function 1회 호출.
- **분석 대상 건수 / 진행 상황** — 요약 텍스트("분석 대상 N건")와 로딩 중 "분석 중...(배치 처리 중)" 표시. **정직한 한계**: 서버가 배치 4~5개를 한 요청/응답 안에서 순차 처리(스트리밍 아님)라 배치별 진행률 바는 없음 — 단일 로딩 상태만 제공(§8 위험 목록에도 기록).
- **high-confidence accept 수 / review 수 / reject_candidate 수** — `aiSummary`로 표시(accept/review/rejectCandidate 카운트 + 캐시 히트 건수).
- **전체 선택 / 선택 인정 / 선택 무시** — 체크박스 + 버튼.
- **high-confidence 제안 일괄 인정** — confidence ≥ 0.8인 accept 제안만 골라 한 번에 인정.
- **동일 답안 일괄 인정** — 같은 단어 + 정규화 후 동일 문자열인 다른 pending 행이 있으면 행별로 "동일 답안 N건 전부 인정" 버튼 노출.
- **답안을 인정 동의어로 저장** — 행별 "인정 변형으로 저장" 버튼(v1에서는 "이 답안만 인정"과 저장 결과가 같음 — §3-1에 이유 기록).
- **AI 근거·confidence 표시** — 행마다 판정 배지(🤖 인정 제안/거부 제안/검토 필요, 신뢰도 %, 캐시 여부, 근거 문장, 품사 경고).
- **단어·판정별 필터** — 드롭다운(판정) + 텍스트 입력(단어 검색). **학생별 필터는 미구현**: `fetchPendingSpellingReviews()`가 반환하는 행에 학생 "이름"이 없다(`spellingReviewApi.js:64` — `studentId`만 있고 이름 조회는 별도 join 필요, 이번 세션에서 그 함수를 수정하지 않았으므로 — 규칙 16, 소유 파일 아님 — 학생명 표시 자체가 불가능했다). `filterProposals`(`spellingReviewBulkPlan.js`)는 `studentQuery` 파라미터를 이미 받아 학생 필터 로직 자체는 준비돼 있으니, 후속 세션이 `spellingReviewApi.js`(자기 소유로) 학생 이름 join을 추가하면 UI 필터도 바로 켜진다.
- **완료 요약** — 일괄 처리 후 "인정 N건 완료, 실패 M건" 배너.
- **인정 시 3옵션** — "이 답안만 인정"(기존 버튼, 무변경) / "인정 변형으로 저장" / "동일 N건 전부 인정"(중복 행 있을 때만 노출) — 3개 버튼으로 구현(모달 대신, 시간 대비 실용적 선택).

### 3-1. "인정 변형으로 저장" 모드가 v1에서 answer_only와 동일한 이유

`spellingReviewBulkPlan.js`의 `planAccept()`가 `mode: 'synonym'`을 이미 별도 분기로 받아두었지만, v1에서는 `answer_only`와 동일하게 원문 그대로 `accepted_meanings`에 추가한다(표기 정규화 없음). 확장 지점만 마련해두고 실제 정규화 로직(예: 조사 표준화)은 이번 범위에 넣지 않았다 — 섣부른 정규화가 오히려 오답을 인정 처리할 위험(예: 조사만 다른데 뜻이 다른 경우)이 있어, 분석 문서 §10 5단계 각주의 "오탐 방지" 원칙과 같은 이유로 보수적으로 남겨뒀다.

---

## 4. DB 변경 — 실행 안 함(운영자 수동)

`supabase_v3_6_writing_review_ai_cache.sql` — **에이전트가 실행하지 않았다**(헌법 규칙 8). 내용 요약:

- `spelling_ai_grading_cache` 테이블 신규(멱등 `create table if not exists`) — `word_id`(FK words, cascade), `meaning_snapshot`, `normalized_answer`, `decision`(체크 제약 3종), `confidence`, `reason`, `suggested_synonym`, `part_of_speech_warning`, `decision_source`, `model`, `input_tokens`, `output_tokens`, `created_at`. Unique(`word_id`,`meaning_snapshot`,`normalized_answer`).
- RLS: anon/authenticated는 **SELECT만** 허용(기존 테이블들의 "anon 전체 허용" 관례보다 한 단계 더 보수적 — 실제 쓰기는 Edge Function의 service_role만 함).
- **실행 순서 무관 안전**: 미실행 상태에서도 앱이 안 깨짐 — Edge Function이 이 테이블 조회/기록 실패 시 `cacheTableMissing` 플래그로 캐시 없이 계속 진행(`index.ts`), 기존 `spelling_review_queue`/`words` 워크플로우와는 완전히 무관.

## 5. 테스트 결과

### 5-1. 신규 테스트 — `scripts/testWritingReviewAiPipeline.mjs`(26개 섹션, 픽스처 전용, AI는 전부 mock)

```
node scripts/testWritingReviewAiPipeline.mjs
→ 모든 테스트 통과 ✅ (25개 섹션 PASS + 1개 섹션 정직한 SKIP 3건)
```

커버 항목(요구된 시나리오 전부 대조):
완전일치/공백/문장부호/대소문자/Unicode(NFD→NFC)/이미 등록된 동의어/품사 불일치(힌트만, 미확정)/비슷하지만 틀린 뜻(로컬 미확정→AI)/완전 오답(로컬 미확정→AI)/중복 답안(캐시 히트로 AI 재호출 안 함)/AI 실패(review 강등)/잘못된 JSON(review 강등, `parse_error`)/99건 픽스처 배치(4개 배치, 25×3+24)/미리보기가 어떤 답안 status도 안 바꿈(순수성 검증)/선택 인정이 선택된 레코드만 갱신/동의어 저장 후 재분류 시 즉시 accept(라운드트립)/수동 폴백(`spellingReviewApi.js` 무변경 소스 검증)/RLS·관리자 인증(`verifyAdminPin` 성공/실패/누락/타입 오류 4종) + 비용 추정 + 프롬프트/파싱 계약 + 클라이언트-서버 정규화 함수 드리프트 가드.

**정직하게 로컬 검증 불가로 SKIP 처리한 3건**(가짜 PASS 아님):
1. 실제 Supabase Edge Function e2e 호출 — 배포 후 스테이징에서 확인 필요.
2. `spelling_ai_grading_cache` RLS(anon INSERT 거부) 실측 — SQL 실행 후 확인 필요.
3. 실제 Claude Haiku 4.5 응답 스키마 준수율 — 로컬에 `ANTHROPIC_API_KEY` 없음, mock 파싱 로직만 검증됨.

### 5-2. `npm run build`

PASS(에러 0). 청크 크기 경고(500KB 초과)는 기존에도 있던 것(AdminScreen.jsx가 원래도 큰 파일)이고 이번 변경으로 새로 생긴 카테고리의 경고는 아님.

### 5-3. `npm run verify:writing`

```
PASS  scripts/testSpelling.mjs (exit 0)
PASS  scripts/testSpellingDirectionWiring.mjs (exit 0)
PASS  scripts/testWritingReviewAiPipeline.mjs (exit 0)
=== summary ===
  PASS  writing — 쓰기시험(스펠링 채점 / 방향 배선) (3개 스크립트)
```

### 5-4. `npm run verify:all`(20개 도메인 + extra)

전 도메인 PASS, 단 **`login` 도메인만 FAIL**(`testStudentSelectPinStatus.mjs`, `testStudentPinAuth.mjs`, `testStudentPinSelfSetup.mjs`, `testClearStudentPin.mjs`) — 이는 이번 작업과 무관한 **기지 로컬 환경 한계**로, 직전 세션 커밋(`6f5d6bd`)이 이미 "verify:all 20도메인 PASS(login FAIL은 기지 로컬 환경 한계...)"로 문서화해둔 것과 동일한 사전 존재 이슈다(PIN 관련 파일을 이번 세션에서 전혀 건드리지 않았음 — 회귀 아님). `speaking`/`listening`은 기존과 동일하게 정직한 SKIP(하드웨어 필요).

## 6. 운영자 실행 필요 항목(에이전트가 실행 불가)

### 6-1. SQL(멱등, 언제 실행해도 앱이 안 깨짐)

```sql
-- Supabase 대시보드 SQL Editor에서 전체 실행
-- 파일: supabase_v3_6_writing_review_ai_cache.sql
```

### 6-2. Edge Function 배포

```sh
supabase functions deploy grade-writing-answers
```

### 6-3. 시크릿(Vercel 환경변수와 별개 — Supabase 프로젝트에 따로 설정)

```sh
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  ADMIN_PIN=<기존 Vercel ADMIN_PIN과 동일한 값> \
  SUPABASE_URL=<프로젝트 URL> \
  SUPABASE_SERVICE_ROLE_KEY=<서비스 롤 키>
```

`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 함수 실행 환경에 자동 주입하는 경우가 있으니, 배포 후 함수 로그에서 "Server not configured" 오류가 뜨면 그때 수동으로 채울 것(`index.ts` 주석에 명시).

### 6-4. feature flag ON은 운영자 판단

`src/config/features.js`의 `writingReviewAiAssist`를 `true`로 바꾸는 커밋(또는 배포된 앱에서 향후 관리자 UI로 토글하는 구조가 생기면 그쪽)은 위 §6-1~6-3이 전부 끝난 뒤, 그리고 이 보고서 §7 배포 전 체크리스트를 통과한 뒤 운영자가 별도로 판단. 학생 화면과 무관한 관리자 전용 기능이라 서두를 필요 없음.

## 7. 배포 전 체크리스트

- [ ] `supabase_v3_6_writing_review_ai_cache.sql`을 Supabase SQL Editor에서 실행 — 성공 메시지 확인
- [ ] `supabase functions deploy grade-writing-answers` 실행 — 배포 성공 확인
- [ ] 4개 시크릿(`ANTHROPIC_API_KEY`/`ADMIN_PIN`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) 설정 확인(`supabase secrets list`)
- [ ] 스테이징에서 실제 관리자 PIN으로 Edge Function을 1회 수동 호출(curl 또는 브라우저 devtools) — 정상 JSON 응답(`ok:true`) 확인, `adminPin` 틀렸을 때 `not_authorized` 확인
- [ ] `spelling_ai_grading_cache`에 anon key로 직접 INSERT 시도 — 거부(42501) 확인(§4 RLS 설계가 실제로 막는지)
- [ ] `writingReviewAiAssist: false` 상태로 먼저 배포해 기존 화면에 전혀 변화 없는지 확인(플래그 OFF 회귀 없음)
- [ ] 그 다음에만 관리자 1인 계정에서 `writingReviewAiAssist: true`로 전환해 실제 pending 몇 건으로 "분석 시작" 버튼 수동 테스트(비용은 §8 기준 몇 센트 수준)
- [ ] 미리보기 실행 전/후 `spelling_review_queue`/`words.accepted_meanings`가 SELECT 기준으로 정말 불변인지 관리자 화면에서 육안 확인(§ preview-only 최종 확인)

## 8. 데이터 보존 증거

- 이번 구현 세션은 **라이브 DB에 대해 어떤 SELECT/INSERT/UPDATE/DELETE도 실행하지 않았다** — 모든 테스트가 픽스처(`scripts/testWritingReviewAiPipeline.mjs`의 `F.*` 객체) 기반이고, Edge Function/클라이언트 API 코드는 작성만 하고 로컬에서 실행하지 않았다(Deno 런타임 자체가 로컬에 없음, 실행 시도 없음).
- `classifyBatch`(pipeline.js)에 대한 순수성 테스트(§5-1 "12. 미리보기 순수성")가 이 함수 자체가 어떤 외부 상태도 변경하지 않음을 코드 레벨로 증명한다.
- 기존 수동 인정/무시 경로(`resolveSpellingReview`/`setWordAcceptedMeanings`)는 이번 세션에서 그 두 함수가 정의된 파일(`spellingReviewApi.js`/`wordLibrary.js`)을 **전혀 수정하지 않았다**(git diff에 두 파일 모두 등장하지 않음) — 기존 e2e(`scripts/testSpellingV2Db.mjs`, 이번 세션에서 재실행하지 않았으나 소스 무변경이라 회귀 위험 없음)가 여전히 유효하다.

## 9. 99건 예상 비용(분석 문서 §13-2 재확인 + 테스트 단언으로 고정)

`scripts/testWritingReviewAiPipeline.mjs` 섹션 20이 가격표(claude-api 스킬 확인, Haiku 4.5 $1/$5 per 1M 토큰, Sonnet 5 $3/$15)와 "99건 전량 AI 처리 시 추정 입력 22,000/출력 10,000 토큰 → 10센트 미만"을 코드 레벨 단언으로 고정해뒀다. 실제로는 규칙 기반 1~9단계가 상당수를 로컬에서 먼저 해소하므로(분석 문서 §10 표: 편집거리+lemma로 ~29% 사전 해소 추정) AI로 가는 건수는 99건보다 적을 가능성이 높고, 그만큼 실제 비용은 이 10센트 상한보다 낮아질 것으로 예상.

## 10. 롤백 방법

- **코드**: 이번 작업은 아직 커밋되지 않았다(작업 트리에만 존재) — 코디네이터가 리뷰 후 커밋하지 않기로 하면 `git checkout -- src/components/AdminScreen.jsx src/config/features.js tests/harness/registry.mjs` + 신규 파일 삭제(`rm -rf supabase/ src/utils/spellingReviewAiApi.js src/utils/spellingReviewBulkPlan.js scripts/testWritingReviewAiPipeline.mjs supabase_v3_6_writing_review_ai_cache.sql`)만으로 완전히 원상복구.
- **커밋된 이후 롤백**: `writingReviewAiAssist`를 `false`로 되돌리는 것만으로 학생/관리자 화면 동작은 즉시 v2.0(기존 수동 워크플로우)과 동일해진다 — 코드를 되돌릴 필요 없이 플래그 하나로 기능 전체를 끌 수 있음(이게 이 설계의 핵심 안전장치).
- **DB 롤백**(SQL을 이미 실행한 경우): `spelling_ai_grading_cache` 테이블은 다른 어떤 테이블과도 FK로 참조되지 않으므로(words가 이 테이블을 참조당하는 쪽) `drop table if exists spelling_ai_grading_cache;` 한 줄로 안전하게 제거 가능 — `words`/`spelling_review_queue`는 전혀 영향 없음.
- **Edge Function 롤백**(이미 배포한 경우): `supabase functions delete grade-writing-answers` — 클라이언트는 그 이후 미리보기 호출이 실패하지만(네트워크 오류), `previewAiClassification`의 실패는 UI에서 에러 배너로만 표시되고 기존 인정/무시 버튼에는 영향이 없다(§ 폴백 보존 설계 그대로).

---

## 11. 남은 작업 / 후속 세션에 넘길 것

- 학생 이름 필터(§3에서 설명한 이유로 이번 범위에서는 UI 로직만 준비, `spellingReviewApi.js`에 student 이름 join 추가는 그 파일 소유 세션 몫).
- "인정 변형으로 저장" 모드의 실제 표기 정규화(§3-1) — v1은 의도적으로 보류.
- 실제 배포 후 §7 체크리스트 실행 및 Edge Function 로그 기반 실측 토큰/비용(§9는 추정치 — 실측으로 갱신 필요).
