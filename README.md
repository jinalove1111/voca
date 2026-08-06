# Paul Easy Voca

영어 공부방 학생(현재 111명 규모)이 매일 반별/유닛별 영단어를 듣기·말하기(녹음)·퀴즈·쓰기로 학습하고, 관리자(원장)가 반/학생/숙제/시험을 운영하며, 학부모가 진도를 조회하는 웹앱입니다.

이 파일은 최소 정보만 담습니다 — 실제 작업은 반드시 `CLAUDE.md`(저장소 헌법, 18개 규칙)부터 읽고 시작하세요. 프로젝트 전반을 5분 안에 파악하려면 `PROJECT_GUIDE.md`가 진입점입니다.

## 기술 스택

- 프런트엔드: React 18 + Vite 5 + Tailwind CSS 3 (SPA)
- 백엔드: Vercel 서버리스 함수(`api/*.js`) — PIN 인증 등 서버 전용 로직만
- DB: Supabase (Postgres)
- 배포: GitHub `main` 푸시 → Vercel 자동 배포

## 빠른 시작

```
npm install
npm run dev       # vite dev 서버
npm run build     # vite build -> dist/
npm run preview   # 빌드 결과 로컬 프리뷰
```

환경변수(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ADMIN_PIN` 등)는 `.env`/`.env.local`에 필요합니다. 상세는 `PROJECT_GUIDE.md`의 "빠른 시작" 절 참고.

## 테스트

```
npm run verify:all      # 전체 도메인 순차 실행
npm run verify:<domain> # 도메인별(login/student/admin/unit 등, TESTING.md 참고)
```

## 문서 지도

새 세션(사람/AI)은 반드시 `CLAUDE.md`(저장소 헌법)를 먼저 읽고, 이어서 아래 문서를 필요에 따라 참고하세요. 전체 문서 지도는 `PROJECT_GUIDE.md`에 있습니다.

| 문서 | 용도 |
|---|---|
| `CLAUDE.md` | 저장소 헌법(18개 규칙) — 모든 작업의 최우선 지침 |
| `PROJECT_GUIDE.md` | 진입점, 빠른 시작, 헷갈리는 것 목록 |
| `ARCHITECTURE.md` | 전체 구조/인증/상태관리/캐싱/영속성/배포/주요 플로우 |
| `DATABASE.md` | 테이블/FK/마이그레이션 순서/RLS |
| `DEVELOPER_GUIDE.md` | 코딩 규칙 + 체크리스트 |
| `TESTING.md` | 테스트 체계 + verify 하네스 |
| `ROADMAP.md` | 버전별 완료 현황과 백로그 |
| `handoff.md` | 세션별 상세 작업 로그(최상단이 최신) |
| `PROJECT_BOARD.md` | 작업 보드 |
