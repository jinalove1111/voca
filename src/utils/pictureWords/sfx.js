// Picture Vocabulary sound effects (252차). Web Audio only: every sound is synthesised from oscillator + gain envelopes — no audio files, no packages.
// One lazily created AudioContext (created/resumed inside playSfx, i.e. inside a user gesture; never on import or mount).
// A device preference (on/off + volume) lives in ONE localStorage key; it is not student data. No network, no rewards.
const KEY = 'paulEasyVoca_pictureWordSfx'
const DEFAULTS = { on: true, volume: 0.6 }

const clamp01 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULTS.volume }
const store = () => { try { return globalThis.localStorage || null } catch { return null } }

let settings = null
const subs = new Set()

export function getSfxSettings() {
  if (!settings) {
    settings = { ...DEFAULTS }
    try {
      const raw = JSON.parse(store()?.getItem(KEY) || 'null')
      if (raw && typeof raw === 'object') settings = { on: typeof raw.on === 'boolean' ? raw.on : DEFAULTS.on, volume: 'volume' in raw ? clamp01(raw.volume) : DEFAULTS.volume }
    } catch { /* corrupt or unavailable storage -> defaults */ }
  }
  return settings
}

export function setSfxSettings(partial = {}) {
  const cur = getSfxSettings()
  settings = {
    on: typeof partial.on === 'boolean' ? partial.on : cur.on,
    volume: 'volume' in partial ? clamp01(partial.volume) : cur.volume,
  }
  try { store()?.setItem(KEY, JSON.stringify(settings)) } catch { /* works without storage */ }
  subs.forEach((fn) => { try { fn(settings) } catch { /* a bad subscriber must not break the others */ } })
  return settings
}

export function subscribeSfx(fn) {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

// Voice = [type, startHz, endHz, offsetSec, durationSec, peakGain]. Each effect <= 250 ms (success <= 600 ms).
const VOICES = {
  tap: [['sine', 190, 95, 0, 0.09, 0.5]], // light "톡"
  right: [['sine', 190, 95, 0, 0.09, 0.4], ['triangle', 660, 990, 0.05, 0.15, 0.45]], // thud + bright rising "팝" (200 ms)
  wrong: [['sine', 190, 95, 0, 0.09, 0.3], ['sine', 230, 165, 0.05, 0.18, 0.3]], // thud + soft low falling "툭" (230 ms), never a buzzer
  success: [523.25, 659.25, 783.99, 1046.5].map((f, i) => ['triangle', f, f, i * 0.08, 0.17, 0.4]), // C5 E5 G5 C6 arpeggio (410 ms)
}
export const SUCCESS_MS = 410

let ctx = null
function getCtx() {
  if (ctx) return ctx
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!AC) return null
  try { ctx = new AC() } catch { ctx = null }
  return ctx
}

export function playSfx(name) {
  const { on, volume } = getSfxSettings()
  const voices = VOICES[name]
  if (!on || volume <= 0 || !voices) return
  try {
    const c = getCtx()
    if (!c) return
    if (c.state === 'suspended') c.resume?.()
    const t0 = c.currentTime
    for (const [type, f0, f1, off, dur, peak] of voices) {
      const osc = c.createOscillator()
      const g = c.createGain()
      const s = t0 + off
      osc.type = type
      osc.frequency.value = f0
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, s + dur)
      g.gain.setValueAtTime(0.0001, s)
      g.gain.linearRampToValueAtTime(peak * volume, s + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur)
      osc.connect(g)
      g.connect(c.destination)
      osc.onended = () => { try { osc.disconnect(); g.disconnect() } catch { /* already gone */ } }
      osc.start(s)
      osc.stop(s + dur + 0.02)
    }
  } catch { /* Web Audio unavailable or blocked: silent no-op */ }
}
