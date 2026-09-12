// src/utils/staleChunkRecovery.js — Stale Lazy Chunk 자동 복구(2026-09-12).
//
// 사고 배경: 프로덕션 배포마다 Vite가 모든 lazy 청크 파일명을 해시째로
// 바꾼다(import specifier cascade). 배포 전에 이미 앱을 열어둔 학생 세션이
// 배포 이후 처음으로 React.lazy 동적 import()를 실행하면, 브라우저가 이미
// 사라진 옛 청크 URL로 요청을 보내 404가 나고 React.lazy가 reject한다.
// React는 그 reject를 캐시하므로, AppErrorBoundary의 "그냥 다시 시도"
// (setState로 hasError만 되돌리는 것)로는 절대 복구되지 않는다 — 오직
// 전체 새로고침만 그 청크의 최신 URL(index.html의 새 매니페스트)을 다시
// 읽어와 해결한다. `vite:preloadError` 이벤트에도 지금까지 아무 핸들러가
// 없었다.
//
// 이 파일은 그 자동 복구 로직을 순수 함수로 분리한 것 — React/DOM에 직접
// 의존하지 않고 storage/reload를 전부 주입받아 테스트 가능하게 만든다
// (scripts/testStaleChunkRecovery.mjs).
//
// 루프 방지: sessionStorage(탭 범위, 로그아웃/기기 간 잔존 없음)에 마지막
// 자동 새로고침 시각을 기록해 60초 안에는 두 번째 자동 새로고침을 하지
// 않는다("guard_active") — 만약 새 배포 이후에도 청크가 계속 깨져 있다면
// (예: CDN 전파 지연) 무한 새로고침 루프 대신 크래시 화면에 머문다. 앱이
// 30초 이상 살아있으면(정상 동작 중이라는 뜻) 가드를 스스로 해제해, 그
// *다음* 미래의 배포도 똑같이 자동 복구될 수 있게 한다.
export const STALE_CHUNK_GUARD_KEY = 'paulEasyVoca_staleChunkReloadAt'
export const STALE_CHUNK_GUARD_WINDOW_MS = 60_000

const PATTERNS = [
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
  /Loading (CSS )?chunk [^ ]+ failed/i,
  /dynamically imported module/i,
]

// error?.name === 'ChunkLoadError'(webpack류 관례) 이거나, 메시지가 위
// 패턴 중 하나에 매칭되면 "배포로 인한 stale 청크" 오류로 판정한다.
// undefined/null/일반 데이터·인증·Supabase 오류에는 반드시 false를
// 반환해야 한다 — 이 판정이 오탐이면 무관한 오류에서도 강제 새로고침이
// 일어나 사용자 입력을 날릴 수 있다.
export function isStaleChunkError(error) {
  if (error === undefined || error === null) return false
  if (error?.name === 'ChunkLoadError') return true
  let message
  try {
    message = typeof error === 'string' ? error : String(error?.message ?? error)
  } catch {
    return false
  }
  if (!message) return false
  return PATTERNS.some((re) => re.test(message))
}

// 저장된 마지막 자동 새로고침 시각(ms epoch) — 없거나 읽기 실패(Safari
// 프라이빗 모드 등)면 null.
export function readGuard(storage) {
  try {
    const raw = storage?.getItem(STALE_CHUNK_GUARD_KEY)
    if (raw === undefined || raw === null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearStaleChunkGuard(storage) {
  try { storage?.removeItem(STALE_CHUNK_GUARD_KEY) } catch { /* 무시 — Safari 프라이빗 모드 등 */ }
}

// 30초(delayMs) 뒤 가드를 해제한다 — "앱이 살아있었다"는 사실 자체가
// 다음 배포에도 자동 복구를 다시 허용해도 안전하다는 신호. setTimer는
// 테스트에서 페이크로 주입한다(scheduleGuardReset(storage, ms, fakeSetTimeout)).
export function scheduleGuardReset(storage, delayMs = 30_000, setTimer = setTimeout) {
  return setTimer(() => clearStaleChunkGuard(storage), delayMs)
}

// 핵심 판정 + 부작용. 반환값의 reason으로 호출부가 로그만 남기고 아무
// 것도 더 하지 않게 한다(리로드는 이 함수 안에서 최대 1회만 일어난다).
//   - not_stale         : 이 오류가 애초에 stale 청크가 아님 → 아무 것도 안 함
//   - guard_active       : 60초 이내 이미 자동 새로고침을 했음 → 안 함(루프 방지)
//   - storage_unavailable: sessionStorage 쓰기 자체가 실패(Safari 프라이빗
//                          모드 등) → 1회 보장을 확신할 수 없으므로 안 함
//   - reloaded           : 가드 기록 후 실제로 reload() 호출
export function tryRecoverFromStaleChunk({ error, storage, reload, now = Date.now() } = {}) {
  if (!isStaleChunkError(error)) return { reloaded: false, reason: 'not_stale' }

  const guardedAt = readGuard(storage)
  if (guardedAt !== null && now - guardedAt < STALE_CHUNK_GUARD_WINDOW_MS) {
    return { reloaded: false, reason: 'guard_active' }
  }

  try {
    storage?.setItem(STALE_CHUNK_GUARD_KEY, String(now))
  } catch {
    return { reloaded: false, reason: 'storage_unavailable' }
  }

  try { reload?.() } catch { /* reload 자체가 던지는 경우는 호출부 책임 밖 — 무시 */ }
  return { reloaded: true, reason: 'reloaded' }
}
