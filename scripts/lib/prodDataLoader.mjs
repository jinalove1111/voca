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
import crypto from 'node:crypto'

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
    // class_type 도 함께 받는다 — CLASS_ASSIGNMENT_CONTRADICTION/
    // STUDENT_CLASS_IS_CONTAINER invariant 가 교재 컨테이너 반(class_type=
    // 'textbook')을 사람 반과 구분하는 데 필요(2026-09-03, Phase 8b 코디네이터 정정).
    selectAll(supabase.base, headers, 'classes', 'id,name,spelling_direction,class_type'),
    selectAll(supabase.base, headers, 'textbooks', 'id,name,owner_class_id'),
    selectAll(supabase.base, headers, 'units', 'id,name,textbook_id'),
    // word,meaning 도 함께 받는다 — 유령 유닛(엑셀 헤더 잔재) 판정에 필요.
    selectAll(supabase.base, headers, 'words', 'id,unit_id,word,meaning'),
    // created_at 도 함께 받는다 — CLASS_ASSIGNMENT_CONTRADICTION invariant 의
    // detail(최신/최초 배정일)에 필요(2026-09-03, Phase 8 확장).
    selectAll(supabase.base, headers, 'student_class_assignments',
      'student_id,class_id,textbook_id,is_primary,current_unit_id,created_at'),
  ])
  return {
    students, classes, textbooks, units, words, assignments,
    fetchedAt: new Date().toISOString(),
    projectRef: supabase.projectRef || null,
  }
}

// ── 학습기록 baseline (2026-09-03, Phase 8) ─────────────────────────────
// prod:hotfix(다른 에이전트, scripts/prodHotfix.mjs)가 students/
// student_class_assignments 행 자체의 before/after 스냅샷·해시는 이미
// 찍지만(sha256Json 패턴), "이 학생들의 학습기록 6종 테이블이 핫픽스
// 전후로 그대로인가"는 별도 관심사라 다루지 않는다. 여기서는 행 내용을
// 통째로 읽지 않고(개인 학습 상세를 리포트에 남기지 않기 위해) 테이블별
// **행 수(HEAD count)** 만 비교한다 — student_progress 는 예외로
// updated_at/total_stars 두 값만 추가로 본다(요약 지표로 변화 여부를
// 빠르게 확인하기 위함, 전체 progress_data jsonb 는 절대 읽지 않는다).
export const LEARNING_BASELINE_TABLES = [
  'word_status', 'student_progress', 'student_daily_progress',
  'spelling_review_queue', 'xp_ledger', 'entrance_test_results',
]

// PostgREST 는 HEAD + Prefer: count=exact 조합에서 본문 없이
// Content-Range: */<total> (또는 0-N/<total>) 헤더로 총 행수를 돌려준다 —
// 행 내용을 내려받지 않는다(READ-ONLY 원칙 + 불필요한 개인 데이터 노출 방지).
async function headCount(base, headers, table, studentId) {
  const url = `${base}/rest/v1/${table}?select=student_id&student_id=eq.${encodeURIComponent(studentId)}`
  let res
  try {
    res = await fetch(url, { method: 'HEAD', headers: { ...headers, Prefer: 'count=exact' }, signal: AbortSignal.timeout(20000) })
  } catch (err) {
    throw new Error(`INFRA_ERROR ${table}(head): ${err?.message || err}`)
  }
  if (!res.ok && res.status !== 206) throw new Error(`INFRA_ERROR ${table}(head): HTTP ${res.status}`)
  const range = res.headers.get('content-range') || ''
  const m = /\/(\d+)$/.exec(range)
  return m ? Number(m[1]) : 0
}

async function fetchStudentProgressValues(base, headers, studentId) {
  const url = `${base}/rest/v1/student_progress?select=updated_at,total_stars&student_id=eq.${encodeURIComponent(studentId)}&limit=1`
  let res
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
  } catch (err) {
    throw new Error(`INFRA_ERROR student_progress(values): ${err?.message || err}`)
  }
  if (!res.ok) throw new Error(`INFRA_ERROR student_progress(values): HTTP ${res.status}`)
  const rows = await res.json()
  const row = rows[0] || null
  return { updatedAt: row?.updated_at ?? null, totalStars: row?.total_stars ?? null }
}

/**
 * 학생별 학습기록 baseline 을 읽는다(공유용 — prod:check/prod:hotfix 양쪽에서
 * 쓸 수 있게 순수 로더로 분리했다). GET/HEAD 전용, 쓰기 경로 없음.
 * 행 내용은 절대 읽지 않는다(student_progress 의 updated_at/total_stars
 * 두 값만 예외) — 학생 개인 학습 상세가 리포트 파일에 남지 않게 하기 위함.
 * @param {{base:string,key:string}} supabase loadSupabaseEnv() 반환값
 * @param {string[]} studentIds
 * @returns {Promise<{students: Record<string, {counts: Record<string, number>, studentProgress: {updatedAt: string|null, totalStars: number|null}}>, sha256: string, tables: string[], generatedAt: string}>}
 */
export async function loadLearningBaseline(supabase, studentIds) {
  if (!supabase?.base || !supabase?.key) {
    throw new Error('loadLearningBaseline: base/key 가 필요합니다(loadSupabaseEnv() 결과를 넘기세요).')
  }
  const ids = Array.isArray(studentIds) ? [...new Set(studentIds.filter((v) => typeof v === 'string' && v))] : []
  const headers = { apikey: supabase.key, Authorization: `Bearer ${supabase.key}` }
  const students = {}
  for (const id of ids) {
    const counts = {}
    for (const table of LEARNING_BASELINE_TABLES) {
      counts[table] = await headCount(supabase.base, headers, table, id)
    }
    const studentProgress = await fetchStudentProgressValues(supabase.base, headers, id)
    students[id] = { counts, studentProgress }
  }
  const sha256 = crypto.createHash('sha256').update(JSON.stringify(students)).digest('hex')
  return { students, sha256, tables: LEARNING_BASELINE_TABLES, generatedAt: new Date().toISOString() }
}

/**
 * 두 baseline(loadLearningBaseline() 반환값과 동일 shape)을 비교한다.
 * 순수 함수(네트워크 없음). 학생별 카운트/student_progress 값이 달라진
 * 항목만 나열한다 — 변화가 없으면 빈 배열.
 * @param {ReturnType<typeof loadLearningBaseline> extends Promise<infer T> ? T : never} a "before"
 * @param {*} b "after"
 * @returns {Array<{studentId:string, field:string, before:*, after:*}>}
 */
export function diffLearningBaseline(a, b) {
  const changes = []
  const studentsA = a?.students || {}
  const studentsB = b?.students || {}
  const allIds = new Set([...Object.keys(studentsA), ...Object.keys(studentsB)])
  for (const id of allIds) {
    const sa = studentsA[id]
    const sb = studentsB[id]
    if (sa && !sb) { changes.push({ studentId: id, field: '_presence', before: 'present', after: 'missing' }); continue }
    if (!sa && sb) { changes.push({ studentId: id, field: '_presence', before: 'missing', after: 'present' }); continue }
    if (!sa || !sb) continue
    for (const table of LEARNING_BASELINE_TABLES) {
      const before = sa.counts?.[table] ?? null
      const after = sb.counts?.[table] ?? null
      if (before !== after) changes.push({ studentId: id, field: `counts.${table}`, before, after })
    }
    const beforeUpdatedAt = sa.studentProgress?.updatedAt ?? null
    const afterUpdatedAt = sb.studentProgress?.updatedAt ?? null
    if (beforeUpdatedAt !== afterUpdatedAt) {
      changes.push({ studentId: id, field: 'studentProgress.updatedAt', before: beforeUpdatedAt, after: afterUpdatedAt })
    }
    const beforeStars = sa.studentProgress?.totalStars ?? null
    const afterStars = sb.studentProgress?.totalStars ?? null
    if (beforeStars !== afterStars) {
      changes.push({ studentId: id, field: 'studentProgress.totalStars', before: beforeStars, after: afterStars })
    }
  }
  return changes
}
