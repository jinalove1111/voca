// 모자 PNG 자산 + 매핑 + 렌더 지점 정적 검사. 실행: node scripts/testHatImages.mjs
// PNG import는 Node에서 실행 불가 → index.js는 소스 텍스트로 파싱한다.
import { readFileSync, statSync, existsSync } from 'node:fs'
import { HAT_CATALOG } from '../src/utils/attachment/hatSystem.js'

let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? '  ' + detail : ''}`)
  if (!cond) failed++
}
const read = (p) => readFileSync(p, 'utf8')
const COLORS = ['pink', 'red', 'orange', 'green', 'blue', 'navy', 'purple', 'gold']
const manifest = JSON.parse(read('src/assets/hats/manifest.json'))

console.log('\n=== 자산 ===')
for (const c of COLORS) {
  const f = `src/assets/hats/paul-hat-${c}.png`
  if (!check(`${c} 파일 존재`, existsSync(f))) continue
  const buf = readFileSync(f)
  const sig = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
  check(`${c} PNG 시그니처`, sig)
  check(`${c} IHDR 256x256 colour type 6`,
    buf.readUInt32BE(16) === 256 && buf.readUInt32BE(20) === 256 && buf[25] === 6,
    `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)} ct=${buf[25]}`)
  check(`${c} <= 64KB`, statSync(f).size <= 64 * 1024, String(statSync(f).size))
  const m = manifest.hats?.[c]
  check(`${c} manifest cornerAlpha 0`, m?.cornerAlpha === 0)
  check(`${c} manifest opaqueRatio 0.3~0.9`, m?.opaqueRatio >= 0.3 && m?.opaqueRatio <= 0.9, String(m?.opaqueRatio))
  check(`${c} manifest bytes == 실제 크기`, m?.bytes === statSync(f).size)
}
check('manifest hats 정확히 8종', Object.keys(manifest.hats || {}).length === 8)
check('manifest에 사용자 경로 없음', !/[\/]/.test(JSON.stringify(manifest.generatedFrom)))

console.log('\n=== 매핑(index.js 소스) ===')
const idx = read('src/assets/hats/index.js')
const block = idx.match(/HAT_COLOR_BY_ID\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const pairs = [...block.matchAll(/(hat_\w+)\s*:\s*'(\w+)'/g)].map((m) => [m[1], m[2]])
const ids = pairs.map((p) => p[0])
check('HAT_CATALOG 모든 id가 정확히 한 번씩 매핑',
  ids.length === HAT_CATALOG.length && HAT_CATALOG.every((h) => ids.filter((i) => i === h.id).length === 1),
  ids.join(','))
check('매핑 색이 8색 전부 1회씩(중복 없음)',
  JSON.stringify(pairs.map((p) => p[1]).sort()) === JSON.stringify([...COLORS].sort()))
for (const c of COLORS) check(`index.js가 ${c} PNG를 import`, idx.includes(`./paul-hat-${c}.png`))
check('hatImageFor/HAT_IMG_CLASS export', /export const hatImageFor/.test(idx) && /export const HAT_IMG_CLASS/.test(idx))

console.log('\n=== 렌더 지점 ===')
const SITES = [
  ['src/components/StudentHome.jsx', ['student-home-hat-img']],
  ['src/components/Dashboard.jsx', ['dashboard-hat-img']],
  ['src/components/HatCollection.jsx', ['hat-card-img-', 'hat-collection-avatar-img']],
  ['src/components/HatCeremony.jsx', ['hat-ceremony-img']],
  ['src/components/PaulTown.jsx', ['town-hat-rack-img-']],
]
for (const [f, tids] of SITES) {
  const t = read(f)
  for (const id of tids) check(`${f} testid ${id}`, t.includes(id))
  check(`${f} hatImageFor 사용`, /hatImageFor\(/.test(t) && /from '\.\.\/assets\/hats'/.test(t))
  check(`${f} hatTintStyle 폴백 유지`, /hatTintStyle\(/.test(t))
}
check('StudentHome/Dashboard/HatCollection 👑 폴백 유지',
  ['StudentHome', 'Dashboard', 'HatCollection'].every((n) => read(`src/components/${n}.jsx`).includes('👑')))

console.log('\n=== 레지스트리 ===')
check('registry에 testHatImages 등록', /testHatImages\.mjs/.test(read('tests/harness/registry.mjs')))

console.log(failed ? `\nFAIL ${failed}` : '\nALL PASS')
process.exit(failed ? 1 : 0)
