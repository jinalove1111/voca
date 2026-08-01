// scripts/testEdgeFunctionsE2E.mjs — Live E2E verification of the two
// deployed Supabase Edge Functions (admin-content-write,
// grade-writing-answers) against PRODUCTION Supabase. 이식 원본:
// 별도 scratchpad에서 만든 e2eEdgeFunctions.mjs를 이 저장소 관례(스크립트
// 위치/시크릿 취급/정직한 SKIP)에 맞춰 옮긴 것.
//
// ⚠️ 이 스크립트는 tests/harness/registry.mjs(verify:* 하네스)나
// package.json 스크립트에 등록하지 않는다 — 회귀 게이트가 아니라 "배포된
// Edge Function이 실제로 살아있고 인가가 제대로 걸려있는지"를 사람이 필요할
// 때 수동으로 확인하는 라이브 점검 도구이기 때문이다(1) ADMIN_PIN이라는
// 시크릿 환경변수가 있어야만 전체 실행이 가능하고, (2) 실제로 프로덕션
// Supabase에 쓰기(disposable 테스트 반/유닛/단어/큐 행)를 하므로 CI나
// 다른 verify:* 스크립트처럼 항상 무해하게 반복 실행되는 게 아니다.
//
// 안전 보장:
//   - 이 스크립트가 만드는 모든 엔티티는 이름에 "__E2E_배포검증_" 접두어가
//     붙거나(반/유닛) 단어 텍스트가 'e2eprobeword'인 disposable 데이터뿐이다.
//     기존 반/학생/단어/시험 데이터는 전혀 건드리지 않는다.
//   - 생성한 모든 엔티티는 `finally` 블록에서 항상 정리한다 — 중간에 어떤
//     단계가 실패해도(예외가 나도) 정리는 실행된다.
//   - 시크릿(VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY/ADMIN_PIN)은 값 자체를
//     한 글자도 콘솔에 출력/로깅하지 않는다. 오직 존재 여부, HTTP 상태
//     코드, 에러 코드/사유, 행 개수, AI 판정/신뢰도, 비용 수치 같은
//     비시크릿 진단 정보만 출력한다.
//   - ADMIN_PIN은 오직 process.env.ADMIN_PIN에서만 읽는다 — .env/.env.local/
//     .vercel 등 어떤 파일에서도 절대 읽지 않는다(현재 세션에 명시적으로
//     설정했을 때만 실행되게 하기 위함, PIN이 저장소 어떤 파일에도 평문으로
//     남지 않게 하려는 의도적 설계).
//
// 실행 방법(PowerShell, C:\voca에서):
//   cd C:\voca
//   $env:ADMIN_PIN = Read-Host -MaskInput 'Admin PIN'
//   node scripts/testEdgeFunctionsE2E.mjs
//   Remove-Item Env:ADMIN_PIN
//
// ADMIN_PIN을 설정하지 않고 실행하면: 실제 PIN이 필요 없는 "틀린 PIN(0000)
// -> not_authorized" 게이트 확인만(두 함수 모두 배포됐는지 + 인가가 실제로
// 걸려있는지 검증) 수행하고, 나머지(A2~B4, 실제 쓰기/AI 호출 포함)는 정직하게
// SKIP한 뒤 exit 0으로 끝난다.
import { readFileSync, existsSync } from 'node:fs'

// ── env loading (시크릿 값은 절대 로그에 남기지 않는다) ─────────────────
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY만 .env에서 읽는다(기존 관례,
// scripts/testEntranceTestDb.mjs 등과 동일한 파일 경로). ADMIN_PIN은 이 함수로
// 절대 읽지 않는다 — process.env.ADMIN_PIN 전용(위 헤더 주석 참고).
function parseEnvFile(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  const text = readFileSync(filePath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const envMain = parseEnvFile('.env')
const SUPABASE_URL = envMain.VITE_SUPABASE_URL
const ANON_KEY = envMain.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('FATAL: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not found in .env (cd C:\\voca 후 실행했는지 확인)')
  process.exit(1)
}

// ADMIN_PIN — process.env 전용, 파일에서는 절대 읽지 않는다(위 헤더 주석).
const ADMIN_PIN = process.env.ADMIN_PIN || null

const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`
const REST_BASE = `${SUPABASE_URL}/rest/v1`

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    ...extra,
  }
}

async function callAdminContentWrite(adminPin, action, payload) {
  const res = await fetch(`${FUNCTIONS_BASE}/admin-content-write`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPin, action, payload }),
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}

async function callGradeWritingAnswers(adminPin, pendingIds, clientStats) {
  const res = await fetch(`${FUNCTIONS_BASE}/grade-writing-answers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPin, pendingIds, ...(clientStats ? { clientStats } : {}) }),
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}

async function restSelect(table, queryString) {
  const res = await fetch(`${REST_BASE}/${table}?${queryString}`, {
    method: 'GET',
    headers: authHeaders(),
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}

async function restInsert(table, rows) {
  const res = await fetch(`${REST_BASE}/${table}`, {
    method: 'POST',
    headers: authHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(rows),
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}

async function restDelete(table, queryString) {
  const res = await fetch(`${REST_BASE}/${table}?${queryString}`, {
    method: 'DELETE',
    headers: authHeaders({ Prefer: 'return=representation' }),
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}

// index.ts getSeoulDateString / src/utils/dateSeoul.js getSeoulDateString와
// 동일한 Seoul-local-date 관례(YYYY-MM-DD, Asia/Seoul).
function getSeoulDateString(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

// Deterministic(Math.random 미사용) 타임스탬프 접미사.
const SUFFIX = new Date().toISOString().replace(/[^0-9]/g, '') // e.g. 20260801023015123
const CLASS_NAME = `__E2E_배포검증_${SUFFIX}`
const UNIT_NAME = `__E2E_배포검증_유닛_${SUFFIX}`
const WORD_TEXT = 'e2eprobeword'
const WORD_MEANING = '이투이검증단어'
const TODAY_SEOUL = getSeoulDateString()
// WORD_MEANING과 일부러 무관하게 만들어 로컬 규칙(exact_match/synonym/
// levenshtein editDistance<=1) 어느 것도 해결 못 하게 해 AI 경로를 강제한다.
const NOVEL_HANGUL_ANSWER = '완전히임의의오답구절'

const results = []
function record(name, pass, evidence) {
  results.push({ name, pass, evidence })
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} — ${evidence}`)
}

const cleanupResults = []
function recordCleanup(name, pass, evidence) {
  cleanupResults.push({ name, pass, evidence })
  console.log(`[CLEANUP ${pass ? 'PASS' : 'FAIL'}] ${name} — ${evidence}`)
}

async function main() {
  console.log('=== E2E verification: admin-content-write + grade-writing-answers ===')
  console.log(`Seoul date used for assignment.set: ${TODAY_SEOUL}`)
  console.log(`Disposable test class name: ${CLASS_NAME}`)
  console.log(`ADMIN_PIN env var present: ${ADMIN_PIN ? 'yes' : 'no'} (value never logged)`)

  let classId = null
  let unitId = null
  let wordId = null
  let queueRowId = null

  try {
    // ── A1: admin-content-write wrong pin — 배포 확인 + 인가 게이트 확인 ──
    {
      const { status, body } = await callAdminContentWrite('0000', 'assignment.set', { classId: '00000000-0000-0000-0000-000000000000', date: TODAY_SEOUL, wordIds: [] })
      const pass = status === 200 && body?.ok === false && body?.reason === 'not_authorized'
      record('A1 admin-content-write wrong pin -> not_authorized', pass, `HTTP ${status}, ok=${body?.ok}, reason=${body?.reason}`)
    }

    // ── A1b: grade-writing-answers wrong pin — 배포 확인 + 인가 게이트 확인 ──
    // pendingIds:[]는 side-effect 없음(인가 체크가 쿼리/action 처리보다
    // 항상 먼저 — supabase/functions/grade-writing-answers/index.ts).
    {
      const { status, body } = await callGradeWritingAnswers('0000', [])
      const pass = status === 200 && body?.ok === false && body?.reason === 'not_authorized'
      record('A1b grade-writing-answers wrong pin -> not_authorized', pass, `HTTP ${status}, ok=${body?.ok}, reason=${body?.reason}`)
    }

    if (!ADMIN_PIN) {
      record('A2 class.create', false, 'SKIPPED — ADMIN_PIN 환경변수 미설정(process.env.ADMIN_PIN)')
      record('A3 unit.create + words.bulk_replace', false, 'SKIPPED — depends on A2')
      record('A4 assignment.set + anon SELECT', false, 'SKIPPED — depends on A2/A3')
      record('A5 assignment.set wordIds:[] (배정 해제)', false, 'SKIPPED — depends on A4')
      record('B1 insert pending spelling_review_queue row', false, 'SKIPPED — depends on A3 (word id)')
      record('B2 grade-writing-answers first call (AI path)', false, 'SKIPPED — depends on B1/ADMIN_PIN')
      record('B3 OpenAI billing evidence', false, 'SKIPPED — depends on B2')
      record('B4 grade-writing-answers second call (cache hit)', false, 'SKIPPED — depends on B2')
    } else {
      const GOOD_PIN = ADMIN_PIN

      // ── A2: class.create ────────────────────────────────────────────────
      {
        const { status, body } = await callAdminContentWrite(GOOD_PIN, 'class.create', { name: CLASS_NAME, classType: 'regular' })
        const pass = status === 200 && body?.ok === true && !!body?.data?.id
        record('A2 class.create', pass, `HTTP ${status}, ok=${body?.ok}, id=${pass ? 'present' : 'MISSING'}, name_echo_ok=${body?.data?.name === CLASS_NAME}`)
        if (pass) classId = body.data.id
      }

      // ── A3: unit.create + words.bulk_replace ────────────────────────────
      if (classId) {
        const unitRes = await callAdminContentWrite(GOOD_PIN, 'unit.create', { classId, unitName: UNIT_NAME })
        const unitPass = unitRes.status === 200 && unitRes.body?.ok === true && !!unitRes.body?.data?.id
        if (unitPass) unitId = unitRes.body.data.id

        let wordsPass = false
        let wordsEvidence = 'unit.create failed, words.bulk_replace skipped'
        if (unitId) {
          const wordsRes = await callAdminContentWrite(GOOD_PIN, 'words.bulk_replace', {
            unitId, rows: [{ word: WORD_TEXT, meaning: WORD_MEANING }],
          })
          wordsPass = wordsRes.status === 200 && wordsRes.body?.ok === true && Array.isArray(wordsRes.body?.data) && wordsRes.body.data.length === 1 && !!wordsRes.body.data[0]?.id
          if (wordsPass) wordId = wordsRes.body.data[0].id
          wordsEvidence = `HTTP ${wordsRes.status}, ok=${wordsRes.body?.ok}, rows_returned=${Array.isArray(wordsRes.body?.data) ? wordsRes.body.data.length : 'n/a'}, wordId=${wordId ? 'present' : 'MISSING'}`
        }
        record('A3 unit.create + words.bulk_replace', unitPass && wordsPass, `unit.create: HTTP ${unitRes.status} ok=${unitRes.body?.ok} unitId=${unitId ? 'present' : 'MISSING'}; words.bulk_replace: ${wordsEvidence}`)
      } else {
        record('A3 unit.create + words.bulk_replace', false, 'SKIPPED — A2 did not produce a classId')
      }

      // ── A4: assignment.set(wordIds:[wordId]) + anon SELECT verification ──
      if (classId && wordId) {
        const setRes = await callAdminContentWrite(GOOD_PIN, 'assignment.set', { classId, date: TODAY_SEOUL, wordIds: [wordId] })
        const setPass = setRes.status === 200 && setRes.body?.ok === true
        let selectPass = false
        let selectEvidence = 'assignment.set failed, anon SELECT skipped'
        if (setPass) {
          const selRes = await restSelect('daily_assignments', `select=class_id,date,word_ids&class_id=eq.${classId}&date=eq.${TODAY_SEOUL}`)
          const row = Array.isArray(selRes.body) ? selRes.body[0] : null
          selectPass = selRes.status === 200 && !!row && Array.isArray(row.word_ids) && row.word_ids.includes(wordId)
          selectEvidence = `HTTP ${selRes.status}, rows=${Array.isArray(selRes.body) ? selRes.body.length : 'n/a'}, word_ids_len=${row?.word_ids?.length ?? 'n/a'}, contains_test_word=${row?.word_ids?.includes(wordId) ?? false}`
        }
        record('A4 assignment.set(pin path) writes daily_assignments row (anon SELECT verified)', setPass && selectPass, `assignment.set: HTTP ${setRes.status} ok=${setRes.body?.ok}; anon SELECT: ${selectEvidence}`)
      } else {
        record('A4 assignment.set + anon SELECT', false, 'SKIPPED — missing classId/wordId from earlier steps')
      }

      // ── A5: assignment.set(wordIds:[]) — 배정 해제 ───────────────────────
      if (classId) {
        const clearRes = await callAdminContentWrite(GOOD_PIN, 'assignment.set', { classId, date: TODAY_SEOUL, wordIds: [] })
        const clearPass = clearRes.status === 200 && clearRes.body?.ok === true
        const selRes = await restSelect('daily_assignments', `select=word_ids&class_id=eq.${classId}&date=eq.${TODAY_SEOUL}`)
        const row = Array.isArray(selRes.body) ? selRes.body[0] : null
        const verifyEmpty = Array.isArray(row?.word_ids) && row.word_ids.length === 0
        record('A5 assignment.set wordIds:[] (배정 해제)', clearPass && verifyEmpty, `HTTP ${clearRes.status} ok=${clearRes.body?.ok}; verify word_ids_len_after=${row?.word_ids?.length ?? 'n/a'}`)
      } else {
        record('A5 assignment.set wordIds:[] (배정 해제)', false, 'SKIPPED — no classId')
      }

      // ── B1: anon insert pending spelling_review_queue row ────────────────
      if (wordId) {
        const insRes = await restInsert('spelling_review_queue', [{
          word_id: wordId,
          student_id: null,
          submitted_answer: NOVEL_HANGUL_ANSWER,
          direction: 'en2kr',
          status: 'pending',
        }])
        const insPass = insRes.status === 201 && Array.isArray(insRes.body) && insRes.body.length === 1 && !!insRes.body[0]?.id
        if (insPass) queueRowId = insRes.body[0].id
        record('B1 anon insert pending spelling_review_queue row', insPass, `HTTP ${insRes.status}, row_id=${queueRowId ? 'present' : 'MISSING'}`)
      } else {
        record('B1 anon insert pending spelling_review_queue row', false, 'SKIPPED — no wordId from A3')
      }

      // ── B2: grade-writing-answers first call — expect fresh AI decision ──
      let firstUsage = null
      if (queueRowId) {
        const gradeRes = await callGradeWritingAnswers(GOOD_PIN, [queueRowId])
        const proposal = gradeRes.body?.proposals?.find((p) => p.pending_answer_id === queueRowId)
        firstUsage = gradeRes.body?.usage || null
        const decisionOk = proposal && ['accept', 'reject_candidate', 'review'].includes(proposal.decision)
        const isFreshAi = proposal && proposal.decision_source === 'ai' && proposal.cache_hit === false
        const isDegraded = proposal && ['ai_unavailable', 'ai_error', 'ai_budget_exceeded', 'parse_error'].includes(proposal.decision_source)
        const pass = gradeRes.status === 200 && gradeRes.body?.ok === true && decisionOk && isFreshAi
        record(
          'B2 grade-writing-answers first call uses real AI path (not cache/local/stats)',
          pass,
          `HTTP ${gradeRes.status}, ok=${gradeRes.body?.ok}, decision=${proposal?.decision}, confidence=${proposal?.confidence}, decision_source=${proposal?.decision_source}, cache_hit=${proposal?.cache_hit}, model=${gradeRes.body?.usage?.model}, provider=${gradeRes.body?.usage?.provider}, estimatedCostUsd=${gradeRes.body?.usage?.estimatedCostUsd}, inputTokens=${gradeRes.body?.usage?.inputTokens}, outputTokens=${gradeRes.body?.usage?.outputTokens}${isDegraded ? ` [DEGRADED PATH: decision_source=${proposal?.decision_source} — see verdict classification]` : ''}`,
        )

        // ── B3: OpenAI billing evidence ─────────────────────────────────
        const usageDailyRes = await restSelect('ai_usage_daily', `select=usage_date,provider,model,est_cost_usd,request_count,item_count&usage_date=eq.${TODAY_SEOUL}`)
        // NOTE: RLS enabled + zero policies(supabase_v3_8_ai_usage_daily.sql
        // §"정책을 하나도 만들지 않는다")면 PostgREST가 anon에게도 HTTP 200 +
        // 빈 배열을 준다(에러가 아니라 조용히 필터링) — 그래서 HTTP 상태만으로는
        // "권한 있음" vs "권한 없음"을 구분 못 하고, 실제로 행이 왔는지(길이>0)
        // 만이 anon이 볼 수 있다는 증거가 된다.
        const usageDailyRows = Array.isArray(usageDailyRes.body) ? usageDailyRes.body : []
        const anonCanSeeRows = usageDailyRes.status === 200 && usageDailyRows.length > 0
        if (anonCanSeeRows) {
          const totalCost = usageDailyRows.reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0)
          const totalReq = usageDailyRows.reduce((s, r) => s + (Number(r.request_count) || 0), 0)
          const pass = totalCost > 0 && totalReq > 0
          record('B3 OpenAI actually billed (ai_usage_daily anon SELECT evidence)', pass, `HTTP ${usageDailyRes.status}, rows=${usageDailyRows.length}, total_est_cost_usd=${totalCost}, total_request_count=${totalReq}`)
        } else {
          // supabase_v3_8_ai_usage_daily.sql 설계대로(anon GRANT/정책 없음,
          // service_role 전용 테이블) HTTP 200 + 빈 배열이 정상 — 그 경우
          // grade-writing-answers 응답 자체의 usage/비용 메타데이터로 폴백한다.
          const costUsd = firstUsage?.estimatedCostUsd ?? 0
          const tokensOk = (firstUsage?.inputTokens ?? 0) > 0 && (firstUsage?.outputTokens ?? 0) > 0
          const pass = costUsd > 0 && tokensOk
          record(
            'B3 OpenAI actually billed (fallback: grade-writing-answers response usage metadata, ai_usage_daily anon SELECT returned 0 rows — RLS/no-grant, expected)',
            pass,
            `ai_usage_daily anon SELECT: HTTP ${usageDailyRes.status}, rows=${usageDailyRows.length} — fallback evidence: estimatedCostUsd=${costUsd}, inputTokens=${firstUsage?.inputTokens}, outputTokens=${firstUsage?.outputTokens}, model=${firstUsage?.model}, provider=${firstUsage?.provider}`,
          )
        }

        // ── B4: grade-writing-answers second call — expect cache hit ────
        const gradeRes2 = await callGradeWritingAnswers(GOOD_PIN, [queueRowId])
        const proposal2 = gradeRes2.body?.proposals?.find((p) => p.pending_answer_id === queueRowId)
        const cacheHit = proposal2?.cache_hit === true
        const noNewCost = (gradeRes2.body?.usage?.estimatedCostUsd ?? -1) === 0
        const pass2 = gradeRes2.status === 200 && gradeRes2.body?.ok === true && cacheHit && noNewCost
        record(
          'B4 grade-writing-answers second call is a cache hit (no re-billing)',
          pass2,
          `HTTP ${gradeRes2.status}, ok=${gradeRes2.body?.ok}, cache_hit=${proposal2?.cache_hit}, decision=${proposal2?.decision}, decision_source=${proposal2?.decision_source}, second_call_estimatedCostUsd=${gradeRes2.body?.usage?.estimatedCostUsd}, second_call_batchCount=${gradeRes2.body?.usage?.batchCount}`,
        )
      } else {
        record('B2 grade-writing-answers first call (AI path)', false, 'SKIPPED — no queueRowId from B1')
        record('B3 OpenAI billing evidence', false, 'SKIPPED — depends on B2')
        record('B4 grade-writing-answers second call (cache hit)', false, 'SKIPPED — depends on B2')
      }
    }
  } finally {
    // ── CLEANUP (실패해도 항상 실행) ─────────────────────────────────────
    console.log('--- cleanup ---')

    if (queueRowId) {
      const delRes = await restDelete('spelling_review_queue', `id=eq.${queueRowId}`)
      recordCleanup('spelling_review_queue row', delRes.status === 200 || delRes.status === 204, `HTTP ${delRes.status}`)
    } else {
      recordCleanup('spelling_review_queue row', true, 'nothing to clean (was never created)')
    }

    // Assignment는 이미 A5에서 []로 비워졌다(classId가 있었을 때). daily_
    // assignments 행 자체는 아래 classes cascade로 삭제된다(DATABASE.md
    // `class_id -> classes(id) cascade`).

    if (unitId) {
      // words.bulk_replace(rows:[])로 먼저 단어를 비운다 — words.unit_id ->
      // units(id) FK cascade 여부가 DATABASE.md에 확정 기재돼 있지 않아
      // ("정확한 컬럼명은 코드 확인 권장") cascade를 가정하지 않고 명시적으로
      // 처리한다.
      const clearWordsRes = await callAdminContentWrite(ADMIN_PIN, 'words.bulk_replace', { unitId, rows: [] })
      recordCleanup('words in test unit (bulk_replace rows:[])', clearWordsRes.status === 200 && clearWordsRes.body?.ok === true, `HTTP ${clearWordsRes.status}, ok=${clearWordsRes.body?.ok}`)

      const wordsCountRes = await restSelect('words', `select=id&unit_id=eq.${unitId}`)
      recordCleanup('words count after clear', Array.isArray(wordsCountRes.body) && wordsCountRes.body.length === 0, `remaining_words=${Array.isArray(wordsCountRes.body) ? wordsCountRes.body.length : 'n/a'}`)

      const delUnitRes = await callAdminContentWrite(ADMIN_PIN, 'unit.delete', { unitId })
      recordCleanup('unit.delete', delUnitRes.status === 200 && delUnitRes.body?.ok === true, `HTTP ${delUnitRes.status}, ok=${delUnitRes.body?.ok}`)
    } else {
      recordCleanup('unit/words cleanup', true, 'nothing to clean (unit was never created)')
    }

    if (classId) {
      const delClassRes = await callAdminContentWrite(ADMIN_PIN, 'class.delete', { classId })
      recordCleanup('class.delete', delClassRes.status === 200 && delClassRes.body?.ok === true, `HTTP ${delClassRes.status}, ok=${delClassRes.body?.ok}`)

      const classCountRes = await restSelect('classes', `select=id&id=eq.${classId}`)
      const unitsCountRes = await restSelect('units', `select=id&class_id=eq.${classId}`)
      recordCleanup('classes row gone (verify count=0)', Array.isArray(classCountRes.body) && classCountRes.body.length === 0, `remaining_class_rows=${Array.isArray(classCountRes.body) ? classCountRes.body.length : 'n/a'}`)
      recordCleanup('units under class gone (verify count=0, FK cascade check)', Array.isArray(unitsCountRes.body) && unitsCountRes.body.length === 0, `remaining_unit_rows=${Array.isArray(unitsCountRes.body) ? unitsCountRes.body.length : 'n/a'}`)

      const assignRes = await restSelect('daily_assignments', `select=class_id&class_id=eq.${classId}`)
      recordCleanup('daily_assignments row gone (verify count=0, FK cascade check)', Array.isArray(assignRes.body) && assignRes.body.length === 0, `remaining_assignment_rows=${Array.isArray(assignRes.body) ? assignRes.body.length : 'n/a'}`)
    } else {
      recordCleanup('class cleanup', true, 'nothing to clean (class was never created)')
    }

    // ── FINAL REPORT ─────────────────────────────────────────────────────
    console.log('\n=== FINAL RESULTS TABLE ===')
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.name} | ${r.evidence}`)
    console.log('\n=== CLEANUP RESULTS ===')
    for (const r of cleanupResults) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.name} | ${r.evidence}`)

    const failures = results.filter((r) => !r.pass)
    console.log(`\n=== SUMMARY: ${results.length - failures.length}/${results.length} tests PASS ===`)
    if (failures.length > 0) {
      console.log('Failures:')
      for (const f of failures) console.log(`  - ${f.name}: ${f.evidence}`)
    }
    const cleanupFailures = cleanupResults.filter((r) => !r.pass)
    console.log(`Cleanup: ${cleanupResults.length - cleanupFailures.length}/${cleanupResults.length} PASS`)
  }
}

main()
  .then(() => {
    if (!ADMIN_PIN) {
      console.log('\nSKIP(ADMIN_PIN 미설정) — 나머지 A2~B4는 실제 PIN 필요: $env:ADMIN_PIN 설정 후 재실행')
      process.exit(0)
    }
    const failures = results.filter((r) => !r.pass)
    process.exit(failures.length === 0 ? 0 : 1)
  })
  .catch((err) => {
    console.error('FATAL SCRIPT ERROR (non-secret):', err?.message || err)
    process.exit(1)
  })
