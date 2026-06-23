/**
 * Data Schema for Hidden Features
 * 향후 활성화될 기능들의 데이터 구조를 미리 정의합니다.
 * 초기값은 빈 배열/객체로 유지되어 기존 기능에 영향을 주지 않습니다.
 */

// ============================================
// 1. 반 관리 (Class Management)
// ============================================
export const CLASS_SCHEMA = {
  id: 'class_001',                    // 고유 ID
  name: '월수금초급',                   // 반 이름
  grade: 'elementary',                // 학년 (elementary, middle, high)
  level: 'beginner',                  // 수준 (beginner, intermediate, advanced)
  classType: 'regular',               // regular | special
  teacher_id: 'teacher_001',          // 담당 선생님 ID
  semester_id: 'sem_2024_1',          // 학기 ID
  student_ids: ['stu_001', 'stu_002'], // 학생 ID 배열
  word_set_id: 'wordset_001',         // 교재 단어 세트 ID
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  status: 'active',                   // active, inactive, archived
}

// ============================================
// 2. 학생 관리 (Student Management)
// ============================================
export const STUDENT_PROFILE_SCHEMA = {
  id: 'stu_001',
  name: '김철수',
  email: 'student@example.com',
  phone: '010-1234-5678',
  parent_phone: '010-9876-5432',
  class_id: 'class_001',              // 현재 소속 반
  enrollment_date: '2024-01-01T00:00:00Z',
  status: 'active',                   // active, inactive, graduated, on_leave
  notes: '특이사항',
}

export const STUDENT_ASSIGNMENT_SCHEMA = {
  id: 'assign_001',
  student_id: 'stu_001',
  class_id: 'class_001',
  assigned_words: ['word_1', 'word_2', 'word_3'], // 배정된 단어 ID들
  assignment_date: '2024-01-01T00:00:00Z',
  due_date: '2024-01-10T00:00:00Z',
  progress_percentage: 45,            // 0-100
  status: 'in_progress',              // not_started, in_progress, completed, overdue
}

// ============================================
// 3. 숙제 관리 (Homework)
// ============================================
export const HOMEWORK_SCHEMA = {
  id: 'hw_001',
  class_id: 'class_001',
  title: '일주일 복습',
  description: '지난주 배운 단어들 복습하기',
  word_ids: ['word_1', 'word_2', 'word_3'],
  created_by: 'teacher_001',
  due_date: '2024-01-10T23:59:59Z',
  created_at: '2024-01-01T00:00:00Z',
  status: 'active',                   // active, closed
}

export const HOMEWORK_SUBMISSION_SCHEMA = {
  id: 'sub_001',
  homework_id: 'hw_001',
  student_id: 'stu_001',
  submitted_at: '2024-01-09T15:30:00Z',
  is_late: false,
  completion_percentage: 100,         // 0-100
  status: 'submitted',                // not_submitted, submitted, graded
  score: 95,                          // 점수 (0-100)
  feedback: '잘했습니다!',
  graded_by: 'teacher_001',
  graded_at: '2024-01-09T16:00:00Z',
}

// ============================================
// 4. 포인트 및 랭킹 (Points & Ranking)
// ============================================
export const POINT_TRANSACTION_SCHEMA = {
  id: 'point_001',
  student_id: 'stu_001',
  amount: 50,                         // 포인트 수량 (양수: 적립, 음수: 차감)
  reason: 'quiz_complete',            // 사유 코드
  description: '퀴즈 완료',
  timestamp: '2024-01-01T15:30:00Z',
  related_id: 'word_1',               // 관련 엔티티 ID (선택사항)
}

export const STUDENT_RANKING_SCHEMA = {
  student_id: 'stu_001',
  class_id: 'class_001',
  total_points: 1500,
  rank: 1,                            // 반 내 순위
  grade_rank: 5,                      // 학년 내 순위
  month_points: 350,                  // 이달 포인트
  week_points: 75,                    // 이주 포인트
  updated_at: '2024-01-01T00:00:00Z',
}

export const REWARD_SCHEMA = {
  id: 'reward_001',
  name: '골든 배지',
  description: '100포인트 도달',
  icon_url: '/icons/badges/golden.svg',
  required_points: 100,
  type: 'badge',                      // badge, title, item
  rarity: 'common',                   // common, rare, epic, legendary
  created_at: '2024-01-01T00:00:00Z',
}

export const REWARD_ACHIEVEMENT_SCHEMA = {
  id: 'ach_001',
  student_id: 'stu_001',
  reward_id: 'reward_001',
  achieved_at: '2024-01-05T12:00:00Z',
  shown_to_user: true,
}

// ============================================
// 5. AI 학습 분석 (AI Learning Analysis)
// ============================================
export const WRONG_ANSWER_SCHEMA = {
  id: 'wrong_001',
  student_id: 'stu_001',
  word_id: 'word_1',
  quiz_id: 'quiz_001',
  question_type: 'multiple_choice',   // multiple_choice, spelling, pronunciation
  your_answer: 'incorrect_answer',
  correct_answer: 'correct_answer',
  timestamp: '2024-01-01T15:30:00Z',
  difficulty: 3,                      // 1-5, 높을수록 어려움
}

export const WEAK_WORD_ANALYSIS_SCHEMA = {
  student_id: 'stu_001',
  word_id: 'word_1',
  word: 'apple',
  meaning: '사과',
  wrong_count: 5,                     // 틀린 횟수
  attempt_count: 10,                  // 시도한 횟수
  accuracy_rate: 50,                  // 정답률 (0-100)
  last_reviewed_at: '2024-01-01T15:30:00Z',
  review_priority: 'high',            // low, medium, high, urgent
  updated_at: '2024-01-01T00:00:00Z',
}

export const REVIEW_RECOMMENDATION_SCHEMA = {
  id: 'rec_001',
  student_id: 'stu_001',
  recommended_word_ids: ['word_1', 'word_2', 'word_3'],
  reason: 'low_accuracy_rate',        // low_accuracy_rate, long_no_review, weak_category
  recommended_at: '2024-01-01T00:00:00Z',
  priority: 'high',
  reviewed: false,
}

export const LEARNING_STATS_SCHEMA = {
  student_id: 'stu_001',
  period: '2024-01',                  // YYYY-MM
  total_quiz_attempts: 50,
  total_correct: 42,
  accuracy_rate: 84,
  total_words_reviewed: 30,
  new_words_learned: 10,
  total_learning_time_minutes: 450,
  streak_days: 7,                     // 연속 학습일수
  most_difficult_category: 'verbs',
  most_improved_category: 'nouns',
  avg_quiz_score: 84,
  updated_at: '2024-01-01T00:00:00Z',
}

// ============================================
// 6. 학원 운영 확장 기능
// ============================================
export const SEMESTER_SCHEMA = {
  id: 'sem_2024_1',
  school_id: 'school_001',
  name: '2024학년도 1학기',
  start_date: '2024-01-01',
  end_date: '2024-06-30',
  status: 'active',                   // active, ended
  created_at: '2024-01-01T00:00:00Z',
}

export const CLASS_GROUP_SCHEMA = {
  id: 'group_001',
  name: '초등부',
  description: '초등학교 학생들을 위한 그룹',
  class_ids: ['class_001', 'class_002', 'class_003'],
  parent_class_ids: [],               // 계층 구조 지원
}

export const ATTENDANCE_RECORD_SCHEMA = {
  id: 'attend_001',
  student_id: 'stu_001',
  class_id: 'class_001',
  date: '2024-01-01',
  status: 'present',                  // present, late, absent, excused
  check_in_time: '14:55:00',
  check_out_time: '16:00:00',
  notes: '',
}

export const PARENT_PORTAL_SCHEMA = {
  id: 'parent_001',
  parent_id: 'parent_001',
  child_id: 'stu_001',
  relation: 'mother',                 // father, mother, guardian
  phone: '010-1234-5678',
  email: 'parent@example.com',
  notification_enabled: true,
  notification_methods: ['sms', 'email'], // sms, email, push
}

export const SCHOOL_DASHBOARD_SCHEMA = {
  school_id: 'school_001',
  total_students: 150,
  total_classes: 10,
  total_teachers: 5,
  total_attendance_rate: 96.5,
  total_average_score: 82.3,
  period: '2024-01',
  updated_at: '2024-01-01T00:00:00Z',
}

/**
 * 모든 스키마를 한 번에 초기화
 * @param {string} studentId - 학생 ID
 * @returns {Object} 모든 데이터 구조
 */
export const initializeAllSchemas = (studentId) => {
  return {
    classes: [],
    students: [],
    studentProfiles: {},
    studentAssignments: [],
    homeworks: [],
    homeworkSubmissions: [],
    pointTransactions: [],
    studentRankings: {},
    rewards: [],
    rewardAchievements: [],
    wrongAnswers: [],
    weakWordAnalysis: {},
    reviewRecommendations: [],
    learningStats: {},
    semesters: [],
    classGroups: [],
    attendanceRecords: [],
    parentPortals: [],
    schoolDashboard: {},
  }
}

export default {
  CLASS_SCHEMA,
  STUDENT_PROFILE_SCHEMA,
  STUDENT_ASSIGNMENT_SCHEMA,
  HOMEWORK_SCHEMA,
  HOMEWORK_SUBMISSION_SCHEMA,
  POINT_TRANSACTION_SCHEMA,
  STUDENT_RANKING_SCHEMA,
  REWARD_SCHEMA,
  REWARD_ACHIEVEMENT_SCHEMA,
  WRONG_ANSWER_SCHEMA,
  WEAK_WORD_ANALYSIS_SCHEMA,
  REVIEW_RECOMMENDATION_SCHEMA,
  LEARNING_STATS_SCHEMA,
  SEMESTER_SCHEMA,
  CLASS_GROUP_SCHEMA,
  ATTENDANCE_RECORD_SCHEMA,
  PARENT_PORTAL_SCHEMA,
  SCHOOL_DASHBOARD_SCHEMA,
}
