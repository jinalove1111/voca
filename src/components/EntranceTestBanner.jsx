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
// B10(2026-08-02) — 시험이 없는 날에도 20초마다 폴링해 불필요한 조회가
// 쌓였다. 주기를 60초로 늘리고, 첫 조회에서 오늘 시험이 0건이면 폴링을
// 멈춘다(그 세션 동안엔 시험이 새로 생겨도 안 보일 수 있지만, 다음
// 대시보드 마운트/새로고침에서 다시 조회하므로 완전히 놓치지는 않음 —
// 입실시험은 원장이 그 시간대에 미리 준비해 두는 흐름이라 실사용 영향 적음).
const BANNER_POLL_MS = 60000

export function EntranceTestBanner({ studentId, onGo }) {
  const [tests, setTests] = useState([])

  // 2026-08-10 — 조회 기준을 "사람 반 1개"에서 "이 학생이 속한 모든 반"으로
  // 넓혔다(사람 반 ∪ 교재 컨테이너 반). 원장이 단어가 있는 교재 반으로
  // 시험을 시작하면 예전 코드는 0건을 받아 배너가 조용히 안 떴다 —
  // wordLibrary.getStudentEntranceClassIds 주석 참고. 반 id 해석은 마운트당
  // 1회만 하고(캐시가 예열돼 있으면 추가 조회 0), 폴링은 그 목록으로 돈다.
  useEffect(() => {
    if (!studentId) return undefined
    let alive = true
    let iv = null
    const run = async () => {
      const classIds = await getStudentEntranceClassIds(studentId)
      if (!alive || classIds.length === 0) return
      const check = async (isFirst) => {
        if (document.visibilityState !== 'visible') return
        const t = await fetchTodayTestsForClasses(classIds)
        if (!alive) return
        setTests(t)
        if (isFirst && t.length === 0 && iv) { clearInterval(iv); iv = null }
      }
      // await하지 않는다(원본과 동일) — 첫 조회가 끝날 땐 이미 iv가 잡혀
      // 있어야 B10의 "오늘 시험 0건이면 폴링 중단"이 그대로 동작한다.
      check(true)
      iv = setInterval(() => check(false), BANNER_POLL_MS)
    }
    run()
    return () => { alive = false; if (iv) clearInterval(iv) }
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
