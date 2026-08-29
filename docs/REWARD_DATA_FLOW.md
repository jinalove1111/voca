# Reward System — 전체 데이터 플로우 감사 (2026-08-19, 2026-08-29 갱신)

이 문서는 **Reward System V1의 지급 규칙**(`docs/REWARD_ECONOMY_V1.md`,
지급표/경제 수치)을 반복하지 않고, **데이터가 실제로 어디서 생성되어 어디로
쓰이고, 새로고침/재로그인 후 무엇이 복원되는지**를 코드 근거(파일:라인)로
추적한다. 읽기 전용 조사 결과이며 소스 코드는 수정하지 않았다.

> **2026-08-29 갱신 이력** — 최초 작성(2026-08-19) 이후 세 갈래 변경이 들어와
> 이 문서를 현재 `main` 기준으로 맞췄다.
> 1. `e9ddb94`(레거시 daily-mission-bonus 중복 지급 수정)가 `useStudent.js`에
>    +51/−7줄을 넣어 앵커 호출부가 아래로 밀렸다 → A-1 표와 본문의
>    `파일:라인` 좌표를 실측값으로 교정.
> 2. 2026-08-23 서버측 강화(보안 감사 HIGH 2·3·4) — L1/L2/L3 3층 방어
>    → **A-4 신설**.
> 3. 2026-08-24 세션 토큰 인증(HIGH 1) — `SESSION_SECRET` 기반 guard
>    → **A-5 신설**.
>
> 구조 서술(앵커 6종 / 별 공식 / dual-write 위험 / source of truth)은 현재
> 코드와 여전히 일치해 그대로 두었다. 이 문서의 모든 좌표는 2026-08-29
> `main`(`c0520c7`) 기준으로 재대조했다.

지급표가 필요하면 → `docs/REWARD_ECONOMY_V1.md`.
레벨업 배지 등 애착 시스템 전반은 → `handoff.md` 애착 시스템 섹션.

---

## 0. 핵심 파일 지도

| 파일 | 역할 |
|---|---|
| `src/utils/rewardEngine.js` | Reward V1 규칙의 단일 진실 원천(순수 함수, import 0개) — 금액표/레벨/idempotency key/서버 검증 화이트리스트 |
| `src/hooks/useStudent.js` | 상태(record)와 지급 함수(`grantReward`/`grantLedgerReward`) 보유, `patch()`가 유일한 쓰기 경로 |
| `src/utils/wordLibrary.js` | 서버 I/O — `postRewardEvent`(원장 쓰기 요청), `syncStudentProgress`/`fetchFullProgress`(전체 record 백업/복원) |
| `api/grant-xp.js` | Vercel 서버리스, `ledger:'reward'` 분기가 `reward_ledger` INSERT의 유일한 쓰기 지점 |
| `api/_pinAuth.js` | (2026-08-24) 세션 토큰 서명/검증 — `sessionSecret`/`signSessionToken`/`verifySessionToken`. 서버 전용, 브라우저 번들에 들어가지 않음 |
| `api/verify-student-pin.js` | (2026-08-24) 이 앱에서 서버가 학생 신원을 확정하는 **유일한** 순간 — 로그인 성공 시 세션 토큰을 함께 발급 |
| `src/components/Dashboard.jsx` | 화면 표시(`starsDisplay`, `RewardCard`) |

---

## A. 이벤트별 데이터 플로우 (Reward V1 앵커 6종)

### A-1. 6개 앵커 호출부 전수

| 앵커(`reward_type`) | 별 | 호출부(파일:라인) | source_type / source_id 패턴 |
|---|---|---|---|
| `word-session-complete` | +1 | `useStudent.js:1359` (`round.completedToday.length >= GOAL` 이펙트) | `daily-words` / `{날짜}` |
| `daily-goal-complete` | +3 | `useStudent.js:1429` (4/4 라운드 완료 이펙트) | `daily-goal` / `{날짜}` |
| `streak-bonus` | 가변(2/3/5) | `useStudent.js:1491` (`history` 변경 이펙트, `streakBonusStars(streak)`) | `streak` / `{날짜}:{연속일수}` |
| `writing-complete` | +2 | `useStudent.js:1627` (`recordSpellingAnswer` 내 `justCompletedWriting`) | `daily-writing` / `{날짜}` |
| `wrong-word-recovered` | +1 | `useStudent.js:1651`(정답 경로) **및** `useStudent.js:1690`(`clearSpellingReviewWord`, 복습화면 제거 경로) — 두 호출부가 **같은 키**(`{날짜}:{wordId}`)를 공유해 어느 쪽으로 해소되든 1회만 지급 | `spelling-review` / `{날짜}:{wordId}` |
| `exam-complete` | +2 | `useStudent.js:1707` (`recordExamCompleted`, `EntranceTest.jsx`가 서버 저장 **성공 확정 후에만** 호출) | `entrance-test` / `{testId}` |

### A-2. 단일 이벤트의 8단계 경로

모든 앵커가 `grantLedgerReward(rewardType, sourceType, sourceId, starsOverride?, label?)`
(`useStudent.js:1025-1053`) 한 함수를 통과한다.

```
1) 이벤트 발생
   ex) round.completedToday.length가 GOAL에 도달 (useEffect 트리거)

2) dedup key 생성 — rewardIdempotencyKey(studentId, rewardType, sourceType, sourceId)
   (rewardEngine.js:69-71) → "studentId:rewardType:sourceType:sourceId"

3) 클라이언트 사전 체크 — hasRewardEntry(record.rewardLedger, key)
   (rewardEngine.js:128-131, useStudent.js:1031) — 이미 있으면 patch()조차 호출 안 함

4) 로컬 원장 append — appendRewardEntry (rewardEngine.js:135-140)
   patch()의 updater 안에서 prev.rewardLedger 재검사(같은 tick 안전)
   → record.rewardLedger 배열에 {reward_type, source_type, source_id,
      stars_delta, xp_delta:0, idempotency_key, created_at} 추가
   (useStudent.js:1032-1036)

5) 로컬 총합 반영 — grantReward(rewardStars, key) (useStudent.js:977-994)
   같은 key를 dedupKey로 재사용 → round.starGrantLog에 append,
   record.totalStars += rewardStars, history[today].starsEarned 갱신

6) 서버 저장(fire-and-forget, await 없음) — postRewardEvent(studentId, ...)
   (wordLibrary.js:2899-2910) → POST /api/grant-xp
     {ledger:'reward', studentId, rewardType, sourceType, sourceId,
      token: _sessionToken}   ← token은 2026-08-24 추가(A-5)
   → api/grant-xp.js:79-270 — 인증 guard(A-5) → 화이트리스트 →
     L1/L2/L2.5/L3 방어(A-4) → resolveRewardStars()가 금액 재결정
     (클라이언트 금액 불신), rewardIdempotencyKey()를 서버가 다시 조립,
     reward_ledger INSERT(:242). 실패해도 로컬 지급은 이미 끝나 학습
     흐름에 영향 없음.

7) 화면 표시 — record.totalStars(=stars) → starsDisplay = stars + clearedStars
   (useStudent.js:909) → Dashboard.jsx:505. 레벨업 피드백은
   rewardFeedback 큐(useStudent.js:1043-1051)로 별도 토스트 표시.

8) 영속화
   a) localStorage 즉시 — patch() 내부 saveStore(store) (useStudent.js:835-843),
      매 patch마다 동기 저장.
   b) 클라우드 백업 — doSync(useStudent.js:1805-1836) + 2초 디바운스 타이머
      (useStudent.js:1840-1844) →
      syncStudentProgress(studentId, {totalStars: merged.totalStars, ...,
      fullRecord: merged}) (wordLibrary.js:2764-2801) →
      student_progress.total_stars(요약 컬럼) + progress_data(fullRecord
      전체, rewardLedger 포함) upsert.
```

### A-3. 새로고침 / 재로그인 후 복원

- **새로고침(같은 기기, localStorage 살아있음)**: `loadRecord` → `localStorage`
  에서 바로 복원. 서버 왕복 없음. `rewardLedger`/`totalStars` 모두 그대로.
- **재로그인·기기 초기화(localStorage 비어있음)**: `useStudent.js:864-895`
  restore effect가 `isEmptyRecord(record)`일 때만 `fetchFullProgress(studentId)`
  (wordLibrary.js:2810~) → `student_progress.progress_data`(=예전에 저장된
  `fullRecord`) 조회 → `normalizeRecord(backup, studentId)`(useStudent.js:409-454,
  `rec.rewardLedger = asArray(rec.rewardLedger)`로 방어)로 정규화해 그대로
  `record`에 반영. **`totalStars`는 백업 blob의 값을 그대로 쓰고,
  `reward_ledger`를 다시 읽어 재계산하지 않는다.**
- **로컬에 데이터가 있는 상태의 재로그인(다른 기기 병합)**: `useStudent.js:864-880`
  분기 — `fetchFullProgress` 결과와 로컬을 `mergeProgressRecords`
  (`useStudent.js:534-638`)로 병합. `totalStars`는 `maxNum(local, cloud)`
  (line 580), `rewardLedger`는 `mergeRewardLedgers`(line 501-506, idempotency_key
  기준 합집합)로 병합 — **두 기기의 원장이 합쳐지지만 `totalStars`는 원장을
  합산해서 재계산하는 게 아니라 두 컬럼 값 중 max를 취할 뿐**이다(B 섹션 참고).

---

### A-4. 서버측 3층 방어 + 일일 상한 (2026-08-23, 보안 감사 HIGH 2·3·4)

A-2의 6단계에서 서버가 하는 일은 "금액 재결정"만이 아니다. `ledger:'reward'`
분기(`api/grant-xp.js:79-270`)는 **클라이언트가 무엇을 주장하는가**가 아니라
**서버가 무엇을 관측할 수 있는가**로 막는다. 네 검문소 모두 fail-closed —
조회 자체가 실패하면 지급하지 않는다.

| 층 | 위치 | 무엇을 막는가 | 거부 사유(`reason`) |
|---|---|---|---|
| **L1** 학생 실재 | `grant-xp.js:149-160` | `studentId`는 클라이언트 입력이라 형식 검증만으로는 부족 — `students`에 실제로 있는 행인지 조회 | `student_lookup_failed` / `student_not_found` |
| **L2** 이벤트 실재 | `grant-xp.js:167-183` | `exam-complete`는 `sourceId` 패턴이 `uuid`라 **아무 UUID나 지어내도 형식 검증을 통과**한다. `entrance_test_results`에 `(test_id, student_id)` 행이 있을 때만 지급 | `exam_lookup_failed` / `exam_result_not_found` |
| **L2.5** 재시도 선판정 | `grant-xp.js:194-208` | 같은 `idempotency_key`가 이미 있으면 **상한 검사보다 먼저** `{ok:true, duplicate:true}`로 응답 | — (정상 중복 응답) |
| **L3** 일일 상한 | `grant-xp.js:217-240` | `(student_id, reward_type)`별 오늘 지급 건수를 세어 상한 초과 시 거부 | `no_daily_cap_defined` / `cap_check_failed` / `daily_cap_reached` |

#### L2.5가 L3보다 먼저 오는 이유 (순서가 곧 계약이다)

상한이 1인 타입(`word-session-complete`/`writing-complete`/`daily-goal-complete`/
`streak-bonus`)에서 **정상적인 재시도**가 `daily_cap_reached`로 응답되면,
클라이언트는 그것을 실패로 읽고 또 재시도하는 악순환에 빠진다. 그래서
"같은 이벤트의 재시도"는 상한 판정 이전에 `duplicate:true`로 빠져나간다
(`grant-xp.js:186-192` 주석). 상한은 "하루에 **서로 다른** 이벤트 몇 개까지"를
제한하는 것이지 재시도를 실패로 만드는 장치가 아니다.

L2.5는 TOCTOU에 노출되지만(조회와 INSERT 사이 경합) 최종 방어는 여전히
INSERT의 `23505` unique 위반이라 원자적으로 막힌다(`grant-xp.js:242-256`).

#### 상한값 — `REWARD_DAILY_CAP` (`rewardEngine.js:266-273`)

| `reward_type` | 상한 | 근거 |
|---|---|---|
| `word-session-complete` | 1 | 날짜키(`date`) — 하루 1회가 정의상 최대 |
| `writing-complete` | 1 | 날짜키 |
| `daily-goal-complete` | 1 | 날짜키 |
| `streak-bonus` | 1 | 날짜키 |
| `exam-complete` | 10 | 반·날짜당 시험 최대 8 실측 → 여유 2 |
| `wrong-word-recovered` | 60 | 유닛당 단어 최대 50 실측 → 여유 10 |

상한이 실질적으로 의미를 갖는 건 `sourceId` 자유도가 큰 뒤의 두 타입
(`uuid` / `date:token`)이다. 날짜키 4종은 애초에 키가 하루 하나뿐이라
상한 1이 곧 구조적 사실의 재확인이다.

#### 날짜 경계는 KST 자정 (`kstDayStartMs`, `rewardEngine.js:293-299`)

`created_at`은 UTC인데 학생의 하루는 KST다. UTC 자정으로 세면 **오전 9시
KST에 상한이 리셋되는** 엉뚱한 동작이 된다. `kstDayStartMs`가 KST 시각축으로
옮겨 하루 단위로 내림한 뒤 다시 UTC 축으로 되돌린다
(`grant-xp.js:228`이 이 값을 `.gte('created_at', ...)`에 넣는다).

#### 화이트리스트 (선행 관문)

L1보다 앞에 `isValidRewardType`(`grant-xp.js:113-119`)과
`isValidRewardSource`(`:120-123`)가 있다. `REWARD_SOURCE_RULES`
(`rewardEngine.js:168-175`)에 없는 `rewardType`은 여기서 즉시
`unknown_reward_type`으로 잘린다 — `legacy-baseline`이 항상 거부되는 것도
이 지점이다(D 섹션 3번 참고).

---

### A-5. 세션 토큰 인증 guard (2026-08-24, 보안 감사 HIGH 1)

A-4의 3층 방어가 들어간 시점에도 **엔드포인트 자체에는 인증이 없었다**.
서버는 "이 studentId가 실재하는가"는 확인했지만 "요청자가 정말 그 학생인가"는
보지 못했으므로, 누구나 남의 `studentId`를 실어 그 학생의 원장을 상한 안에서
부풀릴 수 있었다. 이 절이 그 구멍을 닫은 경로다.

#### 발급 — `verify-student-pin` → session token

```
학생이 이름+PIN 입력
  → POST /api/verify-student-pin
  → api/verify-student-pin.js 가 service_role 로 PIN 검증
  → 성공 시에만 signSessionToken(match.id) 호출
     (api/verify-student-pin.js:136)
  → 응답 { ok:true, studentId, name, className, unitName, token }
```

이 지점이 **이 앱에서 서버가 학생 신원을 확정하는 유일한 순간**이라
여기서만 토큰을 만든다. 새 인증 프레임워크를 도입하지 않고 이미 존재하는
유일한 로그인 관문을 재사용한 것이다 — `hashPin`이 `bcrypt` 대신 Node 내장
`crypto`(scrypt)를 쓰는 것과 같은 정신으로, 여기서도 내장 `crypto` HMAC만
쓴다(외부 패키지 0개, 저장소 규칙 6).

토큰 형식(`api/_pinAuth.js:179-190`):
```
token   = base64url(payloadJson) + '.' + base64url(HMAC-SHA256(payloadJson))
payload = { sid, exp }
```

- **payload는 최소화** — 이름/반/유닛/PIN 어떤 개인정보도 담지 않는다.
  토큰은 서명만 되어 있고 **암호화되어 있지 않으므로**(브라우저가 읽을 수 있음)
  담기는 값은 "이미 그 클라이언트가 아는 것"(자기 `studentId`)뿐이어야 한다.
- **TTL 30일** — `SESSION_TOKEN_TTL_MS`(`_pinAuth.js:160`). 아이가 매번 다시
  PIN을 치지 않아도 되는 길이로 잡았다.
- 시크릿이 없으면 `signSessionToken`이 `null`을 반환한다(fail-closed —
  가짜 토큰을 만들어 통과시키는 일이 없도록).

#### 클라이언트 보관 — 화면에 노출하지 않는다

```
StudentSelect.jsx:72  → onSelect({ ..., token: data.token })
App.jsx:1102          → setSessionToken(sel.token)
App.jsx:1103          → localStorage[SESSION_KEY] = { id, name, token }
App.jsx:1016          → 세션 복원 시 setSessionToken(sess?.token)
wordLibrary.js:2871-2873 → 모듈 스코프 _sessionToken 에 보관
```

`SESSION_KEY`는 `paulEasyVoca_currentStudent`(`App.jsx:964`)이며
**origin 단위로 격리**된다. 학생 로그인 화면/입력은 이름+PIN 그대로이고
UX 변화가 없다.

#### 검증 — `grant-xp` → verify → ledger write

```
POST /api/grant-xp { ledger:'reward', studentId, ..., token }
  │
  ├─ 토큰 수집 (grant-xp.js:104-106)
  │    body.token 또는 x-session-token 헤더 — 둘 다 받는다
  │
  ├─ verifySessionToken(supplied, { studentId: rewardStudentId })
  │    (grant-xp.js:107, 구현 _pinAuth.js:193-237)
  │    ① 시크릿 없음            → no_secret        ← fail-closed
  │    ② 토큰 없음/공백         → missing_token
  │    ③ 'a.b' 2조각 아님       → malformed_token
  │    ④ 서명 불일치            → bad_signature
  │         · 서명 검증을 payload 파싱보다 **먼저** 한다
  │           (변조된 payload를 파싱하는 표면 자체를 줄임)
  │         · 비교는 crypto.timingSafeEqual — 문자열 === 금지
  │           (_pinAuth.js:209)
  │    ⑤ exp 경과                → expired
  │    ⑥ token.sid ≠ body.studentId → student_mismatch
  │
  ├─ 실패 시 (grant-xp.js:108-111)
  │    { ok:false, reason:'unauthorized', detail:<위 사유> } — 지급 0
  │
  └─ 통과 시 → 화이트리스트 → L1 → L2 → L2.5 → L3 → reward_ledger INSERT
```

#### `SESSION_SECRET` 운영 노트

- 서버 환경변수에서만 읽는다 — `sessionSecret()`(`_pinAuth.js:165-167`).
  **폴백이 없다.** 같은 파일의 `supabaseAdminKey()`(`:134-136`)가
  `SUPABASE_SERVICE_ROLE_KEY → VITE_SUPABASE_ANON_KEY`로 폴백하는 것과
  의도적으로 다르다 — 그건 읽기 권한 폴백이고 이건 위조 방지 시크릿이다
  (`_pinAuth.js:162-164` 주석).
- **`VITE_` 접두사를 절대 붙이면 안 된다** — 붙는 순간 브라우저 번들에
  들어간다.
- 값 자체는 이 문서에 기록하지 않는다(조회 대상도 아니다). 필요한 것은
  "설정되어 있는가" 하나뿐이다.
- **미설정 시 영향 범위**: `verifySessionToken`이 `no_secret`을 돌려주므로
  원장 쓰기가 **완전히 멈춘다**. 다만 학생 화면 영향은 0 —
  `postRewardEvent`가 fire-and-forget이라 로컬 별 지급(A-2의 4~5단계)은
  이미 끝난 뒤다. 즉 "학생은 평소대로 별을 받지만 서버 감사 기록만
  비어간다"는 조용한 실패이므로, 배포 환경에 값이 있는지는 코드가 아니라
  운영 쪽에서 확인해야 한다.
- **교체(rotate) 시 주의**: 발급된 토큰 30일치가 한꺼번에 무효가 되고,
  각 학생이 재로그인할 때까지 그 학생의 원장 쓰기가 멈춘다.

#### 남은 관측 (수정하지 않음)

`grant-xp.js:141-145`의 주석 블록은 아직 "이 엔드포인트에는 인증이 없다
(HIGH 1 … BLOCKED)"라고 적혀 있다. 2026-08-24에 바로 위 `:103-112`가 인증
guard를 넣어 HIGH 1이 닫혔으므로 **이 주석은 현재 사실과 어긋난다.**
동작에는 영향이 없고 이 문서의 수정 범위(문서 1파일) 밖이라 그대로 두었다.

---

## B. Displayed Stars 공식 (가장 중요)

### B-1. 최종 공식

```
starsDisplay = totalStars + clearedStars
             = record.totalStars + clearedWords.length * CLEARED_STAR_PER_WORD(1)
```
근거: `useStudent.js:908-909`. 화면(`Dashboard.jsx:505`)은 **오직 이 값만**
렌더한다.

`totalStars`(=`stars`, 위 destructure `useStudent.js:899`)는 `grantReward()`
(`useStudent.js:977-994`)가 늘리는 **단 하나의 저장 필드**이며, Reward V1의
`grantLedgerReward`도 결국 이 함수를 호출해 같은 필드를 증가시킨다
(`useStudent.js:1037`).

### B-2. `reward_ledger`가 화면 합산에 들어갈 수 있는가 — 구조적으로 불가능

`record.rewardLedger`/서버 `reward_ledger` 테이블을 **읽어서 별 개수 계산에
쓰는 클라이언트 코드는 0건**이다(`rewardEngine.js`의 `earnedStars(ledger)`
함수는 정의돼 있지만 — grep 결과 `useStudent.js`/`Dashboard.jsx` 등 UI 경로
어디에서도 import/호출되지 않는다). `rewardEngine.js:14-17` 헤더 주석이
이 설계를 명시: "실제로 totalStars를 증가시키는 단일 경로는 이미 존재하는
`grantReward()`이며, 이 모듈은 재구현하지 않고 그대로 재사용한다."

즉 현재 구조는:
```
화면 starsDisplay ← totalStars(로컬 patch로 직접 증가) + clearedStars(파생)
                     ↑
                     reward_ledger는 여기 어디에도 입력으로 들어가지 않음
                     (감사용 부산물일 뿐, 표시값의 소스가 아님)
```
따라서 **현재는 같은 별이 `total_stars`와 `reward_ledger` 양쪽에서 중복
합산될 가능성이 없다** — 애초에 `reward_ledger`를 합산해서 쓰는 코드 경로가
존재하지 않기 때문이다(구조적 부재, 우연한 안전이 아님).

### B-3. 경고 — 향후 "원장 기반 화면"으로 전환 시 이중 합산 위험

만약 향후 누군가 "감사 가능성을 높이자"며 화면을 `earnedStars(rewardLedger)`
또는 서버 `reward_ledger` 합산 기반으로 바꾸면, 다음 3중 소스가 겹친다:

1. **`legacy-baseline` 이관값** — `supabase_v3_37_reward_legacy_baseline.sql`
   (미실행)이 실행되면 기존 `student_progress.total_stars`를
   `reward_ledger`에 `reward_type:'legacy-baseline'` 1행으로 백필한다
   (`rewardEngine.js:35-39` 주석: "이 값은 실제 학습 이벤트가 아니라
   v3_37 마이그레이션 전용"). 클라이언트 상수 `REWARD_STARS['legacy-baseline'] = 0`
   으로 고정돼 클라이언트가 이 타입으로 직접 지급을 시도해도 0별이지만,
   **SQL이 직접 심는 baseline 행의 `stars_delta`는 0이 아니다**(운영 DB
   실측 145행/31,852별 — 조사 지시 "확정된 사실" 참고).
2. **Reward V1 신규 원장(6종 앵커)** — 2026-08-15 이후 실제 발생.
3. **로컬 `record.totalStars`** — 레거시 6개 지급 경로(4/4 라운드 +10,
   매치게임, 기프트박스 중복, 미션클리어, 발음, 쓰기콤보) 전부가 여전히
   `grantReward()`로 이 필드를 계속 늘리고 있다 — Reward V1 전환 이후에도
   멈추지 않는다.

이 셋을 단순 합산하면 `legacy-baseline`(과거분 이관)과 `total_stars`
(과거분 원본, 계속 증가 중)가 **같은 과거 지급을 두 번** 세게 되고,
신규 원장분(2)도 `total_stars`에 이미 반영돼 있으므로 세 번째로 겹친다.
**"원장을 표시 소스로 승격"하려면 반드시 `total_stars`를 원장에서
완전히 파생시키는(로컬 직접 증가를 끊는) 리팩터링이 선행돼야 하며, 지금
상태에서 단순히 "원장도 더하기"만 하면 확정적으로 별 부풀림 회귀가 난다.**

---

## C. 실력 별(skill stars) 감사

### C-1. `clearedWords` 증가 호출부 — 전수

grep 결과 `patch()`로 `clearedWords`를 바꾸는 지점은 `markWordCleared` 단
하나다(`useStudent.js:1146-1149`):
```js
const markWordCleared = useCallback((slug) => {
  if (!slug) return
  patch(prev => prev.clearedWords.includes(slug) ? {} : { clearedWords: [...prev.clearedWords, slug] })
}, [patch])
```
호출부는 `useStudent.js:1578` 단 한 곳, `recordQuizAnswer`류 함수 안에서
`if (correct) markWordCleared(wordId)` — **퀴즈를 한 번이라도 맞히면(첫
시도/재시도 무관) 기록**(`useStudent.js:292` 주석). 이미 `includes(slug)`면
no-op이므로 같은 단어를 여러 번 맞혀도 배열이 부풀지 않는다(append-only,
멱등).

### C-2. 저장 위치

`clearedWords`는 `record`의 일반 필드로 `patch()` → `localStorage`(즉시)
→ `syncStudentProgress`의 `fullRecord`(`progress_data`, 2초 디바운스)로
백업된다. **별도 컬럼(`cleared_words_count` 등)은 없다** — `student_progress`
테이블에 클리어 단어 전용 컬럼이 존재하지 않으므로, 관리자 대시보드가 이
값을 보려면 `progress_data` blob을 파싱해야 한다(미확인 — 이번 조사 범위
밖).

### C-3. `totalStars`에 포함되는가 — 아니오, 파생 표시값

`clearedStars = clearedWords.length * CLEARED_STAR_PER_WORD`
(`useStudent.js:908`)는 **렌더할 때마다 매번 새로 계산**되고 어디에도
저장되지 않는다. `record.totalStars`(=`grantReward`가 늘리는 필드)는
`markWordCleared` 호출 경로에서 **한 번도 건드려지지 않는다** — grep으로
확인한 `grantReward`/`grantLedgerReward` 호출부 목록에 `markWordCleared`나
`recordQuizAnswer`의 클리어 판정 블록이 없다. 즉 실력 별은 Reward V1의
`rewardLedger`와도, 레거시 `totalStars`와도 **완전히 독립된 제3의 별 소스**다.

### C-4. Reward V1과의 관계

없음(구조적으로 분리). `rewardEngine.js`/`grantLedgerReward` 어느 쪽도
`clearedWords`를 읽거나 쓰지 않는다. 같은 "퀴즈 정답" 행동이 앵커 6종
어디에도 해당하지 않으므로(퀴즈 자체는 앵커가 아니고, 그 결과로 파생되는
`word-session-complete`/`daily-goal-complete`만 앵커) 이 둘이 같은 트리거를
공유해 이중 지급될 가능성은 없다 — 다만 **표시상으로는 같은 화면 숫자
(`starsDisplay`)에 단순 합산**되므로, "학생이 보는 별"과 "totalStars 컬럼"이
구조적으로 어긋난다는 점(D 이하 참고)은 유효하다.

### C-5. 중복 가능성

- **append 자체의 멱등성**: `includes(slug)` 가드로 같은 단어 재클리어가
  배열을 늘리지 않는다.
- **길이 기반 재계산의 위험**: `clearedStars`는 `clearedWords.length`에서
  매번 재계산되므로, `clearedWords` 배열에 중복 원소가 어떤 경로로든 섞이면
  (예: 향후 코드가 `unionList` 대신 단순 `concat`으로 병합) 즉시 별 부풀림으로
  이어진다. 현재 유일한 append 경로(`markWordCleared`)와 병합 경로
  (`mergeProgressRecords`의 `unionList(local.clearedWords, cloud.clearedWords)`,
  `useStudent.js:595`)는 둘 다 중복을 걸러내므로 **현재 코드 기준으로는
  안전**하나, 이 불변식(`length === new Set(...).size`)이 `useStudent.js:149-154`
  주석이 명시하듯 "구조적으로 지켜져야 하는 전제"이지 타입 시스템이 강제하는
  게 아니라는 점은 리스크로 남는다.

### C-6. 새로고침/재로그인 후 유지 여부

유지된다 — `clearedWords`는 `normalizeRecord`(`useStudent.js:421`)가
`asArray`로 방어하며 일반 `record` 필드와 동일한 로컬 저장/백업/병합
경로(A-3과 동일)를 탄다. 별도 원장이 아니므로 서버 재계산이 필요 없다.

---

## D. dual-write 위험 분석 — 레거시 이벤트를 `reward_ledger`에 연결하면 안 되는 이유

**운영자 질문**: "예문 만들기/Quiz 완료/발음 완료/매치게임/정답 보상도
`reward_ledger`에 연결해야 하는가?"

**결론: 안 된다.** 이유:

1. **이미 지급 중이다.** 발음 성공(+1), 매치게임 정답(+10), 4/4 라운드
   완료(+10), 미션클리어(+3), 쓰기콤보(+1/+2/+3)는 전부 이미 레거시
   `grantReward(amount, dedupKey)` 경로로 `totalStars`를 늘리고 있다
   (`docs/REWARD_ECONOMY_V1.md` 2절 표, `useStudent.js` 각 호출부). Quiz
   완료 자체는 직접 별을 주지 않지만 그 결과가 `word-session-complete`/
   `daily-goal-complete`(신규 앵커) 판정의 입력이 된다.
2. **`grantLedgerReward`를 새 앵커에 추가로 걸면 "같은 행동"에 별이
   두 번 늘어난다** — `grantLedgerReward`도 결국 `grantReward()`를 호출해
   같은 `record.totalStars`를 늘리므로(A-2, 5단계), 레거시 경로가 이미
   늘린 그 필드를 신규 경로가 다시 늘리는 dual-write가 된다. dedupKey가
   다르면(레거시는 `pronunciation:{wordId}:{날짜}`류, 신규는
   `{rewardType}:{sourceType}:{sourceId}`) `grantReward`의 `starGrantLog`도
   서로 다른 키로 인식해 막지 못한다.
3. **Reward V1의 확정 스펙은 앵커 6종뿐이다.** `rewardEngine.js`의
   `REWARD_SOURCE_RULES`(line 168-175)와 `isValidRewardType`
   (line 196-200)이 서버 측 화이트리스트로 이를 강제한다 — 화이트리스트에
   없는 `rewardType`(예: `'pronunciation-complete'`, `'matchgame-correct'`)은
   `api/grant-xp.js:113-119`가 즉시 `unknown_reward_type`으로 거부한다. 즉
   **레거시 이벤트를 원장에 연결하려는 시도는 코드 변경 없이는 애초에
   서버가 받아주지 않는다** — 이는 사고가 아니라 의도된 게이트다.
4. **"원장에 레거시 지급의 감사 기록이 없다"는 사실이지만 별개 문제다.**
   레거시 6종 경로가 `reward_ledger`에 아무 흔적도 남기지 않는 것은 맞다
   (원장은 Reward V1 앵커만 기록). 하지만 이를 해결하겠다고 레거시 경로에
   `grantLedgerReward`를 그대로 붙이면 위 2)의 dual-write가 발생한다.

**올바른 해결 방향(TODO, 이번 조사에서 구현하지 않음)**: 레거시 이벤트를
감사하고 싶다면 **별을 추가로 주지 않는 감사 전용 기록**이 필요하다 —
예를 들어 `reward_ledger`에 `stars_delta = 0`으로 이벤트만 기록하는
호출(별도 `rewardType`, `REWARD_STARS`에 0으로 등록)을 신설하거나, 아예
별도 감사 테이블(`legacy_reward_audit_log` 등)을 만들어 `total_stars` 증가와
독립적으로 "무슨 레거시 지급이 언제 일어났는지"만 기록하는 방법이다. 어느
쪽이든 **`grantReward()`(totalStars 증가)를 다시 호출하지 않는 것**이
전제 조건이다.

---

## E. Source of truth 정리

| 저장소 | 역할 | 권위 | 갱신 시점 |
|---|---|---|---|
| `localStorage`(`STORE_KEY`, 기기별) | **즉시 쓰기의 1차 소스** — 모든 `patch()` 호출이 동기적으로 여기 먼저 반영(`useStudent.js:835-843`) | 이 기기에서는 최신값(가장 신뢰) | 매 `patch()` |
| `student_progress.progress_data`(`fullRecord`) | **크로스 디바이스 백업·병합 소스** — 로컬이 비었을 때 복원(A-3), 로컬이 있어도 다른 기기 진행분 병합 | 로컬이 살아있는 한 로컬이 우선, 로컬 소실 시 유일한 복구 수단 | 2초 디바운스 `doSync`, 탭 숨김 시 즉시 flush |
| `student_progress.total_stars`(요약 컬럼) | **파생 컬럼** — `fullRecord.totalStars`를 그대로 복사한 것뿐, `progress_data`와 별개로 관리되지 않음(`wordLibrary.js:2770`, `syncStudentProgress` 호출부가 항상 `merged.totalStars`를 같이 넘김) | 화면 계산에는 쓰이지 않음(관리자 대시보드 SQL 조회용) | `progress_data`와 같은 시점에 upsert |
| `reward_ledger`(서버 원장) | **감사 전용 기록** — Reward V1 앵커 6종의 "무슨 일이 있었는지" 이벤트 로그. 서버(`api/grant-xp.js`)만 쓰고, `total_stars`/`starsDisplay` 계산에는 전혀 관여하지 않음(B-2) | 화면 표시에 대해 권위 없음(현재 미참조) — 향후 감사/정산 용도로만 권위 | fire-and-forget POST, 실패해도 로컬에 영향 없음. 인증(A-5)·상한(A-4)을 통과한 요청만 기록됨 |

**권위 순서(화면에 실제로 보이는 별 기준)**: `localStorage`(이 기기 최신)
> `student_progress.progress_data`(다른 기기 병합/복구용) > `total_stars` 컬럼
(단순 파생, 참고용) > `reward_ledger`(현재는 화면과 완전히 분리된 감사
로그일 뿐).

---

## 아직 남은 위험 / TODO

1. **(B-3의 재확인) 원장 기반 화면 전환은 절대 "단순 추가"로 하면 안 됨.**
   `total_stars`를 원장에서 완전히 파생시키는 대전환이 아니라면, 지금처럼
   원장을 표시에서 완전히 배제하는 현재 구조를 유지하는 편이 안전하다.
2. **레거시 6개 지급 경로는 상한이 없다**(`docs/REWARD_ECONOMY_V1.md` 4절
   이미 지적) — 매치게임 +10/정답 무제한 반복, 기프트박스 중복 +20 무제한.
   Reward V1과 무관하지만 `starsDisplay`를 통해 같은 화면에 합산되므로,
   "왜 레벨(Reward V1 LEVELS 기준)과 화면 별 숫자가 안 맞는지" 학생/운영자
   혼란의 소지가 있다(`rewardLevel`은 `stars` 기준, `starsDisplay`는
   `stars + clearedStars` 기준 — `useStudent.js:910-913` 주석이 이미 이
   불일치를 의도적 설계로 명시하지만, 재확인 가치 있음).
3. **레거시 지급의 감사 공백** — D 섹션 TODO. `reward_ledger`에 레거시
   이벤트가 전혀 안 남으므로, "학생이 오늘 정확히 무엇으로 몇 별을 받았는지"
   전체 재구성이 현재 `history[date].starsEarned`(합계만) 수준으로만
   가능하고 이벤트별 세분화가 안 됨. 위 D 섹션 해결 방향(stars_delta=0
   감사 기록 또는 별도 테이블) 참고.
4. **`legacy-baseline` SQL(v3_37) 실행 시점 주의** — 실행되는 순간
   `reward_ledger`에 `stars_delta`가 0이 아닌 대량 행(145행/31,852별,
   운영 DB 실측)이 생긴다. 이 시점 이후 누군가 실수로 원장을 합산해
   `total_stars`와 나란히 쓰면(B-3) 즉시 이중 계상이 발생한다 — 이 SQL을
   실행하기 전, 화면 로직이 원장을 참조하지 않는다는 이번 조사 결과(B-2)를
   반드시 재확인할 것.
5. **`markWordCleared`의 구조적 불변식**(`length === Set 크기`)은 코드
   리뷰로만 지켜지는 관례다(C-5) — 타입/테스트로 강제되는지는 이번 조사
   범위에서 `scripts/` 하네스 실행까지는 확인하지 못했다(문서만 완성,
   25분 예산 내 검증 스크립트 실행은 생략).
6. **`student_progress`에 `clearedWords` 전용 컬럼이 없음**(C-2) — 관리자
   대시보드가 실력 별을 보려면 `progress_data` blob 파싱이 필요한지는
   이번 조사에서 `AdminScreen.jsx` 쪽까지 추적하지 않았다(범위 밖).

---

## 발견한 이상/의심 지점 (수정하지 않음, 목록만)

- `rewardEngine.js`의 `earnedStars(ledger)` 함수가 정의돼 있지만 저장소
  전체에서 호출부가 없다(dead code로 보임) — 향후 원장 기반 표시를 위해
  미리 준비해 둔 것일 수도 있으나, 현재는 미사용.
- `RewardCard`(Dashboard.jsx:679-680)는 `totalStars={stars}`를 props로
  받는다 — `starsDisplay`가 아니라 `stars`(순수 `totalStars`, 실력 별
  미포함)를 넘긴다. 카드 상단 배지(`starsDisplay`)와 `RewardCard` 내부에
  표시되는 별 숫자가 서로 다른 기준일 수 있어(레벨 계산은 `stars` 기준이
  맞지만, 카드에 별 개수 자체도 노출한다면 혼란 가능) 실제 렌더 결과 확인이
  필요해 보인다(이번 조사에서 `RewardCard.jsx` 내부 렌더까지는 열어보지
  않음).
