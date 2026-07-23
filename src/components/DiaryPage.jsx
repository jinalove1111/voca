import { useState, useRef } from 'react'
import { STICKERS } from '../data/stickers'
import { BACKGROUNDS, backgroundsUnlockedFor } from '../data/backgrounds'

const stickerById = (id) => STICKERS.find(s => s.id === id)

// 크기 조절 단계/한계 — 예전 드래그 핸들 시절의 한계(0.4~3)를 그대로 유지
// (기존 학생 데이터에 이미 이 범위의 scale이 저장돼 있음).
const SCALE_MIN = 0.4
const SCALE_MAX = 3
const SCALE_STEP = 0.2
const ROTATE_STEP = 15 // 한 번 탭에 15도 — 초등학생 기준 예측 가능한 버튼식

// One sticker already placed on the diary page — draggable by its body to
// move it. Rotation / resize / layer order / delete are handled by the big
// button toolbar under the canvas (DiaryPage below) — the old tiny on-sticker
// drag handles were removed on purpose (2026-07-16): they lived INSIDE the
// rotated+scaled element, so a shrunk sticker (scale 0.4) shrank its own
// buttons to ~10px, which is untappable for kids and was the remaining
// root cause of the "X 버튼 터치 씹힘" reports even after the c3a3800
// stopPropagation fix. The ✕ button is kept for convenience but counter-
// scaled (inline transform below) so it stays the same touch size no matter
// how much the sticker itself is scaled.
//
// 하위호환: 아주 예전 배치 데이터에는 rotation/scale 필드가 없을 수 있다 —
// undefined가 transform 문자열에 들어가면 transform 전체가 무효가 되어
// translate(-50%,-50%)까지 사라져 스티커 위치가 통째로 틀어지므로, 읽을
// 때 항상 (|| 0)/(|| 1)로 방어한다.
function PlacedSticker({ placement, selected, onSelect, canvasRef, onMove, onDelete }) {
  const sticker = stickerById(placement.stickerId)
  const dragState = useRef(null)

  if (!sticker) return null

  const rotation = placement.rotation || 0
  const scale = placement.scale || 1

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

  const handlePointerMove = (e) => {
    if (!dragState.current) return
    const { x, y } = toPercent(e.clientX, e.clientY)
    onMove(placement.placementId, x, y)
  }

  const handlePointerUp = () => { dragState.current = null }

  return (
    <div
      className="absolute select-none touch-none"
      style={{
        left: `${placement.x}%`,
        top: `${placement.y}%`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
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
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(ev) => { ev.stopPropagation(); onDelete(placement.placementId) }}
          className="absolute -top-3 -right-8 bg-red-400 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
          // 부모의 scale을 정확히 상쇄 — 스티커를 아무리 작게/크게 해도 이
          // 버튼의 실제 터치 크기는 항상 동일(28px). btn-press의 :active
          // transform은 인라인 스타일에 밀려 안 먹으므로 아예 안 붙임.
          style={{ transform: `scale(${1 / scale})` }}
          aria-label="스티커 삭제"
        >✕</button>
      )}
    </div>
  )
}

// 툴바 버튼 — 초등학생 손가락 기준의 큰 터치 영역(캔버스 밖 고정 위치라
// 스티커 크기/회전/겹침과 무관하게 항상 같은 자리, 같은 크기).
function ToolBtn({ icon, label, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 btn-press border-2 ${
        danger
          ? 'border-red-100 bg-red-50 text-red-500'
          : 'border-gray-100 bg-gray-50 text-gray-600'
      } ${disabled ? 'opacity-30' : ''}`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  )
}

export default function DiaryPage({ studentData, onBack }) {
  const { stickerTypes, diaryPlacements, streak, placeSticker, updatePlacement, removePlacement, movePlacementLayer } = studentData
  const [selectedId, setSelectedId] = useState(null)
  const [bgId, setBgId] = useState(() => {
    const unlocked = backgroundsUnlockedFor(streak)
    return unlocked[unlocked.length - 1]?.id || 'spring'
  })
  const canvasRef = useRef(null)

  const unlockedBgs = backgroundsUnlockedFor(streak)
  const bg = BACKGROUNDS.find(b => b.id === bgId) || BACKGROUNDS[0]
  const owned = stickerTypes.map(stickerById).filter(Boolean)

  const selectedIdx = diaryPlacements.findIndex(p => p.placementId === selectedId)
  const selectedPlacement = selectedIdx >= 0 ? diaryPlacements[selectedIdx] : null
  const selScale = selectedPlacement ? (selectedPlacement.scale || 1) : 1

  const rotateBy = (delta) =>
    updatePlacement(selectedId, { rotation: (selectedPlacement.rotation || 0) + delta })
  const scaleBy = (delta) =>
    updatePlacement(selectedId, { scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, selScale + delta)) })

  return (
    <div className="min-h-screen p-4 pb-8 bg-gradient-to-br from-pink-50 to-purple-50">
      <div className="flex items-center justify-between max-w-lg mx-auto pt-2 mb-4">
        <button onClick={onBack} className="py-3 px-2 -my-3 -mx-2 text-purple-500 font-bold btn-press">← 홈</button>
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

        {/* Diary canvas — 배열 순서 = 그리기 순서(뒤 = 위). 레이어 이동은
            아래 툴바의 앞으로/뒤로 버튼이 배열을 재정렬하는 것으로 처리
            (movePlacementLayer, 스키마 변경 없음). */}
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
              onDelete={(id) => { removePlacement(id); setSelectedId(null) }}
            />
          ))}
        </div>

        {/* 선택한 스티커 꾸미기 툴바 — 스티커가 선택된 동안만 표시. 예전의
            스티커 위 미니 드래그 핸들(회전/크기)을 대체하는 버튼식 조작:
            항상 같은 자리에 있는 큰 버튼이라 스티커가 작거나 회전해 있어도
            터치가 절대 안 씹힘. */}
        {selectedPlacement && (
          <div className="bg-white rounded-3xl card-shadow p-3 animate-slide-up">
            <p className="text-center text-[11px] font-bold text-gray-400 mb-2">
              {stickerById(selectedPlacement.stickerId)?.emoji} 스티커 꾸미기 — 스티커를 손가락으로 끌면 움직여요
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              <ToolBtn icon="↺" label="왼쪽" onClick={() => rotateBy(-ROTATE_STEP)} />
              <ToolBtn icon="↻" label="오른쪽" onClick={() => rotateBy(ROTATE_STEP)} />
              <ToolBtn icon="➖" label="작게" onClick={() => scaleBy(-SCALE_STEP)} disabled={selScale <= SCALE_MIN + 0.001} />
              <ToolBtn icon="➕" label="크게" onClick={() => scaleBy(SCALE_STEP)} disabled={selScale >= SCALE_MAX - 0.001} />
              <ToolBtn icon="⬆️" label="앞으로" onClick={() => movePlacementLayer(selectedId, 'front')} disabled={selectedIdx >= diaryPlacements.length - 1} />
              <ToolBtn icon="⬇️" label="뒤로" onClick={() => movePlacementLayer(selectedId, 'back')} disabled={selectedIdx <= 0} />
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-2 pt-2 border-t border-gray-100">
              <div className="col-span-3" />
              <ToolBtn icon="🗑️" label="삭제" onClick={() => { removePlacement(selectedId); setSelectedId(null) }} danger />
            </div>
          </div>
        )}

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
