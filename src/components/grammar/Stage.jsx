import { townAsset } from '../../assets/town'
import { paulHappy } from '../../assets/paul'
// 공원 배경: 기존 프로젝트 이미지(마을 하늘·산울타리). Vite가 4KB 초과 파일을 해시 파일로 따로 내보내므로 lazy 청크엔 URL 문자열만 들어간다.
import skyBackdrop from '../../assets/town/backgrounds/village-sky-backdrop.webp'
import hedgeBorder from '../../assets/town/backgrounds/village-hedge-border.webp'
import { PROPS, ACTIONS, CONTAINERS } from '../../utils/grammar/sceneProps'
import { layoutItems, tally, viewOf } from '../../utils/grammar/sceneMission'

// 2026-10-10 Scene v2 범용 그림 무대(인라인 SVG, viewBox 360x220). 문장·정답은 그림에 넣지 않는다(aria-label도 한국어 설명만).
// 물건은 sceneProps의 PROPS 키로만 그린다: Town 스프라이트(asset)가 있으면 그것, paul은 Paul 이미지, 나머지는 아래 임시 SVG 도형.
// TODO assets — 그림 파일 현황 (규칙: src/assets/town/<group>/<kebab-name>.webp + 같은 이름 @2x, 흰 배경 없는 투명 PNG→WebP)
//  실제 파일 사용 중: 공원 하늘 backgrounds/village-sky-backdrop.webp, 산울타리 backgrounds/village-hedge-border.webp(공원 배경, 작은 그림 sm에선 생략),
//   Paul paul/*, Town 스프라이트 tree·bench·flower(flower-garden)·lamp(street-lamp)·postbox·fountain·house·school·cafe·shop·bridge·tower·dog/cookie(puppy)·cat·owl.
//  아직 임시 도형(SVG) — 필요한 파일과 제안 위치:
//   배경: backgrounds/park-backdrop.webp(공원 하늘·잔디·길을 한 장으로; 지금은 하늘/산울타리 실파일 + 잔디·길 단색 도형), backgrounds/home-backdrop.webp, school-backdrop.webp, street-backdrop.webp, plain-backdrop.webp
//   쿠키: character/cookie-idle.webp, character/cookie-sit.webp (지금은 Town puppy)
//   사람: character/mia.webp, tom, mom, dad, teacher, kid, grandma, driver (각 character/<이름>.webp)
//   동물: animals/bird.webp, animals/fish.webp
//   물건(props/<키>.webp): ball, box, book, bag, pencil, cup, apple, bike, car, bus, phone, chair, table, bed, door, umbrella, hat, letter, cake, pizza, milk, egg, key, map, clock,
//         guitar, kite, tv, computer, window, desk, board, money, ticket, gift, shoes, jacket, homework, newspaper, medal, trophy  (예: props/ball.webp)
//   동작 배지: ACTIONS의 이모지(임시, 유지) → ui/action-<키>.webp
//   (town 환경 이미지 폴더는 town/v2 전용 가드(testTownEnvAssets)가 있어 여기서 import하지 않는다)
export const BG_KO = { park: '공원', home: '집', school: '학교', street: '거리', plain: '장면' }
const REL_KO = { in: '안', on: '위', under: '아래', 'next to': '옆', behind: '뒤', 'in front of': '앞' }
const OUT = '#374151'

function Bg({ bg, mini }) {
  switch (bg) {
    case 'home': return (<>
      <rect width="360" height="220" fill="#fef3c7" /><rect y="150" width="360" height="70" fill="#d9b98a" /><rect y="146" width="360" height="6" fill="#b48a5a" />
      <rect x="236" y="26" width="84" height="70" rx="4" fill="#bfe6ff" stroke="#b48a5a" strokeWidth="5" /><path d="M278 26v70M236 61h84" stroke="#b48a5a" strokeWidth="4" /></>)
    case 'school': return (<>
      <rect width="360" height="220" fill="#e0f2fe" /><rect y="150" width="360" height="70" fill="#d6c8a4" />
      <rect x="40" y="20" width="200" height="92" rx="4" fill="#2f6f4f" stroke="#a16207" strokeWidth="6" /><rect x="40" y="112" width="200" height="6" fill="#a16207" />
      <rect y="140" width="360" height="10" fill="#c2a878" /></>)
    case 'street': return (<>
      <rect width="360" height="220" fill="#bfe6ff" />
      <rect x="10" y="50" width="70" height="76" fill="#fca5a5" /><rect x="86" y="70" width="60" height="56" fill="#fde68a" /><rect x="152" y="40" width="80" height="86" fill="#a5b4fc" /><rect x="240" y="64" width="64" height="62" fill="#86efac" />
      <rect y="120" width="360" height="82" fill="#d1d5db" /><rect y="202" width="360" height="18" fill="#4b5563" /><path d="M0 211h360" stroke="#fff" strokeWidth="3" strokeDasharray="22 14" /></>)
    case 'plain': return (<>
      <defs><linearGradient id="stage-plain-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e0f2fe" /><stop offset="1" stopColor="#fef9c3" /></linearGradient></defs>
      <rect width="360" height="220" fill="url(#stage-plain-grad)" /><ellipse cx="180" cy="200" rx="160" ry="14" fill="#fff" opacity="0.6" /></>)
    default: return (<>
      <rect width="360" height="220" fill="#dbeaf5" /><image href={skyBackdrop} x="0" y="0" width="360" height="124" preserveAspectRatio="xMidYMid slice" />
      <rect y="116" width="360" height="104" fill="#b9d3a2" />
      {!mini && <><image href={hedgeBorder} x="0" y="70" width="360" height="54" preserveAspectRatio="xMidYMax slice" /><rect y="70" width="360" height="54" fill="#f5efdc" opacity="0.18" /></>}
      <ellipse cx="190" cy="206" rx="170" ry="14" fill="#eadfbf" opacity="0.85" /></>)
  }
}

// 임시 도형(로컬 좌표: 왼쪽 위 0,0 · 크기 PROPS w×h). 사람은 둥근 몸 + 머리색, 물건은 알아볼 수 있는 단순 모양 하나.
const fig = (hair, shirt, extra) => (w, h) => (<>
  <rect x={w * 0.26} y={h * 0.74} width={w * 0.18} height={h * 0.26} rx="3" fill="#475569" /><rect x={w * 0.56} y={h * 0.74} width={w * 0.18} height={h * 0.26} rx="3" fill="#475569" />
  <rect x={w * 0.14} y={h * 0.36} width={w * 0.72} height={h * 0.42} rx={w * 0.28} fill={shirt} />
  <circle cx={w / 2} cy={h * 0.22} r={w * 0.3} fill="#fcd9b6" /><path d={`M${w * 0.2} ${h * 0.2}a${w * 0.3} ${w * 0.3} 0 0 1 ${w * 0.6} 0z`} fill={hair} />
  <circle cx={w * 0.4} cy={h * 0.24} r="1.6" fill={OUT} /><circle cx={w * 0.6} cy={h * 0.24} r="1.6" fill={OUT} />{extra?.(w, h)}</>)
const GLYPH = {
  mia: fig('#7c3f1d', '#f472b6'), tom: fig('#1f2937', '#60a5fa'), mom: fig('#92400e', '#a78bfa'), dad: fig('#374151', '#34d399'),
  teacher: fig('#6b7280', '#fbbf24', (w, h) => <rect x={w * 0.3} y={h * 0.19} width={w * 0.4} height={h * 0.07} rx="2" fill="none" stroke={OUT} strokeWidth="1.2" />),
  kid: fig('#f59e0b', '#fb923c'), grandma: fig('#e5e7eb', '#c084fc', (w, h) => <circle cx={w / 2} cy={h * 0.04} r={w * 0.14} fill="#e5e7eb" />),
  driver: fig('#111827', '#2563eb', (w, h) => <rect x={w * 0.16} y={h * 0.08} width={w * 0.68} height={h * 0.07} rx="3" fill="#1d4ed8" />),
  bird: () => <><ellipse cx="11" cy="10" rx="9" ry="6" fill="#fbbf24" /><circle cx="18" cy="6" r="4" fill="#fbbf24" /><path d="M21 6l4 1-4 1z" fill="#f97316" /></>,
  fish: () => <><ellipse cx="12" cy="8" rx="10" ry="6" fill="#38bdf8" /><path d="M21 8l6-5v10z" fill="#0ea5e9" /><circle cx="7" cy="6" r="1.5" fill={OUT} /></>,
  ball: () => <><circle cx="8" cy="8" r="8" fill="#ef4444" stroke="#991b1b" strokeWidth="1.5" /><path d="M1 8h14" stroke="#fff" strokeWidth="1.5" /></>,
  box: (w, h) => <><rect width={w} height={h} rx="2" fill="#c08a4f" stroke="#7c5a2e" strokeWidth="1.5" /><rect width={w} height="6" fill="#d9a066" /></>,
  book: (w, h) => <><rect width={w} height={h} rx="2" fill="#3b82f6" /><rect x="3" y="2" width={w - 5} height={h - 4} fill="#fff" opacity="0.85" /><rect width="3" height={h} fill="#1d4ed8" /></>,
  bag: (w, h) => <><path d={`M7 8a5 5 0 0 1 10 0`} fill="none" stroke="#166534" strokeWidth="2" /><rect y="8" width={w} height={h - 8} rx="5" fill="#22c55e" /></>,
  pencil: (w, h) => <><rect width={w - 6} height={h} fill="#facc15" /><rect width="4" height={h} fill="#f9a8d4" /><path d={`M${w - 6} 0l6 4-6 4z`} fill="#fcd9b6" /></>,
  cup: (w, h) => <><rect width={w - 3} height={h} rx="3" fill="#fff" stroke="#60a5fa" strokeWidth="1.5" /><path d={`M${w - 3} 4a4 4 0 0 1 0 9`} fill="none" stroke="#60a5fa" strokeWidth="1.5" /></>,
  apple: () => <><circle cx="8" cy="9" r="7" fill="#dc2626" /><path d="M8 3v-3" stroke="#78350f" strokeWidth="1.5" /><ellipse cx="11" cy="2" rx="3" ry="1.6" fill="#16a34a" /></>,
  bike: () => <><circle cx="8" cy="18" r="7" fill="none" stroke={OUT} strokeWidth="2" /><circle cx="32" cy="18" r="7" fill="none" stroke={OUT} strokeWidth="2" /><path d="M8 18l9-10h10l5 10M17 8l5 10h-14" fill="none" stroke="#ef4444" strokeWidth="2" /></>,
  car: (w, h) => <><rect y="8" width={w} height="12" rx="4" fill="#ef4444" /><path d="M12 8l6-8h16l6 8z" fill="#fca5a5" /><circle cx="13" cy={h - 4} r="5" fill={OUT} /><circle cx={w - 13} cy={h - 4} r="5" fill={OUT} /></>,
  bus: (w, h) => <><rect width={w} height={h - 5} rx="5" fill="#facc15" /><g fill="#bae6fd"><rect x="5" y="6" width="12" height="10" /><rect x="21" y="6" width="12" height="10" /><rect x="37" y="6" width="12" height="10" /></g><circle cx="14" cy={h - 4} r="5" fill={OUT} /><circle cx={w - 14} cy={h - 4} r="5" fill={OUT} /></>,
  phone: (w, h) => <><rect width={w} height={h} rx="3" fill={OUT} /><rect x="1.5" y="2" width={w - 3} height={h - 6} fill="#7dd3fc" /></>,
  chair: (w, h) => <><rect x="2" width="4" height={h * 0.6} fill="#a16207" /><rect x="2" y={h * 0.5} width={w - 2} height="5" fill="#ca8a04" /><rect x="2" y={h * 0.5} width="3" height={h * 0.5} fill="#a16207" /><rect x={w - 4} y={h * 0.5} width="3" height={h * 0.5} fill="#a16207" /></>,
  table: (w, h) => <><rect width={w} height="6" rx="2" fill="#ca8a04" /><rect x="3" y="6" width="4" height={h - 6} fill="#a16207" /><rect x={w - 7} y="6" width="4" height={h - 6} fill="#a16207" /></>,
  bed: (w, h) => <><rect y={h * 0.4} width={w} height={h * 0.45} rx="3" fill="#93c5fd" /><rect width="6" height={h} fill="#92400e" /><rect x={w - 6} y={h * 0.4} width="6" height={h * 0.6} fill="#92400e" /><rect x="8" y={h * 0.25} width="16" height="8" rx="4" fill="#fff" /></>,
  door: (w, h) => <><rect width={w} height={h} rx="3" fill="#a16207" stroke="#78350f" strokeWidth="2" /><circle cx={w - 6} cy={h / 2} r="2.5" fill="#fde047" /></>,
  umbrella: (w, h) => <><path d={`M0 ${h * 0.5}a${w / 2} ${h * 0.5} 0 0 1 ${w} 0z`} fill="#ef4444" /><path d={`M${w / 2} ${h * 0.5}v${h * 0.45}a3 3 0 0 1-6 0`} fill="none" stroke={OUT} strokeWidth="1.8" /></>,
  hat: (w, h) => <><ellipse cx={w / 2} cy={h - 3} rx={w / 2} ry="3.5" fill="#92400e" /><rect x={w * 0.22} width={w * 0.56} height={h - 4} rx="5" fill="#b45309" /></>,
  letter: (w, h) => <><rect width={w} height={h} rx="2" fill="#fff" stroke="#94a3b8" strokeWidth="1.2" /><path d={`M0 0l${w / 2} ${h * 0.6} ${w / 2}-${h * 0.6}`} fill="none" stroke="#94a3b8" strokeWidth="1.2" /></>,
  cake: (w, h) => <><rect y={h * 0.4} width={w} height={h * 0.6} rx="3" fill="#fbcfe8" /><rect y={h * 0.4} width={w} height="5" fill="#f472b6" /><rect x={w / 2 - 1} y={h * 0.1} width="2" height={h * 0.3} fill="#38bdf8" /><circle cx={w / 2} cy={h * 0.06} r="2" fill="#f97316" /></>,
  pizza: (w, h) => <><path d={`M0 0h${w}L${w / 2} ${h}z`} fill="#fcd34d" stroke="#d97706" strokeWidth="1.5" /><circle cx={w * 0.4} cy={h * 0.25} r="2.5" fill="#dc2626" /><circle cx={w * 0.62} cy={h * 0.38} r="2.5" fill="#dc2626" /></>,
  milk: (w, h) => <><rect width={w} height={h} fill="#fff" stroke="#60a5fa" strokeWidth="1.5" /><rect y={h * 0.35} width={w} height={h * 0.3} fill="#60a5fa" /></>,
  egg: (w, h) => <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="#fef3c7" stroke="#d6b88a" strokeWidth="1.2" />,
  key: () => <><circle cx="5" cy="5" r="4.5" fill="none" stroke="#ca8a04" strokeWidth="2" /><path d="M9 5h14M18 5v4M22 5v3" stroke="#ca8a04" strokeWidth="2" /></>,
  map: (w, h) => <><path d={`M0 2l${w / 3} -2 ${w / 3} 2 ${w / 3} -2v${h - 2}l-${w / 3} 2-${w / 3}-2-${w / 3} 2z`} fill="#fde68a" stroke="#b45309" strokeWidth="1" /><path d={`M${w / 3} 0v${h - 2}M${(w * 2) / 3} 2v${h - 2}`} stroke="#b45309" strokeWidth="1" /></>,
  clock: (w) => <><circle cx={w / 2} cy={w / 2} r={w / 2 - 1} fill="#fff" stroke={OUT} strokeWidth="2" /><path d={`M${w / 2} ${w / 2}v-6M${w / 2} ${w / 2}l5 3`} stroke={OUT} strokeWidth="1.8" /></>,
  guitar: (w, h) => <><rect x={w / 2 - 2} width="4" height={h * 0.5} fill="#78350f" /><ellipse cx={w / 2} cy={h * 0.8} rx={w / 2} ry={h * 0.2} fill="#d97706" /><circle cx={w / 2} cy={h * 0.8} r="3" fill={OUT} /></>,
  kite: (w, h) => <><path d={`M${w / 2} 0l${w / 2} ${h * 0.35}-${w / 2} ${h * 0.4}-${w / 2}-${h * 0.4}z`} fill="#f43f5e" /><path d={`M${w / 2} ${h * 0.75}q-6 8 0 ${h * 0.25}`} fill="none" stroke="#64748b" strokeWidth="1.2" /></>,
  tv: (w, h) => <><rect width={w} height={h - 4} rx="3" fill={OUT} /><rect x="3" y="3" width={w - 6} height={h - 10} fill="#7dd3fc" /><rect x={w / 2 - 8} y={h - 4} width="16" height="4" fill={OUT} /></>,
  computer: (w, h) => <><rect width={w} height={h - 8} rx="3" fill="#64748b" /><rect x="3" y="3" width={w - 6} height={h - 14} fill="#bae6fd" /><rect x={w / 2 - 4} y={h - 8} width="8" height="4" fill="#64748b" /><rect x={w * 0.2} y={h - 4} width={w * 0.6} height="4" rx="1.5" fill="#94a3b8" /></>,
  window: (w, h) => <><rect width={w} height={h} rx="2" fill="#bfe6ff" stroke="#b48a5a" strokeWidth="3" /><path d={`M${w / 2} 0v${h}M0 ${h / 2}h${w}`} stroke="#b48a5a" strokeWidth="2.5" /></>,
  desk: (w, h) => <><rect width={w} height="6" rx="2" fill="#a16207" /><rect x="3" y="6" width="4" height={h - 6} fill="#78350f" /><rect x={w - 20} y="6" width="17" height={h * 0.55} fill="#ca8a04" /><rect x={w - 7} y="6" width="4" height={h - 6} fill="#78350f" /></>,
  board: (w, h) => <><rect width={w} height={h} rx="3" fill="#2f6f4f" stroke="#a16207" strokeWidth="3" /><path d="M8 12h30M8 22h46" stroke="#fff" strokeWidth="2" opacity="0.7" /></>,
  money: (w, h) => <><rect width={w} height={h} rx="2" fill="#86efac" stroke="#15803d" strokeWidth="1.2" /><circle cx={w / 2} cy={h / 2} r="3.5" fill="#15803d" opacity="0.6" /></>,
  ticket: (w, h) => <><rect width={w} height={h} rx="2" fill="#fdba74" stroke="#c2410c" strokeWidth="1.2" /><path d={`M${w * 0.66} 0v${h}`} stroke="#c2410c" strokeWidth="1" strokeDasharray="2 2" /></>,
  gift: (w, h) => <><rect y={h * 0.3} width={w} height={h * 0.7} fill="#a78bfa" /><rect x={w / 2 - 2} y={h * 0.3} width="4" height={h * 0.7} fill="#fde047" /><rect y={h * 0.15} width={w} height={h * 0.2} fill="#8b5cf6" /><rect x={w / 2 - 2} y={h * 0.15} width="4" height={h * 0.2} fill="#fde047" /></>,
  shoes: (w, h) => <><path d={`M0 ${h}v-7a4 4 0 0 1 4-4h6l3 4h1v7z`} fill="#92400e" /><path d={`M${w / 2 + 1} ${h}v-7a4 4 0 0 1 4-4h6l3 4h1v7z`} fill="#92400e" /></>,
  jacket: (w, h) => <><path d={`M${w * 0.3} 0h${w * 0.4}l${w * 0.3} ${h * 0.25}v${h * 0.75}h-${w * 0.22}v-${h * 0.55}h-${w * 0.56}v${h * 0.55}h-${w * 0.22}v-${h * 0.75}z`} fill="#2563eb" /><path d={`M${w / 2} 2v${h - 2}`} stroke="#fff" strokeWidth="1.5" /></>,
  homework: (w, h) => <><rect width={w} height={h} rx="2" fill="#fff" stroke="#94a3b8" strokeWidth="1.2" /><path d={`M4 6h${w - 8}M4 12h${w - 8}M4 18h${w - 8}M4 24h${w - 14}`} stroke="#94a3b8" strokeWidth="1.5" /></>,
  newspaper: (w, h) => <><rect width={w} height={h} rx="2" fill="#e5e7eb" stroke="#6b7280" strokeWidth="1.2" /><rect x="3" y="3" width="10" height="6" fill="#6b7280" /><path d={`M16 5h${w - 19}M3 13h${w - 6}M3 17h${w - 6}`} stroke="#6b7280" strokeWidth="1.5" /></>,
  medal: (w, h) => <><path d={`M2 0l${w / 2 - 2} ${h * 0.45}M${w - 2} 0l-${w / 2 - 2} ${h * 0.45}`} stroke="#dc2626" strokeWidth="3" /><circle cx={w / 2} cy={h * 0.7} r={w * 0.42} fill="#facc15" stroke="#ca8a04" strokeWidth="1.5" /></>,
  trophy: (w, h) => <><path d={`M3 0h${w - 6}v${h * 0.4}a${(w - 6) / 2} ${(w - 6) / 2} 0 0 1-${w - 6} 0z`} fill="#facc15" stroke="#ca8a04" strokeWidth="1.2" /><rect x={w / 2 - 1.5} y={h * 0.55} width="3" height={h * 0.25} fill="#ca8a04" /><rect x={w * 0.2} y={h * 0.8} width={w * 0.6} height={h * 0.2} rx="2" fill="#a16207" /></>,
}

const imgUrl = (obj) => (obj === 'paul' ? paulHappy : PROPS[obj]?.asset ? townAsset(PROPS[obj].asset) : null)

function Obj({ it, hl, tap, reduced, cookie, mini }) {
  if (it.front) { // 통 앞벽: 같은 도형을 물건 아랫부분(frontClip 아래)만 다시 그려 안쪽 물건을 가린다
    const p0 = PROPS[it.obj], G0 = GLYPH[it.obj], cid = `fc-${it.obj}${it.i}-${Math.round(it.x)}-${Math.round(it.frontClip)}-${Math.round(it.w)}`
    return <g aria-hidden="true" data-front-of={it.obj}><clipPath id={cid}><rect x={it.x - it.w / 2 - 2} y={it.frontClip} width={it.w + 4} height={Math.max(0, it.y - it.frontClip + 4)} /></clipPath><g clipPath={`url(#${cid})`}><g transform={`translate(${it.x - it.w / 2} ${it.y - it.h}) scale(${it.scale})`}>{G0(p0.w, p0.h)}</g></g></g>
  }
  const { obj, i, x, y, scale, w, h } = it
  const p = PROPS[obj] || { ko: obj, kind: 'object', w: 16, h: 16 }
  const url = imgUrl(obj)
  const hitW = Math.max(w, 44), hitH = Math.max(h, 44)
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(obj, i) } }
  const tag = it.labelKo || (p.kind === 'character' ? p.ko : '')
  const G = GLYPH[obj] || GLYPH.ball
  return (
    <g data-testid={`scene-obj-${obj}-${i}`} data-obj={obj} data-hl={hl ? 'true' : 'false'} {...(it.at ? { 'data-at': it.at } : {})} {...(it.neg ? { 'data-neg': 'true' } : {})} {...(it.dist === 'far' ? { 'data-dist': 'far' } : {})}
      {...(tap ? { tabIndex: 0, role: 'button', 'aria-label': `${p.ko} ${i + 1}`, onClick: () => tap(obj, i), onKeyDown: key, style: { cursor: 'pointer', outline: 'none' } } : { 'aria-hidden': true })}>
      {hl && <ellipse cx={x} cy={y - h / 2} rx={w / 2 + 8} ry={h / 2 + 8} fill="#fde68a" stroke="#f59e0b" strokeWidth="3" opacity="0.85" className={reduced ? '' : 'motion-safe:animate-pulse'} />}
      {tap && <rect x={x - hitW / 2} y={y - hitH} width={hitW} height={hitH} fill="transparent" />}
      <ellipse cx={x} cy={y} rx={w / 2.2} ry="4" fill="#000" opacity="0.12" />
      {url ? <image href={url} x={x - w / 2} y={y - h} width={w} height={h} preserveAspectRatio="xMidYMax meet" />
        : <g transform={`translate(${x - w / 2} ${y - h}) scale(${scale})`}>{G(p.w, p.h)}</g>}
      {ACTIONS[it.action] && (() => { const bx = x + w * 0.38, by = y - h * 0.82, r = mini ? 22 : 10, k = r * 0.8; return (
        <g data-action={it.action} aria-hidden="true"><circle cx={bx} cy={by} r={r} fill="#fff" stroke={it.neg ? '#dc2626' : '#0ea5e9'} strokeWidth="2" /><text x={bx} y={by + (mini ? 11 : 4.5)} textAnchor="middle" fontSize={mini ? 30 : 12}>{ACTIONS[it.action].emoji}</text>
          {it.neg && <path data-testid="scene-neg" d={`M${bx - k} ${by - k}L${bx + k} ${by + k}M${bx + k} ${by - k}L${bx - k} ${by + k}`} stroke="#dc2626" strokeWidth={mini ? 5 : 3} strokeLinecap="round" />}</g>) })()}
      {tag && <text x={x} y={Math.min(y + 12, 218)} textAnchor="middle" fontSize="10" fontWeight="800" fill="#1f2937">{tag}</text>}
      {cookie && <text x={x} y={y + 14} textAnchor="middle" fontSize="11" fontWeight="800" fill="#1f2937">Cookie</text>}
    </g>
  )
}

// 한국어 설명(aria-label용): "공 1(상자 위), 상자 1, 미아 1(읽기)"
function describe(items) {
  const ko = (o) => PROPS[o]?.ko || o
  const counts = tally(items)
  return Object.entries(counts).map(([o, n]) => {
    const extra = items.filter((it) => it.obj === o).flatMap((it) => [it.at && it.ref ? `${ko(it.ref)} ${REL_KO[it.at]}` : null, it.action && ACTIONS[it.action] ? `${ACTIONS[it.action].ko}${it.neg ? ' 안 함' : ''}` : null]).filter(Boolean)
    return `${ko(o)} ${n}${extra.length ? `(${[...new Set(extra)].join(', ')})` : ''}`
  }).join(', ')
}

// layout: 이 장면에 그려진 물건, placed: 내가 놓은 물건 [{obj,x,y,scale?}](x 가운데·y 바닥), spots: 놓을 수 있는 빈 자리 [{x,y,size?,relation?}]
function StageSvg({ layout = [], placed = [], spots = [], highlight, tapObj, onTapObject, onTapSpot, bg = 'park', showPaul, showCookie, size = 'md', reduced, testId, enlarge, className }) {
  const withPaul = showPaul ?? bg === 'park'
  const withCookie = showCookie ?? bg === 'park'
  const base = layoutItems(layout, { center: !withPaul, enlarge, mini: size === 'sm' })
  const seen = {}
  base.forEach((it) => { seen[it.obj] = Math.max(seen[it.obj] ?? -1, it.i) })
  const extra = placed.map((p) => {
    const a = PROPS[p.obj] || { w: 16, h: 16 }
    const s = (p.scale ?? 1) * Math.min(1, 64 / a.w)
    return { obj: p.obj, relation: p.relation, ref: p.ref, i: (seen[p.obj] = (seen[p.obj] ?? -1) + 1), x: p.x, y: p.y, z: p.z ?? 999, scale: s, w: a.w * s, h: a.h * s }
  })
  extra.forEach((e) => { // 위치 놓기에서 통 안(in)에 놓았으면 그 통의 앞벽을 물건 위에 다시 그린다
    if (e.relation !== 'in' || !CONTAINERS.includes(e.ref)) return
    const rb = base.find((b) => b.obj === e.ref && b.i === 0)
    if (rb) { rb.frontClip = Math.min(rb.frontClip ?? Infinity, e.y - 0.4 * e.h); rb.frontZ = e.z + 0.6 }
  })
  const fronts = base.filter((b) => b.frontClip != null).map((b) => ({ ...b, front: true, z: b.frontZ ?? b.z + 0.6 }))
  const drawn = [...base, ...extra, ...fronts].map((it) => ({ ...it, zz: it.obj === tapObj && onTapObject ? it.z + 1000 : it.z })).sort((a, b) => a.zz - b.zz) // 누르는 대상은 맨 위에 그려 눌리는 영역이 가려지지 않게
  const counts = tally([...base, ...extra])
  const desc = describe([...base, ...extra])
  return (
    <svg {...(testId ? { 'data-testid': testId } : {})} data-counts={Object.entries(counts).map(([o, n]) => `${o}:${n}`).join(',')} data-size={size} data-bg={bg} viewBox="0 0 360 220" role="img" aria-label={`${BG_KO[bg] || '장면'} 그림${desc ? `: ${desc}` : ': 비어 있음'}`}
      className={className || `block w-full ${size === 'sm' ? 'max-w-[170px]' : 'max-w-[360px]'} h-auto mx-auto rounded-2xl select-none`}>
      <Bg bg={bg} mini={size === 'sm'} />
      {withPaul && <image href={paulHappy} x="2" y="128" width="58" height="62" preserveAspectRatio="xMidYMax meet" aria-hidden="true" data-testid="scene-paul" />}
      {drawn.map((it) => <Obj key={`${it.obj}-${it.i}`} it={it} hl={highlight === it.obj} tap={onTapObject} reduced={reduced} cookie={withCookie && it.obj === 'dog' && it.i === 0 && size !== 'sm'} mini={size === 'sm'} />)}
      {spots.map((s, i) => {
        const sz = s.size || 56
        return (
          <g key={i} data-testid={`scene-spot-${i}`} {...(s.relation ? { 'data-relation': s.relation } : {})} role="button" tabIndex={0} aria-label="여기에 놓기" style={{ cursor: 'pointer', outline: 'none' }}
            onClick={() => onTapSpot?.(s.x, s.y, i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTapSpot?.(s.x, s.y, i) } }}>
            <rect x={s.x - sz / 2} y={s.y - sz + 4} width={sz} height={sz} rx="12" fill="#fff" fillOpacity="0.55" stroke="#0ea5e9" strokeWidth="2.5" strokeDasharray="6 4" />
            <text x={s.x} y={s.y - sz * 0.29} textAnchor="middle" fontSize={sz * 0.46} fontWeight="900" fill="#0284c7">+</text>
          </g>
        )
      })}
    </svg>
  )
}

// 작게 그린 무대(패널·sm) 아래의 실제 글자 범례: labelKo나 action이 있는 물건마다 칩 하나(한국어만)
function Legend({ layout }) {
  const seen = new Set(), chips = []
  for (const it of layout || []) {
    if (!it.labelKo && !it.action) continue
    const k = `${it.obj}|${it.labelKo}|${it.action}|${it.neg}`
    if (seen.has(k)) continue
    seen.add(k)
    chips.push(<span key={k} className="rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-xs font-bold text-sky-900 break-keep">{it.labelKo || PROPS[it.obj]?.ko || it.obj}{ACTIONS[it.action] ? ` · ${ACTIONS[it.action].emoji} ${ACTIONS[it.action].ko}${it.neg ? ' ✕' : ''}` : ''}</span>)
  }
  return chips.length ? <div data-testid="scene-legend" className="flex flex-wrap justify-center gap-1 max-w-full">{chips}</div> : null
}

// view: 'scene'(기본) | 'timeline'(panels 2~4칸, 칸마다 한국어 라벨) | 'dialogue'(그림 + 아래 말풍선 lines)
export default function Stage({ view, layout, panels, lines, focus, testId = 'park-scene', ...rest }) {
  const v = viewOf({ view, panels, lines })
  if (v === 'timeline' && panels?.length) {
    const cols = panels.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
    return (
      <div data-testid={testId} data-view="timeline" role="group" aria-label={`시간 순서 그림 ${panels.length}장`} data-counts={panels.map((p) => Object.entries(tally(p.layout)).map(([o, n]) => `${o}:${n}`).join(',')).join('|')} data-bg={rest.bg || 'park'} className={`grid ${cols} gap-2 w-full`}>
        {panels.map((p, i) => (
          <div key={i} data-testid={`scene-panel-${i}`} data-focus={focus === i ? 'true' : 'false'} className={`space-y-1 rounded-2xl p-1 ${focus === i ? 'ring-2 ring-sky-400 bg-sky-50' : ''}`}>
            <StageSvg {...rest} layout={p.layout} testId={`scene-panel-art-${i}`} size="sm" className="block w-full h-auto rounded-xl select-none" />
            <p className="text-center text-xs font-black text-gray-700 break-keep">{p.labelKo}</p>
            <Legend layout={p.layout} />
          </div>))}
      </div>)
  }
  if (v === 'dialogue' && lines?.length) {
    return (
      <div data-view="dialogue" data-testid="scene-dialogue" className="space-y-2">
        <StageSvg {...rest} layout={layout} testId={testId} />
        {rest.size === 'sm' && <Legend layout={layout} />}
        <ul className="space-y-1">
          {lines.map((l, i) => (
            <li key={i} data-testid={`scene-line-${i}`} data-who={l.who} className="flex items-start gap-2">
              <span className="shrink-0 rounded-full bg-sky-100 text-sky-800 text-xs font-black px-2 py-1">{PROPS[l.who]?.ko || l.who}</span>
              <span className="rounded-2xl bg-white card-shadow px-3 py-2 text-sm min-w-0">
                <b className="block text-gray-900 break-keep">{l.ko}</b>
                {l.en && <span className="block text-gray-700 break-words">{l.en}</span>}
              </span>
            </li>))}
        </ul>
      </div>)
  }
  if (rest.size === 'sm') return <div className="space-y-1"><StageSvg {...rest} layout={layout} testId={testId} /><Legend layout={layout} /></div>
  return <StageSvg {...rest} layout={layout} testId={testId} />
}
