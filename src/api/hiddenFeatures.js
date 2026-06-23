/**
 * API Module for Hidden Features
 * 추후 백엔드 연동을 위한 API 엔드포인트 정의
 * 현재는 localStorage 기반으로 작동하며, 나중에 fetch로 쉽게 대체 가능합니다.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api'
const PREFIX = 'paulEasyVoca'

// ============================================
// Utility Functions
// ============================================

const getStorageKey = (resource, id = '') => {
  return `${PREFIX}_${resource}${id ? '_' + id : ''}`
}

const loadFromStorage = (key, defaultValue = []) => {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : defaultValue
  } catch (e) {
    console.error('Storage load error:', e)
    return defaultValue
  }
}

const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch (e) {
    console.error('Storage save error:', e)
    return false
  }
}

// ============================================
// 1. Class Management API
// ============================================
export const classAPI = {
  // GET /classes - 모든 반 조회
  async getClasses() {
    // 향후: return fetch(`${API_BASE_URL}/classes`).then(r => r.json())
    return loadFromStorage(getStorageKey('classes'), [])
  },

  // GET /classes/:id - 특정 반 조회
  async getClass(classId) {
    const classes = await this.getClasses()
    return classes.find(c => c.id === classId) || null
  },

  // POST /classes - 반 생성
  async createClass(classData) {
    const classes = await this.getClasses()
    const newClass = {
      id: `class_${Date.now()}`,
      ...classData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const updated = [...classes, newClass]
    saveToStorage(getStorageKey('classes'), updated)
    return newClass
  },

  // PUT /classes/:id - 반 수정
  async updateClass(classId, classData) {
    const classes = await this.getClasses()
    const updated = classes.map(c =>
      c.id === classId
        ? { ...c, ...classData, updated_at: new Date().toISOString() }
        : c
    )
    saveToStorage(getStorageKey('classes'), updated)
    return updated.find(c => c.id === classId)
  },

  // DELETE /classes/:id - 반 삭제
  async deleteClass(classId) {
    const classes = await this.getClasses()
    const filtered = classes.filter(c => c.id !== classId)
    saveToStorage(getStorageKey('classes'), filtered)
    return true
  },

  // GET /classes/:classId/students - 반의 학생들
  async getClassStudents(classId) {
    const students = await studentAPI.getStudents()
    return students.filter(s => s.class_id === classId)
  },
}

// ============================================
// 2. Student Management API
// ============================================
export const studentAPI = {
  // GET /students - 모든 학생 조회
  async getStudents() {
    return loadFromStorage(getStorageKey('students'), [])
  },

  // GET /students/:id - 특정 학생 조회
  async getStudent(studentId) {
    const students = await this.getStudents()
    return students.find(s => s.id === studentId) || null
  },

  // POST /students - 학생 등록
  async registerStudent(studentData) {
    const students = await this.getStudents()
    const newStudent = {
      id: `stu_${Date.now()}`,
      ...studentData,
      enrollment_date: new Date().toISOString(),
      status: 'active',
    }
    const updated = [...students, newStudent]
    saveToStorage(getStorageKey('students'), updated)
    return newStudent
  },

  // PUT /students/:id - 학생 정보 수정
  async updateStudent(studentId, studentData) {
    const students = await this.getStudents()
    const updated = students.map(s =>
      s.id === studentId ? { ...s, ...studentData } : s
    )
    saveToStorage(getStorageKey('students'), updated)
    return updated.find(s => s.id === studentId)
  },

  // DELETE /students/:id - 학생 삭제
  async deleteStudent(studentId) {
    const students = await this.getStudents()
    const filtered = students.filter(s => s.id !== studentId)
    saveToStorage(getStorageKey('students'), filtered)
    return true
  },

  // POST /students/:id/assign-words - 학생에게 단어 배정
  async assignWords(studentId, classId, wordIds) {
    const assignment = {
      id: `assign_${Date.now()}`,
      student_id: studentId,
      class_id: classId,
      assigned_words: wordIds,
      assignment_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      progress_percentage: 0,
      status: 'in_progress',
    }
    const assignments = loadFromStorage(getStorageKey('assignments'), [])
    const updated = [...assignments, assignment]
    saveToStorage(getStorageKey('assignments'), updated)
    return assignment
  },

  // GET /students/:id/progress - 학생 진도 조회
  async getStudentProgress(studentId) {
    const assignments = loadFromStorage(getStorageKey('assignments'), [])
    return assignments.filter(a => a.student_id === studentId)
  },
}

// ============================================
// 3. Homework API
// ============================================
export const homeworkAPI = {
  // GET /homeworks - 모든 숙제 조회
  async getHomeworks(classId = null) {
    const homeworks = loadFromStorage(getStorageKey('homeworks'), [])
    return classId
      ? homeworks.filter(h => h.class_id === classId)
      : homeworks
  },

  // GET /homeworks/:id - 특정 숙제 조회
  async getHomework(homeworkId) {
    const homeworks = await this.getHomeworks()
    return homeworks.find(h => h.id === homeworkId) || null
  },

  // POST /homeworks - 숙제 생성
  async createHomework(homeworkData) {
    const homeworks = await this.getHomeworks()
    const newHomework = {
      id: `hw_${Date.now()}`,
      ...homeworkData,
      created_at: new Date().toISOString(),
      status: 'active',
    }
    const updated = [...homeworks, newHomework]
    saveToStorage(getStorageKey('homeworks'), updated)
    return newHomework
  },

  // PUT /homeworks/:id - 숙제 수정
  async updateHomework(homeworkId, homeworkData) {
    const homeworks = await this.getHomeworks()
    const updated = homeworks.map(h =>
      h.id === homeworkId ? { ...h, ...homeworkData } : h
    )
    saveToStorage(getStorageKey('homeworks'), updated)
    return updated.find(h => h.id === homeworkId)
  },

  // POST /homeworks/:id/submit - 숙제 제출
  async submitHomework(homeworkId, studentId, submissionData) {
    const submission = {
      id: `sub_${Date.now()}`,
      homework_id: homeworkId,
      student_id: studentId,
      submitted_at: new Date().toISOString(),
      ...submissionData,
      status: 'submitted',
    }
    const submissions = loadFromStorage(getStorageKey('submissions'), [])
    const updated = [...submissions, submission]
    saveToStorage(getStorageKey('submissions'), updated)
    return submission
  },

  // GET /homeworks/:id/submissions - 숙제 제출 현황
  async getSubmissions(homeworkId) {
    const submissions = loadFromStorage(getStorageKey('submissions'), [])
    return submissions.filter(s => s.homework_id === homeworkId)
  },

  // GET /homeworks/:id/statistics - 숙제 통계
  async getHomeworkStats(homeworkId) {
    const submissions = await this.getSubmissions(homeworkId)
    const totalSubmitted = submissions.length
    const totalGraded = submissions.filter(s => s.status === 'graded').length
    const avgScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0) / totalSubmitted || 0
    return {
      homeworkId,
      totalSubmitted,
      totalGraded,
      avgScore,
      submissionRate: totalSubmitted,
    }
  },
}

// ============================================
// 4. Points & Ranking API
// ============================================
export const rankingAPI = {
  // POST /points - 포인트 적립
  async addPoints(studentId, amount, reason, description) {
    const transaction = {
      id: `point_${Date.now()}`,
      student_id: studentId,
      amount,
      reason,
      description,
      timestamp: new Date().toISOString(),
    }
    const transactions = loadFromStorage(getStorageKey('transactions'), [])
    const updated = [...transactions, transaction]
    saveToStorage(getStorageKey('transactions'), updated)
    return transaction
  },

  // GET /students/:id/points - 학생의 총 포인트
  async getStudentPoints(studentId) {
    const transactions = loadFromStorage(getStorageKey('transactions'), [])
    return transactions
      .filter(t => t.student_id === studentId)
      .reduce((sum, t) => sum + t.amount, 0)
  },

  // GET /classes/:id/ranking - 반 랭킹
  async getClassRanking(classId) {
    const students = await studentAPI.getStudents()
    const classStudents = students.filter(s => s.class_id === classId)

    const ranking = await Promise.all(
      classStudents.map(async (student) => ({
        student_id: student.id,
        name: student.name,
        total_points: await this.getStudentPoints(student.id),
      }))
    )

    return ranking
      .sort((a, b) => b.total_points - a.total_points)
      .map((item, index) => ({ ...item, rank: index + 1 }))
  },

  // GET /ranking - 전체 랭킹
  async getGlobalRanking() {
    const students = await studentAPI.getStudents()
    const ranking = await Promise.all(
      students.map(async (student) => ({
        student_id: student.id,
        name: student.name,
        class_id: student.class_id,
        total_points: await this.getStudentPoints(student.id),
      }))
    )
    return ranking
      .sort((a, b) => b.total_points - a.total_points)
      .map((item, index) => ({ ...item, rank: index + 1 }))
  },
}

// ============================================
// 5. AI Analysis API
// ============================================
export const aiAnalysisAPI = {
  // GET /students/:id/wrong-answers - 오답노트
  async getWrongAnswers(studentId) {
    const wrongAnswers = loadFromStorage(getStorageKey('wrongAnswers'), [])
    return wrongAnswers.filter(w => w.student_id === studentId)
  },

  // POST /students/:id/wrong-answer - 오답 기록
  async recordWrongAnswer(studentId, wordId, wrongAnswerData) {
    const wrongAnswer = {
      id: `wrong_${Date.now()}`,
      student_id: studentId,
      word_id: wordId,
      ...wrongAnswerData,
      timestamp: new Date().toISOString(),
    }
    const wrongAnswers = loadFromStorage(getStorageKey('wrongAnswers'), [])
    const updated = [...wrongAnswers, wrongAnswer]
    saveToStorage(getStorageKey('wrongAnswers'), updated)
    return wrongAnswer
  },

  // GET /students/:id/weak-words - 취약 단어 분석
  async getWeakWords(studentId) {
    const wrongAnswers = await this.getWrongAnswers(studentId)
    const weakWords = {}

    wrongAnswers.forEach(wa => {
      if (!weakWords[wa.word_id]) {
        weakWords[wa.word_id] = {
          word_id: wa.word_id,
          wrong_count: 0,
          attempt_count: 0,
          last_reviewed_at: null,
        }
      }
      weakWords[wa.word_id].wrong_count++
      weakWords[wa.word_id].last_reviewed_at = wa.timestamp
    })

    return Object.values(weakWords)
      .map(w => ({
        ...w,
        accuracy_rate: Math.max(0, 100 - (w.wrong_count / Math.max(1, w.attempt_count) * 100)),
        review_priority: w.wrong_count >= 5 ? 'urgent' : w.wrong_count >= 3 ? 'high' : 'medium',
      }))
      .sort((a, b) => b.wrong_count - a.wrong_count)
  },

  // GET /students/:id/recommendations - 복습 추천
  async getReviewRecommendations(studentId) {
    const weakWords = await this.getWeakWords(studentId)
    const recommendations = weakWords
      .filter(w => w.accuracy_rate < 80)
      .slice(0, 10)
      .map(w => w.word_id)

    return {
      id: `rec_${Date.now()}`,
      student_id: studentId,
      recommended_word_ids: recommendations,
      reason: 'low_accuracy_rate',
      recommended_at: new Date().toISOString(),
      priority: recommendations.length > 5 ? 'high' : 'medium',
    }
  },

  // GET /students/:id/learning-stats - 학습 통계
  async getLearningStats(studentId, period = null) {
    const wrongAnswers = await this.getWrongAnswers(studentId)
    const currentMonth = period || new Date().toISOString().slice(0, 7)

    const monthWrongAnswers = wrongAnswers.filter(
      w => w.timestamp.slice(0, 7) === currentMonth
    )

    return {
      student_id: studentId,
      period: currentMonth,
      total_quiz_attempts: monthWrongAnswers.length,
      total_correct: 0,
      accuracy_rate: 0,
      updated_at: new Date().toISOString(),
    }
  },
}

// ============================================
// 6. School Management API
// ============================================
export const schoolAPI = {
  // GET /semesters - 학기 조회
  async getSemesters() {
    return loadFromStorage(getStorageKey('semesters'), [])
  },

  // POST /semesters - 학기 생성
  async createSemester(semesterData) {
    const semesters = await this.getSemesters()
    const newSemester = {
      id: `sem_${Date.now()}`,
      ...semesterData,
      created_at: new Date().toISOString(),
    }
    const updated = [...semesters, newSemester]
    saveToStorage(getStorageKey('semesters'), updated)
    return newSemester
  },

  // GET /attendance - 출석 조회
  async getAttendance(classId, date = null) {
    const attendance = loadFromStorage(getStorageKey('attendance'), [])
    let filtered = attendance.filter(a => a.class_id === classId)
    if (date) {
      filtered = filtered.filter(a => a.date === date)
    }
    return filtered
  },

  // POST /attendance - 출석 기록
  async recordAttendance(studentId, classId, attendanceData) {
    const record = {
      id: `attend_${Date.now()}`,
      student_id: studentId,
      class_id: classId,
      date: new Date().toISOString().split('T')[0],
      ...attendanceData,
    }
    const attendance = loadFromStorage(getStorageKey('attendance'), [])
    const updated = [...attendance, record]
    saveToStorage(getStorageKey('attendance'), updated)
    return record
  },
}

export default {
  classAPI,
  studentAPI,
  homeworkAPI,
  rankingAPI,
  aiAnalysisAPI,
  schoolAPI,
}
