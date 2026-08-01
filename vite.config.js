import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only shim for /api/verify-admin-pin (see api/verify-admin-pin.js) —
// `vite dev` doesn't run Vercel serverless functions at all, so without this
// the admin PIN screen is simply unreachable under `npm run dev` (only
// `vercel dev` executes api/*, and that has its own env-injection quirks
// with a custom Dev Command). Mirrors the real function's logic exactly;
// never touches `vite build`/production, which still uses the real
// serverless function unchanged.
function adminPinDevMiddleware(env) {
  return {
    name: 'admin-pin-dev-shim',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/verify-admin-pin') return next()
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json')
          const adminPin = env.ADMIN_PIN
          if (!adminPin) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Server not configured: ADMIN_PIN missing' }))
            return
          }
          let pin
          try { pin = JSON.parse(body || '{}').pin } catch { pin = undefined }
          res.statusCode = 200
          res.end(JSON.stringify({ ok: typeof pin === 'string' && pin === adminPin }))
        })
      })
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), ...(command === 'serve' ? [adminPinDevMiddleware(env)] : [])],
    base: '/',
    build: {
      rollupOptions: {
        output: {
          // Vendor 청크 분리(2026-08-02, 학생 경험 폴리시 Wave 5) — react/
          // react-dom과 @supabase는 앱 코드가 바뀌어도 거의 안 바뀌는 의존성
          // 이라, 별도 청크로 빼두면 배포마다 브라우저가 다시 받아야 하는
          // 캐시 무효화 범위가 앱 코드 청크로만 좁아진다. 청크 분류 기준만
          // 바꾸는 순수 빌드 설정 — 런타임 동작/기능은 전혀 안 바뀜.
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
          },
        },
      },
    },
  }
})
