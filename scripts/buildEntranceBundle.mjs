// Bundler for src/utils/entranceTestApi.js — buildWordLibBundle.mjs와 같은
// 패턴(esbuild로 import.meta.env.VITE_*를 .env 값으로 치환해 plain Node에서
// 실제 소스를 그대로 실행). 로직 복제 없음.
// Usage: node scripts/buildEntranceBundle.mjs && node scripts/testEntranceTestDb.mjs
import esbuild from 'esbuild'
import fs from 'node:fs'

const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

await esbuild.build({
  entryPoints: ['src/utils/entranceTestApi.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/entranceTestApi.bundle.mjs',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
  },
})
console.log('bundled -> scripts/.tmp/entranceTestApi.bundle.mjs')
