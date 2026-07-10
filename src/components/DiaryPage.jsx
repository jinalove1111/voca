import { useState, useRef } from 'react'
import { STICKERS } from '../data/stickers'
import { BACKGROUNDS, backgroundsUnlockedFor } from '../data/backgrounds'

const stickerById = (id) => STICKERS.find(s => s.id === id)

// One sticker already placed on the diary page — draggable by its body,
// with a rotate handle (top) and a resize handle (bottom-right) that
// appear once it's selected. All positions are stored as % of the canvas
// so the layout stays correct at any screen size.
function PlacedSticker({ placement, selected, onSelect, canvasRef, onMove, onRotateResize, onDelete }) {
  const sticker = stickerById(placement.stickerId)
  const dragState = useRef(null)

  if (!sticker) return null

  const toPercent = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.min(96, Math.max(4, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(96, Math.max(4, ((clientY - rect.top) / rect.height) * 100)),
    }
  }

  const handleBodyPointerDown = (e) => {
    e.stopPropagation()
    onSelect(placement.placementId)
    e.target.setPointerCapture?.(e.pointerId)
    dragState.current = { mode: 'move' }
  }

  const handleRotatePointerDown = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture?.(e.pointerId)
    dragState.current = { mode: 'rotate' }
  }

  const handleResizePointerDown = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture?.(e.pointerId)
    dragState.current = { mode: 'resize' }
  }

  const handlePointerMove = (e) => {
    if (!dragState.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const centerX = rect.left + (placement.x / 100) * rect.width
    const centerY = rect.top + (placement.y / 100) * rect.height

    if (dragState.current.mode === 'move') {
      const { x, y } = toPercent(e.clientX, e.clientY)
      onMove(placement.placementId, x, y)
    } else if (dragState.current.mode === 'rotate') {
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI)
      onRotateResize(placement.placementId, { rotation: angle + 90 })
    } else if (dragState.current.mode === 'resize') {
      const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY)
      const scale = Math.min(3, Math.max(0.4, dist / 40))
      onRotateResize(placement.placementId, { scale })
    }
  }

  const handlePointerUp = () => { dragState.current = null }

  return (
    <div
      className="absolute select-none touch-none"
      style={{
        left: `${placement.x}%`,
        top: `${placement.y}%`,
        transform: `translate(-50%, -50%) rotate(${placement.rotation}deg) scale(${placement.scale})`,
        zIndex: selected ? 20 : 10,
      }}
      onPointerDown={handleBodyPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className={`relative text-5xl leading-none ${selected ? 'drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]' : ''}`}>
        {sticker.emoji}
      </div>
      {selected && (
        <>
          <button
            onPointerDown={handleRotatePointerDown}
            className="absolute -top-7 left-1/2 -translate-x-1/2 bg-indigo-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs btn-press"
          >↻</button>
          <button
            onPointerDown={handleResizePointerDown}
            className="absolute -bottom-2 -right-2 bg-indigo-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs btn-press"
          >⤡</button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(ev) => { ev.stopPropagation(); onDelete(placement.placementId) }}
            className="absolute -top-2 -right-7 bg-red-400 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs btn-press"
          >✕</button>
        </>
      )}
    </div>
  )
}

export default function DiaryPage({ studentData, onBack }) {
  const { stickerTypes, diaryPlacements, streak, placeSticker, updatePlacement, removePlacement } = studentData
  const [selectedId, setSelectedId] = useState(null)
  const [bgId, setBgId] = useState(() => {
    const unlocked = backgroundsUnlockedFor(streak)
    return unlocked[unlocked.length - 1]?.id || 'spring'
  })
  const canvasRef = useRef(null)

  const unlockedBgs = backgroundsUnlockedFor(streak)
  const bg = BACKGROUNDS.find(b => b.id === bgId) || BACKGROUNDS[0]
  const owned = stickerTypes.map(stickerById).filter(Boolean)

  return (
    <div className="min-h-screen p-4 pb-8 bg-gradient-to-br from-pink-50 to-purple-50">
      <div className="flex items-center justify-between max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="text-purple-500 font-bold btn-press">← 홈</button>
        <h1 className="text-xl font-black text-purple-700">📔 My English Diary</h1>
      </div>

      <div className="max-w-lg mx-auto space-y-3">
        {/* Background picker */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {unlockedBgs.map(b => (
            <button key={b.id} onClick={() => setBgId(b.id)}
              className={`flex-shrink-0 px-3 py-2 rounded-2xl text-xs font-bold btn-press border-2 ${bgId === b.id ? 'border-purple-500 bg-purple-100 text-purple-700' : 'border-gray-200 bg-white text-gray-500'}`}>
              {b.emoji} {b.name}
            </button>
          ))}
          {BACKGROUNDS.length > unlockedBgs.length && (
            <div className="flex-shrink-0 px-3 py-2 rounded-2xl text-xs font-bold text-gray-400 bg-gray-100">
              🔒 연속 공부로 배경 잠금 해제!
            </div>
          )}
        </div>

        {/* Diary canvas */}
        <div
          ref={canvasRef}
          onPointerDown={() => setSelectedId(null)}
          className="relative w-full rounded-3xl card-shadow overflow-hidden border-4 border-white"
          style={{ aspectRatio: '3 / 4', background: bg.css }}
        >
          {diaryPlacements.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-center text-gray-400 text-sm px-8">
              아래 스티커를 눌러서 다이어리를 꾸며보세요! ✨
            </p>
          )}
          {diaryPlacements.map(p => (
            <PlacedSticker
              key={p.placementId}
              placement={p}
              selected={selectedId === p.placementId}
              onSelect={setSelectedId}
              canvasRef={canvasRef}
              onMove={(id, x, y) => updatePlacement(id, { x, y })}
              onRotateResize={updatePlacement}
              onDelete={(id) => { removePlacement(id); setSelectedId(null) }}
            />
          ))}
        </div>

        {/* Sticker tray */}
        <div className="bg-white rounded-3xl card-shadow p-4">
          <p className="text-sm font-black text-gray-700 mb-2">🎀 내 스티커함 ({owned.length}개)</p>
          {owned.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">미션을 완료하면 선물상자에서 스티커가 나와요!</p>
          ) : (
            <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto">
              {owned.map(s => (
                <button key={s.id} onClick={() => placeSticker(s.id, 50, 50)}
                  className="text-3xl bg-gray-50 rounded-xl p-2 btn-press hover:bg-purple-50" title={s.name}>
                  {s.emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
