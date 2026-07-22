/**
 * Feature Management Panel (Admin Only)
 * 관리자가 Feature Flag와 사용자 역할을 관리할 수 있는 패널입니다.
 * 숨김 기능들을 활성화/비활성화할 수 있습니다.
 */

import React, { useState, useEffect } from 'react'
import {
  getAllFeatures,
  setFeatureEnabled,
  setMultipleFeatures,
  getFeaturesByCategory,
} from '../config/features'
import {
  ROLES,
  PERMISSIONS,
  getUserRole,
  setUserRole,
  getUserPermissions,
  getRolePermissions,
} from '../config/rbac'
import { hasPermission, PERMISSIONS as PERMS } from '../config/rbac'

const FEATURE_CATEGORIES = [
  {
    id: 'classManagement',
    name: '반 관리 (Class Management)',
    description: '반 생성, 수정, 삭제 기능',
    color: 'blue',
  },
  {
    id: 'studentManagement',
    name: '학생 관리 (Student Management)',
    description: '학생 등록, 편집, 단어 배정 기능',
    color: 'green',
  },
  {
    id: 'homework',
    name: '숙제 관리 (Homework)',
    description: '숙제 제출 및 통계 기능',
    color: 'yellow',
  },
  {
    id: 'ranking',
    name: '포인트 및 랭킹 (Ranking)',
    description: '포인트, 랭킹, 보상 시스템',
    color: 'purple',
  },
  {
    id: 'aiAnalysis',
    name: 'AI 학습 분석 (AI Analysis)',
    description: '오답노트, 취약단어, 복습 추천',
    color: 'indigo',
  },
  {
    id: 'schoolManagement',
    name: '학원 운영 (School Management)',
    description: '대시보드, 출석, 학부모 포털 등',
    color: 'red',
  },
  {
    id: 'attachment',
    name: '애착 시스템 (Attachment & Growth)',
    description: '모자 컬렉션, 단어 박물관, 성장 앨범, 폴의 기억, 잉글리시 월드',
    color: 'purple',
  },
]

function FeatureCategoryToggle({ category, features }) {
  const [expanded, setExpanded] = useState(false)
  const categoryFeatures = getFeaturesByCategory(category.id)
  const allEnabled = categoryFeatures.every(f => features[f] === true)
  const someEnabled = categoryFeatures.some(f => features[f] === true)

  const toggleAll = () => {
    const newState = {}
    categoryFeatures.forEach(f => {
      newState[f] = !allEnabled
    })
    setMultipleFeatures(newState)
  }

  return (
    <div className={`border-l-4 border-${category.color}-400 bg-${category.color}-50 p-4 rounded mb-4`}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <h3 className="font-bold text-lg">{category.name}</h3>
          <p className="text-sm text-gray-600">{category.description}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleAll()
          }}
          className={`ml-4 px-4 py-2 rounded font-bold text-white ${
            allEnabled ? 'bg-green-500 hover:bg-green-600' : someEnabled ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-gray-400 hover:bg-gray-500'
          }`}
        >
          {allEnabled ? '켜짐' : someEnabled ? '일부' : '꺼짐'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2 pt-4 border-t">
          {categoryFeatures.map(featureName => (
            <div key={featureName} className="flex items-center">
              <input
                type="checkbox"
                id={featureName}
                checked={features[featureName] === true}
                onChange={(e) => setFeatureEnabled(featureName, e.target.checked)}
                className="mr-3"
              />
              <label htmlFor={featureName} className="flex-1 cursor-pointer">
                <code className="text-sm bg-white px-2 py-1 rounded">{featureName}</code>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RolePermissionViewer() {
  const currentRole = getUserRole()

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-2xl font-bold mb-4">👤 현재 역할 및 권한</h2>
      
      <div className="mb-6">
        <p className="font-bold mb-2">현재 역할: <span className="text-lg text-purple-600">{currentRole}</span></p>
        <p className="text-sm text-gray-600 mb-4">
          역할을 변경하려면 개발자 도구에서 다음을 실행하세요:
        </p>
        <code className="block bg-gray-100 p-3 rounded text-xs mb-3">
          setUserRole('admin') // admin, teacher, super_admin 등
        </code>
      </div>

      <div className="bg-blue-50 p-4 rounded mb-4">
        <h3 className="font-bold mb-2">보유한 권한들:</h3>
        <div className="flex flex-wrap gap-2">
          {getUserPermissions().map(perm => (
            <span key={perm} className="bg-blue-200 text-blue-900 px-3 py-1 rounded-full text-xs">
              {perm}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold">다른 역할의 권한 보기:</h3>
        {Object.values(ROLES).map(role => (
          <div key={role} className="bg-gray-50 p-3 rounded">
            <p className="font-bold text-sm mb-2">{role}</p>
            <div className="flex flex-wrap gap-1">
              {getRolePermissions(role).slice(0, 5).map(perm => (
                <span key={perm} className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-xs">
                  {perm}
                </span>
              ))}
              {getRolePermissions(role).length > 5 && (
                <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-xs">
                  +{getRolePermissions(role).length - 5} 더보기
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function FeatureManagementPanel() {
  const [features, setFeatures] = useState(() => getAllFeatures())
  const [tab, setTab] = useState('features')

  // features 변경시 UI 업데이트
  const refreshFeatures = () => {
    setFeatures(getAllFeatures())
  }

  // Feature 변경이 감지되면 자동 새로고침
  useEffect(() => {
    const interval = setInterval(refreshFeatures, 1000)
    return () => clearInterval(interval)
  }, [])

  if (!hasPermission(PERMS.MANAGE_FEATURES)) {
    return (
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 text-center">
        <h2 className="text-2xl font-bold text-red-900 mb-2">❌ 접근 권한 없음</h2>
        <p className="text-red-700">이 패널은 관리자만 접근할 수 있습니다.</p>
        <p className="text-sm text-red-600 mt-4">현재 역할: {getUserRole()}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h1 className="text-3xl font-bold mb-2">⚙️ 기능 관리 패널</h1>
      <p className="text-gray-600 mb-6">숨김 기능들을 활성화/비활성화하고 사용자 역할을 관리합니다.</p>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setTab('features')}
          className={`px-4 py-2 font-bold ${
            tab === 'features'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          🎯 기능 토글
        </button>
        <button
          onClick={() => setTab('roles')}
          className={`px-4 py-2 font-bold ${
            tab === 'roles'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          👤 역할 & 권한
        </button>
      </div>

      {/* Features Tab */}
      {tab === 'features' && (
        <div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-900">
              ⚠️ <strong>주의:</strong> 기능을 활성화하면 메뉴와 화면에 표시됩니다. 
              비활성화하면 다시 숨겨집니다. 모든 데이터는 유지됩니다.
            </p>
          </div>

          {FEATURE_CATEGORIES.map(category => (
            <FeatureCategoryToggle
              key={category.id}
              category={category}
              features={features}
            />
          ))}

          <div className="mt-6 p-4 bg-gray-50 rounded text-sm text-gray-600">
            <p className="mb-2">💾 <strong>자동 저장됩니다.</strong> 페이지를 새로고침해도 설정이 유지됩니다.</p>
            <p>🔧 개발자는 다음 코드로 직접 조작할 수 있습니다:</p>
            <code className="block bg-white p-2 rounded mt-2 text-xs">
              import &#123; setFeatureEnabled &#125; from './config/features' <br/>
              setFeatureEnabled('classManagement', true)
            </code>
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {tab === 'roles' && (
        <div>
          <RolePermissionViewer />
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <h3 className="font-bold mb-2">🔐 역할 변경 방법 (개발자용)</h3>
            <p className="text-sm text-blue-900 mb-3">
              다음 코드를 브라우저 콘솔(F12)에서 실행하여 역할을 변경할 수 있습니다:
            </p>
            <code className="block bg-white p-3 rounded text-xs mb-2">
              import &#123; setUserRole &#125; from './config/rbac' <br/>
              setUserRole('admin') // 또는 'teacher', 'super_admin' 등
            </code>
            <p className="text-xs text-blue-700 mt-2">
              주의: 현재는 localStorage에만 저장됩니다. 향후 백엔드와 연동 시 서버에서 검증해야 합니다.
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
            <h3 className="font-bold mb-2">✅ 테스트 시나리오</h3>
            <div className="space-y-2 text-xs text-green-900">
              <p><strong>1. 학생</strong>: setUserRole('student') → 기본 학습 기능만 표시</p>
              <p><strong>2. 선생님</strong>: setUserRole('teacher') → 반 관리, 학생 관리, 숙제 등 표시</p>
              <p><strong>3. 관리자</strong>: setUserRole('admin') → 모든 기능 + 설정 패널 표시</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
