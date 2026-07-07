#!/usr/bin/env node
// Project Paul 캐릭터 스프라이트 시트를 39개 개별 투명배경 PNG로 자동
// 분할하는 도구 — Node.js + jimp(순수 JS, 네이티브 빌드 불필요)만으로
// 동작. `npm run split-paul`로 실행.
//
// 입력: public/assets/paul/paul_sprite_sheet.png
// 출력: public/assets/paul/generated/paul_<name>.png × 39 + manifest.json
//
// ⚠️ 그리드 배치를 모르는 상태에서의 한계: 이 스프라이트 시트가 정확히
// 어떤 행/열로 배치되어 있는지 알 방법이 없어서(실행 시점에 이미지 크기로
// 부터 "정사각형에 가깝게" cols/rows를 추정함), 기본값은 어디까지나
// 최선의 추측입니다. 실제 배치가 다르면 tools/paulSpriteLayout.json을
// 만들어 아래 형식으로 덮어쓰세요:
//   { "cols": 6, "rows": 7 }               // 균일한 그리드를 다시 지정
//   또는
//   { "happy": { "x":0,"y":0,"w":200,"h":200 }, ... }  // 캐릭터별 정확한 좌표
// 두 형식을 섞어 쓸 수도 있음(그리드가 기본이고, 이름별 좌표가 있으면
// 그 이름만 덮어씀).
import { Jimp } from 'jimp'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHEET_PATH = path.join(ROOT, 'public/assets/paul/paul_sprite_sheet.png')
const OUT_DIR = path.join(ROOT, 'public/assets/paul/generated')
const LAYOUT_OVERRIDE_PATH = path.join(ROOT, 'tools/paulSpriteLayout.json')
const OUTPUT_SIZE = 512

// 요청받은 39개 캐릭터 — 스프라이트 시트 안에서 왼쪽→오른쪽, 위→아래
// 순서로 배치되어 있다고 가정(그리드 자동 추정의 기본 순서). 실제 순서가
// 다르면 paulSpriteLayout.json에 이름별 좌표를 직접 지정할 것.
export const CHARACTER_NAMES = [
  'happy', 'best', 'perfect', 'great', 'excellent', 'levelup', 'celebrate', 'star',
  'thinking', 'almost', 'retry', 'cheerup', 'its_ok', 'sad', 'cry', 'sorry', 'one_more', 'fight',
  'hello', 'lets_learn', 'study', 'reading', 'writing', 'speaking', 'mission', 'love', 'good_job',
  'brand', 'birthday',
  'super', 'astronaut', 'detective', 'magician', 'professor', 'sports', 'artist', 'chef', 'musician', 'ninja',
]

function loadLayoutOverride() {
  if (!existsSync(LAYOUT_OVERRIDE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(LAYOUT_OVERRIDE_PATH, 'utf-8'))
  } catch (err) {
    console.warn(`[split-paul] ${LAYOUT_OVERRIDE_PATH} 파싱 실패, 무시함:`, err.message)
    return {}
  }
}

// 균일한 그리드로 각 이름의 픽셀 영역(rect)을 계산 — override에 cols/rows가
// 있으면 그걸 쓰고, 없으면 이미지 크기로부터 "정사각형에 가깝게" 추정.
// export: scripts/testSplitPaulSprites.mjs에서 순수 로직만 따로 검증하기 위함.
export function buildGridRects(sheetW, sheetH, names, override) {
  const n = names.length
  const cols = override.cols ?? Math.ceil(Math.sqrt(n))
  const rows = override.rows ?? Math.ceil(n / cols)
  const cellW = Math.floor(sheetW / cols)
  const cellH = Math.floor(sheetH / rows)
  const rects = {}
  names.forEach((name, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    rects[name] = { x: col * cellW, y: row * cellH, w: cellW, h: cellH }
  })
  return { rects, cols, rows, cellW, cellH }
}

async function main() {
  if (!existsSync(SHEET_PATH)) {
    console.error('[split-paul] 스프라이트 시트를 찾을 수 없습니다:')
    console.error(`  ${SHEET_PATH}`)
    console.error('')
    console.error('다음 경로에 캐릭터 시트 PNG를 넣고 다시 실행하세요:')
    console.error('  public/assets/paul/paul_sprite_sheet.png')
    process.exitCode = 1
    return
  }

  const sheet = await Jimp.read(SHEET_PATH)
  console.log(`[split-paul] 시트 로드 완료: ${sheet.width}×${sheet.height}px`)

  const override = loadLayoutOverride()
  const { rects, cols, rows, cellW, cellH } = buildGridRects(sheet.width, sheet.height, CHARACTER_NAMES, override)
  console.log(`[split-paul] 그리드 추정: ${cols}열 × ${rows}행, 셀 크기 ${cellW}×${cellH}px` +
    (override.cols || override.rows ? ' (paulSpriteLayout.json에서 지정됨)' : ' (자동 추정 — 틀리면 paulSpriteLayout.json으로 보정)'))

  mkdirSync(OUT_DIR, { recursive: true })

  const manifest = {}
  const failed = []

  for (const name of CHARACTER_NAMES) {
    const rect = override[name] || rects[name]
    try {
      const cell = sheet.clone().crop({ x: rect.x, y: rect.y, w: rect.w, h: rect.h })
      // 주변 투명/단색 여백 제거 — tolerance를 살짝 줘서 압축 아티팩트로
      // 인한 경계 픽셀 때문에 안 잘리는 문제를 방지.
      cell.autocrop({ tolerance: 0.02 })
      // 종횡비를 유지한 채 512×512 안에 맞추고 남는 자리는 투명으로 —
      // 그래야 캐릭터가 찌그러지지 않음.
      cell.contain({ w: OUTPUT_SIZE, h: OUTPUT_SIZE })
      const filename = `paul_${name}.png`
      await cell.write(path.join(OUT_DIR, filename))
      manifest[name] = filename
    } catch (err) {
      console.warn(`[split-paul] "${name}" 처리 실패:`, err.message)
      failed.push(name)
    }
  }

  writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  console.log('')
  console.log(`[split-paul] 완료: ${Object.keys(manifest).length}/${CHARACTER_NAMES.length}개 생성`)
  if (failed.length > 0) console.log(`[split-paul] 실패: ${failed.join(', ')}`)
  console.log(`[split-paul] 출력 위치: ${path.relative(ROOT, OUT_DIR)}/`)
  console.log('[split-paul] 그리드는 추측입니다 — generated/ 폴더를 열어 실제로 캐릭터가')
  console.log('  올바르게 잘렸는지 꼭 눈으로 확인하세요. 어긋났다면 tools/paulSpriteLayout.json으로')
  console.log('  보정한 뒤 다시 실행(npm run split-paul)하면 됩니다.')
}

// import.meta.url 비교로 "직접 실행될 때만" main()이 돌게 함 — 그래야
// scripts/testSplitPaulSprites.mjs가 buildGridRects/CHARACTER_NAMES만
// 가져다 쓸 때 실제 시트 읽기/파일 쓰기가 같이 실행되지 않음.
// pathToFileURL(윈도우의 "C:\..." 경로도 file:/// 스킴으로 정확히
// 변환해줌)로 비교해야 안전 — 문자열을 손으로 이어붙이면 file://과
// file:///의 슬래시 개수 차이로 항상 불일치하는 버그가 남.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
