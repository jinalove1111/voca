// 폴의 기억(Paul Memory, 2026-07-22, 애착 시스템) — 템플릿 기반 안전 기억.
//
// 폴이 학생의 실제 학습 데이터를 "기억"해서 한마디 건넨다. AI 호출 없음
// (저장소 헌법 규칙 7 — 무료 대안 우선), 전부 결정론적 템플릿.
//
// 진실성 원칙(운영자 지시 그대로): 존재하지 않는 데이터를 기억하는 척
// 절대 하지 않는다. 각 템플릿은 자기가 필요로 하는 데이터가 실제로
// 있을 때만 후보가 되고, 아무 데이터도 없으면 정직한 폴백 인사만 한다.
// 예: "어제 어려웠던 단어"는 history[어제].missedWordIds가 실존할 때만,
// "돌아온 것 환영"은 실제 공백일 수를 계산할 수 있을 때만 말한다.
//
// 출력은 {id, text, emoji} 하나 — Dashboard가 한 줄로 보여준다. 우선순위
// 배열에서 가장 먼저 조건을 충족한 템플릿이 선택된다(결정론 — 같은
// 데이터면 항상 같은 한마디. 무작위 없음).

const yesterdayKey = (now) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return d.toDateString()
}

/**
 * @param stats deriveAttachmentStats 결과
 * @param ctx { wordTextById: Map(slug -> 표시 단어), studentName }
 *   wordTextById가 없으면 단어 이름이 필요한 템플릿은 건너뛴다(정직 폴백).
 */
export function pickPaulMemory(stats, ctx = {}, now = new Date()) {
  const wordText = (wid) => ctx.wordTextById?.get?.(wid) || null
  const yKey = yesterdayKey(now)
  const yesterday = stats.history?.[yKey]

  const candidates = [
    // 1) 오랜만에 돌아온 학생 — 제일 따뜻하게 맞아야 하는 순간
    () => {
      if (stats.absenceDays == null || stats.absenceDays < 7) return null
      return { id: 'comeback', emoji: '🤗', text: `${stats.absenceDays}일 만이네요! 다시 만나서 정말 반가워요. 오늘부터 다시 같이 해봐요!` }
    },
    // 2) 어제 어려웠던 단어 — history[어제].missedWordIds 실존 시에만
    () => {
      const missed = Array.isArray(yesterday?.missedWordIds) ? yesterday.missedWordIds : []
      if (missed.length === 0) return null
      const t = wordText(missed[0])
      return t
        ? { id: 'yesterday-hard-word', emoji: '🤔', text: `어제 "${t}" 단어가 조금 어려웠죠? 오늘 다시 만나면 분명 맞힐 수 있어요!` }
        : { id: 'yesterday-hard-count', emoji: '🤔', text: `어제 어려웠던 단어 ${missed.length}개, 오늘 다시 도전해봐요!` }
    },
    // 3) 극복한 단어 — 예전에 여러 번 틀렸는데 지금은 완전히 아는 단어
    () => {
      if (stats.improvedWordIds.length === 0) return null
      const t = wordText(stats.improvedWordIds[stats.improvedWordIds.length - 1])
      return t
        ? { id: 'improved-word', emoji: '💪', text: `예전에 어려워했던 "${t}"를 이제 완전히 알게 됐어요. 폴은 다 기억하고 있어요!` }
        : { id: 'improved-count', emoji: '💪', text: `어려워했던 단어 ${stats.improvedWordIds.length}개를 극복했어요. 폴은 다 지켜봤답니다!` }
    },
    // 4) 지난주보다 나아짐 — 두 주 모두 실제 퀴즈 기록이 있을 때만 비교
    () => {
      const tw = stats.thisWeek, lw = stats.lastWeek
      if (tw.quizTotal < 5 || lw.quizTotal < 5) return null // 표본이 너무 적으면 비교 주장 안 함
      const twAcc = tw.quizCorrect / tw.quizTotal
      const lwAcc = lw.quizCorrect / lw.quizTotal
      if (twAcc <= lwAcc) return null
      return { id: 'week-improved', emoji: '📈', text: `이번 주 퀴즈 정답률이 지난주보다 올랐어요! 실력이 진짜로 늘고 있어요.` }
    },
    // 5) 어제 새로 배운 양 — history[어제] 실존 시에만
    () => {
      if (!yesterday?.studied) return null
      const stars = Number(yesterday.starsEarned) || 0
      if (stars <= 0) return null
      return { id: 'yesterday-effort', emoji: '⭐', text: `어제도 별 ${stars}개를 모았죠? 폴은 어제의 노력을 기억해요. 오늘도 화이팅!` }
    },
    // 6) 누적 성장 — 클리어 단어가 실제로 있을 때
    () => {
      if (stats.clearedCount < 5) return null
      return { id: 'total-growth', emoji: '🌱', text: `지금까지 단어 ${stats.clearedCount}개를 클리어했어요. 하나하나 폴이 다 기억하고 있어요!` }
    },
  ]

  for (const fn of candidates) {
    const m = fn()
    if (m) return m
  }
  // 정직한 폴백 — 아직 기억할 데이터가 없다: 없는 기억을 지어내지 않는다
  return { id: 'fallback-new', emoji: '👋', text: '오늘부터 폴이 너의 성장을 하나하나 기억할게요. 같이 시작해봐요!' }
}
