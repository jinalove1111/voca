// Vercel Serverless Function — runs server-side, never in the browser.
// The admin PIN is never shipped in the client bundle: it lives only in
// this server-only env var (ADMIN_PIN), and the client just gets a yes/no
// answer. This stops a student from finding the PIN by reading the JS
// bundle, which a client-side `if (pin === '0325')` check cannot prevent.
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
  const ok = typeof pin === 'string' && pin === adminPin
  // 2026-07-16 P7 감사 후속 — 실패 시 1.5초 지연. Vercel 서버리스는
  // 인스턴스가 휘발적이라 인메모리 시도 카운터는 신뢰할 수 없고(운영자
  // 지시로 DB 기반 잠금 같은 과설계도 하지 않음), 단순 응답 지연만으로도
  // 온라인 브루트포스 속도를 초당 수십 회 → 회당 1.5초+로 늦춘다.
  // 성공 응답은 지연 없음(관리자 UX 불변).
  if (!ok) await new Promise((resolve) => setTimeout(resolve, 1500))
  res.status(200).json({ ok })
}
