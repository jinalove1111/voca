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

// ── 42703(undefined_column) 감지 ─────────────────────────────────────────
// textbooks/units는 이미 프로덕션 테이블이라 isMissingTableError(42P01/
// PGRST205)로는 안 걸린다 — 테이블은 있고 v3_13이 추가하는 컬럼(publisher_id/
// grade_id/level/book_order, lesson_no/objectives)만 없는 상태이므로, 원시
// Postgres 에러코드 42703(undefined_column)을 별도로 본다(wordLibrary.js의
// isMissingTableError와 같은 관례 — 코드 우선, 메시지 텍스트 보조).
function isMissingColumnError(error) {
  if (!error) return false
  if (error.code === '42703') return true
  const msg = String(error.message || '').toLowerCase()
  return msg.includes('column') && msg.includes('does not exist')
}

const META_MISSING_MESSAGE = '교재/유닛 메타 컬럼이 아직 준비되지 않았어요 — supabase_v3_13 실행 필요'

function throwIfMetaMissing(error) {
  if (isMissingTableError(error) || isMissingColumnError(error)) throw new Error(META_MISSING_MESSAGE)
  throw error
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

// updatePublisher(id, name) — 이름만 변경(rename). createPublisher와 동일한
// throw 계약(테이블 부재/중복 이름 모두 명확한 한국어 에러).
export async function updatePublisher(id, name) {
  if (!id) throw new Error('출판사 id가 없어요.')
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('출판사 이름을 입력해주세요.')
  const { data, error } = await supabase.from('publishers').update({ name: trimmed }).eq('id', id).select('id,name').single()
  if (error) {
    if (isMissingTableError(error)) throw new Error('출판사 테이블이 아직 준비되지 않았어요 — supabase_v3_13 실행 필요')
    if (error.code === '23505') throw new Error(`"${trimmed}" 출판사가 이미 있어요.`)
    throw error
  }
  return { id: data.id, name: data.name }
}

// deletePublisher(id) — publishers.id는 textbooks.publisher_id에서 FK
// `on delete set null`이므로(supabase_v3_13 §6 스키마), 이 출판사를 쓰던
// 교재가 있어도 삭제가 막히지 않고 그 교재의 publisher_id만 자동으로
// NULL이 된다(교재/유닛/단어 데이터는 절대 삭제되지 않음).
export async function deletePublisher(id) {
  if (!id) return
  const { error } = await supabase.from('publishers').delete().eq('id', id)
  if (error) {
    if (isMissingTableError(error)) throw new Error('출판사 테이블이 아직 준비되지 않았어요 — supabase_v3_13 실행 필요')
    throw error
  }
}

// listGrades() → { rows: [{id, name, sortOrder}], featureDisabled }
export async function listGrades() {
  const { rows, featureDisabled } = await safeSelect('grades', 'id,name,sort_order', 'sort_order')
  return { rows: rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order ?? 0 })), featureDisabled }
}

// createGrade(name, sortOrder?) — createPublisher와 동일한 쓰기 계약.
export async function createGrade(name, sortOrder) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('학년 이름을 입력해주세요.')
  const so = Number(sortOrder)
  const row = { name: trimmed, sort_order: Number.isFinite(so) ? so : 0 }
  const { data, error } = await supabase.from('grades').insert(row).select('id,name,sort_order').single()
  if (error) {
    if (isMissingTableError(error)) throw new Error('학년 테이블이 아직 준비되지 않았어요 — supabase_v3_13 실행 필요')
    if (error.code === '23505') throw new Error(`"${trimmed}" 학년이 이미 있어요.`)
    throw error
  }
  return { id: data.id, name: data.name, sortOrder: data.sort_order ?? 0 }
}

// listGrammarPoints() → { rows: [{id, code, label, grp, gradeBand}], featureDisabled }
export async function listGrammarPoints() {
  const { rows, featureDisabled } = await safeSelect('grammar_points', 'id,code,label,grp,grade_band', 'grp')
  return {
    rows: rows.map((r) => ({ id: r.id, code: r.code, label: r.label, grp: r.grp, gradeBand: r.grade_band || null })),
    featureDisabled,
  }
}

// ── textbooks/units 메타(publisher_id/grade_id/level/book_order,
// position/lesson_no/objectives) ────────────────────────────────────────
// 이 두 테이블 자체는 이미 프로덕션이라(v3.1) isMissingTableError로는 안
// 걸린다 — v3_13이 추가하는 컬럼만 없는 상태를 42703로 감지해 컬럼
// 없이(id/name/기존 컬럼만) 다시 조회하는 2단 폴백을 쓴다(wordLibrary.js의
// "테이블 부재 → 합성 폴백" 캐스케이딩 관례를 컬럼 단위로 적용한 것).
// CurriculumTree.jsx가 이 목록의 원천이다 — wordLibrary.js의 기존
// 교재/유닛 캐시(getAllTextbooks/getTextbookUnits)는 건드리지 않고
// (다른 15개 이상 호출부가 그 캐시에 의존, 규칙 1) 이 파일이 별도로 직접
// 조회한다.

// listTextbooksMeta() → { rows: [{id, name, publisherId, gradeId, level, bookOrder}], featureDisabled }
// featureDisabled=true는 "메타 컬럼 없음"(교재 자체는 있을 수 있음)까지
// 포함한다 — CurriculumTree가 배너 표시 여부를 이 플래그 하나로 판단한다.
export async function listTextbooksMeta() {
  try {
    const full = await supabase
      .from('textbooks')
      .select('id,name,publisher_id,grade_id,level,book_order')
      .order('name')
    if (!full.error) {
      return {
        rows: (full.data || []).map((t) => ({
          id: t.id, name: t.name,
          publisherId: t.publisher_id || null, gradeId: t.grade_id || null,
          level: t.level || null, bookOrder: t.book_order ?? null,
        })),
        featureDisabled: false,
      }
    }
    if (!isMissingColumnError(full.error)) {
      console.warn('[curriculumApi] listTextbooksMeta 조회 실패 (non-fatal):', full.error.message)
      return { rows: [], featureDisabled: true }
    }
    // 컬럼 부재 — id/name만이라도 폴백 조회(교재 목록 자체는 보여줌).
    const minimal = await supabase.from('textbooks').select('id,name').order('name')
    if (minimal.error) {
      warnOnce(minimal.error)
      return { rows: [], featureDisabled: true }
    }
    return {
      rows: (minimal.data || []).map((t) => ({ id: t.id, name: t.name, publisherId: null, gradeId: null, level: null, bookOrder: null })),
      featureDisabled: true,
    }
  } catch (err) {
    warnOnce(err)
    return { rows: [], featureDisabled: true }
  }
}

// updateTextbookMeta(id, {publisherId?, gradeId?, level?, bookOrder?}, adminPin?)
// — 부분 업데이트, additive 컬럼만 대상. adminPin은 exampleLibrary.js와
// 동일한 예약 인자(현재 미사용 — 이 테이블은 admin-content-write Edge
// Function에 아직 배선돼 있지 않다, 락다운 합류는 그 함수 자체의 후속
// 세션 범위).
export async function updateTextbookMeta(id, fields, adminPin) {
  void adminPin
  if (!id) throw new Error('교재 id가 없어요.')
  const f = fields || {}
  const patch = {}
  if ('publisherId' in f) patch.publisher_id = f.publisherId || null
  if ('gradeId' in f) patch.grade_id = f.gradeId || null
  if ('level' in f) patch.level = f.level ? String(f.level).trim() : null
  if ('bookOrder' in f) patch.book_order = f.bookOrder !== '' && f.bookOrder != null ? Number(f.bookOrder) : null
  if (Object.keys(patch).length === 0) return null
  const { data, error } = await supabase
    .from('textbooks').update(patch).eq('id', id)
    .select('id,name,publisher_id,grade_id,level,book_order').maybeSingle()
  if (error) throwIfMetaMissing(error)
  if (!data) throw new Error('해당 교재를 찾을 수 없어요.')
  return { id: data.id, name: data.name, publisherId: data.publisher_id || null, gradeId: data.grade_id || null, level: data.level || null, bookOrder: data.book_order ?? null }
}

// listUnitsMeta(textbookId) → { rows: [{id, name, position, lessonNo, objectives}], featureDisabled }
export async function listUnitsMeta(textbookId) {
  if (!textbookId) return { rows: [], featureDisabled: false }
  try {
    const full = await supabase
      .from('units')
      .select('id,name,position,lesson_no,objectives')
      .eq('textbook_id', textbookId)
      .order('position', { ascending: true })
    if (!full.error) {
      return {
        rows: (full.data || []).map((u) => ({ id: u.id, name: u.name, position: u.position ?? null, lessonNo: u.lesson_no ?? null, objectives: u.objectives || null })),
        featureDisabled: false,
      }
    }
    if (!isMissingColumnError(full.error)) {
      console.warn('[curriculumApi] listUnitsMeta 조회 실패 (non-fatal):', full.error.message)
      return { rows: [], featureDisabled: true }
    }
    // lesson_no/objectives 컬럼 부재 — position(기존 v1.x 컬럼)까지만 폴백.
    const minimal = await supabase.from('units').select('id,name,position').eq('textbook_id', textbookId).order('position', { ascending: true })
    if (minimal.error) {
      warnOnce(minimal.error)
      return { rows: [], featureDisabled: true }
    }
    return {
      rows: (minimal.data || []).map((u) => ({ id: u.id, name: u.name, position: u.position ?? null, lessonNo: null, objectives: null })),
      featureDisabled: true,
    }
  } catch (err) {
    warnOnce(err)
    return { rows: [], featureDisabled: true }
  }
}

// updateUnitMeta(id, {position?, lessonNo?, objectives?}, adminPin?)
export async function updateUnitMeta(id, fields, adminPin) {
  void adminPin
  if (!id) throw new Error('유닛 id가 없어요.')
  const f = fields || {}
  const patch = {}
  if ('position' in f) patch.position = f.position !== '' && f.position != null ? Number(f.position) : null
  if ('lessonNo' in f) patch.lesson_no = f.lessonNo !== '' && f.lessonNo != null ? Number(f.lessonNo) : null
  if ('objectives' in f) patch.objectives = f.objectives ? String(f.objectives).trim() : null
  if (Object.keys(patch).length === 0) return null
  const { data, error } = await supabase
    .from('units').update(patch).eq('id', id)
    .select('id,name,position,lesson_no,objectives').maybeSingle()
  if (error) throwIfMetaMissing(error)
  if (!data) throw new Error('해당 유닛을 찾을 수 없어요.')
  return { id: data.id, name: data.name, position: data.position ?? null, lessonNo: data.lesson_no ?? null, objectives: data.objectives || null }
}
