/**
 * Feature Flag Configuration
 * 모든 기능의 ON/OFF를 관리합니다.
 * 추후 관리자 패널에서 동적으로 변경 가능하도록 설계되었습니다.
 */

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
  attachmentBookshelf: false,  // 개인 책장 — 파운데이션만, 미완성
  attachmentStory: false,      // 이어지는 이야기 — 파운데이션만, 미완성
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

/**
 * 기능 활성화/비활성화 (관리자만)
 * @param {string} featureName - 기능명
 * @param {boolean} enabled - 활성화 여부
 */
export const setFeatureEnabled = (featureName, enabled) => {
  if (DEFAULT_FEATURES.hasOwnProperty(featureName)) {
    currentFeatures[featureName] = enabled
    localStorage.setItem('paulEasyVoca_features', JSON.stringify(currentFeatures))
  }
}

/**
 * 여러 기능을 한번에 활성화/비활성화
 * @param {Object} featureMap - { featureName: boolean, ... }
 */
export const setMultipleFeatures = (featureMap) => {
  Object.entries(featureMap).forEach(([name, enabled]) => {
    if (DEFAULT_FEATURES.hasOwnProperty(name)) {
      currentFeatures[name] = enabled
    }
  })
  localStorage.setItem('paulEasyVoca_features', JSON.stringify(currentFeatures))
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
 */
export const resetFeatures = () => {
  currentFeatures = { ...DEFAULT_FEATURES }
  localStorage.setItem('paulEasyVoca_features', JSON.stringify(currentFeatures))
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
    aiAnalysis: ['aiAnalysis', 'wrongAnswerNote', 'weakWordAnalysis', 'reviewRecommendation'],
    schoolManagement: ['classGroupManagement', 'semesterManagement', 'parentPortal', 'schoolDashboard', 'attendanceTracking', 'advancedAnalytics'],
    attachment: ['attachmentHats', 'attachmentMuseum', 'attachmentAlbum', 'attachmentPaulMemory', 'attachmentWorldGarden', 'attachmentWorldFull', 'attachmentBookshelf', 'attachmentStory'],
  }
  return categories[category] || []
}

export default currentFeatures
