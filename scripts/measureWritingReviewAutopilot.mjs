// scripts/measureWritingReviewAutopilot.mjs
//
// 읽기 전용(REST GET만) — spelling_review_queue에 대해 INSERT/UPDATE/DELETE를
// 절대 하지 않는다. 목적은 "쓰기 오토파일럿(writingReviewAutoTypo, 편집거리1
// 자동승인)을 켜도 되는가"를 라이브 데이터로 측정하는 것 — 회귀 테스트가
// 아니라 일회성 의사결정 근거 스크립트다(verify 하네스에 등록 안 함,
// docs/operations/writing-autopilot-measurement-2026-08-05.md §재현 방법 참고).
//
// 판정 로직은 재구현하지 않는다(헌법 규칙 3) — 실제 파이프라인이 쓰는
// supabase/functions/grade-writing-answers/pipeline.js의 classifyLocally를
// 그대로 import해서 돌린다. 그 파일은 Deno 전용 API(Deno.env, npm: import
// 등)를 전혀 안 쓰는 순수 JS라 Node에서도 그대로 import 가능하다(파일
// 헤더 주석 확인, scripts/testWritingReviewAiPipeline.mjs가 이미 같은
// 방식으로 검증).
//
// .env 읽는 방식은 scripts/preMigrationCounts.mjs와 동일하게 맞춘다.
//
// 실행: node scripts/measureWritingReviewAutopilot.mjs [--top N]
//   --top N : 오탐 사례 상위 N건 출력(기본 10)

import fs from 'node:fs'
import { classifyLocally } from '../supabase/functions/grade-writing-answers/pipeline.js'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const H = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` }
const get = async (p) => {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${p}`, { headers: H })
  if (!res.ok) throw new Error(`GET ${p} -> HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

const topN = (() => {
  const idx = process.argv.indexOf('--top')
  if (idx === -1) return 10
  const n = Number(process.argv[idx + 1])
  return Number.isFinite(n) && n > 0 ? n : 10
})()

console.log('spelling_review_queue 실측 읽기 전용 측정 — REST GET만 실행(쓰기 없음)\n')

// status 무관 전량 조회 — words(word,meaning,accepted_meanings) embed로
// 판정에 필요한 필드까지 한 번에. limit은 라이브 규모(293행, 2026-08-05
// 실측) 대비 여유 있게.
const rows = await get(
  'spelling_review_queue?select=id,word_id,submitted_answer,direction,status,created_at,words(word,meaning,accepted_meanings)&order=created_at.asc&limit=5000'
)

const byStatus = { pending: [], accepted: [], dismissed: [] }
const otherStatus = []
for (const r of rows) {
  if (byStatus[r.status]) byStatus[r.status].push(r)
  else otherStatus.push(r)
}

console.log(`전체 행 ${rows.length}건 — pending ${byStatus.pending.length} / accepted ${byStatus.accepted.length} / dismissed ${byStatus.dismissed.length}` +
  (otherStatus.length ? ` / 기타 status ${otherStatus.length}` : ''))

const directions = new Set(rows.map((r) => r.direction))
console.log(`direction 분포: ${[...directions].join(', ') || '(없음)'}\n`)

function classifyRow(r) {
  const word = r.words?.word || '(삭제된 단어)'
  const meaning = r.words?.meaning || ''
  const acceptedMeanings = Array.isArray(r.words?.accepted_meanings) ? r.words.accepted_meanings : []
  const local = classifyLocally({ word, meaning, acceptedMeanings, submittedAnswer: r.submitted_answer })
  return { row: r, word, meaning, acceptedMeanings, local }
}

// ── A. pending 판정 분포 ────────────────────────────────────────────────
const pendingClassified = byStatus.pending.map(classifyRow)
const countBySource = { exact_match: 0, synonym: 0, levenshtein: 0 }
let unresolved = 0
for (const c of pendingClassified) {
  if (c.local.decision === 'accept') countBySource[c.local.decisionSource] = (countBySource[c.local.decisionSource] || 0) + 1
  else unresolved++
}

console.log('=== A. pending 판정 분포(현재 pending에 로컬 판정을 적용) ===')
console.log(`  exact_match            : ${countBySource.exact_match || 0}`)
console.log(`  synonym                : ${countBySource.synonym || 0}`)
console.log(`  levenshtein(편집거리1) : ${countBySource.levenshtein || 0}`)
console.log(`  미해결(AI 필요, null)  : ${unresolved}`)
console.log(`  합계                   : ${byStatus.pending.length}\n`)

// ── B. accepted/dismissed 정답지 검증 ──────────────────────────────────
const acceptedClassified = byStatus.accepted.map(classifyRow)
const dismissedClassified = byStatus.dismissed.map(classifyRow)

const matchAccepted = {}   // source -> accepted 중 로컬이 accept로 맞춘 건수
const missAccepted = { count: 0 } // accepted인데 로컬이 확정 못 한 건수(null)
for (const c of acceptedClassified) {
  if (c.local.decision === 'accept') matchAccepted[c.local.decisionSource] = (matchAccepted[c.local.decisionSource] || 0) + 1
  else missAccepted.count++
}

const falsePositiveDismissed = {} // source -> dismissed인데 로컬이 accept로 잘못 판정한 건수
const correctDismissed = { count: 0 } // dismissed인데 로컬도 미확정(null) — 정상
const falsePositiveRows = [] // 오탐 사례 원본 보관(상위 N건 인용용)
for (const c of dismissedClassified) {
  if (c.local.decision === 'accept') {
    falsePositiveDismissed[c.local.decisionSource] = (falsePositiveDismissed[c.local.decisionSource] || 0) + 1
    falsePositiveRows.push(c)
  } else {
    correctDismissed.count++
  }
}

console.log('=== B. 교사 정답지(accepted/dismissed) 기준 검증 ===')
console.log(`  accepted 총 ${acceptedClassified.length}건`)
console.log(`    exact_match로 맞춤 : ${matchAccepted.exact_match || 0}`)
console.log(`    synonym로 맞춤     : ${matchAccepted.synonym || 0}`)
console.log(`    levenshtein로 맞춤 : ${matchAccepted.levenshtein || 0}`)
console.log(`    로컬 미확정(null)  : ${missAccepted.count}`)
console.log(`  dismissed 총 ${dismissedClassified.length}건`)
console.log(`    exact_match로 오인정 : ${falsePositiveDismissed.exact_match || 0}`)
console.log(`    synonym로 오인정     : ${falsePositiveDismissed.synonym || 0}`)
console.log(`    levenshtein로 오인정 : ${falsePositiveDismissed.levenshtein || 0}`)
console.log(`    로컬도 미확정(정상)  : ${correctDismissed.count}\n`)

console.log('  --- 소스별 정밀도(정답지 88건 기준: 맞춤 / (맞춤 + 오인정)) ---')
for (const source of ['exact_match', 'synonym', 'levenshtein']) {
  const hit = matchAccepted[source] || 0
  const fp = falsePositiveDismissed[source] || 0
  const denom = hit + fp
  const precisionStr = denom === 0 ? 'N/A(발동 0건)' : `${((hit / denom) * 100).toFixed(1)}% (${hit}/${denom})`
  console.log(`  ${source.padEnd(11)} : ${precisionStr}`)
}
console.log('')

// ── C. 오탐 사례 상위 N건 ──────────────────────────────────────────────
console.log(`=== C. 오탐 사례(dismissed인데 로컬이 accept로 판정) 상위 ${topN}건 ===`)
if (falsePositiveRows.length === 0) {
  console.log('  (오탐 0건)')
} else {
  falsePositiveRows.slice(0, topN).forEach((c, i) => {
    console.log(`  ${i + 1}. word="${c.word}" meaning="${c.meaning}" 학생답="${c.row.submitted_answer}" source=${c.local.decisionSource}`)
  })
}
console.log('')

// ── E. 문장부호/공백 정규화 갭(정보성) ─────────────────────────────────
// classifyLocally가 내부적으로 이미 normalizeForCompare(NFKC + trim + 공백
// 축약 + 양끝 문장부호 제거)를 거쳐 판정하므로, 이 정규화 자체가 A/B 위
// 수치에 이미 반영돼 있다. 여기서는 "애초에 양끝에 문장부호가 붙은 답이
// 큐에 얼마나 있는지"만 별도로 세어 참고 수치로 남긴다(재현 대상 E).
const PUNCT_EDGE = /^[.,!?"'“”‘’]+|[.,!?"'“”‘’]+$/
const punctEdgeCount = rows.filter((r) => PUNCT_EDGE.test(String(r.submitted_answer ?? ''))).length
console.log('=== E. 문장부호/공백 정규화 갭(정보성) ===')
console.log(`  양끝에 문장부호가 붙은 답안(전체 ${rows.length}건 중) : ${punctEdgeCount}건\n`)

console.log('측정 완료 — 이 스크립트는 spelling_review_queue/words에 어떤 쓰기도 수행하지 않았다(REST GET만 실행).')
