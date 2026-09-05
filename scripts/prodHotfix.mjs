// Production Safety Harness — 핫픽스 실행기 (2026-09-03, Phase 1-B / Phase 2·7 강화)
//
// node scripts/prodHotfix.mjs <manifest.json> --env production|staging
//   [--dry-run] [--report-dir <dir>] [--executor management-api]
//   [--fixture-reader <file>] [--expect-manifest-sha <hex>]
//   [--rollback-of <report.json>] [--approve <runId>] [--json]
//
// ★ 이번 단계 프로덕션 WRITE 절대 금지 경로 설계 ★
//   · Management API 실호출은 이 저장소에 없다(토큰도 없음, SUPABASE_ACCESS_TOKEN
//     은 .env/.env.local 어디에도 없다).
//   · 라이브 접근은 supabase-js anon key 로 읽기(select/maybeSingle, count head)
//     만 한다 — 이 파일 안에 UPDATE/INSERT/DELETE 문자열을 담은 실제 실행
//     경로는 executor.run() 뿐이고, 그 executor 는 2단계 승인 티켓 게이트
//     (아래 "2단계 승인 게이트" 참고, TTY 필수) 를 통과해야만 만들어진다.
//   · --dry-run 이거나 CI 환경이거나 SUPABASE_ACCESS_TOKEN 이 없으면
//     승인 단계 이전에 항상 STOP(exit 0) 한다.
//   · --env production|staging 플래그가 없으면(오타 포함) 그 무엇보다
//     먼저 STOP(env-flag-required) — CI 에서는 --env 값과 무관하게 write
//     path 가 비활성 상태를 유지한다.
//
// ── 2단계 승인 게이트(2026-09-05, fix/harness-apply-two-phase-approval) ──
// 예전엔 여기서 Node `readline/promises` 의 `rl.question()` 으로 그 자리에서
// `APPLY <runId>` 입력을 받았다. 이 방식은 Node 코어의 하드코딩된 동작 때문에
// Windows 에서 불안정했다: readline 은 raw-mode 로 stdin 을 읽는 동안 리터럴
// 0x03(Ctrl+C) 바이트가 들어오면(그 시점에 `rl.on('SIGINT')` 리스너가 하나도
// 없으면) `rl.close()` 를 호출하고 `AbortError: Aborted with Ctrl+C`
// (code: ABORT_ERR) 로 그 question() Promise 를 즉시 reject 한다
// (internal/readline/interface.js, [kTtyWrite] 의 `case 'c':` 분기 — Node
// 소스로 직접 확인, `--expose-internals` 로 재현 완료). 이건 OS 시그널이
// 아니라 "그 순간 입력 스트림에 0x03 바이트가 도착했는가"만 보는 순수
// 키스트로크 감지라서, Windows 콘솔 입력 버퍼에 남아있던 이전 Ctrl+C(예:
// 직전 명령을 중단했거나 QuickEdit 복사 중 우연히 섞인 입력)가 이 프로세스가
// raw-mode 로 stdin 을 열자마자 그대로 전달돼도 똑같은 에러가 난다 — 운영자가
// "그 순간 Ctrl+C 를 누르지 않았다"고 말해도 모순이 아니다. 그리고 이
// 예외는 어디서도 catch 되지 않아 finish() 를 거치지 않고 프로세스가
// 죽었다(리포트에 기록이 안 남았던 이유).
//
// 이 문제를 근본적으로 없애기 위해 readline 의존을 완전히 제거하고, 승인을
// "그 자리에서 프롬프트에 답하기"가 아니라 "두 번의 독립된 CLI 실행"으로
// 재설계했다:
//   · 1단계(`--approve` 없이 실행) — 아래 0~6.5단계를 전부 수행한 뒤,
//     `--dry-run` 이 아니라면(즉 진짜 `prod:apply` 호출이라면) CI/토큰
//     유무와 **무관하게** 항상 승인 티켓 파일(`<reportDir>/<runId>.ticket.json`
//     — manifest sha256, preflight/baseline 스냅샷 fingerprint, 발급 시각,
//     만료 15분, 1회성 used 플래그)을 쓰고 status='ticket-issued' 로 STOP
//     (exit 0, DB WRITE 0). 티켓 발급 자체는 "이 계획이 게이트를 통과했다"
//     는 사실을 기록할 뿐 아무것도 쓰지 않으므로 CI/토큰없음이어도 막을
//     이유가 없다(그 티켓은 2단계에서 같은 사유로 다시 막혀 절대 승인될
//     수 없다). `--dry-run`(`prod:plan` 이 항상 이렇게 호출)일 때만 티켓
//     없이 즉시 STOP(`ready-to-apply`, 기존과 동일) — "계획만 보고 싶다"는
//     의도가 명시적이기 때문이다. 콘솔 마지막 줄에 다음에 그대로 실행할
//     명령을 인쇄한다.
//   · 2단계(`--approve <runId>` 로 재실행) — **같은 runId 로** 0~6.5단계를
//     처음부터 다시 전부 수행한다(= "그 사이 라이브 상태가 바뀌었는가"를
//     preflight-mismatch/invariants 델타 등 기존 로직이 자동으로 다시 잡는다).
//     여기서 비로소 CI/토큰 게이트를 다시 확인한다(`ready-to-apply` + 사유,
//     기존과 동일한 status/exit code) — 티켓이 아무리 유효해도 이 시점에
//     CI 이거나 토큰이 없으면 절대 통과하지 못한다. 통과하면 TTY 확인 →
//     티켓을 로드해 존재/미사용/미만료/manifest sha 일치/현재 baseline
//     fingerprint 일치(승인 이후 드리프트 시 approval-stale)를 확인하고,
//     통과하면 티켓을 즉시 used=true 로 갱신(1회성 소모)한 뒤에만 apply 로
//     진행한다. TTY 확인은 이 단계에만 남아있다(비대화형 자동화가 이
//     명령을 실수로/스크립트로 실행하지 못하게 하는 방어선 — 실제 승인
//     자체는 readline 프롬프트가 아니라 "운영자가 `--approve <runId>` 를
//     정확한 runId 로 직접 타이핑해 실행한 행위" 그 자체다).
// 두 단계 모두 여전히 같은 fail-closed 게이트(정적 스캔/프리플라이트/
// invariants delta/write-drift-guard)를 동일하게 통과해야 하고, 승인
// (2단계 CI/토큰 게이트 + 티켓 검증 + TTY) 없이는 어떤 경로로도 apply(9)
// 이후(트랜잭션)에 도달할 수 없다는 불변식은 그대로다.
//
// 흐름(고정 순서, 어느 단계든 실패 = FAIL-CLOSED STOP):
//   0 run-id 생성(2단계는 --approve 로 받은 runId 재사용) → 1 manifest
//     로드/검증(+ sha256 기록/--expect-manifest-sha 대조) → 1.5 --env
//     플래그 게이트 → 2 환경(project_ref) 게이트 →
//   3 정적 안전 스캔 → (rollback-of 모드면 원본 보고서 대조) →
//   4 프리플라이트(읽기, 모드에 따라 before/after 값 확인 전환) →
//   5 baseline 저장 → 6 계획 출력 + apply/rollback SQL 파일 저장(+ rollback
//     메타데이터 기록) → 6.5 write-drift-guard → 7 --dry-run → STOP
//     (ready-to-apply) → 8 2단계 승인 게이트(--approve 없으면 티켓 발급,
//     있으면 CI/토큰 재확인 → 티켓 검증) → 8.5 apply 직전 manifest 파일
//     재해시 대조(변조 감지) → 9 apply(forward SQL) →
//   10 postflight → 11 npm run health:students → 12 실패 시 자동 롤백
//     (backward SQL) → 13 보고서
//
// mode: 'apply'(기본) 또는 'rollback-of'(--rollback-of 지정 시) — forward/
// backward SQL 과 preflight/postflight 확인 방향이 서로 뒤바뀔 뿐, 게이트
// 순서·승인 절차는 완전히 동일한 코드 경로를 공유한다(요구사항: "실제
// 실행은 동일 승인 게이트").
//
// 로직은 CLI 진입점과 분리된 runHotfix(options, deps) 로 있다 — deps 주입으로
// scripts/testProdHotfix.mjs 가 네트워크 0으로 전체 분기를 검증한다.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  validateManifest,
  buildPreflightPlan,
  buildPostflightPlan,
  buildApplySql,
  buildRollbackSql,
  staticSafetyScan,
  redactSecrets,
  describeChange,
  computeInvariantsDeltaPreview,
  lintManifestNarratives,
  refreshExpectBefore,
  verifyWriteDriftGuard,
  findTextbookTargetsFromManifest,
  findClassIdChangeGuardViolations,
  findClassIdOwnerMismatches,
} from './lib/hotfixManifest.mjs'
import { createDryRunExecutor, createManagementApiExecutor } from './lib/sqlExecutor.mjs'
import { buildAmbiguousTextbookIndex } from './lib/prodInvariants.mjs'

const ENV_FLAG_VALUES = ['production', 'staging']

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STUDENTS_SNAPSHOT_COLS = ['id', 'class_id', 'unit_name', 'current_unit_id']
const SCA_SNAPSHOT_COLS = ['id', 'student_id', 'textbook_id', 'current_unit_id', 'is_primary']

// ── 순수 유틸 ──────────────────────────────────────────────────────────
function makeRunId(now = new Date()) {
  const ts = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) // YYYYMMDDHHmmss
  const rand = crypto.randomBytes(3).toString('hex')
  return `${ts}-${rand}`
}

function refFromUrl(url) {
  try { return new URL(url).hostname.split('.')[0] || null } catch { return null }
}
function hostFromUrl(url) {
  try { return new URL(url).hostname } catch { return null }
}

function tail(text, n = 20) {
  return String(text || '').trim().split('\n').slice(-n).join('\n')
}

function sortRows(rows) {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function sha256Json(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

function diffUnexpectedRows(table, before, after, expectedIds) {
  const beforeMap = new Map(before.map((r) => [r.id, r]))
  const afterMap = new Map(after.map((r) => [r.id, r]))
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()])
  const diffs = []
  for (const id of allIds) {
    const b = beforeMap.get(id) ?? null
    const a = afterMap.get(id) ?? null
    if (JSON.stringify(b) !== JSON.stringify(a) && !expectedIds.has(id)) {
      diffs.push({ table, id, before: b, after: a, reason: 'unexpected-row-change' })
    }
  }
  return diffs
}

// ── 자격증명 로드(.env + .env.local, 값은 어디에도 로깅하지 않는다) ──────
// fix/harness-apply-two-phase-approval(2026-09-05) — SUPABASE_ACCESS_TOKEN 을
// process.env/.env/.env.local 중 어디서 읽었는지(accessTokenSource) 도 함께
// 반환한다. "토큰 편의" 요구사항 — 값 자체는 절대 반환/로깅하지 않고 출처
// 라벨만 노출한다(.env.local 은 이미 저장소 .gitignore 의 `.env*` 로 커버됨).
function loadEnvDefault() {
  const merged = {}
  const sourceOf = {}
  for (const file of ['.env', '.env.local']) {
    const p = path.join(ROOT, file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=][^=]*)=(.*)$/)
      if (m) {
        const key = m[1].trim()
        if (merged[key] === undefined) { merged[key] = m[2].trim(); sourceOf[key] = file }
      }
    }
  }
  const accessTokenSource = process.env.SUPABASE_ACCESS_TOKEN
    ? 'process.env'
    : (merged.SUPABASE_ACCESS_TOKEN ? sourceOf.SUPABASE_ACCESS_TOKEN : null)
  return {
    url: process.env.VITE_SUPABASE_URL || merged.VITE_SUPABASE_URL || '',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || merged.VITE_SUPABASE_ANON_KEY || '',
    accessToken: process.env.SUPABASE_ACCESS_TOKEN || merged.SUPABASE_ACCESS_TOKEN || '',
    accessTokenSource,
    ci: !!(process.env.CI || process.env.GITHUB_ACTIONS),
  }
}

// ── 리더(읽기 전용) ────────────────────────────────────────────────────
// 테이블 부재(마이그레이션 미실행) 에러 판별 — PostgREST 는 relation 자체가
// 없으면 42P01(undefined_table), 스키마 캐시에 없으면(REST 시작 후 생성된
// 테이블 등) PGRST205 를 code 로 돌려준다. 이 경우는 "잃을 데이터가 아예
// 없다"는 뜻이라 fail-open(count 0)으로 처리한다 — 그 외 에러(컬럼 없음
// 42703 등)는 fail-closed 로 그대로 던져 baseline 단계를 STOP 시킨다.
function isTableMissingError(error) {
  const code = error?.code || ''
  return code === '42P01' || code === 'PGRST205'
}

/**
 * 이미 만들어진 supabase-js 클라이언트를 감싸는 리더. createLiveReader()가
 * 실제 사용하는 경로이자, 네트워크 0으로 headCountFiltered 의 select 컬럼/
 * 에러 분기 로직만 검증하고 싶을 때(scripts/testProdHotfix.mjs) 가짜
 * 클라이언트를 주입할 수 있도록 분리해 export 한다.
 * @param {*} supabase supabase-js 클라이언트(또는 같은 표면을 흉내낸 가짜 객체)
 */
export function createLiveReaderFromClient(supabase) {
  return {
    kind: 'live',
    async getRow(table, id, columns) {
      const { data, error } = await supabase.from(table).select(columns.join(',')).eq('id', id).maybeSingle()
      if (error) throw new Error(`READ_ERROR ${table}:${id} ${error.message}`)
      return data
    },
    async countWordsForUnit(unitId) {
      const { count, error } = await supabase.from('words').select('id', { count: 'exact', head: true }).eq('unit_id', unitId)
      if (error) throw new Error(`READ_ERROR words count unit=${unitId} ${error.message}`)
      return count ?? 0
    },
    // filters 의 첫 컬럼으로 select 한다(예: {student_id: sid} -> select=student_id).
    // 예전엔 'id' 를 하드코딩했는데, 학습기록 baseline 6개 테이블(word_status/
    // student_progress/student_daily_progress/spelling_review_queue/xp_ledger/
    // entrance_test_results) 중 student_progress 는 PK 가 student_id 라 id
    // 컬럼이 없어 PostgREST 400(42703 undefined_column) → 미처리 예외로
    // baseline 단계 전체가 크래시했다(2026-09-03 실측). scripts/lib/
    // prodDataLoader.mjs 의 loadLearningBaseline() 이 select=student_id 로
    // 동일 6개 테이블을 세는 방식과 통일한다.
    async headCountFiltered(table, filters) {
      const selectCol = Object.keys(filters)[0] || 'id'
      let q = supabase.from(table).select(selectCol, { count: 'exact', head: true })
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
      const { count, error } = await q
      if (error) {
        if (isTableMissingError(error)) return { count: 0, tableMissing: true }
        throw new Error(`READ_ERROR ${table} count ${error.message}`)
      }
      return { count: count ?? 0, tableMissing: false }
    },
    async selectAllRows(table, columns) {
      const PAGE = 1000
      const out = []
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase.from(table).select(columns.join(',')).order('id', { ascending: true }).range(offset, offset + PAGE - 1)
        if (error) throw new Error(`READ_ERROR ${table} selectAll ${error.message}`)
        out.push(...(data || []))
        if (!data || data.length < PAGE) break
      }
      return out
    },
  }
}

function createLiveReader(url, anonKey) {
  return createLiveReaderFromClient(createClient(url, anonKey))
}

function createFixtureReader(fixtureObj) {
  return {
    kind: 'fixture',
    async getRow(table, id) { return fixtureObj[`${table}:${id}`] ?? null },
    async countWordsForUnit(unitId) { return fixtureObj[`words_count:${unitId}`] ?? 0 },
    async headCountFiltered(table, filters) {
      const key = `count:${table}:${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(',')}`
      if (fixtureObj[`missing:${table}`]) return { count: 0, tableMissing: true }
      return { count: fixtureObj[key] ?? 0, tableMissing: false }
    },
    async selectAllRows(table) { return fixtureObj[`rows:${table}`] ?? [] },
  }
}

// B5(2026-09-04) — invariants delta 미리보기용 스냅샷을 이미 존재하는
// `reader`(live/fixture/test 어디든 공통) 의 selectAllRows() 만으로 만든다.
// scripts/lib/prodDataLoader.mjs의 loadProductionSnapshot() 처럼 새 HTTP
// 로더를 또 만들지 않고, prodHotfix 가 이미 갖고 있는 reader 추상화를 그대로
// 재사용한다(라이브 CLI 경로는 아래 isMain 에서 buildInvariantSnapshotFromReader
// 를 실제 loadInvariantSnapshot 로 주입, 테스트는 자기 reader/픽스처로 검증).
// class_textbooks 는 PK 가 복합키라 id 컬럼이 없어 이 reader.selectAllRows
// (정렬 기준 id 고정)로 가져올 수 없다 — TEXTBOOK_UNREACHABLE/
// STUDENT_TEXTBOOK_SELECTOR_EMPTY 두 invariant 는 이 delta 미리보기에서
// 항상 연결 0건으로 평가된다(알려진 갭, 나머지 invariant 는 정상 커버 —
// 이 두 코드 전용 새 HTTP 로더를 추가하는 대신 감수한 트레이드오프).
async function buildInvariantSnapshotFromReader(reader) {
  const [students, classes, textbooks, units, words, assignments] = await Promise.all([
    reader.selectAllRows('students', ['id', 'name', 'class_id', 'current_unit_id', 'unit_name']),
    reader.selectAllRows('classes', ['id', 'name', 'spelling_direction', 'class_type']),
    reader.selectAllRows('textbooks', ['id', 'name', 'owner_class_id']),
    reader.selectAllRows('units', ['id', 'name', 'textbook_id', 'class_id']),
    reader.selectAllRows('words', ['id', 'unit_id', 'word', 'meaning']),
    reader.selectAllRows('student_class_assignments', ['id', 'student_id', 'class_id', 'textbook_id', 'is_primary', 'current_unit_id', 'created_at']),
  ])
  return { students, classes, textbooks, units, words, assignments, classTextbooks: [] }
}

async function safeRun(executor, sql) {
  try {
    const res = await executor.run(sql)
    if (res && res.ok === false) return { ok: false, error: res.error || 'executor 실패(사유 미상)' }
    return { ok: true, rows: res?.rows }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

async function readPlanMismatches(reader, plan) {
  const mismatches = []
  for (const item of plan) {
    // B4(2026-09-04) — SCA insert/delete 전용 계획 항목. 'no-duplicate' 는
    // insert 전 "같은 student_id+textbook_id 행이 이미 없어야 함" 선조건,
    // 'not-exists' 는 delete 후 "그 id 행이 더는 없어야 함" 확인이다. 둘 다
    // item.expect 가 없다(비교할 컬럼 값이 아니라 존재 여부 자체가 판정
    // 대상) — 기존 expect 기반 분기와는 별도로 처리한다.
    if (item.kind === 'no-duplicate') {
      const r = await reader.headCountFiltered(item.table, item.filters)
      if (r.count > 0) mismatches.push({ table: item.table, id: item.id, reason: 'duplicate-row-exists', filters: item.filters, count: r.count })
      continue
    }
    if (item.kind === 'not-exists') {
      const row = await reader.getRow(item.table, item.id, ['id'])
      if (row) mismatches.push({ table: item.table, id: item.id, reason: 'row-still-exists' })
      continue
    }
    const row = await reader.getRow(item.table, item.id, Object.keys(item.expect))
    if (!row) { mismatches.push({ table: item.table, id: item.id, reason: 'row-not-found' }); continue }
    for (const [col, val] of Object.entries(item.expect)) {
      if (row[col] !== val) mismatches.push({ table: item.table, id: item.id, column: col, expected: val, actual: row[col] })
    }
    if (item.minWords != null) {
      const wc = await reader.countWordsForUnit(item.id)
      if (wc < item.minWords) mismatches.push({ table: item.table, id: item.id, column: 'words_count', expected: `>=${item.minWords}`, actual: wc })
    }
  }
  return mismatches
}

const defaultDeps = {
  fs,
  loadEnv: loadEnvDefault,
  createLiveReader,
  createFixtureReader,
  // C3(2026-09-05) — SQL 생성기를 D 로 노출한다(기본값은 순수 import 그대로,
  // 동작 변화 없음). 테스트가 이 두 함수만 감싸 SET/WHERE/행 수가 다른 SQL을
  // 돌려주는 stub 을 주입하면, verifyWriteDriftGuard 배선(6.5단계)이 실제로
  // 그 드리프트를 잡아 STOP 하는지 네트워크 0으로 검증할 수 있다.
  buildApplySql,
  buildRollbackSql,
  createExecutor: ({ kind, projectRef, accessToken }) => {
    if (kind === 'management-api') return createManagementApiExecutor({ projectRef, accessToken })
    return createDryRunExecutor()
  },
  // C3(2026-09-05) — 각 단계 진입 시 호출되는 선택적 훅(기본 no-op, 기존
  // 어떤 호출부도 이 값을 넘기지 않으므로 동작이 전혀 바뀌지 않는다).
  // scripts/testProdHotfix.mjs 가 이 훅으로 단계 순서를 배열로 수집해
  // 고정 순서(READ-ONLY preflight → ... → health)를 단언한다.
  onStep: () => {},
  isTTY: () => !!process.stdin.isTTY,
  runHealthCheck: () => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const res = spawnSync(npmCmd, ['run', 'health:students'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
    return { ok: res.status === 0, output: `${res.stdout || ''}${res.stderr || ''}` }
  },
  now: () => new Date(),
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text ?? '')).digest('hex')
}

// fix/harness-apply-two-phase-approval(2026-09-05) — 임의 JSON 값(주로
// report.baseline)의 안정적 fingerprint. JSON.stringify 는 객체 키 순서를
// "삽입 순서"로 보존하는데, report.baseline 은 항상 이 파일 안에서 같은
// 순서로 조립되므로(baselineCounts → tableMissing → snapshot) 같은 논리적
// 상태에는 항상 같은 문자열이 나온다 — 정렬까지 다시 구현할 필요 없음.
function sha256Any(value) {
  return sha256Text(JSON.stringify(value))
}

// 승인 티켓 유효기간(15분) — 이 시간이 지나면 --approve 는 approval-expired
// 로 STOP 하고, 1단계를 다시 실행해 새 티켓을 받아야 한다.
const TICKET_TTL_MS = 15 * 60 * 1000

// plan-eligibility-textbook-identity 트랙(2026-09-05) — apply_eligibility
// 8값 enum(추가만, opsStatus.mjs 의 STANDARD_STATUS 4값과는 별개 — 그건
// 절대 안 바꾼다). runHotfix() 의 status 문자열은 STOP 사유별로 수십 종
// 존재하는데, 예전엔 그중 일부만 runPlan() 이 개별 if/else 로 분류하고
// 나머지 전부를 "else BLOCKED_NEEDS_APPROVAL" 로 뭉뚱그렸다(실제 차단
// 원인과 무관하게). 이 표는 그 STOP 사유 문자열 -> apply_eligibility 를
// 명시적으로 1:1 대응시키는 **단일 원천**이다 — runPlan() 도, 아래
// computeStandardStatus() 도 이 표 하나만 본다(다른 곳에서 각자 분류
// 로직을 새로 만들지 않는다).
//
// 값 뜻:
// - READY: 이 계획을 그대로 적용해도(승인만 하면) 통과한다.
// - BLOCKED_PREFLIGHT: 라이브 상태가 manifest 의 expect_before 와 다름
//   (이미 적용됐거나 그 사이 값이 바뀜) — preflight/baseline 읽기 단계.
//   class_id 변경 전용 라이브 가드(unique 충돌/must_not_change 커버리지
//   누락/owner_class_id 불일치, class-id-change-check 단계)도 이 계열이다.
// - BLOCKED_NEEDS_APPROVAL: 다른 문제는 전혀 없고 "승인만 남은" 상태
//   (토큰 없음/CI/비TTY/승인 문구 불일치).
// - BLOCKED_WRITE_DRIFT: VERIFY(읽기 계획)와 WRITE(생성된 SQL)가 구조적으로
//   어긋남(verifyWriteDriftGuard).
// - BLOCKED_INVARIANT: 이 manifest 를 적용하면 저장소 전체 invariant 가
//   새로 FAIL 하거나(blocked-invariant), 그 계산 자체가 실패함(불가능 확인
//   = 차단, blocked-invariant-unavailable).
// - BLOCKED_AMBIGUOUS_TEXTBOOK: 대상 교재가 이름 중복/유사 모호 쌍의
//   일원인데 textbook_identity ack 가 없거나 라이브 값과 어긋남(작업 2).
// - BLOCKED_MANIFEST: manifest 자체(스키마/서술 lint/정적 스캔/무결성/
//   환경 플래그·project_ref/롤백 대조)의 구조적 문제 — 라이브 DB 상태와
//   무관하게 정적으로 판정 가능한 차단.
// - BLOCKED_UNKNOWN: 이 표에 등록되지 않은 status(새 STOP 사유가 추가됐는데
//   분류를 깜빡한 경우) — fail-closed, 표준 상태는 항상 FAIL.
//
// fix/harness-apply-two-phase-approval(2026-09-05) — 2단계 승인 게이트가
// readline 기반 단일 프롬프트를 대체하면서 새 STOP 사유 6종이 추가됐다
// ('not-approved' 는 readline 문구 비교 전용이라 더는 발생하지 않아 표에서
// 제거 — 완전성 가드 테스트는 "발생하는 status 가 표에 있는가"만 보므로
// 안전):
// - ticket-issued: 1단계(--approve 없이) 완료 — 승인 티켓 발급, DB WRITE 0.
//   대기 상태일 뿐 다른 차단 사유가 전혀 없으므로 READY.
// - approval-mismatch: --approve 로 지정한 runId 에 대응하는 티켓 파일이
//   없음(잘못된 runId 를 타이핑했거나 1단계를 먼저 실행하지 않음).
// - approval-used: 티켓이 이미 사용됨(1회성 — 재사용 시도).
// - approval-expired: 티켓 발급 후 15분 초과.
// - approval-manifest-mismatch: 티켓 발급 이후 manifest 파일 내용이 바뀜
//   (sha256 불일치) — manifest-tampered 와 같은 계열이라 BLOCKED_MANIFEST.
// - approval-stale: 티켓 발급 이후 재확인한 preflight/baseline fingerprint
//   가 달라짐(그 사이 라이브 상태가 드리프트) — preflight-mismatch/
//   baseline-failed 와 같은 계열이라 BLOCKED_PREFLIGHT.
export const APPLY_ELIGIBILITY_VALUES = [
  'READY',
  'BLOCKED_PREFLIGHT',
  'BLOCKED_NEEDS_APPROVAL',
  'BLOCKED_WRITE_DRIFT',
  'BLOCKED_INVARIANT',
  'BLOCKED_AMBIGUOUS_TEXTBOOK',
  'BLOCKED_MANIFEST',
  'BLOCKED_UNKNOWN',
]

// 'ready-to-apply' 는 표에 없다(dryRun/stopReasons 에 따라 READY 또는
// BLOCKED_NEEDS_APPROVAL 로 갈리는 유일한 컨텍스트-의존 status — 아래
// computeApplyEligibility() 가 특수 처리한다). 'applied'/'apply-failed'/
// 'rolled-back'/'rollback-failed' 는 승인 이후(실제 실행 시도) 도달하는
// 종결 상태라 "적용해도 되는가" 라는 사전 질문 자체가 더는 의미가 없다 —
// applied 는 이미 끝났다는 뜻에서 READY, 나머지 셋(실행 중 실패/롤백)은
// 사전 정의된 8개 차단 범주 중 어디에도 안 맞아 BLOCKED_UNKNOWN 으로 명시
// 등록한다(누락이 아니라 "이 표의 분류 범위 밖" 이라는 의식적 표시).
export const STOP_REASON_TO_APPLY_ELIGIBILITY = {
  'not-interactive': 'BLOCKED_NEEDS_APPROVAL',
  'ticket-issued': 'READY',
  'approval-mismatch': 'BLOCKED_NEEDS_APPROVAL',
  'approval-used': 'BLOCKED_NEEDS_APPROVAL',
  'approval-expired': 'BLOCKED_NEEDS_APPROVAL',
  'approval-manifest-mismatch': 'BLOCKED_MANIFEST',
  'approval-stale': 'BLOCKED_PREFLIGHT',
  'preflight-mismatch': 'BLOCKED_PREFLIGHT',
  'baseline-failed': 'BLOCKED_PREFLIGHT',
  // fix/harness-allowlist-sca-class-id(2026-09-06) — class_id 변경 전용
  // 라이브 가드 3종. 전부 "라이브 데이터를 다시 읽어야만 판정 가능한
  // 선행조건"이라는 점에서 preflight-mismatch/baseline-failed 와 같은
  // 계열(BLOCKED_PREFLIGHT)로 분류한다(정적 스키마 문제인 BLOCKED_MANIFEST
  // 와 구분 — class_id_policy 필드 누락 등 순수 구조 문제는 validateManifest
  // 가 invalid-manifest 로 이미 걸러낸다).
  'preflight-unique-conflict': 'BLOCKED_PREFLIGHT',
  'preflight-sca-other-rows-uncovered': 'BLOCKED_PREFLIGHT',
  'class-id-not-owner': 'BLOCKED_PREFLIGHT',
  'blocked-class-id-check-unavailable': 'BLOCKED_PREFLIGHT',
  'blocked-write-drift': 'BLOCKED_WRITE_DRIFT',
  'blocked-invariant': 'BLOCKED_INVARIANT',
  'blocked-invariant-unavailable': 'BLOCKED_INVARIANT',
  'blocked-ambiguous-textbook': 'BLOCKED_AMBIGUOUS_TEXTBOOK',
  'blocked-ambiguous-textbook-unavailable': 'BLOCKED_AMBIGUOUS_TEXTBOOK',
  'invalid-run-id': 'BLOCKED_MANIFEST',
  'invalid-manifest': 'BLOCKED_MANIFEST',
  'manifest-sha-mismatch': 'BLOCKED_MANIFEST',
  'manifest-tampered': 'BLOCKED_MANIFEST',
  'env-flag-required': 'BLOCKED_MANIFEST',
  'env-mismatch': 'BLOCKED_MANIFEST',
  'unsafe-sql': 'BLOCKED_MANIFEST',
  'rollback-of-report-load-failed': 'BLOCKED_MANIFEST',
  'rollback-of-mismatch': 'BLOCKED_MANIFEST',
  applied: 'READY',
  'apply-failed': 'BLOCKED_UNKNOWN',
  'rollback-failed': 'BLOCKED_UNKNOWN',
  'rolled-back': 'BLOCKED_UNKNOWN',
}

/**
 * status 문자열(+ dryRun/stopReasons 컨텍스트) -> apply_eligibility 8값.
 * 순수 함수, network/IO 없음. runPlan() 은 이 함수가 만든 report.
 * apply_eligibility 를 그대로 재사용하고(재계산하지 않음), computeStandardStatus()
 * 도 이 함수 하나로 4값을 유도한다(같은 표를 공유 — 서로 다른 판정 로직이
 * 갈라지지 않도록).
 * @returns {typeof APPLY_ELIGIBILITY_VALUES[number]}
 */
export function computeApplyEligibility({ status, dryRun, stopReasons }) {
  if (status === 'ready-to-apply') {
    const reasons = stopReasons || []
    if (!dryRun && (reasons.includes('SUPABASE_ACCESS_TOKEN 미설정') || reasons.includes('CI 환경'))) {
      return 'BLOCKED_NEEDS_APPROVAL'
    }
    return 'READY'
  }
  if (Object.prototype.hasOwnProperty.call(STOP_REASON_TO_APPLY_ELIGIBILITY, status)) {
    return STOP_REASON_TO_APPLY_ELIGIBILITY[status]
  }
  return 'BLOCKED_UNKNOWN'
}

// C2(2026-09-04) — runHotfix() 의 status 문자열(수십 종, apply-failed/
// preflight-mismatch/blocked-invariant/ready-to-apply/...)을 사람/자동화가
// 공통으로 볼 수 있는 4값 enum 으로 압축한다. 순수 함수(입력만으로 결정) —
// 어디서도 network/IO 를 하지 않는다.
// - PASS: dry-run/plan 모드에서 모든 게이트를 통과(ready-to-apply)했거나,
//   실제 적용까지 성공(applied)했을 때(경고성 invariant WARN 이 없을 때).
// - WARN: PASS 와 같은 상태지만 invariants delta 에 new_warn 이 있을 때.
// - BLOCKED_NEEDS_APPROVAL: dry-run 이 아닌 실제 적용 시도인데 토큰
//   없음/CI 라서 승인 게이트 이전에 멈췄을 때(status 자체는 ready-to-apply
//   와 같지만 "계획 확인"이 아니라 "적용 시도"라는 의도가 다르다).
// - FAIL: 그 외 모든 차단/실패 상태(전부 fail-closed 기본값).
// plan-eligibility-textbook-identity 트랙(2026-09-05) — 이 함수의 4값
// 출력/기존 12개 회귀 케이스는 절대 바뀌지 않는다(검증 완료 — 아래는 순수
// 리팩터: 자체 조건 대신 computeApplyEligibility() 하나로 위임해 "같은
// 표를 쓰게" 만든 것뿐이다. READY -> PASS/WARN, BLOCKED_NEEDS_APPROVAL 은
// 그대로, 그 외 전부 FAIL — 원래 로직과 출력이 1:1 대응됨을 확인함).
export function computeStandardStatus({ status, dryRun, stopReasons, hasNewWarn }) {
  const eligibility = computeApplyEligibility({ status, dryRun, stopReasons })
  if (eligibility === 'READY') return hasNewWarn ? 'WARN' : 'PASS'
  if (eligibility === 'BLOCKED_NEEDS_APPROVAL') return 'BLOCKED_NEEDS_APPROVAL'
  return 'FAIL'
}

function writeReportFile(D, reportDir, runId, report, secretEnv) {
  D.fs.mkdirSync(reportDir, { recursive: true })
  const p = path.join(reportDir, `${runId}.hotfix.json`)
  const raw = JSON.stringify(report, null, 2)
  const redacted = redactSecrets(redactSecrets(raw, secretEnv || {}), process.env)
  D.fs.writeFileSync(p, redacted, 'utf8')
  return p
}

/**
 * 핵심 로직. CLI 진입점과 분리되어 deps 주입으로 전체 흐름을 network 0
 * 으로 검증할 수 있다(scripts/testProdHotfix.mjs).
 * mode 는 options.rollbackOfReportPath 유무로 결정된다('apply' 기본,
 * 'rollback-of' — 이전 hotfix 를 되돌리는 모드). 두 모드는 forward/backward
 * SQL 과 프리/포스트플라이트 확인 방향만 바뀔 뿐, 게이트·승인 절차는
 * 완전히 같은 코드 경로를 공유한다.
 * @param {object} options
 * @param {object} [deps]
 * @returns {Promise<{status:string, exitCode:number, report:object}>}
 */
export async function runHotfix(options, deps = {}) {
  const D = { ...defaultDeps, ...deps }
  const startedAt = D.now().toISOString()
  // fix/harness-apply-two-phase-approval(2026-09-05) — 2단계(--approve
  // <runId>) 는 1단계가 발급한 티켓과 같은 runId 로 처음부터 다시 실행돼야
  // 한다(같은 apply/rollback SQL 파일, 같은 dollar-quote 태그). 그래서
  // options.approveRunId 가 있으면 그 값을 runId 로 그대로 쓴다 — 별도로
  // options.runId 를 또 맞춰 넘길 필요가 없다(CLI 는 --approve 값 하나만
  // runId 로 사용, isMain 참고).
  const runId = options.approveRunId || options.runId || makeRunId(D.now())
  const reportDir = options.reportDir || path.join(ROOT, 'scripts', '.tmp', 'prod-reports')

  // 비밀값 마스킹 대상 env — D.loadEnv() 로드 전엔 빈 객체(2단계에서 채움).
  // process.env 는 매 호출마다 항상 함께 스캔한다(운영 환경 실제 방어선).
  let secretEnv = {}
  function log(...args) {
    const text = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')
    console.log(redactSecrets(redactSecrets(text, secretEnv), process.env))
  }
  function logErr(...args) {
    const text = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')
    console.error(redactSecrets(redactSecrets(text, secretEnv), process.env))
  }

  const report = {
    runId,
    startedAt,
    manifestId: null,
    projectRef: null,
    projectRefHost: null,
    mode: 'apply',
    status: 'unknown',
  }

  function finish(status, exitCode, extra = {}) {
    report.status = status
    report.finishedAt = D.now().toISOString()
    Object.assign(report, extra)
    const stopReasonsForEligibility = extra.stopReasons || report.stopReasons || []
    report.standardStatus = computeStandardStatus({
      status,
      dryRun: !!options.dryRun,
      stopReasons: stopReasonsForEligibility,
      hasNewWarn: ((extra.invariantsDelta || report.invariantsDelta)?.new_warn?.length || 0) > 0,
    })
    // plan-eligibility-textbook-identity 트랙(2026-09-05) — blocked_reason
    // 은 "원래 status 문자열"(사람이 grep 할 수 있는 원인 그대로), apply_
    // eligibility 는 위 공유 표로 분류한 8값. 기존 필드(status/standardStatus)
    // 는 삭제하지 않고 둘 다 추가만 한다.
    report.blocked_reason = status
    report.apply_eligibility = computeApplyEligibility({ status, dryRun: !!options.dryRun, stopReasons: stopReasonsForEligibility })
    const reportPath = writeReportFile(D, reportDir, runId, report, secretEnv)
    report.reportPath = reportPath
    log(`\nSTATUS: ${status}`)
    // QA-V2(2026-09-04): dry-run 의 PASS 는 "계획이 통과했다"는 뜻이지 "적용
    // 했다"는 뜻이 아니다 — 콘솔에서 둘을 혼동하지 않도록 표시만 덧붙인다
    // (report.standardStatus 값 자체는 그대로 PASS/WARN/FAIL 4값 enum 유지).
    log(`STANDARD_STATUS: ${report.standardStatus}${options.dryRun ? ' (DRY-RUN — 실제 적용 아님)' : ''}`)
    log(`DB WRITE: ${extra.dbWriteCount ?? report.dbWriteCount ?? 0}`)
    if (options.jsonOutput) {
      console.log(redactSecrets(redactSecrets(JSON.stringify(report), secretEnv), process.env))
    }
    return { status, exitCode, report }
  }

  // 0.5) run-id 형식 게이트(QA-V2, 2026-09-04) — runId 는 생성 SQL 의
  // dollar-quote 태그($hotfix_<runId>$)와 ABORT 메시지에 그대로 실린다.
  // 하네스가 만든 값(YYYYMMDDHHmmss-hex)은 항상 영숫자/하이픈이지만,
  // 호출부가 임의 문자열을 주입할 수 있으므로 여기서 fail-closed 로 막는다
  // (마지막 방어선은 hotfixManifest.dollarQuoteTag 의 throw).
  if (!/^[A-Za-z0-9_-]+$/.test(String(runId))) {
    logErr(`FAIL — run-id 형식 위반(영숫자/하이픈/언더스코어만 허용): ${JSON.stringify(runId)}`)
    return finish('invalid-run-id', 1, { dbWriteCount: 0 })
  }

  // 1) manifest 로드·검증(+ sha256 기록 — 변조 감지의 기준값)
  D.onStep('manifest-load')
  let manifest = options.manifest
  let manifestRawText = null
  if (!manifest) {
    if (!options.manifestPath) return finish('invalid-manifest', 1, { errors: ['manifestPath 또는 manifest 옵션 필요'] })
    try {
      manifestRawText = D.fs.readFileSync(options.manifestPath, 'utf8')
      manifest = JSON.parse(manifestRawText)
    } catch (err) {
      logErr(`FAIL — manifest 파일 로드 실패: ${err.message}`)
      return finish('invalid-manifest', 1, { errors: [`manifest 파일 로드 실패: ${err.message}`] })
    }
  } else {
    manifestRawText = JSON.stringify(manifest)
  }
  const manifestSha256 = sha256Text(manifestRawText)
  report.manifestSha256 = manifestSha256
  report.manifestId = manifest?.id ?? null
  report.projectRef = manifest?.project_ref ?? null

  if (options.expectManifestSha && options.expectManifestSha !== manifestSha256) {
    logErr(`FAIL — --expect-manifest-sha 불일치: 기대=${options.expectManifestSha} 실제=${manifestSha256}`)
    return finish('manifest-sha-mismatch', 1, { expectManifestSha: options.expectManifestSha })
  }

  const validation = validateManifest(manifest)
  if (!validation.valid) {
    logErr('FAIL — manifest 검증 실패:')
    for (const e of validation.errors) logErr(`  - ${e}`)
    return finish('invalid-manifest', 1, { errors: validation.errors })
  }
  report.expectedRows = manifest.changes.length

  // 1.5) --env production|staging 플래그 게이트(가장 먼저 — 프로젝트 혼동 방지)
  D.onStep('env-flag')
  if (!ENV_FLAG_VALUES.includes(options.envFlag)) {
    logErr(`FAIL — --env production|staging 플래그가 필요합니다(받은 값: ${JSON.stringify(options.envFlag ?? null)})`)
    return finish('env-flag-required', 1, {})
  }

  // rollback-of 모드: 이전 실행 보고서의 manifestId/manifest sha256 을 대조해
  // "당시 적용된 것과 동일한 manifest" 로만 되돌리기를 허용한다.
  let rollbackOfSourceReport = null
  if (options.rollbackOfReportPath) {
    try {
      rollbackOfSourceReport = JSON.parse(D.fs.readFileSync(options.rollbackOfReportPath, 'utf8'))
    } catch (err) {
      logErr(`FAIL — --rollback-of 보고서 로드 실패: ${err.message}`)
      return finish('rollback-of-report-load-failed', 1, { errors: [err.message] })
    }
    if (rollbackOfSourceReport.manifestId !== manifest.id) {
      logErr(`FAIL — --rollback-of 보고서의 manifestId(${rollbackOfSourceReport.manifestId})가 현재 manifest.id(${manifest.id})와 다릅니다`)
      return finish('rollback-of-mismatch', 1, {})
    }
    if (rollbackOfSourceReport.manifestSha256 && rollbackOfSourceReport.manifestSha256 !== manifestSha256) {
      logErr('FAIL — --rollback-of 보고서의 manifest sha256 이 현재 manifest 파일과 다릅니다(당시 적용된 것과 다른 manifest)')
      return finish('rollback-of-mismatch', 1, {})
    }
  }
  const mode = rollbackOfSourceReport ? 'rollback-of' : 'apply'
  report.mode = mode
  if (rollbackOfSourceReport) report.rollbackOfSourceRunId = rollbackOfSourceReport.runId

  // 2) 환경(project_ref) 게이트
  D.onStep('env-ref')
  const env = D.loadEnv()
  secretEnv = env
  report.projectRefHost = env.url ? hostFromUrl(env.url) : null
  const envRef = env.url ? refFromUrl(env.url) : null
  if (!envRef || envRef !== manifest.project_ref) {
    logErr(`FAIL — 환경 project_ref 불일치: 로컬 .env=${envRef || '(없음)'} vs manifest=${manifest.project_ref}`)
    return finish('env-mismatch', 2)
  }
  const ciForced = !!env.ci
  if (ciForced) log('CI 환경 감지(process.env.CI 또는 GITHUB_ACTIONS) — write path 영구 비활성(dry-run 강제, --env 값과 무관)')
  // fix/harness-apply-two-phase-approval(2026-09-05) — "토큰 편의": 값은
  // 절대 로깅하지 않고, 어디서 읽었는지(출처)만 안내한다.
  if (env.accessToken) log(`SUPABASE_ACCESS_TOKEN 출처: ${env.accessTokenSource || '(불명)'}`)

  // 3) 정적 안전 스캔 (apply/rollback SQL 은 이 시점에 이미 순수 함수로 생성 가능)
  D.onStep('static-scan')
  const applySql = D.buildApplySql(manifest, runId)
  const rollbackSql = D.buildRollbackSql(manifest, runId)
  // QA-V2(2026-09-04): manifest 를 함께 넘겨 narrative-drift 도 이 단계에서
  // 한 번 더 본다(예전엔 인자를 아예 안 넘겨 staticSafetyScan 의 manifest
  // 분기가 이 경로에서는 죽은 코드였다). rollback SQL 쪽은 같은 manifest 라
  // 중복 보고를 피하려고 SQL 만 스캔한다.
  const violations = [...staticSafetyScan(applySql, manifest), ...staticSafetyScan(rollbackSql)]
  if (violations.length) {
    logErr('FAIL — 정적 안전 스캔 위반(파괴적 키워드 감지):')
    for (const v of violations) logErr(`  line ${v.line}: ${v.text} (${v.match})`)
    return finish('unsafe-sql', 1, { violations })
  }
  log('정적 안전 스캔 PASS(파괴적 키워드 0건) — apply/rollback SQL 생성 완료')

  // mode 에 따라 forward(이번에 실행)/backward(실패 시 자동 복구) SQL 결정
  const forwardSql = mode === 'apply' ? applySql : rollbackSql
  const backwardSql = mode === 'apply' ? rollbackSql : applySql

  // 4) 프리플라이트(읽기 전용) — apply 모드는 expect_before(적용 전) 값,
  //    rollback-of 모드는 set(적용 후) 값이 현재 DB 상태와 일치하는지 확인
  D.onStep('preflight')
  let reader
  if (options.reader) {
    reader = options.reader
  } else if (options.fixtureReaderPath) {
    const fixtureObj = JSON.parse(D.fs.readFileSync(options.fixtureReaderPath, 'utf8'))
    reader = D.createFixtureReader(fixtureObj)
  } else {
    reader = D.createLiveReader(env.url, env.anonKey)
  }

  const preflightPlanFull = buildPreflightPlan(manifest)
  const postflightPlanCore = buildPostflightPlan(manifest)
  const forwardPreflightPlan = mode === 'apply' ? preflightPlanFull : postflightPlanCore
  // 롤백/rollback-of 후 "원 상태로 돌아왔는지" 재확인 시 공용으로 쓰는 계획
  // (reference_rows_must_exist 의 min_words 항목은 정적 참조 확인이라 제외)
  const revertVerifyPlan = preflightPlanFull.filter((i) => i.minWords == null)

  const preflightMismatches = await readPlanMismatches(reader, forwardPreflightPlan)
  if (preflightMismatches.length) {
    logErr('FAIL-CLOSED — 프리플라이트 불일치(현재 DB 상태가 manifest 의 기대값과 다름):')
    for (const m of preflightMismatches) {
      logErr(`  ${m.table}:${m.id} ${m.column ?? ''} 기대=${JSON.stringify(m.expected ?? m.reason)} 실제=${JSON.stringify(m.actual ?? '')}`)
    }
    return finish('preflight-mismatch', 1, { mismatches: preflightMismatches })
  }
  log('프리플라이트 PASS — 현재 상태가 manifest 의 기대값과 일치')

  // 4.5) 작업2(b)(2026-09-05, plan-eligibility-textbook-identity) — 교재
  // identity 모호성 사전 차단(fail-closed). manifest 의 change 가 textbook_id
  // 를 직접 설정/삽입하거나 current_unit_id 를 설정해 그 유닛의 교재가
  // 바뀌는 경우, 대상 교재가 라이브 데이터에서 모호 쌍(이름 완전중복 또는
  // 유사명+같은 출판사)의 일원이면 명시적 textbook_identity ack(정확한
  // id/name/publisher_name 이 라이브 값과 전부 일치) 없이는 통과시키지
  // 않는다. preflight(읽기) 직후, invariants delta(5.5) 이전에 둔다 —
  // 교재 목록 조회 자체가 실패하면 "모호 여부를 확인 못 함" = 차단
  // (blocked-ambiguous-textbook-unavailable, fail-closed).
  D.onStep('ambiguous-textbook-check')
  {
    const textbookTargets = findTextbookTargetsFromManifest(manifest)
    if (textbookTargets.length) {
      let liveTextbooks
      try {
        liveTextbooks = await reader.selectAllRows('textbooks', ['id', 'name', 'publisher_name'])
      } catch (err) {
        logErr(`FAIL-CLOSED — 교재 목록 조회 실패(모호 교재 확인 불가, 적용 차단): ${err.message}`)
        return finish('blocked-ambiguous-textbook-unavailable', 1, { ambiguousTextbookError: err.message, dbWriteCount: 0 })
      }
      const ambiguousIndex = buildAmbiguousTextbookIndex(liveTextbooks)
      const liveTextbookById = new Map(liveTextbooks.map((t) => [t.id, t]))
      const flagged = []
      for (const target of textbookTargets) {
        let textbookId = target.textbookId
        if (target.kind === 'via-unit') {
          let unitRow
          try {
            unitRow = await reader.getRow('units', target.unitId, ['textbook_id'])
          } catch (err) {
            logErr(`FAIL-CLOSED — 유닛 조회 실패(모호 교재 확인 불가, 적용 차단): ${err.message}`)
            return finish('blocked-ambiguous-textbook-unavailable', 1, { ambiguousTextbookError: err.message, dbWriteCount: 0 })
          }
          textbookId = unitRow?.textbook_id ?? null
        }
        if (!textbookId) continue
        const partners = ambiguousIndex.get(textbookId)
        if (partners && partners.size) {
          flagged.push({ table: target.table, id: target.id, textbookId, ambiguousWith: [...partners] })
        }
      }
      if (flagged.length) {
        const ackByChangeKey = new Map()
        for (const c of manifest.changes || []) {
          if (c.textbook_identity) ackByChangeKey.set(`${c.table}:${c.id}`, c.textbook_identity)
        }
        const unresolved = flagged.filter((f) => {
          const ack = ackByChangeKey.get(`${f.table}:${f.id}`)
          const liveTb = liveTextbookById.get(f.textbookId)
          // UUID 가 canonical — id 가 정확히 일치해야만 ack 로 인정한다(이름
          // 만 주고 id 가 다르거나 없는 ack 는 무효, 요구사항 그대로).
          return !(ack && liveTb && ack.id === f.textbookId
            && ack.name === liveTb.name
            && (ack.publisher_name ?? null) === (liveTb.publisher_name ?? null))
        })
        if (unresolved.length) {
          logErr('FAIL-CLOSED — 모호한 교재(이름 중복/유사) 대상 변경이 textbook_identity ack 없이 시도됨:')
          for (const f of unresolved) {
            logErr(`  ${f.table}:${f.id} 교재 ${String(f.textbookId).slice(0, 8)}… (모호 상대: ${f.ambiguousWith.map((x) => `${String(x).slice(0, 8)}…`).join(', ')})`)
          }
          return finish('blocked-ambiguous-textbook', 1, { ambiguousTextbookTargets: unresolved, dbWriteCount: 0 })
        }
        log(`교재 identity 모호성 확인 PASS — 대상 ${flagged.length}건 전부 textbook_identity ack 로 명시 확인됨`)
      }
    }
  }

  // 4.6) fix/harness-allowlist-sca-class-id(2026-09-06) — class_id 변경
  // 전용 라이브 가드(fail-closed). ALLOWLIST/validateManifest 는 구조적
  // 검증(정책 필드 명시/expect_before.student_id·textbook_id 존재/
  // reference_rows_must_exist 등록)까지만 하고, 여기서 그 위에 라이브
  // 데이터로만 판정 가능한 3가지를 재확인한다:
  //  (a) unique(student_id,class_id) 충돌 — 같은 학생의 다른 SCA 행이 이미
  //      목표 class_id 를 가지면 STOP.
  //  (b) 같은 학생의 다른 SCA 행 전부가 must_not_change 에 있는가 — 없으면
  //      "이 학생의 SCA 전체 그림을 모른 채 class_id 만 바꾸는" 것이므로 STOP.
  //  (c) 대상 textbook_id 의 owner_class_id 가 목표 class_id 와 일치하는가
  //      (교재 컨테이너 반 규칙) — 다르면 STOP(class-id-not-owner).
  // ambiguous-textbook-check 와 같은 위치(preflight 직후, baseline 이전)에
  // 둔다 — 승인 게이트 훨씬 이전이라 걸리면 DB WRITE 0.
  D.onStep('class-id-change-check')
  {
    const classIdChanges = (manifest.changes || []).filter(
      (c) => (c.op || 'update') === 'update' && c.table === 'student_class_assignments'
        && c.set && typeof c.set === 'object' && Object.prototype.hasOwnProperty.call(c.set, 'class_id'),
    )
    if (classIdChanges.length) {
      let liveSca
      try {
        liveSca = await reader.selectAllRows('student_class_assignments', ['id', 'student_id', 'class_id', 'textbook_id', 'is_primary', 'current_unit_id'])
      } catch (err) {
        logErr(`FAIL-CLOSED — class_id 변경 가드용 SCA 조회 실패(적용 차단): ${err.message}`)
        return finish('blocked-class-id-check-unavailable', 1, { classIdCheckError: err.message, dbWriteCount: 0 })
      }
      const { uniqueConflicts, missingMustNotChange } = findClassIdChangeGuardViolations(manifest, liveSca)
      if (uniqueConflicts.length) {
        logErr('FAIL-CLOSED — class_id 변경 unique(student_id,class_id) 충돌:')
        for (const v of uniqueConflicts) logErr(`  change=${v.changeId} student=${v.studentId} target=${v.targetClassId} 기존행=${v.conflictingRowId}`)
        return finish('preflight-unique-conflict', 1, { uniqueConflicts, dbWriteCount: 0 })
      }
      if (missingMustNotChange.length) {
        logErr('FAIL-CLOSED — class_id 변경 대상 학생의 다른 SCA 행이 must_not_change 에 없음:')
        for (const v of missingMustNotChange) logErr(`  change=${v.changeId} student=${v.studentId} 누락행=${v.missingRowId}`)
        return finish('preflight-sca-other-rows-uncovered', 1, { missingMustNotChange, dbWriteCount: 0 })
      }

      let liveTextbooks
      try {
        liveTextbooks = await reader.selectAllRows('textbooks', ['id', 'owner_class_id'])
      } catch (err) {
        logErr(`FAIL-CLOSED — class_id 변경 가드용 textbook 조회 실패(적용 차단): ${err.message}`)
        return finish('blocked-class-id-check-unavailable', 1, { classIdCheckError: err.message, dbWriteCount: 0 })
      }
      const textbookById = new Map(liveTextbooks.map((t) => [t.id, t]))
      const ownerMismatches = findClassIdOwnerMismatches(manifest, textbookById)
      if (ownerMismatches.length) {
        logErr('FAIL-CLOSED — class_id 변경 대상이 textbook owner_class_id 와 다름:')
        for (const v of ownerMismatches) logErr(`  change=${v.changeId} textbook=${v.textbookId} target=${v.targetClassId} owner=${JSON.stringify(v.ownerClassId)}`)
        return finish('class-id-not-owner', 1, { ownerMismatches, dbWriteCount: 0 })
      }
      log(`class_id 변경 가드 PASS — unique 충돌 0건, must_not_change 커버리지 OK, owner_class_id 일치 ${classIdChanges.length}건`)
    }
  }

  // 5) baseline 저장(학습기록 카운트 + 무관 행 스냅샷 해시)
  // headCountFiltered 가 테이블 부재(42P01/PGRST205)를 만나면 {count:0,
  // tableMissing:true} 로 fail-open 반환한다(마이그레이션 미실행 테이블은
  // 잃을 데이터가 없다는 뜻) — 그 외 에러(예: 컬럼 없음)는 그대로 던져
  // 여기서 baseline-failed 로 STOP 한다(예전엔 미처리 예외로 크래시했다).
  D.onStep('baseline')
  const baselineCounts = {}
  const baselineTableMissing = []
  try {
    for (const sid of manifest.affected_students || []) {
      baselineCounts[sid] = {}
      for (const table of manifest.learning_baseline_tables || []) {
        const r = await reader.headCountFiltered(table, { student_id: sid })
        baselineCounts[sid][table] = r.count
        if (r.tableMissing) baselineTableMissing.push({ table, studentId: sid })
      }
    }
  } catch (err) {
    logErr(`FAIL — 학습기록 baseline 조회 실패: ${err.message}`)
    return finish('baseline-failed', 1, { baselineError: err.message })
  }
  if (baselineTableMissing.length) {
    const missingTables = [...new Set(baselineTableMissing.map((m) => m.table))]
    log(`baseline 안내 — 부재 테이블(count 0 처리, fail-open): ${missingTables.join(', ')}`)
  }
  const studentsRowsBefore = sortRows(await reader.selectAllRows('students', STUDENTS_SNAPSHOT_COLS))
  const scaRowsBefore = sortRows(await reader.selectAllRows('student_class_assignments', SCA_SNAPSHOT_COLS))
  report.baseline = {
    counts: baselineCounts,
    tableMissing: baselineTableMissing,
    snapshot: {
      students: { hash: sha256Json(studentsRowsBefore), rowCount: studentsRowsBefore.length },
      student_class_assignments: { hash: sha256Json(scaRowsBefore), rowCount: scaRowsBefore.length },
    },
  }
  log(`baseline 저장 완료 — students ${studentsRowsBefore.length}행(hash ${report.baseline.snapshot.students.hash.slice(0, 12)}…) / SCA ${scaRowsBefore.length}행(hash ${report.baseline.snapshot.student_class_assignments.hash.slice(0, 12)}…) 스냅샷 해시 기록`)

  // 5.5) B5(2026-09-04) — invariants delta 미리보기(승인 이전, fail-closed).
  // D.loadInvariantSnapshot 이 주입된 경우에만 계산한다(기본은 없음 — 이
  // 기존 30여개 시나리오를 포함해 이 인자를 안 넘기는 모든 호출은 동작이
  // 전혀 바뀌지 않는다). CLI 진입점(isMain)만 실제 라이브 구현을 넘긴다.
  // manifest 를 적용했다면 저장소 전체 관점의 invariant 가 새로 FAIL 로
  // 바뀌는지(예: primary SCA 를 실수로 2개로 만드는 것)를 개별 행 값이
  // 전부 맞더라도 승인 전에 미리 잡는다 — computeInvariantsDeltaPreview 는
  // 순수 변환이라 이 단계 자체는 DB 에 아무 것도 쓰지 않는다.
  if (typeof D.loadInvariantSnapshot === 'function') {
    D.onStep('invariants-delta')
    try {
      const snapshotBefore = await D.loadInvariantSnapshot(reader)
      const invariantsDelta = computeInvariantsDeltaPreview(snapshotBefore, manifest)
      report.invariantsDelta = invariantsDelta
      if (invariantsDelta.new_fail.length > 0) {
        logErr('FAIL-CLOSED — 이 manifest 를 적용하면 새 invariant FAIL 이 발생합니다(승인 전 차단):')
        for (const f of invariantsDelta.new_fail) logErr(`  ${f.code} ${f.studentId ?? '(유닛)'} — ${f.detail}`)
        return finish('blocked-invariant', 1, { invariantsDelta })
      }
      if (invariantsDelta.new_warn.length || invariantsDelta.resolved.length) {
        log(`invariants delta 미리보기 — new_warn ${invariantsDelta.new_warn.length}건, resolved ${invariantsDelta.resolved.length}건`)
      }
    } catch (err) {
      // QA-V2(2026-09-04) — 예전엔 이 예외를 "정보성 기능이니 계속 진행"
      // (fail-open)으로 넘겼다. 그러면 invariant 를 **확인하지 못한** 계획이
      // ready-to-apply 로 승인 대상이 된다(실측: 로더 예외 상태에서 apply 가
      // 그대로 실행됐다). 확인 불가 = 차단이 이 하네스의 기본값이므로
      // fail-closed 로 바꾼다.
      logErr(`FAIL-CLOSED — invariants delta 미리보기 계산 실패(적용 차단): ${err.message}`)
      return finish('blocked-invariant-unavailable', 1, { invariantsDeltaError: err.message, dbWriteCount: 0 })
    }
  }

  // 6) 계획 출력 + SQL 파일 저장 + rollback 메타데이터 기록
  // B4(2026-09-04) — insert/delete change 는 c.set 이 없어(fields/
  // expect_before 만 있음) 기존처럼 c.set 을 직접 순회하면 크래시한다.
  // describeChange() (hotfixManifest.mjs, 이 로직의 단일 원천)를 그대로
  // 재사용해 update/insert/delete 전부 안전하게 표시한다(재구현 금지).
  D.onStep('plan-output')
  log(mode === 'apply' ? '\n=== 변경 계획(before -> after) ===' : '\n=== 되돌리기 계획(rollback-of, 현재 -> 원복) ===')
  for (const c of manifest.changes) {
    log(`  ${c.table}:${c.id}`)
    for (const line of describeChange(c, mode === 'apply' ? 'apply' : 'rollback')) log(`    ${line}`)
  }
  log(`  예상 UPDATE 행 수: ${manifest.changes.length}`)
  if (manifest.must_not_change?.length) {
    log('  must_not_change(불변 확인 대상):')
    for (const m of manifest.must_not_change) log(`    ${m.table}:${m.id}`)
  }

  D.fs.mkdirSync(reportDir, { recursive: true })
  const applySqlPath = path.join(reportDir, `${runId}.apply.sql`)
  const rollbackSqlPath = path.join(reportDir, `${runId}.rollback.sql`)
  D.fs.writeFileSync(applySqlPath, redactSecrets(redactSecrets(applySql, secretEnv), process.env), 'utf8')
  D.fs.writeFileSync(rollbackSqlPath, redactSecrets(redactSecrets(rollbackSql, secretEnv), process.env), 'utf8')
  report.applySqlPath = applySqlPath
  report.rollbackSqlPath = rollbackSqlPath
  report.rollback = {
    sql_path: rollbackSqlPath,
    guards: manifest.changes.map((c) => ({ table: c.table, id: c.id, where: c.set })),
  }
  log(`\napply SQL 저장: ${applySqlPath}`)
  log(`rollback SQL 저장: ${rollbackSqlPath}`)

  // 6.5) C3(2026-09-05) — VERIFY==WRITE 구조적 회귀 가드(verifyWriteDriftGuard)
  // 를 런타임 FAIL-CLOSED 게이트로 배선한다. 예전엔 이 가드가
  // scripts/testProdHotfix.mjs 의 happy-path 테스트([B2])에서만 호출됐고,
  // runHotfix() 흐름 어디에서도 실행되지 않았다 — 즉 실제 프로덕션 실행에는
  // 전혀 영향을 주지 못하는 죽은 가드였다. 여기서 방금 저장한 applySql/
  // rollbackSql 그 자체(D.buildApplySql/D.buildRollbackSql 의 실제 출력)를
  // manifest.changes 의 expect_before/set 과 재대조한다 — 승인 게이트(8)와
  // dry-run STOP(7) 이전이라, 걸리면 executor.run() 은 절대 호출되지 않는다.
  D.onStep('write-drift-guard')
  const writeDriftGuard = verifyWriteDriftGuard(manifest, applySql, rollbackSql)
  report.writeDriftGuard = writeDriftGuard
  if (!writeDriftGuard.ok) {
    logErr('FAIL-CLOSED — VERIFY==WRITE 드리프트 가드 위반(생성된 SQL 이 manifest 와 구조적으로 다름):')
    for (const m of writeDriftGuard.mismatches) logErr(`  ${m.table ?? '(전체)'}:${m.id ?? ''} ${m.reason} 기대=${JSON.stringify(m.expected ?? '')} 실제=${JSON.stringify(m.actual ?? '')}`)
    return finish('blocked-write-drift', 1, { writeDriftGuard, dbWriteCount: 0 })
  }
  log('VERIFY==WRITE 드리프트 가드 PASS — 생성된 SQL 이 manifest 와 구조적으로 일치')
  log('\nREADY TO APPLY')

  // 7) --dry-run → STOP (apply·rollback-of 모드 공통). fix/harness-apply-
  // two-phase-approval(2026-09-05) — 예전엔 CI/토큰없음도 이 시점에 같이
  // STOP 했지만, 이제 "1단계(티켓 발급)는 계획이 통과했다는 사실 자체를
  // 기록하는 것"이라 CI/토큰없음이어도 발급은 막지 않는다(그 티켓은 2단계
  // 에서 CI/토큰 게이트에 다시 걸려 절대 승인될 수 없으므로 안전). 오직
  // `--dry-run`(prod:plan 이 항상 이렇게 호출)만 여기서 즉시 STOP한다 —
  // "계획만 보고 싶다"는 의도가 명시적이라 티켓조차 만들 필요가 없다.
  if (options.dryRun) {
    log('\nSTOP(정상) — write path 비활성: --dry-run')
    D.onStep('dry-run-stop')
    return finish('ready-to-apply', 0, { stopReasons: ['--dry-run'], dbWriteCount: 0 })
  }

  // 8) 2단계 승인 게이트(readline 제거, fix/harness-apply-two-phase-approval
  // 2026-09-05 — 파일 최상단 설명 참고).
  const noToken = !env.accessToken
  if (!options.approveRunId) {
    // ── 1단계: 티켓 발급 ──────────────────────────────────────────────
    D.onStep('ticket-issue')
    const nowDate = D.now()
    const ticket = {
      runId,
      manifestId: manifest.id,
      manifestSha256,
      envFlag: options.envFlag,
      projectRef: manifest.project_ref,
      // report.baseline 은 방금 5)/5.5) 단계에서 이미 라이브 상태로 채워졌다
      // (학습기록 카운트 + students/SCA 전체 스냅샷 해시) — 재조회 없이 그
      // fingerprint 만 저장해 둔다. 2단계가 이 함수를 처음부터 다시 실행하며
      // 같은 방식으로 report.baseline 을 재계산해 이 값과 대조한다.
      preflightFingerprint: sha256Any(report.baseline),
      createdAt: nowDate.toISOString(),
      expiresAt: new Date(nowDate.getTime() + TICKET_TTL_MS).toISOString(),
      used: false,
      usedAt: null,
    }
    D.fs.mkdirSync(reportDir, { recursive: true })
    const ticketFilePath = path.join(reportDir, `${runId}.ticket.json`)
    D.fs.writeFileSync(ticketFilePath, JSON.stringify(ticket, null, 2), 'utf8')
    const approveManifestArg = options.manifestPath ? path.resolve(options.manifestPath) : '<manifest.json>'
    log(`\n승인 티켓 발급 완료: ${ticketFilePath}`)
    log(`만료: ${ticket.expiresAt}(15분) — 이 시간 안에 아래 명령으로 승인하세요:`)
    log(`  npm run prod:apply -- ${approveManifestArg} --env ${options.envFlag} --approve ${runId}`)
    if (ciForced || noToken) {
      // 티켓 자체는 발급되지만(계획이 통과했다는 사실 기록), 2단계에서
      // 이 정확히 같은 사유로 다시 막혀 절대 승인될 수 없다는 것을
      // 미리 알려준다(운영자가 헷갈리지 않도록).
      const reasons = [ciForced && 'CI 환경', noToken && 'SUPABASE_ACCESS_TOKEN 미설정'].filter(Boolean)
      log(`참고 — 지금 환경에서는 2단계(--approve)도 다음 사유로 항상 STOP 됩니다: ${reasons.join(', ')}`)
    }
    log('\nSTOP(정상) — 1단계 완료, DB WRITE 없음. 승인은 위 명령을 그대로 실행하는 것 자체입니다.')
    return finish('ticket-issued', 0, { ticketPath: ticketFilePath, dbWriteCount: 0 })
  }

  // ── 2단계: CI/토큰 게이트(변경 없음, 여기서 위치만 이동) → 티켓 검증 →
  // TTY 확인 → 1회성 소모 ──────────────────────────────────────────────
  if (ciForced || noToken) {
    const reasons = []
    if (ciForced) reasons.push('CI 환경')
    if (noToken) reasons.push('SUPABASE_ACCESS_TOKEN 미설정')
    log(`\nSTOP(정상) — write path 비활성: ${reasons.join(', ')}`)
    D.onStep('dry-run-stop')
    return finish('ready-to-apply', 0, { stopReasons: reasons, dbWriteCount: 0 })
  }
  D.onStep('approval-gate')
  if (!D.isTTY()) {
    log('\nSTOP — 비대화형(TTY 아님) 환경에서는 승인을 받을 수 없습니다. --dry-run 으로 계획만 확인하세요.')
    return finish('not-interactive', 1, { dbWriteCount: 0 })
  }
  const ticketFilePath = path.join(reportDir, `${runId}.ticket.json`)
  let ticket
  try {
    ticket = JSON.parse(D.fs.readFileSync(ticketFilePath, 'utf8'))
  } catch (err) {
    logErr(`\nFAIL — 승인 티켓을 찾을 수 없습니다(${ticketFilePath}): ${err.message}. 잘못된 runId 이거나 1단계를 먼저 실행하지 않았을 수 있습니다.`)
    return finish('approval-mismatch', 1, { dbWriteCount: 0 })
  }
  // Windows/macOS 는 기본적으로 파일시스템이 대소문자를 구분하지 않는다
  // (Linux 는 구분) — `--approve run-id`(소문자)가 실제 파일 `RUN-ID.ticket.json`
  // 을 그대로 열어버릴 수 있으므로, 파일 조회 성공 여부와 별개로 티켓
  // 내용의 runId 가 이번 실행의 runId 와 바이트 단위로 정확히 같은지 한 번
  // 더 확인한다(플랫폼에 따라 안전성이 갈리지 않도록).
  if (ticket.runId !== runId) {
    logErr(`\nFAIL — 티켓의 runId(${ticket.runId})가 --approve 로 지정한 runId(${runId})와 다릅니다(대소문자 포함 정확히 일치해야 함).`)
    return finish('approval-mismatch', 1, { dbWriteCount: 0 })
  }
  if (ticket.used) {
    logErr('\nFAIL — 이미 사용된 승인 티켓입니다(1회성 — 재사용 불가). 새로 1단계부터 실행하세요.')
    return finish('approval-used', 1, { dbWriteCount: 0 })
  }
  if (D.now().getTime() > new Date(ticket.expiresAt).getTime()) {
    logErr(`\nFAIL — 승인 티켓이 만료되었습니다(만료: ${ticket.expiresAt}). 1단계부터 다시 실행하세요.`)
    return finish('approval-expired', 1, { dbWriteCount: 0 })
  }
  if (ticket.manifestSha256 !== manifestSha256) {
    logErr('\nFAIL — manifest 파일이 티켓 발급 이후 변경되었습니다(변조 의심). 1단계부터 다시 실행하세요.')
    return finish('approval-manifest-mismatch', 1, { dbWriteCount: 0 })
  }
  const currentFingerprint = sha256Any(report.baseline)
  if (ticket.preflightFingerprint !== currentFingerprint) {
    logErr('\nFAIL-CLOSED — 티켓 발급 이후 라이브 상태가 변경되었습니다(approval-stale). 1단계부터 다시 실행해 새 티켓을 받으세요.')
    return finish('approval-stale', 1, { dbWriteCount: 0 })
  }
  ticket.used = true
  ticket.usedAt = D.now().toISOString()
  D.fs.writeFileSync(ticketFilePath, JSON.stringify(ticket, null, 2), 'utf8')
  log(`\n승인 확인 완료 — 티켓 사용 처리(1회성 소모): ${ticketFilePath}`)

  // 8.5) apply 직전 manifest 파일 재해시 — 승인 이후 파일이 바뀌었으면 중단
  D.onStep('manifest-reverify')
  if (options.manifestPath) {
    let currentRaw
    try {
      currentRaw = D.fs.readFileSync(options.manifestPath, 'utf8')
    } catch (err) {
      logErr(`FAIL — manifest 파일 재확인 실패: ${err.message}`)
      return finish('manifest-tampered', 1, { dbWriteCount: 0 })
    }
    if (sha256Text(currentRaw) !== manifestSha256) {
      logErr('FAIL — manifest 파일이 로드 이후 변경되었습니다(변조 의심). 적용을 중단합니다.')
      return finish('manifest-tampered', 1, { dbWriteCount: 0 })
    }
  }

  // 9) apply(forward SQL)
  D.onStep('apply')
  const executor = options.executor || D.createExecutor({
    kind: options.executorKind || 'management-api',
    projectRef: manifest.project_ref,
    accessToken: env.accessToken,
  })
  let dbWriteCount = 0
  const applyResult = await safeRun(executor, forwardSql)
  if (!applyResult.ok) {
    logErr(`\nFAIL — ${mode === 'apply' ? 'apply' : 'rollback'} 실패(트랜잭션이라 미반영): ${applyResult.error}`)
    return finish('apply-failed', 1, { applyError: applyResult.error, dbWriteCount: 0 })
  }
  dbWriteCount += manifest.changes.length
  log(`\n${mode === 'apply' ? 'apply' : 'rollback'} 성공 — postflight 검증 진행`)

  // 10) postflight — apply 모드는 set(적용 후) 값, rollback-of 모드는
  //     expect_before(원복) 값이 실제로 반영됐는지 확인
  D.onStep('postflight')
  const forwardPostflightPlan = mode === 'apply' ? postflightPlanCore : revertVerifyPlan
  const postMismatches = await readPlanMismatches(reader, forwardPostflightPlan)

  for (const sid of manifest.affected_students || []) {
    for (const table of manifest.learning_baseline_tables || []) {
      try {
        const r2 = await reader.headCountFiltered(table, { student_id: sid })
        if (r2.count !== baselineCounts[sid][table]) {
          postMismatches.push({ table, studentId: sid, reason: 'learning-baseline-changed', before: baselineCounts[sid][table], after: r2.count })
        }
      } catch (err) {
        // apply 는 이미 실행됐다 — 조회 실패는 postflight 미확인으로 취급해
        // fail-closed(자동 롤백 트리거)로 처리한다(crash 대신).
        postMismatches.push({ table, studentId: sid, reason: 'learning-baseline-check-failed', error: err.message })
      }
    }
  }

  const studentsRowsAfter = sortRows(await reader.selectAllRows('students', STUDENTS_SNAPSHOT_COLS))
  const scaRowsAfter = sortRows(await reader.selectAllRows('student_class_assignments', SCA_SNAPSHOT_COLS))
  const expectedStudentIds = new Set(manifest.changes.filter((c) => c.table === 'students').map((c) => c.id))
  const expectedScaIds = new Set(manifest.changes.filter((c) => c.table === 'student_class_assignments').map((c) => c.id))
  postMismatches.push(...diffUnexpectedRows('students', studentsRowsBefore, studentsRowsAfter, expectedStudentIds))
  postMismatches.push(...diffUnexpectedRows('student_class_assignments', scaRowsBefore, scaRowsAfter, expectedScaIds))

  let healthResult = { ok: true, output: '' }
  if (!postMismatches.length) {
    D.onStep('health-check')
    healthResult = D.runHealthCheck()
  }

  if (postMismatches.length || !healthResult.ok) {
    logErr('\nFAIL — postflight/health 검증 실패, 자동 복구(backward SQL) 진행')
    for (const m of postMismatches) logErr(`  ${JSON.stringify(m)}`)
    if (!healthResult.ok) logErr(`  health:students 실패:\n${tail(healthResult.output)}`)

    const recoveryResult = await safeRun(executor, backwardSql)
    if (!recoveryResult.ok) {
      logErr(`\nFAIL — 복구도 실패: ${recoveryResult.error} — 수동 조치 필요. apply/rollback SQL 파일을 운영자에게 전달하세요.`)
      return finish('rollback-failed', 1, {
        postMismatches,
        healthOutputTail: tail(healthResult.output || ''),
        rollbackError: recoveryResult.error,
        dbWriteCount,
      })
    }
    dbWriteCount += manifest.changes.length

    // 복구 후 재확인(직전 프리플라이트에서 확인했던 상태로 돌아왔는지)
    const recoveryVerifyPlan = mode === 'apply' ? revertVerifyPlan : postflightPlanCore
    const rollbackVerifyMismatches = await readPlanMismatches(reader, recoveryVerifyPlan)
    if (rollbackVerifyMismatches.length) {
      logErr('\n경고 — 복구 실행은 성공했지만 재확인에서 불일치 발견, 수동 확인 필요')
    }
    return finish('rolled-back', 1, {
      postMismatches,
      healthOutputTail: tail(healthResult.output || ''),
      rollbackVerifyMismatches,
      dbWriteCount,
    })
  }

  log('\npostflight PASS, health:students PASS')
  return finish('applied', 0, { dbWriteCount })
}

// ── C1(2026-09-04) — prod:plan 공유 로직 ──────────────────────────────────
// scripts/prodPlan.mjs(READ-ONLY CLI)가 호출하는 단일 진입점. runHotfix()
// 를 항상 dryRun:true 로 호출해 게이트 판정(검증/정적스캔/프리플라이트/
// invariants delta/승인 전 STOP)을 전부 그대로 재사용한다(로직 복제 없음) —
// 이 함수는 그 위에 "계획을 사람이 읽기 좋게" 만드는 표시 전용 로직만
// 더한다(위험도 산정, 영향받는 학생/교재/유닛 수 집계, 이름 해석, drift,
// apply_eligibility 4값 매핑).
function computeRiskLevel(manifest) {
  const changes = manifest.changes || []
  const rowCount = changes.length
  const hasDelete = changes.some((c) => (c.op || 'update') === 'delete')
  if (hasDelete || rowCount > 50) return 'HIGH'
  const hasPrimaryFlip = changes.some((c) => {
    const op = c.op || 'update'
    if (op === 'update') return 'is_primary' in (c.set || {}) && c.set.is_primary !== c.expect_before?.is_primary
    if (op === 'insert') return c.fields?.is_primary === true
    return false
  })
  if (hasPrimaryFlip || rowCount > 10) return 'MEDIUM'
  return 'LOW'
}

function summarizeAffected(manifest) {
  const studentIds = new Set(manifest.affected_students || [])
  const textbookIds = new Set()
  const unitIds = new Set()
  for (const c of manifest.changes || []) {
    if (c.table !== 'student_class_assignments') continue
    const tb = c.fields?.textbook_id ?? c.expect_before?.textbook_id ?? c.set?.textbook_id
    if (tb) textbookIds.add(tb)
    for (const uid of [c.fields?.current_unit_id, c.expect_before?.current_unit_id, c.set?.current_unit_id]) {
      if (uid) unitIds.add(uid)
    }
  }
  for (const r of manifest.reference_rows_must_exist || []) {
    if (r.table === 'units') unitIds.add(r.id)
    if (r.table === 'textbooks') textbookIds.add(r.id)
  }
  return { students: studentIds.size, textbooks: textbookIds.size, units: unitIds.size }
}

function shortId(id) {
  return typeof id === 'string' && id.length > 8 ? `${id.slice(0, 8)}…` : String(id ?? '')
}

function resolveEntityName(namedSnapshot, table, id) {
  if (!namedSnapshot || !id) return null
  const map = { classes: namedSnapshot.classes, textbooks: namedSnapshot.textbooks, units: namedSnapshot.units }[table]
  const row = (map || []).find((r) => r.id === id)
  return row?.name ?? null
}

// preflight 항목 하나를 사람이 읽기 좋게(엔티티 라벨 마스킹) 표시한다.
// 학생 id 는 항상 shortId 로 줄이고(개인 식별 최소화), class/textbook/unit
// id 는 namedSnapshot 에서 이름을 찾아 함께 보여준다(못 찾으면 shortId 로
// 폴백). 실제 값 비교(match)는 hotfixResult.report.mismatches 를 그대로
// 재사용한다(재조회 없음 — 이미 runHotfix 프리플라이트가 한 번 읽은 결과).
function describePreflightRows(manifest, mismatches, namedSnapshot) {
  const mismatchByKey = new Map()
  for (const m of mismatches || []) {
    const key = `${m.table}:${m.id}:${m.column ?? ''}`
    mismatchByKey.set(key, m)
  }
  const rows = []
  for (const c of manifest.changes || []) {
    const op = c.op || 'update'
    const expect = op === 'insert' ? null : c.expect_before
    const label = c.table === 'student_class_assignments'
      ? `SCA ${shortId(c.id)} (학생 ${shortId(expect?.student_id ?? c.fields?.student_id)}, `
        + `교재 ${resolveEntityName(namedSnapshot, 'textbooks', expect?.textbook_id ?? c.fields?.textbook_id) || shortId(expect?.textbook_id ?? c.fields?.textbook_id)})`
      : `${c.table} ${shortId(c.id)}`
    const rowMismatch = (mismatches || []).find((m) => m.table === c.table && m.id === c.id && !m.column)
    const colMismatches = (expect ? Object.keys(expect) : []).filter((col) => mismatchByKey.has(`${c.table}:${c.id}:${col}`))
    rows.push({
      op, label, expect,
      match: !rowMismatch && colMismatches.length === 0,
      mismatchReason: rowMismatch?.reason || (colMismatches.length ? `컬럼 불일치: ${colMismatches.join(',')}` : null),
    })
  }
  return rows
}

/**
 * @param {object} options runHotfix() 와 같은 옵션(manifestPath 또는 manifest,
 *   envFlag, reader/fixtureReaderPath, reportDir 등) + refreshExpect(boolean)
 * @param {object} [deps]
 * @returns {Promise<{plan:object, hotfixResult:object}>}
 */
export async function runPlan(options, deps = {}) {
  const D = { ...defaultDeps, ...deps }
  const env = D.loadEnv()

  let manifest = options.manifest
  if (!manifest) {
    if (!options.manifestPath) throw new Error('runPlan: manifestPath 또는 manifest 옵션이 필요합니다')
    manifest = JSON.parse(D.fs.readFileSync(options.manifestPath, 'utf8'))
  }

  const buildReader = () => {
    if (options.reader) return options.reader
    if (options.fixtureReaderPath) {
      return D.createFixtureReader(JSON.parse(D.fs.readFileSync(options.fixtureReaderPath, 'utf8')))
    }
    return D.createLiveReader(env.url, env.anonKey)
  }

  // (선택) drift refresh — 원본 manifest 파일은 절대 건드리지 않고
  // <manifest>.refreshed.json 에만 저장한다(B3, 순수 변환 + 이 함수의 IO만 추가).
  let refreshInfo = null
  if (options.refreshExpect) {
    try {
      const { manifest: refreshed, drift } = await refreshExpectBefore(manifest, buildReader())
      refreshInfo = { drift }
      if (options.manifestPath) {
        const outPath = options.manifestPath.replace(/\.json$/i, '.refreshed.json')
        D.fs.writeFileSync(outPath, `${JSON.stringify(refreshed, null, 2)}\n`, 'utf8')
        refreshInfo.outPath = outPath
      }
    } catch (err) {
      refreshInfo = { error: err.message, drift: [] }
    }
  }

  const lintFindings = lintManifestNarratives(manifest)

  // 핵심 게이트는 runHotfix() 를 dry-run + invariants delta 켜서 그대로
  // 재사용한다(READ-ONLY 는 dryRun:true 가 구조적으로 보장 — 승인 게이트
  // 진입 전에 항상 STOP).
  const hotfixResult = await runHotfix(
    { ...options, manifest, manifestPath: undefined, dryRun: true },
    { ...D, loadInvariantSnapshot: D.loadInvariantSnapshot || buildInvariantSnapshotFromReader },
  )

  // 이름 해석용 스냅샷 — 실패해도 plan 자체는 계속(엔티티 라벨이 shortId 로 폴백).
  let namedSnapshot = null
  try {
    namedSnapshot = await buildInvariantSnapshotFromReader(buildReader())
  } catch { /* 이름 해석 실패는 무시 — plan 은 이미 hotfixResult 로 판정 완료 */ }

  // plan-eligibility-textbook-identity 트랙(2026-09-05) — apply_eligibility
  // 는 runHotfix()(항상 dryRun:true 로 호출됨, 위)가 이미 computeApplyEligibility()
  // 공유 표로 계산해 report 에 실어둔 값을 그대로 재사용한다(재계산/재분류
  // 하지 않음 — "runPlan 과 computeStandardStatus 가 같은 표를 쓴다"는
  // 요구를 이 재사용으로 만족). lintFindings(runPlan 자신의 서술 lint
  // 재확인, 표시용)가 위반이면 BLOCKED_MANIFEST — 실제로는 validateManifest
  // 내부도 동일한 lintManifestNarratives() 를 호출해 이미 hotfixResult.status
  // 를 'invalid-manifest'(-> BLOCKED_MANIFEST)로 만들었을 것이므로 이
  // 분기는 대부분 hotfixResult 값과 일치하지만, 우선순위를 명시적으로 고정한다.
  const lintOk = lintFindings.length === 0
  const apply_eligibility = lintOk ? hotfixResult.report.apply_eligibility : 'BLOCKED_MANIFEST'

  const plan = {
    runId: hotfixResult.report.runId,
    manifestId: manifest.id,
    title: manifest.title || null,
    projectRef: manifest.project_ref,
    lint: { ok: lintOk, findings: lintFindings },
    status: hotfixResult.status,
    preflight: describePreflightRows(manifest, hotfixResult.report.mismatches, namedSnapshot),
    affected: summarizeAffected(manifest),
    learningBaselineTables: manifest.learning_baseline_tables || [],
    baseline: hotfixResult.report.baseline || null,
    risk: computeRiskLevel(manifest),
    invariantsDelta: hotfixResult.report.invariantsDelta || null,
    drift: refreshInfo?.drift || [],
    refreshedManifestPath: refreshInfo?.outPath || null,
    applySqlPath: hotfixResult.report.applySqlPath || null,
    rollbackSqlPath: hotfixResult.report.rollbackSqlPath || null,
    apply_eligibility,
    blocked_reason: lintOk ? hotfixResult.report.blocked_reason : 'invalid-manifest',
    dbWriteCount: 0,
  }
  return { plan, hotfixResult }
}

// ── CLI 진입점 ─────────────────────────────────────────────────────────
function parseArgv(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--report-dir') args.reportDir = argv[++i]
    else if (a === '--executor') args.executorKind = argv[++i]
    else if (a === '--fixture-reader') args.fixtureReaderPath = argv[++i]
    else if (a === '--env') args.envFlag = argv[++i]
    else if (a === '--expect-manifest-sha') args.expectManifestSha = argv[++i]
    else if (a === '--rollback-of') args.rollbackOfReportPath = argv[++i]
    else if (a === '--approve') args.approveRunId = argv[++i]
    else if (a === '--json') args.jsonOutput = true
    else args._.push(a)
  }
  return args
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const parsed = parseArgv(process.argv.slice(2))
  const manifestArg = parsed._[0]
  if (!manifestArg) {
    console.error('사용법: node scripts/prodHotfix.mjs <manifest.json> --env production|staging [--dry-run] [--report-dir <dir>] [--executor management-api] [--fixture-reader <file>] [--expect-manifest-sha <hex>] [--rollback-of <report.json>] [--approve <runId>] [--json]')
    process.exitCode = 1
  } else {
    // B5(2026-09-04) — 실제 CLI 경로에서만 invariants delta 미리보기를
    // 켠다(D.loadInvariantSnapshot 이 함수일 때만 5.5 단계가 동작 — 테스트는
    // 이 값을 넘기지 않으므로 기존 동작이 전혀 바뀌지 않는다). 픽스처 리더
    // 여도 그대로 동작한다(buildInvariantSnapshotFromReader 는 reader 추상화
    // 하나만 쓴다 — 없는 테이블은 빈 배열로 안전하게 스킵).
    const result = await runHotfix({
      manifestPath: path.resolve(manifestArg),
      dryRun: !!parsed.dryRun,
      reportDir: parsed.reportDir ? path.resolve(parsed.reportDir) : undefined,
      executorKind: parsed.executorKind,
      fixtureReaderPath: parsed.fixtureReaderPath ? path.resolve(parsed.fixtureReaderPath) : undefined,
      envFlag: parsed.envFlag,
      expectManifestSha: parsed.expectManifestSha,
      rollbackOfReportPath: parsed.rollbackOfReportPath ? path.resolve(parsed.rollbackOfReportPath) : undefined,
      // fix/harness-apply-two-phase-approval(2026-09-05) — --approve <runId>
      // 가 있으면 이번 실행은 2단계(티켓 검증)다. runHotfix() 는 이 값을
      // runId 로도 그대로 재사용한다(1단계가 발급한 티켓/apply.sql/
      // rollback.sql 파일과 같은 runId 를 가리키게 하기 위함).
      approveRunId: parsed.approveRunId,
      jsonOutput: !!parsed.jsonOutput,
    }, { loadInvariantSnapshot: buildInvariantSnapshotFromReader })
    process.exitCode = result.exitCode
  }
}
