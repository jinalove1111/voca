import { useState, useEffect, useRef } from 'react'
import { hatById, hatTintStyle } from '../utils/attachment/hatSystem'

// 2026-10-02 학생 홈 개편 — 로그인 직후 4메뉴 홈(단어/문장/말하기/성장).
// 순수 표시/라우팅 컴포넌트: 데이터 저장/조회 없음, 기존 Dashboard는 그대로
// '단어 연습' 카드 뒤에 있다(onGo('dashboard')).

// 하위 화면에서 돌아왔을 때 방금 누른 카드로 포커스를 복귀시키기 위한 모듈
// 변수. 첫 로그인(null)에는 포커스를 강제하지 않는다. 로그아웃 시 리셋.
let lastMenuId = null
export const resetStudentHomeState = () => { lastMenuId = null }

const CARD = 'relative min-h-[9rem] rounded-3xl p-4 flex flex-col items-center justify-center text-center btn-press card-shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-purple-600'
// Tailwind 우선순위는 className 순서가 아니라 스타일시트 순서라, 공통 CARD에는
// 글자색/배경을 두지 않고 상태별로 한쪽만 붙인다.
const SOON = 'bg-gray-300 text-gray-600'
const ACTIVE = 'text-white bg-gradient-to-br'

export default function StudentHome({ studentName, studentData, classWords, hasTodaysHomework, onStartGuided, onGo, onLogout, canEnterTown, townEligible, writingEnabled, speakingEnabled, speakingExamEnabled }) {
  const [notice, setNotice] = useState('')
  const timerRef = useRef(null)
  const cardRefs = useRef({})
  const streak = studentData?.streak || 0
  const hat = studentData?.equippedHatId ? hatById(studentData.equippedHatId) : null
  const hasWords = (classWords || []).length > 0

  useEffect(() => {
    if (lastMenuId) cardRefs.current[lastMenuId]?.focus()
    return () => clearTimeout(timerRef.current)
  }, [])

  const showNotice = (msg) => {
    clearTimeout(timerRef.current)
    setNotice(msg)
    timerRef.current = setTimeout(() => setNotice(''), 4000)
  }
  const clearNotice = () => { clearTimeout(timerRef.current); setNotice('') }

  const go = (id, screen) => { lastMenuId = id; onGo(screen) }

  const menus = [
    { id: 'voca', emoji: '📖', ko: '단어 연습', en: 'Voca', grad: 'from-indigo-500 to-purple-600', label: '단어 연습, 보카', onPress: () => go('voca', 'dashboard') },
    writingEnabled
      ? { id: 'writing', emoji: '✍️', ko: '문장 쓰기', en: 'Writing', grad: 'from-teal-400 to-emerald-600', label: '문장 쓰기, 라이팅', onPress: () => go('writing', 'writingCoach') }
      : { id: 'writing', emoji: '✍️', ko: '문장 쓰기', en: 'Writing', soon: true, label: '문장 쓰기, 라이팅. 준비 중', onPress: () => showNotice('문장 쓰기는 곧 열려요! 조금만 기다려요') },
    // 2026-10-04 Speaking 첫 체험 — 플래그가 꺼져 있으면 기존 준비 중 카드 유지
    speakingEnabled
      ? { id: 'speaking', emoji: '🎤', ko: '말하기', en: 'Speaking', grad: 'from-sky-400 to-blue-600', label: '말하기, 스피킹', onPress: () => go('speaking', 'speaking') }
      : { id: 'speaking', emoji: '🎤', ko: '말하기', en: 'Speaking', soon: true, label: '말하기, 스피킹. 준비 중', onPress: () => showNotice('말하기는 곧 열려요! 조금만 기다려요') },
    { id: 'growth', emoji: '🌱', ko: '나의 성장', en: 'My Growth', grad: 'from-amber-400 to-orange-500', label: '나의 성장, 마이 그로스', onPress: () => go('growth', 'growth') },
  ]

  return (
    // 카드 탭은 capture 단계에서 먼저 안내를 지운 뒤 자기 핸들러가 새로 띄운다.
    <div data-testid="student-home" className="min-h-screen p-4 pb-24" onClickCapture={clearNotice}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-3xl" aria-hidden="true">
              {hat ? <span style={hatTintStyle(hat.colorHex)}>{hat.emoji}</span> : '👑'}
            </span>
            {/* 긴 이름 말줄임 — Tailwind 축약 클래스 대신 동일 효과의 3개 유틸을 풀어 씀 */}
            <h1 className="text-lg font-black text-purple-700 overflow-hidden text-ellipsis whitespace-nowrap max-w-[55%]">{studentName}, 안녕!</h1>
            {streak > 0 && (
              <span className="bg-orange-100 text-orange-600 font-black text-sm px-3 py-1 rounded-2xl whitespace-nowrap">🔥 {streak}일</span>
            )}
          </div>
          <button
            onClick={() => {
              if (window.confirm('정말 로그아웃할까요?\n다시 들어오려면 이름과 PIN이 필요해요.')) { resetStudentHomeState(); onLogout() }
            }}
            className="text-sm font-bold text-gray-500 py-3 px-3 min-h-[44px] btn-press">
            로그아웃
          </button>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-4 card-shadow">
          {hasWords ? (
            <button onClick={onStartGuided} className="bg-white text-indigo-600 font-black text-xl py-5 rounded-2xl btn-press w-full">
              {hasTodaysHomework ? '▶ 오늘 연습 시작하기' : '▶ 단어 연습 시작하기'}
            </button>
          ) : (
            <>
              <button aria-disabled="true" onClick={(e) => e.preventDefault()} className="bg-gray-200 text-gray-500 font-black text-xl py-5 rounded-2xl w-full">
                단어가 아직 없어요
              </button>
              <p className="text-white/90 text-sm text-center mt-2">선생님이 단어를 넣으면 시작할 수 있어요</p>
            </>
          )}
        </div>

        <nav aria-label="메인 메뉴" className="grid grid-cols-2 gap-3">
          {menus.map((m) => (
            <button
              key={m.id}
              ref={(el) => { cardRefs.current[m.id] = el }}
              data-testid={`student-home-menu-${m.id}`}
              aria-label={m.label}
              aria-disabled={m.soon ? 'true' : undefined}
              onClick={m.onPress}
              className={`${CARD} ${m.soon ? SOON : `${ACTIVE} ${m.grad}`}`}>
              {m.soon && (
                <span className="absolute top-2 right-2 bg-white text-gray-600 text-xs font-black px-2 py-1 rounded-full">준비 중</span>
              )}
              <span className={`text-5xl ${m.soon ? 'grayscale opacity-60' : ''}`} aria-hidden="true">{m.emoji}</span>
              <span className="text-xl font-black whitespace-nowrap">{m.ko}</span>
              <span className="text-sm font-bold opacity-90">{m.en}</span>
            </button>
          ))}
        </nav>

        {/* 2026-10-04 Speaking UX v2 — 시험 바로 가기(보조). 4카드 레이아웃은 그대로 둔다 */}
        {speakingEnabled && speakingExamEnabled && (
          <button data-testid="student-home-speaking-exam" onClick={() => go('speaking', 'speakingExam')}
            className="w-full min-h-[44px] py-3 text-base font-black bg-white text-sky-700 border-2 border-sky-200 rounded-2xl btn-press">
            🖼️ 그림 시험 바로 가기
          </button>
        )}

        <p data-testid="student-home-notice" role="status" aria-live="polite" className="text-center text-sm font-bold text-purple-700 min-h-[1.25rem]">{notice}</p>

        {/* 2026-10-03 홈 내 마을 라벨(파일럿 자격): 허브의 '내 마을' 카드는 Town 자격
            (townEligible)이 있을 때만 보인다. 자격 없는 학생에게 '내 마을'이라고 쓰면
            없는 것을 약속하므로 기존 Dashboard 밴드처럼 '구경가기'로 표기한다. */}
        {canEnterTown && (
          <button
            data-testid="student-home-town"
            data-town-eligible={townEligible ? 'true' : 'false'}
            aria-label={townEligible ? '내 마을' : 'Paul Town 구경가기'}
            ref={(el) => { cardRefs.current.town = el }}
            onClick={() => go('town', 'paulTown')}
            className="w-full h-14 text-base font-black bg-white text-purple-700 border-2 border-purple-200 rounded-2xl btn-press">
            {townEligible ? '🏘️ 내 마을' : '🏘️ Paul Town 구경가기'}
          </button>
        )}
      </div>
    </div>
  )
}
