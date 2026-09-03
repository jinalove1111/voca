// 학생관리(StudentDirectory) 카드 — 버튼 그룹이 학생 이름을 가리던 레이아웃
// 버그(운영자 제보 2026-09-04) 회귀 방지.
//
// ── 증상 ────────────────────────────────────────────────────────────────
// "🔓 로그인 잠금 해제" 버튼이 뜨는 학생(허용/확인코드/PIN 초기화/반 배정/
// 비활성화 버튼까지 함께 있을 때)은 좁은 화면(휴대폰 폭)에서 오른쪽 버튼
// 그룹의 실제 렌더 폭이 카드 폭을 넘어서고, 왼쪽 이름 블록이
// `flex-shrink-0`이 없는 `min-w-0` 블록이라 0에 가깝게 눌려 이름이
// 잘리거나 버튼 그룹에 가려 안 보인다.
//
// ── 원인(src/components/admin/StudentDirectory.jsx renderStudentCard) ────
//   행 컨테이너: <div className="flex items-start justify-between gap-2">
//   왼쪽(이름) 블록: <div className="flex items-start gap-2 min-w-0">
//   오른쪽(버튼) 블록: <div className="flex gap-1.5 flex-wrap justify-end
//                        items-center flex-shrink-0">
//   버튼 그룹이 flex-wrap이라 "버튼끼리는" 줄바꿈되지만, 그 블록 자체가
//   flex-shrink-0이라 "다른 형제(이름 블록)를 밀어내면서" 자기 폭을 그대로
//   유지한다 — 좁은 화면에서 flex-shrink-0인 두 형제가 justify-between
//   행 안에 같이 있으면 남은 공간이 음수가 될 때 min-w-0 없는 쪽이 이긴다.
//
// ── 이 파일이 고정하는 계약(CSS 클래스만, 로직/버튼 텍스트/핸들러 무변경) ─
//   ① 행 컨테이너에 flex-wrap이 있어 버튼 그룹이 필요하면 이름 아래로
//      줄바꿈될 수 있다.
//   ② 오른쪽 버튼 블록은 flex-shrink-0을 갖지 않고(형제를 밀어내지 않음)
//      min-w-0을 가져 자기 자신도 필요시 줄어들 수 있다.
//   ③ 왼쪽 이름 블록은 min-w-0 + break-keep을 유지하되, 눌려도 완전히
//      0으로 붕괴하지 않도록 축소 방지 가드를 갖는다.
//   ④ 회귀 방지 — 잠금 해제 버튼은 여전히 같은 조건
//      (status?.locked || status?.hasFailedAttempts)에서 같은 텍스트
//      "🔓 로그인 잠금 해제"로 렌더된다(레이아웃 수정 중 버튼 자체를
//      실수로 지우지 않았는지 확인).
//   ⑤ 규칙 11 — PIN/자격증명 컬럼(pin_hash/pin_fail_count/
//      pin_locked_until)을 이번 변경으로 새로 조회/로깅하지 않는다
//      (origin/main 대비 등장 횟수 불변).
//
// ── 테스트 방식 ─────────────────────────────────────────────────────────
// 이 파일은 412KB급 AdminScreen과 마찬가지로 StudentDirectory.jsx도 React/
// Supabase 의존이 많아 SSR 번들이 무겁다 — 그래서 기존 testExcelHeaderGuard
// 관례와 동일하게 **실제 소스 텍스트를 정적으로 검사**하는 계약 테스트로
// 만든다(로직 재구현 0, 렌더 로직을 흉내내지 않고 실제 className 문자열을
// 그대로 검사).
//
// 네트워크 0 / Supabase 0 / DB 무접촉.
// 실행: node scripts/testStudentCardLayout.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const SRC_PATH = path.resolve('src/components/admin/StudentDirectory.jsx')
const src = fs.readFileSync(SRC_PATH, 'utf8')

// renderStudentCard 함수 본문만 추출 — 다른 렌더 구간(모달 등)의 우연한
// 클래스 일치를 섞지 않기 위해.
const fnIdx = src.indexOf('const renderStudentCard = (s) => {')
if (fnIdx === -1) {
  console.log('  FAIL  renderStudentCard 함수를 찾지 못함 — 테스트 전제 붕괴')
  process.exit(1)
}
const bodyStart = src.indexOf('{', fnIdx)
let depth = 0
let endIdx = -1
for (let i = bodyStart; i < src.length; i++) {
  const ch = src[i]
  if (ch === '{') depth++
  else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break } }
}
if (endIdx === -1) {
  console.log('  FAIL  renderStudentCard 본문 끝을 중괄호 균형으로 못 찾음 — 테스트 전제 붕괴')
  process.exit(1)
}
const card = src.slice(bodyStart, endIdx + 1)

// ════════════════════════════════════════════════════════════════════════
// ① 행 컨테이너 — flex-wrap
// ════════════════════════════════════════════════════════════════════════
const rowMatch = card.match(/<div className="flex items-start justify-between gap-2([^"]*)">/)
check('① 행 컨테이너에 flex-wrap이 있다', !!rowMatch && /\bflex-wrap\b/.test(rowMatch[1] || ''),
  { found: rowMatch ? rowMatch[0] : null })

// ════════════════════════════════════════════════════════════════════════
// ② 오른쪽 버튼 그룹 — flex-shrink-0 없음 + min-w-0 있음
// ════════════════════════════════════════════════════════════════════════
const btnGroupMatch = card.match(/<div className="flex gap-1\.5 flex-wrap justify-end items-center([^"]*)">/)
check('② 버튼 그룹 블록을 찾았다', !!btnGroupMatch, { card_excerpt: card.slice(0, 200) })
if (btnGroupMatch) {
  const cls = btnGroupMatch[1] || ''
  check('② 버튼 그룹이 flex-shrink-0을 갖지 않는다(형제인 이름 블록을 밀어내지 않음)',
    !/\bflex-shrink-0\b/.test(cls), { classes: cls })
  check('② 버튼 그룹이 min-w-0을 갖는다(자기 자신도 축소 가능)',
    /\bmin-w-0\b/.test(cls), { classes: cls })
}

// ════════════════════════════════════════════════════════════════════════
// ③ 왼쪽 이름 블록 — min-w-0 유지 + 축소 방지 가드 + 이름 문단 break-keep
// ════════════════════════════════════════════════════════════════════════
const nameBlockMatch = card.match(/<div className="flex items-start gap-2 min-w-0([^"]*)">/)
check('③ 이름 블록이 min-w-0을 유지한다', !!nameBlockMatch, { card_excerpt: card.slice(0, 300) })
if (nameBlockMatch) {
  const cls = nameBlockMatch[1] || ''
  check('③ 이름 블록이 축소 방지 가드(flex-shrink-0 등)를 갖는다(0으로 붕괴 방지)',
    /\bflex-shrink-0\b/.test(cls) || /\bshrink-0\b/.test(cls), { classes: cls })
}
check('③ 이름 문단이 break-keep을 유지한다',
  /<p className="font-black text-gray-800 break-keep">\{s\.name\}<\/p>/.test(card))

// ════════════════════════════════════════════════════════════════════════
// ④ 잠금 해제 버튼 — 회귀 방지(조건/텍스트 불변)
// ════════════════════════════════════════════════════════════════════════
check('④ 잠금 해제 버튼 조건이 유지된다',
  /\{\(status\?\.locked \|\| status\?\.hasFailedAttempts\) && \(/.test(card))
check('④ 잠금 해제 버튼 텍스트가 유지된다',
  /🔓 로그인 잠금 해제/.test(card))

// ════════════════════════════════════════════════════════════════════════
// ⑤ 규칙 11 — PIN 컬럼 문자열을 새로 추가하지 않았다(origin/main 대비
//    등장 횟수 불변). 로컬에 origin/main 참조가 없거나 git 명령이 실패하면
//    (오프라인/얕은 clone 등) 조용히 SKIP — 이 저장소 조회 실패를 코드
//    버그로 오판하지 않는다.
// ════════════════════════════════════════════════════════════════════════
const PIN_COLUMNS = ['pin_hash', 'pin_fail_count', 'pin_locked_until']
try {
  const baseline = execSync('git show origin/main:src/components/admin/StudentDirectory.jsx', { encoding: 'utf8' })
  for (const col of PIN_COLUMNS) {
    const before = (baseline.match(new RegExp(col, 'g')) || []).length
    const after = (src.match(new RegExp(col, 'g')) || []).length
    check(`⑤ 규칙 11 — "${col}" 등장 횟수 불변(before=${before}, after=${after})`, after <= before)
  }
} catch (e) {
  console.log('  SKIP  ⑤ 규칙 11 — origin/main 기준 비교 불가(git 조회 실패), 코드 버그 아님:', e.message)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
