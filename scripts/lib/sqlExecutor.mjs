// Production Safety Harness — SQL 실행기 어댑터 (2026-09-03, Phase 1-B)
//
// ★ 이번 단계 실호출 금지 ★ Management API 실행기는 코드로만 존재하고
// 어떤 테스트/CLI 경로에서도 실제로 호출되지 않는다(토큰도 이 저장소에는
// 없다 — .env/.env.local 에 SUPABASE_ACCESS_TOKEN 없음). scripts/prodHotfix.mjs
// 는 사람이 대화형으로 `APPLY <runId>` 를 정확히 입력해야만 executor.run()
// 을 호출하고, dry-run/CI/토큰 부재 시엔 항상 createDryRunExecutor 를 써서
// 어느 경로로도 쓰기가 나갈 수 없게 한다.
/**
 * Supabase Management API 실행기(HTTP POST /database/query, service 토큰).
 * 이번 Phase 에서는 어디서도 실제로 run() 이 호출되지 않는다.
 * @param {{projectRef:string, accessToken:string, fetchImpl?:Function}} opts
 */
export function createManagementApiExecutor({ projectRef, accessToken, fetchImpl = fetch } = {}) {
  return {
    kind: 'management-api',
    async run(sql) {
      if (!projectRef || !accessToken) {
        return { ok: false, error: 'management-api executor: projectRef/accessToken 누락' }
      }
      try {
        const res = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ query: sql }),
        })
        let body = null
        try { body = await res.json() } catch { /* 응답이 JSON 이 아닐 수 있음 */ }
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}: ${body?.message || body?.error || '알 수 없는 오류'}` }
        }
        return { ok: true, rows: body }
      } catch (err) {
        return { ok: false, error: err?.message || String(err) }
      }
    },
  }
}

/**
 * 테스트 전용 가짜 실행기 — 호출된 SQL 을 그대로 기록하고, onRun(sql, callIndex)
 * 이 있으면 그 결과를 그대로 돌려준다(throw 하면 실패로 취급됨).
 * @param {{onRun?: (sql:string, callIndex:number) => ({ok:boolean, rows?:any, error?:string} | void)}} opts
 */
export function createFakeExecutor({ onRun } = {}) {
  const calls = []
  return {
    kind: 'fake',
    calls,
    async run(sql) {
      calls.push(sql)
      if (typeof onRun === 'function') {
        const res = await onRun(sql, calls.length)
        if (res) return res
      }
      return { ok: true, rows: [] }
    },
  }
}

/**
 * dry-run 전용 실행기 — run() 을 호출하면 항상 throw 한다. 실수로 이
 * 실행기를 통해 쓰기가 나가면 즉시 에러로 드러나게 하려는 의도적 설계다.
 */
export function createDryRunExecutor() {
  return {
    kind: 'dry-run',
    async run() {
      throw new Error('dry-run: write path disabled')
    },
  }
}
