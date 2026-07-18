#!/usr/bin/env node
// scripts/wikiSearch.mjs — local keyword search over wiki/ + the 6 root docs
// + handoff.md. No external search library, no vector DB, no network calls —
// Node built-in fs/path only (repo policy: minimize external dependencies,
// see DEVELOPER_GUIDE.md Development Rules #5).
//
// Usage:
//   node scripts/wikiSearch.mjs "search terms" [--limit N] [--context N]
//   npm run wiki:search -- "search terms"
//
// Ranking: simple, deliberately unsophisticated (no embeddings/vectors) —
// for each query term, count case-insensitive occurrences per line, merge
// adjacent matching lines into one excerpt block, score a block by summed
// term-occurrence count (+ a small bonus if the block contains a markdown
// heading line, since headings are usually the most relevant anchor).
// Blocks are sorted by score descending. This is "good enough" for a
// ~10-file, low-thousands-of-lines corpus — see wiki/HOME.md for why a
// heavier approach (vector DB, embeddings) was intentionally not built.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const ROOT_DOCS = [
  'PROJECT_GUIDE.md',
  'ARCHITECTURE.md',
  'DATABASE.md',
  'DEVELOPER_GUIDE.md',
  'TESTING.md',
  'ROADMAP.md',
  'handoff.md',
]

function wikiFiles() {
  const wikiDir = join(ROOT, 'wiki')
  try {
    return readdirSync(wikiDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => join('wiki', f))
  } catch {
    return []
  }
}

function targetFiles() {
  const files = [...ROOT_DOCS, ...wikiFiles()]
  return files.filter((relPath) => {
    try {
      return statSync(join(ROOT, relPath)).isFile()
    } catch {
      return false
    }
  })
}

function parseArgs(argv) {
  const args = argv.slice(2)
  let limit = 15
  let context = 2
  const terms = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') {
      limit = parseInt(args[++i], 10) || limit
    } else if (args[i] === '--context') {
      context = parseInt(args[++i], 10) || context
    } else {
      terms.push(args[i])
    }
  }
  return { query: terms.join(' ').trim(), limit, context }
}

function scoreLine(line, terms) {
  const lower = line.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (!term) continue
    let idx = 0
    while (true) {
      const found = lower.indexOf(term, idx)
      if (found === -1) break
      score += 1
      idx = found + term.length
    }
  }
  return score
}

function searchFile(relPath, terms, context) {
  let text
  try {
    text = readFileSync(join(ROOT, relPath), 'utf8')
  } catch {
    return []
  }
  const lines = text.split(/\r?\n/)
  const lineScores = lines.map((line) => scoreLine(line, terms))

  // find matching line indices, merge ones within `context*2` lines of gap
  const matchIdx = []
  for (let i = 0; i < lineScores.length; i++) {
    if (lineScores[i] > 0) matchIdx.push(i)
  }
  if (matchIdx.length === 0) return []

  const blocks = []
  let blockStart = matchIdx[0]
  let blockEnd = matchIdx[0]
  for (let k = 1; k < matchIdx.length; k++) {
    const i = matchIdx[k]
    if (i - blockEnd <= context * 2 + 1) {
      blockEnd = i
    } else {
      blocks.push([blockStart, blockEnd])
      blockStart = i
      blockEnd = i
    }
  }
  blocks.push([blockStart, blockEnd])

  return blocks.map(([start, end]) => {
    const from = Math.max(0, start - context)
    const to = Math.min(lines.length - 1, end + context)
    let score = 0
    let hasHeading = false
    for (let i = start; i <= end; i++) {
      score += lineScores[i]
      if (/^#{1,6}\s/.test(lines[i])) hasHeading = true
    }
    if (hasHeading) score += 3
    const excerpt = lines.slice(from, to + 1)
    return {
      file: relPath.split('\\').join('/'),
      lineStart: from + 1,
      lineEnd: to + 1,
      score,
      excerpt,
    }
  })
}

function main() {
  const { query, limit, context } = parseArgs(process.argv)
  if (!query) {
    console.log('Usage: node scripts/wikiSearch.mjs "search terms" [--limit N] [--context N]')
    console.log('       npm run wiki:search -- "search terms"')
    process.exit(1)
  }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const files = targetFiles()

  let results = []
  for (const f of files) {
    results.push(...searchFile(f, terms, context))
  }
  results.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.lineStart - b.lineStart)
  results = results.slice(0, limit)

  if (results.length === 0) {
    console.log(`No matches for "${query}" in ${files.length} files (wiki/ + root docs + handoff.md).`)
    return
  }

  console.log(`"${query}" — ${results.length} result(s) (ranked, top ${limit}) across ${files.length} files:\n`)
  for (const r of results) {
    console.log(`[score ${r.score}] ${r.file}:${r.lineStart}-${r.lineEnd}`)
    for (const line of r.excerpt) {
      console.log(`    ${line}`)
    }
    console.log('')
  }
}

main()
