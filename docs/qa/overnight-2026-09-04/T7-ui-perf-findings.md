# T7 UI/성능 (READ-ONLY, origin/main 1712cf5)
P8: happy-path에서 undefined/null 렌더 crash 0, 빈 상태 처리 OK(Dashboard/GuidedSession/QuizGame/SpellingReview), 라벨=name(+publisher)/unit.name, grade 추론 없음(스키마에 grade 컬럼 없음), 쓰기 버튼 busy 가드 OK, happy-path console.error 0.
WARN 후보:
1. App.jsx:721 <GuidedSession> 에 key={currentUnitId} 없음 — 현재는 대시보드 경유 재마운트라 안전, 구조적 안전망(1줄).
2. App.jsx:592 포그라운드 복귀 시 6개 Supabase fetch 팬아웃(in-flight dedupe만 있음) — 10초 쿨다운(~10줄, 저위험).
3. StudentDirectory.jsx:1648-1659 검색 결과 렌더 상한 없음 — 200개 + 더 보기(~15줄).
4. 100vh vs 100dvh(min-h-screen 전역) — 다파일, 야간 범위 밖.
5. wordLibrary.js:457-471 init 순차 tail RTT — 리팩터 필요, 범위 밖.
