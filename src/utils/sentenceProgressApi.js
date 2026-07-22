// src/utils/sentenceProgressApi.js — Sentence Learning(v3.4) 학생별 문장
// 진행도(sentence_progress) Supabase 접근 레이어.
//
// 순수 계산(sentenceLearning.js applyStageResult)과 완전히 분리 — 이
// 파일만 DB를 안다(readingApi.js/spellingReviewApi.js와 같은 분리 원칙).
//
// 안전 원칙(supabase_v3_4_sentence_learning.sql이 아직 실행 안 된 상태로
// 이 코드가 먼저 배포돼도 앱이 절대 깨지지 않음, CLAUDE.md 규칙 9):
//   - 조회(fetchSentenceProgress)는 어떤 에러도 던지지 않고 {} 폴백 —
//     Phase B 학생 화면이 "진행도 없음 = 처음부터"로 안전하게 동작한다.
//   - 쓰기(upsertSentenceProgress)는 테이블 부재면 조용히 스킵(warnOnce,
//     학습 흐름 불차단 — spellingReviewApi 관례), 그 외 실패는 명확한
//     에러를 던진다(호출부가 재시도/알림 판단).
//
// 학생 식별은 항상 students.id(UUID) — 이름 문자열 미사용(CLAUDE.md 규칙 4).
import { supabase } from './supabaseClient'

// readingApi.js와 동일 로직의 로컬 사본(42P01/PGRST205/메시지 패턴) —
// wordLibrary.isMissingTableError가 export되어 있지 않은 관례를 따른다.
function isMissingTableError(error) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = String(error.message || '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('schema cache')
}

let _warned = false
function warnOnce(err) {
  if (_warned) return
  _warned = true
  console.warn('[sentenceProgressApi] sentence_progress 접근 실패 — supabase_v3_4_sentence_learning.sql이 아직 실행 안 됐을 수 있음(진행도는 빈 상태로 폴백, 학습 흐름에는 영향 없음):', err?.message || err)
}

// 학생의 문장별 진행도 조회 — sentenceIds(uuid 배열) 범위만.
// 절대 던지지 않음 — 테이블 부재/네트워크 실패 등 모든 에러는 {} 폴백.
// 반환: { [sentenceId]: { currentStage, completedStages, attemptCount,
//         correctCount, wrongCount, masteredAt, lastPracticedAt } }
export async function fetchSentenceProgress(studentId, sentenceIds) {
  const ids = (Array.isArray(sentenceIds) ? sentenceIds : []).filter(Boolean)
  if (!studentId || ids.length === 0) return {}
  try {
    const { data, error } = await supabase
      .from('sentence_progress')
      .select('sentence_id,current_stage,completed_stages,attempt_count,correct_count,wrong_count,mastered_at,last_practiced_at')
      .eq('student_id', studentId)
      .in('sentence_id', ids)
    if (error) {
      if (isMissingTableError(error)) warnOnce(error)
      else console.warn('[sentenceProgressApi] fetch failed (non-fatal):', error.message)
      return {}
    }
    const map = {}
    ;(data || []).forEach((r) => {
      map[r.sentence_id] = {
        currentStage: r.current_stage || 'read',
        completedStages: Array.isArray(r.completed_stages) ? r.completed_stages : [],
        attemptCount: r.attempt_count || 0,
        correctCount: r.correct_count || 0,
        wrongCount: r.wrong_count || 0,
        masteredAt: r.mastered_at || null,
        lastPracticedAt: r.last_practiced_at || null,
      }
    })
    return map
  } catch (err) {
    warnOnce(err)
    return {}
  }
}

// 문장 진행도 저장 — fields는 sentenceLearning.applyStageResult가 반환한
// DB 필드 객체(current_stage/completed_stages/attempt_count/correct_count/
// wrong_count/mastered_at/last_practiced_at)를 그대로 받는다(리듀서가
// 계산, 이 함수는 영속만 — 책임 분리).
// unique(student_id, sentence_id) 충돌 시 갱신(upsert). 테이블 부재는
// 조용히 스킵(false 반환), 그 외 실패는 명확한 에러를 던진다.
export async function upsertSentenceProgress(studentId, sentenceId, fields) {
  if (!studentId || !sentenceId) return false
  const row = {
    student_id: studentId,
    sentence_id: sentenceId,
    ...(fields || {}),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('sentence_progress')
    .upsert(row, { onConflict: 'student_id,sentence_id' })
  if (error) {
    if (isMissingTableError(error)) { warnOnce(error); return false }
    throw error
  }
  return true
}
