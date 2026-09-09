// refreshClassSettings() 회복력 회귀 테스트 (2026-09-09, 야간 QA)
//
// 확인된 문제(수정 전): classes 조회가 3단계로 컬럼을 줄여가며 재시도하는데,
// 이 재시도가 "컬럼 부재(42703)"뿐 아니라 어떤 에러에도 무조건 발동했고,
// 최종 실패 시 바깥 catch가 항상 `_classSettings = {}`로 초기화했다. 그
// 결과, 일시적 네트워크/RLS 에러 한 번이 모든 반의 스펠링시험/힌트/방향
// 설정을 앱 전역에서 기본값으로 조용히 되돌려 놓는다(다음 성공 조회 전까지).
//
// 수정 후 계약:
//   (a) 42703(undefined column)만 다음 폴백 단계로 캐스케이드한다
//       (getStudentClassAssignments의 42703 게이팅과 동일 관례).
//   (b) 42703이 아닌 에러는 그 자리에서 멈춘다(추가 재시도 없음) — 최종
//       실패 시 이전에 성공적으로 채워진 캐시가 있으면 그대로 유지하고
//       (전부 꺼짐으로 리셋하지 않음) 경고만 남긴다.
//   (c) 최초 로드(이전 캐시가 아예 없음)에서 실패하면 기존처럼 안전한
//       기본값(빈 캐시, getClassSettings가 DEFAULT_CLASS_SETTINGS 반환)으로
//       떨어진다 — 크래시 없음.
//
// 검증 방법: scripts/fakeSupabaseModule.mjs + buildWordLibOfflineBundle.mjs
// 오프라인 번들(네트워크 0, testWritingDirectionResolution.mjs와 동일 관례).
// 이 스텁은 execute()가 항상 error:null을 반환해 에러를 스스로 만들 수
// 없으므로(스텁 헤더 주석 참고), 이 테스트 파일 안에서만 `stub.supabase.from`
// 을 일시적으로 감싸 'classes' 테이블 호출에 한해 에러를 스크립트한다
// (fakeSupabaseModule.mjs 자체는 수정하지 않음 — 이 감싸기는 매 케이스가
// 끝나면 즉시 원복하고, 다른 어떤 테스트도 이 파일을 동시에 import하지
// 않으므로 사이드이펙트가 새지 않는다).
//
// 실행: node scripts/buildWordLibOfflineBundle.mjs && node scripts/testClassSettingsResilience.mjs
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}

const CLASS_X = 'ClassX'
const baseDataset = () => ({
  classes: [{
    id: 'cls-x', name: CLASS_X, class_type: 'regular', created_at: '2026-01-01T00:00:00Z',
    spelling_test_enabled: true, spelling_hint_enabled: true, wrong_answer_repeat_count: 5,
    spelling_direction: 'en2kr', gamification_enabled: true,
  }],
  units: [], words: [], daily_assignments: [], textbooks: [], class_textbooks: [],
  students: [], student_class_assignments: [],
})

// 'classes' 테이블에 대한 호출만 스크립트된 에러/실제 데이터로 가로챈다.
// queue의 각 항목이 순서대로 소비된다 — 항목이 에러 객체면 그 에러를
// {data:null, error} 로 즉시 resolve하고, null이면 원래 스텁(실제 데이터)
// 으로 통과시킨다. queue가 소진된 뒤의 호출은 항상 원래 스텁으로 통과.
function scriptClassesErrors(queue) {
  const q = [...queue]
  let callCount = 0
  const originalFrom = stub.supabase.from
  stub.supabase.from = (table) => {
    if (table !== 'classes') return originalFrom(table)
    callCount++
    if (q.length > 0) {
      const next = q.shift()
      if (next) {
        const chain = {
          select() { return chain },
          eq() { return chain },
          order() { return chain },
          in() { return chain },
          limit() { return chain },
          range() { return chain },
          then(resolve, reject) { return Promise.resolve({ data: null, error: next }).then(resolve, reject) },
        }
        return chain
      }
    }
    return originalFrom(table)
  }
  return {
    restore() { stub.supabase.from = originalFrom },
    getCallCount() { return callCount },
  }
}

async function withCapturedWarnings(fn) {
  const captured = []
  const original = console.warn
  console.warn = (...args) => { captured.push(args.map((a) => (a && a.message) || String(a)).join(' ')) }
  try { await fn() } finally { console.warn = original }
  return captured
}

console.log('\n(a) 첫 select 42703(gamification_enabled 미존재) → 42703 게이팅으로 2차 select 캐스케이드 → 설정 정상 반영(기존 동작 유지)')
{
  const lib = await import(pathToFileURL(BUNDLE).href + '?a=' + Date.now())
  stub.__setDataset(baseDataset())
  const { restore, getCallCount } = scriptClassesErrors([
    { code: '42703', message: 'column "gamification_enabled" does not exist' },
    null,
  ])
  await lib.refreshClassSettings()
  restore()
  const settings = lib.getClassSettings(CLASS_X)
  check('42703 캐스케이드 후 2차 select 성공 → 설정 정상 반영',
    settings.spellingTestEnabled === true && settings.spellingHintEnabled === true &&
    settings.wrongAnswerRepeatCount === 5 && settings.spellingDirection === 'en2kr' &&
    settings.gamificationEnabled === true, settings)
  check('42703 캐스케이드는 정확히 2회 조회(1차 실패 + 2차 성공)', getCallCount() === 2, getCallCount())
}

console.log('\n(b) 이미 성공 로드된 상태에서 non-42703 에러(예: PGRST301) → 캐스케이드 없이 이전 캐시 유지')
{
  const lib = await import(pathToFileURL(BUNDLE).href + '?b=' + Date.now())
  stub.__setDataset(baseDataset())
  await lib.refreshClassSettings() // 사전 정상 로드
  const before = lib.getClassSettings(CLASS_X)
  check('사전조건 — 정상 로드 확인(en2kr/true)',
    before.spellingDirection === 'en2kr' && before.gamificationEnabled === true, before)

  const errObj = { code: 'PGRST301', message: 'transient network error' }
  const { restore, getCallCount } = scriptClassesErrors([errObj, errObj, errObj])
  const warnings = await withCapturedWarnings(() => lib.refreshClassSettings())
  restore()

  const after = lib.getClassSettings(CLASS_X)
  check('non-42703 에러 시 캐스케이드 없이 정확히 1회만 조회(추가 재시도 없음)', getCallCount() === 1, getCallCount())
  check('이전 설정이 그대로 유지됨(전부 꺼짐으로 리셋되지 않음)',
    after.spellingDirection === 'en2kr' && after.gamificationEnabled === true &&
    after.spellingTestEnabled === true, after)
  check('경고 메시지가 "이전 설정을 유지"함을 알림(운영자가 원인 파악 가능)',
    warnings.some((m) => /이전.*유지|유지.*이전/.test(m)), warnings)
}

console.log('\n(c) 최초 로드(이전 캐시 없음)에서부터 non-42703 에러 → 안전한 기본값 폴백, 크래시 없음')
{
  const lib = await import(pathToFileURL(BUNDLE).href + '?c=' + Date.now())
  stub.__setDataset(baseDataset())
  const errObj = { code: 'PGRST301', message: 'transient network error' }
  const { restore, getCallCount } = scriptClassesErrors([errObj, errObj, errObj])
  let threw = false
  await withCapturedWarnings(async () => {
    try { await lib.refreshClassSettings() } catch { threw = true }
  })
  restore()
  check('예외를 던지지 않음(크래시 없음)', threw === false)
  check('최초 실패도 캐스케이드 없이 정확히 1회만 조회', getCallCount() === 1, getCallCount())
  const settings = lib.getClassSettings(CLASS_X)
  check('최초 실패 → 안전한 기본값 반환(spellingTestEnabled=false/spellingDirection=kr2en/wrongAnswerRepeatCount=3/gamificationEnabled=false)',
    settings.spellingTestEnabled === false && settings.spellingHintEnabled === false &&
    settings.wrongAnswerRepeatCount === 3 && settings.spellingDirection === 'kr2en' &&
    settings.gamificationEnabled === false, settings)
}

console.log(failures === 0
  ? '\n모든 단언 통과 — refreshClassSettings 회복력 회귀 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
