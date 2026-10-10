import { STORY_ITEMS } from '../situation/storyEpisodes.js'
import { SPEAKING_TOPICS } from '../situation/speakingTopics.js'

// 2026-10-07(222차) Writing 첫 버전 문항 — 순수 모듈. 기존 Speaking 문항(STORY_ITEMS)을 id로 가리키고,
// 쓰기용 한국어 안내(promptKo)·단어 도움(hintWords)·짧은 설명(noteKo)만 더한다. 영어 목표 표현·예시(en)·대체 답안(alternatives)·
// 상대 대답(reply)은 문항에서 읽는다(복사·변경 없음). 주제는 Speaking 주제(speakingTopics)와 같은 id를 쓴다.
// 먼저 학교생활(1·2화)·쇼핑(5화) 두 주제, 주제당 5문항. 다른 주제는 문항이 없으므로 listWritingTopics()에 나오지 않는다.
// 문구 검토: docs/design/WRITING_PRACTICE_2026-10-07.md
export const WRITING_ITEMS = [
  { id: 'w-s01-04', itemId: 's01-04', topic: 'school', promptKo: '제이미 옆에 빈 의자가 있어요. 제이미에게 자리 주인이 있는지 써 보세요.', hintWords: ['seat', 'free'], noteKo: '빈자리인지 물을 때 써요. 앉기 전에 먼저 물어보면 예의 바른 말이에요.', acceptNoteKo: 'Is anyone sitting here?로 써도 돼요.' },
  { id: 'w-s01-10', itemId: 's01-10', topic: 'school', promptKo: '내일 첫 시간이 미술이에요. 제이미에게 준비물을 물어보는 말을 써 보세요.', hintWords: ['need', 'tomorrow'], noteKo: '필요한 것을 물을 때 What do I need…?로 시작해요. 뒤에 때나 수업을 붙여요.', acceptNoteKo: 'What should I bring…?로 써도 돼요.' },
  { id: 'w-s02-02', itemId: 's02-02', topic: 'school', promptKo: '필통에 숟가락뿐이에요. 미아에게 내 상황을 알리는 말을 써 보세요.', hintWords: ["haven't got", 'pencil'], noteKo: '없다고 알릴 때 쓰는 말이에요. 영국에서는 have got을 자주 써요.', acceptNoteKo: "I don't have…로 써도 돼요." },
  { id: 'w-s02-03', itemId: 's02-03', topic: 'school', promptKo: '그릴 도구가 없어요. 미아에게 연필을 잠깐 쓰게 해 달라고 써 보세요.', hintWords: ['borrow', 'pencil'], noteKo: '잠깐 쓰고 돌려줄 때 borrow를 써요. 부탁이라 끝에 물음표를 붙여요.', acceptNoteKo: 'Could I…로 시작해도 돼요.' },
  { id: 'w-s02-08', itemId: 's02-08', topic: 'school', promptKo: '칠판이 지워졌어요. 미아에게 그 단어의 글자를 알려 달라고 써 보세요.', hintWords: ['how', 'spell'], noteKo: '철자를 물을 때 spell을 써요. 받아 적기 전에 꼭 쓸모 있는 질문이에요.', acceptNoteKo: 'Can you spell it for me?도 좋아요.' },
  { id: 'w-s05-01', itemId: 's05-01', topic: 'shopping', promptKo: '물건을 고르기 전이에요. 미아에게 예산이 얼마인지 알아보는 말을 써 보세요.', hintWords: ['how much', 'money'], noteKo: 'How much는 양이나 값을 물어요. 우리 모두의 돈이라 we를 써요.', acceptNoteKo: 'How much have we got?도 돼요.' },
  { id: 'w-s05-03', itemId: 's05-03', topic: 'shopping', promptKo: '가격표가 떨어졌어요. 가게 주인에게 값을 묻는 말을 써 보세요.', hintWords: ['how much', 'this'], noteKo: '물건을 들고 값을 물을 때 써요. 앞에 Excuse me를 붙이면 더 공손해요.', acceptNoteKo: 'How much does this cost?도 돼요.' },
  { id: 'w-s05-04', itemId: 's05-04', topic: 'shopping', promptKo: '리본이 너무 비싸요. 친구들에게 이 값으론 안 된다고 써 보세요.', hintWords: ['too', 'expensive'], noteKo: 'too는 "너무 지나치게"라는 느낌이에요. 질문이 아니라 내 생각을 말해요.', acceptNoteKo: "We can't buy that.도 돼요." },
  { id: 'w-s05-05', itemId: 's05-05', topic: 'shopping', promptKo: '리본은 꼭 필요해요. 가게 주인에게 값이 더 낮은 것이 있는지 써 보세요.', hintWords: ['cheaper', 'one'], noteKo: 'cheaper는 "더 싼"이에요. one은 앞에서 말한 물건을 대신해요.', acceptNoteKo: 'Do you have…?로 시작해도 돼요.' },
  // 225차: 통합 Unit "잃어버린 물건 위치 묻기" 전용(이야기 회차에 없는 문장 → inline). 주제는 Speaking '물건·장소 찾기'와 같은 id
  { id: 'w-u2-under', topic: 'finding', inline: { situationKo: '미술 시간이 끝났는데 폴의 가방이 안 보여요. 미아가 의자 밑에 있는 가방을 봤어요.', roleKo: '미아가 되어 폴에게 가방이 있는 곳을 알려 줘요.', en: "It's under the chair.", ko: '의자 밑에 있어.', alternatives: ['It is under the chair.', 'Your bag is under the chair.'], reply: null, episode: null },
    promptKo: '폴이 가방을 찾고 있어요. 가방이 의자 밑에 있다고 알려 주는 말을 써 보세요.', hintWords: ['under', 'chair'], noteKo: "있는 곳을 말할 때 It's 뒤에 위치 말(under·in·on)과 장소를 붙여요.", acceptNoteKo: 'It is …나 Your bag is …로 써도 돼요.' },
  // 227차: C2(발전) "거기 아니야, 저기는?" — 자기 문장 2~3개(부정 2 + 긍정 1). 모범은 비교용 하나일 뿐
  { id: 'w-c2-find', topic: 'finding', inline: { situationKo: '미술 시간 뒤 미아의 필통을 함께 찾았어요. 책상 밑에도 의자 위에도 없었고, 가방 안에 있었어요.', roleKo: '폴이 되어 어디에 없었고 어디에 있었는지 써요.', en: "It isn't under the desk. It isn't on the chair. It's in the bag!", ko: '책상 밑에 없어. 의자 위에 없어. 가방 안에 있어!', alternatives: ['It is not under the desk. It is not on the chair. It is in the bag.'], reply: null, episode: null },
    promptKo: '필통이 어디에 없고 어디에 있는지 2~3문장으로 써 보세요.', hintWords: ["isn't", 'in'], noteKo: "없는 곳은 It isn't …, 있는 곳은 It's …로 2~3문장 써요.", acceptNoteKo: "It is not / It's not도 맞아요. 순서는 달라도 돼요." },
  { id: 'w-s05-09', itemId: 's05-09', topic: 'shopping', promptKo: '바구니를 들고 계산대 앞이에요. 주인에게 값을 치르겠다고 써 보세요.', hintWords: ['pay', 'please'], noteKo: '계산할 준비가 됐을 때 써요. please를 붙이면 공손한 부탁이 돼요.', acceptNoteKo: 'Can I pay…?로 써도 돼요.' },
]

const itemById = (id) => STORY_ITEMS.find((i) => i.id === id)

// 화면용 문항: Speaking 문항의 상황·역할·영어·뜻·대체 답안·상대 대답을 그대로 붙인다. 원본이 없으면 null.
// 225차: 이야기 문항이 없는 통합 Unit 전용 문항은 `inline`(situationKo/roleKo/en/ko/alternatives/reply/episode)을 직접 가진다
export function writingItem(wId) {
  const w = WRITING_ITEMS.find((x) => x.id === wId)
  if (w && w.inline) return { ...w, ...w.inline, alternatives: w.inline.alternatives || [], reply: w.inline.reply || null }
  const src = w && itemById(w.itemId)
  if (!w || !src) return null
  return { ...w, situationKo: src.situationKo, roleKo: src.roleKo, en: src.en, ko: src.ko, alternatives: src.alternatives || [], reply: src.reply || null, episode: src.episode }
}

// 228차: 이야기 회차 번호(1~10)에 속한 Writing 문항(inline 전용 문항 제외). 통합 카탈로그가 쓴다
export const writingItemsForEpisode = (epNumber) => WRITING_ITEMS.filter((w) => w.itemId && itemById(w.itemId)?.episode === epNumber)

// Speaking 문항 id → Writing 문항(없으면 null). Speaking 연습 끝 화면의 [이 표현 써보기]가 쓴다
export const writingItemForSpeaking = (itemId) => { const w = WRITING_ITEMS.find((x) => x.itemId === itemId); return w ? writingItem(w.id) : null }

// 문항이 1개 이상인 주제만(빈 주제 노출 금지). 주제 이름·순서는 Speaking과 같다
export function listWritingTopics() {
  return SPEAKING_TOPICS.map((t) => ({ id: t.id, emoji: t.emoji, titleKo: t.titleKo, items: WRITING_ITEMS.filter((w) => w.topic === t.id).map((w) => writingItem(w.id)).filter(Boolean) }))
    .filter((t) => t.items.length > 0)
}

export const writingTopicById = (id) => listWritingTopics().find((t) => t.id === id) || null
