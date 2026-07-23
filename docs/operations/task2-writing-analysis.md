# Task 2 — 쓰기 답안 검토 유사 답안 일괄 처리: 분석 + 구현 계획

**작성**: writing-review-analyst (읽기 전용 분석 세션)
**작성일**: 2026-07-23
**상태**: 조사 완료, 구현 미착수(코디네이터 Task 1 완료 후 별도 지시 대기)
**기준 커밋**: 조사 시작 시점 HEAD(seasonApi.js/api/start-new-season.js/AdminScreen.jsx/ticketEconomy.js/houseSystem.js/scripts/testSeasonal\* 등 Task 1 소유 파일은 "현재 diff"가 아니라 이 시점 커밋된 버전 기준으로만 인용)

---

## 0. 요약 (TL;DR)

- 라이브 pending 답안 수 **실측 99건**(운영자 언급과 일치) — REST API `Content-Range: 0-0/99` 직접 확인(§1).
- 기존 시스템은 이미 "다중 정답 후보 채점 엔진"(`spelling.js`)과 "교사 검토 큐 + 원클릭 인정"(`spellingReviewApi.js` + `AdminScreen.jsx`)을 갖추고 있음 — **새로 발명할 게 아니라 그 위에 AI "제안" 레이어 하나만 얹는 작업**.
- **AI 연동 전무**(헌법 규칙 7 그대로 유지 — 학부모 리포트가 규칙 기반 템플릿인 선례와 동일 원칙).
- Vercel Hobby 함수 12/12, 여유 0 — 신규 `api/*.js` 절대 불가(핸드오프/체크포인트 문서 실측 재확인). `admin-pin-actions.js`는 자신의 헤더 주석에서 "다른 신뢰 경로 섞지 말 것"을 명시적으로 금지 — 이 파일에 AI 액션을 추가하는 것은 그 경고를 정면으로 어기는 선택. 결론: **Supabase Edge Function**을 권장(§7).
- 99건 실측 샘플을 전부 읽고 손으로 분류한 결과, 순수 문자열 정규화(1~6단계)만으로는 거의 못 건진다 — **이 큐는 이미 기존 채점 엔진(정규화+쉼표분리+괄호제거+공백무시)을 통과 못 한 답만 쌓인 곳**이기 때문(§1, §4). 진짜 해소력은 편집거리(9단계, 오타 ~19%)와 관리자 검수(품사/유의어 판단이 필요한 나머지)에서 나온다.
- v1 설계: **미리보기 전용**, 자동 거부 없음, 기존 수동 인정/무시 워크플로우 100% 보존, 서버(Edge Function)에서만 AI 호출, 브라우저에 API 키 없음.
- 비용: Claude Haiku 4.5로 99건 전량 처리해도 **10센트 미만**(§8) — 헌법 규칙 7의 "비용 최소화"는 사실상 이미 만족되는 수준이지만, 그래도 캐시 테이블을 둬서 향후 반복 백로그의 비용을 추가로 낮추는 설계를 포함.

---

## 1. pending 답안 테이블 실측

### 1-1. 진입점 — `src/utils/spellingReviewApi.js`

- `src/utils/spellingReviewApi.js:35-46` `logSpellingReview()` — 학생이 en→kr 문제에서 한글로 답했는데 오답 처리되면 `spelling_review_queue`에 `upsert`(첫 시도만, `onConflict: 'word_id,submitted_answer'` + `ignoreDuplicates: true`).
- `src/utils/spellingReviewApi.js:53-73` `fetchPendingSpellingReviews()` — `status='pending'`인 행을 `words(word,meaning,accepted_meanings)` embed로 조회, 최대 200건, `created_at desc`.
- `src/utils/spellingReviewApi.js:77-81` `resolveSpellingReview(id, status)` — `'accepted'|'dismissed'`만 허용, 행은 삭제 안 하고 `status`만 변경.
- 테이블 정의: `supabase_v2_0_spelling_mixed.sql:35-50` — 컬럼 `id(uuid pk)`, `word_id(uuid, FK words.id on delete cascade)`, `student_id(uuid, FK students.id on delete set null, nullable)`, `submitted_answer(text)`, `direction(text, default 'en2kr')`, `status(text, default 'pending')`, `date(date)`, `created_at(timestamptz)`. Unique index `(word_id, submitted_answer)`.
- 마이그레이션 **적용 확인됨**(`DATABASE.md:111` `"[적용됨, 2026-07-17]"`, 실측 REST 200 응답으로도 재확인).

### 1-2. 라이브 pending 건수 실측

읽기 전용 anon key REST 호출로 직접 확인(쓰기 없음, `HEAD` + `Prefer: count=exact`):

```
GET {SUPABASE_URL}/rest/v1/spelling_review_queue?select=id&status=eq.pending&limit=1
→ HTTP/1.1 206 Partial Content
  Content-Range: 0-0/99
```

**"99건"이라는 운영자 언급이 정확히 일치함을 실측으로 확인.** 전체 행(모든 status) 카운트는 별도 확인하지 않았음(펜딩만 분석 대상이므로 불필요하다고 판단) — 필요하면 후속 세션에서 `status=neq.pending`도 조회 가능.

### 1-3. 99건 전수 읽기 분석(내용 열람은 조사 범위 내 허용됨)

`limit=300`으로 pending 99건 전량을 `words(word,meaning,accepted_meanings)` embed와 함께 가져와 수작업 분류(원본 샘플: 세션 스크래치패드 `pending_pretty.json`, 이 저장소 밖).

핵심 발견:

1. **정확히 일치하는 (word_id, 정규화답안) 중복이 0건** — 99행 전부 서로 다른 (단어, 정답) 조합. 즉 이 백로그 자체에는 "완전히 똑같은 오답이 여러 번" 들어있지 않다(exact-answer 캐시는 이번 백로그엔 절감 효과 없음 — 다만 향후 반복 유입되는 신규 pending에는 유효할 것으로 예상, §6).
2. **같은 단어에 서로 다른 오답이 여러 번 쌓인 경우는 19개 단어·46행**(`hug`×5, `lantern`×4, `first aid station`/`flat`/`locker`×3, 나머지 14개 단어×2) — 단어당 컨텍스트(등록 뜻, 인정 목록)는 재사용 가능하므로, **프롬프트 캐싱을 단어 단위가 아니라 "공통 채점 규칙/스키마" 블록에 걸면** 배치 호출 간 이 반복도 자연히 캐시 히트로 이어짐(§8).
3. **단일/짧은 자모 낙서형 잡음이 최소 5건**(`ㄴ`, `ㄴ`, `ㄴ`, `ㄱ`, `ㅇ` — 단어별로 `detector`, `unconscious`, `regard`, `educational`, `spontaneously`) — 학생이 뭔가 눌러야 해서 자모 하나만 친 경우로 보임. 편집거리로도 "가까운 답"이 아니라 명백한 거부 후보.
4. **단순 오타(편집거리 1~2, 같은 뜻)로 보이는 것 약 19건**(예: "물품 보괌함"→"물품 보관함"(locker), "빌생하다"→"발생하다"(occur), "괴정"/"과덩"→"과정"(process)×2, "존쟈"→"존재"(existence), "디양한"→"다양한"(various), "령성하다"→"형성하다"(shape), "점정적으로"/"점전적으로"→"점진적으로"(progressively)×2, "브호화하다"→"부호화하다"(encode), "잘 갖춰잰"→"잘 갖춰진"(well-equipped), "배충"→"배출"(emission), "톡히"→"특히"(particularly), "든불"/"불등"→"등불"(lantern)×2, "놀랍게"→"놀랍게도"(surprisingly, 조사 1글자 누락), "머물다"→"머무르다"(stay, 준말), "반 친규"→"반 친구"(classmate), "A를 B로 오해한다"→"A를 B로 오해하다"(mistake A for B, 어미만 다름)).
5. **의미상 동의어인데 문자열은 전혀 다른 경우 약 15건**(예: "오줌"↔"소변"(urine), "웨이브"↔"파도"(wave, 외래어↔번역어), "참여하다"↔"합류하다"(join), "퍼포먼스"↔"공연"(performance, 외래어), "랜턴"↔"등불"(lantern, 외래어), "훌륭한"↔"완벽한"(perfect), "향하다"↔"가다"(head), "들다"↔"올리다"(raise), "조정자"↔"조절자"(regulator)×2, "온실"↔"온실가스"(greenhouse gas, 일부만 입력), "구급소"/"응급실"/"응급 치료실"↔"구호소, 응급 치료소"(first aid station)×3, "조금"↔"몇몇의"(a few)) — 이건 편집거리로 못 잡고, 한국어 동의어 사전이나 AI 판단이 필요.
6. **품사/활용형만 다른(활용어미·형태 변형) 경우 약 10건**(예: "일어난"↔"일어나다, 발생하다"(happen), "들어온"↔"들어가다"(enter), "무섭다"↔"무서워하는"(scared), "안자"↔"안다, 포옹하다"(hug, 오타 겸 활용), "늦다"↔"나중에"(later, 품사 자체가 다름), "놀라다"↔"놀랍게도"(surprisingly, 품사 다름), "자연적으로"↔"자연의"(natural), "자연의"↔"자연"(nature), "긴장되는"↔"긴장한"(nervous의 인정 목록 중 하나), "줄이다"↔"감소된"(reduced)) — lemma/품사 비교 단계(8단계)가 겨냥하는 케이스.
7. **명백히 틀렸거나 다른 단어와 혼동한 답(거부 후보) 약 20~24건**(예: "대기"↔"반구"(hemisphere), "나가다"↔"없이"(without), "지다"↔"분실물 보관소"(lost & found), "열살"↔"십 대의"(teen), "삼림피괴"↔"황폐화, 저하"(degradation — 실은 같은 화면에 등록된 다른 단어 `deforestation`의 뜻 "삼림 파괴"와 혼동한 것으로 추정), "살다"↔"떠나다"(leave, 반대에 가까움), "다르다"↔"산호"(coral), "조각상"↔"(미국 등의) 주"(state), "농부"↔"해치다"(harm), "국제적인"↔"전통적인"(traditional) 등).
8. **애매/부분 답(사람 판단 필요) 약 15건**(예: "정확히"↔"정확한"(accurate, 품사), "치과"↔"치과의사"(dentist, 장소vs사람), "친구"↔"반 친구, 급우"(classmate, 수식어 누락), "뭐뭐 때문에"↔"~ 때문에"(because of, 군더더기 접두) 등).

**결론(파이프라인 단계별 예상 해소율의 근거, §4에서 재사용)**: 1~6단계(공백/대소문자/유니코드/구두점 정규화 + 완전일치 + 이 단어의 accepted_meanings 재확인)는 **이 큐 자체가 "이미 그 정규화를 통과 못 한 답만 남긴 결과물"**이라 이번 99건에서는 거의 0%만 추가로 잡는다(§1-3 근거). 실질적 해소력은 9단계(편집거리, ~19%)와 8단계(lemma/품사, ~10%)이고, 나머지 ~55~60%(동의어 판단 + 명백한 오답 + 애매 답)는 AI 또는 관리자 판단으로 넘어간다.

---

## 2. 기존 수동 인정/무시 워크플로우

`src/components/AdminScreen.jsx:316-391` `SpellingReviewQueuePanel`:

- `AdminScreen.jsx:328-340` `accept(r)` — `setWordAcceptedMeanings(r.wordId, [...r.acceptedMeanings, r.submittedAnswer])` 호출 후 `resolveSpellingReview(r.id, 'accepted')`. 즉 "인정"은 **두 단계**(① `words.accepted_meanings`에 답 추가, ② 큐 status 갱신)이며 어느 하나 실패해도 다른 하나는 이미 반영됐을 수 있음(트랜잭션 없음 — 기존에도 이런 구조).
- `AdminScreen.jsx:341-351` `dismiss(r)` — `resolveSpellingReview(r.id, 'dismissed')`만 호출.
- `AdminScreen.jsx:353-390` 렌더 — 단어/등록 뜻/학생 답/현재 인정 목록을 카드로 보여주고 "✅ 인정"/"무시" 버튼 2개. 테이블 미존재 시 `rows===null` → 안내 문구(`AdminScreen.jsx:362-363`), 로딩 중, 빈 목록(`검토할 답안이 없어요`) 3가지 상태 분기.
- 이 패널은 `AdminScreen.jsx:1218`에서 `'classes'` 탭 최상단, `SeasonPanel`(Task 1 소유) 바로 아래에 반 무관 전역 패널로 1회만 렌더됨. **Task 1과 파일을 공유하지만 다른 함수/다른 JSX 블록**이라 병합 충돌 위험은 낮음(단, 체크포인트 문서가 순차 실행을 강제한 이유이므로 Task 1 완료·머지 후 편집 시작).
- `setWordAcceptedMeanings` 구현: `src/utils/wordLibrary.js:474-489` — 배열 정규화 + 대소문자/공백 무시 중복 제거 후 `words.accepted_meanings`에 통째로 `update`. **주의**: 이 함수는 "전체 교체"이지 "추가"가 아니다 — `AdminScreen.jsx:331`이 호출부에서 `[...r.acceptedMeanings, r.submittedAnswer]`로 기존 목록에 새 답을 합쳐서 넘기는 방식으로 "추가"를 흉내낸다. **AI 일괄 인정 기능도 같은 read-then-write 패턴을 반드시 재사용**해야 한다(직접 배열을 새로 만들어 덮어쓰면 동시에 다른 관리자가 추가한 인정 답을 지울 위험).

---

## 3. 단어/뜻 스키마 + en2kr 다중 정답 규칙

- `words.meaning`(text) — `src/utils/spelling.js:8-16` 주석: 419개 중 145개(~35%)가 쉼표/세미콜론으로 여러 뜻을 함께 저장(`"휘젓다, 섞다"`). en2kr 채점은 이 중 하나만 맞아도 정답 처리.
- `words.accepted_meanings`(jsonb, default `[]`) — `supabase_v2_0_spelling_mixed.sql:24-29`, `DATABASE.md:57` — 관리자가 등록한 "추가 인정 뜻" 목록. 채점 시 `[target, ...accepted_meanings]` 전체에 대해 같은 규칙으로 비교(`spelling.js:73-79`).
- 채점 규칙 전체(`spelling.js`):
  - `normalizeSpelling`(6행) — trim + lowercase.
  - `splitAnswerAlternatives`(17-21행) — `,`/`;` 로 분리한 각 항목이 후보.
  - `stripParenthetical`(26행) + `altVariants`(41-50행) — "(규칙적인) 패턴" → "패턴"과 "영향(을 미치다)" → "영향을 미치다"(괄호만 제거해 합침) 두 파생형만 허용.
  - `normalizeNoSpace` + `HAS_HANGUL`(31-32행) — **한글 후보에만** 공백 무시 비교 허용(`candidateMatches` 65-67행). 영어 target(kr2en)에는 공백 무시 적용 안 함(철자시험 훼손 방지, 27-30행 주석).
  - `candidateMatches`(60-68행) — 후보 전체 그대로 일치 우선 확인 후, 콤마 분리 항목별로 `altMatches` 확인.
  - **형태소/조사 수준 유연화는 의도적으로 안 함**(38-40행 주석: "규칙이 애매한 건 오답 처리하고 교사 검토 큐로 보내는 게 방침, AI 자동 판정 금지 — 2026-07-17 운영자 지시"). → **이 원칙은 이번 작업에서도 그대로 유지해야 한다**: AI가 자동으로 정답 처리하는 게 아니라 "제안"만 하고 사람이 최종 판정.
- `entranceTest.js:7-11` — 입실시험도 같은 `isSpellingCorrect`를 재사용(엔진 중복 구현 금지 원칙의 실례). 이번 AI 파이프라인의 1~7단계(정규화~인정목록 매치)도 **이 기존 함수를 그대로 재사용**해야 하며, 새로 재구현하면 헌법 규칙 3(완료된 로직 재구현 금지) 위반.

---

## 4. 관리자 검수 UI 구조 — §2와 동일(중복 서술 생략). 배치 처리 UI는 이 패널을 확장하는 형태로 설계(§9).

## 5. 인증(adminPin)과 RLS 실측

- `SpellingReviewQueuePanel`은 `AdminScreen` 내부 컴포넌트라 **화면 진입 자체가 이미 adminPin 검증 통과 후**(`AdminScreen.jsx`는 `pin` prop을 받아 다른 패널(`SeasonPanel`)에 그대로 전달 — 관리자 세션 기준 신뢰).
- `spelling_review_queue` RLS: `supabase_v2_0_spelling_mixed.sql:56-58` `enable row level security` + `create policy "allow anon all" ... using (true) with check (true)`. `DATABASE.md:152`가 이걸 다른 6개 테이블과 함께 "전부 anon 전체 허용" 패턴으로 재확인.
- `words.accepted_meanings` 컬럼: `supabase_v2_0_spelling_mixed.sql:63` `grant select (accepted_meanings), update (accepted_meanings) on table words to anon, authenticated`. **`words`/`classes`/`units` 테이블 자체엔 저장소 어디에도 RLS/GRANT SQL이 없음**(`DATABASE.md:163` — 대시보드 생성 시 기본 권한 그대로, 기술부채로 이미 문서화됨). → 즉 anon key로 `spelling_review_queue`/`words.accepted_meanings` 전체 SELECT/INSERT/UPDATE/DELETE가 가능한 상태이고, **실제 사람 인증은 오직 클라이언트 앱단 adminPin 체크**(서버 재검증 없음)로 지켜지는 구조. 이번 조사에서 anon key로 실제 SELECT 성공(§1-2)까지 실측 확인함.
- **시사점**: AI 일괄 처리 트리거(과금이 드는 외부 API 호출)는 반드시 서버 측에서 `checkAdminReauth`류 재검증을 거쳐야 한다(`api/_pinAuth.js:75` 패턴과 동일 원칙) — anon key만으로 트리거 가능하게 만들면 누구나 브라우저 콘솔에서 AI 호출을 무한정 발생시켜 비용을 태울 수 있음. **PIN 자체는 규칙 11에 따라 클라이언트가 조회/로깅하지 않지만, PIN "검증"은 이미 기존 패턴(`_pinAuth.js`)이 서버에서 하고 있으므로 그 패턴을 그대로 재사용**.

---

## 6. 서버/Edge Function 패턴 — Vercel 12/12 제약과 대안 평가

### 6-1. 실측 재확인

`api/*.js` 파일 목록(언더스코어 프리픽스 헬퍼 `_pinAuth.js` 제외, Vercel은 `_` 프리픽스 파일/디렉터리를 함수로 배포하지 않음 — `_pinAuth.js`엔 `export default`/`handler`가 없고 named export만 있어 실측으로도 함수가 아님을 확인):

```
verify-student-pin.js, self-set-student-pin.js, student-pin-status.js,
set-student-pin.js, verify-admin-pin.js, generate-audio.js,
submit-entrance-result.js, grant-xp.js, compute-word-king.js,
start-new-season.js, admin-pin-actions.js, clear-student-pin.js
```
→ **정확히 12개**. `admin-pin-actions.js:1-33` 자체 헤더 주석이 "Vercel Hobby 플랜 함수 12개 한도, 여유 0"을 명시하고 있고, `.claude/checkpoint` 문서(`docs/agent-decisions/0005-season-writing-review-rollback-note.md:48-50`)도 "Task 2: 신규 `api/*.js` 파일 생성 불가"를 명시적 제약으로 못 박음. 실측 결과 정확히 일치.

### 6-2. 안 (a) 기존 함수에 action dispatch 통합

- 선례: `admin-pin-actions.js:39-148` — `checkAdminReauth`를 action 분기보다 먼저 실행(46-49행, "미인증 요청이 action 값을 바꿔가며 존재 여부를 탐지할 수 없게" 하기 위함), `ALLOWED_ACTIONS` 화이트리스트, 응답 포맷은 각 원본 함수 그대로 보존.
- **문제**: `admin-pin-actions.js:13-20` 헤더가 "이 3개를 합친 이유는 셋 다 정확히 같은 인가 경로를 쓰기 때문"이라 명시하고, **바로 다음 문단(13-20행)에서 "합치지 않은 이유"를 별도로 설명하며 "서로 다른 신뢰 경계가 한 dispatcher 안에 섞이면 권한 상승 버그 위험 — 절대 합치지 말 것"이라고 못 박음**. AI 채점 액션은 (1) 제3자 외부 API(Anthropic) 호출용 별도 시크릿(`ANTHROPIC_API_KEY`)이 필요하고, (2) PIN 자격증명과 무관한 완전히 다른 데이터(단어/답안)를 다루며, (3) 과금이 발생하는 새로운 실패 모드(API 다운/쿼터/응답 파싱 실패)를 갖는다 — **이 파일 자신의 원칙에 따라 admin-pin-actions.js에 얹는 건 부적절**.
- 다른 후보 함수(`verify-admin-pin.js`, `grant-xp.js`, `compute-word-king.js`, `submit-entrance-result.js`, `generate-audio.js`, `start-new-season.js`(Task 1 소유), PIN 관련 5개)도 전부 이미 명확한 단일 책임을 갖고 있고, 그중 하나에 AI 그레이딩을 얹으면 같은 문제(무관한 신뢰 경계 혼합)가 반복됨. `generate-audio.js`가 그나마 "제3자 외부 API 호출"이라는 성격은 비슷하지만(TTS), 인증 경로·요청 파라미터·실패 모드가 전혀 다른 별개 기능이라 억지로 합치면 같은 위험이 생김.
- **결론**: 기술적으로는 가능하지만(파일 자체는 그대로 두고 새 `action` 값만 추가), **이 저장소가 이미 문서화한 원칙과 정면 충돌**하므로 1순위로 권장하지 않음. 다만 코디네이터가 "12/12 한도를 풀 수 없고 신뢰 경계 혼합을 감수하겠다"고 명시적으로 결정하면, `generate-audio.js`(외부 API 호출 선례가 있는 유일한 파일)에 `action` 분기를 얹는 것이 그나마 차선.

### 6-3. 안 (b) Supabase Edge Functions — 권장

- **신규 외부 의존성 여부**: 이 앱은 이미 Supabase(DB)를 핵심 의존성으로 쓰고 있고, Edge Functions는 같은 Supabase 프로젝트의 기능 중 하나(별도 SaaS 계약/과금 주체 추가 아님) — **새 "외부 서비스"를 들이는 게 아니라 이미 쓰는 플랫폼의 다른 기능을 켜는 것**. 다만 다음은 명백히 **새로운 것**들이라 정직하게 기록: (1) Deno 런타임(Node 아님) 사용이 이 저장소에서 처음, (2) 별도 배포 파이프라인(`supabase functions deploy`, Vercel CI/CD와 별개), (3) 별도 시크릿 저장소(`supabase secrets set`, Vercel 환경변수와 별개).
- **Vercel 12/12과 무관**: Edge Function은 Vercel 함수 카운트에 전혀 포함되지 않음 — 이 제약을 우회하는 게 아니라 애초에 그 제약이 적용되지 않는 다른 배포 대상이라는 뜻.
- **배포**: 헌법 규칙 8(에이전트가 DDL 직접 실행 불가)과 유사하게, **Edge Function 배포도 에이전트가 자동으로 못 하고 운영자가 `supabase functions deploy grade-writing-answers`를 수동 실행**해야 함(Supabase CLI 인증이 로컬/CI에 필요 — 이 저장소엔 아직 Supabase CLI 설정 흔적이 없음, `supabase/` 디렉터리 자체가 없음 — 실측: `Glob supabase/**` 결과 없음). 구현 세션은 함수 코드(`supabase/functions/grade-writing-answers/index.ts`)만 준비하고, "배포는 운영자 수동" 원칙을 마이그레이션 SQL과 동일하게 적용해야 함.
- **비밀키 관리**: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`(pending 큐 읽기 + 캐시 테이블 쓰기용), `ADMIN_PIN`(재인증용)을 Supabase 함수 시크릿으로 별도 등록 — Vercel의 `ADMIN_PIN`/`SUPABASE_SERVICE_ROLE_KEY`와 **같은 값을 두 플랫폼에 각각 등록**해야 하는 운영 부담이 생김(정직하게 위험 목록에 기록, §11).
- **CORS**: Vercel에 배포된 프론트(`voca-drab.vercel.app`)에서 `*.functions.supabase.co`를 호출하는 건 **크로스 오리진**이라, 기존 `api/*.js`(같은 오리진이라 CORS 불필요)와 달리 **Edge Function이 직접 `OPTIONS` 프리플라이트 처리 + `Access-Control-Allow-Origin` 헤더를 코드로 넣어야 함** — 이건 기존 코드베이스에 선례가 없는 새 구현 부담으로 정직하게 기록.
- **인증 재사용 불가**: `api/_pinAuth.js`의 `checkAdminReauth`(Node 전용, `process.env` 사용)는 Deno Edge Function에서 그대로 `import` 불가 — **같은 로직(ADMIN_PIN 문자열 비교 + 실패 시 지연)을 Edge Function 안에 별도로 구현**해야 하며, 이는 "재복제 유발 헬퍼 통합" 원칙(커밋 `9c09537`)과 반대 방향이라 **의도적 예외로 명시 주석 필요**(두 런타임이 근본적으로 다른 모듈 시스템이라 공유 불가능함을 코드 주석에 남길 것).
- **Anthropic SDK 미사용**: Deno 환경에서 Node용 `@anthropic-ai/sdk`를 그대로 쓰기 어려움(불가능하진 않으나 검증 안 됨) — **raw HTTP(`fetch`)로 `POST https://api.anthropic.com/v1/messages`를 직접 호출**하는 게 안전(claude-api 스킬의 "SDK 없는 언어는 raw HTTP 허용" 원칙과도 일치, Deno는 이 스킬의 공식 지원 언어 목록에 없음).

### 6-4. 결론

**Supabase Edge Function을 권장**. 이유: (1) Vercel 12/12 제약이 실측으로 확정돼 있고 여지가 없음, (2) `admin-pin-actions.js`가 스스로 "신뢰 경계 혼합 금지"를 못 박아 안 (a)의 가장 자연스러운 통합처를 사실상 봉쇄, (3) 이미 쓰는 Supabase 플랫폼의 기능이라 신규 SaaS 벤더 추가는 아님. 다만 Deno 런타임/별도 배포·시크릿/CORS/`_pinAuth.js` 로직 중복이라는 4가지 진짜 비용은 위험 목록(§11)에 정직하게 남겨야 함 — "공짜 대안"이 아니라 "12/12 제약 안에서 가장 덜 나쁜 선택".

---

## 7. 기존 AI 연동 — 없음

저장소 전체에 `anthropic`/`openai`/`@anthropic-ai` 패키지나 AI API 호출 코드가 없음(학부모 주간 리포트가 규칙 기반 템플릿인 선례, `CLAUDE.md` 헌법 규칙 7). 이번 작업이 **이 저장소 최초의 실제 AI API 연동**이 됨 — 그만큼 시크릿 관리/실패 모드/비용 관찰을 신중히 설계해야 함(§9 구현 순서에서 feature flag로 완전히 끈 상태로 먼저 배포하는 걸 1단계로 둔 이유).

---

## 8. 중복 테이블 위험 검토

- `spelling_review_queue`(교사 검토 큐, "제출된 오답")와 새로 설계할 캐시 테이블(§10, "동일 (단어,뜻,정규화답안)에 대한 AI 판정 캐시")은 **의미가 겹치지 않음** — 전자는 "무엇을 검토해야 하는가"(사람 액션 대기열), 후자는 "이 답에 대해 AI가 뭐라고 했었는가"(재사용 가능한 계산 결과). 후자가 없으면 같은 (단어,뜻,답) 조합이 다음 배치 실행 때마다 매번 다시 AI 호출을 태우게 됨.
- `words.accepted_meanings`(정식 인정 목록, 관리자 승인 완료)와 새 캐시 테이블(AI의 "제안", 아직 미승인)도 의미가 다름 — 캐시 테이블의 `decision='accept'`가 곧바로 `accepted_meanings`에 반영되는 게 아니라, **관리자가 기존 "✅ 인정" 버튼을 눌러야만** `setWordAcceptedMeanings`가 호출됨(§9 설계 제약 "auto-reject 금지"와 대칭으로 "auto-accept도 금지"가 v1 원칙).
- 별도 "AI 제안(proposal)" 테이블은 **만들지 않기로 결정**(§10에서 이유 설명) — preview는 서버 응답에만 실려 브라우저 메모리에서만 유지, DB에 영속화하지 않음. 따라서 신규 테이블은 캐시 테이블 1개뿐.

---

## 9. 기존 테스트

- `npm run verify:writing` → `tests/harness/runWriting.mjs` — grep 결과 `spelling_review_queue`/`accepted_meanings`/`review` 키워드 전혀 없음(이 하네스는 쓰기시험 채점 자체만 검증, 검토 큐 워크플로우는 커버 안 함).
- `scripts/testSpelling.mjs`, `scripts/testSpellingSettings.mjs`, `scripts/testSpellingDirectionWiring.mjs` — 이름상 채점 로직/설정 전파 검증, 검토 큐 무관으로 추정(파일명 기준, 본문 미확인).
- `scripts/testSpellingV2Db.mjs:1-30` — **유일하게 검토 큐 e2e를 커버**: QA 전용 임시 반을 만들어 (1) `spelling_direction` 라운드트립, (2) `accepted_meanings` 라운드트립+채점 반영, (3) `spelling_review_queue` 기록/조회/원클릭 인정 흐름(인정→`accepted_meanings` 반영→재채점 정답), (4) 반 삭제 cascade로 큐 행 자동 정리까지 검증 후 스스로 삭제. **이 스크립트가 이번 작업의 회귀 테스트 기반**이 되어야 함 — AI 제안 레이어를 얹은 뒤에도 이 4가지가 그대로 통과해야 "기존 워크플로우 폴백 보존"이 실제로 지켜진 것.
- **새 검증 필요 영역**(기존 테스트에 없음): 캐시 테이블 라운드트립, 배치 분할(20~30) 로직, AI 응답이 깨진 JSON일 때 `review` 강등, feature flag OFF일 때 기존 패널이 완전히 예전과 동일하게 동작하는지.

---

## 10. 처리 순서 설계(10단계) + 실측 근거 예상 해소율

각 단계는 **기존 `spelling.js`/`entranceTest.js`가 이미 구현한 것은 재사용**하고(규칙 3), 새로 만드는 부분만 신규 함수로 추가한다.

| # | 단계 | 규칙 | 예시 | 이번 99건 예상 해소율(근거: §1-3 수작업 분류) |
|---|---|---|---|---|
| 1 | 공백 trim | 앞뒤 공백 제거 | `" 물품 보관함 "` → `"물품 보관함"` | 기존 채점 엔진(`normalizeSpelling`)이 이미 함 — **추가 해소 ~0%** |
| 2 | 중복 공백 축약 | `\s+` → 단일 공백 | `"물품   보관함"` → `"물품 보관함"` | 기존 채점엔 없는 신규 규칙이나, 99건 중 해당 사례 관찰 안 됨 — **~0%** |
| 3 | 대소문자 정규화 | lowercase(영어 답에만 의미) | kr2en 답에 적용 | en2kr 위주인 이 큐엔 영향 미미 — **~0%** |
| 4 | Unicode 정규화(NFC) | 한글 자모 분리형(NFD)→완성형(NFC) 통일, 자모 케이스(단일 자모 오타)는 별도 취급 | macOS IME 등에서 자모가 분해된 채 저장되는 경우 대비 | 99건 샘플에서 NFD 흔적 관찰 안 됨(전부 정상 완성형) — 하지만 **방어적으로 반드시 포함**(향후 다른 기기/브라우저 유입 대비, 회귀 아님) — **이번 배치 ~0%, 향후 대비용** |
| 5 | 불필요한 문장부호 제거 | 끝 마침표/물음표 등 | 관찰된 사례 거의 없음(간혹 "~인지한"처럼 물결표가 **의미 있는** 접두라 제거하면 안 되는 경우 발견 — 무조건 strip 금지, 단어 자체에 `~`가 포함된 표제어(`aware of`→`~을 인식하는`)와 충돌 방지 필요) | **~0%, 오히려 오탐 주의 케이스 1건 확인** |
| 6 | 정규화 후 완전 일치 | 1~5 적용 후 target/accepted_meanings와 문자열 완전 일치 | — | 이 큐 자체가 "완전 일치 실패분"이라 **정의상 0%**(§1-3 핵심 발견) |
| 7 | 인정답안/동의어 매치 | `words.accepted_meanings`(이미 등록된 것) 우선 확인 + (v1엔 없는) 별도 한국어 동의어 사전 대조 | "펑크난"(flat 기등록)과 비교했지만 새 제출 "평평한"/"가벼운"/"바람이 부는"은 미등록이라 불일치 | 기등록 `accepted_meanings` 재확인분은 **0%**(이미 실패한 것들이므로) — 신규 동의어 사전은 v1에 없으므로 **이번 구현에서 0%, 로드맵 항목으로만 기록**(§13) |
| 8 | 품사·lemma 비교 | 활용어미/품사 변형만 다른 경우(예: "일어난"↔"일어나다") 인식 | §1-3 항목 6 (~10건) | **~10%**(관대하게 잡아도 확신도 낮은 경우 많아 `review`로 갈 확률 높음) |
| 9 | 문자열 유사도(편집거리) | Damerau-Levenshtein ≤1~2(음절 단위) | §1-3 항목 4 (~19건) | **~19%**(가장 확실한 자동 해소 구간 — `accept` 후보) |
| 10 | AI(그래도 미해결) | 위 1~9를 통과 못 한 나머지 | §1-3 항목 5·7·8 합 (~50~55건) | **~55~60%가 AI로 감** — 그중 상당수는 AI도 `review`로 반환할 것으로 예상(동의어 판단·부분답·명백 오답 혼재) |

**합계 검산**: 8+9단계로 자동 해소 약 29건(29%), AI로 넘어가는 약 70건(71%) — 반올림 오차 있음, 정확한 숫자는 실제 편집거리 임계값/lemma 사전 구현 후 재측정 필요(이 표는 **수작업 분류 기반 추정치**임을 명시).

---

## 11. 판정 체계

- `accept` / `review` / `reject_candidate` 3종. **v1에서 `reject_candidate`는 절대 자동 거부(행 삭제/status 변경)로 이어지지 않음** — 관리자가 기존 "무시" 버튼을 눌러야만 실제 `dismissed`로 바뀜. UI에서는 AI가 `reject_candidate`로 표시한 행에 "무시(AI 제안)"처럼 라벨만 다르게 보여주는 정도.
- `accept`도 마찬가지로 자동으로 `words.accepted_meanings`에 들어가지 않음 — 기존 "✅ 인정" 버튼 클릭이 여전히 유일한 실행 경로, AI 제안은 그 버튼을 누르기 전 "AI 추천: 인정(신뢰도 92%) — 이유: ..." 같은 보조 텍스트로만 표시.
- **auto-accept/auto-reject 둘 다 v1 금지** — 운영자 지시("AI 판단은 관리자가 확인할 때까지 제안으로만 저장")와 일치.

---

## 12. AI 결과 스키마(서버 응답 JSON, 배치당 배열)

```jsonc
{
  "pending_answer_id": "uuid",        // spelling_review_queue.id
  "word": "locker",                    // words.word (참고용, 프롬프트 검증용)
  "registered_meaning": "물품 보관함", // words.meaning
  "student_answer": "물품 보괌함",     // spelling_review_queue.submitted_answer
  "decision": "accept",                // "accept" | "review" | "reject_candidate"
  "confidence": 0.95,                  // 0~1
  "reason": "단순 오타(관→괌, 편집거리 1) — 등록 뜻과 동일 의미",
  "suggested_synonym": null,           // accept일 때만: accepted_meanings에 추가할 정확한 문자열
  "part_of_speech_warning": null,      // 8단계에서 품사 불일치 감지 시만 채움 (예: "동사 vs 형용사")
  "decision_source": "levenshtein",    // "levenshtein" | "lemma" | "ai" | "cache"
  "cache_hit": false                   // 캐시 테이블에서 재사용됐는지
}
```

- **AI가 잘못된 JSON을 반환하면 해당 건은 `decision: "review"`, `decision_source: "parse_error"`로 서버(Edge Function)가 강제 대체**(설계 제약 그대로) — 클라이언트는 이 필드로 "AI 파싱 실패" 배지를 따로 표시 가능.
- `pending_answer_id`가 스키마에 없거나 요청에 없던 id를 AI가 만들어내면(환각) 서버에서 무시하고 `review`로 강등(1~9단계에서 넘긴 배치의 id 목록과 대조 검증 필수).

---

## 13. 모델 선택과 비용 산정 (claude-api 스킬 기준, 2026-06-24 캐시 확인)

### 13-1. 모델 후보

| 모델 | ID | 가격($/1M, 입력/출력) |
|---|---|---|
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 / $5.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | $3.00($2.00 인트로가 2026-08-31까지) / $15.00($10.00 인트로) |

**권장: Haiku 4.5.** 이유: (1) §12 파이프라인이 넘기는 나머지는 이미 1~9단계로 "명백한 오타/완전일치"가 걸러진 잔여분이라 과제 난이도가 어렵지 않은 분류 작업(짧은 한국어 답 1개가 등록 뜻과 동의어인지 판단) — Haiku급으로 충분, (2) 헌법 규칙 7(비용 최소화)과 직접 부합, (3) 배치 크기 20~30건 × 4배치 정도의 낮은 볼륨에서 Sonnet과의 절대 비용 차이는 크지 않지만(§13-2) 반복 운영 비용(매일 새로 쌓이는 pending)을 고려하면 저렴한 쪽이 합리적. Sonnet 5는 "Haiku가 애매한 판정을 계속 낼 때"의 상위 모델 백업 옵션으로만 로드맵에 남김(v1 범위 아님).

### 13-2. 비용 산정(추정 토큰 규모, ~99건 전량이 AI로 갔다고 가정한 최악 상한)

- 배치 크기 25 기준 4회 호출(25×3 + 24×1).
- 배치당 입력: 공통 지침/스키마(~2,500 토큰, 캐시 대상) + 25건×(단어+뜻+답+인정목록, 각 ~120토큰) ≈ 5,500토큰. 4배치 합계 입력 ≈ **22,000토큰**.
- 배치당 출력: 25건×(JSON 1개, ~100토큰) ≈ 2,500토큰. 4배치 합계 출력 ≈ **10,000토큰**.

| 시나리오 | 입력 비용 | 출력 비용 | 합계 |
|---|---|---|---|
| Haiku 4.5, 캐시/배치 미적용 | 22,000/1e6×$1.00 ≈ $0.022 | 10,000/1e6×$5.00 ≈ $0.050 | **≈ $0.07** |
| Haiku 4.5, 프롬프트 캐싱만(공통 2,500토큰 블록을 4배치 중 3배치가 캐시 히트, 캐시 읽기 0.1×) | ≈ $0.022 − (2,500×3/1e6×$1.00×0.9) ≈ $0.015 | $0.050 | **≈ $0.065**(절감폭 미미 — 볼륨이 작아 캐싱 효과 낮음) |
| Haiku 4.5, Batches API(50% 할인)만 | $0.011 | $0.025 | **≈ $0.036** |
| Haiku 4.5, 캐싱+Batches API 병행 | ≈ $0.0075 | $0.025 | **≈ $0.033** |
| Sonnet 5, 캐시/배치 미적용(정가 $3/$15) | $0.066 | $0.150 | **≈ $0.22** |
| Sonnet 5, 캐싱+Batches API 병행 | ≈ $0.023 | $0.075 | **≈ $0.10** |

**결론**: 99건 전량을 매번 AI로 보내도 Haiku 4.5는 10센트 미만, Sonnet 5도 25센트 미만 — 이 정도 볼륨에서는 캐싱/배치 API가 "필수"는 아니지만(절감액이 몇 센트 수준), **캐시 테이블은 비용보다 "같은 (단어,뜻,답) 조합에 대해 매번 다른 판정이 나오지 않는 일관성" 확보 목적이 더 크므로 그대로 설계에 포함**(§10). Message Batches API(비동기, 최대 24시간, 50% 할인)는 이 기능이 "관리자가 버튼 눌러 미리보기를 즉시 보는" UX(§9 preview-only)와 맞지 않아(배치 API는 폴링 필요, 실시간 아님) **v1에서는 미적용 — 동기 `messages.create()`로 4회 호출이면 충분히 빠름(수 초)**. 향후 pending이 수백 건 이상으로 커지면 Batches API 전환을 로드맵에 남긴다.

---

## 14. 설계 제약 반영 방안

| 제약 | 반영 방안 |
|---|---|
| 배치 크기 20~30 | Edge Function이 요청받은 pending id 목록을 25개씩(마지막 배치는 나머지) 슬라이스해 순차 호출 |
| 동일 (단어,뜻,정규화답안) 캐시 | §15의 `spelling_ai_grading_cache` 테이블, unique(`word_id`, `meaning_snapshot`, `normalized_answer`) |
| 브라우저에 API 키 금지 | `ANTHROPIC_API_KEY`는 Supabase Edge Function 시크릿에만 존재, 클라이언트 번들에 노출 안 됨(Vite 클라이언트 코드는 Edge Function URL만 호출) |
| preview-only 우선 | 미리보기 API는 `spelling_review_queue.status`/`words.accepted_meanings`를 **일절 변경하지 않음**(SELECT만) — 실제 반영은 기존 "✅ 인정"/"무시" 버튼(§2)이 그대로 담당 |
| 기존 수동 워크플로우 폴백 보존 | `SpellingReviewQueuePanel`의 기존 accept/dismiss 버튼·로직 **1줄도 안 건드림**(§9 파일별 변경 목록에서 "기존 함수 옆에 신규 함수만 추가" 원칙) |
| AI 잘못된 JSON → review | §12 `decision_source: "parse_error"` 강제 강등 |
| 라이브 pending(~99건) 변경 금지 | 이번 분석 세션은 물론, 구현 세션의 "미리보기 API"도 읽기 전용 — 실제 accept/dismiss는 여전히 사람이 기존 버튼으로만 |

---

## 15. 구현 계획(설계만 — 실행/코드 작성은 이번 세션 범위 아님)

### 15-1. 파일별 변경 목록(예상)

| 파일 | 변경 종류 | 내용 |
|---|---|---|
| `supabase_v3_5_writing_review_ai_cache.sql`(신규, 실행 안 함) | 신규 마이그레이션 | §16 DDL — `spelling_ai_grading_cache` 테이블 1개만(§8 "제안 테이블은 안 만듦" 결정 반영) |
| `supabase/functions/grade-writing-answers/index.ts`(신규) | 신규 Edge Function | admin 재인증 → pending 배치 조회 → 1~9단계 로컬 처리(재사용: `spelling.js`의 `isSpellingCorrect`/정규화 헬퍼를 Edge Function이 import 가능한 형태로 재노출 필요 — Deno가 `.js` ESM을 그대로 import 가능한지 확인 필요, 안 되면 순수 로직만 최소 복제하되 "왜 복제했는지" 주석 필수) → 캐시 조회/기록 → 미해결분만 Haiku 4.5 호출 → 응답 배열 반환(DB 미변경) |
| `src/utils/spellingReviewAiApi.js`(신규) | 신규 클라이언트 API 레이어 | `spellingReviewApi.js`와 나란히, Edge Function URL 호출 + adminPin 전달 + 응답 파싱. **기존 `spellingReviewApi.js`는 수정하지 않음**(파일 소유 충돌 최소화, 규칙 16) |
| `src/components/AdminScreen.jsx` | 기존 컴포넌트 확장(Task 1 완료 후에만) | `SpellingReviewQueuePanel` 내부에 "AI로 미리 분류" 버튼 1개 추가(feature flag OFF면 버튼 자체 렌더 안 함) — 클릭 시 `spellingReviewAiApi`로 미리보기 호출, 결과를 각 카드에 배지(`accept 92%` 등)로 오버레이. **기존 accept/dismiss 버튼·핸들러는 무변경** |
| `src/config/features.js` | 기존 파일에 플래그 1개 추가 | `writingReviewAiAssist: false`(기본 OFF) — §17 |
| `scripts/testSpellingReviewAiCache.mjs`(신규) | 신규 QA 스크립트 | 캐시 테이블 라운드트립 + 배치 슬라이싱 로직 단위 테스트(순수 함수 부분은 Edge Function 코드에서 분리해 Node로도 테스트 가능하게 설계) |
| `.env.example`(있다면 갱신, 없으면 생략) | 문서 갱신 | Supabase 함수 시크릿 목록에 `ANTHROPIC_API_KEY` 추가 안내 |

### 15-2. 신규 테이블 DDL(설계만, 멱등, 실행 금지 — 운영자 수동 실행 대상)

```sql
-- supabase_v3_5_writing_review_ai_cache.sql (초안 — 실행 금지, 운영자 수동 실행 전용)
-- 목적: 동일 (단어, 등록뜻 스냅샷, 정규화된 학생답) 조합에 대한 AI 판정을 재사용해
-- 같은 조합이 다시 제출돼도 매번 새로 AI를 호출하지 않게 한다. words.accepted_meanings
-- 는 "정식 인정 완료"만 담고, 이 테이블은 "AI가 예전에 뭐라고 했었는가"만 담아 의미가
-- 겹치지 않는다(§8 중복 테이블 검토).
create table if not exists spelling_ai_grading_cache (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references words(id) on delete cascade,
  meaning_snapshot text not null,     -- 호출 당시 words.meaning (나중에 meaning이 바뀌면 캐시 미스 유도)
  normalized_answer text not null,    -- 1~5단계 정규화 후 답안
  decision text not null check (decision in ('accept','review','reject_candidate')),
  confidence numeric,
  reason text,
  suggested_synonym text,
  part_of_speech_warning text,
  decision_source text not null,      -- 'levenshtein' | 'lemma' | 'ai' | 'cache'
  model text,                         -- 'claude-haiku-4-5' 등, ai 판정일 때만
  created_at timestamptz not null default now()
);
create unique index if not exists uq_spelling_ai_cache_key
  on spelling_ai_grading_cache (word_id, meaning_snapshot, normalized_answer);

-- RLS: 기존 테이블들과 동일 패턴(anon 전체 허용) — 이 앱 구조상 일관성 유지.
-- 단, 실제 쓰기는 Edge Function(service_role, RLS 우회)만 하고 클라이언트는
-- 읽기만 하므로 anon에는 select만 부여(불필요한 쓰기 권한 노출 최소화 — 기존
-- 테이블들보다 한 단계 더 보수적인 권한 설계).
alter table spelling_ai_grading_cache enable row level security;
drop policy if exists "allow anon select" on spelling_ai_grading_cache;
create policy "allow anon select" on spelling_ai_grading_cache for select using (true);
grant select on table spelling_ai_grading_cache to anon, authenticated;
-- insert/update/delete는 anon/authenticated에 GRANT하지 않음 — service_role만 쓰기.
```

**멱등성**: `create table if not exists` + `create unique index if not exists` + `drop policy if exists` 후 재생성 — 몇 번 실행해도 안전, 기존 v2.0 마이그레이션과 동일 관례. **코드보다 먼저/나중에 실행돼도 안전**: Edge Function은 이 테이블 SELECT/INSERT 실패 시(테이블 미존재) 캐시를 건너뛰고 바로 AI 호출하도록 설계(기존 `spellingReviewApi.js`의 "테이블 부재 시 조용히 스킵" 패턴 재사용, §1-1).

### 15-3. Feature Flag 게이트

`src/config/features.js:7-77` `DEFAULT_FEATURES`에 추가(카테고리는 기존 `attachment` 배열처럼 별도 카테고리를 새로 만들기보다, 이번 세션 소유가 아닌 `FeatureManagementPanel.jsx`를 건드리지 않기 위해 §170-172행 관례를 따라 기존 배열에 얹거나, 최소한 새 플래그 하나만 최상단에 추가):

```js
// 쓰기 답안 검토 AI 보조(Task 2, 2026-07-2x) — 관리자 전용 미리보기 버튼 게이팅.
// 기본 OFF: SQL 미실행 상태에서도 버튼 자체가 안 보이므로 안전. 학생 화면
// 무관(헌법 규칙 12), 관리자가 명시적으로 켜기 전까지 기존 검토 큐 화면과
// 100% 동일하게 동작.
writingReviewAiAssist: false,
```

### 15-4. 구현 순서(제안)

1. DDL 작성(§15-2) → 운영자 수동 실행 대기(코드는 실행 전에도 동작해야 함).
2. `spelling.js`/`entranceTest.js`의 정규화·채점 헬퍼를 Edge Function에서 재사용 가능한 형태 확인(Deno import 가능 여부 스파이크 — 안 되면 최소 복제 + 이유 주석).
3. 1~9단계(정규화/완전일치/인정목록/lemma/편집거리) 순수 함수 구현 + 단위 테스트(Node에서도 돌아가게 설계해 `scripts/testSpellingReviewAiCache.mjs`로 커버).
4. Edge Function 골격(admin 재인증 + pending 조회 + 1~9단계 적용 + 캐시 조회) — **AI 호출 없이** 여기까지 먼저 배포/검증(비용 0, 로직만 확인).
5. AI 호출(Haiku 4.5, raw fetch) + JSON 파싱/검증 + 캐시 기록 추가.
6. 클라이언트 `spellingReviewAiApi.js` + `AdminScreen.jsx` 배지 UI(flag OFF가 기본이므로 안전하게 병행 개발 가능).
7. `scripts/testSpellingV2Db.mjs` 재실행으로 기존 워크플로우 무회귀 확인(§9) + 신규 스크립트로 캐시/배치 로직 확인.
8. `npm run build` + `npm run verify:writing`(+ 건드린 다른 도메인 있으면 해당 verify) 통과 확인 후 flag ON은 운영자 판단(학생 무관 관리자 전용 기능이라 급하지 않음).

### 15-5. 테스트 계획

- **회귀**: `scripts/testSpellingV2Db.mjs` 그대로 재실행(§9) — 캐시/AI 레이어 추가가 기존 인정/무시 흐름을 전혀 안 건드렸는지 확인.
- **신규 단위 테스트**: 배치 슬라이싱(99→25×3+24×1 등 경계값), 캐시 히트/미스, 편집거리 임계값 튜닝(허위양성 방지 — 예: "살다"/"떠나다"처럼 편집거리는 가깝지만 의미가 반대인 경우를 `accept`로 잘못 내지 않는지 §1-3 항목7 사례로 회귀 테스트 케이스화).
- **AI 응답 계약 테스트**: 정상 JSON, 빈 배열, 스키마 위반(필드 누락), 완전히 깨진 텍스트 4가지 입력에 대해 서버가 각각 어떻게 강등하는지(§12 `parse_error`).
- **RLS/권한 테스트**: `spelling_ai_grading_cache`에 anon key로 INSERT 시도 시 거부되는지(§15-2 권한 설계가 실제로 막는지) — `scripts/testRlsSecurity.mjs` 패턴 참고해 신규 케이스 추가 검토.
- **build**: `npm run build` — 신규 flag/컴포넌트가 기존 빌드를 안 깨는지.

### 15-6. 위험 목록

| 위험 | 완화 |
|---|---|
| Edge Function이 이 저장소 최초의 Deno 배포물이라 배포 파이프라인/모니터링이 미성숙 | 1단계(§15-4 4번)를 AI 호출 없이 먼저 배포해 배포 자체의 신뢰성부터 확인 |
| `ANTHROPIC_API_KEY`가 Vercel이 아닌 Supabase에 저장돼 운영자가 두 곳을 따로 관리해야 함 | `handoff.md`에 "이 시크릿은 Supabase 함수 시크릿에만 있음, Vercel엔 없음"을 명시적으로 기록해 혼동 방지 |
| `_pinAuth.js` 로직을 Edge Function에 중복 구현 → 두 곳 중 한쪽만 고치는 드리프트 위험 | Edge Function 코드 상단에 "이 로직은 api/_pinAuth.js:75 checkAdminReauth와 동일해야 함, 한쪽 수정 시 다른 쪽도 확인" 주석 필수 |
| 편집거리 임계값이 너무 관대하면 §1-3 항목7 같은 "반대 의미인데 문자열은 가까운" 오답을 `accept`로 오판 | 임계값 보수적으로(예: 음절 1개 차이만 자동 accept, 2개는 `review`) + 허위양성 사례를 테스트 케이스로 고정 |
| CORS 설정 실수로 프로덕션에서 미리보기 버튼이 조용히 실패 | 로컬에서 실제 Vercel 프리뷰 도메인 대상으로 CORS 프리플라이트까지 수동 검증 후 flag ON 권고 |
| 캐시 테이블의 `meaning_snapshot`이 stale해짐(나중에 관리자가 `words.meaning`을 수정하면 캐시가 옛 뜻 기준 판정을 계속 재사용) | unique key에 `meaning_snapshot`을 포함시켜(§15-2) meaning이 바뀌면 자동으로 캐시 미스 → 재호출되게 설계(이미 반영됨, 표로 남김) |

---

## 16. 권장 아키텍처 요약

**Supabase Edge Function(`grade-writing-answers`) 1개 신규 + `spelling_ai_grading_cache` 테이블 1개 신규 + `features.js`에 `writingReviewAiAssist` 플래그 1개 + 기존 `SpellingReviewQueuePanel`에 미리보기 버튼만 추가(기존 accept/dismiss 로직 무변경)** — Vercel 12/12 한도를 안 건드리고, `admin-pin-actions.js`의 "신뢰 경계 혼합 금지" 원칙을 지키며, Claude Haiku 4.5로 v1 preview-only(자동 승인/거부 없음) 방식으로 구현하는 것이 가장 안전한 경로.
