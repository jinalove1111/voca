// 모자 색 표시 계층 회귀 테스트 (2026-08-26)
//
// 확정된 원인(READ-ONLY 조사 결과 그대로 인용):
//   학생 모자 8종은 전부 같은 이모지 '🎩'(U+1F3A9, 모든 이모지 폰트에서
//   검은색)를 쓰고, 색 구분은 오직 HAT_CATALOG의 colorHex 틴트로만
//   이뤄지도록 설계돼 있다(hatSystem.js 헤더 주석 "같은 디자인 +
//   colorName/colorHex로 표현한다"). 이모지는 CSS color로 물들지 않으므로
//   저장소는 "투명 글자 + text-shadow 실루엣" 기법을 표준으로 채택했다
//   (HatCeremony.jsx 헤더 주석).
//
//   그런데 그 기법이 4개 렌더 지점에 적용되지 않아, 이름은 "하얀색 폴
//   모자"인데 화면에는 검은 톱햇이 나왔다(Irene 실사고 — equippedHatId
//   = 'hat_scientist'로 DB는 정상, 표시만 틀림):
//     ❌ HatCollection.jsx 아바타 미리보기 / 각 모자 카드 아이콘
//     ❌ Dashboard.jsx 홈 아바타 / "○○ 착용 중" 라벨
//     ✅ PaulTown.jsx 모자걸이 / HatCeremony.jsx 수여식 (여기만 정상)
//
//   HAT_COLOR_STYLE은 앱 전체에서 PaulTown.jsx 단 한 곳에서만 소비됐고,
//   HatCollection.jsx/Dashboard.jsx는 import조차 하지 않았다.
//
// 이 테스트가 고정하는 계약:
//   1) 틴트 스타일을 만드는 단일 진실 원천 함수(hatTintStyle)가 존재하고,
//      fill 색이 항상 colorHex에서 파생된다(모자별 하드코딩 금지 —
//      카탈로그에 없는 임의 색을 넣어도 동일 규칙이 적용되는지로 검증).
//   2) 밝은 색(하얀색/금색)은 배경에 묻히지 않도록 외곽선이 추가되되,
//      fill 자체는 여전히 colorHex다(요구사항: "fill color는 colorHex 유지").
//   3) 하얀색과 검은색 모자의 스타일이 실제로 서로 다르다(이번 사고의 본질).
//   4) 4개 렌더 지점 전부가 그 함수를 쓴다(정적 검사) — 한 곳이라도
//      원본 이모지를 그대로 출력하면 FAIL.
//   5) 획득/장착/벗기 로직과 카탈로그 데이터는 한 글자도 안 바뀐다
//      (id/colorHex/임계값/evaluateHatUnlocks 결정론·멱등 회귀 잠금).
//
// 실행: node scripts/testHatColorRendering.mjs
// 네트워크 0, Supabase 0, DB 접촉 0 — 순수 함수 + 소스 정적 검사뿐.
import { readFileSync } from 'node:fs'
import path from 'node:path'
// 네임스페이스 import — 수정 전 소스에는 hatTintStyle 자체가 없어(FAIL-first
// 실측 대상) named import를 쓰면 모듈 로드 단계에서 스크립트 전체가 죽고
// 나머지 단언(회귀 잠금 포함)이 아예 실행되지 않는다. 같은 이유로
// testWritingDirectionResolution.mjs도 동일한 관례를 쓴다.
import * as hatSystem from '../src/utils/attachment/hatSystem.js'

const {
  HAT_CATALOG,
  HAT_THRESHOLDS,
  HAT_COLOR_STYLE,
  hatById,
  evaluateHatUnlocks,
  hatTintStyle,
} = hatSystem

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}
const src = (p) => readFileSync(path.resolve(p), 'utf8')
// 주석에 우연히 들어간 문자열이 정적 검사를 통과시키는 오탐을 막는다.
const codeOnly = (text) => text
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
  .join('\n')

console.log('\n=== 1절. 틴트 스타일 단일 진실 원천(hatTintStyle) 계약 ===')

check('hatTintStyle이 export된 함수다', typeof hatTintStyle === 'function')

if (typeof hatTintStyle === 'function') {
  const white = hatTintStyle('#ECEFF1')
  const black = hatTintStyle('#2d2d2d')

  check('이모지 틴트의 전제 — color는 항상 transparent',
    white.color === 'transparent' && black.color === 'transparent',
    JSON.stringify({ white: white.color, black: black.color }))

  check('하얀색 모자의 fill이 #ECEFF1이다',
    typeof white.textShadow === 'string' && white.textShadow.toLowerCase().includes('#eceff1'),
    JSON.stringify(white.textShadow))

  check('검은색 모자의 fill이 #2d2d2d이다',
    typeof black.textShadow === 'string' && black.textShadow.toLowerCase().includes('#2d2d2d'),
    JSON.stringify(black.textShadow))

  // 이번 사고의 본질 — 이름만 다르고 화면은 똑같이 검게 보였다.
  check('하얀색과 검은색의 스타일이 실제로 서로 다르다',
    JSON.stringify(white) !== JSON.stringify(black))

  // fill은 항상 첫 번째 그림자여야 한다(CSS text-shadow는 앞선 것이 위에
  // 그려진다 — 외곽선이 fill을 덮으면 색이 죽는다).
  check('fill이 첫 번째 text-shadow 레이어다(외곽선이 fill을 덮지 않음)',
    typeof white.textShadow === 'string' && /^\s*0\s+0\s+0\s+#eceff1/i.test(white.textShadow),
    JSON.stringify(white.textShadow))

  // 요구사항: 밝은 색은 outline 사용하되 fill은 colorHex 유지.
  const layers = (s) => String(s || '').split(/,(?![^()]*\))/).length
  check('밝은 색(하얀색)은 외곽선 레이어가 추가된다', layers(white.textShadow) > 1,
    JSON.stringify(white.textShadow))
  check('어두운 색(검은색)은 외곽선 없이 fill 한 겹이다', layers(black.textShadow) === 1,
    JSON.stringify(black.textShadow))

  // 모자별 하드코딩 금지 — 카탈로그에 없는 임의 색도 같은 규칙을 탄다.
  const arbitraryLight = hatTintStyle('#FFFFFF')
  const arbitraryDark = hatTintStyle('#000000')
  check('카탈로그에 없는 밝은 색(#FFFFFF)도 동일 규칙으로 외곽선을 받는다',
    arbitraryLight.textShadow.toLowerCase().includes('#ffffff') && layers(arbitraryLight.textShadow) > 1)
  check('카탈로그에 없는 어두운 색(#000000)도 동일 규칙으로 외곽선이 없다',
    arbitraryDark.textShadow.toLowerCase().includes('#000000') && layers(arbitraryDark.textShadow) === 1)

  // 잘못된 입력에도 절대 throw하지 않고 폴의 기본 검은색으로 안전 폴백.
  for (const bad of [null, undefined, '', 'not-a-color', 123, {}]) {
    check(`잘못된 입력(${JSON.stringify(bad)})에도 throw 없이 기본색 폴백`,
      (() => {
        try { return hatTintStyle(bad).textShadow.toLowerCase().includes('#2d2d2d') }
        catch { return false }
      })())
  }

  check('3자리 축약 hex(#fff)도 처리된다',
    (() => { try { return layers(hatTintStyle('#fff').textShadow) > 1 } catch { return false } })())
}

console.log('\n=== 2절. 카탈로그 8종 전부가 자기 colorHex로 칠해진다 ===')

if (typeof hatTintStyle === 'function') {
  for (const hat of HAT_CATALOG) {
    const style = hatTintStyle(hat.colorHex)
    check(`${hat.name}(${hat.id})의 fill = ${hat.colorHex}`,
      String(style.textShadow).toLowerCase().includes(hat.colorHex.toLowerCase()))
  }
  // 8종의 스타일이 전부 서로 달라야 한다(색이 곧 정체성).
  const styles = HAT_CATALOG.map((h) => JSON.stringify(hatTintStyle(h.colorHex)))
  check('8종의 틴트 스타일이 전부 서로 다르다(중복 0)', new Set(styles).size === HAT_CATALOG.length,
    `고유 ${new Set(styles).size}종`)
}

console.log('\n=== 3절. 4개 렌더 지점 전부가 같은 색 규칙을 쓴다(정적 검사) ===')

const RENDER_SITES = [
  ['src/components/HatCollection.jsx', 'HatCollection(카드 + 아바타)'],
  ['src/components/Dashboard.jsx', 'Dashboard(홈 아바타 + 착용 라벨)'],
  ['src/components/HatCeremony.jsx', 'HatCeremony(수여식)'],
  ['src/components/PaulTown.jsx', 'PaulTown(모자걸이)'],
]

for (const [file, label] of RENDER_SITES) {
  const text = codeOnly(src(file))
  check(`${label} — hatTintStyle을 import한다`,
    /import\s*\{[^}]*\bhatTintStyle\b[^}]*\}\s*from\s*['"][^'"]*hatSystem/.test(text),
    file)
  check(`${label} — hatTintStyle을 실제로 호출한다`,
    /hatTintStyle\s*\(/.test(text),
    file)
}

// 틴트 없이 원본 이모지를 그대로 뿌리던 정확한 패턴들이 사라졌는지.
{
  const hc = codeOnly(src('src/components/HatCollection.jsx'))
  check('HatCollection — 카드가 {hat.emoji}를 맨몸으로 출력하지 않는다',
    !/>\s*\{\s*owned\s*\?\s*hat\.emoji\s*:/.test(hc))
  check('HatCollection — 아바타가 틴트 없는 avatarEmoji를 맨몸으로 출력하지 않는다',
    !/>\s*\{\s*avatarEmoji\s*\}\s*</.test(hc))

  const db = codeOnly(src('src/components/Dashboard.jsx'))
  check('Dashboard — 아바타가 {equippedHat.emoji}를 맨몸으로 출력하지 않는다',
    !/>\s*\{\s*equippedHat\s*\?\s*equippedHat\.emoji\s*:/.test(db))
  check('Dashboard — 착용 라벨이 {equippedHat.emoji}를 맨몸으로 출력하지 않는다',
    !/\{\s*equippedHat\.emoji\s*\}\s*\{?\s*['"\s]*\{?\s*equippedHat\.name/.test(db))
}

// 미획득(🔒)/미장착(👑) 분기는 절대 건드리지 않았는지 — 화면 변화 0 보장.
{
  const hc = codeOnly(src('src/components/HatCollection.jsx'))
  check('HatCollection — 미획득 자물쇠(🔒) 분기 보존', hc.includes('🔒'))
  check('HatCollection — 미장착 기본 왕관(👑) 분기 보존', hc.includes('👑'))
  const db = codeOnly(src('src/components/Dashboard.jsx'))
  check('Dashboard — 미장착 기본 왕관(👑) 분기 보존', db.includes('👑'))
}

console.log('\n=== 4절. 획득/장착 로직·카탈로그 데이터 회귀 잠금 (수정 전후 동일해야 함) ===')

const EXPECTED_IDS = ['hat_starter', 'hat_explorer', 'hat_chef', 'hat_scientist',
  'hat_wizard', 'hat_graduation', 'hat_crown', 'hat_rose']
const EXPECTED_HEX = {
  hat_starter: '#2d2d2d', hat_explorer: '#4FC3F7', hat_chef: '#66BB6A',
  hat_scientist: '#ECEFF1', hat_wizard: '#9575CD', hat_graduation: '#E57373',
  hat_crown: '#FFD54F', hat_rose: '#F48FB1',
}

check('모자 id 8종이 그대로다(id를 바꾸면 기존 인벤토리가 고아가 됨)',
  JSON.stringify(HAT_CATALOG.map((h) => h.id)) === JSON.stringify(EXPECTED_IDS))
for (const hat of HAT_CATALOG) {
  check(`${hat.id}의 colorHex가 ${EXPECTED_HEX[hat.id]} 그대로다`, hat.colorHex === EXPECTED_HEX[hat.id], hat.colorHex)
}
check('8종 전부 같은 톱햇 이모지를 쓴다(설계 그대로)',
  HAT_CATALOG.every((h) => h.emoji === HAT_CATALOG[0].emoji))
check('HAT_COLOR_STYLE 매핑이 카탈로그와 계속 일치한다',
  HAT_CATALOG.every((h) => HAT_COLOR_STYLE[h.id]?.colorHex === h.colorHex
    && HAT_COLOR_STYLE[h.id]?.colorName === h.colorName))
check('임계값(HAT_THRESHOLDS)이 그대로다',
  HAT_THRESHOLDS.explorerCleared === 10 && HAT_THRESHOLDS.chefStreak === 7
  && HAT_THRESHOLDS.scientistQuizCorrect === 100 && HAT_THRESHOLDS.wizardMastered === 30
  && HAT_THRESHOLDS.crownCleared === 200 && HAT_THRESHOLDS.roseWeekDays === 5)
check('hatById 조회가 정상이다', hatById('hat_scientist')?.name === '하얀색 폴 모자' && hatById('nope') === null)

// 획득 규칙 결정론·멱등·no-revoke — 표시 계층 수정이 여기 닿지 않았음을 증명.
{
  const stats = { firstMissionDayKey: '2026-07-22', clearedCount: 10, streak: 0,
    totalQuizCorrect: 100, masteredCount: 0, thisWeek: { daysStudied: 0 } }
  const ctx = { completedUnits: [] }
  const now = new Date('2026-08-26T00:00:00.000Z')
  const a = evaluateHatUnlocks(stats, ctx, [], now)
  const b = evaluateHatUnlocks(stats, ctx, [], now)
  check('evaluateHatUnlocks 결정론(같은 입력 → 같은 출력)', JSON.stringify(a) === JSON.stringify(b))
  check('evaluateHatUnlocks가 규칙 충족 3종을 준다(starter/explorer/scientist)',
    JSON.stringify(a.map((x) => x.hatId).sort()) === JSON.stringify(['hat_explorer', 'hat_scientist', 'hat_starter']))
  const owned = a.map((x) => x.hatId)
  check('멱등 — 이미 가진 모자는 다시 안 나온다', evaluateHatUnlocks(stats, ctx, owned, now).length === 0)
  const revoked = evaluateHatUnlocks({ ...stats, clearedCount: 0 }, ctx, owned, now)
  check('회수 없음 — 조건이 무너져도 인벤토리에서 빼앗지 않는다', revoked.length === 0)
}

check('hatSystem.js에 네트워크/DB import가 없다(순수 모듈 유지)',
  !/from\s+['"].*supabase|createClient|fetch\s*\(/.test(codeOnly(src('src/utils/attachment/hatSystem.js'))))

console.log('\n=== 5절. 장착/벗기 배선 무변경 (정적) ===')
{
  const hc = codeOnly(src('src/components/HatCollection.jsx'))
  check('HatCollection — 장착/벗기 토글(onEquip(isEquipped ? null : hat.id)) 보존',
    /onEquip\(\s*isEquipped\s*\?\s*null\s*:\s*hat\.id\s*\)/.test(hc))
  check('HatCollection — "쓰고 있어요 ✓ (벗기)" 라벨 보존', hc.includes('쓰고 있어요 ✓ (벗기)'))
  const pt = codeOnly(src('src/components/PaulTown.jsx'))
  check('PaulTown — 모자걸이 토글(onEquip(isEquipped ? null : h.hatId)) 보존',
    /onEquip\(\s*isEquipped\s*\?\s*null\s*:\s*h\.hatId\s*\)/.test(pt))
  const ce = codeOnly(src('src/components/HatCeremony.jsx'))
  check('HatCeremony — onEquip(hat.id) 보존', /onEquip\?\.\(\s*hat\.id\s*\)/.test(ce))
}

console.log(`\n${'='.repeat(60)}`)
console.log(`총 ${passed + failed}단언 — PASS ${passed} / FAIL ${failed}`)
if (failed > 0) {
  console.log('\n실패 목록:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('ALL PASS')
