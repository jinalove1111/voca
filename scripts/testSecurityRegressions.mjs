// scripts/testSecurityRegressions.mjs — 보안 회귀 고정 스위트 (2026-09-04, T9)
//
// 목적: 그동안 개별 보고서/커밋 주석으로만 존재하던 여러 보안 계약을 한
// 파일로 모아 "회귀가 나면 여기서 잡히게" 고정한다. 새로 여는 취약점을
// 찾는 게 아니라, 알려진 좋은 상태(막혀 있는 것)와 알려진 나쁜 상태(아직
// 안 막힌 것 — KNOWN)를 둘 다 정직하게 고정한다(CLAUDE.md 규칙 18).
//
// 절 구성:
//   1. api/grant-xp.js — 레거시 XP 분기 인증 부재(KNOWN, handoff.md 2026-09-02)
//   2. src/components/AdminScreen.jsx — 미인증 상태에서 fetch 금지
//   3. src/ — service_role/시크릿 키 노출 0, import.meta.env 화이트리스트
//   4. .gitignore — .env* 커밋 이력 0
//   5. wordLibrary.js addStudent — 호출부 0(자기등록 OFF), create_student 재인증 필수
//   6. 라이브 READ-ONLY 프로브(anon key, phantom id만 — 실데이터 무접촉)
//   7. api/verify-student-pin.js — 잠금 상수 + ilike 이스케이프
//   8. Release Gate 자가검증 — 자격증명 없이도 공허 통과(exit 0)하지 않는가
//
// 안전 원칙: production에는 anon GET/HEAD 또는 phantom id(00000000-0000-
// 4000-8000-000000000000, 어떤 실제 행과도 매칭 불가) 대상 UPDATE/DELETE/
// INSERT만 보낸다 — Postgres는 권한 판정을 행 매칭보다 먼저 하므로 42501
// 여부는 그대로 검증되고, 설령 권한이 열려 있어도(회귀) phantom id라 0
// rows다. 실학생 id를 쓰는 프로브는 이 파일에 없다. 시크릿 값은 절대
// 출력하지 않는다(있음/없음만 표시).
//
// 등록: npm run verify:security-regressions (tests/harness registry.mjs
// login 도메인에 필수 체크로 등록)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REQUIRE_ENV = process.argv.includes('--require-env')

let pass = 0, fail = 0, known = 0, skip = 0
const failures = []
function check(label, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${label}`) }
  else {
    fail++
    failures.push(label)
    console.log(`  FAIL  ${label}${extra ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`)
  }
}
// 알려진 열린 상태를 "그 상태 그대로"일 때만 KNOWN으로 통과시킨다. 상태가
// 바뀌면(더 열리지도 닫히지도 않고 그냥 달라지면) 이 파일을 갱신하라는
// 의도된 알람으로 FAIL 처리한다 — testRewardEndpointSecurity.mjs의
// knownExposure()와 동일한 관례.
function knownOpen(label, stillMatchesKnownState, extra) {
  known++
  if (stillMatchesKnownState) console.log(`  KNOWN ${label}`)
  else {
    fail++
    failures.push(label)
    console.log(`  FAIL  ${label} — 알려진 상태와 달라졌습니다(더 열렸거나 닫혔을 수 있음). 이 테스트를 갱신하세요.${extra ? ' ' + extra : ''}`)
  }
}
function checkSkip(label, reason) {
  skip++
  console.log(`  SKIP  ${label} — ${reason}`)
}

const lineOf = (src, idx) => (idx < 0 ? -1 : src.slice(0, idx).split('\n').length)
// 주의: CRLF(Windows) 줄바꿈이면 split('\n') 후 각 줄 끝에 '\r'이 남는다.
// JS 정규식의 '.'은 '\r'을 소비하지 않으므로(줄 종료 문자 취급) '/\/\/.*$/'
// 처럼 '$'로 끝을 앵커링하면 '.*'가 '\r' 앞에서 멈추고 '$'(문자열의 진짜
// 끝, '\r' 이후)에 도달하지 못해 매치 자체가 실패해 아무것도 안 지워지는
// 버그가 실제로 재현됐다(수정 전 이 파일로 FAIL 오탐 2건 실측, 규칙 15).
// '$' 앵커를 빼면 '.*'가 도달 가능한 만큼(=줄 끝 '\r' 직전까지)만 지우고
// 성공하므로 CRLF/LF 둘 다 안전하다.
const codeOnly = (src) => src.split('\n').map((l) => l.replace(/\/\/.*/, '')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// ── 1. api/grant-xp.js — 레거시 XP 분기 인증 부재(KNOWN) ──────────────────
console.log('\n=== 1. api/grant-xp.js — reward 분기는 세션 토큰을 검증, 레거시 XP 분기는 아직 미검증(KNOWN) ===')
{
  const src = fs.readFileSync(path.join(ROOT, 'api', 'grant-xp.js'), 'utf8')
  const rewardBranchIdx = src.indexOf("req.body.ledger === 'reward'")
  const legacyBranchIdx = src.indexOf('const { studentId, eventType, sourceEventId } = req.body || {}')
  check("reward 분기(req.body.ledger === 'reward') 발견", rewardBranchIdx >= 0,
    `line ${lineOf(src, rewardBranchIdx)}`)
  check('레거시 XP 분기(구조분해 studentId/eventType/sourceEventId) 발견', legacyBranchIdx >= 0,
    `line ${lineOf(src, legacyBranchIdx)}`)
  if (rewardBranchIdx >= 0 && legacyBranchIdx >= 0) {
    const rewardBranchSrc = src.slice(rewardBranchIdx, legacyBranchIdx)
    const legacyBranchSrc = src.slice(legacyBranchIdx)
    const rewardCallIdx = rewardBranchSrc.indexOf('verifySessionToken(')
    check('reward 분기가 verifySessionToken()을 호출한다',
      rewardCallIdx >= 0, `line ${lineOf(src, rewardBranchIdx + (rewardCallIdx >= 0 ? rewardCallIdx : 0))}`)
    knownOpen('레거시 XP 분기는 verifySessionToken()을 호출하지 않는다(handoff.md 2026-09-02 "남은 보안 과제" §5 — 코드 수정은 운영자 승인 후 별도 작업)',
      !legacyBranchSrc.includes('verifySessionToken('))
  }
}

// ── 2. AdminScreen.jsx — !authed 상태에서 fetch 금지 ───────────────────────
console.log('\n=== 2. src/components/AdminScreen.jsx — authed 이전에는 PIN 게이트만 렌더, fetch 없음 ===')
{
  const src = fs.readFileSync(path.join(ROOT, 'src', 'components', 'AdminScreen.jsx'), 'utf8')
  const compIdx = src.indexOf('export default function AdminScreen')
  check('AdminScreen 컴포넌트 정의 발견', compIdx >= 0, `line ${lineOf(src, compIdx)}`)
  const guardIdx = compIdx >= 0 ? src.indexOf('if (!authed) return', compIdx) : -1
  check('authed 이전 조기 반환(early return) 게이트 발견', guardIdx > compIdx,
    `line ${lineOf(src, guardIdx)}`)

  if (compIdx >= 0 && guardIdx > compIdx) {
    const preGuard = src.slice(compIdx, guardIdx)
    // preGuard 구간(early return 이전) — 여기 있는 훅/코드는 authed 값과
    // 무관하게 렌더될 때마다 항상 실행된다(React 훅은 조건부 호출 불가).
    // 이 구간에 network 신호(fetch/supabase/.from(/pin-status 등)가 있는데
    // authed 가드가 없으면 미인증 상태에서도 호출된다는 뜻 — FAIL.
    const useEffectIdxs = []
    { let i = 0; while ((i = preGuard.indexOf('useEffect(', i)) !== -1) { useEffectIdxs.push(i); i += 10 } }
    check('early return 이전 useEffect 개수 파악(0건이면 이 구간 검사 스킵)', useEffectIdxs.length >= 0)

    const netSignal = /fetch\(|supabase\.|\.from\(|student-pin-status|pin-status|getStudents\(|refreshStudents\(|fetchStudents\(/
    const authedGuard = /if\s*\(\s*!authed\s*\)\s*return/
    for (const idx of useEffectIdxs) {
      // 다음 useEffect 시작 전(혹은 preGuard 끝)까지를 이 effect의 대략적
      // 범위로 본다 — 정밀 괄호매칭 대신 "다음 훅 시작 지점"으로 충분히
      // 안전(과대추정은 있어도 과소추정은 없음 — 더 넓게 봐서 놓치지 않음).
      const nextIdx = useEffectIdxs.find((j) => j > idx) ?? preGuard.length
      const block = preGuard.slice(idx, nextIdx)
      const lineNum = lineOf(src, compIdx + idx)
      const hasNet = netSignal.test(block)
      if (!hasNet) {
        check(`useEffect(line ${lineNum})는 네트워크 호출이 없다(cleanup-only 등, authed 무관 안전)`, true)
      } else {
        const netFirstIdx = block.search(netSignal)
        const guardIdxInBlock = block.search(authedGuard)
        check(`useEffect(line ${lineNum})의 네트워크 호출은 authed 가드 이후에만 실행된다`,
          guardIdxInBlock >= 0 && guardIdxInBlock < netFirstIdx,
          `network signal at offset ${netFirstIdx}, guard at ${guardIdxInBlock} — 미가드 시 제안: 콜백 최상단에 'if (!authed) return' 추가`)
      }
    }
    check('early return 이전 구간에 student-pin-status/pin-status 직접 호출 없음',
      !/student-pin-status|pin-status/.test(preGuard))
  }
}

// ── 3. src/ — 시크릿 노출 0 + import.meta.env 화이트리스트 ────────────────
console.log('\n=== 3. src/ — service_role/시크릿 키 미노출, import.meta.env 화이트리스트 ===')
{
  function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules') continue
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p, out)
      else if (/\.(js|jsx|mjs|ts|tsx)$/.test(ent.name)) out.push(p)
    }
    return out
  }
  const srcDir = path.join(ROOT, 'src')
  const files = walk(srcDir)
  check('src/ 파일 스캔 대상 확보', files.length > 50, `${files.length}개 파일`)

  let secretHits = []
  let envKeys = new Set()
  const envKeyRe = /import\.meta\.env\.([A-Z0-9_]+)/g
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf8')
    const stripped = codeOnly(raw)
    if (/service_role|SUPABASE_SERVICE_ROLE/i.test(stripped)) {
      secretHits.push(path.relative(ROOT, f))
    }
    let m
    while ((m = envKeyRe.exec(stripped))) envKeys.add(m[1])
  }
  check('src/ 코드(주석 제외)에 service_role/SUPABASE_SERVICE_ROLE 문자열 0건',
    secretHits.length === 0, secretHits)

  const ALLOWED_ENV_KEYS = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'BASE_URL', 'DEV', 'MODE', 'PROD', 'SSR'])
  const disallowed = [...envKeys].filter((k) => !ALLOWED_ENV_KEYS.has(k))
  check('import.meta.env 커스텀 키는 VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY 뿐(+ Vite 내장 BASE_URL/DEV/MODE/PROD/SSR)',
    disallowed.length === 0, disallowed)
}

// ── 4. .gitignore — .env* 커밋 이력 0 ──────────────────────────────────────
console.log('\n=== 4. .gitignore — .env/.env.local 커버 + git 이력에 커밋된 적 없음 ===')
{
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  const giLines = gi.split(/\r?\n/).map((l) => l.trim())
  const coversEnv = giLines.some((l) => l === '.env' || l === '.env*')
  const coversEnvLocal = giLines.some((l) => l === '.env.local' || l === '.env*' || l === '.env.local*')
  check('.gitignore가 .env를 커버한다', coversEnv, giLines.filter((l) => l.startsWith('.env')))
  check('.gitignore가 .env.local을 커버한다', coversEnvLocal, giLines.filter((l) => l.startsWith('.env')))

  const res = spawnSync('git', ['log', '--all', '--diff-filter=A', '--', '.env', '.env.local'],
    { cwd: ROOT, encoding: 'utf8' })
  check('git log --all(.env/.env.local 추가 커밋) 0건', res.status === 0 && res.stdout.trim() === '',
    res.stdout.trim().split('\n').filter(Boolean))
}

// ── 5. wordLibrary.js addStudent — 자기등록 OFF, create_student 재인증 ────
console.log('\n=== 5. 학생 자기등록 경로 — addStudent 호출부 0건, create_student는 checkAdminReauth 필수 ===')
{
  const wlPath = path.join(ROOT, 'src', 'utils', 'wordLibrary.js')
  const wl = fs.readFileSync(wlPath, 'utf8')
  check('wordLibrary.js에 addStudent 정의 존재(비교 기준 확보)', /export\s+async\s+function\s+addStudent\(/.test(wl))

  function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules') continue
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p, out)
      else if (/\.(js|jsx)$/.test(ent.name)) out.push(p)
    }
    return out
  }
  const files = walk(path.join(ROOT, 'src'))
  const importSites = []
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf8')
    // 정의 파일 자체의 export 선언은 "호출부"가 아니므로 제외.
    if (path.resolve(f) === path.resolve(wlPath)) continue
    const stripped = codeOnly(raw)
    if (/\baddStudent\s*\(/.test(stripped) || /\{\s*[^}]*\baddStudent\b[^}]*\}\s*=/.test(stripped)) {
      importSites.push(path.relative(ROOT, f))
    }
  }
  check('src/ 어디에도 addStudent를 import/호출하는 곳이 없다(신규 학생 생성은 서버 전용)',
    importSites.length === 0, importSites)

  const apiSrc = fs.readFileSync(path.join(ROOT, 'api', 'admin-pin-actions.js'), 'utf8')
  const reauthIdx = apiSrc.indexOf('checkAdminReauth(req, res)')
  const actionIdx = apiSrc.indexOf("action === 'create_student'")
  check('api/admin-pin-actions.js가 dispatch 최상단에서 checkAdminReauth를 호출한다', reauthIdx >= 0, `line ${lineOf(apiSrc, reauthIdx)}`)
  check("create_student 분기가 checkAdminReauth 호출 이후 위치한다(재인증 없이 도달 불가)",
    actionIdx > reauthIdx && reauthIdx >= 0, `reauth line ${lineOf(apiSrc, reauthIdx)}, create_student line ${lineOf(apiSrc, actionIdx)}`)
}

// ── 6. 라이브 READ-ONLY 프로브 (anon key, phantom id) ──────────────────────
console.log('\n=== 6. 라이브 READ-ONLY 프로브 — anon key, phantom id만 사용(실데이터 무접촉) ===')
{
  for (const file of ['.env', '.env.local']) {
    const p = path.join(ROOT, file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=][^=]*)=(.*)$/)
      if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
    }
  }
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
  const HAVE_ENV = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

  if (!HAVE_ENV) {
    const msg = 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 없음 — 라이브 프로브를 실행할 수 없습니다.'
    if (REQUIRE_ENV) {
      check('라이브 프로브 실행에 필요한 자격증명 존재(--require-env)', false, msg)
    } else {
      const labels = [
        'anon SELECT students.pin_hash(phantom) 거부',
        'anon UPDATE students.pin_hash(phantom) 거부',
        'anon DELETE students(phantom) 거부(v3_42)',
        'anon SELECT reward_ledger(phantom) 거부',
        'anon INSERT reward_ledger(phantom) 거부',
        'anon UPDATE reward_ledger(phantom) 거부',
        'anon DELETE reward_ledger(phantom) 거부',
        'anon INSERT xp_ledger(phantom, 존재불가 FK) 거부',
        'anon DELETE student_class_assignments(phantom) — KNOWN 열림(handoff.md:286)',
      ]
      for (const l of labels) checkSkip(l, msg)
    }
  } else {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const PHANTOM_ID = '00000000-0000-4000-8000-000000000000'
    const isDenied = (error) => !!error && (error.code === '42501' || /permission denied|row-level security/i.test(error.message || ''))

    {
      const { error } = await supabase.from('students').select('pin_hash').eq('id', PHANTOM_ID)
      check('anon SELECT students.pin_hash(phantom) 거부(42501)', isDenied(error), error)
    }
    {
      const { error } = await supabase.from('students').update({ pin_hash: 'qa-probe:should-never-write' }).eq('id', PHANTOM_ID)
      check('anon UPDATE students.pin_hash(phantom) 거부(42501)', isDenied(error), error)
    }
    {
      const { error } = await supabase.from('students').delete().eq('id', PHANTOM_ID)
      check('anon DELETE students(phantom) 거부(42501, v3_42)', isDenied(error), error)
    }
    {
      const { error } = await supabase.from('reward_ledger').select('id').eq('id', PHANTOM_ID)
      check('anon SELECT reward_ledger(phantom) 거부(GRANT 0)', isDenied(error), error)
    }
    {
      const { error } = await supabase.from('reward_ledger').insert({
        student_id: PHANTOM_ID, reward_type: 'qa-security-regressions-probe', source_type: 'qa-probe',
        source_id: 'qa-probe', stars_delta: 0, xp_delta: 0, idempotency_key: 'qa-security-regressions-' + Date.now(),
      })
      check('anon INSERT reward_ledger(phantom) 거부(GRANT 0)', isDenied(error), error)
    }
    {
      const { error } = await supabase.from('reward_ledger').update({ stars_delta: 0 }).eq('id', PHANTOM_ID)
      check('anon UPDATE reward_ledger(phantom) 거부(GRANT 0)', isDenied(error), error)
    }
    {
      const { error } = await supabase.from('reward_ledger').delete().eq('id', PHANTOM_ID)
      check('anon DELETE reward_ledger(phantom) 거부(GRANT 0)', isDenied(error), error)
    }
    {
      // 존재 불가능한 student_id(phantom, FK 위반) — 권한 판정이 제약 판정보다
      // 먼저라 42501로 거부된다(설령 미래에 권한이 열려도 FK가 이 특정 행은
      // 어차피 막는다 — 이중 안전).
      const { error } = await supabase.from('xp_ledger').insert({
        student_id: PHANTOM_ID, event_type: 'qa-security-regressions-probe', amount: 1,
        source_event_id: 'qa-security-regressions-' + Date.now(),
      })
      check('anon INSERT xp_ledger(phantom, FK 불가) 거부', isDenied(error), error)
    }
    {
      // KNOWN 오픈 — handoff.md:286("student_class_assignments ... RLS는
      // ON이지만 allow anon all 정책"). 여기서는 204(성공)가 "현재 상태"이므로
      // FAIL이 아니라 KNOWN으로 고정한다. 잠기면(42501로 바뀌면) 이 테스트가
      // 저절로 FAIL로 뒤집혀 갱신을 요구한다.
      const { error, status } = await supabase.from('student_class_assignments').delete().eq('id', PHANTOM_ID)
      knownOpen('anon DELETE student_class_assignments(phantom) — 아직 잠기지 않음(204, handoff.md:286)',
        !error && (status === 204 || status === 200), `status=${status}${error ? ' error=' + error.code : ''}`)
    }
  }
}

// ── 7. api/verify-student-pin.js — 잠금 상수 + ilike 이스케이프 ───────────
console.log('\n=== 7. api/verify-student-pin.js — 잠금 상수(MAX_FAILS/LOCK_MINUTES) + ilike 메타문자 이스케이프 ===')
{
  const src = fs.readFileSync(path.join(ROOT, 'api', 'verify-student-pin.js'), 'utf8')
  check('MAX_FAILS 상수 정의', /const\s+MAX_FAILS\s*=\s*\d+/.test(src))
  check('LOCK_MINUTES 상수 정의', /const\s+LOCK_MINUTES\s*=\s*\d+/.test(src))
  check('MAX_FAILS/LOCK_MINUTES가 실제 실패 상태 계산(nextFailState)에 쓰인다',
    /nextFailState\([^)]*\{\s*MAX_FAILS[^}]*LOCK_MINUTES/.test(src.replace(/\s+/g, ' ')))
  check('ilike 와일드카드(%, _) 이스케이프 처리 존재', /replace\(\/\[\\\\%_\]\/g/.test(src) || /\\\\\$&/.test(src))
  check('이스케이프된 값을 ilike 필터에 사용한다', /\.ilike\(\s*'name'\s*,\s*escapedName\s*\)/.test(src))
}

// ── 8. Release Gate 자가검증 — 자격증명 없이 공허 통과(exit 0)하지 않는가 ──
console.log('\n=== 8. scripts/verifyRelease.mjs — 자격증명 부재 시 fail-closed(공허 통과 금지) 자가검증 ===')
{
  // 주의: studentHealthCheck.mjs는 process.env.VITE_SUPABASE_* 가 비어 있어도
  // '../.env' 파일을 직접 다시 읽어 자격증명을 복구한다(스크립트 자체 폴백,
  // scripts/studentHealthCheck.mjs L70-80). 그래서 env var만 비우는 것으로는
  // "자격증명 없음" 상태를 재현하지 못한다(실측 확인 — env만 비우면 라이브
  // 조회가 여전히 성공해 게이트가 정상 PASS 해버린다, 공허 통과가 아니라
  // 진짜 통과라 이 자가검증의 목적과 안 맞음). 그래서 .env 파일 자체를
  // 이 검증 구간에서만 잠깐 이름을 바꿔 두고(rename), try/finally로 반드시
  // 원상복구한다 — 파일 삭제(rm)는 하지 않는다(destructive-command-gate
  // 회피 목적이 아니라, rename이 원복이 100% 보장되는 더 안전한 연산이라
  // 그냥 그것만 쓴다).
  const ENV_PATH = path.join(ROOT, '.env')
  const BACKUP_PATH = path.join(ROOT, '.env.security-regressions-selftest.bak')

  if (!fs.existsSync(ENV_PATH) && fs.existsSync(BACKUP_PATH)) {
    // 이전 실행이 비정상 종료해 백업만 남은 경우의 방어적 사전 복구.
    fs.renameSync(BACKUP_PATH, ENV_PATH)
    console.log('  (사전 정리) 이전 실행이 남긴 .env 백업을 복원했습니다.')
  }

  if (!fs.existsSync(ENV_PATH)) {
    checkSkip('Release Gate 자격증명-부재 자가검증', '.env 파일이 이미 없음 — 별도 재현 불필요(이미 그 상태)')
  } else {
    fs.renameSync(ENV_PATH, BACKUP_PATH)
    try {
      const res = spawnSync(process.execPath,
        [path.join(ROOT, 'scripts', 'verifyRelease.mjs'), '--skip-build', '--skip-verify'],
        {
          cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
        })
      const combined = `${res.stdout || ''}\n${res.stderr || ''}`
      check('Release Gate가 자격증명 없이 exit 0(공허 통과)로 끝나지 않는다',
        res.status !== 0, `exit=${res.status}`)
      check('실패 사유에 require-env/SKIP/자격증명 언급이 포함된다(원인 진단 가능)',
        /require-env|SKIP|자격증명/.test(combined))
    } finally {
      if (fs.existsSync(BACKUP_PATH)) {
        if (fs.existsSync(ENV_PATH)) fs.rmSync(ENV_PATH)
        fs.renameSync(BACKUP_PATH, ENV_PATH)
      }
      check('.env 원상 복구 확인', fs.existsSync(ENV_PATH) && !fs.existsSync(BACKUP_PATH))
    }
  }
}

// ── 종합 ────────────────────────────────────────────────────────────────
console.log(`\n총 단언 ${pass + fail} (PASS ${pass} / FAIL ${fail}) + KNOWN ${known} + SKIP ${skip}`)
if (fail > 0) {
  console.log('\n❌ 실패 목록:')
  for (const f of failures) console.log(`   · ${f}`)
}
console.log(fail === 0
  ? '✅ 보안 회귀 고정 스위트 통과 (KNOWN 항목은 의도된 열린 상태 — handoff.md 참고)'
  : `❌ ${fail}건 실패`)
process.exit(fail === 0 ? 0 : 1)
