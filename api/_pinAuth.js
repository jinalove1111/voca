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

// 2026-07-16 — 학생 "최초 PIN 자기설정" 기능 추가하며 도입. 관리자가
// 강제로 정하는 임시 PIN(randomFourDigitPin, 무작위라 항상 안전)과 달리
// 학생이 직접 고르는 PIN은 0000/1234처럼 뻔한 값을 고를 위험이 있어
// 서버에서 최소한의 목록을 거부한다(운영자가 명시한 목록 그대로 —
// 모든 자릿수가 같은 10개 + 대표적인 연속 숫자 14개). 완전한 사전
// 공격 방지는 아니지만(4자리라 애초에 한계가 있음), 가장 흔히 시도되는
// 값들을 막는 최소 방어선.
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '0123', '1234', '2345', '3456', '4567', '5678', '6789',
  '9876', '8765', '7654', '6543', '5432', '4321', '3210',
])
export function isWeakPin(pin) {
  return WEAK_PINS.has(String(pin))
}

// 2026-07-16 P7 감사 후속 — 관리자 전용 API의 요청당 재인증(clear-student-
// pin.js가 처음 도입한 패턴의 공용화). 클라이언트 사이드 게이트(AdminScreen
// 의 authed=true)만 믿으면 누구나 /api/* 를 직접 fetch해서 관리자 액션을
// 실행할 수 있으므로, 파괴적/유출성 액션은 요청마다 서버에서 ADMIN_PIN을
// 다시 확인한다. 반환값: 통과하면 true, 아니면 응답을 이미 써놓고 false
// (호출부는 `if (!checkAdminReauth(req, res)) return` 한 줄).
// 응답 형식은 clear-student-pin.js와 동일: { ok:false, reason:'not_authorized' }
// — AdminScreen의 각 핸들러가 이 reason으로 "다시 로그인해주세요" 안내를 띄운다.
export function checkAdminReauth(req, res) {
  const adminPin = process.env.ADMIN_PIN
  if (!adminPin) {
    res.status(500).json({ error: 'Server not configured: ADMIN_PIN missing' })
    return false
  }
  const supplied = req.body?.adminPin
  if (typeof supplied !== 'string' || supplied !== adminPin) {
    res.status(200).json({ ok: false, reason: 'not_authorized' })
    return false
  }
  return true
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
