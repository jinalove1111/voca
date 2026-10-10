// Shared by the practice screen and the games chunk: picture lookup, neutral picture, reduced-motion hook, game CSS.
import React, { useEffect, useState } from 'react'
import { playWordAudio } from '../../utils/speech'

const IMG = import.meta.glob('../../assets/pictureWords/*.webp', { eager: true, query: '?url', import: 'default' })
export const imgUrl = (asset) => IMG[`../../assets/pictureWords/${asset}.webp`]

// Games: alt is always the neutral "그림" (the word never appears in the DOM before the child finds it).
export const GamePicture = ({ word, testid }) => (
  <img data-testid={testid} src={imgUrl(word.asset)} alt="그림" draggable={false} className="mx-auto h-40 w-40 max-w-full rounded-2xl bg-white object-contain card-shadow sm:h-52 sm:w-52" />
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
.pw-swing{animation:pw-swing .45s ease-out both}.pw-shake{animation:pw-shake .35s ease-in-out}.pw-bounce{animation:pw-bounce .5s ease-out}.pw-pop{animation:pw-pop .25s ease-out both}
.pw-tile{transition:transform .25s ease,opacity .25s ease}
.pw-cell{min-width:48px;min-height:48px}
@media (min-width:390px){.pw-cell{min-width:56px;min-height:56px}}
@media (prefers-reduced-motion: reduce){.pw-swing,.pw-shake,.pw-bounce,.pw-pop{animation:none}.pw-tile{transition:none}}
`
export const GameStyle = () => <style>{CSS}</style>
