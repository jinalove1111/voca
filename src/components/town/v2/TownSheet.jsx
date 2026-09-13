// src/components/town/v2/TownSheet.jsx — Paul Town V2-A 하단 시트
// (2026-09-13).
//
// 상점/보관함을 별도 탭이 아니라 씬 위로 여는 바텀시트로 보여준다(V2
// 레이아웃 변경 — 저장/소유권 로직은 전혀 건드리지 않고 V1
// TownShopPanel/TownInventory를 그대로 children으로 얹는다).
//
// 접근성/모바일 폴리시(2026-09-13 V2-B): Escape 닫기, 배경 스크롤 잠금,
// 열릴 때 패널로 포커스 이동 + 닫힐 때 이전 포커스 복원, 패널 내부로
// 포커스 트랩, 노치 기기 safe-area 하단 여백. 훅은 조건부 반환보다
// 위에서 항상 호출해야 하므로 `if (!open) return null`은 훅 아래로
// 옮겼다(React hooks 규칙 — 훅 개수/순서가 렌더마다 달라지면 안 됨).
import { useEffect, useRef } from 'react'

export default function TownSheet({ open, title, onClose, children }) {
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  // 배경 스크롤 잠금 — 열릴 때 body의 기존 inline overflow를 캡처해두고
  // 닫히거나(open이 false로 바뀌거나) 언마운트될 때 정확히 그 값으로
  // 복원한다(다른 컴포넌트가 이미 overflow를 설정해뒀을 수 있으므로
  // ''로 하드코딩하지 않는다).
  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // 포커스 이동 — 열릴 때 패널 자체로 포커스를 옮겨 스크린리더가 즉시
  // 알리게 하고, 열리기 직전의 activeElement를 기억해뒀다가 닫힐 때
  // 그 요소로 포커스를 되돌린다(요소가 여전히 DOM에 있고 focus 가능할
  // 때만).
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      if (dialogRef.current) dialogRef.current.focus()
    } else if (previousFocusRef.current) {
      const el = previousFocusRef.current
      if (el && typeof el.focus === 'function' && document.contains(el)) {
        el.focus()
      }
      previousFocusRef.current = null
    }
  }, [open])

  // Escape 닫기 + 간단한 포커스 트랩(Tab/Shift+Tab을 패널 내부 포커스
  // 가능 요소들 사이에서만 순환).
  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (onClose) onClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusable = Array.from(
        root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey) {
        if (document.activeElement === first || !root.contains(document.activeElement)) {
          event.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 bg-[#1e2a5a]/30 z-[120] min-h-[44px]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="town-sheet"
        className="fixed left-0 right-0 bottom-0 z-[130] max-h-[78vh] overflow-y-auto rounded-t-3xl bg-[#fdf6ea] p-4 pb-[max(2rem,env(safe-area-inset-bottom))] card-shadow motion-safe:animate-fade-in"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-black text-[#1e2a5a]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            data-testid="town-sheet-close"
            className="min-h-[44px] px-3 rounded-xl bg-white text-gray-500 text-xs font-black btn-press"
          >
            닫기
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
