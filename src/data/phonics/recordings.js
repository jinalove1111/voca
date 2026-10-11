// PAUL PHONICS teacher recordings (256차): the 42 single-sound clips, their file-name rule and approval state. Pure: no React, storage, network or file access.
// NO recording exists today: every status is 'missing' and nothing may behave as if a clip were present. A clip is playable ONLY when its file exists AND it has a complete approval.
// File rule: src/assets/phonics/clips/ph-<NN>-<id>.<mp3|m4a|wav>  (NN = two-digit `no`), e.g. ph-01-a.mp3, ph-31-th-thin.mp3.
// Approving a clip: add  '<id>': { approvedBy: '<teacher>', approvedOn: 'YYYY-MM-DD' }  to PHONEME_APPROVALS below, after listening to the file.
export const EXTENSIONS = ['mp3', 'm4a', 'wav']
export const MIN_BYTES = 2 * 1024
export const MAX_BYTES = 500 * 1024

// [id, ipa, example word, representative grapheme (omitted when it equals id)] in teaching order
const ROWS = [
  ['a', 'æ', 'cat'], ['e', 'e', 'pen'], ['i', 'ɪ', 'pig'], ['o', 'ɒ', 'dog'], ['u', 'ʌ', 'cup'],
  ['m', 'm', 'mat'], ['s', 's', 'sat'], ['t', 't', 'tap'], ['p', 'p', 'pot'], ['n', 'n', 'nut'],
  ['d', 'd', 'dog'], ['g', 'ɡ', 'dig'], ['k', 'k', 'can', 'c'], ['b', 'b', 'bag'], ['h', 'h', 'hat'],
  ['f', 'f', 'fan'], ['l', 'l', 'leg'], ['r', 'r', 'red'], ['j', 'dʒ', 'jam'], ['w', 'w', 'wet'],
  ['v', 'v', 'van'], ['y', 'j', 'yes'], ['z', 'z', 'zip'], ['ai', 'eɪ', 'train'], ['ie', 'aɪ', 'kite', 'i_e'],
  ['oa', 'əʊ', 'boat'], ['ue', 'juː', 'cube', 'u_e'], ['oo-long', 'uː', 'moon', 'oo'], ['sh', 'ʃ', 'ship'], ['ch', 'tʃ', 'chip'],
  ['th-thin', 'θ', 'thin', 'th'], ['th-this', 'ð', 'this', 'th'], ['ng', 'ŋ', 'ring'], ['ee', 'iː', 'green'], ['ow', 'aʊ', 'cow'],
  ['oi', 'ɔɪ', 'coin'], ['oo-short', 'ʊ', 'book', 'oo'], ['ar', 'ɑː', 'car'], ['or', 'ɔː', 'fork'], ['er', 'ɜː', 'her'],
  ['schwa', 'ə', 'butter', 'er'], ['air', 'eə', 'chair'],
]
const two = (n) => String(n).padStart(2, '0')
export const RECORDINGS = ROWS.map(([id, ipa, exampleWord, grapheme = id], i) => ({ no: i + 1, id, ipa, grapheme, exampleWord, fileBase: `ph-${two(i + 1)}-${id}` }))

// id -> { approvedBy, approvedOn }. EMPTY: no recording has been listened to and approved yet.
export const PHONEME_APPROVALS = {}

const NAME = /^ph-(\d\d)-([a-z0-9-]+)\.([A-Za-z0-9]+)$/
const BY_ID = new Map(RECORDINGS.map((r) => [r.id, r]))
export const approvalComplete = (a) => !!a && typeof a.approvedBy === 'string' && a.approvedBy.trim() !== '' && typeof a.approvedOn === 'string' && !Number.isNaN(Date.parse(a.approvedOn)) && new Date(a.approvedOn).toISOString().slice(0, 10) === a.approvedOn

// a file name -> { rec, ext } when it is a correct clip name of a known recording; else null
function parseName(name) {
  const m = NAME.exec(name)
  if (!m) return null
  const rec = BY_ID.get(m[2])
  return rec && rec.no === Number(m[1]) && EXTENSIONS.includes(m[3]) ? { rec, ext: m[3] } : null
}

// [{ no, id, ipa, file: name|null, status: 'missing'|'uploaded'|'approved' }] for the 42 recordings
export function recordingStatuses(fileNames = [], approvals = PHONEME_APPROVALS) {
  const file = new Map()
  for (const n of fileNames) { const p = parseName(n); if (p && !file.has(p.rec.id)) file.set(p.rec.id, n) }
  return RECORDINGS.map((r) => {
    const f = file.get(r.id) || null
    return { no: r.no, id: r.id, ipa: r.ipa, file: f, status: !f ? 'missing' : approvalComplete(approvals[r.id]) ? 'approved' : 'uploaded' }
  })
}

// [{ code, msg }] — empty when everything is consistent. sizes: optional { fileName: bytes }.
export function validateRecordings(fileNames = [], approvals = PHONEME_APPROVALS, sizes = null) {
  const errs = []
  const err = (code, msg) => errs.push({ code, msg })
  const seen = new Map()
  for (const n of fileNames) {
    const m = NAME.exec(n)
    const rec = m && BY_ID.get(m[2])
    if (!m || !rec) { err('unknown-file', `알 수 없는 파일 이름: ${n}`); continue }
    if (!EXTENSIONS.includes(m[3])) { err('wrong-extension', `확장자는 ${EXTENSIONS.join('/')}만 가능: ${n}`); continue }
    if (rec.no !== Number(m[1])) { err('pairing', `번호와 id가 맞지 않아요 (${rec.id} = ${two(rec.no)}): ${n}`); continue }
    if (seen.has(rec.id)) err('duplicate', `${rec.id} 파일이 둘 이상이에요: ${seen.get(rec.id)}, ${n}`)
    else seen.set(rec.id, n)
    const bytes = sizes && sizes[n]
    if (typeof bytes === 'number' && (bytes < MIN_BYTES || bytes > MAX_BYTES)) err('size', `파일 크기는 2KB~500KB여야 해요 (${bytes} B): ${n}`)
  }
  for (const [id, a] of Object.entries(approvals)) {
    if (!BY_ID.has(id)) { err('approval-unknown', `알 수 없는 승인 id: ${id}`); continue }
    if (!seen.has(id)) err('approval-without-file', `파일 없이 승인됨: ${id}`)
    if (!a || typeof a.approvedBy !== 'string' || a.approvedBy.trim() === '' || !a.approvedOn) err('approval-incomplete', `승인자/승인일이 비어 있어요: ${id}`)
    else if (!approvalComplete(a)) err('approval-bad-date', `승인일 형식이 잘못됐어요 (YYYY-MM-DD): ${id}`)
  }
  return errs
}
