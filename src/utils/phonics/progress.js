// PAUL PHONICS learning-progress views (257차). Pure and deterministic: no React, storage, network, clock or randomness. Nothing is persisted yet (design only: docs/design/PHONICS_PROGRESS_2026-10-11.md).
// Input = an array of records. An attempt is a phonicsAttempt() object plus `at` (ms); a unit test is { studentId, bookId, unitId, unitTest: { score, total }, at }.
// A student is { id, name, records } — id is the student UUID (rule 4); the name is display only and is never a key.
import { BOOKS } from '../../data/phonics/curriculum.js'
import { PHONICS_ITEMS } from '../../data/phonics/phonicsWords.js'
import { summarisePhonemes } from './games.js'

export const isAttempt = (r) => !!r && Array.isArray(r.targetPhonemes)
export const isTest = (r) => !!r && !!r.unitTest
const byAt = (a, b) => a.at - b.at
const sortedAttempts = (records) => records.filter(isAttempt).map((r, i) => [r, i]).sort((a, b) => a[0].at - b[0].at || a[1] - b[1]).map((x) => x[0])
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
const ITEM_BY_ID = new Map(PHONICS_ITEMS.map((i) => [i.id, i]))
const UNITS = BOOKS.flatMap((b) => b.units.map((u) => ({ b, u })))
export const TOTAL_UNITS = UNITS.length
// a unit counts as completed with a unit test, or with a full session (6 finished items; Book 1's test is locked, so 3 finished Sound Bubble items)
const needed = (bookId) => (BOOKS.find((b) => b.id === bookId)?.focus === 'vowel-recognition' ? 3 : 6)

const unitDone = (records) => {
  const done = new Set()
  const n = new Map()
  for (const r of records) {
    const k = `${r.bookId}/${r.unitId}`
    if (isTest(r)) done.add(k)
    else if (isAttempt(r) && r.completed) { n.set(k, (n.get(k) || 0) + 1); if (n.get(k) >= needed(r.bookId)) done.add(k) }
  }
  return done
}

// per book: { bookId, no, started, completed, total, percent }; started = units with any record
export function bookProgress(records) {
  const done = unitDone(records)
  const seen = new Set(records.filter((r) => isAttempt(r) || isTest(r)).map((r) => `${r.bookId}/${r.unitId}`))
  return BOOKS.map((b) => {
    const started = b.units.filter((u) => seen.has(`${b.id}/${u.id}`) || done.has(`${b.id}/${u.id}`)).length
    const completed = b.units.filter((u) => done.has(`${b.id}/${u.id}`)).length
    return { bookId: b.id, no: b.no, started, completed, total: b.units.length, percent: pct(completed, b.units.length) }
  })
}

// the latest test of every unit that has one, in curriculum order: { bookId, unitId, score, total, percent, at, tries }
export function unitTestResults(records) {
  const tests = records.filter(isTest).sort(byAt)
  const last = new Map()
  const tries = new Map()
  for (const t of tests) { const k = `${t.bookId}/${t.unitId}`; last.set(k, t); tries.set(k, (tries.get(k) || 0) + 1) }
  return UNITS.map(({ b, u }) => last.get(`${b.id}/${u.id}`)).filter(Boolean)
    .map((t) => ({ bookId: t.bookId, unitId: t.unitId, score: t.unitTest.score, total: t.unitTest.total, percent: pct(t.unitTest.score, t.unitTest.total), at: t.at, tries: tries.get(`${t.bookId}/${t.unitId}`) }))
}

// repeatedly missed sounds: attempts >= minAttempts, wrong >= 2 and error rate >= 40 %. Worst first.
export function weakPhonemes(records, { minAttempts = 3 } = {}) {
  const sum = summarisePhonemes(sortedAttempts(records))
  return Object.entries(sum)
    .filter(([, s]) => s.attempts >= minAttempts && s.wrong >= 2 && s.wrong / s.attempts >= 0.4)
    .map(([phoneme, s]) => ({ phoneme, attempts: s.attempts, wrong: s.wrong, rate: pct(s.wrong, s.attempts) }))
    .sort((a, b) => b.rate - a.rate || b.wrong - a.wrong || (a.phoneme < b.phoneme ? -1 : 1))
}

// words to practise again: wrong >= 2 times, or wrong in the latest attempt of that word. { itemId, word, attempts, wrong, lastWrong }
export function reviewWords(records) {
  const by = new Map()
  for (const r of sortedAttempts(records)) {
    const s = by.get(r.itemId) || { itemId: r.itemId, word: ITEM_BY_ID.get(r.itemId)?.word || r.itemId, attempts: 0, wrong: 0, lastWrong: false }
    s.attempts++
    if (!r.correct) s.wrong++
    s.lastWrong = !r.correct
    by.set(r.itemId, s)
  }
  return [...by.values()].filter((s) => s.wrong >= 2 || s.lastWrong).sort((a, b) => b.wrong - a.wrong || (a.word < b.word ? -1 : 1))
}

// the n newest records, newest first: { kind: 'attempt'|'test', at, bookId, unitId, ... }
export function recentActivity(records, n = 5) {
  return records.filter((r) => isAttempt(r) || isTest(r)).map((r, i) => [r, i]).sort((a, b) => b[0].at - a[0].at || b[1] - a[1]).slice(0, n).map(([r]) => (isTest(r)
    ? { kind: 'test', at: r.at, bookId: r.bookId, unitId: r.unitId, score: r.unitTest.score, total: r.unitTest.total }
    : { kind: 'attempt', at: r.at, bookId: r.bookId, unitId: r.unitId, gameId: r.gameId, step: r.step, correct: r.correct, word: ITEM_BY_ID.get(r.itemId)?.word || r.itemId }))
}

// per sound with >= 4 attempts: error rate (%) in the first half vs the second half of its attempts; afterReview = a miss was later answered right first time in a review step
export function improvement(records) {
  const list = sortedAttempts(records)
  const after = summarisePhonemes(list)
  const per = new Map()
  for (const r of list) for (const ph of r.targetPhonemes) { if (!per.has(ph)) per.set(ph, []); per.get(ph).push(r.correct ? 0 : 1) }
  return [...per.entries()].filter(([, v]) => v.length >= 4).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([phoneme, v]) => {
    const h = Math.floor(v.length / 2)
    const rate = (x) => pct(x.reduce((s, y) => s + y, 0), x.length)
    const firstRate = rate(v.slice(0, h)), secondRate = rate(v.slice(h))
    return { phoneme, firstRate, secondRate, delta: firstRate - secondRate, afterReview: after[phoneme].improvedAfterReview }
  })
}

export const unitName = (bookId, unitId) => { const b = BOOKS.find((x) => x.id === bookId); return b ? `Book ${b.no} Unit ${String(unitId).slice(1)}` : '' }
const slash = (p) => `/${p}/`

// rule-based Korean sentences (no AI call): what to review next
export function recommendations(records) {
  const out = []
  const attempts = records.filter(isAttempt)
  if (!attempts.length && !records.some(isTest)) return ['아직 학습 기록이 없어요. Book 1 Unit 1부터 시작해 보세요.']
  for (const w of weakPhonemes(records).slice(0, 3)) {
    const miss = new Map()
    for (const r of attempts) if (!r.correct && r.targetPhonemes.includes(w.phoneme)) miss.set(`${r.bookId}/${r.unitId}`, (miss.get(`${r.bookId}/${r.unitId}`) || 0) + 1)
    const [top] = [...miss.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    const where = top ? ` (${unitName(...top[0].split('/'))}에서 많이 틀렸어요)` : ''
    out.push(`${slash(w.phoneme)} 소리를 다시 들어 보세요${where}.`)
  }
  for (const t of unitTestResults(records)) if (t.percent < 60) out.push(`${unitName(t.bookId, t.unitId)} 시험 점수가 ${t.score}/${t.total}예요. 한 번 더 연습한 뒤 다시 풀어 보세요.`)
  if (!out.length) {
    const done = unitDone(records)
    const next = UNITS.find(({ b, u }) => !done.has(`${b.id}/${u.id}`))
    out.push(next ? `반복해서 틀린 소리는 없어요. 다음은 ${unitName(next.b.id, next.u.id)}예요.` : '모든 Unit을 마쳤어요.')
  }
  return out
}

const overall = (records) => { const d = unitDone(records).size; return { completed: d, percent: pct(d, TOTAL_UNITS) } }
const lastTest = (records) => { const t = records.filter(isTest).sort(byAt).pop(); return t ? { bookId: t.bookId, unitId: t.unitId, score: t.unitTest.score, total: t.unitTest.total } : null }

// 3-5 factual Korean sentences for a parent meeting. Counts only; nothing invented.
export function parentSummary(student, records) {
  const o = overall(records)
  const started = bookProgress(records).reduce((s, b) => s + b.started, 0)
  const attempts = records.filter(isAttempt)
  const lines = [`${student.name}의 학습 현황이에요. 전체 ${TOTAL_UNITS}개 Unit 중 ${started}개를 시작했고 ${o.completed}개를 마쳤어요.`]
  if (attempts.length) lines.push(`게임 ${attempts.length}번 중 한 번에 맞힌 것은 ${attempts.filter((r) => r.correct).length}번(${pct(attempts.filter((r) => r.correct).length, attempts.length)}%)이에요.`)
  const t = lastTest(records)
  lines.push(t ? `가장 최근 Unit 시험은 ${unitName(t.bookId, t.unitId)} ${t.score}/${t.total}점이에요.` : '아직 Unit 시험 기록이 없어요.')
  const weak = weakPhonemes(records)
  lines.push(weak.length ? `반복해서 틀린 소리는 ${weak.slice(0, 3).map((w) => slash(w.phoneme)).join(', ')}예요.` : '반복해서 틀린 소리는 아직 없어요.')
  const imp = improvement(records).filter((x) => x.afterReview && x.delta > 0)
  if (imp.length) lines.push(`복습 뒤 ${imp.slice(0, 2).map((x) => slash(x.phoneme)).join(', ')} 소리는 틀린 비율이 줄었어요.`)
  return lines.join(' ')
}

// students: [{ id, name, records }] -> one row each: { id, name, completed, percent, latestTest, weakest: [phoneme x<=2] }
export const classOverview = (students) => students.map((s) => ({ id: s.id, name: s.name, ...overall(s.records), latestTest: lastTest(s.records), weakest: weakPhonemes(s.records).slice(0, 2).map((w) => w.phoneme) }))

// class level: sounds that are weak for >= 1 student: { phoneme, students, attempts, wrong, rate }; most students first
export function classWeakPhonemes(students) {
  const agg = new Map()
  for (const s of students) {
    const sum = summarisePhonemes(sortedAttempts(s.records))
    const weak = new Set(weakPhonemes(s.records).map((w) => w.phoneme))
    for (const [ph, v] of Object.entries(sum)) {
      const a = agg.get(ph) || { phoneme: ph, students: 0, attempts: 0, wrong: 0 }
      a.attempts += v.attempts; a.wrong += v.wrong
      if (weak.has(ph)) a.students++
      agg.set(ph, a)
    }
  }
  return [...agg.values()].filter((a) => a.students > 0).map((a) => ({ ...a, rate: pct(a.wrong, a.attempts) }))
    .sort((a, b) => b.students - a.students || b.rate - a.rate || (a.phoneme < b.phoneme ? -1 : 1))
}
