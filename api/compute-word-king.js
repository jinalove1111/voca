// Vercel Serverless Function — Word King(주간·서버 전용 계산)의 유일한
// 쓰기 경로. 2026-07-19, PROJECT_BOARD.md 게임화 하위카드 7번.
//
// 이 저장소에는 스케줄러(cron)가 없다(CLAUDE.md 규칙 밖 인프라 — Infra
// Head 영역, Engineering Head가 발명하지 않음) — 그래서 이 API는 "관리자가
// 반별로 버튼을 눌러 그 주 점수를 계산+저장"하는 수동 트리거 방식이다.
// AdminScreen.jsx의 WordKingPanel이 유일한 호출자.
//
// 신뢰 경계: 클라이언트는 classId와 adminPin만 보낸다. 점수 계산에 쓰이는
// 원시 데이터(입실시험 점수/XP)는 전부 서버가 DB에서 직접 조회하고,
// 계산 자체도 순수 함수(src/utils/wordKing.js, computeWeeklyWordKing)로
// 서버에서만 수행한다 — "클라이언트가 보낸 점수를 신뢰하지 마라"는
// api/submit-entrance-result.js/api/grant-xp.js와 같은 원칙의 이 도메인
// 적용. 입력 신호 자체도 둘 다 이미 서버 검증/서버 전용 쓰기 테이블에서만
// 가져온다(entrance_test_results — 이번 세션에 서버 재검증 도입 완료,
// xp_ledger — 애초에 서버 전용 쓰기): src/utils/wordKing.js 헤더 주석의
// "GAME_DESIGN.md §5 원안에서 의도적으로 벗어난 점" 참고.
//
// 관리자 재인증: PIN 재설정 등 다른 파괴적 관리자 액션과 같은 패턴
// (checkAdminReauth, api/_pinAuth.js) — Word King 계산 자체는 파괴적이진
// 않지만(기존 행을 덮어쓸 뿐, 원본 데이터는 건드리지 않음) 누구나 임의
// classId로 반복 호출하면 DB 부하를 유발할 수 있어(레이트리밋 일반화
// 원칙, GAME_DESIGN.md §11) 관리자 전용으로 막는다.
import { createClient } from '@supabase/supabase-js'
import { checkAdminReauth, supabaseAdminUrl, supabaseAdminKey } from './_pinAuth.js'
import { computeWeeklyWordKing, detectWordKingOutliers, getWeekPeriod, isValidClassId } from '../src/utils/wordKing.js'

const TABLE_MISSING_CODES = new Set(['42P01', 'PGRST205'])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!checkAdminReauth(req, res)) return

  const url = supabaseAdminUrl()
  const key = supabaseAdminKey()
  if (!url || !key) {
    res.status(500).json({ error: 'Server not configured: SUPABASE_URL / key missing' })
    return
  }

  const { classId } = req.body || {}
  if (!isValidClassId(classId)) {
    res.status(200).json({ ok: false, reason: 'invalid_class_id' })
    return
  }

  const supabase = createClient(url, key)
  const { periodStart, periodEnd } = getWeekPeriod(new Date())

  // 1) 이 반 학생 목록 — 이름 스냅샷도 함께 확보(테이블 저장용).
  const { data: students, error: studentsErr } = await supabase
    .from('students')
    .select('id, name')
    .eq('class_id', classId)
  if (studentsErr) {
    res.status(500).json({ error: studentsErr.message })
    return
  }
  if (!students || students.length === 0) {
    res.status(200).json({ ok: false, reason: 'no_students' })
    return
  }
  const studentIds = students.map((s) => s.id)
  const nameById = new Map(students.map((s) => [s.id, s.name]))

  // 2) 입실시험 정확도 — 이 반의 이번 기간 시험 id들을 먼저 구한 뒤,
  //    그 시험들의 결과(이미 서버 재채점된 값, api/submit-entrance-
  //    result.js)를 학생별로 합산한다.
  const { data: tests, error: testsErr } = await supabase
    .from('entrance_tests')
    .select('id')
    .eq('class_id', classId)
    .gte('date', periodStart)
    .lte('date', periodEnd)
  if (testsErr) {
    res.status(500).json({ error: testsErr.message })
    return
  }
  const testIds = (tests || []).map((t) => t.id)

  const accuracyByStudent = new Map()
  if (testIds.length > 0) {
    const { data: results, error: resultsErr } = await supabase
      .from('entrance_test_results')
      .select('student_id, score, total')
      .in('test_id', testIds)
    if (resultsErr) {
      res.status(500).json({ error: resultsErr.message })
      return
    }
    for (const r of results || []) {
      const prev = accuracyByStudent.get(r.student_id) || { correct: 0, total: 0 }
      prev.correct += Number(r.score) || 0
      prev.total += Number(r.total) || 0
      accuracyByStudent.set(r.student_id, prev)
    }
  }

  // 3) XP — xp_ledger는 이미 서버 전용 쓰기(api/grant-xp.js)라 클라이언트
  //    조작 경로가 없음. 이 기간에 발생한 이벤트만 합산.
  const periodStartIso = `${periodStart}T00:00:00.000Z`
  const periodEndIso = `${periodEnd}T23:59:59.999Z`
  const { data: xpRows, error: xpErr } = await supabase
    .from('xp_ledger')
    .select('student_id, amount, created_at')
    .in('student_id', studentIds)
    .gte('created_at', periodStartIso)
    .lte('created_at', periodEndIso)
  if (xpErr && !TABLE_MISSING_CODES.has(xpErr.code)) {
    res.status(500).json({ error: xpErr.message })
    return
  }
  const xpByStudent = new Map()
  for (const r of xpRows || []) {
    xpByStudent.set(r.student_id, (xpByStudent.get(r.student_id) || 0) + (Number(r.amount) || 0))
  }

  // 4) 서버 전용 순수 계산(src/utils/wordKing.js) — 클라이언트는 이 계산에
  //    전혀 관여하지 않는다.
  const inputs = students.map((s) => ({
    studentId: s.id,
    studentName: s.name,
    accuracyCorrect: accuracyByStudent.get(s.id)?.correct || 0,
    accuracyTotal: accuracyByStudent.get(s.id)?.total || 0,
    xpEarned: xpByStudent.get(s.id) || 0,
  }))
  const { champion, scores, classAverageAccuracy, eligibleCount } = computeWeeklyWordKing(inputs)
  const outliers = detectWordKingOutliers(inputs)

  // 5) 저장 — eligible(활동이 있었던) 학생만 스냅샷으로 남긴다. 활동이
  //    아예 없는 반은 저장할 행이 없으므로 그대로 반환만 한다(빈 반에
  //    "0등 챔피언" 같은 의미 없는 행을 만들지 않음).
  const rowsToSave = scores
    .filter((s) => s.rank !== null)
    .map((s) => ({
      class_id: classId,
      period_start: periodStart,
      period_end: periodEnd,
      student_id: s.studentId,
      student_name: nameById.get(s.studentId) || s.studentName || '',
      score: s.score,
      score_breakdown: {
        accuracyCorrect: s.accuracyCorrect,
        accuracyTotal: s.accuracyTotal,
        correctedAccuracy: s.correctedAccuracy,
        accuracyComponent: s.accuracyComponent,
        xpEarned: s.xpEarned,
        xpComponent: s.xpComponent,
        classAverageAccuracy,
      },
      rank_position: s.rank,
    }))

  if (rowsToSave.length > 0) {
    const { error: upsertErr } = await supabase
      .from('word_king_history')
      .upsert(rowsToSave, { onConflict: 'class_id,period_start,period_end,student_id' })
    if (upsertErr) {
      if (TABLE_MISSING_CODES.has(upsertErr.code)) {
        res.status(200).json({ ok: false, reason: 'table_missing' })
        return
      }
      res.status(500).json({ error: upsertErr.message })
      return
    }
  }

  res.status(200).json({
    ok: true,
    periodStart,
    periodEnd,
    champion: champion ? { studentId: champion.studentId, studentName: nameById.get(champion.studentId) || champion.studentName, score: champion.score } : null,
    scores: scores.map((s) => ({ studentId: s.studentId, studentName: nameById.get(s.studentId) || s.studentName, score: s.score, rank: s.rank })),
    eligibleCount,
    classAverageAccuracy,
    outliers,
  })
}
