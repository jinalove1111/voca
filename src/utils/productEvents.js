// 익명 제품 이벤트(2026-07-23, 관찰 레이어) — 수집 + 순수 집계.
//
// 프라이버시: 개인정보 0. anon_id = sha256(studentId) 앞 16hex(단방향,
// Web Crypto — 외부 의존성 없음). 이름/원본 id는 어떤 payload에도 없다.
// 수집은 fire-and-forget: 실패/테이블 부재(supabase_v3_2_product_events.sql
// 미실행)/플래그 OFF 전부 조용히 no-op — 학습 흐름을 절대 막지 않는다.
// 볼륨 제어: (이벤트, 로컬 날짜)당 세션 내 1회만 insert(dedupe Set).
//
// 집계 함수들은 전부 순수(행 배열 입력, I/O 0) — 하네스가 직접 단언한다.
// 핵심 질문: "어떤 기능이 자발적 복귀와 상관있나" → computeReturnRates가
// 기능별 익일 복귀율을 내림차순으로 낸다.
import { supabase } from './supabaseClient'
import { isFeatureEnabled } from '../config/features'

export { EV } from './analyticsMath'

const _anonCache = new Map()
async function anonIdFor(studentId) {
  if (_anonCache.has(studentId)) return _anonCache.get(studentId)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(studentId)))
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
  _anonCache.set(studentId, hex)
  return hex
}

const _sentToday = new Set() // `${event}:${localDay}` — 세션 내 dedupe
const localDay = () => new Date().toDateString()

export function trackEvent(studentId, event) {
  try {
    if (!studentId || !event || !isFeatureEnabled('productAnalytics')) return
    const key = `${event}:${localDay()}`
    if (_sentToday.has(key)) return
    _sentToday.add(key)
    anonIdFor(studentId)
      .then((anonId) => supabase.from('product_events').insert({ anon_id: anonId, event }))
      .then(({ error }) => {
        // 테이블 부재/그 외 실패 전부 무해 — 콘솔에도 남기지 않는다(소음 방지)
        if (error && !/does not exist|schema cache/i.test(error.message || '')) {
          // 진짜 예외적 실패만 조용히 기록
          console.debug('[productEvents] insert 실패(무해):', error.message)
        }
      })
      .catch(() => {})
  } catch { /* 절대 학습 흐름을 막지 않는다 */ }
}

