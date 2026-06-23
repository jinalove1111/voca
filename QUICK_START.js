/**
 * 빠른 시작 가이드 - 숨김 기능 활성화하기
 * 
 * 이 파일에 필요한 모든 기능 활성화 코드가 정리되어 있습니다.
 */

// ============================================
// 방법 1: Admin Panel 사용 (권장)
// ============================================
/*
1. 앱 실행
2. "Admin" 버튼 클릭
3. 비밀번호 입력: 1234
4. "🎯 기능" 탭 클릭
5. 원하는 기능의 토글 버튼 클릭
*/

// ============================================
// 방법 2: 개발자 콘솔 사용
// ============================================

// 브라우저에서 F12 → Console 탭에 다음 코드를 붙여넣기

// 1. 모든 기능 한번에 활성화
localStorage.setItem('paulEasyVoca_features', JSON.stringify({
  classManagement: true,
  classManagement_create: true,
  classManagement_edit: true,
  classManagement_delete: true,
  studentManagement: true,
  studentManagement_register: true,
  studentManagement_edit: true,
  studentManagement_delete: true,
  studentAssignment: true,
  homework: true,
  homework_create: true,
  homework_submission: true,
  homework_stats: true,
  ranking: true,
  pointSystem: true,
  leaderboard: true,
  rewardSystem: true,
  aiAnalysis: true,
  wrongAnswerNote: true,
  weakWordAnalysis: true,
  reviewRecommendation: true,
  classGroupManagement: true,
  semesterManagement: true,
  parentPortal: true,
  schoolDashboard: true,
  attendanceTracking: true,
  advancedAnalytics: true,
}))
location.reload()

// 2. 특정 기능만 활성화
// 반 관리만 활성화
localStorage.setItem('paulEasyVoca_features', JSON.stringify({
  classManagement: true,
  classManagement_create: true,
  classManagement_edit: true,
  classManagement_delete: true,
}))
location.reload()

// 3. 역할 변경 (Admin 접근을 위해)
localStorage.setItem('paulEasyVoca_userRole', 'admin')
location.reload()

// 4. 모든 기능 비활성화 (초기 상태로)
localStorage.removeItem('paulEasyVoca_features')
location.reload()

// ============================================
// 방법 3: 코드에서 직접 사용
// ============================================

import { setFeatureEnabled, setMultipleFeatures } from './config/features'
import { setUserRole } from './config/rbac'

// 특정 기능 활성화
setFeatureEnabled('classManagement', true)
setFeatureEnabled('studentManagement', true)

// 여러 기능 한번에 활성화
setMultipleFeatures({
  homework: true,
  ranking: true,
  aiAnalysis: true,
  schoolDashboard: true,
})

// 역할 변경
setUserRole('admin')
setUserRole('teacher')
setUserRole('student')

// ============================================
// 기능별 활성화 코드
// ============================================

// 1. 반 관리만
setMultipleFeatures({
  classManagement: true,
  classManagement_create: true,
  classManagement_edit: true,
  classManagement_delete: true,
})

// 2. 학생 관리만
setMultipleFeatures({
  studentManagement: true,
  studentManagement_register: true,
  studentManagement_edit: true,
  studentManagement_delete: true,
  studentAssignment: true,
})

// 3. 숙제 관리만
setMultipleFeatures({
  homework: true,
  homework_create: true,
  homework_submission: true,
  homework_stats: true,
})

// 4. 포인트 및 랭킹만
setMultipleFeatures({
  ranking: true,
  pointSystem: true,
  leaderboard: true,
  rewardSystem: true,
})

// 5. AI 학습 분석만
setMultipleFeatures({
  aiAnalysis: true,
  wrongAnswerNote: true,
  weakWordAnalysis: true,
  reviewRecommendation: true,
})

// 6. 학원 운영만
setMultipleFeatures({
  classGroupManagement: true,
  semesterManagement: true,
  parentPortal: true,
  schoolDashboard: true,
  attendanceTracking: true,
  advancedAnalytics: true,
})

// ============================================
// 역할별 권한 테스트
// ============================================

import { getUserRole, getUserPermissions } from './config/rbac'

// 현재 역할 확인
console.log('현재 역할:', getUserRole())

// 현재 권한 목록
console.log('보유 권한:', getUserPermissions())

// 역할별 전환해서 권한 변화 확인
setUserRole('student')
console.log('학생 권한:', getUserPermissions())

setUserRole('teacher')
console.log('선생님 권한:', getUserPermissions())

setUserRole('admin')
console.log('관리자 권한:', getUserPermissions())

// ============================================
// 데이터 조회 API 사용 예제
// ============================================

import { classAPI, studentAPI, homeworkAPI, rankingAPI, aiAnalysisAPI } from './api/hiddenFeatures'

// 반 조회
async function testClassAPI() {
  const classes = await classAPI.getClasses()
  console.log('반 목록:', classes)

  // 반 생성
  const newClass = await classAPI.createClass({
    name: '새 반',
    grade: 'elementary',
    level: 'beginner',
    teacher_id: 'teacher_001',
  })
  console.log('생성된 반:', newClass)
}

// 학생 조회
async function testStudentAPI() {
  const students = await studentAPI.getStudents()
  console.log('학생 목록:', students)

  // 학생 등록
  const newStudent = await studentAPI.registerStudent({
    name: '새 학생',
    email: 'student@example.com',
    class_id: 'class_001',
  })
  console.log('등록된 학생:', newStudent)

  // 학생 진도 조회
  const progress = await studentAPI.getStudentProgress(newStudent.id)
  console.log('학생 진도:', progress)
}

// 숙제 관리
async function testHomeworkAPI() {
  const homeworks = await homeworkAPI.getHomeworks()
  console.log('숙제 목록:', homeworks)

  // 숙제 생성
  const hw = await homeworkAPI.createHomework({
    class_id: 'class_001',
    title: '주간 복습',
    description: '지난주 학습 내용 복습',
    word_ids: ['word_1', 'word_2', 'word_3'],
    created_by: 'teacher_001',
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })
  console.log('생성된 숙제:', hw)

  // 숙제 통계
  const stats = await homeworkAPI.getHomeworkStats(hw.id)
  console.log('숙제 통계:', stats)
}

// 포인트 및 랭킹
async function testRankingAPI() {
  // 포인트 적립
  await rankingAPI.addPoints('stu_001', 50, 'quiz_complete', '퀴즈 완료')
  
  // 학생 포인트 조회
  const points = await rankingAPI.getStudentPoints('stu_001')
  console.log('학생 포인트:', points)

  // 반 랭킹
  const ranking = await rankingAPI.getClassRanking('class_001')
  console.log('반 랭킹:', ranking)

  // 전체 랭킹
  const globalRanking = await rankingAPI.getGlobalRanking()
  console.log('전체 랭킹:', globalRanking)
}

// AI 분석
async function testAIAnalysisAPI() {
  // 오답 기록
  await aiAnalysisAPI.recordWrongAnswer('stu_001', 'word_1', {
    question_type: 'multiple_choice',
    your_answer: 'wrong_ans',
    correct_answer: 'correct_ans',
    difficulty: 3,
  })

  // 취약 단어 조회
  const weakWords = await aiAnalysisAPI.getWeakWords('stu_001')
  console.log('취약 단어:', weakWords)

  // 복습 추천
  const recommendations = await aiAnalysisAPI.getReviewRecommendations('stu_001')
  console.log('복습 추천:', recommendations)

  // 학습 통계
  const stats = await aiAnalysisAPI.getLearningStats('stu_001')
  console.log('학습 통계:', stats)
}

// ============================================
// 완벽한 테스트 시나리오
// ============================================

/*
다음 순서대로 콘솔에 붙여넣기:

1. 모든 기능 활성화 + admin 역할 설정
   localStorage.setItem('paulEasyVoca_userRole', 'admin')
   location.reload()

2. 기본 API 데이터 생성
   await classAPI.createClass({ name: 'Test Class', grade: 'elementary', level: 'beginner', teacher_id: 'teacher_001' })
   await studentAPI.registerStudent({ name: 'Test Student', email: 'test@example.com', class_id: 'class_001' })

3. Feature 활성화 확인
   Admin Panel → 🎯 기능 탭에서 토글 확인

4. 각 기능별 컴포넌트 렌더링 확인
   Dashboard에서 숨김 기능들의 메뉴 나타나는지 확인

5. 역할 변경해서 권한 검증
   setUserRole('student') 후 메뉴 숨겨지는지 확인
   setUserRole('teacher') 후 적절한 메뉴만 표시되는지 확인
*/

// ============================================
// 초기화 및 리셋
// ============================================

// 모든 설정 초기화 (테스트 후 초기 상태로)
function resetAllSettings() {
  localStorage.removeItem('paulEasyVoca_features')
  localStorage.removeItem('paulEasyVoca_userRole')
  localStorage.removeItem('paulEasyVoca_classes')
  localStorage.removeItem('paulEasyVoca_students')
  localStorage.removeItem('paulEasyVoca_homeworks')
  localStorage.removeItem('paulEasyVoca_transactions')
  localStorage.removeItem('paulEasyVoca_wrongAnswers')
  location.reload()
}

// 호출: resetAllSettings()
