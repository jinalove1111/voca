// Excel/PDF 업로드 헤더 잔재 방지 — 순수 로직 (React/외부 의존 없음)
//
// [2026-09-02] 재발 방지 배경: 헤더가 정상 인식된(hasHeader=true) 파일 안에
// 시트 병합/페이지 구분으로 생긴 "반복 헤더 행"이 rows.slice(1) 이후에도
// 남아 word="Word"/meaning="Meaning" 같은 헤더 라벨 그대로 데이터로
// 파싱되고, unit 칸도 순수 헤더 라벨("Unit")이면 그대로 유닛 이름이 되어
// setClassWords -> ensureUnit 이 이름 "Unit" 1단어 유령 유닛을 만들었다
// (운영 DB 실사고: "Unit"×6, "Unit1"×1). 기존 안전망(AdminScreen.jsx의
// `!hasHeader && rowIdx <= leadingHeaderEnd` 조건부 필터)은 hasHeader=true
// 경로와 무관해 이 반복 헤더 행을 못 막았다.
//
// 이 모듈은 AdminScreen.jsx의 HEADER_ALIASES를 단일 원천으로 재수출하고,
// hasHeader 여부·행 위치와 무관하게 "행 전체가 헤더 잔재"인지 판정하는
// 순수 함수만 제공한다. React 컴포넌트/상태와 무관하므로 node에서 바로
// import해 테스트할 수 있다(scripts/testExcelHeaderResidue.mjs).

// Column mapping is ALWAYS by header name, never by position/guessing — a
// "No" column (row numbers 1, 2, 3...) was previously being mistaken for a
// class name column, which created bogus classes literally named "1", "2",
// etc. The class a word belongs to always comes from the class selected in
// the admin UI (selectedClass), never from anything in the file.
export const HEADER_ALIASES = {
  // [2026-08-25 재발 방지] 실사고 6건에서 실제로 관측된 헤더 라벨을 추가한다.
  // 교재 9개 중 6개에 이름이 "Unit"이고 단어가 1개뿐인 가짜 유닛이 있었고,
  // 그 1개 단어의 정체는 전부 헤더 라벨이었다("English"/"Korean" 5건,
  // "Word / Phrase"/"뜻" 1건). 이 라벨들이 별칭에 없어 hasHeader가 false가
  // 되고, 헤더 행이 rows.slice(1)로 잘리지 않은 채 데이터로 편입됐다.
  // 추가만 한다 — 기존 별칭이 매칭되던 파일의 인식 결과는 그대로다.
  // 의도적 제외: '영어'/'한글'처럼 흔한 낱말은 넣지 않는다. 실제 어휘 행
  // ("English"/"영어")이 헤더로 오인돼 통째로 버려지는 것을 막기 위해서다.
  word:    ['word', '단어', '영단어', 'word / phrase', 'word/phrase', 'english', '영어·어구', '어휘·어구'],
  meaning: ['meaning', '뜻', '의미', '한글뜻', 'korean'],
  unit:    ['unit', '유닛', '단원'],
  // "no"/"번호" is recognized only so it can be explicitly ignored — it's
  // a row number, never a word/meaning/class.
  // [2026-09-02] 'no.'(마침표 포함) 추가 — 실사고 3건 중 하나가 실제로
  // "No."(마침표 포함) 헤더 셀을 썼다(진단 근거: word="No." / meaning=
  // "어휘·어구"). isHeaderLabel은 완전일치만 하므로 변형은 별칭에 직접
  // 추가한다(영어 단어가 "no."일 확률은 사실상 0 — 오차단 위험 없음).
  no:      ['no', '번호', 'no.'],
  // M3c(2026-08-05) — 전부 선택 컬럼(없어도 기존과 100% 동일 동작). 헤더가
  // 명시적으로 있을 때만 인식된다 — 헤더 미검출 시의 위치 추정 폴백
  // (parseExcelRows의 "no header" 분기)은 word/meaning/unit 3종만 다루고
  // 이 4개는 절대 추정하지 않는다(지어내지 않음).
  example:            ['example', '예문', '영어예문'],
  exampleTranslation: ['example_translation', '예문번역', '해석'],
  partOfSpeech:       ['pos', 'part_of_speech', '품사'],
  cefr:               ['cefr', '레벨', '난이도등급'],
}

// [2026-08-25 재발 방지] 위 별칭 전부를 합친 헤더 라벨 집합. 위치 추정
// 경로(헤더 미검출)에서 "첫 행이 사실은 헤더였다"를 판정하는 데만 쓴다 —
// 컬럼 매핑에는 관여하지 않는다.
export const HEADER_LABELS = new Set(Object.values(HEADER_ALIASES).flat())

// trim + 소문자 완전일치. kind를 주면 그 종류(word/meaning/unit/no/...)의
// 별칭에만 속하는지 확인하고, kind를 생략하면 8종 전체(HEADER_LABELS)
// 어디에든 속하는지 확인한다(AdminScreen의 기존 단일 인자 호출과 동일).
export function isHeaderLabel(cell, kind) {
  const s = String(cell ?? '').trim().toLowerCase()
  if (kind) return (HEADER_ALIASES[kind] || []).includes(s)
  return HEADER_LABELS.has(s)
}

// [2026-09-02] 반복 헤더 행 판정 — word와 meaning이 "둘 다" 어떤 종류든
// 헤더 라벨이면 true. 한쪽만 라벨이면 실제 어휘일 수 있으므로(예:
// word="unit", meaning="단위(측정)") 절대 false로 유지한다 — 조건은 AND.
export function isHeaderResidueRow({ word, meaning }) {
  return isHeaderLabel(word) && isHeaderLabel(meaning)
}

// [2026-09-02] 유닛 칸 헤더 라벨 제거 — 유닛 칸 값이 숫자 없는 순수 유닛
// 라벨("unit"/"유닛"/"단원", 대소문자·공백 무시)이면 ''를 반환해 기존
// `unit || 'Unit 1'`/이전 유닛 상속 폴백이 작동하게 한다. "Unit 3"처럼
// 숫자가 포함된 값은 정상 유닛명이므로 그대로 반환한다.
export function sanitizeUnitLabel(unitCell) {
  const raw = unitCell == null ? '' : String(unitCell)
  const s = raw.trim().toLowerCase()
  if (HEADER_ALIASES.unit.includes(s)) return ''
  return raw
}
