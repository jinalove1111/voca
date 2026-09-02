// Release Gate — baseline 대비 회귀 판정 (2026-08-26, P2)
//
// 이 모듈은 계산만 한다: 네트워크/DB/파일 접근이 없고, 같은 입력이면 항상
// 같은 결과다. 라이브 실행은 scripts/verifyRelease.mjs 가 담당한다.
//
// ── 왜 baseline 이 필요한가 ────────────────────────────────────────────
// 핵심 원칙: "정상인 기능은 건드리지 않고, 새 변경이 다른 학생/기능을
// 깨뜨리는 경우에만 배포를 차단한다."
//
// 헬스체크가 FAIL 을 내면 두 가지 경우가 섞여 있다.
//   · 이미 있던 문제  — 이번 변경 탓이 아니다. 여기서 배포를 막으면 게이트가
//                      "항상 빨간불"이 되어 아무도 안 보게 된다(가장 흔한
//                      게이트 실패 모드).
//   · 새로 생긴 문제  — 이번 변경이 만든 회귀. 이것만 배포를 막아야 한다.
//
// baseline 은 "도입 시점에 이미 알고 있던 FAIL 목록"이다. 게이트는
// baseline 에 없는 FAIL(=회귀)에만 빨간불을 켜고, baseline 항목은 계속
// 보여주되 통과시킨다. baseline 이 비면(현재 상태) 모든 FAIL 이 회귀다.
//
// ── 키 설계 ────────────────────────────────────────────────────────────
// 키는 studentId + 코드 접두(':' 앞)로만 만든다. detail 문자열에는 단어 수
// 같은 흔들리는 값이 들어가므로 키에 넣으면 같은 문제가 매번 새 회귀로
// 보인다. 반대로 학생을 빼고 코드만 쓰면 "A 학생 문제"가 "B 학생 문제"를
// 가려버린다 — 그래서 반드시 둘 다 쓴다.

/** 아무것도 알려지지 않은 baseline(모든 FAIL 이 회귀). */
export const EMPTY_BASELINE = Object.freeze({ keys: Object.freeze([]), meta: Object.freeze({}) })

/** 'WORDS_ZERO:단어0개' -> 'WORDS_ZERO' */
const codePrefix = (code) => String(code ?? '').split(':')[0].trim()

// 2026-09-03 보안수정 — scripts/health/baseline.json 은 PUBLIC 저장소에
// 커밋되는 파일이다. recordHealthBaseline.mjs 는 이제 entries[].name 을
// 항상 마스킹해서 저장하지만(scripts/recordHealthBaseline.mjs 의
// maskName() 참고), 마스킹 이전에 기록된 레거시 baseline 파일에는 원본
// 실명이 남아 있을 수 있다. baselineKey 매칭은 studentId+code 로만
// 이뤄지므로(아래 baselineKey 참고) name 은 순수 표시용 meta 값이다 —
// 여기서도 한 번 더 마스킹해 어떤 baseline 파일을 읽어도 리포트/콘솔에
// 원본 실명이 새어나가지 않게 한다(studentHealthCheck.mjs/prodCheck.mjs 와
// 동일 규칙: 첫 글자 + ***, 파일 소유권 때문에 독립 정의).
function maskNameForMeta(name) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return null
  return `${n[0]}***`
}

/** baseline/결과 양쪽에서 쓰는 동일한 키 규칙. */
export function baselineKey(studentId, code) {
  return `${String(studentId ?? '')}|${codePrefix(code)}`
}

/**
 * baseline 파일(JSON)을 판정용 형태로 정규화한다. 잘못된 입력은 빈
 * baseline 으로 안전하게 수렴한다 — 게이트가 파일 하나 때문에 죽으면 안 된다.
 * 단, "읽기 실패를 조용히 통과로 바꾸지 않는다"는 원칙상 빈 baseline 은
 * 가장 엄격한 상태(모든 FAIL 이 회귀)이므로 안전한 폴백이다.
 * @param {{entries?: Array<{studentId?: string, code?: string, name?: string, note?: string}>}} raw
 */
export function normalizeBaseline(raw) {
  const entries = Array.isArray(raw?.entries) ? raw.entries : []
  const keys = []
  const meta = {}
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue
    const k = baselineKey(e.studentId, e.code)
    if (k === '|') continue
    if (!keys.includes(k)) keys.push(k)
    meta[k] = { name: maskNameForMeta(e.name), note: e.note ?? null, code: codePrefix(e.code), studentId: e.studentId ?? null }
  }
  return { keys, meta }
}

/**
 * 헬스체크 결과를 baseline 과 대조한다.
 * @param {Array<{name?, studentId?, status?, codes?: string[], warnings?: string[]}>} results
 * @param {{keys: string[], meta: object}} baseline
 * @returns {{regressions: Array, known: Array, fixed: Array, warnings: Array, ok: boolean}}
 */
export function diffAgainstBaseline(results, baseline) {
  const list = Array.isArray(results) ? results.filter((r) => r && typeof r === 'object') : []
  const base = baseline && Array.isArray(baseline.keys) ? baseline : EMPTY_BASELINE
  const baseKeys = new Set(base.keys)

  const regressions = []
  const known = []
  const warnings = []
  const seen = new Set()

  for (const r of list) {
    const sid = r.studentId ?? null
    const name = r.name ?? '(이름없음)'
    for (const w of (Array.isArray(r.warnings) ? r.warnings : [])) {
      warnings.push({ name, studentId: sid, warning: String(w) })
    }
    if (r.status !== 'FAIL') continue
    for (const c of (Array.isArray(r.codes) ? r.codes : [])) {
      const key = baselineKey(sid, c)
      seen.add(key)
      const item = { name, studentId: sid, code: codePrefix(c), detail: String(c), key }
      if (baseKeys.has(key)) known.push(item)
      else regressions.push(item)
    }
  }

  // baseline 에 있었지만 이제 FAIL 이 아닌 항목 — 고쳐졌으므로 baseline 을
  // 갱신하라고 알려준다(오래된 baseline 이 진짜 회귀를 가리는 것 방지).
  const fixed = base.keys
    .filter((k) => !seen.has(k))
    .map((k) => ({ key: k, ...(base.meta?.[k] || {}) }))

  return { regressions, known, fixed, warnings, ok: regressions.length === 0 }
}

/**
 * 게이트 목록을 합산한다. 하나라도 실패면 전체 실패.
 * @param {Array<{name: string, ok: boolean}>} gates
 */
export function summarizeGates(gates) {
  const list = Array.isArray(gates) ? gates.filter((g) => g && typeof g === 'object') : []
  const failedGates = list.filter((g) => !g.ok).map((g) => String(g.name))
  return { total: list.length, passed: list.length - failedGates.length, failed: failedGates, ok: failedGates.length === 0 }
}
