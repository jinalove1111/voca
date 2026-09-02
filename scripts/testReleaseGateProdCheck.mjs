// Release Gate — Phase 10 CI 통합: prod:check(Gate 3b) / prod:hotfix WRITE-DISABLED
// 증명(Gate 4) 정적 검사 (2026-09-03, Track 8)
//
// 목적: .github/workflows/release-gate.yml 에 추가되는 두 게이트가
//   (a) READ-ONLY 프로덕션 안전 하네스(prod:check)를 --require-env 로 실행해
//       "검증 못 함이 조용한 통과가 되지 않게" 하고,
//   (b) prod:hotfix 를 가짜 SUPABASE_ACCESS_TOKEN + CI=true 로 실행해 매
//       실행마다 "write path 가 코드상 도달 불가"임을 증명하는지
// 를 네트워크 0 으로, 워크플로 YAML 텍스트와 scripts/prodHotfix.mjs 소스에
// 대한 문자열/정규식 단언만으로 검증한다. 실제 GitHub Actions 실행 없음,
// 라이브 Supabase 호출 없음(이 트랙은 네트워크 0 제약).
//
// 이 파일이 소유하는 검증 대상: .github/workflows/release-gate.yml 의
// Gate 3b/4 두 스텝 + Deploy Ready 잡의 무배포 상태. scripts/prodCheck.mjs·
// scripts/prodHotfix.mjs·scripts/lib/* 자체의 동작 검증은 각각의 기존
// 테스트(scripts/testProdHotfix.mjs 등, 다른 트랙 소유)가 담당하므로 여기서는
// "그 스크립트들을 워크플로가 올바른 플래그로 배선했는가"만 본다.
//
// 실행: node scripts/testReleaseGateProdCheck.mjs
// (이 트랙은 package.json/tests/harness/registry.mjs 를 소유하지 않으므로
//  npm 스크립트/verify:all 등록은 하지 않는다 — 필요 시 registry 소유 트랙이
//  등록한다.)
import { readFileSync } from 'node:fs'
import path from 'node:path'

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const src = (p) => readFileSync(path.resolve(p), 'utf8')

const WF_PATH = '.github/workflows/release-gate.yml'
const y = src(WF_PATH)

console.log('\n=== 1절. Gate 3b — prod:check (READ-ONLY) 스텝 배선 ===')
{
  check('Gate 3b 스텝이 존재한다', /name:\s*Gate 3b[^\n]*/i.test(y))
  const gate3bBlock = (y.match(/name:\s*Gate 3b[\s\S]*?(?=\n {6}- name:|\njobs:|$)/i) || [''])[0]
  check('Gate 3b 블록을 추출할 수 있다(스텝 경계 인식)', gate3bBlock.length > 0)
  check('Gate 3b 는 npm run prod:check 를 실행한다', /npm run prod:check/.test(gate3bBlock))
  check('Gate 3b 는 --require-env 를 쓴다(자격증명 부재를 조용한 SKIP 이 아니라 FAIL 로)',
    /--require-env/.test(gate3bBlock))
  check('Gate 3b 는 --json 으로 구조화 출력을 받는다', /--json/.test(gate3bBlock))
  check('Gate 3b 는 --report-dir 로 리포트를 저장한다(요약 추출용)', /--report-dir/.test(gate3bBlock))
  check('Gate 3b 는 Supabase anon 자격증명을 secrets 로 주입한다',
    /secrets\.VITE_SUPABASE_URL/.test(gate3bBlock) && /secrets\.VITE_SUPABASE_ANON_KEY/.test(gate3bBlock))
  check('Gate 3b 는 GITHUB_STEP_SUMMARY 에 요약을 append 한다',
    /GITHUB_STEP_SUMMARY/.test(gate3bBlock))
  // 학생 이름/유닛명 등 원문은 prodCheck.mjs --json 출력에서 마스킹되지
  // 않는다(health.results[].name 등) — 그래서 요약 블록은 findings/results
  // 배열을 순회하지 않고 summary 카운트(health.summary/invariants.summary/
  // ux.*Count)만 뽑아야 한다. "results[" 나 "findings[" 같은 배열 인덱싱을
  // 직접 순회하는 코드가 섞여 있지 않은지는 최소한 배열 반복 키워드
  // (map/forEach/for...of) 가 results/findings 뒤에 바로 붙어 있지 않은지로
  // 근사 검증한다.
  check('Gate 3b 요약은 개별 findings/results 를 순회하지 않는다(카운트만, 이름 미노출)',
    !/(results|findings)\s*\.\s*(map|forEach)/.test(gate3bBlock)
    && !/for\s*\([^)]*of[^)]*\.(results|findings)/.test(gate3bBlock))
  check('Gate 3b 는 실패 시 ::error:: annotation 을 남긴다', /::error title=/.test(gate3bBlock))
  check('--expect-ref 미사용 이유(비밀에 ref 없음)와 VITE_SUPABASE_URL 이 대상 ref 라는 사실이 주석에 있다',
    /expect-ref/.test(y) && /VITE_SUPABASE_URL/.test(y))
}

console.log('\n=== 2절. Gate 4 — WRITE-DISABLED PROOF 스텝 배선 ===')
{
  check('Gate 4 스텝이 존재한다', /name:\s*Gate 4[^\n]*/i.test(y))
  const gate4Block = (y.match(/name:\s*Gate 4[\s\S]*?(?=\n {6}- name:|\njobs:|$)/i) || [''])[0]
  check('Gate 4 블록을 추출할 수 있다(스텝 경계 인식)', gate4Block.length > 0)
  check('Gate 4 는 prodHotfix.mjs 를 직접 실행한다(npm 헤더로 JSON 오염 방지)',
    /node\s+scripts\/prodHotfix\.mjs/.test(gate4Block))
  check('Gate 4 는 --dry-run 을 쓴다', /--dry-run/.test(gate4Block))
  check('Gate 4 는 --env production 을 쓴다', /--env\s+production/.test(gate4Block))
  check('Gate 4 는 실제 manifest 픽스처(ghost-unit-landing-20260902)를 쓴다',
    /ghost-unit-landing-20260902/.test(gate4Block))
  check('Gate 4 는 가짜 SUPABASE_ACCESS_TOKEN 을 주입한다(실제 토큰 시크릿 아님)',
    /SUPABASE_ACCESS_TOKEN:\s*ci-fake-token-must-never-be-used/.test(gate4Block))
  check('Gate 4 는 CI=true 를 명시한다(write path 비활성 경로 강제 확인)',
    /CI:\s*['"]?true['"]?/.test(gate4Block))
  check('Gate 4 는 exit code 를 0 또는 1(preflight-mismatch)만 정상으로 취급한다',
    /-gt\s+1/.test(gate4Block) || /!=\s*0[\s\S]*!=\s*1/.test(gate4Block) || /RC.*[>].*1/.test(gate4Block))
  check('Gate 4 는 "DB WRITE: 0" 문자열 증명을 확인한다', /DB WRITE: 0/.test(gate4Block))
  check('Gate 4 는 report status 가 ready-to-apply/preflight-mismatch 인지 확인한다',
    /ready-to-apply/.test(gate4Block) && /preflight-mismatch/.test(gate4Block))
  check('Gate 4 는 가짜 토큰 문자열이 산출물에 남지 않는지 grep 으로 증명한다(redaction)',
    /grep[^\n]*ci-fake-token-must-never-be-used/.test(gate4Block))
  check('Gate 4 는 검증 실패 시 ::error:: annotation 을 남긴다', /::error title=/.test(gate4Block))
}

console.log('\n=== 3절. 실제 프로덕션 시크릿을 새로 끌어오지 않는다(회귀 방지) ===')
{
  check('워크플로 어디에도 secrets.SUPABASE_ACCESS_TOKEN 참조가 없다(항상 가짜 토큰만 사용)',
    !/secrets\.SUPABASE_ACCESS_TOKEN/.test(y))
  check('워크플로 어디에도 secrets.SUPABASE_SERVICE_ROLE_KEY 참조가 없다(service_role 미노출)',
    !/secrets\.SUPABASE_SERVICE_ROLE_KEY/.test(y))
  check('기존 Gate 1/2/3 이름/순서가 그대로 남아 있다(회귀 없음)',
    /name:\s*Gate 1[^\n]*build/.test(y)
    && /name:\s*Gate 2[^\n]*verify:all/.test(y)
    && /name:\s*Gate 3(?!b)[^\n]*health/i.test(y))
}

console.log('\n=== 4절. Deploy Ready 잡은 여전히 배포하지 않는다 ===')
{
  const deployBlock = (y.match(/deploy-ready:[\s\S]*$/) || [''])[0]
  check('Deploy Ready 잡을 추출할 수 있다', deployBlock.length > 0)
  check('Deploy Ready 잡이 release-gate 에 needs 로 묶여 있다(Gate 3b/4 를 우회할 수 없음)',
    /needs:\s*release-gate/.test(deployBlock))
  check('Deploy Ready 잡에 배포/DB 쓰기 명령이 없다(echo 만)',
    !/(vercel\s+deploy|actions\/deploy-pages|npm\s+publish|gh\s+release|supabase\s+db|psql|prodHotfix|APPLY )/i.test(deployBlock))
  check('Deploy Ready 잡의 run 블록은 echo 로만 구성돼 있다',
    (deployBlock.match(/run:\s*\|([\s\S]*?)(?=\n {6}- name:|$)/) || ['', ''])[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .every((l) => l.startsWith('echo') || l === ''))
}

console.log('\n=== 5절. scripts/prodHotfix.mjs — CI/write-path 비활성 순서(정적, 회귀 재발 방지) ===')
{
  const hf = src('scripts/prodHotfix.mjs')
  const idxGithubActions = hf.indexOf('GITHUB_ACTIONS')
  const idxCiForcedAssign = hf.indexOf('const ciForced')
  const idxStopBlock = hf.indexOf('options.dryRun || ciForced || noToken')
  const idxExecutorCreate = hf.indexOf('D.createExecutor(')
  const idxExecutorCall = hf.indexOf('options.executor || D.createExecutor(')

  check('GITHUB_ACTIONS 감지 코드가 존재한다', idxGithubActions >= 0)
  check('ciForced 할당 코드가 존재한다', idxCiForcedAssign >= 0)
  check('dry-run/CI/토큰없음 STOP 분기가 존재한다', idxStopBlock >= 0)
  check('executor 생성 호출부가 존재한다', idxExecutorCreate >= 0 && idxExecutorCall >= 0)

  check('GITHUB_ACTIONS 감지가 executor 생성보다 코드상 앞서 있다(write path 도달 전에 CI 판정 완료)',
    idxGithubActions >= 0 && idxExecutorCreate >= 0 && idxGithubActions < idxExecutorCreate)
  check('ciForced 할당이 executor 생성보다 앞서 있다',
    idxCiForcedAssign >= 0 && idxExecutorCreate >= 0 && idxCiForcedAssign < idxExecutorCreate)
  check('dry-run/CI/토큰없음 STOP 분기가 executor 생성보다 앞서 있다(가짜 토큰이 있어도 STOP 이 먼저 실행됨)',
    idxStopBlock >= 0 && idxExecutorCall >= 0 && idxStopBlock < idxExecutorCall)
}

console.log('\n=== 6절. verifyRelease.mjs 는 이 트랙 범위 밖(Gate 3b/4 는 워크플로 전용) ===')
{
  const vr = src('scripts/verifyRelease.mjs')
  check('verifyRelease.mjs 헤더 주석에 Gate 3b/4 가 CI 워크플로 전용임이 기록돼 있다(로컬 verify:release 는 확장하지 않음)',
    /Gate 3b|Gate 4/.test(vr))
}

console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('ALL PASS')
