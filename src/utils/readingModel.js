// src/utils/readingModel.js — Reading Foundation(v3.3) 순수 계산 레이어.
// import 0 (analyticsMath.js와 같은 관례) — Node 하네스(tests/harness/
// runReading.mjs)가 브라우저/Supabase 없이 직접 import해서 단언한다.
// I/O(Supabase)는 전부 src/utils/readingApi.js에만 있다.

// 지문 저장 전 검증. 반환: { ok: boolean, errors: string[] }
// 규칙: 제목 필수, 문장 최소 1개, 모든 문장의 english 비어있지 않음
// (korean은 선택 — 빈 문자열 허용).
export function validatePassage({ title, sentences } = {}) {
  const errors = []
  if (!title || !String(title).trim()) errors.push('제목을 입력해주세요.')
  const list = Array.isArray(sentences) ? sentences : []
  if (list.length === 0) errors.push('문장을 최소 1개 입력해주세요.')
  list.forEach((s, i) => {
    if (!s || !String(s.english ?? '').trim()) {
      errors.push(`${i + 1}번 문장의 영어 문장이 비어 있어요.`)
    }
  })
  return { ok: errors.length === 0, errors }
}

// DB에서 읽어온 문장 행들을 position 오름차순 정렬 후 0..n-1로 재색인.
// (position에 구멍/중복이 생겨도 화면·저장 순서가 항상 결정적이 되도록.)
// 입력을 변경하지 않고 새 배열/새 객체를 반환한다.
export function normalizeSentences(rows) {
  const list = Array.isArray(rows) ? rows : []
  return [...list]
    .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0))
    .map((r, i) => ({ ...r, position: i }))
}

// 목록에서 from 인덱스 항목을 to 인덱스로 이동한 새 배열을 반환(순수).
// 범위 밖 인덱스면 원본과 같은 내용의 새 배열을 그대로 반환(no-op).
export function movePosition(list, from, to) {
  const arr = Array.isArray(list) ? [...list] : []
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr
  const [item] = arr.splice(from, 1)
  arr.splice(to, 0, item)
  return arr
}

// 붙여넣기 도우미: 영어 본문 원문을 문장 단위로 나눈다.
// 정직한 한계(의도적 단순화): ./!/? 경계 단순 분할이라 "Mr. Kim" 같은
// 약어 뒤에서도 잘린다 — 관리자 편집기에서 분할 결과를 눈으로 확인·수정
// 하는 전제의 보조 도구이지 완전한 문장 분할기가 아니다. 결정적(같은
// 입력 → 항상 같은 출력)이고, 빈/공백 입력은 [] 반환.
export function splitPassageText(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return []
  // lookbehind 정규식을 쓰지 않는 이유: 구형 Safari에서 lookbehind는
  // 파싱 시점 SyntaxError라 번들 전체를 깨뜨릴 수 있다(관리자 전용
  // 기능이 학생 기기 안정성을 해치면 안 됨 — CLAUDE.md 규칙 1).
  // match 방식: "종결부호가 아닌 글자들 + 종결부호(연속 허용)" 덩어리로
  // 자른다. 종결부호 없는 꼬리 문장도 마지막 덩어리로 보존된다.
  const chunks = raw.match(/[^.!?]+[.!?]*/g) || []
  return chunks.map((s) => s.trim()).filter(Boolean)
}
