import { useEffect, useMemo, useRef, useState } from 'react'
import { speak, stopSpeaking } from '../utils/speech'
import { SUPPORT_STAGES, COURSES, CONVERSATION_BLOCKS, blocksForCourse, blockLabelKo, performanceById } from '../utils/curriculum/courseModel'
const CONV_BLOCK_META = (b) => CONVERSATION_BLOCKS.find((x) => x.id === b) || null
import { loadUnitRecords, markActivity, setSupportStage, activityState, nextActivityId } from '../utils/curriculum/unitRecords'
import { SPEAKER_KO, BTN, RecorderControls, BUSY } from './SpeakingPracticeItem'
import useLocalRecorder from '../hooks/useLocalRecorder'

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
          <button key={o} data-testid={`${testid}-${idx}-opt-${i}`} onClick={() => { if (picked === null) onAnswered?.(); setPicked(i) }} aria-pressed={picked === i}
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
          <button key={String(v)} data-testid={`${testid}-${idx}-opt-${v ? 1 : 0}`} onClick={() => { if (picked === null) onAnswered?.(); setPicked(v) }} aria-pressed={picked === v}
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
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const playAll = () => { let i = 0; const next = () => { if (alive.current && i < L.turns.length) speak(L.turns[i++].en, { source: 'unit', onEnd: next }) }; next() }
  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className="text-sm font-black text-teal-700">대화를 먼저 듣고 질문에 답해요</p>
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

function UnitView({ unit, studentId, onBack, backLabel = '← 홈', onSpeaking, onWriting, returnedFrom = null }) {
  const storage = useMemo(safeStorage, [])
  const [records, setRecords] = useState(() => loadUnitRecords(storage, studentId))
  const [activeId, setActiveId] = useState(null)
  const [selfPicked, setSelfPicked] = useState({})
  const headingRef = useRef(null)
  const ids = unit.activities.map((a) => a.id)
  const nextId = nextActivityId(records, unit.id, ids)
  const active = unit.activities.find((a) => a.id === activeId) || null
  useEffect(() => { headingRef.current?.focus() }, [activeId])
  useEffect(() => () => stopSpeaking(), [])
  // 기존 화면(말하기/쓰기)에서 돌아오면 그 활동을 '해 봤다'로만 기록(점수·숙달 아님)
  useEffect(() => { const a = returnedFrom && unit.activities.find((x) => x.kind === returnedFrom); if (a && !activityState(loadUnitRecords(storage, studentId), unit.id, a.id).completed) { markActivity(storage, studentId, unit.id, a.id, { completed: true }); setRecords(loadUnitRecords(storage, studentId)) } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => setRecords(loadUnitRecords(storage, studentId))
  const complete = (id) => { markActivity(storage, studentId, unit.id, id, { completed: true }); refresh() }
  const selfCheck = (id, v) => { markActivity(storage, studentId, unit.id, id, { selfChecked: v }); setSelfPicked((o) => ({ ...o, [id]: v })); refresh() }
  const support = records[unit.id]?.support || { speaking: null, literacy: null }
  const pickSupport = (area, stageId) => { setSupportStage(storage, studentId, unit.id, area, stageId); refresh() }
  const open = (a) => { stopSpeaking(); if (a.kind === 'speaking' && !a.steps) onSpeaking(a); else if (a.kind === 'writing') onWriting(a); else setActiveId(a.id) }
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
          {active.kind === 'speaking' && active.steps && <UnitSpeaking activity={active} onDone={onDone} onWrite={unit.activities.some((x) => x.kind === 'writing') ? () => open(unit.activities.find((x) => x.kind === 'writing')) : null} />}
          <div className={CARD}>
            {active.kind === 'vocab' ? (
              <button data-testid="unit-activity-done" onClick={() => { complete(active.id); back() }} className={`${BTN} w-full bg-gradient-to-br from-teal-400 to-emerald-600 text-white`}>다 봤어요 → 단원으로</button>
            ) : (
              <>
                <p data-testid="unit-activity-status" className="text-sm font-bold text-gray-700">{st.completed ? '이 활동을 해 봤어요.' : '문항을 모두 해 보면 기록돼요.'}</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="자기 확인">
                  <button data-testid="unit-self-ok" onClick={() => selfCheck(active.id, true)} aria-pressed={st.selfChecked} className={`${BTN} text-base ${st.selfChecked ? 'bg-sky-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>🙂 할 수 있었어요</button>
                  <button data-testid="unit-self-hard" onClick={() => selfCheck(active.id, false)} aria-pressed={selfPicked[active.id] === false} className={`${BTN} text-base ${selfPicked[active.id] === false ? 'bg-sky-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>🌱 아직 어려워요</button>
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
          <button data-testid="unit-home" onClick={() => { stopSpeaking(); onBack() }} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">{backLabel}</button>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-black text-teal-700 outline-none">오늘의 학습</h1>
        </div>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 space-y-1">
          <p className="text-sm font-black text-amber-700">{unit.courseKo} · {blockLabelKo(unit.block)} · {unit.goalTitleKo}</p>
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
                  <span className="block text-xs text-gray-500">{st.completed ? (st.selfChecked ? '해 봤어요 · 할 수 있었어요' : '해 봤어요') : a.id === nextId ? '다음 활동' : '아직'}</span>
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

// 225차: Unit 안 말하기 활동(이야기 회차에 없는 문장용) — 기존 녹음기·녹음 버튼·TTS 재사용. ① 따라 하기(모범 듣고 선택 녹음)
// ② 물건 바꾸기(틀에 단어 칩을 끼워 문장을 만들고 듣기·녹음) ③ 모범 없이 묻고 답하기(한국어 상황만, 답 확인 전 영어·음성 미마운트).
// 녹음·답 확인으로 점수·숙달을 만들지 않는다. 화면을 나가면 녹음기(언마운트)와 TTS(stopSpeaking)가 정리된다.
function UnitSpeaking({ activity, onDone, onWrite = null }) {
  const rec = useLocalRecorder()
  const [step, setStep] = useState(0)
  const [slot, setSlot] = useState(0)
  const [replySlot, setReplySlot] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [followRevealed, setFollowRevealed] = useState(false)
  const st = activity.steps[step]
  const busy = BUSY(rec.st)
  const go = (i) => { stopSpeaking(); rec.reset('RESET'); setRevealed(false); setFollowRevealed(false); setStep(i) }
  const fill = (frame, word) => frame.replace('___', word)
  const says = (sp) => SPEAKER_KO[sp] || sp
  return (
    <div data-testid="unit-speaking" data-step={st.kind} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {activity.steps.map((x, i) => <span key={x.kind} data-testid={`unit-speaking-tab-${x.kind}`} aria-current={i === step ? 'step' : undefined} className={`text-sm font-black px-3 py-1 rounded-full ${i === step ? 'bg-teal-500 text-white' : 'bg-white card-shadow text-gray-600'}`}>{i + 1}. {x.titleKo}</span>)}
      </div>
      {st.kind === 'repeat' && (
        <div className={CARD}>
          <p className="text-sm font-black text-teal-700">듣고 따라 말해요</p>
          {st.lines.map((l, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <p className="text-base text-gray-900"><span className="font-black">{says(l.speaker)}:</span> <span data-testid={`unit-speaking-line-${i}`} className="font-black">{l.en}</span> <span className="text-sm text-gray-600">({l.ko})</span></p>
              <button data-testid={`unit-speaking-listen-${i}`} onClick={() => speak(l.en, { source: 'unit' })} disabled={busy} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊</button>
            </div>
          ))}
          <RecorderControls rec={rec} idleText="들은 문장을 따라 말해 봐요. 녹음은 안 해도 돼요" />
        </div>
      )}
      {st.kind === 'swap' && (
        <div className={CARD}>
          <p className="text-sm font-black text-teal-700">물건을 바꿔서 말해요</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="물건 고르기">
            {st.slots.map((w, i) => <button key={w.en} data-testid={`unit-speaking-slot-${i}`} onClick={() => setSlot(i)} aria-pressed={slot === i} className={`${BTN} text-base ${slot === i ? 'bg-teal-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>{w.en} <span className="text-xs opacity-80">{w.ko}</span></button>)}
          </div>
          <p data-testid="unit-speaking-swap-en" className="text-xl font-black text-gray-900">{fill(st.frameEn, st.slots[slot].en)}</p>
          {st.replyFrame && (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="장소 고르기">
                {st.replySlots.map((w, i) => <button key={w.en} data-testid={`unit-speaking-rslot-${i}`} onClick={() => setReplySlot(i)} aria-pressed={replySlot === i} className={`${BTN} text-base ${replySlot === i ? 'bg-violet-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>{w.en} <span className="text-xs opacity-80">{w.ko}</span></button>)}
              </div>
              <p data-testid="unit-speaking-swap-reply" className="text-lg font-black text-gray-800"><span className="text-sm text-gray-600">{says(st.replySpeaker || 'Mia')}:</span> {fill(st.replyFrame, st.replySlots[replySlot].en)}</p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button data-testid="unit-speaking-swap-listen" onClick={() => speak(fill(st.frameEn, st.slots[slot].en), { source: 'unit' })} disabled={busy} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 질문 듣기</button>
            {st.replyFrame && <button data-testid="unit-speaking-swap-listen-reply" onClick={() => speak(fill(st.replyFrame, st.replySlots[replySlot].en), { source: 'unit' })} disabled={busy} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 대답 듣기</button>}
          </div>
          <RecorderControls rec={rec} idleText="바꾼 문장을 말해 봐요. 녹음은 안 해도 돼요" />
        </div>
      )}
      {st.kind === 'recall' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 space-y-1">
            <p className="text-sm font-black text-amber-700">상황</p>
            <p className="text-lg font-bold text-gray-900 break-keep">{st.situationKo}</p>
            <p className="text-base font-bold text-amber-800 break-keep">🙋 내 역할: {st.roleKo}</p>
          </div>
          {revealed ? (
            <div data-testid="unit-speaking-answer" className="bg-sky-50 border-2 border-sky-200 rounded-3xl p-5 space-y-2">
              <p className="text-sm font-black text-sky-700">이렇게 말할 수 있어요</p>
              <p data-testid="unit-speaking-answer-en" className="text-xl font-black text-gray-900">{st.model}</p>
              <button data-testid="unit-speaking-answer-listen" onClick={() => speak(st.model, { source: 'unit' })} disabled={busy} className={`${BTN} bg-sky-100 text-sky-700 text-base`}>🔊 듣기</button>
              {st.alternatives?.length > 0 && <p className="text-sm text-gray-600">이렇게 말해도 좋아요: {st.alternatives.join(' / ')}</p>}
              {st.reply && <p data-testid="unit-speaking-answer-reply" className="text-base text-gray-800"><span className="font-black">{says(st.reply.speaker)}:</span> {st.reply.en} <span className="text-sm text-gray-600">({st.reply.ko})</span></p>}
              {st.followUp && (
                // 227차(발전 수준): 상대의 되묻기에 다시 답하는 후속 — 2차 답 확인 전 영어 미마운트
                <div data-testid="unit-speaking-followup" data-revealed={followRevealed ? 'true' : 'false'} className="pt-2 border-t border-sky-200 space-y-2">
                  <p className="text-base font-bold text-gray-900 break-keep">🔁 {st.followUp.promptKo}</p>
                  {followRevealed ? (
                    <>
                      <p data-testid="unit-speaking-followup-en" className="text-xl font-black text-gray-900">{st.followUp.model}</p>
                      {st.followUp.alternatives?.length > 0 && <p className="text-sm text-gray-600">이렇게 말해도 좋아요: {st.followUp.alternatives.join(' / ')}</p>}
                    </>
                  ) : (
                    <button data-testid="unit-speaking-followup-reveal" onClick={() => setFollowRevealed(true)} disabled={busy} className={`${BTN} bg-amber-500 text-white`}>답 확인</button>
                  )}
                </div>
              )}
              {onWrite && <button data-testid="unit-speaking-to-writing" onClick={onWrite} disabled={busy} className={`${BTN} bg-amber-100 text-amber-800 text-base`}>✍️ 이 표현 써보기</button>}
            </div>
          ) : (
            <p className="text-sm text-gray-600">먼저 소리 내어 말해 보고(녹음은 선택), 그 다음에 답을 확인해요.</p>
          )}
          <RecorderControls rec={rec} idleText="말해 봐요. 마이크 없이도 할 수 있어요" />
          {!revealed && <button data-testid="unit-speaking-reveal" onClick={() => { setRevealed(true); onDone() }} disabled={busy} className={`${BTN} bg-amber-500 text-white`}>답 확인</button>}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        {step > 0 ? <button data-testid="unit-speaking-prev" onClick={() => go(step - 1)} disabled={busy} className={`${BTN} bg-white card-shadow text-gray-700`}>← 이전</button> : <span />}
        {step < activity.steps.length - 1 && <button data-testid="unit-speaking-next" onClick={() => go(step + 1)} disabled={busy} className={`${BTN} bg-white card-shadow text-gray-700`}>다음 →</button>}
      </div>
    </div>
  )
}

// 227차: 과정 → 단계 → Unit 선택(QA 전용). 선택은 화면 상태일 뿐 저장하지 않는다(학생별 영구 레벨·자동 배정·자동 승급 없음).
// Unit이 없는 과정·단계는 '미제작'으로 표시만 한다. unitLink로 돌아온 경우 그 Unit을 바로 연다.
const PERF_KO = (u) => (u.performance ? `말하기 ${performanceById(u.performance.speaking)?.titleKo} · 쓰기 ${performanceById(u.performance.writing)?.titleKo}` : null)
export default function UnitScreen({ units, initialUnitId = null, returnedFrom = null, studentId, onBack, onSpeaking, onWriting }) {
  const initial = units.find((u) => u.id === initialUnitId) || null
  const [courseId, setCourseId] = useState(initial ? initial.course : null)
  const [blockId, setBlockId] = useState(initial ? initial.block : null)
  const [unitId, setUnitId] = useState(initial ? initial.id : null)
  // 복귀 기록(returnedFrom)은 돌아온 그 Unit(initialUnitId)에만 1회 적용 — 목록에서 다른 Unit을 열 때 새어 나가면 안 된다(225차 e2e e에서 발견)
  const [pendingReturn, setPendingReturn] = useState(returnedFrom)
  const pick = (id) => { setPendingReturn(null); setUnitId(id) }
  const unit = units.find((u) => u.id === unitId) || null
  if (unit) {
    return <UnitView key={unit.id} unit={unit} studentId={studentId} returnedFrom={unit.id === initialUnitId ? pendingReturn : null} backLabel="← 목록" onBack={() => pick(null)}
      onSpeaking={(a) => onSpeaking(unit.id, a)} onWriting={(a) => onWriting(unit.id, a)} />
  }
  const level = !courseId ? 'course' : !blockId ? 'block' : 'unit'
  const course = COURSES.find((c) => c.id === courseId) || null
  const inCourse = (cid) => units.filter((u) => u.course === cid)
  const inBlock = (cid, bid) => units.filter((u) => u.course === cid && u.block === bid)
  const ITEM = 'w-full min-h-[64px] px-4 py-3 rounded-3xl text-left btn-press card-shadow'
  const back = level === 'course' ? null : level === 'block' ? () => setCourseId(null) : () => setBlockId(null)
  return (
    <div data-testid="unit-list" data-level={level} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="unit-list-home" onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
          <h1 className="text-xl font-black text-teal-700">오늘의 학습</h1>
        </div>
        {level !== 'course' && (
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-600">
            <button data-testid="unit-list-back" onClick={back} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">{level === 'block' ? '← 과정' : '← 단계'}</button>
            <span data-testid="unit-list-crumb">{course?.titleKo}{blockId ? ` · ${blockLabelKo(blockId)}` : ''}</span>
          </div>
        )}
        {level === 'course' && (
          <>
            <p className="text-base font-black text-gray-800">어떤 과정을 할까요?</p>
            {COURSES.map((c) => { const n = inCourse(c.id).length; return (
              <button key={c.id} data-testid={`unit-course-${c.id}`} onClick={() => setCourseId(c.id)} disabled={n === 0} aria-disabled={n === 0} className={`${ITEM} ${n ? 'text-white bg-gradient-to-br from-teal-400 to-emerald-600' : 'bg-white text-gray-400'}`}>
                <span className="block text-lg font-black">{c.titleKo} <span className="text-xs font-bold opacity-80">{c.monthsKo}</span></span>
                <span className="block text-xs font-bold opacity-90">{n ? `${c.focusKo} · 단원 ${n}개` : '미제작'}</span>
              </button>) })}
          </>
        )}
        {level === 'block' && (
          <>
            <p className="text-base font-black text-gray-800">어느 단계를 할까요? <span className="text-xs font-bold text-gray-500">(기간은 운영 계획이에요. 단계는 선생님과 정해요)</span></p>
            {blocksForCourse(courseId).map((b) => { const n = inBlock(courseId, b).length; const meta = courseId === 'conversation' ? CONV_BLOCK_META(b) : null; return (
              <button key={b} data-testid={`unit-block-${b}`} onClick={() => setBlockId(b)} disabled={n === 0} aria-disabled={n === 0} className={`${ITEM} ${n ? 'text-white bg-gradient-to-br from-sky-400 to-indigo-500' : 'bg-white text-gray-400'}`}>
                <span className="block text-lg font-black">{blockLabelKo(b)} {meta?.monthsKo && <span className="text-xs font-bold opacity-80">{meta.monthsKo}</span>}</span>
                <span className="block text-xs font-bold opacity-90">{meta?.themeKo ? `${meta.themeKo} · ` : ''}{n ? `단원 ${n}개` : '미제작'}</span>
              </button>) })}
          </>
        )}
        {level === 'unit' && (
          <>
            <p className="text-base font-black text-gray-800">어떤 단원을 할까요?</p>
            {inBlock(courseId, blockId).map((u) => (
              <button key={u.id} data-testid={`unit-pick-${u.id}`} onClick={() => pick(u.id)} className={`${ITEM} text-white bg-gradient-to-br from-teal-400 to-emerald-600`}>
                <span className="block text-xs font-bold opacity-90">{u.goalTitleKo}{PERF_KO(u) ? ` · ${PERF_KO(u)}` : ''}</span>
                <span className="block text-lg font-black">{u.titleKo}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
