// src/utils/curriculum/curriculumApi.js — publishers/grades/grammar_points
// 메타 조회·최소 쓰기(docs/CURRICULUM_ENGINE.md §6). exampleLibrary.js와
// 같은 안전 원칙: 조회는 절대 throw하지 않고 { rows:[], featureDisabled:true }
// 로 폴백한다(CLAUDE.md 규칙 9 — supabase_v3_13 미실행 상태에서도 안전).
// 이 파일은 관리자 화면(CurriculumTree 등)이 최소로 필요로 하는 것만
// 담는다 — 예문 CRUD는 exampleLibrary.js의 책임.
import { supabase } from '../supabaseClient'
import { isMissingTableError } from '../wordLibrary'

let _tableMissingWarned = false
function warnOnce(err) {
  if (_tableMissingWarned) return
  _tableMissingWarned = true
  console.warn(
    '[curriculumApi] publishers/grades/grammar_points 접근 실패 — supabase_v3_13_curriculum_engine_phase0.sql이 아직 실행 안 됐을 수 있음(기능 비가시로 폴백):',
    err?.message || err,
  )
}

async function safeSelect(table, columns, orderCol) {
  try {
    let query = supabase.from(table).select(columns)
    if (orderCol) query = query.order(orderCol)
    const { data, error } = await query
    if (error) {
      if (isMissingTableError(error)) warnOnce(error)
      else console.warn(`[curriculumApi] ${table} 조회 실패 (non-fatal):`, error.message)
      return { rows: [], featureDisabled: true }
    }
    return { rows: data || [], featureDisabled: false }
  } catch (err) {
    warnOnce(err)
    return { rows: [], featureDisabled: true }
  }
}

// listPublishers() → { rows: [{id, name}], featureDisabled }
export async function listPublishers() {
  const { rows, featureDisabled } = await safeSelect('publishers', 'id,name,created_at', 'name')
  return { rows: rows.map((r) => ({ id: r.id, name: r.name })), featureDisabled }
}

// createPublisher(name) — 관리자 전용, 테이블 부재 시 명확한 한국어 에러를
// 던진다(쓰기는 exampleLibrary.js와 동일한 throw 계약).
export async function createPublisher(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('출판사 이름을 입력해주세요.')
  const { data, error } = await supabase.from('publishers').insert({ name: trimmed }).select('id,name').single()
  if (error) {
    if (isMissingTableError(error)) throw new Error('출판사 테이블이 아직 준비되지 않았어요 — supabase_v3_13 실행 필요')
    if (error.code === '23505') throw new Error(`"${trimmed}" 출판사가 이미 있어요.`)
    throw error
  }
  return { id: data.id, name: data.name }
}

// listGrades() → { rows: [{id, name, sortOrder}], featureDisabled }
export async function listGrades() {
  const { rows, featureDisabled } = await safeSelect('grades', 'id,name,sort_order', 'sort_order')
  return { rows: rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order ?? 0 })), featureDisabled }
}

// listGrammarPoints() → { rows: [{id, code, label, grp, gradeBand}], featureDisabled }
export async function listGrammarPoints() {
  const { rows, featureDisabled } = await safeSelect('grammar_points', 'id,code,label,grp,grade_band', 'grp')
  return {
    rows: rows.map((r) => ({ id: r.id, code: r.code, label: r.label, grp: r.grp, gradeBand: r.grade_band || null })),
    featureDisabled,
  }
}
