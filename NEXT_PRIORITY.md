# NEXT_PRIORITY.md — 다음 작업 순서 (2026-08-02 기준)

_작성: 2026-08-02, docs-maintainer. 근거 상세는 `BUG_REPORT.md`(버그별
file:line/재현/영향), 구조적 배경은 `TECH_DEBT.md`, 감사 범위는
`PROJECT_AUDIT.md`. 이 문서는 **실행 순서와 각 항목의 선행조건·예상
리스크**만 정리한다._

---

## 0. 학생 체감 MEDIUM — 2026-08-02(28차) 제품 폴리시 세션에서 보류

_근거: `handoff.md` 28차. 아래는 이번 세션 2축 감사(아동 경험/교사·
성능)에서 발견했지만 저위험 즉시수정 범위를 넘어서거나(학습 흐름
자체를 바꿈) 운영자 결정이 필요해 코드 미반영 상태로 남긴 항목 —
순서는 우선순위가 아니라 발견 순._

- **발음/예문 단계 강제 녹음 게이트 완화(학생 체감 마찰 1순위)** —
  발음 듣기·따라 말하기 단계가 녹음을 강제해야만 다음 단계로 넘어가는
  구조라, 마이크 권한 거부/기기 문제 시 학습 자체가 막힌다. 완화 여부는
  "녹음 후 따라 말하기"라는 핵심 학습 설계를 바꾸는 결정이라 운영자
  판단 없이 임의로 손대지 않았다(규칙 1 — 기존 학습 플로우를 위험하게
  하지 않는다).
- **레벨업 미션 3탭 루프** — `LevelUpMission.jsx`에서 미션 완료 판정/
  진행 흐름이 반복 탭을 유도하는 구조라 체감 루프가 길게 느껴질 수 있음
  (오늘 세션에서 "렌더 가능한 미션이 0개일 때 빈 상태가 잘못 표시되던
  버그"는 수정했으나, 루프 자체의 UX 재설계는 범위 밖).
- **다중 반 동시 배정** — 한 학생이 여러 반에 동시 소속될 때의 배정/
  진행 표시가 아직 단일 반 가정에 가까운 부분이 있음(학생 식별은 UUID
  기준으로 이미 정확 — 규칙 4 준수 확인, 표시/배정 UX만 개선 여지).
- **커리큘럼 검수함 배치 처리** — `SpellingReviewQueuePanel` 등 검수
  큐가 개별 항목 단위 처리 위주라, 대량 항목을 한 번에 처리하는 배치
  UX(선택 다중 처리 등)가 아직 부분적임.
- **렌더 스모크 테스트 도입** — 오늘 `9585acd`(`AdminDashboard`
  `adminPin` prop 미배선 ReferenceError)가 `npm run build`와
  `npm run verify:all` 둘 다 잡지 못하고 자체 발견·수정으로만 처리된
  검증 공백(`handoff.md` 28차 2절)에 대한 구조적 대응. React Testing
  Library 등으로 주요 화면(특히 관리자 탭 전환)을 실제로 마운트해
  ReferenceError/undefined prop 클래스의 버그를 빌드 시점이 아니라
  테스트 시점에 잡는 하네스가 없다 — 도입 여부/범위는 별도 세션에서
  `TESTING.md` 갱신과 함께 설계 필요.

---

## 1. 보안 브랜치 승인·머지 (`fix/verify-student-pin-ilike`, 커밋 `fb65dd7`)

- **근거**: `BUG_REPORT.md` H1/M10/M12.
- **상태**: **코드 작성 완료, 운영자 승인·머지 대기** — 더 이상 "작성할
  일"이 아니라 "승인 후 머지할 일"로 좁혀짐. 브랜치에 3건이 이미
  구현돼 있다: (1) `api/verify-student-pin.js` — `trimmedName`의
  `%`/`_`/`\` 이스케이프(H1), (2) `api/self-set-student-pin.js`/
  `api/set-student-pin.js` — PIN 설정 check-then-act 레이스 가드,
  관리자 재설정 경로는 의도적으로 가드 예외(M10), (3)
  `api/generate-audio.js` — PATCH URL `wordId` 인코딩 비대칭 해소
  (M12). `npm run build` 통과 확인됨.
- **선행조건**: 운영자 승인(프로덕션 인증 경로, 서버리스 함수 — Vercel이
  main을 배포하므로 병합 = 즉시 라이브 반영).
- **작업**: 운영자가 브랜치 diff 검토 → 승인 시 `main`에 머지(fast-forward
  또는 PR) → push.
- **예상 리스크**: 낮음(국소 4파일, 코드는 이미 작성·빌드 검증까지
  끝난 상태). 승인만 받으면 즉시 반영 가능.
- **완료 조건**: 머지 후 `npm run build` PASS 재확인 + `%` 입력으로
  candidates가 1건 이하(또는 정확 일치)로 좁혀지는지, PIN 설정 동시
  요청 시 레이스가 재현되지 않는지 수동/스크립트 확인.

## 2. `admin-content-write` 검증 순서 교정 + 입력 캡 + settings allowlist — 한 번의 재배포로 묶어 처리

- **근거**: `BUG_REPORT.md` H2 + `docs/SECURITY_AUDIT_V311.md` §4
  MEDIUM-1(`class.update_settings` allowlist 부재, 아직 미수정 확인
  필요 — 이번 감사에서 재확인은 안 했으나 해당 문서가 "Edge Function
  배포 시 함께 반영 권장"으로 이미 명시).
- **선행조건**: Edge Function 코드 수정은 로컬 하네스로 검증 불가(Deno
  런타임) — 운영자가 재배포를 트리거하는 세션에서 세 가지를 **한 번에**
  묶어 처리해야 배포 횟수를 아낀다.
  1. `handleWordsBulkReplace`: insertRows 검증을 delete 앞으로.
  2. rows 배열 크기 상한(입력 캡) 추가 — 과도한 payload로 인한 타임아웃/
     비용 방지(신규 발견 아님, 방어적 하드닝 권장 사항).
  3. `handleClassUpdateSettings`: 5개 필드 allowlist 적용
     (`docs/SECURITY_AUDIT_V311.md` §4 MEDIUM-1 그대로).
- **예상 리스크**: 중간(Edge Function 재배포 1회, 로컬 검증 불가라
  배포 후 라이브 스모크 테스트 필수 — `scripts/testEdgeFunctionsE2E.mjs`
  재사용 가능).
- **완료 조건**: 재배포 후 손상 payload로 words.bulk_replace 재현 시도
  → 기존 단어 보존 확인 + `testEdgeFunctionsE2E.mjs` 재실행 PASS.

## 3. `accepted_meanings` 배치 lost-update 레이스

- **근거**: `BUG_REPORT.md` H3.
- **선행조건**: 없음(코드 전용 수정) — 단, 어떤 수정안(직렬화 vs
  정규화 테이블 전환)을 택할지 운영자/구현 세션 판단 필요.
- **예상 리스크**: 중간. 오늘 세션(21~23차) 실사용 코드라 회귀 재검토
  필요, `testWritingReviewAiPipeline.mjs` 기존 단언에 배치 lost-update
  재현 시나리오 추가 권장.
- **완료 조건**: 같은 단어 2건 이상 포함 배치 처리 후 두 인정이 모두
  `accepted_meanings`에 남아있는지 확인하는 신규 테스트 통과.

## 4. 라운드 완료 signature 충돌

- **근거**: `BUG_REPORT.md` H4.
- **선행조건**: signature 구성요소 확장(라운드 시작 시각/카운터 추가)이
  기존 별/스티커 반복 지급 의도(코드 주석 명시)를 깨지 않는지 운영자
  확인.
- **예상 리스크**: 중간-높음(보상 로직 직결 — 규칙 1 "기존 플로우
  안전 최우선"에 따라 범위를 좁게 잡아야 함).
- **완료 조건**: 같은 카운트 조합의 두 번째 라운드에서도 보상이
  정상 지급되는 회귀 테스트 추가 + 기존 반복 지급 동작 불변 확인.

## 5. 차기 락다운 배치 (듀얼패스 선행)

- **근거**: `TECH_DEBT.md` §1.
- **선행조건**: 반드시 (a) Edge Function 핸들러 9종 추가 →
  (b) 클라이언트 듀얼패스 배선(`updateTextbookMeta`/`deletePublisher`
  포함, `BUG_REPORT.md` M11) → (c) 배포·실배포 확인 → **그 다음에야**
  (d) 락다운 SQL 준비·운영자 실행. 순서를 바꾸면 v3.11과 같은 "관리자
  쓰기 404" 사고 재발.
- **예상 리스크**: 높음(9개 테이블, 여러 화면 — 규모가 v3.11보다 큼).
  단계별로 나눠 진행 권장(예: `publishers`/`grades`/`grammar_points`
  먼저, `passages` 계열은 별도).
- **완료 조건**: 각 테이블 anon INSERT/UPDATE/DELETE 프로브가 42501
  반환 + 관리자 화면 해당 CRUD 정상 동작(pin 경로) + verify 하네스
  정직 SKIP 래퍼 추가.

## 6. 메모리 엔진 배선

- **근거**: `TECH_DEBT.md` §6.
- **선행조건**: `wordLibrary.js:1697` 부근 `review_data` 병합 로직
  수정이 먼저(이미 `handoff.md` 2026-08-02(24차)에 순서로 명시됨).
- **예상 리스크**: 중간(학생 화면 신규 연결 — 플래그 뒤 opt-in 출시
  원칙 유지 권장, 헌법 규칙 12 범위 밖의 통상 기능이지만 안전을 위해
  기본 off 유지가 이 저장소 관례).
- **완료 조건**: `review_data` 병합 수정 후 기존 `verify:learning-engine`/
  `verify:examples` PASS 유지 + 학생 화면 신규 연결 지점에 플래그 게이팅
  확인.

---

## 순서 요약 (의존성 그래프)

```
1 (독립, 즉시 가능)
2 (독립, Edge Function 재배포 1회로 3항목 묶음)
3 (독립)
4 (독립, 보상 로직이라 신중)
5 (2의 패턴을 참고하되 별도 재배포 — 5-a 코드 → 5-b 배포 → 5-c SQL)
6 (선행: review_data 병합 수정 → 배선)
```

1~4는 서로 독립적이라 병렬 진행 가능. 5는 규모가 크므로 1~4 완료 후
별도 세션으로 단계적 진행 권장. 6은 5와 무관하게 언제든 시작 가능하나
review_data 선행 수정이 막혀 있으면 대기.
