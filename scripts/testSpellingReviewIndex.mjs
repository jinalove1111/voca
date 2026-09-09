// scripts/testSpellingReviewIndex.mjs — SpellingReview 진행 카운터/방향
// 인덱스 드리프트 회귀 테스트 (2026-09-09, QA 세션 Finding 3, 원래
// "LOW, unproven"으로 접수됨 — 이 테스트로 실측 검증).
//
// 가설(Finding 3 원문): wrongWordIds의 id 중 classWords에서 못 찾는
// 항목(단어가 세션 도중 삭제/수정됨)이 있으면 words = wrongWordIds.map(
// find).filter(Boolean)에서 조용히 빠지지만 wrongWordIds 자체에서는
// 지워지지 않아(onClearWord가 그 id에 대해 절대 호출되지 않으므로),
// "문제 N/M" 카운터와 mixedDirections 인덱스 계산에 쓰이는
// `total - words.length`가 실제 clear 개수보다 부풀려진다.
//
// 실측 결과(아래 시뮬레이션으로 확정, 구현 보고서에 원문 로그 포함):
// 드리프트는 실재하나, Finding 원문이 예로 든 지점(word c 차례에서
// index 1 대신 2가 나와야 한다는 것)과 달리 실제로는 **세션의 매우 첫
// 문제(word a)부터 즉시** 발생한다 — b가 처음부터 안 보이므로
// words.length가 처음부터 실제보다 1 작게 시작하기 때문. word c 차례의
// 방향 인덱스는(우연히, 이 픽스처에서는) 이미 기존 공식으로도 2가
// 나와서 그 특정 숫자만 보면 안 틀린 것처럼 보이지만, 카운터(N/M)는
// word c 차례에도 여전히 밀려 있다(3/3이 아니라 2/3이어야 함). 즉 결함은
// "특정 단어의 방향"이 아니라 "카운터/방향 계산이 공유하는 total -
// words.length 공식 자체"에 있다 — 아래 1단계에서 이미 FAIL로 증명됨.
//
// 검증 방법: SpellingReview.jsx는 useRef로 세션 내내 값을 들고 있는
// 컴포넌트라(초기 total 스냅샷), jsdom 없이 진짜로 두 번 리렌더해 ref
// 지속을 관찰할 방법이 이 저장소엔 없다(규칙 6, node_modules에 jsdom/
// react-test-renderer 없음 확인됨). 대신 이 저장소의 기존 관례(
// testTextbookGradeLabel.mjs 주석 "jsdom/react-test-renderer 없이... 순수
// 함수 호출 + 정적 배선 검사로 대체")를 따라, 소스에서 "어느 공식이
// 지금 적용돼 있는지"(OLD=버그/NEW=수정)를 정규식으로 판별한 뒤, 그
// 공식이 실제로 계산해낼 값을 순수 JS로 재현(replicate)해 세션 진행을
// 단계별로 시뮬레이션한다. 기대값(=올바른 값)은 OLD/NEW 여부와 무관하게
// 고정돼 있으므로, 이 테스트는 수정 전 소스에 대해선 FAIL, 수정 후
// 소스에 대해선 PASS해야 한다(수동으로 다시 코드를 되돌리지 않아도,
// git stash로 SpellingReview.jsx만 되돌려 실제로 재확인함 — 구현
// 보고서에 별첨).
//
// 실행: node scripts/testSpellingReviewIndex.mjs
import { readFileSync } from 'node:fs'

let failures = 0, asserted = 0
const check = (label, cond, detail) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failures++ }
}

const src = readFileSync('src/components/SpellingReview.jsx', 'utf8')

// ── 1. 소스에서 현재 적용된 공식(OLD 버그 / NEW 수정) 판별 ────────────────
const HAS_OLD_COUNTER = /const currentNo = Math\.min\(total, total - words\.length \+ 1\)/.test(src)
const HAS_NEW_COUNTER = /const currentNo = Math\.min\(total, total - wrongWordIds\.length \+ 1\)/.test(src)
const HAS_OLD_DIRECTION = /mixedDirections\[total - words\.length\] \|\| 'kr2en'/.test(src)
const HAS_NEW_DIRECTION = /mixedDirections\[initialOrderRef\.current\.indexOf\(current\.id\)\] \|\| 'kr2en'/.test(src)

console.log('\n0. 소스 공식 판별(전제 — 알려진 두 형태 중 정확히 하나와 일치해야 함)')
check('currentNo 공식이 OLD/NEW 중 정확히 하나와 일치', HAS_OLD_COUNTER !== HAS_NEW_COUNTER,
  { HAS_OLD_COUNTER, HAS_NEW_COUNTER })
check('resolvedDirection 공식이 OLD/NEW 중 정확히 하나와 일치', HAS_OLD_DIRECTION !== HAS_NEW_DIRECTION,
  { HAS_OLD_DIRECTION, HAS_NEW_DIRECTION })
const usingNew = HAS_NEW_COUNTER && HAS_NEW_DIRECTION
const usingOld = HAS_OLD_COUNTER && HAS_OLD_DIRECTION
check('두 공식이 서로 다른 버전으로 섞여있지 않음(둘 다 OLD 또는 둘 다 NEW)', usingNew || usingOld,
  { HAS_OLD_COUNTER, HAS_NEW_COUNTER, HAS_OLD_DIRECTION, HAS_NEW_DIRECTION })
console.log(`   → 현재 소스 상태: ${usingNew ? 'NEW(수정 후)' : usingOld ? 'OLD(수정 전, 버그)' : '판별 불가'}`)

// ── 2. 세션 시뮬레이션 — wrongWordIds=[a,b,c], classWords에 b 없음(삭제된
//    단어를 흉내), mixedDirections=[kr2en, en2kr, kr2en] ─────────────────
const classWordsMap = { a: { id: 'a' }, c: { id: 'c' } } // word b는 없음
const mixedDirections = ['kr2en', 'en2kr', 'kr2en']

function makeSession() {
  let totalRef = null
  let orderRef = null
  return function step(wrongWordIds) {
    const words = wrongWordIds.map((id) => classWordsMap[id]).filter(Boolean)
    if (totalRef === null || wrongWordIds.length > totalRef) totalRef = wrongWordIds.length
    const total = totalRef
    if (orderRef === null) orderRef = [...wrongWordIds]
    else if (wrongWordIds.length > orderRef.length) {
      for (const id of wrongWordIds) if (!orderRef.includes(id)) orderRef.push(id)
    }
    if (words.length === 0) return null // useEffect가 onDone()을 트리거, 컴포넌트는 null 반환
    const current = words[0]
    const currentNo = usingNew
      ? Math.min(total, total - wrongWordIds.length + 1)
      : Math.min(total, total - words.length + 1)
    const resolvedDirection = usingNew
      ? (mixedDirections[orderRef.indexOf(current.id)] || 'kr2en')
      : (mixedDirections[total - words.length] || 'kr2en')
    return { current, currentNo, total, resolvedDirection }
  }
}

console.log('\n1. 마운트 직후 — word b가 classWords에 없어 words=[a,c]로 시작(첫 문제는 word a)')
{
  const step = makeSession()
  const r1 = step(['a', 'b', 'c'])
  check('1단계 — current가 word a(전제)', r1?.current?.id === 'a', r1)
  check('1단계 — 문제 번호는 1/3이어야 함(세션의 진짜 첫 문제) — b가 안 보인다고 이미 하나 푼 것처럼 카운트되면 안 됨',
    r1?.currentNo === 1, r1)
  check("1단계 — word a의 방향은 mixedDirections[0]='kr2en'(원래 배정 그대로) — b가 안 보인다고 밀려서 index 1='en2kr'을 쓰면 안 됨",
    r1?.resolvedDirection === 'kr2en', r1)

  console.log('\n2. word a를 맞혀 onClearWord(a) 호출 → 부모가 wrongWordIds=[b,c]로 갱신(같은 세션 인스턴스, ref 유지)')
  const r2 = step(['b', 'c'])
  check('2단계 — current가 word c(전제)', r2?.current?.id === 'c', r2)
  check('2단계 — 문제 번호는 2/3이어야 함(실제로 두 번째로 시도하는 문제, 3/3 아님)', r2?.currentNo === 2, r2)
  check("2단계 — word c의 방향은 mixedDirections[2]='kr2en'(세션 시작 시점 원래 위치 기준)",
    r2?.resolvedDirection === 'kr2en', r2)

  console.log('\n3. word c도 맞혀 onClearWord(c) → wrongWordIds=[b](영구 유령 항목만 남음) → words.length===0 → onDone 트리거(null 반환)')
  const r3 = step(['b'])
  check('3단계 — words가 비어 컴포넌트가 null을 반환(onDone 트리거)', r3 === null, r3)
}

console.log('\n4. 대조군 — 누락 없는 정상 세션(wrongWordIds=[a,c]만, classWords 완전 매칭) — 항상 정확해야 함(무회귀 가드)')
{
  const step = makeSession()
  const r1 = step(['a', 'c'])
  check('정상 세션 1단계 — 문제 1/2, kr2en(mixedDirections[0])',
    r1?.currentNo === 1 && r1?.resolvedDirection === 'kr2en', r1)
  const r2 = step(['c'])
  check('정상 세션 2단계 — 문제 2/2, en2kr(mixedDirections[1])',
    r2?.currentNo === 2 && r2?.resolvedDirection === 'en2kr', r2)
}

console.log(failures === 0
  ? `\n모든 단언 통과(${asserted}개) — SpellingReview 인덱스 드리프트 수정 확인 ✅`
  : `\n${failures}/${asserted}개 단언 실패 ❌ (소스가 OLD 상태면 정상 — 수정 전 FAIL 증거)`)
process.exit(failures > 0 ? 1 : 0)
