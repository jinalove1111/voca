// wordLibrary.js의 localIsoDateStr()과 완전히 동일한 로직을 여기 그대로
// 복제(공용 함수로 import하지 않음) — 이 파일은 원래 "의존성 0개, 어떤
// 번들링도 없이 바로 node로 실행 가능"이 불변조건이었다
// (scripts/testWeeklyReport.mjs 헤더 참고). wordLibrary.js는
// import.meta.env/Supabase를 물고 있어서 plain Node가 못 읽는데, 여기서
// import 한 줄만 추가해도 그 불변조건이 깨져서 테스트가 번들링 없이는
// 아예 못 돌게 된다(2026-07-10 밤에 실제로 이걸로 회귀 한 번 만들었다가
// 바로 잡음). 로직 자체가 4줄짜리 순수 함수라 복제 비용이 낮음 — DRY보다
// "테스트를 계속 가장 단순하게 실행 가능한 상태로 유지" 쪽을 택함.
function localIsoDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 2026-07-10 — AdminScreen.jsx(관리자 대시보드)와 ParentScreen.jsx(학부모
// 화면) 둘 다 fetchDashboardData()가 반환한 원본 row(progress + dailyRows)
// 에서 정확히 같은 파생값(오늘 공부 여부/숙제완료/퀴즈정답률/많이틀린단어
// 등)을 계산해야 한다. 예전엔 이 계산이 AdminScreen.jsx 안에만 있었는데,
// 화면이 하나 더 생기면서 그대로 복붙하면 나중에 한쪽만 고치고 다른 쪽은
// 안 고쳐서 "관리자 화면과 학부모 화면 숫자가 다르다" 같은 버그가 생길
// 위험이 있다(오늘 밤 이미 캘린더/관리자 화면 사이에서 겪은 것과 같은
// 클래스). 그래서 공용 utils로 옮겨 두 화면이 항상 같은 함수를 쓰게 함.
// 순수 함수 — 새 Supabase 조회 없음, 이미 받아온 데이터만 가공.
export function computeStudentStats(r, wordStatusSummary = {}) {
  const today = r.dailyRows.find(d => d.date === localIsoDateStr())
  // "오늘 공부함" 기준은 categories_completed > 0이 아니라 오늘 날짜 row
  // 존재 여부다 — 단어 하나만 봐도(카테고리 미완료) 로컬 history는 이미
  // 오늘 기록을 만들고 그게 그대로 동기화되므로, row가 있다는 것 자체가
  // "동기화된 활동이 있었다"는 뜻이다(2026-07-10 관리자 대시보드 버그 수정 참고).
  const studiedToday = !!today
  const homeworkDone = (today?.categories_completed || 0) >= 4
  const last7 = r.dailyRows.slice(0, 7)
  const quizCorrect = r.dailyRows.reduce((s, d) => s + (d.quiz_correct || 0), 0)
  const quizTotal = r.dailyRows.reduce((s, d) => s + (d.quiz_total || 0), 0)
  const quizAccuracy = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : null
  const pronAttempts = r.dailyRows.reduce((s, d) => s + (d.pronunciation_attempts || 0), 0)
  const missCount = {}
  r.dailyRows.forEach(d => (d.missed_word_ids || []).forEach(id => { missCount[id] = (missCount[id] || 0) + 1 }))
  const topMissed = Object.entries(missCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const ws = (r.studentId && wordStatusSummary[r.studentId]) || { known: 0, unknown: 0, skipped: 0, mastered: 0 }
  return { today, studiedToday, homeworkDone, last7, quizCorrect, quizTotal, quizAccuracy, pronAttempts, topMissed, ws }
}

// v1.3 "학부모에게 보낼 수 있는 요약 문구" — 규칙 기반 템플릿으로만 생성
// (AI API 비용 없음, 프로젝트 표준 원칙: 무료로 가능한 방법을 우선 사용).
// AdminScreen.jsx의 대시보드가 이미 계산해둔 최근 7일치 수치를 그대로
// 받아 문장으로 조립만 함. 순수 함수 — Supabase/React 의존성 없음.
export function buildWeeklyReport({ name, last7, quizAccuracy, quizCorrect, quizTotal, pronAttempts, progress, topMissed, wordLookup }) {
  const totalDays = last7.length
  const doneDays = last7.filter(d => d.categories_completed >= 4).length
  const good = []
  const improve = []

  if (totalDays > 0 && doneDays === totalDays) good.push('최근 학습일에 빠짐없이 숙제(오늘의 미션)를 완료했어요!')
  else if (doneDays > 0) good.push(`최근 ${totalDays}일 중 ${doneDays}일 숙제를 완료했어요.`)

  if ((progress?.streak || 0) >= 7) good.push(`연속 ${progress.streak}일째 꾸준히 공부하고 있어요!`)
  else if ((progress?.streak || 0) >= 3) good.push(`연속 ${progress.streak}일째 공부 중이에요.`)

  if (quizAccuracy !== null && quizAccuracy >= 80) good.push(`퀴즈 정답률이 ${quizAccuracy}%로 아주 높아요!`)
  if (pronAttempts >= 10) good.push(`발음 연습을 ${pronAttempts}번이나 열심히 했어요!`)
  if (good.length === 0) good.push('꾸준히 공부하려고 노력하고 있어요.')

  if (totalDays > 0 && doneDays < totalDays) improve.push(`숙제를 안 한 날이 ${totalDays - doneDays}일 있었어요.`)
  if (quizAccuracy !== null && quizAccuracy < 60) improve.push(`퀴즈 정답률(${quizAccuracy}%)을 더 올려볼 필요가 있어요.`)
  if (topMissed.length > 0) {
    const names = topMissed.slice(0, 3).map(([slug]) => wordLookup[slug]?.word || slug).join(', ')
    improve.push(`자주 틀리는 단어(${names})는 집에서 한 번 더 복습해주세요.`)
  }
  if (improve.length === 0) improve.push('특별히 부족한 점은 없어요. 아주 잘하고 있어요!')

  return [
    `${name} 학생 주간 학습 리포트`,
    '',
    '📚 이번 주 학습 현황',
    `- 숙제 완료: ${doneDays}/${totalDays}일`,
    `- 연속 학습: ${progress?.streak ?? 0}일째`,
    `- 누적 별: ${progress?.total_stars ?? 0}개 · 클리어한 단어: ${progress?.cleared_count ?? 0}개`,
    quizTotal > 0 ? `- 퀴즈: ${quizCorrect}/${quizTotal}문제 정답 (${quizAccuracy}%)` : '- 퀴즈: 최근 기록 없음',
    '',
    '✅ 잘한 점',
    ...good.map(p => `- ${p}`),
    '',
    '💪 조금 더 노력하면 좋은 점',
    ...improve.map(p => `- ${p}`),
    '',
    '선생님이 항상 응원하고 있어요! 🌟',
  ].join('\n')
}
