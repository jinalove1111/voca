// 폴의 기억(Paul Memory, 2026-07-22, 애착 시스템) — 템플릿 기반 안전 기억.
// v2(Paul Town, 2026-07-22): 템플릿 6종 → 18종 확장. 시그니처는 그대로
// (pickPaulMemory(stats, ctx, now) — 기존 호출부 Dashboard.jsx 무변경 호환).
//
// 폴이 학생의 실제 학습 데이터를 "기억"해서 한마디 건넨다. AI 호출 없음
// (저장소 헌법 규칙 7 — 무료 대안 우선), 전부 결정론적 템플릿.
//
// 진실성 원칙(운영자 지시 그대로): 존재하지 않는 데이터를 기억하는 척
// 절대 하지 않는다. 각 템플릿은 자기가 필요로 하는 데이터가 실제로
// 있을 때만 후보가 되고, 아무 데이터도 없으면 정직한 폴백 인사만 한다.
// 예: "어제 어려웠던 단어"는 history[어제].missedWordIds가 실존할 때만,
// "돌아온 것 환영"은 실제 공백일 수를 계산할 수 있을 때만 말한다.
// 스트릭 격려는 죄책감 언어 금지 — "왜 안 왔어" 류의 문장은 쓰지 않는다.
// "이번 달" 주장은 history가 실제로 월 단위 집계를 지원하는 값(학습일)
// 에만 하고, 월별 창을 낼 수 없는 값(마스터 수 — wordStatus에 시각 없음)
// 은 누적 총계로만 정직하게 말한다.
//
// 출력은 {id, text, emoji} 하나 — Dashboard가 한 줄로 보여준다. 우선순위
// 배열에서 가장 먼저 조건을 충족한 템플릿이 선택된다(결정론 — 같은
// 데이터면 항상 같은 한마디. 무작위 없음).
import { gardenPlots } from './worldProgress.js'

const yesterdayKey = (now) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return d.toDateString()
}

// 전체 템플릿 id 목록 — 하네스가 "템플릿 수 ≥ 15"를 단언하는 진실 원천.
// (한 후보 함수가 데이터 유무에 따라 두 id 중 하나를 내는 경우 둘 다 나열)
export const PAUL_MEMORY_TEMPLATE_IDS = [
  'comeback',
  'textbook-complete',
  'unit-complete',
  'new-hat',
  'yesterday-hard-word',
  'yesterday-hard-count',
  'spelling-improved',
  'improved-word',
  'improved-count',
  'week-improved',
  'yesterday-effort',
  'garden-tree',
  'garden-flower',
  'month-days',
  'mastered-total',
  'streak-going',
  'total-growth',
  'fallback-new',
]

/**
 * @param stats deriveAttachmentStats 결과
 * @param ctx {
 *   wordTextById: Map(slug -> 표시 단어),
 *   studentName,
 *   completedUnits: [{unitId, unitName}]   — useAttachment가 구성(밀스톤과 동일 형태),
 *   completedTextbooks: [{classId, className}],
 *   recentHatName: string                  — 방금 획득한 모자 이름(획득 순간에만 존재),
 * }
 *   각 필드가 없으면 해당 템플릿은 후보에서 빠진다(정직 폴백 원칙).
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
    // 2) 교재 완주 — ctx.completedTextbooks 실존 시에만(밀스톤과 같은 원천)
    () => {
      const books = Array.isArray(ctx.completedTextbooks) ? ctx.completedTextbooks : []
      if (books.length === 0) return null
      const b = books[books.length - 1]
      return { id: 'textbook-complete', emoji: '🏆', text: `${b.className} 교재를 끝까지 해냈어요! 폴은 이 순간을 영원히 기억할 거예요.` }
    },
    // 3) 유닛 완주 — ctx.completedUnits 실존 시에만
    () => {
      const units = Array.isArray(ctx.completedUnits) ? ctx.completedUnits : []
      if (units.length === 0) return null
      const u = units[units.length - 1]
      return { id: 'unit-complete', emoji: '🎓', text: `${u.unitName}의 단어를 전부 클리어한 거, 폴이 기억하고 있어요. 정말 대단해요!` }
    },
    // 4) 새 모자 획득 — 획득 순간에만 ctx.recentHatName이 존재
    () => {
      if (!ctx.recentHatName) return null
      return { id: 'new-hat', emoji: '🎩', text: `새로 얻은 ${ctx.recentHatName}, 정말 잘 어울려요! 열심히 공부해서 받은 모자라 더 멋져요.` }
    },
    // 5) 어제 어려웠던 단어 — history[어제].missedWordIds 실존 시에만
    () => {
      const missed = Array.isArray(yesterday?.missedWordIds) ? yesterday.missedWordIds : []
      if (missed.length === 0) return null
      const t = wordText(missed[0])
      return t
        ? { id: 'yesterday-hard-word', emoji: '🤔', text: `어제 "${t}" 단어가 조금 어려웠죠? 오늘 다시 만나면 분명 맞힐 수 있어요!` }
        : { id: 'yesterday-hard-count', emoji: '🤔', text: `어제 어려웠던 단어 ${missed.length}개, 오늘 다시 도전해봐요!` }
    },
    // 6) 받아쓰기 극복 — 복습 큐에 올랐던 단어가 지금은 극복된 경우에만
    //    (improvedWordIds ∩ 현재 spellingReviewQueue — 둘 다 실데이터)
    () => {
      const queueIds = new Set(
        (Array.isArray(stats.spellingReviewQueue) ? stats.spellingReviewQueue : [])
          .map((q) => (typeof q === 'object' ? q.wordId : q))
          .filter(Boolean),
      )
      const improvedFromSpelling = stats.improvedWordIds.filter((wid) => queueIds.has(wid))
      if (improvedFromSpelling.length === 0) return null
      const t = wordText(improvedFromSpelling[improvedFromSpelling.length - 1])
      return t
        ? { id: 'spelling-improved', emoji: '✍️', text: `받아쓰기에서 어려웠던 "${t}", 이제 잘 쓰게 됐어요. 연습한 만큼 늘었네요!` }
        : { id: 'spelling-improved', emoji: '✍️', text: `받아쓰기에서 어려웠던 단어 ${improvedFromSpelling.length}개를 이제 잘 쓰게 됐어요!` }
    },
    // 7) 극복한 단어 — 예전에 여러 번 틀렸는데 지금은 완전히 아는 단어
    () => {
      if (stats.improvedWordIds.length === 0) return null
      const t = wordText(stats.improvedWordIds[stats.improvedWordIds.length - 1])
      return t
        ? { id: 'improved-word', emoji: '💪', text: `예전에 어려워했던 "${t}"를 이제 완전히 알게 됐어요. 폴은 다 기억하고 있어요!` }
        : { id: 'improved-count', emoji: '💪', text: `어려워했던 단어 ${stats.improvedWordIds.length}개를 극복했어요. 폴은 다 지켜봤답니다!` }
    },
    // 8) 지난주보다 나아짐 — 두 주 모두 실제 퀴즈 기록이 있을 때만 비교
    () => {
      const tw = stats.thisWeek, lw = stats.lastWeek
      if (tw.quizTotal < 5 || lw.quizTotal < 5) return null // 표본이 너무 적으면 비교 주장 안 함
      const twAcc = tw.quizCorrect / tw.quizTotal
      const lwAcc = lw.quizCorrect / lw.quizTotal
      if (twAcc <= lwAcc) return null
      return { id: 'week-improved', emoji: '📈', text: `이번 주 퀴즈 정답률이 지난주보다 올랐어요! 실력이 진짜로 늘고 있어요.` }
    },
    // 9) 어제 새로 배운 양 — history[어제] 실존 시에만
    () => {
      if (!yesterday?.studied) return null
      const stars = Number(yesterday.starsEarned) || 0
      if (stars <= 0) return null
      return { id: 'yesterday-effort', emoji: '⭐', text: `어제도 별 ${stars}개를 모았죠? 폴은 어제의 노력을 기억해요. 오늘도 화이팅!` }
    },
    // 10) 정원 성장 — clearedCount 임계 파생(worldProgress gardenPlots 재사용,
    //     별도 저장 없음). 나무 > 꽃 순서로 더 큰 성장을 먼저 말한다.
    () => {
      const plots = gardenPlots(stats)
      const trees = plots.filter((p) => p.stage === 'tree').length
      if (trees > 0) return { id: 'garden-tree', emoji: '🌳', text: `네 정원에 나무가 ${trees}그루나 자랐어요. 전부 네가 배운 단어들이 키운 거예요!` }
      const flowers = plots.filter((p) => p.stage === 'flower').length
      if (flowers > 0) return { id: 'garden-flower', emoji: '🌸', text: `네 정원에 꽃이 ${flowers}송이 피었어요. 단어를 배울 때마다 정원이 자라요!` }
      return null
    },
    // 11) 이번 달 학습일 — history가 실제로 월 단위 창을 지원하는 값(학습일)
    () => {
      const monthDays = stats.studiedDays.filter(
        (d) => d.date.getFullYear() === now.getFullYear() && d.date.getMonth() === now.getMonth(),
      ).length
      if (monthDays < 5) return null
      return { id: 'month-days', emoji: '📅', text: `이번 달에 벌써 ${monthDays}일이나 같이 공부했어요. 폴은 그 하루하루를 다 기억해요!` }
    },
    // 12) 마스터 총계 — 월별 창을 낼 수 없는 값(wordStatus에 시각 없음)이라
    //     누적 총계로만 정직하게 말한다.
    () => {
      if (stats.masteredCount < 10) return null
      return { id: 'mastered-total', emoji: '🏅', text: `지금까지 단어 ${stats.masteredCount}개를 완전히 마스터했어요. 진짜 실력이에요!` }
    },
    // 13) 스트릭 격려 — 죄책감 언어 금지("왜 안 왔어" 류 문장 없음),
    //     이어지고 있는 사실만 따뜻하게.
    () => {
      if (stats.streak < 3) return null
      return { id: 'streak-going', emoji: '🔥', text: `요즘 ${stats.streak}일 연속으로 만나고 있죠? 함께하는 매일이 폴은 정말 좋아요.` }
    },
    // 14) 누적 성장 — 클리어 단어가 실제로 있을 때
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
