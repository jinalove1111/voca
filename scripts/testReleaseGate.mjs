// Release Gate — baseline 대비 회귀 판정 규칙 테스트 (2026-08-26, P2)
//
// 목적: "정상인 기능은 건드리지 않고, 새 변경이 다른 학생/기능을 깨뜨리는
// 경우에만 배포를 차단한다".
//
// 그러려면 헬스체크 FAIL 을 두 가지로 나눠야 한다.
//   · 이미 있던 문제(baseline)  — 이번 변경 탓이 아니므로 배포를 막지 않는다.
//                                 대신 계속 보이게 해서 0으로 줄여 나간다.
//   · 새로 생긴 문제(regression) — 이번 변경이 만든 것이므로 배포를 막는다.
//
// 이 파일은 그 판정 규칙(순수 함수)만 검증한다. 네트워크 0, DB 0.
// 라이브 실행/게이트 오케스트레이션은 scripts/verifyRelease.mjs 담당.
//
// 실행: node scripts/testReleaseGate.mjs   (npm run verify:release-gate)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as gate from './lib/releaseGate.mjs'

const { EMPTY_BASELINE, baselineKey, normalizeBaseline, diffAgainstBaseline, summarizeGates } = gate

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const src = (p) => readFileSync(path.resolve(p), 'utf8')
const codeOnly = (t) => t.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')

// 헬스체크(studentHealthCheck.mjs --json)의 students[] 항목 형태
const S = (name, studentId, status, codes = [], warnings = []) => ({ name, studentId, status, codes, warnings })

console.log('\n=== 1절. 모듈 계약 ===')
check('필요한 함수/상수가 전부 export 된다',
  [baselineKey, normalizeBaseline, diffAgainstBaseline, summarizeGates].every((f) => typeof f === 'function')
  && !!EMPTY_BASELINE)
check('baselineKey 는 학생id + 코드 접두로만 키를 만든다(detail 은 제외)',
  typeof baselineKey === 'function'
  && baselineKey('s1', 'WORDS_ZERO:단어0개') === baselineKey('s1', 'WORDS_ZERO:단어3개'),
  `${baselineKey?.('s1', 'WORDS_ZERO:단어0개')} vs ${baselineKey?.('s1', 'WORDS_ZERO:단어3개')}`)
check('서로 다른 코드는 다른 키', baselineKey('s1', 'WORDS_ZERO') !== baselineKey('s1', 'GHOST_UNIT'))
check('서로 다른 학생은 다른 키', baselineKey('s1', 'WORDS_ZERO') !== baselineKey('s2', 'WORDS_ZERO'))

console.log('\n=== 2절. 전원 PASS — 게이트 통과 ===')
{
  const r = diffAgainstBaseline([S('Irene', 's1', 'PASS'), S('John', 's2', 'PASS')], EMPTY_BASELINE)
  check('regressions 0건', r.regressions.length === 0)
  check('ok === true', r.ok === true)
  check('known 0건 / fixed 0건', r.known.length === 0 && r.fixed.length === 0)
}

console.log('\n=== 3절. 새 FAIL 은 회귀로 배포를 막는다 (핵심) ===')
{
  const r = diffAgainstBaseline(
    [S('Irene', 's1', 'PASS'), S('Song', 's2', 'FAIL', ['WORDS_ZERO:단어0개'])],
    EMPTY_BASELINE)
  check('regressions 1건', r.regressions.length === 1, JSON.stringify(r.regressions))
  check('회귀 항목에 학생 이름과 코드가 담긴다',
    r.regressions[0]?.name === 'Song' && String(r.regressions[0]?.code).startsWith('WORDS_ZERO'))
  check('ok === false → 게이트 FAIL', r.ok === false)
}

console.log('\n=== 4절. baseline 에 이미 있던 문제는 배포를 막지 않는다 (핵심) ===')
{
  const base = normalizeBaseline({ entries: [{ studentId: 's2', code: 'WORDS_ZERO' }] })
  const r = diffAgainstBaseline([S('Song', 's2', 'FAIL', ['WORDS_ZERO:단어0개'])], base)
  check('known 1건', r.known.length === 1, JSON.stringify(r.known))
  check('regressions 0건', r.regressions.length === 0)
  check('ok === true → 배포 허용', r.ok === true)
}
{
  // detail 문자열은 단어 수처럼 값이 흔들리므로 키에 넣지 않는다.
  const base = normalizeBaseline({ entries: [{ studentId: 's2', code: 'WORDS_ZERO:단어0개' }] })
  const r = diffAgainstBaseline([S('Song', 's2', 'FAIL', ['WORDS_ZERO:단어5개'])], base)
  check('detail 이 달라져도 같은 코드면 known 으로 인정', r.known.length === 1 && r.ok === true)
}

console.log('\n=== 5절. baseline 이 다른 문제를 가려주지 않는다 (가림 방지) ===')
{
  const base = normalizeBaseline({ entries: [{ studentId: 's2', code: 'WORDS_ZERO' }] })
  const r = diffAgainstBaseline([S('Song', 's2', 'FAIL', ['WORDS_ZERO:단어0개', 'GHOST_UNIT:유령'])], base)
  check('같은 학생의 새 코드는 회귀로 잡힌다',
    r.regressions.length === 1 && String(r.regressions[0].code).startsWith('GHOST_UNIT'),
    JSON.stringify(r.regressions))
  check('ok === false', r.ok === false)
}
{
  const base = normalizeBaseline({ entries: [{ studentId: 's2', code: 'WORDS_ZERO' }] })
  const r = diffAgainstBaseline(
    [S('Song', 's2', 'FAIL', ['WORDS_ZERO:x']), S('새학생', 's9', 'FAIL', ['WORDS_ZERO:x'])], base)
  check('다른 학생의 같은 코드는 회귀로 잡힌다(학생별 구분)',
    r.regressions.length === 1 && r.regressions[0].name === '새학생')
}

console.log('\n=== 6절. 고쳐진 baseline 항목은 fixed 로 보고(정리 유도) ===')
{
  const base = normalizeBaseline({ entries: [
    { studentId: 's2', code: 'WORDS_ZERO' },
    { studentId: 's3', code: 'GHOST_UNIT' },
  ] })
  const r = diffAgainstBaseline([S('Song', 's2', 'PASS'), S('Dain', 's3', 'PASS')], base)
  check('fixed 2건', r.fixed.length === 2, JSON.stringify(r.fixed))
  check('fixed 는 게이트를 막지 않는다', r.ok === true)
}

console.log('\n=== 7절. WARN 은 배포를 막지 않는다 ===')
{
  const r = diffAgainstBaseline([S('X', 's1', 'WARN', [], ['DIRECTION_RANDOM:반'])], EMPTY_BASELINE)
  check('WARN 은 regression 이 아니다', r.regressions.length === 0 && r.ok === true)
  check('WARN 은 warnings 로 별도 보고', Array.isArray(r.warnings) && r.warnings.length === 1)
}

console.log('\n=== 8절. 방어 — 잘못된 입력에도 throw 하지 않는다 ===')
for (const bad of [null, undefined, {}, { entries: 'nope' }, { entries: [null, 3] }]) {
  check(`normalizeBaseline(${JSON.stringify(bad)}) throw 없음`,
    (() => { try { normalizeBaseline(bad); return true } catch { return false } })())
}
for (const bad of [null, undefined, 'nope', [null, 1]]) {
  check(`diffAgainstBaseline(${JSON.stringify(bad)}) throw 없음`,
    (() => { try { const r = diffAgainstBaseline(bad, EMPTY_BASELINE); return typeof r?.ok === 'boolean' } catch { return false } })())
}
check('빈 baseline 은 아무 FAIL 도 알려진 것으로 만들지 않는다',
  diffAgainstBaseline([S('X', 's1', 'FAIL', ['WORDS_ZERO'])], EMPTY_BASELINE).ok === false)

console.log('\n=== 9절. summarizeGates — 하나라도 실패면 전체 실패 ===')
{
  check('전부 통과 → ok true',
    summarizeGates([{ name: 'build', ok: true }, { name: 'verify:all', ok: true }, { name: 'health', ok: true }]).ok === true)
  check('하나 실패 → ok false',
    summarizeGates([{ name: 'build', ok: true }, { name: 'verify:all', ok: false }, { name: 'health', ok: true }]).ok === false)
  check('실패한 게이트 이름을 돌려준다',
    summarizeGates([{ name: 'build', ok: true }, { name: 'health', ok: false }]).failed.join() === 'health')
  check('빈 입력에도 throw 없음',
    (() => { try { return typeof summarizeGates(null)?.ok === 'boolean' } catch { return false } })())
}

console.log('\n=== 10절. verifyRelease.mjs 배선 (정적 검사) ===')
{
  const t = codeOnly(src('scripts/verifyRelease.mjs'))
  check('Gate 1 — npm run build 를 실행한다', /npm[^\n]*run[^\n]*build/.test(t))
  check('Gate 2 — verify:all 을 실행한다', /verify:all/.test(t))
  check('Gate 3 — studentHealthCheck 를 --json 으로 실행한다',
    /studentHealthCheck\.mjs/.test(t) && /--json/.test(t))
  check('Gate 3 — --require-env 로 자격증명 부재를 조용한 통과로 만들지 않는다',
    /--require-env/.test(t))
  check('releaseGate 순수 모듈을 재사용한다(판정 로직 중복 금지)',
    /from\s+['"]\.\/lib\/releaseGate\.mjs['"]/.test(t))
  // 통과면 0, 실패면 1로 끝나야 한다(CI/Vercel 이 exit code 로만 판단한다).
  check('실패 시 exit code 1 로 끝난다', /process\.exit\([^)]*\?\s*0\s*:\s*1[^)]*\)/.test(t))
  check('exit code 를 항상 명시한다(암묵적 0 종료 금지)', /process\.exit\(/.test(t))
  check('DB 쓰기 경로가 없다(PATCH/POST/PUT/DELETE 문자열 0)',
    !/method:\s*['"](PATCH|POST|PUT|DELETE)['"]/i.test(t))
  check('앱 소스(src/)를 import 하지 않는다', !/from\s+['"]\.\.\/src\//.test(t))
}

console.log('\n=== 11절. 기존 흐름 무변경 회귀 잠금 ===')
{
  const pkg = JSON.parse(src('package.json'))
  check('verify:all 스크립트가 기존 그대로', pkg.scripts['verify:all'] === 'node tests/harness/runAll.mjs')
  check('build 스크립트가 기존 그대로', pkg.scripts.build === 'vite build')
  check('health:students 가 기존 그대로', pkg.scripts['health:students'] === 'node scripts/studentHealthCheck.mjs')
  check('verify:release 가 등록돼 있다', typeof pkg.scripts['verify:release'] === 'string')
  check('verify:release-gate(순수 테스트)가 등록돼 있다', typeof pkg.scripts['verify:release-gate'] === 'string')
  check('health:baseline 이 등록돼 있다', typeof pkg.scripts['health:baseline'] === 'string')
  check('releaseGate 순수 모듈에 네트워크/DB import 가 없다',
    !/supabase|createClient|node:fs|fetch\s*\(/.test(codeOnly(src('scripts/lib/releaseGate.mjs'))))
}

console.log('\n=== 12절. GitHub Actions 워크플로 (정적 검사) ===')
// 2026-08-26 — CI 연결. 기존 deploy.yml(GitHub Pages, workflow_dispatch 전용)은
// 한 글자도 건드리지 않고 별도 파일로 추가한다.
//
// 중요한 사실: Vercel 은 Git 연동으로 main push 를 직접 감시하므로 Actions 가
// 빨간불이어도 배포 자체를 막지 못한다(handoff.md:887 확정 기록). 그래서
// 이 워크플로는 "PR/푸시에서 회귀를 드러내고, needs: 체인으로 후속 단계를
// 차단"하는 역할이며, 실제 배포 차단은 main 브랜치 보호 규칙이 이 체크를
// required 로 요구할 때 성립한다 — 그 사실을 파일 안에 명시해 둔다.
{
  const WF = '.github/workflows/release-gate.yml'
  const y = src(WF)
  check('release-gate.yml 이 존재한다', y.length > 0)
  check('PR 과 main push 에서 실행된다',
    /pull_request:/.test(y) && /push:/.test(y) && /branches:\s*\[\s*main\s*\]/.test(y))
  check('npm run verify:release 를 실행한다', /npm run verify:release/.test(y))
  // 2026-08-27 — 게이트를 3개 단계로 분리한다. 한 단계로 묶으면 실패했을 때
  // "npm run verify:release 실패"만 남고 어느 게이트인지 알 수 없다(실제로
  // run 33041427809 에서 겪었다: 27초 만에 죽었는데 build/verify:all/health 중
  // 무엇인지 특정하지 못했다). 단계 이름이 곧 진단이 되게 한다.
  check('Gate 1 이 독립 단계로 분리돼 있다', /name:\s*Gate 1[^\n]*build/.test(y))
  check('Gate 2 가 독립 단계로 분리돼 있다', /name:\s*Gate 2[^\n]*verify:all/.test(y))
  check('Gate 3 이 독립 단계로 분리돼 있다', /name:\s*Gate 3[^\n]*health/i.test(y))
  check('Gate 1 은 npm run build 를 직접 실행한다', /npm run build/.test(y))
  check('Gate 2 는 npm run verify:all 을 직접 실행한다', /npm run verify:all/.test(y))
  check('Gate 3 은 verify:release 의 health 만 돌린다(--skip-build --skip-verify)',
    /verify:release[^\n]*--skip-build[^\n]*--skip-verify/.test(y))
  // 로그 다운로드는 인증이 필요해 API 로 못 읽는다(403). 반면 annotation 은
  // 공개 API 로 읽힌다 — 실패 시 출력 꼬리를 annotation 으로 띄워 로그 없이도
  // 원인을 볼 수 있게 한다.
  check('실패 시 ::error:: annotation 으로 출력 꼬리를 노출한다',
    /::error title=/.test(y) && (y.match(/::error title=/g) || []).length >= 3)
  check('파이프 실패가 삼켜지지 않도록 pipefail 을 켠다', /set -[a-z]*o pipefail|set -o pipefail/.test(y))
  check('진단용 환경 정보 단계가 있다(node/npm 버전 등)', /Environment info|node --version/.test(y))
  check('Supabase 자격증명을 secrets 로 주입한다',
    /secrets\.VITE_SUPABASE_URL/.test(y) && /secrets\.VITE_SUPABASE_ANON_KEY/.test(y))
  check('후속 잡이 needs 로 게이트에 묶여 있다(실패 시 진행 불가)', /needs:\s*release-gate/.test(y))
  check('npm ci 로 의존성을 고정 설치한다', /npm ci/.test(y))
  check('타임아웃이 설정돼 있다(무한 대기 방지)', /timeout-minutes:/.test(y))
  check('권한이 읽기 전용으로 제한돼 있다', /permissions:/.test(y) && /contents:\s*read/.test(y))
  check('DB 쓰기/마이그레이션 명령이 없다',
    !/(psql|supabase\s+db|migrate|drop\s+table|insert\s+into)/i.test(y))
  check('배포 명령이 없다(이 워크플로는 검증 전용)',
    !/(vercel\s+deploy|actions\/deploy-pages|npm\s+publish|gh\s+release)/i.test(y))
  check('Vercel 이 Actions 로 막히지 않는다는 사실이 파일에 명시돼 있다',
    /브랜치 보호|branch protection/i.test(y) && /Vercel/.test(y))
}
{
  // 기존 배포 워크플로 무변경 잠금 — 이번 작업이 절대 건드리면 안 된다.
  const d = src('.github/workflows/deploy.yml')
  check('deploy.yml 이 여전히 GitHub Pages 용이다', /Deploy to GitHub Pages/.test(d))
  check('deploy.yml 이 여전히 workflow_dispatch 전용(자동 트리거 없음)',
    /workflow_dispatch:/.test(d) && !/^\s{2}push:/m.test(d) && !/^\s{2}pull_request:/m.test(d))
  check('deploy.yml 에 release gate 를 끼워 넣지 않았다', !/verify:release/.test(d))
}

console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('ALL PASS')
