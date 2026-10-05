import { SITUATION_EXPRESSIONS, sceneFor } from './situationContent.js'
import { STORY_EPISODES, STORY_ITEMS } from './storyEpisodes.js'

// 2026-10-04 Speaking 세트 — 기본 표현 5개 + 이야기 회차. 순수 모듈(DOM 없음).
// 정규화 항목: { id, exprId(저장 키), en, ko, practiceScene, examScene, roleKo|null, reply|null }
export const BASIC_SET_ID = 'basic'

export function listSets() {
  return [
    { id: BASIC_SET_ID, labelKo: '기본 표현 5개' },
    ...STORY_EPISODES.map((e) => ({ id: e.id, labelKo: `${e.n}화 ${e.titleKo}` })),
  ]
}

export function itemsForSet(setId) {
  const ep = STORY_EPISODES.find((e) => e.id === setId)
  if (!ep) {
    return SITUATION_EXPRESSIONS.map((e) => ({
      id: e.id, exprId: e.id, en: e.en, ko: e.ko,
      practiceScene: sceneFor(e.id, 'a'), examScene: sceneFor(e.id, 'b'), roleKo: null, reply: null,
    }))
  }
  return STORY_ITEMS.filter((i) => i.episode === ep.n)
    .sort((a, b) => a.order - b.order)
    .map((i) => {
      const scene = { id: i.id, situationKo: i.situationKo }
      return { id: i.id, exprId: i.id, en: i.en, ko: i.ko, practiceScene: scene, examScene: scene, roleKo: i.roleKo, reply: i.reply }
    })
}

export const setLabel = (setId) => listSets().find((s) => s.id === setId)?.labelKo || ''

// 오늘 기억할 한 문장(QA 전용) — 기본 세트와 해당 없는 회차는 null
export const keySentenceFor = (setId) => STORY_EPISODES.find((e) => e.id === setId)?.keySentence || null
