// Test-only stub for scripts/testMultiTabRace.mjs (Phase 1 persistence audit,
// 2026-07-18) — same shape as wordLibraryRaceStub.mjs but adds a
// *controllable-delay* fetchProgressBackupStrict so overlapping doSync()
// invocations (fired by two debounce timers close together) can be made to
// resolve OUT OF ORDER, the way slow/fast network responses would in real
// life. Kept as a separate file (not editing the shared
// wordLibraryRaceStub.mjs) so this new scenario can't regress
// testRestoreSyncRace.mjs's existing assertions.
export const getStudents = () => []
export const addStudent = () => {}
export const removeStudent = () => {}
export const findStudentByName = () => null
export const setWordStatus = async () => {}
// Paul Rank System(2026-07-19) — no-op stub, XP 지급은 별도 테스트가 담당.
export const postXpEvent = async () => {}
// Reward System V1(2026-08-18) — no-op stub, 서버 쓰기 검증은
// scripts/testRewardServerWrite.mjs가 별도로 담당(네트워크 0, 정적 검사).
export const postRewardEvent = async () => {}
// 컷오버 레거시 별 기준선 재조정(2026-09-06/07, src/hooks/useStudent.js
// reconcile effect) — no-op 스텁. wordLibraryRaceStub.mjs/wordLibraryStub.mjs
// 와 동일한 사유(이 파일을 쓰는 testMultiTabRace.mjs/testClearedStars.mjs는
// 재조정 자체를 검증하지 않음, 실제 검증은 scripts/testCutoverClient.mjs
// 담당) — useStudent.js가 이 심볼들을 import 가능하게 하는 목적만.
// (구현 노트: 이 파일은 애초 작업 지시서의 "허용 파일" 목록엔 없었으나,
// useStudent.js가 이 4개 심볼을 새로 import하면서 이 스텁을 쓰는 번들이
// 깨지므로(빌더 'multitab', verify:persistence 대상) 안정성 우선 원칙에
// 따라 같은 no-op 패턴으로 최소 확장했다 — 구현 보고서에 별도 명시.)
export const holdRewardPosts = () => {}
export const flushRewardPostQueue = async () => {}
export const rewardQueuePendingFor = () => 0
export const postReconcileLegacyBaseline = async () => ({ ok: false, reason: 'relogin_required' })
// 드레인 프로토콜(2026-09-07 리뷰 수정) — no-op 스텁(위와 동일 사유).
export const drainRewardPostQueueForStudent = async () => ({ sent: 0, remaining: 0 })

export const syncCalls = []

export let fetchFullProgressDeferred = null
export function resetFetchFullProgressDeferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  fetchFullProgressDeferred = { promise, resolve }
}
export async function fetchFullProgress() {
  return fetchFullProgressDeferred.promise
}

// Queue of pending { resolve } handles, consumed FIFO by call order but
// resolvable by the test in ANY order — this is what lets the test simulate
// "the first debounce's network read finishes after the second's".
const pendingStrictReads = []
export function pendingStrictReadCount() { return pendingStrictReads.length }
export function resolveStrictRead(index, value) {
  pendingStrictReads[index].resolve(value)
}
// Each test scenario starts a fresh "network" — clears any reads left over
// (already-resolved entries still sit in the array since resolveStrictRead
// doesn't splice, and scenarios reuse indices from 0).
export function resetPendingStrictReads() { pendingStrictReads.length = 0 }
export async function fetchProgressBackupStrict() {
  return new Promise((resolve) => { pendingStrictReads.push({ resolve }) })
}

export async function syncStudentProgress(name, payload) {
  syncCalls.push({ name, ...payload, at: syncCalls.length })
}
