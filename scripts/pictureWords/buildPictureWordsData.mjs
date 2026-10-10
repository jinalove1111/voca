// Generates src/data/pictureWords/pictureWords.json from scripts/pictureWords/source/*.json + the asset manifest.
// Never hand-edit the output. Network 0. Run: node scripts/pictureWords/buildPictureWordsData.mjs
import fs from 'node:fs'
import path from 'node:path'
import { validate } from './validateDecisions.mjs'

const ROOT = path.resolve(import.meta.dirname, '../..')
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const verdicts = rd('scripts/pictureWords/source/verdicts.json')
const phonics = new Map(rd('scripts/pictureWords/source/phonics.json').map((p) => [p.id, p]))
const decDoc = rd('scripts/pictureWords/source/decisions.json')
const vr = validate(decDoc, verdicts)
if (vr.errors.length) { console.error('decisions.json invalid: ' + vr.errors.join(' | ')); process.exit(1) }
const decisions = decDoc.decisions
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
  const dx = Object.prototype.hasOwnProperty.call(decisions, v.id) ? decisions[v.id] : null
  const decision = dx ? dx.action : null
  const learn = v.status === 'MATCH' || decision === 'approve'
  const en = decision === 'approve' && dx.en ? dx.en : v.word
  const ko = decision === 'approve' && dx.ko ? dx.ko : v.ko
  const tracks = []
  if (learn) {
    tracks.push('pictureVocabulary', 'shopVocabulary')
    if (shop === 'garden' || shop === 'decoration') tracks.push('townObject')
  }
  return {
    id: v.id, sourceFile: v.file, asset: m.asset, status: v.status, shown: v.shown,
    en, ko, suggested: { en: v.word, ko: v.ko }, enUS: v.us || null, reason: v.reason, shop,
    decision, learn, tracks,
    phonicsCandidate: ph ? { group: ph.group, pattern: ph.pattern, ipa: ph.ipa } : null,
    existingWord: v.dbWord || null, newCandidate: !v.dbWord, autoLink: v.status === 'MATCH',
    provenance: { picture: 'viewed', en: 'from-picture', ko: 'inferred', shop: 'inferred', enUS: 'inferred', phonics: 'inferred-from-spelling', existingWord: 'string-match' },
  }
})

const by = (k) => entries.reduce((a, e) => ((a[e[k]] = (a[e[k]] || 0) + 1), a), {})
const out = {
  generated: 'by scripts/pictureWords/buildPictureWordsData.mjs — do not hand-edit',
  phonicsReview: { orderConfirmed: false, classified: false, note: '학습 순서 미확정 — 교재의 유닛별 소리 순서 확인 전까지 Phonics를 분류하지 않는다(운영자 지시). 후보 그룹은 검토용일 뿐이다.' },
  counts: {
    total: entries.length, byStatus: by('status'), byShop: by('shop'),
    phonicsCandidates: entries.filter((e) => e.phonicsCandidate).length,
    learnable: entries.filter((e) => e.learn).length,
    approved: entries.filter((e) => e.decision === 'approve').length,
    edited: entries.filter((e) => e.decision === 'approve' && (e.en !== e.suggested.en || e.ko !== e.suggested.ko)).length,
    excluded: entries.filter((e) => e.decision === 'exclude').length,
    pending: entries.filter((e) => ['MISMATCH', 'UNCERTAIN', 'MULTIPLE'].includes(e.status) && !e.decision).length,
    existingWord: entries.filter((e) => e.existingWord).length,
    newCandidate: entries.filter((e) => e.newCandidate).length,
  },
  pending: entries.filter((e) => ['MISMATCH', 'UNCERTAIN', 'MULTIPLE'].includes(e.status) && !e.decision).map((e) => e.id),
  entries,
}
fs.mkdirSync(path.join(ROOT, 'src/data/pictureWords'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'src/data/pictureWords/pictureWords.json'), JSON.stringify(out, null, 1) + '\n')
console.log(JSON.stringify(out.counts))
