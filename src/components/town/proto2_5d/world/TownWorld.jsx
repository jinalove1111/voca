// 2026-10-10(244차) Paul Town 하이브리드 2.5D 월드 화면 — 하나로 이어진 월드를 Paul이 직접 걸어 다닌다(키보드/조이스틱).
// 순수 로직은 utils/town/proto2_5d/world/*(이동/충돌/근접/빠른이동), 이 파일은 렌더 + 입력 + rAF 루프만 맡는다.
// 보상/저장 없음: 세션(위치/방문)은 onSessionChange로 상위에 넘기기만 한다. 카메라는 camera.js의 순수 헬퍼를 px 좌표로 재사용.
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  WORLD_W, WORLD_H, PAUL_H, ZONES, SPAWN, OBJECTS, PLACES, PATHS, GATES, solids, pxPerUnit,
} from '../../../../utils/town/proto2_5d/world/worldMap.js'
import { stepMove, facingFor, bodyHits } from '../../../../utils/town/proto2_5d/world/freeMove.js'
import { keysToVector, combine } from '../../../../utils/town/proto2_5d/world/inputVector.js'
import { nearestPlace } from '../../../../utils/town/proto2_5d/world/proximity.js'
import { travelTarget, zoneAt } from '../../../../utils/town/proto2_5d/world/fastTravel.js'
import { buildWalkGrid, planPath, resolveClickTarget, followStep } from '../../../../utils/town/proto2_5d/world/clickMove.js'
import { computeCameraTarget, stepCamera } from '../../../../utils/town/proto2_5d/camera.js'
import { PAUL_SPRITE_MANIFEST } from '../../../../utils/town/proto2_5d/characterSpriteManifest.default.js'
import { validateSpriteManifest, resolveSpriteFrame } from '../../../../utils/town/proto2_5d/characterSpriteContract.js'
import { worldArt } from './worldArt.js'
import WorldJoystick from './WorldJoystick.jsx'
import WorldMap from './WorldMap.jsx'
import PlaceSheet from './PlaceSheet.jsx'

const SOLIDS = solids()
const BODY_R = 1.5
const WALK_FRAME_MS = 180
const SPEED = 28 // freeMove.stepMove 기본 속도와 같다(도착 보정용)
const TAP_MAX_PX = 10 // 탭 판정: 이동 10px 미만
const TAP_MAX_MS = 500 // 탭 판정: 500ms 미만
const STUCK_MS = 400 // 경로를 따라가는데 이만큼 못 움직이면 경로 취소
const NO_TAP = 'button, [data-testid="tw-joystick"], [role="dialog"], [data-testid="tw-map"], [data-testid="tw-mission-enter"], [data-testid="tw-place-sheet"]'
const ZERO = { x: 0, y: 0 }
const NAVY = '#1f2a44'
const CREAM = '#fffaf0'
const SPRITE_OK = validateSpriteManifest(PAUL_SPRITE_MANIFEST)
const GROUND = { paving: '#ece4d2', grass: '#8cc56e', yard: '#93c877', street: '#ddd5c4', garden: '#c3dcaa', water: '#bdd5de', farm: '#e2e4b6' }
const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]))
const OBJ_BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o]))
const r1 = (v) => Math.round(v * 10) / 10
const noDrag = (e) => e.preventDefault()

function validStart(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= BODY_R && p.x <= WORLD_W - BODY_R && p.y >= BODY_R && p.y <= WORLD_H - BODY_R
    && !bodyHits(p, BODY_R, SOLIDS)
}

const ArtImg = ({ art, w, h, style }) => (
  <img src={art.src} srcSet={`${art.src} 1x, ${art.src2x} 2x`} width={w} height={h} alt="" aria-hidden="true" draggable={false} loading="lazy" decoding="async"
    style={{ position: 'relative', display: 'block', width: w, height: h, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none', ...style }} />
)

const Shadow = ({ w, h }) => (
  <div aria-hidden="true" style={{ position: 'absolute', left: '10%', width: '80%', bottom: -h * 0.05, height: Math.max(3, w * 0.12), borderRadius: '50%', background: 'rgba(40,30,20,0.18)', pointerEvents: 'none' }} />
)

// 정적 레이어: 바닥/길/구역 이름/오브젝트/닫힌 문. 스케일이 바뀔 때만 다시 그린다(월드는 transform 하나로만 움직인다).
const StaticWorld = memo(function StaticWorld({ s }) {
  const px = (u) => Math.round(u * s * 10) / 10
  const label = Math.max(11, s * 1.9)
  return (
    <>
      {ZONES.map((z) => {
        const ready = z.status === 'ready'
        const pave = z.ground === 'paving'
        return (
          <div key={z.id} data-zone-ground={z.id} style={{
            position: 'absolute', left: px(z.rect.x), top: px(z.rect.y), width: px(z.rect.w), height: px(z.rect.h), boxSizing: 'border-box',
            background: GROUND[z.ground] || '#ddd',
            ...(pave ? { backgroundImage: 'linear-gradient(rgba(150,130,100,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(150,130,100,0.13) 1px, transparent 1px)', backgroundSize: `${px(10)}px ${px(10)}px` } : {}),
            boxShadow: 'inset 0 0 0 1px rgba(60,80,50,0.22)', opacity: ready ? 1 : 0.9,
          }}>
            <span style={{
              position: 'absolute', ...(ready ? { left: px(2), top: px(1.5) } : { left: '50%', top: '42%', transform: 'translate(-50%,-50%)', whiteSpace: 'nowrap' }),
              fontSize: ready ? label : label * 1.3, fontWeight: 900, color: NAVY, opacity: ready ? 0.7 : 0.5, userSelect: 'none',
            }}>{z.nameKo}{ready ? '' : ' · 준비 중'}</span>
          </div>
        )
      })}
      <svg aria-hidden="true" viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} width={px(WORLD_W)} height={px(WORLD_H)} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        {[1, 0].map((pass) => PATHS.map((p) => (
          <polyline key={`${p.id}-${pass}`} points={p.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" strokeLinecap="round" strokeLinejoin="round"
            stroke={pass ? '#dccfae' : '#f6ecd3'} strokeWidth={p.width + (pass ? 0.9 : 0)} />
        )))}
      </svg>
      {OBJECTS.map((o) => {
        const a = worldArt(o.art)
        if (!a) return null
        const h = px(o.h), w = px((o.h * a.w) / a.h)
        return (
          <div key={o.id} data-obj={o.id} style={{ position: 'absolute', left: px(o.x), top: px(o.y), width: w, height: h, transform: 'translate(-50%,-100%)', zIndex: Math.round(o.y * 10), pointerEvents: 'none' }}>
            <Shadow w={w} h={h} />
            <ArtImg art={a} w={w} h={h} />
          </div>
        )
      })}
      {GATES.map((g) => {
        const a = worldArt(g.art)
        if (!a) return null
        const h = px(g.h), w = px((g.h * a.w) / a.h)
        return (
          <div key={g.id} data-testid={`tw-gate-${g.zone}`} style={{ position: 'absolute', left: px(g.x), top: px(g.y), width: w, height: h, transform: 'translate(-50%,-100%)', zIndex: Math.round(g.y * 10), pointerEvents: 'none' }}>
            <Shadow w={w} h={h} />
            <ArtImg art={a} w={w} h={h} />
            <span style={{ position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: 2, whiteSpace: 'nowrap', fontSize: Math.max(10, s * 1.5), fontWeight: 900, color: NAVY, background: CREAM, border: `1px solid ${NAVY}`, borderRadius: 999, padding: '1px 7px', userSelect: 'none' }}>준비 중</span>
          </div>
        )
      })}
    </>
  )
})

function PaulSprite({ view, s }) {
  const side = view.facing === 'left' || view.facing === 'right'
  const f = resolveSpriteFrame({
    manifest: PAUL_SPRITE_MANIFEST, validation: SPRITE_OK,
    // 서 있을 때: 앞모습만 idle 프레임이 있다 — 옆/뒤를 보고 멈추면 그 방향 걷기 첫 프레임(a)을 정지 자세로 쓴다.
    phase: !view.moving && view.facing === 'front' ? 'idle' : 'walking',
    direction: side ? 'side' : view.facing, facing: view.facing === 'left' ? -1 : 1, frameIndex: view.moving ? view.frame : 0,
  })
  const h = PAUL_H * s
  const w = (h * PAUL_SPRITE_MANIFEST.canvas.w) / PAUL_SPRITE_MANIFEST.canvas.h
  return (
    <div data-testid="tw-paul" data-facing={view.facing} data-moving={view.moving ? 'true' : 'false'}
      style={{ position: 'absolute', left: Math.round(view.x * s * 10) / 10, top: Math.round(view.y * s * 10) / 10, width: w, height: h, transform: 'translate(-50%,-100%)', zIndex: Math.round(view.y * 10), pointerEvents: 'none' }}>
      <Shadow w={w * 0.7} h={h} />
      {f.kind === 'sprite'
        ? <img src={f.src} srcSet={f.srcSet} width={w} height={h} alt="" aria-hidden="true" draggable={false}
            style={{ position: 'relative', display: 'block', width: w, height: h, maxWidth: 'none', transform: f.mirrorX ? 'scaleX(-1)' : undefined, userSelect: 'none', pointerEvents: 'none' }} />
        : <span aria-hidden="true" style={{ position: 'relative', fontSize: h * 0.8 }}>{f.glyph}</span>}
    </div>
  )
}

const hudBtn = { minWidth: 44, minHeight: 44, padding: '0 14px', borderRadius: 999, border: `2px solid ${NAVY}`, background: CREAM, color: NAVY, fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 2px 8px rgba(31,42,68,0.25)' }

export default function TownWorld({ initial, onSessionChange, completedUnitIds = [], onOpenMission, onBack }) {
  const propsRef = useRef({})
  propsRef.current = { initial, onSessionChange, onOpenMission, onBack }

  const rootRef = useRef(null)
  const worldRef = useRef(null)
  const startRef = useRef(null)
  if (!startRef.current) startRef.current = validStart(initial?.pos) ? { x: initial.pos.x, y: initial.pos.y } : { ...SPAWN }

  const [vp, setVp] = useState(() => (typeof window === 'undefined' ? { w: 390, h: 844 } : { w: window.innerWidth, h: window.innerHeight }))
  const s = pxPerUnit(vp.w, vp.h)
  const sRef = useRef(s), vpRef = useRef(vp)
  sRef.current = s; vpRef.current = vp

  const posRef = useRef(startRef.current)
  const facingRef = useRef('front')
  const movingRef = useRef(false)
  const clockRef = useRef(0)
  const keysRef = useRef(new Set())
  const joyRef = useRef(ZERO)
  const nearRef = useRef(nearestPlace(startRef.current, PLACES, undefined, null))
  const visitedRef = useRef(new Set(Array.isArray(initial?.visited) ? initial.visited : []))
  const camRef = useRef(null)
  const lastView = useRef(null)
  const rafRef = useRef(0)
  const lastTs = useRef(0)
  const wakeRef = useRef(() => {})
  const reducedRef = useRef(false)
  const openerRef = useRef(null)
  const pathRef = useRef(null) // 클릭/탭 이동 웨이포인트(없으면 null). 저장 없음
  const stuckRef = useRef(0)
  const tapRef = useRef(null)
  const badTimerRef = useRef(0)

  const [view, setView] = useState(() => ({ x: startRef.current.x, y: startRef.current.y, facing: 'front', moving: false, frame: 0 }))
  const [near, setNear] = useState(nearRef.current)
  const [sheet, setSheet] = useState(null) // { place, wasVisited }
  const [mapOpen, setMapOpen] = useState(false)
  const [dest, setDest] = useState(null) // 걷는 중인 목적지 {x,y}
  const [bad, setBad] = useState(null) // 갈 수 없는 곳 표시 {x,y}(잠깐)
  const [showJoy, setShowJoy] = useState(true)
  const lockRef = useRef(false)
  lockRef.current = !!sheet || mapOpen

  const camTarget = () => {
    const sc = sRef.current, v = vpRef.current
    return computeCameraTarget({ charX: posRef.current.x * sc, charY: (posRef.current.y - PAUL_H / 2) * sc, viewportW: v.w, viewportH: v.h, worldW: WORLD_W * sc, worldH: WORLD_H * sc })
  }
  if (!camRef.current) camRef.current = camTarget()
  const writeCam = () => { if (worldRef.current) worldRef.current.style.transform = `translate3d(${-camRef.current.x}px, ${-camRef.current.y}px, 0)` }

  const commit = () => {
    const next = { x: posRef.current.x, y: posRef.current.y, facing: facingRef.current, moving: movingRef.current, frame: movingRef.current ? Math.floor(clockRef.current / WALK_FRAME_MS) % 2 : 0 }
    const p = lastView.current
    if (p && p.x === next.x && p.y === next.y && p.facing === next.facing && p.moving === next.moving && p.frame === next.frame) return
    lastView.current = next
    setView(next)
  }

  const clearPath = useCallback(() => { pathRef.current = null; stuckRef.current = 0; setDest(null) }, [])

  const emit = useCallback(() => {
    const cb = propsRef.current.onSessionChange
    if (cb) cb({ pos: { x: posRef.current.x, y: posRef.current.y }, visited: [...visitedRef.current], done: propsRef.current.initial?.done || [] })
  }, [])

  // ---- rAF 루프: 입력이 있거나 카메라가 아직 수렴 중일 때만 돈다. 숨김/시트/지도/언마운트에서는 멈춘다. ----
  useEffect(() => {
    const tick = (t) => {
      rafRef.current = 0
      if (document.hidden) { lastTs.current = 0; return }
      const dt = Math.min(lastTs.current ? t - lastTs.current : 16, 50)
      lastTs.current = t
      let vec = lockRef.current ? ZERO : combine(keysToVector(keysRef.current), joyRef.current)
      let active = !!(vec.x || vec.y)
      let following = false
      if (pathRef.current) {
        // 키보드/조이스틱이 항상 이기고 경로를 취소한다. 시트/지도가 열려도 취소.
        if (active || lockRef.current) clearPath()
        else {
          const f = followStep(posRef.current, pathRef.current, 0.6, SPEED * dt / 1000)
          if (f.done) clearPath()
          else { pathRef.current = f.waypoints; vec = f.vec; active = true; following = true }
        }
      }
      let moved = false
      if (active) {
        const r = stepMove(posRef.current, vec, dt, { solids: SOLIDS })
        facingRef.current = facingFor(vec, facingRef.current)
        moved = r.moved
        posRef.current = { x: r.x, y: r.y }
        if (following) {
          stuckRef.current = moved ? 0 : stuckRef.current + dt
          if (stuckRef.current > STUCK_MS) clearPath()
        }
      }
      movingRef.current = moved
      clockRef.current = moved ? clockRef.current + dt : 0
      if (moved) {
        const nr = nearestPlace(posRef.current, PLACES, undefined, nearRef.current)
        if (nr !== nearRef.current) { nearRef.current = nr; setNear(nr) }
      }
      const target = camTarget()
      camRef.current = reducedRef.current ? target : stepCamera(camRef.current, target)
      writeCam()
      commit()
      const settled = camRef.current.x === target.x && camRef.current.y === target.y
      if (active || !settled || moved) rafRef.current = requestAnimationFrame(tick)
      else lastTs.current = 0
    }
    wakeRef.current = () => { if (!rafRef.current && !document.hidden) rafRef.current = requestAnimationFrame(tick) }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; wakeRef.current = () => {}; clearTimeout(badTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 뷰포트 / 보조 환경 ----
  useEffect(() => {
    const el = rootRef.current
    const measure = () => {
      const r = el?.getBoundingClientRect()
      const w = Math.round(r?.width || window.innerWidth), h = Math.round(r?.height || window.innerHeight)
      setVp((p) => (p.w === w && p.h === h ? p : { w, h }))
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(measure) : null
    ro?.observe(el)
    const mqR = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    reducedRef.current = !!mqR?.matches
    const onR = () => { reducedRef.current = !!mqR.matches }
    mqR?.addEventListener?.('change', onR)
    return () => { window.removeEventListener('resize', measure); ro?.disconnect(); mqR?.removeEventListener?.('change', onR) }
  }, [])
  useEffect(() => {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches
    setShowJoy(!!coarse || vp.w < 900)
    camRef.current = camTarget(); writeCam(); wakeRef.current()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp.w, vp.h])

  // ---- 키보드 ----
  useEffect(() => {
    const MOVE = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'])
    const ignore = (e) => !!e.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')
    const down = (e) => {
      if (e.key === 'Escape') { if (lockRef.current) { setSheet(null); setMapOpen(false) } return }
      if (lockRef.current || ignore(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = String(e.key).toLowerCase()
      if (k === 'm') { openerRef.current = document.activeElement; setMapOpen(true); return }
      if (!MOVE.has(k)) return
      if (k.startsWith('arrow')) e.preventDefault()
      clearPath() // 키보드가 클릭 이동을 즉시 취소
      keysRef.current.add(k)
      wakeRef.current()
    }
    const up = (e) => { keysRef.current.delete(String(e.key).toLowerCase()); wakeRef.current() }
    const reset = () => { keysRef.current.clear(); joyRef.current = ZERO; clearPath() }
    const vis = () => { if (document.hidden) { reset(); lastTs.current = 0 } else wakeRef.current() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  // 언마운트: 마지막 위치를 상위에 알린다.
  useEffect(() => () => emit(), [emit])

  // 시트/지도가 열리면 입력을 비우고 정지, 닫히면 루프 재개 + 포커스 복귀.
  useEffect(() => {
    if (sheet || mapOpen) {
      keysRef.current.clear(); joyRef.current = ZERO; clearPath(); movingRef.current = false; clockRef.current = 0; commit()
    } else { openerRef.current?.focus?.(); wakeRef.current() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, mapOpen])

  const onJoy = useCallback((v) => { joyRef.current = v; wakeRef.current() }, [])

  // ---- 클릭/탭 이동: 월드 바닥을 짧게 눌렀다 떼면(10px/500ms 미만) 그곳까지 장애물을 돌아 걷는다 ----
  const onPointerDown = (e) => {
    if (e.button !== 0 || lockRef.current || e.target?.closest?.(NO_TAP)) { tapRef.current = null; return }
    tapRef.current = tapRef.current ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } // 두 번째 손가락이면 취소
  }
  const onPointerUp = (e) => {
    const d = tapRef.current
    tapRef.current = null
    if (!d || d.id !== e.pointerId || lockRef.current) return
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= TAP_MAX_PX || performance.now() - d.t >= TAP_MAX_MS) return
    const rect = worldRef.current?.getBoundingClientRect()
    if (!rect) return
    const sc = sRef.current
    const wp = { x: (e.clientX - rect.left) / sc, y: (e.clientY - rect.top) / sc }
    if (wp.x < 0 || wp.y < 0 || wp.x > WORLD_W || wp.y > WORLD_H) return
    const tgt = resolveClickTarget(wp)
    const path = planPath(posRef.current, tgt, buildWalkGrid(), SOLIDS)
    if (!path || !path.length) {
      clearTimeout(badTimerRef.current)
      setBad({ x: wp.x, y: wp.y })
      badTimerRef.current = setTimeout(() => setBad(null), 700)
      return
    }
    keysRef.current.clear()
    stuckRef.current = 0
    pathRef.current = path
    setDest({ x: path[path.length - 1].x, y: path[path.length - 1].y })
    wakeRef.current()
  }
  const onPointerCancel = () => { tapRef.current = null }

  const openSheet = (placeId) => {
    const place = PLACES.find((p) => p.id === placeId)
    if (!place) return
    openerRef.current = document.activeElement
    const wasVisited = visitedRef.current.has(place.id)
    visitedRef.current.add(place.id)
    setSheet({ place, wasVisited })
    emit()
  }

  const travel = (id) => {
    const t = travelTarget(id)
    if (!t) return
    posRef.current = { x: t.x, y: t.y }
    facingRef.current = 'front'; movingRef.current = false; clockRef.current = 0
    keysRef.current.clear(); joyRef.current = ZERO; clearPath()
    nearRef.current = nearestPlace(posRef.current, PLACES, undefined, null)
    setNear(nearRef.current)
    camRef.current = camTarget(); writeCam()
    commit()
    setMapOpen(false)
    emit()
  }

  const zone = ZONE_BY_ID[zoneAt(view)] || ZONE_BY_ID.plaza
  const nearPlace = near ? PLACES.find((p) => p.id === near) : null
  const px = (u) => Math.round(u * s * 10) / 10
  const bottomJoy = 'max(20px, calc(env(safe-area-inset-bottom) + 12px))'
  const top = 'calc(env(safe-area-inset-top) + 8px)'

  return (
    <div
      ref={rootRef}
      data-testid="town-world"
      data-zone={zone.id}
      data-x={String(r1(view.x))}
      data-y={String(r1(view.y))}
      data-dest={dest ? `${r1(dest.x)},${r1(dest.y)}` : ''}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={noDrag}
      onDragStart={noDrag}
      style={{ position: 'fixed', inset: 0, height: '100dvh', overflow: 'hidden', background: '#d9d2c4', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', color: NAVY }}
    >
      <div ref={worldRef} style={{ position: 'absolute', left: 0, top: 0, width: px(WORLD_W), height: px(WORLD_H), willChange: 'transform', transform: `translate3d(${-camRef.current.x}px, ${-camRef.current.y}px, 0)` }}>
        <StaticWorld s={s} />
        {PLACES.map((p) => {
          const o = OBJ_BY_ID[p.objectId]
          if (!o) return null
          return (
            <div key={p.id} data-testid={`tw-place-${p.id}`} data-near={near === p.id ? 'true' : 'false'}
              style={{ position: 'absolute', left: px(o.x), top: px(o.y - o.h - 1.5), transform: 'translate(-50%,-100%)', zIndex: 2600, whiteSpace: 'nowrap', pointerEvents: 'none', fontSize: Math.max(12, s * 2.1), fontWeight: 900, padding: '2px 10px', borderRadius: 999, background: near === p.id ? NAVY : CREAM, color: near === p.id ? CREAM : NAVY, border: `2px solid ${NAVY}`, boxShadow: '0 2px 6px rgba(31,42,68,0.25)' }}>
              {p.nameKo}
            </div>
          )
        })}
        {dest && (
          <div data-testid="tw-dest" aria-hidden="true"
            style={{ position: 'absolute', left: px(dest.x), top: px(dest.y), width: px(3), height: px(3), transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `3px solid ${NAVY}`, background: 'rgba(255,250,240,0.55)', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 2400 }} />
        )}
        {bad && (
          <div data-testid="tw-dest-bad" aria-hidden="true"
            style={{ position: 'absolute', left: px(bad.x), top: px(bad.y), transform: 'translate(-50%,-50%)', fontSize: Math.max(14, s * 2.4), fontWeight: 900, color: '#b3261e', pointerEvents: 'none', zIndex: 2400 }}>x</div>
        )}
        <PaulSprite view={view} s={s} />
      </div>

      <div style={{ position: 'fixed', zIndex: 5000, left: 'max(8px, env(safe-area-inset-left))', right: 'max(8px, env(safe-area-inset-right))', top, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, pointerEvents: 'none' }}>
        <button type="button" data-testid="tw-home" aria-label="홈으로" onClick={() => propsRef.current.onBack?.()} style={{ ...hudBtn, pointerEvents: 'auto' }}>← 홈</button>
        <div data-testid="tw-zone-chip" style={{ flex: '0 1 auto', minWidth: 0, textAlign: 'center', fontSize: 14, fontWeight: 900, padding: '8px 12px', borderRadius: 999, background: 'rgba(255,250,240,0.92)', border: `2px solid ${NAVY}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {zone.nameKo} · {zone.subject}
        </div>
        <button type="button" data-testid="tw-map-open" aria-label="마을 지도 열기" onClick={() => { openerRef.current = document.activeElement; setMapOpen(true) }} style={{ ...hudBtn, pointerEvents: 'auto' }}>지도</button>
      </div>

      {nearPlace && !sheet && !mapOpen && (
        <button type="button" data-testid="tw-mission-enter" data-place={nearPlace.id} onClick={() => openSheet(nearPlace.id)}
          style={{ position: 'fixed', zIndex: 5100, left: '50%', transform: 'translateX(-50%)', maxWidth: 'calc(100% - 32px)', minHeight: 52, padding: '0 22px', borderRadius: 999, border: `2px solid ${NAVY}`, background: '#8fae8b', color: '#fff', fontSize: 17, fontWeight: 900, whiteSpace: 'nowrap', cursor: 'pointer', boxShadow: '0 4px 12px rgba(31,42,68,0.3)',
            bottom: showJoy ? `calc(${bottomJoy} + 96px + 14px)` : 'max(24px, env(safe-area-inset-bottom))' }}>
          {nearPlace.nameKo} 미션 보기
        </button>
      )}

      {showJoy && <WorldJoystick onVector={onJoy} />}

      {sheet && (
        <PlaceSheet place={sheet.place} missionsOpen={!!onOpenMission} completedUnitIds={completedUnitIds} wasVisited={sheet.wasVisited}
          onMission={(m) => { emit(); propsRef.current.onOpenMission?.(sheet.place.id, m) }} onClose={() => setSheet(null)} />
      )}
      {mapOpen && <WorldMap currentZone={zone.id} onTravel={travel} onClose={() => setMapOpen(false)} />}
    </div>
  )
}
