import { Suspense, lazy, useState } from 'react'

// 2026-10-04 Speaking UX v2 — Speaking 영역 루트: 메뉴 / 회화 연습 / 시험(SpeakingExam, lazy).
// 설계: docs/design/SPEAKING_UX_V2_2026-10-04.md. 녹음은 브라우저 메모리에만 있고 저장/전송 없음.
// 마이크 연결 규칙은 useLocalRecorder 참고. 모드를 바꾸면 하위 컴포넌트가 언마운트되어 마이크를 놓는다.
// 주의(운영자 기기 점검): iOS에서 두 번째 캡처가 공유 스트림을 mute할 수 있다 —
// 이 화면을 다녀온 뒤 WordDetail 따라 말하기가 정상인지 실기기에서 확인할 것.
const SpeakingPracticeMode = lazy(() => import('./SpeakingPracticeMode'))
const SpeakingExam = lazy(() => import('./SpeakingExam'))
const FALLBACK = <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 font-bold">불러오는 중...</p></div>
const MENU_CARD = 'w-full min-h-[96px] px-4 py-5 rounded-3xl font-black text-xl btn-press card-shadow text-white bg-gradient-to-br'

export default function SpeakingPractice({ onBack, studentId, initialMode = 'menu', examEnabled = false }) {
  const [mode, setMode] = useState(initialMode === 'exam' && examEnabled ? 'exam' : 'menu')
  // 시험은 들어갈 때마다 새로 마운트(key) — 항상 1번 문항·미공개로 시작
  const [examKey, setExamKey] = useState(0)
  const goMenu = () => setMode('menu')
  const startExam = () => { setExamKey((k) => k + 1); setMode('exam') }

  if (mode === 'practice') return <Suspense fallback={FALLBACK}><SpeakingPracticeMode onMenu={goMenu} onStartExam={examEnabled ? startExam : null} /></Suspense>
  if (mode === 'exam') {
    return (
      <Suspense fallback={FALLBACK}>
        <SpeakingExam key={examKey} studentId={studentId} onMenu={goMenu} />
      </Suspense>
    )
  }
  return (
    <div data-testid="speaking-menu" className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-black text-sky-700 pt-2">말하기</h1>
        <button data-testid="speaking-menu-practice" onClick={() => setMode('practice')} className={`${MENU_CARD} from-sky-400 to-blue-600`}>🗣️ 회화 연습</button>
        {examEnabled && (
          <button data-testid="speaking-menu-exam" onClick={startExam} className={`${MENU_CARD} from-amber-400 to-orange-500`}>🖼️ 그림 보고 말하기 시험</button>
        )}
        <button data-testid="speaking-menu-home" onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
      </div>
    </div>
  )
}
