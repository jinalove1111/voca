// src/utils/curriculum/practiceSentence.js — 학생용 짧은 연습 예문(순수 모델)
//
// import 0개 순수 모듈(curriculumModel.js 관례). 2026-08-09 운영자 지시:
// source(본문 원문, 절대 무수정)와 practice(학생 연습용 짧은 문장)를 분리.
//
// 자동 제안 전략(무료 우선 — CLAUDE.md 규칙 7, 실시간 AI 호출 0):
//   1순위 word asset — words.example_text는 Word Asset 시스템이 이미 AI로
//     생성해 둔 "학생용 짧은 예문"이다(같은 단어·학생 눈높이). 대상 단어
//     whole-word 포함 + 12단어 이하일 때만 채택.
//   2순위 규칙 기반 절 추출 — 원문을 쉼표/접속사 경계로 나눠 대상 단어가
//     든 가장 짧은 절을 고른다. 새 단어를 지어내지 않고 **원문 단어의
//     부분집합만** 사용(의미 왜곡 방지). 선두 접속사(and/but/so/because/
//     that 등) 제거, 첫 글자 대문자화, 마침표 보정만 한다.
//  둘 다 실패하면 null — UI가 빈칸+직접 입력으로 안내(임의 생성 금지).
// 관리자는 언제든 제안을 수정할 수 있다(최종 결정권은 사람).

const WORD_LIMIT_WARN = 12   // 초과 시 경고(운영자 지시: 최대 12단어 정도)
const WORD_TARGET_MAX = 12

export function countWords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsTargetWholeWord(sentence, target) {
  const tokens = String(target || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  const pattern = tokens.map(escapeRegex).join('\\s+')
  return new RegExp(`\\b${pattern}\\b`, 'i').test(String(sentence || ''))
}

// validatePracticeSentence(targetWord, sentence)
// → { ok, wordCount, warnings: string[] }
//   ok=false: 비어있거나 대상 단어 미포함(저장 부적합).
//   warnings: 12단어 초과 등 — 저장은 가능하되 관리자 확인 유도.
export function validatePracticeSentence(targetWord, sentence) {
  const s = String(sentence || '').trim()
  const warnings = []
  if (!s) return { ok: false, wordCount: 0, warnings: ['연습 예문이 비어 있어요.'] }
  if (!containsTargetWholeWord(s, targetWord)) {
    return { ok: false, wordCount: countWords(s), warnings: [`연습 예문에 대상 단어(${targetWord})가 온전한 형태로 포함돼야 해요.`] }
  }
  const wc = countWords(s)
  if (wc > WORD_LIMIT_WARN) warnings.push(`⚠ ${wc}단어 — 12단어 이하를 권장해요(학생 연습용).`)
  return { ok: true, wordCount: wc, warnings }
}

// 절 추출 — 원문에서 대상 단어가 든 가장 짧은 절(원문 단어 부분집합).
const CLAUSE_SPLIT_RE = /,|;|:| — | - /
const CONNECTOR_SPLIT_RE = /\b(?:and|but|so|because|that|which|who|while|when|although)\b/i
const LEADING_JUNK_RE = /^(?:and|but|so|because|that|which|who|while|when|although|then)\s+/i

function polish(fragment) {
  let s = String(fragment || '').trim()
  s = s.replace(LEADING_JUNK_RE, '').trim()
  if (!s) return ''
  s = s.charAt(0).toUpperCase() + s.slice(1)
  if (!/[.!?]$/.test(s)) s += '.'
  return s
}

export function extractPracticeClause(sourceSentence, targetWord) {
  const src = String(sourceSentence || '').trim()
  if (!src) return null
  // 후보 조각: 쉼표류 분할 → 각 조각을 접속사로 재분할한 것까지 전부 모음.
  const commaChunks = src.split(CLAUSE_SPLIT_RE)
  const candidates = []
  for (const chunk of commaChunks) {
    candidates.push(chunk)
    for (const sub of chunk.split(CONNECTOR_SPLIT_RE)) candidates.push(sub)
  }
  const viable = candidates
    .map(polish)
    .filter((s) => s && containsTargetWholeWord(s, targetWord) && countWords(s) <= WORD_TARGET_MAX && countWords(s) >= 3)
  if (viable.length === 0) return null
  // 가장 짧은(단어 수) 후보 — 동수면 먼저 나온 것.
  viable.sort((a, b) => countWords(a) - countWords(b))
  return viable[0]
}

// suggestPracticeSentence({ targetWord, sourceSentence, assetExample })
// → { sentence, origin: 'word_asset' | 'clause' } | null
export function suggestPracticeSentence({ targetWord, sourceSentence, assetExample } = {}) {
  const asset = String(assetExample || '').trim()
  if (asset && containsTargetWholeWord(asset, targetWord) && countWords(asset) <= WORD_TARGET_MAX) {
    return { sentence: asset, origin: 'word_asset' }
  }
  const clause = extractPracticeClause(sourceSentence, targetWord)
  if (clause) return { sentence: clause, origin: 'clause' }
  return null
}
