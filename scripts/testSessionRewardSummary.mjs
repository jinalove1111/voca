// scripts/testSessionRewardSummary.mjs — Session Reward Summary(P1 "즉각적인
// 보상 피드백", 2026-09-03) FAIL-first 계약 테스트.
//
// 3개 파트:
//   1) src/utils/rewardSummary.js 순수 모듈(카테고리 1, 직접 import) —
//      buildSessionRewardSummary/formatRewardLines 계약 + zero-omission +
//      레벨 경계 + rewardEngine.js LEVELS 드리프트 가드.
//   2) src/components/SessionRewardCard.jsx(카테고리 3, esbuild 번들 +
//      react-dom/server SSR 문자열 단언) — testSpellingDirectionWiring.mjs
//      템플릿과 동일 패턴.
//   3) 배선 정적 검사(소스 문자열 검사, testGameRewardPolicy.mjs의 "App.jsx
//      정적 검사"와 같은 방식) — features.js 플래그 기본 OFF, useStudent.js
//      가 grantLedgerReward의 기존 hasRewardEntry 조기반환(early-return,
//      무변경) "이후"에만 요약을 만드는지(=idempotency는 새 로직이 아니라
//      기존 지급 단일 경로 가드를 재사용), App.jsx가 플래그가 켜졌을
//      때만 카드를 마운트하는지.
//   + 4) 순수 함수만으로 구성한 "재지급 방지" 오케스트레이션 시뮬레이션 —
//      실제 rewardEngine.js(hasRewardEntry/appendRewardEntry/buildRewardEntry,
//      실소스 그대로) + 실제 rewardSummary.buildSessionRewardSummary를
//      그대로 이어붙이고, useStudent.grantLedgerReward가 하는 것과 정확히
//      같은 순서(사전체크 -> append -> grantReward -> grantXp -> 요약)로
//      두 번 호출해 두 번째 호출에서 grantReward/grantXp가 전혀 안 불림을
//      확인한다(로직 재구현이 아니라 실제 export를 그대로 이어붙인 것 —
//      TESTING.md "손으로 베낀 로직 금지" 원칙 준수, glue만 테스트 파일에
//      있고 판정 로직은 전부 실제 소스).
//
// 파일 존재 전 실행 결과(FAIL-first 실측, CLAUDE.md 규칙 15): 아래
// 리포트/handoff에 기록.
//
// 실행: node scripts/testSessionRewardSummary.mjs
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import esbuild from 'esbuild'
import { hasRewardEntry, appendRewardEntry, buildRewardEntry, LEVELS, starsToNextLevel } from '../src/utils/rewardEngine.js'

let failures = 0
const check = (label, cond) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

// ── 1) rewardSummary.js 순수 모듈 ───────────────────────────────────────
console.log('\n1. src/utils/rewardSummary.js — 순수 모듈 계약')
let rewardSummaryMod = null
try {
  rewardSummaryMod = await import(pathToFileURL(path.resolve('src/utils/rewardSummary.js')).href)
} catch (e) {
  console.log(`  (import 실패: ${e.message})`)
}
check('rewardSummary.js import 가능', !!rewardSummaryMod)
const buildSessionRewardSummary = rewardSummaryMod?.buildSessionRewardSummary
const formatRewardLines = rewardSummaryMod?.formatRewardLines
check('buildSessionRewardSummary export(function)', typeof buildSessionRewardSummary === 'function')
check('formatRewardLines export(function)', typeof formatRewardLines === 'function')

// zero-import 계약(다른 pure 모듈과 동일 관례) — 소스에 import 문이 없어야 함
{
  let src = ''
  try { src = fs.readFileSync(path.resolve('src/utils/rewardSummary.js'), 'utf8') } catch { /* noop */ }
  check('rewardSummary.js에 import 구문 0개(zero-import 관례)', src.length > 0 && !/^\s*import /m.test(src))
}

if (buildSessionRewardSummary && formatRewardLines) {
  // 기본 값 계산
  const s1 = buildSessionRewardSummary({
    entries: [{ stars_delta: 1 }],
    xpEvents: [2],
    gardenBefore: 3,
    gardenAfter: 4,
    streak: 3,
    totalStars: 8,
  })
  check('stars: 원장 항목 stars_delta 합산', s1.stars === 1)
  check('xp: xpEvents 합산', s1.xp === 2)
  check('gardenGrowth: after-before', s1.gardenGrowth === 1)
  check('streak: 그대로 반영', s1.streak === 3)
  check('nextGoal.remaining: 8 -> 20까지 12', s1.nextGoal.remaining === 12)
  check('nextGoal.label에 남은 별 수 포함', s1.nextGoal.label === '다음 레벨까지 별 12개')

  // 여러 항목 합산 + 음수/손상 값 방어
  const s2 = buildSessionRewardSummary({
    entries: [{ stars_delta: 1 }, { stars_delta: 3 }, { stars_delta: -5 }, { stars_delta: 'x' }],
    xpEvents: [2, 2, -1, NaN],
    gardenBefore: 0, gardenAfter: 0,
    streak: 0, totalStars: 0,
  })
  check('stars: 여러 항목 합산 + 음수/손상 무시(1+3=4)', s2.stars === 4)
  check('xp: 여러 항목 합산 + 음수/손상 무시(2+2=4)', s2.xp === 4)
  check('gardenGrowth: 변화 없으면 0', s2.gardenGrowth === 0)
  check('streak: 0 이하는 0', s2.streak === 0)

  // gardenAfter < gardenBefore(비정상 입력) — 음수 성장 없음
  const s3 = buildSessionRewardSummary({ entries: [], xpEvents: [], gardenBefore: 10, gardenAfter: 4, streak: 1, totalStars: 0 })
  check('gardenGrowth: after<before여도 음수 금지(0으로 클램프)', s3.gardenGrowth === 0)

  // zero-omission — 전부 0이면 formatRewardLines가 빈 배열
  const zero = buildSessionRewardSummary({ entries: [], xpEvents: [], gardenBefore: 0, gardenAfter: 0, streak: 0, totalStars: 0 })
  check('전부 0이면 nextGoal.remaining도 20(0->20)', zero.nextGoal.remaining === 20)
  const zeroLines = formatRewardLines({ ...zero, nextGoal: { kind: 'level', remaining: null, label: null } })
  check('zero-omission: 별/XP/정원/연속 전부 0 + nextGoal 없음 -> 0줄', zeroLines.length === 0)

  // formatRewardLines — 각 줄 생략 여부
  const linesFull = formatRewardLines({ stars: 1, xp: 2, gardenGrowth: 1, streak: 3, nextGoal: { kind: 'level', remaining: 12, label: '다음 레벨까지 별 12개' } })
  check('4줄 모두 있을 때 정확히 4줄', linesFull.length === 4)
  check('별/XP 한 줄에 합쳐짐(+1 ⭐   +2 XP)', linesFull[0] === '+1 ⭐   +2 XP')
  check('정원 줄 형식', linesFull[1] === '🌱 정원 +1')
  check('연속일 줄 형식', linesFull[2] === '🔥 3일 연속!')
  check('다음 레벨 줄 형식', linesFull[3] === '🎁 다음 레벨까지 별 12개')

  const linesXpOnly = formatRewardLines({ stars: 0, xp: 2, gardenGrowth: 0, streak: 0, nextGoal: { kind: 'level', remaining: null, label: null } })
  check('별 0 + XP만 있으면 XP만 표시(별 파트 생략)', linesXpOnly.length === 1 && linesXpOnly[0] === '+2 XP')

  const linesStarsOnly = formatRewardLines({ stars: 1, xp: 0, gardenGrowth: 0, streak: 0, nextGoal: { kind: 'level', remaining: null, label: null } })
  check('XP 0 + 별만 있으면 별만 표시(XP 파트 생략)', linesStarsOnly.length === 1 && linesStarsOnly[0] === '+1 ⭐')

  check('최대 4줄 초과 불가(5개 넣어도 slice(0,4))', formatRewardLines({ stars: 1, xp: 1, gardenGrowth: 1, streak: 1, nextGoal: { kind: 'level', remaining: 1, label: '다음 레벨까지 별 1개' } }).length <= 4)

  // ── 레벨 경계 — rewardEngine.js의 진짜 starsToNextLevel과 교차검증
  // (드리프트 가드, 이 파일 헤더 "레벨 임계값 중복(의도적)" 주석 참고)
  const boundarySamples = [0, 1, 19, 20, 21, 49, 50, 99, 100, 150, 199, 200, 201, 500]
  let boundaryOk = true
  for (const st of boundarySamples) {
    const got = buildSessionRewardSummary({ entries: [], xpEvents: [], gardenBefore: 0, gardenAfter: 0, streak: 0, totalStars: st }).nextGoal.remaining
    const want = starsToNextLevel(st) // rewardEngine.js 실제 함수(진짜 소스)
    if (got !== want) { boundaryOk = false; console.log(`    (경계 불일치 stars=${st}: got=${got} want=${want})`) }
  }
  check(`레벨 경계 ${boundarySamples.length}개 전부 rewardEngine.starsToNextLevel과 일치(드리프트 가드)`, boundaryOk)
  check('LEVELS 최고 레벨(200) 도달 시 remaining=null', buildSessionRewardSummary({ entries: [], xpEvents: [], gardenBefore: 0, gardenAfter: 0, streak: 0, totalStars: 200 }).nextGoal.remaining === null)
  check('최고 레벨이면 formatRewardLines가 다음 목표 줄 생략', formatRewardLines(buildSessionRewardSummary({ entries: [], xpEvents: [], gardenBefore: 0, gardenAfter: 0, streak: 0, totalStars: 999 })).every(l => !l.includes('다음 레벨')))

  // ── 원시 정원값 경로(2026-09-03 레이어 계약 수정) ─────────────────────
  // useStudent.js는 이제 "단계" 총합(gardenBefore/gardenAfter)이 아니라
  // 원시 정원 성장값(gardenRawBefore/gardenRawAfter)만 넘긴다(gardenPlots/
  // gardenStageTotal은 attachment 폴더 소유 — 이 모듈은 zero-import라 직접
  // 계산할 수 없음). 원시값만 오면 gardenGrowth는 여기서 계산하지 않고
  // null로 남겨 프레젠터(SessionRewardCard.jsx)가 withGardenGrowth로 채운다.
  const sRaw = buildSessionRewardSummary({ entries: [], xpEvents: [], gardenRawBefore: 3, gardenRawAfter: 5, streak: 0, totalStars: 0 })
  check('원시 정원값만 주어지면 gardenGrowth는 null(단계 변환은 프레젠터 책임)', sRaw.gardenGrowth === null)
  check('gardenRawBefore/gardenRawAfter가 요약에 그대로 실림', sRaw.gardenRawBefore === 3 && sRaw.gardenRawAfter === 5)
  check('레거시(단계 총합) 경로는 gardenRawBefore/After가 null', buildSessionRewardSummary({ entries: [], xpEvents: [], gardenBefore: 3, gardenAfter: 4, streak: 0, totalStars: 0 }).gardenRawBefore === null)

  const withGardenGrowth = rewardSummaryMod?.withGardenGrowth
  check('withGardenGrowth export(function)', typeof withGardenGrowth === 'function')
  if (withGardenGrowth) {
    const filled = withGardenGrowth(sRaw, 1, 2)
    check('withGardenGrowth: 단계 before/after로 gardenGrowth 확정(2-1=1)', filled.gardenGrowth === 1)
    check('withGardenGrowth: 원본 gardenRawBefore/gardenRawAfter는 보존', filled.gardenRawBefore === 3 && filled.gardenRawAfter === 5)
    check('withGardenGrowth: after<before여도 음수 금지(0으로 클램프)', withGardenGrowth(sRaw, 5, 1).gardenGrowth === 0)
  }

  // ── P4(유닛 완료 보상, 2026-09-03) — unitComplete 필드 ──────────────────
  const withUnit = buildSessionRewardSummary({
    entries: [{ reward_type: 'unit-complete', source_type: 'unit', source_id: 'unit-uuid-1', stars_delta: 5 }],
    xpEvents: [], gardenBefore: 0, gardenAfter: 0, streak: 0, totalStars: 5,
  })
  check('entries에 unit-complete가 있으면 unitComplete.unitId === source_id', withUnit.unitComplete && withUnit.unitComplete.unitId === 'unit-uuid-1')
  const withoutUnit = buildSessionRewardSummary({ entries: [{ reward_type: 'word-session-complete', stars_delta: 1 }], xpEvents: [], gardenBefore: 0, gardenAfter: 0, streak: 0, totalStars: 1 })
  check('unit-complete가 없으면 unitComplete는 null', withoutUnit.unitComplete === null)
}

// ── 2) SessionRewardCard.jsx — SSR 렌더 문자열 단언 ─────────────────────
console.log('\n2. src/components/SessionRewardCard.jsx — SSR 렌더')
let SessionRewardCard = null
try {
  await esbuild.build({
    entryPoints: ['src/components/SessionRewardCard.jsx'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: 'scripts/.tmp/sessionRewardCard',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
  })
  const mod = await import(pathToFileURL(path.resolve('scripts/.tmp/sessionRewardCard/SessionRewardCard.js')).href)
  SessionRewardCard = mod.default
} catch (e) {
  console.log(`  (번들/import 실패: ${e.message})`)
}
check('SessionRewardCard 번들/import 가능', typeof SessionRewardCard === 'function')

if (SessionRewardCard) {
  const React = (await import('react')).default
  const { renderToStaticMarkup } = await import('react-dom/server')

  const summary = { stars: 1, xp: 2, gardenGrowth: 1, streak: 3, nextGoal: { kind: 'level', remaining: 12, label: '다음 레벨까지 별 12개' } }
  const html = renderToStaticMarkup(React.createElement(SessionRewardCard, { summary, onDismiss: () => {} }))
  check('요약이 있으면 별/XP 줄 렌더', html.includes('+1 ⭐') && html.includes('+2 XP'))
  check('정원 줄 렌더', html.includes('정원 +1'))
  check('연속일 줄 렌더', html.includes('3일 연속'))
  check('다음 레벨 줄 렌더', html.includes('다음 레벨까지 별 12개'))
  check('GiftReveal/HatCeremony보다 낮은 z-index(z-40) 사용', html.includes('z-40'))
  check('bottom 고정(모바일 하단 카드)', html.includes('bottom-4'))

  const emptyHtml = renderToStaticMarkup(React.createElement(SessionRewardCard, { summary: null, onDismiss: () => {} }))
  check('summary가 null이면 아무것도 렌더하지 않음', emptyHtml === '')

  const zeroSummary = { stars: 0, xp: 0, gardenGrowth: 0, streak: 0, nextGoal: { kind: 'level', remaining: null, label: null } }
  const zeroHtml = renderToStaticMarkup(React.createElement(SessionRewardCard, { summary: zeroSummary, onDismiss: () => {} }))
  check('요약이 전부 0이면(표시할 줄 없음) 아무것도 렌더하지 않음', zeroHtml === '')

  // 원시 정원값(gardenRawBefore/After, 레이어 계약 수정) — 카드가 직접
  // attachment/worldProgress.gardenStageTotal로 변환해 렌더해야 한다.
  // 3→5는 gardenStageTotal(3)=1(16칸 중 1칸 seed), gardenStageTotal(5)=2
  // (2칸 seed) → growth=1(worldProgress.js POINTS_PER_STAGE=2 산수 그대로).
  const rawSummary = { stars: 0, xp: 0, gardenRawBefore: 3, gardenRawAfter: 5, streak: 0, nextGoal: { kind: 'level', remaining: null, label: null } }
  const rawHtml = renderToStaticMarkup(React.createElement(SessionRewardCard, { summary: rawSummary, onDismiss: () => {} }))
  check('원시 정원값 3→5 → 카드가 단계로 변환해 "🌱 정원 +1" 렌더', rawHtml.includes('정원 +1'))

  // ── P4(유닛 완료 보상, 2026-09-03) — big 변형(축하 헤딩 + 결정적 코스메틱) ──
  const bigSummary1 = { stars: 5, xp: 0, gardenGrowth: 0, streak: 0, unitComplete: { unitId: 'unit-aaa' }, nextGoal: { kind: 'level', remaining: null, label: null } }
  const bigHtml1 = renderToStaticMarkup(React.createElement(SessionRewardCard, { summary: bigSummary1, onDismiss: () => {} }))
  check('unitComplete가 있으면 "유닛 완료" 헤딩 렌더', bigHtml1.includes('유닛 완료'))
  check('big 변형에도 별 줄은 그대로 렌더', bigHtml1.includes('+5 ⭐'))

  const bigHtml1Again = renderToStaticMarkup(React.createElement(SessionRewardCard, { summary: bigSummary1, onDismiss: () => {} }))
  check('같은 unitId → 코스메틱 이모지 줄이 항상 동일(결정적, 랜덤 아님)', bigHtml1 === bigHtml1Again)

  const bigSummary2 = { ...bigSummary1, unitComplete: { unitId: 'unit-bbb-completely-different' } }
  const bigHtml2 = renderToStaticMarkup(React.createElement(SessionRewardCard, { summary: bigSummary2, onDismiss: () => {} }))
  check('unitId가 다르면 카드 전체 HTML도 다를 수 있음(코스메틱이 unitId에 의존)', typeof bigHtml2 === 'string' && bigHtml2.includes('유닛 완료'))

  const normalSummary = { stars: 1, xp: 0, gardenGrowth: 0, streak: 0, unitComplete: null, nextGoal: { kind: 'level', remaining: null, label: null } }
  const normalHtml = renderToStaticMarkup(React.createElement(SessionRewardCard, { summary: normalSummary, onDismiss: () => {} }))
  check('unitComplete가 null이면 "유닛 완료" 헤딩 없음(일반 변형 그대로)', !normalHtml.includes('유닛 완료'))
}

// ── 3) 배선 정적 검사 — 플래그 기본 OFF + 기존 지급 가드 재사용 + App 마운트 ──
console.log('\n3. 배선 정적 검사(features.js / useStudent.js / App.jsx)')
const readSrc = (p) => { try { return fs.readFileSync(path.resolve(p), 'utf8') } catch { return '' } }

const featuresSrc = readSrc('src/config/features.js')
check('features.js에 sessionRewardSummary: false 기본값 존재', /sessionRewardSummary:\s*false/.test(featuresSrc))

const useStudentSrc = readSrc('src/hooks/useStudent.js')
check('useStudent.js가 isFeatureEnabled를 import', /isFeatureEnabled/.test(useStudentSrc) && /from ['"]\.\.\/config\/features['"]/.test(useStudentSrc))
check('useStudent.js가 sessionRewardSummary 상태를 노출', /sessionRewardSummary/.test(useStudentSrc) && /dismissSessionRewardSummary/.test(useStudentSrc))
// 레이어 계약(2026-09-03 P1 회귀 수정, scripts/testGardenGrowthFlow.mjs
// 10번 시나리오와 동일 단언) — useStudent.js는 attachment/* 어떤 모듈도
// import하지 않고, worldProgress 문자열을 전혀(주석 포함) 담지 않는다.
// 정원 "단계" 변환은 SessionRewardCard.jsx(컴포넌트 레이어)가 전담한다.
check('useStudent.js가 attachment/* 모듈을 import하지 않음(레이어 계약)', !/from\s+['"][^'"]*attachment[^'"]*['"]/.test(useStudentSrc))
check('useStudent.js에 worldProgress 문자열이 없음(레이어 계약)', !/worldProgress/.test(useStudentSrc))
{
  // 기존 grantLedgerReward의 조기반환(hasRewardEntry(rewardLedger, key)) return false)
  // "이후"에만 요약 생성 코드가 오는지 — 새 dedup을 만들지 않고 기존
  // 지급 가드를 그대로 재사용한다는 설계의 소스 레벨 증거.
  const fnStart = useStudentSrc.indexOf('const grantLedgerReward = useCallback(')
  const guardIdx = useStudentSrc.indexOf('if (hasRewardEntry(rewardLedger, key)) return false', fnStart)
  const summaryIdx = useStudentSrc.indexOf('setSessionRewardSummary', fnStart)
  check('grantLedgerReward 안에 기존 hasRewardEntry 조기반환이 존재', fnStart >= 0 && guardIdx > fnStart)
  check('요약 생성(setSessionRewardSummary)이 그 조기반환보다 소스상 뒤에 위치(=재사용, 새 dedup 아님)', summaryIdx > guardIdx && guardIdx > 0)
}

const appSrc = readSrc('src/App.jsx')
check('App.jsx가 SessionRewardCard를 import', /SessionRewardCard/.test(appSrc))
check('App.jsx가 sessionRewardSummary 상태로 카드를 조건부 마운트', /sessionRewardSummary/.test(appSrc) && /SessionRewardCard/.test(appSrc))

// ── 4) 재지급 방지 오케스트레이션 시뮬레이션(실제 export 그대로 이어붙임) ──
console.log('\n4. 두 번째 호출은 grantReward/grantXp를 부르지 않음(실제 rewardEngine.js 함수 사용)')
{
  let ledger = []
  let grantRewardCalls = 0
  let grantXpCalls = 0
  let summaryBuiltCount = 0

  // grantLedgerReward가 하는 것과 정확히 같은 순서의 glue(로직 자체는
  // hasRewardEntry/appendRewardEntry/buildRewardEntry 전부 실제 소스).
  const simulateGrantLedgerReward = (rewardType, sourceType, sourceId, studentId, starsDelta) => {
    const key = `${studentId}:${rewardType}:${sourceType}:${sourceId}`
    if (hasRewardEntry(ledger, key)) return false
    const entry = buildRewardEntry({ studentId, rewardType, sourceType, sourceId, starsDelta, at: '2026-09-03T00:00:00.000Z' })
    ledger = appendRewardEntry(ledger, entry)
    grantRewardCalls += 1
    grantXpCalls += 1
    if (buildSessionRewardSummary) {
      buildSessionRewardSummary({ entries: [entry], xpEvents: [2], gardenBefore: 0, gardenAfter: 1, streak: 1, totalStars: starsDelta })
      summaryBuiltCount += 1
    }
    return true
  }

  const first = simulateGrantLedgerReward('word-session-complete', 'daily-words', 'Wed Sep 03 2026', 'student-1', 1)
  const second = simulateGrantLedgerReward('word-session-complete', 'daily-words', 'Wed Sep 03 2026', 'student-1', 1)
  check('첫 호출은 지급됨(true)', first === true)
  check('같은 키 두 번째 호출은 거부(false)', second === false)
  check('grantReward는 정확히 1회만 불림', grantRewardCalls === 1)
  check('grantXp는 정확히 1회만 불림', grantXpCalls === 1)
  check('요약도 정확히 1회만 만들어짐(같은 카드가 두 번 뜨지 않음)', summaryBuiltCount === 1)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
