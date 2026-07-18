// Test-only stub for the restore-vs-sync race test. fetchFullProgress is
// controllable from the test (deferred), syncStudentProgress records every
// call so the test can assert exactly what was uploaded and when.
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

// v2.2 병합 업로드 경로용 — doSync가 업로드 직전에 부르는 클라우드 blob
// 엄격 읽기. 테스트가 값(성공)이나 에러(읽기 실패 시 업로드 포기 검증)를
// 제어할 수 있게 mutable로 노출. 기본값 null = "백업 확실히 없음".
export let strictBackup = null
export let strictBackupError = null
export function setStrictBackup(v) { strictBackup = v }
export function setStrictBackupError(e) { strictBackupError = e }
export async function fetchProgressBackupStrict() {
  if (strictBackupError) throw strictBackupError
  return strictBackup
}

export async function syncStudentProgress(name, payload) {
  syncCalls.push({ name, ...payload })
}
