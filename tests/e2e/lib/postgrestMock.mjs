// tests/e2e/lib/postgrestMock.mjs
//
// 소형 PostgREST 에뮬레이터 — 브라우저 E2E 테스트가 실제 Supabase에 요청을
// 보내지 않고도, 앱이 실제로 만드는 PostgREST 쿼리(select/eq/in/is/order/
// limit)를 인메모리 fixture 테이블에 대해 그대로 해석해 응답한다.
//
// 설계 원칙(CLAUDE.md 규칙 6 — 외부 의존성 최소화와 동일한 정신):
// 새 쿼리 빌더/ORM을 만들지 않는다. supabase-js가 실제로 HTTP로 보내는
// URL(`/rest/v1/<table>?select=...&col=eq.val&order=...&limit=...`)과 헤더
// (`Prefer`, `Accept`)만 파싱해서 흉내낸다. 지원하지 않는 연산자를 만나면
// 조용히 무시하지 않고 즉시 throw한다 — "이 쿼리는 검증 못 함"이 가짜 PASS로
// 둔갑하지 않게 하기 위함(운영 verify 하네스들의 fail-closed 원칙과 동일).
//
// 네트워크 0 / 실제 DB 접촉 0 — 이 파일은 Node 프로세스 안에서만 동작하고,
// Playwright page.route() 핸들러가 이 함수들을 호출해 응답을 만든다.

function parseFilterValue(raw) {
  // raw 형태: "eq.foo" | "in.(a,b,c)" | "is.null" | "neq.foo"
  const dot = raw.indexOf('.')
  if (dot === -1) throw new Error(`postgrestMock: 연산자 없는 필터 값 "${raw}"`)
  const op = raw.slice(0, dot)
  const val = raw.slice(dot + 1)
  const SUPPORTED = new Set(['eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte'])
  if (!SUPPORTED.has(op)) {
    throw new Error(`postgrestMock: 미지원 연산자 "${op}" (값: ${raw})`)
  }
  if (op === 'in') {
    if (!val.startsWith('(') || !val.endsWith(')')) {
      throw new Error(`postgrestMock: in. 값은 (a,b,c) 형태여야 함 — "${raw}"`)
    }
    const items = val.slice(1, -1).split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    return { op, val: items }
  }
  if (op === 'is') {
    if (val !== 'null' && val !== 'true' && val !== 'false') {
      throw new Error(`postgrestMock: 미지원 is. 값 "${val}"`)
    }
    return { op, val: val === 'null' ? null : val === 'true' }
  }
  return { op, val }
}

function coerce(rowVal, filterVal) {
  // PostgREST 쿼리 문자열 값과 fixture 안의 실제 타입(boolean/number/null)을
  // 비교할 때 문자열 "true"/"3" 등을 원래 타입으로 맞춰준다.
  if (typeof rowVal === 'boolean') return filterVal === 'true' ? true : filterVal === 'false' ? false : filterVal
  if (typeof rowVal === 'number') return Number.isNaN(Number(filterVal)) ? filterVal : Number(filterVal)
  return filterVal
}

function matchesFilter(row, col, { op, val }) {
  const rowVal = row[col]
  switch (op) {
    case 'eq': return rowVal === coerce(rowVal, val)
    case 'neq': return rowVal !== coerce(rowVal, val)
    case 'in': return val.map((v) => coerce(rowVal, v)).includes(rowVal)
    case 'is': return rowVal === val
    case 'gt': return rowVal > coerce(rowVal, val)
    case 'gte': return rowVal >= coerce(rowVal, val)
    case 'lt': return rowVal < coerce(rowVal, val)
    case 'lte': return rowVal <= coerce(rowVal, val)
    default: throw new Error(`postgrestMock: matchesFilter 미지원 연산자 "${op}"`)
  }
}

function applyOrder(rows, orderParam) {
  if (!orderParam) return rows
  // "col.asc,col2.desc" 또는 "col.asc.nullslast" 형태 — nulls 옵션은 무시.
  const specs = orderParam.split(',').map((s) => {
    const [col, dir] = s.split('.')
    return { col, desc: dir === 'desc' }
  })
  return rows.slice().sort((a, b) => {
    for (const { col, desc } of specs) {
      const av = a[col]
      const bv = b[col]
      if (av === bv) continue
      const cmp = av === null || av === undefined ? -1 : bv === null || bv === undefined ? 1 : av > bv ? 1 : -1
      return desc ? -cmp : cmp
    }
    return 0
  })
}

function projectSelect(row, selectParam) {
  if (!selectParam || selectParam === '*') return { ...row }
  const cols = selectParam.split(',').map((c) => c.trim()).filter(Boolean)
  const out = {}
  for (const c of cols) {
    // "classes(name)" 같은 임베디드 관계 select는 이 소형 에뮬레이터의
    // 지원 범위 밖 — 호출부(createDb)가 embeds로 명시 처리한다.
    if (c.includes('(')) continue
    out[c] = c in row ? row[c] : null
  }
  return out
}

/**
 * @param {Record<string, object[]>} tables 테이블명 -> 행 배열(참조로 보관, mutate됨)
 * @param {Record<string, {table:string, localCol:string, foreignCol:string, as:string}>} [embeds]
 *   select=... 안에 "classes(name)" 같은 임베디드 관계가 있을 때 join할 규칙.
 *   key는 "classes" 처럼 select 문자열에 등장하는 별칭.
 */
export function createDb(tables, embeds = {}) {
  return { tables, embeds, callLog: [], errors: [] }
}

function applyEmbeds(db, table, row, selectParam) {
  if (!selectParam) return row
  const out = { ...row }
  for (const [alias, rule] of Object.entries(db.embeds)) {
    if (!selectParam.includes(`${alias}(`)) continue
    const foreignRows = db.tables[rule.table] || []
    const match = foreignRows.find((f) => f[rule.foreignCol] === row[rule.localCol])
    const m = selectParam.match(new RegExp(`${alias}\\(([^)]*)\\)`))
    const subCols = m ? m[1].split(',').map((s) => s.trim()) : []
    out[alias] = match ? Object.fromEntries(subCols.map((c) => [c, match[c] ?? null])) : null
  }
  return out
}

function parseQuery(search) {
  const params = new URLSearchParams(search)
  const filters = []
  let select = null
  let order = null
  let limit = null
  for (const [key, value] of params.entries()) {
    if (key === 'select') select = value
    else if (key === 'order') order = order ? `${order},${value}` : value
    else if (key === 'limit') limit = Number(value)
    else if (key === 'offset') { /* 소규모 fixture라 offset은 무시(전량 반환) */ }
    else if (key === 'on_conflict') { /* upsert 대상 컬럼 지정 — POST 핸들러가 직접 읽음, 필터 아님 */ }
    else filters.push([key, parseFilterValue(value)])
  }
  return { select, order, limit, filters }
}

/**
 * @param {ReturnType<typeof createDb>} db
 * @param {{ url:string, method:string, headers:Record<string,string>, postDataJSON:any }} req
 * @returns {{ status:number, body:any }}
 */
export function handleRestRequest(db, req) {
  const u = new URL(req.url)
  const m = u.pathname.match(/\/rest\/v1\/([^/?]+)/)
  if (!m) throw new Error(`postgrestMock: /rest/v1/<table> 형태가 아닌 URL "${req.url}"`)
  const table = decodeURIComponent(m[1])
  if (!(table in db.tables)) db.tables[table] = []
  const rows = db.tables[table]
  const { select, order, limit, filters } = parseQuery(u.search)
  const accept = req.headers['accept'] || req.headers['Accept'] || ''
  const wantsSingle = accept.includes('vnd.pgrst.object')
  const prefer = req.headers['prefer'] || req.headers['Prefer'] || ''

  const logEntry = { table, method: req.method, query: u.search, body: req.postDataJSON ?? null, at: Date.now() }

  if (req.method === 'GET' || req.method === 'HEAD') {
    let matched = rows.filter((r) => filters.every(([col, f]) => matchesFilter(r, col, f)))
    matched = applyOrder(matched, order)
    if (typeof limit === 'number') matched = matched.slice(0, limit)
    const projected = matched.map((r) => applyEmbeds(db, table, projectSelect(r, select), select))
    logEntry.matchedCount = projected.length
    db.callLog.push(logEntry)
    if (wantsSingle) {
      if (projected.length !== 1) {
        return { status: 406, body: { code: 'PGRST116', message: `단일 행 기대했지만 ${projected.length}건 매치 (table=${table})` } }
      }
      return { status: 200, body: projected[0] }
    }
    return { status: 200, body: projected }
  }

  if (req.method === 'POST') {
    const incoming = Array.isArray(req.postDataJSON) ? req.postDataJSON : [req.postDataJSON]
    const onConflict = u.searchParams.get('on_conflict')
    const isUpsert = /resolution=merge-duplicates/.test(prefer) || !!onConflict
    const inserted = []
    for (const item of incoming) {
      let row = { ...item }
      if (isUpsert && onConflict) {
        const keyCols = onConflict.split(',')
        const existing = rows.find((r) => keyCols.every((c) => r[c] === row[c]))
        if (existing) {
          Object.assign(existing, row)
          inserted.push(existing)
          continue
        }
      }
      if (!row.id) row.id = `mock-${table}-${rows.length}-${Math.random().toString(36).slice(2, 9)}`
      rows.push(row)
      inserted.push(row)
    }
    logEntry.insertedIds = inserted.map((r) => r.id)
    db.callLog.push(logEntry)
    const wantsRepresentation = /return=representation/.test(prefer)
    if (!wantsRepresentation) return { status: 201, body: null }
    if (wantsSingle) return { status: 201, body: inserted[0] ?? null }
    return { status: 201, body: inserted }
  }

  if (req.method === 'PATCH') {
    const matched = rows.filter((r) => filters.every(([col, f]) => matchesFilter(r, col, f)))
    for (const r of matched) Object.assign(r, req.postDataJSON || {})
    logEntry.matchedCount = matched.length
    db.callLog.push(logEntry)
    const wantsRepresentation = /return=representation/.test(prefer)
    if (!wantsRepresentation) return { status: 204, body: null }
    return { status: 200, body: matched }
  }

  if (req.method === 'DELETE') {
    const matched = rows.filter((r) => filters.every(([col, f]) => matchesFilter(r, col, f)))
    const matchedIds = new Set(matched.map((r) => r.id))
    db.tables[table] = rows.filter((r) => !matchedIds.has(r.id))
    logEntry.matchedCount = matched.length
    db.callLog.push(logEntry)
    return { status: 204, body: null }
  }

  throw new Error(`postgrestMock: 미지원 메서드 "${req.method}"`)
}

/** callLog에서 특정 테이블에 대한 쓰기(POST/PATCH/DELETE) 호출만 추출 */
export function writesTo(db, table) {
  return db.callLog.filter((e) => e.table === table && e.method !== 'GET' && e.method !== 'HEAD')
}
