// src/utils/readingApi.js — Reading Foundation(v3.3) Supabase 접근 레이어.
// seasonApi.js/wordKingApi.js와 같은 분리 원칙: 순수 계산(readingModel.js)
// 과 완전히 분리, 이 파일만 DB를 안다.
//
// 핵심 안전 원칙(supabase_v3_3_reading.sql이 아직 실행 안 된 상태로 이
// 코드가 먼저 배포돼도 앱이 절대 깨지지 않아야 함, CLAUDE.md 규칙 9):
// - 조회(fetchPassagesForUnit)는 에러를 절대 던지지 않고 []로 폴백한다 —
//   이후 학생 화면이 이 함수를 소비하게 되더라도(현재는 관리자만) "지문
//   없음"으로 안전하게 동작한다.
// - 쓰기(create/update/delete/save/move)는 명확한 에러를 던진다 — 관리자
//   편집기가 alert로 표시(seasonApi triggerStartNewSeason과 동일 관례).
//   단, 편집기는 애초에 테이블 부재 시 안내문만 렌더해 쓰기 경로에
//   진입하지 않는다(PassageEditor.jsx).
import { supabase } from './supabaseClient'
import { normalizeSentences } from './readingModel'
// 2026-07-23 — wordLibrary.js가 isMissingTableError를 export하게 되어
// (감사 문서 09 §1-1 재복제 중단), 문자 단위 동일했던 로컬 사본을 제거하고
// 단일 원본을 import한다. 동작 변화 0.
import { isMissingTableError } from './wordLibrary'

// 유닛의 지문 목록(+각 지문의 문장, position 정규화 완료 상태)을 반환.
// 절대 던지지 않음 — 테이블 부재/네트워크 실패 등 모든 에러는 [] 폴백.
// 반환: [{ id, title, position, sentences: [{ id, position, english, korean,
//          isKeySentence, importanceLevel, grammarPoint, chunks }] }]
// v3.4 학습 메타 4필드는 supabase_v3_4_sentence_learning.sql 미실행이면
// 42703(undefined column)이 나므로 기존 컬럼 셋으로 재시도 후 안전
// 기본값으로 채운다(getStudentClassAssignments의 textbook_id cascading
// 폴백과 동일 관례 — CLAUDE.md 규칙 9).
const SENTENCE_BASE_COLS = 'id,passage_id,position,english,korean'
const SENTENCE_V34_COLS = SENTENCE_BASE_COLS + ',is_key_sentence,importance_level,grammar_point,chunks'

export async function fetchPassagesForUnit(unitId) {
  if (!unitId) return []
  try {
    const { data: passages, error } = await supabase
      .from('passages')
      .select('id,title,position')
      .eq('unit_id', unitId)
      .order('position')
    if (error || !passages || passages.length === 0) {
      if (error && !isMissingTableError(error)) {
        console.warn('[readingApi] passages fetch failed (non-fatal):', error.message)
      }
      return []
    }
    const ids = passages.map((p) => p.id)
    let { data: sentences, error: sErr } = await supabase
      .from('passage_sentences')
      .select(SENTENCE_V34_COLS)
      .in('passage_id', ids)
      .order('position')
    if (sErr && sErr.code === '42703') {
      // v3.4 컬럼 미존재(마이그레이션 전) — 기존 컬럼 셋으로 재시도.
      ;({ data: sentences, error: sErr } = await supabase
        .from('passage_sentences')
        .select(SENTENCE_BASE_COLS)
        .in('passage_id', ids)
        .order('position'))
    }
    if (sErr) {
      // 지문 메타는 있는데 문장 조회만 실패 — 빈 문장으로라도 목록은 보여줌.
      console.warn('[readingApi] passage_sentences fetch failed (non-fatal):', sErr.message)
    }
    const byPassage = {}
    ;(sentences || []).forEach((s) => {
      if (!byPassage[s.passage_id]) byPassage[s.passage_id] = []
      byPassage[s.passage_id].push({
        id: s.id,
        position: s.position,
        english: s.english,
        korean: s.korean || '',
        // v3.4 학습 메타 — 컬럼 부재(폴백 조회) 시 안전 기본값.
        isKeySentence: s.is_key_sentence === true,
        importanceLevel: Number(s.importance_level) || 1,
        grammarPoint: s.grammar_point || '',
        chunks: Array.isArray(s.chunks) ? s.chunks : null,
      })
    })
    return passages.map((p) => ({
      id: p.id,
      title: p.title,
      position: p.position,
      sentences: normalizeSentences(byPassage[p.id] || []),
    }))
  } catch (err) {
    console.warn('[readingApi] fetchPassagesForUnit failed (non-fatal):', err?.message || err)
    return []
  }
}

// 새 지문 생성 — position은 호출부가 목록 끝 인덱스를 넘긴다
// (ClassTextbookLinks의 "새 연결은 목록 끝" 관례와 동일).
export async function createPassage(unitId, title, position = 0) {
  const { data, error } = await supabase
    .from('passages')
    .insert({ unit_id: unitId, title, position })
    .select('id,title,position')
    .single()
  if (error) throw error
  return { ...data, sentences: [] }
}

export async function updatePassageTitle(passageId, title) {
  const { error } = await supabase.from('passages').update({ title }).eq('id', passageId)
  if (error) throw error
}

// 지문 삭제 — 확인 다이얼로그는 UI 레이어(PassageEditor) 책임.
// 문장은 FK on delete cascade로 함께 정리된다(SQL 파일 참고).
export async function deletePassage(passageId) {
  const { error } = await supabase.from('passages').delete().eq('id', passageId)
  if (error) throw error
}

// 지문의 문장 전체 저장 — delete-then-insert(해당 passage_id 범위 한정).
// upsert+삭제분 추적보다 단순하고, 단어 저장(wordLibrary setClassWords의
// unit_id 범위 delete-then-insert)과 같은 검증된 관례라 이 방식을 택했다.
// position은 배열 순서(0..n-1)로 부여 — 호출부의 화면 순서가 곧 저장 순서.
// v3.4 학습 메타(isKeySentence/importanceLevel/grammarPoint/chunks)도 함께
// 저장한다. 마이그레이션 전(컬럼 부재 42703)이면 기존 컬럼 셋으로 재시도
// — 프로덕션이 SQL 실행 전이어도 v3.3 저장은 계속 동작한다(규칙 9).
export async function saveSentences(passageId, sentences) {
  const baseRows = (sentences || []).map((s, i) => ({
    passage_id: passageId,
    position: i,
    english: String(s.english ?? '').trim(),
    korean: String(s.korean ?? '').trim(),
  }))
  const fullRows = (sentences || []).map((s, i) => ({
    ...baseRows[i],
    is_key_sentence: s.isKeySentence === true,
    importance_level: Math.min(5, Math.max(1, Number(s.importanceLevel) || 1)),
    grammar_point: String(s.grammarPoint ?? '').trim() || null,
    chunks: Array.isArray(s.chunks) && s.chunks.length >= 2 ? s.chunks : null,
  }))
  const { error: delErr } = await supabase
    .from('passage_sentences').delete().eq('passage_id', passageId)
  if (delErr) throw delErr
  if (fullRows.length === 0) return
  let { error: insErr } = await supabase.from('passage_sentences').insert(fullRows)
  if (insErr && insErr.code === '42703') {
    // v3.4 컬럼 미존재 — 학습 메타를 뺀 기존 필드만으로 재시도(메타는
    // 컬럼이 생긴 뒤 다시 저장하면 됨 — 편집기가 컨트롤 비활성으로 안내).
    ;({ error: insErr } = await supabase.from('passage_sentences').insert(baseRows))
  }
  if (insErr) throw insErr
}

// v3.4 학습 메타 컬럼 존재 여부 — 편집기가 신규 컨트롤(핵심 문장/중요도/
// 문법 포인트/청크)을 활성화할지 판단(head 조회 1회).
// true = 사용 가능, false = supabase_v3_4_sentence_learning.sql 미실행.
// 기타 에러(네트워크 등)는 true 취급 — 오탐으로 컨트롤을 숨기지 않기
// 위해(checkReadingTablesExist와 동일 관례, 실제 저장 실패는 42703
// 폴백이 흡수).
export async function checkSentenceColumnsExist() {
  try {
    const { error } = await supabase
      .from('passage_sentences')
      .select('is_key_sentence', { head: true, count: 'exact' })
      .limit(1)
    if (!error) return true
    return error.code !== '42703'
  } catch {
    return true
  }
}

// 지문 순서 변경 — 호출부(PassageEditor)가 재정렬된 전체 목록을 알고
// 있으므로, 지문별 새 position을 한 건씩 update한다(지문 수는 유닛당
// 소수라 개별 update로 충분 — 대량 배치 최적화는 필요 시 후속).
export async function movePassage(passageId, position) {
  const { error } = await supabase.from('passages').update({ position }).eq('id', passageId)
  if (error) throw error
}

// 관리자 편집기 게이팅용 — 테이블 존재 여부 확인(1행 head 조회).
// true = 사용 가능, false = supabase_v3_3_reading.sql 미실행(안내문 표시).
// 네트워크 등 기타 에러는 true로 취급(안내문 오탐으로 편집기를 숨기지
// 않기 위해 — 실제 쓰기 실패는 각 액션의 alert가 잡는다).
export async function checkReadingTablesExist() {
  try {
    const { error } = await supabase.from('passages').select('id', { head: true, count: 'exact' }).limit(1)
    return !isMissingTableError(error)
  } catch {
    return true
  }
}
