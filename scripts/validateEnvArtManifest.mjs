// scripts/validateEnvArtManifest.mjs — Paul Town V2 environment art
// manifest validator (2026-09-17, engineering prep for the V2 world
// contract). Zero external dependencies (CLAUDE.md rule 6) — plain Node
// fs/path/crypto only, same style as scripts/validateTownAssetCandidate.mjs.
//
// Validates docs/design/town/manifest/env-art-manifest.json (the ART/
// RENDERING contract for Batch 1 — see that file's own $schema_note) against:
//   - basic schema shape (assets map, required fields present)
//   - unique keys in the `assets` object, checked BOTH at the parsed-object
//     level and at the raw JSON *text* level (JSON.parse silently collapses
//     a literal duplicate key onto one entry, so a text-level scan is the
//     only way to actually catch that class of bug — see
//     checkDuplicateAssetKeys below)
//   - every docs/design/town/manifest/env-art-batch1.spec.json key present
//     in the manifest and vice-versa
//   - forbidden fields absent (price/minLevel/unlock/owned/dollars — this is
//     an ART/RENDERING contract only, no price/level/ownership belongs here;
//     those live in src/utils/town/townCatalog.js / townLevel.js)
//   - px1x === px2x/2
//   - depthLayer / repeat / category / kind / anchor / unlockVisibility /
//     status each in their allowed enum
//   - fallback consistent with kind (tile/patch/band -> "css", sprite ->
//     "hide" — see env-art-manifest.json's own per-entry `notes` for why
//     this is derived from `kind` rather than literally from `category`)
//   - status="staged" entries point at an existing file under art-staging/
//     with a matching sha256/byte count. art-staging/ is gitignored, so on a
//     fresh checkout (or CI) the staged file is normally absent — in that
//     case this falls back SECURELY to the tracked copy already committed at
//     src/assets/town/env/<entry.filename> (opts.trackedEnvDir) and runs the
//     exact same sha256/bytes2x checks against it as ERRORs (never
//     downgraded to a warning). The fallback filename is taken only from
//     entry.filename and is validated as a plain safe basename (no path
//     separators/traversal) resolved strictly inside trackedEnvDir before
//     any read is attempted. Only when BOTH the staged file and the tracked
//     fallback are absent does this emit the pre-existing WARN (not a FAIL)
//     — e.g. right after a fresh checkout before any art has been ingested
//     or tracked at all.
//
// This script does NOT validate pixel content (no image decoding) — that is
// scripts/town-art/ingest.py's job during actual ingestion. This is a pure
// manifest/schema gate.
//
// Usage:
//   node scripts/validateEnvArtManifest.mjs [manifestPath] [specPath]
//   (defaults: docs/design/town/manifest/env-art-manifest.json and
//   docs/design/town/manifest/env-art-batch1.spec.json)

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
export const DEFAULT_MANIFEST = path.join(ROOT, 'docs', 'design', 'town', 'manifest', 'env-art-manifest.json')
export const DEFAULT_SPEC = path.join(ROOT, 'docs', 'design', 'town', 'manifest', 'env-art-batch1.spec.json')

export const ALLOWED_CATEGORY = new Set(['terrain', 'patch', 'path', 'fence', 'hedge', 'cluster', 'river', 'sky', 'prop'])
export const ALLOWED_KIND = new Set(['tile', 'patch', 'sprite', 'band'])
export const ALLOWED_ANCHOR = new Set(['bottom-center', 'center', 'top-left', 'fill'])
export const ALLOWED_DEPTH_LAYER = new Set(['terrain', 'water', 'path', 'scenery', 'foregroundVegetation'])
export const ALLOWED_REPEAT = new Set(['none', 'x', 'y', 'xy', 'along-path', 'along-river'])
export const ALLOWED_UNLOCK_VISIBILITY = new Set(['always', 'region'])
export const ALLOWED_REGION = new Set(['home', 'lane', 'square', 'river', 'school', 'tower'])
export const ALLOWED_STATUS = new Set(['missing', 'staged', 'rejected'])
export const FORBIDDEN_FIELDS = ['price', 'minLevel', 'unlock', 'owned', 'dollars']
export const FALLBACK_BY_KIND = { tile: 'css', patch: 'css', band: 'css', sprite: 'hide' }
export const DEFAULT_TRACKED_ENV_DIR = path.join(ROOT, 'src', 'assets', 'town', 'env')

const SAFE_ENV_FILENAME_RE = /^[a-z0-9][a-z0-9-]*\.webp$/

/**
 * Returns the absolute path of `filename` resolved strictly inside
 * `trackedEnvDir`, or null if filename is not a plain safe basename (this is
 * a fallback-only guard — entry.filename ultimately comes from a manifest
 * JSON file, so it is treated as untrusted input here even though the rest
 * of this validator does not otherwise sandbox filesystem access).
 * @returns {string|null}
 */
export function resolveSafeTrackedEnvPath(filename, trackedEnvDir) {
  if (typeof filename !== 'string' || !SAFE_ENV_FILENAME_RE.test(filename)) return null
  if (filename !== path.basename(filename)) return null
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return null
  const full = path.resolve(trackedEnvDir, filename)
  const rel = path.relative(path.resolve(trackedEnvDir), full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return full
}

/**
 * Shared sha256/bytes2x integrity check for a candidate file buffer, used by
 * both the staged-path branch and the tracked-fallback branch of the
 * status="staged" check below so the two branches can never drift apart.
 */
function checkStagedIntegrity(buf, entry, tag, req) {
  const actualSha = crypto.createHash('sha256').update(buf).digest('hex')
  req(actualSha === entry.sha256, `${tag} sha256 mismatch: manifest=${entry.sha256} actual=${actualSha}`)
  req(buf.length === entry.bytes2x, `${tag} bytes2x mismatch: manifest=${entry.bytes2x} actual=${buf.length}`)
}

/**
 * Text-level scan for a literal duplicate key inside the `"assets": { ... }`
 * object. Deliberately NOT based on JSON.parse's own object, because
 * JSON.parse silently keeps only the last occurrence of a repeated key —
 * by the time we have a JS object, the duplicate is already gone. This scans
 * the raw source, brace/bracket-depth aware (with string/escape tracking so
 * braces inside string values don't confuse the depth counter), and lists
 * every first-level key string directly under `assets` in source order.
 * @returns {string[]} keys that appear more than once (each name once, even
 *   if it appears 3+ times)
 */
export function checkDuplicateAssetKeys(rawText, objectFieldName = 'assets') {
  const idx = rawText.indexOf(`"${objectFieldName}"`)
  if (idx === -1) return []
  const colonIdx = rawText.indexOf(':', idx)
  const braceIdx = rawText.indexOf('{', colonIdx)
  if (braceIdx === -1) return []

  let depth = 0
  let inString = false
  let escape = false
  let memberStart = braceIdx + 1
  const members = []
  for (let i = braceIdx; i < rawText.length; i++) {
    const ch = rawText[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') { depth++; continue }
    if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) {
        const tail = rawText.slice(memberStart, i)
        if (tail.trim()) members.push(tail)
        break
      }
      continue
    }
    if (ch === ',' && depth === 1) {
      members.push(rawText.slice(memberStart, i))
      memberStart = i + 1
    }
  }

  const counts = new Map()
  for (const member of members) {
    const m = /^\s*"((?:[^"\\]|\\.)*)"\s*:/.exec(member)
    if (!m) continue
    const key = m[1]
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k)
}

/**
 * Validates an already-parsed manifest object (+ optionally the parsed spec
 * doc for cross-referencing). Does NOT do the raw-text duplicate-key scan —
 * callers that have the raw text should also call checkDuplicateAssetKeys
 * and merge its results in (validateManifestFiles/validateManifestText do
 * this for you).
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateManifestObject(manifest, specDoc, { root = ROOT, trackedEnvDir = DEFAULT_TRACKED_ENV_DIR } = {}) {
  const errors = []
  const warnings = []
  const req = (cond, msg) => { if (!cond) errors.push(msg) }

  if (!manifest || typeof manifest !== 'object') {
    errors.push('manifest is not an object')
    return { errors, warnings }
  }
  const assets = manifest.assets
  if (!assets || typeof assets !== 'object') {
    errors.push('manifest.assets missing or not an object')
    return { errors, warnings }
  }

  const keys = Object.keys(assets)
  if (specDoc && specDoc.assets && typeof specDoc.assets === 'object') {
    const specKeys = new Set(Object.keys(specDoc.assets))
    const manifestKeys = new Set(keys)
    for (const k of specKeys) if (!manifestKeys.has(k)) errors.push(`spec key missing from manifest.assets: ${k}`)
    for (const k of manifestKeys) if (!specKeys.has(k)) errors.push(`manifest.assets key not present in spec: ${k}`)
  } else {
    warnings.push('no spec doc supplied/found — skipped spec<->manifest key cross-check')
  }

  for (const [key, entry] of Object.entries(assets)) {
    const tag = `[${key}]`
    if (!entry || typeof entry !== 'object') { errors.push(`${tag} entry is not an object`); continue }

    req(entry.asset_key === key, `${tag} asset_key field ('${entry.asset_key}') !== object key`)
    req(typeof entry.filename === 'string' && entry.filename.length > 0, `${tag} filename missing/empty`)

    for (const f of FORBIDDEN_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(entry, f)) {
        errors.push(`${tag} forbidden field present: '${f}' (this is an ART/RENDERING contract only — price/level/ownership belong in townCatalog.js/townLevel.js)`)
      }
    }

    const px2xOk = Array.isArray(entry.px2x) && entry.px2x.length === 2 && entry.px2x.every((n) => Number.isFinite(n))
    const px1xOk = Array.isArray(entry.px1x) && entry.px1x.length === 2 && entry.px1x.every((n) => Number.isFinite(n))
    req(px2xOk, `${tag} px2x must be a [w,h] pair of numbers`)
    req(px1xOk, `${tag} px1x must be a [w,h] pair of numbers`)
    if (px2xOk && px1xOk) {
      const [w2, h2] = entry.px2x
      const [w1, h1] = entry.px1x
      req(w1 === w2 / 2 && h1 === h2 / 2, `${tag} px1x (${w1}x${h1}) !== px2x/2 (${w2 / 2}x${h2 / 2})`)
    }

    req(ALLOWED_CATEGORY.has(entry.category), `${tag} unknown category: ${entry.category}`)
    req(ALLOWED_KIND.has(entry.kind), `${tag} unknown kind: ${entry.kind}`)
    req(ALLOWED_ANCHOR.has(entry.anchor), `${tag} unknown anchor: ${entry.anchor}`)
    req(ALLOWED_DEPTH_LAYER.has(entry.depthLayer), `${tag} depthLayer not in allowed set (terrain|water|path|scenery|foregroundVegetation): ${entry.depthLayer}`)
    req(ALLOWED_REPEAT.has(entry.repeat), `${tag} repeat not in allowed set (none|x|y|xy|along-path|along-river): ${entry.repeat}`)
    req(ALLOWED_UNLOCK_VISIBILITY.has(entry.unlockVisibility), `${tag} unlockVisibility not in allowed set (always|region): ${entry.unlockVisibility}`)
    req(ALLOWED_STATUS.has(entry.status), `${tag} unknown status: ${entry.status}`)

    if (entry.unlockVisibility === 'region') {
      req(typeof entry.region === 'string' && entry.region.length > 0, `${tag} unlockVisibility='region' but region field missing`)
      if (typeof entry.region === 'string') req(ALLOWED_REGION.has(entry.region), `${tag} unknown region: ${entry.region}`)
    } else if (entry.unlockVisibility === 'always') {
      req(entry.region === undefined || entry.region === null, `${tag} unlockVisibility='always' but region is also set (${entry.region})`)
    }

    if (ALLOWED_KIND.has(entry.kind)) {
      const expectedFallback = FALLBACK_BY_KIND[entry.kind]
      req(entry.fallback === expectedFallback, `${tag} fallback '${entry.fallback}' inconsistent with kind '${entry.kind}' (expected '${expectedFallback}')`)
    }

    if (entry.status === 'staged') {
      req(!!entry.stagedPath, `${tag} status=staged but stagedPath missing`)
      req(!!entry.sha256, `${tag} status=staged but sha256 missing`)
      req(Number.isFinite(entry.bytes2x), `${tag} status=staged but bytes2x missing/not a number`)
      if (entry.stagedPath) {
        const full = path.isAbsolute(entry.stagedPath) ? entry.stagedPath : path.join(root, entry.stagedPath)
        if (existsSync(full)) {
          checkStagedIntegrity(readFileSync(full), entry, tag, req)
        } else {
          // art-staging/ is gitignored, so a fresh checkout/CI won't have this
          // file — fall back to the already-committed tracked copy at
          // trackedEnvDir/<filename> and run the SAME integrity checks
          // against it (as errors, never downgraded to a warning).
          const trackedPath = resolveSafeTrackedEnvPath(entry.filename, trackedEnvDir)
          if (trackedPath === null) {
            errors.push(`${tag} unsafe filename for tracked-asset fallback: ${JSON.stringify(entry.filename)}`)
          } else if (existsSync(trackedPath)) {
            checkStagedIntegrity(readFileSync(trackedPath), entry, tag, req)
          } else {
            warnings.push(`${tag} status=staged, stagedPath '${entry.stagedPath}' not found on disk and tracked fallback '${trackedPath}' also not found (skipped file/hash check)`)
          }
        }
      }
    } else if (entry.status === 'rejected') {
      req(Array.isArray(entry.rejectionReasons) && entry.rejectionReasons.length > 0, `${tag} status=rejected but rejectionReasons missing/empty`)
    } else if (entry.status === 'missing') {
      req(entry.stagedPath == null && entry.sha256 == null && entry.bytes2x == null, `${tag} status=missing but stagedPath/sha256/bytes2x already set`)
    }
  }

  return { errors, warnings }
}

/** Parses rawText as JSON, runs the raw-text duplicate-key scan AND the
 * parsed-object checks, and merges the results. This is what both the CLI
 * and the test harness should call for an end-to-end check of one manifest
 * source string. */
export function validateManifestText(rawText, specDoc, opts = {}) {
  let manifest
  try {
    manifest = JSON.parse(rawText)
  } catch (e) {
    return { errors: [`invalid JSON: ${e.message}`], warnings: [] }
  }
  const dupKeys = checkDuplicateAssetKeys(rawText)
  const { errors, warnings } = validateManifestObject(manifest, specDoc, opts)
  const merged = [...dupKeys.map((k) => `duplicate key in assets object (raw JSON text): '${k}' appears more than once`), ...errors]
  return { errors: merged, warnings }
}

export function validateManifestFiles(manifestPath = DEFAULT_MANIFEST, specPath = DEFAULT_SPEC, opts = {}) {
  const rawText = readFileSync(manifestPath, 'utf8')
  const specDoc = existsSync(specPath) ? JSON.parse(readFileSync(specPath, 'utf8')) : null
  return validateManifestText(rawText, specDoc, opts)
}

// ── CLI ──────────────────────────────────────────────────────────────────
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  const manifestPath = process.argv[2] || DEFAULT_MANIFEST
  const specPath = process.argv[3] || DEFAULT_SPEC
  console.log(`manifest: ${manifestPath}`)
  console.log(`spec: ${specPath}`)
  if (!existsSync(manifestPath)) {
    console.log(`FAIL  manifest file not found: ${manifestPath}`)
    process.exitCode = 1
  } else {
    const { errors, warnings } = validateManifestFiles(manifestPath, specPath)
    for (const w of warnings) console.log(`WARN  ${w}`)
    for (const e of errors) console.log(`FAIL  ${e}`)
    if (errors.length === 0) {
      console.log(`\nPASS  전체 통과(경고 ${warnings.length}건)`)
    } else {
      console.log(`\n결과: ${errors.length}건 FAIL`)
      process.exitCode = 1
    }
  }
}
