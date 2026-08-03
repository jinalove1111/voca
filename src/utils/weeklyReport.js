// wordLibrary.js의 localIsoDateStr()과 완전히 동일한 로직을 여기 그대로
// 복제(공용 함수로 import하지 않음) — 이 파일은 원래 "의존성 0개, 어떤
// 번들링도 없이 바로 node로 실행 가능"이 불변조건이었다
// (scripts/testWeeklyReport.mjs 헤더 참고). wordLibrary.js는
// import.meta.env/Supabase를 물고 있어서 plain Node가 못 읽는데, 여기서
// import 한 줄만 추가해도 그 불변조건이 깨져서 테스트가 번들링 없이는
// 아예 못 돌게 된다(2026-07-10 밤에 실제로 이걸로 회귀 한 번 만들었다가
// 바로 잡음). 로직 자체가 4줄짜리 순수 함수라 복제 비용이 낮음 — DRY보다
// "테스트를 계속 가장 단순하게 실행 가능한 상태로 유지" 쪽을 택함.
//
// Parent Motivation(2026-07-19, 게임화 하위카드 10번, GAME_DESIGN.md 14번
// 섹션) — 아래 두 import는 예외적으로 허용된다. ticketEconomy.js/
// houseSystem.js는 wordLibrary.js와 달리 완전한 순수 모듈(React 없음,
// import.meta.env 없음, Supabase 없음 — 자기 파일 헤더가 스스로 이렇게
// 명시하고, scripts/testTicketEconomy.mjs·scripts/testHouseSystem.mjs가
// 이미 plain node로 직접 import해서 증명함)이라 이 파일을 import해도 위
// "번들링 없이 바로 node 실행 가능" 불변조건이 깨지지 않는다(wordLibrary.js
// 임포트만 위험했던 것). 운영자 지시("각 유틸의 기존 export를 그대로
// 재사용해라 — 로직 복붙 금지")에 따라 sumTicketBalance/getHouseById를
// 그대로 재사용한다.
import { sumTicketBalance } from './ticketEconomy.js'
import { getHouseById } from './houseSystem.js'

// M4b(2026-08-04) Cleared Stars — useStudent.js가 export하는
// CLEARED_STAR_PER_WORD(=1)의 값만 복제한다(위 localIsoDateStr과 동일한
// 이유 — useStudent.js는 React 훅 파일이라 import하면 "번들링 없이 bare
// node 실행 가능" 불변조건이 깨진다). 값을 바꿀 일이 있으면 반드시 두
// 파일을 함께 갱신해야 한다 — useStudent.js 쪽 헤더 주석에도 동일하게
// 명시.
const CLEARED_STAR_PER_WORD = 1

function localIsoDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 2026-07-10 — AdminScreen.jsx(관리자 대시보드)와 ParentScreen.jsx(학부모
// 화면) 둘 다 fetchDashboardData()가 반환한 원본 row(progress + dailyRows)
// 에서 정확히 같은 파생값(오늘 공부 여부/숙제완료/퀴즈정답률/많이틀린단어
// 등)을 계산해야 한다. 예전엔 이 계산이 AdminScreen.jsx 안에만 있었는데,
// 화면이 하나 더 생기면서 그대로 복붙하면 나중에 한쪽만 고치고 다른 쪽은
// 안 고쳐서 "관리자 화면과 학부모 화면 숫자가 다르다" 같은 버그가 생길
// 위험이 있다(오늘 밤 이미 캘린더/관리자 화면 사이에서 겪은 것과 같은
// 클래스). 그래서 공용 utils로 옮겨 두 화면이 항상 같은 함수를 쓰게 함.
// 순수 함수 — 새 Supabase 조회 없음, 이미 받아온 데이터만 가공.
//
// Parent Motivation(2026-07-19, 게임화 하위카드 10번) — 3번째 인자
// `houseId`로 티켓 잔액/하우스 소속을 파생 필드로 추가한다(기존 반환
// 필드는 전혀 안 건드림 — 새 필드 추가만, 기존 호출부는 3번째 인자 없이도
// 그대로 동작). 왜 `r`(fetchDashboardData의 반환 요소)에 houseId가 이미
// 없는데 새 쿼리를 안 만드는가 — house_id는 `students` 테이블 컬럼이라
// `fetchDashboardData`(student_progress/student_daily_progress만 조회)가
// 애초에 가져오지 않는다. 대신 앱이 시작할 때 이미 `refreshStudents()`로
// 캐시된 값(`wordLibrary.js`의 `getStudentById`)을 호출부가 넘겨주게 해서,
// 이 함수 자신은 여전히 "이미 받아온 데이터만 가공"하는 순수 함수로
// 남는다(호출부의 캐시 조회는 네트워크 요청이 아니다).
//
// 티켓 잔액은 새 인자 없이도 파생 가능하다 — `fetchDashboardData`가
// `student_progress`를 `select('*')`로 가져오므로 `r.progress.progress_data`
// (JSON blob, `ticketLedger` 포함)가 이미 여기 있다(`ticketEconomy.js`
// 헤더의 "저장 위치는 새 컬럼 없이 progress_data 재사용" 판단 그대로).
//
// **의도적으로 이번 라운드에서 뺀 필드 — Rank/모자단계(`paulRankShared.js`
// `computeRankState`)**: GAME_DESIGN.md 14번 섹션 원문은 이 값도
// "`fetchDashboardData`가 이미 가져오는 `student_progress` 컬럼에서
// 파생"된다고 전제했지만, 실제 Paul Rank XP는 `student_progress.total_xp`
// (레거시 사본, `totalStars`와 같은 값)가 아니라 독립 원장
// `xp_ledger`/`xp_totals` VIEW에만 있다(2번 하위카드가 "별을 조용히 XP로
// 변환하지 말라"로 다르게 구현된 이후 사실 — 이 섹션 14가 쓰여진 시점보다
// 나중에 확정됨, `PROJECT_BOARD.md` "1단계 구현 완료" 항목 참고). 조회하려면
// `fetchXpTotal()`(신규 네트워크 호출)이 필요한데, 이번 작업 지시가
// "새 Supabase 쿼리 절대 금지"를 명시적으로 못박았다 — `total_xp`(=
// `totalStars`)로 대체 계산하면 AdminScreen/Dashboard가 실제로 보여주는
// Rank와 다른 값이 나올 위험이 있어(화면마다 다른 숫자 문제, 이 기능 자체가
// 막으려는 바로 그 사고), 정확하지 않은 값을 보여주는 대신 이번 라운드는
// 범위를 축소했다. 다음 라운드에서 `fetchXpTotal` 1회 재사용을 허용할지는
// 운영자/CTO 판단이 필요 — `handoff.md` 최신 세션 기록 참고.
// Phase 2 M4(2026-08-03) — 4번째 인자 `unitWordSlugs`(선택, 기본 빈 배열)로
// "Completed %"(학습 진행률)/"Cleared %"(실력 판단) 두 지표를 추가한다.
// 운영자 확정 정의(2026-08-03): completed = GuidedSession 필수 단계 전부
// 통과(학습 진행률), cleared = 퀴즈 1회 이상 정답(실력 판단) — 둘 다
// useStudent.js의 신규 병렬 필드(completedWords/clearedWords, 레벨업 미션
// 기반 기존 cleared/cleared_count와 완전히 별개 축)에서만 파생한다. 새
// Supabase 쿼리 0건 — `r.progress.progress_data`는 fetchDashboardData가
// 이미 `select('*')`로 가져오는 JSONB 컬럼이라 새 필드가 그 안에 있으면
// 추가 조회 없이 그대로 읽힌다(위 ticketBalance와 동일한 원칙).
//
// 분모는 "그 학생의 현재 유닛 단어 수"(unitWordSlugs.length) — 호출부
// (AdminScreen.jsx)가 wordLibrary.js의 getClassWords(className, unitName)로
// 계산한 슬러그 배열을 넘겨준다(이 파일 자신은 wordLibrary.js를 import하지
// 않는다 — 파일 헤더의 "번들링 없이 bare node 실행 가능" 불변조건 유지,
// houseId 인자와 동일한 패턴). unitWordSlugs를 안 넘기면(기존 호출부) 분모가
// 0이라 completedPct/clearedPct가 항상 null — 기존 반환 필드는 전혀 안
// 바뀐다(회귀 없음).
//
// 정직성 원칙: "새 신호가 아예 없는 구 학생"(progress_data 자체가 없거나
// 비어있는, 즉 한 번도 동기화 안 된 학생)과 "0%"를 구분해야 한다 —
// hasProgressData가 false면 화면은 "아직 기록 없음"을 보여줘야 하고,
// hasProgressData가 true인데 completedWords/clearedWords가 비어있으면
// 진짜 0%다. 두 경우 다 크래시 없이 안전하게 처리(asArray류 방어와 동일).
export function computeStudentStats(r, wordStatusSummary = {}, houseId = null, unitWordSlugs = []) {
  const today = r.dailyRows.find(d => d.date === localIsoDateStr())
  // "오늘 공부함" 기준은 categories_completed > 0이 아니라 오늘 날짜 row
  // 존재 여부다 — 단어 하나만 봐도(카테고리 미완료) 로컬 history는 이미
  // 오늘 기록을 만들고 그게 그대로 동기화되므로, row가 있다는 것 자체가
  // "동기화된 활동이 있었다"는 뜻이다(2026-07-10 관리자 대시보드 버그 수정 참고).
  const studiedToday = !!today
  const homeworkDone = (today?.categories_completed || 0) >= 4
  const last7 = r.dailyRows.slice(0, 7)
  const quizCorrect = r.dailyRows.reduce((s, d) => s + (d.quiz_correct || 0), 0)
  const quizTotal = r.dailyRows.reduce((s, d) => s + (d.quiz_total || 0), 0)
  const quizAccuracy = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : null
  const pronAttempts = r.dailyRows.reduce((s, d) => s + (d.pronunciation_attempts || 0), 0)
  const missCount = {}
  r.dailyRows.forEach(d => (d.missed_word_ids || []).forEach(id => { missCount[id] = (missCount[id] || 0) + 1 }))
  const topMissed = Object.entries(missCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const ws = (r.studentId && wordStatusSummary[r.studentId]) || { known: 0, unknown: 0, skipped: 0, mastered: 0 }
  const ticketBalance = sumTicketBalance(r.progress?.progress_data?.ticketLedger || [])
  const house = getHouseById(houseId)

  const progressData = r.progress?.progress_data
  const hasProgressData = !!(progressData && Object.keys(progressData).length > 0)
  const completedWords = Array.isArray(progressData?.completedWords) ? progressData.completedWords : []
  const clearedWords = Array.isArray(progressData?.clearedWords) ? progressData.clearedWords : []
  // Phase 2 M4a(2026-08-04, 관측 배선) — round.completedToday(신규, 일별
  // dedup 카운터, useStudent.js freshRound 헤더 참고)와 기존 wordsViewed를
  // 그대로 노출한다. 새 Supabase 쿼리 0건(progress_data는 이미 여기 select
  // 되어 있음, 위 completedWords/ticketBalance와 동일 원칙) — 순수 관측
  // 지표라 어떤 보상 판정에도 연결하지 않는다. round.date가 "오늘"(useStudent.js
  // todayStr()과 동일한 `new Date().toDateString()` 포맷)이 아니면 아직
  // 동기화 안 된 어제 이전 round라서 0으로 표시(마지막 동기화 시점의 값을
  // "오늘"로 잘못 표기하지 않기 위함) — student_daily_progress에는 이 값이
  // 없으므로 반드시 progress_data.round에서만 읽는다.
  const round = progressData?.round
  const roundIsToday = !!(round && round.date === new Date().toDateString())
  const todayCompletedCount = roundIsToday && Array.isArray(round.completedToday) ? round.completedToday.length : 0
  const todayWordsViewedCount = roundIsToday && Array.isArray(round.wordsViewed) ? round.wordsViewed.length : 0
  const unitSlugSet = new Set(Array.isArray(unitWordSlugs) ? unitWordSlugs : [])
  const unitSize = unitSlugSet.size
  const completedInUnitCount = completedWords.filter(w => unitSlugSet.has(w)).length
  const clearedWordInUnitCount = clearedWords.filter(w => unitSlugSet.has(w)).length
  // 분모(unitSize)가 0이면(호출부가 unitWordSlugs를 안 넘겼거나, 반/유닛에
  // 단어가 아직 없음) 퍼센트는 계산 불가 — null로 남겨 "0%"와 구분한다.
  const completedPct = unitSize > 0 ? Math.round((completedInUnitCount / unitSize) * 100) : null
  const clearedWordPct = unitSize > 0 ? Math.round((clearedWordInUnitCount / unitSize) * 100) : null
  // M4b(2026-08-04) Cleared Stars — clearedWords는 위에서 이미 파싱했으므로
  // 한 줄 파생 추가. 구 데이터(progress_data 자체가 없거나 clearedWords
  // 필드가 없는 학생)는 clearedWords가 빈 배열이라 자연히 0(크래시 없음).
  const clearedStars = clearedWords.length * CLEARED_STAR_PER_WORD

  return {
    today, studiedToday, homeworkDone, last7, quizCorrect, quizTotal, quizAccuracy, pronAttempts, topMissed, ws, ticketBalance, house,
    hasProgressData, unitSize, completedInUnitCount, clearedWordInUnitCount, completedPct, clearedWordPct,
    todayCompletedCount, todayWordsViewedCount, clearedStars,
  }
}

// v1.3 "학부모에게 보낼 수 있는 요약 문구" — 규칙 기반 템플릿으로만 생성
// (AI API 비용 없음, 프로젝트 표준 원칙: 무료로 가능한 방법을 우선 사용).
// AdminScreen.jsx의 대시보드가 이미 계산해둔 최근 7일치 수치를 그대로
// 받아 문장으로 조립만 함. 순수 함수 — Supabase/React 의존성 없음.
//
// Parent Motivation(2026-07-19) — `ticketBalance`/`house`는 둘 다 선택
// 인자(기본 undefined/null)라 기존 호출부(AdminScreen.jsx 등, 이 두 값을
// 안 넘기는 곳)는 출력이 완전히 그대로다(회귀 없음 — scripts/
// testWeeklyReport.mjs 기존 3개 시나리오 문자열이 1바이트도 안 바뀜).
// 값이 있을 때만("압박이 아니라 성장" 원칙, PAUL_PRINCIPLES.md 7번)
// 성장 지표 1~2줄을 조건부로 덧붙인다 — 순위/경쟁 언급 없음(House 소속만
// 표시, 팀 점수/등수는 넣지 않음).
export function buildWeeklyReport({ name, last7, quizAccuracy, quizCorrect, quizTotal, pronAttempts, progress, topMissed, wordLookup, ticketBalance, house }) {
  const totalDays = last7.length
  const doneDays = last7.filter(d => d.categories_completed >= 4).length
  const good = []
  const improve = []

  if (totalDays > 0 && doneDays === totalDays) good.push('최근 학습일에 빠짐없이 숙제(오늘의 미션)를 완료했어요!')
  else if (doneDays > 0) good.push(`최근 ${totalDays}일 중 ${doneDays}일 숙제를 완료했어요.`)

  if ((progress?.streak || 0) >= 7) good.push(`연속 ${progress.streak}일째 꾸준히 공부하고 있어요!`)
  else if ((progress?.streak || 0) >= 3) good.push(`연속 ${progress.streak}일째 공부 중이에요.`)

  if (quizAccuracy !== null && quizAccuracy >= 80) good.push(`퀴즈 정답률이 ${quizAccuracy}%로 아주 높아요!`)
  if (pronAttempts >= 10) good.push(`발음 연습을 ${pronAttempts}번이나 열심히 했어요!`)
  if (good.length === 0) good.push('꾸준히 공부하려고 노력하고 있어요.')

  if (totalDays > 0 && doneDays < totalDays) improve.push(`숙제를 안 한 날이 ${totalDays - doneDays}일 있었어요.`)
  if (quizAccuracy !== null && quizAccuracy < 60) improve.push(`퀴즈 정답률(${quizAccuracy}%)을 더 올려볼 필요가 있어요.`)
  if (topMissed.length > 0) {
    const names = topMissed.slice(0, 3).map(([slug]) => wordLookup[slug]?.word || slug).join(', ')
    improve.push(`자주 틀리는 단어(${names})는 집에서 한 번 더 복습해주세요.`)
  }
  if (improve.length === 0) improve.push('특별히 부족한 점은 없어요. 아주 잘하고 있어요!')

  // Parent Motivation(2026-07-19) — 값이 실제로 있을 때만 추가(둘 다 없으면
  // 섹션 자체가 안 생김, 기존 리포트 형태 그대로 유지).
  const growth = []
  if (house) growth.push(`- ${house.emoji} ${house.name} 소속으로 함께 하고 있어요.`)
  if (typeof ticketBalance === 'number' && ticketBalance > 0) growth.push(`- 지금까지 모은 티켓: ${ticketBalance}개`)

  return [
    `${name} 학생 주간 학습 리포트`,
    '',
    // A11(2026-08-02, 라벨만) — 여기 나열되는 숫자는 last7(최근 활동
    // 있었던 최대 7개 기록일 — 학생이 뜸하게 공부하면 실제 달력 기준
    // "이번 주"보다 훨씬 과거까지 걸칠 수 있음)과, quizCorrect/quizTotal/
    // pronAttempts(fetchDashboardData가 읽어온 최대 60일 전체 누적, last7이
    // 아님)가 섞여 있다 — 둘 다 "이번 주"라는 표현과 실제 집계 창이 다르다.
    // 학부모에게 가는 문구라 과장 제거가 핵심(집계 로직/창은 절대 안 바꿈 —
    // CLAUDE.md 규칙 3, 재구현/재조사 없는 임의 변경 금지).
    '📚 최근 학습 기록',
    `- 숙제 완료: ${doneDays}/${totalDays}일`,
    `- 연속 학습: ${progress?.streak ?? 0}일째`,
    `- 누적 별: ${progress?.total_stars ?? 0}개 · 클리어한 단어: ${progress?.cleared_count ?? 0}개`,
    quizTotal > 0 ? `- 퀴즈: ${quizCorrect}/${quizTotal}문제 정답 (${quizAccuracy}%)` : '- 퀴즈: 최근 기록 없음',
    ...(growth.length > 0 ? ['', '🌱 성장 현황', ...growth] : []),
    '',
    '✅ 잘한 점',
    ...good.map(p => `- ${p}`),
    '',
    '💪 조금 더 노력하면 좋은 점',
    ...improve.map(p => `- ${p}`),
    '',
    '선생님이 항상 응원하고 있어요! 🌟',
  ].join('\n')
}
