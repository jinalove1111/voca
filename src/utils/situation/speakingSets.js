import { SITUATION_EXPRESSIONS, sceneFor } from './situationContent.js'
import { STORY_EPISODES, STORY_ITEMS } from './storyEpisodes.js'
import { UUID_RE } from './situationStore.js'

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
      const scene = { id: i.id, situationKo: i.situationKo, pencil: i.pencilScene || null }
      return { id: i.id, exprId: i.id, en: i.en, ko: i.ko, practiceScene: scene, examScene: scene, roleKo: i.roleKo, reply: i.reply }
    })
}

export const setLabel = (setId) => listSets().find((s) => s.id === setId)?.labelKo || ''

// 오늘 기억할 한 문장(QA 전용) — 기본 세트와 해당 없는 회차는 null
export const keySentenceFor = (setId) => STORY_EPISODES.find((e) => e.id === setId)?.keySentence || null

// 2026-10-05 Speaking 진입 시 고를 세트 — 첫 방문은 오늘의 이야기(2화 시범), 학생이 다른 세트를 고르면 그 선택을 기억한다.
// 기기 localStorage, 키에는 students.id(UUID)만(규칙 4). 저장 실패·잘못된 값·UUID 아님 → 기본값(화면은 계속 동작)
export const DEFAULT_SET_ID = 'ep02'
export const lastSetKey = (studentId) => (UUID_RE.test(studentId || '') ? `paulEasyVoca_speakingSet_${studentId}` : null)
export function loadLastSet(storage, studentId) {
  const key = lastSetKey(studentId)
  try {
    const v = key ? storage.getItem(key) : null
    return listSets().some((s) => s.id === v) ? v : DEFAULT_SET_ID
  } catch { return DEFAULT_SET_ID }
}
export function saveLastSet(storage, studentId, setId) {
  const key = lastSetKey(studentId)
  if (!key || !listSets().some((s) => s.id === setId)) return false
  try { storage.setItem(key, setId); return true } catch { return false }
}
