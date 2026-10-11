// PAUL PHONICS recording check (256차): lists src/assets/phonics/clips/ (an absent folder = 0 files), prints the 42-row table and validates names, pairing, approvals and sizes.
// Usage: node scripts/phonics/validateRecordings.mjs [--book1]   (--book1 / --only a,e,i,o,u = only those ids; exit 1 only on validation errors; "파일 0 / 42" is NOT an error today — no recording exists yet)
import fs from 'node:fs'
import path from 'node:path'
import { PHONEME_APPROVALS, RECORDINGS, recordingStatuses, validateRecordings } from '../../src/data/phonics/recordings.js'

const DIR = path.resolve(import.meta.dirname, '../../src/assets/phonics/clips')
const names = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => fs.statSync(path.join(DIR, f)).isFile()) : []
const sizes = Object.fromEntries(names.map((n) => [n, fs.statSync(path.join(DIR, n)).size]))

// Book 1 mode (262차): only the 5 short vowels; the expected file name is shown even when the file is missing
const argv = process.argv.slice(2)
const oi = argv.indexOf('--only')
const only = argv.includes('--book1') ? ['a', 'e', 'i', 'o', 'u'] : oi >= 0 ? (argv[oi + 1] || '').split(',') : null
const keep = (id) => !only || only.includes(id)
const exp = Object.fromEntries(RECORDINGS.map((r) => [r.id, `${r.fileBase}.mp3`]))

const rows = recordingStatuses(names, PHONEME_APPROVALS).filter((r) => keep(r.id))
console.log('no  id         ipa   file                     status')
for (const r of rows) console.log(`${String(r.no).padStart(2, '0')}  ${r.id.padEnd(9)}  ${r.ipa.padEnd(4)}  ${(r.file || (only ? exp[r.id] : '-')).padEnd(24)} ${r.status}`)
const files = rows.filter((r) => r.file).length
const approved = rows.filter((r) => r.status === 'approved').length
console.log(`파일 ${files} / ${rows.length} · 승인 ${approved} / ${rows.length}${only ? ` · 미등록 ${rows.length - approved} / ${rows.length}` : ''}`)

// unknown / badly named files and unknown approval ids are always errors; files and approvals of the OTHER known recordings are ignored in --only mode
const idOf = (n) => /^ph-\d\d-([a-z0-9-]+)\./.exec(n)?.[1]
const mine = names.filter((n) => !only || !exp[idOf(n)] || keep(idOf(n)))
const errors = validateRecordings(mine, Object.fromEntries(Object.entries(PHONEME_APPROVALS).filter(([id]) => !exp[id] || keep(id))), sizes)
for (const e of errors) console.log(`ERROR [${e.code}] ${e.msg}`)
console.log(errors.length ? `${errors.length}건 오류` : '오류 없음')
process.exit(errors.length ? 1 : 0)
