// Picture Vocabulary practice logic. Pure: no React/DOM/storage/network, no Math.random (the caller passes the seed).
export const STEPS = ['look', 'listen', 'repeat', 'quiz', 'review']

// mulberry32: small deterministic PRNG
function rng(seed) {
  let a = (Number(seed) || 0) >>> 0
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, int: (n) => Math.floor(next() * n) }
}

function shuffled(arr, r) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = r.int(i + 1); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export function buildSession(words, { size = 6, seed = 0 } = {}) {
  return shuffled(words, rng(seed)).slice(0, size)
}

const key = (w) => String(w.en).trim().toLowerCase()

export function buildQuiz(sessionWords, poolWords, seed = 0) {
  const r = rng(seed)
  let prevPos = -1
  return sessionWords.map((w) => {
    const taken = new Set([key(w)])
    const distractors = []
    const take = (list) => {
      for (const c of shuffled(list, r)) {
        if (distractors.length >= 3) return
        if (c.id === w.id || taken.has(key(c))) continue
        taken.add(key(c)); distractors.push(c)
      }
    }
    take(poolWords.filter((c) => c.shop === w.shop))
    take(poolWords.filter((c) => c.shop !== w.shop))
    let pos = r.int(distractors.length + 1)
    if (pos === prevPos && distractors.length > 0) pos = (pos + 1 + r.int(distractors.length)) % (distractors.length + 1)
    prevPos = pos
    const options = distractors.map((d) => ({ id: d.id, en: d.en }))
    options.splice(pos, 0, { id: w.id, en: w.en })
    return { id: w.id, options, correctId: w.id }
  })
}

export const gradeAnswer = (question, chosenId) => chosenId === question.correctId

// results: ordered answer events [{ id, correct }] (review re-answers included)
export function reviewQueue(results) {
  const out = []
  for (const x of results) if (!x.correct && !out.includes(x.id)) out.push(x.id)
  return out
}

export function summarise(results) {
  const first = new Map()
  for (const x of results) if (!first.has(x.id)) first.set(x.id, x.correct)
  const total = first.size
  const firstTryCorrect = [...first.values()].filter(Boolean).length
  return { total, firstTryCorrect, needsReview: [...first].filter(([, c]) => !c).map(([id]) => id) }
}
