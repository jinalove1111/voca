// Game-only effects (252차): sparkle stars around the picture and "success sound, then British pronunciation" scheduling.
// Kept out of pictureImg.jsx so the practice card (recorder) never imports the sound module.
import React, { useCallback, useEffect, useRef } from 'react'
import { getSfxSettings, playSfx, SUCCESS_MS } from '../../utils/pictureWords/sfx.js'
import { playEn } from './pictureImg.jsx'

const STARS = [['✦', '4%', '6%'], ['⭐', '88%', '4%'], ['✦', '-2%', '46%'], ['⭐', '92%', '50%'], ['✦', '10%', '88%'], ['✦', '82%', '86%']]
export const Sparkles = () => (
  <div data-testid="pw-sparkles" aria-hidden="true" className="pointer-events-none absolute inset-0">
    {STARS.map(([c, l, t], i) => <span key={i} data-testid="pw-sparkle" className="pw-spark-star pw-spark" style={{ left: l, top: t, animationDelay: `${i * 40}ms` }}>{c}</span>)}
  </div>
)

// Returns finish(en): success sound now, pronunciation ~520 ms later (after the arpeggio, never overlapping). Pending pronunciation is cancelled on unmount / cancel().
export function useSuccessThenSpeak() {
  const t = useRef(null)
  const cancel = useCallback(() => { clearTimeout(t.current); t.current = null }, [])
  useEffect(() => cancel, [cancel])
  const finish = useCallback((en) => {
    cancel()
    const { on, volume } = getSfxSettings()
    if (!on || volume <= 0) { playEn(en); return }
    playSfx('success')
    t.current = setTimeout(() => { t.current = null; playEn(en) }, SUCCESS_MS + 110)
  }, [cancel])
  return { finish, cancel }
}
