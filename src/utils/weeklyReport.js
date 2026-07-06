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
