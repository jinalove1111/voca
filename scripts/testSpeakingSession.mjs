// 2026-10-04 Speaking 첫 체험 — speakingSession.js 순수 로직 단위 테스트
import {
  SPEAKING_ITEM_COUNT, MAX_RECORD_MS, MIN_RECORD_MS, SPEAKING_MESSAGES,
  initialSpeakingState as S0, speakingReducer as r, mapMediaError, pickMimeType,
} from '../src/utils/speaking/speakingSession.js'

let fail = 0
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail++ }
const act = (s, type, extra = {}) => r(s, { type, ...extra })

check('문항 수 5(situation 표현 수와 동일)', SPEAKING_ITEM_COUNT === 5)
check('상수', MAX_RECORD_MS === 20000 && MIN_RECORD_MS === 500)

let s = act(S0, 'REQUEST')
check('REQUEST -> requesting', s.status === 'requesting')
s = act(s, 'START')
check('START -> recording', s.status === 'recording')
let ok = act(s, 'STOP', { durationMs: 1500, size: 1000 })
check('STOP ok -> recorded/hasAudio', ok.status === 'recorded' && ok.hasAudio && ok.durationMs === 1500)
check('STOP size 0 -> empty', act(s, 'STOP', { durationMs: 2000, size: 0 }).errorCode === 'empty')
const short = act(s, 'STOP', { durationMs: 499, size: 10 })
check('STOP <500ms -> error empty', short.status === 'error' && short.errorCode === 'empty' && !short.hasAudio)
check('STOP ==500ms 통과', act(s, 'STOP', { durationMs: 500, size: 10 }).status === 'recorded')
const pl = act(ok, 'PLAY')
check('PLAY -> playing', pl.status === 'playing')
check('PLAY_END -> recorded', act(pl, 'PLAY_END').status === 'recorded')
check('PLAY는 recorded에서만', act(S0, 'PLAY').status === 'idle')
const rt = act(ok, 'RETAKE')
check('RETAKE -> idle, 오디오 폐기', rt.status === 'idle' && !rt.hasAudio)
const f = act(S0, 'FAIL', { code: 'denied' })
check('FAIL -> error/denied', f.status === 'error' && f.errorCode === 'denied')
check('FAIL 코드 없으면 unknown', act(S0, 'FAIL').errorCode === 'unknown')
check('error에서 RETAKE -> idle/에러 해제', act(f, 'RETAKE').errorCode === null)
const n = act(ok, 'NEXT')
check('NEXT: index+1, 녹음 폐기', n.index === 1 && n.status === 'idle' && !n.hasAudio)
check('PREV at 0 -> 변화 없음', act(S0, 'PREV') === S0)
const last = { ...S0, index: 4 }
check('NEXT at end -> 변화 없음', act(last, 'NEXT') === last)
check('PREV: index-1', act(last, 'PREV').index === 3)
check('RESET', act(ok, 'RESET').status === 'idle' && act(n, 'RESET').index === 0)
check('알 수 없는 action은 state 유지', act(S0, 'XXX') === S0)

check('mapMediaError denied', ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].every((x) => mapMediaError({ name: x }) === 'denied'))
check('mapMediaError nodevice', ['NotFoundError', 'OverconstrainedError', 'DevicesNotFoundError'].every((x) => mapMediaError({ name: x }) === 'nodevice'))
check('mapMediaError busy', ['NotReadableError', 'AbortError'].every((x) => mapMediaError({ name: x }) === 'busy'))
check('mapMediaError unknown/null', mapMediaError({ name: 'X' }) === 'unknown' && mapMediaError(null) === 'unknown')
check('메시지 5종', ['denied', 'nodevice', 'busy', 'empty', 'unknown'].every((k) => SPEAKING_MESSAGES[k]))

check('pickMimeType: 우선순위(webm opus)', pickMimeType(() => true) === 'audio/webm;codecs=opus')
check('pickMimeType: iOS(mp4만)', pickMimeType((m) => m === 'audio/mp4') === 'audio/mp4')
check('pickMimeType: 없으면 빈 문자열', pickMimeType(() => false) === '')
check('pickMimeType: 함수 아님 -> 빈 문자열', pickMimeType(undefined) === '')

console.log(fail ? `\n${fail} FAILED` : '\nALL PASS')
process.exit(fail ? 1 : 0)
