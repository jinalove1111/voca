# 폴이지보카 확장 기능 설계 가이드

## 🎯 개요

이 문서는 폴이지보카 앱의 향후 확장을 위해 미리 설계된 모듈화 구조에 대해 설명합니다. 모든 숨김 기능은 **Feature Flag** 방식으로 관리되며, **Role-Based Access Control (RBAC)** 을 통해 권한을 관리합니다.

**핵심 설계 원칙:**
- ✅ 기존 기능에 영향 없음
- ✅ Feature Flag로 쉬운 ON/OFF 관리
- ✅ 권한 기반 접근 제어
- ✅ localStorage 기반으로 백엔드 연동 준비 완료
- ✅ 초보자 친화적 구조

---

## 📁 파일 구조

```
src/
├── config/
│   ├── features.js              # Feature Flag 관리
│   ├── rbac.js                  # Role-Based Access Control
│   └── dataSchemas.js           # 모든 기능의 데이터 스키마
├── api/
│   └── hiddenFeatures.js        # API 엔드포인트 정의 (localStorage 기반)
├── hooks/
│   └── useFeatureAccess.js      # Feature 접근 권한 확인 Hook
├── components/
│   ├── HiddenFeatures.jsx       # 숨김 기능들의 UI 컴포넌트
│   ├── FeatureManagementPanel.jsx # Feature 관리 패널 (Admin)
│   └── AdminScreen.jsx          # 기존 Admin 화면 (개선됨)
└── ...
```

---

## 🔧 핵심 시스템

### 1. Feature Flag System (`config/features.js`)

모든 숨김 기능의 ON/OFF를 중앙에서 관리합니다.

**사용법:**
```javascript
import { isFeatureEnabled, setFeatureEnabled } from './config/features'

// 기능이 활성화되었는지 확인
if (isFeatureEnabled('classManagement')) {
  // 반 관리 기능 표시
}

// 관리자가 기능 활성화 (Admin Panel에서)
setFeatureEnabled('classManagement', true)
```

**Feature 목록:**
```javascript
{
  // 반 관리
  classManagement: false,
  classManagement_create: false,
  classManagement_edit: false,
  classManagement_delete: false,

  // 학생 관리
  studentManagement: false,
  studentManagement_register: false,
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

  // 학원 운영
  classGroupManagement: false,
  semesterManagement: false,
  parentPortal: false,
  schoolDashboard: false,
  attendanceTracking: false,
  advancedAnalytics: false,
}
```

### 2. Role-Based Access Control (`config/rbac.js`)

사용자의 역할과 권한을 관리합니다.

**역할 (Roles):**
- `STUDENT` - 학생
- `TEACHER` - 선생님/강사
- `ADMIN` - 학원 관리자
- `SUPER_ADMIN` - 시스템 관리자

**사용법:**
```javascript
import { 
  getUserRole, 
  setUserRole, 
  hasPermission,
  PERMISSIONS 
} from './config/rbac'

// 현재 사용자의 역할 확인
const role = getUserRole() // e.g., 'student'

// 권한 확인
if (hasPermission(PERMISSIONS.MANAGE_POINTS)) {
  // 포인트 관리 기능 표시
}

// 역할 변경 (관리자만)
setUserRole('teacher')
```

**역할별 기본 권한:**
- **STUDENT**: 학습, 숙제 제출 등
- **TEACHER**: STUDENT + 반 관리, 학생 관리, 숙제 출제 등
- **ADMIN**: TEACHER + 학원 전체 관리
- **SUPER_ADMIN**: 모든 권한 + Feature 관리

### 3. Data Schemas (`config/dataSchemas.js`)

모든 숨김 기능의 데이터 구조를 미리 정의했습니다.

**예시:**
```javascript
// 반 데이터 구조
const CLASS_SCHEMA = {
  id: 'class_001',
  name: '월수금초급',
  grade: 'elementary',
  level: 'beginner',
  teacher_id: 'teacher_001',
  student_ids: ['stu_001', 'stu_002'],
  created_at: '2024-01-01T00:00:00Z',
  status: 'active',
}

// 학생 프로필
const STUDENT_PROFILE_SCHEMA = {
  id: 'stu_001',
  name: '김철수',
  email: 'student@example.com',
  class_id: 'class_001',
  enrollment_date: '2024-01-01T00:00:00Z',
  status: 'active',
}
```

모든 스키마는 `dataSchemas.js`에 문서화되어 있습니다.

### 4. API Module (`api/hiddenFeatures.js`)

백엔드 연동을 위한 API 엔드포인트를 미리 정의했습니다.

**현재 상태:** localStorage 기반으로 작동 (프로토타입)
**향후:** fetch로 백엔드 API 호출로 쉽게 대체 가능

**사용법:**
```javascript
import { classAPI, studentAPI, homeworkAPI, rankingAPI, aiAnalysisAPI } from './api/hiddenFeatures'

// 반 관리
const classes = await classAPI.getClasses()
const newClass = await classAPI.createClass({ name: '새반' })

// 학생 관리
const students = await studentAPI.getStudents()
const progress = await studentAPI.getStudentProgress(studentId)

// 숙제 관리
const homeworks = await homeworkAPI.getHomeworks(classId)
const stats = await homeworkAPI.getHomeworkStats(homeworkId)

// 포인트 및 랭킹
await rankingAPI.addPoints(studentId, 50, 'quiz_complete', '퀴즈 완료')
const ranking = await rankingAPI.getClassRanking(classId)

// AI 분석
const weakWords = await aiAnalysisAPI.getWeakWords(studentId)
const recommendations = await aiAnalysisAPI.getReviewRecommendations(studentId)
```

---

## 🚀 기능 활성화 방법

### 방법 1: Admin Panel 사용 (권장)

1. Admin 화면으로 이동
2. 비밀번호 입력 (기본값: `1234`)
3. "🎯 기능" 탭 클릭
4. 활성화하려는 기능의 토글 클릭

### 방법 2: 개발자 콘솔 사용

브라우저의 개발자 도구(F12)를 열고 Console 탭에서:

```javascript
// 한 가지 기능 활성화
import { setFeatureEnabled } from './config/features'
setFeatureEnabled('classManagement', true)

// 여러 기능 한번에 활성화
import { setMultipleFeatures } from './config/features'
setMultipleFeatures({
  classManagement: true,
  studentManagement: true,
  homework: true,
})

// 역할 변경
import { setUserRole } from './config/rbac'
setUserRole('admin')
```

### 방법 3: 코드에서 직접 사용

```javascript
import { isFeatureEnabled } from './config/features'
import { canRenderFeature } from './hooks/useFeatureAccess'

function MyComponent() {
  // Feature가 활성화되어야만 렌더링
  if (!canRenderFeature('classManagement')) {
    return null
  }

  return <ClassManagement />
}
```

---

## 📚 숨김 기능들

### 1. 반 관리 (Class Management)

**Feature Flag:** `classManagement`

**기능:**
- 반 생성
- 반 수정
- 반 삭제
- 반별 학생 관리

**API:**
```javascript
import { classAPI } from './api/hiddenFeatures'

const classes = await classAPI.getClasses()
const newClass = await classAPI.createClass({
  name: '새 반',
  grade: 'elementary',
  level: 'beginner',
})
```

**데이터 스키마:** `CLASS_SCHEMA` in `dataSchemas.js`

---

### 2. 학생 관리 (Student Management)

**Feature Flag:** `studentManagement`, `studentAssignment`

**기능:**
- 학생 등록
- 학생 정보 수정
- 학생 삭제
- 학생별 단어 배정
- 학생 진도 추적

**API:**
```javascript
import { studentAPI } from './api/hiddenFeatures'

const students = await studentAPI.getStudents()
const progress = await studentAPI.getStudentProgress(studentId)
await studentAPI.assignWords(studentId, classId, wordIds)
```

**데이터 스키마:** `STUDENT_PROFILE_SCHEMA`, `STUDENT_ASSIGNMENT_SCHEMA`

---

### 3. 숙제 관리 (Homework)

**Feature Flag:** `homework`, `homework_submission`, `homework_stats`

**기능:**
- 숙제 출제
- 학생 제출 현황 확인
- 숙제 채점
- 통계 분석

**API:**
```javascript
import { homeworkAPI } from './api/hiddenFeatures'

const hw = await homeworkAPI.createHomework({
  class_id: 'class_001',
  title: '주간 복습',
  word_ids: ['word_1', 'word_2'],
})

const submissions = await homeworkAPI.getSubmissions(homeworkId)
const stats = await homeworkAPI.getHomeworkStats(homeworkId)
```

---

### 4. 포인트 및 랭킹 (Ranking & Points)

**Feature Flags:** `ranking`, `pointSystem`, `leaderboard`, `rewardSystem`

**기능:**
- 학습 활동에 따른 포인트 자동 적립
- 반별/전체 랭킹 표시
- 뱃지 및 보상 시스템
- 포인트 거래 기록

**API:**
```javascript
import { rankingAPI } from './api/hiddenFeatures'

// 포인트 적립
await rankingAPI.addPoints(studentId, 50, 'quiz_complete', '퀴즈 완료')

// 학생의 총 포인트
const points = await rankingAPI.getStudentPoints(studentId)

// 반 랭킹
const ranking = await rankingAPI.getClassRanking(classId)
```

**데이터 스키마:** `POINT_TRANSACTION_SCHEMA`, `STUDENT_RANKING_SCHEMA`, `REWARD_SCHEMA`

---

### 5. AI 학습 분석 (AI Learning Analysis)

**Feature Flags:** `aiAnalysis`, `wrongAnswerNote`, `weakWordAnalysis`, `reviewRecommendation`

**기능:**
- 오답 자동 기록
- 취약 단어 분석
- AI 기반 복습 추천
- 학습 통계

**API:**
```javascript
import { aiAnalysisAPI } from './api/hiddenFeatures'

// 오답 기록
await aiAnalysisAPI.recordWrongAnswer(studentId, wordId, {
  question_type: 'multiple_choice',
  your_answer: 'wrong',
  correct_answer: 'correct',
})

// 취약 단어 조회
const weakWords = await aiAnalysisAPI.getWeakWords(studentId)

// 복습 추천
const recommendations = await aiAnalysisAPI.getReviewRecommendations(studentId)
```

**데이터 스키마:** `WRONG_ANSWER_SCHEMA`, `WEAK_WORD_ANALYSIS_SCHEMA`, `LEARNING_STATS_SCHEMA`

---

### 6. 학원 운영 관리 (School Management)

**Feature Flags:** `schoolDashboard`, `attendanceTracking`, `parentPortal`, `classGroupManagement`, `semesterManagement`

**기능:**
- 학원 전체 대시보드
- 출석 관리
- 학부모 포털
- 학기 관리
- 반 그룹화

**API:**
```javascript
import { schoolAPI } from './api/hiddenFeatures'

// 출석 기록
await schoolAPI.recordAttendance(studentId, classId, {
  status: 'present',
  check_in_time: '14:55:00',
})

// 학기 생성
const semester = await schoolAPI.createSemester({
  name: '2024학년도 1학기',
  start_date: '2024-01-01',
})
```

---

## 🎯 권장 확장 기능

향후 학원 운영 시스템으로 확장할 때 추가하면 좋은 기능들:

### 1. **계약 및 결제 관리**
- 학생/학부모별 계약 관리
- 월별 납부금 관리
- 자동 결제 알림
- 연체 관리

### 2. **상담 기록 시스템**
- 학생별 상담 기록
- 학부모 면담 일정
- 진로 상담 기록
- 학습 진도 공유

### 3. **강사 관리**
- 강사별 시간표
- 강사별 급여 관리
- 강사 평가 시스템
- 강사 근무 시간 기록

### 4. **교재 및 자료 관리**
- 교재 재고 관리
- 온라인 자료 관리
- 학습 자료 버전 관리
- 교재별 진도 추적

### 5. **뉴스레터 및 알림**
- 자동 SMS/이메일 발송
- 학부모 정보 공유
- 공지사항 관리
- 우수 학생 표창

### 6. **학원 규정 및 방침**
- 휴원 관리
- 환불 정책
- 지각/결석 규정
- 보상 및 패널티 정책

---

## 🔒 보안 고려사항

### 현재 상태 (개발/테스트용)
- localStorage에만 저장
- 클라이언트 측에서만 처리
- **프로덕션에 부적합**

### 백엔드 연동 시 필수사항
1. **서버 인증:**
   - 사용자 역할은 서버에서 검증
   - Feature Flag도 서버에서 관리

2. **권한 검증:**
   - 모든 API 요청에서 권한 확인
   - 역할에 맞지 않는 요청 거부

3. **감시 로깅:**
   - 민감한 작업의 상세 기록
   - 관리자 활동 감시

---

## 📖 개발 가이드

### 새로운 숨김 기능 추가하기

**Step 1: Feature Flag 추가**
```javascript
// config/features.js
DEFAULT_FEATURES = {
  myNewFeature: false,
  myNewFeature_subaction: false,
  ...
}
```

**Step 2: 데이터 스키마 정의**
```javascript
// config/dataSchemas.js
export const MY_NEW_FEATURE_SCHEMA = {
  id: 'unique_id',
  // ... 필드 정의
}
```

**Step 3: API 만들기**
```javascript
// api/hiddenFeatures.js
export const myNewFeatureAPI = {
  async getAll() { /* ... */ },
  async create(data) { /* ... */ },
  async update(id, data) { /* ... */ },
  async delete(id) { /* ... */ },
}
```

**Step 4: 컴포넌트 만들기**
```javascript
// components/HiddenFeatures.jsx
export function MyNewFeature() {
  if (!canRenderFeature('myNewFeature')) {
    return null
  }
  return <div>...</div>
}
```

**Step 5: Admin Panel에 노출**
- FeatureManagementPanel.jsx에서 자동으로 인식됨
- Feature Flag를 추가하면 자동으로 토글 가능해짐

---

## 🧪 테스트 시나리오

### 시나리오 1: 학생 권한으로 접근
```javascript
setUserRole('student')
// → 기본 학습 기능만 표시
// → 관리 기능 모두 숨겨짐
```

### 시나리오 2: 선생님 권한으로 접근
```javascript
setUserRole('teacher')
// → 반 관리, 학생 관리 메뉴 표시
// → 숙제 출제 가능
// → 학생 진도 조회 가능
```

### 시나리오 3: 관리자 권한으로 접근
```javascript
setUserRole('admin')
// → 모든 기능 활성화 가능
// → Feature 관리 패널 접근 가능
```

### 시나리오 4: 특정 기능만 활성화
```javascript
setMultipleFeatures({
  classManagement: true,
  ranking: true,
})
// → 반 관리와 랭킹 기능만 활성화
// → 다른 기능은 숨겨짐
```

---

## 🐛 디버깅 팁

**Feature 접근 가능 여부 확인:**
```javascript
import { debugFeatureAccess } from './hooks/useFeatureAccess'

const result = debugFeatureAccess('classManagement', ['MANAGE_CLASSES'])
console.log(result)
// {
//   feature: 'classManagement',
//   featureEnabled: false,
//   permissionsOk: false,
//   canRender: false,
//   reason: 'Feature disabled'
// }
```

**현재 활성화된 모든 기능 확인:**
```javascript
import { getAllFeatures } from './config/features'

const features = getAllFeatures()
console.log(features)
// { classManagement: false, studentManagement: false, ... }
```

**현재 사용자의 모든 권한 확인:**
```javascript
import { getUserPermissions } from './config/rbac'

const permissions = getUserPermissions()
console.log(permissions)
// ['view_student_dashboard', 'view_student_progress', ...]
```

---

## 📞 지원

**문제 발생 시:**
1. 콘솔에서 에러 메시지 확인
2. Feature Flag와 권한이 제대로 설정되었는지 확인
3. `debugFeatureAccess()` 함수로 상태 진단
4. localStorage 데이터가 손상되었다면 `resetFeatures()` 실행

---

## 📝 체크리스트

폴이지보카를 학원 운영 시스템으로 확장할 때:

- [ ] Feature Flag를 하나씩 활성화하며 테스트
- [ ] 각 기능별로 필요한 권한 정의
- [ ] API를 localStorage에서 실제 백엔드로 교체
- [ ] 데이터 검증 로직 추가
- [ ] 권한 검증을 서버에서 수행
- [ ] 감시 로깅 시스템 구축
- [ ] 사용자 문서 작성
- [ ] 테스트 케이스 작성
- [ ] 배포 전 보안 감사

---

**버전:** 1.0  
**마지막 업데이트:** 2024-01-01  
**관리자:** [관리자명]
