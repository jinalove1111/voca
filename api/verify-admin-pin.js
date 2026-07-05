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
  res.status(200).json({ ok: typeof pin === 'string' && pin === adminPin })
}
