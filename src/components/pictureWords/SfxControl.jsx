// Sound ON/OFF + volume for the picture-word games (252차). A device preference only (see utils/pictureWords/sfx.js).
import React, { useRef, useSyncExternalStore } from 'react'
import { getSfxSettings, playSfx, setSfxSettings, subscribeSfx } from '../../utils/pictureWords/sfx.js'

export default function SfxControl() {
  const { on, volume } = useSyncExternalStore(subscribeSfx, getSfxSettings, getSfxSettings)
  const last = useRef(0)
  const pct = Math.round(volume * 100)
  return (
    <div data-testid="pwsfx-root" data-sfx-on={on ? 'true' : 'false'} data-sfx-volume={String(pct)} className="flex items-center gap-2 rounded-2xl bg-white/70 px-2">
      <button type="button" data-testid="pwsfx-toggle" aria-pressed={on} onClick={() => { setSfxSettings({ on: !on }); if (!on) playSfx('tap') }}
        className="min-h-[44px] min-w-[44px] rounded-2xl bg-pink-100 text-xl btn-press">{on ? '🔊' : '🔇'}</button>
      <input type="range" min="0" max="100" step="1" value={pct} data-testid="pwsfx-volume"
        onChange={(e) => {
          setSfxSettings({ volume: Number(e.target.value) / 100 })
          const now = Date.now()
          if (now - last.current > 150) { last.current = now; playSfx('tap') }
        }}
        className="h-11 min-w-0 flex-1 accent-pink-500" />
    </div>
  )
}
