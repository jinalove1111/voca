// Student Health Check — 라이브 실행기 (2026-08-26, P1)
//
// ★ READ-ONLY 보장 ★
// 이 파일은 HTTP GET 만 보낸다. PATCH/POST/PUT/DELETE 경로가 존재하지
// 않으며, api/verify-student-pin 도 호출하지 않는다(그 엔드포인트는 실패 시
// pin_fail_count 를 UPDATE 하므로 헬스체크가 학생을 잠글 수 있다 — 구조적
// 으로 배제). PIN 존재 여부가 필요하면 --with-pin 으로 api/student-pin-status
// (SELECT 전용, 불리언만 반환)만 쓴다.
//
// 판정 로직은 전부 scripts/lib/studentHealthRules.mjs(순수 함수)에 있고
// 여기서는 조회·출력·exit code 만 담당한다.
//
// 사용법:
//   node scripts/studentHealthCheck.mjs                 전체 active 학생
//   node scripts/studentHealthCheck.mjs --name Irene    특정 학생만
//   node scripts/studentHealthCheck.mjs --json          JSON 출력(CI용)
//   node scripts/studentHealthCheck.mjs --all           QA/아카이브 계정도 포함
//   node scripts/studentHealthCheck.mjs --with-pin      PIN 상태까지(네트워크 1회)
//   node scripts/studentHealthCheck.mjs --require-env   자격증명 없으면 exit 1
//
// exit code: FAIL 학생이 1명이라도 있으면 1, 아니면 0.
//   .env 가 없으면 기본은 SKIP(exit 0) — 로컬 개발자 편의. 단 게이트에서는
//   반드시 --require-env 를 붙여 "검증 못 함"이 조용한 PASS 가 되지 않게
//   한다(CLAUDE.md 규칙 18 — 안 되는 걸 되는 것처럼 다루지 않는다).
import fs from 'node:fs'
import { buildContext, evaluateStudent, classifyAccount, summarize, findGhostUnits } from './lib/studentHealthRules.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const AS_JSON = flag('--json')
const WITH_PIN = flag('--with-pin')
const INCLUDE_ALL = flag('--all')
const REQUIRE_ENV = flag('--require-env')
const ONLY_NAME = opt('--name')
const PROD_BASE = opt('--prod-base') || 'https://voca-drab.vercel.app'

const log = (...a) => { if (!AS_JSON) console.log(...a) }

// ── 자격증명 ────────────────────────────────────────────────────────────
let BASE = process.env.VITE_SUPABASE_URL || ''
let KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
if (!BASE || !KEY) {
  try {
    const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split(/\r?\n/).filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
    BASE = BASE || env.VITE_SUPABASE_URL
    KEY = KEY || env.VITE_SUPABASE_ANON_KEY
  } catch { /* .env 없음 — 아래에서 처리 */ }
}
if (!BASE || !KEY) {
  const msg = 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없어 라이브 검사를 할 수 없습니다.'
  if (REQUIRE_ENV) { console.error(`FAIL — ${msg} (--require-env)`); process.exit(1) }
  console.log(`SKIP — ${msg}`)
  process.exit(0)
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// PostgREST 기본 상한은 1000행이다. words 는 이미 1536행이라 페이지네이션
// 없이 받으면 조용히 잘린다 — 이 저장소에 "words 1000행 절단 P0" 실사고
// 이력이 있어(2026-08-12) 반드시 끝까지 받고, 잘림 의심 시 경고한다.
const PAGE = 1000
async function selectAll(table, columns) {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const url = `${BASE}/rest/v1/${table}?select=${columns}&limit=${PAGE}&offset=${offset}`
    let res
    try {
      res = await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) })
    } catch (err) {
      throw new Error(`INFRA_ERROR ${table}: ${err?.message || err}`)
    }
    if (!res.ok) throw new Error(`INFRA_ERROR ${table}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

const started = Date.now()
let data
try {
  const [students, classes, textbooks, units, words, assignments] = await Promise.all([
    selectAll('students', 'id,name,class_id,current_unit_id'),
    selectAll('classes', 'id,name,spelling_direction'),
    selectAll('textbooks', 'id,name,owner_class_id'),
    selectAll('units', 'id,name,textbook_id'),
    // word,meaning 도 함께 받는다 — 유령 유닛(엑셀 헤더 잔재) 판정에 필요.
    // 이 두 컬럼을 빼면 ghost 판정이 조용히 무력화된다.
    selectAll('words', 'id,unit_id,word,meaning'),
    // 2026-08-30 — current_unit_id 를 반드시 함께 가져온다.
    // 이 컬럼이 빠져 있어서 studentHealthRules 의 배정 관련 검사 두 개가
    // **조용히 죽어 있었다**: 12-b ②(배정 행 유닛이 그 행 교재 소속이
    // 아님)는 `if (!a?.current_unit_id) continue` 로 항상 건너뛰었고,
    // 그래서 그 규칙 주석의 "라이브 실측 0건"은 데이터가 깨끗해서가 아니라
    // 검사가 실행되지 않아서였다. 12-c(배정 행이 유령 유닛을 가리킴)도
    // 같은 이유로 실 데이터에서 발화하지 못했다.
    // buildContext 의 wordsByUnit 주석과 같은 종류의 함정이다 — 조회 쪽이
    // 컬럼을 빼면 규칙이 에러 없이 무력화된다.
    selectAll('student_class_assignments', 'student_id,class_id,textbook_id,is_primary,current_unit_id'),
  ])
  data = { students, classes, textbooks, units, words, assignments }
} catch (err) {
  // 인프라 오류는 "학생 FAIL"과 구분해서 보고한다 — 원인이 다르고 조치도 다르다.
  const msg = String(err?.message || err)
  if (AS_JSON) console.log(JSON.stringify({ ok: false, infraError: msg }, null, 2))
  else console.error(`\nFAIL — 라이브 조회 실패(학생 문제 아님): ${msg}`)
  process.exit(1)
}
const fetchMs = Date.now() - started

const ctx = buildContext(data)

// 대상 선정
let targets = data.students
if (ONLY_NAME) {
  const want = ONLY_NAME.trim().toLowerCase()
  targets = targets.filter((s) => String(s.name || '').trim().toLowerCase() === want)
  if (targets.length === 0) {
    const msg = `--name "${ONLY_NAME}" 과 정확히 일치하는 학생이 없습니다(로그인도 같은 규칙이라 실패합니다).`
    if (AS_JSON) console.log(JSON.stringify({ ok: false, reason: 'STUDENT_NOT_FOUND', name: ONLY_NAME }, null, 2))
    else console.error(`\nFAIL — ${msg}`)
    process.exit(1)
  }
} else if (!INCLUDE_ALL) {
  targets = targets.filter((s) => classifyAccount(s, ctx) === 'REAL')
}

const results = targets.map((s) => evaluateStudent(s, ctx))
const sum = summarize(results)
const excluded = { ARCHIVED: 0, TEST: 0, QA_FIXTURE: 0 }
for (const s of data.students) {
  const t = classifyAccount(s, ctx)
  if (t !== 'REAL') excluded[t] = (excluded[t] || 0) + 1
}

// ── PIN 상태(선택) — SELECT 전용 엔드포인트, 불리언만 반환 ──────────────
let pinInfo = null
if (WITH_PIN) {
  try {
    const res = await fetch(`${PROD_BASE}/api/student-pin-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: targets.map((s) => s.id) }),
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) {
      pinInfo = new Map((await res.json()).results.map((r) => [r.id, r]))
      for (const r of results) {
        const p = pinInfo.get(r.studentId)
        if (!p) continue
        if (!p.hasPinHash) { r.codes.push('LOGIN_FAIL:PIN미설정'); r.status = 'FAIL' }
        else if (p.locked) { r.codes.push('LOGIN_FAIL:잠김'); r.status = 'FAIL' }
      }
    } else {
      log(`  [주의] PIN 상태 조회 실패(HTTP ${res.status}) — PIN 검사는 SKIP으로 처리합니다.`)
    }
  } catch (err) {
    log(`  [주의] PIN 상태 조회 실패(${err?.message || err}) — PIN 검사는 SKIP으로 처리합니다.`)
  }
}
const finalSum = summarize(results)

// ── 출력 ────────────────────────────────────────────────────────────────
// 저장소 전체 유령 유닛 인벤토리 — 학생이 배정되지 않은 것까지 포함한다.
// 지금 아무도 안 쓰더라도 교재 전환/자동 유닛 선택이 언제든 학생을 이쪽으로
// 보낼 수 있어(setPrimaryTextbook의 "단어 있는 첫 유닛" 선택) 정리 대상이다.
const ghostUnits = findGhostUnits(ctx)

if (AS_JSON) {
  console.log(JSON.stringify({
    ok: finalSum.ok, summary: finalSum, excluded, ghostUnits,
    pinChecked: !!pinInfo, fetchMs, totalMs: Date.now() - started,
    students: results,
  }, null, 2))
} else {
  const pad = (v, n) => String(v ?? '-').padEnd(n)
  log('\n=== Student Health Check (READ-ONLY) ===')
  log(`대상 ${results.length}명${ONLY_NAME ? ` (--name ${ONLY_NAME})` : (INCLUDE_ALL ? ' (전체 계정)' : ' (실학생만)')}`)
  log(`제외: 아카이브 ${excluded.ARCHIVED} / 테스트 ${excluded.TEST} / QA반픽스처 ${excluded.QA_FIXTURE}`)
  log(`PIN 검사: ${pinInfo ? '실행됨' : (WITH_PIN ? 'SKIP(조회 실패)' : 'SKIP(--with-pin 미지정)')}`)
  log(`조회 ${fetchMs}ms / 총 ${Date.now() - started}ms\n`)

  log([pad('학생', 12), pad('반', 20), pad('교재', 20), pad('유닛', 10), '단어', ' ', pad('방향', 8), pad('상태', 6), '사유'].join(' '))
  log('─'.repeat(130))
  const order = { FAIL: 0, WARN: 1, PASS: 2 }
  for (const r of [...results].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))) {
    const reason = r.codes.length ? r.codes.join(' | ') : (r.warnings.length ? r.warnings.join(' | ') : '')
    log([
      pad(r.name, 12), pad(r.resolved.homeClassName, 20), pad(r.resolved.textbookName, 20),
      pad(r.resolved.unitName, 10), String(r.resolved.wordCount).padStart(4), ' ',
      pad(r.resolved.direction, 8), pad(r.status, 6), reason,
    ].join(' '))
  }

  const fails = results.filter((r) => r.status === 'FAIL')
  if (fails.length) {
    log(`\n=== FAIL 학생 요약 (${fails.length}명) ===`)
    for (const [code, n] of Object.entries(finalSum.byCode).sort((a, b) => b[1] - a[1])) {
      log(`  ${code.padEnd(20)} ${n}건`)
      for (const r of fails.filter((x) => x.codes.some((c) => String(c).split(':')[0] === code))) {
        log(`      - ${r.name}: ${r.codes.filter((c) => String(c).split(':')[0] === code).join(', ')}`)
      }
    }
  }
  const warns = results.filter((r) => r.status === 'WARN')
  if (warns.length) {
    log(`\n=== WARN (${warns.length}명, 게이트는 통과) ===`)
    for (const r of warns) log(`  - ${r.name}: ${r.warnings.join(', ')}`)
  }

  if (ghostUnits.length) {
    log(`\n=== 유령 유닛 인벤토리 (${ghostUnits.length}개 — 엑셀 헤더 잔재, 정리 대상) ===`)
    const tbName = (id) => data.textbooks.find((t) => t.id === id)?.name || '(교재?)'
    const assignedTo = (uid) => data.students
      .filter((s) => s.current_unit_id === uid && classifyAccount(s, ctx) === 'REAL')
      .map((s) => s.name)
    for (const g of ghostUnits) {
      const on = assignedTo(g.id)
      log(`  ${JSON.stringify(g.name).padEnd(10)} 교재=${tbName(g.textbookId).padEnd(20)} 단어 ${g.wordCount}개`)
      log(`      사유: ${g.reason}`)
      log(`      현재 배정된 실학생: ${on.length ? on.join(', ') : '없음'}`)
    }
  }

  log(`\n${'='.repeat(60)}`)
  log(`PASS ${finalSum.pass} / WARN ${finalSum.warn} / FAIL ${finalSum.fail}  (총 ${finalSum.total}명)`)
  log(finalSum.ok ? 'HEALTH CHECK: PASS' : 'HEALTH CHECK: FAIL — 위 FAIL 학생 확인')
  log('DB WRITE: 0 (이 스크립트는 GET 만 보냅니다)')
}

process.exit(finalSum.ok ? 0 : 1)
