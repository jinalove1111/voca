// scripts/testSessionTokenAuth.mjs
//
// Reward API 인증 — 서명된 세션 토큰 (2026-08-24, HIGH 1 대응).
// 규칙 15에 따라 **구현 전에** 작성했고, 수정 전 소스에서 FAIL하는 것을
// 실측한 뒤 구현했다.
//
// ── 왜 이 방식인가 (설계 근거) ──────────────────────────────────────────
// 이 저장소는 Supabase Auth를 전혀 쓰지 않는다(supabase.auth.* 호출 0건).
// 학생 로그인은 이름+PIN -> api/verify-student-pin.js가 service_role로
// 검증 -> { studentId } 반환 -> App.jsx가 localStorage에 {id,name} 저장.
// 그 이후 서버는 클라이언트가 보낸 studentId를 **주장 그대로 신뢰**한다.
//
// 새 인증 프레임워크를 도입하지 않고, **이미 존재하는 유일한 로그인 관문**
// (verify-student-pin)에서 서명 토큰을 함께 발급한다. Node 내장 crypto
// HMAC만 쓴다 — 외부 패키지 0개(규칙 6, PIN 해싱을 bcrypt 대신 내장
// scrypt로 구현한 것과 같은 정신).
//
//   token = base64url(payloadJson) + '.' + base64url(HMAC-SHA256(payloadJson))
//   payload = { sid, exp }   // 최소화 — 이름/반/PIN 등 어떤 개인정보도 없음
//
// 학생 경험 변화 0: 이름+PIN 그대로, 재로그인/계정 재생성 불필요.
// DB 스키마 변경 0, migration 0.
//
// ── 적용 범위 판단 ──────────────────────────────────────────────────────
// grant-xp: **강제(enforce)**. postRewardEvent/postXpEvent가 fire-and-forget
//   이고 실패를 이미 삼키므로(wordLibrary.js), 거부돼도 학생 화면에 아무
//   변화가 없다 — 로컬 별 지급은 이미 끝난 뒤다. 원장 쓰기만 막힌다.
// submit-entrance-result: **관측(observe)**. 거부하면 학생이 시험 결과를
//   저장하지 못해 "저장 재시도" 화면을 보게 된다(학생 가시 피해). 토큰
//   보유율이 오를 때까지 기록만 하고, 강제 전환은 별도 승인 후.
//
// SESSION_SECRET 미설정 시 **fail-closed**(운영자 지정). 즉 시크릿 없이
// 배포하면 원장 쓰기가 멈춘다 — 배포 전 반드시 설정해야 한다.
//
// 등록: npm run verify:session-auth
// 순수 함수 + 소스 정적 검사. 네트워크 0, production 요청 0, DB 무접촉.

import fs from 'node:fs'
import crypto from 'node:crypto'

let failures = 0, asserted = 0
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

let auth = {}
try { auth = await import('../api/_pinAuth.js') } catch (e) { console.log('  (_pinAuth import 실패: ' + e.message + ')') }
const { signSessionToken, verifySessionToken, SESSION_TOKEN_TTL_MS } = auth

const SECRET = 'test-secret-do-not-use-in-production'
const SID = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-8888-4777-8666-555555555555'
const NOW = 1_756_000_000_000 // 고정 시각 — 결정론

const safeSign = (sid, opts) => { try { return signSessionToken(sid, opts) } catch (e) { return { __err: e.message } } }
const safeVerify = (tok, opts) => { try { return verifySessionToken(tok, opts) } catch (e) { return { ok: false, reason: '__threw:' + e.message } } }

console.log('\n1. 헬퍼 존재 + 서명/검증 기본 계약')
check('signSessionToken export 존재', typeof signSessionToken === 'function')
check('verifySessionToken export 존재', typeof verifySessionToken === 'function')
check('SESSION_TOKEN_TTL_MS 상수 존재', typeof SESSION_TOKEN_TTL_MS === 'number' && SESSION_TOKEN_TTL_MS > 0)
{
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  check('토큰이 문자열로 발급된다', typeof t === 'string' && t.length > 0)
  check('토큰이 payload.signature 2단 구조', typeof t === 'string' && t.split('.').length === 2)
}

console.log('\n2. 유효 토큰 → 허용 (요구 1)')
{
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  const v = safeVerify(t, { secret: SECRET, now: NOW, studentId: SID })
  check('유효 토큰 검증 통과', v.ok === true)
  check('검증 결과에 studentId가 담긴다', v.studentId === SID)
}

console.log('\n3. 토큰 없음 → 거부 (요구 2)')
for (const [label, tok] of [['null', null], ['undefined', undefined], ['빈 문자열', ''], ['공백', '   ']]) {
  const v = safeVerify(tok, { secret: SECRET, now: NOW, studentId: SID })
  check(`토큰 ${label} → 거부`, v.ok === false && v.reason === 'missing_token')
}

console.log('\n4. 잘못된 서명 → 거부 (요구 3)')
{
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  const [p] = String(t).split('.')
  check('서명 부분 변조 → 거부', safeVerify(`${p}.AAAAAAAA`, { secret: SECRET, now: NOW, studentId: SID }).ok === false)
  check('다른 시크릿으로 서명한 토큰 → 거부',
    safeVerify(safeSign(SID, { secret: 'another-secret', now: NOW }), { secret: SECRET, now: NOW, studentId: SID }).ok === false)
  check('거부 사유가 bad_signature',
    safeVerify(`${p}.AAAAAAAA`, { secret: SECRET, now: NOW, studentId: SID }).reason === 'bad_signature')
}

console.log('\n5. 만료 토큰 → 거부 (요구 4)')
{
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  const justBefore = safeVerify(t, { secret: SECRET, now: NOW + SESSION_TOKEN_TTL_MS - 1000, studentId: SID })
  const justAfter = safeVerify(t, { secret: SECRET, now: NOW + SESSION_TOKEN_TTL_MS + 1000, studentId: SID })
  check('만료 직전은 통과', justBefore.ok === true)
  check('만료 직후는 거부', justAfter.ok === false)
  check('거부 사유가 expired', justAfter.reason === 'expired')
}

console.log('\n6. token.sid ≠ body.studentId → 거부 (요구 5·6)')
{
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  const v = safeVerify(t, { secret: SECRET, now: NOW, studentId: OTHER })
  check('다른 학생 id로 요청 → 거부', v.ok === false)
  check('거부 사유가 student_mismatch', v.reason === 'student_mismatch')
  check('같은 id면 통과(대조군)', safeVerify(t, { secret: SECRET, now: NOW, studentId: SID }).ok === true)
}

console.log('\n7. malformed 토큰 → 거부 (요구 7·10)')
{
  const bad = [
    ['점 없음', 'abcdefg'],
    ['점만', '.'],
    ['payload 없음', '.AAAA'],
    ['서명 없음', 'AAAA.'],
    ['점 3개', 'a.b.c'],
    ['payload가 JSON 아님', Buffer.from('not-json').toString('base64url') + '.AAAA'],
    ['payload가 배열', Buffer.from('[1,2]').toString('base64url') + '.AAAA'],
    ['숫자', 12345],
    ['객체', { sid: SID }],
  ]
  for (const [label, tok] of bad) {
    const v = safeVerify(tok, { secret: SECRET, now: NOW, studentId: SID })
    check(`malformed(${label}) → 거부`, v.ok === false)
  }
  // payload 변조: sid를 바꾸면 서명이 깨져야 한다
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  const [, sig] = String(t).split('.')
  const forged = Buffer.from(JSON.stringify({ sid: OTHER, exp: NOW + 999999 })).toString('base64url') + '.' + sig
  const fv = safeVerify(forged, { secret: SECRET, now: NOW, studentId: OTHER })
  check('payload 변조(sid 교체) → bad_signature', fv.ok === false && fv.reason === 'bad_signature')
}

console.log('\n8. studentId 인자 방어 (요구 8·9)')
{
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  check('빈 studentId → 거부', safeVerify(t, { secret: SECRET, now: NOW, studentId: '' }).ok === false)
  check('null studentId → 거부', safeVerify(t, { secret: SECRET, now: NOW, studentId: null }).ok === false)
  check('임의 UUID studentId → 거부(토큰과 불일치)',
    safeVerify(t, { secret: SECRET, now: NOW, studentId: '00000000-0000-4000-8000-000000000000' }).ok === false)
  check('발급 시 빈 sid는 토큰을 만들지 않는다',
    (() => { const r = safeSign('', { secret: SECRET, now: NOW }); return r === null || r === undefined || !!r.__err })())
}

console.log('\n9. SESSION_SECRET 미설정 → fail-closed (요구 11)')
{
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  for (const [label, s] of [['undefined', undefined], ['null', null], ['빈 문자열', '']]) {
    const v = safeVerify(t, { secret: s, now: NOW, studentId: SID })
    check(`시크릿 ${label} → 검증 거부(통과시키지 않음)`, v.ok === false && v.reason === 'no_secret')
  }
  const signed = safeSign(SID, { secret: '', now: NOW })
  check('시크릿 없이 발급 시도 → 토큰 생성 안 됨',
    signed === null || signed === undefined || !!signed.__err)
}

console.log('\n10. 서명 안전성 — 타이밍 공격 방어 + 시크릿 미노출')
{
  const src = fs.readFileSync('api/_pinAuth.js', 'utf8')
  const code = src.split('\n').map(l => l.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n')
  check('timingSafeEqual로 서명 비교(=== 문자열 비교 아님)', /timingSafeEqual/.test(code))
  check('HMAC-SHA256 사용', /createHmac\(\s*'sha256'/.test(code))
  check('시크릿을 응답/로그에 담지 않는다', !/console\.(log|warn|error)[^\n]*SESSION_SECRET/.test(code))
  check('Node 내장 crypto만 사용(외부 패키지 0)', /from 'node:crypto'/.test(code) && !/require\('jsonwebtoken'\)|from 'jsonwebtoken'/.test(code))
}

console.log('\n11. verify-student-pin — 정상 로그인 시 토큰 발급 (요구 12·13)')
{
  const src = fs.readFileSync('api/verify-student-pin.js', 'utf8')
  const code = src.split('\n').map(l => l.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n')
  check('signSessionToken을 import한다', /signSessionToken/.test(code))
  // 성공 응답 블록에만 token이 있어야 한다
  const okBlock = (code.match(/ok: true,[\s\S]{0,400}?\}\)/) || [''])[0]
  check('성공 응답(ok:true)에 token 포함', /token/.test(okBlock))
  const failBlocks = code.match(/ok: false[^\n]*\n?/g) || []
  check('실패 응답(ok:false)에는 token 없음', failBlocks.every(b => !/token/.test(b)))
  check('PIN 검증 로직은 무변경(verifyPin 그대로 사용)', /verifyPin\(/.test(code))
  check('pin_hash를 응답에 담지 않는다(규칙 11 유지)', !/pin_hash[^\n]*res\.status|res\.status[^\n]*pin_hash/.test(code))
}

console.log('\n12. grant-xp — 인증 guard 적용 (강제)')
{
  const src = fs.readFileSync('api/grant-xp.js', 'utf8')
  const code = src.split('\n').map(l => l.replace(/\r$/, '').replace(/\/\/.*$/, '')).join('\n')
  check('verifySessionToken을 import한다', /verifySessionToken/.test(code))
  check('reward 분기에서 토큰을 검증한다', /verifySessionToken\(/.test(code))
  check('거부 사유 unauthorized 존재', /unauthorized/.test(code))
  check('req.body.token(또는 헤더)에서 토큰을 읽는다', /body\.token|authorization|x-session-token/i.test(code))
  check('기존 서버 방어(L1~L3)가 남아 있다',
    /student_not_found/.test(code) && /exam_result_not_found/.test(code) && /daily_cap_reached/.test(code))
}

console.log('\n13. 클라이언트 배선 — UX 변화 없이 토큰 전달 (요구 14)')
{
  const app = fs.readFileSync('src/App.jsx', 'utf8')
  const sel = fs.readFileSync('src/components/StudentSelect.jsx', 'utf8')
  const wl = fs.readFileSync('src/utils/wordLibrary.js', 'utf8')
  check('StudentSelect가 응답의 token을 전달', /token/.test(sel))
  check('App이 세션에 token을 저장', /token/.test(app) && /SESSION_KEY/.test(app))
  check('postRewardEvent가 token을 실어 보낸다', /postRewardEvent[\s\S]{0,600}token/.test(wl))
  check('postXpEvent가 token을 실어 보낸다', /postXpEvent[\s\S]{0,600}token/.test(wl))
  check('로그인 입력은 여전히 이름+PIN만(새 입력 항목 없음)',
    /name, pin: loginPin/.test(sel) || /\{ name, pin/.test(sel))
  check('토큰이 화면에 렌더되지 않는다', !/\{\s*token\s*\}/.test(sel.replace(/\/\/.*$/gm, '')))
}

console.log('\n14. 개인정보 최소화 — payload에 무엇이 담기는가')
{
  const t = safeSign(SID, { secret: SECRET, now: NOW })
  if (typeof t === 'string' && t.includes('.')) {
    const payload = JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString('utf8'))
    const keys = Object.keys(payload).sort()
    check(`payload 키가 sid/exp 뿐 (실제: ${keys.join(',')})`, keys.length === 2 && keys[0] === 'exp' && keys[1] === 'sid')
    check('이름/PIN/반 정보가 담기지 않는다', !/name|pin|class|unit/i.test(JSON.stringify(payload)))
    check('exp가 미래 시각', payload.exp > NOW)
  } else {
    check('payload 검사 전제(토큰 발급)', false)
  }
}

console.log(`\n총 단언 ${asserted}개 중 실패 ${failures}개`)
console.log(failures === 0 ? '모든 단언 통과 — 세션 토큰 인증 고정 ✅' : `${failures}개 단언 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
