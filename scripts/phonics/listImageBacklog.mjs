// PAUL PHONICS image backlog (2026-10-13): words with image 'needed', by Book / Unit. Pure data, no files written.
// Usage: node scripts/phonics/listImageBacklog.mjs   (prints Markdown; imageBacklog() is exported for tests)
import { BOOKS, unitLabel } from '../../src/data/phonics/curriculum.js'
import { PHONICS_ITEMS, itemOfSlot } from '../../src/data/phonics/phonicsWords.js'
import fs from 'node:fs'

// imageCandidates.js imports .webp (bundler-only), so plain node reads its source instead of importing it
const REUSE = new Set([...fs.readFileSync(new URL('../../src/data/phonics/imageCandidates.js', import.meta.url), 'utf8').matchAll(/^\s*row\('([a-z]+)'/gm)].map((m) => m[1]))

export function imageBacklog() {
  const needed = PHONICS_ITEMS.filter((i) => i.image === 'needed')
  const homes = new Map() // word -> [{ book, unit }] in curriculum order; the first is its home
  const books = BOOKS.map((b) => ({
    no: b.no,
    title: b.titleKo,
    units: b.units.map((u, ui) => {
      const words = []
      for (const n of u.words || []) {
        const it = itemOfSlot(n)
        if (!it || it.image !== 'needed' || words.includes(it.word)) continue
        words.push(it.word)
        if (!homes.has(it.word)) homes.set(it.word, [])
        homes.get(it.word).push({ book: b.no, unit: ui + 1 })
      }
      return { no: ui + 1, label: unitLabel(u), words }
    }),
  }))
  const words = needed.map((i) => ({ word: i.word, ko: i.ko, reuse: REUSE.has(i.word), review: i.needsReview, appearances: homes.get(i.word) || [], home: (homes.get(i.word) || [])[0] || null }))
  const perBook = Object.fromEntries(BOOKS.map((b) => [b.no, words.filter((w) => w.home?.book === b.no).length]))
  return {
    total: needed.length,
    reuse: words.filter((w) => w.reuse).length,
    newToMake: words.filter((w) => !w.reuse).length,
    review: words.filter((w) => w.review).length,
    perBook,
    words,
    books,
  }
}

export function backlogMarkdown() {
  const s = imageBacklog()
  const by = new Map(s.words.map((w) => [w.word, w]))
  const mark = (w, book, unit) => {
    const x = by.get(w)
    const others = x.appearances.filter((a) => !(a.book === book && a.unit === unit))
    const note = others.length ? ` (${others.map((a) => (a.book === book ? `Unit ${a.unit}` : `Book ${a.book} Unit ${a.unit}`)).join(', ')}에도 나옴)` : ''
    return `${w}${x.reuse ? ' ♻' : ''}${x.review ? ' ⚠' : ''}${note}`
  }
  const out = [`이미지 필요 ${s.total}개 · 기존 그림 재사용 후보 ♻ ${s.reuse}개 · 새로 제작 ${s.newToMake}개 · 확인 필요 ⚠ ${s.review}개 · ${Object.entries(s.perBook).map(([k, v]) => `Book ${k} ${v}개`).join(' / ')}`, '', '♻ = 마을 그림 재사용 후보(승인 필요), ⚠ = 교사 확인 필요 단어, "(…에도 나옴)" = 다른 Unit에도 나오는 단어(첫 번째 나온 Unit이 기준이며 Book별 개수도 첫 등장 기준이라, 표에 보이는 단어 수와 다를 수 있음)', '']
  for (const b of s.books) {
    out.push(`### Book ${b.no} · ${b.title} (${s.perBook[b.no]}개)`, '', '| Unit | 목표 소리 | 그림이 필요한 단어 |', '|---|---|---|')
    for (const u of b.units) if (u.words.length) out.push(`| ${u.no} | ${u.label} | ${u.words.map((w) => mark(w, b.no, u.no)).join(', ')} |`)
    out.push('')
  }
  return out.join('\n')
}

if (process.argv[1]?.endsWith('listImageBacklog.mjs')) console.log(backlogMarkdown())
