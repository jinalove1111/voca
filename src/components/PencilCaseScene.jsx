import { useEffect, useState } from 'react'
import paulSpeaking from '../assets/speaking/paul_speaking.png'
import miaGreet from '../assets/speaking/mia_greet.png'
import miaThink from '../assets/speaking/mia_think.png'
import miaSurprise from '../assets/speaking/mia_surprise.png'
import miaGivePencil from '../assets/speaking/mia_give_pencil.png'

// 2026-10-05 QA 전용 "오늘 기억할 한 문장" 장면 — SVG + CSS(네트워크/소리 없음, SVG 글자는 한글 이름표뿐).
// 등장인물은 두 명뿐: 왼쪽 '나' = 운영자 제공 Paul 기준 얼굴(src/assets/speaking/paul_speaking.png, 216차 — 이전 저화질 마스코트 4포즈 대체),
// 오른쪽 '미아' = 운영자 제공 여성 캐릭터
// (src/assets/speaking/mia_*.png, 4포즈 분리본). 임시 SVG 인물(제이미)은 213차 운영자 정정으로 없앴다.
// 이야기: ① 내 필통에서 연필 대신 숟가락 → 둘 다 놀람 → 내가 묻고 → 미아가 연필을 건넴
//        ② 연필심이 부러짐 → 미아에게 다시 ③ 다음 날 필통을 통째로 두고 옴 → 미아에게 다시.
// Paul·미아 원본에 없는 손/표정은 그리지 않는다 — 연필은 미아의 '연필 건네기' 그림 속 연필로 내밀고, 이어서 SVG 연필이
// 미아 손에서 Paul 앞 책상으로 호를 그리며 온다(미아는 빈 손 인사로 바뀜). 빈 자리는 점선 윤곽으로 보여 준다.
// data-phase·data-hero-pose·data-partner-pose·data-my-spot으로 현재 모습을 노출한다. 부족 에셋은 설계 문서 §13.6/§15.
// 한 번만 재생하고 마지막 장면에서 멈춘다. prefers-reduced-motion이면 애니메이션 없이 마지막 장면을 바로 그린다.
const FINAL = { spoon: 'handed', ask: 'ask', 'handover-mia': 'handed', forgot: 'forgot', 'handover-forgot': 'handed' }
const START = { spoon: 'closed', 'handover-mia': 'offer', 'handover-forgot': 'offer' }
const OFFER_MS = 700
const SPOON_STEPS = [['open', 600], ['spoon', 1300], ['ask', 2400], ['offer', 3100], ['handed', 3800]]
// Paul 기준 그림은 한 포즈(엄지 척)뿐 — 단계 구분은 미아 표정·소품·'?' 말풍선(묻는 순간)으로 한다. 원본에 없는 표정은 만들지 않는다
const ASKING = ['ask', 'forgot', 'offer']
// 미아: 생각(think) → 놀람(surprise) → 연필 건네기(give) → 빈 손 인사(greet)
const MIA_POSE = { closed: 'think', open: 'think', spoon: 'surprise', ask: 'think', forgot: 'think', offer: 'give', handed: 'greet' }
// Paul: 분리본도 모자 챙 160px로 정규화 → 미아와 같은 배율 0.5(챙 80단위)로 그려 얼굴 크기를 맞춘다. 모자 중심 x 82, 꼭대기 y 30(미아와 같음)
const PAUL = { src: paulSpeaking, w: 327, h: 491, cx: 170, top: 25 }
const PAUL_S = 0.5
const HEAD_X = 82
const HAT_TOP = 30
// 미아: 분리본은 모자 챙 160px로 정규화. 표시 배율 0.5(챙 80단위 — Paul 87과 비슷한 얼굴 크기), 모자 중심 x 245, 꼭대기 y 30.
// 몸 아래는 책상에 가려지고, 미아 필통은 가슴 앞 낮게 두어 연필 끝이 턱 아래에 머문다(얼굴을 가리지 않음)
const MIA_S = 0.5
const MIA_X = 245
const MIA_TOP = 30
const MIA_ART = {
  think: { src: miaThink, w: 222, h: 328, cx: 85, top: 3 },
  surprise: { src: miaSurprise, w: 374, h: 319, cx: 181, top: 5 },
  give: { src: miaGivePencil, w: 269, h: 311, cx: 116, top: 4 },
  greet: { src: miaGreet, w: 407, h: 317, cx: 182, top: 2 },
}
const LABEL = {
  spoon: '내 필통 뚜껑이 열리고 연필 대신 숟가락이 나와요. 나(폴)와 미아가 깜짝 놀라요. 미아가 연필 한 자루를 내밀고, 그 연필이 내 책상 위로 와요. 나는 엄지를 들며 좋아해요.',
  ask: '그림을 그리다 내 연필심이 부러졌어요. 앞자리 미아는 연필이 여러 자루 꽂힌 필통 앞에서 생각에 잠겨 있어요. 나(폴)는 손가락 하나를 들고 있어요.',
  'handover-mia': '미아가 연필 한 자루를 내밀고, 그 연필이 내 책상 위로 와요. 미아는 빈 손을 펴 보이고, 나(폴)는 엄지를 들며 좋아해요.',
  forgot: '다음 날, 내 책상에는 필통이 없어요(점선 자리). 미아는 연필이 꽂힌 필통 앞에 있어요. 나(폴)는 손가락 하나를 들고 있어요.',
  'handover-forgot': '미아가 연필 한 자루를 내밀고, 그 연필이 필통 없는 내 책상 위로 와요. 미아는 빈 손을 펴 보이고, 나(폴)는 엄지를 들며 좋아해요.',
}
const DESK = 174
const PC = 118 // 내 필통 중심 x(Paul 앞 책상 위)
const ME = [118, DESK + 9] // 내 연필 자리(책상 앞면)
const MIA_HAND = [205, 138] // 연필 건네기 그림 속 미아 손 근처
const MIA_CASE = 248
const PEAK = [170, 96]
const CSS = `
.pcs-lid,.pcs-lid-up{transition:opacity .4s ease-out}
.pcs-hide{opacity:0}
.pcs-spoon{transform:translate(${PC}px,190px);opacity:0;transition:transform .6s ease-out,opacity .3s}
.pcs-spoon-up{transform:translate(${PC}px,118px);opacity:1}
.pcs-at-me{transform:translate(${ME[0]}px,${ME[1]}px)}
.pcs-fly-mia{animation:pcs-mia .9s ease-in-out}
@keyframes pcs-mia{0%{transform:translate(${MIA_HAND[0]}px,${MIA_HAND[1]}px)}50%{transform:translate(${PEAK[0]}px,${PEAK[1]}px)}100%{transform:translate(${ME[0]}px,${ME[1]}px)}}
@media (prefers-reduced-motion: reduce){.pcs-scene *{animation:none!important;transition:none!important}}
`
const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// 책상 위에 눕힌 연필(가운데 원점, 길이 56). 건넬 때 이 모양 그대로 움직인다
function FlatPencil({ className }) {
  return (
    <g className={className}>
      <polygon points="-28,0 -18,-5.5 -18,5.5" fill="#fcd9a8" stroke="#a16207" strokeWidth="1.5" />
      <polygon points="-28,0 -24,-2.2 -24,2.2" fill="#374151" />
      <rect x="-18" y="-5.5" width="38" height="11" fill="#facc15" stroke="#a16207" strokeWidth="1.5" />
      <rect x="20" y="-5.5" width="8" height="11" rx="2" fill="#f9a8d4" stroke="#be185d" strokeWidth="1.5" />
    </g>
  )
}

// 심이 부러진 내 연필(두 동강, 내 자리) — 회상 단계의 이유
function BrokenPencil() {
  return (
    <g data-testid="key-scene-broken" transform={`translate(${ME[0]} ${ME[1]})`}>
      <g transform="rotate(-8 -14 0)">
        <polygon points="-30,1 -22,-4.5 -22,5.5" fill="#fcd9a8" stroke="#a16207" strokeWidth="1.5" />
        <rect x="-22" y="-4.5" width="16" height="10" fill="#facc15" stroke="#a16207" strokeWidth="1.5" />
      </g>
      <g transform="rotate(6 14 0)">
        <rect x="2" y="-5" width="20" height="10" fill="#facc15" stroke="#a16207" strokeWidth="1.5" />
        <rect x="22" y="-5" width="7" height="10" rx="2" fill="#f9a8d4" stroke="#be185d" strokeWidth="1.5" />
      </g>
    </g>
  )
}

// 필통 안에 세워 꽂힌 연필(미아의 필통)
function UprightPencil({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
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

function Hero({ asking }) {
  return (
    <g>
      <image data-testid="key-scene-hero" href={PAUL.src} x={HEAD_X - PAUL.cx * PAUL_S} y={HAT_TOP - PAUL.top * PAUL_S} width={PAUL.w * PAUL_S} height={PAUL.h * PAUL_S} />
      {/* 묻는 순간: 머리 옆 말풍선 '?'(영어 글자 없음 — 정답·첫 글자 힌트 아님) */}
      {asking && (
        <g data-testid="key-scene-asking">
          <path d="M150 42 h34 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-20 l-10 9 l2 -9 h-6 a8 8 0 0 1 -8 -8 v-18 a8 8 0 0 1 8 -8 z" fill="#fff" stroke="#64748b" strokeWidth="2" />
          <text x="167" y="67" textAnchor="middle" fontSize="20" fontWeight="900" fill="#0369a1">?</text>
        </g>
      )}
    </g>
  )
}

// 미아 — 운영자 제공 그림(원본 분리본) 그대로, 표시 위치·크기만 정한다
function Mia({ pose }) {
  const a = MIA_ART[pose]
  return <image data-testid="key-scene-partner" href={a.src} x={MIA_X - a.cx * MIA_S} y={MIA_TOP - a.top * MIA_S} width={a.w * MIA_S} height={a.h * MIA_S} />
}

// still: 연습 문항용 정지 장면 — 해당 단계 하나만 움직임 없이 그린다
export default function PencilCaseScene({ variant = 'spoon', still = null }) {
  const [phase, setPhase] = useState(() => still || (prefersReduced() ? FINAL[variant] : START[variant] || FINAL[variant]))
  useEffect(() => {
    if (still) { setPhase(still); return undefined }
    if (prefersReduced()) { setPhase(FINAL[variant]); return undefined }
    setPhase(START[variant] || FINAL[variant])
    const steps = variant === 'spoon' ? SPOON_STEPS : START[variant] ? [['handed', OFFER_MS]] : []
    const ids = steps.map(([p, ms]) => setTimeout(() => setPhase(p), ms))
    return () => ids.forEach(clearTimeout)
  }, [variant, still])

  const isSpoon = variant === 'spoon'
  const recall = variant === 'ask' || variant === 'handover-mia'
  const forgot = variant === 'forgot' || variant === 'handover-forgot'
  const handed = phase === 'handed'
  const animate = !prefersReduced()
  const lidOpen = !isSpoon || phase !== 'closed'
  const spoonUp = isSpoon ? !['closed', 'open'].includes(phase) : recall
  const mySpot = handed ? 'pencil' : recall ? 'broken' : 'empty'

  return (
    <div className="w-full">
      <style>{CSS}</style>
      <svg data-testid="key-scene" data-variant={variant} data-still={still || undefined} data-phase={phase} data-hero-pose={ASKING.includes(phase) ? 'asking' : 'paul'} data-partner-pose={MIA_POSE[phase]} data-my-spot={mySpot}
        viewBox="0 0 360 240" role="img" aria-label={LABEL[variant]} className="pcs-scene w-full h-auto rounded-3xl bg-sky-50 block">
        <Hero asking={ASKING.includes(phase)} />
        <Mia pose={MIA_POSE[phase]} />
        {/* 미아의 필통(가슴 앞 낮게) — 건넨 뒤 한 자루 줄어든다 */}
        <g>
          {[MIA_CASE - 18, MIA_CASE - 6, MIA_CASE + 6, MIA_CASE + 18].slice(0, handed ? 3 : 4).map((x) => <UprightPencil key={x} x={x} y={150} />)}
          <rect x={MIA_CASE - 30} y="152" width="60" height={DESK - 152} rx="8" fill="#c4b5fd" stroke="#6d28d9" strokeWidth="3" />
          <circle cx={MIA_CASE} cy="163" r="5" fill="#ede9fe" stroke="#6d28d9" strokeWidth="2" />
        </g>
        {/* 내 필통(Paul 앞): 숟가락이 든 채 열려 있음. 다음 날(forgot)은 집에 두고 와서 점선 자리만 */}
        {forgot ? (
          <rect data-testid="key-scene-no-case" x={PC - 32} y="146" width="64" height={DESK - 146} rx="7" fill="none" stroke="#78716c" strokeWidth="2" strokeDasharray="5 3" />
        ) : (
          <g>
            <polygon className={`pcs-lid-up${lidOpen ? '' : ' pcs-hide'}`} points={`${PC - 32},146 ${PC + 32},146 ${PC + 25},116 ${PC - 25},116`} fill="#5eead4" stroke="#0f766e" strokeWidth="2.5" strokeLinejoin="round" />
            <rect className={`pcs-lid${lidOpen ? ' pcs-hide' : ''}`} x={PC - 32} y="136" width="64" height="12" rx="5" fill="#14b8a6" stroke="#0f766e" strokeWidth="2" />
            <g className={`pcs-spoon${spoonUp ? ' pcs-spoon-up' : ''}`}>
              <rect x="-4" y="16" width="8" height="70" rx="4" fill="#cbd5e1" stroke="#64748b" strokeWidth="2.5" />
              <ellipse cx="0" cy="0" rx="14" ry="20" fill="#e2e8f0" stroke="#64748b" strokeWidth="2.5" />
            </g>
            <rect x={PC - 32} y="146" width="64" height={DESK - 146} rx="7" fill="#2dd4bf" stroke="#0f766e" strokeWidth="3" />
            <circle cx={PC} cy="160" r="5" fill="#99f6e4" stroke="#0f766e" strokeWidth="2" />
          </g>
        )}
        {/* 숟가락이 나오는 순간 필통 위 느낌표(흔들림 없음) */}
        {isSpoon && phase === 'spoon' && <path d={`M${PC + 46} 58 v16 M${PC + 46} 82 v3`} stroke="#ef4444" strokeWidth="5" strokeLinecap="round" fill="none" />}
        {/* 책상: 인물 하반신을 가리고 소품이 그 위에 놓인다 */}
        <rect x="0" y={DESK} width="360" height={240 - DESK} fill="#f3d9a4" />
        <line x1="0" y1={DESK} x2="360" y2={DESK} stroke="#c08a3e" strokeWidth="3" />
        {mySpot === 'empty' && <rect data-testid="key-scene-empty-spot" x={ME[0] - 30} y={ME[1] - 7.5} width="60" height="15" rx="4" fill="#fef3c7" stroke="#78716c" strokeWidth="2" strokeDasharray="5 3" />}
        {mySpot === 'broken' && <BrokenPencil />}
        <Tag cx={HEAD_X}>나</Tag>
        <Tag cx={MIA_X}>미아</Tag>
        {handed && <g className={`pcs-at-me${animate ? ' pcs-fly-mia' : ''}`}><FlatPencil /></g>}
      </svg>
    </div>
  )
}
