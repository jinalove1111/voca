# 그림 단어 승인/제외 결정의 영구 저장 방식 (조사 + 초안)

_2026-10-13. 조사와 초안만 있는 문서다. 데이터베이스는 건드리지 않았고 SQL도 실행하지 않았다. 실행 전 초안: `supabase_v3_52_picture_review_DRAFT.sql`(저장소 루트, 미실행)._

## 1. 결론 먼저

권장은 **(A) 파일 기반**이다. 교사가 내보낸 JSON을 개발자가 `scripts/pictureWords/source/decisions.json`에 커밋하고, 생성기가 `pictureWords.json`을 다시 만든다. 학생 화면은 지금처럼 빌드 결과만 보므로 새 실패 경로가 생기지 않는다. 대신 결정 한 묶음마다 커밋과 배포가 필요하다.

운영자가 정해야 할 것은 두 가지다.

1. 결정 기록을 DB에도 남기고 싶은가(누가 언제 승인했는지). 원하면 같은 폴더의 초안 SQL(하이브리드)을 승인한다. 원하지 않으면 SQL은 쓰지 않는다.
2. 기존 119장(아래 2절)에 대해 "제외 결정이 학생 화면에서 그림을 숨겨도 되는가"를 별도로 승인한다. 지금 코드는 그 경우를 허용하지 않는다.

## 2. 지금 상태

- 결정은 관리자 화면 `src/components/admin/PictureWordReviewPanel.jsx`(맨 위 주석, 10~19행)에서 **그 브라우저의 localStorage에만** 저장된다. 네트워크 호출 0. 브라우저 데이터를 지우거나 다른 기기로 가면 사라진다.
- 영구 기록이 되는 길은 하나뿐이다. 화면의 JSON 내보내기를 복사해 개발자에게 주고, 개발자가 `source/decisions.json`에 넣어 커밋하는 것. 이 파일은 지금 비어 있다.
- 빌드 때 `scripts/pictureWords/buildPictureWordsData.mjs`가 `decisions.json`을 검증(`validateDecisions.mjs`의 `validate()`)하고, `isLearnable()`로 학생 노출 여부(`learn`)를 정해 `pictureWords.json`에 굽는다. `src/data/pictureWords/index.js`는 그것을 읽을 뿐이다. 학생 노출은 **빌드 시점**에 결정된다.
- 동작 값은 `approve` / `exclude` 두 가지다(`validateDecisions.mjs` 6행). 이 문서의 "reject"는 코드의 `exclude`와 같다.
- **119장이 아직 승인될 수 없는 이유**: `validate()`는 `MATCH` 상태 그림에 결정이 오면 `decision on a MATCH entry` 오류를 내고(25행) 빌드를 멈춘다. 119장은 `source/legacyAutoPublished.json`에 얼려 둔, 이미 자동 공개된 `MATCH` 그림이다(`isLearnable`: `status === 'MATCH' && legacy.has(id)`이면 결정 없이도 노출, 11행). 또 `isLearnable`은 `approve`가 아니면 이 119장을 계속 노출하므로, `MATCH`에 `exclude`를 허용하더라도 지금 규칙으로는 숨겨지지 않는다. 숨기려면 `isLearnable` 변경도 필요하다.
- 검토 탭은 `MISMATCH`/`UNCERTAIN`/`MULTIPLE`(의심 건)만 나열한다(`PictureWordReviewPanel.jsx` 70행 부근). 119장은 목록에 없다.
- 화면 쪽 `applyDecisions()`(`index.js`)는 브라우저 미리보기용 별도 경로다. 빌드 경로와 규칙이 같지 않다. 어느 쪽을 진실로 볼지 정리가 필요하다.

그림 id는 `pics2/anchor` 같은 자산 id이고 학생 데이터가 아니다. **이 기능 어디에도 학생 식별자가 들어가지 않는다**(CLAUDE.md 규칙 4).

## 3. 선택지 비교

| | (A) 파일 기반 | (B) DB 테이블 + 런타임 읽기 | (C) 하이브리드: DB는 기록, 노출은 빌드 |
|---|---|---|---|
| 영구성 | git 이력. 가장 단단함 | DB 행 | DB 행 + 내보내서 커밋하면 git에도 남음 |
| 쓰기 주체 | 개발자(커밋) | 관리자 PIN을 서버에서 확인한 경로 | 같음 |
| 학생이 읽는 것 | 빌드된 `pictureWords.json` | 런타임에 DB 읽기(테이블에 anon 읽기 권한 필요) | 빌드된 `pictureWords.json`(변화 없음) |
| 실패/폴백 | 새 실패 경로 없음 | 테이블 부재·네트워크 오류 시 학생 화면 폴백 필요(규칙 9). 새 실패 모드 | 테이블이 없어도 학생 화면은 영향 없음. 관리자 저장만 "준비 안 됨" 표시 |
| 필요한 작업 | 검증기가 `MATCH` 결정을 받도록 변경, 검토 탭에 119장 나열, 필요시 `isLearnable` 변경 | 테이블 + 권한 + 서버 경로 + 학생 화면 런타임 읽기 + 오프라인/캐시 처리 | 테이블 + 권한 + 서버 경로(관리자 화면 저장) + DB를 `decisions.json`으로 내보내는 운영자용 스크립트 |
| 결정 반영 속도 | 커밋 + 배포마다 | 즉시 | 내보내기 + 커밋 + 배포마다 (A와 같음) |
| 위험 | 결정마다 개발자 손이 듦. 복사/붙여넣기 실수 | 학생 화면 변경 위험이 가장 큼. 규칙 1(기존 기능 보호)과 충돌 소지 | 이중 기록이라 DB와 파일이 어긋날 수 있음 |

서버 경로 현황(사실): 이 저장소의 관리자 쓰기는 브라우저가 anon 키로 직접 쓰는 방식이 아니다. `src/utils/wordAssets.js`의 `upsertWordAsset(asset, adminPin)`이 `src/utils/wordLibrary.js`의 `callAdminContentWrite()`(85행)를 부르고, 이것이 Supabase Edge Function `supabase/functions/admin-content-write/index.ts`에 `{ adminPin, action, payload }`를 POST한다. 그 함수가 `ADMIN_PIN` 환경값과 대조해 인가한 뒤(691~694행) service-role 키로 DB에 쓴다(704~708행). `word_asset.upsert` 액션이 이미 이렇게 구현돼 있다(675행). 따라서 (B)/(C)의 쓰기 경로는 **새 액션 하나를 이 Edge Function에 추가**하면 된다. Vercel 함수는 필요 없다.

Vercel 함수 개수: `api/`에 `.js` 파일 13개, 그중 `_pinAuth.js`는 공용 도우미라 배포 함수가 아니다. 따라서 배포 함수는 12개이고 한도(12개)에 꽉 찼다. 새 `api/` 파일은 불가능하다. `api/admin-pin-actions.js` 상단 주석이 같은 이유로 파일을 통합한 이력을 적어 두었다. Edge Function(`supabase/functions`)은 이 한도와 별개다(다만 Edge Function의 재배포는 운영자 작업이며, 아래 7절 참고).

## 4. 필요한 스키마 (초안 SQL 기준)

테이블 `public.picture_reviews`, 그림 1장당 현재 결정 1행.

| 컬럼 | 이유 |
|---|---|
| `picture_id` (primary key) | 그림 id. 1장당 1행을 구조로 보장 |
| `action` (`approve`/`exclude`) | `validateDecisions.mjs`의 ACTIONS와 같은 값. 내보내기가 그대로 맞는다 |
| `corrected_en`, `corrected_ko` (선택) | 교사가 고친 표기. 1~40자, 앞뒤 공백 없음(`okText` 규칙과 동일) |
| `reviewer_label` (선택) | 결정한 사람의 표시 이름. 학생이 아님. 사람 계정 id도 아님 |
| `note` (선택) | 사유 메모(500자 이하) |
| `revision` | 결정이 바뀐 횟수. 최신 여부 확인용 |
| `decided_at`, `updated_at` | 언제 결정/수정했는지 |

변경 이력을 전부 남기는 별도 이력 테이블은 만들지 않았다(필요하면 나중에 추가). "보류"는 값이 아니라 행 없음 또는 기존 행 유지로 표현한다. 행을 제거하는 권한은 주지 않았다.

기존 119장은 처음에는 **행이 없다 = 검토 필요**다. 행이 없어도 학생 화면에서는 계속 보인다(얼린 목록 때문). 어떤 그림에 `exclude` 행이 생겨도 학생에게서 숨겨지는 것은 아니다. 숨기려면 (1) 검증기가 `MATCH` 결정을 허용하고 (2) `isLearnable`이 `exclude`를 우선하도록 바뀌고 (3) 운영자가 "제외가 학생 화면을 숨겨도 된다"고 따로 승인해야 한다.

## 5. 접근 권한

- **anon / authenticated**: 모든 권한 회수, 정책 없음. 쓰기뿐 아니라 읽기도 막는다.
- **service_role**: select, insert, update. 관리자 PIN을 서버(Edge Function)에서 확인한 뒤에만 쓴다.
- 근거: `DATABASE.md` "2026-09-02 v3_45 백업/로그 테이블 락다운"(RLS 켬 + 정책 0 + anon 권한 0)과 "2026-09-06 STAR SPENDING Phase 1 RLS"의 `star_purchases`(정책 0 + `revoke all`)와 같은 최소 권한 방식이다. `supabase_v3_51_phonics_progress_DRAFT.sql`도 같은 관례를 쓴다.
- `word_assets`(`supabase_v3_15_word_assets.sql`, anon select 허용 + 쓰기는 service_role)와 다른 점: 거기서는 학생 화면이 그 테이블을 직접 읽는다. 여기서는 권장안(A/C)에서 학생이 읽지 않으므로 **anon 읽기가 필요 없다**. (B)를 택할 때만 anon 읽기(또는 서버 경유 읽기)를 별도 검토해야 한다.
- `students` 테이블과 무관하므로 규칙 10(GRANT)·규칙 11(PIN 컬럼)의 대상이 아니다.

## 6. 적용 순서와 되돌리기

- 초안은 `create ... if not exists`만 쓰는 추가 전용이다. 여러 번 실행해도 안전하다(규칙 9).
- 현재 코드는 이 테이블을 쓰지 않는다. 그래서 SQL을 먼저 실행하든 코드가 먼저 배포되든 앱은 지금과 같다. 테이블이 없을 때는 앞으로 만들 쓰기 액션이 부재 오류(42P01 / PGRST205)를 감지해 "저장 기능이 아직 준비되지 않았다"고 알려주고, 학생 화면은 변하지 않아야 한다. `wordLibrary.js`의 `isMissingTableError` 방식을 재사용한다(재구현 금지).
- 실행은 운영자가 Supabase SQL Editor에서 수동으로 한다(규칙 8). 파일 끝의 주석 검증 쿼리(읽기 전용)로 확인한다. anon 거부는 SQL Editor가 아니라 anon 키 클라이언트로 확인해야 한다(`scripts/testRlsSecurity.mjs` 방식).
- 되돌리기: 코드가 테이블을 쓰지 않게 하면 된다(Edge Function 새 액션 미사용/비활성). 테이블이 남아 있어도 무해하다. 물리적 제거는 이 문서의 범위가 아니다.

## 7. 확인하지 못한 것

- **운영 DB의 실제 상태**. 이 저장소 파일만 읽었고 DB에는 접근하지 않았다. `picture_reviews`가 이미 있는지, `service_role` 권한이 기본값에서 어떻게 설정돼 있는지는 모른다.
- `supabase_v3_15_word_assets.sql` 등 참조한 마이그레이션이 실제 실행됐는지는 `DATABASE.md`의 기록(2026-09-02 정정표)을 근거로 한 것이다. 오늘 기준 운영 상태는 확인하지 못했다.
- `admin-content-write` Edge Function이 운영에 어떤 버전으로 배포돼 있는지, 새 액션 추가 후 재배포 절차와 `ADMIN_PIN` 비밀값 설정 상태. `wordAssets.js` 주석에는 `word_asset.*` 액션이 "미배포"였던 시기의 설명이 남아 있어, 현재 배포 상태와 일치하는지 확인하지 못했다.
- `api/` 파일 13개 중 배포 함수가 12개라는 계산은 파일 목록과 `_pinAuth.js`가 도우미라는 점에 근거한다. Vercel 쪽 실제 배포 함수 수와 `vercel.json` 설정은 확인하지 않았다.
- 119장이라는 건수는 확인됐다(`scripts/testPictureWords.mjs`가 `legacyAutoPublished.json`의 119개 id와 실제 데이터를 대조한다). 다만 그 119장 각각의 그림·뜻이 맞는지는 아무도 검토하지 않았다 — 그것이 이 기능의 목적이다.
- `index.js`의 `applyDecisions()`와 빌드 경로(`isLearnable`)의 규칙 차이가 의도된 것인지는 확인하지 못했다.
- 위 인용 행 번호는 2026-10-13 읽은 시점 기준이며 이후 수정으로 바뀔 수 있다.
