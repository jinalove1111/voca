// PAUL PHONICS recording registration PREVIEW check (260차): pure. Admin-only; student code must never import this (pinned by testPhonicsProgress).
import { EXTENSIONS, MAX_BYTES, MIN_BYTES } from '../../data/phonics/recordings.js'

export const MIN_SEC = 0.2
export const MAX_SEC = 3
const kb = (n) => Math.round(n / 1024)

// file: { name, size, type, duration } — duration undefined = not read yet (skipped), null/NaN = unreadable.
// -> { errors: [msg], warnings: [msg], ok }  (a wrong file name only warns)
export function validateUpload({ name = '', size = 0, type = '', duration } = {}, rec) {
  const errors = []
  const warnings = []
  const ext = (/\.([^.]+)$/.exec(name) || [])[1]?.toLowerCase()
  if (!EXTENSIONS.includes(ext) || (type && !type.startsWith('audio/'))) errors.push(`형식은 ${EXTENSIONS.join('/')}만 가능해요`)
  if (size < MIN_BYTES || size > MAX_BYTES) errors.push(`크기는 ${kb(MIN_BYTES)}~${kb(MAX_BYTES)}KB여야 해요 (${(size / 1024).toFixed(1)}KB)`)
  if (duration === null || Number.isNaN(duration)) errors.push('재생할 수 없는 파일')
  else if (duration !== undefined && (duration < MIN_SEC || duration > MAX_SEC)) errors.push(`길이는 ${MIN_SEC}~${MAX_SEC}초여야 해요 (${duration.toFixed(2)}초)`)
  if (rec && name.replace(/\.[^.]+$/, '') !== rec.fileBase) warnings.push(`파일 이름이 달라요 — 기대: ${rec.fileBase}.mp3`)
  return { errors, warnings, ok: errors.length === 0 }
}
