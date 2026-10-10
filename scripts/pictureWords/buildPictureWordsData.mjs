// Generates src/data/pictureWords/pictureWords.json from scripts/pictureWords/source/*.json + the asset manifest.
// Never hand-edit the output. Network 0. Run: node scripts/pictureWords/buildPictureWordsData.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const verdicts = rd('scripts/pictureWords/source/verdicts.json')
const phonics = new Map(rd('scripts/pictureWords/source/phonics.json').map((p) => [p.id, p]))
const manifest = rd('src/assets/pictureWords/manifest.json').assets

const SHOP = {
  'Food Shop': 'food', 'School Shop': 'school', 'Toy Shop': 'toy', 'Clothes Shop': 'clothes',
  'Garden Shop': 'garden', 'Decoration Shop': 'decoration', 'Furniture Shop': 'furniture', 'Pet Shop': 'pet',
}

const entries = verdicts.map((v) => {
  const shop = SHOP[v.cat]
  if (!shop) throw new Error(`unknown cat ${v.cat} (${v.id})`)
  const m = manifest[v.id]
  if (!m) throw new Error(`no asset for ${v.id}`)
  const ph = phonics.get(v.id)
  const match = v.status === 'MATCH'
  const tracks = []
  if (match) {
    tracks.push('pictureVocabulary', 'shopVocabulary')
    if (ph) tracks.push('phonics')
    if (shop === 'garden' || shop === 'decoration') tracks.push('townObject')
  }
  return {
    id: v.id, sourceFile: v.file, asset: m.asset, status: v.status, shown: v.shown,
    en: v.word, enUS: v.us || null, ko: v.ko, reason: v.reason, shop, tracks,
    phonics: ph ? { group: ph.group, pattern: ph.pattern, ipa: ph.ipa, phonicsOrder: null } : null,
    existingWord: v.dbWord || null, newCandidate: !v.dbWord, autoLink: match,
    provenance: { picture: 'viewed', en: 'from-picture', ko: 'inferred', shop: 'inferred', enUS: 'inferred', phonics: 'inferred-from-spelling', existingWord: 'string-match' },
  }
})

const by = (k) => entries.reduce((a, e) => ((a[e[k]] = (a[e[k]] || 0) + 1), a), {})
const out = {
  generated: 'by scripts/pictureWords/buildPictureWordsData.mjs — do not hand-edit',
  phonicsReview: { orderConfirmed: false, note: '학습 순서 미확정 — 커리큘럼 확인 필요(임의 순서 아님). 그룹 내 정렬은 표시용일 뿐이다.' },
  counts: {
    total: entries.length, byStatus: by('status'), byShop: by('shop'),
    phonics: entries.filter((e) => e.phonics).length,
    existingWord: entries.filter((e) => e.existingWord).length,
    newCandidate: entries.filter((e) => e.newCandidate).length,
  },
  entries,
}
fs.mkdirSync(path.join(ROOT, 'src/data/pictureWords'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'src/data/pictureWords/pictureWords.json'), JSON.stringify(out, null, 1) + '\n')
console.log(JSON.stringify(out.counts))
