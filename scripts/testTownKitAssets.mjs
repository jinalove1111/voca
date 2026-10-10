// Static checks for src/assets/town/kit (WebP art kit built by scripts/town/buildTownKit.py). Network 0.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const KIT = path.join(ROOT, 'src/assets/town/kit')
let fail = 0, n = 0
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m) } }

const manifest = JSON.parse(fs.readFileSync(path.join(KIT, 'manifest.json'), 'utf8'))
const entries = Object.values(manifest.targets)
const isWebp = (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Known art that cannot meet its budget even at the quality floor (70) — recorded, not hidden.
const OVER_BUDGET_OK = new Set(['backgrounds/plaza-topdown'])

const expected = new Set(['manifest.json'])
for (const t of entries) {
  const [dir, name] = t.target.split('/')
  ok(KEBAB.test(dir) && KEBAB.test(name), `kebab-case: ${t.target}`)
  ok(!path.isAbsolute(t.sourceFile) && !/[\/]/.test(t.sourceFile), `sourceFile is a basename: ${t.target}`)
  if (t.skipped) { ok(!!t.reason, `skipped has reason: ${t.target}`); continue }
  const back = dir === 'backgrounds'
  const [b1, b2] = back ? [90, 260] : [40, 120]
  for (const [suffix, bytes] of [['', t.bytes], ['@2x', t.bytes2x]]) {
    const rel = `${t.target}${suffix}.webp`
    expected.add(rel)
    const f = path.join(KIT, rel)
    ok(fs.existsSync(f), `file exists: ${rel}`)
    if (!fs.existsSync(f)) continue
    const buf = fs.readFileSync(f)
    ok(isWebp(buf), `WebP magic: ${rel}`)
    ok(buf.length === bytes, `manifest bytes match: ${rel}`)
    const lim = (suffix ? b2 : b1) * 1024
    ok(buf.length <= lim || OVER_BUDGET_OK.has(t.target), `budget ${lim}: ${rel} (${buf.length})`)
  }
  ok(t.w2x >= t.w && t.h2x >= t.h, `2x not smaller than 1x: ${t.target}`)
  if (!back) {
    ok(Math.max(t.w, t.h) <= 256 && Math.max(t.w2x, t.h2x) <= 512, `sprite size limits: ${t.target}`)
    ok(t.alpha === true || t.flags.includes('no-alpha-channel'), `alpha recorded: ${t.target}`)
  } else ok(t.w === 768 && t.w2x === 1536 && t.alpha === false, `backdrop dims: ${t.target}`)
}
ok(manifest.totals.built + manifest.totals.skipped === entries.length, 'totals consistent')

// no orphan files in the kit
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(KIT, path.join(d, e.name)).split(path.sep).join('/')])
// kit 루트의 import 전용 JS 모듈(townMission.js 등)은 아트가 아니므로 고아 검사에서 제외(import 격리 가드는 그대로 — 호출부는 ALLOWED 디렉터리만).
for (const f of walk(KIT)) ok(expected.has(f) || /^[A-Za-z]+\.js$/.test(f), `no orphan file: ${f}`)

// import isolation: only grammar / proto2_5d code may reference assets/town/kit
const ALLOWED = ['src/components/grammar/', 'src/utils/grammar/', 'src/components/town/proto2_5d/', 'src/utils/town/proto2_5d/']
const scan = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name)
  if (e.isDirectory()) return e.name === 'kit' && p === KIT ? null : scan(p)
  if (!/\.(js|jsx|mjs|ts|tsx|css|html)$/.test(e.name)) return
  const rel = path.relative(ROOT, p).split(path.sep).join('/')
  if (fs.readFileSync(p, 'utf8').includes('assets/town/kit'))
    ok(ALLOWED.some((a) => rel.startsWith(a)), `kit referenced outside allowed dirs: ${rel}`)
})
scan(path.join(ROOT, 'src'))

console.log(`testTownKitAssets: ${n - fail}/${n} PASS`)
process.exit(fail ? 1 : 0)
