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
// Reward System V1(2026-08-18) — no-op stub, 서버 쓰기 검증은
// scripts/testRewardServerWrite.mjs가 별도로 담당(네트워크 0, 정적 검사).
// 여기서는 useStudent.js의 grantLedgerReward가 import 가능하도록 심볼만
// 제공한다.
export const postRewardEvent = async () => {}
// 컷오버 레거시 별 기준선 재조정(2026-09-06/07, src/hooks/useStudent.js
// reconcile effect) — no-op 스텁. 이 파일을 공유하는 기존 테스트들은 이
// 재조정 자체를 검증하지 않으므로(그건 scripts/testCutoverClient.mjs가
// 실제 wordLibrary.js 번들로 전담) hold는 아무 것도 잠그지 않고,
// pending은 항상 0(즉시 quiescent 판정), reconcile은 항상
// relogin_required로 답해 마커를 남기지 않는다 — 재마운트마다 이 effect가
// 다시 시도하지만 다른 모든 지급 경로(postRewardEvent/postXpEvent 등)와
// 완전히 무관해 기존 assertion에 부작용이 없다.
export const holdRewardPosts = () => {}
export const flushRewardPostQueue = async () => {}
export const rewardQueuePendingFor = () => 0
export const postReconcileLegacyBaseline = async () => ({ ok: false, reason: 'relogin_required' })
// 드레인 프로토콜(2026-09-07 리뷰 수정) — no-op 스텁, 항상 "이미 비어있다"고
// 답해 위 rewardQueuePendingFor(항상 0)와 일관되게 즉시 quiescent 처리되게 한다.
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
