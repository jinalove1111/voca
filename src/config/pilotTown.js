// Pilot A(2026-09-12) — Town V1 진입 자격을 기기 로컬 플래그(paulTownV1)와 무관하게
// 학생 UUID로 부여한다(CLAUDE.md 규칙 4: 이름 매칭 금지). 이 목록은 운영자가 승인한
// Pilot A 5명이며, 다른 학생은 기존 기기 플래그 동작 그대로다. 보상/경제/카탈로그/
// 환영 크레딧 로직과 무관 — 진입 카드/Town 화면 마운트 자격에만 쓰인다.
export const PILOT_A_TOWN_STUDENT_IDS = Object.freeze(new Set([
  '1c585815-98c8-461e-81fc-0187ffdcfa1c',
  '9f115c32-6a4b-4659-a026-f9905a5cc2e2',
  'e0fe0f50-8927-44d9-9331-e454620524d9',
  'd4bd8d3d-afda-47ad-9e5e-a12c8376c892',
  '3cff7b25-02cd-45a0-8488-a7b84a6d8a58',
]))

export function isPilotTownStudent(studentId) {
  return typeof studentId === 'string' && PILOT_A_TOWN_STUDENT_IDS.has(studentId.toLowerCase())
}
