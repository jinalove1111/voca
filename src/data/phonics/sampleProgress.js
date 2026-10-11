// PAUL PHONICS learning-progress SAMPLE (257차). Entirely FICTIONAL: class `샘플반`, students `샘플 학생 A`…`F`, ids `sample-000N` (not UUIDs).
// Generated at import from a seeded generator over the real unit ids and phonemes: seeded, with a fixed base date (no random, no clock). Never real student data.
import { BOOKS } from './curriculum.js'
import { unitWords } from '../../utils/phonics/curriculum.js'

export const SAMPLE_NOTICE_KO = '샘플 데이터 — 실제 학생 기록이 아닙니다'
export const SAMPLE_CLASS_NAME = '샘플반'
const BASE = Date.UTC(2026, 8, 1, 9, 0, 0) // 2026-09-01 09:00 UTC, fixed
const DAY = 86400000
const MIN = 60000

function mulberry(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UNITS = BOOKS.flatMap((b) => b.units.map((u) => ({ b, u })))

// profile: units = how many units from Book 1 Unit 1 are covered; per = attempts per unit; base = base error chance; weak = { ipa: error chance }; tests = unit tests for covered non-Book-1 units; review = extra 'review' pass
const PROFILES = [
  { name: '샘플 학생 A', seed: 11, units: 14, per: 3, base: 0.12, weak: { ɪ: 0.7, e: 0.6 }, tests: true },
  { name: '샘플 학생 B', seed: 22, units: 20, per: 3, base: 0.04, weak: {}, tests: true },
  { name: '샘플 학생 C', seed: 33, units: 25, per: 2, base: 0.1, weak: { θ: 0.85, ð: 0.85 }, tests: true, focus: 3 },
  { name: '샘플 학생 D', seed: 44, units: 12, per: 4, base: 0.1, weak: { æ: 0.6, e: 0.6, ɪ: 0.6, ɒ: 0.6, ʌ: 0.6 }, tests: true },
  { name: '샘플 학생 E', seed: 55, units: 10, per: 3, base: 0.08, weak: { e: 0.85, ʌ: 0.85, s: 0.8 }, tests: true, review: true },
  { name: '샘플 학생 F', seed: 66, units: 2, per: 15, base: 0.2, weak: {}, tests: false },
]

function make(p, index) {
  const rnd = mulberry(p.seed)
  const studentId = `sample-${String(index + 1).padStart(4, '0')}`
  const records = []
  const attempt = (b, u, w, k, t, step, weak = p.weak) => {
    const ti = w.targetIndex >= 0 ? w.targetIndex : 0
    const ipa = w.phonemes[ti]
    const wrong = rnd() < (weak[ipa] ?? p.base)
    const game = w.games.includes('B') ? 'bubble' : 'train'
    records.push({ v: 1, studentId, gameId: game, bookId: b.id, unitId: u.id, step: step || game, targetPhonemes: [ipa], itemId: w.id, correct: !wrong, retries: wrong ? 1 + Math.floor(rnd() * 2) : 0, completed: true, at: t + k * 3 * MIN })
  }
  const covered = UNITS.slice(0, p.units)
  covered.forEach(({ b, u }, ui) => {
    const words = unitWords(b.id, u.id)
    if (!words.length) return
    const t = BASE + ui * DAY
    // words that carry a weak sound come first so the sound is practised often enough to show up
    const firstWeak = [...words].sort((x, y) => Number(p.weak[y.phonemes[Math.max(0, y.targetIndex)]] != null) - Number(p.weak[x.phonemes[Math.max(0, x.targetIndex)]] != null))
    const pool = p.focus ? firstWeak : words
    const hasWeak = u.targets.some((x) => p.weak[x.ipa] != null)
    for (let k = 0; k < (hasWeak ? Math.max(p.per, 5) : p.per); k++) attempt(b, u, pool[k % pool.length], k, t)
    if (p.tests && b.focus !== 'vowel-recognition') {
      const chance = p.base + (Object.keys(p.weak).length ? 0.25 : 0)
      let score = 0
      for (let i = 0; i < 5; i++) if (rnd() >= chance) score++
      records.push({ v: 1, studentId, bookId: b.id, unitId: u.id, unitTest: { score, total: 5 }, at: t + 30 * MIN })
    }
  })
  if (p.review) {
    // the review pass happens two weeks later and the child now answers the earlier trouble sounds right
    covered.forEach(({ b, u }, ui) => {
      const words = unitWords(b.id, u.id)
      for (let k = 0; k < 3 && words.length; k++) attempt(b, u, words[k % words.length], k, BASE + (14 + ui) * DAY, 'review', {})
    })
  }
  return { id: studentId, name: p.name, records }
}

export const SAMPLE_STUDENTS = PROFILES.map(make)
