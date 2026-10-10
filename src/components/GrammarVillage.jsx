import { useEffect, useRef, useState } from 'react'
import { VILLAGE_DISTRICTS, VILLAGE_NO_PLACE_UNITS, districtOfPlace, villageUnitOrder } from '../utils/grammar/village'
import { villageArt } from '../utils/grammar/villageArt'
import { grammarUnitById } from '../utils/grammar/grammarUnits'
import { GRAMMAR_COURSES } from '../utils/grammar/grammarCourses'
import { paulHello } from '../assets/paul'

// 2026-10-10 문법 마을(QA 전용, lazy 청크) — 세로로 스크롤되는 지도: 구역 7개 안에 키트 건물(장소)과 장식.
// 장소를 누르면 하단 카드(하는 일 + 미션) -> 미션 시작은 App이 기존 문법 덱을 연다. 완료 표시는 App의 세션 상태(저장 없음).
// 그림은 전부 <img loading="lazy" srcSet>이라 화면 밖 구역은 스크롤하기 전엔 받지 않는다(첫 구역 공원만 eager).
const TOTAL = villageUnitOrder().length
const BTN = 'min-h-[44px] rounded-2xl font-black btn-press'
const BAND = { path: '#e6d6a8', water: '#9fd0ee' }

function Art({ target, className = '', style, eager = false, alt = '' }) {
  const a = villageArt(target)
  if (!a) return null
  return <img src={a.src} srcSet={`${a.src} 1x, ${a.src2x} 2x`} width={a.w} height={a.h} alt={alt} aria-hidden={alt ? undefined : true} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} className={className} style={style} />
}

const courseName = (u) => GRAMMAR_COURSES.find((c) => c.id === u.courseId)?.titleEn || ''

function PlaceCard({ place, done, onStart, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !ref.current) return
      const f = [...ref.current.querySelectorAll('button:not([disabled])')]
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  const soon = place.unitIds.length === 0
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30" onClick={onClose}>
      <div ref={ref} data-testid="gv-place-card" role="dialog" aria-modal="true" aria-labelledby="gv-place-title" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[720px] max-h-[82dvh] overflow-y-auto rounded-t-3xl bg-[#fffdf5] p-4 pb-6 space-y-3 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 shrink-0 rounded-2xl bg-[#eef5e4] flex items-center justify-center overflow-hidden">
            <Art target={place.art} eager className={`max-w-full max-h-full object-contain ${soon ? 'opacity-60' : ''}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="gv-place-title" data-testid="gv-place-title" className="text-lg font-black text-gray-900 break-keep">{place.nameKo}</h2>
            {!soon && <p className="text-sm text-gray-700 break-keep">{place.doKo}</p>}
          </div>
          <button data-testid="gv-card-close" onClick={onClose} className={`${BTN} px-3 bg-white card-shadow text-gray-700 shrink-0`}>닫기</button>
        </div>
        {soon
          ? <p data-testid="gv-place-soon" className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-3 text-sm font-bold text-amber-900 break-keep">{place.soonKo}</p>
          : place.unitIds.map((id) => { const u = grammarUnitById(id); const d = done.includes(id); return u && (
            <button key={id} data-testid={`gv-mission-${id}`} disabled={u.status !== 'ready'} onClick={() => onStart(id)}
              className={`${BTN} w-full min-h-[56px] px-4 py-2 text-left flex items-center gap-2 ${u.status === 'ready' ? 'bg-[#dcebf7] text-sky-900' : 'bg-gray-100 text-gray-400'}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black break-keep">{u.titleKo}</span>
                <span className="block text-xs font-bold text-gray-600">{courseName(u)}</span>
              </span>
              {d && <span data-testid={`gv-mission-done-${id}`} className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">완료</span>}
            </button>) })}
      </div>
    </div>
  )
}

// 구역 한 칸 — 비율 박스 안에 퍼센트 좌표로 배치(앵커 = 아래 가운데). 뒤쪽(y 작은)이 먼저, 앞쪽이 위.
function District({ d, eager, done, lastId, onOpen, setRef }) {
  const items = [...d.places.map((p) => ({ p })), ...d.decor.map((x) => ({ x }))].sort((a, b) => (a.p || a.x).y - (b.p || b.x).y)
  const last = d.places.find((p) => p.id === lastId)
  return (
    <section data-testid={`gv-district-${d.id}`} data-district={d.id} className="space-y-2">
      <div className="px-1">
        <h2 className="text-lg font-black text-[#3f6b4a]">{d.nameKo}</h2>
        <p className="text-xs text-gray-600 break-keep">{d.introKo}</p>
      </div>
      <div className="relative w-full isolate mb-10" style={{ aspectRatio: String(d.aspect) }}>
        <div className="absolute inset-0 rounded-2xl overflow-hidden" style={{ background: d.ground }}>
          {d.backdrop && <Art target={d.backdrop} eager={eager} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center top' }} />}
          {(d.bands || []).map((b, i) => <div key={i} className="absolute inset-x-0" style={{ top: `${b.y}%`, height: `${b.h}%`, background: BAND[b.kind] || BAND.path }} />)}
        </div>
        {items.map((it, i) => {
          const o = it.p || it.x
          const pos = { position: 'absolute', left: `${o.x - o.w / 2}%`, bottom: `${100 - o.y}%`, width: `${o.w}%` }
          const z = Math.round(o.y * 10)
          if (it.x) return <Art key={`x${i}`} target={it.x.art} eager={eager} className="pointer-events-none block h-auto" style={{ ...pos, zIndex: z }} />
          const p = it.p
          const n = p.unitIds.length, dn = p.unitIds.filter((id) => done.includes(id)).length
          const soon = n === 0, all = n > 0 && dn === n
          return (
            <button key={p.id} ref={(el) => setRef(p.id, el)} data-testid={`gv-place-${p.id}`} data-missions={n} data-done={dn} aria-label={p.nameKo} onClick={() => onOpen(p.id)}
              className="rounded-lg btn-press focus-visible:outline focus-visible:outline-4 focus-visible:outline-sky-500" style={pos}>
              <Art target={p.art} eager={eager} className={`block w-full h-auto relative ${soon ? 'opacity-60' : ''}`} style={{ zIndex: z }} />
              <span aria-hidden="true" className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 w-max max-w-[5.5rem] text-center leading-tight px-1.5 py-0.5 rounded-full bg-white/95 text-[11px] font-black text-gray-800 shadow break-keep" style={{ zIndex: 9000 }}>
                {p.nameKo}
                {soon && <span className="block text-[10px] font-bold text-gray-500">준비 중</span>}
                {all && <span data-testid={`gv-place-done-${p.id}`} className="block text-[10px] font-bold text-emerald-700">완료</span>}
              </span>
            </button>)
        })}
        {last && <img src={paulHello} alt="" aria-hidden="true" data-testid="gv-paul" width="48" height="48" className="pointer-events-none absolute h-auto" style={{ left: `${Math.min(last.x + last.w / 2, 92)}%`, bottom: `${100 - last.y}%`, width: '12%', zIndex: 9500 }} />}
      </div>
    </section>
  )
}

export default function GrammarVillage({ completedUnitIds = [], focusId = null, onStart, onCourses, onHome }) {
  const [open, setOpen] = useState(null) // placeId
  const [lastId, setLastId] = useState(() => (focusId && focusId !== 'notes' ? focusId : null))
  const placeEls = useRef({})
  const notesEl = useRef(null)
  const returnFocus = useRef(null)
  const place = open ? VILLAGE_DISTRICTS.flatMap((d) => d.places).find((p) => p.id === open) : null
  const doneCount = villageUnitOrder().filter((id) => completedUnitIds.includes(id)).length

  // 덱에서 돌아오면 마지막 장소의 구역(또는 문법 노트)으로 스크롤 — 저장 없이 App 세션 상태만 쓴다
  useEffect(() => {
    if (!focusId) return
    if (focusId === 'notes') { notesEl.current?.scrollIntoView({ block: 'start' }); return }
    const dist = districtOfPlace(focusId)
    if (!dist) return
    document.querySelector(`[data-testid="gv-district-${dist.id}"]`)?.scrollIntoView({ block: 'start' })
    placeEls.current[focusId]?.focus({ preventScroll: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 마운트 때 1회

  const openPlace = (id) => { returnFocus.current = placeEls.current[id]; setLastId(id); setOpen(id) }
  const close = () => { setOpen(null); returnFocus.current?.focus({ preventScroll: true }) }

  return (
    <div data-testid="grammar-village" className="min-h-screen bg-[#fbf6e8] p-3 pb-16 overflow-x-hidden">
      <div className="max-w-[720px] mx-auto space-y-5">
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button data-testid="gv-home" onClick={onHome} className={`${BTN} px-2 text-gray-600`}>← 홈</button>
          <h1 className="text-xl font-black text-[#3f6b4a] flex-1">문법 마을</h1>
          <span data-testid="gv-progress" className="text-sm font-black px-3 py-1 rounded-full bg-[#dcebf7] text-sky-900">완료 {doneCount} / {TOTAL}</span>
        </div>
        <button data-testid="gv-to-courses" onClick={onCourses} className={`${BTN} w-full px-4 bg-white card-shadow text-gray-700`}>과정 목록으로 보기</button>
        {VILLAGE_DISTRICTS.map((d, i) => (
          <District key={d.id} d={d} eager={i === 0} done={completedUnitIds} lastId={lastId} onOpen={openPlace} setRef={(id, el) => { placeEls.current[id] = el }} />))}
        <section ref={notesEl} data-testid="gv-notes" className="space-y-2 pt-2">
          <h2 className="text-lg font-black text-[#3f6b4a]">문법 노트</h2>
          <p className="text-xs text-gray-600 break-keep">장소와 어울리지 않아 지도에 올리지 않은 단원이에요. 눌러서 바로 공부해요.</p>
          {VILLAGE_NO_PLACE_UNITS.map(({ unitId, reasonKo }) => { const u = grammarUnitById(unitId); return u && (
            <button key={unitId} data-testid={`gv-note-${unitId}`} onClick={() => { setLastId(null); onStart(unitId, 'notes') }}
              className={`${BTN} w-full min-h-[56px] px-4 py-2 text-left bg-white card-shadow flex items-center gap-2`}>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black text-gray-900 break-keep">{u.titleKo} <span className="text-xs font-bold text-gray-500">{courseName(u)}</span></span>
                <span className="block text-xs text-gray-600 break-keep">{reasonKo}</span>
              </span>
              {completedUnitIds.includes(unitId) && <span data-testid={`gv-note-done-${unitId}`} className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">완료</span>}
            </button>) })}
        </section>
      </div>
      {place && <PlaceCard place={place} done={completedUnitIds} onClose={close} onStart={(unitId) => onStart(unitId, place.id)} />}
    </div>
  )
}
