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

function getBritishVoice() {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find(v => v.lang === 'en-GB') ||
    voices.find(v => v.name.toLowerCase().includes('british')) ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  )
}

export function speak(text, opts = {}) {
  const { twice = true, onEnd = null, rate = null } = opts
  const r = rate ?? getSpeechRate()
  if (!window.speechSynthesis) { onEnd?.(); return }
  window.speechSynthesis.cancel()

  const playOne = (cb) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-GB'
    u.rate = r
    u.pitch = 1
    const britishVoice = getBritishVoice()
    if (britishVoice) u.voice = britishVoice
    let done = false
    const finish = () => { if (!done) { done = true; cb?.() } }
    u.onend = finish
    u.onerror = finish
    const ms = Math.max(2000, (text.length * 120) / r)
    setTimeout(finish, ms)
    window.speechSynthesis.speak(u)
  }

  if (twice) {
    playOne(() => setTimeout(() => playOne(() => onEnd?.()), 500))
  } else {
    playOne(() => onEnd?.())
  }
}

// Fixed-rate praise (en-GB, rate 0.95). Calls onEnd when done.
export function speakPraise(text, onEnd) {
  if (!window.speechSynthesis) { onEnd?.(); return }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  u.rate = 0.95
  u.pitch = 1
  const britishVoice = getBritishVoice()
  if (britishVoice) u.voice = britishVoice
  let fired = false
  const finish = () => { if (!fired) { fired = true; onEnd?.() } }
  u.onend = finish
  u.onerror = finish
  // Fallback: fire after estimated duration
  setTimeout(finish, Math.max(1500, text.length * 80))
  window.speechSynthesis.speak(u)
}

export function hasSpeechRecognition() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
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
    const transcripts = Array.from(event.results[0]).map(r => r.transcript.toLowerCase().trim())
    const target = targetWord.toLowerCase().trim()
    const success = transcripts.some(t => t.includes(target))
    onResult?.(success, transcripts[0] || '')
  }
  rec.onerror = (event) => onError?.(event.error)
  try { rec.start() } catch (e) { onError?.(e.message) }
  return rec
}
