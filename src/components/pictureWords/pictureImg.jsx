// Shared by the practice screen and the games chunk: picture lookup, neutral picture, reduced-motion hook, game CSS.
import React, { useEffect, useState } from 'react'
import { playWordAudio } from '../../utils/speech'

const IMG = import.meta.glob('../../assets/pictureWords/*.webp', { eager: true, query: '?url', import: 'default' })
export const imgUrl = (asset) => IMG[`../../assets/pictureWords/${asset}.webp`]

// Picture card (252차): rounded pink-border card around the picture. alt is always the neutral "그림" (the word never appears in the DOM before the child finds it).
export const GamePicture = ({ word, testid, glow = false }) => (
  <div data-testid={testid ? `${testid}-card` : undefined} className={`pw-card${glow ? ' pw-glow' : ''}`}>
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

export const playEn = (en) => playWordAudio(null, en, { source: 'pictureWords' })

const QUERY = '(prefers-reduced-motion: reduce)'
export function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const m = window.matchMedia(QUERY)
    const on = () => setR(m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [])
  return r
}

const CSS = `
@keyframes pw-swing{0%{transform:rotate(-70deg) translateY(-6px)}60%{transform:rotate(25deg) translateY(4px)}100%{transform:rotate(0) translateY(0)}}
@keyframes pw-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes pw-bounce{0%{transform:scale(1)}40%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes pw-pop{0%{transform:scale(.4);opacity:.2}100%{transform:scale(1);opacity:1}}
@keyframes pw-hop{0%{transform:translateY(0)}50%{transform:translateY(-10px)}100%{transform:translateY(0)}}
@keyframes pw-click{0%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes pw-glow{0%{box-shadow:0 6px 0 #F9A8D4,0 0 0 0 rgba(244,114,182,.6)}50%{box-shadow:0 6px 0 #F9A8D4,0 0 18px 6px rgba(244,114,182,.55)}100%{box-shadow:0 6px 0 #F9A8D4,0 0 0 0 rgba(244,114,182,0)}}
@keyframes pw-spark{0%{transform:scale(.3) rotate(0);opacity:0}30%{opacity:1}100%{transform:scale(1.2) rotate(90deg) translateY(-14px);opacity:0}}
.pw-swing{animation:pw-swing .18s ease-out both}.pw-shake{animation:pw-shake .25s ease-in-out}.pw-bounce{animation:pw-bounce .3s ease-out}.pw-pop{animation:pw-pop .25s ease-out both}
.pw-hop{animation:pw-hop .15s ease-out}.pw-click{animation:pw-click .18s ease-out .12s}.pw-glow{animation:pw-glow .28s ease-out}.pw-spark{animation:pw-spark .55s ease-out both}
.pw-tile{transition:transform .25s ease,opacity .25s ease}
.pw-cell{min-width:48px;min-height:48px}
@media (min-width:390px){.pw-cell{min-width:56px;min-height:56px}}
.pw-card{position:relative;box-sizing:border-box;width:min(100%,15rem);margin:0 auto;padding:12px;border:3px solid #F472B6;border-radius:24px;background:linear-gradient(160deg,#FFE4EF 0%,#FFF8EC 100%);box-shadow:0 6px 0 #F9A8D4,0 10px 18px rgba(244,114,182,.25)}
@media (min-width:640px){.pw-card{width:min(100%,19rem)}}
.pw-card-sm{width:100%;padding:6px;border-width:2px;border-radius:16px;box-shadow:0 3px 0 #F9A8D4}
.pw-pic{display:block;width:100%;height:auto;aspect-ratio:1/1;object-fit:contain;border-radius:14px;background:#fff}
.pw-card-sm .pw-pic{width:6rem;height:6rem;margin:0 auto;aspect-ratio:auto}
.pw-letter{border:2px solid var(--pw-edge);background:var(--pw-bg);color:#1F2937;box-shadow:0 3px 0 var(--pw-edge);transition:transform .15s ease,box-shadow .15s ease}
.pw-letter:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 var(--pw-edge)}
.pw-c0{--pw-bg:#FBCFE8;--pw-edge:#EC4899}.pw-c1{--pw-bg:#BBF7D0;--pw-edge:#22C55E}.pw-c2{--pw-bg:#BAE6FD;--pw-edge:#0EA5E9}.pw-c3{--pw-bg:#FEF08A;--pw-edge:#EAB308}
.pw-letter:disabled{box-shadow:none}
.pw-slot{border:2px dashed #C4B5FD;background:#F5F3FF;box-shadow:inset 0 2px 4px rgba(76,29,149,.18);color:#1F2937}
.pw-slot-on{border:2px solid #22C55E;border-style:solid;background:#ECFDF5;box-shadow:0 2px 0 #22C55E;color:#1F2937}
.pw-slot-now{border-color:#A855F7;background:#FAF5FF}
.pw-progress{display:flex;align-items:center;gap:8px;justify-content:center;font-weight:900;font-size:.875rem;color:#7E22CE}
.pw-bar{display:block;flex:1;max-width:9rem;height:8px;border-radius:999px;background:#F3E8FF;overflow:hidden}
.pw-bar-fill{display:block;height:100%;border-radius:999px;background:#F472B6;transition:width .25s ease}
.pw-spark-star{position:absolute;pointer-events:none;font-size:1.25rem;line-height:1;color:#F59E0B}
@keyframes pbp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes pbp-wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}
@keyframes pbp-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.pbp-float{animation:pbp-float 3s ease-in-out infinite}.pbp-wobble{animation:pbp-wobble .25s ease-in-out}.pbp-pulse{animation:pbp-pulse .5s ease-in-out 2}
.pbp-bubble{width:7rem;height:7rem;border-radius:9999px;font-size:3rem;font-weight:900;line-height:1;border:3px solid var(--pw-edge);background:radial-gradient(circle at 30% 28%,#fff 0,var(--pw-bg) 62%);color:#1F2937;box-shadow:0 4px 0 var(--pw-edge);transition:transform .28s ease-out,opacity .28s ease-out}
.pbp-bubble[data-tried=true]{opacity:.35}
.pbp-bubble.pbp-pop{transform:scale(1.5);opacity:0;pointer-events:none}
@keyframes pwt-go{from{transform:translateX(0)}to{transform:translateX(130%);visibility:hidden}}
@keyframes pwt-in{from{opacity:0}to{opacity:1}}
.pwt-track{display:grid;overflow:hidden;padding:6px 4px}
.pwt-track>*{grid-area:1/1}
.pwt-train,.pwt-result{display:flex;flex-wrap:nowrap;align-items:center;justify-content:center;gap:4px}
.pwt-train.pwt-depart{animation:pwt-go .6s ease-in .25s forwards}
.pwt-result{animation:pwt-in .3s ease-out .85s both}
.pwt-engine{display:flex;align-items:center;justify-content:center;min-width:48px;min-height:48px;font-size:1.75rem}
@media (prefers-reduced-motion: reduce){.pw-swing,.pw-shake,.pw-bounce,.pw-pop,.pw-hop,.pw-click,.pw-glow,.pw-spark{animation:none}.pbp-float,.pbp-wobble,.pbp-pulse{animation:none}.pbp-bubble{transition:none}.pwt-train.pwt-depart{animation:none;visibility:hidden}.pwt-result{animation:none}.pw-tile,.pw-letter,.pw-bar-fill{transition:none}.pw-spark-star{display:none}}
`
export const GameStyle = () => <style>{CSS}</style>
