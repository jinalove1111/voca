/**
 * Feature Flag Configuration
 * 모든 기능의 ON/OFF를 관리합니다.
 * 추후 관리자 패널에서 동적으로 변경 가능하도록 설계되었습니다.
 */

// ── 2026-09-12 — Kinney Pilot A 사고: 크로스탭/저장 미검증 수정 ────────────
// 실사고: 관리자가 한 탭(Samsung Internet, Kinney 학생 반)에서 "🎯 기능"
// 패널로 paulTownV1을 켰고 저장도 됐지만(그 탭의 패널 체크박스는 켜짐으로
// 표시), 그 브라우저에서 이미 로그인 상태로 열려 있던 학생 탭은 여전히
// 구버전 Paul Town(내 마을 카드 없음)을 보여줬다. 근본 원인은 이 파일의
// `currentFeatures`가 페이지 인스턴스당 딱 한 번(모듈 최초 로드 시) 메모리에
// 캐시되고, `isFeatureEnabled`는 그 메모리만 읽는데, 다른 탭/기존에 열려
// 있던 인스턴스가 그 변경을 다시 읽어올 방법(storage 이벤트 리스너, 포커스/
// 가시성 재조회, 로그인 시 재조회)이 전혀 없었기 때문이다. 게다가
// `setFeatureEnabled`의 `localStorage.setItem`은 실패해도(용량 초과,
// 프라이빗 모드 등) 아무도 확인하지 않았다. 아래
// subscribeFeatures/refreshFeaturesFromStorage/notify + storage/visibility/
// pageshow 리스너 + setItem 후 read-back 검증이 이 사고의 최소 수정이다.
// (문서: docs/operations/PILOT_A_PRE_ENABLE_CHECKLIST_2026-09-12.md)

const listeners = new Set()
let version = 0
function notify() {
  version++
  listeners.forEach((l) => {
    try { l() } catch { /* 리스너 하나가 던져도 나머지는 계속 알림 */ }
  })
}

/**
 * features 변경(로컬 토글 또는 다른 탭에서의 refresh) 구독.
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export const subscribeFeatures = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** useSyncExternalStore 등에서 참조용으로 쓸 수 있는 버전 카운터. */
export const getFeaturesVersion = () => version

const DEFAULT_FEATURES = {
  // 교실 관리
  classManagement: false,
  classManagement_create: false,
  classManagement_edit: false,
  classManagement_delete: false,

  // 학생 관리
  studentManagement: false,
  studentManagement_register: false,
  studentManagement_edit: false,
  studentManagement_delete: false,
  studentAssignment: false,

  // 숙제 관리
  homework: false,
  homework_create: false,
  homework_submission: false,
  homework_stats: false,

  // 포인트 및 랭킹
  ranking: false,
  pointSystem: false,
  leaderboard: false,
  rewardSystem: false,

  // AI 학습 분석
  aiAnalysis: false,
  wrongAnswerNote: false,
  weakWordAnalysis: false,
  reviewRecommendation: false,

  // 학원 운영 기능
  classGroupManagement: false,
  semesterManagement: false,
  parentPortal: false,
  schoolDashboard: false,
  attendanceTracking: false,
  advancedAnalytics: false,

  // 애착 시스템 (Attachment & Growth, 2026-07-22) — 폴이지보카 장기
  // 성장/애착 시스템. 다른 플래그와 달리 학생 화면을 게이팅하므로 "완성된
  // v1 기능"은 기본 ON, 미완성 파운데이션은 기본 OFF. 이 플래그는 기기
  // 로컬(localStorage)이라는 기존 시스템 성질을 그대로 따른다 — 전역
  // 서버 플래그가 아님(끄면 그 기기에서만 꺼짐).
  attachmentHats: true,        // 모자 컬렉션(수집/장착) — v1 완성
  attachmentMuseum: true,      // 단어 박물관 — v1 완성
  attachmentAlbum: true,       // 성장 앨범/타임머신 — v1 완성
  attachmentPaulMemory: true,  // 폴의 기억(템플릿 기반, 실데이터만) — v1 완성
  attachmentWorldGarden: true, // 잉글리시 월드 1구역(정원) MVP — v1 완성
  attachmentWorldFull: false,  // 정원 이후 구역(집/다리/도서관/마을/왕국) UI — 파운데이션만, 미완성
  attachmentBookshelf: true,   // 개인 책장(Paul Town 도서관 화면) — 2026-07-22 월드 완성으로 ON
  attachmentStory: false,      // 이어지는 이야기 — 파운데이션만, 미완성

  // Paul Town v2.0 (2026-07-22) — 애착 시스템 v1 확장(재설계 아님). 모든
  // 데이터는 기존 진행 레코드에서 파생 — 새 Supabase 테이블/컬럼/화폐 없음.
  // (단어 박물관/성장 앨범은 위의 attachmentMuseum/attachmentAlbum이 그대로
  // Paul Town의 해당 기능 — 중복 플래그를 만들지 않는다.)
  paulMemoryV2: true,          // 폴의 기억 v2 — 템플릿 ≥15종 확장(실데이터만)
  todaysDiscovery: true,       // 오늘의 발견 — 하루 1개 결정론 메시지
  starToSeed: true,            // 별→씨앗 — 어제 별이 오늘 새싹(history 파생)
  hatCeremony: true,           // 모자 수여식 — 새 모자 획득 연출
  paulTownHomeBand: true,      // 홈 밴드 — Paul Town 한 줄 요약 띠
  paulTownGarden: true,
  productAnalytics: true,      // 익명 관찰 레이어 — 이벤트 수집(개인정보 0, SQL 미실행 시 무해 no-op)        // Paul Town 정원(기존 정원 엔진 재사용)
  paulTownBuildings: true,     // 도서관/박물관/시계탑 건물(마을=내비게이션) — 2026-07-22 월드 완성으로 ON. 주의: 관리자가 플래그를 저장한 적 있는 기기는 localStorage 스냅샷(false)이 이겨서 그 기기에선 여전히 꺼져 있을 수 있음(기기 로컬 플래그의 기존 한계)
  townShopV1: false, // Paul Town 별 상점 V1(책상 램프 1개) — 서버 권위 잔액/소유(star_purchases). OFF면 UI/네트워크 호출 0
  paulTownV1: false, // Paul Town V1(2026-09-11) — 내 마을/상점/보관함/배치. OFF면 UI·네트워크 호출 0(townShopV1과 독립)
  paulTownV2: false, // Paul Town V2-A(2026-09-13) — 스토리북 마을 장면 렌더러. townV1 자격(기기 플래그 OR Pilot A 허용목록)이 있을 때만 의미 있음. OFF면 V1 격자 그대로

  // Reading Foundation (2026-07-23, v3.3) — 유닛별 읽기 지문(passage).
  readingFoundation: true,     // 관리자 지문 편집기(AdminScreen 반 관리 → 유닛 펼침) — 관리자 전용 화면이라 기본 ON이 안전(학생 화면에 아무 영향 없음)
  readingStudentUI: false,     // 학생용 읽기 학습 화면 게이팅 플래그. GuidedSession.jsx(완료 카드의 "오늘의 핵심 문장" 오퍼)와 WordBrowser.jsx(문장 탭 노출)가 이미 isFeatureEnabled로 소비 중 — 기본 false라 두 곳 모두 오늘 화면 변화 0(2026-09-09 정정, 이후 운영자 승인 라운드에서 켤 자리)

  // Curriculum Engine Phase 0(2026-08-01, docs/CURRICULUM_ENGINE.md §8) —
  // 교사 opt-in 예문 학습 단계(제시→빈칸→듣기→섀도잉→쓰기, Learning Engine
  // 기반). readingStudentUI와 동일한 소비 메커니즘(isFeatureEnabled)을 쓴다.
  // 기본 false — 꺼져 있으면 App.jsx가 승인 예문 조회 자체를 안 하고
  // (fetch 0회), WordDetail.jsx는 curriculumExamples prop이 항상 null이라
  // STEPS 계산이 오늘과 바이트 단위로 동일하다(설계 §8). 운영자가
  // supabase_v3_13 실행 + 예문 승인 검토 후 켤 자리.
  curriculumExamplesStudentUI: false,

  // Writing Coach MVP(2026-08-09, docs/WRITING_COACH.md) — 학생이 오늘 단어로
  // 한 문장을 쓰고 로컬 규칙 검사기(src/utils/writing/, AI 호출 0)가 오류
  // 위치+힌트만 주는 Sentence Writing 화면. 기본 OFF — 꺼져 있으면
  // Dashboard의 진입 버튼 자체가 렌더되지 않아(readingStudentUI와 동일한
  // isFeatureEnabled 게이팅) 기존 학생 화면은 바이트 단위로 동일하다.
  // 저장용 SQL(sql_migrations/writing_coach_20260810_design.sql)은 설계만 —
  // 미실행이어도 이 기능은 DB 접근 0이라 완전히 동작한다.
  writingCoachEnabled: false,

  // 쓰기 답안 검토 AI 보조(Task 2, 2026-07-23, docs/operations/task2-writing-
  // analysis.md + task2-writing-report.md) — SpellingReviewQueuePanel(관리자
  // 전용)의 "AI 자동분류 미리보기" 버튼을 게이팅. 기본 OFF: (1) supabase_v3_6_
  // writing_review_ai_cache.sql과 Edge Function(supabase/functions/
  // grade-writing-answers) 배포 전에도 버튼 자체가 안 보여 안전, (2) 학생
  // 화면 무관(헌법 규칙 12), (3) 켜져 있어도 미리보기는 어떤 라이브 답안
  // status도 바꾸지 않고(preview-only), 실제 인정/무시는 여전히 기존 수동
  // 버튼(accept/dismiss)이 담당 — AI는 "제안"만 얹는다.
  // v1.1(2026-07-23, docs/operations/task2-writing-report.md v1.1 섹션):
  // 규칙 기반 분류가 이제 브라우저에서 먼저 돌고(Edge Function 미배포여도
  // 동작), 미해결 항목만 Edge Function으로 간다 — 그래도 기본값은 여전히
  // false로 유지한다(라이브 pending 100건+ 존재, v3_6/v3_7 SQL 미실행,
  // Edge Function 미배포, ANTHROPIC_API_KEY 미설정 — 전제조건 미충족).
  writingReviewAiAssist: false,

  // ── 쓰기 검수 오토파일럿(2026-08-01, 자기학습형 검토 파이프라인) ─────────
  // 전부 기본 false — 운영자가 명시적으로 켜야만 SpellingReviewQueuePanel이
  // 페이지 로드 시 규칙/AI 단계를 자동 실행하고 일부 티어를 자동 인정/
  // 무시한다. 셋 다 꺼져 있으면(기본 상태) 이 패널은 오늘과 완전히 동일하게
  // 동작한다(수동 그룹 인박스만, 자동 실행 0회).
  //
  // writingReviewAutoPilot — 패널 로드 시 규칙 단계(runRulesPhase)를 자동
  // 실행 + 티어①②(완전일치 exact_match/학습된 변형 synonym)를 자동 인정 +
  // (writingReviewAiAssist도 함께 켜져 있으면) AI 단계(runAiPhase)까지 자동
  // 실행하고 기존 selectCertainAccepts 게이트(신뢰도 95%↑ + 경고 없음)를
  // 통과한 건을 자동 인정한다. 비용 상한(실행당/일일)은 기존 게이트
  // (evaluateCostGate)를 그대로 통과해야만 AI 단계가 실행된다 — 상한
  // 초과 시 AI 자동 실행만 조용히 건너뛰고 규칙 단계 결과는 그대로 반영.
  // writingReviewAiAssist가 꺼져 있으면 이 플래그는 규칙 단계(티어①②)까지만
  // 자동화한다(AI 단계는 애초에 실행 안 됨).
  writingReviewAutoPilot: false,

  // writingReviewAutoTypo — 티어③(편집거리 1, decisionSource='levenshtein')을
  // 자동 인정 대상에 추가한다. 이 티어는 2026-07-17 운영자 지시("최종 판정은
  // 항상 교사")로 지금까지 사람 확인을 거치도록 남겨뒀던 항목이라, 이
  // 플래그는 그 결정을 명시적으로 뒤집는 것 — 2026-08-01 운영자 지시로
  // 코드화하되, 활성화 여부(끄고 켬)는 여전히 운영자 판단에 맡긴다(기본
  // false). writingReviewAutoPilot이 꺼져 있으면 이 플래그는 아무 효과가
  // 없다(오토파일럿 자체가 안 도니까).
  writingReviewAutoTypo: false,

  // writingReviewAutoDismiss — "확실한 반려"(spellingReviewBulkPlan.
  // selectCertainRejects — AI reject_candidate 고신뢰 또는 통계 반복오답
  // rejected_count>=5 && accepted_count===0)를 자동으로 무시(dismissed) 처리.
  // 학생 성적에는 원래부터 영향이 없는 액션이라(무시=검토 상태만 변경,
  // accepted_meanings 갱신 없음) 자동 인정보다 공정성 리스크가 낮다 — 그래도
  // 기본은 false(운영자가 직접 켜야 함). writingReviewAutoTypo와 마찬가지로
  // writingReviewAutoPilot이 켜져 있을 때만 의미가 있다(반려 후보 자체가
  // 오토파일럿이 실행하는 규칙/AI 단계 결과에서 나오므로 — 오토파일럿이
  // 꺼져 있으면 이 플래그는 아무 효과가 없다).
  writingReviewAutoDismiss: false,
}

// localStorage에서 저장된 features 불러오기.
// 2026-07-22: 저장본에 없는 새 플래그는 DEFAULT_FEATURES 값으로 채운다 —
// 예전 코드는 저장본을 통째로 반환해서, 플래그가 나중에 추가된 기기
// (localStorage에 구버전 스냅샷이 있는 기기)에서는 새 플래그가 전부
// undefined(=꺼짐)가 되는 문제가 있었다. 관리자가 명시적으로 바꾼 값은
// 저장본이 이기고, 새로 생긴 키만 기본값을 받는다.
const loadFeaturesFromStorage = () => {
  try {
    const stored = localStorage.getItem('paulEasyVoca_features')
    return stored ? { ...DEFAULT_FEATURES, ...JSON.parse(stored) } : { ...DEFAULT_FEATURES }
  } catch (e) {
    console.warn('Failed to load features from storage:', e)
    return { ...DEFAULT_FEATURES }
  }
}

// 현재 features 상태
let currentFeatures = loadFeaturesFromStorage()

/**
 * localStorage에서 다시 읽어 메모리 스냅샷을 최신화한다(다른 탭/이전에
 * 열려 있던 페이지 인스턴스가 변경을 반영하는 유일한 경로). 실제로 값이
 * 달라졌을 때만 교체 + 구독자에게 알린다(불필요한 리렌더 방지).
 * @returns {boolean} 변경 여부
 */
export const refreshFeaturesFromStorage = () => {
  const next = loadFeaturesFromStorage()
  const changed = JSON.stringify(next) !== JSON.stringify(currentFeatures)
  if (changed) {
    currentFeatures = next
    notify()
  }
  return changed
}

// 크로스탭/포그라운드 재조회 — 전부 try/catch로 감싸 어떤 환경(SSR, 테스트,
// 구형 브라우저)에서도 모듈 로드 자체는 절대 실패하지 않게 한다.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', (e) => {
      try {
        if (e.key === null || e.key === 'paulEasyVoca_features') refreshFeaturesFromStorage()
      } catch { /* 무시 */ }
    })
  } catch { /* 무시 */ }
  try {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        try {
          if (document.visibilityState === 'visible') refreshFeaturesFromStorage()
        } catch { /* 무시 */ }
      })
    }
  } catch { /* 무시 */ }
  try {
    window.addEventListener('pageshow', () => {
      try { refreshFeaturesFromStorage() } catch { /* 무시 */ }
    })
  } catch { /* 무시 */ }
}

/**
 * 특정 기능이 활성화되어 있는지 확인
 * @param {string} featureName - 기능명
 * @returns {boolean}
 */
export const isFeatureEnabled = (featureName) => {
  return currentFeatures[featureName] === true
}

/**
 * 여러 기능이 모두 활성화되어 있는지 확인
 * @param {string[]} featureNames - 기능명 배열
 * @returns {boolean}
 */
export const areAllFeaturesEnabled = (featureNames) => {
  return featureNames.every(name => isFeatureEnabled(name))
}

// 저장 직후 실제로 읽어와 검증(setItem이 조용히 실패하거나 — 프라이빗
// 모드/용량 초과 — 예외를 던지는 경우 둘 다 잡는다). 성공 시 notify(),
// 실패 시 이전 스냅샷으로 되돌리고 알리지 않는다.
function persistAndVerify(snapshotBeforeWrite) {
  try {
    localStorage.setItem('paulEasyVoca_features', JSON.stringify(currentFeatures))
    const raw = localStorage.getItem('paulEasyVoca_features')
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || JSON.stringify(parsed) !== JSON.stringify(currentFeatures)) {
      throw new Error('read-back mismatch')
    }
    notify()
    return { ok: true }
  } catch (e) {
    currentFeatures = snapshotBeforeWrite
    return { ok: false, reason: 'persist_failed' }
  }
}

/**
 * 기능 활성화/비활성화 (관리자만)
 * @param {string} featureName - 기능명
 * @param {boolean} enabled - 활성화 여부
 * @returns {{ ok: boolean, reason?: string }}
 */
export const setFeatureEnabled = (featureName, enabled) => {
  if (!DEFAULT_FEATURES.hasOwnProperty(featureName)) return { ok: true }
  const previous = { ...currentFeatures }
  currentFeatures[featureName] = enabled
  return persistAndVerify(previous)
}

/**
 * 여러 기능을 한번에 활성화/비활성화
 * @param {Object} featureMap - { featureName: boolean, ... }
 * @returns {{ ok: boolean, reason?: string }}
 */
export const setMultipleFeatures = (featureMap) => {
  const previous = { ...currentFeatures }
  Object.entries(featureMap).forEach(([name, enabled]) => {
    if (DEFAULT_FEATURES.hasOwnProperty(name)) {
      currentFeatures[name] = enabled
    }
  })
  return persistAndVerify(previous)
}

/**
 * 모든 기능의 현재 상태 반환
 * @returns {Object}
 */
export const getAllFeatures = () => {
  return { ...currentFeatures }
}

/**
 * 기능 상태 초기화
 * @returns {{ ok: boolean, reason?: string }}
 */
export const resetFeatures = () => {
  const previous = { ...currentFeatures }
  currentFeatures = { ...DEFAULT_FEATURES }
  return persistAndVerify(previous)
}

/**
 * 카테고리별 기능 조회
 */
export const getFeaturesByCategory = (category) => {
  const categories = {
    classManagement: ['classManagement', 'classManagement_create', 'classManagement_edit', 'classManagement_delete'],
    studentManagement: ['studentManagement', 'studentManagement_register', 'studentManagement_edit', 'studentManagement_delete', 'studentAssignment'],
    homework: ['homework', 'homework_create', 'homework_submission', 'homework_stats'],
    ranking: ['ranking', 'pointSystem', 'leaderboard', 'rewardSystem'],
    // writingReviewAiAssist(v1.1, 2026-07-23)는 이 카테고리에 없어서
    // FeatureManagementPanel에 토글 자체가 안 보이던 문제(2026-07-23 관리자
    // UI 2차 개편에서 발견 — 근본 원인 수정)를 이 목록 추가로 고친다.
    // 기본값(false)은 이 파일 위쪽 DEFAULT_FEATURES에서 그대로 유지.
    // writingReviewAutoPilot/AutoTypo/AutoDismiss(2026-08-01)도 같은 이유로
    // 여기 얹는다 — 새 카테고리 분리는 FeatureManagementPanel 소유 세션의
    // 후속(이 세션은 그 파일을 건드리지 않는다, 규칙 16).
    aiAnalysis: ['aiAnalysis', 'wrongAnswerNote', 'weakWordAnalysis', 'reviewRecommendation', 'writingReviewAiAssist', 'writingReviewAutoPilot', 'writingReviewAutoTypo', 'writingReviewAutoDismiss'],
    schoolManagement: ['classGroupManagement', 'semesterManagement', 'parentPortal', 'schoolDashboard', 'attendanceTracking', 'advancedAnalytics'],
    // reading* 두 플래그는 의미상 별개 도메인이지만, 새 카테고리를 추가하려면
    // FeatureManagementPanel.jsx의 FEATURE_CATEGORIES도 함께 고쳐야 해서
    // (이번 작업 소유 파일이 아님 — 규칙 16) 기존 attachment 목록에 얹는다.
    // 별도 'reading' 카테고리 분리는 FeatureManagementPanel 소유 세션의 후속.
    // curriculumExamplesStudentUI(Curriculum Engine Phase 0, 2026-08-01)도
    // readingStudentUI와 같은 이유로 여기 얹는다 — 새 카테고리 분리는
    // FeatureManagementPanel 소유 세션의 후속(이 세션은 그 파일을 건드리지
    // 않는다, 규칙 16).
    // writingCoachEnabled(Writing Coach MVP, 2026-08-09)도 같은 이유 —
    // FeatureManagementPanel에 토글이 보이려면 카테고리 목록에 있어야 한다
    // (writingReviewAiAssist가 빠져서 토글이 안 보였던 2026-07-23 사고의
    // 교훈 그대로).
    // townShopV1(Paul Town 별 상점 V1, 2026-09-06)도 같은 이유로 여기 얹는다
    // — 새 카테고리 분리는 FeatureManagementPanel 소유 세션의 후속(이 세션은
    // 그 파일을 건드리지 않는다, 규칙 16).
    attachment: ['attachmentHats', 'attachmentMuseum', 'attachmentAlbum', 'attachmentPaulMemory', 'attachmentWorldGarden', 'attachmentWorldFull', 'attachmentBookshelf', 'attachmentStory', 'paulMemoryV2', 'todaysDiscovery', 'starToSeed', 'hatCeremony', 'paulTownHomeBand', 'paulTownGarden', 'paulTownBuildings', 'productAnalytics', 'readingFoundation', 'readingStudentUI', 'curriculumExamplesStudentUI', 'writingCoachEnabled', 'townShopV1', 'paulTownV1', 'paulTownV2'],
  }
  return categories[category] || []
}

export default currentFeatures
