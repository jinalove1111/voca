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

// ── Success sound effect ────────────────────────────────────────────────────
// Single preloaded Audio instance — reused (not recreated) on every play so
// there's no allocation/decoding delay and no overlapping playback.
let _successAudio = null
function getSuccessAudio() {
  if (!_successAudio) {
    _successAudio = new Audio('/success.wav')
    _successAudio.preload = 'auto'
    _successAudio.volume = 0.75
  }
  return _successAudio
}

export function playSuccessSound() {
  const audio = getSuccessAudio()
  try {
    audio.currentTime = 0
  } catch {}
  audio.play()?.catch(() => {})
}

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

// Android Chrome has a well-known bug where speak() called immediately after
// cancel() on an otherwise-idle queue silently drops the utterance (no sound,
// no error). Only cancel when something is actually queued/playing.
function safeCancelSpeech() {
  const s = window.speechSynthesis
  if (s.speaking || s.pending) s.cancel()
}

// "Warms up" the speech engine on the very first user gesture. Some Android
// Chrome builds stay silent on the first real speak() call until the engine
// has been touched once; a near-silent primer avoids that dead first tap.
let _primed = false
export function primeSpeech() {
  if (_primed || !window.speechSynthesis) return
  _primed = true
  try {
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    u.rate = 10
    window.speechSynthesis.speak(u)
  } catch {}
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

// ── playAudioUrl() ──────────────────────────────────────────────────────────
// Plays a pre-generated, stored mp3 (Supabase Storage word_audio_url /
// example_audio_url) — the only way word pronunciation and example audio are
// played in student-facing screens. No live TTS call happens here; the audio
// was generated once, server-side, when the word was added (see
// api/generate-audio.js). If there's no url yet, reports that via onError
// instead of silently doing nothing or substituting different audio.
// Only one word/example audio should ever be audible at once. Switching
// words mid-playback (fast tapping, auto-advance) must cut off whatever was
// playing before — otherwise the previous word's audio bleeds into the new
// screen.
let _currentAudio = null
export function stopCurrentAudio() {
  if (_currentAudio) {
    try { _currentAudio.pause() } catch {}
    _currentAudio = null
  }
}

export function playAudioUrl(url, opts = {}) {
  const { times = 1, rate = null, onEnd = null, onError = null } = opts
  stopCurrentAudio()
  if (!url) { onError?.('발음 파일이 없습니다.'); return }
  const r = rate ?? getSpeechRate()
  let played = 0

  const playOnce = () => {
    const audio = new Audio(url)
    _currentAudio = audio
    audio.playbackRate = Math.min(2, Math.max(0.5, r || 1))
    audio.volume = 1
    let done = false
    const advance = () => {
      if (done) return
      done = true
      if (_currentAudio === audio) _currentAudio = null
      played += 1
      if (played < times) setTimeout(playOnce, 400)
      else onEnd?.()
    }
    audio.onerror = () => { onError?.(audio.error?.message || `오디오 로드 실패: ${url}`); advance() }
    audio.onended = advance
    audio.play().catch((err) => { onError?.(err?.message || String(err)); advance() })
  }

  playOnce()
}

// ── speak() ─────────────────────────────────────────────────────────────────
// Live TTS for short fixed phrases that aren't tied to a stored word/example
// (e.g. the quiz's "Yar! Correct!" praise voice). Student-facing word and
// example pronunciation never goes through this — see playAudioUrl() above.
// IMPORTANT: Must be called synchronously inside a user-gesture handler on iOS.
// Do NOT wrap speechSynthesis.speak() in setTimeout or async callbacks —
// iOS Safari silently blocks TTS that starts outside a user gesture context.
export function speak(text, opts = {}) {
  const { onEnd = null, rate = null } = opts
  const r = rate ?? getSpeechRate()
  if (!window.speechSynthesis) { onEnd?.(); return }

  unlockAudio()
  safeCancelSpeech()
  const voice = findBritish(safeGetVoices())
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  u.rate = r
  u.pitch = 1
  u.volume = 1
  if (voice) u.voice = voice
  let done = false
  const finish = () => { if (!done) { done = true; onEnd?.() } }
  u.onend = finish
  u.onerror = finish
  setTimeout(finish, Math.max(2000, (text.length * 120) / r))
  window.speechSynthesis.speak(u)
}

export function speakPraise(text, onEnd) {
  speak(text, { rate: 0.95, onEnd })
}

export function hasSpeechRecognition() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// ── Shared microphone stream ────────────────────────────────────────────────
// Requesting a fresh getUserMedia() stream for every single recording
// attempt — and stopping all its tracks right after — causes some mobile
// browsers to re-prompt for mic permission on every word. Request the stream
// once per app session and hand the same live stream out to every caller;
// individual recordings just start/stop a MediaRecorder on top of it.
let _micStreamPromise = null
export function getMicStream() {
  if (_micStreamPromise) return _micStreamPromise
  _micStreamPromise = navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    .catch((err) => { _micStreamPromise = null; throw err })
  return _micStreamPromise
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
    const len = normTarget.length
    // Stem: remove common suffixes
    const stem = normTarget.replace(/(ing|tion|ness|ment|ed|ies|es|s)$/, '')
    if (stem.length >= 2 && normT.includes(stem)) return true
    // Prefix: if first ~60% of chars match (handles dropped endings common in Korean accent)
    const prefixLen = Math.max(3, Math.floor(len * 0.6))
    if (len >= 4 && normT.split(' ').some(w => w.startsWith(normTarget.slice(0, prefixLen)))) return true
    // Levenshtein: more lenient thresholds for Korean learners
    // Korean accent issues: v↔b, f↔p, l↔r, dropped consonant clusters, etc.
    const maxDist = len <= 4 ? 2 : len <= 7 ? 3 : 4
    return normT.split(' ').some(w => levenshtein(w, normTarget) <= maxDist)
  }
  const stopWords = new Set(['a','an','the','is','are','was','were','i','you','he','she','it','we','they','to','of','in','on','at','and','or','my','your','his','her','do','does','did'])
  const content = targetWords.filter(w => !stopWords.has(w) && w.length > 1)
  if (content.length === 0) return normT.includes(normTarget)
  const transcriptWords = normT.split(' ')
  // 50% threshold (was 60%) — Korean students often get most words but miss some
  const matched = content.filter(tw =>
    transcriptWords.some(rw =>
      rw.includes(tw) || tw.includes(rw) ||
      levenshtein(rw, tw) <= (tw.length <= 5 ? 2 : 3)
    )
  ).length
  return matched >= Math.ceil(content.length * 0.5)
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
