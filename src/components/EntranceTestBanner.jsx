import { useState, useEffect } from 'react'
import { fetchTodayTests, findActiveTest } from '../utils/entranceTestApi'
import { getStudentClassId } from '../utils/wordLibrary'

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
const BANNER_POLL_MS = 20000

export function EntranceTestBanner({ studentId, onGo }) {
  const classId = getStudentClassId(studentId)
  const [tests, setTests] = useState([])

  useEffect(() => {
    if (!classId) return undefined
    let alive = true
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const t = await fetchTodayTests(classId)
      if (alive) setTests(t)
    }
    check()
    const iv = setInterval(check, BANNER_POLL_MS)
    return () => { alive = false; clearInterval(iv) }
  }, [classId])

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
            <p className="text-rose-100 text-xs mt-0.5">지금 바로 참여하세요</p>
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
