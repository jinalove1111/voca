import { Suspense, lazy } from 'react'
import { listTopics, topicById } from '../utils/situation/speakingTopics'
import paulSpeaking from '../assets/speaking/paul_speaking.png'
import miaGreet from '../assets/speaking/mia_greet.png'
import miaThink from '../assets/speaking/mia_think.png'
import miaSurprise from '../assets/speaking/mia_surprise.png'

// 2026-10-07(219차) Speaking 주제별 탐색 — 첫 화면(주제 카드) → 주제의 이야기 카드(짧은 제목·상황 한 줄·핵심 표현·연습 시작).
// 기존 이야기·문항·연습·시험·녹음을 그대로 연결만 한다(SpeakingPractice 루트가 setId와 모드를 바꾼다). 새 콘텐츠·새 저장 없음.
// 그림은 기존 에셋만: 1~3화는 한 문장 흐름의 장면(PencilCaseScene 정지), 나머지는 Paul 기준 그림 + 미아 포즈(회차별로 다르게).
const PencilCaseScene = lazy(() => import('./PencilCaseScene'))
const BIG = 'w-full min-h-[96px] px-4 py-4 rounded-3xl text-left btn-press card-shadow text-white bg-gradient-to-br'
const GRAD = { school: 'from-sky-400 to-blue-600', friends: 'from-pink-400 to-rose-500', food: 'from-amber-400 to-orange-500', shopping: 'from-emerald-400 to-teal-600', finding: 'from-violet-400 to-purple-600', feelings: 'from-cyan-400 to-sky-600' }
// 회차별 정지 장면(1~3화) 또는 미아 포즈(그 외) — 같은 필통 그림을 모든 카드에 붙이지 않는다
const THUMB = {
  ep01: { scene: 'whisper', still: 'loud' }, ep02: { scene: 'spoon', still: 'spoon' }, ep03: { scene: 'idea', still: 'suggest' },
  ep04: { mia: miaThink }, ep05: { mia: miaGreet }, ep06: { mia: miaSurprise }, ep07: { mia: miaThink }, ep08: { mia: miaThink }, ep09: { mia: miaGreet }, ep10: { mia: miaGreet },
}

function StoryThumb({ epId }) {
  const t = THUMB[epId]
  if (!t) return null
  if (t.scene) return <Suspense fallback={<div className="w-full aspect-[3/2] rounded-3xl bg-sky-50" />}><PencilCaseScene variant={t.scene} still={t.still} /></Suspense>
  return (
    <div data-testid="story-thumb" data-ep={epId} className="w-full aspect-[3/1] rounded-3xl bg-sky-50 flex items-end justify-around overflow-hidden px-2" aria-hidden="true">
      <img src={paulSpeaking} alt="" className="h-full w-auto object-contain object-bottom" />
      <img src={t.mia} alt="" className="h-full w-auto object-contain object-bottom" />
    </div>
  )
}

export default function SpeakingTopics({ topicId = null, onTopic, onStart, onKeyFlow, onAll, onBack }) {
  const topic = topicId ? topicById(topicId) : null

  if (topic) {
    return (
      <div data-testid="speaking-stories" data-topic={topic.id} className="min-h-screen p-4 pb-24">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex items-center gap-2 pt-2">
            <button data-testid="stories-back" onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 주제</button>
            <h1 className="text-xl font-black text-sky-700">{topic.emoji} {topic.titleKo}</h1>
          </div>
          <p className="text-sm text-gray-600">이야기를 골라 연습해요. 한 이야기에서 한 문장만 기억해도 좋아요.</p>
          {topic.stories.map((s) => (
            <div key={s.id} data-testid={`story-card-${s.id}`} className="bg-white rounded-3xl p-4 card-shadow space-y-3">
              <StoryThumb epId={s.id} />
              <p className="text-lg font-black text-gray-900">{s.n}화 {s.titleKo}</p>
              <p data-testid="story-line" className="text-base text-gray-700 break-keep">{s.lineKo}</p>
              <div className="space-y-1">
                <button data-testid={`story-start-${s.id}`} onClick={() => onStart(s.id)} className="w-full min-h-[52px] px-4 py-3 rounded-2xl font-black text-lg btn-press text-white bg-gradient-to-br from-sky-400 to-blue-600">🗣️ 연습 시작</button>
                <p className="text-xs text-gray-500 break-keep">이야기 속 문장들을 듣고 따라 말한 뒤, 한글만 보고 말해 봐요.</p>
              </div>
              {s.hasKeyFlow && (
                <div className="space-y-1">
                  <button data-testid={`story-key-${s.id}`} onClick={() => onKeyFlow(s.id)} className="w-full min-h-[52px] px-4 py-3 rounded-2xl font-black text-base btn-press text-emerald-800 bg-emerald-100">🧠 한 문장 이야기</button>
                  <p className="text-xs text-gray-500 break-keep">핵심 문장 하나만 그림을 보며 듣고, 영어를 숨기고 떠올려 말해요.</p>
                </div>
              )}
              {/* 220차: 핵심 표현(영어)은 접어 둔다 — 카드에서 답을 미리 보여 주지 않고, 열어 보는 아이에게만 */}
              <details className="rounded-2xl bg-amber-50 border-2 border-amber-200">
                <summary data-testid={`story-key-toggle-${s.id}`} className="min-h-[44px] px-4 py-2 flex items-center text-sm font-black text-amber-800 cursor-pointer list-none">💡 오늘 기억할 한 문장 보기</summary>
                <div className="px-4 pb-3">
                  <p data-testid="story-key" className="text-lg font-black text-gray-900">{s.keyEn}</p>
                  <p className="text-sm text-gray-600">{s.keyKo}</p>
                </div>
              </details>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="speaking-topics" className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-black text-sky-700 pt-2">말하기</h1>
        <p className="text-base font-black text-gray-800">어떤 이야기를 연습할까요?</p>
        {listTopics().map((t) => (
          <button key={t.id} data-testid={`topic-${t.id}`} onClick={() => onTopic(t.id)} className={`${BIG} ${GRAD[t.id] || 'from-sky-400 to-blue-600'}`}>
            <span className="block text-xl font-black">{t.emoji} {t.titleKo}</span>
            <span className="block text-sm font-bold opacity-90">{t.descKo} · 이야기 {t.stories.length}개</span>
          </button>
        ))}
        <button data-testid="speaking-topics-all" onClick={onAll} className="w-full min-h-[52px] px-4 py-3 rounded-2xl font-black text-base btn-press bg-white card-shadow text-gray-700">📚 전체 이야기 · 기본 표현 5개</button>
        <button data-testid="speaking-topics-home" onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
      </div>
    </div>
  )
}
