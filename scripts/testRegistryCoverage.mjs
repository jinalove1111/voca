// scripts/testRegistryCoverage.mjs — registry 커버리지 결정론 린트
// (2026-09-09 야간 QA)
//
// 배경: 이 저장소는 "scripts/testX.mjs를 만들고 검증까지 끝냈는데
// tests/harness/registry.mjs에 등록을 깜빡해 verify:all/CI가 그 파일을
// 영원히 실행하지 않는" 사고가 반복됐다(testGardenGrowthFlow.mjs/
// testGamificationInvariants.mjs/testStdoutFlushOnExit.mjs 등, 각 파일
// 등록 커밋 메시지에 "야간 하네스 감사에서 발견" 기록 참고 — 전부 사후
// 발견이었다). 이 스크립트는 그 감사를 코드로 고정해 앞으로는 사람이
// 매번 전수조사하지 않아도 되게 한다.
//
// 규칙: scripts/ 아래(worktree 사본 제외)의 모든 test*.mjs 파일은
//   (1) tests/harness/registry.mjs의 어느 도메인 checks[].script로
//       참조되고 있거나,
//   (2) 아래 ALLOWLIST에 사유와 함께 명시돼 있어야 한다(라이브 전용/
//       수동 실행/프로토타입 등 registry 편입이 부적절한 경우).
// 둘 다 아니면 FAIL — "새 test 파일을 만들고 등록을 잊는" 사고를
// 커밋 시점이 아니라 생성 시점 가까이에서 잡아낸다.
//
// 추가로 registry.mjs가 참조하는 모든 scripts/test*.mjs 경로가 실제로
// 디스크에 존재하는지도 검증한다(리네임/삭제 후 등록 갱신 누락 방지 —
// 반대 방향의 드리프트).
//
// 순수 파일시스템 검사 + registry.mjs 모듈 import(BUILDERS/DOMAINS는
// 순수 데이터 export, 실행 시 부작용 없음). 네트워크 0, DB 0.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..')

let asserted = 0
let failures = 0
function check(label, cond, detail) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + String(detail) : ''}`); failures++ }
}

// ── ALLOWLIST ────────────────────────────────────────────────────────────
// registry에 편입하지 않은 scripts/test*.mjs 전부를 여기 명시한다. 항목이
// 여기 없고 registry에도 없으면 섹션 2가 FAIL한다.
const ALLOWLIST = {
  // 라이브 전용 수동 진단(고정 픽스처 없이 실제 프로덕션/특정 학생 데이터
  // 존재를 가정 — CI/오프라인 verify:all에서 결정론적으로 못 돌림, 운영자가
  // 필요할 때 직접 node scripts/testX.mjs로 실행하는 관례):
  'testTextbookExample.mjs': 'live — 특정 교재 라이브 데이터 존재를 전제한 수동 진단, 결정론적 CI 픽스처 없음',
  'testEdgeFunctionsE2E.mjs': 'live — Supabase Edge Functions 실배포 대상 e2e, 로컬/CI 오프라인 환경에서 결정론적 실행 불가',
  'testLegacyMultiClassLive.mjs': 'live — 특정 학생/반 라이브 데이터 존재를 전제한 수동 진단',
  'testLesson5Journey.mjs': 'live — 특정 학생(Lesson 5 시나리오) 라이브 데이터 존재를 전제한 수동 진단',
  'testMultiTextbookLive.mjs': 'live — 다중 교재 라이브 데이터 존재를 전제한 수동 진단',
  'testMultiTextbookLiveFixed.mjs': 'live — 위 스크립트의 수정판, 마찬가지로 라이브 데이터 전제 수동 진단',
  'testReadingLive.mjs': 'live — Reading Foundation 라이브 데이터 존재를 전제한 수동 진단(오프라인 계약은 tests/harness/runReading.mjs가 이미 registry에 등록돼 커버)',
  'testTextbookModelLive.mjs': 'live — 교재 모델 라이브 데이터 존재를 전제한 수동 진단',
  // 동시 작업 중인 다른 에이전트 소유(2026-09-09 야간 QA, src/utils/wordLibrary.js
  // 트랙) — 이 커밋 시점 기준 아직 registry 등록 전이라 임시 allowlist.
  // 그 트랙이 등록하면 이 두 줄은 제거돼야 한다(제거 안 하면 섹션 3이
  // "이미 등록됐는데 allowlist에도 남아있다"로 FAIL해 스스로 드러낸다).
  'testClassSettingsResilience.mjs': '등록 예정(follow-up commit) — 2026-09-09 야간 QA 동시 작업 트랙 소유, 이 세션은 파일 소유권 경계상 등록하지 않음',
  'testWordSlugParity.mjs': '등록 예정(follow-up commit) — 2026-09-09 야간 QA 동시 작업 트랙 소유, 이 세션은 파일 소유권 경계상 등록하지 않음',
}

// ── 1. registry.mjs에서 참조하는 scripts/test*.mjs 전부 수집 ─────────────
console.log('\n=== 1. registry.mjs 참조 스크립트 수집 + 존재 확인 ===')
const registryUrl = pathToFileURL(path.join(ROOT, 'tests/harness/registry.mjs')).href
const { DOMAINS } = await import(registryUrl)
check('registry.mjs에서 DOMAINS를 import할 수 있다', DOMAINS && typeof DOMAINS === 'object')

const registeredScripts = new Set()
const registeredButMissing = []
for (const [domainKey, domain] of Object.entries(DOMAINS)) {
  const checks = Array.isArray(domain.checks) ? domain.checks : []
  for (const c of checks) {
    if (typeof c.script !== 'string') continue
    registeredScripts.add(c.script)
    if (/^scripts\/test.*\.mjs$/.test(c.script)) {
      const full = path.join(ROOT, c.script)
      if (!fs.existsSync(full)) registeredButMissing.push(`${domainKey}: ${c.script}`)
    }
  }
}
check('registry에 등록된 scripts/test*.mjs 스크립트를 1개 이상 찾음(회귀 방지 — 0이면 이 검사 자체가 무의미)',
  [...registeredScripts].some((s) => /^scripts\/test.*\.mjs$/.test(s)))
check('registry가 참조하는 scripts/test*.mjs 경로는 전부 디스크에 실재한다(리네임/삭제 후 등록 갱신 누락 방지)',
  registeredButMissing.length === 0, registeredButMissing)

// ── 2. 디스크의 scripts/test*.mjs 전수(워크트리 사본 제외) ────────────────
console.log('\n=== 2. scripts/ 디렉터리 실제 test*.mjs 파일 전수 vs (registry ∪ allowlist) ===')
function listTestScripts(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.tmp') continue // 빌드 산출물 임시 디렉터리
    const full = path.join(dir, entry.name)
    const rel = path.relative(ROOT, full).split(path.sep).join('/')
    if (rel.includes('.claude/worktrees')) continue // 다른 워크트리 사본 무시(지시사항)
    if (entry.isDirectory()) {
      out.push(...listTestScripts(full))
    } else if (entry.isFile() && /^test.*\.mjs$/.test(entry.name)) {
      out.push(rel)
    }
  }
  return out
}
const diskScripts = listTestScripts(path.join(ROOT, 'scripts'))
check('scripts/ 아래에서 test*.mjs 파일을 1개 이상 찾음(회귀 방지)', diskScripts.length > 0, diskScripts.length)

const unaccountedFor = []
for (const rel of diskScripts) {
  const base = path.basename(rel)
  const inRegistry = registeredScripts.has(rel)
  const inAllowlist = Object.prototype.hasOwnProperty.call(ALLOWLIST, base)
  if (!inRegistry && !inAllowlist) unaccountedFor.push(rel)
}
check('scripts/의 모든 test*.mjs가 registry에 등록되어 있거나 allowlist에 사유와 함께 명시돼 있다',
  unaccountedFor.length === 0, unaccountedFor)

// ── 3. allowlist 항목이 실제로 존재하고, 이미 등록된 것을 allowlist에도
//      중복 기재하지 않았는지(드리프트 반대 방향) ─────────────────────────
console.log('\n=== 3. allowlist 자체의 정합성 ===')
const allowlistMissingOnDisk = []
const allowlistAlsoRegistered = []
for (const base of Object.keys(ALLOWLIST)) {
  const rel = `scripts/${base}`
  if (!fs.existsSync(path.join(ROOT, rel))) allowlistMissingOnDisk.push(base)
  if (registeredScripts.has(rel)) allowlistAlsoRegistered.push(base)
}
check('allowlist에 적힌 파일은 전부 실제로 디스크에 존재한다(허수 항목 방지)',
  allowlistMissingOnDisk.length === 0, allowlistMissingOnDisk)
check('allowlist 항목 중 이미 registry에도 등록된 것은 없다(등록 완료 후 allowlist 제거 누락 방지)',
  allowlistAlsoRegistered.length === 0, allowlistAlsoRegistered)
check('allowlist 각 항목에 빈 문자열이 아닌 사유가 있다',
  Object.values(ALLOWLIST).every((reason) => typeof reason === 'string' && reason.trim().length > 0))

console.log('\n' + '='.repeat(70))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) console.log('FAIL')
else console.log('ALL PASS')
process.exit(failures > 0 ? 1 : 0)
