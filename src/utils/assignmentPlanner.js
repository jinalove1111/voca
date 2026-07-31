// src/utils/assignmentPlanner.js
//
// 숙제 "자동 생성" 순수 플래너 — 외부 DB 클라이언트/React 의존성 0,
// weeklyReport.js와 동일한 순수성 원칙(번들링 없이 plain node로 바로 실행
// 가능, 새 네트워크 호출 절대 없음, 무작위 함수를 전혀 쓰지 않는 완전
// 결정론). 이 파일은 "다음 배정에 어떤 단어 슬러그를 채울지"만 결정한다 —
// 실제 저장은 항상 호출부(AdminScreen.jsx)가 기존 setTodaysAssignment/
// setAssignmentForDate(adminPin 듀얼패스, wordLibrary.js) 그대로 사용한다.
// 이 모듈 자체는 어떤 쓰기도, 어떤 원격 조회도 하지 않는다 — 순수
// 입력(unitWords/이력)만 받아 순수 출력(슬러그 배열)만 반환.
//
// 슬러그 규칙은 wordLibrary.js의 wordSlug()/AdminScreen.jsx의 wordSlug()와
// 완전히 동일해야 한다(같은 단어가 다른 슬러그로 계산되면 "이미 배정한
// 단어"를 못 알아보고 항상 새 단어로 오인한다) — 절대 바꾸지 말 것.
const wordSlug = (word) => word.toLowerCase().replace(/\s+/g, '_')

function normalizedSlugs(unitWords) {
  return (Array.isArray(unitWords) ? unitWords : [])
    .filter((w) => w && typeof w.word === 'string' && w.word.trim())
    .map((w) => wordSlug(w.word))
}

// recentAssignedSlugSets: Set<string>(또는 문자열 배열/이터러블) 여러 개를
// 하나로 합침 — 보통 "최근 N일 각 날짜의 배정 슬러그 집합" 리스트. 현재
// unitWords에 없는(단어 삭제/이름 변경 등으로 stale해진) 슬러그가 섞여
// 있어도 여기선 그냥 세트에 들어갈 뿐 — 아래 pickNextAssignment가 현재
// unitWords 기준으로만 훑으므로 자동으로 무시된다(크래시 없음).
function flattenRecentSlugs(recentAssignedSlugSets) {
  const set = new Set()
  for (const s of (recentAssignedSlugSets || [])) {
    for (const slug of s) set.add(slug)
  }
  return set
}

// 다음 배정 단어 count개 고르기 — 유닛 단어를 position 순서(unitWords 배열
// 순서 그대로, 호출부가 이미 position 정렬된 배열을 넘긴다는 전제) 그대로
// 훑으며 최근 배정 이력(recentAssignedSlugSets)에 없는 슬러그부터 채운다.
// 유닛 전체를 이미 다 배정했으면(모든 슬러그가 최근 이력에 있음, 또는
// unitWords가 count보다 짧음) 처음부터 다시 돌아간다("복습 회차") — 학생이
// 배정 없이 방치되는 상황을 피하기 위해 unitWords가 실제로 비어있는
// 경우가 아니면 절대 빈 배열을 반환하지 않는다.
export function pickNextAssignment({ unitWords, recentAssignedSlugSets = [], count = 10 } = {}) {
  const slugs = normalizedSlugs(unitWords)
  const n = slugs.length
  const target = Math.max(0, Math.floor(Number(count)) || 0)
  if (n === 0 || target === 0) return []

  const recent = flattenRecentSlugs(recentAssignedSlugSets)
  const picked = []

  // 1차: 최근에 배정 안 된 슬러그를 position 순서대로(중복 없이) 채움.
  for (let i = 0; i < n && picked.length < target; i++) {
    const slug = slugs[i]
    if (!recent.has(slug)) picked.push(slug)
  }
  // 2차: 그래도 target을 못 채웠으면(유닛 전체가 이미 최근 이력에 있거나
  // 유닛 자체가 count보다 짧음) 처음부터 다시 순서대로 채운다("복습
  // 회차") — 여기서는 중복을 허용한다(그렇지 않으면 count가 유닛 크기보다
  // 클 때 target을 영원히 못 채운다). 1차에서 이미 최대한 새 단어 위주로
  // 채웠으므로, 이 단계에서 생기는 중복은 "리뷰"라는 의도된 동작이다.
  let i = 0
  while (picked.length < target) {
    picked.push(slugs[i % n])
    i++
  }
  return picked
}

// 여러 날짜에 걸친 일괄 배정 계획 — date k는 "date 0..k-1까지 이번
// 일괄계획에서 이미 배정한 슬러그 전부 + 원래 넘어온 최근 이력"을 최근
// 이력으로 삼아 pickNextAssignment를 그대로 재사용한다(창 계산 로직을
// 새로 만들지 않고 위 단일 진실 원천을 그대로 반복 적용) — 그 결과 date
// 0은 이력 이후 첫 구간, date 1은 그 다음 구간, ... 순서로 유닛 단어를
// 겹치지 않게 나눠 갖다가 유닛을 다 쓰면 자동으로 처음부터 다시
// 돈다(복습 회차) — pickNextAssignment와 완전히 동일한 규칙을 날짜
// 경계마다 반복 적용한 것뿐이라 항상 결정론적이다(같은 입력 -> 같은
// 출력, 무작위/현재 시각 참조 등 비결정 요소 전혀 없음).
export function planBulkDates({ unitWords, recentAssignedSlugSets = [], dates = [], count = 10 } = {}) {
  const result = {}
  const dateList = Array.isArray(dates) ? dates : []
  let history = [...(recentAssignedSlugSets || [])]
  for (const d of dateList) {
    const picked = pickNextAssignment({ unitWords, recentAssignedSlugSets: history, count })
    result[d] = picked
    history = [...history, new Set(picked)]
  }
  return result
}
