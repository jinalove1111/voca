// 2026-10-10(244차) 월드 지도(빠른 이동) — 7개 구역 도식(role=dialog). 준비 중 구역은 비활성. 저장/보상 없음.
import { useEffect, useRef } from 'react'
import { ZONES, PLACES } from '../../../../utils/town/proto2_5d/world/worldMap.js'

// 월드 배치와 같은 3x3 도식: 시장 / 공원·광장·학교 / 집·연못·언덕
const AREA = { market: '1 / 1 / 2 / 4', park: '2 / 1 / 3 / 2', plaza: '2 / 2 / 3 / 3', school: '2 / 3 / 3 / 4', home: '3 / 1 / 4 / 2', pond: '3 / 2 / 4 / 3', hill: '3 / 3 / 4 / 4' }
const FOCUSABLE = 'button:not([disabled])'

export default function WorldMap({ currentZone, onTravel, onClose }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.querySelector('[data-testid="tw-map-close"]')?.focus() }, [])
  const trap = (e) => {
    if (e.key !== 'Tab') return
    const f = [...ref.current.querySelectorAll(FOCUSABLE)]
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 6000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, boxSizing: 'border-box' }}>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(31,42,68,0.45)' }} />
      <div
        ref={ref}
        data-testid="tw-map"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tw-map-title"
        onKeyDown={trap}
        style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight: '94dvh', overflowY: 'auto', boxSizing: 'border-box', background: '#fffaf0', color: '#1f2a44', borderRadius: 20, padding: 14, boxShadow: '0 10px 30px rgba(31,42,68,0.3)' }}
      >
        <h2 id="tw-map-title" style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 900 }}>마을 지도</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {ZONES.map((z) => {
            const ready = z.status === 'ready'
            const here = currentZone === z.id
            return (
              <div key={z.id} style={{ gridArea: AREA[z.id], display: 'flex', flexDirection: 'column', gap: 6, padding: 6, borderRadius: 14, background: ready ? '#eef5e8' : '#ece8dd', border: `2px solid ${here ? '#1f2a44' : ready ? '#8fae8b' : '#d4cdb9'}`, opacity: ready ? 1 : 0.8 }}>
                <button
                  type="button"
                  data-testid={`tw-map-zone-${z.id}`}
                  data-status={z.status}
                  disabled={!ready}
                  aria-disabled={!ready}
                  onClick={() => onTravel?.(z.id)}
                  style={{ minHeight: 56, borderRadius: 10, border: 'none', background: ready ? '#8fae8b' : '#d4cdb9', color: ready ? '#fff' : '#6b6757', fontSize: 14, fontWeight: 900, lineHeight: 1.25, padding: '4px 6px', cursor: ready ? 'pointer' : 'not-allowed', wordBreak: 'keep-all' }}
                >
                  {z.nameKo}
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700 }}>{z.subject}</span>
                  {!ready && <span style={{ display: 'block', fontSize: 11, fontWeight: 800 }}>준비 중</span>}
                </button>
                {here && <span data-testid="tw-map-here" style={{ alignSelf: 'center', fontSize: 12, fontWeight: 900, padding: '2px 10px', borderRadius: 999, background: '#1f2a44', color: '#fffaf0' }}>여기</span>}
                {PLACES.filter((p) => p.zone === z.id).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`tw-map-place-${p.id}`}
                    onClick={() => onTravel?.(p.id)}
                    style={{ minHeight: 44, borderRadius: 10, border: '2px solid #1f2a44', background: '#fff', color: '#1f2a44', fontSize: 13, fontWeight: 800, padding: '2px 6px', cursor: 'pointer', wordBreak: 'keep-all' }}
                  >
                    {p.nameKo}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <button type="button" data-testid="tw-map-close" onClick={onClose} style={{ marginTop: 12, minHeight: 48, width: '100%', borderRadius: 14, border: '2px solid #1f2a44', background: '#fff', color: '#1f2a44', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
          닫기
        </button>
      </div>
    </div>
  )
}
