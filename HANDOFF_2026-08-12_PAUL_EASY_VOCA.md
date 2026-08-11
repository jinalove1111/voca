# HANDOFF — 2026-08-12 아침 보고 (93차 야간 자율 작업)

작업 시각: 2026-08-11 심야 ~ 2026-08-12 새벽
브랜치: `work/night-2026-08-11` → `main` push 완료 → Vercel production 배포 완료

---

## 1. 6시간 동안 한 일

| 우선순위 | 한 일 |
|---|---|
| **P0** | 기준선 측정 — build/verify:all/verify:integrity 전부 PASS 확인 후 시작 |
| **P1** | 입실시험 eligibility 구조 전수 분석(반/교재/배정/학습교재/판정 5계층 분리) |
| **P2** | **판정 규칙을 순수 모듈 1곳으로 단일화** — 3일간 3번 재발한 근본 원인 제거 |
| **P3** | mock 기반 회귀 테스트 36단언 신규(`verify:eligibility`, 네트워크 0) |
| **P4** | 관리자 입실시험 UI 점검 + 분모 조회 실패/0명 구분 |
| **P5** | 모바일 안정성 코드 리뷰 → `docs/MOBILE_QA.md` (실기기 항목은 MANUAL_TEST_REQUIRED) |
| **P6** | 라이브 데이터 무결성 21항목 전수 검사 → **P0 0 / P1 0 / P2 2** |
| **P7** | 본문 핵심표현 품질 감사 → 저장된 데이터 사후 재검증 단언 2개 추가 |
| **P8** | Writing Coach 상태 확인(플래그 OFF 유지, 코드 변경 0) |
| **P9** | 성능/N+1 감사 4건 관측 — **의도적으로 수정 안 함**(Correctness > Performance) |
| **P10/P11** | 학생·관리자 회귀 리뷰 → 확정 결함 9건 / **오탐 3건 판별** |
| **P12** | `verify:eligibility`, `verify:class-textbooks` 신규 |
| **P13** | 중복 eligibility 로직 제거(순수 모듈 위임). 대규모 refactor 없음 |
| **P14** | 문서 5종 작성 |
| **P15** | 이 문서 |

---

## 2. 수정한 파일

**신규 (7)**
- `src/utils/entranceEligibility.js` — 판정 규칙 단일 진실 공급원(순수 함수)
- `scripts/testEntranceEligibilityRules.mjs` — mock 회귀 테스트 36단언
- `scripts/verifyClassTextbooks.mjs` — 반-교재 링크 점검 운영자 도구
- `supabase_v3_33_integrity_constraints.sql` — **미실행 제안**
- `docs/CLASS_TEXTBOOK_MODEL.md` / `docs/ENTRANCE_EXAM_ELIGIBILITY.md`
- `docs/DATA_INTEGRITY_REPORT.md` / `docs/MOBILE_QA.md` / `docs/REGRESSION_REPORT.md`

**수정 (5)**
- `src/utils/wordLibrary.js` — 규칙을 순수 모듈에 위임(얇은 어댑터화)
- `src/components/EntranceTestAdmin.jsx` — 분모 조회 실패 표시 구분
- `scripts/auditCurriculumIntegrity.mjs` — 예문 불변식 2개 추가
- `package.json` / `tests/harness/registry.mjs` — 신규 검증 등록

---

## 3. commit 목록

| hash | 내용 |
|---|---|
| `4364a3e` | refactor: eligibility 규칙 순수 모듈 단일화 + mock 회귀 테스트 |
| `e0f9a8c` | docs: 반·교재 5개 개념 기준서 + eligibility 판정 기준서 |
| `fcc2fdc` | feat: 예문 사후 재검증 + 무결성 보고서 + DDL 제안(미실행) |
| `da7b5ee` | feat: verify:class-textbooks + 관리자 분모 실패 표시 |
| `5644503` | docs: 모바일 QA + 회귀 검사 보고서 |

## 4. 배포 여부

**배포 완료.** production `https://voca-drab.vercel.app` · ● Ready ·
`origin/main = 5644503` · 번들 `index-CiWUYyh_.js`(로컬 빌드와 해시 일치 확인).

## 5. build 결과
`npm run build` **PASS** (에러/신규 경고 0)

## 6. verify 결과
- `npm run verify:all` — **ALL DOMAINS: PASS** (speaking/listening 기존 SKIP)
- `npm run verify:integrity` — PASS (15개 단언, 오늘 2개 추가)
- `npm run verify:eligibility` — PASS (36단언, 신규)
- `npm run verify:class-textbooks` — 정보 출력(신규)

## 7. 새로 만든 테스트

| 테스트 | 무엇을 고정하나 |
|---|---|
| `verify:eligibility` 36단언 | 운영자 확정 8개 시나리오 + **반증 테스트**(class_textbooks·현재 학습 교재·반 이름이 판정에 못 들어옴을 구조적으로 고정) |
| `verify:integrity` +2 | `practice_sentence`가 본문의 정확한 부분 문자열 / target word 포함 (저장된 25건 PASS) |
| `verify:class-textbooks` | 근거 없는 반-교재 링크 누적 감지 |

## 8. 발견한 버그

D1 eligibility 3중복(P1) · D2 예문 쓰기 검증 부재(P1) · D3 분모 실패=0명(P2) ·
D4 시험 중 새로고침 시 제한시간 리셋(P2) · D5 종료 후 지각 제출 무표시(P2) ·
D6 `classes.name`/`units` UNIQUE 없음(P0 구조) · D7 primary 플립 비원자(P0 구조) ·
D8 `UITest` 계정 집계(P3) · D9 select 터치 34px(P3)

## 9. 수정한 버그
- **D1** — 순수 모듈 단일화 + 36단언 고정 (재발 차단)
- **D2** — 데이터 사후 재검증 단언 추가 (감지)
- **D3** — "확인 실패" 표시로 구분

## 10. 수정하지 않은 버그 (이유 포함)
- **D4**: 단순 저장 시 "정당한 재접속인데 0초로 잠겨 시험 자체를 못 봄"이라는
  **더 나쁜 실패 모드**가 생김 → 정책 결정 필요
- **D5**: 설계상 허용(지각 제출 유예). 표시 추가는 운영자 판단
- **D6/D7**: DDL 필요 — SQL 파일만 준비, 규칙 8에 따라 미실행
- **D8/D9**: 경미. D8은 스키마 컬럼 추가가 근본책
- 성능 4건: Correctness > Performance 원칙에 따라 야간에 미착수

## 11. production DB 변경 여부
**없음. INSERT/UPDATE/DELETE/DDL 0건.** 모든 조사는 SELECT 전용.

## 12. 학생 데이터 변경 여부
**없음.** 반/교재/Unit/진도/별/숙제/시험기록 **무변경**. 재배정·삭제 0건.

## 13. class_textbooks 분석 결과

| 분류 | 건수 | 내용 |
|---|---|---|
| KEEP | 14 | 자기 소유 교재 8 + 실제 사용자 있는 링크 6 |
| **LIKELY_WRONG** | **4** | Pre-Middle School ← 고1 6월 학평 / 중1 동아 / 중2 동아 / 중2 천재 (소속 9명 중 **0명** 사용) |
| NEEDS_OWNER_CONFIRMATION | 2 | 중2 YMB 박준원(컨테이너, 소속 0명) ← 중2 능률 / 중2 천재 |

**삭제 시 교재 접근을 잃는 학생: 0명** (전원이 개별 배정을 이미 보유).
단, 지시대로 **삭제하지 않았습니다.**

## 14. 실제 입실시험 eligibility 구조

```
대상 = 아래 중 하나라도 만족
  A. students.class_id            === 시험 반   → CLASS_MEMBER
  B. SCA.class_id                 === 시험 반   → INDIVIDUAL_CLASS
  C. SCA.textbook_id의 교재 소유 반 === 시험 반   → INDIVIDUAL_TEXTBOOK

판정에 쓰지 않음: class_textbooks / current_unit_id / 학년·반 이름
```
학생 화면과 관리자 분모가 **같은 규칙**을 쓰며, 라이브 교차 테스트가 강제합니다.

## 15. Pre-Middle 잘못된 연결 후보
`고1 6월 학평` · `중1 동아 윤정미` · `중2 동아 윤정미` · `중2 천재 이상기` (4건).
→ 시험 노출에는 **영향 없음**(판정에 안 쓰임). 영향은 학생 **교재 선택기**에
불필요한 책이 보이는 것뿐. `npm run verify:class-textbooks`로 언제든 재확인 가능.

## 16. Writing Coach 상태
`writingCoachEnabled: false` **기본 OFF 유지 확인**(`src/config/features.js:94`).
프로덕션 비활성. 서버 AI 검사는 Vercel 함수 12개 한도로 여전히 BLOCKED —
설계는 `docs/WRITING_COACH.md`에 있음. **이번 세션 코드 변경 0건**(유료 API·
Edge Function 필요 작업은 지시대로 착수하지 않음).

## 17. 모바일 상태
오버플로 처리는 이미 견고(`index.css`의 break-word/keep-all/max-width + 전역
`overflow-x:hidden`). 배너·제출 계약 정상. 브라우저 자동화 불가로 실기기
항목 7개는 `MANUAL_TEST_REQUIRED`. 알려진 결함은 D4/D5.

## 18. 성능 문제 (관측만)
① 탭 포커스 복귀마다 전체 카탈로그+전체 학생 재조회 ← **가장 큰 읽기 증폭원**
② 로그인 시 배정 조회 2회(의도된 2차 방어) ③ 진행도 저장 read-then-write 3회
④ 페이징 헬퍼 중복(과거 P0 2건의 재발 경로)

## 19. 기술부채
- eligibility 외에도 "계정 종류 판별"이 4곳에 복사돼 있음(1곳은 이미 드리프트)
- `unit.position`이 29개 중 27개 0/NULL인데 `curriculumApi`는 아직 그걸로 정렬
- `setClassWords` 레거시 경로 비원자성
- 예문 쓰기 경로에 데이터 계층 검증 없음(현재는 감지만)

## 20. 승인이 필요한 사항 (NEEDS APPROVAL)
1. `class_textbooks` LIKELY_WRONG 4건 정리 여부
2. 빈 유닛 2건(중2 능률/중2 YMB의 Unit 1) 정리 여부
3. `supabase_v3_33_integrity_constraints.sql` 실행 여부
4. D4(시험 중 새로고침) 정책: 현행 유지 / sessionStorage / 서버 기록
5. `UITest` 계정 처리 + `students.archived` 컬럼 도입 여부

---

========================
## 내가 내일 할 것 — 딱 3개
========================

**1. 관리자 화면에서 반을 하나씩 골라 "반 전체 N명"이 맞는지 눈으로 확인**
   기대값: 고1 능률 민병천 8 · 고1 6월 학평 11 · 중2 YMB 9 · 중2 능률 7 ·
   MS Advanced 15 · Presentation 6 -2026 15. 다르면 알려주세요.

**2. 아래 5개 중 무엇을 진행할지 알려주기 (전부 제가 대기 중)**
   ① Pre-Middle 잘못된 링크 4건 정리 ② 빈 유닛 2건 ③ UNIQUE 제약 SQL 실행
   ④ 시험 중 새로고침 정책 ⑤ UITest 계정 처리

**3. 학생 1명 폰으로 입실시험 한 번 더 끝까지(제출까지) 해보기**
   어제는 배너·시작까지만 확인됐습니다. 제출·저장·랭킹까지 실기기 확인이
   남아 있습니다(`docs/MOBILE_QA.md` T5).
