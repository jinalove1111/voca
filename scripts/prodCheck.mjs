// Production Safety Harness — 1단계 A: prod:check (2026-09-03)
//
// ★ READ-ONLY 보장 ★
// GET 요청만 보낸다. 이 스크립트에는 PATCH/POST/PUT/DELETE 경로가 없다.
// anon key 로만 조회한다 — service_role key 는 이 스크립트 어디에도 없다.
//
// 이 스크립트는 두 가지 판정을 합친다:
//   (a) 학생별 health 규칙 — scripts/lib/studentHealthRules.mjs 의
//       evaluateStudent()(로그인→반→교재→유닛→단어→방향 체인, 학생 1명 관점)
//   (b) 크로스 테이블 invariants — scripts/lib/prodInvariants.mjs 의
//       evaluateInvariants()(여러 학생/유닛에 걸친 정합성, 저장소 전체 관점)
// 둘 다 순수 판정 함수라 여기서는 조회·집계·출력·exit code 만 담당한다.
//
// 사용법:
//   node scripts/prodCheck.mjs                              라이브 조회(anon)
//   node scripts/prodCheck.mjs --json                        JSON 출력
//   node scripts/prodCheck.mjs --fixture <file>               네트워크 0, 파일의 { data } 로 대체
//   node scripts/prodCheck.mjs --report-dir <dir>             리포트 저장 경로(기본 scripts/.tmp/prod-reports)
//   node scripts/prodCheck.mjs --expect-ref <ref>              projectRef 불일치 시 exit 2
//   node scripts/prodCheck.mjs --require-env                  .env 없으면 SKIP 대신 FAIL(exit 1)
//
// exit code: invariants 또는 health 에 FAIL 이 하나라도 있으면 1, ref 불일치면 2, 아니면 0.
//   .env 가 없고 --fixture 도 없으면 기본은 SKIP(exit 0) — studentHealthCheck.mjs 와 동일한
//   "검증 못 함이 조용한 PASS 가 되지 않게" 원칙(CLAUDE.md 규칙 18)을 --require-env 로 지킨다.
//
// Node 24 + Windows 에서 esbuild/fetch 와 겹쳐 process.exit()가 크래시하는
// 사례가 이 저장소에 있었다(102차 발견) — 그래서 여기서는 process.exitCode 만
// 쓰고 자연 종료시킨다.
import fs from 'node:fs'
import path from 'node:path'
import { buildContext, evaluateStudent, classifyAccount, summarize } from './lib/studentHealthRules.mjs'
import { loadSupabaseEnv, loadProductionSnapshot } from './lib/prodDataLoader.mjs'
import { buildInvariantContext, evaluateInvariants } from './lib/prodInvariants.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const AS_JSON = flag('--json')
const REQUIRE_ENV = flag('--require-env')
const FIXTURE_PATH = opt('--fixture')
const REPORT_DIR = opt('--report-dir') || path.join('scripts', '.tmp', 'prod-reports')
const EXPECT_REF = opt('--expect-ref')

const log = (...a) => { if (!AS_JSON) console.log(...a) }

function runIdOf(now = new Date()) {
  const iso = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) // YYYYMMDDHHmmss
  const rand = Math.random().toString(36).slice(2, 6)
  return `${iso}-${rand}`
}

function writeReport(payload) {
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true })
    const file = path.join(REPORT_DIR, `${runIdOf()}.prodcheck.json`)
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    return file
  } catch (err) {
    log(`  [주의] 리포트 저장 실패: ${err?.message || err}`)
    return null
  }
}

async function main() {
  let data
  let envInfo = { host: null, projectRef: null, source: null }

  if (FIXTURE_PATH) {
    let raw
    try {
      raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
    } catch (err) {
      console.error(`FAIL — 픽스처를 읽을 수 없습니다(${FIXTURE_PATH}): ${err?.message || err}`)
      process.exitCode = 1
      return
    }
    data = raw?.data
    if (!data) {
      console.error(`FAIL — 픽스처 형식이 { data: {...} } 가 아닙니다(${FIXTURE_PATH})`)
      process.exitCode = 1
      return
    }
    envInfo = { host: null, projectRef: data.projectRef || 'fixture', source: 'fixture' }
  } else {
    const supa = loadSupabaseEnv()
    if (!supa) {
      const msg = 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없어 라이브 검사를 할 수 없습니다.'
      if (REQUIRE_ENV) { console.error(`FAIL — ${msg} (--require-env)`); process.exitCode = 1; return }
      console.log(`SKIP — ${msg}`)
      process.exitCode = 0
      return
    }
    let host = null
    try { host = new URL(supa.base).hostname } catch { /* ignore */ }
    envInfo = { host, projectRef: supa.projectRef, source: 'live' }

    if (EXPECT_REF && supa.projectRef !== EXPECT_REF) {
      console.error(`FAIL — 환경 불일치: --expect-ref ${EXPECT_REF} 인데 실제 projectRef 는 ${supa.projectRef || '(알수없음)'} 입니다.`)
      process.exitCode = 2
      return
    }

    try {
      data = await loadProductionSnapshot(supa)
    } catch (err) {
      const msg = String(err?.message || err)
      if (AS_JSON) console.log(JSON.stringify({ ok: false, infraError: msg }, null, 2))
      else console.error(`\nFAIL — 라이브 조회 실패(학생 문제 아님): ${msg}`)
      process.exitCode = 1
      return
    }
  }

  // 픽스처 모드에서도 --expect-ref 를 지원한다(회귀 테스트가 "환경 불일치 시
  // 즉시 exit 2"를 네트워크 없이 검증할 수 있어야 하므로).
  if (FIXTURE_PATH && EXPECT_REF && envInfo.projectRef !== EXPECT_REF) {
    console.error(`FAIL — 환경 불일치: --expect-ref ${EXPECT_REF} 인데 픽스처 projectRef 는 ${envInfo.projectRef} 입니다.`)
    process.exitCode = 2
    return
  }

  const ctx = buildContext(data)
  const invCtx = buildInvariantContext(data)

  const students = Array.isArray(data.students) ? data.students : []
  const realStudents = students.filter((s) => s && classifyAccount(s, ctx) === 'REAL')
  const healthResults = realStudents.map((s) => evaluateStudent(s, ctx))
  const healthSummary = summarize(healthResults)

  const { findings, summary: invariantsSummary } = evaluateInvariants(invCtx)

  const overallFail = healthSummary.fail > 0 || invariantsSummary.fail > 0
  const overallWarn = !overallFail && (healthSummary.warn > 0 || invariantsSummary.warn > 0)
  const verdict = overallFail ? 'FAIL' : (overallWarn ? 'WARN' : 'PASS')

  const report = {
    runAt: new Date().toISOString(),
    env: { host: envInfo.host, projectRef: envInfo.projectRef, source: envInfo.source },
    verdict,
    health: { summary: healthSummary, results: healthResults },
    invariants: { summary: invariantsSummary, findings },
    dbWrite: 0,
  }
  const reportFile = writeReport(report)

  if (AS_JSON) {
    console.log(JSON.stringify({ ...report, reportFile }, null, 2))
  } else {
    log('\n=== Production Check (READ-ONLY) ===')
    log(`환경: ${envInfo.source === 'fixture' ? '픽스처' : `host=${envInfo.host || '?'} ref=${envInfo.projectRef || '?'}`}`)
    log(`대상 실학생 ${realStudents.length}명\n`)

    const healthProblems = healthResults.filter((r) => r.status !== 'PASS')
    if (healthProblems.length) {
      log('--- health 문제 학생 ---')
      for (const r of healthProblems) {
        const reason = r.codes.length ? r.codes.join(' | ') : r.warnings.join(' | ')
        log(`  [${r.status}] ${r.name}: ${reason}`)
      }
    } else {
      log('--- health: 문제 없음 ---')
    }

    if (findings.length) {
      log('\n--- invariants 발견 사항 ---')
      const order = { FAIL: 0, WARN: 1 }
      for (const f of [...findings].sort((a, b) => order[a.severity] - order[b.severity])) {
        log(`  [${f.severity}] ${f.code} ${f.studentName ? `(${f.studentName})` : '(유닛)'}: ${f.detail}`)
      }
    } else {
      log('\n--- invariants: 발견 사항 없음 ---')
    }

    log(`\n${'='.repeat(60)}`)
    log(`PROD CHECK: ${verdict} — health PASS ${healthSummary.pass} / WARN ${healthSummary.warn} / FAIL ${healthSummary.fail}`
      + ` · invariants FAIL ${invariantsSummary.fail} / WARN ${invariantsSummary.warn}`)
    log('DB WRITE: 0 (이 스크립트는 GET 만 보냅니다)')
    if (reportFile) log(`리포트: ${reportFile}`)
  }

  process.exitCode = overallFail ? 1 : 0
}

await main()
