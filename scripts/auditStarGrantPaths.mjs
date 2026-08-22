// scripts/auditStarGrantPaths.mjs
//
// 별 지급 경로 전수 감사 (2026-08-23, 운영자 지시). 수정 없음 — 측정만.
//
// 목적: useStudent.js/MatchGameShell.jsx의 **모든** 별 지급 경로에 대해
//   (1) 정상 1회 지급량
//   (2) 재마운트(새로고침/재로그인/탭전환) 후 재지급 여부
//   (3) 병합 복원 + 재마운트 5회 반복 후 누적 재지급
//   (4) 같은 마운트에서 10회 연타 시 재지급
// 을 실제로 구동해 측정한다. 정적 코드 읽기가 아니라 실행 관측이다.
//
// 하네스는 scripts/testRewardIdempotencyStress.mjs와 동일(fakeReact +
// 자체 esbuild 번들 + wordLibrary 스텁). 산출물 경로만 분리(규칙 16).
// production 소스 무접촉. 네트워크 0, Supabase 0, 학생 데이터 0.
//
// 실행: node scripts/auditStarGrantPaths.mjs   (verify 하네스 미등록 — 감사 도구)

import esbuild from 'esbuild'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createFakeClock, renderHook } from './fakeReact.mjs'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })
const raceStubUrl = pathToFileURL(path.resolve('scripts/wordLibraryRaceStub.mjs')).href
const stubPath = path.join(TMP, 'wordLibraryAuditStub.mjs')
fs.writeFileSync(stubPath, `export * from ${JSON.stringify(raceStubUrl)}
export async function postRewardEvent() {}
`, 'utf8')
const stubUrl = pathToFileURL(stubPath).href
const outfile = path.join(TMP, 'useStudent.audit.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/hooks/useStudent.js'],
  bundle: true, format: 'esm', platform: 'node', outfile,
  plugins: [{ name: 'audit', setup(b) {
    b.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: stubUrl, external: true }))
    b.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(path.resolve('scripts/fakeReactModule.mjs')).href, external: true }))
  } }],
})
const stub = await import(stubUrl)
const { useStudent } = await import(pathToFileURL(outfile).href)

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
class FakeDocument {
  constructor() { this.visibilityState = 'visible'; this.listeners = {} }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f) }
  removeEventListener() {}
  dispatch() {}
}
const STORE = 'paul_easy_progress'
const flush = () => new Promise(r => process.nextTick(r))
const settle = (h) => { h.rerender(); return h }

let ID = ''
function freshEnv() {
  stub.resetFetchFullProgressDeferred(); stub.syncCalls.length = 0
  stub.setStrictBackup(null); stub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage(); globalThis.document = new FakeDocument()
}
function mountOn() {
  const h = renderHook(() => useStudent(ID, 'QA_Audit'), createFakeClock())
  stub.fetchFullProgressDeferred.resolve(null)
  return h
}
function mountFresh(id) { ID = id; freshEnv(); return mountOn() }
function remount() { stub.resetFetchFullProgressDeferred(); stub.syncCalls.length = 0; return mountOn() }
// 병합(unionList/maxNum)이 되살리는 상황: 저장된 round 카운터를 4/4로 복원
function restoreRound(words) {
  const store = JSON.parse(globalThis.localStorage.getItem(STORE) || '{}')
  const rec = store[ID]; if (!rec) return
  rec.round.wordsViewed = words
  rec.round.examplesHeard = 5; rec.round.quizSolved = 5; rec.round.pronunciationOk = 5
  globalThis.localStorage.setItem(STORE, JSON.stringify(store))
}
const fullRound = (h, p) => {
  for (let i = 0; i < 5; i++) h.result.markWordViewed(`${p}-v${i}`)
  for (let i = 0; i < 5; i++) h.result.markExampleHeard()
  for (let i = 0; i < 5; i++) h.result.markQuizSolved()
  for (let i = 0; i < 5; i++) h.result.markPronunciationOk(`${p}-p${i}`)
  settle(h)
}

const results = []
async function probe(name, id, { setup, fire, restoreWords }) {
  let h = mountFresh(id)
  settle(h); await flush(); settle(h)
  if (setup) { await setup(h); await flush(); settle(h) }
  const base = h.result.stars

  // (1) 정상 1회
  await fire(h); await flush(); settle(h)
  const once = h.result.stars - base

  // (4) 같은 마운트 10회 연타
  const beforeRepeat = h.result.stars
  for (let i = 0; i < 10; i++) await fire(h)
  await flush(); settle(h)
  const repeat = h.result.stars - beforeRepeat

  // (2) 재마운트 1회
  const beforeRemount = h.result.stars
  if (restoreWords) restoreRound(restoreWords)
  let h2 = remount(); settle(h2); await flush(); settle(h2)
  const afterRemount = h2.result.stars - beforeRemount

  // (3) 복원 + 재마운트 5회
  const beforeLoop = h2.result.stars
  for (let i = 0; i < 5; i++) {
    if (restoreWords) restoreRound(restoreWords)
    h2 = remount(); settle(h2); await flush(); settle(h2)
  }
  const afterLoop = h2.result.stars - beforeLoop

  results.push({ name, once, repeat, remount: afterRemount, loop: afterLoop })
  return h2
}

console.log('=== 별 지급 경로 전수 감사 (실행 관측) ===\n')

// 1) 4/4 미션 보너스 + 선물상자(중복 스티커 포함) — 이번에 수정한 경로
await probe('daily-mission-bonus(+10) + 선물상자', '10000000-0000-0000-0000-000000000001', {
  fire: async (h) => fullRound(h, 'mb'),
  restoreWords: ['mb-v0', 'mb-v1', 'mb-v2', 'mb-v3', 'mb-v4'],
})
// 2) 발음 (+1/단어/일)
await probe('pronunciation(+1, 단어+날짜 키)', '10000000-0000-0000-0000-000000000002', {
  fire: async (h) => { h.result.markPronunciationOk('pr-word'); settle(h) },
})
// 3) 발음 미식별 (+1, 랜덤 키)
await probe('pronunciation-unidentified(+1, 랜덤 키)', '10000000-0000-0000-0000-000000000003', {
  fire: async (h) => { h.result.markPronunciationOk(null); settle(h) },
})
// 4) 미션 클리어 (+3/단어)
await probe('mission-clear(+3, 단어 키)', '10000000-0000-0000-0000-000000000004', {
  setup: async (h) => { for (let i = 0; i < 2; i++) { const m = h.result.activeMissions?.[0]; if (m) h.result.answerMission(m.wordId); settle(h) } },
  fire: async (h) => { const m = h.result.activeMissions?.[0] || h.result.missions?.[0]; if (m) h.result.answerMission(m.wordId); settle(h) },
})
// 5) 스펠링 콤보 보너스
await probe('spelling-combo(보너스, 단어+콤보+날짜 키)', '10000000-0000-0000-0000-000000000005', {
  fire: async (h) => { for (let i = 0; i < 5; i++) h.result.recordSpellingAnswer(`sc-${i}`, true); settle(h) },
})
// 6) 오답 회복 (Reward V1)
await probe('wrong-word-recovered(+1, 날짜+단어 키)', '10000000-0000-0000-0000-000000000006', {
  setup: async (h) => { h.result.recordSpellingAnswer('wr-word', false); settle(h) },
  fire: async (h) => { h.result.clearSpellingReviewWord('wr-word'); settle(h) },
})
// 7) 시험 완료 (Reward V1)
await probe('exam-complete(+2, testId 키)', '10000000-0000-0000-0000-000000000007', {
  fire: async (h) => { h.result.recordExamCompleted('audit-exam-1'); settle(h) },
})
// 8) 단어 세션 완료 (Reward V1)
await probe('word-session-complete(+1, 날짜 키)', '10000000-0000-0000-0000-000000000008', {
  fire: async (h) => { for (let i = 0; i < 5; i++) h.result.markWordCompleted(`ws-${i}`); settle(h) },
})

console.log('경로                                       1회지급  10회연타  재마운트  복원x5   판정')
for (const r of results) {
  const dup = r.repeat > 0 || r.remount > 0 || r.loop > 0
  const verdict = dup ? '★ 중복 발생' : '정상(1회만)'
  console.log(`  ${r.name.padEnd(40)} ${String(r.once).padStart(6)} ${String(r.repeat).padStart(8)} ${String(r.remount).padStart(9)} ${String(r.loop).padStart(7)}   ${verdict}`)
}
const bad = results.filter(r => r.repeat > 0 || r.remount > 0 || r.loop > 0)
console.log(`\n중복이 발생한 경로: ${bad.length}개 / ${results.length}개`)
bad.forEach(r => console.log(`  - ${r.name}: 연타 +${r.repeat}, 재마운트 +${r.remount}, 복원x5 +${r.loop}`))
