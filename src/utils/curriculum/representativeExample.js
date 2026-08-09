// src/utils/curriculum/representativeExample.js — 대표 연습 예문 선정/그룹화
// (2026-08-09 운영자 지시). 순수 모듈 — 두 순수 모듈만 조합(React/Supabase/
// 네트워크 무의존). 하네스가 플레인 Node로 직접 로드할 수 있도록 명시적
// .js 확장자 import(Vite에서도 동일 동작).
//
// 제품 규칙: 같은 target_word가 본문에서 여러 번 발견돼도 학생 학습(TTS/
// 듣기/쓰기/예문 문제)은 **대표 1개**만 쓴다. 나머지 행은 삭제하지 않고
// 관리자 화면의 "본문 근거 문장"으로 보존 — 이 모듈은 파생 "선택"만 하며
// 어떤 행도 변경/삭제하지 않는다.
import { computeExampleRank } from './curriculumModel.js'
import { practiceQualityScore } from './practiceSentence.js'

// exampleRankOf(row, unitId) — exampleLibrary.toRow 형태(camelCase)를 받아
// 3축 랭크 계산(유닛 일치 ≫ 연습 예문 품질 ≫ 소스).
export function exampleRankOf(row, unitId) {
  const r = row || {}
  return computeExampleRank(
    r.unitId, r.source, unitId,
    practiceQualityScore(r.targetWord, r.practiceSentence),
  )
}

// pickRepresentativeExample(rows, { unitId }) → row | null
// rows는 같은 target_word의 예문들(순서 무관). 동점이면 createdAt 최신.
export function pickRepresentativeExample(rows, { unitId } = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  if (list.length === 0) return null
  let best = null
  let bestRank = -1
  for (const r of list) {
    const rank = exampleRankOf(r, unitId)
    const newer = best ? String(r.createdAt || '') > String(best.createdAt || '') : true
    if (rank > bestRank || (rank === bestRank && newer)) { best = r; bestRank = rank }
  }
  return best
}

// groupExamplesByTargetWord(rows, { unitId })
// → [{ targetWord, representative, rows(원본 순서 유지), count }]
//   관리자 화면 그룹 카드용 — targetWord 등장 순서(첫 행 기준)대로 정렬.
export function groupExamplesByTargetWord(rows, { unitId } = {}) {
  const order = []
  const byWord = new Map()
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const key = String(r?.targetWord || '').toLowerCase()
    if (!key) continue
    if (!byWord.has(key)) { byWord.set(key, []); order.push(key) }
    byWord.get(key).push(r)
  }
  return order.map((key) => {
    const group = byWord.get(key)
    return {
      targetWord: group[0].targetWord,
      representative: pickRepresentativeExample(group, { unitId }),
      rows: group,
      count: group.length,
    }
  })
}
