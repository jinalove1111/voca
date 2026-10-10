import { townAsset } from '../../assets/town'
import { paulHappy } from '../../assets/paul'
import { tally } from '../../utils/grammar/sceneMission'

// 2026-10-10 Paul Town 공원 그림(인라인 SVG). 문장·정답은 그림에 넣지 않는다(aria-label도 한국어 설명만).
// TODO assets (운영자가 주면 아래 임시 도형만 교체): 공원 배경 일러스트(하늘·잔디·길), 쿠키 전용 강아지 그림(지금은 Town puppy 스프라이트가 쿠키 역할),
//   공(ball) 그림, 꽃(flowers) 그림. 나무·벤치·강아지는 townAsset(nature/tree, decorations/bench, animals/puppy) 그대로 쓴다.
const KO = { dog: '강아지', tree: '나무', bench: '벤치', ball: '공' }
// 자산 기준 크기(viewBox 단위). h는 바닥(y)에서 위로 올라오는 높이
const ART = { tree: { key: 'nature/tree', w: 48, h: 64 }, bench: { key: 'decorations/bench', w: 54, h: 36 }, dog: { key: 'animals/puppy', w: 54, h: 40 }, ball: { w: 16, h: 16 } }
const GROUND = 188
export const artUrl = (obj) => (ART[obj]?.key ? townAsset(ART[obj].key) : null)

function Obj({ obj, i, x, y, w, h, hl, tap, reduced, cookie }) {
  const url = ART[obj]?.key ? townAsset(ART[obj].key) : null
  const name = KO[obj] || obj
  const hitW = Math.max(w, 44), hitH = Math.max(h, 44)
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(obj, i) } }
  return (
    <g data-testid={`scene-obj-${obj}-${i}`} data-obj={obj} data-hl={hl ? 'true' : 'false'} {...(tap ? { tabIndex: 0, role: 'button', 'aria-label': `${name} ${i + 1}`, onClick: () => tap(obj, i), onKeyDown: key, style: { cursor: 'pointer', outline: 'none' } } : { 'aria-hidden': true })}>
      {hl && <ellipse cx={x} cy={y - h / 2} rx={w / 2 + 8} ry={h / 2 + 8} fill="#fde68a" stroke="#f59e0b" strokeWidth="3" opacity="0.85" className={reduced ? '' : 'motion-safe:animate-pulse'} />}
      {tap && <rect x={x - hitW / 2} y={y - hitH} width={hitW} height={hitH} fill="transparent" />}
      <ellipse cx={x} cy={y} rx={w / 2.2} ry="4" fill="#000" opacity="0.12" />
      {url ? <image href={url} x={x - w / 2} y={y - h} width={w} height={h} preserveAspectRatio="xMidYMax meet" /> : <circle cx={x} cy={y - 8} r="8" fill="#ef4444" stroke="#991b1b" strokeWidth="1.5" />}
      {cookie && <text x={x} y={y + 14} textAnchor="middle" fontSize="11" fontWeight="800" fill="#1f2937">Cookie</text>}
    </g>
  )
}

// layout: 이 장면에 그려진 물건 [{obj,n}], placed: 내가 놓은 물건 [{obj,x,y}](x 가운데·y 바닥), spots: 놓을 수 있는 빈 자리 [{x,y}]
export default function ParkScene({ layout = [], placed = [], highlight = null, onTapObject, onTapSpot, spots = [], showPaul = true, showCookie = true, size = 'md', reduced = false }) {
  const flat = layout.flatMap(({ obj, n }) => Array.from({ length: n }, () => obj))
  const seen = {}
  const next = (obj) => (seen[obj] = (seen[obj] ?? -1) + 1)
  const slotW = Math.min(64, 284 / Math.max(flat.length, 1))
  const items = [
    ...flat.map((obj, k) => ({ obj, x: 66 + slotW * (k + 0.5), y: GROUND, fit: slotW - 4 })),
    ...placed.map((p) => ({ obj: p.obj, x: p.x, y: p.y, fit: 64 })),
  ].map((it) => { const a = ART[it.obj] || ART.ball; const s = Math.min(1, it.fit / a.w); return { ...it, i: next(it.obj), w: a.w * s, h: a.h * s } })
  const counts = tally(items)
  const desc = Object.entries(counts).map(([o, n]) => `${KO[o] || o} ${n}`).join(', ')
  return (
    <svg data-testid="park-scene" data-counts={Object.entries(counts).map(([o, n]) => `${o}:${n}`).join(',')} data-size={size} viewBox="0 0 360 220" role="img" aria-label={`공원 그림${desc ? `: ${desc}` : ': 비어 있음'}`}
      className={`block w-full ${size === 'sm' ? 'max-w-[170px]' : 'max-w-[360px]'} h-auto mx-auto rounded-2xl select-none`}>
      <rect width="360" height="220" fill="#bfe6ff" />
      <circle cx="318" cy="34" r="18" fill="#fde047" />
      <ellipse cx="80" cy="40" rx="34" ry="12" fill="#fff" opacity="0.9" /><ellipse cx="108" cy="34" rx="24" ry="10" fill="#fff" opacity="0.9" />
      <rect y="116" width="360" height="104" fill="#a7dc8c" />
      <ellipse cx="190" cy="206" rx="170" ry="14" fill="#e9d8a6" opacity="0.8" />
      {showPaul && <image href={paulHappy} x="2" y="128" width="58" height="62" preserveAspectRatio="xMidYMax meet" aria-hidden="true" data-testid="scene-paul" />}
      {items.map((it) => <Obj key={`${it.obj}-${it.i}`} {...it} hl={highlight === it.obj} tap={onTapObject} reduced={reduced} cookie={showCookie && it.obj === 'dog' && it.i === 0 && size !== 'sm'} />)}
      {spots.map((s, i) => (
        <g key={i} data-testid={`scene-spot-${i}`} role="button" tabIndex={0} aria-label="여기에 놓기" style={{ cursor: 'pointer', outline: 'none' }}
          onClick={() => onTapSpot?.(s.x, s.y, i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTapSpot?.(s.x, s.y, i) } }}>
          <rect x={s.x - 28} y={s.y - 52} width="56" height="56" rx="12" fill="#fff" fillOpacity="0.55" stroke="#0ea5e9" strokeWidth="2.5" strokeDasharray="6 4" />
          <text x={s.x} y={s.y - 16} textAnchor="middle" fontSize="26" fontWeight="900" fill="#0284c7">+</text>
        </g>
      ))}
    </svg>
  )
}
