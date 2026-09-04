// Ops Status — 표준 상태/finding 스키마 (2026-09-04, Track D)
//
// 순수 함수 모듈이다: 네트워크/DB/파일 접근이 없고, 같은 입력이면 항상 같은
// 결과다(결정론). 유일한 예외는 timestamp 기본값(new Date().toISOString())
// 뿐이고, 호출자가 opts.timestamp를 넘기면 그 값을 그대로 쓴다(테스트는
// 항상 명시적으로 넘겨 결정론을 유지한다).
//
// 이 모듈은 두 기존 하네스(scripts/prodCheck.mjs, scripts/studentHealthCheck.mjs)
// 의 --json 출력 "형식을 바꾸지 않고" 표준 finding[] 으로 변환만 한다
// (헌법 규칙 3 — 이미 검증된 판정 로직은 재구현하지 않는다. 여기서는 그
// 결과를 다른 스키마로 옮겨 담기만 한다).
//
// 코드 → 설명/영향/권장조치 텍스트는 scripts/lib/prodInvariants.mjs 의
// CODE_META(이미 impact/recommended 를 갖고 있다)를 그대로 재사용한다.
// health 전용 코드(scripts/lib/studentHealthRules.mjs CHECK_CODES + WARN 전용
// 파생 코드 2개)만 이 파일에서 새로 매핑한다 — 그 두 모듈 다 이 트랙 소유가
// 아니라(파일 소유권, 헌법 규칙 16) export 를 추가하지 않고 값만 import한다.
import { CHECK_CODES } from './studentHealthRules.mjs'
import { INVARIANT_CODES, CODE_META } from './prodInvariants.mjs'

// ── 표준 상태 enum ────────────────────────────────────────────────────────
export const STATUS = ['PASS', 'WARN', 'FAIL', 'BLOCKED_NEEDS_APPROVAL']
const STATUS_RANK = { PASS: 0, WARN: 1, FAIL: 2, BLOCKED_NEEDS_APPROVAL: 3 }

/** 여러 status 중 가장 나쁜 것 하나. 빈 배열/전부 무효값이면 'PASS'(문제 없음 표시). */
export function worstStatus(list) {
  const arr = Array.isArray(list) ? list.filter((s) => STATUS.includes(s)) : []
  if (!arr.length) return 'PASS'
  let worst = arr[0]
  for (const s of arr) if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s
  return worst
}

/** health/invariant severity('PASS'|'WARN'|'FAIL')를 표준 status로. 미상 값은
 * 조용한 PASS가 아니라 WARN으로 취급한다(헌법 규칙 18 — 검증 못 함을 PASS로
 * 위장하지 않는다). */
export function severityToStatus(sev) {
  if (sev === 'FAIL') return 'FAIL'
  if (sev === 'PASS') return 'PASS'
  if (sev === 'WARN') return 'WARN'
  return 'WARN'
}

// ── Finding 스키마 ─────────────────────────────────────────────────────────
export const ENTITY_TYPES = ['student', 'textbook', 'unit', 'class', 'sca', 'system']
export const ENVIRONMENTS = ['production', 'ci', 'local']
export const SEVERITIES = ['PASS', 'WARN', 'FAIL']
export const SOURCES = ['prod:check', 'health', 'gate', 'manual']

/**
 * finding 하나가 스키마를 만족하는지 검사한다(throw하지 않음, 순수 함수).
 * @returns {{ok: boolean, errors: string[]}}
 */
export function assertFinding(f) {
  const errors = []
  const req = (cond, msg) => { if (!cond) errors.push(msg) }
  if (!f || typeof f !== 'object') return { ok: false, errors: ['finding은 object여야 함'] }
  req(typeof f.check_id === 'string' && f.check_id.length > 0, 'check_id: 비어있지 않은 string 필요')
  req(typeof f.timestamp === 'string' && f.timestamp.length > 0, 'timestamp: 비어있지 않은 string 필요')
  req(ENVIRONMENTS.includes(f.environment), `environment: ${ENVIRONMENTS.join('|')} 중 하나여야 함(현재: ${f.environment})`)
  req(ENTITY_TYPES.includes(f.entity_type), `entity_type: ${ENTITY_TYPES.join('|')} 중 하나여야 함(현재: ${f.entity_type})`)
  req(Object.prototype.hasOwnProperty.call(f, 'entity_id'), 'entity_id: 키가 있어야 함(null 허용)')
  req(Object.prototype.hasOwnProperty.call(f, 'entity_label'), 'entity_label: 키가 있어야 함(null 허용)')
  req(Object.prototype.hasOwnProperty.call(f, 'expected'), 'expected: 키가 있어야 함')
  req(Object.prototype.hasOwnProperty.call(f, 'actual'), 'actual: 키가 있어야 함')
  req(SEVERITIES.includes(f.severity), `severity: ${SEVERITIES.join('|')} 중 하나여야 함(현재: ${f.severity})`)
  req(STATUS.includes(f.status), `status: ${STATUS.join('|')} 중 하나여야 함(현재: ${f.status})`)
  req(typeof f.recommended_action === 'string' && f.recommended_action.length > 0, 'recommended_action: 비어있지 않은 string 필요')
  req(typeof f.write_required === 'boolean', 'write_required: boolean 필요')
  req(typeof f.approval_required === 'boolean', 'approval_required: boolean 필요')
  req(SOURCES.includes(f.source), `source: ${SOURCES.join('|')} 중 하나여야 함(현재: ${f.source})`)
  return { ok: errors.length === 0, errors }
}

// ── 권장 조치 매핑 ───────────────────────────────────────────────────────
const UNKNOWN_ACTION = '확인 필요'
const READONLY_LABEL = 'READ-ONLY 조사'

// health WARN 전용 파생 코드 — CHECK_CODES(scripts/lib/studentHealthRules.mjs)
// 자체에는 없고 evaluateStudent()의 warnings[]/prodCheck.mjs 의
// classifyForUX() 접두사로만 등장한다(그 모듈 12-c/14~16 주석, prodCheck.mjs
// HEALTH_KNOWN_DATA_DEBT 참고). 새 코드를 만드는 게 아니라 이미 존재하는
// 문자열 상수를 이 표시 레이어에서 미러링한다 — prodCheck.mjs
// HEALTH_CODE_LABELS/prodInvariants.mjs BARE_UNIT_NAME_MIRROR 와 동일한 전례.
const HEALTH_FAIL_CHAIN = 'HEALTH_FAIL' // codes[]가 비어있는데 status=FAIL(체인 해석 자체 실패)
const HEALTH_RECOMMENDED = {
  [CHECK_CODES.LOGIN_FAIL]: '학생 레코드/이름 확인 후 로그인 식별자 정정(운영자 결정)',
  [CHECK_CODES.CLASS_INVALID]: '반 배정(FK)·소유 반 레코드 존재 여부 확인 후 재배정',
  [CHECK_CODES.TEXTBOOK_MISSING]: '주교재 배정 확인 — SCA 재배정 또는 신규 primary 지정 필요',
  [CHECK_CODES.UNIT_INVALID]: '현재 유닛 FK/교재 소속 확인 — 유닛 재지정 필요할 수 있음',
  [CHECK_CODES.WORDS_ZERO]: '유닛에 단어 업로드 필요 또는 다른 유닛으로 재배정',
  [CHECK_CODES.ORPHAN_ASSIGNMENT]: '고아 배정 행(교재/반 FK) 정리 — 운영자 결정',
  [CHECK_CODES.DUPLICATE]: '동명 중복 계정 식별자 정리(개명 또는 병합) — 운영자 결정',
  [CHECK_CODES.DIRECTION_INVALID]: '반/교재 소유 반의 spelling_direction 값 정정',
  [CHECK_CODES.GHOST_UNIT]: '유령 유닛 참조 해제(다른 유닛으로 재배정) — 운영자 결정',
  [CHECK_CODES.ASSIGNMENT_CONFLICT]: '배정 조합(주교재 중복 등) 정리 — 운영자 결정',
  ASSIGNMENT_GHOST_UNIT: '배정 행이 가리키는 유령 유닛 재배정(SCA 재배정 매니페스트 활용)',
  DIRECTION_RANDOM: 'random 방향 유지 여부 운영자 결정(문항별 총량 균형 미보장 인지)',
  [HEALTH_FAIL_CHAIN]: '개별 codes[] 상세 확인 — 체인 해석 자체가 실패한 상태',
}
// display-only(코드 자체는 유효값이라 즉시 쓰기가 필요하지 않음) 취급 코드.
// 나머지 health 코드는 전부 실제 데이터 결함이라 write_required=true.
const HEALTH_DISPLAY_ONLY = new Set(['DIRECTION_RANDOM'])

// health 전용 코드 전수(커버리지 테스트가 이 배열을 순회해 recommendedActionFor
// 가 전부 UNKNOWN_ACTION 폴백으로 새지 않는지 확인한다) — CHECK_CODES 값
// + 이 파일 위쪽에서 미러링한 WARN 전용 파생 코드 2개 + HEALTH_FAIL_CHAIN.
export const HEALTH_ONLY_CODES = [...Object.values(CHECK_CODES), 'ASSIGNMENT_GHOST_UNIT', 'DIRECTION_RANDOM', HEALTH_FAIL_CHAIN]

export function recommendedActionFor(code) {
  if (!code) return UNKNOWN_ACTION
  if (Object.prototype.hasOwnProperty.call(CODE_META, code)) return CODE_META[code].recommended || UNKNOWN_ACTION
  if (Object.prototype.hasOwnProperty.call(HEALTH_RECOMMENDED, code)) return HEALTH_RECOMMENDED[code]
  return UNKNOWN_ACTION
}

/** 이 코드가 가리키는 문제를 실제로 고치려면 DB 쓰기가 필요한가.
 * invariant 코드는 CODE_META.recommended가 'READ-ONLY 조사'면 false, 그 외
 * ('운영자 결정'/'코드 과제')면 true. health 코드는 HEALTH_DISPLAY_ONLY만 false.
 * 미상 코드는 보수적으로 true(조용한 false로 승인 절차를 건너뛰지 않는다 —
 * 헌법 규칙 18). */
export function writeRequiredFor(code) {
  if (!code) return true
  if (Object.prototype.hasOwnProperty.call(CODE_META, code)) return CODE_META[code].recommended !== READONLY_LABEL
  if (HEALTH_DISPLAY_ONLY.has(code)) return false
  if (Object.prototype.hasOwnProperty.call(HEALTH_RECOMMENDED, code)) return true
  return true
}

/** 쓰기가 필요한 항목은 전부 운영자 승인이 필요하다(이 저장소 어디에도
 * 에이전트 자동 쓰기 경로가 없다 — 헌법 규칙 8). */
export function approvalRequiredFor(code) {
  return writeRequiredFor(code)
}

// ── entity_type 추론 ─────────────────────────────────────────────────────
function inferEntityType(code, hasStudent) {
  if (hasStudent) return 'student'
  const c = String(code || '')
  if (c.startsWith('UNIT_') || c.includes('_UNIT_')) return 'unit'
  if (c.startsWith('SCA_')) return 'sca'
  if (c.startsWith('TEXTBOOK_')) return 'textbook'
  if (c.startsWith('CLASS_')) return 'class'
  return 'system'
}

function primaryRefId(refs) {
  if (!refs || typeof refs !== 'object') return null
  for (const k of ['unitId', 'textbookId', 'classId', 'studentClassId']) {
    if (refs[k] != null) return refs[k]
  }
  for (const k of ['unitIds', 'textbookIds', 'linkedClassIds', 'referencedClassIds', 'primaryTextbookIds']) {
    if (Array.isArray(refs[k]) && refs[k].length) return refs[k].join(',')
  }
  return null
}

// "CODE:detail" 형식(evaluateStudent의 codes[]/warnings[])을 분리한다.
function parseCodeDetail(entry) {
  const s = String(entry ?? '')
  const idx = s.indexOf(':')
  return idx === -1 ? { code: s, detail: '' } : { code: s.slice(0, idx), detail: s.slice(idx + 1) }
}

function nowIso() {
  return new Date().toISOString()
}

function buildHealthFindings(results, { timestamp, environment, source }) {
  const out = []
  for (const r of (Array.isArray(results) ? results : [])) {
    if (!r || r.status === 'PASS') continue
    const push = (rawEntry, severity) => {
      const { code, detail } = parseCodeDetail(rawEntry)
      out.push({
        check_id: `health:${code}`,
        timestamp,
        environment,
        entity_type: 'student',
        entity_id: r.studentId ?? null,
        entity_label: r.name ?? null,
        expected: '로그인→반→교재→유닛→단어→방향 체인 정상 해석',
        actual: detail || String(rawEntry),
        severity,
        status: severityToStatus(severity),
        recommended_action: recommendedActionFor(code),
        write_required: writeRequiredFor(code),
        approval_required: approvalRequiredFor(code),
        source,
      })
    }
    if (r.status === 'FAIL') {
      if (Array.isArray(r.codes) && r.codes.length) {
        for (const c of r.codes) push(c, 'FAIL')
      } else {
        // codes[]가 비어있는데 FAIL — 체인 해석 자체가 깨진 경우(prodCheck.mjs
        // classifyForUX의 '체인 해석 실패' 폴백과 동일 상황).
        out.push({
          check_id: `health:${HEALTH_FAIL_CHAIN}`,
          timestamp, environment, entity_type: 'student',
          entity_id: r.studentId ?? null, entity_label: r.name ?? null,
          expected: '로그인→반→교재→유닛→단어→방향 체인 정상 해석',
          actual: '체인 해석 실패(codes 상세 없음)',
          severity: 'FAIL', status: 'FAIL',
          recommended_action: recommendedActionFor(HEALTH_FAIL_CHAIN),
          write_required: writeRequiredFor(HEALTH_FAIL_CHAIN),
          approval_required: approvalRequiredFor(HEALTH_FAIL_CHAIN),
          source,
        })
      }
    }
    if (Array.isArray(r.warnings)) {
      for (const w of r.warnings) push(w, 'WARN')
    }
  }
  return out
}

function buildInvariantFindings(findings, { timestamp, environment, source }) {
  const out = []
  for (const f of (Array.isArray(findings) ? findings : [])) {
    if (!f || !f.code) continue
    const hasStudent = f.studentId != null
    out.push({
      check_id: `invariant:${f.code}`,
      timestamp,
      environment,
      entity_type: inferEntityType(f.code, hasStudent),
      entity_id: hasStudent ? f.studentId : primaryRefId(f.refs),
      entity_label: f.studentName ?? null,
      expected: '불변식 충족(정상 상태)',
      actual: f.detail || '',
      severity: f.severity,
      status: severityToStatus(f.severity),
      recommended_action: f.recommended || recommendedActionFor(f.code),
      write_required: writeRequiredFor(f.code),
      approval_required: approvalRequiredFor(f.code),
      source,
    })
  }
  return out
}

function buildGhostUnitFindings(ghostUnits, { timestamp, environment, source }) {
  const out = []
  for (const g of (Array.isArray(ghostUnits) ? ghostUnits : [])) {
    if (!g) continue
    out.push({
      check_id: `invariant:${INVARIANT_CODES.GHOST_UNIT_PRESENT}`,
      timestamp,
      environment,
      entity_type: 'unit',
      entity_id: g.id ?? null,
      entity_label: g.name ?? null, // 유닛명은 PII 아님(학생 이름과 별개)
      expected: '유령 유닛(엑셀 헤더 잔재) 없음',
      actual: `${g.reason || ''} — 단어 ${g.wordCount ?? 0}개`,
      severity: 'WARN',
      status: 'WARN',
      recommended_action: recommendedActionFor(INVARIANT_CODES.GHOST_UNIT_PRESENT),
      write_required: writeRequiredFor(INVARIANT_CODES.GHOST_UNIT_PRESENT),
      approval_required: approvalRequiredFor(INVARIANT_CODES.GHOST_UNIT_PRESENT),
      source,
    })
  }
  return out
}

/**
 * scripts/prodCheck.mjs --json 출력(health.results[]/invariants.findings[])을
 * 표준 finding[]로 변환한다. 두 배열 다 동일 리포트(runId 1회)에서 나온
 * 것이라 source는 항상 'prod:check'다(health.results가 studentHealthRules
 * 판정을, invariants.findings가 prodInvariants 판정을 담당한 것과 무관하게
 * — "무엇이 실행했나"를 source가 나타낸다).
 * @param {object} json prodCheck.mjs --json stdout을 파싱한 객체
 * @param {{environment?: string, timestamp?: string}} [opts]
 */
export function fromProdCheckReport(json, opts = {}) {
  const environment = opts.environment || (json?.env?.source === 'fixture' ? 'local' : 'production')
  const timestamp = opts.timestamp || json?.runAt || nowIso()
  const health = buildHealthFindings(json?.health?.results, { timestamp, environment, source: 'prod:check' })
  const inv = buildInvariantFindings(json?.invariants?.findings, { timestamp, environment, source: 'prod:check' })
  return [...health, ...inv]
}

/**
 * scripts/studentHealthCheck.mjs --json 출력(students[]/ghostUnits[])을
 * 표준 finding[]로 변환한다.
 * @param {object} json studentHealthCheck.mjs --json stdout을 파싱한 객체
 * @param {{environment?: string, timestamp?: string}} [opts]
 */
export function fromHealthReport(json, opts = {}) {
  const environment = opts.environment || 'production'
  const timestamp = opts.timestamp || nowIso()
  const health = buildHealthFindings(json?.students, { timestamp, environment, source: 'health' })
  const ghosts = buildGhostUnitFindings(json?.ghostUnits, { timestamp, environment, source: 'health' })
  return [...health, ...ghosts]
}

// ── 사람용 요약 ─────────────────────────────────────────────────────────
const STATUS_RANK_FOR_SORT = { FAIL: 0, BLOCKED_NEEDS_APPROVAL: 1, WARN: 2, PASS: 3 }

/** finding[] → 한국어 사람용 요약(마크다운 텍스트 프래그먼트). */
export function renderSummary(findings) {
  const list = Array.isArray(findings) ? findings : []
  const counts = { PASS: 0, WARN: 0, FAIL: 0, BLOCKED_NEEDS_APPROVAL: 0 }
  for (const f of list) counts[f.status] = (counts[f.status] || 0) + 1

  const top = [...list]
    .sort((a, b) => (STATUS_RANK_FOR_SORT[a.status] ?? 9) - (STATUS_RANK_FOR_SORT[b.status] ?? 9))
    .slice(0, 10)

  const approvalQueue = list.filter((f) => f.write_required && f.approval_required)

  const lines = []
  lines.push('## 운영 상태 요약')
  lines.push(`PASS ${counts.PASS} · WARN ${counts.WARN} · FAIL ${counts.FAIL} · 승인대기 ${counts.BLOCKED_NEEDS_APPROVAL} (총 ${list.length}건)`)
  lines.push('')
  lines.push('### 상위 10건(심각도순)')
  if (!top.length) {
    lines.push('없음')
  } else {
    for (const f of top) {
      const who = f.entity_label ?? f.entity_id ?? '(식별불가)'
      lines.push(`- [${f.status}] ${f.entity_type}:${who} — ${f.check_id} — 권장: ${f.recommended_action}`)
    }
  }
  lines.push('')
  lines.push('### Approval queue(쓰기 필요 + 승인 필요)')
  if (!approvalQueue.length) {
    lines.push('없음')
  } else {
    for (const f of approvalQueue) {
      const who = f.entity_label ?? f.entity_id ?? '(식별불가)'
      lines.push(`- [${f.status}] ${f.entity_type}:${who} — ${f.check_id} — ${f.recommended_action}`)
    }
  }
  return lines.join('\n')
}
