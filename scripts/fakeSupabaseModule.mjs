// 오프라인 Supabase 스텁 — src/utils/supabaseClient.js 자리에 끼워 넣어
// wordLibrary.js를 네트워크 0으로 돌리기 위한 테스트 전용 모듈
// (scripts/buildWordLibOfflineBundle.mjs가 external로 연결한다).
//
// 이 스텁의 존재 이유는 "PostgREST 기본 행 상한 1000"을 **실제로 재현**하는
// 것이다. 2026-08-12 실사고에서 words 테이블이 1093행이 되자 앱이 range 없이
// 조회해 1000행만 받고 나머지 93개를 에러 없이 버렸다. 상한을 흉내 내지 않는
// 스텁으로는 그 회귀를 영원히 잡을 수 없으므로, 여기서 상한을 강제한다:
//   - range()가 없으면      -> 최대 MAX_ROWS(1000)행
//   - range(a, b)가 있으면  -> a..b 창을 주되 역시 최대 MAX_ROWS행
// 즉 전량을 받으려면 호출부가 반드시 페이지네이션을 해야 한다(실제 동작과 동일).
//
// buildRaceBundle.mjs의 stub과 같은 이유로 external 연결이다 — 인라인되면
// 테스트가 주입한 데이터셋과 번들 안 사본이 서로 다른 인스턴스가 된다.

export const MAX_ROWS = 1000

let _dataset = {}
let _calls = []

// 테스트가 주입하는 테이블별 행 배열. { classes: [...], units: [...], ... }
export function __setDataset(dataset) {
  _dataset = dataset || {}
  _calls = []
}

// 실제로 나간 쿼리 기록(정렬 키가 결정적인지 등을 단언하는 데 쓴다).
export function __getCalls() {
  return _calls
}

const cmp = (a, b) => {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : 1
}

function execute(state) {
  const rows = Array.isArray(_dataset[state.table]) ? [..._dataset[state.table]] : []
  const filtered = rows.filter((r) => state.filters.every((f) => f(r)))

  // 다중 정렬 키를 순서대로 적용. 정렬 키에 tie가 남으면 그 순서는
  // 의도적으로 "입력 순서"가 아니라 **역순**으로 흔든다 — 비결정적 정렬에
  // 의존하는 코드가 페이지 경계에서 행을 누락/중복하는 실제 위험을
  // 테스트에서 드러내기 위해서다(안정 정렬로 흉내 내면 버그가 숨는다).
  const sorted = filtered
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      for (const [col, asc] of state.orders) {
        const c = cmp(x.row[col], y.row[col])
        if (c !== 0) return asc ? c : -c
      }
      return y.i - x.i // tie -> 입력 역순(흔들기)
    })
    .map((x) => x.row)

  const [from, to] = state.range || [0, MAX_ROWS - 1]
  const end = Math.min(to + 1, from + MAX_ROWS)
  // stale cache 감사(2026-08-15) — 실 supabase-js의
  // `.select(cols, { count: 'exact', head: true })` 패턴(예: revalidateUnitWords
  // 의 경량 단어 수 확인)을 재현. count는 range/head와 무관하게 필터링된
  // 전체 행 수, head:true면 데이터 자체는 내려보내지 않는다(실제 PostgREST
  // HEAD 요청과 동일 계약). count 옵션을 안 쓰는 기존 모든 호출부는
  // state.countMode가 없어 count:null, head:false 그대로라 동작 무변화.
  const data = state.head ? [] : sorted.slice(from, end)
  const count = state.countMode === 'exact' ? filtered.length : null

  _calls.push({
    table: state.table,
    columns: state.columns,
    orders: state.orders.map(([c]) => c),
    range: state.range,
    returned: data.length,
    count,
    head: !!state.head,
  })
  return { data, error: null, count }
}

function builder(table) {
  const state = { table, columns: '', orders: [], filters: [], range: null, countMode: null, head: false }
  const api = {
    select(columns, opts) {
      state.columns = columns || ''
      state.countMode = opts?.count || null
      state.head = !!opts?.head
      return api
    },
    order(col, opts) { state.orders.push([col, opts?.ascending !== false]); return api },
    eq(col, val) { state.filters.push((r) => r[col] === val); return api },
    in(col, vals) { state.filters.push((r) => (vals || []).includes(r[col])); return api },
    limit(n) { state.range = [0, n - 1]; return api },
    range(from, to) { state.range = [from, to]; return api },
    then(resolve, reject) { return Promise.resolve(execute(state)).then(resolve, reject) },
  }
  return api
}

export const supabase = {
  from: (table) => builder(table),
}
