// Test-only stub for the restore-vs-sync race test. fetchFullProgress is
// controllable from the test (deferred), syncStudentProgress records every
// call so the test can assert exactly what was uploaded and when.
export const getStudents = () => []
export const addStudent = () => {}
export const removeStudent = () => {}
export const findStudentByName = () => null
export const setWordStatus = async () => {}

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

export async function syncStudentProgress(name, payload) {
  syncCalls.push({ name, ...payload })
}
