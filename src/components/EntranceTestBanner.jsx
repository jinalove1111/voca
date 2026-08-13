import { useState, useEffect } from 'react'
import { fetchTodayTestsForClasses, findActiveTest } from '../utils/entranceTestApi'
import { getStudentEntranceClassIds } from '../utils/wordLibrary'

// ── Dashboard 진입 배너 ──────────────────────────────────────────────────
// 오늘 이 반의 시험이 하나라도 있으면 표시: active면 "참여하기"(빨강 강조),
// 종료됐으면 "오늘의 랭킹 보기"(차분한 톤). 테이블이 없거나 시험이 없으면
// 아무것도 렌더하지 않음(기존 대시보드에 영향 0). 20초 간격 폴링은 이
// 배너가 마운트된 동안(=대시보드에 있는 동안)만, 탭이 보일 때만 돈다.
//
// 성능(Phase 3, 2026-07-18): 예전엔 EntranceTest.jsx(응시/채점/랭킹 전체
// 로직, ~460줄) 안에 이 배너가 함께 있어서 Dashboard.jsx의 정적 import가
// 학생이 시험을 한 번도 안 열어도 그 전체 코드를 메인 번들에 끌고 왔다.
// 배너만 이 작은 파일로 분리 + App.jsx에서 EntranceTest는 React.lazy로
// 전환 — 배너 표시/폴링 동작은 완전히 동일(로직 이동만).
//
// B10(2026-08-02)은 "첫 조회 0건이면 폴링 중단"이었는데, 2026-08-14 Amin
// 실사고로 뒤집었다: 수업 직전에 교재가 배정되고 그 뒤 시험이 열리는 실제
// 운영 순서에서, 이미 켜져 있던 학생 앱은 (배정 이전의) 낡은 반 목록으로
// 한 번 조회해 0건을 받고 폴링을 영구히 멈춰 시험이 앱 재시작 전까지 안
// 보였다. 이제는:
//   - 폴링을 멈추지 않는다(마운트 중 + 탭이 보일 때만, 60초 주기 유지).
//   - 시험이 안 보이는 동안에는 매 폴링마다 배정을 fresh로 재해석한다
//     (getStudentEntranceClassIds { fresh: true } — 학생당 인덱스 조회
//     1회, 전체 재조회 아님). 수업 직전 배정이 앱 재시작 없이 반영된다.
//   - 시험이 이미 보이는 동안에는 예전처럼 캐시된 반 목록으로만 조회한다
//     (추가 부하 0 — fresh는 "아무것도 안 보이는" 상태에서만).
// 비용: 시험 없는 날 대시보드를 켜둔 학생 1명당 60초마다 경량 조회 2회
// (SCA 1 + 오늘 시험 1). B10이 아끼던 것보다 "시험이 안 떠요"의 운영 비용이
// 훨씬 컸다(2026-08-13 실측 사고 2건: Amin, 그리고 같은 수업의 Anna 분모).
const BANNER_POLL_MS = 60000

export function EntranceTestBanner({ studentId, onGo }) {
  const [tests, setTests] = useState([])

  // 2026-08-10 — 조회 기준을 "사람 반 1개"에서 "이 학생이 속한 모든 반"으로
  // 넓혔다(사람 반 ∪ 교재 컨테이너 반). 원장이 단어가 있는 교재 반으로
  // 시험을 시작하면 예전 코드는 0건을 받아 배너가 조용히 안 떴다 —
  // wordLibrary.getStudentEntranceClassIds 주석 참고.
  useEffect(() => {
    if (!studentId) return undefined
    let alive = true
    let hasTests = false // 직전 조회에서 시험이 있었는가 — fresh 필요 여부
    let firstRun = true  // 마운트 직후엔 로그인 직후라 캐시가 최신 — fresh 불필요
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const classIds = await getStudentEntranceClassIds(studentId, { fresh: !firstRun && !hasTests })
      firstRun = false
      if (!alive) return
      if (classIds.length === 0) { setTests([]); hasTests = false; return }
      const t = await fetchTodayTestsForClasses(classIds)
      if (!alive) return
      setTests(t)
      hasTests = t.length > 0
    }
    check()
    const iv = setInterval(check, BANNER_POLL_MS)
    return () => { alive = false; clearInterval(iv) }
  }, [studentId])

  if (tests.length === 0) return null
  const active = findActiveTest(tests)

  if (active) {
    return (
      <button onClick={() => onGo('entranceTest')}
        className="w-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-3xl p-5 text-white text-left card-shadow btn-press animate-pulse">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🚨</span>
          <div className="flex-1">
            <p className="font-black text-lg leading-tight">오늘의 입실시험이 시작됐어요!</p>
            <p className="text-rose-100 text-xs mt-0.5">
              {active.questionCount ? `${active.questionCount}문제` : ''}
              {active.questionCount && active.timeLimitSeconds ? ' · ' : ''}
              {active.timeLimitSeconds ? `약 ${Math.max(1, Math.round(active.timeLimitSeconds / 60))}분이면 끝나요` : ''}
              {!active.questionCount && !active.timeLimitSeconds ? '지금 바로 참여하세요' : ''}
            </p>
          </div>
          <span className="font-black text-xl">→</span>
        </div>
      </button>
    )
  }
  return (
    <button onClick={() => onGo('entranceTest')}
      className="w-full bg-white border-2 border-amber-200 rounded-3xl p-4 text-left card-shadow btn-press">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🏆</span>
        <div className="flex-1">
          <p className="font-black text-gray-800 text-sm">오늘의 입실시험 랭킹</p>
          <p className="text-gray-400 text-xs">우리 반 VIP는 누구일까요?</p>
        </div>
        <span className="font-black text-amber-500">보기 →</span>
      </div>
    </button>
  )
}
