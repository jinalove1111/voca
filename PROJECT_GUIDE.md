# PROJECT_GUIDE.md — Paul Easy Voca 진입점

_작성: 2026-07-18. 새 세션(사람 또는 에이전트)이 코드를 처음부터 읽지 않고도 5분 안에 이 프로젝트를 이해하도록 만든 문서 체계의 시작점입니다. 코드 변경 없이 순수 조사(grep/read)로 작성됐습니다 — 확인 안 된 내용은 넣지 않았습니다._

## 한 줄 요약

폴이지보카(Paul Easy Voca)는 영어 공부방 학생(현재 111명 규모)이 매일 반별/유닛별 영단어를 듣기·말하기(녹음)·퀴즈·쓰기로 학습하고, 관리자(원장)가 반/학생/숙제/시험을 운영하며, 학부모가 진도를 조회하는 웹앱입니다.

## 기술 스택

- **프런트엔드**: React 18 + Vite 5 + Tailwind CSS 3 (SPA, 전역 상태관리 라이브러리 없음 — `PROJECT_GUIDE.md` 헷갈리는 것 Top 5의 4번 참고)
- **백엔드**: Vercel 서버리스 함수 (`api/*.js`, Node) — PIN 인증/관리자 재인증 등 서버에서만 검증해야 하는 로직 전용. 그 외 대부분의 CRUD는 클라이언트가 Supabase JS SDK로 직접 수행(`@supabase/supabase-js`, anon key)
- **DB**: Supabase (Postgres) — `src/utils/supabaseClient.js`
- **배포**: GitHub `main` 푸시 → Vercel 자동 배포 (https://voca-drab.vercel.app)
- **외부 의존성**: `@supabase/supabase-js`, `react`/`react-dom`, `xlsx`(엑셀 업로드), `pdfjs-dist`(PDF 업로드), `@anthropic-ai/sdk`(package.json에 있으나 실제 호출 코드는 미확인 — 사용처 재확인 필요). PIN 해싱은 외부 라이브러리 없이 Node 내장 `crypto`(scrypt) 사용(`api/_pinAuth.js`) — "외부 의존성 최소화" 원칙이 코드 주석에 명시적으로 남아 있음.

## 빠른 시작 (로컬 개발)

`package.json` 기준:

```
npm install
npm run dev       # vite dev 서버 (기본 5173)
npm run build     # vite build → dist/
npm run preview   # 빌드 결과 로컬 프리뷰
```

- 환경변수: `.env`, `.env.local`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ADMIN_PIN` 등이 필요합니다(레포에 실제 값 존재 — 커밋 여부/민감정보 취급은 운영자 판단 영역이라 이 문서에서 값 자체는 다루지 않습니다).
- `vite.config.js`는 `npm run dev` 전용으로 `/api/verify-admin-pin`을 흉내내는 미들웨어(`adminPinDevMiddleware`)를 심어둡니다 — `vite dev`는 Vercel 서버리스 함수(`api/*.js`)를 실행하지 않기 때문에, 이게 없으면 로컬 개발 중 관리자 PIN 화면 자체가 막힙니다. `verify-admin-pin` 외 나머지 `api/*.js`(학생 PIN 관련 10개)는 로컬 `vite dev`에서 그대로는 동작하지 않는다는 뜻이므로, 그 흐름을 테스트하려면 `scripts/`의 라이브 e2e 스크립트를 쓰거나 `vercel dev`를 고려해야 합니다(레포에서 `vercel dev` 실사용 흔적은 확인 안 됨).
- 프로덕션 빌드/배포 전 확인 순서는 `DEVELOPER_GUIDE.md`의 Deployment Checklist 참고.

## 문서 지도

| 문서 | 내용 |
|---|---|
| `PROJECT_GUIDE.md` (이 문서) | 진입점, 빠른 시작, 헷갈리는 것 Top 5 |
| `ARCHITECTURE.md` | 전체 구조, 폴더 구조, 인증 흐름, 상태관리, 캐싱, 영속성, Supabase 아키텍처, 배포 프로세스, 학생/관리자/학부모 주요 플로우 12종 |
| `DATABASE.md` | 전체 테이블/컬럼/FK, 마이그레이션 실행 순서, RLS/컬럼권한 현황 |
| `DEVELOPER_GUIDE.md` | 코딩/네이밍/컴포넌트/훅/DB/마이그레이션/테스트/배포/보안/성능 체크리스트(이 저장소가 실제로 지켜온 관례를 코드에서 역추출) |
| `TESTING.md` | `scripts/` 테스트 전체 목록, 4개 카테고리, 실행 방법, 새 테스트 작성 패턴 |
| `ROADMAP.md` | 버전별(v1.0~v2.2) 완료 현황과 백로그 — **가장 최신 상태를 알고 싶으면 여기, 상세 작업 이력은 `handoff.md`** |
| `handoff.md` | 세션별 상세 작업 로그(최상단이 최신) — 사실상의 진실 원천, 매우 방대. 특정 버그/결정의 "왜"를 알고 싶을 때만 검색해서 참고 |
| `CLAUDE.md`(대문자), `claude.md`(소문자) | 최초 프로젝트 계획서 원본(MVP 1단계 시점) — 역사적 스냅샷, 현재 상태는 `ROADMAP.md`가 우선 |
| `PROJECT_IDEAS.md`, `PROJECT_TODO.md` | 2026-07-07 세션의 아이디어/설계 노트(게임화, AI 준비 구조 등) — 대부분 아직 미구현 제안. `PROJECT_TODO.md`는 사실상 `PROJECT_IDEAS.md`와 같은 세션의 CTO 브리핑 로그(중복 성격) |
| `ADVANCED_FEATURES.md`, `EXPANSION_GUIDE.md`, `IMPLEMENTATION_SUMMARY.md`, `QUICK_START.js` | 2024-01-01 세션에서 만든 "학원 운영 시스템 확장" 설계 문서 3종 — **주의**: 이 문서들이 설명하는 Feature Flag(`config/features.js`)/RBAC(`config/rbac.js`)/`FeatureManagementPanel.jsx`는 실제로 존재하고 `AdminScreen.jsx`의 "🎯 기능" 탭에 연결돼 있지만, 문서가 언급하는 `api/hiddenFeatures.js`(반/학생/숙제/랭킹/AI 분석 API)와 `components/HiddenFeatures.jsx`는 **저장소에 존재하지 않습니다** — 스캐폴딩(Flag/권한 틀)만 살아있고 실제 기능 API는 미구현 상태입니다. |

## 이 프로젝트에서 자주 헷갈리는 것 Top 5

`handoff.md`의 반복 교훈에서 추출 — 전부 실제로 프로덕션 버그를 낸 적 있는 함정입니다.

1. **학생 식별자는 `students.id`(UUID)이지 이름이 아닙니다.** v1.6 이전에는 이름이 사실상 전역 유일 키였고, 동명이인 학생이 서로의 별/포인트/캘린더/학습기록을 덮어쓰는 실사고가 있었습니다. 지금은 로그인 세션(`localStorage`의 `paulEasyVoca_currentStudent`)도 `{ id, name }` JSON이고, 진행도 로컬 저장소(`paul_easy_progress`)도 id로 키를 잡습니다. 새 코드에서 학생을 찾거나 저장할 때 이름으로 매칭하지 마세요.
2. **PIN은 절대 클라이언트에서 검증되지 않습니다.** `students.pin_hash`/`pin_fail_count`/`pin_locked_until`/`pin_setup_allowed` 4개 컬럼은 v1.9 SQL로 anon key의 SELECT/UPDATE가 아예 차단되어 있고, PIN 검증/설정은 오직 `api/*.js` 서버리스 함수(service_role key)만 할 수 있습니다. 관리자 PIN(`ADMIN_PIN` 환경변수)도 매 파괴적 액션마다 `checkAdminReauth()`로 서버에서 재검증됩니다(클라이언트의 `authed` state만 믿지 않음).
3. **학생의 "현재 유닛"은 v2.1부터 이름 문자열이 아니라 `students.current_unit_id`(FK)가 우선입니다.** 예전엔 `unit_name` 문자열 매칭이라 유닛 이름이 미묘하게 다르면("Unit 1" vs "Unit1") 조용히 첫 유닛으로 되돌아가는 버그가 있었습니다. `unit_name`은 하위호환을 위해 아직 남아있고 컬럼 조회 실패 시 폴백 경로로 쓰입니다 — 완전히 삭제된 게 아닙니다.
4. **전역 상태관리 라이브러리가 없습니다.** Redux/Zustand/Context 전역 스토어 없이, `hooks/useStudent.js`가 사실상 학생 진행도(별/스티커/미션/캘린더/스펠링/유닛별 이어하기 등)의 중앙 지점입니다. 화면 간 데이터 불일치가 보이면 먼저 이 훅의 단일 저장소(`STORE_KEY = 'paul_easy_progress'`)를 의심하세요.
5. **로컬스토리지가 1차, Supabase는 안전망이지 진실 원천이 아닙니다(단, 로컬이 비어있을 땐 역전).** `useStudent.js`는 로컬에 데이터가 있으면 그것을 항상 우선하고, 클라우드는 fire-and-forget 백업입니다. 단 신규 기기/PIN 초기화처럼 로컬이 비어있는 경우엔 `restoreChecked` 게이트가 클라우드 백업(`fetchProgressBackupStrict`) 복원이 끝날 때까지 대시보드 렌더를 미룹니다 — "로컬 우선"과 "복원 우선"이 상황에 따라 뒤바뀌는 지점이라 헷갈리기 쉽습니다. 자세한 병합 규칙은 `ARCHITECTURE.md`의 영속성 전략, `mergeProgressRecords`(`useStudent.js`) 참고.

## 관련 파일

- `C:\voca\package.json`, `C:\voca\vite.config.js` — 빠른 시작 근거
- `C:\voca\src\App.jsx`, `C:\voca\src\hooks\useStudent.js` — Top 5의 1/4/5번 근거
- `C:\voca\api\_pinAuth.js`, `C:\voca\supabase_v1_9_security_rls.sql` — Top 5의 2번 근거
- `C:\voca\supabase_v2_1_student_unit_decouple.sql` — Top 5의 3번 근거
