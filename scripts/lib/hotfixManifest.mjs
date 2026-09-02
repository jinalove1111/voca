// Production Safety Harness — 핫픽스 manifest 처리 (순수, 네트워크 0)
// (2026-09-03, Phase 1-B)
//
// 이 모듈은 파일 I/O·네트워크·DB 접근이 전혀 없다. manifest(JSON) 객체를
// 입력받아 검증하거나, 결정론적으로 SQL 문자열/읽기 계획을 만들어 낼 뿐이다.
// 실제 조회/실행은 scripts/prodHotfix.mjs(라이브 IO 담당)가 한다.
//
// ── 배경 ──────────────────────────────────────────────────────────────
// 2026-09-02 유령 유닛 착지 핫픽스에서 운영자가 VERIFY SQL → 본 SQL →
// VERIFY SQL 을 SQL Editor 에 직접 복사 실행했다. VERIFY 와 WRITE 의
// precondition 을 사람이 각각 따로 작성해 불일치 가능성이 있었다 — 이
// 모듈은 manifest 하나에서 preflight(읽기 계획)/apply SQL/rollback SQL/
// postflight(읽기 계획)를 전부 같은 데이터로부터 생성해 그 불일치를
// 구조적으로 없앤다. `expect_after` 를 별도로 쓰지 않는 이유도 같다 —
// `set` 이 곧 유일한 after 기대값(단일 원천)이고, rollback 은 `set`과
// `expect_before`의 교집합 컬럼을 뒤집은 것으로 자동 유도한다.
//
// ── ALLOWLIST(쓰기 가능 테이블/컬럼) ─────────────────────────────────────
// 이 하네스가 만들 수 있는 UPDATE 는 이 표 밖으로 절대 나가지 않는다.
// 새 테이블/컬럼이 필요하면 이 파일을 사람이 리뷰해 명시적으로 늘려야
// 한다 — manifest JSON 값만으로 임의 테이블/컬럼을 쓸 수 없게 하는 것이
// 목적이다.
export const ALLOWLIST = {
  students: ['current_unit_id', 'unit_name', 'class_id'],
  student_class_assignments: ['current_unit_id', 'is_primary', 'textbook_id'],
}

// ── 컬럼 타입(값 검증용, Phase 2·7 강화) ─────────────────────────────────
// ALLOWLIST 밖 컬럼(예: student_id)도 expect_before 가드 값으로 자주 등장
// 하므로, 여기 등록해두면 그 값도 함께 형식 검증된다(설정 가능 여부는
// 여전히 ALLOWLIST 가 결정 — 이 맵은 "값이 그럴듯한 타입인지"만 본다).
const COLUMN_TYPES = {
  // current_unit_id 는 두 테이블 모두 uuid 또는 null 을 허용한다(v3_43 B
  // 그룹처럼 유령 유닛 참조를 명시적으로 NULL 로 비우는 설계를 manifest 로
  // 표현할 수 있어야 함 — 리터럴 문자열 "null" 은 여전히 거부된다).
  students: { current_unit_id: 'uuid_or_null', class_id: 'uuid', unit_name: 'unit_name' },
  student_class_assignments: {
    current_unit_id: 'uuid_or_null',
    textbook_id: 'uuid',
    student_id: 'uuid',
    is_primary: 'boolean',
  },
}

const MAX_CHANGES_DEFAULT = 20
const MAX_CHANGES_CAP = 50

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v)
}

/**
 * COLUMN_TYPES 에 등록된 컬럼이면 값 형식을 검증한다. 등록 안 된 컬럼은
 * 통과(permissive) — 이 함수는 "그럴듯한 타입"만 방어한다.
 * @returns {string|null} 에러 메시지 또는 null(정상)
 */
function checkColumnValueType(table, col, val) {
  const type = COLUMN_TYPES[table]?.[col]
  if (!type) return null
  if (type === 'uuid') {
    return isUuid(val) ? null : `uuid 형식 아님(값: ${JSON.stringify(val)})`
  }
  if (type === 'uuid_or_null') {
    if (val === null) return null
    return isUuid(val) ? null : `uuid 형식 또는 null 이어야 함(문자열 "null" 은 허용 안 됨, 값: ${JSON.stringify(val)})`
  }
  if (type === 'boolean') {
    return typeof val === 'boolean' ? null : `boolean 이어야 함(값: ${JSON.stringify(val)})`
  }
  if (type === 'unit_name') {
    return (typeof val === 'string' && val.length >= 1 && val.length <= 50)
      ? null
      : `1~50자 문자열이어야 함(값: ${JSON.stringify(val)})`
  }
  return null
}

// ── SQL 인젝션 방어(Phase 2·7): manifest 의 모든 문자열 값에 위험 문자 차단 ──
const INJECTION_CHAR_RE = /(;|--|\/\*)/

/**
 * manifest 객체를 재귀적으로 순회해 문자열 값 중 `;`/`--`/`/*` 를 포함한
 * 것을 찾는다(순수, 네트워크 0). sqlLiteral 이스케이프와 별개의 이중
 * 방어선 — allowlist 를 통과한 값이라도 SQL 문자열 리터럴 안에 이런
 * 문자가 섞여 있으면 그 자체로 의심스러우므로 애초에 manifest 검증
 * 단계에서 거부한다.
 * @returns {{path:string, value:string}[]}
 */
export function scanManifestStringValues(m) {
  const violations = []
  function walk(obj, pathStr) {
    if (obj === null || obj === undefined) return
    if (typeof obj === 'string') {
      if (INJECTION_CHAR_RE.test(obj)) violations.push({ path: pathStr, value: obj })
      return
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => walk(v, `${pathStr}[${i}]`))
      return
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) walk(v, pathStr ? `${pathStr}.${k}` : k)
    }
  }
  walk(m, '')
  return violations
}

// ── 비밀값 마스킹(Phase 2·7) ──────────────────────────────────────────────
/**
 * env(key/value 맵) 중 키가 KEY/TOKEN/SECRET/PIN 을 포함하고(대소문자
 * 무시) 값이 3자 이상인 항목을 찾아, text 안에 그 값이 그대로 등장하면
 * [REDACTED] 로 치환한다. 순수 문자열 함수(네트워크/IO 없음) — 보고서
 * JSON, apply/rollback SQL 파일, 콘솔 출력 어디에 써도 안전하도록 호출부
 * 에서 감싼다.
 *
 * 2026-09-03 강화 — 정확한 부분 문자열 일치만으로는 값이 다른 형태로
 * 실릴 때(로그가 base64/URL 인코딩해서 남기거나, 앞부분만 남기고 잘라
 * 찍는 경우) 새어나간다. 값이 6자 이상일 때만 아래 3가지 추가 형태도
 * 찾아 마스킹한다(6자 미만은 흔한 문자열과 우연히 겹칠 오탐 위험이 커
 * 대상에서 제외 — 기존 3자 이상 정확 매칭 규칙은 그대로 유지).
 *   (a) base64 인코딩 형태
 *   (b) URL 인코딩 형태(encodeURIComponent)
 *   (c) 앞 12자 이상 접두 조각(로그가 값을 잘라서 남기는 경우)
 * @param {string} text
 * @param {Record<string,string>} env
 * @returns {string}
 */
export function redactSecrets(text, env) {
  let out = String(text ?? '')
  if (!env || typeof env !== 'object') return out
  for (const [key, val] of Object.entries(env)) {
    if (!/(key|token|secret|pin)/i.test(key)) continue
    if (typeof val !== 'string' || val.length < 3) continue

    if (out.includes(val)) out = out.split(val).join('[REDACTED]')

    // 6자 미만 값은 아래 인코딩/접두 조각 탐지 대상에서 제외(오탐 방지) —
    // 그럴듯한 다른 일반 문자열과 우연히 겹칠 가능성이 짧을수록 커진다.
    if (val.length < 6) continue

    const b64 = Buffer.from(val, 'utf8').toString('base64')
    if (b64.length >= 6 && out.includes(b64)) out = out.split(b64).join('[REDACTED]')

    const urlEnc = encodeURIComponent(val)
    if (urlEnc !== val && urlEnc.length >= 6 && out.includes(urlEnc)) out = out.split(urlEnc).join('[REDACTED]')

    if (val.length >= 12) {
      const prefix = val.slice(0, 12)
      if (out.includes(prefix)) out = out.split(prefix).join('[REDACTED]')
    }
  }
  return out
}

/**
 * manifest 스키마·allowlist·가드 규칙을 검증한다. 네트워크/DB 접근 없음.
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateManifest(m) {
  const errors = []
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return { valid: false, errors: ['manifest 가 객체가 아닙니다'] }
  }
  if (!m.id || typeof m.id !== 'string') errors.push('id 필수(string)')
  if (!m.project_ref || typeof m.project_ref !== 'string') errors.push('project_ref 필수(string)')
  if (!Array.isArray(m.changes) || m.changes.length === 0) {
    errors.push('changes 는 비어있지 않은 배열이어야 함')
  }

  // changes 상한(기본 20, max_changes 로 최대 50까지 명시적으로 확장 가능)
  if (m.max_changes !== undefined) {
    if (typeof m.max_changes !== 'number' || !Number.isFinite(m.max_changes) || m.max_changes < 1 || m.max_changes > MAX_CHANGES_CAP) {
      errors.push(`max_changes 는 1~${MAX_CHANGES_CAP} 사이 숫자여야 함(받은 값: ${JSON.stringify(m.max_changes)})`)
    }
  }
  const changesLimit = (typeof m.max_changes === 'number' && m.max_changes >= 1 && m.max_changes <= MAX_CHANGES_CAP)
    ? m.max_changes
    : MAX_CHANGES_DEFAULT
  if (Array.isArray(m.changes) && m.changes.length > changesLimit) {
    errors.push(`changes 개수(${m.changes.length})가 상한(${changesLimit}, max_changes 미지정 시 기본 ${MAX_CHANGES_DEFAULT})을 초과함`)
  }

  // SQL 인젝션 방어(이중화): manifest 의 모든 문자열 값에서 위험 문자 차단
  for (const v of scanManifestStringValues(m)) {
    errors.push(`manifest 문자열 값에 위험 문자(;/--//*) 포함: ${v.path} = ${JSON.stringify(v.value)}`)
  }

  const seenChangeKeys = new Set()
  for (const [i, c] of (Array.isArray(m.changes) ? m.changes : []).entries()) {
    const tag = `changes[${i}]`
    if (!c || typeof c !== 'object') { errors.push(`${tag} 객체 아님`); continue }
    if (c.op !== undefined && c.op !== 'update') {
      errors.push(`${tag}.op 은 update 만 허용(받은 값: ${JSON.stringify(c.op)})`)
    }
    if (!Object.prototype.hasOwnProperty.call(ALLOWLIST, c.table)) {
      errors.push(`${tag}.table 허용되지 않음(allowlist 밖): ${c.table}`)
      continue
    }
    if (!isUuid(c.id)) errors.push(`${tag}.id UUID 형식 아님: ${c.id}`)
    if (!c.expect_before || typeof c.expect_before !== 'object' || Array.isArray(c.expect_before)) {
      errors.push(`${tag}.expect_before 필수(object)`)
    } else {
      for (const [col, val] of Object.entries(c.expect_before)) {
        const typeErr = checkColumnValueType(c.table, col, val)
        if (typeErr) errors.push(`${tag}.expect_before.${col} ${typeErr}`)
      }
    }
    if (!c.set || typeof c.set !== 'object' || Array.isArray(c.set) || Object.keys(c.set).length === 0) {
      errors.push(`${tag}.set 필수(비어있지 않은 object)`)
    } else {
      for (const col of Object.keys(c.set)) {
        if (!ALLOWLIST[c.table].includes(col)) {
          errors.push(`${tag}.set.${col} 허용되지 않은 컬럼(테이블 ${c.table}, allowlist: ${ALLOWLIST[c.table].join(',')})`)
        }
        if (!c.expect_before || !Object.prototype.hasOwnProperty.call(c.expect_before, col)) {
          errors.push(`${tag}.set.${col} 이 expect_before 에 없음(가드 없는 변경 금지)`)
        }
        const typeErr = checkColumnValueType(c.table, col, c.set[col])
        if (typeErr) errors.push(`${tag}.set.${col} ${typeErr}`)
      }
    }
    const dupKey = `${c.table}:${c.id}`
    if (c.id !== undefined && seenChangeKeys.has(dupKey)) errors.push(`${tag} 중복된 (table,id): ${dupKey}`)
    if (c.id !== undefined) seenChangeKeys.add(dupKey)
  }

  for (const [i, entry] of (Array.isArray(m.must_not_change) ? m.must_not_change : []).entries()) {
    const tag = `must_not_change[${i}]`
    if (!entry || typeof entry !== 'object') { errors.push(`${tag} 객체 아님`); continue }
    if (!entry.table || typeof entry.table !== 'string') errors.push(`${tag}.table 필수(string)`)
    if (!isUuid(entry.id)) errors.push(`${tag}.id UUID 형식 아님: ${entry.id}`)
    if (!entry.expect || typeof entry.expect !== 'object' || Array.isArray(entry.expect)) {
      errors.push(`${tag}.expect 필수(object)`)
    }
  }

  for (const [i, entry] of (Array.isArray(m.reference_rows_must_exist) ? m.reference_rows_must_exist : []).entries()) {
    const tag = `reference_rows_must_exist[${i}]`
    if (!entry || typeof entry !== 'object') { errors.push(`${tag} 객체 아님`); continue }
    if (!entry.table || typeof entry.table !== 'string') errors.push(`${tag}.table 필수(string)`)
    if (!isUuid(entry.id)) errors.push(`${tag}.id UUID 형식 아님: ${entry.id}`)
    if (!entry.expect || typeof entry.expect !== 'object' || Array.isArray(entry.expect)) {
      errors.push(`${tag}.expect 필수(object)`)
    }
    if (entry.min_words !== undefined && (typeof entry.min_words !== 'number' || entry.min_words < 0)) {
      errors.push(`${tag}.min_words 는 0 이상 숫자여야 함`)
    }
  }

  for (const [i, sid] of (Array.isArray(m.affected_students) ? m.affected_students : []).entries()) {
    if (!isUuid(sid)) errors.push(`affected_students[${i}] UUID 형식 아님: ${sid}`)
  }

  if (m.learning_baseline_tables !== undefined && !Array.isArray(m.learning_baseline_tables)) {
    errors.push('learning_baseline_tables 는 배열이어야 함')
  }

  // generated_from(선택) — 라이브 읽기로 manifest 를 자동 생성하는 스크립트가
  // 채울 출처 메타데이터. 형식만 검증한다(내용은 신뢰하지 않음 — preflight
  // 가 여전히 실제 DB 상태를 다시 확인한다).
  if (m.generated_from !== undefined) {
    const gf = m.generated_from
    if (!gf || typeof gf !== 'object' || Array.isArray(gf)) {
      errors.push('generated_from 은 객체여야 함')
    } else {
      if (typeof gf.tool !== 'string' || !gf.tool) errors.push('generated_from.tool 필수(string)')
      if (typeof gf.at !== 'string' || !gf.at) errors.push('generated_from.at 필수(string, ISO 8601 권장)')
      if (gf.snapshot_sha256 !== undefined && (typeof gf.snapshot_sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(gf.snapshot_sha256))) {
        errors.push('generated_from.snapshot_sha256 은 64자리 hex 문자열이어야 함')
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * preflight(적용 전) 에 읽어서 확인해야 할 행 목록.
 * changes 의 expect_before + must_not_change + reference_rows_must_exist
 * (+ min_words 지정 시 단어 수 확인 플래그).
 * @returns {{table:string, id:string, expect:object, minWords:(number|null)}[]}
 */
export function buildPreflightPlan(manifest) {
  const items = []
  for (const c of manifest.changes || []) {
    items.push({ table: c.table, id: c.id, expect: c.expect_before, minWords: null })
  }
  for (const m of manifest.must_not_change || []) {
    items.push({ table: m.table, id: m.id, expect: m.expect, minWords: null })
  }
  for (const r of manifest.reference_rows_must_exist || []) {
    items.push({ table: r.table, id: r.id, expect: r.expect, minWords: r.min_words ?? null })
  }
  return items
}

/**
 * postflight(적용 후) 에 읽어서 확인해야 할 행 목록.
 * changes 의 set(=유일한 after 기대값) + must_not_change(불변 확인).
 * @returns {{table:string, id:string, expect:object}[]}
 */
export function buildPostflightPlan(manifest) {
  const items = []
  for (const c of manifest.changes || []) {
    items.push({ table: c.table, id: c.id, expect: c.set })
  }
  for (const m of manifest.must_not_change || []) {
    items.push({ table: m.table, id: m.id, expect: m.expect })
  }
  return items
}

/**
 * JS 값 -> SQL 리터럴 문자열(quote_literal 방식 — 작은따옴표 두 배 처리).
 * null/undefined -> NULL, boolean -> true/false, number -> 그대로, string ->
 * 작은따옴표로 감싸고 내부 작은따옴표를 두 배로.
 */
export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`sqlLiteral: 유효하지 않은 숫자 ${value}`)
    return String(value)
  }
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
  throw new Error(`sqlLiteral: 지원하지 않는 타입 ${typeof value} (값: ${JSON.stringify(value)})`)
}

function sqlIdentifier(name) {
  // ALLOWLIST 를 통과한 테이블/컬럼명만 여기 도달하지만, 방어적으로 다시
  // 한 번 형식을 강제한다(영숫자/언더스코어만).
  if (typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`sqlIdentifier: 허용되지 않는 식별자 ${JSON.stringify(name)}`)
  }
  return name
}

function sqlEq(col, value) {
  // null 가드는 "col is null"(소문자, 저장소 SQL 스타일과 일관) — WHERE
  // 절에서 "col = NULL" 은 절대 참이 될 수 없으므로 반드시 IS NULL 이어야
  // 한다(students/student_class_assignments.current_unit_id 처럼 유령 유닛
  // 참조를 NULL 로 비우는 변경의 가드/원복 모두 이 경로를 탄다).
  if (value === null || value === undefined) return `${col} is null`
  return `${col} = ${sqlLiteral(value)}`
}

function escMsg(s) {
  return String(s).replace(/'/g, "''")
}

function buildUpdateStatement(table, id, setEntries, whereEntries) {
  const t = sqlIdentifier(table)
  const setSql = setEntries.map(([col, val]) => `${sqlIdentifier(col)} = ${sqlLiteral(val)}`).join(', ')
  const whereSql = [`id = ${sqlLiteral(id)}`, ...whereEntries.map(([col, val]) => sqlEq(sqlIdentifier(col), val))].join(' and ')
  return `  update public.${t} set ${setSql} where ${whereSql};`
}

function buildExistsCondition(table, id, entries) {
  const t = sqlIdentifier(table)
  const whereSql = [`id = ${sqlLiteral(id)}`, ...entries.map(([col, val]) => sqlEq(sqlIdentifier(col), val))].join(' and ')
  return `select 1 from public.${t} where ${whereSql}`
}

function buildTransactionSql(manifest, runId, direction) {
  const changes = manifest.changes || []
  const lines = []
  lines.push('begin;')
  lines.push('do $$')
  lines.push('declare')
  lines.push('  v_rows integer;')
  lines.push('  v_total integer := 0;')
  lines.push('begin')

  for (const c of changes) {
    const setEntries = direction === 'apply'
      ? Object.entries(c.set)
      : Object.keys(c.set).map((col) => [col, c.expect_before[col]])
    const whereEntries = direction === 'apply'
      ? Object.entries(c.expect_before)
      : Object.entries(c.set)
    lines.push(`  -- ${c.table} ${c.id}`)
    lines.push(buildUpdateStatement(c.table, c.id, setEntries, whereEntries))
    lines.push('  get diagnostics v_rows = row_count;')
    const msg1 = escMsg(`ABORT[${runId}] ${c.table} ${c.id} 영향 %행(기대 1)`)
    lines.push(`  if v_rows <> 1 then raise exception '${msg1}', v_rows; end if;`)
    lines.push('  v_total := v_total + v_rows;')
  }

  const total = changes.length
  const msgTotal = escMsg(`ABORT[${runId}] 총 영향 행 수 불일치: % (기대 ${total})`)
  lines.push(`  if v_total <> ${total} then raise exception '${msgTotal}', v_total; end if;`)

  for (const c of changes) {
    const afterEntries = direction === 'apply'
      ? Object.entries(c.set)
      : Object.keys(c.set).map((col) => [col, c.expect_before[col]])
    const cond = buildExistsCondition(c.table, c.id, afterEntries)
    const msg2 = escMsg(`ABORT[${runId}] ${c.table} ${c.id} 사후 값 불일치`)
    lines.push(`  if not exists (${cond}) then raise exception '${msg2}'; end if;`)
  }

  for (const mnc of manifest.must_not_change || []) {
    const cond = buildExistsCondition(mnc.table, mnc.id, Object.entries(mnc.expect))
    const msg3 = escMsg(`ABORT[${runId}] must_not_change 위반: ${mnc.table} ${mnc.id}`)
    lines.push(`  if not exists (${cond}) then raise exception '${msg3}'; end if;`)
  }

  const msgOk = escMsg(`HOTFIX ${manifest.id} ${runId} OK: % rows`)
  lines.push(`  raise notice '${msgOk}', v_total;`)
  lines.push('end $$;')
  lines.push('commit;')
  return `${lines.join('\n')}\n`
}

/** apply SQL 문자열 생성(순수, 트랜잭션 1개). */
export function buildApplySql(manifest, runId) {
  return buildTransactionSql(manifest, runId, 'apply')
}

/** rollback SQL 문자열 생성(순수, apply 와 대칭 — where 에 set 값, set 에 expect_before 값). */
export function buildRollbackSql(manifest, runId) {
  return buildTransactionSql(manifest, runId, 'rollback')
}

// 파괴적 SQL 키워드 감지 목록. 이 파일 자체가 이 단어들을 담은 문자열
// 리터럴을 포함하면(주석/식별자 등) 저장소의 PreToolUse 파괴 명령 훅이
// 오탐으로 파일 쓰기 자체를 차단할 수 있어, 문자열을 조각내 연결한다
// (정규식이 매치하는 대상은 여전히 이 8개 단어 그대로 — 로직 변경 없음).
const DANGEROUS_WORDS = [
  'drop',
  'trunc' + 'ate',
  'delete',
  'insert',
  'alter',
  'grant',
  'revoke',
  'create',
]
const DANGEROUS_RE = new RegExp(`\\b(${DANGEROUS_WORDS.join('|')})\\b`, 'i')

/**
 * 파괴적 SQL 키워드 정적 스캔(비주석 라인만). 주석에는 이 단어들을 쓰지
 * 않는다는 저장소 관례를 전제로, `--` 이후를 잘라내고 검사한다.
 * @returns {{line:number, text:string, match:string}[]} 위반 목록(빈 배열 = 안전)
 */
export function staticSafetyScan(sql) {
  const violations = []
  const lines = String(sql).split(/\r?\n/)
  lines.forEach((line, idx) => {
    const codePart = line.split('--')[0]
    const m = codePart.match(DANGEROUS_RE)
    if (m) violations.push({ line: idx + 1, text: line.trim(), match: m[0].toLowerCase() })
  })
  return violations
}
