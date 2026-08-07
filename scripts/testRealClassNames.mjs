// 교과서 컨테이너 반 노출 차단 — classifyRealClassNames 순수 함수 회귀 테스트
// (2026-08-08). src/utils/wordLibrary.js의 classifyRealClassNames 헤더
// 주석 참고 — v3_19 SQL 실행 전(class_type='textbook' 값 0개)은 이름
// allowlist로 폴백(오늘 StudentSelect.jsx 동작과 100% 동일), 실행 후는
// class_type 구조 판별(이름 개명/신설에 안전) + QA_ 접두사 필터.
//
// 순수 함수(네트워크 0) — WORDLIB_BUNDLE만 필요한 이유는 이 함수가 사는
// src/utils/wordLibrary.js 모듈이 최상단에서 supabaseClient.js를 import해
// import.meta.env를 참조하기 때문(plain Node가 바로 못 읽음) — 다른 wordlib
// 빌더 테스트와 동일한 관례. initWordLibrary()는 호출하지 않는다(라이브
// Supabase 접촉 0건 — 이 파일이 검증하는 건 순수 함수 로직뿐).
import { pathToFileURL } from 'node:url'

const BUNDLE = process.env.WORDLIB_BUNDLE
if (!BUNDLE) throw new Error('Set WORDLIB_BUNDLE to the esbuild output path')

const { classifyRealClassNames } = await import(pathToFileURL(BUNDLE).href)

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

const FALLBACK = ['MS Advanced Class', 'Presentation 6', 'Pre-Middle School']

// 현재 실DB 13개 반 스냅샷(2026-08-07/08 라이브 실측) — 마이그레이션 전
// (class_type 컬럼이 전부 regular/special만 갖고 있어 'textbook' 값이 0개)
// 시나리오. Pre-Middle School은 이 시점 실DB에 아직 없었다(이름만
// allowlist에 먼저 등록됨) — 그 경우도 함께 검증(목록에 없으면 결과에도
// 당연히 없어야 함).
const beforeMigrationEntries = [
  { name: 'MS Advanced Class', classType: 'regular' },
  { name: 'Presentation 6', classType: 'regular' },
  { name: 'Presentation 6 -2026', classType: 'regular' },
  { name: '중2 능률 김기택', classType: 'regular' },
  { name: '중2 YMB 박준원', classType: 'regular' },
  { name: '중2 천재 이상기', classType: 'regular' },
  { name: '중2 동아 윤정미', classType: 'regular' },
  { name: '중1 동아 윤정미', classType: 'regular' },
  { name: 'QA_ComboFixT', classType: 'regular' },
  { name: 'QA_PinAuthTest', classType: 'regular' },
  { name: 'QA_SelectPinStatusTest', classType: 'regular' },
  { name: 'QA_SelfSetupTest', classType: 'regular' },
  { name: 'QA_SelfSetupTest2', classType: 'regular' },
]

console.log('\n1. 마이그레이션 전(class_type에 textbook 값 0개) — 이름 allowlist 폴백')
{
  const result = classifyRealClassNames(beforeMigrationEntries, FALLBACK)
  check('MS Advanced Class/Presentation 6만 반환(정확히 2개, 순서 무관)',
    result.length === 2 && result.includes('MS Advanced Class') && result.includes('Presentation 6'))
  check('교과서 컨테이너 6개는 미포함', !result.some((n) => n.includes('능률 김기택') || n.includes('YMB 박준원') || n.includes('천재 이상기') || n.includes('동아 윤정미')))
  check('Presentation 6 -2026(유사 이름, allowlist 밖)은 미포함', !result.includes('Presentation 6 -2026'))
  check('QA_ 5개는 allowlist에 원래 없어서 미포함', !result.some((n) => n.startsWith('QA_')))
}

// v3_19 SQL 실행 후 시나리오 — 6개 컨테이너에 class_type='textbook'.
const afterMigrationEntries = [
  { name: 'MS Advanced Class', classType: 'regular' },
  { name: 'Presentation 6', classType: 'regular' },
  { name: '중2 능률 김기택', classType: 'textbook' },
  { name: '중2 YMB 박준원', classType: 'textbook' },
  { name: 'Presentation 6 -2026', classType: 'textbook' },
  { name: '중2 천재 이상기', classType: 'textbook' },
  { name: '중2 동아 윤정미', classType: 'textbook' },
  { name: '중1 동아 윤정미', classType: 'textbook' },
  { name: 'QA_ComboFixT', classType: 'regular' },
  { name: 'QA_PinAuthTest', classType: 'regular' },
  { name: 'QA_SelectPinStatusTest', classType: 'regular' },
  { name: 'QA_SelfSetupTest', classType: 'regular' },
  { name: 'QA_SelfSetupTest2', classType: 'regular' },
]

console.log('\n2. 마이그레이션 후(6개 textbook) — 전/후 결과 동일성(핵심 단언)')
{
  const before = classifyRealClassNames(beforeMigrationEntries, FALLBACK)
  const after = classifyRealClassNames(afterMigrationEntries, FALLBACK)
  check('마이그레이션 전/후 정확히 동일한 실반 목록(순서 무시 비교)',
    JSON.stringify([...before].sort()) === JSON.stringify([...after].sort()))
  check('MS Advanced Class/Presentation 6만 반환', after.length === 2 && after.includes('MS Advanced Class') && after.includes('Presentation 6'))
  check('QA_ 5개는 구조 모드에서도 명시적으로 제외됨(접두사 필터)', !after.some((n) => n.startsWith('QA_')))
  check('textbook 6개(Presentation 6 -2026 포함) 전부 제외', !after.some((n) => n.includes('능률 김기택') || n.includes('YMB 박준원') || n === 'Presentation 6 -2026' || n.includes('천재 이상기') || n.includes('동아 윤정미')))
}

console.log('\n3. 마이그레이션 후 신설 실반(Pre-Middle School, regular) 자동 포함')
{
  const withNewRealClass = [
    ...afterMigrationEntries,
    { name: 'Pre-Middle School', classType: 'regular' },
  ]
  const result = classifyRealClassNames(withNewRealClass, FALLBACK)
  check('신설 실반(Pre-Middle School)이 이름 allowlist 갱신 없이 자동으로 포함됨', result.includes('Pre-Middle School'))
  check('총 3개(MS Advanced Class/Presentation 6/Pre-Middle School)', result.length === 3)
}

console.log('\n4. 마이그레이션 후 신규 컨테이너(textbook) 제외')
{
  const withNewContainer = [
    ...afterMigrationEntries,
    { name: '고2 새 교재 컨테이너', classType: 'textbook' },
  ]
  const result = classifyRealClassNames(withNewContainer, FALLBACK)
  check('신규 textbook 컨테이너는 이름 allowlist와 무관하게 제외됨', !result.includes('고2 새 교재 컨테이너'))
  check('여전히 정확히 2개(MS Advanced Class/Presentation 6)', result.length === 2)
}

console.log('\n5. 빈 entries')
{
  check('빈 entries -> 빈 배열(마이그레이션 전 폴백 경로)', Array.isArray(classifyRealClassNames([], FALLBACK)) && classifyRealClassNames([], FALLBACK).length === 0)
  check('빈 entries -> 빈 배열(구조 모드 판별도 크래시 없음)', Array.isArray(classifyRealClassNames(undefined, FALLBACK)) && classifyRealClassNames(undefined, FALLBACK).length === 0)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
