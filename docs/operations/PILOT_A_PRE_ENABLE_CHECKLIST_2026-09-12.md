# Pilot A 실행 직전 체크리스트 (2026-09-12, 130차)

_근거: `handoff.md` 2026-09-12(130차) — Admin Features 패널 접근 버그
수정(PR #38) merge + 배포 확인 세션의 부산물로 작성. 이 문서는 절차
문서이며, 이 문서 자체의 작성으로 Pilot A가 시작되는 것은 아니다 —
실행 여부/시점은 운영자 결정._

## 1) 전제

- PR #38이 merge되어 배포 완료(main `aa89e43`) — 관리자 "🎯 기능" 탭이
  새 기기에서 정상적으로 열리는 상태(이전에는 `authed`(PIN 세션)와
  무관하게 localStorage `paulEasyVoca_userRole`(기본 `student`)만 보는
  구조라, 정상 관리자도 "❌ 접근 권한 없음 / 현재 역할: student"를
  봤다).
- 위 전제가 아직 확인되지 않았다면 이 체크리스트를 실행하지 않는다.

## 2) 기기당 절차 (Kinney 기기 먼저)

1. 학생이 실제 쓰는 브라우저로 앱을 연다.
2. 로그아웃한다.
3. ⚙️ 관리자 → PIN 입력.
4. "🎯 기능" 탭 → "애착 시스템 (Attachment & Growth)" 카테고리를
   펼친다.
5. **`paulTownV1`만** 체크한다 — 카테고리 전체 토글, `townShopV1`,
   기타 플래그는 건드리지 않는다.
6. 관리자 화면을 나간다.
7. 학생으로 로그인한다.
8. 대시보드 → Paul Town → Town 카드 → 잔액 표시를 확인한다(Kinney 41 /
   Irene 55 / Mimi 67 / Yaeji 0 / 문지유 0). 환영 토스트가 뜨지 않아야
   한다.
9. 새로고침 후에도 카드가 유지되는지 확인한다.

## 3) 주의

- 플래그는 기기 단위다 — 공용 기기라면 다른 학생 계정에도 노출된다.
- 시크릿 창, 사이트 데이터 삭제, iOS 장기 미사용 등으로 플래그가 OFF로
  되돌아갈 수 있다(안전한 방향이므로 문제는 아니다).

## 4) 구매 테스트 (Kinney)

1. tree 10 PD로 1회 구매 → 잔액 41 → 31로 감소하는지 확인.
2. 인벤토리에 tree 1개가 있는지 확인.
3. 배치 → 이동 → 보관 → 재배치가 정상 동작하는지 확인.
4. 새로고침 후에도 배치가 유지되는지 확인.
5. 로그아웃/로그인 후에도 배치가 유지되는지 확인.
6. 정상 학습 1회 후 stars/XP/PD가 정상적으로 증가하는지 확인.
7. Yaeji/문지유는 구매 없이 학습 보상으로 PD가 생성되는지만
   **관찰**한다 — 수동으로 PD를 생성하지 않는다.

## 5) POST READ-ONLY 확인

- `production_pilot_student_diagnostic.sql`의 블록 3/5/7/11을 실행한다.
- 전역 dup-key(중복 idempotency key) 쿼리를 실행한다.
- `dollar_ledger`에 생긴 신규 행이 `reward:*`/`purchase:*` 유형만인지,
  `welcome`/`migration` 유형이 0건인지 확인한다.

## 6) STOP 조건 (운영자 목록 그대로)

아래 중 하나라도 관찰되면 해당 기기의 `paulTownV1`을 OFF로 되돌리고,
데이터를 임의로 수정하지 않은 채 보고한다:

- `welcome`/`migration` 유형 `dollar_ledger` 행 발생.
- 예상외의 `dollars_delta`.
- 구매 후 잔액이 기대치(예: Kinney 31)와 다름.
- tree가 2회 이상 지급됨.
- reward 중복 idempotency key 발생.
- 학습 행위 없이 stars/XP가 변화.
- 배치가 소실됨.
- 다른 학생의 배치가 노출됨.
- Town 화면 에러 발생.
- 기존 login/quiz/spelling/pronunciation 플로우 회귀.
- 학생/학부모로부터 문제 제기.

## 7) `TOWN_V1_WELCOME_ENABLED`

Pilot A 진행 중에는 이 값을 **미설정(unset) 상태로 유지**한다 — 확정
5명 중 잔액이 이미 0보다 큰 학생(Kinney/Irene/Mimi)은 클라이언트
조건상 welcome 크레딧 청구 자체가 발생하지 않는다.
