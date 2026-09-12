// src/components/town/v2/TownSheet.jsx — Paul Town V2-A 하단 시트
// (2026-09-13).
//
// 상점/보관함을 별도 탭이 아니라 씬 위로 여는 바텀시트로 보여준다(V2
// 레이아웃 변경 — 저장/소유권 로직은 전혀 건드리지 않고 V1
// TownShopPanel/TownInventory를 그대로 children으로 얹는다).
export default function TownSheet({ open, title, onClose, children }) {
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
        role="dialog"
        aria-label={title}
        data-testid="town-sheet"
        className="fixed left-0 right-0 bottom-0 z-[130] max-h-[78vh] overflow-y-auto rounded-t-3xl bg-[#fdf6ea] p-4 pb-8 card-shadow motion-safe:animate-fade-in"
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
