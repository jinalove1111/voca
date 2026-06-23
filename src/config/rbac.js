/**
 * Role-based Access Control (RBAC)
 * 사용자 역할과 권한을 관리합니다.
 */

export const ROLES = {
  STUDENT: 'student',          // 학생
  TEACHER: 'teacher',          // 선생님
  ADMIN: 'admin',              // 학원 관리자
  SUPER_ADMIN: 'super_admin',  // 시스템 관리자
}

export const PERMISSIONS = {
  // 학생 관련
  VIEW_STUDENT_DASHBOARD: 'view_student_dashboard',
  VIEW_STUDENT_PROGRESS: 'view_student_progress',
  EDIT_OWN_PROFILE: 'edit_own_profile',

  // 반 관리
  VIEW_CLASSES: 'view_classes',
  CREATE_CLASS: 'create_class',
  EDIT_CLASS: 'edit_class',
  DELETE_CLASS: 'delete_class',

  // 학생 관리
  VIEW_STUDENTS: 'view_students',
  REGISTER_STUDENT: 'register_student',
  EDIT_STUDENT: 'edit_student',
  DELETE_STUDENT: 'delete_student',
  ASSIGN_WORDS: 'assign_words',

  // 숙제 관리
  VIEW_HOMEWORK: 'view_homework',
  CREATE_HOMEWORK: 'create_homework',
  SUBMIT_HOMEWORK: 'submit_homework',
  GRADE_HOMEWORK: 'grade_homework',

  // 포인트/랭킹
  VIEW_RANKING: 'view_ranking',
  MANAGE_POINTS: 'manage_points',
  MANAGE_REWARDS: 'manage_rewards',

  // AI 분석
  VIEW_ANALYTICS: 'view_analytics',
  VIEW_WEAK_WORDS: 'view_weak_words',
  VIEW_LEARNING_STATS: 'view_learning_stats',

  // 학원 운영
  MANAGE_SEMESTERS: 'manage_semesters',
  VIEW_SCHOOL_DASHBOARD: 'view_school_dashboard',
  MANAGE_ATTENDANCE: 'manage_attendance',
  MANAGE_PARENTS: 'manage_parents',
  MANAGE_FEATURES: 'manage_features',
}

// 역할별 기본 권한 맵
const ROLE_PERMISSIONS = {
  [ROLES.STUDENT]: [
    PERMISSIONS.VIEW_STUDENT_DASHBOARD,
    PERMISSIONS.VIEW_STUDENT_PROGRESS,
    PERMISSIONS.EDIT_OWN_PROFILE,
    PERMISSIONS.SUBMIT_HOMEWORK,
  ],
  [ROLES.TEACHER]: [
    PERMISSIONS.VIEW_STUDENT_DASHBOARD,
    PERMISSIONS.VIEW_STUDENT_PROGRESS,
    PERMISSIONS.EDIT_OWN_PROFILE,
    PERMISSIONS.VIEW_CLASSES,
    PERMISSIONS.VIEW_STUDENTS,
    PERMISSIONS.ASSIGN_WORDS,
    PERMISSIONS.VIEW_HOMEWORK,
    PERMISSIONS.CREATE_HOMEWORK,
    PERMISSIONS.GRADE_HOMEWORK,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_WEAK_WORDS,
    PERMISSIONS.VIEW_LEARNING_STATS,
  ],
  [ROLES.ADMIN]: [
    // 모든 teacher 권한 포함
    ...Object.values(PERMISSIONS),
  ],
  [ROLES.SUPER_ADMIN]: [
    // 모든 권한
    ...Object.values(PERMISSIONS),
    PERMISSIONS.MANAGE_FEATURES,
  ],
}

/**
 * 사용자의 역할을 가져옵니다
 * @returns {string} 현재 사용자의 역할
 */
export const getUserRole = () => {
  try {
    const role = localStorage.getItem('paulEasyVoca_userRole')
    return role || ROLES.STUDENT
  } catch {
    return ROLES.STUDENT
  }
}

/**
 * 사용자의 역할을 설정합니다 (관리자만 가능)
 * @param {string} role - ROLES 중 하나
 */
export const setUserRole = (role) => {
  if (Object.values(ROLES).includes(role)) {
    localStorage.setItem('paulEasyVoca_userRole', role)
  }
}

/**
 * 사용자가 특정 권한을 가지고 있는지 확인합니다
 * @param {string} permission - PERMISSIONS 중 하나
 * @returns {boolean}
 */
export const hasPermission = (permission) => {
  const role = getUserRole()
  const permissions = ROLE_PERMISSIONS[role] || []
  return permissions.includes(permission)
}

/**
 * 사용자가 여러 권한을 모두 가지고 있는지 확인합니다
 * @param {string[]} permissions - PERMISSIONS 배열
 * @returns {boolean}
 */
export const hasAllPermissions = (permissions) => {
  return permissions.every(p => hasPermission(p))
}

/**
 * 사용자가 여러 권한 중 하나라도 가지고 있는지 확인합니다
 * @param {string[]} permissions - PERMISSIONS 배열
 * @returns {boolean}
 */
export const hasAnyPermission = (permissions) => {
  return permissions.some(p => hasPermission(p))
}

/**
 * 현재 사용자의 모든 권한을 반환합니다
 * @returns {string[]}
 */
export const getUserPermissions = () => {
  const role = getUserRole()
  return ROLE_PERMISSIONS[role] || []
}

/**
 * 특정 역할의 권한을 반환합니다
 * @param {string} role - ROLES 중 하나
 * @returns {string[]}
 */
export const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role] || []
}

export default {
  ROLES,
  PERMISSIONS,
  getUserRole,
  setUserRole,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getUserPermissions,
  getRolePermissions,
}
