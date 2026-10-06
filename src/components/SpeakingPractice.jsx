import { Suspense, lazy, useState } from 'react'
import { keySentenceFor, listSets, loadLastSet, saveLastSet, setLabel } from '../utils/situation/speakingSets'

// 2026-10-04 Speaking UX v2 — Speaking 영역 루트: 메뉴 / 회화 연습 / 시험(SpeakingExam, lazy).
// 2026-10-07(219차) 주제별 탐색: 첫 화면 = 주제 카드(topics) → 이야기 카드(stories) → 기존 연습/시험/한 문장 흐름.
// 기존 메뉴(세트 칩)는 '전체 이야기'로 남긴다. 연습·시험·흐름의 '← 메뉴'는 들어온 화면(origin)으로 돌아간다.
// 설계: docs/design/SPEAKING_UX_V2_2026-10-04.md. 녹음은 브라우저 메모리에만 있고 저장/전송 없음.
// 마이크 연결 규칙은 useLocalRecorder 참고. 모드를 바꾸면 하위 컴포넌트가 언마운트되어 마이크를 놓는다.
// 주의(운영자 기기 점검): iOS에서 두 번째 캡처가 공유 스트림을 mute할 수 있다 —
// 이 화면을 다녀온 뒤 WordDetail 따라 말하기가 정상인지 실기기에서 확인할 것.
const SpeakingPracticeMode = lazy(() => import('./SpeakingPracticeMode'))
const SpeakingExam = lazy(() => import('./SpeakingExam'))
const KeySentenceFlow = lazy(() => import('./KeySentenceFlow'))
const SpeakingTopics = lazy(() => import('./SpeakingTopics'))
const FALLBACK = <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 font-bold">불러오는 중...</p></div>
const safeStorage = () => { try { return window.localStorage } catch { return { getItem: () => null, setItem: () => {} } } }
const MENU_CARD = 'w-full min-h-[96px] px-4 py-5 rounded-3xl font-black text-xl btn-press card-shadow text-white bg-gradient-to-br'

export default function SpeakingPractice({ onBack, studentId, initialMode = 'menu', examEnabled = false }) {
  const [mode, setMode] = useState(initialMode === 'exam' && examEnabled ? 'exam' : 'topics')
  // 연습/시험/흐름에서 '← 메뉴'로 돌아갈 화면: 'menu'(기존 세트 메뉴·홈 시험 직진입) 또는 'stories'(주제의 이야기 카드)
  const [origin, setOrigin] = useState('menu')
  const [topicId, setTopicId] = useState(null)
  // 시험은 들어갈 때마다 새로 마운트(key) — 항상 1번 문항·미공개로 시작
  const [examKey, setExamKey] = useState(0)
  // 첫 방문은 오늘의 이야기(2화), 이후엔 학생이 마지막으로 고른 세트(speakingSets.loadLastSet)
  const [setId, setSetId] = useState(() => loadLastSet(safeStorage(), studentId))
  const pickSet = (id) => { setSetId(id); saveLastSet(safeStorage(), studentId, id) }
  const goMenu = () => setMode(origin === 'stories' && topicId ? 'stories' : 'menu')
  const key = keySentenceFor(setId)
  const startExam = () => { setExamKey((k) => k + 1); setMode('exam') }
  // 이야기 카드 → 기존 연습/한 문장 흐름(세트 선택·기억은 기존 pickSet 그대로)
  const startFromStory = (epId, next) => { pickSet(epId); setOrigin('stories'); setMode(next) }

  if (mode === 'topics' || mode === 'stories') {
    return (
      <Suspense fallback={FALLBACK}>
        <SpeakingTopics topicId={mode === 'stories' ? topicId : null}
          onTopic={(id) => { setTopicId(id); setMode('stories') }}
          onStart={(epId) => startFromStory(epId, 'practice')}
          onKeyFlow={(epId) => startFromStory(epId, 'key')}
          onAll={() => { setOrigin('menu'); setMode('menu') }}
          onBack={mode === 'stories' ? () => setMode('topics') : onBack} />
      </Suspense>
    )
  }

  if (mode === 'practice') return <Suspense fallback={FALLBACK}><SpeakingPracticeMode setId={setId} onMenu={goMenu} onStartExam={examEnabled ? startExam : null} /></Suspense>
  if (mode === 'key') return <Suspense fallback={FALLBACK}><KeySentenceFlow setId={setId} onMenu={goMenu} /></Suspense>
  if (mode === 'exam') {
    return (
      <Suspense fallback={FALLBACK}>
        <SpeakingExam key={examKey} setId={setId} studentId={studentId} onMenu={goMenu} />
      </Suspense>
    )
  }
  return (
    <div data-testid="speaking-menu" className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-black text-sky-700 pt-2">말하기</h1>
        {key && (
          <div data-testid="speaking-menu-key-card" className="bg-white rounded-3xl p-4 card-shadow space-y-3">
            <p className="text-lg font-black text-gray-900">📌 오늘의 이야기</p>
            <p data-testid="speaking-menu-key-title" className="text-base font-black text-sky-700">{setLabel(setId)}</p>
            <p className="text-base font-bold text-gray-700">오늘 기억할 한 문장: {key.goalKo}</p>
            <button data-testid="speaking-menu-key" onClick={() => { setOrigin('menu'); setMode('key') }} className={`${MENU_CARD} from-emerald-400 to-teal-600`}>🧠 한 문장 이야기 시작</button>
          </div>
        )}
        <div role="group" aria-labelledby="speaking-set-title" className="space-y-2">
          <p id="speaking-set-title" className="text-base font-black text-gray-800">무엇을 연습할까요?</p>
          <div className="flex flex-wrap gap-2">
            {listSets().map((s) => (
              <button key={s.id} data-testid={`speaking-set-${s.id}`} aria-pressed={setId === s.id} onClick={() => pickSet(s.id)}
                className={`min-h-[44px] px-3 py-2 rounded-2xl font-black text-base btn-press ${setId === s.id ? 'bg-sky-500 text-white' : 'bg-white card-shadow text-gray-700'}`}>{s.labelKo}</button>
            ))}
          </div>
        </div>
        <button data-testid="speaking-menu-practice" onClick={() => { setOrigin('menu'); setMode('practice') }} className={`${MENU_CARD} from-sky-400 to-blue-600`}>🗣️ 회화 연습</button>
        {examEnabled && (
          <button data-testid="speaking-menu-exam" onClick={() => { setOrigin('menu'); startExam() }} className={`${MENU_CARD} from-amber-400 to-orange-500`}>📝 한글 보고 말하기</button>
        )}
        <div className="flex flex-wrap gap-2">
          <button data-testid="speaking-menu-topics" onClick={() => setMode('topics')} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 주제</button>
          <button data-testid="speaking-menu-home" onClick={onBack} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
        </div>
      </div>
    </div>
  )
}
