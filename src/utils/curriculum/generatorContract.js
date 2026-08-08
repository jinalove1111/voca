// src/utils/curriculum/generatorContract.js — Curriculum Engine "AI-Ready
// 인터페이스"의 순수 계약(docs/CURRICULUM_ENGINE.md §4).
//
// import 제약: curriculumModel(순수 모델) + textbookExampleModel(기존 검증된
// 순수 prototype 로직, 재구현 금지)만 import한다. React/Supabase/네트워크
// 무의존 — 어떤 생성기 구현체(규칙 기반이든 AI든)도 이 계약 위에서만
// 동작해야 하고, 이 파일 자체는 아무 것도 호출/생성하지 않는다.
import { validateExampleFields } from './curriculumModel'
import { checkAnswer } from '../textbookExampleModel'

// ── generateCandidateExamples(context) — 규칙 기반 구현(2026-08-09) ────────
// 설계 문서 §4 "규칙 기반 생성기가 먼저 구현 가능"의 첫 구현체.
// AI 호출 0(CLAUDE.md 규칙 7 — 무료 대안 우선): 새 문장을 "생성"하지 않고,
// 호출자가 주입한 기존 단어 자산(words.example_text — Word Asset 시스템이
// 이미 만들어 둔 단어별 예문)을 후보로 재활용한다. 이 파일의 순수성
// (React/Supabase/네트워크 무의존)은 그대로다 — IO(단어 자산 조회)는
// 호출자(TextImportPanel 등)의 책임이고, 여기는 값→값 변환만 한다.
//
// context: {
//   unitId?, textbookId?, grammarPointIds?, difficulty?,           // 예약
//   targetWords?: string[],   // 후보가 필요한 단어들(없으면 wordAssets 전체)
//   wordAssets?: [{ word, exampleText, exampleTranslation? }],
//     // 호출자가 조회해 넘기는 기존 자산(curriculumApi.listUnitWords 형태).
//     // 이 키가 없으면 Phase 0 계약 그대로 not_implemented를 반환한다
//     // (하위 호환 — 기존 호출부/하네스 단언 무변경).
// }
// 반환: { ok, reason?, candidates: [{ targetWord, englishSentence,
//         koreanTranslation, difficulty, rationale }] }
// 후보는 reviewCandidate(아래)를 통과한 것만 담는다 — whole-word 불변식
// 위반(자산 예문에 단어 원형이 없음)이나 금칙 톤 의심 후보는 여기서
// 걸러진다. 승인 전이는 여전히 이 파일에 없다(auto-publish 구조적 차단).
export async function generateCandidateExamples(context) {
  const c = context || {}
  if (!Array.isArray(c.wordAssets)) {
    return { ok: false, reason: 'not_implemented', candidates: [] }
  }
  const wanted = Array.isArray(c.targetWords) && c.targetWords.length > 0
    ? new Set(c.targetWords.map((w) => String(w || '').trim().toLowerCase()))
    : null
  const candidates = []
  for (const asset of c.wordAssets) {
    const word = String(asset?.word || '').trim()
    if (!word) continue
    if (wanted && !wanted.has(word.toLowerCase())) continue
    const sentence = String(asset?.exampleText || '').trim()
    if (!sentence) continue
    const candidate = {
      targetWord: word,
      englishSentence: sentence,
      koreanTranslation: asset?.exampleTranslation ? String(asset.exampleTranslation).trim() : null,
      difficulty: 1,
      rationale: '기존 단어 자산(words.example_text) 재사용 — 규칙 기반, AI 호출 0',
    }
    if (reviewCandidate(candidate).ok) candidates.push(candidate)
  }
  if (candidates.length === 0) return { ok: false, reason: 'no_valid_candidates', candidates: [] }
  return { ok: true, candidates }
}

// ── 금칙 톤 사전(placeholder) ───────────────────────────────────────────
// docs/reading/07-encouragement-messages.md "톤 가이드"의 제품 불변식
// ("징벌/압박/죄책감 언어 0" — 마감 압박·상실 위협·비교·질책 표현 배제)을
// 예문/생성 후보 검수에도 그대로 적용한다. 여기 나열된 단어는 완전한
// 금칙어 목록이 아니라(그런 목록은 콘텐츠 팀이 확장할 자리) 최소
// placeholder다 — reviewCandidate가 이 목록에 걸리는 후보를 자동
// 거부하지는 않고(오탐 위험), errors에 경고로만 담아 사람 검수를
// 유도한다.
const FORBIDDEN_TONE_HINTS = ['혼나', '벌점', '창피', '꼴찌', '너만', '시간이 없', '빨리 안 하면']

function findForbiddenToneHints(text) {
  const hay = String(text || '')
  return FORBIDDEN_TONE_HINTS.filter((w) => hay.includes(w))
}

// ── reviewCandidate(candidate) — 순수 규칙 검증 ────────────────────────
// candidate: { targetWord, englishSentence, koreanTranslation?, grammarPointId?,
//              difficulty?, rationale? }
// validateExampleFields(curriculumModel)의 필드 계약(target_word/
// english_sentence 등 snake_case)에 맞춰 후보를 매핑해 재사용한다 — 같은
// 검증 로직을 여기서 다시 구현하지 않는다(중복 금지 원칙, §1.1과 대칭).
export function reviewCandidate(candidate) {
  const c = candidate || {}
  const { ok, errors } = validateExampleFields({
    target_word: c.targetWord,
    english_sentence: c.englishSentence,
    difficulty: c.difficulty,
  })
  const toneHints = [
    ...findForbiddenToneHints(c.englishSentence),
    ...findForbiddenToneHints(c.koreanTranslation),
    ...findForbiddenToneHints(c.rationale),
  ]
  const allErrors = [...errors]
  if (toneHints.length > 0) {
    allErrors.push(`금칙 톤 의심 표현 발견(사람 검수 필요): ${toneHints.join(', ')}`)
  }
  return { ok: ok && toneHints.length === 0, errors: allErrors }
}

// checkAnswer는 이 계약 파일이 직접 쓰지는 않지만, import 규칙("curriculumModel
// + textbookExampleModel만")을 지키면서 향후 후보 자가검증(예: 생성기가 만든
// fill-blank 정답이 원문과 whole-word로 일치하는지) 확장 지점을 열어두기
// 위해 재export한다 — 호출하지 않는 채로 두면 lint가 미사용 import로 잡을
// 수 있어 아래처럼 명시적으로 재노출한다.
export { checkAnswer }

// ── approveExample / publishExample은 의도적으로 여기 없음 ────────────────
// 설계 문서 §4: "AI가 DB 구조 변경 없이 접합되는 이유" 중 하나가 "생성기
// 계약에는 approved로 전이하는 함수가 없어서 auto-publish가 구조적으로
// 불가능"이라는 것이다. approveExample/publishExample은
// src/utils/curriculum/exampleLibrary.js(IO 계층, 교사 액션 전용)에만
// 존재하고, 그 함수들은 canTransition(curriculumModel)으로 전이 유효성을
// 검사한 뒤 DB에 쓴다. 이 파일(순수 계약)이 그 함수들을 아예 갖지 않는 것
// 자체가 안전장치다 — 생성기 구현체가 이 계약만 따르는 한, 어떤 생성기도
// "검수 없이 스스로 승인"할 수 있는 함수를 호출할 방법이 없다.
