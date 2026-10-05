import { useEffect, useState } from 'react'
import { paulAlmost, paulHappy, paulHello, paulLetsLearn, paulThinking } from '../assets/paul'

// 2026-10-05 QA 전용 "오늘 기억할 한 문장" 장면 — SVG + CSS(네트워크/소리 없음, SVG 글자는 한글 이름표뿐).
// 왼쪽 주인공 '나' = 승인된 Paul 마스코트(src/assets/paul, 원본 그대로 — 모자·얼굴·체형·의상 무가공),
// 가운데 필통/도시락 통, 오른쪽 상대(제이미/미아). data-phase·data-hero-pose로 현재 모습을 노출한다.
// Paul 마스코트에는 연필을 쥐는/건네는 손 포즈가 없어 연필은 SVG로 Paul 옆에 그린다(부족 에셋은 handoff 211차).
// 뚜껑은 오른쪽 경첩으로 세워 연다 — 왼쪽으로 열면 주인공과 겹쳤다.
// spoon은 한 번만 재생하고 마지막 장면에서 멈춘다. prefers-reduced-motion이면 애니메이션 없이 마지막 장면을 바로 그린다.
const FINAL = { spoon: 'given', ask: 'ask', 'handover-mia': 'handed', 'handover-jamie': 'handed', lunchbox: 'lunchbox' }
const START = { spoon: 'closed', 'handover-mia': 'offer', 'handover-jamie': 'offer' }
const SPOON_STEPS = [['open', 600], ['spoon', 1300], ['surprised', 2000], ['given', 2900]]
const ORDER = ['closed', 'open', 'spoon', 'surprised', 'given']
const PARTNER = { spoon: ['제이미', '#f87171'], lunchbox: ['제이미', '#f87171'], 'handover-jamie': ['제이미', '#f87171'], ask: ['미아', '#c084fc'], 'handover-mia': ['미아', '#c084fc'] }
// 단계별 Paul 표정: 궁금 → 깜짝 → 빈 손 → 손가락 들고 묻기 → 받아서 기쁨(one_more는 눈물이 있어 '부탁'보다 '슬픔'으로 읽혀 제외)
const POSE = { closed: 'thinking', open: 'thinking', spoon: 'almost', surprised: 'almost', given: 'hello', ask: 'lets_learn', lunchbox: 'lets_learn', offer: 'lets_learn', handed: 'happy' }
const POSE_SRC = { thinking: paulThinking, almost: paulAlmost, hello: paulHello, lets_learn: paulLetsLearn, happy: paulHappy }
const LABEL = {
  spoon: '필통 뚜껑이 열리고 연필 대신 숟가락이 나와요. 나(폴)와 제이미가 깜짝 놀라고, 나는 내 연필을 제이미에게 건네요. 내 손은 비어요.',
  ask: '내 손은 비어 있고, 옆자리 미아의 열린 필통에는 연필이 여러 자루 있어요. 나(폴)는 손가락 하나를 들고 있어요.',
  'handover-mia': '미아가 필통에서 연필 한 자루를 꺼내 나(폴)에게 건네 줘요. 나는 엄지를 들며 좋아해요.',
  lunchbox: '제이미가 열린 도시락 통에서 찾은 연필을 들고 있어요. 연필에 요구르트가 조금 묻었어요. 나(폴)는 손가락 하나를 들고 있어요.',
  'handover-jamie': '제이미가 도시락 통에서 찾은 연필을 나(폴)에게 건네 줘요. 나는 엄지를 들며 좋아해요.',
}
// 가운데 물건 중심 x(C). 주인공 이미지 0~150, 상대 cx 312
const C = 195
const ME = [138, 100]
const THEM = [268, 100]
const CSS = `
.pcs-lid{transform-origin:${C + 45}px 152px;transition:transform .5s ease-out}
.pcs-lid-open{transform:rotate(90deg)}
.pcs-spoon{transform:translate(${C}px,215px);opacity:0;transition:transform .6s ease-out,opacity .3s}
.pcs-spoon-up{transform:translate(${C}px,120px);opacity:1}
.pcs-at-me{transform:translate(${ME[0]}px,${ME[1]}px)}
.pcs-at-partner{transform:translate(${THEM[0]}px,${THEM[1]}px)}
.pcs-fly-give{animation:pcs-give .9s ease-in-out}
.pcs-fly-back{animation:pcs-back .9s ease-in-out}
@keyframes pcs-give{0%{transform:translate(${ME[0]}px,${ME[1]}px)}50%{transform:translate(${C + 8}px,40px)}100%{transform:translate(${THEM[0]}px,${THEM[1]}px)}}
@keyframes pcs-back{0%{transform:translate(${THEM[0]}px,${THEM[1]}px)}50%{transform:translate(${C + 8}px,40px)}100%{transform:translate(${ME[0]}px,${ME[1]}px)}}
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

function Tag({ cx, children }) {
  return (
    <>
      <rect x={cx - 24} y="212" width="48" height="22" rx="11" fill="#fff" stroke="#94a3b8" strokeWidth="2" />
      <text x={cx} y="228" textAnchor="middle" fontSize="15" fontWeight="700" fill="#334155">{children}</text>
    </>
  )
}

// 상대(제이미/미아) — 기존 단순 SVG 인물, 오른쪽에서 왼쪽을 향한다
function Partner({ cx, shirt, surprised = false, tag }) {
  const arm = [[cx - 22, 165], [cx - 43, 150]]
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
      <Tag cx={cx}>{tag}</Tag>
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
  const pose = POSE[phase]
  // 연필 위치: 내 연필(spoon)·상대 연필(그 외). 건네는 순간에만 한 번 움직인다
  let pen = null
  if (isSpoon) pen = at >= 4 ? `pcs-at-partner${animate ? ' pcs-fly-give' : ''}` : 'pcs-at-me'
  else if (variant !== 'ask') pen = phase === 'handed' ? `pcs-at-me${animate ? ' pcs-fly-back' : ''}` : 'pcs-at-partner'

  return (
    <div className="w-full">
      <style>{CSS}</style>
      <svg data-testid="key-scene" data-variant={variant} data-phase={phase} data-hero-pose={pose} viewBox="0 0 360 240" role="img" aria-label={LABEL[variant]}
        className="pcs-scene w-full h-auto rounded-3xl bg-sky-50 block">
        <rect x="0" y="205" width="360" height="35" fill="#e0f2fe" />
        <image data-testid="key-scene-hero" href={POSE_SRC[pose]} x="0" y="22" width="150" height="183" preserveAspectRatio="xMidYMax meet" />
        <Tag cx={75}>나</Tag>
        <Partner cx={312} shirt={partnerShirt} tag={partnerName} surprised={isSpoon && at >= 3} />
        {/* 중앙: 필통(spoon/ask/handover-mia) 또는 도시락 통(lunchbox/handover-jamie) */}
        {isSpoon && <g className={`pcs-spoon${at >= 2 ? ' pcs-spoon-up' : ''}`}>
          <ellipse cx="0" cy="0" rx="17" ry="24" fill="#e2e8f0" stroke="#64748b" strokeWidth="3" />
          <rect x="-5" y="22" width="10" height="70" rx="4" fill="#cbd5e1" stroke="#64748b" strokeWidth="3" />
        </g>}
        {variant === 'ask' || variant === 'handover-mia' ? (
          <>
            <rect x={C - 44} y="95" width="88" height="58" rx="10" fill="#fef08a" opacity="0.5" />
            {[C - 30, C - 10, C + 10, C + 30].slice(0, variant === 'ask' ? 4 : 3).map((x, i) => (
              <g key={x} transform={`translate(${x} ${100 + (i % 2) * 6})`}>
                <Pencil />
              </g>
            ))}
          </>
        ) : null}
        {lunch ? (
          <g>
            <rect x={C - 50} y="155" width="100" height="50" rx="10" fill="#fb923c" stroke="#c2410c" strokeWidth="3" />
            <rect x={C - 50} y="128" width="100" height="20" rx="8" fill="#fdba74" stroke="#c2410c" strokeWidth="3" transform={`rotate(75 ${C + 50} 150)`} />
            <ellipse cx={C} cy="164" rx="28" ry="9" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
          </g>
        ) : (
          <g>
            <rect x={C - 39} y="150" width="78" height="9" fill="#134e4a" />
            <rect className={`pcs-lid${lidOpen ? ' pcs-lid-open' : ''}`} x={C - 45} y="134" width="90" height="18" rx="6" fill="#14b8a6" stroke="#0f766e" strokeWidth="3" />
            <rect x={C - 45} y="152" width="90" height="53" rx="10" fill="#2dd4bf" stroke="#0f766e" strokeWidth="3" />
            <circle cx={C} cy="178" r="8" fill="#99f6e4" stroke="#0f766e" strokeWidth="2" />
          </g>
        )}
        {pen && <g className={pen}><Pencil dab={lunch} /></g>}
      </svg>
    </div>
  )
}
