// Shared helper for student PIN hashing/verification — used by
// verify-student-pin.js, set-student-pin.js, bulk-generate-temp-pins.js.
// Filename starts with `_` so Vercel does NOT turn it into its own route
// (matches Vercel's convention of ignoring underscore-prefixed files under
// /api — this is a plain importable module, never called directly by URL).
//
// Uses Node's built-in `crypto` (scrypt) — no external dependency (bcrypt/
// etc.) needed or installed, per this project's "외부 의존성 최소화"
// standing policy. PIN is a 4-digit code (only 10,000 possibilities), so the
// real defense is server-side-only verification + rate limiting (see
// verify-student-pin.js's pin_fail_count/pin_locked_until), not the hash
// algorithm's strength — but we still never store or compare plaintext.
import crypto from 'node:crypto'

const KEYLEN = 64

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pin), salt, KEYLEN).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPin(pin, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  let candidate
  try {
    candidate = crypto.scryptSync(String(pin), salt, KEYLEN)
  } catch {
    return false
  }
  let expected
  try {
    expected = Buffer.from(hash, 'hex')
  } catch {
    return false
  }
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}

export function isValidPinFormat(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin)
}

export function randomFourDigitPin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0')
}

// 서버리스 함수가 Supabase에 접근할 때 쓰는 URL/키. 서비스 롤 키가
// 설정돼 있으면 그걸 우선 쓰고(RLS 우회, 더 안전), 아직 설정 전이면
// (이 프로젝트는 로컬에 서비스 롤 키가 없음 — Vercel 프로덕션에만 있을
// 수 있음) VITE_ 접두사가 붙은 anon key로 폴백한다 — 이 앱의 다른 모든
// 테이블이 이미 anon key로 클라이언트에서 직접 CRUD하는 것과 동일한
// 신뢰 모델이므로 폴백해도 새로운 보안 구멍은 아니다(기존 패턴 유지).
export function supabaseAdminUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
}
export function supabaseAdminKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
}
