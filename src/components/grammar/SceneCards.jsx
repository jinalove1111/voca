import { useEffect, useMemo, useRef, useState } from 'react'
import { speak } from '../../utils/speech'
import { trackEvent } from '../../utils/productEvents'
import { paulGreat } from '../../assets/paul'
import useLocalRecorder from '../../hooks/useLocalRecorder'
import { BTN, RecorderControls } from '../SpeakingPracticeItem'
import ParkScene, { artUrl } from './ParkScene'
import Stage from './Stage'
import { PROPS, dimsFor } from '../../utils/grammar/sceneProps'
import { sceneCards, spotPositions, layoutSentence, buildFrame, stageProps, displayOrder, positionFrame, relationSpots, layoutItems } from '../../utils/grammar/sceneMission'

// 2026-10-10 그림 상황 미션 카드 — 단계(sceneKind)마다 컴포넌트 하나. 상태는 전부 덱의 answers[cardId]에 둔다(화면 상태일 뿐, 저장 없음).
// 문장·정답·버튼은 실제 UI. 답은 확인 전/공개 전에는 DOM에 없다(listen의 영어 문장, speak 시험의 모범 답).
const NUMS_KO = ['', '한', '두', '세', '네', '다섯']
const PRIMARY = `${BTN} text-base bg-sky-500 text-white disabled:opacity-40`
const SECOND = `${BTN} text-base bg-white card-shadow text-gray-700 disabled:opacity-40`
const TA = 'w-full min-h-[88px] px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-sky-400 outline-none text-lg font-bold text-gray-900 resize-y'
const optCls = (on, checked, ok) => `${BTN} text-base ${on ? (checked ? (ok ? 'bg-emerald-500 text-white' : 'bg-amber-200 text-gray-800') : 'bg-sky-100 text-sky-800 ring-2 ring-sky-400') : 'bg-white card-shadow text-gray-700'}`

// 장면 그림: step/item의 view·layout·panels·lines를 그대로 Stage에 넘긴다. 시범(full)만 Paul·Cookie 장식을 그리고, add는 scene.bg 배경만 쓴다.
function Pic({ c, o, paul = true, ...rest }) {
  const full = c.unitScene.mode !== 'add'
  return <Stage bg={c.unitScene.bg || 'park'} {...stageProps(o)} showPaul={full && paul} showCookie={full && paul} {...rest} />
}
// 보기 표시 순서(add만 섞음, 시범 full은 데이터 순서). 번호·testid·선택 상태는 항상 데이터 번호
const ordFor = (c, n) => (c.unitScene.mode === 'add' ? displayOrder(n, c.seed) : Array.from({ length: n }, (_, i) => i))
const Prompt = ({ children }) => <p className="text-base font-black text-gray-900 break-keep">{children}</p>
// 2026-10-10 이모지 없이 작은 인라인 SVG 스피커 아이콘(글자 대신 그림, 접근성 이름은 aria-label '듣기')
const Speaker = () => <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>
const Listen = ({ testid, en }) => <button data-testid={testid} aria-label="듣기" onClick={() => speak(en)} className={`${BTN} !px-3 bg-white card-shadow text-lg shrink-0`}><Speaker /></button>
const Line = ({ en, ko, testid, listenTestid }) => (
  <div className="flex items-center gap-2">
    <div className="min-w-0 flex-1"><p data-testid={testid} className="text-lg font-black text-gray-900 break-words">{en}</p>{ko && <p className="text-sm text-gray-600 break-keep">{ko}</p>}</div>
    <Listen testid={listenTestid} en={en} />
  </div>
)
const Result = ({ ok, whyKo, onRetry, extra }) => (
  <div data-testid="scene-result" data-ok={ok ? 'true' : 'false'} className="space-y-1">
    <p data-testid="scene-why" className={`text-sm break-keep ${ok ? 'text-emerald-700' : 'text-gray-700'}`}>{ok ? '맞아요. ' : '다시 보세요. '}{extra}{whyKo}</p>
    {!ok && <button data-testid="scene-retry" onClick={onRetry} className={SECOND}>다시 풀기</button>}
  </div>
)
const CheckBtn = ({ disabled, onClick }) => <button data-testid="scene-check" disabled={disabled} onClick={onClick} className={PRIMARY}>답 확인</button>

// 내 공원 = 만들기에서 놓은 물건. 아직 안 만들었으면 place.obj × n
function useMyPark(unit, answers) {
  return useMemo(() => {
    const b = unit.scene?.mode === 'add' ? null : sceneCards(unit).find((x) => x.sceneKind === 'build' && x.step.place.n !== undefined)
    const placed = (b && answers[b.id]?.placed) || []
    return placed.length ? { layout: [], placed } : { layout: b ? [{ obj: b.step.place.obj, n: b.step.place.n }] : [], placed: [] }
  }, [unit, answers])
}

function Discover({ c, a, set }) {
  const { step } = c
  const tap = (obj) => { if (obj !== step.tap.obj) return; if (!a.tapped) { set({ tapped: true }); speak(step.tap.en) } }
  return (
    <div className="space-y-3">
      <Prompt>{step.promptKo}</Prompt>
      <Pic c={c} o={step} highlight={a.tapped ? step.tap.obj : null} tapObj={step.tap.obj} onTapObject={tap} />
      {a.tapped && (
        <div className="space-y-1">
          <Line en={step.tap.en} ko={step.tap.ko} testid="scene-caption" listenTestid="scene-caption-listen" />
          {step.noteKo && <p className="text-sm text-gray-700 break-keep">{step.noteKo}</p>}
        </div>)}
    </div>)
}

function Compare({ c }) {
  const { step } = c
  return (
    <div className="space-y-3">
      <Prompt>{step.promptKo}</Prompt>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[step.left, step.right].map((s, i) => (
          <div key={i} data-testid={`scene-compare-${i}`} className="space-y-1">
            <Pic c={c} o={s} size="sm" paul={false} />
            <Line en={s.en} ko={s.ko} testid={`scene-caption-${i}`} listenTestid={`scene-listen-${i}`} />
          </div>))}
      </div>
      {(step.explainKo || []).map((l, i) => <p key={i} className="text-sm text-gray-800 break-keep">{l}</p>)}
    </div>)
}

function Choose({ c, a, set, clear }) {
  const it = c.step.items[c.itemIndex]
  const picked = a.picked ?? null
  const frame = picked == null ? it.frame : it.frame.replace('___', it.options[picked])
  return (
    <div className="space-y-3">
      {it.promptKo && <Prompt>{it.promptKo}</Prompt>}
      <Pic c={c} o={it} />
      <p data-testid="scene-frame" className="text-lg font-black text-gray-900 break-words">{frame}</p>
      <div className="flex gap-2">
        {ordFor(c, it.options.length).map((j) => [it.options[j], j]).map(([o, j]) => <button key={o} data-testid={`scene-opt-${j}`} disabled={a.checked} aria-pressed={picked === j} onClick={() => set({ picked: j })} className={optCls(picked === j, a.checked, a.ok)}>{o}</button>)}
      </div>
      {!a.checked ? <CheckBtn disabled={picked == null} onClick={() => set({ checked: true, ok: picked === it.correct })} />
        : <Result ok={a.ok} whyKo={it.whyKo || ''} onRetry={clear} extra={`정답: ${it.frame.replace('___', it.options[it.correct])} `} />}
    </div>)
}

function Build({ c, a, set, clear }) {
  const { step } = c
  const { place, slots } = step
  const pos = place.ref !== undefined // 위치 놓기: 기준 물건(ref) 둘레의 관계 자리에 하나를 놓고 문장틀의 관계를 고른다
  const placed = a.placed || []
  const layout = step.layout || (pos ? [{ obj: place.ref }] : [])
  const pd = dimsFor(c.unitScene.bg || 'park') // Stage와 같은 그림 상자 크기(공원 실제 그림)
  const spots = pos ? relationSpots(layoutItems(layout, { center: true, enlarge: place.ref, dims: pd }).find((i) => i.obj === place.ref), pd?.[place.obj] || PROPS[place.obj]).filter((s) => place.relations.includes(s.relation)) : spotPositions(slots, pd)
  const free = spots.filter((s) => !placed.some((p) => (pos ? p.relation === s.relation : p.x === s.x)))
  const remaining = pos ? 1 : place.n - placed.length // 위치 놓기는 다시 놓으면 옮겨진다
  const locked = !!a.checked
  const [sel, setSel] = useState(false)
  const [ghost, setGhost] = useState(null)
  const drag = useRef(null)
  const suppress = useRef(false)
  const pf = pos ? positionFrame(step) : null
  const cf = pos ? null : buildFrame(c.unitScene, step, placed.length)
  const frame = pos ? pf.frame : cf.frame
  const nums = pos ? pf.options : cf.options
  const correct = pos ? pf.correctFor(placed[0]?.relation) : cf.correct
  const picked = a.picked ?? null
  const putAt = (s) => {
    if (locked || remaining <= 0) return
    set({ placed: pos ? [{ obj: place.obj, x: s.px ?? s.x, y: s.py ?? s.y, relation: s.relation, ref: place.ref, scale: s.scale, z: s.z }] : [...placed, { obj: place.obj, x: s.x, y: s.y }], picked: null }); setSel(false)
  }
  const onSpot = (x, y, i) => { if (sel && free[i]) putAt(free[i]) }
  const down = (e) => { if (locked || remaining <= 0) return; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 일부 환경은 캡처 미지원 */ } drag.current = { x: e.clientX, y: e.clientY, moved: false } }
  const move = (e) => { const d = drag.current; if (!d) return; if (d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) { d.moved = true; setGhost({ x: e.clientX, y: e.clientY }) } }
  const up = (e) => {
    const d = drag.current; drag.current = null; setGhost(null)
    if (!d?.moved) return
    suppress.current = true; setTimeout(() => { suppress.current = false }, 0) // 드래그 뒤 따라오는 click은 선택으로 치지 않는다
    const g = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-testid^="scene-spot-"]')
    const s = g && free[+g.getAttribute('data-testid').split('-').pop()]
    if (s) putAt(s)
  }
  const art = artUrl(place.obj, c.unitScene.bg || 'park')
  // 판정은 실제로 놓은 것을 따른다. 개수: 놓은 수와 고른 숫자가 같으면 맞음(목표는 place.n이지만 일관된 문장이면 인정). 위치: 놓은 자리의 관계와 고른 관계가 같으면 맞음
  const ok = pos ? picked != null && placed.length > 0 && picked === correct : picked != null && placed.length > 0 && placed.every((x) => x.obj === place.obj) && picked === correct
  const mine = pos ? (picked != null ? frame.replace('___', nums[picked]) : '') : placed.length ? layoutSentence(c.unitScene, [{ obj: place.obj, n: placed.length }]) : ''
  const name = c.unitScene.objects[place.obj]?.ko || ''
  return (
    <div className="space-y-3">
      <Prompt>{step.promptKo}</Prompt>
      <Pic c={c} o={{ layout }} paul={!pos} enlarge={pos ? place.ref : undefined} placed={placed} spots={!locked && remaining > 0 ? free : []} onTapSpot={onSpot} />
      <div className="flex items-center gap-2">
        <button data-testid={`scene-tray-${place.obj}`} aria-pressed={sel} disabled={locked || remaining <= 0} onClick={() => { if (!suppress.current) setSel((v) => !v) }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setGhost(null) }}
          className={`${BTN} touch-none flex items-center gap-2 text-base ${sel ? 'bg-sky-100 ring-2 ring-sky-400 text-sky-800' : 'bg-white card-shadow text-gray-700'}`}>
          {art ? <img src={art} alt="" draggable={false} className="h-9 w-auto" /> : <span aria-hidden="true">●</span>}
          <span>{pos ? name : `${name} × ${Math.max(remaining, 0)}`}</span>
        </button>
        <p data-testid="scene-placed-count" className="text-sm font-bold text-gray-700 break-keep">놓은 {name}: {placed.length} / {pos ? 1 : place.n}</p>
      </div>
      <p className="text-xs text-gray-600 break-keep">{pos ? '아래 물건을 누르고 그림 속 빈 자리를 눌러요. 끌어서 놓아도 돼요.' : `${name}를 누르고 빈 자리를 눌러요. 끌어서 놓아도 돼요.`}</p>
      {ghost && art && <img src={art} alt="" aria-hidden="true" className="fixed z-50 h-12 w-auto pointer-events-none -translate-x-1/2 -translate-y-1/2" style={{ left: ghost.x, top: ghost.y }} />}
      {!locked && placed.length > 0 && <button data-testid="scene-clear" onClick={() => set({ placed: [], picked: null })} className={SECOND}>다시 놓기</button>}
      <p data-testid="scene-frame" className="text-lg font-black text-gray-900 break-words">{picked == null ? frame : frame.replace('___', nums[picked])}</p>
      {placed.length === 0 && <p className="text-sm font-bold text-gray-600 break-keep">{pos ? '물건을 그림 속 빈 자리에 먼저 놓아 보세요.' : '나무를 먼저 놓아 보세요.'}</p>}
      {!pos && !locked && placed.length > 0 && placed.length !== place.n && <p className="text-sm font-bold text-gray-600 break-keep">{name}를 {NUMS_KO[place.n] || place.n}그루 심어 보세요.</p>}
      <div className="flex flex-wrap gap-2">
        {ordFor(c, nums.length).map((j) => [nums[j], j]).map(([o, j]) => <button key={o} data-testid={`scene-opt-${j}`} disabled={locked} aria-pressed={picked === j} onClick={() => set({ picked: j })} className={optCls(picked === j, locked, a.ok)}>{o}</button>)}
      </div>
      {!locked ? <CheckBtn disabled={picked == null} onClick={() => set({ checked: true, ok })} />
        : <Result ok={a.ok} whyKo={step.whyKo || ''} onRetry={clear} extra={pos ? (a.ok ? `${mine} ` : placed.length === 0 ? '먼저 물건을 놓아 보세요. ' : '놓은 곳과 문장이 달라요. ') : a.ok ? `${mine} ${placed.length !== place.n ? `나무를 ${NUMS_KO[place.n] || place.n}그루 심어 보세요. ` : ''}` : placed.length === 0 ? '나무를 먼저 놓아 보세요. ' : `놓은 ${name} 수와 문장이 달라요. `} />}
    </div>)
}

function Read({ c, a, set, clear }) {
  const { pairs } = c.step
  const n = pairs.length
  const order = pairs.map((_, j) => (j + 1) % n) // 그림 j는 pairs[order[j]]의 장면(문장 순서와 일부러 어긋나게)
  const map = a.map || {}
  const [sel, setSel] = useState(null)
  const pairedPic = (j) => Object.keys(map).find((i) => map[i] === j)
  const pick = (j) => { if (a.checked || sel == null) return; const m = { ...map }; Object.keys(m).forEach((i) => { if (m[i] === j) delete m[i] }); m[sel] = j; set({ map: m }); setSel(null) }
  const done = Object.keys(map).length === n
  const res = (i) => a.checked && order[map[i]] === i
  return (
    <div className="space-y-3">
      <Prompt>{c.step.promptKo}</Prompt>
      <div className="space-y-2">
        {pairs.map((p, i) => (
          <button key={i} data-testid={`scene-sent-${i}`} disabled={a.checked} aria-pressed={sel === i} data-ok={a.checked ? String(res(i)) : undefined} onClick={() => { setSel(i); speak(p.en) }}
            className={`${BTN} w-full text-left text-base ${sel === i ? 'bg-sky-100 ring-2 ring-sky-400 text-sky-800' : a.checked ? (res(i) ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-gray-800') : 'bg-white card-shadow text-gray-800'}`}>
            {p.en}{map[i] != null && <b className="ml-2 text-xs text-indigo-700">그림 {map[i] + 1}</b>}
          </button>))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {order.map((pi, j) => (
          <button key={j} data-testid={`scene-pic-${j}`} disabled={a.checked} aria-label={`그림 ${j + 1}`} aria-pressed={pairedPic(j) != null} onClick={() => pick(j)}
            className={`rounded-2xl p-1 min-h-[44px] ${pairedPic(j) != null ? 'ring-2 ring-indigo-400 bg-indigo-50' : 'bg-white card-shadow'}`}>
            <Pic c={c} o={pairs[pi]} size="sm" paul={false} />
            <span className="block text-xs font-black text-gray-600">{j + 1}</span>
          </button>))}
      </div>
      {!a.checked ? <CheckBtn disabled={!done} onClick={() => set({ checked: true, ok: pairs.every((_, i) => order[map[i]] === i) })} />
        : <Result ok={a.ok} onRetry={clear} whyKo={a.ok ? '문장과 그림이 모두 맞아요.' : '노란색 문장은 다른 그림과 짝이에요.'} />}
    </div>)
}

function ListenPick({ c, a, set, clear }) {
  const it = c.step.items[c.itemIndex]
  const ord = ordFor(c, it.options.length)
  const picked = a.picked ?? null
  return (
    <div className="space-y-3">
      <Prompt>{c.step.promptKo || '문장을 듣고 맞는 그림을 골라요.'}</Prompt>
      <button data-testid="scene-listen-play" onClick={() => speak(it.en)} className={`${BTN} text-base bg-sky-100 text-sky-900 inline-flex items-center justify-center gap-2`}><Speaker /><span>문장 듣기</span></button>
      <div className="grid grid-cols-2 gap-2">
        {ord.map((j, pos) => [it.options[j], j, pos]).map(([o, j, pos]) => (
          <button key={j} data-testid={`scene-pic-${j}`} disabled={a.checked} aria-label={`그림 ${pos + 1}`} aria-pressed={picked === j}
            className={`rounded-2xl p-1 min-h-[44px] ${picked === j ? (a.checked ? (a.ok ? 'ring-2 ring-emerald-500 bg-emerald-50' : 'ring-2 ring-amber-400 bg-amber-50') : 'ring-2 ring-sky-400 bg-sky-50') : 'bg-white card-shadow'}`} onClick={() => set({ picked: j })}>
            <Pic c={c} o={o} size="sm" paul={false} />
            <span className="block text-xs font-black text-gray-600">{pos + 1}</span>
          </button>))}
      </div>
      {!a.checked ? <CheckBtn disabled={picked == null} onClick={() => set({ checked: true, ok: picked === it.correct })} />
        : (
          <div className="space-y-2">
            <p data-testid="scene-sentence" className="text-lg font-black text-gray-900 break-words">{it.en}</p>
            <Result ok={a.ok} whyKo={it.whyKo || ''} onRetry={clear} extra={`정답은 그림 ${ord.indexOf(it.correct) + 1}. `} />
          </div>)}
    </div>)
}

function SpeakPractice({ c, a, set, my }) {
  const rec = useLocalRecorder()
  const s = c.step.practice
  return (
    <div className="space-y-3">
      <Prompt>{s.situationKo}</Prompt>
      <ParkScene {...(c.step.useMyPark === false ? {} : my)} />
      <Line en={s.modelEn} ko={s.modelKo} testid="scene-model" listenTestid="scene-model-listen" />
      {(s.alternatives || []).length > 0 && <p className="text-sm text-gray-700 break-words">이렇게 말해도 돼요: {s.alternatives.join(' / ')}</p>}
      <RecorderControls rec={rec} prefix="scene" />
      <button data-testid="scene-said" onClick={() => set({ done: true })} className={PRIMARY}>말해 봤어요</button>
      {a.done && <p className="text-sm font-bold text-emerald-700 break-keep">잘했어요. 내 말이 달라도 괜찮아요.</p>}
    </div>)
}

// 시험: 공개 전에는 한국어 상황만 — 영어 모범 답·다른 표현·모범 음성은 revealed 뒤에만 DOM에 생긴다
function SpeakExam({ c, a, set, my }) {
  const rec = useLocalRecorder()
  const s = c.step.exam
  const revealed = !!a.revealed
  return (
    <div className="space-y-3">
      <Prompt>{s.situationKo}</Prompt>
      <ParkScene {...(c.step.useMyPark === false ? {} : my)} />
      {!revealed && <button data-testid="scene-reveal" onClick={() => set({ revealed: true })} className={PRIMARY}>모범 답 보기</button>}
      {revealed && (
        <div className="space-y-2 rounded-2xl bg-amber-50 border-2 border-amber-200 p-3">
          <Line en={s.modelEn} ko={s.modelKo} testid="scene-model" listenTestid="scene-model-listen" />
          {(s.alternatives || []).length > 0 && <p data-testid="scene-alternatives" className="text-sm text-gray-700 break-words">이렇게 말해도 돼요: {s.alternatives.join(' / ')}</p>}
          <p className="text-sm font-bold text-amber-800 break-keep">내 말이 모범 답과 달라도 괜찮아요.</p>
        </div>)}
      <RecorderControls rec={rec} prefix="scene" />
    </div>)
}

function Write({ c, a, set, my }) {
  const { step } = c
  const text = a.text || ''
  return (
    <div className="space-y-3">
      <Prompt>{step.promptKo}</Prompt>
      <ParkScene {...my} />
      <textarea data-testid="scene-write-input" value={text} onChange={(e) => set({ text: e.target.value })} rows={2} autoComplete="off" autoCapitalize="sentences" spellCheck={false} className={TA} placeholder="여기에 써 보세요" />
      <button data-testid="scene-write-compare" disabled={!text.trim()} onClick={() => set({ compared: true })} className={PRIMARY}>예시와 비교</button>
      {a.compared && (
        <div data-testid="scene-write-example" className="space-y-1 rounded-2xl bg-amber-50 border-2 border-amber-200 p-3">
          <p className="text-sm font-bold text-gray-600 break-keep">내가 쓴 문장</p>
          <p className="text-base font-black text-gray-900 break-words">{text}</p>
          <p className="text-sm font-bold text-gray-600 break-keep">예시</p>
          <p className="text-base font-black text-gray-900 break-words">{step.exampleEn}</p>
          <p className="text-sm text-gray-700 break-keep">{step.exampleKo}</p>
          <p className="text-sm text-amber-800 font-bold break-keep">예시는 하나의 답일 뿐이에요{step.acceptNoteKo ? ` — ${step.acceptNoteKo}` : ''}</p>
        </div>)}
    </div>)
}

function Finish({ c, studentId }) {
  const { step } = c
  const sent = useRef(false)
  useEffect(() => { if (sent.current) return; sent.current = true; trackEvent?.(studentId, 'grammar_scene_finish') }, [studentId]) // 분석 이벤트 하나뿐(보상·XP 없음)
  return (
    <div data-testid="scene-finish" className="space-y-3">
      <ul className="space-y-1">{step.canDoKo.map((l, i) => <li key={i} data-testid={`scene-cando-${i}`} className="text-base font-black text-gray-900 break-keep">{l}</li>)}</ul>
      <div className="flex items-center gap-3">
        <img src={paulGreat} alt="" aria-hidden="true" className="h-20 w-auto shrink-0" />
        <p data-testid="scene-paul-bubble" className="rounded-2xl bg-sky-50 border-2 border-sky-100 px-3 py-2 text-base font-bold text-gray-800 break-keep">{step.paulKo}</p>
      </div>
      {step.rewardNoteKo && <p className="text-sm text-gray-600 break-keep">{step.rewardNoteKo}</p>}
    </div>)
}

// 다음 버튼을 여는 조건(장면 카드)
export const sceneCanAdvance = (c, a) => {
  switch (c.sceneKind) {
    case 'discover': return !!a.tapped
    case 'choose': case 'read': case 'listen': return !!a.checked
    case 'build': return !!(a.checked || a.ok)
    case 'speak': return c.mode === 'exam' ? !!a.revealed : !!a.done
    case 'write': return !!a.compared
    default: return true
  }
}

export default function SceneCards({ card, unit, answers, onAnswer, onClear, studentId }) {
  const my = useMyPark(unit, answers)
  const a = answers[card.id] || {}
  const c = { ...card, unitScene: unit.scene, seed: `${unit.id}${card.id}` }
  const p = { c, a, set: onAnswer, clear: onClear, my }
  const body = {
    discover: <Discover {...p} />, compare: <Compare {...p} />, choose: <Choose {...p} />, build: <Build {...p} />, read: <Read {...p} />,
    listen: <ListenPick {...p} />, speak: card.mode === 'exam' ? <SpeakExam {...p} /> : <SpeakPractice {...p} />, write: <Write {...p} />, finish: <Finish c={c} studentId={studentId} />,
  }[card.sceneKind]
  return <div data-testid={`scene-card-${card.sceneKind}`} data-scene-kind={card.sceneKind} className="space-y-3">{body}</div>
}
