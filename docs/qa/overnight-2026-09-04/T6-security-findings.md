# T6 보안 (READ-ONLY, origin/main 1712cf5) — 등급 A- 유지, Critical/High 신규 0
PASS: 학생 isolation(UUID 세션/키), 직접 URL 접근(라우팅 없음, AdminScreen authed 게이트 + 서버 checkAdminReauth), 잘못된 PIN/잠금(5회/5분 서버 강제), secrets(클라이언트 VITE_* 2개만, .env 이력 0), anon grants(testRlsSecurity PASS, students PIN 컬럼 42501), signup OFF(addStudent dead code, create_student만).
KNOWN(변경 없음): grant-xp 레거시 XP 분기 무인증, exam-complete/wrong-word-recovered sourceId 자유도(서버 L2/L3로 유한화), student_class_assignments allow-anon-all(handoff.md:286).
신규: [Medium] ADMIN_PIN 실패 지연 1.5s가 verify-admin-pin.js:33에만 있음 — admin-pin-actions/compute-word-king/start-new-season/clear-student-pin/set-student-pin 무지연. [Low] verify-admin-pin.js:27 평문 === (checkAdminReauth는 timingSafeEqual).
