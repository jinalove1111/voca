export const SUCCESS_MSGS = [
  '와 폼 미쳤다! 🔥',
  '발음 레전드인데? 👑',
  '방금 원어민인 줄! 🌟',
  '이 단어 완전 잡았다! 💪',
  '보스 단어 순삭! ⚡',
  '오늘 영어력 폭발! 🚀',
  '오~ 귀가 뻥 뚫리는 발음! 👂',
  '지금 영어 자신감 +100! 💯',
  '오케이, 이 단어는 네 거다! 🎉',
  '이건 진짜 인정! 🤝',
  '방금 발음 좀 멋있었다! 😎',
  '선생님한테 자랑해야 함! 📣',
  '발음 미션 클리어! 🎯',
  '이 정도면 단어가 도망가겠는데? 🏃',
  '별 하나 받을 자격 충분! ⭐',
]

export const FAIL_MSGS = [
  '아깝다! 한 번만 더! 💪',
  '거의 됐어! 🌱',
  '다시 들어보고 가자! 🔊',
  '보스가 아직 버티고 있어! ⚔️',
  '조금만 더 또렷하게 말해보자! 🎤',
  '이제 거의 다 왔어! 🚀',
  '한 번 더 하면 잡는다! 🎯',
]

export const rndMsg = (arr) => arr[Math.floor(Math.random() * arr.length)]

const RATE_KEY = 'paulEasyVoca_speechRate'
export const getSpeechRate = () => parseFloat(localStorage.getItem(RATE_KEY) || '0.6')
export const setSpeechRate = (r) => localStorage.setItem(RATE_KEY, String(r))

// ── AudioContext unlock ─────────────────────────────────────────────────────
let _audioCtx = null
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!_audioCtx) _audioCtx = new AC()
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {})
    }
    if (_audioCtx.state === 'running') {
      const buffer = _audioCtx.createBuffer(1, 1, _audioCtx.sampleRate)
      const source = _audioCtx.createBufferSource()
      source.buffer = buffer
      source.connect(_audioCtx.destination)
      try { source.start(0) } catch {}
      setTimeout(() => { try { source.disconnect() } catch {} }, 200)
    }
  } catch {}
}

// ── Voice cache ─────────────────────────────────────────────────────────────
// Android Chrome loads voices asynchronously — cache them via voiceschanged.
// iOS Safari often returns voices synchronously; calling speak() with null
// voice is fine — the device uses its system default.
let _cachedVoices = []

function safeGetVoices() {
  if (!window.speechSynthesis?.getVoices) return _cachedVoices
  const v = window.speechSynthesis.getVoices()
  if (v.length > 0) _cachedVoices = v
  return _cachedVoices
}

function findBritish(voices) {
  return (
    voices.find(v => v.lang === 'en-GB') ||
    voices.find(v => v.name.toLowerCase().includes('british')) ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  )
}

// Pre-cache voices as soon as they become available (Android Chrome)
if (typeof window !== 'undefined' && window.speechSynthesis?.addEventListener) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    _cachedVoices = window.speechSynthesis.getVoices()
  })
}

// iOS bug: speechSynthesis stops after page goes to background.
// Resume it when the page becomes visible again.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.speechSynthesis?.paused) {
      window.speechSynthesis.resume()
    }
  })
}

// ── speak() ─────────────────────────────────────────────────────────────────
// IMPORTANT: Must be called synchronously inside a user-gesture handler on iOS.
// Do NOT wrap speechSynthesis.speak() in setTimeout or async callbacks —
// iOS Safari silently blocks TTS that starts outside a user gesture context.
export function speak(text, opts = {}) {
  const { twice = true, onEnd = null, rate = null } = opts
  const r = rate ?? getSpeechRate()
  if (!window.speechSynthesis) { onEnd?.(); return }
  unlockAudio()
  window.speechSynthesis.cancel()

  // Use cached voice synchronously — may be null on first call on Android,
  // which is fine: the device will use its default English voice.
  const voice = findBritish(safeGetVoices())

  const playOne = (cb) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-GB'
    u.rate = r
    u.pitch = 1
    u.volume = 1
    if (voice) u.voice = voice
    let done = false
    const finish = () => { if (!done) { done = true; cb?.() } }
    u.onend = finish
    u.onerror = finish
    setTimeout(finish, Math.max(2000, (text.length * 120) / r))
    window.speechSynthesis.speak(u)
  }

  if (twice) {
    playOne(() => setTimeout(() => playOne(() => onEnd?.()), 500))
  } else {
    playOne(() => onEnd?.())
  }
}

export function speakPraise(text, onEnd) {
  if (!window.speechSynthesis) { onEnd?.(); return }
  unlockAudio()
  window.speechSynthesis.cancel()

  const voice = findBritish(safeGetVoices())
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  u.rate = 0.95
  u.pitch = 1
  u.volume = 1
  if (voice) u.voice = voice
  let fired = false
  const finish = () => { if (!fired) { fired = true; onEnd?.() } }
  u.onend = finish
  u.onerror = finish
  setTimeout(finish, Math.max(1500, text.length * 80))
  window.speechSynthesis.speak(u)
}

export function hasSpeechRecognition() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

function normalize(str) {
  return str.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99
  const m = a.length, n = b.length
  const row = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = i
    for (let j = 1; j <= n; j++) {
      const curr = a[i - 1] === b[j - 1] ? row[j - 1] : 1 + Math.min(row[j], prev, row[j - 1])
      row[j - 1] = prev
      prev = curr
    }
    row[n] = prev
  }
  return row[n]
}

function lenientMatch(transcript, target) {
  const normT = normalize(transcript)
  const normTarget = normalize(target)
  if (normT.includes(normTarget)) return true
  const targetWords = normTarget.split(' ')
  if (targetWords.length === 1) {
    const stem = normTarget.replace(/(ing|tion|ed|ies|es|s)$/, '')
    if (stem.length >= 3 && normT.includes(stem)) return true
    return normT.split(' ').some(w => levenshtein(w, normTarget) <= (normTarget.length <= 5 ? 1 : 2))
  }
  const stopWords = new Set(['a','an','the','is','are','was','were','i','you','he','she','it','we','they','to','of','in','on','at','and','or','my','your','his','her','do','does','did'])
  const content = targetWords.filter(w => !stopWords.has(w) && w.length > 1)
  if (content.length === 0) return normT.includes(normTarget)
  const matched = content.filter(w => normT.includes(w)).length
  return matched >= Math.ceil(content.length * 0.6)
}

export function listenFor(targetWord, { onStart, onResult, onError } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) { onError?.('unsupported'); return null }
  const rec = new SR()
  rec.lang = 'en-US'
  rec.interimResults = false
  rec.maxAlternatives = 5
  rec.onstart = () => onStart?.()
  rec.onresult = (event) => {
    const transcripts = Array.from(event.results[0]).map(r => r.transcript)
    const success = transcripts.some(t => lenientMatch(t, targetWord))
    onResult?.(success, transcripts[0] || '')
  }
  rec.onerror = (event) => onError?.(event.error)
  try { rec.start() } catch (e) { onError?.(e.message) }
  return rec
}
