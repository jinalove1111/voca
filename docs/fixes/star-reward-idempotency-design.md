# 별(Stars) 중복 지급 방지 — 설계 문서

- 작성일: 2026-07-27
- 상태: **설계만, 코드 미수정**
- 선행 문서: `docs/bugs/star-duplicate-reward-analysis.md`(원인 분석 —
  Liam/Dain 제보 건). 이 문서는 그 분석을 전제로 "어떻게 고칠 것인가"만
  다룬다 — 원인 재조사는 하지 않는다.
- 확정된 발화점: `src/App.jsx:529, 579`의
  `onMarkPronunciationOk={() => { markPronunciationOk(); addStars(1) }}`
  — 발음 성공마다 `addStars(1)`이 멱등성 가드 없이 실행됨.

---

## 1. 현재 reward 관련 흐름 전체 분석

이 앱의 "보상"은 사실 3개의 서로 다른 신뢰 모델이 공존하는 시스템이다.
별 버그를 좁게 고치기 전에, 왜 이런 구조가 됐는지부터 정리한다.

### 1-1. 별(Stars) — 클라이언트 신뢰 모델

`src/hooks/useStudent.js:753-756`:

```js
const addStars = useCallback((n = 1) => {
  patch(prev => ({ totalStars: prev.totalStars + n }))
  bumpHistory(day => ({ starsEarned: day.starsEarned + n }))
}, [patch, bumpHistory])
```

- `patch()`는 순수 로컬 React state 갱신이고, 그 결과가 나중에 **디바운스
  자동 동기화**로 Supabase `student_progress`에 그대로 업로드된다(서버가
  "정말 그 행동이 있었는지" 재계산/검증하지 않음).
- 호출 지점 6곳 전수 확인 결과(분석 문서 표 그대로 인용):

| 위치 | 트리거 | 중복 방지 |
|---|---|---|
| `App.jsx:529, 579` | 발음 성공(`onMarkPronunciationOk`) | **없음 — 이번 버그** |
| `useStudent.js:844` | 레벨업 미션 클리어 | 있음(`missions[].done`, 영구) |
| `useStudent.js:892` | 뽑기 중복 스티커 보너스 | 해당 없음(중복=트리거, 매번 지급이 설계 의도) |
| `useStudent.js:959` | 오늘의 미션 4/4 완료 | 있음(`handledRoundRef` + 즉시 `round` 리셋) |
| `useStudent.js:1136` | 쓰기시험 콤보 마일스톤 | 있음(`round.spellingCombo`, 오답 시 리셋) |

즉 "별"이라는 하나의 재화 안에도 보호 수준이 제각각이다 — 이번 버그는
**그 중 유일하게 보호가 빠진 한 지점**의 문제다.

### 1-2. XP(Paul Rank) — 서버 권위 모델 (대조군, 아래 5장에서 재사용)

같은 코드베이스에 이미 정반대 신뢰 모델이 구현돼 있다. `xp_ledger`
(`supabase_v2_3_paul_rank.sql:68-76`):

```sql
create table if not exists xp_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  event_type text not null,
  amount smallint not null check (amount > 0 and amount <= 100),
  source_event_id text not null,
  created_at timestamptz not null default now(),
  unique (student_id, source_event_id)
);
```

- `anon`/`authenticated`에는 **SELECT만** 부여되고 INSERT/UPDATE/DELETE
  권한 자체가 없다(`supabase_v2_3_paul_rank.sql:79-86`) — 클라이언트가
  직접 쓸 방법이 구조적으로 없다.
- 유일한 쓰기 경로는 `api/grant-xp.js`(서버리스, service_role key) —
  클라이언트는 "무슨 일이 있었는지"(`eventType`)와 "이 인스턴스를
  구분하는 키"(`sourceEventId`)만 보내고, **금액은 클라이언트 입력을
  전혀 신뢰하지 않고 항상 서버가 `XP_EVENT_TABLE`에서 조회**한다
  (`api/grant-xp.js` 헤더 주석).
- 중복 지급은 `unique(student_id, source_event_id)` **DB 제약**이
  막는다 — 애플리케이션이 "이미 지급했는지" 먼저 조회하는 TOCTOU 취약
  패턴이 아니라, 같은 이벤트가 두 번 들어와도 두 번째 `insert`가
  `23505`(unique violation)로 자동 거부된다. 핸들러는 이 에러를
  "이미 지급됨(정상)"으로 처리한다.
- `xp_totals`는 `xp_ledger`를 학생별로 합산한 **VIEW**(저장 컬럼 아님) —
  "저장된 중복 가능값보다 파생값을 우선한다"는 원칙을 스키마 레벨에서
  강제.

**이 패턴이 정확히 "별" 시스템에 지금 빠져 있는 것**이다 — 별은 아직
`addStars()`라는 순수 가산 함수 + 클라이언트 신뢰로만 지켜지고 있다.

### 1-3. 티켓/스티커 — XP와 같은 idempotent-key 패턴을 부분 재사용

`grantTicket(prev.ticketLedger, 'daily-mission-complete', todayStr())`
(`useStudent.js:976`)도 날짜 기반 idempotent 키로 로컬에서 중복을
막는다 — 다만 이건 `xp_ledger`처럼 DB unique 제약이 아니라 **클라이언트
쪽 배열(`ticketLedger`)에 같은 키가 있는지 확인하는 방식**이라, XP만큼
강한 보장은 아니다(로컬 상태 오염/멀티기기 경쟁 조건엔 XP보다 약함).

### 요약: 이번 버그가 놓인 위치

```
[서버 권위, DB unique 제약]  xp_ledger ─────────── 가장 강함(위조/중복 불가능)
[클라이언트 idempotent 키]   ticketLedger ───────── 중간(로컬 오염엔 취약)
[단순 가산, 가드 있음]       missions[].done 등 4곳 ─ 개별적으로는 안전
[단순 가산, 가드 없음]       addStars(1) 발음 콜백 ── 이번 버그, 가장 약함
```

---

## 2. 기존 `student_progress` 구조 확인

`DATABASE.md:63` 기준:

| 컬럼 | 용도 |
|---|---|
| `student_id`(unique) | FK, 학생당 1행 |
| `total_stars` | 별 총합의 **빠른 조회용 사본 컬럼** |
| `progress_data`(jsonb) | `useStudent.js`의 `record` 객체 전체 백업(로컬 상태와 1:1) — `totalStars`, `round`, `history`, `stickers` 등 전부 이 blob 안에 들어있음 |
| `cleared_count`, `streak`, `stickers_count`, `total_xp`, `calendar_data`, `mission_data`, `review_data` 등 | 각각 사본/파생 컬럼 |

**RLS**: `student_progress`는 `xp_ledger`와 달리 v1.3 시대부터의
"allow anon all" 정책(`DATABASE.md:144, 232`)이다 — `enable row level
security` + `create policy "allow anon all" ... using (true) with check
(true))`. 즉 **anon key만으로 이 테이블에 자유롭게 읽고 쓸 수 있다**
— 이것이 "별 지급이 클라이언트를 신뢰한다"는 구조의 DB 레벨 근거다.
`xp_ledger`가 의도적으로 이 정책을 안 쓰고 서버 전용 쓰기로 설계된
것과 정확히 대비된다(`DATABASE.md:144`가 그 이유를 직접 설명).

**중요한 함의**: `total_stars` 컬럼과 `progress_data.totalStars`는
**같은 값의 두 사본**이다. 클라이언트가 `progress_data` blob 전체를
업서트할 때 `total_stars` 컬럼도 같은 값으로 함께 쓰는 구조(기존 세션
아키텍처 확인 — `useStudent.js` 동기화 경로). 즉 이번 버그로 부풀려진
값은 **두 곳 모두**에 반영된다 — 수정 설계 시 "어느 한쪽만 고치면
되는" 문제가 아님을 전제해야 한다.

## 3. 별 저장 위치 확인

- **로컬(브라우저)**: React state `record.totalStars`
  (`useStudent.js:198` 초기값, `addStars`가 갱신).
- **클라우드(영구)**: `student_progress.total_stars` 컬럼 +
  `student_progress.progress_data.totalStars`(같은 값의 사본, 위 참고).
- **멀티기기 병합**: `useStudent.js:472`
  `totalStars: maxNum(local.totalStars, cloud.totalStars)` — 두 기기 중
  더 큰 값을 채택. **이 로직 자체는 정상 병합 목적이지만, 이미 부풀려진
  값을 정당한 값으로 오인해 그대로 확정시키는 부작용**이 있다(분석
  문서에서 이미 지적). 이번 설계에서 다시 언급하는 이유: 아래 4장/5장
  수정안 모두 "병합 시에도 안전한가"를 반드시 함께 봐야 하기 때문이다.

## 4. 별 저장 위치 확인 상세 — `pronunciationOk`와의 관계

`round.pronunciationOk`(오늘 발음 성공 횟수, `useStudent.js:882-884`)는
`totalStars`와 **별개의 값**이지만 같은 문제(중복 방지 없음)를 공유한다.
`countCategoriesCompleted()`(`useStudent.js:579-586`)가
`pronunciationOk >= GOAL(5)`를 "오늘의 미션 4개 카테고리" 중 하나로도
쓰므로, 수정 설계는 **별 지급뿐 아니라 이 카운터의 의미**(미션 집계용)도
함께 고려해야 한다 — 4장/5장에서 이 둘을 분리할지 합칠지를 명시한다.

---

## 5. 가장 작은 변경으로 막을 방법 (Option A — 클라이언트 dedup Set)

### 설계

`markWordViewed(wordId)`(`useStudent.js:867-872`)가 이미 쓰고 있는,
검증된 패턴을 **그대로 재사용**한다:

```
round.pronunciationOkWordIds: string[]   // wordsViewed와 완전히 같은 모양

markPronunciationOk(wordId):
  이미 pronunciationOkWordIds에 있으면 → 아무 것도 안 함(별 지급 안 함)
  없으면 → pronunciationOkWordIds에 추가 + addStars(1) 호출
```

### 변경 범위 (파일 단위)

| 파일 | 변경 내용 |
|---|---|
| `src/hooks/useStudent.js` | `freshRound()`에 `pronunciationOkWordIds: []` 필드 추가(기존 `wordsViewed: []`와 나란히). `markPronunciationOk`가 `wordId` 인자를 받아 dedup 체크 후에만 `addStars(1)` 호출(현재는 `addStars`가 `App.jsx`에서 별도 호출되는데, 이 안에서는 `markPronunciationOk` 내부로 `addStars` 호출을 옮기는 편이 dedup 로직과 지급 로직을 한 곳에 묶어 실수를 구조적으로 방지함 — 아래 "권장 세부 결정" 참고). `countCategoriesCompleted`의 `pronunciationOk >= GOAL`을 `pronunciationOkWordIds.length >= GOAL`로 교체. 멀티기기 병합(`useStudent.js:486` 부근)에 `pronunciationOkWordIds: unionList(local.round.pronunciationOkWordIds, cloud.round.pronunciationOkWordIds)` 추가(`wordsViewed`가 이미 쓰는 `unionList` 패턴 그대로, `useStudent.js:483`). |
| `src/App.jsx:529, 579` | `onMarkPronunciationOk={() => { markPronunciationOk(); addStars(1) }}` → `onMarkPronunciationOk={(wordId) => markPronunciationOk(wordId)}`(또는 더 단순히 `onMarkPronunciationOk={markPronunciationOk}`로 그대로 전달) — `addStars` 호출을 훅 내부로 이동했다면 여기서는 제거. |
| `src/components/WordDetail.jsx` | `PronounceStep`이 `SpeechBtn`의 `onSuccess`에 `onMarkPronunciationOk`를 그대로 넘기고 있는데(`WordDetail.jsx:302`), 지금은 인자 없이 호출되므로 `onSuccess={() => onMarkPronunciationOk?.(word.dbId)}`처럼 **단어 id를 함께 실어 보내도록** 배선 변경 필요(`word.dbId`가 이미 이 컴포넌트 안에서 wordStatus 조회에 쓰이는 것과 동일 id — `WordDetail.jsx:609` 참고, 일관성 유지). |

### 기존 데이터 호환(규칙 9)

`pronunciationOkWordIds`가 없는 기존 로컬/클라우드 레코드(과거
`round.pronunciationOk` 숫자만 있던 데이터)를 읽을 때, `normalizeRecord`
류 로드 경로에서 `pronunciationOkWordIds: rec.round?.pronunciationOkWordIds
|| []`처럼 항상 빈 배열로 안전 폴백. 기존 `pronunciationOk`(숫자) 필드는
**삭제하지 않고 그대로 둔다**(하위 호환 — 혹시 다른 곳에서 읽고 있을 수
있는 값을 조용히 없애지 않음, `DEVELOPER_GUIDE.md` 안전 원칙). 새 필드는
`progress_data` jsonb blob 안의 최상위 필드 추가일 뿐이라 **SQL
마이그레이션/GRANT가 필요 없다**(규칙 8 해당 없음 — `spellingReviewQueue`/
`ticketLedger`가 이미 쓴 것과 동일한 "blob 안 새 필드" 패턴).

### 권장 세부 결정: `addStars` 호출 위치를 `markPronunciationOk` 내부로 옮길지

- **옮기는 안(권장)**: dedup 체크와 별 지급이 한 함수 안에 있어서, 앞으로
  또 다른 `onMarkPronunciationOk` 호출부가 생겨도(예: 향후 새 학습
  모드) `addStars`를 따로 호출해 실수로 가드를 우회할 방법이 구조적으로
  없다. `App.jsx`의 두 호출부(`529`, `579`)가 지금처럼 "콜백 안에서
  `addStars`를 손으로 다시 붙이는" 패턴 자체가 이번 버그가 발생한
  근본적인 이유(가드를 누구나 깜빡할 수 있는 위치에 둠) — 이 안은 그
  근본 패턴 자체를 없앤다.
- **안 옮기는 안**: 변경 diff가 `useStudent.js` 한 파일로 더 좁아지지만,
  `App.jsx`에 여전히 "콜백 안에서 addStars를 붙이는" 패턴이 남아
  다음 사람이 세 번째 호출부를 추가할 때 같은 실수를 반복할 여지가
  남는다.

이 문서는 **권장만 하고 결정하지 않는다** — 실제 구현 단계에서 운영자
확인 후 확정.

### 이 안의 한계 (정직하게 기록)

- 여전히 **클라이언트 신뢰 모델**이다 — `student_progress`가 "allow
  anon all"인 이상, devtools로 `progress_data`를 직접 조작해 별을
  무한정 만들어내는 경로 자체는 이 수정으로도 막히지 않는다(애초에
  이번 버그의 범위가 "정상 UI 조작으로 우연히 재현되는 버그"이지
  "악의적 위조 방지"가 아니었다는 점은 분석 문서에서도 명시함).
- 예문(`examplesHeard`)/퀴즈(`quizSolved`) 카운터의 동일한 결함(분석
  문서 "발생 원인 후보 2번")은 이 안의 범위에 포함하지 않았다 — 필요시
  같은 패턴을 그대로 복제해 별도 작업으로 처리 가능.

---

## 6. SaaS 확장 가능한 방법 (두 가지 제안)

`docs/agent-decisions/0006-multitenant-saas-architecture.md`가
멀티테넌트 전환을 "사업적 결정이 먼저 나야 착수"한다고 이미 못박아둔
상태이므로(0% 구현), 아래 두 안은 **지금 당장 구현하라는 제안이
아니라, SaaS 규모(여러 학원, 더 많은 학생, 더 다양한 보상 트리거)로
커져도 이번에 고르는 방식이 발목 잡히지 않는지를 미리 점검**하는
용도다.

### 안 1 — Option A를 일반화한 "클라이언트 dedup 유틸" (점진적, 저비용)

4장의 `pronunciationOkWordIds` 패턴을 **재사용 가능한 헬퍼**로
추출한다(설계 스케치, 실제 코드 아님):

```
markCategoryProgress(round, category, wordId, { onFirstTime }) {
  이미 round[category+'WordIds']에 wordId가 있으면 → round 그대로 반환
  없으면 → round[category+'WordIds']에 추가한 새 round 반환 + onFirstTime() 호출(별 지급 등)
}
```

- `pronunciationOk`뿐 아니라 `examplesHeard`/`quizSolved`(분석 문서
  원인 후보 2번)에도 같은 헬퍼를 적용해, "학습 카테고리별 하루 1회
  단어당 보상"이라는 규칙을 **한 곳의 함수**로 통일한다.
- SaaS 확장 관점 장점: 향후 학원마다 커스텀 보상 규칙(예: A학원은
  발음 성공마다 별 1개, B학원은 2개)이 생기더라도, "언제 처음
  트리거되는가"를 판단하는 로직과 "얼마를 줄지"를 완전히 분리해뒀기
  때문에 반/학원 단위 설정(`classes` 테이블에 이미 있는 설정 패턴,
  `spelling_test_enabled` 등과 동일 방식)만 얹으면 된다.
- SaaS 확장 관점 한계: 여전히 클라이언트 신뢰 모델이라, **학원 간
  경쟁/랭킹/과금이 실제 학습량에 연동되는 기능**(SaaS 비전 문서들이
  언급하는 "학원별 통계/리더보드" 부류)이 생기면 이 안만으로는
  불충분 — 학원 원장이 devtools로 자기 학원 학생 데이터를 조작할
  유인이 생기는 순간(특히 유료 SaaS에서는 "내 학원 성과가 곧 돈"이 됨)
  클라이언트 신뢰만으로는 안전하지 않다.

### 안 2 — `star_ledger` (xp_ledger와 동일 패턴으로 별도 도입, 서버 권위)

이미 이 코드베이스에 **검증되고 실제 운영 중인 패턴**(`xp_ledger`)이
있으므로, 그것을 그대로 별에도 적용한다.

```sql
-- 설계 스케치, 실제 SQL 아님 — xp_ledger와 완전히 동일 구조
create table star_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  source_event_id text not null,   -- 예: 'pronunciation:{wordId}:{date}'
  amount smallint not null check (amount > 0 and amount <= 20),
  created_at timestamptz not null default now(),
  unique (student_id, source_event_id)
);
-- anon/authenticated: select만. insert는 GRANT 자체를 안 줌(서버 전용).
create view star_totals as
  select student_id, coalesce(sum(amount),0)::integer as total_stars
  from star_ledger group by student_id;
```

- 쓰기 경로: `api/grant-star.js`(신규, `api/grant-xp.js`를 그대로
  본떠서) — 클라이언트는 `sourceEventId`(예:
  `pronunciation:${wordId}:${todayStr()}`)만 보내고, 금액은 서버가
  결정. 중복은 `unique(student_id, source_event_id)`가 원자적으로
  막는다 — 클라이언트 state 오염/멀티기기 경쟁조건/새로고침 타이밍
  전부에 영향받지 않는다(4장의 Option A는 여전히 이런 것들에 이론상
  취약할 수 있는 반면, 이 안은 DB 제약이 근본적으로 막음).
- `total_stars`는 `xp_totals`처럼 파생 VIEW로 전환(또는 최소한 주기적
  재계산 캐시 컬럼)하면, "저장된 값을 신뢰"가 아니라 "원장을 신뢰"로
  전환되어 감사(audit)가 항상 가능해진다 — 특정 학생의 별이 실제로
  왜 그 값인지 `star_ledger`를 조회해서 100% 설명 가능(SaaS 운영에서
  "이 학원 이 학생 데이터가 왜 이런지" CS 대응/분쟁 해결에 직접
  도움).
- SaaS 확장 관점 장점: 멀티테넌트 전환 시(`academy_id` 도입,
  `0006-multitenant-saas-architecture.md` 설계) `star_ledger`에
  `academy_id`(또는 FK 체인으로 유도 가능한 `student_id`)만 있으면
  학원별 집계/과금/리더보드를 **추가 로직 없이 SQL 집계**로 바로 뽑을
  수 있다 — "학원 A가 이번 달 몇 개의 별을 지급했는가" 같은 질문에
  기존 `xp_totals` VIEW 패턴을 그대로 복제해서 답할 수 있다는 뜻.
- SaaS 확장 관점 한계: 새 테이블 + 새 서버리스 함수 + 클라이언트
  배선 변경이 필요해 **4장(Option A)보다 훨씬 큰 변경**이다. Vercel
  Hobby 플랜의 서버리스 함수 12개 한도(기존 감사 문서에서 이미 지적된
  제약)에 함수 1개가 추가로 필요하다는 점도 실제 착수 시 반드시
  확인해야 한다.

### 두 안의 관계 — 택일이 아니라 단계

- **지금 당장(이번 버그 수정)**: 4장 Option A로 충분하고, 변경 범위도
  가장 작다. "학습 완료 후 같은 단어로 별을 반복 획득한다"는 제보된
  증상은 Option A만으로 완전히 해소된다.
- **SaaS 착수가 실제로 결정되는 시점**: 안 2(`star_ledger`)로 전환을
  **재검토**할 근거가 이미 존재한다(`xp_ledger`가 그 청사진). 그
  시점엔 Option A의 `pronunciationOkWordIds` 같은 클라이언트 dedup
  로직을 걷어내고 `star_ledger` insert 호출로 교체하는 리팩터링이
  될 것 — 이번 Option A 구현이 그 전환을 막거나 어렵게 만들지는
  않는다(오히려 "언제가 처음 트리거되는 시점인가"를 이미 명확히
  코드로 정의해뒀으므로, 그 판단 로직을 그대로 `sourceEventId` 생성
  로직으로 재사용할 수 있다).

---

## 7. 다음 단계 (이 문서의 범위 밖)

- 4장(Option A) 채택 여부와 "addStars 호출 위치를 훅 내부로 옮길지"
  세부 결정을 운영자에게 확인.
- 채택되면 `implementer` 역할로 별도 세션에서 구현 + 검증(회귀 시나리오
  는 `docs/bugs/star-duplicate-reward-analysis.md` "안전한 수정 방법"
  7번 항목 참고).
- 안 2(`star_ledger`)는 SaaS 착수가 실제로 결정된 뒤에만 별도 설계
  문서로 재작성.

## 참고 문서

- `docs/bugs/star-duplicate-reward-analysis.md` — 원인 분석(이 문서의
  전제)
- `supabase_v2_3_paul_rank.sql` — `xp_ledger`/`xp_totals` 실제 DDL(안 2의
  직접 근거)
- `api/grant-xp.js` — 서버 권위 지급 패턴의 실제 구현(안 2가 복제할 대상)
- `DATABASE.md:63, 144, 232` — `student_progress` 구조 및 RLS 정책
- `docs/agent-decisions/0006-multitenant-saas-architecture.md` — SaaS
  착수 전제 조건(사업적 결정 우선)
