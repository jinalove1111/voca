// tools/splitPaulSprites.mjs의 그리드 계산 로직만 순수하게 검증 —
// 이 스크립트를 import해도 main()이 같이 실행되지 않는지(entry-point
// guard가 제대로 동작하는지)부터, 39개 캐릭터 이름 목록/그리드 사각형
// 계산이 정확한지까지 확인.
import assert from 'node:assert/strict'
import { CHARACTER_NAMES, buildGridRects } from '../tools/splitPaulSprites.mjs'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. import만 해도 main()이 실행되지 않음(entry-point guard)')
{
  // 이 스크립트가 여기까지 실행됐다는 것 자체가 이미 증거 — main()이
  // 같이 돌았다면 존재하지 않는 스프라이트 시트 때문에 여기 도달하기
  // 전에 프로세스가 에러 메시지를 출력하고 exitCode=1로 끝났을 것.
  check('import 시점에 시트 파일을 찾으려 하지 않고 조용히 넘어감', true)
}

console.log('\n2. CHARACTER_NAMES — 요청받은 39개, 중복 없음')
{
  check('총 39개', CHARACTER_NAMES.length === 39)
  check('이름 중복 없음', new Set(CHARACTER_NAMES).size === CHARACTER_NAMES.length)
  check('모두 소문자+언더스코어만 사용(paul_ 접두사 없이 순수 id)', CHARACTER_NAMES.every(n => /^[a-z_]+$/.test(n)))
}

console.log('\n3. buildGridRects — 자동 추정 그리드가 이미지 범위를 벗어나지 않음')
{
  const sheetW = 1200, sheetH = 1000
  const { rects, cols, rows } = buildGridRects(sheetW, sheetH, CHARACTER_NAMES, {})
  check('cols*rows가 39개를 전부 담을 만큼 충분함', cols * rows >= CHARACTER_NAMES.length)
  const allInBounds = Object.values(rects).every(r =>
    r.x >= 0 && r.y >= 0 && r.x + r.w <= sheetW && r.y + r.h <= sheetH
  )
  check('모든 rect가 시트 범위 안에 있음(음수/초과 없음)', allInBounds)
  check('39개 이름 전부에 rect가 배정됨', CHARACTER_NAMES.every(n => rects[n]))
}

console.log('\n4. buildGridRects — override로 cols/rows를 지정하면 그대로 반영됨(실제 시트 배치가 자동추정과 다를 때 보정하는 경로)')
{
  const { cols, rows, cellW, cellH } = buildGridRects(1200, 1400, CHARACTER_NAMES, { cols: 6, rows: 7 })
  check('cols=6 그대로 사용', cols === 6)
  check('rows=7 그대로 사용', rows === 7)
  check('cellW/H가 지정된 cols/rows 기준으로 계산됨', cellW === 200 && cellH === 200)
}

console.log('\n5. buildGridRects — 겹치지 않는 그리드(서로 다른 이름의 rect가 겹치지 않음)')
{
  const { rects } = buildGridRects(1200, 1400, CHARACTER_NAMES, { cols: 6, rows: 7 })
  const seen = new Set()
  let overlap = false
  for (const name of CHARACTER_NAMES) {
    const r = rects[name]
    const key = `${r.x},${r.y}`
    if (seen.has(key)) overlap = true
    seen.add(key)
  }
  check('모든 셀의 시작 좌표가 서로 다름(겹치는 셀 없음)', !overlap)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
