// Vercel Serverless Function — runs server-side, never in the browser.
// The admin PIN is never shipped in the client bundle: it lives only in
// this server-only env var (ADMIN_PIN), and the client just gets a yes/no
// answer. This stops a student from finding the PIN by reading the JS
// bundle, which a client-side `if (pin === '0325')` check cannot prevent.
//
// 2026-07-24 P3 감사 후속 — side-effect import만으로 _pinAuth.js의 모듈-
// 최초-로드(콜드스타트) 시 ADMIN_PIN 약한 패턴 진단 경고를 이 로그인
// 엔드포인트에도 적용한다(진단 로직은 _pinAuth.js 한 곳에만 존재, 여기서
// 재정의하지 않음). 요청 처리 자체에는 아무 영향 없음 — 아래 handler는
// 이 import 전과 동일하게 동작한다.
import { timingSafeStringEqual, adminPinFailureDelay } from './_pinAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const adminPin = process.env.ADMIN_PIN
  if (!adminPin) {
    res.status(500).json({ error: 'Server not configured: ADMIN_PIN missing' })
    return
  }

  const { pin } = req.body || {}
  // 2026-09-04 — 평문 `===` 비교를 api/_pinAuth.js의 timingSafeStringEqual로
  // 교체(checkAdminReauth와 동일한 상수시간 비교로 통일, 타이밍 사이드채널
  // 방어). 응답 형식/상태코드는 완전히 동일하게 유지한다.
  const ok = timingSafeStringEqual(pin, adminPin)
  // 2026-07-16 P7 감사 후속 — 실패 시 지연(기본 1.5초, api/_pinAuth.js의
  // adminPinFailureDelay 공용 헬퍼로 이관 — 2026-09-04, checkAdminReauth/
  // clear-student-pin.js/set-student-pin.js와 동일한 지연 상수 공유).
  // Vercel 서버리스는 인스턴스가 휘발적이라 인메모리 시도 카운터는 신뢰할
  // 수 없고(운영자 지시로 DB 기반 잠금 같은 과설계도 하지 않음), 단순 응답
  // 지연만으로도 온라인 브루트포스 속도를 초당 수십 회 → 회당 1.5초+로
  // 늦춘다. 성공 응답은 지연 없음(관리자 UX 불변).
  if (!ok) await adminPinFailureDelay()
  res.status(200).json({ ok })
}
