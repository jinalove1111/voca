// Validates the operator's picture-word review export ({ v:1, decisions:{ [id]: { action, en?, ko?, at } } }).
// Pure validate() + CLI: node scripts/pictureWords/validateDecisions.mjs [path]  (default source/decisions.json). Exit 1 on any error.
import fs from 'node:fs'
import path from 'node:path'

const ACTIONS = ['approve', 'exclude']
const DOUBTFUL = ['MISMATCH', 'UNCERTAIN', 'MULTIPLE'] // pending = doubtful without a decision (UNUSABLE is never pending)
const okText = (s) => typeof s === 'string' && s.trim() === s && s.length > 0 && s.length <= 40

// entries: [{ id, status }]. Returns { errors, approved, edited, excluded, pending, unknown }.
export function validate(doc, entries) {
  const errors = []
  const res = { errors, approved: 0, edited: 0, excluded: 0, pending: 0, unknown: 0 }
  if (!doc || typeof doc !== 'object' || doc.v !== 1) errors.push('v must be 1')
  const d = doc && doc.decisions
  if (!d || typeof d !== 'object' || Array.isArray(d)) { errors.push('decisions must be an object'); return res }
  const byId = new Map(entries.map((e) => [e.id, e]))
  for (const [id, x] of Object.entries(d)) {
    const e = byId.get(id)
    if (!e) { res.unknown++; errors.push(`unknown id: ${id}`); continue }
    if (!x || typeof x !== 'object' || !ACTIONS.includes(x.action)) { errors.push(`${id}: action must be approve|exclude`); continue }
    if (e.status === 'MATCH') { errors.push(`${id}: decision on a MATCH entry`); continue }
    if (e.status === 'UNUSABLE' && x.action !== 'exclude') { errors.push(`${id}: UNUSABLE may only be excluded`); continue }
    let bad = false
    for (const k of ['en', 'ko']) {
      if (x[k] !== undefined && !okText(x[k])) { errors.push(`${id}: ${k} must be a non-empty trimmed string <= 40 chars`); bad = true }
    }
    if (bad) continue
    if (x.action === 'exclude') res.excluded++
    else { res.approved++; if (x.en !== undefined || x.ko !== undefined) res.edited++ }
  }
  res.pending = entries.filter((e) => DOUBTFUL.includes(e.status) && !Object.prototype.hasOwnProperty.call(d, e.id)).length
  return res
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const root = path.resolve(import.meta.dirname, '../..')
  const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'scripts/pictureWords/source/decisions.json')
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'scripts/pictureWords/source/verdicts.json'), 'utf8'))
  let doc
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { console.log('FAIL cannot read/parse', file, e.message); process.exit(1) }
  const r = validate(doc, entries)
  console.log(`approved ${r.approved} (edited ${r.edited}) · excluded ${r.excluded} · pending ${r.pending} · unknown ids ${r.unknown} · errors ${r.errors.length}`)
  r.errors.forEach((m) => console.log('  ERROR', m))
  process.exit(r.errors.length ? 1 : 0)
}
