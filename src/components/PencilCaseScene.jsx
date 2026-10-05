import { useEffect, useState } from 'react'
import { paulAlmost, paulHappy, paulLetsLearn, paulPonder, paulThinking } from '../assets/paul'

// 2026-10-05 QA 전용 "오늘 기억할 한 문장" 장면 — SVG + CSS(네트워크/소리 없음, SVG 글자는 한글 이름표뿐).
// 왼쪽 주인공 '나' = 승인된 Paul 마스코트(src/assets/paul 원본 파일 그대로 — 모자·얼굴·체형·의상 무가공),
// 가운데 책상 위 필통/도시락 통, 오른쪽 상대(제이미/미아). data-phase·data-hero-pose로 현재 모습을 노출한다.
// Paul 마스코트에는 연필을 쥐는/건네는 손 포즈가 없다 — 손을 그려 넣지 않고, 연필은 책상 위(내 자리)에 눕혀 두고
// 건넬 때 책상 위로 호를 그리며 상대 손으로 간다. 연필이 떠난 자리는 점선 윤곽으로 "내 손이 빔"을 보여 준다.
// 부족 에셋 목록·제작 프롬프트는 docs/design/SPEAKING_UX_V2_2026-10-04.md §13.
// spoon은 한 번만 재생하고 마지막 장면에서 멈춘다. prefers-reduced-motion이면 애니메이션 없이 마지막 장면을 바로 그린다.
const FINAL = { spoon: 'given', ask: 'ask', 'handover-mia': 'handed', 'handover-jamie': 'handed', lunchbox: 'lunchbox' }
const START = { spoon: 'closed', 'handover-mia': 'offer', 'handover-jamie': 'offer' }
const SPOON_STEPS = [['open', 600], ['spoon', 1300], ['surprised', 2000], ['given', 2900]]
const ORDER = ['closed', 'open', 'spoon', 'surprised', 'given']
const PARTNER = { spoon: ['제이미', '#f87171'], lunchbox: ['제이미', '#f87171'], 'handover-jamie': ['제이미', '#f87171'], ask: ['미아', '#c084fc'], 'handover-mia': ['미아', '#c084fc'] }
// 단계별 Paul 표정: 궁금(thinking) → 깜짝(almost) → 연필을 주고 난처(ponder) → 손가락 들고 묻기(lets_learn) → 받아서 엄지(happy).
// one_more(눈물)·hello(인사로 읽힘)·study/reading(영어 글자)은 쓰지 않는다.
const POSE = { closed: 'thinking', open: 'thinking', spoon: 'almost', surprised: 'almost', given: 'ponder', ask: 'lets_learn', lunchbox: 'lets_learn', offer: 'lets_learn', handed: 'happy' }
// 원본 크기 그대로 같은 배율(K)로 그리고 모자 중심·모자 꼭대기를 맞춘다(실측: 모자 챙 폭 91~96px로 같은 그림 크기).
// lets_learn만 원본 안의 인물이 작게(챙 64px) 그려져 있어 1.48배, 오른쪽 전구 부분은 표시 영역(viewBox)에서 잘라낸다(파일 무변경).
const K = 0.92
const HEAD_X = 82
const HAT_TOP = 16
const POSE_ART = {
  thinking: { src: paulThinking, w: 140, h: 184, cx: 66, top: 8 },
  almost: { src: paulAlmost, w: 184, h: 181, cx: 92, top: 8 },
  ponder: { src: paulPonder, w: 150, h: 182, cx: 82, top: 8 },
  lets_learn: { src: paulLetsLearn, w: 134, h: 129, cx: 55, top: 6, scale: 1.48, cropW: 100 },
  happy: { src: paulHappy, w: 144, h: 193, cx: 78, top: 8 },
}
const LABEL = {
  spoon: '제이미의 필통 뚜껑이 열리고 연필 대신 숟가락이 나와요. 나(폴)와 제이미가 깜짝 놀라요. 나는 책상 위 내 연필을 제이미에게 건네요. 내 자리는 비어요.',
  ask: '내 책상 위 연필 자리는 비어 있어요. 앞자리 미아의 열린 필통에는 연필이 여러 자루 있어요. 나(폴)는 손가락 하나를 들고 있어요.',
  'handover-mia': '미아가 연필 한 자루를 내 책상 위에 건네 줘요. 나(폴)는 엄지를 들며 좋아해요.',
  lunchbox: '내 책상 위 연필 자리는 비어 있어요. 제이미가 열린 도시락 통에서 찾은 연필을 들고 있어요. 연필에 요구르트가 조금 묻었어요.',
  'handover-jamie': '제이미가 도시락 통에서 찾은 연필을 내 책상 위에 건네 줘요. 나(폴)는 엄지를 들며 좋아해요.',
}
const DESK = 174
const C = 212
const ME = [118, DESK + 9]
const THEM = [276, 142]
const PEAK = [200, 100]
const CSS = `
.pcs-lid,.pcs-lid-up{transition:opacity .4s ease-out}
.pcs-hide{opacity:0}
.pcs-spoon{transform:translate(${C}px,190px);opacity:0;transition:transform .6s ease-out,opacity .3s}
.pcs-spoon-up{transform:translate(${C}px,108px);opacity:1}
.pcs-at-me{transform:translate(${ME[0]}px,${ME[1]}px)}
.pcs-at-partner{transform:translate(${THEM[0]}px,${THEM[1]}px)}
.pcs-fly-give{animation:pcs-give .9s ease-in-out}
.pcs-fly-back{animation:pcs-back .9s ease-in-out}
@keyframes pcs-give{0%{transform:translate(${ME[0]}px,${ME[1]}px)}50%{transform:translate(${PEAK[0]}px,${PEAK[1]}px)}100%{transform:translate(${THEM[0]}px,${THEM[1]}px)}}
@keyframes pcs-back{0%{transform:translate(${THEM[0]}px,${THEM[1]}px)}50%{transform:translate(${PEAK[0]}px,${PEAK[1]}px)}100%{transform:translate(${ME[0]}px,${ME[1]}px)}}
@media (prefers-reduced-motion: reduce){.pcs-scene *{animation:none!important;transition:none!important}}
`
const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// 책상 위에 눕힌 연필(가운데 원점, 길이 56). 건넬 때 이 모양 그대로 움직인다
function FlatPencil({ className, dab = false }) {
  return (
    <g className={className}>
      <polygon points="-28,0 -18,-5.5 -18,5.5" fill="#fcd9a8" stroke="#a16207" strokeWidth="1.5" />
      <polygon points="-28,0 -24,-2.2 -24,2.2" fill="#374151" />
      <rect x="-18" y="-5.5" width="38" height="11" fill="#facc15" stroke="#a16207" strokeWidth="1.5" />
      <rect x="20" y="-5.5" width="8" height="11" rx="2" fill="#f9a8d4" stroke="#be185d" strokeWidth="1.5" />
      {dab && <ellipse cx="2" cy="0" rx="7" ry="5" fill="#fff" stroke="#cbd5e1" strokeWidth="1.2" />}
    </g>
  )
}

// 필통 안에 세워 꽂힌 연필(미아의 필통)
function UprightPencil({ x }) {
  return (
    <g transform={`translate(${x} 86)`}>
      <rect x="-6" y="0" width="12" height="58" fill="#facc15" stroke="#a16207" strokeWidth="2" />
      <polygon points="-6,0 0,-18 6,0" fill="#fcd9a8" stroke="#a16207" strokeWidth="2" />
      <polygon points="-2.5,-8 0,-18 2.5,-8" fill="#374151" />
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

function Hero({ pose }) {
  const a = POSE_ART[pose]
  const s = K * (a.scale || 1)
  const cropW = a.cropW || a.w
  // 중첩 svg: 원본 이미지를 그대로 두고 표시 영역만 정한다(lets_learn 전구 잘라내기)
  return (
    <svg x={HEAD_X - a.cx * s} y={HAT_TOP - a.top * s} width={cropW * s} height={a.h * s} viewBox={`0 0 ${cropW} ${a.h}`} overflow="hidden">
      <image data-testid="key-scene-hero" href={a.src} x="0" y="0" width={a.w} height={a.h} />
    </svg>
  )
}

// 상대(제이미/미아) — 단순 SVG 인물, 오른쪽에서 왼쪽을 향하고 손이 책상 위로 나온다
function Partner({ cx, shirt, surprised = false }) {
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
        </>
      ) : (
        <>
          <circle cx={cx - 11} cy="108" r="3.5" fill="#374151" /><circle cx={cx + 11} cy="108" r="3.5" fill="#374151" />
          <path d={`M${cx - 9} 124 q9 8 18 0`} stroke="#7f1d1d" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      )}
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
  // 연필 위치: spoon은 내 연필(내 책상 → 제이미 손), 그 외는 상대 연필(상대 손 → 내 책상). 건네는 순간에만 한 번 움직인다
  let pen = null
  if (isSpoon) pen = at >= 4 ? `pcs-at-partner${animate ? ' pcs-fly-give' : ''}` : 'pcs-at-me'
  else if (variant !== 'ask') pen = phase === 'handed' ? `pcs-at-me${animate ? ' pcs-fly-back' : ''}` : 'pcs-at-partner'
  const mySpotEmpty = isSpoon ? at >= 4 : phase !== 'handed'

  return (
    <div className="w-full">
      <style>{CSS}</style>
      <svg data-testid="key-scene" data-variant={variant} data-phase={phase} data-hero-pose={pose} data-my-spot={mySpotEmpty ? 'empty' : 'pencil'}
        viewBox="0 0 360 240" role="img" aria-label={LABEL[variant]} className="pcs-scene w-full h-auto rounded-3xl bg-sky-50 block">
        <Hero pose={pose} />
        <Partner cx={318} shirt={partnerShirt} surprised={isSpoon && at >= 3} />
        {/* 가운데: 필통(spoon/ask/handover-mia) 또는 도시락 통(lunchbox/handover-jamie). 뚜껑은 위로 세워 열린다 */}
        {lunch ? (
          <g>
            <polygon points={`${C - 50},140 ${C + 50},140 ${C + 40},106 ${C - 40},106`} fill="#fed7aa" stroke="#c2410c" strokeWidth="2.5" strokeLinejoin="round" />
            <rect x={C - 50} y="140" width="100" height={DESK - 140} rx="10" fill="#fb923c" stroke="#c2410c" strokeWidth="3" />
            <ellipse cx={C} cy="148" rx="28" ry="7" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
          </g>
        ) : (
          <g>
            <polygon className={`pcs-lid-up${lidOpen ? '' : ' pcs-hide'}`} points={`${C - 45},136 ${C + 45},136 ${C + 36},100 ${C - 36},100`} fill="#5eead4" stroke="#0f766e" strokeWidth="2.5" strokeLinejoin="round" />
            <rect className={`pcs-lid${lidOpen ? ' pcs-hide' : ''}`} x={C - 45} y="122" width="90" height="14" rx="5" fill="#14b8a6" stroke="#0f766e" strokeWidth="2" />
            {variant === 'ask' || variant === 'handover-mia'
              ? [C - 27, C - 9, C + 9, C + 27].slice(0, variant === 'ask' ? 4 : 3).map((x) => <UprightPencil key={x} x={x} />)
              : null}
            {isSpoon && <g className={`pcs-spoon${at >= 2 ? ' pcs-spoon-up' : ''}`}>
              <rect x="-5" y="20" width="10" height="80" rx="4" fill="#cbd5e1" stroke="#64748b" strokeWidth="3" />
              <ellipse cx="0" cy="0" rx="18" ry="26" fill="#e2e8f0" stroke="#64748b" strokeWidth="3" />
            </g>}
            <rect x={C - 45} y="134" width="90" height={DESK - 134} rx="9" fill="#2dd4bf" stroke="#0f766e" strokeWidth="3" />
            <circle cx={C} cy="154" r="7" fill="#99f6e4" stroke="#0f766e" strokeWidth="2" />
          </g>
        )}
        {/* 숟가락이 나오면 필통 위 느낌표(흔들림 없음) */}
        {isSpoon && at >= 2 && <path d={`M${C + 40} 66 v16 M${C + 40} 90 v3`} stroke="#ef4444" strokeWidth="5" strokeLinecap="round" fill="none" />}
        {/* 책상: 인물 하반신을 가리고 소품이 그 위에 놓인다 */}
        <rect x="0" y={DESK} width="360" height={240 - DESK} fill="#f3d9a4" />
        <line x1="0" y1={DESK} x2="360" y2={DESK} stroke="#c08a3e" strokeWidth="3" />
        {mySpotEmpty && <rect data-testid="key-scene-empty-spot" x={ME[0] - 30} y={ME[1] - 7.5} width="60" height="15" rx="4" fill="#fef3c7" stroke="#78716c" strokeWidth="2" strokeDasharray="5 3" />}
        <Tag cx={82}>나</Tag>
        <Tag cx={318}>{partnerName}</Tag>
        {pen && <g className={pen}><FlatPencil dab={lunch} /></g>}
      </svg>
    </div>
  )
}
