// 익명 관찰 집계(2026-07-23) — 완전 순수 모듈(import 0, I/O 0).
// productEvents.js(수집)와 분리한 이유: 하네스가 브라우저 전용
// supabaseClient(import.meta.env)를 끌어오지 않고 직접 단언하기 위함
// (dailyRitual/paulTown과 동일한 순수성 관례).

export const EV = {
  appOpened: 'app_opened',
  paulMemoryViewed: 'paul_memory_viewed',
  todaysDiscoveryViewed: 'todays_discovery_viewed',
  gardenOpened: 'garden_opened',
  hatEarned: 'hat_earned',
  hatEquipped: 'hat_equipped',
  paulTownOpened: 'paul_town_opened',
  bookshelfOpened: 'bookshelf_opened',
  museumOpened: 'museum_opened',
  timeMachineOpened: 'time_machine_opened',
}

// ── 순수 집계(행: {anon_id, event, day(YYYY-MM-DD), created_at}) ──

const dayMs = 24 * 60 * 60 * 1000
const parseDay = (d) => new Date(`${d}T00:00:00`)
// 로컬 달력 기준 YYYY-MM-DD — toISOString(UTC 변환)을 쓰면 KST에서 하루
// 밀리는 시간대 버그가 생긴다(하네스로 실측 확인).
const fmtDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// 학생별 활동일 집합(아무 이벤트나 있으면 그 날은 "왔다")
function activityDays(rows) {
  const byAnon = new Map()
  for (const r of rows) {
    if (!byAnon.has(r.anon_id)) byAnon.set(r.anon_id, new Set())
    byAnon.get(r.anon_id).add(r.day)
  }
  return byAnon
}

// "N일 후 복귀" = 어떤 날 기능을 본 학생이, 정확히 N일 뒤(달력 기준)에
// 아무 활동이라도 한 비율. 기능별로 계산해 내림차순 정렬 — 핵심 출력.
export function computeReturnRates(rows, events = Object.values(EV), ns = [1, 3, 7]) {
  const act = activityDays(rows)
  const out = []
  for (const ev of events) {
    const opens = rows.filter((r) => r.event === ev)
    if (opens.length === 0) continue
    const rates = {}
    for (const n of ns) {
      let hit = 0, total = 0
      for (const o of opens) {
        total++
        const targetDay = fmtDay(parseDay(o.day).getTime() + n * dayMs)
        if (act.get(o.anon_id)?.has(targetDay)) hit++
      }
      rates[`d${n}`] = total ? hit / total : 0
    }
    out.push({ event: ev, opens: opens.length, ...rates })
  }
  return out.sort((a, b) => b.d1 - a.d1)
}

// 정원 재방문: garden_opened 후 1/3/7일 뒤 garden_opened가 또 있는 비율
export function computeGardenRevisits(rows, ns = [1, 3, 7]) {
  const gardens = rows.filter((r) => r.event === EV.gardenOpened)
  const byAnon = new Map()
  for (const g of gardens) {
    if (!byAnon.has(g.anon_id)) byAnon.set(g.anon_id, new Set())
    byAnon.get(g.anon_id).add(g.day)
  }
  const out = {}
  for (const n of ns) {
    let hit = 0, total = 0
    for (const g of gardens) {
      total++
      const targetDay = fmtDay(parseDay(g.day).getTime() + n * dayMs)
      if (byAnon.get(g.anon_id)?.has(targetDay)) hit++
    }
    out[`d${n}`] = total ? hit / total : 0
  }
  return out
}

// 평균 세션 길이(분) — 근사치: (anon, day)별 첫~마지막 이벤트 시각 차.
// 이벤트가 1개뿐인 날은 1분으로 바닥 처리(정직 라벨: "근사"라고 표기할 것).
export function computeAvgSessionMinutes(rows) {
  const byKey = new Map()
  for (const r of rows) {
    const k = `${r.anon_id}:${r.day}`
    const t = new Date(r.created_at).getTime()
    if (!Number.isFinite(t)) continue
    const cur = byKey.get(k)
    if (!cur) byKey.set(k, { min: t, max: t })
    else { cur.min = Math.min(cur.min, t); cur.max = Math.max(cur.max, t) }
  }
  const spans = [...byKey.values()].map((v) => Math.max(1, (v.max - v.min) / 60000))
  if (spans.length === 0) return 0
  return spans.reduce((a, b) => a + b, 0) / spans.length
}

export function computeFeatureCounts(rows) {
  const out = {}
  for (const r of rows) out[r.event] = (out[r.event] || 0) + 1
  return out
}
