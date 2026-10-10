import { useEffect, useMemo, useRef, useState } from 'react'
import { speak, stopSpeaking } from '../utils/speech'
import { BTN } from './SpeakingPracticeItem'
import { Choice } from './UnitScreen'
import { GRAMMAR_COURSES } from '../utils/grammar/grammarCourses'
import { unitsForCourse, grammarUnitById, courseCounts, reviewStatusOf, SCHOOL_GRAMMAR_NOTE_KO } from '../utils/grammar/grammarUnits'
import SceneCards, { sceneCanAdvance } from './grammar/SceneCards'
import { missionForUnit, readyMissions } from '../utils/grammar/townMissions'
import { placeById } from '../utils/grammar/village'
import { buildDeck, isPractice, deckCounts, cardIndexById } from '../utils/grammar/grammarDeck'

// 2026-10-10 문법 과정 화면(QA 전용): 과정 5개 → 단원 목록(학습 목표) → 단원 카드 덱(한 화면에 설명 카드 하나 또는 문제 하나). 점수·저장·DB 없음(화면 상태일 뿐).
// 선택 연습은 기존 Choice를 그대로 재사용하고, 준비 중 단원은 비활성으로 보여 빈 화면이 없다.
const CARD = 'bg-white rounded-3xl p-5 card-shadow space-y-3'
const ITEM = 'w-full min-h-[64px] px-4 py-3 rounded-3xl text-left btn-press card-shadow'
const TA = 'w-full min-h-[88px] px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-sky-400 outline-none text-lg font-bold text-gray-900 resize-y'
const H = 'text-sm font-black text-indigo-700'
const NAV = `${BTN} min-h-[56px] text-lg flex-1 disabled:opacity-40`
const Listen = ({ testid, en }) => (
  <button data-testid={testid} aria-label="듣기" onClick={() => speak(en)} className={`${BTN} !px-3 bg-white card-shadow text-lg shrink-0`}>🔊</button>
)
const Prompt = ({ q }) => <p className="text-base font-black text-gray-900 break-keep">{q.promptKo}</p>
const Result = ({ ok, answerEn, whyKo, onRetry }) => (
  <div data-testid="gd-result" data-ok={ok ? 'true' : 'false'} className="space-y-1">
    <p data-testid="gd-why" className={`text-sm break-keep ${ok ? 'text-emerald-700' : 'text-gray-700'}`}>{ok ? '✅ 맞아요. ' : '다시 보세요. '}{answerEn ? `정답: ${answerEn}. ` : ''}{whyKo}</p>
    {!ok && <button data-testid="gd-retry" onClick={onRetry} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>다시 풀기</button>}
  </div>
)

function BlankCard({ q, a, set, clear }) {
  const picked = a.blankPick ?? null
  return (
    <div className="space-y-2">
      <Prompt q={q} />
      <p className="text-lg font-black text-gray-900 break-words">{q.en}</p>
      <div className="flex flex-wrap gap-2">
        {q.options.map((o, i) => (
          <button key={o} data-testid={`gd-blank-opt-${i}`} disabled={a.checked} aria-pressed={picked === i} onClick={() => set({ blankPick: i })}
            className={`${BTN} text-base ${picked === i ? (a.checked ? (a.ok ? 'bg-emerald-500 text-white' : 'bg-amber-200 text-gray-800') : 'bg-sky-100 text-sky-800 ring-2 ring-sky-400') : 'bg-white card-shadow text-gray-700'}`}>{o}</button>
        ))}
      </div>
      {!a.checked
        ? <button data-testid="gd-check" disabled={picked === null} onClick={() => set({ checked: true, ok: picked === q.correct })} className={`${BTN} text-base bg-sky-500 text-white disabled:opacity-40`}>답 확인</button>
        : <Result ok={a.ok} answerEn={q.options[q.correct]} whyKo={q.whyKo || ''} onRetry={clear} />}
    </div>
  )
}

function OrderCard({ q, a, set, clear }) {
  const seq = a.orderSeq || []
  const joined = seq.map((i) => q.words[i]).join(' ')
  return (
    <div className="space-y-2">
      <Prompt q={q} />
      <div className="flex flex-wrap gap-2">
        {q.words.map((w, i) => (
          <button key={i} data-testid={`gd-order-word-${i}`} disabled={seq.includes(i) || a.checked} onClick={() => set({ orderSeq: [...seq, i] })} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>{w}</button>
        ))}
      </div>
      <p data-testid="gd-order-answer" className="min-h-[44px] px-3 py-2 rounded-2xl bg-sky-50 border-2 border-sky-100 text-lg font-black text-gray-900 break-words">{joined}</p>
      {!a.checked ? (
        <div className="flex gap-2">
          <button data-testid="gd-check" disabled={!seq.length} onClick={() => set({ checked: true, ok: q.answers.some((x) => x.join(' ') === joined) })} className={`${BTN} text-base bg-sky-500 text-white disabled:opacity-40`}>답 확인</button>
          <button data-testid="gd-order-clear" disabled={!seq.length} onClick={() => set({ orderSeq: [] })} className={`${BTN} text-base bg-white card-shadow text-gray-700 disabled:opacity-40`}>지우기</button>
        </div>
      ) : <Result ok={a.ok} answerEn={q.answers[0].join(' ')} whyKo={q.whyKo || ''} onRetry={clear} />}
    </div>
  )
}

// 직접 쓴 문장은 맞고 틀림을 판정하지 않는다 — 예시와 나란히 볼 뿐
function WriteCompare({ inputId, compareId, exampleId, q, noteKo, a, set }) {
  const text = a.text || ''
  return (
    <div className="space-y-2">
      <textarea data-testid={inputId} value={text} onChange={(e) => set({ text: e.target.value })} rows={2} autoComplete="off" autoCapitalize="sentences" spellCheck={false} className={TA} placeholder="여기에 써 보세요" />
      <button data-testid={compareId} disabled={!text.trim()} onClick={() => set({ compared: true })} className={`${BTN} text-base bg-sky-500 text-white disabled:opacity-40`}>예시와 비교</button>
      {a.compared && (
        <div data-testid={exampleId} className="space-y-1 rounded-2xl bg-amber-50 border-2 border-amber-200 p-3">
          <p className="text-sm font-bold text-gray-600 break-keep">내가 쓴 문장</p>
          <p className="text-base font-black text-gray-900 break-words">{text}</p>
          <p className="text-sm font-bold text-gray-600 break-keep">예시</p>
          <p className="text-base font-black text-gray-900 break-words">{q.exampleEn}</p>
          <p className="text-sm text-gray-700 break-keep">{q.exampleKo}</p>
          <p className="text-sm text-amber-800 font-bold break-keep">예시는 하나의 답일 뿐이에요{noteKo ? ` — ${noteKo}` : ''}</p>
        </div>
      )}
    </div>
  )
}

const ReviewBadge = ({ unit, testid }) => { const r = reviewStatusOf(unit); return (
  <span data-testid={testid} data-review={r} className={`ml-2 shrink-0 text-xs px-2 py-0.5 rounded-full ${r === 'reviewed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r === 'reviewed' ? '검수 완료' : '검수 전'}</span>) }

const Example = ({ e, testid }) => (
  <div className="flex items-center gap-2">
    <div className="min-w-0 flex-1"><p className="text-lg font-black text-gray-900 break-words">{e.en}</p><p className="text-sm text-gray-600 break-keep">{e.ko}</p></div>
    <Listen testid={testid} en={e.en} />
  </div>
)

// 다음 버튼을 여는 조건 — 문제는 확인한 뒤에만(자동으로 넘어가지 않는다)
const canAdvance = (c, a) => {
  if (c.kind === 'scene') return sceneCanAdvance(c, a)
  if (c.kind === 'choice') return a.picked != null
  if (c.kind === 'blank' || c.kind === 'order') return !!a.checked
  if (c.kind === 'build') return !!a.compared
  if (c.kind === 'use') return !c.use ? true : c.use.kind === 'speaking' ? !!a.done : !!a.compared
  return true
}

function CardBody({ c, a, set, clear, deck, answers, unit, place, studentId, returnTown, onBasics, onRetryWrong, onList }) {
  const mission = missionForUnit(unit.id) || (place && place.doKo ? { placeKo: place.nameKo, introKo: place.doKo } : null) // 공원 미션은 기존 소개, 마을 장소는 장소 이름 + 하는 일
  switch (c.kind) {
    case 'scene': return <SceneCards card={c} unit={unit} answers={answers} onAnswer={set} onClear={clear} studentId={studentId} />
    case 'goal': {
      const basics = c.basicsUnitId ? grammarUnitById(c.basicsUnitId) : null
      return (
        <div data-testid="gd-goal" className="space-y-3">
          <p className="text-base font-black text-gray-900 break-keep">{c.titleKo}</p>
          <p className="text-base font-black text-gray-900 break-keep">{c.goalKo}</p>
          {c.situationKo && <p className="text-sm text-gray-700 break-keep">상황: {c.situationKo}</p>}
          {mission && (
            <div data-testid="gd-mission-intro" className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 p-3 space-y-1">
              <p className="text-sm font-black text-emerald-800 break-keep">{mission.placeKo}</p>
              <p className="text-base text-gray-800 break-keep">{mission.introKo}</p>
            </div>)}
          {basics && (
            <button data-testid="gu-basics-link" onClick={() => onBasics(basics.id)} className={`${BTN} text-base bg-indigo-100 text-indigo-800`}>
              기초 설명 보기 → {basics.titleKo}{basics.status !== 'ready' ? ' (준비 중)' : ''}
            </button>)}
        </div>)
    }
    case 'examples':
      return <div className="space-y-3">{c.examples.map((e, i) => <div key={i} data-testid={`gd-example-${i}`}><Example e={e} testid={`gd-example-${i}-listen`} /></div>)}</div>
    case 'explain':
      return (
        <div data-testid="gd-explain" className="space-y-3">
          {c.example && <Example e={c.example} testid="gd-explain-listen" />}
          <p className="text-base text-gray-800 break-keep">{c.line}</p>
        </div>)
    case 'structure':
      return (
        <div className="space-y-3">
          {c.structure.map((r, i) => (
            <div key={i} data-testid={`gd-structure-${i}`} className="space-y-1">
              <div className="flex flex-wrap items-start gap-2">
                <span className="px-2 py-1 rounded-xl bg-sky-100 text-sky-800 font-black break-words"><b className="text-xs mr-1">S</b>{r.s}</span>
                <span className="px-2 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-black break-words"><b className="text-xs mr-1">V</b>{r.v}</span>
                {r.rest && <span className="px-2 py-1 rounded-xl bg-amber-100 text-amber-800 font-black break-words"><b className="text-xs mr-1">+</b>{r.rest}</span>}
              </div>
              {r.ko && <p className="text-sm text-gray-600 break-keep">{r.ko}</p>}
            </div>))}
          <p className="text-xs text-gray-500 break-keep">S = 주어 · V = 동사 · + = 나머지</p>
        </div>)
    case 'compare':
      return (
        <div data-testid="gd-compare" className="space-y-3">
          {[['aff', '긍정'], ['neg', '부정'], ['q', '의문']].map(([k, label]) => c.compare[k] && (
            <div key={k} data-testid={`gd-compare-${k}`} className="flex items-start gap-2">
              <span className="shrink-0 w-12 text-sm font-black text-indigo-700">{label}</span>
              <div className="min-w-0"><p className="text-base font-black text-gray-900 break-words">{c.compare[k].en}</p><p className="text-sm text-gray-600 break-keep">{c.compare[k].ko}</p></div>
            </div>))}
        </div>)
    case 'error':
      return (
        <div data-testid="gd-error" className="space-y-1">
          <p className="text-base font-black text-gray-400 line-through break-words">{c.wrong}</p>
          <p className="text-base font-black text-emerald-700 break-words">{c.right}</p>
          <p className="text-sm text-gray-700 break-keep">{c.whyKo}</p>
        </div>)
    case 'choice': {
      // Choice는 맞고 틀림(ok)만 알려 주므로, 고른 보기 번호는 버튼 testid에서 읽어 저장한다(되돌아왔을 때 복원용)
      const retry = a.retry || 0
      return (
        <div onClickCapture={(e) => { const m = /-opt-(\d+)$/.exec(e.target.closest?.('button')?.dataset.testid || ''); if (m) set({ picked: +m[1] }) }} className="space-y-2">
          <Choice key={`${c.id}-${retry}`} q={c.q} idx={0} testid="gd-choice" initialPicked={a.picked ?? null} onPick={(ok) => set({ ok })} />
          {a.picked != null && a.ok === false && (
            <button data-testid="gd-retry" onClick={() => set({ picked: null, ok: null, retry: retry + 1 })} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>다시 풀기</button>)}
        </div>)
    }
    case 'blank': return <BlankCard q={c.q} a={a} set={set} clear={clear} />
    case 'order': return <OrderCard q={c.q} a={a} set={set} clear={clear} />
    case 'build':
      return (
        <div className="space-y-2">
          <Prompt q={c.q} />
          <WriteCompare inputId="gd-build-input" compareId="gd-build-compare" exampleId="gd-build-example" q={c.q} noteKo={c.q.acceptNoteKo} a={a} set={set} />
        </div>)
    case 'use': {
      const use = c.use
      if (!use) return <p className="text-base text-gray-700 break-keep">이 단원은 직접 사용 활동이 없어요.</p>
      return (
        <div data-testid="gd-use" className="space-y-3">
          <p className="text-base font-black text-gray-900 break-keep">{use.promptKo}</p>
          {use.kind === 'speaking' ? (
            <>
              <Example e={{ en: use.exampleEn, ko: use.exampleKo }} testid="gd-use-listen" />
              <button data-testid="gd-use-done" onClick={() => set({ done: true })} className={`${BTN} text-base bg-sky-500 text-white`}>말해 봤어요</button>
              {a.done && <p data-testid="gd-use-done-note" className="text-sm font-bold text-emerald-700 break-keep">✅ 잘했어요. 내 말이 예시와 달라도 괜찮아요.</p>}
            </>
          ) : <WriteCompare inputId="gd-use-input" compareId="gd-use-compare" exampleId="gd-use-example" q={use} a={a} set={set} />}
        </div>)
    }
    default: { // summary — 참여 기록일 뿐 점수 아님
      const k = deckCounts(deck)
      const prac = deck.filter(isPractice)
      const wrong = prac.filter((x) => answers[x.id]?.ok === false)
      const right = prac.filter((x) => answers[x.id]?.ok === true)
      return (
        <div data-testid="gd-summary" className="space-y-3">
          <p data-testid="gd-summary-counts" className="text-base font-black text-gray-900 break-keep">참여 기록: 설명 카드 {k.explain} · 문제 {k.practice} · 맞힘 {right.length} · 틀림 {wrong.length}</p>
          {wrong.length > 0 && (
            <div className="space-y-1">
              <p className={H}>틀린 문제</p>
              {wrong.map((x) => <p key={x.id} data-testid={`gd-summary-wrong-${x.id}`} className="text-sm text-gray-800 break-keep">• {x.q ? x.q.promptKo : x.label}</p>)}
              <button data-testid="gd-retry-wrong" onClick={onRetryWrong} className={`${BTN} text-base bg-amber-200 text-gray-800`}>틀린 문제 다시 풀기</button>
            </div>)}
          {returnTown && <button data-testid="gd-to-town" onClick={onList} className={`${BTN} min-h-[44px] text-base bg-emerald-500 text-white`}>마을로 돌아가기</button>}
          {!returnTown && <button data-testid="gd-to-list" onClick={onList} className={`${BTN} min-h-[44px] text-base bg-sky-500 text-white`}>단원 목록으로</button>}
        </div>)
    }
  }
}

function GrammarUnitDeck({ unit, units, studentId, from, returnTown, returnKind, place, initial, onStateChange, onBasics, onBack, onMissionComplete, onUnitComplete }) {
  const deck = useMemo(() => buildDeck(unit, units), [unit, units])
  const [idx, setIdx] = useState(Math.min(initial?.idx || 0, deck.length - 1))
  const [answers, setAnswers] = useState(initial?.answers || {})
  const headingRef = useRef(null)
  const c = deck[idx]
  const a = answers[c.id] || {}
  const total = deck.length
  const same = deck.filter((x) => x.kind === c.kind && x.sceneKind === c.sceneKind)
  const sub = same.length > 1 ? ` ${same.indexOf(c) + 1}/${same.length}` : ''
  useEffect(() => { headingRef.current?.focus() }, [idx])
  useEffect(() => { onStateChange?.({ idx, answers }) }, [idx, answers]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), [])
  useEffect(() => { if (c.kind === 'summary') { const m = missionForUnit(unit.id); if (m) onMissionComplete?.(m.id); onUnitComplete?.(unit.id) } }, [c.kind]) // eslint-disable-line react-hooks/exhaustive-deps -- 요약 카드에 닿을 때마다 1회(App이 중복 제거)
  const go = (i) => { stopSpeaking(); window.scrollTo({ top: 0 }); setIdx(Math.max(0, Math.min(total - 1, i))) }
  const set = (patch) => setAnswers((s) => ({ ...s, [c.id]: { ...s[c.id], ...patch } }))
  const clear = () => setAnswers((s) => { const n = { ...s }; delete n[c.id]; return n })
  const retryWrong = () => {
    const w = deck.find((x) => isPractice(x) && answers[x.id]?.ok === false)
    if (!w) return
    setAnswers((s) => { const n = { ...s }; delete n[w.id]; return n })
    go(cardIndexById(deck, w.id))
  }
  const ok = canAdvance(c, a)
  const last = idx === total - 1
  const leave = (toList) => { stopSpeaking(); onBack(toList) }
  // 360x640 높이 예산(덱 화면): 화면 위 여백 16 + 덱 높이 calc(100dvh-104px)=536 → 덱 바닥 y=552 = 플로팅 속도 위젯 위(fixed bottom-5 + 높이 56 → top 564)보다 12 위.
  //  덱 안(flex 세로, gap 8): 헤더 한 줄 44 + 단계 행 16 + 바 6(위 블록 74) · 카드 flex-1(= 536-74-16(안내 줄)-56(nav)-24(gap 3) = 366) · 안내 줄 16(항상 자리 예약) · nav 56.
  const TXT_BACK = 'min-h-[44px] px-2 font-black text-gray-600 btn-press shrink-0'
  const backBtn = from
    ? <button data-testid="gu-basics-back" onClick={() => leave(false)} className={TXT_BACK}>← 돌아가기</button>
    : <button data-testid="gu-back" data-return={returnTown ? returnKind : undefined} onClick={() => leave(true)} className={TXT_BACK}>{returnTown ? '← 마을' : '← 단원 목록'}</button>
  return (
    <div data-testid="grammar-unit" data-unit={unit.id}>
      <div data-testid="gd-root" data-unit={unit.id} data-idx={idx} data-total={total} data-kind={c.kind} className="flex flex-col gap-2 h-[calc(100dvh-104px)] min-h-[440px] max-h-[760px]">
        <div className="shrink-0 space-y-1">
          <div data-testid="gd-header" className="flex items-center gap-1">
            {backBtn}
            <p data-testid="gd-title" className="min-w-0 flex-1 text-base font-black text-indigo-700 overflow-hidden text-ellipsis whitespace-nowrap">{unit.order}. {unit.titleKo}</p>
            <ReviewBadge unit={unit} testid="gu-review-status" />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-gray-700">
            <span data-testid="gd-step">{c.stepKo}</span>
            <span data-testid="gd-progress">{idx + 1} / {total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden"><div data-testid="gd-bar" className="h-full bg-indigo-500" style={{ width: `${((idx + 1) / total) * 100}%` }} /></div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div key={c.id} data-testid="gd-card" data-kind={c.kind} data-id={c.id} className="flex-1 min-h-0 bg-white rounded-3xl p-4 card-shadow overflow-y-auto space-y-3">
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-black text-gray-900 break-keep outline-none">{c.title}{sub}</h2>
            <CardBody c={c} a={a} set={set} clear={clear} deck={deck} answers={answers} unit={unit} place={place} studentId={studentId} returnTown={returnTown} onBasics={(id) => { stopSpeaking(); onBasics(id) }} onRetryWrong={retryWrong} onList={() => leave(true)} />
          </div>
        </div>
        <p data-testid="gd-next-hint-slot" className="shrink-0 h-4 text-xs font-bold text-gray-500 text-center break-keep leading-4">{!last && !ok && <span data-testid="gd-next-hint">답을 확인한 뒤 다음으로 가요</span>}</p>
        <div data-testid="gd-nav" className="shrink-0 flex gap-3">
          <button data-testid="gd-prev" disabled={idx === 0} onClick={() => go(idx - 1)} className={`${NAV} bg-white card-shadow text-gray-700`}>← 이전</button>
          {!last && <button data-testid="gd-next" disabled={!ok} onClick={() => go(idx + 1)} className={`${NAV} bg-sky-500 text-white`}>다음 →</button>}
        </div>
      </div>
    </div>
  )
}

function GrammarUnitView({ unit, units, studentId, from, returnTown, returnKind, place, initial, onStateChange, onBasics, onBack, onMissionComplete, onUnitComplete }) {
  if (unit.status !== 'ready') {
    const back = () => { stopSpeaking(); onBack(!from) }
    return (
      <div data-testid="grammar-unit" data-unit={unit.id} data-status="preparing" className="space-y-4">
        {from
          ? <button data-testid="gu-basics-back" onClick={back} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>← 돌아가기</button>
          : <button data-testid="gu-back" onClick={back} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>← 단원 목록</button>}
        <h2 className="text-lg font-black text-gray-900 break-keep">{unit.order}. {unit.titleKo}</h2>
        <div data-testid="gu-goal" className={CARD}><p className={H}>학습 목표</p><p className="text-base font-black text-gray-900 break-keep">{unit.goalKo}</p></div>
        <p data-testid="gu-preparing" className={`${CARD} text-base font-black text-gray-500 break-keep`}>이 단원은 준비 중이에요</p>
      </div>
    )
  }
  return <GrammarUnitDeck unit={unit} units={units} studentId={studentId} from={from} returnTown={returnTown} returnKind={returnKind} place={place} initial={initial} onStateChange={onStateChange} onBasics={onBasics} onBack={onBack} onMissionComplete={onMissionComplete} onUnitComplete={onUnitComplete} />
}

export default function GrammarCourseScreen({ units, onBack, studentId, initialUnitId = null, returnTo = null, placeId = null, homeLabel = '← 홈', onMissionComplete, onUnitComplete }) {
  const [courseId, setCourseId] = useState(null)
  const [unitId, setUnitId] = useState(initialUnitId)
  const town = returnTo === 'town' || returnTo === 'village' || returnTo === 'world' // 마을(2.5D 또는 문법 마을)에서 들어온 경우 — 덱을 나가면 목록이 아니라 마을로
  const place = returnTo === 'village' && placeId ? placeById(placeId) : null
  const [fromId, setFromId] = useState(null) // 기초 설명으로 건너온 경우 돌아갈 단원
  const deckStates = useRef(new Map()) // 단원 id → { idx, answers } — 기초 설명을 다녀와도 같은 카드·답이 남는다(화면 상태일 뿐, 저장 없음)
  useEffect(() => () => stopSpeaking(), [])
  const course = GRAMMAR_COURSES.find((c) => c.id === courseId) || null
  const unit = grammarUnitById(unitId)
  const list = courseId ? unitsForCourse(courseId) : []
  return (
    <div data-testid="grammar-courses" data-view={unit ? 'unit' : course ? 'units' : 'courses'} className={`min-h-screen p-4 ${unit && unit.status === 'ready' ? 'pb-4' : 'pb-24'}`}>
      <div className="max-w-lg mx-auto space-y-4 overflow-x-hidden">
        {!(unit && unit.status === 'ready') && ( // 덱(카드 화면)에서는 이 줄을 숨겨 카드 높이를 확보한다 — 덱 헤더 한 줄(gd-header)이 ← 단원 목록/← 마을을 맡는다
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="grammar-courses-home" onClick={() => { stopSpeaking(); onBack() }} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">{homeLabel}</button>
          <h1 className="text-xl font-black text-indigo-700">문법 과정</h1>
        </div>)}
        {unit && (
          <GrammarUnitView key={unit.id} unit={unit} units={units} studentId={studentId} from={fromId} returnTown={town && !fromId} returnKind={returnTo} place={place} onMissionComplete={onMissionComplete} onUnitComplete={onUnitComplete}
            initial={deckStates.current.get(unit.id)}
            onStateChange={(s) => deckStates.current.set(unit.id, s)}
            onBasics={(id) => { setFromId(unit.id); setUnitId(id) }}
            onBack={(toList) => {
              if (toList) deckStates.current.delete(unit.id) // 목록으로 나가면 다음에 처음부터
              if (fromId) { deckStates.current.delete(unit.id); setUnitId(fromId); setFromId(null) } else if (town) onBack(); else setUnitId(null)
            }} />)}
        {!unit && !course && (
          <>
            {readyMissions().length > 0 && (
              <div data-testid="grammar-missions" className="space-y-2">
                <p className="text-base font-black text-gray-800">폴타운 미션</p>
                {readyMissions().map((m) => { const mu = grammarUnitById(m.unitId); return mu && (
                  <button key={m.id} data-testid={`grammar-mission-${m.id}`} onClick={() => { setFromId(null); deckStates.current.delete(mu.id); setUnitId(mu.id) }} className={`${ITEM} min-h-[64px] text-white bg-gradient-to-br from-emerald-500 to-teal-700 font-black break-keep`}>
                    {m.titleKo} · {m.grammarEn}
                  </button>) })}
              </div>)}
            <p className="text-base font-black text-gray-800">어떤 과정을 할까요?</p>
            {GRAMMAR_COURSES.map((c) => { const { ready, reviewed, total } = courseCounts(c.id); return (
              <button key={c.id} data-testid={`grammar-course-${c.id}`} onClick={() => setCourseId(c.id)} className={`${ITEM} text-white bg-gradient-to-br from-indigo-500 to-violet-700`}>
                <span className="block text-xl font-black">{c.titleEn}</span>
                <span className="block text-xs font-bold opacity-90 break-keep">{c.titleKo} · {c.descKo}</span>
                <span className="block text-xs font-bold opacity-90"><span className="mr-1 px-2 py-0.5 rounded-full bg-white/30">{c.kind === 'school' ? '학교 문법 (제안)' : '숙련도'}</span>ready {ready}/{total} · 검수 {reviewed}</span>
              </button>) })}
          </>)}
        {!unit && course && (
          <div data-testid="grammar-units" data-course={course.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-600">
              <button data-testid="grammar-units-back" onClick={() => setCourseId(null)} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 과정</button>
              <span data-testid="grammar-units-crumb">{course.titleEn} · {course.titleKo}</span>
            </div>
            <p className="text-sm text-gray-600 break-keep">{course.descKo}</p>
            {course.kind === 'school' && <p data-testid="grammar-school-note" className="text-xs font-bold text-amber-800 bg-amber-50 rounded-2xl px-3 py-2 break-keep">{SCHOOL_GRAMMAR_NOTE_KO}</p>}
            {list.map((u) => { const ready = u.status === 'ready'; return (
              <button key={u.id} data-testid={`grammar-unit-${u.id}`} disabled={!ready} aria-disabled={!ready} onClick={() => { setFromId(null); deckStates.current.delete(u.id); setUnitId(u.id) }}
                className={`${ITEM} ${ready ? 'text-white bg-gradient-to-br from-teal-400 to-emerald-600' : 'bg-white text-gray-400'}`}>
                <span className="block text-lg font-black break-keep">{u.order}. {u.titleKo}{missionForUnit(u.id) && <span data-testid="gu-place-tag" className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{missionForUnit(u.id).placeKo}</span>}{!ready && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">준비 중</span>}{ready && <ReviewBadge unit={u} testid={`grammar-unit-${u.id}-review`} />}</span>
                <span className="block text-xs font-bold opacity-90 break-keep">{u.goalKo}</span>
              </button>) })}
          </div>)}
      </div>
    </div>
  )
}
