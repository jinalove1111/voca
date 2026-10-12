// Validates src/data/pictureWords/legacyReviews.json ({ v:1, reviews:{ [pictureId]: { action, reviewer, at, note?, replacement? } } }).
// Pure validateLegacyReviews() + CLI: node scripts/pictureWords/validateLegacyReviews.mjs. Exit 1 on any error. The date check is format + real calendar date only (deterministic, no "future" check).
import fs from 'node:fs'
import path from 'node:path'

const ACTIONS = ['approve', 'reject']
const KEYS = ['action', 'reviewer', 'at', 'note', 'replacement']
const plain = (o) => o !== null && typeof o === 'object' && !Array.isArray(o)
const text = (s, max) => typeof s === 'string' && s.trim() === s && s.length > 0 && s.length <= max
const realDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// legacyIds: string[]. Returns { errors, approved, rejected, pending }.
export function validateLegacyReviews(doc, legacyIds) {
  const errors = []
  const res = { errors, approved: 0, rejected: 0, pending: legacyIds.length }
  if (!plain(doc) || doc.v !== 1) errors.push('v must be 1')
  const r = plain(doc) ? doc.reviews : undefined
  if (!plain(r)) { errors.push('reviews must be an object'); return res }
  const known = new Set(legacyIds)
  for (const [id, x] of Object.entries(r)) {
    if (!known.has(id)) { errors.push(`unknown id: ${id}`); continue }
    if (!plain(x)) { errors.push(`${id}: record must be an object`); continue }
    const n = errors.length
    for (const k of Object.keys(x)) if (!KEYS.includes(k)) errors.push(`${id}: unknown key ${k}`)
    if (!ACTIONS.includes(x.action)) errors.push(`${id}: action must be approve|reject`)
    if (!text(x.reviewer, 40)) errors.push(`${id}: reviewer must be a trimmed string of 1-40 chars`)
    if (!realDate(x.at)) errors.push(`${id}: at must be a real date YYYY-MM-DD`)
    if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 200)) errors.push(`${id}: note must be a string <= 200 chars`)
    if (x.replacement !== undefined && (x.action === 'approve' || !text(x.replacement, Infinity))) errors.push(`${id}: replacement only on reject, as a non-empty trimmed string`)
    if (errors.length === n) x.action === 'approve' ? res.approved++ : res.rejected++
  }
  res.pending = legacyIds.length - res.approved - res.rejected
  return res
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const root = path.resolve(import.meta.dirname, '../..')
  const rd = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
  const x = validateLegacyReviews(rd('src/data/pictureWords/legacyReviews.json'), rd('scripts/pictureWords/source/legacyAutoPublished.json').ids)
  console.log(`approved ${x.approved} · rejected ${x.rejected} · pending ${x.pending} · errors ${x.errors.length}`)
  x.errors.forEach((m) => console.log('  ERROR', m))
  process.exit(x.errors.length ? 1 : 0)
}
