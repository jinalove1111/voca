// scripts/dbIntegrityAudit.mjs fetchAll() PostgREST 1000행 상한 오탐 회귀
// (2026-09-09 야간 QA).
//
// 확정된 결함: fetchAll(table, select)이 `?select=...&limit=10000` 단일
// fetch만 쏘는데, PostgREST 서버 기본 상한(max-rows)이 1000행이라 그 이상은
// 조용히 잘린다. 그날 실측 words=1000(실제 2075) — "word_status.word_id가
// 존재하지 않는 단어를 가리킴 — 60건"은 words 뒷부분 1075개가 애초에
// 안 불려와서 생긴 오탐이었다(waste/type/charity 3건 표본으로 실존 확인).
// scripts/lib/prodDataLoader.mjs selectAll / src/utils/wordLibrary.js
// selectAllRows와 동일한 이 저장소의 기존 "1000행 절단" 실사고 패턴
// (2026-08-12)의 재발.
//
// 수정: dbIntegrityAudit.mjs가 fetchAllPaged(baseUrl, headers, table, select,
// { pageSize, fetchImpl })를 export한다 — offset 페이지네이션(order=id 고정
// 정렬, 짧은 페이지가 나올 때까지 반복), fetchImpl 주입 가능(오프라인 단위
// 테스트용, 네트워크 0).
//
// 이 테스트는 순수 오프라인이다(가짜 fetchImpl, 실제 fetch/네트워크 호출
// 0건) — 수정 전 소스에는 fetchAllPaged 자체가 없어 import 시점에는 성공
// 하지만 lib.fetchAllPaged가 undefined라 아래 모든 단언이 예외/FAIL로 떨어
// 진다(규칙 15, FAIL-first 실측 — 리팩터 전 이 파일로 실행해 전부 FAIL함을
// 확인 후 dbIntegrityAudit.mjs를 수정했다).
//
// 실행: node scripts/testDbIntegrityAuditPaging.mjs
import * as lib from './dbIntegrityAudit.mjs'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const safeCall = async (fn) => {
  try { return { ok: true, value: await fn() } }
  catch (err) { return { ok: false, error: err } }
}

// fetchAllPaged 자체가 없는(수정 전) 소스에서도 스크립트 전체가 죽어
// 나머지 단언을 못 세는 일이 없도록, 부재 시 안전하게 undefined로 흡수한다.
const callFetchAllPaged = (...args) => {
  if (typeof lib.fetchAllPaged !== 'function') {
    throw new Error('__fetchAllPaged_missing__')
  }
  return lib.fetchAllPaged(...args)
}

const BASE = 'https://fake.supabase.co'
const HEADERS = { apikey: 'anon', Authorization: 'Bearer anon' }

// ────────────────────────────────────────────────────────────────────────
console.log('\n1. 3페이지(1000/1000/75) → 총 2075행, 정확히 3회 호출, offset 0/1000/2000 진행')
{
  const calls = []
  const pages = [
    Array.from({ length: 1000 }, (_, i) => ({ id: i })),
    Array.from({ length: 1000 }, (_, i) => ({ id: 1000 + i })),
    Array.from({ length: 75 }, (_, i) => ({ id: 2000 + i })),
  ]
  const fetchImpl = async (url) => {
    calls.push(url)
    const page = pages[calls.length - 1]
    return { ok: true, json: async () => page, text: async () => '' }
  }
  const result = await safeCall(() => callFetchAllPaged(BASE, HEADERS, 'words', 'id,word', { fetchImpl }))
  check('예외 없이 성공', result.ok, result.error?.message)
  const rows = result.ok ? result.value : []
  check('총 2075행', rows.length === 2075, { got: rows.length })
  check('정확히 3회 호출', calls.length === 3, { got: calls.length })
  check('1페이지 offset=0', /[?&]offset=0(&|$)/.test(calls[0] || ''), calls[0])
  check('2페이지 offset=1000', /[?&]offset=1000(&|$)/.test(calls[1] || ''), calls[1])
  check('3페이지 offset=2000', /[?&]offset=2000(&|$)/.test(calls[2] || ''), calls[2])
  check('페이지당 limit=1000(기본 pageSize)', calls.every((u) => /[?&]limit=1000(&|$)/.test(u)))
  check('결정적 정렬(order=id) 고정', calls.every((u) => /[?&]order=id(&|$)/.test(u)))
  check('table/select가 URL에 반영됨', calls.every((u) => u.includes('/rest/v1/words?') && u.includes('select=id%2Cword') || u.includes('select=id,word')))
  check('행 순서가 페이지 순서 그대로(첫 행 id=0, 마지막 행 id=2074)',
    rows[0]?.id === 0 && rows[rows.length - 1]?.id === 2074)
}

// ────────────────────────────────────────────────────────────────────────
console.log('\n2. 정확히 pageSize의 배수(예: 정확히 1000행)여도 무한루프 없이 종료')
{
  const calls = []
  const pages = [
    Array.from({ length: 1000 }, (_, i) => ({ id: i })),
    [], // 정확히 배수인 경우 다음 페이지가 빈 배열이어야 정상 종료
  ]
  const fetchImpl = async (url) => {
    calls.push(url)
    const page = pages[calls.length - 1] ?? []
    return { ok: true, json: async () => page, text: async () => '' }
  }
  const result = await safeCall(() => callFetchAllPaged(BASE, HEADERS, 'students', 'id', { fetchImpl }))
  check('예외 없이 성공', result.ok, result.error?.message)
  check('총 1000행', result.ok && result.value.length === 1000, { got: result.value?.length })
  check('2회 호출로 종료(빈 페이지로 확정)', calls.length === 2, { got: calls.length })
}

// ────────────────────────────────────────────────────────────────────────
console.log('\n3. 0행 첫 페이지 → 빈 배열([]) 반환, 1회 호출로 종료')
{
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return { ok: true, json: async () => [], text: async () => '' }
  }
  const result = await safeCall(() => callFetchAllPaged(BASE, HEADERS, 'entrance_tests', 'id', { fetchImpl }))
  check('예외 없이 성공', result.ok, result.error?.message)
  check('빈 배열 반환', Array.isArray(result.value) && result.value.length === 0, result.value)
  check('정확히 1회 호출(첫 페이지가 이미 짧음)', calls.length === 1, { got: calls.length })
}

// ────────────────────────────────────────────────────────────────────────
console.log('\n4. HTTP 오류(예: 500)는 조용한 빈 결과가 아니라 throw로 전파')
{
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return { ok: false, status: 500, json: async () => { throw new Error('should not be called') }, text: async () => 'internal error' }
  }
  const result = await safeCall(() => callFetchAllPaged(BASE, HEADERS, 'word_status', 'student_id,word_id', { fetchImpl }))
  check('성공이 아니라 실패(throw)로 귀결', !result.ok)
  check('에러 메세지에 상태코드/테이블 단서 포함', !result.ok && /500/.test(result.error?.message || '') && /word_status/.test(result.error?.message || ''), result.error?.message)
  check('1페이지에서 즉시 중단(뒷 페이지 계속 조회하지 않음)', calls.length === 1, { got: calls.length })
}

// ────────────────────────────────────────────────────────────────────────
console.log('\n5. 첫 페이지는 성공, 두 번째 페이지에서 HTTP 오류 → 이미 모은 행을 버리고 throw(부분 결과를 성공으로 오인하지 않음)')
{
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (calls.length === 1) return { ok: true, json: async () => Array.from({ length: 1000 }, (_, i) => ({ id: i })), text: async () => '' }
    return { ok: false, status: 503, json: async () => { throw new Error('should not be called') }, text: async () => 'unavailable' }
  }
  const result = await safeCall(() => callFetchAllPaged(BASE, HEADERS, 'daily_assignments', 'class_id,date', { fetchImpl }))
  check('2페이지 오류가 결국 throw로 전파', !result.ok)
  check('정확히 2회 호출(2페이지에서 중단)', calls.length === 2, { got: calls.length })
}

// ────────────────────────────────────────────────────────────────────────
console.log('\n6. pageSize 옵션을 줄이면 그 크기로 페이지네이션(주입 가능성 확인)')
{
  const calls = []
  const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]]
  const fetchImpl = async (url) => {
    calls.push(url)
    const page = pages[calls.length - 1] ?? []
    return { ok: true, json: async () => page, text: async () => '' }
  }
  const result = await safeCall(() => callFetchAllPaged(BASE, HEADERS, 'classes', 'id', { pageSize: 2, fetchImpl }))
  check('예외 없이 성공', result.ok, result.error?.message)
  check('총 3행', result.ok && result.value.length === 3, { got: result.value?.length })
  check('작은 pageSize도 limit=2로 반영', calls.every((u) => /[?&]limit=2(&|$)/.test(u)))
  check('2회 호출로 종료(2번째 페이지가 pageSize 미만)', calls.length === 2, { got: calls.length })
}

// ────────────────────────────────────────────────────────────────────────
console.log('\n7. orderBy 기본값=id + override 가능(student_progress처럼 id 컬럼이 없는 테이블 대응, 2026-09-09 라이브 42703 실측 후속)')
{
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return { ok: true, json: async () => [], text: async () => '' }
  }
  await safeCall(() => callFetchAllPaged(BASE, HEADERS, 'classes', 'id', { fetchImpl }))
  check('옵션 미지정 시 기본 order=id', /[?&]order=id(&|$)/.test(calls[0] || ''), calls[0])

  const calls2 = []
  const fetchImpl2 = async (url) => {
    calls2.push(url)
    return { ok: true, json: async () => [], text: async () => '' }
  }
  await safeCall(() => callFetchAllPaged(BASE, HEADERS, 'student_progress', 'student_id,updated_at', { fetchImpl: fetchImpl2, orderBy: 'student_id' }))
  check('orderBy override 시 그 컬럼으로 정렬(예: student_progress → student_id, id 컬럼 없는 테이블용)',
    /[?&]order=student_id(&|$)/.test(calls2[0] || ''), calls2[0])
}

console.log(failures === 0
  ? '\n모든 단언 통과 — dbIntegrityAudit fetchAllPaged 1000행 절단 오탐 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
