// src/utils/curriculum/textImport.js — "본문 가져오기" 순수 모델 계층.
//
// curriculumModel.js와 동일한 관례: import 0개(플레인 Node ESM으로 하네스가
// 직접 로드 가능), React/Supabase/네트워크 무의존, 값을 받아 값을 돌려주는
// 함수만 export한다. IO(단어 목록 조회/예문 저장)는 TextImportPanel.jsx +
// exampleLibrary.js의 책임.
//
// 제품 불변식(운영자 지시, 2026-08-09):
//   1. 원문 보존 — 이 모듈은 입력 본문의 문장을 절대 고쳐 쓰지 않는다.
//      splitIntoSentences가 돌려주는 각 문장은 입력 텍스트의 연속 부분
//      문자열에서 양끝 공백만 trim한 것이다(철자/구조/표현 무변경).
//   2. 보수적 매칭 — 단순 substring 오탐 금지(cat ⊄ category). 판정은
//      curriculumModel.containsWholeWord와 동일한 whole-word(\b) 방식이고,
//      숙어/구동사는 토큰 사이 공백을 \s+로 유연화한 whole-word 연쇄다.
//   3. 형태 변화(protect→protected 등 규칙 변화)는 매칭하되 자동 확정하지
//      않는다 — matchType:'inflected'로 구분해 UI가 "검토 필요"로 표시한다.
//      (불규칙 변화(take→took)는 추측하지 않는다 — 확실하지 않은 매칭을
//      만들지 않는 게 원칙.) 참고: 'inflected' 매칭은 문장에 단어 원형이
//      없어서 validateExampleFields(curriculumModel.js)의 whole-word
//      불변식(빈칸 학습 전제)을 통과하지 못하므로 그대로는 저장할 수 없다
//      — UI가 이를 정직하게 안내한다(검증 로직을 약화하지 않는다).

// 문장 경계로 보지 않는 흔한 약어(마침표 포함 토큰). 목록은 보수적으로
// 최소만 — 여기 없는 약어는 그냥 문장이 한 번 더 쪼개질 뿐(원문 훼손 없음).
const ABBREV_RE = /(?:\b(?:Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|etc|No)|\be\.g|\bi\.e)\.$/i

// splitIntoSentences(text) → string[]
// 줄바꿈은 항상 경계. 줄 안에서는 [.!?](+닫는 따옴표/괄호) 뒤 공백을
// 경계로 본다. 각 문장은 입력의 연속 부분 문자열(trim만) — 원문 보존.
// "3.5"처럼 공백이 뒤따르지 않는 마침표는 경계가 아니다.
export function splitIntoSentences(text) {
  const out = []
  for (const line of String(text || '').split(/\r?\n/)) {
    let start = 0
    const re = /[.!?]+["'”’)\]]*[ \t]+/g
    let m
    while ((m = re.exec(line)) !== null) {
      const end = m.index + m[0].length
      // 경계 후보 직전 조각이 약어로 끝나면 경계가 아님 — 다음 후보로.
      const before = line.slice(start, m.index + 1).trimEnd()
      if (ABBREV_RE.test(before)) continue
      const s = line.slice(start, end).trim()
      if (s) out.push(s)
      start = end
    }
    const rest = line.slice(start).trim()
    if (rest) out.push(rest)
  }
  return out
}

// ── 이중 언어 본문 파싱(2026-08-09, 운영자 지시) ─────────────────────────
// 운영자가 "영어 문장 다음 줄에 한국어 번역" 형식으로 붙여넣는 본문에서
// 영어 문장 ↔ 한국어 번역을 1:1로 짝짓는다.
//
// 불변식:
//   - 번역을 "생성/의역"하지 않는다 — 입력된 한국어 줄을 그대로 연결만
//     한다(trim 외 무수정). 확실하게 짝지을 수 없으면 ko=null(미매칭)로
//     돌려 UI가 "미매칭"을 표시하게 한다 — 임의 추측 금지.
//   - 영어 문장 분리는 기존 splitIntoSentences를 그대로 재사용(원문 보존
//     불변식 포함) — 영어 전용 본문의 기존 동작은 이 함수를 안 타므로 불변.
//
// 규칙:
//   1) 줄 분류: 한글([가-힣])이 포함된 줄 = 한국어 줄, 그 외 비어있지 않은
//      줄 = 영어 줄. 빈 줄은 블록 경계일 뿐 문장으로 세지 않는다.
//   2) 연속된 같은 언어 줄은 한 블록으로 병합(화면 줄바꿈으로 나뉜 한
//      문장/번역 대응) — 공백 1칸으로 잇는다.
//   3) 영어 블록 → 바로 뒤 한국어 블록을 짝으로 본다.
//   4) 영어 블록이 여러 문장이면 한국어 블록도 같은 분리기로 나눠 문장 수가
//      정확히 일치할 때만 순서대로 1:1 — 다르면 그 블록 전체 미매칭(ko=null).
//      영어 블록이 1문장이면 한국어 블록 전체(여러 줄 병합)를 그 번역으로.
//   5) "Man: ..."/"남자: ..." 화자 표시 줄도 1)의 분류로 자연 처리된다.
//
// 반환: { pairs: [{ en, ko }], hasKorean }
//   hasKorean=false면(한국어 줄이 하나도 없음) 호출부는 기존 영어 전용
//   경로(splitIntoSentences)를 그대로 쓰면 된다.
const HANGUL_RE = /[가-힣]/

export function parseBilingualPassage(text) {
  const lines = String(text || '').split(/\r?\n/)
  // 1) 줄 → 블록(연속 같은 언어 병합, 빈 줄은 경계)
  const blocks = []
  let cur = null
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) { cur = null; continue }
    const lang = HANGUL_RE.test(line) ? 'ko' : 'en'
    if (cur && cur.lang === lang) cur.text += ' ' + line
    else { cur = { lang, text: line }; blocks.push(cur) }
  }
  const hasKorean = blocks.some((b) => b.lang === 'ko')
  if (!hasKorean) {
    return { pairs: splitIntoSentences(String(text || '')).map((en) => ({ en, ko: null })), hasKorean: false }
  }

  // 2) 영어 블록 ↔ 직후 한국어 블록 짝짓기
  const pairs = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.lang !== 'en') continue // 선행 영어 없는 한국어 블록은 짝 없음 — 버리지 않고 무시(문장 아님)
    const next = blocks[i + 1]
    const koBlock = next && next.lang === 'ko' ? next.text : null
    const enSentences = splitIntoSentences(b.text)
    if (enSentences.length === 0) continue
    if (!koBlock) {
      enSentences.forEach((en) => pairs.push({ en, ko: null }))
      continue
    }
    if (enSentences.length === 1) {
      pairs.push({ en: enSentences[0], ko: koBlock })
      continue
    }
    // 영어 여러 문장 + 한국어 블록 — 문장 수가 정확히 일치할 때만 1:1.
    const koSentences = splitIntoSentences(koBlock)
    if (koSentences.length === enSentences.length) {
      enSentences.forEach((en, k) => pairs.push({ en, ko: koSentences[k] }))
    } else {
      // 불일치 — 임의 배분하지 않고 전부 미매칭(운영자 지시 11).
      enSentences.forEach((en) => pairs.push({ en, ko: null }))
    }
  }
  return { pairs, hasKorean: true }
}

// 재분석 시 한국어 해석 병합 규칙(운영자 지시 — 수동 입력 우선):
// 관리자가 손으로 입력/수정한 값(manual)이 있으면 자동 매칭값(auto)이
// 절대 덮어쓰지 않는다. manual이 비어 있을 때만 auto를 채운다.
export function preferManualKo(manual, auto) {
  const m = typeof manual === 'string' ? manual.trim() : ''
  if (m) return manual
  return auto || ''
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 흔한 불규칙 동사/명사 형태(2026-08-09 야간 2차 — 보수적 확장).
// 원형 → 변화형 목록. 여기서 나온 매칭도 전부 'inflected'(검토 필요)로만
// 표시되고 자동 저장되지 않는다(운영자 원칙: 확실하지 않으면 자동 확정
// 금지 — 이 목록은 "추측"이 아니라 고정된 사전이므로 recall만 높인다).
// 목록은 중학 교과서 빈출 위주 최소 유지 — 확장은 append만.
const IRREGULAR_FORMS = {
  be: ['is', 'are', 'was', 'were', 'been', 'being', 'am'],
  become: ['became', 'becomes', 'becoming'],
  begin: ['began', 'begun', 'begins', 'beginning'],
  break: ['broke', 'broken', 'breaks', 'breaking'],
  bring: ['brought', 'brings', 'bringing'],
  build: ['built', 'builds', 'building'],
  buy: ['bought', 'buys', 'buying'],
  catch: ['caught', 'catches', 'catching'],
  choose: ['chose', 'chosen', 'chooses', 'choosing'],
  come: ['came', 'comes', 'coming'],
  do: ['did', 'done', 'does', 'doing'],
  draw: ['drew', 'drawn', 'draws', 'drawing'],
  drink: ['drank', 'drunk', 'drinks', 'drinking'],
  drive: ['drove', 'driven', 'drives', 'driving'],
  eat: ['ate', 'eaten', 'eats', 'eating'],
  fall: ['fell', 'fallen', 'falls', 'falling'],
  feel: ['felt', 'feels', 'feeling'],
  find: ['found', 'finds', 'finding'],
  fly: ['flew', 'flown', 'flies', 'flying'],
  forget: ['forgot', 'forgotten', 'forgets', 'forgetting'],
  get: ['got', 'gotten', 'gets', 'getting'],
  give: ['gave', 'given', 'gives', 'giving'],
  go: ['went', 'gone', 'goes', 'going'],
  grow: ['grew', 'grown', 'grows', 'growing'],
  have: ['had', 'has', 'having'],
  hear: ['heard', 'hears', 'hearing'],
  hold: ['held', 'holds', 'holding'],
  keep: ['kept', 'keeps', 'keeping'],
  know: ['knew', 'known', 'knows', 'knowing'],
  leave: ['left', 'leaves', 'leaving'],
  lose: ['lost', 'loses', 'losing'],
  make: ['made', 'makes', 'making'],
  meet: ['met', 'meets', 'meeting'],
  put: ['puts', 'putting'],
  read: ['reads', 'reading'],
  ride: ['rode', 'ridden', 'rides', 'riding'],
  run: ['ran', 'runs', 'running'],
  say: ['said', 'says', 'saying'],
  see: ['saw', 'seen', 'sees', 'seeing'],
  sell: ['sold', 'sells', 'selling'],
  send: ['sent', 'sends', 'sending'],
  sing: ['sang', 'sung', 'sings', 'singing'],
  sit: ['sat', 'sits', 'sitting'],
  sleep: ['slept', 'sleeps', 'sleeping'],
  speak: ['spoke', 'spoken', 'speaks', 'speaking'],
  spend: ['spent', 'spends', 'spending'],
  stand: ['stood', 'stands', 'standing'],
  swim: ['swam', 'swum', 'swims', 'swimming'],
  take: ['took', 'taken', 'takes', 'taking'],
  teach: ['taught', 'teaches', 'teaching'],
  tell: ['told', 'tells', 'telling'],
  think: ['thought', 'thinks', 'thinking'],
  throw: ['threw', 'thrown', 'throws', 'throwing'],
  understand: ['understood', 'understands', 'understanding'],
  wear: ['wore', 'worn', 'wears', 'wearing'],
  win: ['won', 'wins', 'winning'],
  write: ['wrote', 'written', 'writes', 'writing'],
  child: ['children'],
  foot: ['feet'],
  tooth: ['teeth'],
  man: ['men'],
  woman: ['women'],
  mouse: ['mice'],
  leaf: ['leaves'],
  life: ['lives'],
}

// 규칙 형태 변화 + 불규칙 사전(단일 토큰용). 반환에는 원형 자신이 포함되지
// 않는다 — 원형은 'exact' 매칭 전용.
export function regularInflections(token) {
  const w = String(token || '').trim().toLowerCase()
  if (!w || /\s/.test(w)) return []
  const forms = new Set(IRREGULAR_FORMS[w] || [])
  // 3인칭/복수: -s / -es / y→ies
  forms.add(`${w}s`)
  forms.add(`${w}es`)
  if (/[^aeiou]y$/.test(w)) forms.add(`${w.slice(0, -1)}ies`)
  // 과거/과거분사: -ed / e끝+d / y→ied
  forms.add(`${w}ed`)
  if (w.endsWith('e')) forms.add(`${w}d`)
  if (/[^aeiou]y$/.test(w)) forms.add(`${w.slice(0, -1)}ied`)
  // 진행형: -ing / e탈락+ing
  forms.add(`${w}ing`)
  if (w.endsWith('e') && !w.endsWith('ee')) forms.add(`${w.slice(0, -1)}ing`)
  forms.delete(w)
  return [...forms]
}

// 단어/숙어 하나에 대한 매칭 패턴 목록.
// 반환: [{ re: RegExp, matchType: 'exact' | 'inflected' }]
//  - 단일 단어: 원형 whole-word(exact) + 규칙 변화형 whole-word(inflected)
//  - 숙어/구동사: 토큰별 whole-word를 \s+로 이은 연쇄(exact). 형태 변화는
//    첫 토큰(구동사의 동사 자리)에만 규칙 변화를 적용(inflected) — 나머지
//    토큰까지 조합 변화시키면 오탐 위험이 커져서 보수적으로 제한한다.
export function buildMatchers(word) {
  const tokens = String(word || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const matchers = []
  // form: 매칭에 실제로 쓰인 표면형(소문자) — matchWordsToSentences가 유닛 내
  // 다른 단어의 변화형과 겹치는지(AMBIGUOUS) 판정할 때 키로 쓴다.
  if (tokens.length === 1) {
    const base = tokens[0].toLowerCase()
    matchers.push({ re: new RegExp(`\\b${escapeRegex(tokens[0])}\\b`, 'i'), matchType: 'exact', form: base })
    for (const form of regularInflections(tokens[0])) {
      matchers.push({ re: new RegExp(`\\b${escapeRegex(form)}\\b`, 'i'), matchType: 'inflected', form })
    }
  } else {
    const rest = tokens.slice(1).map(escapeRegex).join('\\s+')
    const baseForm = tokens.join(' ').toLowerCase()
    matchers.push({ re: new RegExp(`\\b${escapeRegex(tokens[0])}\\s+${rest}\\b`, 'i'), matchType: 'exact', form: baseForm })
    for (const form of regularInflections(tokens[0])) {
      matchers.push({ re: new RegExp(`\\b${escapeRegex(form)}\\s+${rest}\\b`, 'i'), matchType: 'inflected', form: `${form} ${tokens.slice(1).join(' ').toLowerCase()}` })
    }
  }
  return matchers
}

// matchWordsToSentences(words, sentences)
//   words: [{ id?, word }](wordLibrary words 행 또는 {word} 최소형)
//   sentences: splitIntoSentences 결과
// 반환: [{ word, wordId, matches: [{ sentenceIndex, sentence, matchType }] }]
//   matchType 4단계 분류(2026-08-09 확장, 운영자 지시):
//     'exact'     — 원형이 문장에 그대로 존재(저장 가능)
//     'inflected' — SAFE_INFLECTION: 변화형으로만 존재하고 그 변화형이
//                   유닛 내 이 단어에만 속함(검토 필요 표시)
//     'ambiguous' — 변화형이 유닛 내 다른 단어의 변화형/원형과도 겹침
//                   (예: leaves = leaf 복수 ∧ leave 3인칭) — 더 강한 검토 필요
//     (NOT_FOUND  — matches 빈 배열, UI가 미발견 구획으로 분리)
//   문장당 최대 1건(원형과 변화형이 같이 있으면 'exact' 우선).
export function matchWordsToSentences(words, sentences) {
  const sents = Array.isArray(sentences) ? sentences : []
  const list = (Array.isArray(words) ? words : [])
    .map((w) => ({ raw: w, text: String(w?.word || '').trim() }))
    .filter((w) => w.text)

  // 표면형 → 소유 단어 집합(유닛 범위) — AMBIGUOUS 판정용. 원형 자신도
  // 소유 표면형에 포함한다(다른 단어의 변화형이 어떤 단어의 원형과 겹치는
  // 경우도 중의적이므로 — 예: 유닛에 saw(톱)와 see가 같이 있으면 "saw"는
  // see의 exact가 아니라 saw의 exact/see의 ambiguous).
  const formOwners = new Map()
  const own = (form, owner) => {
    const key = String(form).toLowerCase()
    if (!formOwners.has(key)) formOwners.set(key, new Set())
    formOwners.get(key).add(owner)
  }
  for (const { text } of list) {
    for (const m of buildMatchers(text)) own(m.form, text.toLowerCase())
  }

  return list.map(({ raw, text }) => {
    const matchers = buildMatchers(text)
    const matches = []
    sents.forEach((sentence, sentenceIndex) => {
      let best = null // { matchType, form }
      for (const { re, matchType, form } of matchers) {
        if (!re.test(sentence)) continue
        if (matchType === 'exact') { best = { matchType, form }; break }
        best = best || { matchType, form }
      }
      if (!best) return
      let finalType = best.matchType
      if (finalType === 'inflected' && (formOwners.get(best.form)?.size || 0) > 1) {
        finalType = 'ambiguous'
      }
      matches.push({ sentenceIndex, sentence, matchType: finalType })
    })
    return { word: text, wordId: raw?.id || null, matches }
  })
}

// 중복 판정 키 — "같은 target_word + example_en(공백 정규화, 대소문자 무시)"
// 조합. TextImportPanel이 (교재+Unit으로 조회한) 기존 예문 집합과 새 후보를
// 같은 키로 비교해 "이미 등록된 예문"을 표시/저장 차단한다. 교재/Unit
// 범위는 키가 아니라 조회 범위로 걸러진다(운영자 지시 11번 조합과 동일).
export function duplicateKey(targetWord, englishSentence) {
  const w = String(targetWord || '').trim().toLowerCase()
  const s = String(englishSentence || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return `${w}#${s}`
}
