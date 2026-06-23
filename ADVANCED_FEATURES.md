# 학원 운영 시스템 확장 - 추천 기능 설계

## 📋 개요

폴이지보카가 기본 온라인 학습 플랫폼에서 완벽한 **학원 운영 시스템**으로 확장될 때 추천하는 기능들입니다. 
각 기능은 초기 설계와 데이터 스키마를 포함합니다.

---

## 🏦 추천 확장 기능 5대 영역

### 1️⃣ 계약 & 결제 관리 (Billing & Contracts)

학원의 핵심 수익 흐름을 관리하는 영역입니다.

**주요 기능:**

```javascript
// 데이터 스키마
const CONTRACT_SCHEMA = {
  id: 'contract_001',
  student_id: 'stu_001',
  class_id: 'class_001',
  start_date: '2024-01-01',
  end_date: '2024-06-30',
  monthly_fee: 150000,  // 월 수강료
  payment_schedule: 'monthly',  // monthly, quarterly, yearly
  status: 'active',  // active, on_hold, terminated
  notes: '특이사항',
}

const PAYMENT_SCHEMA = {
  id: 'pay_001',
  contract_id: 'contract_001',
  amount: 150000,
  due_date: '2024-01-31',
  paid_date: '2024-01-28',
  payment_method: 'card',  // card, bank_transfer, cash
  status: 'paid',  // pending, paid, overdue, cancelled
  receipt_number: 'RCP-2024-001',
}

const REFUND_SCHEMA = {
  id: 'refund_001',
  payment_id: 'pay_001',
  amount: 50000,
  reason: 'withdrawal_request',
  status: 'pending',  // pending, approved, rejected, completed
  requested_at: '2024-01-15T10:00:00Z',
  processed_at: null,
}
```

**권장 기능:**
- 학생별 계약 관리 (수강 기간, 수강료, 특별조건)
- 월별 납부금 자동 계산
- 결제 현황 추적 및 알림
- 연체 학생 자동 감지
- 환불 요청 처리
- 결제 통계 및 리포트
- 자동 결제 (정기결제) 연동

**API 예제:**
```javascript
export const billingAPI = {
  async createContract(data) { /* ... */ },
  async getPaymentSchedule(contractId) { /* ... */ },
  async recordPayment(paymentData) { /* ... */ },
  async getOverdueStudents() { /* ... */ },
  async processRefund(refundData) { /* ... */ },
  async getMonthlySalesReport() { /* ... */ },
}
```

**권한:**
```javascript
PERMISSIONS: {
  MANAGE_CONTRACTS: 'manage_contracts',
  VIEW_PAYMENTS: 'view_payments',
  PROCESS_REFUNDS: 'process_refunds',
  VIEW_FINANCIAL_REPORTS: 'view_financial_reports',
}
```

---

### 2️⃣ 상담 기록 시스템 (Counseling & Consultation)

학생과 학부모와의 상담을 체계적으로 관리합니다.

**주요 기능:**

```javascript
const COUNSELING_SESSION_SCHEMA = {
  id: 'counsel_001',
  student_id: 'stu_001',
  teacher_id: 'teacher_001',
  session_date: '2024-01-15T15:00:00Z',
  duration_minutes: 30,
  topic: 'academic_performance',  // academic_performance, behavior, career, other
  summary: '수학 발음 개선 필요',
  recommendations: ['주 3일 추가 학습', 'Speaking 집중'],
  next_review_date: '2024-02-15',
  notes_file_id: 'file_001',  // 녹음/기록 파일
}

const PARENT_MEETING_SCHEMA = {
  id: 'meeting_001',
  student_id: 'stu_001',
  parent_ids: ['parent_001'],
  scheduled_date: '2024-02-01T16:00:00Z',
  actual_date: '2024-02-01T16:00:00Z',
  location: 'room_3',
  attendees: ['teacher_001', 'admin_001'],
  topics: ['Progress Report', 'Payment Status'],
  summary: '학생의 진도가 좋습니다.',
  next_meeting_date: '2024-05-01',
}

const CAREER_PATH_SCHEMA = {
  id: 'career_001',
  student_id: 'stu_001',
  current_level: 'intermediate',
  target_level: 'advanced',
  timeline: '6개월',
  milestones: [
    { month: 1, goal: 'TOEIC 기초 완성' },
    { month: 3, goal: 'TOEIC 700점' },
    { month: 6, goal: 'TOEIC 800점' },
  ],
  last_updated: '2024-01-01T00:00:00Z',
}
```

**권장 기능:**
- 상담 일정 관리
- 상담 내용 및 기록 저장
- 학부모 면담 일정 추적
- 학생 진로 상담 기록
- 학습 진도 공유 기능
- 상담 후 조치사항 추적
- 학생 성장 곡선 분석
- 자동 리뷰 알림

**API 예제:**
```javascript
export const counselingAPI = {
  async scheduleCounseling(data) { /* ... */ },
  async getCounselingHistory(studentId) { /* ... */ },
  async recordSession(sessionData) { /* ... */ },
  async getStudentCareerPath(studentId) { /* ... */ },
  async scheduleParentMeeting(data) { /* ... */ },
  async generateProgressReport(studentId) { /* ... */ },
}
```

---

### 3️⃣ 강사 관리 (Instructor Management)

강사들의 근무 일정, 급여, 평가를 관리합니다.

**주요 기능:**

```javascript
const INSTRUCTOR_SCHEMA = {
  id: 'teacher_001',
  name: '김선생',
  email: 'teacher@academy.com',
  phone: '010-1111-1111',
  qualifications: ['TOEIC 900+', 'Master\'s Degree'],
  specializations: ['Speaking', 'TOEIC'],
  hire_date: '2023-01-01',
  status: 'active',  // active, on_leave, terminated
  employment_type: 'full_time',  // full_time, part_time, contract
}

const INSTRUCTOR_SCHEDULE_SCHEMA = {
  id: 'sched_001',
  instructor_id: 'teacher_001',
  date: '2024-01-01',
  start_time: '09:00',
  end_time: '17:00',
  classes: ['class_001', 'class_002'],
  total_hours: 8,
  notes: '휴게시간 포함',
}

const INSTRUCTOR_SALARY_SCHEMA = {
  id: 'salary_001',
  instructor_id: 'teacher_001',
  period: '2024-01',  // YYYY-MM
  base_salary: 2000000,
  bonus: 200000,  // 상여금
  deductions: 300000,  // 세금, 보험료 등
  net_salary: 1900000,
  payment_date: '2024-02-01',
  status: 'paid',  // pending, paid, cancelled
}

const INSTRUCTOR_EVALUATION_SCHEMA = {
  id: 'eval_001',
  instructor_id: 'teacher_001',
  evaluator_id: 'admin_001',
  period: '2024-01',
  teaching_quality: 9,  // 1-10
  student_feedback: 8.5,
  attendance: 10,
  professional_development: 8,
  overall_score: 8.9,
  comments: '매우 우수한 강사',
  reviewed_at: '2024-02-01T00:00:00Z',
}
```

**권장 기능:**
- 강사 기본 정보 관리
- 주간/월간 시간표 관리
- 자동 급여 계산
- 급여 지급 현황
- 강사 평가 및 피드백
- 근무 시간 자동 집계
- 강사별 학생 만족도
- 전문성 개발 추적
- 근태 관리

**API 예제:**
```javascript
export const instructorAPI = {
  async getInstructors() { /* ... */ },
  async createInstructor(data) { /* ... */ },
  async getSchedule(instructorId, month) { /* ... */ },
  async calculateSalary(instructorId, period) { /* ... */ },
  async submitEvaluation(evaluationData) { /* ... */ },
  async getInstructorStats(instructorId) { /* ... */ },
}
```

---

### 4️⃣ 교재 & 자료 관리 (Curriculum & Materials)

교재, 학습 자료, 진도를 통합 관리합니다.

**주요 기능:**

```javascript
const TEXTBOOK_SCHEMA = {
  id: 'book_001',
  title: 'English 101',
  author: 'John Smith',
  publisher: 'Oxford',
  edition: 2,
  isbn: '978-0-123456-78-9',
  language: 'English',
  level: 'beginner',
  units: 20,
  publication_date: '2023-01-01',
  status: 'active',  // active, archived
}

const TEXTBOOK_INVENTORY_SCHEMA = {
  id: 'inv_001',
  textbook_id: 'book_001',
  total_copies: 50,
  available_copies: 45,
  copies_in_use: 5,
  location: 'storage_1',
  last_updated: '2024-01-01T00:00:00Z',
}

const LEARNING_MATERIAL_SCHEMA = {
  id: 'material_001',
  textbook_id: 'book_001',
  unit: 5,
  lesson: 3,
  title: 'Lesson 3: Daily Conversations',
  content_type: 'pdf',  // pdf, video, audio, interactive
  file_url: '/materials/book_001_u5_l3.pdf',
  duration_minutes: 45,  // for video/audio
  difficulty_level: 'intermediate',
  created_at: '2023-06-01',
  version: 2,  // 버전 관리
}

const CURRICULUM_PROGRESS_SCHEMA = {
  id: 'prog_001',
  student_id: 'stu_001',
  textbook_id: 'book_001',
  current_unit: 5,
  current_lesson: 3,
  completion_percentage: 25,
  last_studied: '2024-01-15T15:30:00Z',
  mastery_level: 'proficient',  // beginner, developing, proficient, advanced
  review_needed: ['unit_2', 'unit_3'],  // 복습 필요 단원
}

const ONLINE_RESOURCE_SCHEMA = {
  id: 'resource_001',
  title: 'Speaking Practice Platform',
  type: 'external_link',  // external_link, document, video_playlist
  url: 'https://platform.example.com',
  description: '일상 영어 회화 연습',
  difficulty: ['beginner', 'intermediate'],
  category: 'speaking',
  access_type: 'public',  // public, restricted_to_class, private
  last_updated: '2024-01-01',
}
```

**권장 기능:**
- 교재 카탈로그 관리
- 교재 재고 추적
- 온라인 학습 자료 관리
- 자료 버전 관리
- 학생별 진도 추적
- 단원별 난이도 분석
- 복습 필요 콘텐츠 자동 감지
- 교재 활용률 분석
- 자료 업데이트 히스토리

**API 예제:**
```javascript
export const curriculumAPI = {
  async getTextbooks() { /* ... */ },
  async getMaterials(textbookId, unit) { /* ... */ },
  async getStudentProgress(studentId, textbookId) { /* ... */ },
  async updateProgress(studentId, progressData) { /* ... */ },
  async getReviewNeeded(studentId) { /* ... */ },
  async manageMaterialVersion(materialId, version) { /* ... */ },
}
```

---

### 5️⃣ 뉴스레터 & 커뮤니케이션 (Communications)

학생, 학부모, 강사와의 효과적인 커뮤니케이션을 자동화합니다.

**주요 기능:**

```javascript
const NEWSLETTER_TEMPLATE_SCHEMA = {
  id: 'template_001',
  name: '월간 학습 현황 리포트',
  type: 'student_progress',  // student_progress, announcement, payment_reminder, etc
  subject_template: '{{month}} 월 학습 현황',
  content_template: `
    안녕하세요, {{student_name}}님!
    이번 달 학습 현황을 알려드립니다.
    - 총 학습 시간: {{total_hours}}시간
    - 평균 점수: {{avg_score}}점
    - 진도: {{progress_percent}}%
  `,
  recipient_type: 'student',  // student, parent, teacher
  trigger: 'monthly',  // manual, weekly, monthly, event_based
  created_at: '2024-01-01',
}

const NOTIFICATION_SCHEDULE_SCHEMA = {
  id: 'notif_001',
  template_id: 'template_001',
  scheduled_date: '2024-02-01T08:00:00Z',
  recipients: ['stu_001', 'stu_002'],
  channels: ['email', 'sms'],  // email, sms, push, in_app
  sent_at: null,
  status: 'scheduled',  // scheduled, sent, failed
  retry_count: 0,
}

const ANNOUNCEMENT_SCHEMA = {
  id: 'announce_001',
  title: '2024년 1학기 개강 공지',
  content: '새로운 학기가 시작됩니다...',
  author_id: 'admin_001',
  category: 'general',  // general, class_specific, emergency
  target_audience: 'all',  // all, students, parents, teachers, specific_class
  priority: 'high',  // low, medium, high, urgent
  publish_date: '2024-01-01T00:00:00Z',
  expire_date: '2024-12-31T23:59:59Z',
  status: 'published',
}

const MESSAGE_THREAD_SCHEMA = {
  id: 'thread_001',
  title: 'Speaking 진도 상담',
  participants: ['teacher_001', 'parent_001'],
  related_student_id: 'stu_001',
  created_at: '2024-01-15T10:00:00Z',
  last_message_at: '2024-01-16T14:30:00Z',
  messages: [
    {
      id: 'msg_001',
      sender_id: 'teacher_001',
      content: '학생이 발음이 많이 개선되었습니다.',
      timestamp: '2024-01-15T10:00:00Z',
      attachments: ['file_001'],
    },
  ],
}

const SMS_LOG_SCHEMA = {
  id: 'sms_001',
  recipient_phone: '010-1234-5678',
  recipient_id: 'student_001',  // 또는 parent_001
  content: '내일 수업이 있습니다.',
  sent_at: '2024-01-15T15:30:00Z',
  delivery_status: 'delivered',  // pending, sent, delivered, failed
  carrier: 'SKT',
  cost: 100,  // 원
}
```

**권장 기능:**
- 정기 뉴스레터 자동 발송
- SMS/이메일 자동화
- 맞춤형 통보 (지각, 연체, 성적 향상 등)
- 공지사항 관리
- 우수 학생 표창 시스템
- 학부모-강사 메시지 시스템
- 자동 알림 로그 및 분석
- 발송 실패 자동 재시도
- 수신 거부 관리

**API 예제:**
```javascript
export const communicationAPI = {
  async getTemplates() { /* ... */ },
  async createTemplate(templateData) { /* ... */ },
  async sendNewsletter(templateId, recipientIds) { /* ... */ },
  async publishAnnouncement(announcementData) { /* ... */ },
  async sendNotification(notificationData) { /* ... */ },
  async getMessageThread(threadId) { /* ... */ },
  async sendMessage(threadId, messageData) { /* ... */ },
  async getNotificationLog(filters) { /* ... */ },
}
```

---

## 🎯 구현 우선순위

### Phase 1 (필수) - 1~2개월
1. **계약 & 결제 관리** - 수익 추적의 핵심
2. **상담 기록 시스템** - 학생 관리 고도화

### Phase 2 (권장) - 2~3개월
3. **강사 관리** - 운영 효율화
4. **교재 & 자료 관리** - 학습 콘텐츠 통합

### Phase 3 (부가) - 3~4개월
5. **뉴스레터 & 커뮤니케이션** - 사용자 경험 향상

---

## 💾 데이터 마이그레이션 전략

각 기능이 추가될 때마다:

1. **스키마 정의** - `config/dataSchemas.js`에 추가
2. **API 작성** - `api/hiddenFeatures.js`에 엔드포인트 추가
3. **데이터 마이그레이션** - 기존 데이터 호환성 유지
4. **백엔드 연동** - localStorage → 실제 DB 전환
5. **테스트** - 각 기능별 통합 테스트

---

## 🔗 외부 서비스 통합

### 필수 연동
- **결제 게이트웨이** (PG사: 토스, 나이스, 페이플 등)
- **SMS 발송 서비스** (LG U+, SKT, KT 등)
- **이메일 서비스** (SendGrid, AWS SES 등)
- **파일 저장소** (AWS S3, Google Drive 등)

### 선택 연동
- **Slack/Telegram** - 관리자 알림
- **Google Calendar** - 일정 동기화
- **Zoom** - 화상 수업 연동

---

## 📊 분석 & 리포팅

모든 기능에 다음의 리포팅 기능을 포함하세요:

```javascript
const REPORT_SCHEMA = {
  type: 'daily_sales',  // daily_sales, student_performance, attendance, etc
  period: 'monthly',
  generated_at: '2024-02-01T00:00:00Z',
  data: {
    total_revenue: 5000000,
    new_students: 12,
    churn_rate: 5,
    average_satisfaction: 4.5,
  },
  export_formats: ['pdf', 'xlsx', 'csv'],
}
```

---

## ✅ 체크리스트

각 기능 추가 시:
- [ ] Feature Flag 정의
- [ ] RBAC 권한 정의
- [ ] 데이터 스키마 정의
- [ ] API 작성 (localStorage + 백엔드 준비)
- [ ] UI 컴포넌트 생성
- [ ] 권한 검증 로직
- [ ] 에러 처리
- [ ] 단위 테스트
- [ ] 통합 테스트
- [ ] 사용자 문서 작성
- [ ] 교육 자료 준비

---

**다음 단계:** `EXPANSION_GUIDE.md`를 참고하여 기능을 하나씩 추가하세요!
