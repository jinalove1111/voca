// src/utils/curriculum/exampleLibrary.js — Curriculum Engine 예문(examples)
// 모듈의 데이터 계층(docs/CURRICULUM_ENGINE.md §6 "콘텐츠 모듈 계약의 표준형
// — 후속 모듈이 같은 형태 복제").
//
// 안전 원칙(supabase_v3_13_curriculum_engine_phase0.sql이 아직 실행 안 된
// 상태로 이 코드가 먼저 배포돼도 앱이 절대 깨지지 않음, CLAUDE.md 규칙 9):
//   - 조회(listExamples/fetchApprovedExamplesForWords)는 어떤 에러도 절대
//     던지지 않는다 — sentenceProgressApi.js의 "조회는 던지지 않음" 관례를
//     그대로 따른다. listExamples는 { rows:[], featureDisabled:true }로,
//     fetchApprovedExamplesForWords는 {}로 폴백한다.
//   - 쓰기(create/update/delete/setApprovalStatus 등)는 테이블 부재면
//     명확한 한국어 에러를 던진다(관리자가 "저장된 줄 착각"하지 않도록,
//     wordLibrary.js setWordAcceptedMeanings 관례와 동일한 throw 계약).
//
// 학생 노출 = approval_status='approved'만: 이 하드코딩이 이 파일에만
// 있고 UI가 아니라 데이터 계층에 있다(설계 문서 §3 "학생 노출 =
// approval_status='approved'만 — UI가 아니라 데이터 계층에서 하드코딩으로
// 강제"). fetchApprovedExamplesForWords는 학생 화면이 부르는 유일한
// 함수이므로, 이 함수의 안전성(절대 throw 않음 + approved 하드코딩)이 이
// 모듈 전체의 안전성이다.
import { supabase } from '../supabaseClient'
import { isMissingTableError } from '../wordLibrary'
import { canTransition, validateExampleFields, normalizeTargetWord } from './curriculumModel'

const EXAMPLES_SELECT =
  'id,unit_id,textbook_id,word_id,target_word,english_sentence,korean_translation,' +
  'grammar_point_id,difficulty,source,approval_status,created_by,approved_by,approved_at,' +
  'ai_model,ai_meta,created_at,updated_at'

const MISSING_TABLE_MESSAGE = '교과서 예문 테이블이 아직 준비되지 않았어요 — supabase_v3_13 실행 필요'

// 모듈 전역 sticky 플래그 — sentenceProgressApi.js의 warnOnce 관례와 동일
// (한 세션에서 콘솔 경고를 반복 출력하지 않기 위함). 조회 실패가 "테이블
// 부재"로 확인되면 이후 조회들도 같은 사유일 가능성이 높아 콘솔을
// 조용하게 유지한다 — 단, 매 호출은 여전히 실제로 Supabase에 물어본다
// (캐시된 값을 반환하지 않음 — 마이그레이션이 뒤늦게 실행되면 다음 호출부터
// 바로 성공해야 하므로).
let _tableMissingWarned = false
function warnOnce(err) {
  if (_tableMissingWarned) return
  _tableMissingWarned = true
  console.warn(
    '[exampleLibrary] examples 테이블 접근 실패 — supabase_v3_13_curriculum_engine_phase0.sql이 아직 실행 안 됐을 수 있음(기능 비가시로 폴백, 학습 흐름에는 영향 없음):',
    err?.message || err,
  )
}

function toRow(r) {
  return {
    id: r.id,
    unitId: r.unit_id || null,
    textbookId: r.textbook_id || null,
    wordId: r.word_id || null,
    targetWord: r.target_word,
    englishSentence: r.english_sentence,
    koreanTranslation: r.korean_translation || null,
    grammarPointId: r.grammar_point_id || null,
    difficulty: r.difficulty ?? 1,
    source: r.source || 'teacher',
    approvalStatus: r.approval_status || 'draft',
    createdBy: r.created_by || null,
    approvedBy: r.approved_by || null,
    approvedAt: r.approved_at || null,
    aiModel: r.ai_model || null,
    aiMeta: r.ai_meta || null,
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  }
}

// ── 조회: 절대 throw하지 않음 ───────────────────────────────────────────

// 필터 기반 목록 조회(관리자 화면 전용 소비처) — 테이블 부재/네트워크 실패
// 등 모든 에러는 { rows:[], featureDisabled:true } 폴백.
// filters: { textbookId?, unitId?, grammarPointId?, targetWord?, approvalStatus? }
// publisherId/gradeId는 필터 키에 없다 — examples 행에는 그 컬럼이 없어
// (설계상 textbook을 경유해서만 연결) 조인 없이는 서버 사이드든 클라이언트
// 사이드든 매치할 수 없다(curriculumModel.matchesFilters 계약과 동일 — 리뷰
// 반영). 출판사/학년으로 예문을 거르고 싶은 관리자 화면은 먼저
// curriculumApi(listPublishers/listGrades + textbooks 조회)로 대상
// textbookId 목록을 구한 뒤 이 함수에 textbookId(또는 unitId)로 넘겨야 한다.
export async function listExamples(filters, { limit = 200, offset = 0 } = {}) {
  try {
    const f = filters || {}
    let query = supabase.from('examples').select(EXAMPLES_SELECT).order('created_at', { ascending: false })
    if (f.textbookId) query = query.eq('textbook_id', f.textbookId)
    if (f.unitId) query = query.eq('unit_id', f.unitId)
    if (f.grammarPointId) query = query.eq('grammar_point_id', f.grammarPointId)
    if (f.approvalStatus) query = query.eq('approval_status', f.approvalStatus)
    if (f.targetWord) query = query.ilike('target_word', `%${f.targetWord}%`)
    query = query.range(offset, offset + Math.max(0, limit - 1))

    const { data, error } = await query
    if (error) {
      if (isMissingTableError(error)) warnOnce(error)
      else console.warn('[exampleLibrary] listExamples failed (non-fatal):', error.message)
      return { rows: [], featureDisabled: true }
    }
    return { rows: (data || []).map(toRow), featureDisabled: false }
  } catch (err) {
    warnOnce(err)
    return { rows: [], featureDisabled: true }
  }
}

// 학생 화면의 유일한 소비 함수 — wordTexts(단어 원문 배열)에 대해 승인된
// 예문만 조회한다. 반환: { [단어lower]: exampleRow(위 toRow 형태) }.
// approval_status='approved' 하드코딩(§3) — 호출부가 필터를 실수로 빼먹어도
// 미승인 예문이 노출될 수 없다.
//
// 두 번째 인자(옵션, 하위 호환 — 기본 {}): { unitId? }를 주면 단어별로
// "해당 유닛에 정렬된 승인 예문"을 "범용(유닛 미지정) 또는 다른 유닛"
// 예문보다 우선한다(리뷰 반영 L5 — §2 각주 "유닛 정렬 예문이 항상 우선"을
// 이 함수도 실제로 지키게 함). 단일 쿼리로 단어 전체를 한 번에 가져온 뒤
// 클라이언트에서 우선순위 정렬만 한다(N+1 없음 — 단어 수만큼 쿼리를 돌리지
// 않는다). 같은 우선순위 안에서는 created_at desc라 먼저 만난 행이 최신.
export async function fetchApprovedExamplesForWords(wordTexts, { unitId } = {}) {
  const words = (Array.isArray(wordTexts) ? wordTexts : []).map(normalizeTargetWord).filter(Boolean)
  if (words.length === 0) return {}
  try {
    const { data, error } = await supabase
      .from('examples')
      .select(EXAMPLES_SELECT)
      .eq('approval_status', 'approved')
      .in('target_word', words)
      .order('created_at', { ascending: false })
      .limit(500) // 리뷰 반영 L2 — 승인 예문이 대량으로 쌓여도 한 번의 조회가 무제한 커지지 않도록 상한
    if (error) {
      if (isMissingTableError(error)) warnOnce(error)
      else console.warn('[exampleLibrary] fetchApprovedExamplesForWords failed (non-fatal):', error.message)
      return {}
    }
    // best.rank: unitId가 주어졌고 이 행의 unit_id가 정확히 일치하면 2,
    // 그 외(범용 unit_id=null 또는 다른 유닛)는 1 — 항상 유닛 일치가 우선.
    // unitId를 안 넘기면(기본 호출) 전 행이 rank 1이라 기존 동작(단순
    // "가장 최근 1개")과 완전히 동일하다(하위 호환).
    const bestByWord = new Map()
    ;(data || []).forEach((r) => {
      const key = normalizeTargetWord(r.target_word)
      if (!key) return
      const rank = unitId && r.unit_id === unitId ? 2 : 1
      const existing = bestByWord.get(key)
      if (!existing || rank > existing.rank) {
        bestByWord.set(key, { row: r, rank })
      }
      // rank가 같으면 기존 값 유지 — order desc라 먼저 만난 행이 이미 최신.
    })
    const map = {}
    bestByWord.forEach(({ row }, key) => { map[key] = toRow(row) })
    return map
  } catch (err) {
    warnOnce(err)
    return {}
  }
}

// ── 쓰기: 관리자 전용. 테이블 부재 시 명확한 한국어 에러를 던진다 ─────────
//
// adminPin은 미래 락다운 합류용 예약 인자(현재 미사용) — wordLibrary.js의
// "adminPin이 truthy면 admin-content-write Edge Function 경로, 없으면
// 레거시 anon 직접 쓰기 경로" 듀얼패스 관례를 그대로 따를 자리다. 이
// examples 테이블은 아직 그 Edge Function에 배선돼 있지 않고(설계 문서
// §2 RLS 절 — 락다운은 주석 블록으로만 동봉, v3.11/v3.12 배포 후 합류),
// 지금은 adminPin을 받아만 두고 무시한 채 anon 직접 쓰기만 수행한다 —
// 락다운 합류 시 이 함수들 내부만 교체하면 되고 호출부(ExampleManager 등)는
// 이미 adminPin을 넘기고 있었으므로 무변경.
function throwIfMissingTable(error) {
  if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE)
  throw error
}

// createExample(fields, adminPin?) — fields는 snake_case DB 필드 그대로
// (target_word/english_sentence/korean_translation/unit_id/textbook_id/
// word_id/grammar_point_id/difficulty/source). validateExampleFields로
// 선검증 후 저장. created_by는 항상 'admin'(설계 문서 §6), target_word는
// normalizeTargetWord로 정규화해 저장 — fetchApprovedExamplesForWords의
// 매칭 키와 항상 일치하게 한다.
export async function createExample(fields, adminPin) {
  void adminPin // 예약 인자(현재 미사용) — 위 헤더 주석 참고.
  const { ok, errors } = validateExampleFields(fields)
  if (!ok) throw new Error(errors.join(' '))

  const source = fields.source || 'teacher'
  // 소스 가드(리뷰 반영) — 생성기/임포트/AI 경로(source !== 'teacher')는
  // 호출부가 approval_status를 뭐라고 넘기든 항상 'draft'로 강제한다.
  // 생성기/임포트 경로는 auto-publish 구조적 차단 — 설계 §4("생성기 계약에는
  // approved로 전이하는 함수가 없어서 auto-publish가 구조적으로 불가능").
  // 교사(source==='teacher')만 approved를 직접 지정해 생성할 수 있다(설계 §3
  // "교사 직접 작성 — 즉시 승인 가능").
  const approvalStatus = source === 'teacher' ? (fields.approval_status || 'draft') : 'draft'

  const row = {
    unit_id: fields.unit_id || null,
    textbook_id: fields.textbook_id || null,
    word_id: fields.word_id || null,
    target_word: normalizeTargetWord(fields.target_word),
    english_sentence: String(fields.english_sentence).trim(),
    korean_translation: fields.korean_translation ? String(fields.korean_translation).trim() : null,
    grammar_point_id: fields.grammar_point_id || null,
    difficulty: fields.difficulty != null ? Number(fields.difficulty) : 1,
    source,
    approval_status: approvalStatus,
    created_by: 'admin',
  }
  const { data, error } = await supabase.from('examples').insert(row).select(EXAMPLES_SELECT).single()
  if (error) throwIfMissingTable(error)
  return toRow(data)
}

// updateExample(id, fields, adminPin?) — 부분 업데이트. 넘어온 필드만
// 반영하지만, 검증은 "패치 + 현재 저장된 값"을 합친 최종 상태 기준으로 한다
// (리뷰 반영 — 부분 패치 버그 수정). 이전 버전은 target_word/english_sentence
// 중 하나만 patch에 있어도 나머지 하나를 undefined로 검증에 넘겨, 예컨대
// target_word 하나만 고치는 정상적인 부분 패치가 "english_sentence는
// 필수예요" 에러로 항상 실패하는 버그가 있었다. 지금은 둘 중 하나라도
// patch에 있으면 먼저 현재 행을 조회해 병합한 뒤 whole-word 불변식을
// 재확인한다.
export async function updateExample(id, fields, adminPin) {
  void adminPin
  if (!id) throw new Error('예문 id가 없어요.')
  const f = fields || {}

  const needsMergedCheck = 'target_word' in f || 'english_sentence' in f
  let currentRow = null
  if (needsMergedCheck) {
    const { data, error } = await supabase.from('examples').select(EXAMPLES_SELECT).eq('id', id).maybeSingle()
    if (error) throwIfMissingTable(error)
    if (!data) throw new Error('해당 예문을 찾을 수 없어요.')
    currentRow = toRow(data)
  }

  const patch = {}
  if ('unit_id' in f) patch.unit_id = f.unit_id || null
  if ('textbook_id' in f) patch.textbook_id = f.textbook_id || null
  if ('word_id' in f) patch.word_id = f.word_id || null
  if ('target_word' in f) patch.target_word = normalizeTargetWord(f.target_word)
  if ('english_sentence' in f) patch.english_sentence = String(f.english_sentence).trim()
  if ('korean_translation' in f) patch.korean_translation = f.korean_translation ? String(f.korean_translation).trim() : null
  if ('grammar_point_id' in f) patch.grammar_point_id = f.grammar_point_id || null
  if ('source' in f) patch.source = f.source

  // difficulty(리뷰 반영 — edge case): 유효한 1~5 유한수일 때만 payload에
  // 담는다. 키가 있었는데 유효하지 않으면(예: 0, 6, 'abc', NaN) DB CHECK
  // 위반(원시 postgres 에러)까지 왕복하지 않고 여기서 명확한 한국어 검증
  // 에러를 바로 던진다.
  if ('difficulty' in f) {
    const d = Number(f.difficulty)
    if (!Number.isFinite(d) || d < 1 || d > 5) {
      throw new Error('difficulty(난이도)는 1~5 사이 숫자여야 해요.')
    }
    patch.difficulty = d
  }

  if (needsMergedCheck) {
    const mergedTargetWord = 'target_word' in patch ? patch.target_word : currentRow.targetWord
    const mergedEnglishSentence = 'english_sentence' in patch ? patch.english_sentence : currentRow.englishSentence
    const { ok, errors } = validateExampleFields({
      target_word: mergedTargetWord,
      english_sentence: mergedEnglishSentence,
    })
    if (!ok) throw new Error(errors.join(' '))
  }

  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase.from('examples').update(patch).eq('id', id).select(EXAMPLES_SELECT).single()
  if (error) throwIfMissingTable(error)
  return toRow(data)
}

export async function deleteExample(id, adminPin) {
  void adminPin
  if (!id) return
  const { error } = await supabase.from('examples').delete().eq('id', id)
  if (error) throwIfMissingTable(error)
}

// setApprovalStatus(id, next, adminPin?) — canTransition(현재 상태, next)
// 검증 후에만 반영. 현재 상태를 모른 채 next만으로 판단할 수 없으므로
// 먼저 현재 approval_status를 조회한다(추가 왕복 1회 — 관리자 액션이라
// 빈도 낮음, 학생 조회 경로와 무관).
export async function setApprovalStatus(id, next, adminPin) {
  void adminPin
  if (!id) throw new Error('예문 id가 없어요.')
  const { data: current, error: selErr } = await supabase
    .from('examples').select('approval_status').eq('id', id).maybeSingle()
  if (selErr) throwIfMissingTable(selErr)
  if (!current) throw new Error('해당 예문을 찾을 수 없어요.')
  if (!canTransition(current.approval_status, next)) {
    throw new Error(`상태 전이가 허용되지 않아요: ${current.approval_status} → ${next}`)
  }
  const patch = {
    approval_status: next,
    updated_at: new Date().toISOString(),
  }
  if (next === 'approved') {
    patch.approved_by = 'admin'
    patch.approved_at = new Date().toISOString()
  }
  const { data, error } = await supabase.from('examples').update(patch).eq('id', id).select(EXAMPLES_SELECT).single()
  if (error) throwIfMissingTable(error)
  return toRow(data)
}

// approveExample/rejectExample/publishExample — 교사 검수 액션의 표준
// 이름(설계 문서 §4). publishExample은 approveExample의 별칭(외부 노출
// 이름 통일용 — 호출부가 "승인"과 "게시" 어느 언어를 쓰든 동일 동작).
export function approveExample(id, adminPin) {
  return setApprovalStatus(id, 'approved', adminPin)
}
export function rejectExample(id, adminPin) {
  return setApprovalStatus(id, 'rejected', adminPin)
}
export function publishExample(id, adminPin) {
  return approveExample(id, adminPin)
}
