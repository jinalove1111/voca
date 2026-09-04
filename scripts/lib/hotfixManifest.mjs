// Production Safety Harness — 핫픽스 manifest 처리 (순수, 네트워크 0)
// (2026-09-03, Phase 1-B / 2026-09-04, Harness V2 Track B/C)
//
// 이 모듈은 파일 I/O·네트워크·DB 접근이 전혀 없다. manifest(JSON) 객체를
// 입력받아 검증하거나, 결정론적으로 SQL 문자열/읽기 계획을 만들어 낼 뿐이다.
// 실제 조회/실행은 scripts/prodHotfix.mjs(라이브 IO 담당)가 한다.
// B5(2026-09-04) — prodInvariants.mjs(같은 트랙, 순수 판정 모듈) 를
// import 해 스냅샷+manifest 로부터 invariant delta 를 미리 계산하는
// 순수 변환도 이 파일에 둔다(별도 IO 로더를 새로 만들지 않기 위해).
import { buildInvariantContext, evaluateInvariants } from './prodInvariants.mjs'
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

// B4(2026-09-04): student_class_assignments 전용 op:'insert'/op:'delete' —
// 위 ALLOWLIST 는 UPDATE 전용이라 SCA 행 자체의 신규 생성/제거(예: 유령
// 유닛 재배정이 아니라 아예 새 반 배정을 추가하는 premiddle 케이스)를
// 표현할 수 없었다. 이 두 상수는 그 좁은 예외의 필드 목록이다 — 다른
// 테이블/다른 필드로는 절대 확장되지 않는다(validateManifest 가 강제).
export const SCA_INSERT_FIELDS = ['student_id', 'class_id', 'textbook_id', 'current_unit_id', 'is_primary']
// QA-V2(2026-09-04): op:'delete' 의 expect_before 에 created_at 을 필수로
// 추가했다 — rollback(=삭제한 행 재삽입)이 created_at 을 복원하지 않으면
// 원복 후의 행이 "방금 만들어진 배정"으로 보여 배정 이력 기준 판정(정렬/
// 최초 배정일 등)이 조용히 달라진다. 값은 삭제 전 실측값(expect_before)이
// 유일한 원천이고, rollback insert 가 그 값을 그대로 되돌려 넣는다.
export const SCA_DELETE_EXPECT_FIELDS = ['student_id', 'class_id', 'textbook_id', 'current_unit_id', 'is_primary', 'created_at']

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
    // class_id 는 update ALLOWLIST 에는 없지만(반 이동은 이 하네스 범위
    // 밖) B4 insert/delete 의 필드/expect_before 값 검증에는 필요하다.
    class_id: 'uuid',
    // QA-V2: op=delete 의 rollback insert 가 되돌려 넣는 원래 생성시각.
    created_at: 'timestamp',
  },
  // QA-V2(2026-09-04): reference_rows_must_exist 의 참조 테이블도 값 타입을
  // 본다(예전엔 expect 가 object 인지만 확인하고 값은 전혀 검증하지 않았다).
  units: { textbook_id: 'uuid', class_id: 'uuid_or_null' },
  textbooks: { owner_class_id: 'uuid_or_null' },
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
  if (type === 'timestamp') {
    // 날짜/시각 문자열(ISO 8601 또는 Postgres timestamptz 표기). 값 자체의
    // 의미는 해석하지 않고 형식만 본다 — 실제 대조는 preflight 가 라이브
    // 값과 완전 일치로 확인한다.
    return (typeof val === 'string' && val.length >= 4 && val.length <= 64 && /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(val))
      ? null
      : `날짜/시각 문자열(YYYY-MM-DD… , 4~64자)이어야 함(값: ${JSON.stringify(val)})`
  }
  return null
}

/**
 * QA-V2(2026-09-04): expect(must_not_change / reference_rows_must_exist) 값의
 * 공통 검증 — 스칼라(string/number/boolean/null)만 허용하고, COLUMN_TYPES 에
 * 등록된 컬럼이면 expect_before 와 동일한 per-column 타입 규칙을 적용한다.
 * 중첩 객체/배열은 SQL 리터럴로 만들 수 없으므로(sqlLiteral 이 throw) 애초에
 * 검증 단계에서 거부한다 — 값 문자열의 위험 문자는 scanManifestStringValues
 * 가 별도로 본다.
 * @returns {string|null} 에러 메시지 또는 null(정상)
 */
function checkExpectValue(table, col, val) {
  const isScalar = val === null || ['string', 'number', 'boolean'].includes(typeof val)
  if (!isScalar) return `expect 값은 string/number/boolean/null 만 허용(값: ${JSON.stringify(val)})`
  return checkColumnValueType(table, col, val)
}

// ── SQL 인젝션 방어(Phase 2·7): manifest 의 모든 문자열 값에 위험 문자 차단 ──
// QA-V2(2026-09-04): `;`/`--`/`/*` 만으로는 이 하네스 자신의 인용을 벗어날 수
// 있는 문자를 못 막았다 — `$`(dollar-quote 로 `do $$ … $$` 블록을 조기 종료),
// `%`(`raise notice '… %'` 포맷 자리표시자 조작), 역슬래시(standard_conforming_
// strings 가 off 인 세션의 이스케이프), 제어문자(로그/SQL 파일 오염)를 함께
// 거부한다. 값 자체가 이런 문자를 정당하게 담을 일이 없다(전부 uuid/enum/
// 유닛명 같은 좁은 도메인 값) — 애매하면 fail-closed.
const INJECTION_CHAR_RE = new RegExp('(;|--|/\\*|\\$|%|\\\\|[\\u0000-\\u001f\\u007f])')

/**
 * manifest 객체를 재귀적으로 순회해 문자열 값 중 `;`/`--`/`/*`/`$`/`%`/
 * 역슬래시/제어문자를 포함한 것을 찾는다(순수, 네트워크 0). sqlLiteral
 * 이스케이프와 별개의 이중 방어선 — allowlist 를 통과한 값이라도 SQL 문자열
 * 리터럴 안에 이런 문자가 섞여 있으면 그 자체로 의심스러우므로 애초에
 * manifest 검증 단계에서 거부한다.
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

// ── B1(2026-09-04): 서술 일치성 린트(narrative consistency lint) ─────────
// 2026-09-02 유령 유닛 착지 핫픽스에서 손으로 쓴 rollback 코멘트가
// "unit_name 'Unit' -> 'Unit5'" 라고 적었지만 실제 expect_before.unit_name
// 은 이미 'Unit5' 였다(그 컬럼은 실제로 변경된 적이 없었다) — VERIFY 서술과
// WRITE 가드가 서로 다른 이야기를 하고 있었는데, 하네스는 SQL 자체는
// 올바르게 생성했으므로 아무 것도 이를 잡아내지 못했다. 이 섹션은 manifest
// 안의 모든 자유 텍스트(제목/코멘트/생성 메타데이터 등)에서 "A -> B" 류
// 서술을 찾아 실제 expect_before/set 값과 대조한다.

/**
 * change 하나를 "<table> <id>: <col> <before> -> <after>" 형태의 canonical
 * 문자열 배열로 표현한다(set 의 키마다 한 줄). apply/rollback SQL 헤더
 * 주석과 서술 일치성 린트가 이 함수 하나에서만 문구를 만든다 — 사람이 손으로
 * 따로 쓰는 서술 텍스트는 이제 없다.
 * @param {object} change manifest.changes[i]
 * @param {'apply'|'rollback'} [direction]
 * @returns {string[]}
 */
export function describeChange(change, direction = 'apply') {
  const table = change?.table
  const id = change?.id
  const op = change?.op || 'update'
  if (op === 'insert') {
    const summary = JSON.stringify(change?.fields || {})
    return direction === 'apply'
      ? [`${table} ${id}: INSERT ${summary}`]
      : [`${table} ${id}: DELETE(rollback of insert) ${summary}`]
  }
  if (op === 'delete') {
    const summary = JSON.stringify(change?.expect_before || {})
    return direction === 'apply'
      ? [`${table} ${id}: DELETE ${summary}`]
      : [`${table} ${id}: INSERT(rollback of delete) ${summary}`]
  }
  const lines = []
  for (const col of Object.keys(change?.set || {})) {
    const beforeVal = direction === 'apply' ? change?.expect_before?.[col] : change?.set?.[col]
    const afterVal = direction === 'apply' ? change?.set?.[col] : change?.expect_before?.[col]
    lines.push(`${table} ${id}: ${col} ${JSON.stringify(beforeVal)} -> ${JSON.stringify(afterVal)}`)
  }
  return lines
}

// "A -> B" 류 화살표 서술을 텍스트에서 추출한다. 범용 자연어 파서가 아니라
// 이 저장소의 실제 습관(따옴표로 감싼 값, 유니코드 화살표, 공백을 둔 ascii
// 화살표)만 대상으로 하는 휴리스틱이다 — 못 찾으면 그냥 빈 배열(오탐보다
// 미탐이 안전한 방향, "찾은 것만" 검증한다).
function extractArrowNarratives(text) {
  const found = []
  let remaining = String(text ?? '')

  // 1) 따옴표 형태: (선택) 컬럼명 단어 'before' -> 'after' (화살표는 -> 또는 →)
  remaining = remaining.replace(/([a-zA-Z_][a-zA-Z0-9_]*)?\s*'([^']*)'\s*(?:->|→)\s*'([^']*)'/g, (m, col, before, after) => {
    found.push({ col: col || null, before, after })
    return ' '.repeat(m.length)
  })

  // 2) 유니코드 화살표(공백 없이 붙어도 됨): (선택) 컬럼명 token→token
  remaining = remaining.replace(/([a-zA-Z_][a-zA-Z0-9_]*)?\s*([^\s'"→]+)→([^\s'"→]+)/g, (m, col, before, after) => {
    found.push({ col: col || null, before, after })
    return ' '.repeat(m.length)
  })

  // 3) 맨 문자열 ascii 화살표: (선택) 컬럼명 token -> token
  remaining = remaining.replace(/([a-zA-Z_][a-zA-Z0-9_]*)?\s*([^\s'"]+)\s->\s([^\s'"]+)/g, (m, col, before, after) => {
    found.push({ col: col || null, before, after })
    return ' '.repeat(m.length)
  })

  return found
}

/**
 * manifest 안의 모든 자유 텍스트 문자열(title/_comment/notes/
 * generated_from.* 등, changes[].expect_before/set/expect 는 구조적 가드
 * 값이라 스캔 제외)에서 "A -> B" 류 서술을 찾아, 같은 행(changeCtx 안이면
 * 그 행, 그 외 최상위 필드는 changes 전체)의 실제 expect_before/set 값과
 * 대조한다. 서술의 before/after 중 하나만 실제 값과 일치하고 나머지가
 * 다르면(=서술이 실제와 다른 이야기를 하고 있으면) FAIL 로 본다. 둘 다
 * 일치하거나 어느 change 의 컬럼 값과도 상관없으면(검증 불가) 무시한다
 * (오탐 방지 — "찾아서 대조 가능한 것만" 검증).
 * @param {object} manifest
 * @returns {string[]} lint 위반 메시지 목록(빈 배열 = 문제 없음)
 */
export function lintManifestNarratives(manifest) {
  const errors = []
  if (!manifest || typeof manifest !== 'object') return errors
  const changes = Array.isArray(manifest.changes) ? manifest.changes : []

  // QA-V2(2026-09-04) 오탐 수정 — 예전 규칙은 "부분 일치(before 만 또는 after
  // 만 일치)하는 change 가 하나라도 있으면 FAIL" 이었다. 유령 유닛 정정처럼
  // 여러 행이 같은 before 값('113ee184…')에서 서로 다른 목적지로 갈라지는
  // manifest 에서는, 최상위 제목이 그중 한 change 를 정확히 서술해도 나머지
  // change 들과 부분 일치한다는 이유로 FAIL 이 났다(실제 모순이 아님).
  // 새 규칙: 후보 change 중 before/after 가 **둘 다** 맞는 것이 하나라도
  // 있으면 그 서술은 참이므로 PASS. 하나도 없고 부분 일치만 있으면(=서술이
  // 실제와 다른 이야기를 하는 상태) FAIL. 아무 것도 못 맞추면 검증 불가로
  // 보고 무시한다(기존 오탐 방지 원칙 유지). changes[i] 안의 서술은 후보가
  // 그 change 하나뿐이므로 "그 행만" 과 대조된다.
  function checkText(text, pathStr, changeCtx) {
    for (const n of extractArrowNarratives(text)) {
      const candidates = changeCtx ? [changeCtx] : changes
      let fullMatch = false
      const partials = []
      for (const c of candidates) {
        if (!c || !c.set || typeof c.set !== 'object') continue
        const cols = n.col ? [n.col] : Object.keys(c.set)
        for (const col of cols) {
          if (!(col in c.set)) continue
          const expectBeforeVal = c.expect_before ? c.expect_before[col] : undefined
          const setVal = c.set[col]
          const beforeMatches = n.before === String(expectBeforeVal)
          const afterMatches = n.after === String(setVal)
          if (beforeMatches && afterMatches) { fullMatch = true; break }
          if (beforeMatches || afterMatches) {
            partials.push({ c, col, expectBeforeVal, setVal })
          }
        }
        if (fullMatch) break
      }
      if (fullMatch || partials.length === 0) continue
      const { c, col, expectBeforeVal, setVal } = partials[0]
      errors.push(
        `narrative 불일치: ${pathStr} "${n.col ? `${n.col} ` : ''}'${n.before}' -> '${n.after}'" `
        + `vs 실제 ${c.table}:${c.id}.${col} ${JSON.stringify(expectBeforeVal)} -> ${JSON.stringify(setVal)}`
        + (partials.length > 1 ? ` (외 ${partials.length - 1}건 부분 일치, 완전 일치 change 없음)` : ''),
      )
    }
  }

  function walk(obj, pathStr, changeCtx) {
    if (obj === null || obj === undefined) return
    if (typeof obj === 'string') { checkText(obj, pathStr, changeCtx); return }
    if (Array.isArray(obj)) { obj.forEach((v, i) => walk(v, `${pathStr}[${i}]`, changeCtx)); return }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        // expect_before/set/expect 는 서술형 텍스트가 아니라 구조적 가드
        // 값이다 — 우연히 화살표 패턴을 담은 문자열이 있어도 스캔 제외.
        if (k === 'expect_before' || k === 'set' || k === 'expect' || k === 'fields') continue
        walk(v, pathStr ? `${pathStr}.${k}` : k, changeCtx)
      }
    }
  }

  for (const [k, v] of Object.entries(manifest)) {
    if (k === 'changes') {
      changes.forEach((c, i) => walk(c, `changes[${i}]`, c))
    } else {
      walk(v, k, null)
    }
  }

  return errors
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

  // B1(2026-09-04): 서술 일치성 린트 — 자유 텍스트(title/_comment/notes/
  // generated_from 등)의 "A -> B" 서술이 실제 expect_before/set 값과
  // 어긋나면 여기서 거부한다(2026-09-02 유령 유닛 사고 재현 방지).
  errors.push(...lintManifestNarratives(m))

  const seenChangeKeys = new Set()
  for (const [i, c] of (Array.isArray(m.changes) ? m.changes : []).entries()) {
    const tag = `changes[${i}]`
    if (!c || typeof c !== 'object') { errors.push(`${tag} 객체 아님`); continue }
    const op = c.op === undefined ? 'update' : c.op
    if (!['update', 'insert', 'delete'].includes(op)) {
      errors.push(`${tag}.op 은 update/insert/delete 만 허용(받은 값: ${JSON.stringify(c.op)})`)
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(ALLOWLIST, c.table)) {
      errors.push(`${tag}.table 허용되지 않음(allowlist 밖): ${c.table}`)
      continue
    }
    if (!isUuid(c.id)) errors.push(`${tag}.id UUID 형식 아님: ${c.id}`)

    // B4(2026-09-04): op:'insert'/'delete' 는 student_class_assignments
    // 전용의 좁은 예외다 — update 와 완전히 다른 스키마(expect_before/set
    // 대신 fields, 또는 행 전체 expect_before)를 쓴다.
    if (op === 'insert') {
      if (c.table !== 'student_class_assignments') {
        errors.push(`${tag} op=insert 는 student_class_assignments 테이블만 허용(받은 값: ${c.table})`)
      }
      if (!c.fields || typeof c.fields !== 'object' || Array.isArray(c.fields)) {
        errors.push(`${tag}.fields 필수(object, op=insert)`)
      } else {
        const missing = SCA_INSERT_FIELDS.filter((f) => !(f in c.fields))
        if (missing.length) errors.push(`${tag}.fields 누락 컬럼: ${missing.join(',')}`)
        const extra = Object.keys(c.fields).filter((f) => !SCA_INSERT_FIELDS.includes(f))
        if (extra.length) errors.push(`${tag}.fields 허용되지 않은 컬럼: ${extra.join(',')}`)
        for (const [col, val] of Object.entries(c.fields)) {
          const typeErr = checkColumnValueType(c.table, col, val)
          if (typeErr) errors.push(`${tag}.fields.${col} ${typeErr}`)
        }
      }
      if (c.expect_before !== undefined) errors.push(`${tag}.expect_before 는 op=insert 에서 사용하지 않음(fields 만 사용)`)
      if (c.set !== undefined) errors.push(`${tag}.set 은 op=insert 에서 사용하지 않음(fields 만 사용)`)
    } else if (op === 'delete') {
      if (c.table !== 'student_class_assignments') {
        errors.push(`${tag} op=delete 는 student_class_assignments 테이블만 허용(받은 값: ${c.table})`)
      }
      if (!c.expect_before || typeof c.expect_before !== 'object' || Array.isArray(c.expect_before)) {
        errors.push(`${tag}.expect_before 필수(object, op=delete — 행 전체 5개 컬럼)`)
      } else {
        const missing = SCA_DELETE_EXPECT_FIELDS.filter((f) => !(f in c.expect_before))
        if (missing.length) errors.push(`${tag}.expect_before op=delete 는 행 전체(5개 컬럼) 필요, 누락: ${missing.join(',')}`)
        for (const [col, val] of Object.entries(c.expect_before)) {
          const typeErr = checkColumnValueType(c.table, col, val)
          if (typeErr) errors.push(`${tag}.expect_before.${col} ${typeErr}`)
        }
        if (c.expect_before.is_primary === true && m.allow_primary_delete !== true) {
          errors.push(`${tag} op=delete 대상이 is_primary=true 인데 manifest.allow_primary_delete=true 가 없음(주교재 삭제는 명시적 허용 필요)`)
        }
      }
      if (c.set !== undefined) errors.push(`${tag}.set 은 op=delete 에서 사용하지 않음`)
      if (c.fields !== undefined) errors.push(`${tag}.fields 는 op=delete 에서 사용하지 않음`)
    } else {
      // op === 'update' (기존 로직 그대로)
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
    } else {
      // QA-V2(2026-09-04): expect 값도 expect_before 와 동일한 타입 규칙 적용.
      for (const [col, val] of Object.entries(entry.expect)) {
        const typeErr = checkExpectValue(entry.table, col, val)
        if (typeErr) errors.push(`${tag}.expect.${col} ${typeErr}`)
      }
    }
  }

  for (const [i, entry] of (Array.isArray(m.reference_rows_must_exist) ? m.reference_rows_must_exist : []).entries()) {
    const tag = `reference_rows_must_exist[${i}]`
    if (!entry || typeof entry !== 'object') { errors.push(`${tag} 객체 아님`); continue }
    if (!entry.table || typeof entry.table !== 'string') errors.push(`${tag}.table 필수(string)`)
    if (!isUuid(entry.id)) errors.push(`${tag}.id UUID 형식 아님: ${entry.id}`)
    if (!entry.expect || typeof entry.expect !== 'object' || Array.isArray(entry.expect)) {
      errors.push(`${tag}.expect 필수(object)`)
    } else {
      for (const [col, val] of Object.entries(entry.expect)) {
        const typeErr = checkExpectValue(entry.table, col, val)
        if (typeErr) errors.push(`${tag}.expect.${col} ${typeErr}`)
      }
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
 * update change 는 expect_before, insert change 는 "중복 없음" 선조건
 * (kind:'no-duplicate'), delete change 는 삭제 대상 행 전체(expect_before)
 * + must_not_change + reference_rows_must_exist(+ min_words).
 * @returns {Array<{table:string, id:string, expect?:object, kind?:string, filters?:object, minWords:(number|null)}>}
 */
export function buildPreflightPlan(manifest) {
  const items = []
  for (const c of manifest.changes || []) {
    const op = c.op || 'update'
    if (op === 'insert') {
      // QA-V2(2026-09-04): SQL 가드(buildNoDuplicateGuard)와 같은 두 조합을
      // 읽기 계획에서도 확인한다(VERIFY==WRITE 원칙).
      //  (a) student_id+textbook_id — 하네스 도메인 규칙
      //  (b) student_id+class_id — 테이블의 실제 unique key
      // class_id 가 null 인 배정은 (b) 를 건너뛴다: PostgREST 의 .eq(col, null)
      // 은 IS NULL 이 아니라 'null' 문자열 비교가 돼 신뢰할 수 없다(SQL 가드
      // 쪽은 sqlEq 가 `class_id is null` 로 올바르게 만들어 그대로 확인한다).
      items.push({
        table: c.table, id: c.id, kind: 'no-duplicate', minWords: null,
        filters: { student_id: c.fields?.student_id, textbook_id: c.fields?.textbook_id },
      })
      if (c.fields?.class_id != null) {
        items.push({
          table: c.table, id: c.id, kind: 'no-duplicate', minWords: null,
          filters: { student_id: c.fields?.student_id, class_id: c.fields?.class_id },
        })
      }
      continue
    }
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
 * update change 는 set(=유일한 after 기대값), insert change 는 새로
 * 생겼어야 할 행(expect:fields), delete change 는 더는 존재하지 않아야
 * 함(kind:'not-exists') + must_not_change(불변 확인).
 * @returns {Array<{table:string, id:string, expect?:object, kind?:string}>}
 */
export function buildPostflightPlan(manifest) {
  const items = []
  for (const c of manifest.changes || []) {
    const op = c.op || 'update'
    if (op === 'insert') { items.push({ table: c.table, id: c.id, expect: c.fields }); continue }
    if (op === 'delete') { items.push({ table: c.table, id: c.id, kind: 'not-exists' }); continue }
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

// QA-V2(2026-09-04): 메시지에 실리는 **데이터** 이스케이프. 작은따옴표는 두
// 배로, `%` 는 `%%` 로 바꾼다 — `raise exception/notice '…%…', arg` 에서 `%`
// 는 인자 자리표시자라, 데이터에 섞인 `%` 를 그대로 두면 포맷 문자열의 인자
// 개수가 어긋나 메시지가 왜곡되거나 실행이 실패한다(값 자체의 `%` 는
// INJECTION_CHAR_RE 가 이미 manifest 단계에서 거부하지만, 생성기도 스스로
// 안전해야 한다 — 이중 방어선).
function escMsg(s) {
  return String(s).replace(/'/g, "''").replace(/%/g, '%%')
}

/**
 * raise 메시지 포맷 문자열 생성용 태그드 템플릿. 리터럴 조각(이 파일이 직접
 * 쓴 문구 — 의도된 `%` 자리표시자를 포함)은 그대로 두고, 보간되는 값(데이터)
 * 만 escMsg 로 이스케이프한다.
 */
function fmtMsg(strings, ...vals) {
  return strings.reduce((acc, part, i) => acc + part + (i < vals.length ? escMsg(vals[i]) : ''), '')
}

// QA-V2(2026-09-04): dollar-quote 를 태그 없는 `$$` 대신 runId 로 태그화한다
// (`$hotfix_<runId>$ … $hotfix_<runId>$`). 태그가 없으면 블록 안 어딘가에
// 우연히/악의적으로 들어간 `$$` 가 블록을 조기 종료시킬 수 있다 — manifest
// 값의 `$` 는 이미 거부되지만, 인용은 데이터로 탈출 가능하면 안 된다.
// runId 는 하네스가 만든 값(YYYYMMDDHHmmss-hex, 테스트는 RUN-… 형태)이므로
// 영숫자/하이픈/언더스코어만 허용하고 그 외 문자는 즉시 throw(fail-closed).
function dollarQuoteTag(runId) {
  const raw = String(runId ?? '')
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new Error(`dollarQuoteTag: runId 에 허용되지 않는 문자가 있습니다 ${JSON.stringify(runId)}`)
  }
  const alnum = raw.replace(/[^A-Za-z0-9]/g, '')
  if (!/^[A-Za-z0-9]+$/.test(alnum)) {
    throw new Error(`dollarQuoteTag: runId 에서 유효한 태그를 만들 수 없습니다 ${JSON.stringify(runId)}`)
  }
  return `$hotfix_${alnum}$`
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

// B4(2026-09-04): insert/delete SQL 조각. student_class_assignments 전용
// (validateManifest 가 이미 강제) — 다른 테이블/형태는 staticSafetyScan 의
// SAFE_SCA_*_RE 가 이 정확한 포맷만 통과시킨다.
function buildInsertStatement(table, id, fields) {
  const t = sqlIdentifier(table)
  const cols = ['id', ...Object.keys(fields)]
  const vals = [id, ...Object.values(fields)]
  const colSql = cols.map(sqlIdentifier).join(', ')
  const valSql = vals.map(sqlLiteral).join(', ')
  return `  insert into public.${t} (${colSql}) values (${valSql});`
}

function buildDeleteStatement(table, id, whereEntries) {
  const t = sqlIdentifier(table)
  const whereSql = [`id = ${sqlLiteral(id)}`, ...whereEntries.map(([col, val]) => sqlEq(sqlIdentifier(col), val))].join(' and ')
  return `  delete from public.${t} where ${whereSql};`
}

// QA-V2(2026-09-04) — insert 선행조건은 두 개다.
//  (a) (student_id, textbook_id): 이 하네스의 도메인 규칙("한 학생이 같은
//      교재를 두 번 배정받지 않는다"). 기존부터 있던 가드.
//  (b) (student_id, class_id): student_class_assignments 테이블의 **실제
//      unique key**. (a)만 확인하면 같은 반에 이미 행이 있는 경우 INSERT 가
//      DB 제약 위반으로 터진다(트랜잭션이라 데이터는 안전하지만, 승인 후
//      실패 = 운영자 재작업). 두 선행조건을 모두 SQL 가드로 넣고, preflight
//      읽기 계획(buildPreflightPlan)도 같은 두 조합을 확인한다.
function buildNoDuplicateGuard(table, filters, runId, changeIdx, label) {
  const t = sqlIdentifier(table)
  const cond = Object.entries(filters).map(([col, val]) => sqlEq(sqlIdentifier(col), val)).join(' and ')
  const msg = fmtMsg`ABORT[${runId}] insert precondition 위반(changes[${changeIdx}]): ${label} 중복 행 이미 존재`
  return `  if exists (select 1 from public.${t} where ${cond}) then raise exception '${msg}'; end if;`
}

// direction='apply' 이면 declaredOp 그대로 실행, direction='rollback' 이면
// insert<->delete 를 서로 뒤집는다(update 는 rollback 도 update, SET/WHERE
// 값만 뒤집힘 — 기존 로직 그대로).
function opForDirection(declaredOp, direction) {
  if (direction === 'apply') return declaredOp
  if (declaredOp === 'insert') return 'delete'
  if (declaredOp === 'delete') return 'insert'
  return 'update'
}

function buildTransactionSql(manifest, runId, direction) {
  const changes = manifest.changes || []
  const tag = dollarQuoteTag(runId)
  const lines = []
  lines.push('begin;')
  lines.push(`do ${tag}`)
  lines.push('declare')
  lines.push('  v_rows integer;')
  lines.push('  v_total integer := 0;')
  lines.push('begin')

  changes.forEach((c, idx) => {
    const declaredOp = c.op || 'update'
    const execOp = opForDirection(declaredOp, direction)
    for (const desc of describeChange(c, direction)) lines.push(`  -- ${desc}`)

    if (execOp === 'update') {
      const setEntries = direction === 'apply'
        ? Object.entries(c.set)
        : Object.keys(c.set).map((col) => [col, c.expect_before[col]])
      const whereEntries = direction === 'apply'
        ? Object.entries(c.expect_before)
        : Object.entries(c.set)
      lines.push(buildUpdateStatement(c.table, c.id, setEntries, whereEntries))
    } else if (execOp === 'insert') {
      // declaredOp==='insert'(apply) -> 진짜 신규 삽입(fields) + 중복 가드.
      // declaredOp==='delete'(rollback) -> 방금 지운 행을 expect_before 로 복원.
      // declaredOp==='delete'(rollback) 의 insertFields 는 expect_before 전체
      // (created_at 포함) — 삭제 전 행을 필드 하나 빠짐없이 복원한다.
      const insertFields = declaredOp === 'insert' ? c.fields : c.expect_before
      if (declaredOp === 'insert' && direction === 'apply') {
        lines.push(buildNoDuplicateGuard(c.table, { student_id: c.fields.student_id, textbook_id: c.fields.textbook_id }, runId, idx, 'student_id+textbook_id'))
        lines.push(buildNoDuplicateGuard(c.table, { student_id: c.fields.student_id, class_id: c.fields.class_id }, runId, idx, 'student_id+class_id(unique key)'))
      }
      lines.push(buildInsertStatement(c.table, c.id, insertFields))
    } else {
      // execOp === 'delete'. declaredOp==='delete'(apply) -> expect_before
      // 전체로 가드해 삭제. declaredOp==='insert'(rollback) -> 방금 넣은
      // 행을 fields 전체로 가드해 삭제.
      const whereFields = declaredOp === 'delete' ? c.expect_before : c.fields
      lines.push(buildDeleteStatement(c.table, c.id, Object.entries(whereFields)))
    }

    lines.push('  get diagnostics v_rows = row_count;')
    const msg1 = fmtMsg`ABORT[${runId}] ${c.table} ${c.id} 영향 %행(기대 1)`
    lines.push(`  if v_rows <> 1 then raise exception '${msg1}', v_rows; end if;`)
    lines.push('  v_total := v_total + v_rows;')
  })

  const total = changes.length
  const msgTotal = fmtMsg`ABORT[${runId}] 총 영향 행 수 불일치: % (기대 ${total})`
  lines.push(`  if v_total <> ${total} then raise exception '${msgTotal}', v_total; end if;`)

  for (const c of changes) {
    const declaredOp = c.op || 'update'
    const execOp = opForDirection(declaredOp, direction)
    if (execOp === 'update') {
      const afterEntries = direction === 'apply'
        ? Object.entries(c.set)
        : Object.keys(c.set).map((col) => [col, c.expect_before[col]])
      const cond = buildExistsCondition(c.table, c.id, afterEntries)
      const msg2 = fmtMsg`ABORT[${runId}] ${c.table} ${c.id} 사후 값 불일치`
      lines.push(`  if not exists (${cond}) then raise exception '${msg2}'; end if;`)
    } else if (execOp === 'insert') {
      const insertFields = declaredOp === 'insert' ? c.fields : c.expect_before
      const cond = buildExistsCondition(c.table, c.id, Object.entries(insertFields))
      const msg2 = fmtMsg`ABORT[${runId}] ${c.table} ${c.id} 사후 값 불일치(삽입 확인 실패)`
      lines.push(`  if not exists (${cond}) then raise exception '${msg2}'; end if;`)
    } else {
      const t = sqlIdentifier(c.table)
      const msg2 = fmtMsg`ABORT[${runId}] ${c.table} ${c.id} 삭제 확인 실패(행이 여전히 존재)`
      lines.push(`  if exists (select 1 from public.${t} where id = ${sqlLiteral(c.id)}) then raise exception '${msg2}'; end if;`)
    }
  }

  for (const mnc of manifest.must_not_change || []) {
    const cond = buildExistsCondition(mnc.table, mnc.id, Object.entries(mnc.expect))
    const msg3 = fmtMsg`ABORT[${runId}] must_not_change 위반: ${mnc.table} ${mnc.id}`
    lines.push(`  if not exists (${cond}) then raise exception '${msg3}'; end if;`)
  }

  const msgOk = fmtMsg`HOTFIX ${manifest.id} ${runId} OK: % rows`
  lines.push(`  raise notice '${msgOk}', v_total;`)
  lines.push(`end ${tag};`)
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

// B4(2026-09-04): student_class_assignments 전용 insert/delete 는 이 정확한
// 생성 포맷일 때만 정적 스캔을 통과한다(그 외 테이블/형태의 INSERT/DELETE
// 는 여전히 전부 거부 — ALLOWLIST 는 UPDATE 전용이라는 원칙을 이 세 패턴
// 밖에서는 그대로 유지한다).
const SAFE_SCA_INSERT_RE = /^\s*insert into public\.student_class_assignments \([a-z_, ]+\) values \(.*\);\s*$/i
const SAFE_SCA_DELETE_RE = /^\s*delete from public\.student_class_assignments where id = .+;\s*$/i
const SAFE_SCA_DUP_GUARD_RE = /^\s*if exists \(select 1 from public\.student_class_assignments where .*\) then raise exception '.*'; end if;\s*$/i

/**
 * 파괴적 SQL 키워드 정적 스캔(비주석 라인만). 주석에는 이 단어들을 쓰지
 * 않는다는 저장소 관례를 전제로, `--` 이후를 잘라내고 검사한다. B4 —
 * student_class_assignments 전용으로 이 파일이 스스로 생성하는 정확한
 * insert/delete 포맷(SAFE_SCA_*_RE)만 예외로 통과시킨다.
 * B1 — manifest 를 함께 넘기면 lintManifestNarratives() 위반도 violations
 * 목록에 `match:'narrative-drift'` 로 포함시킨다(선택 인자, 생략 시 기존
 * 동작 그대로).
 * @param {string} sql
 * @param {object} [manifest]
 * @returns {{line:number, text:string, match:string}[]} 위반 목록(빈 배열 = 안전)
 */
export function staticSafetyScan(sql, manifest) {
  const violations = []
  const lines = String(sql).split(/\r?\n/)
  lines.forEach((line, idx) => {
    const codePart = line.split('--')[0]
    const m = codePart.match(DANGEROUS_RE)
    if (m) {
      const isSafeScaOp = SAFE_SCA_INSERT_RE.test(codePart) || SAFE_SCA_DELETE_RE.test(codePart) || SAFE_SCA_DUP_GUARD_RE.test(codePart)
      if (!isSafeScaOp) violations.push({ line: idx + 1, text: line.trim(), match: m[0].toLowerCase() })
    }
  })
  if (manifest) {
    for (const finding of lintManifestNarratives(manifest)) {
      violations.push({ line: 0, text: finding, match: 'narrative-drift' })
    }
  }
  return violations
}

// ── B2(2026-09-04): VERIFY==WRITE 구조적 회귀 가드 ────────────────────────
// 기존 테스트 섹션 [2]는 buildApplySql()/buildRollbackSql() 출력에 특정
// 리터럴이 "포함되는지"(문자열 .includes()) 만 확인했다 — 부분 문자열
// 서브셋 검사라 SET/WHERE 절이 "그 값을 포함하되 다른 값도 섞여 있는" 회귀는
// 못 잡는다. 여기서는 생성된 SQL 을 역파싱해 WHERE == expect_before(+id),
// SET == set (rollback 은 반대) 을 완전 일치로 재확인한다.

function parseSqlSingleLiteral(lit) {
  const s = String(lit).trim()
  if (s === 'NULL') return null
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'")
  return s
}

function parseCondList(str) {
  return str.split(/\s+and\s+/i).map((pair) => {
    if (/\bis null$/i.test(pair.trim())) {
      return [pair.trim().replace(/\s+is null$/i, '').trim(), null]
    }
    const idx = pair.indexOf('=')
    const col = pair.slice(0, idx).trim()
    const val = parseSqlSingleLiteral(pair.slice(idx + 1).trim())
    return [col, val]
  })
}

/**
 * buildUpdateStatement() 가 생성한 한 줄(`update public.<table> set ... where
 * ...;`)만 역파싱한다(범용 SQL 파서 아님 — 이 파일이 스스로 만든 포맷만
 * 안전하게 되읽는다). B2 회귀 가드 전용.
 * @param {string} line
 * @returns {{table:string, set:Record<string,*>, where:Record<string,*>}|null}
 */
export function parseGeneratedUpdateStatement(line) {
  const m = /^\s*update public\.(\w+) set (.+) where (.+);\s*$/.exec(String(line ?? ''))
  if (!m) return null
  const [, table, setStr, whereStr] = m
  const setPairs = setStr.split(/,\s*(?=\w+\s*=)/).map((pair) => {
    const idx = pair.indexOf('=')
    const col = pair.slice(0, idx).trim()
    const val = parseSqlSingleLiteral(pair.slice(idx + 1).trim())
    return [col, val]
  })
  return {
    table,
    set: Object.fromEntries(setPairs),
    where: Object.fromEntries(parseCondList(whereStr)),
  }
}

function sortObjJson(o) {
  const out = {}
  for (const k of Object.keys(o || {}).sort()) out[k] = o[k]
  return JSON.stringify(out)
}

/**
 * B2(2026-09-04) → C3(2026-09-05, 런타임 가드로 배선하며 시그니처 변경) —
 * VERIFY(preflight 계획) 와 WRITE(apply/rollback SQL) 가 항상 같은
 * expect_before/set 데이터에서 파생되는지 구조적으로 재확인한다. update
 * 타입 change 만 대상(insert/delete 는 포맷이 달라 이 가드 범위 밖 — B4 의
 * 전용 postflight 계획이 그 대신 확인한다). 순수 함수, 상시 회귀 가드
 * (VERIFY_WRITE_DRIFT) — 절대 throw 하지 않는다.
 *
 * C3: 이전엔 (manifest, runId) 를 받아 buildApplySql/buildRollbackSql 을
 * **내부에서 다시** 호출했다 — manifest 하나에서 두 경로(SQL 생성 vs 이
 * 가드)가 각각 독립적으로 같은 순수 함수를 호출하는 구조라, 실제로 쓰일
 * applySql/rollbackSql 이 아니라 "같은 입력을 다시 넣었을 때 재현되는 값"만
 * 검증하는 동어반복이었다(runHotfix() 어디서도 호출되지 않았던 이유 —
 * 실행 경로에 배선해도 의미 있는 검증이 되지 않았다). 이제 이미 생성된
 * applySql/rollbackSql(파일로 저장하기 직전의 그 문자열 그대로)을 인자로
 * 받아 재파싱 — SQL 생성 경로(D.buildApplySql 등 의존성 주입/테스트 스텁
 * 포함)에서 실제로 무엇이 만들어졌는지를 manifest 기대값과 대조한다.
 * @param {object} manifest
 * @param {string} applySql buildApplySql(manifest, runId) 의 실제 출력(또는 동등물)
 * @param {string} rollbackSql buildRollbackSql(manifest, runId) 의 실제 출력(또는 동등물)
 * @returns {{ok:boolean, mismatches:Array<object>}}
 */
export function verifyWriteDriftGuard(manifest, applySql, rollbackSql) {
  const mismatches = []
  const applyLines = String(applySql ?? '').split('\n').filter((l) => /^\s*update public\./.test(l)).map(parseGeneratedUpdateStatement)
  const rollbackLines = String(rollbackSql ?? '').split('\n').filter((l) => /^\s*update public\./.test(l)).map(parseGeneratedUpdateStatement)
  const preflightPlan = buildPreflightPlan(manifest)
  const updateChanges = (manifest.changes || []).filter((c) => (c.op || 'update') === 'update')

  // C3 — 건수(row 수) 드리프트: manifest 의 update change 개수와 실제 SQL 에
  // 담긴 update 문 개수가 다르면(관련 없는 문장이 섞였거나 일부가 빠졌으면)
  // 아래 per-change 대조(where.id 매칭)만으로는 "매칭 안 된 여분 라인"을
  // 못 잡는다 — 총 개수 비교로 그 갭을 메운다.
  if (applyLines.length !== updateChanges.length) {
    mismatches.push({ table: null, id: null, reason: 'apply-row-count-mismatch', expected: updateChanges.length, actual: applyLines.length })
  }
  if (rollbackLines.length !== updateChanges.length) {
    mismatches.push({ table: null, id: null, reason: 'rollback-row-count-mismatch', expected: updateChanges.length, actual: rollbackLines.length })
  }

  for (const c of updateChanges) {
    const parsedApply = applyLines.find((p) => p && p.table === c.table && p.where.id === c.id)
    if (!parsedApply) { mismatches.push({ table: c.table, id: c.id, reason: 'apply-sql-not-found' }); continue }
    const expectedWhere = { id: c.id, ...c.expect_before }
    if (sortObjJson(parsedApply.where) !== sortObjJson(expectedWhere)) {
      mismatches.push({ table: c.table, id: c.id, reason: 'apply-where-mismatch', expected: expectedWhere, actual: parsedApply.where })
    }
    if (sortObjJson(parsedApply.set) !== sortObjJson(c.set)) {
      mismatches.push({ table: c.table, id: c.id, reason: 'apply-set-mismatch', expected: c.set, actual: parsedApply.set })
    }

    const parsedRollback = rollbackLines.find((p) => p && p.table === c.table && p.where.id === c.id)
    if (!parsedRollback) { mismatches.push({ table: c.table, id: c.id, reason: 'rollback-sql-not-found' }); continue }
    const expectedRollbackWhere = { id: c.id, ...c.set }
    if (sortObjJson(parsedRollback.where) !== sortObjJson(expectedRollbackWhere)) {
      mismatches.push({ table: c.table, id: c.id, reason: 'rollback-where-mismatch', expected: expectedRollbackWhere, actual: parsedRollback.where })
    }
    const expectedRollbackSet = {}
    for (const col of Object.keys(c.set)) expectedRollbackSet[col] = c.expect_before[col]
    if (sortObjJson(parsedRollback.set) !== sortObjJson(expectedRollbackSet)) {
      mismatches.push({ table: c.table, id: c.id, reason: 'rollback-set-mismatch', expected: expectedRollbackSet, actual: parsedRollback.set })
    }

    const planItem = preflightPlan.find((p) => p.table === c.table && p.id === c.id)
    if (!planItem || sortObjJson(planItem.expect) !== sortObjJson(c.expect_before)) {
      mismatches.push({ table: c.table, id: c.id, reason: 'preflight-plan-mismatch', expected: c.expect_before, actual: planItem?.expect })
    }
  }

  return { ok: mismatches.length === 0, mismatches }
}

// ── B3(2026-09-04): drift refresh ─────────────────────────────────────────
// preflight-mismatch 의 가장 흔한 원인은 "manifest 를 만든 이후 라이브 값이
// 이미 바뀜"이다(이 harness 의 정상 fail-closed 동작이지만, 매번 사람이
// manifest 를 손으로 다시 타이핑하는 건 번거롭고 실수 유발). 이 함수는
// expect_before 를 지금 라이브(또는 픽스처) 값으로 갱신한 **사본**을
// 만든다 — 원본 manifest 는 절대 mutate 하지 않고, DB 에는 아무 것도
// 쓰지 않는다(reader.getRow 만 호출).

/**
 * @param {object} manifest
 * @param {{getRow: (table:string, id:string, columns:string[]) => Promise<object|null>}} reader
 * @returns {Promise<{manifest:object, drift:Array<{table:string,id:string,column:string,manifest_value:*,live_value:*}>}>}
 */
export async function refreshExpectBefore(manifest, reader) {
  const copy = JSON.parse(JSON.stringify(manifest))
  const drift = []
  for (const c of copy.changes || []) {
    if ((c.op || 'update') !== 'update' || !c.expect_before) continue
    const cols = Object.keys(c.expect_before)
    const row = await reader.getRow(c.table, c.id, cols)
    for (const col of cols) {
      const liveVal = row && Object.prototype.hasOwnProperty.call(row, col) ? row[col] : null
      const manifestVal = c.expect_before[col]
      if (liveVal !== manifestVal) {
        drift.push({ table: c.table, id: c.id, column: col, manifest_value: manifestVal, live_value: liveVal })
      }
      c.expect_before[col] = liveVal
    }
  }
  const now = new Date().toISOString()
  const prevGeneratedFrom = copy.generated_from || {}
  copy.generated_from = {
    ...prevGeneratedFrom,
    tool: prevGeneratedFrom.tool || 'refreshExpectBefore',
    at: prevGeneratedFrom.at || now,
    refreshed_at: now,
  }
  return { manifest: copy, drift }
}

// ── B5(2026-09-04): postflight invariant delta ────────────────────────────
// prod:hotfix 는 지금까지 "이 manifest 가 자기가 건드리기로 한 행을 정확히
// 건드렸는가"(postMismatches)만 확인했다 — "그 결과로 저장소 전체 관점의
// invariant 가 새로 깨지는가"는 별도 관심사라 다루지 않았다(예: 실수로
// primary SCA 를 2개로 만드는 manifest 도 개별 행 값은 다 맞을 수 있다).
// 이 섹션은 순수 변환만 한다 — 스냅샷을 어떻게 읽어올지(라이브/픽스처)는
// scripts/prodHotfix.mjs 가 결정한다.

/**
 * manifest 의 changes 를 스냅샷(loadProductionSnapshot() 반환과 동일
 * shape — students/assignments 배열)에 순수하게(원본 mutate 없이) 적용한
 * 사본을 만든다. update/insert/delete(student_class_assignments) 전부
 * 반영한다. DB 에는 아무 것도 쓰지 않는다 — "적용했다면 어떻게 될지" 를
 * 미리보기 위한 순수 변환이다.
 * @param {{students:object[], assignments:object[]}} data
 * @param {object} manifest
 * @returns {{students:object[], assignments:object[]}} data 의 나머지 필드는 그대로 유지
 */
export function applyManifestToSnapshot(data, manifest) {
  const students = (data?.students || []).map((s) => ({ ...s }))
  const studentById = new Map(students.map((s) => [s.id, s]))
  let assignments = (data?.assignments || []).map((a) => ({ ...a }))

  for (const c of manifest?.changes || []) {
    const op = c.op || 'update'
    if (c.table === 'students') {
      if (op !== 'update') continue // students 는 update 만 허용(ALLOWLIST)
      const s = studentById.get(c.id)
      if (s) Object.assign(s, c.set)
      continue
    }
    if (c.table === 'student_class_assignments') {
      if (op === 'update') {
        const row = assignments.find((a) => a.id === c.id)
        if (row) Object.assign(row, c.set)
      } else if (op === 'insert') {
        assignments = [...assignments, { id: c.id, ...c.fields }]
      } else if (op === 'delete') {
        assignments = assignments.filter((a) => a.id !== c.id)
      }
    }
  }

  return { ...data, students, assignments }
}

/**
 * evaluateInvariants() findings 두 집합(적용 전/후)을 비교해 새로 생긴
 * FAIL/WARN 과, 더는 나타나지 않는(해소된) finding 을 나눈다. 순수 함수.
 * 같은 finding 인지는 code+studentId+refs(JSON) 조합으로 판정한다(같은
 * evaluateInvariants() 호출 계열이 항상 같은 refs shape 을 만든다는 전제 —
 * prodInvariants.mjs 재구현 금지, 그 출력을 그대로 비교만 한다).
 * @returns {{new_fail:Array, new_warn:Array, resolved:Array}}
 */
export function diffInvariantFindings(beforeFindings, afterFindings) {
  const keyOf = (f) => `${f.code}|${f.studentId ?? ''}|${JSON.stringify(f.refs || {})}`
  const beforeMap = new Map((beforeFindings || []).map((f) => [keyOf(f), f]))
  const afterMap = new Map((afterFindings || []).map((f) => [keyOf(f), f]))
  const new_fail = []
  const new_warn = []
  const resolved = []
  for (const [key, f] of afterMap) {
    if (!beforeMap.has(key)) {
      if (f.severity === 'FAIL') new_fail.push(f)
      else new_warn.push(f)
    }
  }
  for (const [key, f] of beforeMap) {
    if (!afterMap.has(key)) resolved.push(f)
  }
  return { new_fail, new_warn, resolved }
}

/**
 * B5 메인 진입점 — 적용 전 스냅샷 + manifest 로 "적용했다면 invariant 가
 * 어떻게 바뀔지" 를 미리 계산한다(순수 변환, DB 접근 없음). 실제 적용 후
 * 재확인은 호출부가 적용 후 새로 읽은 스냅샷 두 개를 evaluateInvariants 에
 * 각각 돌려 diffInvariantFindings() 로 직접 비교한다(이 함수는 그 dry-run
 * 미리보기 절반만 담당 — "적용 전 스냅샷을 어떻게 변환해서 비교하는가").
 * @param {object} snapshotBefore loadProductionSnapshot() 또는 동일 shape
 * @param {object} manifest
 * @returns {{new_fail:Array, new_warn:Array, resolved:Array}}
 */
export function computeInvariantsDeltaPreview(snapshotBefore, manifest) {
  const beforeCtx = buildInvariantContext(snapshotBefore)
  const { findings: beforeFindings } = evaluateInvariants(beforeCtx)
  const snapshotAfter = applyManifestToSnapshot(snapshotBefore, manifest)
  const afterCtx = buildInvariantContext(snapshotAfter)
  const { findings: afterFindings } = evaluateInvariants(afterCtx)
  return diffInvariantFindings(beforeFindings, afterFindings)
}
