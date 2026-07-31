// src/learning/metrics/emit.js — memoryMetrics.js의 MEM_EV 이름들을
// 기존 익명 수집 파이프라인(src/utils/productEvents.js trackEvent)으로
// 보내는 얇은 IO 래퍼. 이 파일 자체는 anon_id 해시/dedupe/실패 무해화
// 등 어떤 수집 로직도 재구현하지 않는다 — 그건 전부 trackEvent 함수(기존에
// 이미 검증된 구현)의 몫이고, 여기서는 "어떤 studentId로 어떤 MEM_EV를
// 보낼지"만 결정한다.
//
// 하네스가 이 파일을 import하지 않는 이유(정직한 커버리지 경계, CLAUDE.md
// 규칙 18): productEvents.js는 모듈 스코프에서 곧바로 Supabase 클라이언트
// 생성 함수를 Vite 환경변수(VITE_SUPABASE_URL 등)로 즉시 실행한다(파일
// 최상단 `export const supabase = ...`). Vite 없이 plain Node로 이 파일을
// import하면 그 값들이 undefined라 즉시 "supabaseUrl is required." 로
// 크래시한다(직접 실측 확인) — memory/storage/reviewDataBackend.js처럼
// client를 주입받는 설계로 피할 수 없다(trackEvent는 기존 고정 함수라
// 시그니처를 바꿀 수 없음, 그리고 이 파일 소유 범위 밖). 그래서
// tests/harness/runMemoryEngine.mjs는 이 파일을 import하지 않고 소스
// 레벨 검사(정확한 이벤트 이름 위임/무작위 함수 미사용/supabase 직접 호출
// 없음)만 한다.
import { trackEvent } from '../../utils/productEvents'
import { MEM_EV } from './memoryMetrics.js'

export function emitReviewSessionStarted(studentId) {
  trackEvent(studentId, MEM_EV.memoryReviewSessionStarted)
}

export function emitReviewSessionCompleted(studentId) {
  trackEvent(studentId, MEM_EV.memoryReviewSessionCompleted)
}

export function emitBoxPromoted(studentId) {
  trackEvent(studentId, MEM_EV.memoryBoxPromoted)
}

export function emitBoxDemoted(studentId) {
  trackEvent(studentId, MEM_EV.memoryBoxDemoted)
}
