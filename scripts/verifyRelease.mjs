// Release Gate 실행기 — 배포 전 자동 검증 (2026-08-26, P2)
//
// ★ 이 파일은 앱 동작을 바꾸지 않는다 ★
// src/ 를 import 하지 않고, DB 에 쓰지 않으며, 기존 verify:all / build 스크립트를
// 그대로 호출하기만 한다. "정상인 기능은 건드리지 않는다"는 원칙 그대로.
//
// 게이트 구성
//   Gate 1  npm run build          코드가 빌드되는가
//   Gate 2  npm run verify:all     기존 40개 도메인 회귀 하네스
//   Gate 3  student health check   학생별 해석 체인 — baseline 대비 회귀만 차단
//   Gate 5  npm run verify:e2e     브라우저 E2E(Playwright, 전체 네트워크 mock) —
//                                  학생/관리자 화면이 실제로 올바르게 렌더되는가
//
// Gate 5(2026-09-05, tests/e2e/) — 로컬에서 Playwright chromium 이 설치돼
// 있지 않으면(별도 대용량 바이너리, npm install만으로는 안 받아짐) SKIP 취급
// 하고 게이트를 막지 않는다(E2E_SKIP_IF_NO_BROWSER=1 주입, 아래 참고). CI
// (process.env.CI)에서는 이 관용을 끄고 fail-closed로 강제한다 —
// .github/workflows/release-gate.yml 이 Gate 5 실행 전에
// `npx playwright install --with-deps chromium`을 미리 돌려 브라우저 부재
// 자체가 CI에서는 일어나지 않게 만든다.
//
// Gate 3 이 검사하는 것(scripts/lib/studentHealthRules.mjs, 학생당 19개 체크)
//   로그인 식별자 / 홈 반·교재 소유 반 유효성 / 주교재 연결 / 교재-유닛 연결 /
//   current_unit 유효성 / 단어 0개 / 유령 유닛 / 쓰기 방향 리졸버 / 중복 계정 /
//   배정 고아 — 즉 "코드는 정상인데 특정 학생만 조용히 깨지는" 회귀.
//
// baseline 개념 (핵심)
//   이미 알고 있던 FAIL 은 배포를 막지 않고 계속 보여주기만 한다.
//   baseline 에 없는 새 FAIL 만 회귀로 보고 배포를 차단한다.
//   baseline 파일: scripts/health/baseline.json  (없으면 = 모든 FAIL 이 회귀)
//   갱신: npm run health:baseline   (로컬 파일만 씀. DB 무접촉)
//
// Gate 3b(prod:check READ-ONLY invariants+health) / Gate 4(prod:hotfix
// WRITE-DISABLED 증명, 가짜 SUPABASE_ACCESS_TOKEN + CI 감지)는 CI 전용이다 —
// .github/workflows/release-gate.yml 에만 배선하고, 이 파일(로컬
// npm run verify:release)에는 넣지 않는다(2026-09-03, Phase 10 CI 통합
// Track 8). 이유: 로컬 실행자는 이미 prod:check/prod:hotfix 를 직접 손으로
// 돌릴 수 있고(운영자 승인 절차 필요), verify:release 는 "커밋마다 자동으로
// 도는 저비용 게이트"로 남겨 두는 편이 낫다.
//
// 사용법
//   npm run verify:release                 전체 게이트
//   npm run verify:release -- --skip-build  빌드 생략(빠른 반복용, CI 에선 쓰지 말 것)
//   npm run verify:release -- --strict-health  baseline 무시, FAIL 1건이면 차단
//   npm run verify:release -- --skip-e2e       Gate 5(browser E2E) 생략(빠른 반복용, CI 에선 쓰지 말 것)
//
// exit code: 게이트 하나라도 실패하면 1, 전부 통과면 0.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMPTY_BASELINE, normalizeBaseline, diffAgainstBaseline, summarizeGates, extractBalancedJson } from './lib/releaseGate.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const SKIP_BUILD = has('--skip-build')
const SKIP_VERIFY = has('--skip-verify')
const STRICT_HEALTH = has('--strict-health')
const SKIP_E2E = has('--skip-e2e')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = path.join(ROOT, 'scripts', 'health', 'baseline.json')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const hr = (s = '─') => console.log(s.repeat(72))
const gates = []

function runGate(name, label, fn) {
  hr('═')
  console.log(`▶ ${label}`)
  hr()
  const started = Date.now()
  const ok = fn()
  const ms = Date.now() - started
  gates.push({ name, ok })
  console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'}  ${label}  (${(ms / 1000).toFixed(1)}s)\n`)
  return ok
}

function runNpm(script, extraEnv) {
  const res = spawnSync(npmCmd, ['run', script], {
    cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  })
  return res.status === 0
}

// ── Gate 1 — build ────────────────────────────────────────────────────────
if (SKIP_BUILD) {
  console.log('⚠ Gate 1 (build) 생략됨 — --skip-build. CI/배포 전에는 쓰지 말 것.\n')
  gates.push({ name: 'build(skipped)', ok: true })
} else {
  runGate('build', 'Gate 1 — npm run build', () => runNpm('build'))
}

// ── Gate 2 — 기존 회귀 하네스 ─────────────────────────────────────────────
if (SKIP_VERIFY) {
  console.log('⚠ Gate 2 (verify:all) 생략됨 — --skip-verify. CI/배포 전에는 쓰지 말 것.\n')
  gates.push({ name: 'verify:all(skipped)', ok: true })
} else {
  runGate('verify:all', 'Gate 2 — npm run verify:all (기존 도메인 회귀)', () => runNpm('verify:all'))
}

// ── Gate 3 — 학생 헬스체크 (baseline 대비 회귀만 차단) ────────────────────
runGate('health', 'Gate 3 — Student Health Check (학생별 silent regression)', () => {
  // --require-env: 자격증명이 없으면 조용히 SKIP 하지 않고 실패한다.
  // "검증 못 함"이 "통과"로 둔갑하는 것이 게이트의 가장 위험한 실패 모드다.
  //
  // 2026-09-03 보안수정(High) — 아래 spawnSync 는 env 를 커스텀하지 않으므로
  // Node 기본값대로 process.env 를 그대로 물려준다. GitHub Actions 는 모든
  // 스텝에 CI=true/GITHUB_ACTIONS=true 를 자동 주입하므로, studentHealthCheck.
  // mjs 는 --mask-names 를 여기서 명시로 넘기지 않아도 스스로 CI 를 감지해
  // JSON students[].name 을 마스킹한다(scripts/studentHealthCheck.mjs 의
  // IS_CI/MASK_NAMES 참고). 아래 console.log(k.name)/console.log(r.name) 등
  // (파일 하단 diffAgainstBaseline 결과 출력)이 그 마스킹된 값을 그대로
  // 받아 출력하므로, 저장소가 PUBLIC 이라도 학생 실명이 이 게이트의
  // GitHub Actions 로그에 남지 않는다 — 로컬(비 CI) 실행은 기존처럼 원본을
  // 보여준다(운영자 편의, 로컬 로그는 비공개).
  // stdio 를 명시(['ignore','pipe','pipe'])해 stdin 대기로 인한 행업 가능성을
  // 구조적으로 차단한다 — 동작은 기존 기본값(전부 pipe)과 동일하다.
  const res = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts', 'studentHealthCheck.mjs'), '--json', '--require-env'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })

  if (res.error) {
    console.error(`  헬스체크 실행 실패: ${res.error.message}`)
    return false
  }
  const stdout = res.stdout || ''
  const stderr = res.stderr || ''
  let payload
  try {
    payload = JSON.parse(stdout)
  } catch (err) {
    // 2026-09-04 — CI(리눅스, run 33779410198)에서만 재현된 파싱 실패 진단
    // 강화. 기존에는 stdout 앞 1200자만 보여줬는데, 그 구간이 유효한 JSON
    // 처럼 보여도(ok:true, summary 정상) 실제로는 원인 특정이 불가능했다
    // — 잘림이 "뒤"에서 났을 가능성이 크기 때문. status/signal/stderr/
    // 앞+뒤 양쪽 꼬리를 모두 보여준다(학생 이름은 studentHealthCheck.mjs
    // 가 CI 에서 이미 마스킹해 내보내므로 여기 그대로 출력해도 안전 —
    // 파일 상단 2026-09-03 보안수정 주석 참고).
    console.error('  헬스체크 JSON 파싱 실패 — 진단 정보:')
    console.error(`    parse error   : ${err.message}`)
    console.error(`    child status  : ${res.status === null || res.status === undefined ? '(null)' : res.status}`)
    console.error(`    child signal  : ${res.signal ?? '(none)'}`)
    console.error(`    stdout 길이   : ${stdout.length}자`)
    if (stderr) console.error(`    stderr(첫 800자):\n${stderr.slice(0, 800)}`)
    console.error(`    stdout 앞 600자:\n${stdout.slice(0, 600)}`)
    console.error(`    stdout 뒤 600자:\n${stdout.slice(-600)}`)

    const recovered = extractBalancedJson(stdout)
    if (recovered) {
      console.error(`  ⚠ 관용 복구 성공 — 첫 '{'(idx ${recovered.start}) ~ 균형 '}'(idx ${recovered.end}) 구간만 파싱했습니다` +
        (recovered.end < stdout.length ? `(뒤에 남는 ${stdout.length - recovered.end}자는 버림).` : '.') +
        ' 정상 상태라면 이 경고가 절대 보이지 않아야 합니다 — 원인 조사 필요.')
      payload = recovered.json
    } else {
      console.error('  관용 복구도 실패 — 균형 잡힌 JSON 객체를 찾지 못했습니다(진짜 중간에 잘린 것으로 보임).')
      return false
    }
  }
  if (payload.infraError) {
    // 학생 문제가 아니라 인프라 오류 — 구분해서 보고한다.
    console.error(`  INFRA_ERROR (학생 데이터 문제 아님): ${payload.infraError}`)
    return false
  }

  const students = Array.isArray(payload.students) ? payload.students : []
  let baseline = EMPTY_BASELINE
  let baselineNote = 'baseline 없음 → 모든 FAIL 을 회귀로 본다(가장 엄격)'
  if (!STRICT_HEALTH && fs.existsSync(BASELINE_PATH)) {
    try {
      baseline = normalizeBaseline(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')))
      baselineNote = `baseline ${baseline.keys.length}건 (${path.relative(ROOT, BASELINE_PATH)})`
    } catch (err) {
      console.error(`  baseline 파일을 읽지 못함(${err.message}) → 빈 baseline 으로 진행(더 엄격)`)
    }
  } else if (STRICT_HEALTH) {
    baselineNote = 'baseline 무시 — --strict-health'
  }

  const d = diffAgainstBaseline(students, baseline)
  const s = payload.summary || {}
  console.log(`  검사 학생 ${students.length}명 — PASS ${s.pass ?? '?'} / WARN ${s.warn ?? '?'} / FAIL ${s.fail ?? '?'}`)
  console.log(`  ${baselineNote}`)
  if (Array.isArray(payload.ghostUnits) && payload.ghostUnits.length) {
    console.log(`  유령 유닛 ${payload.ghostUnits.length}개 잔존(정보) — 배정된 실학생이 생기면 회귀로 잡힌다`)
  }

  if (d.known.length) {
    console.log(`\n  ⚠ 알려진 문제 ${d.known.length}건 (baseline — 배포를 막지 않음, 0으로 줄여갈 것)`)
    for (const k of d.known) console.log(`      · ${k.name}: ${k.detail}`)
  }
  if (d.fixed.length) {
    console.log(`\n  ✨ 고쳐진 baseline 항목 ${d.fixed.length}건 — npm run health:baseline 로 갱신 권장`)
    for (const f of d.fixed) console.log(`      · ${f.name ?? f.studentId}: ${f.code}`)
  }
  if (d.warnings.length) {
    console.log(`\n  ⚠ WARN ${d.warnings.length}건 (배포를 막지 않음)`)
    for (const w of d.warnings) console.log(`      · ${w.name}: ${w.warning}`)
  }
  if (d.regressions.length) {
    console.log(`\n  ❌ 회귀 ${d.regressions.length}건 — 이번 변경이 새로 깨뜨린 것으로 판단, 배포 차단`)
    for (const r of d.regressions) console.log(`      · ${r.name}: ${r.detail}`)
    console.log('\n  이 학생들이 수업에서 겪게 될 증상: 로그인 불가 / 단어 0개 /')
    console.log('  유령 유닛 / 쓰기 방향 고정 등. 원인을 고치거나, 이미 알던 문제라면')
    console.log('  npm run health:baseline 로 baseline 에 등록한 뒤 다시 실행하세요.')
  }
  return d.ok
})

// ── Gate 5 — 브라우저 E2E(Playwright, 전체 네트워크 mock) ─────────────────
if (SKIP_E2E) {
  console.log('⚠ Gate 5 (browser E2E) 생략됨 — --skip-e2e. CI/배포 전에는 쓰지 말 것.\n')
  gates.push({ name: 'e2e(skipped)', ok: true })
} else {
  runGate('e2e', 'Gate 5 — npm run verify:e2e (browser E2E, Playwright)', () => {
    // 로컬에서 Playwright chromium 바이너리가 없으면 SKIP(게이트를 막지
    // 않음) — CI 에서는 이 관용을 끄고 fail-closed 로 강제한다(scripts/
    // testBrowserE2E.mjs 의 E2E_SKIP_IF_NO_BROWSER 계약 참고).
    const extraEnv = process.env.CI ? {} : { E2E_SKIP_IF_NO_BROWSER: '1' }
    return runNpm('verify:e2e', extraEnv)
  })
}

// ── 종합 ──────────────────────────────────────────────────────────────────
const total = summarizeGates(gates)
hr('═')
for (const g of gates) console.log(`  ${g.ok ? '✅' : '❌'}  ${g.name}`)
hr('═')
console.log(total.ok
  ? 'RELEASE GATE: PASS — 배포 가능'
  : `RELEASE GATE: FAIL — 실패 게이트: ${total.failed.join(', ')}`)
console.log('DB WRITE: 0 (모든 게이트가 읽기 전용)')

process.exit(total.ok ? 0 : 1)
