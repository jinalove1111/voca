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
}

// localStorage에서 저장된 features 불러오기
const loadFeaturesFromStorage = () => {
  try {
    const stored = localStorage.getItem('paulEasyVoca_features')
    return stored ? JSON.parse(stored) : DEFAULT_FEATURES
  } catch (e) {
    console.warn('Failed to load features from storage:', e)
    return DEFAULT_FEATURES
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
  }
  return categories[category] || []
}

export default currentFeatures
