import { useEffect, useMemo, useRef, useState } from 'react'
import { speak, stopSpeaking } from '../utils/speech'
import { SUPPORT_STAGES } from '../utils/curriculum/courseModel'
import { loadUnitRecords, markActivity, setSupportStage, activityState, nextActivityId } from '../utils/curriculum/unitRecords'
import { SPEAKER_KO, BTN } from './SpeakingPracticeItem'

// 2026-10-08(224차) 통합 과정 시범 Unit 화면(QA 전용) — 한 Unit의 활동을 설계안 §3 순서로 보여 주고, 현재 활동과 다음 행동을 한 화면에서 분명히 한다.
// 어휘·듣기·읽기·문법·복습은 이 파일의 작은 활동 화면, 말하기·쓰기는 기존 화면(KeySentenceFlow/연습·WritingPractice)으로 나갔다가 돌아온다.
// 기록은 기기 임시 저장(unitRecords, UUID 키)이며 completed·selfChecked만 켠다 — 점수·숙달·진급·교사 확인 없음. 음성은 기존 speak()(en-GB).
const safeStorage = () => { try { return window.localStorage } catch { return { getItem: () => null, setItem: () => {} } } }
const CARD = 'bg-white rounded-3xl p-5 card-shadow space-y-3'
const KIND_KO = { vocab: '어휘', listening: '듣기', reading: '읽기', speaking: '말하기', grammar: '문형', writing: '쓰기', review: '복습' }
const KIND_EMOJI = { vocab: '📖', listening: '👂', reading: '📄', speaking: '🎤', grammar: '🔍', writing: '✍️', review: '🔁' }

// 보기 고르기(규칙 평가 가능한 선택형) — 고른 뒤 맞음/다시 보기·근거 표시. 틀려도 점수 없음, 다시 고를 수 있음. correct는 숫자 또는 배열(대체 답 인정)
const isOk = (q, i) => (Array.isArray(q.correct) ? q.correct.includes(i) : i === q.correct)
function Choice({ q, idx, testid, onAnswered }) {
  const [picked, setPicked] = useState(null)
  const done = picked !== null
  return (
    <div data-testid={`${testid}-${idx}`} data-answered={done ? 'true' : 'false'} className="space-y-2">
      <p className="text-base font-black text-gray-900 break-keep">{idx + 1}. {q.promptKo}</p>
      <div className="flex flex-wrap gap-2">
        {q.options.map((o, i) => (
          <button key={o} data-testid={`${testid}-${idx}-opt-${i}`} onClick={() => { setPicked(i); onAnswered?.() }} aria-pressed={picked === i}
            className={`${BTN} text-base ${picked === i ? (isOk(q, i) ? 'bg-emerald-500 text-white' : 'bg-amber-200 text-gray-800') : 'bg-white card-shadow text-gray-700'}`}>{o}</button>
        ))}
      </div>
      {done && (
        <p data-testid={`${testid}-${idx}-why`} className="text-sm text-gray-700 break-keep">{isOk(q, picked) ? '맞아요. ' : '다시 보세요. '}{q.whyKo || ''}{q.evidence ? ` 근거: "${q.evidence}"` : ''}</p>
      )}
    </div>
  )
}

function TrueFalse({ q, idx, testid, onAnswered }) {
  const [picked, setPicked] = useState(null)
  return (
    <div data-testid={`${testid}-${idx}`} data-answered={picked === null ? 'false' : 'true'} className="space-y-2">
      <p className="text-base font-black text-gray-900 break-keep">{idx + 1}. {q.promptKo}</p>
      <div className="flex gap-2">
        {[true, false].map((v) => (
          <button key={String(v)} data-testid={`${testid}-${idx}-opt-${v ? 1 : 0}`} onClick={() => { setPicked(v); onAnswered?.() }} aria-pressed={picked === v}
            className={`${BTN} ${picked === v ? (v === q.answer ? 'bg-emerald-500 text-white' : 'bg-amber-200 text-gray-800') : 'bg-white card-shadow text-gray-700'}`}>{v ? '맞아요' : '틀려요'}</button>
        ))}
      </div>
      {picked !== null && <p data-testid={`${testid}-${idx}-why`} className="text-sm text-gray-700 break-keep">{picked === q.answer ? '맞아요. ' : '다시 보세요. '}근거: "{q.evidence}"</p>}
    </div>
  )
}

function VocabActivity({ unit }) {
  return (
    <div className={CARD}>
      <p className="text-sm font-black text-teal-700">이 상황에 꼭 필요한 말</p>
      <ul className="space-y-2">
        {unit.vocab.map((v) => (
          <li key={v.en} className="flex items-center justify-between gap-2">
            <span><span className="text-lg font-black text-gray-900">{v.en}</span> <span className="text-sm text-gray-600">{v.ko}</span></span>
            <button data-testid={`unit-vocab-listen-${v.en.replace(/[^a-z]/gi, '')}`} onClick={() => speak(v.en, { source: 'unit' })} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ListeningActivity({ unit, onAllAnswered }) {
  const [shown, setShown] = useState(false)
  const [answered, setAnswered] = useState(0)
  const L = unit.listening
  useEffect(() => { if (answered >= L.questions.length) onAllAnswered() }, [answered, L.questions.length, onAllAnswered])
  // 대화를 문장 TTS로 차례로 읽는다(기존 speak, 자동 재생 없음 — 버튼으로만)
  const playAll = () => { let i = 0; const next = () => { if (i < L.turns.length) speak(L.turns[i++].en, { source: 'unit', onEnd: next }) }; next() }
  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className="text-sm font-black text-teal-700">대화를 듣고, 폴에게 무엇이 필요한지 찾아요</p>
        <button data-testid="unit-listen-play" onClick={playAll} className={`${BTN} bg-sky-100 text-sky-700`}>🔊 대화 듣기</button>
        {shown ? (
          <div data-testid="unit-listen-script" className="space-y-1">
            {L.turns.map((t, i) => <p key={i} className="text-base text-gray-900"><span className="font-black">{SPEAKER_KO[t.speaker] || t.speaker}:</span> {t.en}</p>)}
          </div>
        ) : (
          <button data-testid="unit-listen-show" onClick={() => setShown(true)} className={`${BTN} bg-white card-shadow text-gray-700 text-base`}>글로 보기</button>
        )}
      </div>
      <div className={CARD}>
        {L.questions.map((q, i) => <Choice key={i} q={q} idx={i} testid="unit-listen-q" onAnswered={() => setAnswered((n) => n + 1)} />)}
      </div>
    </div>
  )
}

function ReadingActivity({ unit, onAllAnswered }) {
  const [answered, setAnswered] = useState(0)
  const R = unit.reading
  useEffect(() => { if (answered >= R.items.length) onAllAnswered() }, [answered, R.items.length, onAllAnswered])
  return (
    <div className="space-y-4">
      <div data-testid="unit-reading-text" className={CARD}>
        <p className="text-sm font-black text-teal-700">짧은 이야기</p>
        <p className="text-lg font-bold text-gray-900 leading-relaxed">{R.text}</p>
        <button data-testid="unit-reading-listen" onClick={() => speak(R.text, { source: 'unit' })} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
      </div>
      <div className={CARD}>
        {R.items.map((q, i) => (q.type === 'tf'
          ? <TrueFalse key={i} q={q} idx={i} testid="unit-reading-q" onAnswered={() => setAnswered((n) => n + 1)} />
          : <Choice key={i} q={q} idx={i} testid="unit-reading-q" onAnswered={() => setAnswered((n) => n + 1)} />))}
      </div>
    </div>
  )
}

function GrammarActivity({ unit, onAllAnswered }) {
  const [open, setOpen] = useState({})
  const [answered, setAnswered] = useState(0)
  const G = unit.grammar
  useEffect(() => { if (answered >= G.items.length) onAllAnswered() }, [answered, G.items.length, onAllAnswered])
  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className="text-sm font-black text-teal-700">문장을 잘 보세요</p>
        {G.noticing.map((n, i) => (
          <div key={i} data-testid={`unit-grammar-notice-${i}`} className="space-y-1">
            <p className="text-xl font-black text-gray-900">{n.en}</p>
            <p className="text-base font-bold text-gray-800 break-keep">{n.promptKo}</p>
            {open[i] ? <p data-testid={`unit-grammar-notice-${i}-answer`} className="text-sm text-gray-700 break-keep">{n.answerKo}</p>
              : <button data-testid={`unit-grammar-notice-${i}-open`} onClick={() => setOpen((o) => ({ ...o, [i]: true }))} className={`${BTN} bg-white card-shadow text-gray-700 text-base`}>생각한 뒤 확인</button>}
          </div>
        ))}
      </div>
      <div className={CARD}>
        {G.items.map((q, i) => <Choice key={i} q={q} idx={i} testid="unit-grammar-q" onAnswered={() => setAnswered((n) => n + 1)} />)}
      </div>
    </div>
  )
}

// 단어 단서(지원 단계 '단서로') — 누를 때만 물건 이름 하나를 보여 준다(문장 전체 아님)
function HintChip({ word, idx }) {
  const [shown, setShown] = useState(false)
  return shown
    ? <p data-testid={`unit-review-${idx}-hint`} className="text-sm font-bold text-amber-800">💡 단어 도움: {word}</p>
    : <button data-testid={`unit-review-${idx}-hint-btn`} onClick={() => setShown(true)} className={`${BTN} bg-amber-100 text-amber-800 text-base`}>💡 단어 도움</button>
}

// 복습·전이: 한국어 상황만 보고 말해 보기 → 확인 뒤 모범·대체 답. 공개 전 영어·음성 없음(회상 과제 규칙)
function ReviewActivity({ unit, onAllRevealed }) {
  const [revealed, setRevealed] = useState({})
  useEffect(() => { if (unit.review.every((_, i) => revealed[i])) onAllRevealed() }, [revealed, unit.review, onAllRevealed])
  return (
    <div className="space-y-4">
      {unit.review.map((r, i) => (
        <div key={i} data-testid={`unit-review-${i}`} data-revealed={revealed[i] ? 'true' : 'false'} className={CARD}>
          <p className="text-sm font-black text-amber-700">새 상황 {i + 1}</p>
          <p className="text-lg font-bold text-gray-900 break-keep">{r.situationKo}</p>
          <p className="text-sm text-gray-600">먼저 소리 내어 말해 보고, 그 다음에 확인해요.</p>
          {!revealed[i] && r.hintEn && <HintChip word={r.hintEn} idx={i} />}
          {revealed[i] ? (
            <div data-testid={`unit-review-${i}-answer`} className="space-y-1">
              <p className="text-sm font-black text-sky-700">이렇게 말할 수 있어요</p>
              <p className="text-xl font-black text-gray-900">{r.model}</p>
              <button data-testid={`unit-review-${i}-listen`} onClick={() => speak(r.model, { source: 'unit' })} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
              {r.alternatives.length > 0 && <p className="text-sm text-gray-600">이렇게 말해도 좋아요: {r.alternatives.join(' / ')}</p>}
            </div>
          ) : (
            <button data-testid={`unit-review-${i}-reveal`} onClick={() => setRevealed((o) => ({ ...o, [i]: true }))} className={`${BTN} bg-amber-500 text-white`}>답 확인</button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function UnitScreen({ unit, studentId, onBack, onSpeaking, onWriting }) {
  const storage = useMemo(safeStorage, [])
  const [records, setRecords] = useState(() => loadUnitRecords(storage, studentId))
  const [activeId, setActiveId] = useState(null)
  const headingRef = useRef(null)
  const ids = unit.activities.map((a) => a.id)
  const nextId = nextActivityId(records, unit.id, ids)
  const active = unit.activities.find((a) => a.id === activeId) || null
  useEffect(() => { headingRef.current?.focus() }, [activeId])
  useEffect(() => () => stopSpeaking(), [])
  const refresh = () => setRecords(loadUnitRecords(storage, studentId))
  const complete = (id) => { markActivity(storage, studentId, unit.id, id, { completed: true }); refresh() }
  const selfCheck = (id, v) => { markActivity(storage, studentId, unit.id, id, { selfChecked: v }); refresh() }
  const support = records[unit.id]?.support || { speaking: null, literacy: null }
  const pickSupport = (area, stageId) => { setSupportStage(storage, studentId, unit.id, area, stageId); refresh() }
  const open = (a) => { stopSpeaking(); if (a.kind === 'speaking') onSpeaking(a); else if (a.kind === 'writing') onWriting(a); else setActiveId(a.id) }
  const back = () => { stopSpeaking(); setActiveId(null) }

  if (active) {
    const st = activityState(records, unit.id, active.id)
    const onDone = () => { if (!st.completed) complete(active.id) }
    return (
      <div data-testid="unit-activity" data-activity={active.id} data-kind={active.kind} className="min-h-screen p-4 pb-24">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex items-center gap-2 pt-2">
            <button data-testid="unit-activity-back" onClick={back} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 단원</button>
            <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-teal-700 outline-none">{KIND_EMOJI[active.kind]} {active.titleKo}</h1>
          </div>
          <p className="text-sm text-gray-600 break-keep">{active.goalKo}</p>
          {active.kind === 'vocab' && <VocabActivity unit={unit} />}
          {active.kind === 'listening' && <ListeningActivity unit={unit} onAllAnswered={onDone} />}
          {active.kind === 'reading' && <ReadingActivity unit={unit} onAllAnswered={onDone} />}
          {active.kind === 'grammar' && <GrammarActivity unit={unit} onAllAnswered={onDone} />}
          {active.kind === 'review' && <ReviewActivity unit={unit} onAllRevealed={onDone} />}
          <div className={CARD}>
            {active.kind === 'vocab' ? (
              <button data-testid="unit-activity-done" onClick={() => { complete(active.id); back() }} className={`${BTN} w-full bg-gradient-to-br from-teal-400 to-emerald-600 text-white`}>다 봤어요 → 단원으로</button>
            ) : (
              <>
                <p data-testid="unit-activity-status" className="text-sm font-bold text-gray-700">{st.completed ? '이 활동을 끝냈어요.' : '문항을 모두 해 보면 끝나요.'}</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="자기 확인">
                  <button data-testid="unit-self-ok" onClick={() => selfCheck(active.id, true)} aria-pressed={st.selfChecked} className={`${BTN} text-base ${st.selfChecked ? 'bg-sky-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>🙂 할 수 있었어요</button>
                  <button data-testid="unit-self-hard" onClick={() => selfCheck(active.id, false)} aria-pressed={!st.selfChecked} className={`${BTN} text-base ${!st.selfChecked ? 'bg-sky-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>🌱 아직 어려워요</button>
                </div>
                <button data-testid="unit-activity-return" onClick={back} className={`${BTN} w-full bg-white card-shadow text-gray-700`}>← 단원으로</button>
              </>
            )}
            <p className="text-xs text-gray-500 break-keep">자기 확인은 내 느낌 기록이에요. 선생님 확인은 수업에서 받아요 — 이 앱은 확인 기록을 저장하지 않아요.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="unit-screen" data-unit={unit.id} data-next={nextId || 'done'} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="unit-home" onClick={() => { stopSpeaking(); onBack() }} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-teal-700 outline-none">오늘의 학습</h1>
        </div>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 space-y-1">
          <p className="text-sm font-black text-amber-700">{unit.courseKo} · {unit.block} · {unit.goalTitleKo}</p>
          <p data-testid="unit-title" className="text-xl font-black text-gray-900">{unit.titleKo}</p>
          <p className="text-base text-gray-800 break-keep">{unit.situationKo}</p>
        </div>
        {nextId ? (
          <button data-testid="unit-next" onClick={() => open(unit.activities.find((a) => a.id === nextId))} className="w-full min-h-[64px] px-4 py-4 rounded-3xl text-left btn-press card-shadow text-white bg-gradient-to-br from-teal-400 to-emerald-600">
            <span className="block text-sm font-bold opacity-90">다음 활동</span>
            <span className="block text-xl font-black">{KIND_EMOJI[unit.activities.find((a) => a.id === nextId).kind]} {unit.activities.find((a) => a.id === nextId).titleKo}</span>
          </button>
        ) : (
          <div data-testid="unit-all-done" className="bg-white rounded-3xl p-4 card-shadow"><p className="text-base font-black text-gray-900">이 단원의 활동을 모두 해 봤어요. 다음 수업에서 선생님과 확인해요.</p></div>
        )}
        <ol className="space-y-2">
          {unit.activities.map((a, i) => {
            const st = activityState(records, unit.id, a.id)
            return (
              <li key={a.id}>
                <button data-testid={`unit-act-${a.id}`} data-completed={st.completed ? 'true' : 'false'} onClick={() => open(a)} className={`w-full text-left min-h-[56px] px-4 py-3 rounded-2xl btn-press card-shadow ${a.id === nextId ? 'bg-emerald-50 border-2 border-emerald-300' : 'bg-white'}`}>
                  <span className="text-base font-black text-gray-900">{i + 1}. {KIND_EMOJI[a.kind]} {KIND_KO[a.kind]} — {a.titleKo}</span>
                  <span className="block text-xs text-gray-500">{st.completed ? (st.selfChecked ? '끝냈어요 · 할 수 있었어요' : '끝냈어요') : a.id === nextId ? '다음 활동' : '아직'}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <div className={CARD}>
          <p className="text-sm font-black text-gray-800">오늘 도움 정도 (영어 수준이 아니라 도움의 양이에요)</p>
          {[['speaking', '말하기'], ['literacy', '읽기·쓰기']].map(([area, ko]) => (
            <div key={area} className="space-y-1">
              <p className="text-xs font-bold text-gray-600">{ko}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`${ko} 도움 정도`}>
                {SUPPORT_STAGES.map((s) => (
                  <button key={s.id} data-testid={`unit-support-${area}-${s.id}`} onClick={() => pickSupport(area, s.id)} aria-pressed={support[area] === s.id}
                    className={`min-h-[44px] px-3 py-2 rounded-2xl font-black text-sm btn-press ${support[area] === s.id ? 'bg-teal-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>{s.titleKo}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p data-testid="unit-storage-note" className="text-xs text-gray-500 break-keep">기록은 이 기기에만 임시로 저장되고 선생님에게 자동 전송되지 않아요. 활동을 끝낸 것이 점수나 진급은 아니에요.</p>
      </div>
    </div>
  )
}
