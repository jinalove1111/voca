// tests/e2e/lib/harness.mjs — 브라우저 E2E 전용 초경량 단언 카운터.
// 기존 scripts/test*.mjs 관례(check(name, cond) → PASS/FAIL 로그 +
// "총 N단언 — PASS n / FAIL m / SKIP k" 요약)를 그대로 따른다. 새 테스트
// 프레임워크가 아니라 그 관례를 Playwright 위에서 재사용하는 얇은 헬퍼.
export function createRecorder(prefix) {
  const results = []
  const check = (name, cond, detail = '') => {
    const ok = !!cond
    results.push({ name: `${prefix} ${name}`, status: ok ? 'PASS' : 'FAIL', detail })
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${prefix} ${name}${!ok && detail ? '  ' + detail : ''}`)
  }
  const skip = (name, reason) => {
    results.push({ name: `${prefix} ${name}`, status: 'SKIP', detail: reason })
    console.log(`  SKIP  ${prefix} ${name}  ${reason}`)
  }
  return { results, check, skip }
}

export function summarize(allResults) {
  const pass = allResults.filter((r) => r.status === 'PASS').length
  const fail = allResults.filter((r) => r.status === 'FAIL').length
  const skip = allResults.filter((r) => r.status === 'SKIP').length
  console.log(`\n${'='.repeat(60)}`)
  console.log(`총 ${allResults.length}단언 — PASS ${pass} / FAIL ${fail} / SKIP ${skip}`)
  if (fail > 0) {
    console.log('\n실패 목록:')
    for (const r of allResults.filter((r) => r.status === 'FAIL')) console.log(`  - ${r.name}${r.detail ? '  ' + r.detail : ''}`)
  }
  return { pass, fail, skip, ok: fail === 0 }
}
