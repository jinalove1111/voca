// Bundler for src/utils/wordLibrary.js — produces the WORDLIB_BUNDLE all the
// testXxx.mjs scripts in this directory expect (esbuild, Vite's
// import.meta.env.VITE_* replaced with the values from .env so plain Node
// can run the real source unmodified, no logic duplication). Mirrors
// buildRaceBundle.mjs's existing pattern for useStudent.js.
// Usage: node scripts/buildWordLibBundle.mjs && WORDLIB_BUNDLE=scripts/.tmp/wordLibrary.bundle.mjs node scripts/testXxx.mjs
import esbuild from 'esbuild'
import fs from 'node:fs'

const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/wordLibrary.bundle.mjs',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
  },
})
console.log('bundled -> scripts/.tmp/wordLibrary.bundle.mjs')
