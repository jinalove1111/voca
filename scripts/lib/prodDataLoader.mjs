// Production Safety Harness — 스냅샷 로더 (2026-09-03, Phase 1-A)
//
// ★ READ-ONLY 보장 ★
// 이 파일은 HTTP GET 만 보낸다. PATCH/POST/PUT/DELETE 경로가 존재하지 않는다.
// anon key 로만 조회한다(service_role 아님) — RLS/컬럼권한이 이미 걷어낸
// 범위 밖은 애초에 조회되지 않는다(DATABASE.md RLS/컬럼권한 섹션).
//
// ── scripts/studentHealthCheck.mjs 로더와 동일 계약 ─────────────────────
// loadProductionSnapshot()의 반환 형태(students/classes/textbooks/units/
// words/assignments)는 scripts/studentHealthCheck.mjs 가 buildContext()에
// 넘기는 data 와 완전히 동일하다(같은 테이블/컬럼/페이지네이션). 그 위에
// fetchedAt(ISO 문자열)과 projectRef(VITE_SUPABASE_URL 호스트 첫 라벨)만
// 추가한다.
//
// 지금은 studentHealthCheck.mjs 의 셀렉트 로직과 이 파일이 중복돼 있다 —
// 그 스크립트는 Release Gate 가 실사용 중이라 이번 작업(Phase 1-A, prod:check
// 신규 구축) 범위에서 손대지 않기로 했다(파일 소유권, CLAUDE.md 규칙 16).
// 후속 작업에서 studentHealthCheck.mjs 가 이 모듈을 import 하도록 통합해
// 중복을 없애는 것을 권장한다.
import fs from 'node:fs'

/**
 * .env 또는 process.env 에서 Supabase 자격증명을 읽는다.
 * 값은 반환하지만 어디에도 로깅하지 않는다(CLAUDE.md 규칙 11과 같은 원칙 —
 * PIN 전용 규칙은 아니지만 자격증명을 콘솔/리포트에 남기지 않는다는 정신은 동일).
 * @param {URL|string} [envPath] 테스트에서 다른 .env 경로를 주입할 때 사용.
 * @returns {{base:string,key:string,projectRef:string|null}|null} 자격증명이 없으면 null.
 */
export function loadSupabaseEnv(envPath) {
  let base = process.env.VITE_SUPABASE_URL || ''
  let key = process.env.VITE_SUPABASE_ANON_KEY || ''
  if (!base || !key) {
    try {
      const p = envPath || new URL('../../.env', import.meta.url)
      const env = Object.fromEntries(fs.readFileSync(p, 'utf8')
        .split(/\r?\n/).filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
      base = base || env.VITE_SUPABASE_URL
      key = key || env.VITE_SUPABASE_ANON_KEY
    } catch { /* .env 없음 — 호출부가 처리 */ }
  }
  if (!base || !key) return null
  let projectRef = null
  try { projectRef = new URL(base).hostname.split('.')[0] || null } catch { /* ignore */ }
  return { base, key, projectRef }
}

// PostgREST 기본 상한은 1000행이다. words 는 이미 1536행이라 페이지네이션
// 없이 받으면 조용히 잘린다 — 이 저장소에 "words 1000행 절단 P0" 실사고
// 이력이 있다(2026-08-12, studentHealthCheck.mjs 와 동일 주의사항).
const PAGE = 1000
async function selectAll(base, headers, table, columns) {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const url = `${base}/rest/v1/${table}?select=${columns}&limit=${PAGE}&offset=${offset}`
    let res
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
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

/**
 * 프로덕션 스냅샷을 읽어온다. GET 전용, 쓰기 경로 없음.
 * @param {{base:string,key:string,projectRef?:string|null}} supabase loadSupabaseEnv() 반환값
 * @returns {Promise<{students:any[],classes:any[],textbooks:any[],units:any[],words:any[],assignments:any[],fetchedAt:string,projectRef:string|null}>}
 */
export async function loadProductionSnapshot(supabase) {
  if (!supabase?.base || !supabase?.key) {
    throw new Error('loadProductionSnapshot: base/key 가 필요합니다(loadSupabaseEnv() 결과를 넘기세요).')
  }
  const headers = { apikey: supabase.key, Authorization: `Bearer ${supabase.key}` }
  const [students, classes, textbooks, units, words, assignments] = await Promise.all([
    // unit_name 도 함께 받는다 — UNIT_NAME_MISMATCH invariant 에 필요
    // (studentHealthCheck.mjs 는 이 컬럼을 안 쓰므로 셀렉트 목록이 여기서
    // 갈린다 — 의도된 차이).
    selectAll(supabase.base, headers, 'students', 'id,name,class_id,current_unit_id,unit_name'),
    selectAll(supabase.base, headers, 'classes', 'id,name,spelling_direction'),
    selectAll(supabase.base, headers, 'textbooks', 'id,name,owner_class_id'),
    selectAll(supabase.base, headers, 'units', 'id,name,textbook_id'),
    // word,meaning 도 함께 받는다 — 유령 유닛(엑셀 헤더 잔재) 판정에 필요.
    selectAll(supabase.base, headers, 'words', 'id,unit_id,word,meaning'),
    selectAll(supabase.base, headers, 'student_class_assignments',
      'student_id,class_id,textbook_id,is_primary,current_unit_id'),
  ])
  return {
    students, classes, textbooks, units, words, assignments,
    fetchedAt: new Date().toISOString(),
    projectRef: supabase.projectRef || null,
  }
}
