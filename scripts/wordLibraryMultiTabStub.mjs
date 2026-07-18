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
