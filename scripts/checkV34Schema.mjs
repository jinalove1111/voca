// v3.4 라이브 스키마 확인(읽기 전용, 2026-07-23)
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const H = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` }
for (const q of [
  'passage_sentences?select=id,is_key_sentence,importance_level,grammar_point,chunks&limit=1',
  'sentence_progress?select=id,current_stage,completed_stages&limit=1',
  'sentence_words?select=sentence_id,word_id&limit=1',
]) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${q}`, { headers: H })
  console.log(`${q.split('?')[0]} -> ${r.status}${r.status !== 200 ? ' ' + (await r.text()).slice(0, 120) : ' OK (RLS policy active)'}`)
}
