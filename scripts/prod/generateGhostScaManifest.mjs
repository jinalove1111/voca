// Production Safety Harness — 유령 SCA 참조 재배정 manifest 자동 생성
// (2026-09-03, 야간 자율 작업 Track 7)
//
// ★ READ-ONLY 보장 ★
// anon key 로 GET/HEAD 만 보낸다. 이 파일에는 PATCH/POST/PUT/DELETE 경로가
// 없다. `--dry-run-hotfix`로 이어서 실행하는 scripts/prodHotfix.mjs 도
// `--dry-run` 고정이라 그 경로에서도 실제 DB WRITE 는 0건이다.
//
// ── 배경 ──────────────────────────────────────────────────────────────
// `npm run health:students` WARN 10건(전부 ASSIGNMENT_GHOST_UNIT)은
// student_class_assignments.current_unit_id 가 유령 유닛(엑셀 헤더 잔재,
// 이름 "Unit", 단어 1개)을 가리키는 상태다(docs/audit/2026-09-03-warn10-
// readonly-analysis.md 정독). 이미 준비된 supabase_v3_43_ghost_sca_
// reassign.sql 이 같은 재배정을 계획하지만, 그 SQL은 조사 시점 스냅샷을
// SQL 문자열에 하드코딩한 것이라 시간이 지나면 목적지 값이 stale해질 수
// 있다(위 문서에서 실측: Harry/이윤제 2건이 이미 stale). 이 스크립트는
// **실행 직전 라이브 값**으로 매번 새 manifest 를 만들어 그 문제를
// 구조적으로 없앤다 — scripts/prodHotfix.mjs(다른 트랙 소유, import만)가
// 소비하는 scripts/lib/hotfixManifest.mjs manifest 포맷을 그대로 따른다.
//
// 재배정 규칙(v3_43 헤더 규칙을 그대로 재현, 새로 발명하지 않음):
//   그룹 A(primary=true) — 목적지 = students.current_unit_id(권위값).
//     단, 그 유닛이 (a) 존재하고 (b) 유령이 아니고 (c) 이 SCA 행과 같은
//     교재 소속이고 (d) 단어 >= 2(학습 가능)일 때만 그 값을 쓴다. 하나라도
//     아니면 그 교재의 첫 학습 가능 유닛(이름 자연정렬)으로 폴백한다.
//     그것도 없으면 추측하지 않고 skipped 로 남긴다(CLAUDE.md 규칙 18).
//   그룹 B(primary=false) — 목적지 = null(진도 미착수 상태, assignTextbook()
//     이 만드는 초기 상태와 동일 — 이 스크립트가 유닛을 임의로 고르지 않음).
//
// 이 manifest 는 students 테이블을 전혀 건드리지 않는다(must_not_change 로
// 그 학생들의 students.current_unit_id/unit_name 현재값이 그대로임을
// 보증) — WARN 10건은 이미 students 쪽은 정상이고 SCA 캐시만 stale하기
// 때문(위 문서 "분류 표" 참고).
//
// 사용법:
//   node scripts/prod/generateGhostScaManifest.mjs [--out <path>]
//     [--fixture <file>] [--json] [--dry-run-hotfix]
//
//   --out <path>          출력 경로(기본 ops/hotfix/manifests/ghost-sca-
//                         reassign-<YYYYMMDD>.json, .gitignore 대상)
//   --fixture <file>      라이브 대신 파일의 { data } 를 스냅샷으로 사용
//                         (네트워크 0). data.assignments 행에 `id`가 있어야
//                         한다(loadProductionSnapshot() 출력 + id 필드).
//   --json                사람용 표 대신 { manifest, summary, skipped } JSON 출력
//   --dry-run-hotfix       manifest 생성 후 이어서
//                         `node scripts/prodHotfix.mjs <생성파일> --env
//                         production --dry-run --json` 을 실행해
//                         ready-to-apply 인지 확인(그 이상 진행 없음)
//
// exit code: manifest 생성/검증 실패(0건 대상 제외) 시 1, 그 외 0.
// changes 가 0건이면(정리 대상 없음) manifest 를 쓰지 않고 exit 0.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadSupabaseEnv, loadProductionSnapshot, LEARNING_BASELINE_TABLES } from '../lib/prodDataLoader.mjs'
import { buildContext, findGhostUnits, isGhostUnit, classifyAccount } from '../lib/studentHealthRules.mjs'
import { validateManifest } from '../lib/hotfixManifest.mjs'
import { buildAmbiguousTextbookIndex } from '../lib/prodInvariants.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// 학습 가능 유닛 임계값 — src/utils/wordLibrary.js MIN_LEARNABLE_WORDS(v3.9.2,
// 커밋 5c589a8)와 동일한 값(2)이다. 그 파일은 supabaseClient를 정적 import해
// 이 스크립트(네트워크 0 모드 지원 필요)에서 그대로 import하면 부작용
// 위험이 생기므로, scripts/lib/studentHealthRules.mjs가 이미 하는 방식대로
// (그 파일 헤더 "방향 해석은 앱 리졸버를 그대로 재현" 주석 참고) 값만
// 그대로 옮긴다 — 재구현이 아니라 상수 복제.
const MIN_LEARNABLE_WORDS = 2

// ── 인자 파싱(scripts/prodCheck.mjs 관례 재사용) ─────────────────────────
const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const AS_JSON = flag('--json')
const FIXTURE_PATH = opt('--fixture')
const OUT_PATH = opt('--out')
const DRY_RUN_HOTFIX = flag('--dry-run-hotfix')

const log = (...a) => { if (!AS_JSON) console.log(...a) }

function todayStamp(now = new Date()) {
  return now.toISOString().slice(0, 10).replace(/-/g, '')
}

// src/utils/wordLibrary.js naturalCompare 와 동일 알고리즘(공백 제거 후
// 숫자/문자 청크 자연정렬) — 표시 정렬 전용 순수 함수라 재구현이 아니라
// 그 파일 헤더가 이미 명시한 "표시 순서 정렬" 알고리즘을 옮긴 것이다.
// 그 파일은 supabaseClient를 정적 import하므로 이 네트워크 0 스크립트에
// 그대로 import하지 않는다(위 MIN_LEARNABLE_WORDS 주석과 동일 이유).
function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g
  const norm = (s) => String(s ?? '').replace(/\s+/g, '')
  const partsA = norm(a).match(re) || []
  const partsB = norm(b).match(re) || []
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const pa = partsA[i]
    const pb = partsB[i]
    if (pa === undefined) return -1
    if (pb === undefined) return 1
    const na = /^\d+$/.test(pa) ? Number(pa) : null
    const nb = /^\d+$/.test(pb) ? Number(pb) : null
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb
    } else {
      const cmp = pa.localeCompare(pb)
      if (cmp !== 0) return cmp
    }
  }
  return 0
}

function maskName(name) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return '(이름없음)'
  return `${n[0]}***`
}
function maskId(id) {
  const s = String(id || '')
  return s.length > 8 ? `${s.slice(0, 8)}…` : s
}

function sha256Of(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

// ── 라이브 전용: 유령 유닛을 가리키는 SCA 행을 id 포함으로 조회 ──────────
// loadProductionSnapshot()의 assignments 셀렉트에는 `id`가 없다(그 로더는
// studentHealthCheck.mjs 계약과 동일 shape을 유지하는 게 목적이라 이
// 트랙에서 그 파일을 바꾸지 않는다 — CLAUDE.md 규칙 16). manifest 는
// 행을 특정하는 데 SCA.id(PK)가 반드시 필요해서, 유령 유닛 id로만
// 좁혀 별도 GET 한 번을 더 보낸다(읽기 전용, anon key).
async function fetchGhostReferencingScaRows(supa, ghostIds) {
  if (!ghostIds.length) return []
  const headers = { apikey: supa.key, Authorization: `Bearer ${supa.key}` }
  const idList = ghostIds.join(',')
  const url = `${supa.base}/rest/v1/student_class_assignments?select=id,student_id,class_id,textbook_id,current_unit_id,is_primary,created_at&current_unit_id=in.(${idList})`
  let res
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
  } catch (err) {
    throw new Error(`INFRA_ERROR student_class_assignments(ghost lookup): ${err?.message || err}`)
  }
  if (!res.ok) throw new Error(`INFRA_ERROR student_class_assignments(ghost lookup): HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
  return await res.json()
}

// ── 목적지 유닛 결정(그룹 A) ─────────────────────────────────────────────
// 반환: { unitId, source } 또는 null(학습 가능한 유닛이 아예 없음 — 추측
// 금지, 호출부가 skipped 로 기록한다).
function resolveGroupADestination(row, student, ctx) {
  const { unitById, wordsByUnit, wordCountByUnit } = ctx

  const candidateId = student?.current_unit_id ?? null
  if (candidateId) {
    const candidate = unitById.get(candidateId)
    if (candidate && candidate.textbook_id === row.textbook_id) {
      const verdict = isGhostUnit(candidate, wordsByUnit.get(candidateId) || [])
      const wc = wordCountByUnit.get(candidateId) || 0
      if (!verdict.ghost && wc >= MIN_LEARNABLE_WORDS) {
        return { unitId: candidateId, source: 'students.current_unit_id' }
      }
    }
  }

  const learnable = []
  for (const [id, unit] of unitById) {
    if (unit.textbook_id !== row.textbook_id) continue
    const wc = wordCountByUnit.get(id) || 0
    if (wc < MIN_LEARNABLE_WORDS) continue
    const verdict = isGhostUnit(unit, wordsByUnit.get(id) || [])
    if (verdict.ghost) continue
    learnable.push(unit)
  }
  if (!learnable.length) return null
  learnable.sort((a, b) => naturalCompare(a.name, b.name))
  return { unitId: learnable[0].id, source: 'textbook_first_learnable' }
}

// ── manifest 빌드(순수, 입력은 스냅샷 데이터 + ghost-referencing SCA 행) ──
function buildManifestFromSnapshot(data, scaRowsWithId, now) {
  const ctx = buildContext(data)
  const ghostUnits = findGhostUnits(ctx)
  const ghostIds = new Set(ghostUnits.map((g) => g.id))
  const studentsById = new Map((data.students || []).map((s) => [s.id, s]))
  const textbookById = ctx.textbookById

  const changes = []
  const skipped = []
  const referenceUnitsMap = new Map() // id -> {id, name, textbook_id, minWords|undefined}
  const mustNotChangeMap = new Map() // student.id -> entry
  const summaryRows = []
  let excludedNonReal = 0

  const sortedRows = [...scaRowsWithId].sort((a, b) => String(a.id).localeCompare(String(b.id)))

  for (const row of sortedRows) {
    if (!row?.id || !ghostIds.has(row.current_unit_id)) continue
    const student = studentsById.get(row.student_id)
    if (!student) {
      skipped.push({ scaId: row.id, studentId: row.student_id, group: row.is_primary ? 'A' : 'B',
        reason: 'students 테이블에 해당 student_id 레코드 없음(orphan) — 추측 없이 제외' })
      continue
    }
    const accountType = classifyAccount(student, ctx)
    if (accountType !== 'REAL') { excludedNonReal++; continue }

    const ghostUnit = ctx.unitById.get(row.current_unit_id)
    const group = row.is_primary ? 'A' : 'B'
    const textbookName = textbookById.get(row.textbook_id)?.name || row.textbook_id || '?'

    let destUnitId = null
    let destSource = null
    if (group === 'A') {
      const dest = resolveGroupADestination(row, student, ctx)
      if (!dest) {
        skipped.push({
          scaId: row.id, studentId: row.student_id, group,
          reason: `A그룹: 교재(${textbookName})에 학습 가능(단어>=${MIN_LEARNABLE_WORDS}) 유닛이 없어 목적지를 추측할 수 없음`,
        })
        continue
      }
      destUnitId = dest.unitId
      destSource = dest.source
    }

    changes.push({
      op: 'update',
      table: 'student_class_assignments',
      id: row.id,
      expect_before: {
        student_id: row.student_id,
        textbook_id: row.textbook_id,
        is_primary: !!row.is_primary,
        current_unit_id: row.current_unit_id,
      },
      set: { current_unit_id: destUnitId },
    })

    if (ghostUnit && !referenceUnitsMap.has(ghostUnit.id)) {
      referenceUnitsMap.set(ghostUnit.id, {
        table: 'units', id: ghostUnit.id,
        expect: { name: ghostUnit.name, textbook_id: ghostUnit.textbook_id },
      })
    }
    if (group === 'A' && destUnitId) {
      const destUnit = ctx.unitById.get(destUnitId)
      if (destUnit && !referenceUnitsMap.has(destUnitId)) {
        referenceUnitsMap.set(destUnitId, {
          table: 'units', id: destUnitId,
          expect: { name: destUnit.name, textbook_id: destUnit.textbook_id },
          min_words: MIN_LEARNABLE_WORDS,
        })
      }
    }

    if (!mustNotChangeMap.has(student.id)) {
      mustNotChangeMap.set(student.id, {
        table: 'students', id: student.id,
        expect: { current_unit_id: student.current_unit_id ?? null, unit_name: student.unit_name ?? null },
      })
    }

    summaryRows.push({
      group, studentId: student.id, studentName: student.name,
      scaId: row.id, textbookName,
      beforeName: ghostUnit?.name || '(유령)',
      afterName: group === 'A' ? (ctx.unitById.get(destUnitId)?.name ?? '?') : null,
      destSource,
    })
  }

  const affectedStudents = [...mustNotChangeMap.keys()].sort()
  const countA = changes.filter((c) => c.expect_before.is_primary).length
  const countB = changes.length - countA

  const snapshotForHash = {
    ghostUnits: [...ghostIds].sort(),
    candidateRows: sortedRows.map((r) => ({ id: r.id, student_id: r.student_id, current_unit_id: r.current_unit_id, is_primary: !!r.is_primary })),
    studentsUsed: affectedStudents.map((sid) => ({ id: sid, current_unit_id: studentsById.get(sid)?.current_unit_id ?? null })),
  }

  const manifest = changes.length ? {
    id: `ghost-sca-reassign-${todayStamp(now)}`,
    project_ref: data.projectRef || null,
    title: `유령 SCA 참조 재배정 A ${countA}행 / B ${countB}행`,
    created_at: now.toISOString().slice(0, 10),
    affected_students: affectedStudents,
    changes: changes.sort((a, b) => String(a.id).localeCompare(String(b.id))),
    must_not_change: [...mustNotChangeMap.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    reference_rows_must_exist: [...referenceUnitsMap.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    learning_baseline_tables: LEARNING_BASELINE_TABLES,
    generated_from: {
      tool: 'generateGhostScaManifest',
      at: now.toISOString(),
      snapshot_sha256: sha256Of(snapshotForHash),
    },
  } : null

  return { manifest, summaryRows, skipped, excludedNonReal, ghostUnitsInventory: ghostUnits }
}

function renderSummary(summaryRows, skipped, excludedNonReal, ghostUnitsInventory) {
  log(`\n유령 유닛 인벤토리: ${ghostUnitsInventory.length}개`)
  log(`\n=== 재배정 후보(${summaryRows.length}행) ===`)
  if (!summaryRows.length) log('  없음')
  for (const r of summaryRows) {
    const after = r.group === 'A' ? `"${r.afterName}"${r.destSource === 'textbook_first_learnable' ? '(폴백)' : ''}` : 'null'
    log(`  [${r.group}] ${maskName(r.studentName)} SCA:${maskId(r.scaId)} 교재:${r.textbookName} — "${r.beforeName}"(유령) -> ${after}`)
  }
  log(`\n=== skipped(${skipped.length}행, 추측 없이 제외) ===`)
  if (!skipped.length) log('  없음')
  for (const s of skipped) log(`  [${s.group}] SCA:${maskId(s.scaId)} — ${s.reason}`)
  if (excludedNonReal) log(`\n비실학생(TEST/ARCHIVED/QA_FIXTURE) 제외: ${excludedNonReal}행`)
  log('\nDB WRITE: 0 (이 스크립트는 GET 만 보냅니다)')
}

async function loadSnapshotData() {
  if (FIXTURE_PATH) {
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
    if (!raw?.data) throw new Error(`픽스처 형식이 { data: {...} } 가 아닙니다(${FIXTURE_PATH})`)
    return { data: raw.data, supa: null, source: 'fixture' }
  }
  const supa = loadSupabaseEnv()
  if (!supa) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없어 라이브 조회를 할 수 없습니다(--fixture 로 네트워크 0 실행 가능).')
  const snapshot = await loadProductionSnapshot(supa)
  return { data: { ...snapshot, projectRef: supa.projectRef }, supa, source: 'live' }
}

async function main() {
  let data, supa, source
  try {
    ;({ data, supa, source } = await loadSnapshotData())
  } catch (err) {
    console.error(`FAIL — 스냅샷 로드 실패: ${err?.message || err}`)
    process.exitCode = 1
    return
  }

  const ctxPre = buildContext(data)
  const ghostUnits = findGhostUnits(ctxPre)
  const ghostIds = ghostUnits.map((g) => g.id)

  let scaRowsWithId
  if (source === 'fixture') {
    scaRowsWithId = (data.assignments || []).filter((a) => ghostIds.includes(a.current_unit_id))
    const missingId = scaRowsWithId.find((r) => !r.id)
    if (missingId) {
      console.error('FAIL — 픽스처 assignments 행에 id 가 없습니다(manifest 는 SCA.id(PK)가 필요합니다). --fixture 데이터는 loadProductionSnapshot 출력 + 각 assignment 행에 id 필드를 추가한 형태여야 합니다.')
      process.exitCode = 1
      return
    }
  } else {
    try {
      scaRowsWithId = await fetchGhostReferencingScaRows(supa, ghostIds)
    } catch (err) {
      console.error(`FAIL — 라이브 조회 실패(학생 문제 아님): ${err?.message || err}`)
      process.exitCode = 1
      return
    }
  }

  const now = new Date()
  const { manifest, summaryRows, skipped, excludedNonReal, ghostUnitsInventory } =
    buildManifestFromSnapshot(data, scaRowsWithId, now)

  if (!manifest) {
    if (AS_JSON) console.log(JSON.stringify({ ok: true, changes: 0, skipped, excludedNonReal }, null, 2))
    else {
      renderSummary(summaryRows, skipped, excludedNonReal, ghostUnitsInventory)
      log('\n정리 대상(재배정 가능한 유령 참조) 0건 — manifest 를 생성하지 않습니다.')
    }
    process.exitCode = 0
    return
  }

  // 작업2(d)(2026-09-05, plan-eligibility-textbook-identity) — 목적지 유닛의
  // 교재가 라이브 데이터에서 모호 쌍(이름 완전중복 또는 유사명+같은
  // 출판사)의 일원이면 생성 자체를 STOP 한다. textbook_identity ack 를
  // 이 스크립트가 대신 채워 넣지 않는다(자동 수정 금지 원칙, CLAUDE.md
  // 규칙 3/18과 동일한 정신 — 모호하면 운영자 결정으로 넘긴다).
  {
    const ambiguousIndex = buildAmbiguousTextbookIndex(ctxPre.textbookById)
    const ambiguousDestinations = []
    for (const c of manifest.changes) {
      const destUnitId = c.set?.current_unit_id
      if (!destUnitId) continue
      const destUnit = ctxPre.unitById.get(destUnitId)
      if (!destUnit?.textbook_id) continue
      const partners = ambiguousIndex.get(destUnit.textbook_id)
      if (partners && partners.size) {
        ambiguousDestinations.push({ scaId: c.id, textbookId: destUnit.textbook_id, ambiguousWith: [...partners] })
      }
    }
    if (ambiguousDestinations.length) {
      console.error('STOP — 목적지 교재가 이름 중복/유사(모호) 쌍의 일원입니다. 자동 수정 금지 — textbook_identity ack 를 자동으로 채우지 않습니다. 운영자가 직접 확인 후 manifest 의 해당 change 에 textbook_identity:{id,name,publisher_name} 를 추가하세요:')
      for (const d of ambiguousDestinations) {
        console.error(`  SCA:${maskId(d.scaId)} 교재:${String(d.textbookId).slice(0, 8)}… (모호 상대: ${d.ambiguousWith.map((x) => `${String(x).slice(0, 8)}…`).join(', ')})`)
      }
      if (AS_JSON) console.log(JSON.stringify({ ok: false, stopped: 'ambiguous-textbook', ambiguousDestinations }, null, 2))
      process.exitCode = 1
      return
    }
  }

  const validation = validateManifest(manifest)
  if (!validation.valid) {
    console.error('FAIL — 생성된 manifest 가 validateManifest 를 통과하지 못했습니다(버그 — 운영자에게 보고):')
    for (const e of validation.errors) console.error(`  - ${e}`)
    process.exitCode = 1
    return
  }

  const outPath = OUT_PATH
    ? path.resolve(OUT_PATH)
    : path.join(ROOT, 'ops', 'hotfix', 'manifests', `${manifest.id}.json`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  if (AS_JSON) {
    console.log(JSON.stringify({ ok: true, manifestPath: outPath, manifest, summaryRows, skipped, excludedNonReal }, null, 2))
  } else {
    renderSummary(summaryRows, skipped, excludedNonReal, ghostUnitsInventory)
    log(`\nmanifest 검증 PASS(validateManifest) — 저장: ${outPath}`)
    log(`changes: ${manifest.changes.length} (A ${manifest.changes.filter((c) => c.expect_before.is_primary).length} / B ${manifest.changes.length - manifest.changes.filter((c) => c.expect_before.is_primary).length})`)
  }

  if (DRY_RUN_HOTFIX) {
    log('\n=== --dry-run-hotfix: node scripts/prodHotfix.mjs 실행(읽기 전용, dry-run 고정) ===')
    const res = spawnSync(process.execPath, [
      path.join(ROOT, 'scripts', 'prodHotfix.mjs'), outPath,
      '--env', 'production', '--dry-run', '--json',
    ], { cwd: ROOT, encoding: 'utf8' })
    const lines = (res.stdout || '').trim().split('\n')
    const lastLine = lines[lines.length - 1] || ''
    let parsed = null
    try { parsed = JSON.parse(lastLine) } catch { /* 아래에서 원문 출력 */ }
    if (!AS_JSON) {
      console.log(res.stdout)
      if (res.stderr) console.error(res.stderr)
    }
    const status = parsed?.status
    log(`\nprodHotfix status: ${status ?? '(파싱 불가, 원문 참고)'}`)
    log(`prodHotfix 예상 UPDATE 행 수: ${parsed?.expectedRows ?? manifest.changes.length}`)
    if (status !== 'ready-to-apply') {
      console.error('경고 — prodHotfix 결과가 ready-to-apply 가 아닙니다. 위 출력을 확인하세요.')
      process.exitCode = 1
      return
    }
  }

  process.exitCode = 0
}

await main()
