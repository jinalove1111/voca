/**
 * Hidden Feature Components
 * 향후 활성화될 기능들의 화면들입니다.
 * 현재는 모두 숨김 처리되어 있으며, Feature Flag 활성화 시 자동으로 표시됩니다.
 * 
 * 사용 방법:
 * 1. isFeatureEnabled('classManagement')로 활성화 상태 확인
 * 2. 활성화되면 <ClassManagement />을 렌더링
 * 3. Feature Flag를 비활성화하면 자동으로 숨김
 */

import React, { useState, useEffect } from 'react'
import { isFeatureEnabled } from '../config/features'
import { canRenderFeature } from '../hooks/useFeatureAccess'

// ============================================
// 1. Class Management Component
// ============================================
export function ClassManagement() {
  if (!canRenderFeature('classManagement')) {
    return null
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">반 관리</h2>
      <p className="text-gray-600 mb-4">이 기능은 아직 개발 중입니다.</p>
      
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 rounded">
          <h3 className="font-bold text-blue-900">반 생성</h3>
          <p className="text-blue-700 text-sm">새로운 반을 만들고 학생들을 배정할 수 있습니다.</p>
        </div>
        <div className="p-4 bg-blue-50 rounded">
          <h3 className="font-bold text-blue-900">반 수정</h3>
          <p className="text-blue-700 text-sm">반의 정보를 수정하고 학생을 변경할 수 있습니다.</p>
        </div>
        <div className="p-4 bg-blue-50 rounded">
          <h3 className="font-bold text-blue-900">반 삭제</h3>
          <p className="text-blue-700 text-sm">더 이상 필요 없는 반을 삭제할 수 있습니다.</p>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 2. Student Management Component
// ============================================
export function StudentManagement() {
  if (!canRenderFeature('studentManagement')) {
    return null
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">학생 관리</h2>
      <p className="text-gray-600 mb-4">이 기능은 아직 개발 중입니다.</p>
      
      <div className="space-y-4">
        <div className="p-4 bg-green-50 rounded">
          <h3 className="font-bold text-green-900">학생 등록</h3>
          <p className="text-green-700 text-sm">새로운 학생을 등록하고 반에 배정합니다.</p>
        </div>
        <div className="p-4 bg-green-50 rounded">
          <h3 className="font-bold text-green-900">학생별 단어 배정</h3>
          <p className="text-green-700 text-sm">개별 학생에게 학습할 단어를 배정합니다.</p>
        </div>
        <div className="p-4 bg-green-50 rounded">
          <h3 className="font-bold text-green-900">학생별 진도 저장</h3>
          <p className="text-green-700 text-sm">학생의 학습 진도를 자동으로 저장합니다.</p>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 3. Homework Component
// ============================================
export function HomeworkManagement() {
  if (!canRenderFeature('homework')) {
    return null
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">숙제 관리</h2>
      <p className="text-gray-600 mb-4">이 기능은 아직 개발 중입니다.</p>
      
      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 rounded">
          <h3 className="font-bold text-yellow-900">숙제 제출 여부</h3>
          <p className="text-yellow-700 text-sm">학생들의 숙제 제출 현황을 확인합니다.</p>
        </div>
        <div className="p-4 bg-yellow-50 rounded">
          <h3 className="font-bold text-yellow-900">숙제 완료율</h3>
          <p className="text-yellow-700 text-sm">각 학생의 숙제 완료율을 확인합니다.</p>
        </div>
        <div className="p-4 bg-yellow-50 rounded">
          <h3 className="font-bold text-yellow-900">숙제 통계</h3>
          <p className="text-yellow-700 text-sm">반별, 전체 숙제 통계를 분석합니다.</p>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 4. Ranking & Points Component
// ============================================
export function RankingSystem() {
  if (!canRenderFeature('ranking')) {
    return null
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">포인트 및 랭킹</h2>
      <p className="text-gray-600 mb-4">이 기능은 아직 개발 중입니다.</p>
      
      <div className="space-y-4">
        <div className="p-4 bg-purple-50 rounded">
          <h3 className="font-bold text-purple-900">포인트 적립</h3>
          <p className="text-purple-700 text-sm">학습 활동에 따라 자동으로 포인트를 적립합니다.</p>
        </div>
        <div className="p-4 bg-purple-50 rounded">
          <h3 className="font-bold text-purple-900">랭킹 시스템</h3>
          <p className="text-purple-700 text-sm">반 내, 전체 학생의 순위를 표시합니다.</p>
        </div>
        <div className="p-4 bg-purple-50 rounded">
          <h3 className="font-bold text-purple-900">보상 시스템</h3>
          <p className="text-purple-700 text-sm">포인트로 보상과 뱃지를 얻을 수 있습니다.</p>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 5. AI Analysis Component
// ============================================
export function AIAnalytics() {
  if (!canRenderFeature('aiAnalysis')) {
    return null
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">AI 학습 분석</h2>
      <p className="text-gray-600 mb-4">이 기능은 아직 개발 중입니다.</p>
      
      <div className="space-y-4">
        <div className="p-4 bg-indigo-50 rounded">
          <h3 className="font-bold text-indigo-900">오답노트</h3>
          <p className="text-indigo-700 text-sm">틀린 문제들을 자동으로 기록하고 분석합니다.</p>
        </div>
        <div className="p-4 bg-indigo-50 rounded">
          <h3 className="font-bold text-indigo-900">취약 단어 분석</h3>
          <p className="text-indigo-700 text-sm">자주 틀리는 단어들을 자동으로 파악합니다.</p>
        </div>
        <div className="p-4 bg-indigo-50 rounded">
          <h3 className="font-bold text-indigo-900">추천 복습 단어</h3>
          <p className="text-indigo-700 text-sm">AI가 학생에게 맞춤 복습 단어를 추천합니다.</p>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 6. School Management Components
// ============================================
export function SchoolDashboard() {
  if (!canRenderFeature('schoolDashboard')) {
    return null
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">학원 대시보드</h2>
      <p className="text-gray-600 mb-4">이 기능은 아직 개발 중입니다.</p>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded">
          <p className="text-lg font-bold">0</p>
          <p className="text-sm text-gray-600">총 학생 수</p>
        </div>
        <div className="p-4 bg-gray-50 rounded">
          <p className="text-lg font-bold">0</p>
          <p className="text-sm text-gray-600">총 반 수</p>
        </div>
        <div className="p-4 bg-gray-50 rounded">
          <p className="text-lg font-bold">0%</p>
          <p className="text-sm text-gray-600">전체 출석률</p>
        </div>
        <div className="p-4 bg-gray-50 rounded">
          <p className="text-lg font-bold">0</p>
          <p className="text-sm text-gray-600">평균 성적</p>
        </div>
      </div>
    </div>
  )
}

export function AttendanceManagement() {
  if (!canRenderFeature('attendanceTracking')) {
    return null
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">출석 관리</h2>
      <p className="text-gray-600">이 기능은 아직 개발 중입니다.</p>
    </div>
  )
}

export function ParentPortal() {
  if (!canRenderFeature('parentPortal')) {
    return null
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">학부모 포털</h2>
      <p className="text-gray-600">이 기능은 아직 개발 중입니다.</p>
    </div>
  )
}

/**
 * 모든 숨김 기능을 한 곳에서 조건부로 렌더링합니다.
 * App.jsx에서 이 컴포넌트를 사용하면 Feature Flag에 따라 자동으로 표시/숨김 처리됩니다.
 */
export function HiddenFeaturesPanel() {
  const features = [
    { component: ClassManagement, name: 'classManagement', title: '반 관리' },
    { component: StudentManagement, name: 'studentManagement', title: '학생 관리' },
    { component: HomeworkManagement, name: 'homework', title: '숙제 관리' },
    { component: RankingSystem, name: 'ranking', title: '포인트 및 랭킹' },
    { component: AIAnalytics, name: 'aiAnalysis', title: 'AI 학습 분석' },
    { component: SchoolDashboard, name: 'schoolDashboard', title: '학원 대시보드' },
    { component: AttendanceManagement, name: 'attendanceTracking', title: '출석 관리' },
    { component: ParentPortal, name: 'parentPortal', title: '학부모 포털' },
  ]

  // 활성화된 기능들만 필터링
  const activeFeatures = features.filter(f => isFeatureEnabled(f.name))

  if (activeFeatures.length === 0) {
    return null
  }

  return (
    <div className="p-6 bg-gray-50">
      <h1 className="text-3xl font-bold mb-8">개발 중인 기능들</h1>
      <div className="space-y-6">
        {activeFeatures.map(feature => (
          <feature.component key={feature.name} />
        ))}
      </div>
    </div>
  )
}

export default {
  ClassManagement,
  StudentManagement,
  HomeworkManagement,
  RankingSystem,
  AIAnalytics,
  SchoolDashboard,
  AttendanceManagement,
  ParentPortal,
  HiddenFeaturesPanel,
}
