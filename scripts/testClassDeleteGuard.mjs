// 2026-09-03 — Track 5(야간 자율 작업) 문제 2. supabase/functions/
// admin-content-write/index.ts의 class.delete 액션에 "데이터 있으면 차단"
// 가드가 없던 문제(classes DELETE가 units→words→word_status/
// spelling_review_queue, entrance_tests→entrance_test_results,
// student_class_assignments를 CASCADE로 연쇄 삭제하는데 방어 장치가
// 0이었음) 전용 회귀 테스트.
//
// 이 Edge Function은 Deno 런타임 전용(Deno.serve/Deno.env/`npm:` import)
// 이라 실제 요청 dispatch까지 Node에서 번들 실행하기 어렵다 — 그래서 이
// 테스트는 두 겹으로 검증한다:
//   (a) 순수 계산부(decideClassDelete) — DB/네트워크 의존 0인 판정 함수만
//       esbuild로 별도 번들해 Node에서 직접 단위 테스트한다. 모듈 최상위의
//       `Deno.serve(...)` 호출은 import 시점에 실행되므로, import 전에
//       globalThis.Deno를 무해한 스텁으로 채워 부작용 없이 통과시킨다
//       (index.ts의 실제 Deno Edge Function 런타임 동작은 전혀 바뀌지 않음
//       — 이 파일은 프로덕션 코드를 전혀 수정하지 않는 테스트 하네스다).
//   (b) 소스 정적 단언 — handleClassDelete 함수 본문 텍스트에 word_status/
//       entrance_test_results/student_class_assignments 카운트 조회와
//       has_learning_data/force 분기가 실제로 존재하고, 실제 삭제
//       (`.delete()`) 호출이 그 분기보다 뒤에만 있는지 문자열 인덱스로
//       비교한다.
//
// 이 파일은 라이브 네트워크를 전혀 쓰지 않는다(scripts/testEdgeFunctionsE2E.mjs
// 는 라이브라 실행하지 않음 — 별도 파일, 이 테스트와 무관).
//
// 규칙 15(FAIL-first) — 가드 구현 전 코드에서 실행하면 (a) decideClassDelete가
// export되지 않아 실패하고, (b) handleClassDelete 본문에 위 문자열들이 전혀
// 없어 정적 단언도 실패한다(실제로 git stash로 재현·확정).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

let failures = 0, asserted = 0
function check(label, cond, detail) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++ }
}

const SRC_PATH = path.resolve('supabase/functions/admin-content-write/index.ts')

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== (a) decideClassDelete 순수 함수 단위 테스트 ===')
{
  const TMP = path.resolve('scripts/.tmp')
  fs.mkdirSync(TMP, { recursive: true })

  // `npm:@supabase/supabase-js@2` 특수 스킴 import를 아무 부작용 없는
  // 가짜 모듈로 리다이렉트한다 — decideClassDelete는 이 모듈을 전혀 쓰지
  // 않지만, 같은 파일에 있는 createClient import 자체는 번들 시점에
  // 해석돼야 한다.
  const fakeSupabasePath = path.join(TMP, 'fakeSupabaseJsForClassDeleteGuard.mjs')
  fs.writeFileSync(fakeSupabasePath, `export function createClient() { return {} }\n`, 'utf8')
  const fakeSupabaseUrl = pathToFileURL(fakeSupabasePath).href

  const outfile = path.join(TMP, 'adminContentWrite.classDeleteGuard.bundle.mjs')
  let buildOk = true
  try {
    await esbuild.build({
      entryPoints: [SRC_PATH], bundle: true, format: 'esm', platform: 'node', outfile,
      plugins: [{
        name: 'fake-npm-supabase',
        setup(b) {
          b.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({ path: fakeSupabaseUrl, external: true }))
        },
      }],
    })
  } catch (e) {
    buildOk = false
    console.log(`  FAIL  esbuild 번들 실패 — ${e?.message || e}`)
    failures++
    asserted++
  }

  let decideClassDelete = null
  if (buildOk) {
    // 모듈 최상위의 Deno.serve(...) 호출을 무해하게 흡수 — 콜백을 저장만
    // 하고 절대 실행하지 않는다(실제 요청을 시뮬레이션하지 않음, 이
    // 섹션은 순수 함수 decideClassDelete만 검증 대상).
    globalThis.Deno = {
      env: { get: () => undefined },
      serve: () => {},
    }
    try {
      const mod = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
      decideClassDelete = mod.decideClassDelete
    } catch (e) {
      console.log(`  FAIL  번들 import 실패 — ${e?.message || e}`)
      failures++
      asserted++
    }
  }

  check('decideClassDelete가 함수로 export됨', typeof decideClassDelete === 'function')

  if (typeof decideClassDelete === 'function') {
    const allZero = decideClassDelete({ counts: { word_status: 0, entrance_test_results: 0, student_class_assignments: 0, spelling_review_queue: 0 }, force: false })
    check('전부 0 + force 없음 → 허용', allZero.allowed === true && allZero.total === 0, JSON.stringify(allZero))

    const oneNonZero = decideClassDelete({ counts: { word_status: 3, entrance_test_results: 0, student_class_assignments: 0, spelling_review_queue: 0 }, force: false })
    check('하나라도 >0 + force 없음 → 거부', oneNonZero.allowed === false && oneNonZero.total === 3, JSON.stringify(oneNonZero))

    const forced = decideClassDelete({ counts: { word_status: 3, entrance_test_results: 2, student_class_assignments: 0, spelling_review_queue: 0 }, force: true })
    check('데이터 있어도 force===true → 허용(총합 보고)', forced.allowed === true && forced.total === 5, JSON.stringify(forced))

    const truthyNotTrue = decideClassDelete({ counts: { word_status: 1 }, force: 1 })
    check('force가 true가 아닌 truthy값(1)이면 여전히 거부(엄격 === true)', truthyNotTrue.allowed === false, JSON.stringify(truthyNotTrue))

    const emptyCounts = decideClassDelete({ counts: {} })
    check('counts 빈 객체 + force 미지정 → 허용(총합 0)', emptyCounts.allowed === true && emptyCounts.total === 0, JSON.stringify(emptyCounts))
  }
}

// ════════════════════════════════════════════════════════════════════════
console.log('\n=== (b) 소스 정적 단언 — handleClassDelete 본문 ===')
{
  const src = fs.readFileSync(SRC_PATH, 'utf8')

  function extractFunctionBody(source, fnName) {
    const marker = `async function ${fnName}`
    const start = source.indexOf(marker)
    if (start === -1) return null
    const braceStart = source.indexOf('{', start)
    if (braceStart === -1) return null
    let depth = 0
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) return source.slice(start, i + 1)
      }
    }
    return null
  }

  const body = extractFunctionBody(src, 'handleClassDelete')
  check('handleClassDelete 함수를 소스에서 추출 성공', typeof body === 'string' && body.length > 0)

  if (typeof body === 'string') {
    check("본문에 'word_status' 카운트 조회 존재", body.includes('word_status'), body.slice(0, 200))
    check("본문에 'entrance_test_results' 카운트 조회 존재", body.includes('entrance_test_results'))
    check("본문에 'student_class_assignments' 카운트 조회 존재", body.includes('student_class_assignments'))
    check("본문에 'has_learning_data' 분기 존재", body.includes('has_learning_data'))
    check("본문에 'force' 플래그 처리 존재", body.includes('force'))

    const deleteIdx = body.indexOf('.delete()')
    const guardIdx = body.indexOf('has_learning_data')
    check('.delete() 호출이 존재함', deleteIdx !== -1, body)
    check('has_learning_data 분기가 소스에 존재함', guardIdx !== -1, body)
    check('.delete() 호출이 has_learning_data 분기보다 뒤에만 있음(가드 우회 없음)',
      deleteIdx !== -1 && guardIdx !== -1 && deleteIdx > guardIdx,
      `deleteIdx=${deleteIdx} guardIdx=${guardIdx}`)

    // 방어적 — 본문 안에 .delete()가 정확히 1번만 있어야 한다(카운트 조회
    // 단계는 전부 select뿐이어야 함 — 조회 중간에 실수로 삭제가 섞여
    // 들어가는 회귀를 잡는다).
    const deleteCount = (body.match(/\.delete\(\)/g) || []).length
    check('.delete() 호출이 정확히 1번(카운트 단계는 순수 조회만)', deleteCount === 1, String(deleteCount))
  }

  // catch 블록이 classDeleteBlocked 마커를 처리하는지도 확인 — 이게 없으면
  // 가드가 던진 에러가 그냥 500 error로 떨어져 { ok:false, reason:'has_learning_data', counts }
  // 계약이 깨진다.
  check("공용 catch 블록이 classDeleteBlocked 마커를 처리함", src.includes('classDeleteBlocked'))
  check("공용 catch 블록이 has_learning_data reason으로 응답함", /reason:\s*'has_learning_data'/.test(src))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS')
process.exit(0)
