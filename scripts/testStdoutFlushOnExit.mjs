// scripts/testStdoutFlushOnExit.mjs — stdout drain-safe exit 회귀 테스트 (2026-09-04)
//
// 배경(CI Gate 3 실패, run 33787307588): scripts/studentHealthCheck.mjs 가
// --json 으로 ~179KB(학생 46명) JSON 을 console.log 한 직후 process.exit(code)
// 를 호출했다. Linux 에서 자식 프로세스의 stdout 이 부모(scripts/verifyRelease.mjs
// Gate 3 의 spawnSync)로 PIPE 연결돼 있으면 그 write 는 비동기이고,
// process.exit() 는 커널 write 완료(drain)를 기다리지 않고 즉시 이벤트
// 루프를 죽인다 — 부모는 132,231자로 잘린 stdout 을 받아 JSON.parse 에
// 실패했다(child status 0, signal 없음 — "정상 종료했는데 출력이 잘림"이라
// 원인 특정이 어려웠던 이유). Windows 로컬은 파이프 구현이 달라 이 문제가
// 재현되지 않는다(로컬 검증만으로는 못 잡는다).
//
// 수정: process.exit(code) 대신 process.exitCode = code 를 설정하고 모듈이
// 자연 종료되게 둔다 — Node 는 자연 종료 시 stdout 을 끝까지 flush 한 뒤
// 프로세스를 끝낸다(공식 문서: process.exit() 사용을 피하고 exitCode 를
// 설정하라는 권고와 동일 근거). scripts/prodCheck.mjs / scripts/prodHotfix.mjs
// 는 이미 이 패턴이다(별도 이유— Node 24+Windows 크래시 회피, 102차)라서
// 같은 트랙의 재발 방지 차원에서 두 파일도 정적으로 함께 확인한다.
//
// 이 파일이 검증하는 것 두 가지:
//   1절(행동) — "process.exitCode + 자연 종료" 패턴이 실제로 큰 stdout 을
//     파이프를 통해 온전히 전달하는지, node 자식 프로세스를 spawnSync 로
//     직접 구동해 확인한다. ⚠ 원본 버그(process.exit() 직후 종료로 인한
//     절단)는 Linux PIPE 비동기 write 에서만 재현된다 — Windows 로컬에서는
//     이 스위트를 돌려도 절단이 재현되지 않을 수 있다(위 배경 설명 그대로).
//     그래서 이 절은 "버그 재현"이 아니라 "고친 패턴이 데이터 무손실인가"
//     만 검증한다 — 플랫폼 무관하게 항상 성립해야 하는 계약이다.
//   2절(정적) — 실제로 고친 3개 파일 소스에 근거해, 큰 JSON 을 찍는
//     지점 이후에 drain 을 기다리지 않는 process.exit( 호출이 남아있지
//     않은지 regex 로 확인한다. 이게 "행동 재현이 플랫폼에 좌우되는" 1절의
//     한계를 보완하는, 실제로 강제력 있는 가드다.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
// scripts/testReleaseGate.mjs 의 codeOnly() 와 동일 규칙(// 로 시작하는
// 줄 제거) — 이 파일의 정적 검사가 "process.exit(" 를 설명하는 주석
// 텍스트(예: 이 수정 자체를 설명하는 한글 주석)까지 코드로 오인해
// 오탐(false FAIL)하지 않도록 코드만 남긴다.
const codeOnly = (t) => t.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')

console.log('\n=== 1절. 행동 — process.exitCode + 자연 종료는 큰 stdout 을 파이프로 온전히 전달한다 ===')
{
  // studentHealthCheck.mjs 수정본과 정확히 같은 패턴(process.stdout.write 로
  // 큰 페이로드를 쓰고, process.exit() 를 부르지 않고 exitCode 만 설정)을
  // 별도 자식 프로세스로 재현한다. spawnSync 는 verifyRelease.mjs Gate 3 와
  // 동일하게 stdio: 'pipe' 로 자식을 구동해 부모가 실제로 파이프를 통해
  // 받는 바이트 수를 관측한다.
  const SIZE = 2 * 1024 * 1024 // 2MB — 원인이 됐던 179KB 보다 넉넉히 크게
  const fixedPatternCode = `
    const payload = 'x'.repeat(${SIZE})
    process.stdout.write(JSON.stringify({ ok: true, payload }))
    process.exitCode = 0
    // 의도적으로 process.exit() 를 호출하지 않는다 — 이벤트 루프가 비면
    // Node 가 stdout 을 flush 한 뒤 자연 종료한다.
  `
  const res = spawnSync(process.execPath, ['-e', fixedPatternCode], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
  })
  check('자식 프로세스가 정상 종료했다(status 0, signal 없음)',
    res.status === 0 && !res.signal, JSON.stringify({ status: res.status, signal: res.signal, stderr: String(res.stderr).slice(0, 300) }))
  const stdout = String(res.stdout || '')
  check('stdout 이 잘리지 않고 온전히 도착했다(2MB+ 페이로드)',
    stdout.length >= SIZE, `받은 길이=${stdout.length}, 기대 최소=${SIZE}`)
  let parsed = null
  try { parsed = JSON.parse(stdout) } catch { /* 아래에서 FAIL 처리 */ }
  check('JSON.parse 가 성공하고 payload 길이가 정확히 일치한다(부분 절단이면 여기서 반드시 드러난다)',
    !!parsed && typeof parsed.payload === 'string' && parsed.payload.length === SIZE,
    `parsed payload 길이=${parsed?.payload?.length}`)
}
{
  // 참고용(비단언, 정보 로그) — process.exit() 를 즉시 부르는 옛 패턴은
  // Linux PIPE 비동기 write 에서만 절단이 재현되고 Windows 로컬에서는
  // 재현되지 않을 수 있다(배경 설명 그대로) — 그래서 이 결과는 통과/실패
  // 판정에 넣지 않고 참고 로그로만 남긴다. 강제력 있는 가드는 2절의 정적
  // 검사다.
  const SIZE = 2 * 1024 * 1024
  const oldPatternCode = `
    const payload = 'x'.repeat(${SIZE})
    process.stdout.write(JSON.stringify({ ok: true, payload }))
    process.exit(0)
  `
  const res = spawnSync(process.execPath, ['-e', oldPatternCode], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
  })
  const stdout = String(res.stdout || '')
  console.log(`  [정보] 옛 패턴(process.exit() 직후 종료) 재현 시도: 받은 길이=${stdout.length} / 기대=${SIZE + 20}자 근처 — ${
    stdout.length >= SIZE ? '이 플랫폼에서는 절단이 재현되지 않음(정상, Windows 로컬 예상 결과)' : '절단 재현됨(Linux 등에서 나타날 수 있는 원본 버그 그대로)'
  }`)
}

console.log('\n=== 2절. 정적 — 큰 JSON 출력 이후 drain 을 기다리지 않는 process.exit( 호출이 없다 ===')
{
  // studentHealthCheck.mjs 의 대상 JSON 출력(학생 배열 포함, 46명 기준
  // ~179KB 로 이번 사고를 일으킨 지점)은 `students: outputStudents,` 로
  // 유일하게 식별된다. 이 마커 이후 파일 끝까지 process.exit( 호출이 없고,
  // 대신 process.exitCode = 로 종료 코드만 설정하는지 확인한다.
  const t = codeOnly(src('scripts/studentHealthCheck.mjs'))
  const markerIdx = t.indexOf('students: outputStudents,')
  check('studentHealthCheck.mjs 에 대상 JSON 출력 마커가 존재한다(테스트 전제 조건)', markerIdx !== -1)
  const after = markerIdx === -1 ? '' : t.slice(markerIdx)
  check('큰 JSON 출력 마커 이후에 process.exit( 호출이 없다(drain 미대기 종료 금지)',
    markerIdx !== -1 && !/process\.exit\(/.test(after), '발견: ' + (after.match(/.{0,40}process\.exit\(.{0,20}/) || [''])[0])
  check('큰 JSON 출력 마커 이후에 process.exitCode = 로 종료 코드를 설정한다(자연 종료로 flush 보장)',
    markerIdx !== -1 && /process\.exitCode\s*=/.test(after))
}
{
  // 같은 트랙의 다른 --json 생산자(Gate 3b/4 가 spawn 하는 harness 파일)도
  // 같은 병에 걸릴 수 있는 구조라 함께 확인한다 — 이미 process.exitCode
  // 패턴이라 이 두 파일은 규모와 무관하게 안전하다(102차 변경 근거는
  // 달랐지만 결과적으로 drain-safe).
  for (const rel of ['scripts/prodCheck.mjs', 'scripts/prodHotfix.mjs']) {
    const t = codeOnly(src(rel))
    check(`${rel} — 바깥(top-level)에 drain 미대기 process.exit( 호출이 없다(process.exitCode 패턴 유지)`,
      !/\bprocess\.exit\(/.test(t))
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('ALL PASS')
}
