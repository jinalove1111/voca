// 쓰기 출제 방향 엔진 테스트 (2026-08-14, P7 — Irene 제보 후속)
//
// Irene 제보("예전엔 영↔한이 섞였는데 최근 한 방향만")의 조사 결과 코드는
// 정상이고 원인은 반 설정(classes.spelling_direction='kr2en')이었다(98차).
// 이 테스트는 그 조사를 회귀로 고정한다:
//   1) 세 모드(en2kr/kr2en/mixed)의 계약
//   2) mixed를 40/100/500/1000문제로 돌려 극단 쏠림이 없는지
//   3) 설정 해석/저장 경로가 새로고침·재로그인 후에도 유지되는 구조인지
//      (코드 레벨 — DB 왕복은 하지 않는다)
// 학생 데이터/별/학습기록 생성 0 — 순수 함수 + 소스 단언만.
import { readFileSync } from 'node:fs'
import { assignDirections } from '../src/utils/entranceTest.js'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}
const mkRng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

console.log('\n1. 단방향 모드 계약 — 전 문항 동일 방향')
{
  for (const dir of ['en2kr', 'kr2en']) {
    const d = assignDirections(40, dir, { rng: mkRng(1) })
    check(`${dir}: 40문항 전부 ${dir}`, d.length === 40 && d.every((x) => x === dir))
  }
}

console.log('\n2. mixed 대량 시뮬레이션 — 40/100/500/1000문제, 시드 5종')
{
  for (const n of [40, 100, 500, 1000]) {
    let allOk = true
    let worstImbalance = 0
    let minSwitches = Infinity
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const d = assignDirections(n, 'mixed', { rng: mkRng(seed) })
      const en = d.filter((x) => x === 'en2kr').length
      const kr = d.filter((x) => x === 'kr2en').length
      // 50:50 계약: 짝수면 정확히 반반, 홀수면 1 차이
      const imbalance = Math.abs(en - kr)
      if (imbalance > (n % 2)) allOk = false
      worstImbalance = Math.max(worstImbalance, imbalance)
      // 셔플 실재: 방향 전환 횟수(전부 몰리면 1~2회에 그친다)
      const switches = d.slice(1).reduce((c, x, i) => c + (x !== d[i] ? 1 : 0), 0)
      minSwitches = Math.min(minSwitches, switches)
      if (en === 0 || kr === 0) allOk = false // 극단 쏠림 절대 금지
    }
    check(`${n}문제: 5개 시드 전부 정확히 50:50(±${n % 2})`, allOk, { worstImbalance })
    check(`${n}문제: 최소 방향 전환 ${minSwitches}회(몰림 없음, 기대 > ${Math.floor(n / 10)})`, minSwitches > Math.floor(n / 10), { minSwitches })
  }
}

console.log('\n3. random 모드 — 문제별 독립 50% (대수의 법칙 범위)')
{
  const d = assignDirections(1000, 'random', { rng: mkRng(3) })
  const en = d.filter((x) => x === 'en2kr').length
  check('1000문제 random: 양쪽 다 400~600 범위', en >= 400 && en <= 600, { en })
}

console.log('\n4. 방어 계약 — 잘못된 입력')
{
  check('알 수 없는 방향은 fallback으로 전 문항 고정', assignDirections(10, 'weird', { fallback: 'en2kr' }).every((x) => x === 'en2kr'))
  check('0문항 -> 빈 배열', assignDirections(0, 'mixed').length === 0)
  check('음수/NaN -> 빈 배열', assignDirections(-5, 'mixed').length === 0 && assignDirections(NaN, 'mixed').length === 0)
  check('홀수(41) mixed -> 21:20 또는 20:21', (() => {
    const d = assignDirections(41, 'mixed', { rng: mkRng(9) })
    const en = d.filter((x) => x === 'en2kr').length
    return d.length === 41 && (en === 20 || en === 21)
  })())
}

console.log('\n5. 설정 유지 구조(코드 레벨) — 새로고침/재로그인/Unit 이동 후에도 방향 유지')
{
  const lib = readFileSync('src/utils/wordLibrary.js', 'utf8')
  const app = readFileSync('src/App.jsx', 'utf8')
  // 방향의 Source of Truth는 DB(classes.spelling_direction) — 클라이언트가
  // localStorage 등에 별도 저장하지 않으므로 새로고침/재로그인 시 항상 DB
  // 값으로 복원된다(세션 간 표류 불가 구조).
  check('방향 설정이 DB 컬럼(spelling_direction)에서 읽힘', /spelling_direction/.test(lib))
  check('클라이언트가 방향을 localStorage에 저장하지 않음(표류 방지)',
    !/localStorage[^\n]*[Dd]irection/.test(lib) && !/localStorage[^\n]*[Dd]irection/.test(app))
  check('유효하지 않은 값은 mixed로 폴백(운영자 확정 기본값 e02249f)',
    /VALID_SPELLING_DIRECTIONS\.has\(c\.spelling_direction\) \? c\.spelling_direction : 'mixed'/.test(lib))
  check('App이 mixed일 때 assignDirections로 세션 단위 배정',
    /assignDirections\([^)]*'mixed'\)/.test(app))
  check('mixed가 아니면 단일 방향을 그대로 전달(설정 존중)',
    /spellingSettings\.spellingDirection !== 'mixed'/.test(app))
  // Unit 이동: 방향은 반 설정 함수(getClassSettings)에서 매번 해석 —
  // Unit 상태와 무관하므로 Unit을 바꿔도 방향이 바뀌지 않는다.
  check('방향이 Unit 상태와 독립(getClassSettings 경유)', /getClassSettings\(getStudentClass\(studentId\)\)/.test(app))
}

console.log(failures === 0 ? '\n모든 단언 통과 ✅ (Irene 실기기 확인은 PENDING 유지)' : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
