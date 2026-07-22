// src/utils/sentenceLearning.js — Sentence Learning(v3.4) 순수 계산 레이어.
// import 0 (readingModel.js/analyticsMath.js와 같은 관례) — Node 하네스
// (tests/harness/runSentenceLearning.mjs)가 브라우저/Supabase 없이 직접
// import해서 단언한다. I/O는 전부 sentenceProgressApi.js/readingApi.js에만.
//
// 학습 흐름 전체 로직이 이 파일에 있다(학생 UI는 Phase B — 별도 세션이
// 이 함수들을 소비만 한다). 무작위 함수 사용 금지 — 셔플까지 전부 시드
// 결정론(paulTown.js pickTodaysDiscovery의 djb2 관례). 하네스가 이 파일에
// 무작위 함수 호출 문자열이 없음을 코드 레벨로 단언한다.

// ── 단계 정의 ──
// 핵심 문장(is_key_sentence)만 이 6단계를 걷는다. 비핵심 문장은 단계에
// 진입하지 않는다(보기/듣기 전용 — nextStage가 null 반환).
export const STAGES = ['read', 'chunk', 'puzzle', 'one_blank', 'ko_to_en', 'mastered']

// 시험 중요도 라벨(1..5) — DB importance_level의 표시 진실 원천.
export const IMPORTANCE_LABELS = {
  5: '반드시 암기',
  4: '자주 출제',
  3: '중요',
  2: '읽기 중심',
  1: '참고',
}

// ── 답 정규화 — 대소문자/공백/구두점 차이로 오답 처리하지 않는다 ──
// 소문자화 → 구두점 제거(. , ! ? ' " … 및 타이포그래피 따옴표) →
// 연속 공백 1칸 축약 → trim. "Don't"와 "dont"는 같은 답으로 본다.
export function normalizeAnswer(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[.,!?'"‘’“”…]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── 빈칸 뚫기(one_blank) — 결정론 단일 빈칸 선택 ──
// 우선순위: ① 유닛 단어와 일치하는 토큰(학습 단어를 문장 속에서 복습)
//          ② 동사로 보이는 토큰 ③ 마지막 내용어(명사일 가능성이 높은
//          폴백). 관사(a/an/the)/구두점뿐인 토큰/1글자 토큰은 절대 빈칸이
//          되지 않는다.
//
// 정직한 한계(의도적 naive): ②의 "동사" 판정은 품사 분석이 아니라 흔한
// 동사 목록 + -ed/-ing 어미 휴리스틱이다(-s는 복수 명사와 구분 불가라
// 어미 휴리스틱에서 제외 — 목록에 있는 3인칭 단수형만 잡힘). ③도 실제
// 명사 판정이 아니라 "관사/전치사/대명사류 기능어가 아닌 마지막 토큰"
// 이다. 초등 영어 문장 수준에서 충분히 자연스러운 빈칸을 고르는 것이
// 목적이지 완전한 형태소 분석기가 아니다.
const ARTICLES = ['a', 'an', 'the']
const COMMON_VERBS = [
  'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had',
  'go', 'goes', 'went', 'gone', 'come', 'comes', 'came',
  'like', 'likes', 'love', 'loves', 'want', 'wants',
  'see', 'sees', 'saw', 'look', 'looks', 'get', 'gets', 'got',
  'make', 'makes', 'made', 'take', 'takes', 'took',
  'play', 'plays', 'eat', 'eats', 'ate', 'run', 'runs', 'ran',
  'say', 'says', 'said', 'read', 'reads', 'write', 'writes', 'wrote',
  'can', 'will', 'know', 'knows', 'knew', 'think', 'thinks', 'thought',
  'live', 'lives', 'lived', 'help', 'helps', 'study', 'studies',
]
// ③ 폴백에서 제외할 기능어(빈칸으로 뚫어도 학습 가치가 낮은 토큰들).
const FUNCTION_WORDS = [
  ...ARTICLES,
  'in', 'on', 'at', 'to', 'of', 'for', 'with', 'from', 'by', 'up', 'down',
  'and', 'or', 'but', 'so', 'not', 'no',
  'he', 'she', 'it', 'we', 'they', 'you', 'his', 'her', 'its', 'their',
  'my', 'your', 'our', 'me', 'him', 'them', 'us', 'this', 'that',
]

function isVerbish(norm) {
  if (COMMON_VERBS.includes(norm)) return true
  if (norm.length >= 4 && (norm.endsWith('ed') || norm.endsWith('ing'))) return true
  return false
}

// sentence: 영어 문장 문자열. unitWordSlugs: 유닛 단어 문자열 배열(비교는
// normalizeAnswer 기준 — 대소문자/구두점 무관).
// 반환: { blankIndex, answer, display } 또는 null(빈칸 후보 없음).
//   blankIndex — 공백 분할 토큰 배열에서 빈칸이 된 인덱스
//   answer     — 원문 토큰에서 앞뒤 구두점을 벗긴 정답(표시/채점용 원형)
//   display    — 해당 토큰을 '_____'로 바꾼 문장(토큰의 앞뒤 구두점은 보존)
export function pickBlank(sentence, unitWordSlugs) {
  const tokens = String(sentence ?? '').split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const slugSet = new Set(
    (Array.isArray(unitWordSlugs) ? unitWordSlugs : [])
      .map((w) => normalizeAnswer(w))
      .filter(Boolean),
  )

  // 토큰별 파생: 앞뒤 구두점을 벗긴 core(정답 원형)와 비교용 norm.
  const infos = tokens.map((tok, i) => {
    const core = tok.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '')
    const norm = normalizeAnswer(core)
    const eligible = norm.length >= 2 && !ARTICLES.includes(norm)
    return { index: i, token: tok, core, norm, eligible }
  })
  const eligibles = infos.filter((t) => t.eligible)
  if (eligibles.length === 0) return null

  // ① 유닛 단어 일치(문장 앞에서부터 첫 일치 — 결정론)
  let chosen = eligibles.find((t) => slugSet.has(t.norm)) || null
  // ② 동사로 보이는 토큰(첫 일치)
  if (!chosen) chosen = eligibles.find((t) => isVerbish(t.norm)) || null
  // ③ 마지막 내용어(기능어 제외) — 전부 기능어면 마지막 eligible 토큰
  if (!chosen) {
    const contents = eligibles.filter((t) => !FUNCTION_WORDS.includes(t.norm))
    chosen = (contents.length > 0 ? contents : eligibles)[
      (contents.length > 0 ? contents : eligibles).length - 1
    ]
  }

  const display = tokens
    .map((tok, i) => (i === chosen.index ? tok.replace(chosen.core, '_____') : tok))
    .join(' ')
  return { blankIndex: chosen.index, answer: chosen.core, display }
}

// ── 끊어읽기 청크 ──
// DB chunks(jsonb)가 "비어있지 않은 문자열 2개 이상 배열"로 유효하면 그대로
// (trim 사본), 아니면 문장 전체를 단일 청크로 폴백 — 청크 미입력 문장도
// 일반 표시는 항상 동작한다(CLAUDE.md 규칙 9 정신).
export function chunksOf(sentenceRow) {
  const row = sentenceRow || {}
  let raw = row.chunks
  if (typeof raw === 'string') {
    // 방어: jsonb가 문자열로 직렬화돼 온 경우도 수용(실패 시 폴백).
    try { raw = JSON.parse(raw) } catch { raw = null }
  }
  if (Array.isArray(raw)) {
    const cleaned = raw
      .filter((c) => typeof c === 'string')
      .map((c) => c.trim())
      .filter(Boolean)
    if (cleaned.length >= 2) return cleaned
  }
  const english = String(row.english ?? '').trim()
  return english ? [english] : []
}

// ── 시드 결정론 셔플(퍼즐 단계 보기 섞기) ──
// djb2 해시(paulTown.js hashString과 동일 관례) 기반 LCG — 무작위 함수
// 금지. 같은 seedStr이면 항상 같은 순서. 길이 ≥ 2면 셔플 결과가 원본과
// 같은 순서가 되지 않도록 보장(같으면 1칸 회전).
function hashString(s) {
  let h = 5381
  const str = String(s ?? '')
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h
}

export function shuffleDeterministic(arr, seedStr) {
  const list = Array.isArray(arr) ? [...arr] : []
  if (list.length < 2) return list
  let state = hashString(seedStr) || 1
  const nextInt = (bound) => {
    // 32비트 LCG(Numerical Recipes 계수) — 결정론, 외부 의존성 0.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % bound
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = nextInt(i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  const sameOrder = list.every((v, i) => v === arr[i])
  if (sameOrder) list.push(list.shift()) // 원본과 같으면 1칸 회전 — "섞였음" 보장
  return list
}

// ── 채점 ──
// 퍼즐(청크 순서 맞추기): 선택 순서가 정답 청크 순서와 정규화 기준으로
// 완전히 일치해야 정답.
export function checkChunkOrder(selected, chunks) {
  const a = Array.isArray(selected) ? selected : []
  const b = Array.isArray(chunks) ? chunks : []
  if (a.length !== b.length || b.length === 0) return false
  return a.every((s, i) => normalizeAnswer(s) === normalizeAnswer(b[i]))
}

// 빈칸/영작 입력 채점 — normalizeAnswer 기준 비교(빈 정답은 항상 오답).
export function checkBlank(input, answer) {
  const want = normalizeAnswer(answer)
  if (!want) return false
  return normalizeAnswer(input) === want
}

// ── 적응 지원(틀릴수록 도움을 늘린다 — 벌점/질책 없음) ──
// 2회 틀리면 전체 문장을 보여주고, 3회 틀리면 답을 공개한다. 답 공개 후
// 에도 한 번 더 직접 입력해보게 한다(requireRetryAfterReveal — 보고
// 베끼더라도 손으로 쳐보는 것이 학습 목적).
export const ENCOURAGE = [
  '조금만 더 해볼까?',
  '문장을 다시 보고 천천히 맞춰보자.',
  '좋아! 이제 한 번 더 해보자.',
]

export function adaptiveState(wrongCount) {
  const wrong = Math.max(0, Number(wrongCount) || 0)
  return {
    showFullSentence: wrong >= 2,
    revealAnswer: wrong >= 3,
    requireRetryAfterReveal: true,
  }
}

// 격려 문구 — 시도 횟수로 결정론 선택(무작위 없음).
export function encouragementFor(attemptCount) {
  const n = Math.max(0, Number(attemptCount) || 0)
  return ENCOURAGE[n % ENCOURAGE.length]
}

// ── 단계 전이 ──
// 핵심 문장(isKey=true)만 STAGES를 순서대로 걷는다. 비핵심 문장은 어떤
// 단계에도 진입하지 않는다(null — 보기/듣기 전용). mastered 이후는 null.
export function nextStage(current, isKey) {
  if (!isKey) return null
  const idx = STAGES.indexOf(current)
  if (idx < 0) return STAGES[0] // 알 수 없는 값 → 처음부터(방어)
  if (idx >= STAGES.length - 1) return null // 이미 mastered
  return STAGES[idx + 1]
}

// ── 진행도 리듀서(순수) ──
// progressRow(sentence_progress 행 형태의 필드들)에 "stage 단계를 correct
// 여부로 마쳤다"를 적용한 새 필드 객체를 반환한다. DB 저장은 API 레이어
// (sentenceProgressApi.upsertSentenceProgress)의 책임 — 이 함수는 입력을
// 변경하지 않는다.
//   - attempt_count 항상 +1, correct/wrong_count는 결과에 따라 +1
//   - 정답이면 completed_stages에 stage를 중복 없이 추가하고 다음 단계로
//     전진(current_stage), mastered 도달 시 mastered_at을 최초 1회만 기록
//   - 오답이면 단계 유지(적응 지원은 adaptiveState가 담당 — 벌점 없음)
export function applyStageResult(progressRow, stage, correct, now = new Date()) {
  const row = progressRow || {}
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString()
  const prevCompleted = Array.isArray(row.completed_stages) ? row.completed_stages : []
  const next = {
    current_stage: STAGES.includes(row.current_stage) ? row.current_stage : 'read',
    completed_stages: [...prevCompleted],
    attempt_count: (Number(row.attempt_count) || 0) + 1,
    correct_count: (Number(row.correct_count) || 0) + (correct ? 1 : 0),
    wrong_count: (Number(row.wrong_count) || 0) + (correct ? 0 : 1),
    mastered_at: row.mastered_at || null,
    last_practiced_at: nowIso,
  }
  if (correct && STAGES.includes(stage) && stage !== 'mastered') {
    if (!next.completed_stages.includes(stage)) next.completed_stages.push(stage)
    const advanced = nextStage(stage, true)
    if (advanced) {
      next.current_stage = advanced
      if (advanced === 'mastered' && !next.mastered_at) next.mastered_at = nowIso
    }
  }
  return next
}
