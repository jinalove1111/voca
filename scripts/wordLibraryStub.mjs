// Test-only stub replacing src/utils/wordLibrary.js's Supabase-backed
// exports, so the progress-store test can bundle useStudent.js in plain
// Node without needing import.meta.env / a live Supabase connection.
// useStudent.js only re-exports/calls these — none of them are exercised
// by testProgress.mjs, which tests the pure history/round logic only.
export const getStudents = () => []
export const addStudent = () => {}
export const removeStudent = () => {}
export const findStudentByName = () => []
export const syncStudentProgress = async () => {}
export const fetchFullProgress = async () => null
export const fetchProgressBackupStrict = async () => null
export const setWordStatus = async () => {}
// Paul Rank System(2026-07-19) — useStudent.js가 addStars 호출 지점에서
// 같이 부르는 fire-and-forget XP 지급. 이 테스트는 XP 지급 자체를
// 검증하지 않으므로(별도 scripts/testPaulRank.mjs / testXpLedgerDb.mjs가
// 담당) no-op으로 충분.
export const postXpEvent = async () => {}
// Reward System V1(2026-08-18) — no-op stub, 서버 쓰기 검증은
// scripts/testRewardServerWrite.mjs가 별도로 담당(네트워크 0, 정적 검사).
export const postRewardEvent = async () => {}
