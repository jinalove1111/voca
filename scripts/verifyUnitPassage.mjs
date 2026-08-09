// scripts/verifyUnitPassage.mjs — Unit 본문 실전 검증 도구 (P0-1, 2026-08-10)
//
// 운영자가 제공한 본문 전문으로 관리자 "본문 가져오기"와 **동일한 파이프라인**
// (이중 언어 짝짓기 → whole-word 매칭 → 핵심 chunk 추출 → 품질 등급)을
// 구동해 커버리지 표를 출력한다. **DB에 아무것도 저장하지 않는다**(단어
// 목록 조회만 READ-ONLY) — 실제 저장은 운영자가 관리자 화면에서 승인.
//
// 사용법:
//   node scripts/verifyUnitPassage.mjs <본문파일.txt> [unitId]
//   (unitId 생략 시 중2 능률 김기택 "Unit 6" a437b6c9-…)
import { readFileSync, existsSync } from 'node:fs'
import { parseBilingualPassage, matchWordsToSentences } from '../src/utils/curriculum/textImport.js'
import { extractKeyChunk, chunkQualityGrade } from '../src/utils/curriculum/practiceSentence.js'

// 기본 유닛 = 중2 천재 이상기 "Unit 6"(4fe5a398, 단어 40 — 롤모델 주제:
// astronaut/invitation/independence/achieve…). 기존 예문 5행의 실제 FK로
// 실측 확정(2026-08-10 — 초기 초안이 김기택 Unit 6로 잘못 기재했던 것 정정).
const DEFAULT_UNIT = '4fe5a398-7352-415c-b92f-572fc2ecfef9'
const [, , passagePath, unitIdArg] = process.argv
if (!passagePath || !existsSync(passagePath)) {
  console.error('사용법: node scripts/verifyUnitPassage.mjs <본문파일.txt> [unitId]')
  process.exit(1)
}
for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (m && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim()
  }
}
const URL_BASE = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const unitId = unitIdArg || DEFAULT_UNIT

const words = await (await fetch(`${URL_BASE}/rest/v1/words?select=id,word&unit_id=eq.${unitId}&order=position.asc`, { headers: H })).json()
const passage = readFileSync(passagePath, 'utf8')

const { pairs, hasKorean } = parseBilingualPassage(passage)
const sentences = pairs.map((p) => p.en)
const koBy = pairs.map((p) => p.ko)
const matched = matchWordsToSentences(words, sentences)

const stat = { found: 0, chunk: 0, HIGH: 0, MEDIUM: 0, LOW: 0, notFound: [], substrFail: [] }
console.log(`본문: 문장 ${sentences.length}개, 해석 짝 ${koBy.filter(Boolean).length}개 (hasKorean=${hasKorean})`)
console.log(`Unit 단어: ${words.length}개 (unit ${unitId.slice(0, 8)})\n`)
console.log('단어 | 매칭 | 대표 문장(첫 exact) | 핵심 chunk | 등급 | substring')
for (const r of matched) {
  if (r.matches.length === 0) { stat.notFound.push(r.word); continue }
  stat.found++
  const exact = r.matches.find((m) => m.matchType === 'exact')
  if (!exact) { console.log(`${r.word} | ${r.matches.map((m) => m.matchType).join(',')}(검토 필요) | - | - | - | -`); continue }
  const chunk = extractKeyChunk(exact.sentence, r.word)
  if (chunk) {
    stat.chunk++
    const ok = exact.sentence.includes(chunk)
    if (!ok) stat.substrFail.push(r.word)
    const grade = chunkQualityGrade(r.word, chunk, exact.sentence)
    stat[grade] = (stat[grade] || 0) + 1
    console.log(`${r.word} | exact×${r.matches.filter((m) => m.matchType === 'exact').length} | ${exact.sentence.slice(0, 50)}… | ${chunk} | ${grade} | ${ok}`)
  } else {
    console.log(`${r.word} | exact | ${exact.sentence.slice(0, 50)}… | (추출 실패 — 수동 입력) | - | -`)
  }
}
console.log('\n=== 커버리지 요약 ===')
console.log(`단어 ${words.length} | 본문 발견 ${stat.found} | 핵심 chunk 생성 ${stat.chunk} | HIGH ${stat.HIGH} | MEDIUM ${stat.MEDIUM} | LOW ${stat.LOW} | 미발견 ${stat.notFound.length}`)
if (stat.notFound.length) console.log('미발견(AI 보충 후보로만 분리):', stat.notFound.join(', '))
console.log('exact_substring 전수:', stat.substrFail.length === 0 ? `PASS (${stat.chunk}/${stat.chunk})` : `FAIL: ${stat.substrFail.join(',')}`)
console.log('\n(저장 없음 — 실제 저장은 관리자 화면에서 승인)')
process.exit(stat.substrFail.length === 0 ? 0 : 1)
