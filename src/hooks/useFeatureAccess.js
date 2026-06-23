/**
 * Conditional Rendering Hook for Hidden Features
 * Feature Flag와 RBAC를 통합하여 컴포넌트를 조건부로 렌더링합니다.
 */

import { isFeatureEnabled } from '../config/features'
import { hasPermission } from '../config/rbac'

/**
 * Feature와 권한을 확인하고 렌더링 여부를 결정합니다.
 * @param {string} featureName - Feature Flag 이름
 * @param {string|string[]} requiredPermissions - 필요한 권한 (선택사항)
 * @returns {boolean} 렌더링 가능 여부
 */
export const canRenderFeature = (featureName, requiredPermissions = null) => {
  // Feature Flag가 비활성화되면 렌더링 안 함
  if (!isFeatureEnabled(featureName)) {
    return false
  }

  // 권한이 지정된 경우 확인
  if (requiredPermissions) {
    if (Array.isArray(requiredPermissions)) {
      return requiredPermissions.every(p => hasPermission(p))
    }
    return hasPermission(requiredPermissions)
  }

  return true
}

/**
 * 여러 Feature 중 하나라도 활성화되었으면 true
 * @param {string[]} featureNames - Feature Flag 이름 배열
 * @returns {boolean}
 */
export const canRenderAnyFeature = (featureNames) => {
  return featureNames.some(name => isFeatureEnabled(name))
}

/**
 * 디버깅용: 특정 기능의 활성화 상태와 사유를 확인
 * @param {string} featureName
 * @param {string|string[]} requiredPermissions
 * @returns {Object}
 */
export const debugFeatureAccess = (featureName, requiredPermissions = null) => {
  const featureEnabled = isFeatureEnabled(featureName)
  const permissionsOk = !requiredPermissions || canRenderFeature(featureName, requiredPermissions)

  return {
    feature: featureName,
    featureEnabled,
    permissionsOk,
    canRender: featureEnabled && permissionsOk,
    reason: !featureEnabled ? 'Feature disabled' : !permissionsOk ? 'Insufficient permissions' : 'OK',
  }
}

export default {
  canRenderFeature,
  canRenderAnyFeature,
  debugFeatureAccess,
}
