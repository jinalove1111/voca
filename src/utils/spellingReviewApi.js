// 쓰기시험 교사 검토 큐(spelling_review_queue) — Supabase 접근 레이어.
//
// 목적(2026-07-17 운영자 지시): 영→한 문제에서 학생이 "한글로" 답했는데
// 오답 처리된 제출(= 뜻은 아는데 표기가 등록 안 된 것일 수 있는 애매한
// 오답)을 저장해두고, 교사가 관리자 화면에서 보고 "이 답 인정"하면 그
// 단어의 accepted_meanings에 추가한다. AI API 자동 판정은 절대 안 함
// (운영자 명시 금지) — 최종 판정은 항상 교사.
//
// 안전 원칙 — supabase_v2_0_spelling_mixed.sql이 아직 실행 안 된 상태로
// 이 코드가 먼저 배포돼도 앱이 절대 깨지지 않는다(entranceTestApi.js와
// 동일 패턴):
//   - 학생 쪽 기록(logSpellingReview)은 어떤 에러도 던지지 않고 조용히
//     스킵 — 채점/진행에는 애초에 아무 영향 없음(비동기 부수 기록).
//   - 관리자 조회는 에러 -> 빈 배열(패널이 "준비 중" 안내로 폴백).
//   - 관리자 쓰기(인정/무시)는 에러를 던짐 — 호출부 alert.
import { supabase } from './supabaseClient'

let _available = null // null = 미확인, false = 테이블 없음(이 세션 동안 재시도 안 함)
let _warned = false

function warnOnce(err) {
  if (_warned) return
  _warned = true
  console.warn('[spellingReview] 검토 큐 접근 실패 — supabase_v2_0_spelling_mixed.sql이 아직 실행 안 됐을 수 있음(기록 자동 스킵, 채점/학습에는 영향 없음):', err?.message || err)
}

// 애매한 오답 기록 — 학생 채점 흐름에서 fire-and-forget으로 호출된다.
// 같은 (word_id, submitted_answer) 조합은 DB unique 인덱스로 1행만 유지
// (중복 제출은 무시 — 큐가 무한정 불어나지 않음).
export async function logSpellingReview(wordDbId, studentId, submittedAnswer, direction = 'en2kr') {
  const answer = String(submittedAnswer ?? '').trim()
  if (!wordDbId || !answer) return
  if (_available === false) return
  try {
    const { error } = await supabase.from('spelling_review_queue').upsert({
      word_id: wordDbId,
      student_id: studentId || null,
      submitted_answer: answer,
      direction,
      status: 'pending',
    }, { onConflict: 'word_id,submitted_answer', ignoreDuplicates: true })
    if (error) { warnOnce(error); _available = false; return }
    _available = true
  } catch (err) {
    warnOnce(err)
  }
}

// 관리자 패널용 — 대기 중(pending) 항목 전부. 에러 -> null(테이블 없음 =
// 패널이 "SQL 실행 필요" 안내), 성공 -> 배열(빈 배열 = "검토할 답 없음").
// words(word_id FK) embed로 단어 원문/등록 뜻/현재 인정 목록까지 한 번에 —
// 패널이 단어별 재조회 없이 바로 "이 답 인정" 처리 가능.
export async function fetchPendingSpellingReviews() {
  const { data, error } = await supabase
    .from('spelling_review_queue')
    .select('id,word_id,student_id,submitted_answer,direction,date,created_at,words(word,meaning,accepted_meanings)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) { warnOnce(error); return null }
  return (data || []).map((r) => ({
    id: r.id,
    wordId: r.word_id,
    studentId: r.student_id,
    submittedAnswer: r.submitted_answer,
    direction: r.direction,
    date: r.date,
    createdAt: r.created_at,
    word: r.words?.word || '(삭제된 단어)',
    meaning: r.words?.meaning || '',
    acceptedMeanings: Array.isArray(r.words?.accepted_meanings) ? r.words.accepted_meanings : [],
  }))
}

// 인정/무시 처리 — 행은 지우지 않고 status만 바꾼다(교사가 실수로 눌러도
// 기록이 남아 복구 가능, 무한 재노출도 없음). 에러는 던짐(호출부 alert).
export async function resolveSpellingReview(id, status) {
  if (!['accepted', 'dismissed'].includes(status)) throw new Error(`잘못된 status: ${status}`)
  const { error } = await supabase.from('spelling_review_queue').update({ status }).eq('id', id)
  if (error) throw error
}
