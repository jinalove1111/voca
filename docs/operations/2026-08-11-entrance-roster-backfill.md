# 2026-08-11 — 입실시험 로스터 백필: "고1 능률 민병천" 미배정 4명

작성: implementer 세션(93차 후속). 대상 SQL: `supabase_v3_34_account_status.sql`,
`supabase_v3_35_entrance_textbook_backfill.sql`(둘 다 이 저장소 루트, 아직
운영자 미실행). 이 문서는 append-only 관례에 따라 새 파일로 작성했고,
기존 `docs/ENTRANCE_EXAM_ELIGIBILITY.md`/`handoff.md`는 수정하지 않았다.

## 배경 요약

"고1 능률 민병천" 교재(textbook_id `09c073dd-a136-4a66-8e39-44a392f236d8`,
소유 컨테이너 class_id `ec584e53-1da5-470e-bab0-238d71cc6042`)를 실제로
배우는 학생은 12명인데, 그중 4명은 `student_class_assignments`(SCA) 행이
없거나(3명) canonical 계정이 아닌 중복 계정에만 있어서(1명) 입실시험 대상
분모에서 빠진다.

| 학생 | canonical id | 상태 |
|---|---|---|
| 황다은(Dana) | `d05dea68-f019-4202-b494-6a917158ccd4` | SCA 행 없음 |
| 김규민(Richard) | `7592fa07-04a0-4597-89ac-31eae0c01299` | SCA 행 없음 |
| 현다율(Essel) | `e32b8d7d-ef76-4292-ba46-059fb7b9719e` | SCA 행 없음 |
| 권교빈(Liam) | `6548dd2a-cc01-4b4f-80d9-746d55bf5014` | SCA 행이 **중복 계정**(`942e7e12-1fab-4948-a870-6d5dd5f7d36b`, 이름 `권교빈_DUP2_f7d36b_INACTIVE`)에만 있음 — canonical 계정엔 없음 |

## 방법 A — SQL 실행(권장, 4명 일괄)

1. `supabase_v3_34_account_status.sql`을 먼저 실행 — `students.is_test`/
   `students.archived` 컬럼을 만들고 백필한다. 검증 SELECT ④번(권교빈
   canonical 계정이 archived=false인지)으로 사고 원인을 재확인할 수 있다.
   (이 파일은 이번 백필과 직접 관계는 없지만, `supabase_v3_35_...sql`의
   검증 쿼리 ④가 `students.is_test`/`archived` 컬럼 존재를 전제하므로 먼저
   실행해 두는 것을 권장 — 순서를 지키지 않아도 v3_35 자체의 INSERT는
   정상 동작한다, 검증 쿼리 ④만 42703으로 실패할 뿐).
2. `supabase_v3_35_entrance_textbook_backfill.sql`을 Supabase 대시보드 SQL
   Editor에서 실행 — 4명에게 순수 INSERT 4행만 추가된다.
3. 파일 하단의 검증 SELECT(①~⑤)를 순서대로 실행해 확인.

## 방법 B — 관리자 화면에서 손으로 배정(1명씩, SQL 없이)

1. 관리자 화면(`AdminScreen.jsx`) → 학생 디렉터리 탭(`StudentDirectory.jsx`)
   으로 이동.
2. 검색/스크롤로 대상 학생을 찾아 행을 펼친다(주의사항 아래 참고).
3. 펼친 행 안의 "교재 배정" 섹션(`TextbookAssignmentPanel`)에서 "+ 교재
   추가" 드롭다운을 열고 "고1 능률 민병천"을 선택 → 추가.
   - 내부적으로 `assignTextbook(studentId, tb.ownerClassId)`가 호출되고,
     `is_primary=false`/`current_unit_id=null`로 SCA 행 1개가 생긴다(주
     교재는 바뀌지 않는다 — 학생은 계속 기존 화면 그대로 보임).
4. 4명(황다은/김규민/현다율/권교빈) 전원 반복.

### 권교빈 관련 주의(가장 실수하기 쉬운 지점)

- 학생 디렉터리에서 "권교빈"으로 검색하면 이름이 같은/유사한 행이 **두 개**
  나올 수 있다(canonical `6548dd2a…`와 중복 계정
  `942e7e12…`, 이름이 `권교빈_DUP2_f7d36b_INACTIVE`로 이미 바뀌어 있으면
  검색어로 안 잡힐 수도 있음 — 대신 id로 직접 대조).
- **반드시 canonical 계정(`6548dd2a-cc01-4b4f-80d9-746d55bf5014`, total_stars
  1039·스티커 30·입실시험 응시 5건)에만 교재를 추가한다.** 중복 계정
  (`942e7e12…`)에는 이미 배정이 있으므로 손대지 않는다 — 중복 계정의 기존
  배정/진도/별점을 삭제·병합하지 않는다(운영자 지시).
- 학생이 실제로 로그인하는 계정이 어느 쪽인지(중복 계정으로 로그인 중이면
  응시 기록이 여전히 그쪽에 남는다)는 이 배정 작업과 별개의 계정 통합
  문제다 — 이번 작업 범위가 아니다(아래 "하면 안 되는 것" 참고).

## 적용 후 확인 방법

- `supabase_v3_35_entrance_textbook_backfill.sql` 하단 검증 쿼리 ④(12명
  UUID 집합 대조) — `actual_count=12`, `missing_from_actual=0`,
  `unexpected_in_actual=0`이 정상.
- `npm run verify:admin`(`scripts/testEntranceClassScope.mjs` 포함) —
  관리자 분모/학생 조회 범위/아카이브 제외가 어긋나지 않는지 라이브
  교차 검증. `npm run verify:eligibility`(순수 함수 36단언)도 함께 통과
  해야 정상.
- 관리자 화면에서 "고1 능률 민병천" 반으로 입실시험을 열고 "반 전체"
  인원이 12명으로 보이는지 육안 확인.

## 하면 안 되는 것

- **`is_primary`를 true로 바꾸지 않는다.** 4명 모두 계속 기존 주 교재
  (황다은/현다율 = 고1 6월 학평, 김규민 = 중2 능률 김기택, 권교빈 = 기존
  주 교재 그대로)로 학습해야 한다 — 능률 배정은 어디까지나 두 번째
  (secondary) 배정이다.
- **학생의 반(`students.class_id`)을 옮기지 않는다.** 이 작업은
  `student_class_assignments`에 행을 추가하는 것이지 학생의 소속 반을
  바꾸는 게 아니다.
- **기존 교재 배정을 제거하지 않는다.** "+ 교재 추가"만 하고 다른 배정
  옆의 "해제" 버튼은 누르지 않는다.
- **권교빈의 중복 계정(`942e7e12…`)을 삭제/병합/이름 복원하지 않는다.**
  이번 작업은 canonical 계정에 배정을 추가하는 것으로 한정된다 — 계정
  통합은 별도 운영자 판단·작업이다.
- **`current_unit_id`를 임의로 채우지 않는다.** null로 시작해 두고, 학생이
  실제로 그 교재를 펼쳐볼 때 관리자가 `setAssignmentUnit`(같은
  `TextbookAssignmentPanel`의 유닛 선택 드롭다운)으로 명시적으로 고르게
  한다.
