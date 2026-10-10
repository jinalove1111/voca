import { resolveChoice } from './grammarUnits.js'
import { sceneCards, isScenePractice } from './sceneMission.js'

// 2026-10-10 문법 단원을 "한 장에 하나씩" 보여 주기 위한 카드 목록(순수 함수, React·PNG 없음).
// 순서: 목표 → 예문 → 설명(줄마다) → 구조 → [비교] → 오류(항목마다) → 연습(선택·빈칸·순서·만들기, 문제마다) → 활용 → 마무리
export function buildDeck(unit, pilotUnits) {
  const ex = unit?.examples || []
  const p = unit?.practice || {}
  const d = []
  const add = (kind, stepKo, title, payload = {}, key = '') => d.push({ id: `${kind}${key === '' ? '' : '-' + key}`, kind, stepKo, title, ...payload })
  add('goal', '목표', '학습 목표', { titleKo: unit.titleKo, goalKo: unit.goalKo, situationKo: ex[0]?.ko, basicsUnitId: unit.basicsUnitId })
  const addScene = unit.scene?.mode === 'add' ? sceneCards(unit) : [] // add 모드: 설명 카드는 구조 뒤, 활동 카드는 오류 뒤(선택 앞)
  if (unit.scene && unit.scene.mode !== 'add') { // 그림 미션 단원: 장면 카드가 예문~활용을 대신한다(goal 다음 → 장면 카드 → summary)
    d.push(...sceneCards(unit))
    add('summary', '마무리', '학습 요약')
    return d
  }
  add('examples', '예문', '상황·예문', { examples: ex })
  ;(unit.explainKo || []).forEach((line, i) => add('explain', '설명', '쉬운 설명', { line, example: ex[i] || ex[0] }, i))
  add('structure', '구조', '문장 구조', { structure: unit.structure || [] })
  d.push(...addScene.filter((c) => c.slot === 'explain'))
  if (unit.compare) add('compare', '비교', '긍정·부정·의문 비교', { compare: unit.compare })
  ;(unit.errors || []).forEach((e, i) => add('error', '오류', '흔한 오류', { wrong: e.wrong, right: e.right, whyKo: e.whyKo }, i))
  d.push(...addScene.filter((c) => c.slot === 'practice'))
  resolveChoice(unit, pilotUnits).forEach((q, i) => add('choice', '연습 · 선택', '선택 연습', { q }, i))
  ;(p.blank || []).forEach((q, i) => add('blank', '연습 · 빈칸', '빈칸 연습', { q }, i))
  ;(p.order || []).forEach((q, i) => add('order', '연습 · 순서', '순서 연습', { q }, i))
  ;(p.build || []).forEach((q, i) => add('build', '연습 · 만들기', '문장 만들기', { q }, i))
  add('use', '활용', '직접 사용', { use: unit.use || null })
  add('summary', '마무리', '학습 요약')
  return d
}

export const deckSteps = (deck) => [...new Set(deck.map((c) => c.stepKo))]
export const isPractice = (c) => c.kind === 'choice' || c.kind === 'blank' || c.kind === 'order' || isScenePractice(c)
export const deckCounts = (deck) => ({ cards: deck.length, explain: deck.filter((c) => c.kind === 'explain').length, practice: deck.filter(isPractice).length, build: deck.filter((c) => c.kind === 'build').length })
export const cardIndexById = (deck, id) => deck.findIndex((c) => c.id === id)
