import { useEffect, useState } from 'react'

// 2026-10-05 QA 전용 "오늘 기억할 한 문장" 장면 — 순수 SVG + CSS(이미지/네트워크/소리 없음, SVG 안에 영어 글자 없음).
// 왼쪽 나(나), 가운데 필통/도시락 통, 오른쪽 상대(제이미/미아). data-phase로 현재 모습을 노출한다.
// 뚜껑은 오른쪽 경첩으로 세워 연다 — 왼쪽으로 열면 '나'의 팔과 겹쳐 막대를 든 것처럼 보였다.
// spoon은 한 번만 재생하고 마지막 장면에서 멈춘다. prefers-reduced-motion이면 애니메이션 없이 마지막 장면을 바로 그린다.
const FINAL = { spoon: 'given', ask: 'ask', 'handover-mia': 'handed', 'handover-jamie': 'handed', lunchbox: 'lunchbox' }
const START = { spoon: 'closed', 'handover-mia': 'offer', 'handover-jamie': 'offer' }
const SPOON_STEPS = [['open', 600], ['spoon', 1300], ['surprised', 2000], ['given', 2900]]
const ORDER = ['closed', 'open', 'spoon', 'surprised', 'given']
const PARTNER = { spoon: ['제이미', '#f87171'], lunchbox: ['제이미', '#f87171'], 'handover-jamie': ['제이미', '#f87171'], ask: ['미아', '#c084fc'], 'handover-mia': ['미아', '#c084fc'] }
const LABEL = {
  spoon: '필통 뚜껑이 열리고 연필 대신 숟가락이 나와요. 제이미가 깜짝 놀라고, 나는 내 연필을 제이미에게 건네요. 내 손은 비어요.',
  ask: '내 손은 비어 있고, 옆자리 미아의 열린 필통에는 연필이 여러 자루 있어요.',
  'handover-mia': '미아가 필통에서 연필 한 자루를 꺼내 내 손에 건네 줘요.',
  lunchbox: '제이미가 열린 도시락 통에서 찾은 연필을 들고 있어요. 연필에 요구르트가 조금 묻었어요.',
  'handover-jamie': '제이미가 도시락 통에서 찾은 연필을 내 손에 건네 줘요.',
}
const CSS = `
.pcs-lid{transform-origin:210px 152px;transition:transform .5s ease-out}
.pcs-lid-open{transform:rotate(90deg)}
.pcs-spoon{transform:translate(160px,215px);opacity:0;transition:transform .6s ease-out,opacity .3s}
.pcs-spoon-up{transform:translate(160px,120px);opacity:1}
.pcs-at-me{transform:translate(100px,100px)}
.pcs-at-partner{transform:translate(262px,100px)}
.pcs-fly-give{animation:pcs-give .9s ease-in-out}
.pcs-fly-back{animation:pcs-back .9s ease-in-out}
@keyframes pcs-give{0%{transform:translate(100px,100px)}50%{transform:translate(181px,45px)}100%{transform:translate(262px,100px)}}
@keyframes pcs-back{0%{transform:translate(262px,100px)}50%{transform:translate(181px,45px)}100%{transform:translate(100px,100px)}}
@media (prefers-reduced-motion: reduce){.pcs-scene *{animation:none!important;transition:none!important}}
`
const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function Pencil({ className, dab = false }) {
  return (
    <g className={className}>
      <rect x="-6" y="0" width="12" height="58" fill="#facc15" stroke="#a16207" strokeWidth="2" />
      <polygon points="-6,0 0,-18 6,0" fill="#fcd9a8" stroke="#a16207" strokeWidth="2" />
      <polygon points="-2.5,-8 0,-18 2.5,-8" fill="#374151" />
      <rect x="-6" y="58" width="12" height="11" rx="2" fill="#f9a8d4" stroke="#be185d" strokeWidth="2" />
      {dab && <ellipse cx="0" cy="12" rx="9" ry="6" fill="#fff" stroke="#cbd5e1" strokeWidth="1.5" />}
    </g>
  )
}

function Person({ cx, shirt, surprised = false, tag, flip = false }) {
  const arm = flip ? [[cx - 22, 165], [cx - 43, 150]] : [[cx + 22, 165], [cx + 45, 150]]
  return (
    <g>
      <rect x={cx - 27} y="148" width="54" height="57" rx="14" fill={shirt} />
      <line x1={arm[0][0]} y1={arm[0][1]} x2={arm[1][0]} y2={arm[1][1]} stroke="#fde0c8" strokeWidth="11" strokeLinecap="round" />
      <circle cx={arm[1][0]} cy={arm[1][1]} r="9" fill="#fde0c8" stroke="#d6a77a" strokeWidth="2" />
      <circle cx={cx} cy="112" r="32" fill="#fde0c8" stroke="#d6a77a" strokeWidth="2" />
      {surprised ? (
        <>
          <circle cx={cx - 11} cy="106" r="7" fill="#fff" stroke="#374151" strokeWidth="2" /><circle cx={cx - 11} cy="106" r="3" fill="#374151" />
          <circle cx={cx + 11} cy="106" r="7" fill="#fff" stroke="#374151" strokeWidth="2" /><circle cx={cx + 11} cy="106" r="3" fill="#374151" />
          <ellipse cx={cx} cy="128" rx="6" ry="8" fill="#7f1d1d" />
          <path d={`M${cx + 30} 58 v16 M${cx + 30} 82 v4`} stroke="#ef4444" strokeWidth="5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx={cx - 11} cy="108" r="3.5" fill="#374151" /><circle cx={cx + 11} cy="108" r="3.5" fill="#374151" />
          <path d={`M${cx - 9} 124 q9 8 18 0`} stroke="#7f1d1d" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      )}
      <rect x={cx - 24} y="212" width="48" height="22" rx="11" fill="#fff" stroke="#94a3b8" strokeWidth="2" />
      <text x={cx} y="228" textAnchor="middle" fontSize="15" fontWeight="700" fill="#334155">{tag}</text>
    </g>
  )
}

export default function PencilCaseScene({ variant = 'spoon' }) {
  const [phase, setPhase] = useState(() => (prefersReduced() ? FINAL[variant] : START[variant] || FINAL[variant]))
  useEffect(() => {
    if (prefersReduced()) { setPhase(FINAL[variant]); return undefined }
    setPhase(START[variant] || FINAL[variant])
    const steps = variant === 'spoon' ? SPOON_STEPS : START[variant] ? [['handed', 300]] : []
    const ids = steps.map(([p, ms]) => setTimeout(() => setPhase(p), ms))
    return () => ids.forEach(clearTimeout)
  }, [variant])

  const [partnerName, partnerShirt] = PARTNER[variant]
  const at = ORDER.indexOf(phase)
  const isSpoon = variant === 'spoon'
  const lunch = variant === 'lunchbox' || variant === 'handover-jamie'
  const animate = !prefersReduced()
  const lidOpen = !isSpoon || at >= 1
  // 연필 위치: 내 연필(spoon)·상대 연필(그 외). 건네는 순간에만 한 번 움직인다
  let pen = null
  if (isSpoon) pen = at >= 4 ? `pcs-at-partner${animate ? ' pcs-fly-give' : ''}` : 'pcs-at-me'
  else if (variant !== 'ask') pen = phase === 'handed' ? `pcs-at-me${animate ? ' pcs-fly-back' : ''}` : 'pcs-at-partner'

  return (
    <div className="w-full">
      <style>{CSS}</style>
      <svg data-testid="key-scene" data-variant={variant} data-phase={phase} viewBox="0 0 360 240" role="img" aria-label={LABEL[variant]}
        className="pcs-scene w-full h-auto rounded-3xl bg-sky-50 block">
        <rect x="0" y="205" width="360" height="35" fill="#e0f2fe" />
        <Person cx={55} shirt="#60a5fa" tag="나" />
        <Person cx={305} shirt={partnerShirt} tag={partnerName} flip surprised={isSpoon && at >= 3} />
        {/* 중앙: 필통(spoon/ask/handover-mia) 또는 도시락 통(lunchbox/handover-jamie) */}
        {isSpoon && <g className={`pcs-spoon${at >= 2 ? ' pcs-spoon-up' : ''}`}>
          <ellipse cx="0" cy="0" rx="17" ry="24" fill="#e2e8f0" stroke="#64748b" strokeWidth="3" />
          <rect x="-5" y="22" width="10" height="70" rx="4" fill="#cbd5e1" stroke="#64748b" strokeWidth="3" />
        </g>}
        {variant === 'ask' || variant === 'handover-mia' ? (
          <>
            <rect x="116" y="95" width="88" height="58" rx="10" fill="#fef08a" opacity="0.5" />
            {[132, 152, 172, 192].slice(0, variant === 'ask' ? 4 : 3).map((x, i) => (
              <g key={x} transform={`translate(${x} ${100 + (i % 2) * 6})`}>
                <Pencil />
              </g>
            ))}
          </>
        ) : null}
        {lunch ? (
          <g>
            <rect x="105" y="155" width="110" height="50" rx="10" fill="#fb923c" stroke="#c2410c" strokeWidth="3" />
            <rect x="105" y="128" width="110" height="20" rx="8" fill="#fdba74" stroke="#c2410c" strokeWidth="3" transform="rotate(75 215 150)" />
            <ellipse cx="160" cy="164" rx="30" ry="9" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
          </g>
        ) : (
          <g>
            <rect x="116" y="150" width="88" height="9" fill="#134e4a" />
            <rect className={`pcs-lid${lidOpen ? ' pcs-lid-open' : ''}`} x="110" y="134" width="100" height="18" rx="6" fill="#14b8a6" stroke="#0f766e" strokeWidth="3" />
            <rect x="110" y="152" width="100" height="53" rx="10" fill="#2dd4bf" stroke="#0f766e" strokeWidth="3" />
            <circle cx="160" cy="178" r="8" fill="#99f6e4" stroke="#0f766e" strokeWidth="2" />
          </g>
        )}
        {pen && <g className={pen}><Pencil dab={lunch} /></g>}
      </svg>
    </div>
  )
}
