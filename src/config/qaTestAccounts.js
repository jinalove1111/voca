// QA 테스트 전용 계정 허용목록(2026-10-04, 205차) — 개발 중인 테스트 전용 화면
// (4메뉴 학생 홈 studentHomeMenu / Speaking 회화·그림 시험 / StudentGrowth /
// 2.5D 마을 paulTown2_5d)은 이 UUID의 계정에서만 진입할 수 있다. 실제 학생은
// Preview URL을 알아도 메뉴가 안 보이고 화면 직접 진입도 막힌다.
// CLAUDE.md 규칙 4: students.id(UUID)로만 판정한다(이름 매칭 금지).
// 출처: 앞 3개는 운영자가 적용한 supabase_v3_43_ghost_sca_reassign.sql 152-154행 /
// handoff.md 9060행 부근의 Paul / Cookie / Jinaa 계정. 마지막은 e2e 합성 fixture
// (tests/e2e/fixtures/index.mjs QA_STUDENT_ID)이며 v4 UUID가 아니라 프로덕션에
// 존재할 수 없다.
// 이 목록은 위 테스트 전용 화면만 게이팅한다 — Voca/대시보드/Pilot A
// (src/config/pilotTown.js)에는 영향이 없다.
export const QA_TEST_STUDENT_IDS = Object.freeze(new Set([
  '335a9560-d1f1-4628-bd8d-26bcaa8eaee7', // Paul
  'a63923a1-473d-4ba1-bca6-6b8685848cd3', // Cookie
  '738443f3-2676-4b89-9f17-cc7f22aa993c', // Jinaa
  'e2e00000-0000-4000-8000-00000000a001', // e2e fixture(프로덕션에 없음)
]))

export function isQaTestStudent(studentId) {
  return typeof studentId === 'string' && QA_TEST_STUDENT_IDS.has(studentId.toLowerCase())
}
