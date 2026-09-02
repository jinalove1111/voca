// Shared helper for student PIN hashing/verification — used by
// verify-student-pin.js, set-student-pin.js, admin-pin-actions.js.
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
import { isValidStudentId } from '../src/utils/paulRankShared.js'

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

// 2026-07-24 P3 보안 감사 후속(docs/audit/2026-07-24-security.md Medium) —
// ADMIN_PIN 형식/강도 진단 경고(요청 차단 없음). 학생 PIN은 isWeakPin()으로
// "약하면 저장 거부"가 가능하지만, ADMIN_PIN은 Vercel 환경변수라 요청
// 시점에 값을 바꿀 수 없고 "거부"할 가입/설정 API 자체가 없다 — 그래서
// 이 함수는 절대 응답을 막지 않고, 콜드스타트(모듈 최초 로드) 시 한 번
// Vercel 함수 로그에 console.warn만 남기는 순수 진단 코드다. 인증 로직/
// 응답 형식/타이밍은 전혀 바뀌지 않는다.
function isWeakAdminPinFormat(pin) {
  if (typeof pin !== 'string' || pin.length === 0) return false
  if (pin.length < 6) return true
  const isNumeric = /^\d+$/.test(pin)
  if (!isNumeric) return false
  if (/^(\d)\1*$/.test(pin)) return true // 전부 같은 숫자(000000, 111111 등)
  const digits = pin.split('').map(Number)
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1)
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1)
  return ascending || descending // 연속 숫자(123456, 654321 등)
}

function warnIfWeakAdminPinOnce() {
  const adminPin = process.env.ADMIN_PIN
  if (!adminPin) return // 누락은 각 핸들러가 이미 500으로 별도 응답
  if (isWeakAdminPinFormat(adminPin)) {
    console.warn(
      '[security] ADMIN_PIN이 약한 패턴으로 보입니다(6자 미만/전부 동일 숫자/연속 숫자). '
      + '요청을 막지는 않지만, Vercel 환경변수 설정에서 더 길고 예측 불가능한 값으로 교체를 권장합니다. '
      + '(진단 전용 경고 — 인증 로직에는 영향 없음)'
    )
  }
}
// 모듈이 처음 import될 때(콜드스타트) 한 번 실행 — 이 파일을 import하는
// verify-admin-pin.js/admin-pin-actions.js 등 모든 관리자 API 경로가
// 자동으로 커버된다. 워밍 상태의 재사용 인스턴스에서는 모듈이 캐시돼
// 재실행되지 않으므로 로그 스팸도 없다.
warnIfWeakAdminPinOnce()

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
  // 2026-09-02 — `!==` 문자열 비교를 crypto.timingSafeEqual로 교체(타이밍
  // 사이드채널 방어). 응답 형식/상태코드는 기존과 완전히 동일하게 유지한다
  // — 이 변경은 순수 비교 방식 교체이지 새 실패 사유가 아니다.
  const suppliedBuf = typeof supplied === 'string' ? Buffer.from(supplied, 'utf8') : null
  const adminBuf = Buffer.from(adminPin, 'utf8')
  const matches = !!suppliedBuf
    && suppliedBuf.length === adminBuf.length
    && crypto.timingSafeEqual(suppliedBuf, adminBuf)
  if (!matches) {
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

// ── 서명된 세션 토큰 (2026-08-24, 보안 감사 HIGH 1 대응) ──────────────────
// 문제: 이 앱은 Supabase Auth를 쓰지 않는다(supabase.auth.* 호출 0건).
// 학생 로그인은 이름+PIN -> verify-student-pin.js가 service_role로 검증 ->
// { studentId } 반환 -> App.jsx가 localStorage에 {id,name} 저장. 그 뒤로는
// 서버가 클라이언트가 보낸 studentId를 **주장 그대로 신뢰**했다. 즉 누구나
// 남의 studentId를 실어 보상 API를 호출할 수 있었다.
//
// 해법: 새 인증 프레임워크를 도입하지 않고, **이미 존재하는 유일한 로그인
// 관문**(verify-student-pin)에서 서명 토큰을 함께 발급한다. 위 hashPin이
// bcrypt 대신 Node 내장 crypto(scrypt)를 쓰는 것과 같은 정신으로, 여기서도
// 내장 crypto HMAC만 쓴다 — 외부 패키지 0개(규칙 6).
//
//   token = base64url(payloadJson) + '.' + base64url(HMAC-SHA256(payloadJson))
//   payload = { sid, exp }
//
// payload는 최소화한다 — 이름/반/유닛/PIN 어떤 개인정보도 담지 않는다.
// 토큰은 서명만 되어 있고 암호화되어 있지 않으므로(브라우저가 읽을 수 있음),
// 담기는 값은 "이미 그 클라이언트가 아는 것"(자기 studentId)뿐이어야 한다.
//
// 학생 경험 변화 0: 이름+PIN 그대로, 재로그인/계정 재생성 불필요,
// DB 스키마 변경 0, migration 0.
const SESSION_TOKEN_VERSION = 1
export const SESSION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30일 — 아이가 매번 다시 PIN을 치지 않아도 되는 길이

// 시크릿은 서버 환경변수에서만 읽는다. VITE_ 접두사가 붙은 값은 브라우저
// 번들에 들어가므로 **절대 폴백하지 않는다**(supabaseAdminKey의 anon 폴백과
// 의도적으로 다름 — 그건 읽기 권한 폴백이고 이건 위조 방지 시크릿이다).
export function sessionSecret() {
  return process.env.SESSION_SECRET || ''
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}
function hmac(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest()
}

// 로그인 성공 시에만 호출한다. 시크릿이 없으면 토큰을 만들지 않고 null을
// 반환한다(fail-closed — 가짜 토큰을 만들어 통과시키는 일이 없도록).
// opts.now/opts.secret은 테스트 결정성을 위한 주입구다(운영 호출은 생략).
export function signSessionToken(studentId, opts = {}) {
  const secret = opts.secret === undefined ? sessionSecret() : opts.secret
  if (!secret) return null
  if (typeof studentId !== 'string' || studentId.length === 0) return null
  const now = typeof opts.now === 'number' ? opts.now : Date.now()
  const payload = { sid: studentId, exp: now + SESSION_TOKEN_TTL_MS }
  const payloadB64 = b64url(JSON.stringify(payload))
  return `${payloadB64}.${b64url(hmac(payloadB64, secret))}`
}

// 반환: { ok:true, studentId } | { ok:false, reason }
// reason: no_secret | missing_token | malformed_token | bad_signature |
//         expired | student_mismatch
// 어떤 경로로도 예외를 던지지 않는다 — 호출부가 거부만 하면 되도록.
export function verifySessionToken(token, opts = {}) {
  const secret = opts.secret === undefined ? sessionSecret() : opts.secret
  // 시크릿이 없으면 **통과시키지 않는다**(fail-closed, 운영자 지정).
  if (!secret) return { ok: false, reason: 'no_secret' }
  if (typeof token !== 'string' || token.trim().length === 0) return { ok: false, reason: 'missing_token' }

  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed_token' }
  const [payloadB64, sigB64] = parts

  // 서명 검증을 payload 파싱보다 먼저 한다 — 변조된 payload를 파싱하는
  // 표면 자체를 줄인다. 비교는 timingSafeEqual(문자열 === 비교 금지).
  let sigOk = false
  try {
    const expected = hmac(payloadB64, secret)
    const got = Buffer.from(sigB64, 'base64url')
    sigOk = expected.length === got.length && crypto.timingSafeEqual(expected, got)
  } catch {
    sigOk = false
  }
  if (!sigOk) return { ok: false, reason: 'bad_signature' }

  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed_token' }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'malformed_token' }
  if (typeof payload.sid !== 'string' || payload.sid.length === 0) return { ok: false, reason: 'malformed_token' }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return { ok: false, reason: 'malformed_token' }

  const now = typeof opts.now === 'number' ? opts.now : Date.now()
  if (now >= payload.exp) return { ok: false, reason: 'expired' }

  // 호출부가 body의 studentId를 함께 넘기면, 토큰이 주장하는 학생과
  // 일치하는지까지 확인한다 — 이게 "남의 studentId로 요청" 차단의 핵심.
  if (opts.studentId !== undefined) {
    if (typeof opts.studentId !== 'string' || opts.studentId.length === 0) {
      return { ok: false, reason: 'student_mismatch' }
    }
    if (opts.studentId !== payload.sid) return { ok: false, reason: 'student_mismatch' }
  }

  return { ok: true, studentId: payload.sid, version: SESSION_TOKEN_VERSION }
}

// ── PIN 최초 설정용 1회용 setup code (2026-08-29, 보안 감사 P0-1 대응) ────
// 문제: 최초 PIN 설정 시점에는 학생과 서버가 공유하는 비밀이 없다 — 학생의
// 유일한 자격증명이 될 것이 바로 지금 만들려는 그 PIN이기 때문이다. 그래서
// self-set-student-pin.js의 기존 두 게이트(pin_setup_allowed===true /
// pin_hash IS NULL)는 "요청자가 그 학생 본인인가"에 대해 아무것도 말해주지
// 못한다 — 둘 다 계정의 *상태*일 뿐이다. 실제로 학생 UUID만 알면(anon key로
// students.id 열거가 열려 있다 — 로그인 화면이 반 명단을 그리려면 필요)
// 누구나 그 학생의 PIN을 선점하고, 그 PIN으로 로그인해 세션 토큰까지 받아
// 보상 원장 쓰기 권한을 얻을 수 있었다.
//
// 해법: 관리자가 "PIN 설정 허용"을 누를 때 서버가 코드를 하나 파생해 관리자
// 화면에 보여주고, 교사가 그 코드를 학생에게 전달한다. 학생은 PIN과 함께
// 코드를 입력해야 한다 — 이것이 유일하게 가능한 제2 인증 요소다.
//
// 저장하지 않는다(DB 컬럼/테이블 추가 0):
//   · 코드값 — SESSION_SECRET + studentId + 시간버킷에서 매번 파생하므로
//     서버가 재계산한다. 어디에도 보관하지 않는다.
//   · 만료   — 시간버킷 자체가 만료다.
//   · 1회성  — 성공 시 pin_hash가 NULL -> NOT NULL로 전이하고, 기존 원자적
//     UPDATE(.is('pin_hash', null))가 재사용을 그대로 막는다. "사용됨"
//     플래그가 따로 필요 없다.
//
// 유효기간: 버킷 10분 + 현재/직전 두 버킷 허용 = 최소 10분, **최대 20분**.
// 운영자가 지정한 TTL 20분을 어떤 경우에도 넘지 않는다.
//
// 코드 형식: RFC4648 base32 8자(40비트). 0/1/8/9가 없는 알파벳이라 아이가
// 소리내어 옮겨 적을 때 0-O, 1-I 혼동이 생기지 않는다. 40비트는 무차별
// 대입이 비현실적이라(약 1조 분의 1) rate limit 없이도 방어가 성립한다.
export const PIN_SETUP_CODE_TTL_MS = 20 * 60 * 1000
const PIN_SETUP_BUCKET_MS = 10 * 60 * 1000
const PIN_SETUP_CODE_LEN = 8
const PIN_SETUP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function setupCodeForBucket(studentId, bucket) {
  const secret = sessionSecret()
  if (!secret) return null
  if (typeof studentId !== 'string' || studentId.length === 0) return null
  const mac = crypto.createHmac('sha256', secret)
    .update(`pinsetup:v1:${studentId}:${bucket}`)
    .digest()
  let out = ''
  for (let i = 0; i < PIN_SETUP_CODE_LEN; i++) out += PIN_SETUP_ALPHABET[mac[i] & 31]
  return out
}

// 관리자 발급용. 시크릿이 없으면 null(fail-closed — 검증 쪽도 통과시키지
// 않으므로 "코드 없이 설정되는" 구멍이 생기지 않는다).
export function pinSetupCode(studentId, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now()
  return setupCodeForBucket(studentId, Math.floor(now / PIN_SETUP_BUCKET_MS))
}

// 관리자 화면에 "언제까지 유효한지" 보여주기 위한 값 — 현재 버킷의 끝에서
// 한 버킷 더(직전 버킷 허용분)까지가 실제 만료다.
export function pinSetupCodeExpiresAt(opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now()
  return (Math.floor(now / PIN_SETUP_BUCKET_MS) + 2) * PIN_SETUP_BUCKET_MS
}

// 반환: { ok:true } | { ok:false, reason }
// reason: no_secret | invalid_setup_code
// 예외를 던지지 않는다 — 호출부가 거부만 하면 되도록.
export function verifyPinSetupCode(studentId, code, opts = {}) {
  const secret = sessionSecret()
  if (!secret) return { ok: false, reason: 'no_secret' }
  if (typeof code !== 'string') return { ok: false, reason: 'invalid_setup_code' }
  const normalized = code.trim().toUpperCase().replace(/[\s-]/g, '')
  if (normalized.length !== PIN_SETUP_CODE_LEN) return { ok: false, reason: 'invalid_setup_code' }
  const now = typeof opts.now === 'number' ? opts.now : Date.now()
  const bucket = Math.floor(now / PIN_SETUP_BUCKET_MS)
  // 현재 버킷과 직전 버킷만 허용(최대 20분). 비교는 timingSafeEqual —
  // 문자열 === 는 조기 종료로 타이밍 정보를 흘린다.
  for (const b of [bucket, bucket - 1]) {
    const expected = setupCodeForBucket(studentId, b)
    if (!expected) continue
    const a = Buffer.from(expected, 'utf8')
    const c = Buffer.from(normalized, 'utf8')
    if (a.length === c.length && crypto.timingSafeEqual(a, c)) return { ok: true }
  }
  return { ok: false, reason: 'invalid_setup_code' }
}

// ── Supabase Auth 세션 발급 (Phase 2b Step 1-A, 2026-09-02) ────────────────
// 배경: 이 앱은 Supabase Auth를 쓰지 않는다(브라우저는 anon key 고정,
// students는 RLS OFF + 컬럼 GRANT 신뢰 모델). 목표는 PIN 로그인 성공 시
// 서버가 Supabase Auth 세션을 "대신" 발급해, 이후 클라이언트가
// `authenticated` 롤 + `app_metadata.student_id`로 본인 행만 접근하게
// 하는 것(Phase C에서 RLS 전환) — JWT 서명 자체는 Supabase가 한다(서버가
// 직접 JWT를 만들지 않는다, 이 파일의 signSessionToken과는 별개 트랙).
//
// 학생 계정은 이름+PIN이지 이메일이 없으므로, Supabase Auth가 요구하는
// 이메일 필드에 학생 UUID 기반의 존재하지 않는 도메인(@students.invalid,
// RFC 2606이 권장하는 예약 TLD류 패턴)을 합성해 채운다 — 실제 메일이
// 발송되지 않고(email_confirm:true로 확인 메일 생략), 이 이메일은 로그인
// 자격증명으로 쓰이지 않는다(여전히 이름+PIN만 학생이 입력).
//
// 기본 OFF: STUDENT_AUTH_SESSION 환경변수가 '1'|'true'일 때만 동작한다.
// 미설정/off면 아래 함수들이 호출되는 코드 경로 자체를 verify-student-pin.js가
// 타지 않으므로 응답이 byte-identical하게 유지된다.
export function isStudentAuthSessionEnabled() {
  const v = String(process.env.STUDENT_AUTH_SESSION || '').toLowerCase()
  return v === '1' || v === 'true'
}

const STUDENT_AUTH_EMAIL_DOMAIN = 'students.invalid'
const STUDENT_AUTH_SOURCE = 'paul-easy-voca'

// isValidStudentId를 통과한 값만 이메일을 만든다 — 그렇지 않으면 null을
// 반환해(fail-closed) 호출부가 이후 admin API를 아예 호출하지 않게 한다.
export function studentAuthEmail(studentId) {
  if (!isValidStudentId(studentId)) return null
  return `${studentId.toLowerCase()}@${STUDENT_AUTH_EMAIL_DOMAIN}`
}

function isAlreadyExistsAuthError(err) {
  if (!err) return false
  const status = err.status ?? err.statusCode
  const code = err.code
  const msg = String(err.message || '').toLowerCase()
  return status === 422 || code === 'email_exists' || msg.includes('already')
}

// adminClient는 호출부(verify-student-pin.js)가 이미 만들어 둔
// createClient(url, supabaseAdminKey()) 인스턴스를 그대로 받는다 — 이
// 함수 안에서 새 클라이언트를 만들지 않는다.
// 반환: { ok:true } | { ok:false, reason:'invalid_student_id'|'auth_user_create_failed' }
// 절대 throw하지 않는다 — 어떤 예외든 잡아서 실패 사유로 변환한다.
export async function ensureStudentAuthUser(adminClient, studentId) {
  const email = studentAuthEmail(studentId)
  if (!email) return { ok: false, reason: 'invalid_student_id' }
  try {
    const { error } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { student_id: studentId, source: STUDENT_AUTH_SOURCE },
    })
    if (!error) return { ok: true }
    // 멱등성 — 이미 만들어진 계정(재로그인)이면 정상 흐름으로 취급한다.
    if (isAlreadyExistsAuthError(error)) return { ok: true }
    return { ok: false, reason: 'auth_user_create_failed' }
  } catch (e) {
    if (isAlreadyExistsAuthError(e)) return { ok: true }
    return { ok: false, reason: 'auth_user_create_failed' }
  }
}

// magiclink 방식으로 1회용 토큰 해시를 발급한다(이메일 발송 없음 — 링크
// 자체를 발송하지 않고 hashed_token만 서버가 받아 응답에 실어준다).
// generateLink가 돌려준 user.app_metadata에 student_id가 없거나 다르면
// (예: 계정이 다른 경로로 먼저 생겼거나 이전 버전 메타데이터인 경우)
// updateUserById로 보정한다 — 보정이 실패하면 **세션을 내주지 않는다**
// (fail-closed: 잘못된 app_metadata로 인증된 세션이 나가면 RLS 전환 후
// 그 세션이 엉뚱한 studentId로 데이터에 접근할 수 있기 때문).
// 반환: { ok:true, authTokenHash } | { ok:false, reason:'invalid_student_id'|'auth_link_failed' }
// 절대 throw하지 않는다.
export async function issueStudentAuthTokenHash(adminClient, studentId) {
  const email = studentAuthEmail(studentId)
  if (!email) return { ok: false, reason: 'invalid_student_id' }
  let data, error
  try {
    const result = await adminClient.auth.admin.generateLink({ type: 'magiclink', email })
    data = result?.data
    error = result?.error
  } catch {
    return { ok: false, reason: 'auth_link_failed' }
  }
  if (error || !data) return { ok: false, reason: 'auth_link_failed' }
  const hashedToken = data.properties?.hashed_token
  if (!hashedToken) return { ok: false, reason: 'auth_link_failed' }

  const currentSid = data.user?.app_metadata?.student_id
  if (currentSid !== studentId) {
    const userId = data.user?.id
    if (!userId) return { ok: false, reason: 'auth_link_failed' }
    try {
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { student_id: studentId, source: STUDENT_AUTH_SOURCE },
      })
      if (updateErr) return { ok: false, reason: 'auth_link_failed' }
    } catch {
      return { ok: false, reason: 'auth_link_failed' }
    }
  }

  return { ok: true, authTokenHash: hashedToken }
}
