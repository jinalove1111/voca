// Paul Town V2 world recompose harness — screenshot driver.
//
// Loads docs/design/town/mockup/paul-town-recompose.html via file:// at each
// requested level x width (+ one 200% zoom shot), captures a full-page PNG
// per combination into ./previews/, and prints a one-line summary per shot:
// level, width, whether scrollWidth<=clientWidth (no horizontal overflow),
// how many Batch 1 files are missing, and the placeholder-banner colour.
//
// Exit code 1 if any shot has horizontal overflow or any page/console JS
// error was observed while it loaded.
//
// Usage: node docs/design/town/mockup/shoot.mjs
//        node docs/design/town/mockup/shoot.mjs --assets batch1-pending --out previews-pending
//
// --assets <batch1|batch1-pending>  passed through as ?assets= on every shot
//                                    URL (default batch1 — omitted from the
//                                    URL entirely so default behaviour stays
//                                    byte-identical to before this flag existed).
// --out <dirname>                   preview output folder, relative to this
//                                    script (default 'previews'); created if missing.

import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HTML_PATH = path.join(__dirname, 'paul-town-recompose.html')

function getArg(name, def) {
  const argv = process.argv.slice(2)
  const idx = argv.indexOf(`--${name}`)
  if (idx !== -1 && argv[idx + 1] !== undefined) return argv[idx + 1]
  return def
}
const ASSETS_MODE = getArg('assets', 'batch1')
const OUT_DIR_NAME = getArg('out', 'previews')
const PREVIEWS_DIR = path.join(__dirname, OUT_DIR_NAME)

const LEVELS = [1, 3, 4, 5, 8]
const WIDTHS = [360, 390, 430]

function heightFor(width) {
  return Math.round(width * 1.9)
}

async function shootOne(browser, { level, width, zoom, outName }) {
  const height = heightFor(width)
  const context = await browser.newContext({
    viewport: { width, height: Math.max(height, 900) },
    deviceScaleFactor: 2
  })
  const page = await context.newPage()

  // Only uncaught JS exceptions (pageerror) and failed requests for files
  // OUTSIDE ./batch1/ (and, in --assets batch1-pending mode, ./batch1-pending/)
  // are treated as real errors — with most of the batch1 folder intentionally
  // sparse, net::ERR_FILE_NOT_FOUND for a ./batch1/<file> is expected (that's
  // exactly what the placeholder/banner system is testing), and in pending
  // mode a ./batch1-pending/<file> 404 is equally expected (most keys fall
  // back to ./batch1/ on purpose), so neither counts as a failure.
  const errors = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message || err}`))
  page.on('requestfailed', (req) => {
    const reqUrl = req.url()
    if (reqUrl.indexOf('/batch1/') === -1 && reqUrl.indexOf('/batch1-pending/') === -1) {
      errors.push(`requestfailed (non-batch1): ${reqUrl} — ${req.failure()?.errorText}`)
    }
  })

  const qsParams = { level: String(level), width: String(width), zoom: String(zoom) }
  if (ASSETS_MODE !== 'batch1') qsParams.assets = ASSETS_MODE
  const qs = new URLSearchParams(qsParams)
  const url = `${pathToFileURL(HTML_PATH).href}?${qs.toString()}`

  let overflow = null
  let overflowViaClientWidth = null
  let dims = null
  let missingCount = null
  let totalCount = null
  let bannerOk = null
  let bannerText = null

  try {
    await page.goto(url, { waitUntil: 'load' })

    // Wait for the legend/banner probe pass to resolve (Image onload/onerror
    // is async; the harness starts every probe request in the same tick but
    // resolution happens after this navigation's load event).
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#legend .count')
        return el && el.textContent && el.textContent.indexOf('…') === -1
      },
      { timeout: 10000 }
    ).catch(() => {})

    if (zoom === 2) {
      // harness applies documentElement.style.zoom on window 'load'; give it
      // a tick to re-layout before measuring/screenshotting.
      await page.waitForTimeout(300)
    }

    const legendText = await page.locator('#legend .count').textContent().catch(() => null)
    if (legendText) {
      const m = legendText.match(/(\d+)\s*\/\s*(\d+)/)
      if (m) {
        const present = parseInt(m[1], 10)
        totalCount = parseInt(m[2], 10)
        missingCount = totalCount - present
      }
    }

    bannerText = await page.locator('#artBanner').textContent().catch(() => null)
    const bannerClass = await page.locator('#artBanner').getAttribute('class').catch(() => '')
    bannerOk = (bannerClass || '').indexOf('ok') !== -1

    // Diagnostic note (see report): under this Chromium's `documentElement.style.zoom`
    // implementation, clientWidth shrinks proportionally to the zoom factor but
    // scrollWidth does not, so a literal scrollWidth<=clientWidth check would report
    // "overflow" at zoom=2 for ANY page regardless of actual responsive design. We
    // print both, but gate pass/fail on scrollWidth<=window.innerWidth — the same
    // metric tests/e2e/townV2.spec.mjs's noHorizontalOverflow() uses for its S6 (200%
    // zoom) scenario, which stays stable across zoom in this browser.
    dims = await page.evaluate(() => {
      const de = document.documentElement
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, innerWidth: window.innerWidth }
    })
    overflowViaClientWidth = !(dims.scrollWidth <= dims.clientWidth)
    overflow = !(dims.scrollWidth <= dims.innerWidth)

    fs.mkdirSync(PREVIEWS_DIR, { recursive: true })
    const outPath = path.join(PREVIEWS_DIR, outName)
    await page.screenshot({ path: outPath, fullPage: true })
  } finally {
    await context.close()
  }

  return {
    level, width, zoom, overflow, overflowViaClientWidth, dims,
    missingCount, totalCount, bannerOk, bannerText, errors
  }
}

async function main() {
  const browser = await chromium.launch()
  const results = []
  let failed = false

  try {
    for (const level of LEVELS) {
      for (const width of WIDTHS) {
        const outName = `lv${level}-${width}.png`
        const r = await shootOne(browser, { level, width, zoom: 1, outName })
        results.push({ ...r, outName })
      }
    }
    // extra: Lv.4, 390px, 200% zoom
    {
      const outName = 'lv4-390-z2.png'
      const r = await shootOne(browser, { level: 4, width: 390, zoom: 2, outName })
      results.push({ ...r, outName })
    }
  } finally {
    await browser.close()
  }

  console.log('')
  console.log(`Assets mode: ${ASSETS_MODE}  |  Output dir: ${PREVIEWS_DIR}`)
  console.log('level  width  zoom  overflow(scrollW<=innerW)  scrollW<=clientW  missing/total  banner  file')
  console.log('-----  -----  ----  -------------------------  ----------------  -------------  ------  ----')
  for (const r of results) {
    const bannerColor = r.bannerOk ? 'green' : 'red'
    const missingStr = r.missingCount != null ? `${r.missingCount}/${r.totalCount}` : 'n/a'
    const clientWStr = r.overflowViaClientWidth == null ? 'n/a' : String(!r.overflowViaClientWidth)
    console.log(
      `${String(r.level).padEnd(5)}  ${String(r.width).padEnd(5)}  ${String(r.zoom).padEnd(4)}  ` +
      `${String(r.overflow).padEnd(25)}  ${clientWStr.padEnd(16)}  ${missingStr.padEnd(13)}  ${bannerColor.padEnd(6)}  ${r.outName}`
    )
    if (r.errors.length) {
      console.log(`  JS errors for ${r.outName}:`)
      r.errors.forEach((e) => console.log(`    ${e}`))
    }
    if (r.overflow) failed = true
    if (r.errors.length) failed = true
  }
  console.log('')
  console.log(`Total shots: ${results.length}, previews dir: ${PREVIEWS_DIR}`)

  if (failed) {
    console.error('FAIL: overflow and/or JS errors detected — see above.')
    process.exit(1)
  } else {
    console.log('PASS: no horizontal overflow, no JS errors.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
