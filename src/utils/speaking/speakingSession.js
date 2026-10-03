// 2026-10-04 Speaking 첫 체험 — 순수 로직(DOM 없음). 녹음은 브라우저 메모리에만
// 있고 저장/채점/전송이 없다. 상태 전이를 reducer로 분리한 이유: 마이크/MediaRecorder
// 없이도 node 단위 테스트로 전이 규칙을 고정하기 위해서다.

export const SPEAKING_QUESTIONS = [
  { id: 'q1', en: 'What is your name?', ko: '내 이름은 뭐예요?' },
  { id: 'q2', en: 'What is your favorite color?', ko: '내가 좋아하는 색은?' },
  { id: 'q3', en: 'What do you like to eat?', ko: '내가 좋아하는 음식은?' },
]

// 안전 타이머 상한 / 너무 짧은 녹음(실수 탭)은 빈 녹음으로 취급하는 하한
export const MAX_RECORD_MS = 20000
export const MIN_RECORD_MS = 500

export const SPEAKING_MESSAGES = {
  denied: '마이크를 쓸 수 없어요. 설정에서 마이크를 허용해 주세요',
  nodevice: '마이크를 찾을 수 없어요',
  busy: '마이크가 다른 곳에서 쓰이고 있어요. 잠깐 뒤에 다시 해 봐요',
  empty: '소리가 안 들렸어요. 다시 해 볼까요?',
  unknown: '녹음을 시작할 수 없어요. 다시 해 볼까요?',
}

export const initialSpeakingState = {
  index: 0, status: 'idle', errorCode: null, durationMs: 0, hasAudio: false,
}

const lastIndex = SPEAKING_QUESTIONS.length - 1

export function speakingReducer(state, action) {
  switch (action.type) {
    case 'NEXT':
    case 'PREV': {
      const i = action.type === 'NEXT' ? state.index + 1 : state.index - 1
      if (i < 0 || i > lastIndex) return state
      // 문제를 바꾸면 이전 녹음은 버린다(화면 밖에 남겨 두지 않음)
      return { ...initialSpeakingState, index: i }
    }
    case 'REQUEST':
      return { ...state, status: 'requesting', errorCode: null, hasAudio: false, durationMs: 0 }
    case 'START':
      return { ...state, status: 'recording', errorCode: null }
    case 'STOP':
      if (!action.size || action.durationMs < MIN_RECORD_MS) {
        return { ...state, status: 'error', errorCode: 'empty', hasAudio: false, durationMs: 0 }
      }
      return { ...state, status: 'recorded', errorCode: null, hasAudio: true, durationMs: action.durationMs }
    case 'PLAY':
      return state.status === 'recorded' ? { ...state, status: 'playing' } : state
    case 'PLAY_END':
      return state.status === 'playing' ? { ...state, status: 'recorded' } : state
    case 'RETAKE':
      return { ...state, status: 'idle', errorCode: null, hasAudio: false, durationMs: 0 }
    case 'FAIL':
      return { ...state, status: 'error', errorCode: action.code || 'unknown', hasAudio: false, durationMs: 0 }
    case 'RESET':
      return initialSpeakingState
    default:
      return state
  }
}

export function mapMediaError(err) {
  const n = err && err.name
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return 'denied'
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'nodevice'
  if (n === 'NotReadableError' || n === 'AbortError') return 'busy'
  return 'unknown'
}

// iOS Safari는 audio/mp4만, Chrome/Firefox는 webm/ogg — 지원되는 첫 형식을 고른다
export const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function pickMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return ''
  for (const m of MIME_CANDIDATES) {
    try { if (isTypeSupported(m)) return m } catch { /* 다음 후보 */ }
  }
  return ''
}
