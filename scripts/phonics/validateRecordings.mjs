// PAUL PHONICS recording check (256차): lists src/assets/phonics/clips/ (an absent folder = 0 files), prints the 42-row table and validates names, pairing, approvals and sizes.
// Usage: node scripts/phonics/validateRecordings.mjs   (exit 1 only on validation errors; "파일 0 / 42" is NOT an error today — no recording exists yet)
import fs from 'node:fs'
import path from 'node:path'
import { PHONEME_APPROVALS, recordingStatuses, validateRecordings } from '../../src/data/phonics/recordings.js'

const DIR = path.resolve(import.meta.dirname, '../../src/assets/phonics/clips')
const names = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => fs.statSync(path.join(DIR, f)).isFile()) : []
const sizes = Object.fromEntries(names.map((n) => [n, fs.statSync(path.join(DIR, n)).size]))

const rows = recordingStatuses(names, PHONEME_APPROVALS)
console.log('no  id         ipa   file                     status')
for (const r of rows) console.log(`${String(r.no).padStart(2, '0')}  ${r.id.padEnd(9)}  ${r.ipa.padEnd(4)}  ${(r.file || '-').padEnd(24)} ${r.status}`)
const files = rows.filter((r) => r.file).length
const approved = rows.filter((r) => r.status === 'approved').length
console.log(`파일 ${files} / ${rows.length} · 승인 ${approved} / ${rows.length}`)

const errors = validateRecordings(names, PHONEME_APPROVALS, sizes)
for (const e of errors) console.log(`ERROR [${e.code}] ${e.msg}`)
console.log(errors.length ? `${errors.length}건 오류` : '오류 없음')
process.exit(errors.length ? 1 : 0)
