// Shared by the practice screen and the games chunk: picture lookup, neutral picture, reduced-motion hook, game CSS.
import React, { useEffect, useRef, useState } from 'react'
import { playWordAudio } from '../../utils/speech'
import teacherStand from '../../assets/phonics/teacher/phonics-teacher-stand.webp'

const IMG = import.meta.glob('../../assets/pictureWords/*.webp', { eager: true, query: '?url', import: 'default' })
export const imgUrl = (asset) => IMG[`../../assets/pictureWords/${asset}.webp`]

// Decorative picture for menu tiles/set cards (alt empty; the word is not a quiz secret here).
export const MenuPic = ({ asset, className }) => <img src={imgUrl(asset)} alt="" draggable={false} className={className} />

// Picture card (252차): rounded pink-border card around the picture. alt is always the neutral "그림" (the word never appears in the DOM before the child finds it).
export const GamePicture = ({ word, testid, glow = false, small = false }) => (
  <div data-testid={testid ? `${testid}-card` : undefined} className={`pw-card${small ? ' pw-card-sm' : ''}${glow ? ' pw-glow' : ''}`}>
    <img data-testid={testid} src={imgUrl(word.asset)} alt="그림" draggable={false} className="pw-pic" />
  </div>
)

// Slim progress bar + "n / total" text (label optional, e.g. "시험"). textContent is exactly "<label> n / total".
export const PwProgress = ({ n, total, label, testid = 'pw-progress' }) => (
  <div data-testid={testid} data-n={n} data-total={total} className="pw-progress">
    <span className="pw-progress-text">{`${label ? label + ' ' : ''}${n} / ${total}`}</span>
    <span className="pw-bar"><span className="pw-bar-fill" style={{ width: `${Math.min(100, Math.max(0, (n / total) * 100))}%` }} /></span>
  </div>
)

// Lesson scene. Wall/shelf/window/rug/sign are CSS-only TEMPORARY STAND-INS until the operator supplies art. Teacher: STANDING image, a temporary substitute for the missing pointing pose (assets/phonics/teacher/NOTICE.md).
export const ClassScene = ({ line, bubble, children }) => (
  <div data-testid="pw-cls" className="pw-cls">
    <span className="pw-cls-win" /><span className="pw-cls-shelf">{[30, 24, 34, 26, 32, 22].map((h, k) => <i key={k} style={{ height: h }} />)}</span>
    <img src={teacherStand} width={120} height={290} alt="" draggable={false} className="pw-cls-teacher" />
    <div className="pw-cls-main">
      <p data-testid="pw-cls-line" className="pw-cls-line">{line}{bubble}</p>
      {children}
    </div>
  </div>
)

// Word strip: practice only (shows English words; never mounted by quiz screens).
export function WordStrip({ words, i, said, onPick }) {
  const cur = useRef(null)
  const first = useRef(true) // skip the mount scroll (no page jump)
  useEffect(() => { if (first.current) first.current = false; else cur.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' }) }, [i])
  return (
    <div data-testid="pwp-strip" className="pw-strip">
      {words.map((w, k) => (
        <button key={w.id} ref={k === i ? cur : null} type="button" data-testid="pwp-strip-item" data-index={k} aria-current={k === i ? 'true' : undefined} onClick={() => onPick(k)} className="pw-st">
          {w.asset ? <img src={imgUrl(w.asset)} alt="" draggable={false} /> : <b>{w.en}</b>}
          <span>{w.en}</span>
          {said.has(w.id) && <i aria-hidden="true">✓</i>}
        </button>
      ))}
    </div>
  )
}

export const playEn = (en) => playWordAudio(null, en, { source: 'pictureWords' })

function useMedia(q) {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const m = window.matchMedia(q)
    const on = () => setR(m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [q])
  return r
}
export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)')
export const useWide = () => useMedia('(min-width: 768px)')

// First-screen art: 1:1 crops of the operator-approved picture (assets/phonics/home/NOTICE.md)
const HOME = import.meta.glob('../../assets/phonics/home/*.webp', { eager: true, query: '?url', import: 'default' })
const HD = { full: [1672, 941], sign: [945, 297], teacher: [708, 941], 'card-phonics': [286, 340], 'card-speak': [302, 351], 'card-play': [324, 360] }
export const HomeImg = ({ k, ...p }) => <img src={HOME[`../../assets/phonics/home/phonics-home-${k}.webp`]} width={HD[k][0]} height={HD[k][1]} alt="" decoding="async" draggable={false} {...p} />

// full-width button colours shared by the phonics and picture-word screens (used as `${BTN} ${W.gray}`)
export const BTN = 'min-h-[44px] px-4 py-3 rounded-2xl font-black text-lg btn-press disabled:opacity-40'
export const T2 = 'text-2xl font-black text-gray-900'
export const T3 = 'text-3xl font-black text-gray-900 break-words'
export const MUTED = 'text-xs font-bold text-gray-500'
export const W = { gray: 'w-full bg-gray-200 text-gray-700' }
// colour roles: strong = the one main action on a screen, soft = same hue, pale. Gray stays W.gray (leave/back).
export const ROLE = {
  go: { strong: 'bg-emerald-500 text-white', soft: 'bg-emerald-100 text-emerald-800' },
  say: { strong: 'bg-rose-400 text-white', soft: 'bg-rose-100 text-rose-800' },
  play: { strong: 'bg-amber-400 text-amber-950', soft: 'bg-amber-100 text-amber-900' },
  review: { strong: 'bg-violet-400 text-white', soft: 'bg-violet-100 text-violet-800' },
  listen: { strong: 'bg-sky-500 text-white', soft: 'bg-sky-100 text-sky-800' },
}

const CSS = `
.pw-tile-menu{display:flex;align-items:center;gap:12px;width:100%;min-height:176px;padding:12px;text-align:left;border:3px solid var(--tm-edge);border-radius:24px;background:var(--tm-bg);box-shadow:0 5px 0 var(--tm-edge);transition:transform .1s ease,box-shadow .1s ease}
.pw-tile-menu:active{transform:translateY(3px);box-shadow:0 2px 0 var(--tm-edge)}
.pw-tile-menu img{flex:none;box-sizing:border-box;width:112px;height:112px;object-fit:contain;padding:6px;border-radius:18px;background:#fff}
.pw-tm-go{--tm-bg:#D1FAE5;--tm-edge:#10B981}.pw-tm-say{--tm-bg:#FFE4E6;--tm-edge:#FB7185}.pw-tm-play{--tm-bg:#FEF3C7;--tm-edge:#FBBF24}
@keyframes pw-swing{0%{transform:rotate(-70deg) translateY(-6px)}60%{transform:rotate(25deg) translateY(4px)}100%{transform:rotate(0) translateY(0)}}
@keyframes pw-shake{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes pw-bounce{0%,100%{transform:none}40%{transform:scale(1.15)}}
@keyframes pw-hop{0%,100%{transform:none}50%{transform:translateY(-10px)}}
@keyframes pw-click{0%{transform:scale(1.25)}100%{transform:none}}
@keyframes pw-glow{0%{box-shadow:0 6px 0 #F9A8D4,0 0 0 0 rgba(244,114,182,.6)}50%{box-shadow:0 6px 0 #F9A8D4,0 0 18px 6px rgba(244,114,182,.55)}100%{box-shadow:0 6px 0 #F9A8D4,0 0 0 0 rgba(244,114,182,0)}}
@keyframes pw-spark{0%{transform:scale(.3) rotate(0);opacity:0}30%{opacity:1}100%{transform:scale(1.2) rotate(90deg) translateY(-14px);opacity:0}}
.pw-swing{animation:pw-swing .18s ease-out both}.pw-shake{animation:pw-shake .25s ease-in-out}.pw-bounce{animation:pw-bounce .3s ease-out}
.pw-hop{animation:pw-hop .15s ease-out}.pw-click{animation:pw-click .18s ease-out .12s}.pw-glow{animation:pw-glow .28s ease-out}.pw-spark{animation:pw-spark .55s ease-out both}
.pw-tile{transition:transform .25s ease,opacity .25s ease}
.pw-cell{min-width:48px;min-height:48px}
@media(min-width:390px){.pw-cell{min-width:56px;min-height:56px}}
.pw-card{position:relative;box-sizing:border-box;width:min(100%,15rem);margin:0 auto;padding:14px;border:3px solid #F472B6;border-radius:24px;background:linear-gradient(160deg,#FFE4EF 0%,#FFF8EC 100%);box-shadow:0 6px 0 #F9A8D4,0 10px 18px rgba(244,114,182,.25)}
@media(min-width:640px){.pw-card{width:min(100%,19rem)}}
.pw-card--text{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:6rem;text-align:center}
.pw-card-tag{display:inline-block;padding:2px 10px;border-radius:999px;background:#fff;border:2px solid #F9A8D4;font-size:.75rem;font-weight:900;color:#BE185D}
.pw-card-sm{width:100%;padding:6px;border-width:2px;border-radius:16px;box-shadow:0 3px 0 #F9A8D4,0 5px 10px rgba(244,114,182,.2)}
.pw-pic{box-sizing:border-box;width:100%;height:auto;aspect-ratio:1/1;object-fit:contain;padding:8px;border-radius:18px;background:#fff;box-shadow:inset 0 0 0 2px #FCE7F3}
.pw-card-sm .pw-pic{width:6rem;height:6rem;margin:0 auto;aspect-ratio:auto;padding:6px;border-radius:14px}
.pw-letter{border:2px solid var(--pw-edge);background:var(--pw-bg);color:#1F2937;box-shadow:0 3px 0 var(--pw-edge);transition:transform .15s ease,box-shadow .15s ease}
.pw-letter:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 var(--pw-edge)}
.pw-c0{--pw-bg:#FBCFE8;--pw-edge:#EC4899}.pw-c1{--pw-bg:#BBF7D0;--pw-edge:#22C55E}.pw-c2{--pw-bg:#BAE6FD;--pw-edge:#0EA5E9}.pw-c3{--pw-bg:#FEF08A;--pw-edge:#EAB308}
.pw-letter:disabled{box-shadow:none}
.pw-slot{border:2px dashed #C4B5FD;background:#F5F3FF;box-shadow:inset 0 2px 4px rgba(76,29,149,.18);color:#1F2937}
.pw-slot-on{border:2px solid #22C55E;background:#ECFDF5;box-shadow:0 2px 0 #22C55E;color:#1F2937}
.pw-slot-now{border-color:#A855F7;background:#FAF5FF}
.pw-progress{display:flex;align-items:center;gap:8px;justify-content:center;font-weight:900;font-size:.875rem;color:#047857}
.pw-bar{display:block;flex:1;max-width:9rem;height:8px;border-radius:999px;background:#D1FAE5;overflow:hidden}
.pw-bar-fill{display:block;height:100%;border-radius:999px;background:#F472B6;transition:width .25s ease}
.pw-spark-star{position:absolute;pointer-events:none;font-size:1.25rem;line-height:1;color:#F59E0B}
@keyframes pbp-float{0%,100%{transform:none}50%{transform:translateY(-8px)}}
@keyframes pbp-wobble{0%,100%{transform:none}25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}
@keyframes pbp-pulse{0%,100%{transform:none}50%{transform:scale(1.04)}}
.pbp-float{animation:pbp-float 3s ease-in-out infinite}.pbp-wobble{animation:pbp-wobble .25s ease-in-out}.pbp-pulse{animation:pbp-pulse .8s ease-in-out infinite}
.pbp-bubble{width:7rem;height:7rem;border-radius:9999px;font-size:3rem;font-weight:900;line-height:1;border:3px solid var(--pw-edge);background:radial-gradient(circle at 30% 28%,#fff 0,var(--pw-bg) 62%);color:#1F2937;box-shadow:0 4px 0 var(--pw-edge);transition:transform .28s ease-out,opacity .28s ease-out}
.pbp-bubble[data-tried=true]{opacity:.35}
.pbp-bubble.pbp-pop{transform:scale(1.5);opacity:0;pointer-events:none}
@keyframes pwt-go{from{transform:none}to{transform:translateX(130%);visibility:hidden}}
@keyframes pwt-in{from{opacity:0}}
.pwt-track{display:grid;overflow:hidden;padding:6px 4px}
.pwt-track>*{grid-area:1/1}
.pwt-train,.pwt-result{display:flex;align-items:center;justify-content:center;gap:4px}
.pwt-train.pwt-depart{animation:pwt-go .6s ease-in .25s forwards}
.pwt-result{animation:pwt-in .3s ease-out .85s both}
.pwt-engine{display:flex;align-items:center;justify-content:center;min-width:48px;min-height:48px;font-size:1.75rem}
.pw-sign{position:relative;display:block;width:fit-content;margin:22px auto 0!important;padding:6px 20px 7px;border:3px solid #6B4423;border-radius:14px;background:linear-gradient(#A9743F,#8A5A2E);box-shadow:inset 0 0 0 2px #C99A64;color:#FFF3D6;font-size:1.25rem;line-height:1.2;white-space:nowrap}
.pw-sign::before{content:"👑";position:absolute;left:50%;top:-24px;translate:-50%;line-height:1}
.pw-sign::after{content:"";position:absolute;left:16%;right:16%;top:-14px;height:11px;border:solid #6B4423;border-width:0 3px}
.pw-sign span{margin-left:4px;padding:0 6px;border-radius:99px;background:#FFF3D6;color:#B91C1C;font-size:.7rem;vertical-align:middle}
.pw-back{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:#fff;font-size:1.5rem;font-weight:900}
.pw-chip{padding:6px 12px;border-radius:99px;background:#fff}.pw-chip .pw-bar{flex:none;width:2.5rem}
.pw-cls{position:relative;display:grid;grid-template-columns:34% minmax(0,1fr);gap:6px;align-items:end;min-height:330px;padding:8px 8px 6px;overflow:hidden;border-radius:24px;background:linear-gradient(#FFF7E8 72%,#EBD9BC 72%)}
.pw-cls::after{content:"";position:absolute;left:30%;right:-8%;bottom:-20px;height:100px;border-radius:50%;background:#D5E5F1}
.pw-cls-win{position:absolute;right:10px;top:10px;box-sizing:border-box;width:104px;height:120px;border:5px solid #fff;border-radius:99px 99px 0 0;background:radial-gradient(ellipse at 25% 125%,#CFE6C8 48%,#0000 49%),radial-gradient(ellipse at 95% 130%,#BFDDB9 52%,#0000 53%),linear-gradient(#DCEEFB,#F1F8FC)}
.pw-cls-win::after{content:"";position:absolute;left:58%;bottom:22px;width:16px;height:26px;background:#E4CFC6;clip-path:polygon(0 100%,0 38%,50% 0,100% 38%,100% 100%)}
.pw-cls-shelf{position:absolute;left:8px;top:24px;display:flex;align-items:flex-end;gap:3px;width:36%;height:64px;border-bottom:4px solid #DCC8A6}
.pw-cls-shelf i{flex:1;max-width:14px;background:#B9D8C6}.pw-cls-shelf i:nth-child(3n+2){background:#EBC0C6}.pw-cls-shelf i:nth-child(3n){background:#B4D0E6}
.pw-cls-teacher{position:relative;z-index:1;width:100%;height:290px;object-fit:contain;object-position:center bottom}
.pw-cls-main{position:relative;z-index:1;align-self:start;min-width:0}
.pw-cls-line{position:relative;display:flex;align-items:center;justify-content:space-between;gap:6px;margin:0 0 10px;padding:4px 6px 4px 12px;border-radius:18px;background:#fff;font-size:.95rem;font-weight:900;line-height:1.25;word-break:keep-all}
.pw-cls-line::before{content:"";position:absolute;left:-6px;bottom:16px;width:12px;height:12px;background:#fff;transform:rotate(45deg)}
.pw-spk{flex:none;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;font-size:1.4rem}
.pw-bub{width:44px;height:44px}.pw-bub::before{content:"🔊"}
.pw-cls-box{max-width:25rem;padding:8px;border:3px solid #BFDBFE;border-radius:22px;background:#fff}
.pw-cls-box .pw-card{width:100%;padding:0;border:0;background:none;box-shadow:none}.pw-cls-box .pw-pic{padding:4px;box-shadow:none}
.pw-big{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:76px;padding:8px;border-radius:20px;font-weight:900;line-height:1.2;word-break:keep-all}
.pw-strip{display:flex;gap:8px;width:fit-content;max-width:100%;margin-inline:auto;padding:6px 4px 8px;overflow-x:auto;scroll-snap-type:x proximity}
.pw-st{position:relative;flex:none;box-sizing:border-box;width:72px;padding:6px 4px;scroll-snap-align:center;border-radius:14px;background:#fff;font-size:.75rem;font-weight:800;line-height:1.2;overflow-wrap:anywhere}
.pw-st img,.pw-st b{display:flex;align-items:center;justify-content:center;width:48px;height:48px;margin:0 auto 2px;object-fit:contain;border-radius:10px;background:#FFF4DE}
.pw-st img{background:none}.pw-st[aria-current=true]{outline:3px solid #3B82F6}
.pw-st i{position:absolute;top:2px;right:4px;font-style:normal;color:#059669}
.pw-wrap:has(.pph-w){max-width:1100px}
.pw-page:has(.pph-n){background:#1B3A24;box-shadow:inset 0 0 0 4px #B75A28}
.pph-chip{position:fixed;top:4px;right:8px;z-index:5;padding:0 6px;border-radius:99px;background:#FFF3D6;color:#B91C1C;font-size:.65rem;font-weight:900;line-height:16px}
.pph-w{position:relative;width:min(100%,1100px,calc((100vh - 130px)*1672/941));aspect-ratio:1672/941;margin-inline:auto;overflow:hidden;border-radius:24px}
.pph-w img{width:100%}.pph-w button{position:absolute;border-radius:6%}
.pph-w button:nth-of-type(1){left:42.105%;top:37.407%;width:17.105%;height:36.132%}
.pph-w button:nth-of-type(2){left:59.569%;top:36.663%;width:18.062%;height:37.301%}
.pph-w button:nth-of-type(3){left:78.110%;top:36.132%;width:19.378%;height:38.257%}
.pph-w button:hover,.pph-w button:active{background:#fff4;box-shadow:inset 0 0 0 3px #fff}
.pph-s{width:100%;max-width:358px;margin-inline:auto}.pph-t{width:260px;max-width:100%;margin-inline:auto;border-radius:20px}
.pph-row{display:grid;grid-template-columns:repeat(3,minmax(0,109px));justify-content:center;gap:8px;align-items:center}
.pph-row button{min-width:44px;min-height:44px;border-radius:14px}.pph-row button:active{transform:scale(.97);filter:brightness(1.1)}
.pph-w button:focus-visible,.pph-row button:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #2563EB}
@media(min-width:768px){.pw-wrap:has(.pw-cls-card){max-width:45rem}.pw-cls{min-height:420px}.pw-cls-teacher{height:380px}}
@media (prefers-reduced-motion: reduce){[class*=pw-],[class*=pbp-],[class*=pwt-],[class*=pph-]{animation:none!important;transition:none!important}.pwt-train.pwt-depart{visibility:hidden}.pw-spark-star{display:none}}
`
export const GameStyle = () => <style>{CSS}</style>
