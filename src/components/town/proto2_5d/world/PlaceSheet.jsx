// 2026-10-10(244차) 장소 시트 — 학습 장소의 미션 목록(role=dialog). 보상/저장 없음, 선택은 상위가 처리한다.
import { useEffect, useRef } from 'react'
import { grammarUnitById } from '../../../../utils/grammar/grammarUnits.js'

export const missionLabel = (m) => {
  if (m.kind === 'grammar') return { main: grammarUnitById(m.unitId)?.titleKo || m.unitId, sub: 'Grammar' }
  if (m.kind === 'writing') return { main: '쓰기 연습 고르기', sub: 'Writing' }
  if (m.kind === 'course') return { main: '발표 과정 열기', sub: 'Presentation' }
  return { main: '미션', sub: '' }
}

const FOCUSABLE = 'button:not([disabled])'

export default function PlaceSheet({ place, completedUnitIds = [], wasVisited = false, missionsOpen = true, onMission, onClose }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.querySelector(FOCUSABLE)?.focus() }, [])
  const trap = (e) => {
    if (e.key !== 'Tab') return
    const f = [...ref.current.querySelectorAll(FOCUSABLE)]
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 6000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(31,42,68,0.4)' }} />
      <div
        ref={ref}
        data-testid="tw-place-sheet"
        data-place={place.id}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tw-place-title"
        onKeyDown={trap}
        style={{
          position: 'relative', width: '100%', maxWidth: 480, maxHeight: '86dvh', overflowY: 'auto', boxSizing: 'border-box',
          background: '#fffaf0', color: '#1f2a44', borderRadius: '20px 20px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))',
          boxShadow: '0 -6px 24px rgba(31,42,68,0.25)',
        }}
      >
        <h2 id="tw-place-title" data-testid="tw-place-title" style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{place.nameKo}</h2>
        <p data-testid="tw-place-do" style={{ margin: '4px 0 12px', fontSize: 15, lineHeight: 1.45, wordBreak: 'keep-all' }}>{place.doKo}</p>
        {!missionsOpen && (
          <p data-testid="tw-missions-closed" style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800, color: '#5d7a59' }}>이 계정은 마을 걷기와 지도 이동만 테스트해요.</p>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {place.missions.map((m, i) => {
            const { main, sub } = missionLabel(m)
            const done = m.kind === 'grammar' ? completedUnitIds.includes(m.unitId) : wasVisited
            return (
              <button
                key={i}
                type="button"
                data-testid={`tw-mission-${i}`}
                data-kind={m.kind}
                disabled={!missionsOpen}
                onClick={() => onMission?.(m, i)}
                style={{
                  minHeight: 56, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left',
                  padding: '8px 14px', borderRadius: 14, border: '2px solid #8fae8b', background: '#eef5e8', color: '#1f2a44', fontSize: 16, fontWeight: 800, cursor: missionsOpen ? 'pointer' : 'not-allowed', opacity: missionsOpen ? 1 : 0.6,
                }}
              >
                <span style={{ wordBreak: 'keep-all' }}>{main}<span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#5d7a59' }}>{sub}</span></span>
                {done && (
                  <span data-testid={`tw-mission-done-${i}`} data-kind={m.kind} style={{ flex: 'none', fontSize: 13, fontWeight: 900, padding: '4px 10px', borderRadius: 999, background: m.kind === 'grammar' ? '#8fae8b' : '#e9dfc4', color: m.kind === 'grammar' ? '#fff' : '#1f2a44' }}>
                    {m.kind === 'grammar' ? '완료' : '다녀옴'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button type="button" data-testid="tw-sheet-close" onClick={onClose} style={{ marginTop: 12, minHeight: 48, width: '100%', borderRadius: 14, border: '2px solid #1f2a44', background: '#fff', color: '#1f2a44', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
          닫기
        </button>
      </div>
    </div>
  )
}
