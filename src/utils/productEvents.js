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

const _sentToday = new Set() // `${event}:${studentId}:${localDay}` — 세션 내 dedupe
const localDay = () => new Date().toDateString()

export function trackEvent(studentId, event) {
  try {
    if (!studentId || !event || !isFeatureEnabled('productAnalytics')) return
    // 공용 기기(교실 PC 등)에서 같은 브라우저 세션 안에 학생 A -> 학생 B로
    // 로그인이 바뀌는 시나리오 방어. 이 Set은 페이지 로드 동안(=세션 내)
    // 유지되는 모듈 전역이라, 학생 축 없이 `${event}:${day}`만 키로 쓰면
    // A가 이미 보낸 이벤트를 B가 똑같이 발생시켜도 조용히 무시됐다(관찰
    // 레이어가 B의 행동을 놓침). studentId를 키에 포함해 학생별로 dedupe.
    // 하위호환: 오늘 날짜로 이미 쌓인 구 형식 키(`${event}:${day}`)는 이
    // 새 키와 매치되지 않아 그냥 무시될 뿐(최초 1회 추가 전송 가능성) —
    // Set은 순수 세션 내 캐시라 저장 데이터 손상/중복 삽입 위험은 없다.
    const key = `${event}:${studentId}:${localDay()}`
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

