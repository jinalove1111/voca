// 2026-10-10(244차) 하이브리드 월드 가상 조이스틱 — 포인터 캡처(마우스/터치 공용), 96px 베이스, 놓으면 중앙 복귀.
// 이 요소만 포인터를 캡처한다(HUD 버튼의 탭은 가로채지 않음 — 별개 요소, 멀티터치 안전).
import { useRef, useState } from 'react'
import { joystickVector } from '../../../../utils/town/proto2_5d/world/inputVector.js'

const BASE = 96
const KNOB = 40
const MAX_R = (BASE - KNOB) / 2 + 4 // 노브 중심이 움직일 수 있는 반지름

export default function WorldJoystick({ onVector }) {
  const baseRef = useRef(null)
  const idRef = useRef(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const update = (e) => {
    const r = baseRef.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const len = Math.hypot(dx, dy) || 1
    const k = Math.min(len, MAX_R) / len
    setKnob({ x: dx * k, y: dy * k })
    onVector?.(joystickVector(dx, dy, MAX_R))
  }
  const release = (e) => {
    if (idRef.current === null || (e && e.pointerId !== idRef.current)) return
    idRef.current = null
    setKnob({ x: 0, y: 0 })
    onVector?.({ x: 0, y: 0 })
  }
  return (
    <div
      ref={baseRef}
      data-testid="tw-joystick"
      role="presentation"
      onPointerDown={(e) => {
        if (idRef.current !== null) return
        idRef.current = e.pointerId
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 합성 이벤트 등 */ }
        update(e)
      }}
      onPointerMove={(e) => { if (e.pointerId === idRef.current) update(e) }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed', zIndex: 5200, width: BASE, height: BASE, borderRadius: '50%',
        left: 'max(16px, env(safe-area-inset-left))', bottom: 'max(20px, calc(env(safe-area-inset-bottom) + 12px))',
        background: 'rgba(31,42,68,0.16)', border: '2px solid rgba(31,42,68,0.35)',
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
      }}
    >
      <div
        data-testid="tw-joystick-knob"
        data-active={idRef.current !== null ? 'true' : 'false'}
        style={{
          position: 'absolute', left: (BASE - KNOB) / 2, top: (BASE - KNOB) / 2, width: KNOB, height: KNOB, borderRadius: '50%',
          background: '#fffaf0', border: '2px solid #1f2a44', boxShadow: '0 2px 6px rgba(31,42,68,0.3)',
          transform: `translate(${knob.x}px, ${knob.y}px)`, pointerEvents: 'none',
        }}
      />
    </div>
  )
}

export const JOYSTICK_SIZE = BASE
