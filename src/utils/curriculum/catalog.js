import { COURSES, blocksForCourse, performanceById } from './courseModel.js'
import { SPEAKING_TOPICS, storyCard } from '../situation/speakingTopics.js'
import { STORY_EPISODES } from '../situation/storyEpisodes.js'
import { writingItemsForEpisode as writingItemsByNumber } from '../writing/writingItems.js'

// 2026-10-09(228차) 통합 진입 카탈로그 — 순수 모듈. Unit 데이터(units.js)는 lazy 청크라 여기서 import하지 않고 인자로 받는다.
// 이야기 회차(ep01~ep10)는 난이도 기준으로 "단계 하나"에만 놓는다(중복 없음). 전부 제안(proposed)이며 교사 검토 전이다.
// 근거: CURRICULUM_STAGES §6/§10.5. 학생 레벨 저장·자동 배정·자동 진급·자동 채점 없음 — 콘텐츠 분류 표시일 뿐이다.
export const EMPTY_LABEL_KO = '콘텐츠 준비 중'

const P = (block, speaking, writing, reasonKo) => ({ course: 'conversation', block, performance: { speaking, writing }, proposed: true, reasonKo })
export const EPISODE_PLACEMENT = {
  ep01: P('C1', 'basic', 'basic', '자기소개·자리·요청 한 문장'),
  ep02: P('C1', 'basic', 'basic', '빌리기·철자 묻기 한 문장'),
  ep03: P('C2', 'developing', null, '취향·제안을 묻고 답하기'),
  ep04: P('C5', 'expanding', null, '엉망이 된 일과 감정·이유 말하기'),
  ep05: P('C4', 'developing', 'developing', '가격·선택·값 치르기'),
  ep06: P('C3', 'developing', null, '물건 위치 묻고 찾기'),
  ep07: P('C6', 'expanding', null, '날짜·시간·장소를 정해 초대하기'),
  ep08: P('C5', 'expanding', null, '문제 상황 설명과 대안'),
  ep09: P('C4', 'developing', null, '주문·값 말하기'),
  ep10: P('C6', 'expanding', null, '예상 밖 상황에서 친구와 결정'),
}

// 분류 라벨만(회차를 복사하지 않는다)
export const topicsForEpisode = (epId) => SPEAKING_TOPICS.filter((t) => t.episodes.includes(epId)).map((t) => ({ id: t.id, emoji: t.emoji, titleKo: t.titleKo }))
const epNumber = (epId) => STORY_EPISODES.find((e) => e.id === epId)?.n
export const writingItemsForEpisode = (epId) => writingItemsByNumber(epNumber(epId))

const storyEntry = (epId) => {
  const card = storyCard(epId)
  const placement = EPISODE_PLACEMENT[epId]
  if (!card || !placement) return null
  return { kind: 'story', grammar: null, id: epId, card, placement, topics: topicsForEpisode(epId), writingItems: writingItemsForEpisode(epId), hasKeyFlow: card.hasKeyFlow }
}

// 문법은 과정이 아니라 각 Unit 안의 활동(kind 'grammar')이다 — 새 콘텐츠 없이 존재 여부·개수만 읽는다
export function grammarForUnit(unit) {
  const a = unit?.activities?.find((x) => x.kind === 'grammar')
  return a ? { titleKo: a.titleKo, noticingCount: unit.grammar?.noticing?.length || 0, itemCount: unit.grammar?.items?.length || 0 } : null
}

// 실제 Unit 먼저, 그 뒤 회차(n 순서). intent 'grammar'면 문법이 있는 Unit만(회차 제외)
export function listCatalog(units, courseId, blockId, { intent } = {}) {
  const us = (units || []).filter((u) => u.course === courseId && u.block === blockId).map((unit) => ({ kind: 'unit', id: unit.id, unit, grammar: grammarForUnit(unit) })).filter((e) => intent !== 'grammar' || e.grammar)
  if (intent === 'grammar') return us
  const ss = STORY_EPISODES.filter((e) => EPISODE_PLACEMENT[e.id]?.course === courseId && EPISODE_PLACEMENT[e.id].block === blockId).sort((a, b) => a.n - b.n).map((e) => storyEntry(e.id)).filter(Boolean)
  return [...us, ...ss]
}

export function catalogCounts(units, courseId, opts) {
  const out = {}
  for (const b of blocksForCourse(courseId)) out[b] = listCatalog(units, courseId, b, opts).length
  return out
}
export const courseCount = (units, courseId, opts) => Object.values(catalogCounts(units, courseId, opts)).reduce((a, b) => a + b, 0)

// 선택 복원용: Unit id 또는 회차 id
export function findEntry(units, id) {
  const unit = (units || []).find((u) => u.id === id)
  return unit ? { kind: 'unit', id: unit.id, unit } : storyEntry(id)
}

// 불변식: 회차는 한 곳에만, 알려진 과정·단계·수행 수준만, 모든 회차에 배치가 있어야 한다
export function placementErrors() {
  const errs = []
  const ids = Object.keys(EPISODE_PLACEMENT)
  for (const id of ids) {
    const p = EPISODE_PLACEMENT[id]
    if (!STORY_EPISODES.some((e) => e.id === id)) errs.push(`${id}: unknown episode`)
    if (!COURSES.some((c) => c.id === p.course && c.blocks.includes(p.block))) errs.push(`${id}: unknown course/block`)
    for (const k of ['speaking', 'writing']) if (p.performance?.[k] != null && !performanceById(p.performance[k])) errs.push(`${id}: unknown performance ${k}`)
  }
  if (new Set(ids).size !== ids.length) errs.push('duplicate placement')
  for (const e of STORY_EPISODES) if (!EPISODE_PLACEMENT[e.id]) errs.push(`${e.id}: no placement`)
  return errs
}
