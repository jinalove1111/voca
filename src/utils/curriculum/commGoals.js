import { STORY_ITEMS } from '../situation/storyEpisodes.js'
import { SITUATION_EXPRESSIONS } from '../situation/situationContent.js'

// 2026-10-08(223차) 자체 커리큘럼 — 의사소통 목표(communicative goals) × 레벨. 순수 모듈(DOM·네트워크 없음).
// 이 제품은 여러 학원에 파는 독립 과정이므로 과정 구조는 특정 상업 교재의 권·단원 배열이 아니라 우리 레벨·목표·주제로 정의한다.
// 기존 Speaking 문항(STORY_ITEMS)의 `func` 라벨 69종을 목표 13개에 정확히 한 번씩 배정한다(문항·영어·id 무변경).
// 설계·근거·출처 기록: docs/design/CURRICULUM_INDEPENDENCE_2026-10-08.md
export const LEVELS = [
  { level: 1, titleKo: '한마디로 말하기', descKo: '정해진 한 문장을 그대로 말해요' },
  { level: 2, titleKo: '바꿔 말하기', descKo: '같은 틀에 단어를 바꿔 넣어 말해요' },
  { level: 3, titleKo: '이어서 말하기', descKo: '이유·계획을 덧붙여 짧게 주고받아요' },
]

export const COMM_GOALS = [
  { id: 'greeting', titleKo: '인사·소개하기', descKo: '처음 만나 인사하고 나를 알리는 말', level: 1, funcs: ['greeting', 'introducing', 'self-introduction', 'asking-name'] },
  { id: 'thanking', titleKo: '감사·칭찬하기', descKo: '고마움과 칭찬, 응원을 전하는 말', level: 1, funcs: ['thanking', 'praise', 'encouragement', 'celebrating'] },
  { id: 'requesting', titleKo: '요청하기', descKo: '물건·허락·도움·다시 말하기를 부탁', level: 1, funcs: ['borrowing', 'asking-help', 'repeat', 'slowly', 'break', 'seat', 'command'] },
  { id: 'asking-info', titleKo: '궁금한 것 묻기', descKo: '뜻·철자·장소·사실을 묻고 확인하는 말', level: 1, funcs: ['asking', 'asking-place', 'meaning', 'spelling', 'checking', 'finding', 'location'] },
  { id: 'preferences', titleKo: '취향·느낌 말하기', descKo: '좋아하는 것과 느낀 점을 말하기', level: 2, funcs: ['interests', 'hobbies', 'music', 'colour', 'impressions'] },
  { id: 'describing', titleKo: '상황·기분 말하기', descKo: '기분, 문제, 일어난 일을 설명하기', level: 2, funcs: ['feelings', 'worry', 'stating-problem', 'explaining', 'reporting', 'reacting'] },
  { id: 'apologising', titleKo: '사과·수습하기', descKo: '실수를 인정하고 사과하고 정리하기', level: 2, funcs: ['apologising', 'mistake', 'cleaning'] },
  { id: 'suggesting', titleKo: '제안·동의하기', descKo: '함께 할 일을 제안하고 맞장구치기', level: 2, funcs: ['suggesting', 'agreeing', 'again', 'alternatives'] },
  { id: 'shopping', titleKo: '물건 사기', descKo: '예산·값·개수를 묻고 고르기', level: 2, funcs: ['budget', 'price', 'choosing', 'quantity', 'paying'] },
  { id: 'helping', titleKo: '도와주기·권하기', descKo: '도움과 먹을거리를 건네는 말', level: 2, funcs: ['offering', 'offering-help', 'offering-food', 'giving', 'tidying'] },
  { id: 'teamwork', titleKo: '함께 계획하기', descKo: '역할·차례·계획을 정하고 바꾸기', level: 3, funcs: ['roles', 'turns', 'order', 'asking-task', 'planning', 'changing-plans', 'promise'] },
  { id: 'inviting', titleKo: '초대·안내 쓰기', descKo: '행사의 날짜·시간·장소를 알리기', level: 3, funcs: ['event', 'inviting', 'date', 'time', 'place', 'closing'] },
  { id: 'hosting', titleKo: '손님 응대하기', descKo: '손님을 맞고 주문받고 안내하기', level: 3, funcs: ['welcoming', 'ordering', 'informing', 'waiting', 'directions', 'preparing'] },
]

// 기본 표현 5개(이야기 밖)의 목표
export const BASIC_GOAL = { hello: 'greeting', help: 'requesting', sorry: 'apologising', thanks: 'thanking', play: 'suggesting' }

const FUNC_TO_GOAL = Object.fromEntries(COMM_GOALS.flatMap((g) => g.funcs.map((f) => [f, g.id])))
export const goalIdForFunc = (func) => FUNC_TO_GOAL[func] || null
export const goalForItem = (item) => COMM_GOALS.find((g) => g.id === goalIdForFunc(item.func)) || null

// 목표에 속한 문항(이야기 문항 + 기본 표현). 선생님이 목표를 고르면 이 목록으로 수업과 연결한다(교재명 불필요)
export function itemsForGoal(goalId) {
  const story = STORY_ITEMS.filter((i) => goalIdForFunc(i.func) === goalId).map((i) => ({ kind: 'story', id: i.id, en: i.en, ko: i.ko, episode: i.episode, level: i.level }))
  const basic = SITUATION_EXPRESSIONS.filter((e) => BASIC_GOAL[e.id] === goalId).map((e) => ({ kind: 'basic', id: e.id, en: e.en, ko: e.ko, episode: null, level: 1 }))
  return [...basic, ...story]
}

export function listGoals() {
  return COMM_GOALS.map((g) => ({ ...g, levelKo: LEVELS.find((l) => l.level === g.level)?.titleKo || '', count: itemsForGoal(g.id).length }))
}

// 어느 목표에도 없는 func(검사·문서용 — 0이어야 한다)
export const unmappedFuncs = () => [...new Set(STORY_ITEMS.map((i) => i.func))].filter((f) => !FUNC_TO_GOAL[f])
