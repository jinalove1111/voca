# COMPLETE REPORT — 쓰기 오토파일럿 활성화 + Edge Function 배포 검증

> **[2026-08-02 갱신] v3_11/v3_13 실행 검증 최종 상태**
>
> - **v3_13**: ✅ 완전 적용 — 테이블 5종·컬럼·개방 RLS 전항 일치, 재실행
>   부작용 0(F1 가드 정상). 라이브 하네스 41단언 PASS(생성→승인→학생용
>   조회→정리). 관리자 커리큘럼 탭 실동작 가능(로컬 빌드 기준).
> - **v3_12**: ✅ 유지 — daily_assignments 42501, 충돌 없음.
> - **v3_11**: ⚠️ **미완성** — 실행은 됐고(read-only 정책 존재 + RLS 4테이블
>   전부 enabled 확인) 원인도 확정됨: 프로덕션 초기 스키마의 구세대 정책명
>   `public read/write classes/units/words`(ALL)가 v3_11의 drop 목록에 없어
>   잔존, permissive-OR 결합으로 락다운 무효화. 처방한 drop 3줄은 아직
>   프로덕션에 반영되지 않음(실행 후에도 쓰기 통과 실측 — 커밋 안 됐거나
>   다른 프로젝트 창으로 추정). **운영자 최종 1단계는 아래 통합 블록.**
> - 기존 기능 회귀 0: build PASS, verify:all 25 PASS/2 SKIP/1 FAIL(login,
>   기존) + admin/homework/student 도메인 재확인 PASS. 관리자 쓰기 경로
>   (admin-content-write)는 service_role이라 락다운과 무관하게 정상(게이트
>   프로브 + 전일 E2E).
>
> **운영자 최종 1단계 — SQL Editor에서 아래 블록을 한 번에 실행하고, 마지막
> SELECT 결과가 0행인지 눈으로 확인** (0행 = 락다운 완성):
>
> ```sql
> drop policy if exists "public read/write classes" on classes;
> drop policy if exists "public read/write units" on units;
> drop policy if exists "public read/write words" on words;
> select tablename, policyname, cmd from pg_policies
> where tablename in ('classes','units','words') and cmd = 'ALL';
> ```
>
> 실행 후 앱 영향: 학생 읽기 유지(SELECT 정책 잔존), anon 쓰기 42501 차단,
> 관리자 쓰기는 pin 경로로 계속 정상. 이후 verify의 testMultiClass 등
> anon-쓰기 스크립트가 42501로 실패하게 되면 정직 SKIP 래퍼 적용이 후속
> 코드 작업(기존 P1 패턴)으로 필요하다.

_작성: 2026-08-02. 상태: **E2E 전 항목 통과 — 활성화 인프라 완성.**
이 보고서는 2026-07-31~08-02 연속 세션(문서 정리 → Curriculum Engine
Phase 0 → 쓰기 오토파일럿 → 4시간 자율 세션 P1/P2/P3 → 배포·E2E)의 최종
완료 보고이다. 세부 이력은 `handoff.md` 19차~24차 참고._

## 1. 배포·활성화 결과 (이번 최종 단계)

| 항목 | 상태 | 근거 |
|---|---|---|
| SQL 4종 실행 (v3_6 AI캐시 / v3_7 허용변형 / v3_8 비용캡 / v3_9 답안통계) | ✅ 완료 | 4개 테이블 REST 프로브 200/206 실측 (2026-08-01) |
| `grade-writing-answers` Edge Function 배포 | ✅ 완료 | 404→401 전환 실측 + E2E |
| `admin-content-write` Edge Function 배포 | ✅ 완료 | 404→401 전환 실측 + E2E |
| OpenAI 시크릿 설정 | ✅ 완료 | 운영자 설정 + E2E AI 채점 통과 |

### E2E 테스트 결과 (`scripts/testEdgeFunctionsE2E.mjs`, 운영자 PIN으로 실행)

| 테스트 | 결과 |
|---|---|
| A1. 서버측 PIN 게이트 (잘못된 PIN → not_authorized, 두 함수 모두) | ✅ PASS |
| A2~A3. 일회용 테스트 반/유닛/단어 생성 (pin 경로) | ✅ PASS |
| A4. **숙제 배정 저장 → Supabase 반영 확인** (v3.12 락다운 이후 핵심 경로) | ✅ PASS |
| A5. 배정 해제(wordIds:[]) | ✅ PASS |
| B2. **AI 채점 실호출** (신규 오답 쌍 → 판정/신뢰도/비용 반환) | ✅ PASS |
| B3. OpenAI 과금 증거 (usage/cost 메타데이터) | ✅ PASS |
| B4. **캐시 재호출 방지** (동일 쌍 재호출 → 재과금 0) | ✅ PASS |
| 정리(cleanup) | ✅ PASS — 잔여 테스트 엔티티 0 (독립 프로브로 재확인) |

독립 검증(코디네이터, 읽기 전용): E2E 잔여 클래스 0 · 잔여 큐 행 0 실측.
PIN·시크릿은 환경변수로만 사용됐고 코드/로그/문서/git 어디에도 저장되지
않았다 (스크립트는 `process.env.ADMIN_PIN` 전용, 값 미출력 — 파일 감사 완료).

### 이 배포로 해결된 프로덕션 이슈

**v3.12 락다운(기 실행) 이후 막혀 있던 관리자 숙제 저장이 복구됐다.**
origin/main(현 프로덕션 프론트)은 v3.12 듀얼패스를 포함하므로, 함수 배포
즉시 프로덕션 관리자 화면의 숙제 배정 저장이 정상 동작한다 (E2E A4로 실증).

## 2. 연속 세션 전체 산출물 요약 (2026-07-31 ~ 08-02, 로컬 main 기준)

| 작업 | 커밋 수 | 핵심 내용 |
|---|---|---|
| 문서 정리 (19차) | 4 | 미추적 33건 → 중복 7건 삭제·4건 병합·4분류 재배치(deployment/architecture/beta/future-ideas) + 인덱스 3종. 원본은 스냅샷 커밋 보존 |
| Curriculum Engine Phase 0 (20차) | 11 | 승인 아키텍처 + v3_13 스키마 파일 + 순수/데이터 계층 + Learning Engine 코어(러너·레지스트리·프리미티브) + 관리자 커리큘럼 허브 + 학생 조건부 예문 단계(플래그 off) + 하네스 2종 + 리뷰 발견 전건 수정 |
| 쓰기 오토파일럿 (21차) | 5 | 4단 판정 계단·실수 유형 7종 그룹화·오토파일럿 플래그 3종(기본 off)·철회 목록 |
| 4시간 자율 세션 P1/P2/P3 (22~23차) | 18 | 숙제 자동 생성/다중 날짜 일괄/이력·완료 패널 + Leitner 메모리 엔진 인프라(108단언) + 검수 통계 대시보드/큐 최적화/배치 UX |
| 배포·E2E (24차) | 2 | E2E 스크립트 저장소 이식 + 본 보고서 |

**검증 상태**: 매 커밋 `npm run build` PASS. `verify:all` 최종: 28개 도메인
중 **25 PASS · 2 SKIP**(speaking/listening — 헤드리스 환경 한계) ·
**1 FAIL**(login — 로컬 `SUPABASE_SERVICE_ROLE_KEY` 부재, 코드 무관).
보상/XP/정원/인증 로직 무접촉, 프로덕션 파괴적 변경 0.

## 3. 남은 운영자 단계 (우선순위순)

1. **git push (= Vercel 프로덕션 배포 트리거)** — 로컬 main이 origin보다
   39커밋 앞섬. push해야 이틀간의 신기능(오토파일럿 UI, 숙제 자동
   생성/일괄/이력, 커리큘럼 허브, 검수 통계 대시보드)이 프로덕션에 반영됨.
   push 전 원하면 스테이징 확인 권장.
2. **`supabase_v3_11_lockdown_curriculum_write.sql` 실행** — classes/units/
   words가 아직 anon 쓰기 가능함을 2026-08-02 무변경 프로브로 재확인
   (프로덕션에 열려 있는 마지막 큰 보안 구멍). 선행 조건이던
   `admin-content-write` 배포가 이번에 완료됐으므로 **지금 실행 가능**.
   런북: `docs/audit/2026-07-26-v3_11-1hour-runbook.md` (게이트/롤백 판단),
   명령: `docs/DEPLOY_COMMANDS_V311_V312.md`.
3. **`supabase_v3_13_curriculum_engine_phase0.sql` 실행** — 커리큘럼 엔진
   테이블 (실행 전까지 커리큘럼 탭은 안내 배너 모드). ⚠️ v3.11 락다운 실행
   이후에는 v3_13 본문을 재실행하지 말 것 (파일 헤더 경고 참고).
4. **플래그 결정 4종** (관리자 기능 탭, 전부 현재 off):
   `writingReviewAiAssist` → `writingReviewAutoPilot`(권장 순서) →
   선택: `writingReviewAutoTypo`/`writingReviewAutoDismiss`,
   그리고 `curriculumExamplesStudentUI`(승인 예문 쌓인 뒤).
5. **메모리 엔진 배선 전 선행 조건** — `wordLibrary.js:1697` review_data
   통째 덮어쓰기를 read-merge-write로 교체(1줄 수정, 별도 소커밋).
6. (선택) 로컬 `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY` 설정 시
   verify:all의 login 도메인 FAIL 해소.

## 4. 효과 요약

- **쓰기 검수**: 활성화 완료 시 100명/일 기준 검수 시간 1~3분 추정
  (4단 자동 판정 + 유형 그룹 일괄 처리), AI 비용 <$0.01/일 ($2/일 캡 내).
- **숙제 배정**: 자동 생성·다중 날짜 일괄·이력/완료 추적이 관리자 화면에
  준비됨 (push 후 사용 가능).
- **커리큘럼/학습 엔진**: 5년 로드맵의 Phase 0 인프라 완성 — 콘텐츠 단일
  원천 + 설정형 학습 모드 + Leitner 복습 기반이 코드로 존재하며, AI 생성은
  구조 변경 없이 플러그인 가능.
