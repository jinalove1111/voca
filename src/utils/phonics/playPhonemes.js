// PAUL PHONICS phoneme playback (256차). Plays teacher-approved single-sound clips ONLY — a STRICT no-op if any requested sound has no approved clip
// (it never falls back to TTS, never plays a partial sequence). Returns cancel(); onDone runs after the last clip is started (not called for a no-op).
import { PHONEME_CLIPS, phonemeClip } from '../../data/phonics/phonemeClips.js'

export const PHONEME_GAP_MS = 350
const defaultPlay = (src) => { const a = new Audio(src); a.play().catch(() => {}); return a }

export const allApproved = (ipas, clips = PHONEME_CLIPS) => ipas.length > 0 && ipas.every((p) => phonemeClip(p, clips))

export function playPhonemes(ipas, { clips = PHONEME_CLIPS, gap = PHONEME_GAP_MS, play = defaultPlay, onDone } = {}) {
  if (!allApproved(ipas, clips)) return () => {}
  const timers = []
  let live = true
  ipas.forEach((p, i) => {
    const go = () => { if (live) play(phonemeClip(p, clips).src) }
    if (i === 0) go(); else timers.push(setTimeout(go, i * gap))
  })
  timers.push(setTimeout(() => { if (live) onDone?.() }, (ipas.length - 1) * gap + gap))
  return () => { live = false; timers.forEach(clearTimeout) }
}
