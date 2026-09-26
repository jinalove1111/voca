// scripts/testProto25dCamera.mjs — Paul Town 2.5D 캐릭터 프로토타입
// (Stage "산책 모드" v1, 2026-09-26) camera.js 순수 단위 테스트.
//
// React/DOM/네트워크 0. camera.js가 worldContract.js를 확장자 없는 상대
// import로 참조하므로(walkGrid.js와 동일 패턴), plain `node`로 직접
// import하면 Node ESM 로더가 ERR_MODULE_NOT_FOUND로 죽는다
// (scripts/testProto25dWalkGrid.mjs 헤더 주석과 동일 원인/동일 해법) —
// esbuild로 scripts/.tmp/(gitignore 대상)에 번들해 그 산출물을 import한다.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp')
mkdirSync(TMP_DIR, { recursive: true })

const BUNDLE_PATH = path.join(TMP_DIR, 'proto25dCamera.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/town/proto2_5d/camera.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: BUNDLE_PATH,
})
const {
  WALK_OVERSCAN, CAMERA_LERP, WALK_MODE_STORAGE_KEY,
  computeWorldSizePx, computeCameraTarget, lerp, stepCamera,
  readWalkModePreference, writeWalkModePreference,
} = await import(`${pathToFileURL(BUNDLE_PATH).href}?t=${Date.now()}`)

const WORLD_RATIO = 190 / 100 // worldContract.js WORLD(100x190) 종횡비 복제(camera.js와 동일 관례, 재도출 아님 — 이 세션이 값을 새로 만들지 않는다).

let totalPassed = 0
let totalFailed = 0
const failures = []

function check(label, cond, detail = '') {
  if (cond) { totalPassed++; console.log(`  PASS  ${label}`) }
  else { totalFailed++; failures.push(`${label}${detail ? '  ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`) }
  return cond
}
function section(name) { console.log(`\n-- ${name} --`) }

function refWorldSize(viewportW, viewportH, overscan = WALK_OVERSCAN) {
  const unit = Math.min(viewportW, viewportH / WORLD_RATIO) * overscan
  return { worldW: unit, worldH: unit * WORLD_RATIO }
}

// ── 1. computeWorldSizePx — 4개 참조 뷰포트에서 공식대로 계산됨 ──────────
section('1. computeWorldSizePx — 참조 뷰포트 4종')
{
  check('WALK_OVERSCAN === 1.6(팀장 지시 값)', WALK_OVERSCAN === 1.6, String(WALK_OVERSCAN))
  const VIEWPORTS = [
    { w: 360, h: 640 },
    { w: 390, h: 844 },
    { w: 412, h: 915 },
    { w: 1280, h: 800 },
  ]
  for (const vp of VIEWPORTS) {
    const result = computeWorldSizePx({ viewportW: vp.w, viewportH: vp.h })
    const ref = refWorldSize(vp.w, vp.h)
    check(
      `${vp.w}x${vp.h} — worldW이 독립 재계산(unit=min(w,h/1.9)*1.6) 공식과 일치(오차<1e-9)`,
      Math.abs(result.worldW - ref.worldW) < 1e-9,
      JSON.stringify({ result, ref }),
    )
    check(
      `${vp.w}x${vp.h} — worldH이 독립 재계산 공식과 일치(오차<1e-9)`,
      Math.abs(result.worldH - ref.worldH) < 1e-9,
      JSON.stringify({ result, ref }),
    )
    check(
      `${vp.w}x${vp.h} — worldH/worldW 종횡비가 WORLD.h/WORLD.w(1.9)와 일치(오차<1e-9)`,
      Math.abs(result.worldH / result.worldW - WORLD_RATIO) < 1e-9,
      `ratio=${result.worldH / result.worldW}`,
    )
    // 오버스캔은 "가로/세로 중 더 제약적인(min) 축"만 뷰포트*overscan으로
    // 정확히 늘린다 — 다른 축은 종횡비(1.9)를 지키기 위해 결과적으로
    // 뷰포트보다 좁아질 수 있다(예: 1280x800 데스크톱은 세로가 제약축이라
    // 가로(worldW≈674)가 뷰포트 가로(1280)보다 좁다 — letterbox 의도된
    // 동작, 섹션4에서 그 축이 중앙 정렬됨을 별도 검증). 그래서 "두 축 모두
    // 뷰포트 이상"이 아니라 "제약축(min)은 정확히 뷰포트*overscan, 나머지
    // 축은 종횡비로 파생"을 확인한다.
    const isWidthConstrained = vp.w <= vp.h / WORLD_RATIO
    if (isWidthConstrained) {
      check(`${vp.w}x${vp.h} — 가로가 제약축 → worldW === viewportW*overscan(정확)`, Math.abs(result.worldW - vp.w * WALK_OVERSCAN) < 1e-9, JSON.stringify(result))
      check(`${vp.w}x${vp.h} — 가로가 제약축 → worldH가 뷰포트 세로 이상`, result.worldH >= vp.h - 1e-6, JSON.stringify(result))
    } else {
      check(`${vp.w}x${vp.h} — 세로가 제약축 → worldH === viewportH*overscan(정확)`, Math.abs(result.worldH - vp.h * WALK_OVERSCAN) < 1e-9, JSON.stringify(result))
    }
  }
  // 근사값(설계 문서 참고용, "≈" 표기 그대로 — 정확한 반올림 규칙까지
  // 고정하지 않고 정수 반올림 오차 1px 이내만 확인해 rounding-order
  // 민감성을 회귀 조건으로 만들지 않는다).
  const approxTable = [
    { w: 360, h: 640, worldW: 539, worldH: 1024 },
    { w: 390, h: 844, worldW: 624, worldH: 1186 },
    { w: 412, h: 915, worldW: 659, worldH: 1253 },
    { w: 1280, h: 800, worldW: 674, worldH: 1281 },
  ]
  for (const row of approxTable) {
    const result = computeWorldSizePx({ viewportW: row.w, viewportH: row.h })
    check(
      `${row.w}x${row.h} — worldW이 설계 문서 근사치(${row.worldW})와 2px 이내`,
      Math.abs(result.worldW - row.worldW) <= 2,
      `worldW=${result.worldW}`,
    )
    check(
      `${row.w}x${row.h} — worldH이 설계 문서 근사치(${row.worldH})와 2px 이내`,
      Math.abs(result.worldH - row.worldH) <= 2,
      `worldH=${result.worldH}`,
    )
  }
}

// ── 2. computeWorldSizePx — NaN/0/음수 안전 폴백 ─────────────────────────
section('2. computeWorldSizePx — 비정상 입력 안전 폴백')
{
  check('viewportW=NaN → {0,0}', JSON.stringify(computeWorldSizePx({ viewportW: NaN, viewportH: 640 })) === '{"worldW":0,"worldH":0}')
  check('viewportH=undefined → {0,0}', JSON.stringify(computeWorldSizePx({ viewportW: 360, viewportH: undefined })) === '{"worldW":0,"worldH":0}')
  check('viewportW=0 → {0,0}', JSON.stringify(computeWorldSizePx({ viewportW: 0, viewportH: 640 })) === '{"worldW":0,"worldH":0}')
  check('viewportH=-1 → {0,0}', JSON.stringify(computeWorldSizePx({ viewportW: 360, viewportH: -1 })) === '{"worldW":0,"worldH":0}')
  check('overscan=0 → {0,0}', JSON.stringify(computeWorldSizePx({ viewportW: 360, viewportH: 640 }, 0)) === '{"worldW":0,"worldH":0}')
  check('overscan=Infinity → {0,0}', JSON.stringify(computeWorldSizePx({ viewportW: 360, viewportH: 640 }, Infinity)) === '{"worldW":0,"worldH":0}')
}

// ── 3. computeCameraTarget — 세계가 뷰포트보다 넓을 때 clamp ─────────────
section('3. computeCameraTarget — 세계가 뷰포트보다 넓을 때 양 축 clamp')
{
  const worldW = 539
  const worldH = 1024
  const viewportW = 360
  const viewportH = 640

  // 캐릭터가 세계 한가운데 있을 때 — 뷰포트 절반을 뺀 값이 범위 안이라
  // 그대로 채택됨.
  const mid = computeCameraTarget({ charX: worldW / 2, charY: worldH / 2, viewportW, viewportH, worldW, worldH })
  check('중앙 캐릭터 — x = charX - viewportW/2', Math.abs(mid.x - (worldW / 2 - viewportW / 2)) < 1e-9, JSON.stringify(mid))
  check('중앙 캐릭터 — y = charY - viewportH/2', Math.abs(mid.y - (worldH / 2 - viewportH / 2)) < 1e-9, JSON.stringify(mid))

  // 캐릭터가 세계 좌상단 모서리에 있을 때 — 음수로 나가지 않고 0으로 clamp.
  const topLeft = computeCameraTarget({ charX: 0, charY: 0, viewportW, viewportH, worldW, worldH })
  check('좌상단 캐릭터 — x가 0 미만으로 내려가지 않음(클램프)', topLeft.x === 0, JSON.stringify(topLeft))
  check('좌상단 캐릭터 — y가 0 미만으로 내려가지 않음(클램프)', topLeft.y === 0, JSON.stringify(topLeft))

  // 캐릭터가 세계 우하단 모서리에 있을 때 — (world-viewport)를 넘지 않음.
  const bottomRight = computeCameraTarget({ charX: worldW, charY: worldH, viewportW, viewportH, worldW, worldH })
  check('우하단 캐릭터 — x가 worldW-viewportW를 넘지 않음(클램프)', bottomRight.x === worldW - viewportW, JSON.stringify(bottomRight))
  check('우하단 캐릭터 — y가 worldH-viewportH를 넘지 않음(클램프)', bottomRight.y === worldH - viewportH, JSON.stringify(bottomRight))

  // 카메라는 세계 밖(음수 또는 world-viewport 초과)을 절대 보여주지 않는다
  // — 무작위 캐릭터 위치 다수로 이 불변식을 반복 확인.
  let neverOutside = true
  for (let i = 0; i < 200; i++) {
    const cx = -500 + i * 6 // world 밖(-500)부터 world 밖(+700)까지 훑음
    const cy = -500 + i * 9
    const t = computeCameraTarget({ charX: cx, charY: cy, viewportW, viewportH, worldW, worldH })
    if (t.x < -1e-9 || t.x > worldW - viewportW + 1e-9) neverOutside = false
    if (t.y < -1e-9 || t.y > worldH - viewportH + 1e-9) neverOutside = false
  }
  check('임의의(세계 밖 포함) 캐릭터 좌표 200개 전부 카메라가 [0,world-viewport] 안에 머무름', neverOutside)
}

// ── 4. computeCameraTarget — 세계가 뷰포트보다 좁은 축은 중앙 정렬 ───────
section('4. computeCameraTarget — 세계 < 뷰포트인 축은 캐릭터 위치와 무관하게 중앙 정렬')
{
  // 1280x800 데스크톱 — 세계 가로(674)가 뷰포트 가로(1280)보다 좁다.
  const worldW = 674
  const worldH = 1281
  const viewportW = 1280
  const viewportH = 800

  const left = computeCameraTarget({ charX: 0, charY: worldH / 2, viewportW, viewportH, worldW, worldH })
  const right = computeCameraTarget({ charX: worldW, charY: worldH / 2, viewportW, viewportH, worldW, worldH })
  const expectedCenterX = (worldW - viewportW) / 2
  check('x축(세계<뷰포트) — 캐릭터가 세계 왼쪽 끝이어도 x는 중앙 정렬값', Math.abs(left.x - expectedCenterX) < 1e-9, JSON.stringify(left))
  check('x축(세계<뷰포트) — 캐릭터가 세계 오른쪽 끝이어도 x는 왼쪽과 동일(캐릭터를 따라가지 않음)', left.x === right.x, JSON.stringify({ left, right }))
  check('x축(세계<뷰포트) — 중앙 정렬 오프셋이 음수(letterbox, (674-1280)/2)', expectedCenterX < 0, `expectedCenterX=${expectedCenterX}`)

  // y축(세계>뷰포트)은 여전히 캐릭터를 따라간다 — 같은 호출에서 x만 고정.
  const top = computeCameraTarget({ charX: worldW / 2, charY: 0, viewportW, viewportH, worldW, worldH })
  const bottom = computeCameraTarget({ charX: worldW / 2, charY: worldH, viewportW, viewportH, worldW, worldH })
  check('y축(세계>뷰포트) — 같은 호출에서도 y는 여전히 캐릭터를 따라 clamp(0과 worldH-viewportH로 갈림)', top.y === 0 && bottom.y === worldH - viewportH, JSON.stringify({ top, bottom }))
}

// ── 5. computeCameraTarget — NaN 안전성 ─────────────────────────────────
section('5. computeCameraTarget — 비정상 입력 안전성')
{
  const base = { charX: 100, charY: 100, viewportW: 360, viewportH: 640, worldW: 539, worldH: 1024 }
  const r1 = computeCameraTarget({ ...base, charX: NaN })
  check('charX=NaN → x=0(안전 폴백), y는 정상 계산', r1.x === 0 && Number.isFinite(r1.y), JSON.stringify(r1))
  const r2 = computeCameraTarget({ ...base, worldW: undefined })
  check('worldW=undefined → x=0(안전 폴백)', r2.x === 0, JSON.stringify(r2))
  const r3 = computeCameraTarget({ ...base, viewportH: Infinity })
  check('viewportH=Infinity → y=0(안전 폴백, Infinity는 non-finite)', r3.y === 0, JSON.stringify(r3))
  const r4 = computeCameraTarget({})
  check('완전히 빈 입력 → {x:0,y:0}(예외 없음)', r4.x === 0 && r4.y === 0, JSON.stringify(r4))
}

// ── 6. lerp — 기본 보간 계약 ─────────────────────────────────────────────
section('6. lerp — 기본 계약')
{
  check('lerp(0,100,0) === 0', lerp(0, 100, 0) === 0)
  check('lerp(0,100,1) === 100', lerp(0, 100, 1) === 100)
  check('lerp(0,100,0.5) === 50', lerp(0, 100, 0.5) === 50)
  check('lerp(10,10,0.3) === 10(a===b면 t 무관)', lerp(10, 10, 0.3) === 10)
  check('lerp(100,0,0.25) === 75(역방향)', lerp(100, 0, 0.25) === 75)
}

// ── 7. stepCamera — 수렴 + 스냅 ─────────────────────────────────────────
section('7. stepCamera — 목표로 점진 수렴하고 결국 정확히 스냅됨')
{
  check('CAMERA_LERP === 0.15(팀장 지시 값)', CAMERA_LERP === 0.15, String(CAMERA_LERP))

  let cam = { x: 0, y: 0 }
  const target = { x: 500, y: 300 }
  let steps = 0
  let monotonic = true
  let prevDist = Infinity
  while (steps < 500) {
    const next = stepCamera(cam, target)
    const dist = Math.hypot(next.x - target.x, next.y - target.y)
    if (dist > prevDist + 1e-9) monotonic = false // 목표와의 거리가 매 프레임 감소(또는 유지)해야 함 — 진동 없음.
    prevDist = dist
    cam = next
    steps++
    if (cam.x === target.x && cam.y === target.y) break
  }
  check('반복 호출이 유한 스텝(500 미만) 안에 목표에 정확히 스냅됨', cam.x === target.x && cam.y === target.y, `steps=${steps} cam=${JSON.stringify(cam)}`)
  check('수렴 거리가 매 프레임 단조 감소(진동 없음)', monotonic)
  check(`스냅까지 걸린 스텝 수가 합리적 범위(사람이 체감할 만큼, steps<200)`, steps < 200, `steps=${steps}`)

  // 스냅 경계 — 0.5px 미만이면 반드시 정확히 target을 반환.
  const almost = stepCamera({ x: 499.7, y: 300.2 }, target)
  check('0.5px 미만 차이면 lerp 대신 target을 정확히 반환(스냅)', almost.x === target.x && almost.y === target.y, JSON.stringify(almost))
  const notYet = stepCamera({ x: 400, y: 300 }, target) // lerp 후 여전히 0.5px 이상 차이나야 함
  check('0.5px 이상 차이가 남으면 아직 target으로 스냅하지 않음', !(notYet.x === target.x && notYet.y === target.y), JSON.stringify(notYet))

  // t=1(reduced-motion 스냅) — 첫 호출에 정확히 도달.
  const reduced = stepCamera({ x: 0, y: 0 }, target, 1)
  check('t=1이면 한 스텝만에 정확히 target에 도달(reduced-motion)', reduced.x === target.x && reduced.y === target.y, JSON.stringify(reduced))

  // 이미 target에 있으면 계속 target(안정 고정점).
  const stable = stepCamera(target, target)
  check('이미 target이면 다음 스텝도 정확히 target(고정점)', stable.x === target.x && stable.y === target.y, JSON.stringify(stable))
}

// ── 8. stepCamera — NaN 안전성 ──────────────────────────────────────────
section('8. stepCamera — 비정상 입력에서도 throw 없음')
{
  let threw = false
  let result
  try {
    result = stepCamera({ x: NaN, y: 0 }, { x: 10, y: 10 })
  } catch (err) {
    threw = true
  }
  check('prev.x=NaN이어도 예외를 던지지 않음', !threw)
  check('prev.x=NaN이면 결과도 NaN을 전파(크래시는 없되 값 자체는 계산 안 됨 — 호출부가 알아서 폴백해야 함)', Number.isNaN(result.x))
}

// ── 9. 산책 모드 선호 — 기본 ON / 'off' → false / 저장소 예외 → 기본값 ──
section('9. 산책 모드 선호(localStorage) — 기본 ON, off 저장, 예외 안전')
{
  check('WALK_MODE_STORAGE_KEY === "paulEasyVoca_proto25dWalkMode"', WALK_MODE_STORAGE_KEY === 'paulEasyVoca_proto25dWalkMode', WALK_MODE_STORAGE_KEY)

  function makeMemoryStorage(initial = {}) {
    const store = { ...initial }
    return {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      _dump: () => ({ ...store }),
    }
  }

  // 최초 방문(저장된 값 없음) — 기본 ON.
  const fresh = makeMemoryStorage()
  check('저장된 값이 없으면(최초 방문) readWalkModePreference === true(기본 ON)', readWalkModePreference(fresh) === true)

  // storage가 아예 없음(SSR/구식 브라우저 등) — 기본 ON, throw 없음.
  check('storage 인자 자체가 undefined여도 예외 없이 true(기본 ON)', readWalkModePreference(undefined) === true)
  check('storage 인자가 null이어도 예외 없이 true(기본 ON)', readWalkModePreference(null) === true)

  // writeWalkModePreference(storage, false) 후 다시 읽으면 false.
  const s2 = makeMemoryStorage()
  writeWalkModePreference(s2, false)
  check('writeWalkModePreference(s,false) 후 저장값이 "off"', s2._dump()[WALK_MODE_STORAGE_KEY] === 'off', JSON.stringify(s2._dump()))
  check('writeWalkModePreference(s,false) 후 readWalkModePreference === false', readWalkModePreference(s2) === false)

  // writeWalkModePreference(storage, true) 후 다시 읽으면 true.
  const s3 = makeMemoryStorage({ [WALK_MODE_STORAGE_KEY]: 'off' })
  check('사전조건 — "off"로 시작하면 읽기 결과가 false', readWalkModePreference(s3) === false)
  writeWalkModePreference(s3, true)
  check('writeWalkModePreference(s,true) 후 저장값이 "on"', s3._dump()[WALK_MODE_STORAGE_KEY] === 'on')
  check('writeWalkModePreference(s,true) 후 readWalkModePreference === true', readWalkModePreference(s3) === true)

  // 손상된/무관한 값 — 'off'가 아닌 모든 값은 true로 취급(관대한 파싱,
  // 기본 ON 원칙과 일관).
  const garbage = makeMemoryStorage({ [WALK_MODE_STORAGE_KEY]: 'garbage-value' })
  check('"off"가 아닌 손상된 값(예: "garbage-value")은 true(기본 ON)로 취급', readWalkModePreference(garbage) === true)

  // storage.getItem/setItem이 던지는 환경(privacy 모드 등) — 예외를
  // 삼키고 안전한 기본값으로 폴백.
  const throwingStorage = {
    getItem() { throw new Error('privacy mode getItem') },
    setItem() { throw new Error('privacy mode setItem') },
  }
  let readThrew = false
  let readResult
  try { readResult = readWalkModePreference(throwingStorage) } catch { readThrew = true }
  check('storage.getItem이 던져도 readWalkModePreference가 예외를 전파하지 않음', !readThrew)
  check('storage.getItem이 던지면 기본값 true(기본 ON)로 폴백', readResult === true)

  let writeThrew = false
  try { writeWalkModePreference(throwingStorage, false) } catch { writeThrew = true }
  check('storage.setItem이 던져도 writeWalkModePreference가 예외를 전파하지 않음(조용히 무시)', !writeThrew)
}

// ── 결과 ──────────────────────────────────────────────────────────────
console.log(`\n총 ${totalPassed + totalFailed}개 단언 — PASS ${totalPassed} / FAIL ${totalFailed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exitCode = 1
} else {
  console.log('\n전체 PASS')
}
