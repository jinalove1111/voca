import { useEffect, useMemo, useRef, useState } from 'react'
import { speak } from '../utils/speech'
import { listWritingTopics, writingTopicById, writingItem } from '../utils/writing/writingItems'
import { loadDrafts, saveDraft, hasContent, sameSentence } from '../utils/writing/writingDrafts'
import { SPEAKER_KO, BTN } from './SpeakingPracticeItem'

// 2026-10-07(222차) Writing 첫 버전 — 주제(Speaking과 같은 주제·문항 id) → 문항 → 쓰기 흐름:
//   한국어 상황·목적 → 학생이 직접 쓰기(영어 예시 숨김, [도움 보기]로 단어만) → [예시와 비교] → 내 문장과 예시를 나란히 →
//   [내 문장 고치기](수정 전/후 구분) → 다음.
// 하지 않는 것: 자동 채점·정답/합격/숙달/문법 점수, AI API, DB·업로드. 예시는 "이렇게 쓸 수 있어요"일 뿐 유일한 정답이 아니다.
// 저장: 기기 localStorage(키 = students.id UUID)에 초안만 — 선생님에게 자동 전송되지 않는다(화면에 명시). '선생님 확인'은 안내만(기록 없음).
const safeStorage = () => { try { return window.localStorage } catch { return { getItem: () => null, setItem: () => {} } } }
const CARD = 'bg-white rounded-3xl p-5 card-shadow space-y-3'
const TA = 'w-full min-h-[88px] px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-sky-400 outline-none text-lg font-bold text-gray-900 resize-y'

function TopicList({ topics, onTopic, onBack }) {
  return (
    <div data-testid="writing-topics" className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-black text-teal-700 pt-2">문장 쓰기</h1>
        <p className="text-base font-black text-gray-800">말하기에서 연습한 표현을 직접 써 봐요.</p>
        {topics.map((t) => (
          <button key={t.id} data-testid={`writing-topic-${t.id}`} onClick={() => onTopic(t.id)}
            className="w-full min-h-[88px] px-4 py-4 rounded-3xl text-left btn-press card-shadow text-white bg-gradient-to-br from-teal-400 to-emerald-600">
            <span className="block text-xl font-black">{t.emoji} {t.titleKo}</span>
            <span className="block text-sm font-bold opacity-90">문장 {t.items.length}개</span>
          </button>
        ))}
        <p data-testid="writing-storage-note" className="text-xs text-gray-500 break-keep">✍️ 쓴 문장은 이 기기에 임시 저장되며 선생님에게 자동 전송되지 않아요.</p>
        <button data-testid="writing-home" onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
      </div>
    </div>
  )
}

function ItemList({ topic, drafts, onPick, onBack }) {
  return (
    <div data-testid="writing-items" data-topic={topic.id} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="writing-items-back" onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 주제</button>
          <h1 className="text-xl font-black text-teal-700">{topic.emoji} {topic.titleKo}</h1>
        </div>
        {topic.items.map((it, i) => {
          const d = drafts[it.id]
          return (
            <button key={it.id} data-testid={`writing-item-${it.id}`} onClick={() => onPick(it.id)} className="w-full text-left bg-white rounded-3xl p-4 card-shadow btn-press space-y-1">
              <p className="text-sm font-black text-teal-700">{i + 1}. {it.episode}화</p>
              <p className="text-base font-bold text-gray-900 break-keep">{it.promptKo}</p>
              {d && hasContent(d.first) && <p data-testid="writing-item-saved" className="text-xs text-gray-500">📝 쓴 문장 있음{d.compared ? ' · 예시와 비교했어요' : ''}</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 쓰기 흐름 한 문항. step: write(예시 숨김) → compare(예시 공개, 내 문장 유지) → revise(고치기)
function WriteFlow({ item, index, total, draft, onSave, onNext, onBack }) {
  // ← 목록: 비교 전에 쓰던 문장도 버리지 않고 보관(compared는 그대로 false)
  const [step, setStep] = useState(() => (draft?.compared ? 'compare' : 'write'))
  const [text, setText] = useState(draft?.first || '')
  const [revised, setRevised] = useState(draft?.revised || '')
  const [helped, setHelped] = useState(!!draft?.helped)
  const [showHelp, setShowHelp] = useState(false)
  const headingRef = useRef(null)
  useEffect(() => { headingRef.current?.focus() }, [item.id, step])
  const who = item.reply ? (SPEAKER_KO[item.reply.speaker] || item.reply.speaker) : null
  const canCompare = hasContent(text)
  const first = (draft?.compared ? draft.first : text) || ''
  const same = sameSentence(hasContent(revised) ? revised : first, item.en) // 고친 문장이 있으면 그것을 기준으로 표시(채점 아님)

  const help = () => { setShowHelp(true); setHelped(true); onSave({ helped: true }) }
  const compare = () => { if (!canCompare) return; onSave({ first: text.trim(), helped, compared: true }); setStep('compare') }
  const startRevise = () => { setRevised((r) => (hasContent(r) ? r : first)); setStep('revise') }
  const saveRevise = () => { if (!hasContent(revised)) return; onSave({ revised: revised.trim() }); setStep('compare') }

  return (
    <div data-testid="writing-flow" data-item={item.id} data-step={step} className="min-h-screen p-4 pb-40">
      {/* pb-40: 모바일 키보드가 올라와도 입력창·버튼이 가려지지 않도록(기존 WritingCoach와 같은 방식) */}
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="writing-back" onClick={() => { if (step === 'write' && hasContent(text)) onSave({ first: text.trim(), helped }); onBack() }} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 목록</button>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-teal-700 outline-none">문장 쓰기 {index + 1}/{total}</h1>
        </div>
        <div data-testid="writing-situation" className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 space-y-1">
          <p className="text-sm font-black text-amber-700">상황</p>
          <p className="text-lg font-bold text-gray-900 leading-relaxed break-keep">{item.situationKo}</p>
          <p data-testid="writing-prompt" className="text-base font-black text-amber-800 break-keep">✍️ {item.promptKo}</p>
        </div>

        {step === 'write' && (
          <div className={CARD}>
            <label htmlFor="writing-input" className="text-sm font-black text-teal-700">내 문장 (영어로 한 문장)</label>
            <textarea id="writing-input" data-testid="writing-input" value={text} onChange={(e) => setText(e.target.value)} rows={2} autoComplete="off" autoCapitalize="sentences" spellCheck={false} className={TA} placeholder="여기에 써 보세요" />
            {showHelp ? (
              <p data-testid="writing-help" className="text-base font-bold text-gray-700">💡 단어 도움: {item.hintWords.join(' · ')}</p>
            ) : (
              <button data-testid="writing-help-btn" onClick={help} className={`${BTN} bg-amber-100 text-amber-800 text-base`}>💡 도움 보기</button>
            )}
            <button data-testid="writing-compare" onClick={compare} disabled={!canCompare} className={`${BTN} w-full bg-gradient-to-br from-teal-400 to-emerald-600 text-white`}>예시와 비교하기</button>
            {!canCompare && <p className="text-xs text-gray-500">한 문장을 쓰면 비교할 수 있어요.</p>}
          </div>
        )}

        {step !== 'write' && (
          <>
            <div data-testid="writing-mine" className={CARD}>
              <p className="text-sm font-black text-teal-700">내가 쓴 문장{helped ? ' (도움 보고 썼어요)' : ' (혼자 썼어요)'}</p>
              <p data-testid="writing-first" className="text-lg font-black text-gray-900 break-words">{first}</p>
              {hasContent(revised) && step === 'compare' && (
                <>
                  <p className="text-sm font-black text-emerald-700">고친 문장</p>
                  <p data-testid="writing-revised" className="text-lg font-black text-gray-900 break-words">{revised}</p>
                </>
              )}
            </div>
            <div data-testid="writing-example" className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-5 space-y-2">
              <p className="text-sm font-black text-sky-700">이렇게 쓸 수 있어요 (예시)</p>
              <p data-testid="writing-example-en" className="text-xl font-black text-gray-900">{item.en}</p>
              <p className="text-base text-gray-600">{item.ko}</p>
              <button data-testid="writing-listen" onClick={() => speak(item.en, { source: 'writing' })} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
              {item.alternatives.length > 0 && <p data-testid="writing-alternatives" className="text-sm text-gray-600 break-words">이렇게 써도 좋아요: {item.alternatives.join(' / ')}</p>}
              <p data-testid="writing-note" className="text-sm text-gray-700 break-keep">{item.noteKo}</p>
              {item.acceptNoteKo && <p data-testid="writing-accept" className="text-sm text-gray-700 break-keep">{item.acceptNoteKo}</p>}
              {item.reply && who && <p data-testid="writing-reply" className="text-sm text-gray-700">{who}: {item.reply.en} <span className="text-gray-500">({item.reply.ko})</span></p>}
              <p data-testid="writing-same" className="text-xs text-gray-500">{same ? '예시와 같은 문장이에요.' : '예시와 다른 부분이 있나요? 뜻이 통하면 다른 말도 괜찮아요.'}</p>
            </div>
            {step === 'compare' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button data-testid="writing-revise" onClick={startRevise} className={`${BTN} bg-amber-500 text-white`}>✏️ 내 문장 고치기</button>
                  <button data-testid="writing-next" onClick={onNext} className={`${BTN} bg-white card-shadow text-gray-700`}>{index + 1 < total ? '다음 문장 →' : '목록으로'}</button>
                </div>
                <p data-testid="writing-teacher-note" className="text-xs text-gray-500 break-keep">✅ 예시와 비교했어요. 선생님 확인은 수업에서 받아요 — 이 앱은 확인 기록을 저장하지 않아요.</p>
              </div>
            ) : (
              <div className={CARD}>
                <label htmlFor="writing-revise-input" className="text-sm font-black text-emerald-700">고친 문장</label>
                <textarea id="writing-revise-input" data-testid="writing-revise-input" value={revised} onChange={(e) => setRevised(e.target.value)} rows={2} autoComplete="off" spellCheck={false} className={TA} />
                <div className="flex flex-wrap gap-2">
                  <button data-testid="writing-revise-save" onClick={saveRevise} disabled={!hasContent(revised)} className={`${BTN} bg-gradient-to-br from-teal-400 to-emerald-600 text-white`}>저장</button>
                  <button data-testid="writing-revise-cancel" onClick={() => setStep('compare')} className={`${BTN} bg-white card-shadow text-gray-700`}>취소</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// startItemId: Speaking [이 표현 써보기]로 들어온 문항(w-…) — 그 문항부터 열고, ← 목록은 onBack(원래 Speaking 위치)
// onBack: 링크(Speaking)로 들어온 문항의 ← 목록 → 원래 Speaking. onHome: 주제 화면의 ← 홈(항상 홈)
export default function WritingPractice({ studentId, startItemId = null, onBack, onHome }) {
  const storage = useMemo(safeStorage, [])
  const topics = useMemo(listWritingTopics, [])
  const startItem = startItemId ? writingItem(startItemId) : null
  const [topicId, setTopicId] = useState(startItem ? startItem.topic : null)
  const [itemId, setItemId] = useState(startItem ? startItem.id : null)
  const [drafts, setDrafts] = useState(() => loadDrafts(storage, studentId))
  const topic = topicId ? writingTopicById(topicId) : null
  const idx = topic && itemId ? topic.items.findIndex((x) => x.id === itemId) : -1
  const item = idx >= 0 ? topic.items[idx] : null

  const save = (patch) => { saveDraft(storage, studentId, itemId, patch); setDrafts(loadDrafts(storage, studentId)) }
  const next = () => { if (idx + 1 < topic.items.length) setItemId(topic.items[idx + 1].id); else setItemId(null) }

  if (item) return <WriteFlow key={item.id} item={item} index={idx} total={topic.items.length} draft={drafts[item.id]} onSave={save} onNext={next} onBack={() => (startItem && item.id === startItem.id ? onBack() : setItemId(null))} />
  if (topic) return <ItemList topic={topic} drafts={drafts} onPick={setItemId} onBack={() => setTopicId(null)} />
  return <TopicList topics={topics} onTopic={setTopicId} onBack={onHome || onBack} />
}
