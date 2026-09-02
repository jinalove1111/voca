// Production Safety Harness — 1단계 A: prod:check (2026-09-03)
// 2026-09-03 Phase 8 확장: invariant 8종 추가, 학습기록 baseline 옵션,
// 사람용 출력을 Critical/Needs review/Data debt 3단 요약으로 교체.
//
// ★ READ-ONLY 보장 ★
// GET/HEAD 요청만 보낸다. 이 스크립트에는 PATCH/POST/PUT/DELETE 경로가 없다.
// anon key 로만 조회한다 — service_role key 는 이 스크립트 어디에도 없다.
//
// 이 스크립트는 세 가지 판정/조회를 합친다:
//   (a) 학생별 health 규칙 — scripts/lib/studentHealthRules.mjs 의
//       evaluateStudent()(로그인→반→교재→유닛→단어→방향 체인, 학생 1명 관점)
//   (b) 크로스 테이블 invariants — scripts/lib/prodInvariants.mjs 의
//       evaluateInvariants()(여러 학생/유닛에 걸친 정합성, 저장소 전체 관점)
//   (c) (선택) 학습기록 baseline — scripts/lib/prodDataLoader.mjs 의
//       loadLearningBaseline()/diffLearningBaseline()(지정 학생의 학습기록
//       6종 테이블 행수 스냅샷/비교, --baseline-students/--compare-baseline)
// (a)(b)(c) 모두 순수 판정/로더 함수라 여기서는 조회·집계·출력·exit code 만
// 담당한다.
//
// 사용법:
//   node scripts/prodCheck.mjs                              라이브 조회(anon)
//   node scripts/prodCheck.mjs --json                        JSON 출력
//   node scripts/prodCheck.mjs --fixture <file>               네트워크 0, 파일의 { data } 로 대체
//   node scripts/prodCheck.mjs --report-dir <dir>             리포트 저장 경로(기본 scripts/.tmp/prod-reports)
//   node scripts/prodCheck.mjs --expect-ref <ref>              projectRef 불일치 시 exit 2
//   node scripts/prodCheck.mjs --require-env                  .env 없으면 SKIP 대신 FAIL(exit 1)
//   node scripts/prodCheck.mjs --show-names                   사람용+JSON 출력 모두 이름 마스킹 해제
//                                                              (CI/GITHUB_ACTIONS 환경이면 이 플래그를
//                                                              무시하고 항상 마스킹 — 2026-09-03 보안수정)
//   node scripts/prodCheck.mjs --baseline-students <id,id>     학습기록 baseline 저장(라이브 전용)
//   node scripts/prodCheck.mjs --compare-baseline <file>       저장된 baseline 과 지금 값을 비교 출력(라이브 전용)
//
// exit code: invariants 또는 health 에 FAIL 이 하나라도 있으면 1, ref 불일치면 2, 아니면 0.
//   .env 가 없고 --fixture 도 없으면 기본은 SKIP(exit 0) — studentHealthCheck.mjs 와 동일한
//   "검증 못 함이 조용한 PASS 가 되지 않게" 원칙(CLAUDE.md 규칙 18)을 --require-env 로 지킨다.
//   baseline 옵션(HEAD/GET 추가 조회)의 실패는 이 exit code 에 영향을 주지 않는다 —
//   구조적 invariant/health 판정과 별개의 보조 조사이기 때문(인프라 에러만 화면에 알림).
//
// Node 24 + Windows 에서 esbuild/fetch 와 겹쳐 process.exit()가 크래시하는
// 사례가 이 저장소에 있었다(102차 발견) — 그래서 여기서는 process.exitCode 만
// 쓰고 자연 종료시킨다.
import fs from 'node:fs'
import path from 'node:path'
import { buildContext, evaluateStudent, classifyAccount, summarize } from './lib/studentHealthRules.mjs'
import { loadSupabaseEnv, loadProductionSnapshot, loadLearningBaseline, diffLearningBaseline } from './lib/prodDataLoader.mjs'
import { buildInvariantContext, evaluateInvariants } from './lib/prodInvariants.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const AS_JSON = flag('--json')
const REQUIRE_ENV = flag('--require-env')
// 2026-09-03 보안수정(High) — 저장소가 PUBLIC 이라 GitHub Actions 로그가
// 누구나 볼 수 있다. --json 출력(사람용 텍스트뿐 아니라 stdout/보고서 파일
// 모두)의 학생 실명 마스킹을 기본값으로 바꾼다. CI 환경에서는 --show-names
// 를 넘겨도 무시하고 강제로 마스킹한다(공개 로그에 실수로 원본이 찍히는
// 사고를 코드 레벨에서 차단 — 사람이 플래그를 잘못 켜도 안전).
const IS_CI = !!(process.env.CI || process.env.GITHUB_ACTIONS)
const SHOW_NAMES = flag('--show-names') && !IS_CI
const FIXTURE_PATH = opt('--fixture')
const REPORT_DIR = opt('--report-dir') || path.join('scripts', '.tmp', 'prod-reports')
const EXPECT_REF = opt('--expect-ref')
const BASELINE_STUDENTS = opt('--baseline-students')
const COMPARE_BASELINE = opt('--compare-baseline')

const log = (...a) => { if (!AS_JSON) console.log(...a) }

function runIdOf(now = new Date()) {
  const iso = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) // YYYYMMDDHHmmss
  const rand = Math.random().toString(36).slice(2, 6)
  return `${iso}-${rand}`
}

function formatKST(date = new Date()) {
  // 'sv-SE' 로케일은 "YYYY-MM-DD HH:mm:ss" 형식을 그대로 준다(파싱 없이
  // 재조합만 필요) — 별도 포맷터 없이 결정론적으로 KST 표기를 만든다.
  const s = date.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
  return `${s} KST`
}

// 학생 표시명 마스킹 — 기본은 "이름 앞 1글자 + ***"(--show-names 로만 전체
// 노출). GHOST_UNIT_PRESENT/UNIT_WORDS_ABNORMAL 처럼 studentId 가 null인
// 유닛 단위 finding 은 애초에 이름이 없다.
function maskName(name, showNames) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return '(이름없음)'
  if (showNames) return n
  return `${n[0]}***`
}

// baseline diff 는 이름을 모른다(학생별 학습기록 행수만 다루는 별도 조회 —
// 개인정보 최소화를 위해 이름 조인을 하지 않는다). UUID 를 그대로 노출하지
// 않기 위해 앞 8자만 보이고 나머지는 마스킹한다.
function maskId(id, showNames) {
  const s = String(id || '')
  if (!s) return '(id없음)'
  if (showNames) return s
  return s.length > 8 ? `${s.slice(0, 8)}***` : `${s}***`
}

// 2026-09-03 보안수정 — health.results[]/invariants.findings[] 는 raw
// evaluateStudent()/evaluateInvariants() 출력을 그대로 JSON 에 담기 때문에
// (사람용 renderBucket() 과 별개 경로) --json/보고서 파일에 실명이 그대로
// 노출돼 왔다. null/undefined/빈 문자열은 원래 "이름 없음/해당없음"을 뜻하는
// 값이라 그대로 두고(예: 유닛 단위 invariant 는 studentName 이 null), 실제
// 이름 문자열만 maskName() 규칙으로 치환한다.
function maskNameIfPresent(name, showNames) {
  if (typeof name !== 'string' || !name) return name
  return maskName(name, showNames)
}

// health 모듈(scripts/lib/studentHealthRules.mjs, 이 트랙 소유 아님)의
// CHECK_CODES 값을 재구현하지 않고 "표시용 한국어 설명"만 여기서 따로
// 붙인다 — 코드 자체의 의미/판정 로직은 그 모듈에 그대로 둔다.
const HEALTH_CODE_LABELS = {
  LOGIN_FAIL: '로그인 식별자 문제 — 로그인 자체가 실패할 수 있음',
  CLASS_INVALID: '반 배정 문제',
  TEXTBOOK_MISSING: '주교재 배정 누락/고아',
  UNIT_INVALID: '현재 유닛 문제(고아 또는 교재 불일치)',
  WORDS_ZERO: '현재 유닛에 단어가 0개',
  ORPHAN_ASSIGNMENT: '배정 행이 존재하지 않는 반/교재를 가리킴',
  DUPLICATE: '동명 중복 계정',
  DIRECTION_INVALID: '쓰기 방향 값 문제',
  GHOST_UNIT: '현재 유닛이 유령 유닛(엑셀 헤더 잔재)',
  ASSIGNMENT_CONFLICT: '배정 조합 모순(주교재 2개 이상 등)',
}
// health WARN 중 "이미 알려진 데이터 부채"로 이미 문서화된 코드(운영자
// 조치 필요하나 배포를 막지 않기로 기존에 결정됨, studentHealthRules.mjs
// 12-c/14~16 주석 참고). Data debt 버킷 분류에만 쓰고 판정 로직에는
// 전혀 관여하지 않는다.
const HEALTH_KNOWN_DATA_DEBT = new Set(['ASSIGNMENT_GHOST_UNIT', 'DIRECTION_RANDOM'])
// invariants WARN 중 "이미 알려진 데이터 부채" 버킷(유령 유닛 인벤토리 —
// v3_43 계열 SQL 패키지가 대상으로 삼는 정리 과제). recommended 필드와는
// 별개 축(운영 우선순위 표시용)이라 여기서 따로 관리한다.
const INVARIANT_KNOWN_DATA_DEBT = new Set(['GHOST_UNIT_PRESENT'])

function writeReport(payload, runId) {
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true })
    const file = path.join(REPORT_DIR, `${runId}.prodcheck.json`)
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    return file
  } catch (err) {
    log(`  [주의] 리포트 저장 실패: ${err?.message || err}`)
    return null
  }
}

function writeBaseline(payload, runId) {
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true })
    const file = path.join(REPORT_DIR, `${runId}.baseline.json`)
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    return file
  } catch (err) {
    log(`  [주의] baseline 저장 실패: ${err?.message || err}`)
    return null
  }
}

// findings/health 결과를 Critical(FAIL) / Needs review(WARN, 운영자 판단) /
// Data debt(이미 알려진 이력, 조치 불필요 — 즉 지금 당장 볼 필요는 없음)
// 3단으로 나눈다. 순수 함수(표시 전용, 판정을 바꾸지 않는다).
function classifyForUX(healthResults, invariantFindings) {
  const critical = []
  const needsReview = []
  const dataDebt = []

  for (const f of invariantFindings) {
    const item = { code: f.code, studentId: f.studentId, studentName: f.studentName, line: f.detail }
    if (f.severity === 'FAIL') critical.push(item)
    else if (INVARIANT_KNOWN_DATA_DEBT.has(f.code)) dataDebt.push(item)
    else needsReview.push(item)
  }

  for (const r of healthResults) {
    if (r.status === 'FAIL') {
      const reason = r.codes.length ? r.codes.join(' | ') : '체인 해석 실패'
      critical.push({ code: 'HEALTH_FAIL', studentId: r.studentId, studentName: r.name, line: reason })
    } else if (r.status === 'WARN') {
      for (const w of r.warnings) {
        const code = String(w).split(':')[0]
        const item = { code, studentId: r.studentId, studentName: r.name, line: `${HEALTH_CODE_LABELS[code] || code} — ${w}` }
        if (HEALTH_KNOWN_DATA_DEBT.has(code)) dataDebt.push(item)
        else needsReview.push(item)
      }
    }
  }

  return { critical, needsReview, dataDebt }
}

function renderBucket(title, items, showNames) {
  const lines = [`${title}:`]
  if (!items.length) { lines.push('  없음'); return lines }
  const byCode = new Map()
  for (const it of items) {
    const list = byCode.get(it.code) || []
    list.push(it)
    byCode.set(it.code, list)
  }
  for (const [, list] of byCode) {
    const shown = list.slice(0, 5)
    for (const it of shown) {
      const who = it.studentId ? maskName(it.studentName, showNames) : '(유닛)'
      lines.push(`  - ${who} — ${it.line}`)
    }
    if (list.length > 5) lines.push(`  ... 외 ${list.length - 5}건`)
  }
  return lines
}

async function main() {
  let data
  let envInfo = { host: null, projectRef: null, source: null }
  let supa = null

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
    supa = loadSupabaseEnv()
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

  const runId = runIdOf()

  // ── (선택) 학습기록 baseline — 라이브 전용, 픽스처/네트워크 0 회귀에서는
  //    건드리지 않는다(구조 판정과 독립적인 보조 조사).
  let baselineInfo = null
  if (BASELINE_STUDENTS || COMPARE_BASELINE) {
    if (envInfo.source !== 'live' || !supa) {
      log('\n  [주의] --baseline-students/--compare-baseline 은 라이브 조회 전용입니다(픽스처에서는 무시).')
    } else {
      try {
        let ids = BASELINE_STUDENTS ? BASELINE_STUDENTS.split(',').map((v) => v.trim()).filter(Boolean) : []
        let previous = null
        if (COMPARE_BASELINE) {
          previous = JSON.parse(fs.readFileSync(COMPARE_BASELINE, 'utf8'))
          if (!ids.length) ids = Object.keys(previous?.students || {})
        }
        const current = await loadLearningBaseline(supa, ids)
        const file = writeBaseline(current, runId)
        baselineInfo = { studentIds: ids, file, sha256: current.sha256 }
        if (previous) {
          const changes = diffLearningBaseline(previous, current)
          baselineInfo.compareFile = COMPARE_BASELINE
          baselineInfo.changes = changes
          log(`\n--- baseline 비교(${COMPARE_BASELINE} → 현재) ---`)
          if (!changes.length) log('  변화 없음')
          else for (const c of changes) log(`  [${maskId(c.studentId, SHOW_NAMES)}] ${c.field}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`)
        } else {
          log(`\n--- baseline 저장 완료(학생 ${ids.length}명) — ${file || '(저장 실패)'} ---`)
        }
      } catch (err) {
        log(`\n  [주의] baseline 조회 실패(구조 판정과 무관, exit code 에 영향 없음): ${err?.message || err}`)
        baselineInfo = { error: String(err?.message || err) }
      }
    }
  }

  const ux = classifyForUX(healthResults, findings)

  // health.results[]/invariants.findings[] 는 JSON stdout/보고서 파일에
  // 그대로 실리므로 여기서 마스킹을 적용한다(classifyForUX/renderBucket 은
  // 사람용 텍스트 버킷만 담당해 이 두 배열과는 별개 경로다). SHOW_NAMES 는
  // 이미 CI 에서 강제로 false 로 계산돼 있다(위 IS_CI 처리 참고).
  const outputHealthResults = healthResults.map((r) => ({ ...r, name: maskNameIfPresent(r.name, SHOW_NAMES) }))
  const outputFindings = findings.map((f) => ({ ...f, studentName: maskNameIfPresent(f.studentName, SHOW_NAMES) }))

  const report = {
    runAt: new Date().toISOString(),
    runId,
    env: { host: envInfo.host, projectRef: envInfo.projectRef, source: envInfo.source },
    verdict,
    health: { summary: healthSummary, results: outputHealthResults },
    invariants: { summary: invariantsSummary, findings: outputFindings },
    ux: {
      criticalCount: ux.critical.length,
      needsReviewCount: ux.needsReview.length,
      dataDebtCount: ux.dataDebt.length,
    },
    baseline: baselineInfo,
    dbWrite: 0,
  }
  const reportFile = writeReport(report, runId)

  if (AS_JSON) {
    console.log(JSON.stringify({ ...report, reportFile }, null, 2))
  } else {
    log(`\nPRODUCTION SAFETY CHECK  (run ${runId}, ${envInfo.source === 'fixture' ? '픽스처' : (envInfo.projectRef || '?')}, ${formatKST()})`)
    log(`PASS: ${healthSummary.pass}   WARN: ${healthSummary.warn}   FAIL: ${healthSummary.fail}        (health, 대상 실학생 ${realStudents.length}명)`)
    log(`Invariants: FAIL ${invariantsSummary.fail} · WARN ${invariantsSummary.warn}`)

    log('')
    for (const line of renderBucket('Critical (즉시 조치)', ux.critical, SHOW_NAMES)) log(line)
    log('')
    for (const line of renderBucket('Needs review (운영자 판단)', ux.needsReview, SHOW_NAMES)) log(line)
    log('')
    for (const line of renderBucket('Data debt (알려진 이력, 조치 불필요)', ux.dataDebt, SHOW_NAMES)) log(line)

    log(`\n${'='.repeat(60)}`)
    log('DB WRITE: 0 (이 스크립트는 GET/HEAD 만 보냅니다)')
    log(`Safe to continue: ${overallFail ? 'NO(FAIL 있음)' : 'YES'}`)
    if (reportFile) log(`리포트: ${reportFile}`)
    if (baselineInfo?.file) log(`baseline: ${baselineInfo.file}`)
  }

  process.exitCode = overallFail ? 1 : 0
}

await main()
