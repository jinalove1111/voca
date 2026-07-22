import React, { useState, useEffect, useMemo } from 'react'
import StudentSelect from './components/StudentSelect'
import Dashboard from './components/Dashboard'
import WordBrowser from './components/WordBrowser'
import WordDetail from './components/WordDetail'
import QuizGame from './components/QuizGame'
import LevelUpMission from './components/LevelUpMission'
import DiaryPage from './components/DiaryPage'
import StudyCalendar from './components/StudyCalendar'
import BalloonGame from './components/BalloonGame'
import FishingGame from './components/FishingGame'
import PizzaGame from './components/PizzaGame'
import TrainGame from './components/TrainGame'
import BonusChoiceScreen from './components/BonusChoiceScreen'
import GiftReveal from './components/GiftReveal'
import SpellingReview from './components/SpellingReview'
import SpellingSessionResult from './components/SpellingSessionResult'
import GuidedSession from './components/GuidedSession'
import SentenceLearningFlow from './components/SentenceLearningFlow'
import { useStudent } from './hooks/useStudent'
import { useAttachment } from './hooks/useAttachment'
import { pickNextGame } from './utils/matchGame'
import { trackEvent, EV } from './utils/productEvents'
import { assignDirections } from './utils/entranceTest'
import { logSpellingReview } from './utils/spellingReviewApi'
import { getStudentWords, initWordLibrary, refreshWordLibrary, refreshStudents, refreshClassSettings, getStudentById, getStudentClass, getStudentUnit, getStudentUnitId, setStudentUnit, getClassSettings, filterWordsByScope, getStudentClassAssignments, setPrimaryAssignment, isTextbookMode, setPrimaryTextbook, getClassTextbooks, getStudentPrimaryTextbook, getStudentClassId, getClassNames, getClassIdByName } from './utils/wordLibrary'
import { getSpeechRate, setSpeechRate, unlockAudio, primeSpeech, getMicStream } from './utils/speech'

// 2026-07-10 성능 최적화: AdminScreen은 xlsx(엑셀 업로드)를 포함해 학생은
// 절대 안 쓰는 무거운 라이브러리를 물고 있는데, 정적 import라 학생용
// 메인 번들에도 항상 같이 딸려가고 있었다(매일 앱을 여는 학생 전원이
// 한 번도 안 쓸 관리자 코드를 매번 다운로드). React.lazy로 바꿔서
// "⚙️ 관리자" 버튼을 실제로 눌렀을 때만 그 코드가 로드되게 분리 —
// AdminScreen 자체의 동작/로직은 전혀 안 바뀜, 로딩 시점만 바뀜.
const AdminScreen = React.lazy(() => import('./components/AdminScreen'))
// 학부모 화면도 같은 이유로 lazy — 학생/관리자 어느 쪽도 매일 안 쓰는
// 코드를 학생 메인 번들에 얹지 않는다.
const ParentScreen = React.lazy(() => import('./components/ParentScreen'))
// 입실시험 응시 화면도 같은 이유로 lazy — 학생이 홈 화면 배너를 보는 것과
// 별개로, "참여하기"를 눌러 실제로 들어갈 때만 로드(Phase 3 성능,
// 2026-07-18). 배너는 이제 별도 파일(EntranceTestBanner.jsx)이라 이 lazy
// 전환이 실제로 메인 번들에서 코드를 빼낸다(전엔 Dashboard의 정적 import가
// 같은 파일을 끌고 와서 lazy로 감싸도 효과가 없었음).
const EntranceTest = React.lazy(() => import('./components/EntranceTest'))
// 애착 시스템(2026-07-22) — 매일 여는 화면이 아니므로 전부 lazy(위
// AdminScreen과 같은 이유 — 학생 메인 번들을 불리지 않는다).
const HatCollection = React.lazy(() => import('./components/HatCollection'))
const WordMuseum = React.lazy(() => import('./components/WordMuseum'))
const GrowthAlbum = React.lazy(() => import('./components/GrowthAlbum'))
const EnglishGarden = React.lazy(() => import('./components/EnglishGarden'))
// Paul Town v2.0(2026-07-22) — 마을 화면도 같은 이유로 lazy(진입은 홈
// 밴드의 [구경가기] 버튼 — 매일 여는 메인 화면이 아니다).
const PaulTown = React.lazy(() => import('./components/PaulTown'))
// Paul Town 월드(2026-07-22) — 도서관/시계탑. 마을(PaulTown)의 건물 카드
// 로만 진입하므로 역시 lazy — 학생 메인 번들 비영향.
const Bookshelf = React.lazy(() => import('./components/Bookshelf'))
const TimeMachine = React.lazy(() => import('./components/TimeMachine'))

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  // P0(2026-07-17) — 프로덕션에서는 내부 에러 문구를 학생에게 그대로
  // 노출하지 않는다(아래 render). 대신 진단에 필요한 정보는 전부 콘솔에
  // 남긴다. 주의: PIN/pin_hash는 어떤 형태로도 절대 로그 금지 — 여기서
  // 읽는 것은 세션의 student id뿐.
  componentDidCatch(error, info) {
    let studentId = null
    try { studentId = JSON.parse(localStorage.getItem(SESSION_KEY))?.id || null } catch { /* 세션 파싱 실패는 무시 */ }
    console.error('[AppErrorBoundary] 앱 크래시', {
      message: error?.message || String(error),
      stack: error?.stack || null,
      componentStack: info?.componentStack || null,
      studentId,
      href: typeof location !== 'undefined' ? location.href : null,
      mode: import.meta.env.MODE,
      timestamp: new Date().toISOString(),
    })
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-lg">
            <div className="text-5xl mb-4">😵</div>
            <h2 className="font-black text-xl text-gray-800 mb-2">앱 오류가 발생했어요</h2>
            <p className="text-sm text-gray-500 mb-6">
              데이터를 불러오는 중 문제가 발생했어요.<br />다시 시도하거나 로그아웃 후 로그인해주세요.
            </p>
            {import.meta.env.DEV && (
              <p className="text-xs text-red-400 mb-6 break-all bg-red-50 p-3 rounded-xl">{String(this.state.error)}</p>
            )}
            <button
              onClick={() => {
                // 세션 정리 후 전체 리로드 — setState만으로 복귀하면 App의
                // student 상태가 그대로 남아 같은 크래시를 즉시 반복할 수
                // 있다. 리로드가 유일하게 확실한 초기화.
                try { localStorage.removeItem('paulEasyVoca_currentStudent') } catch { /* noop */ }
                window.location.reload()
              }}
              className="w-full bg-purple-500 text-white font-black py-3 rounded-2xl mb-2"
            >
              로그아웃 후 다시 시작
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="w-full border-2 border-gray-200 text-gray-500 font-bold py-3 rounded-2xl"
            >
              그냥 다시 시도
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// 0.6/0.8/1.0(40% 구간)에서는 체감 속도차가 잘 안 느껴진다는 피드백 —
// 구간을 넓혀서(0.5~1.2, 140%) 세 단계가 확실히 다르게 들리도록 조정.
const RATE_OPTIONS = [
  { label: '🐢 천천히', value: 0.5 },
  { label: '🙂 보통',   value: 0.85 },
  { label: '🚀 빠르게', value: 1.2 },
]

function SpeedBtn() {
  const [rate, setRate] = useState(() => getSpeechRate())
  const cur = RATE_OPTIONS.find(o => o.value === rate) || RATE_OPTIONS[0]
  const next = () => {
    const idx = RATE_OPTIONS.findIndex(o => o.value === rate)
    const n = RATE_OPTIONS[(idx + 1) % RATE_OPTIONS.length]
    setSpeechRate(n.value)
    setRate(n.value)
  }
  return (
    <button onClick={next}
      className="fixed bottom-5 right-5 z-40 bg-white border-2 border-purple-200 text-purple-600 font-black text-xs px-3 py-2 rounded-2xl card-shadow btn-press hover:border-purple-400 transition-colors">
      {cur.label}
    </button>
  )
}

// P0(2026-07-15): studentId(식별자, Supabase students.id)와 studentName
// (표시/legacy 마이그레이션용)을 따로 받는다 — 이름만으로는 더 이상 학생을
// 유일하게 식별할 수 없다(동명이인 허용).
function AppInner({ studentId, studentName, onLogout }) {
  const [screen, setScreen]         = useState('dashboard')
  const [selectedWord, setWord]     = useState(null)
  const [selectedWordIdx, setWordIdx] = useState(0)
  const [pendingNextIdx, setPendingNextIdx] = useState(0)
  // Whether the balloon game was entered mid-lesson (bonus checkpoint) vs.
  // directly from the Dashboard nav button — changes what its result
  // screen offers ("다음 단어 공부하기" vs. just "홈으로"). Always false
  // again once back on the dashboard, so a later direct-from-dashboard
  // play never inherits a stale lesson context.
  const [balloonFromLesson, setBalloonFromLesson] = useState(false)
  useEffect(() => { if (screen === 'dashboard') setBalloonFromLesson(false) }, [screen])
  // 익명 관찰(2026-07-23) — 화면 열람 이벤트. trackEvent는 (이벤트,날짜)당
  // 1회 dedupe + fire-and-forget이라 이 effect가 몇 번 돌아도 무해.
  useEffect(() => {
    const m = { dashboard: EV.appOpened, paulTown: EV.paulTownOpened, englishGarden: EV.gardenOpened, bookshelf: EV.bookshelfOpened, timeMachine: EV.timeMachineOpened, wordMuseum: EV.museumOpened }
    if (m[screen]) trackEvent(studentId, m[screen])
  }, [screen, studentId])
  const [currentGameId, setCurrentGameId] = useState('balloon')
  const [refreshTick, setRefreshTick] = useState(0)
  // 학습 모드(듣기/말하기/쓰기/종합) — 세션 동안만 유지, 매번 앱을 새로
  // 열면 종합으로 돌아옴(기존 기본 동작과 가장 가까운 모드).
  const [studyMode, setStudyMode] = useState('comprehensive')
  // v1.5 "학습 범위"(Skip 기능) — 전체/모르는 단어만/안 본 단어만/복습
  // 단어만. studyMode(HOW: 듣기/말하기/쓰기/종합)와는 완전히 별개 축이라
  // 별도 상태로 관리 — 마찬가지로 세션 동안만 유지.
  const [studyScope, setStudyScope] = useState('all')
  const studentData                 = useStudent(studentId, studentName)
  const { cleared, answerMission, missions, addStars, markPronunciationOk, pendingGift, dismissGift, lastGamePlayed, setLastGamePlayed, recordGamePlayed, spellingWrongToday, clearSpellingReviewWord, wordStatus, setWordKnown, setWordUnknown, spellingReviewQueue, setLastTextbookClassId } = studentData
  // 애착 시스템(2026-07-22) — 파생 통계 + 모자/밀스톤 자동 판정(복원 확인
  // 후 학생당 1회). 판정 로직은 src/utils/attachment/ 순수 함수.
  const attachment = useAttachment(studentId, studentData)

  // 선물상자를 닫은 직후, 오늘 틀린 스펠링 단어나 영구 복습 대기열
  // (Writing MVP, 2026-07-20 — 적어도 하루 전에 놓친 단어)이 남아있으면
  // 자동으로 "틀린 단어 복습"을 시작 — 맞을 때까지 반복(SpellingReview 참고).
  const handleDismissGift = () => {
    dismissGift()
    if (spellingWrongToday.length > 0 || spellingReviewQueue.length > 0) setScreen('spellingReview')
  }

  // Rotates through the 4 mini-games, never repeating whichever was played
  // last (across the whole app, not just this checkpoint) — used both by
  // the mid-lesson bonus checkpoint and the Dashboard's direct game button.
  const startRandomGame = () => {
    const game = pickNextGame(lastGamePlayed)
    setCurrentGameId(game.id)
    setLastGamePlayed(game.id)
    recordGamePlayed(game.id)
    setScreen('game')
  }
  const GAME_COMPONENTS = { balloon: BalloonGame, fishing: FishingGame, pizza: PizzaGame, train: TrainGame }
  const CurrentGame = GAME_COMPONENTS[currentGameId] || BalloonGame
  const classWords                  = useMemo(() => {
    try { return getStudentWords(studentId) || [] } catch { return [] }
  }, [studentId, refreshTick])
  // v2.1 — 지금 보고 있는 유닛의 실제 DB id(해석 결과). 유닛별 "이어서
  // 학습" 위치의 키로만 쓰며, null이어도(캐시 미비/마이그레이션 전) 전부
  // 기존 전역 lastWordIndex 동작으로 폴백된다.
  const currentUnitId = useMemo(() => {
    try { return getStudentUnitId(studentId) } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, refreshTick])
  // v2.1 — Dashboard 유닛 선택기: 전환은 setStudentUnit(id 우선 저장) →
  // refreshTick으로 단어 목록/설정 재계산. 진행도 레코드(useStudent)는
  // 아무것도 건드리지 않는다 — 별/스트릭/스티커/오늘 미션이 유닛 전환으로
  // 리셋되지 않는 구조적 보장.
  const handleUnitSwitch = async (unitName) => {
    await setStudentUnit(studentId, unitName)
    setRefreshTick((t) => t + 1)
  }
  // v2.9(2026-07-21, decision 0004 다중 교재) — 학생의 전체 교재 배정
  // 목록. getStudentClassAssignments는 테이블 부재/배정 0~1건 모두 "합성
  // 단일 배정" 1개로 안전하게 폴백하므로(wordLibrary.js 주석 참고), 이
  // state는 오늘 마이그레이션 실행 전(그리고 실행 후에도 아직 두 번째
  // 교재를 안 받은) 학생 전원에게 항상 length===1로 남는다 —
  // TextbookSelector는 length<=1이면 스스로 아무것도 렌더하지 않는다
  // (요구사항 2, 7 — 기존 학생 화면 변화 0). 로그인 직후(studentId 변경
  // 시) 1회 fetch하며, 이 호출이 getStudentWords의 classId override
  // 검증용 캐시도 함께 채운다(현재는 override를 쓰지 않지만 — 아래
  // handleTextbookSwitch 주석 참고 — wordLibrary.js의 명시된 계약이라
  // 그대로 지킨다).
  const [textbookAssignments, setTextbookAssignments] = useState([])
  useEffect(() => {
    let cancelled = false
    getStudentClassAssignments(studentId).then((list) => {
      if (!cancelled) setTextbookAssignments(list)
    }).catch(() => { /* 조회 실패는 조용히 무시 — 선택기가 안 보일 뿐 학습 화면엔 영향 없음(이 파일 전체의 fail-open 원칙) */ })
    return () => { cancelled = true }
  }, [studentId])
  // 교재 선택기(TextbookSelector, Dashboard.jsx) → setPrimaryAssignment(주
  // 교재를 서버에 영구 전환) → 배정 목록/단어 목록 재조회.
  //
  // 설계 선택(구현 세션, docs/agent-decisions/0004-multi-textbook-
  // architecture.md 근거): getStudentWords의 classId override(임시 조회,
  // students.class_id는 안 바뀜)가 아니라 setPrimaryAssignment(영구 전환)를
  // 쓴다 — Current Unit/숙제/게임화 스위치/입실시험 배너/쓰기시험 설정 등
  // classWords/currentUnitId 말고도 15개 이상의 기존 호출부가 전부
  // students.class_id(주 반) 하나만 읽는다. override만 쓰면 단어 목록만
  // 선택한 교재를 따라가고 나머지 화면은 계속 이전 교재를 가리켜(요구사항
  // 6 위반) 반쪽짜리로 일관성이 깨진다. setPrimaryAssignment는 단 한 번의
  // 쓰기로 이 모든 기존 호출부를 자동으로 같은 교재에 맞춰준다(코드 변경
  // 0 — wordLibrary.js "5) 쓰기 — 주 교재 전환" 주석에 명시된 설계 의도
  // 그대로). handleUnitSwitch와 마찬가지로 진행도 레코드(별/스트릭/스티커/
  // 오늘 미션/XP/코인/티켓)는 전혀 건드리지 않는다 — 그 자산들은 계정
  // 전역이라 교재 전환으로 리셋되지 않는다(요구사항 6).
  const handleTextbookSwitch = async (optionId) => {
    // v3.1 — 교재 모드면 optionId는 textbookId(사람 반 불변 전환), 레거시
    // 모드면 v2.9 그대로 classId(반 축 전환). 선택기 옵션을 만든 쪽(아래
    // textbookOptions)과 항상 같은 모드로 짝이 맞는다.
    if (isTextbookMode()) {
      await setPrimaryTextbook(studentId, optionId)
    } else {
      await setPrimaryAssignment(studentId, optionId)
      setLastTextbookClassId(optionId)
    }
    const list = await getStudentClassAssignments(studentId)
    setTextbookAssignments(list)
    setRefreshTick((t) => t + 1)
  }
  // v3.1 — 교재 선택기 옵션. 교재 모드: 사람 반에 연결된 교재들
  // (class_textbooks — 반은 그대로, 교재만 전환). 레거시 모드: v2.9 다중
  // 반 배정 그대로. 어느 쪽이든 1개 이하면 선택기 비렌더(화면 변화 0).
  const textbookOptions = useMemo(() => {
    if (isTextbookMode()) {
      return getClassTextbooks(getStudentClassId(studentId)).map((tb) => ({
        id: tb.id,
        label: tb.publisherName ? `${tb.name} (${tb.publisherName})` : tb.name,
      }))
    }
    return textbookAssignments.map((a) => {
      const name = getClassNames().find((n) => getClassIdByName(n) === a.classId)
      return name ? { id: a.classId, label: name } : null
    }).filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, textbookAssignments, refreshTick])
  const currentTextbookOptionId = isTextbookMode()
    ? (getStudentPrimaryTextbook(studentId)?.id || null)
    : (getStudentById(studentId)?.classId || null)
  // v1.5 이번 세션에서 실제로 공부할 단어 목록 — studyScope에 따라
  // classWords(반 전체 단어, 퀴즈 오답 보기 생성 등에는 항상 이 전체
  // 목록을 그대로 씀)를 걸러낸 서브셋. "복습 단어만"은 이 Skip 기능의
  // '모르겠어요' 표시뿐 아니라 기존 레벨업 미션 대기 단어 + 오늘 오답노트
  // 단어까지 합쳐서 보여줌(기존 복습 신호를 그대로 재사용, 새로 안 만듦).
  const reviewWordIds = useMemo(() => {
    const ids = new Set(missions.filter(m => !m.done).map(m => m.wordId))
    spellingWrongToday.forEach(id => ids.add(id))
    // Writing MVP(2026-07-20) — 영구 복습 대기열도 "복습 단어만" 스코프에
    // 자동으로 포함(기존 스코프 선택 UI 그대로 재사용, 새 화면 없음).
    spellingReviewQueue.forEach(id => ids.add(id))
    return ids
  }, [missions, spellingWrongToday, spellingReviewQueue])
  const sessionWords = useMemo(
    () => filterWordsByScope(classWords, studyScope, wordStatus, reviewWordIds),
    [classWords, studyScope, wordStatus, reviewWordIds]
  )
  // 쓰기 시험 반별 설정 — 관리자가 켜지 않았으면 항상 안전한 기본값(전부
  // 꺼짐)이 돌아오므로, 스키마 SQL을 아직 안 돌렸어도 이 값은 절대
  // 에러나지 않음 (getClassSettings 참고).
  const spellingSettings            = useMemo(() => {
    try { return getClassSettings(getStudentClass(studentId)) } catch { return { spellingTestEnabled: false, spellingHintEnabled: false, wrongAnswerRepeatCount: 3 } }
  }, [studentId, refreshTick])

  // v2.0 혼합(mixed) 방향 — 반 설정이 'mixed'일 때만, 이번 세션 단어
  // 목록(sessionWords) 전체에 kr2en/en2kr을 정확히 50:50으로 미리 배정
  // (입실시험과 같은 assignDirections — 중복 구현 금지). 단어별 방향은
  // 인덱스로 조회. 다른 방향(kr2en/en2kr/random)은 null — 기존 흐름
  // (SpellingQuestion이 direction prop을 그대로 해석) 완전 동일.
  // 주의: scope가 'review'면 오답이 쌓이며 sessionWords가 세션 도중 자랄
  // 수 있어 그때 재배정되지만, 방향은 문제 시작 시점에만 읽으므로 이미
  // 푼 문제에는 영향 없음(50:50 균형이 약간 흔들리는 정도 — 허용).
  const mixedDirections = useMemo(() => {
    if (spellingSettings.spellingDirection !== 'mixed') return null
    return assignDirections(sessionWords.length, 'mixed')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spellingSettings, sessionWords.length])

  // 3분 데일리 리추얼(2026-07-22) — 가이드 세션 전용 mixed 방향 배정.
  // 위 mixedDirections는 sessionWords(studyScope 필터 반영) 기준이라,
  // 항상 classWords 전체를 도는 가이드 세션과는 인덱스 축이 다르다 —
  // 재사용하지 않고 classWords 길이로 따로 배정(승인된 스펙 그대로).
  const guidedMixedDirections = useMemo(() => {
    if (spellingSettings.spellingDirection !== 'mixed') return null
    return assignDirections(classWords.length, 'mixed')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spellingSettings, classWords.length])

  // 3분 데일리 리추얼 진입 — Dashboard의 히어로 CTA가 호출.
  const startGuidedSession = () => setScreen('guidedSession')

  // Lesson 5 여정 글루(2026-07-23, readingStudentUI 플래그 게이팅) —
  // GuidedSession 완료 카드의 "⭐ 오늘의 핵심 문장 도전!"이 넘겨주는
  // { sentence, passageTitle, progress }를 들고 SentenceLearningFlow로 직행.
  // 플래그가 꺼져 있으면 GuidedSession이 이 콜백을 절대 부르지 않는다
  // (오퍼 조회/버튼 자체가 없음 — GuidedSession.jsx 참고).
  const [pendingKeySentence, setPendingKeySentence] = useState(null)
  const startKeySentence = (offer) => { setPendingKeySentence(offer); setScreen('sentenceFlow') }
  // SentenceLearningFlow의 unitWordSlugs — SentencesTab과 동일하게 유닛
  // 단어 원문 문자열 배열(빈칸 선택 엔진 pickBlank 입력).
  const unitWordSlugs = useMemo(() => classWords.map((w) => w?.word).filter(Boolean), [classWords])

  // v2.0 쓰기 모드 세션 성적 집계(방향별) — 첫 시도 기준. 쓰기 모드로
  // 단어 목록에서 세션을 시작할 때 비우고, 마지막 단어까지 끝나면 결과
  // 화면(spellingResult)에서 요약해 보여준다. 저장은 안 함(요약 표시 전용
  // — 영구 기록은 기존 recordSpellingAnswer가 이미 담당).
  const [writeSessionStats, setWriteSessionStats] = useState([])

  // 쓰기 채점 1건 처리 — ①기존 영구 기록 ②세션 집계(쓰기 모드만)
  // ③애매한 오답(영→한인데 한글로 답함)은 교사 검토 큐에 기록
  // (fire-and-forget, 테이블 없으면 조용히 스킵 — spellingReviewApi 참고).
  const handleSpellingAnswer = (wordId, correct, direction, submitted) => {
    studentData.recordSpellingAnswer(wordId, correct)
    const w = classWords.find((cw) => cw.id === wordId)
    if (studyMode === 'write') {
      setWriteSessionStats((prev) => [...prev, {
        wordId, correct,
        direction: direction === 'en2kr' ? 'en2kr' : 'kr2en',
        word: w?.word || wordId, meaning: w?.meaning || '',
      }])
    }
    if (!correct && direction === 'en2kr' && w?.dbId && /[ㄱ-ㆎ가-힣]/.test(submitted || '')) {
      logSpellingReview(w.dbId, studentId, submitted, 'en2kr')
    }
  }

  // Re-pull the latest word AND student data from Supabase whenever the app
  // regains focus (e.g. switching back from another app on mobile) so a word
  // added on another device — or a class/unit reassignment an admin made on
  // a different device while this tab stayed open — doesn't stay hidden
  // behind stale cached data. refreshStudents() is included here because
  // _students (unlike _cache) was previously only ever populated once at
  // initWordLibrary() and never refreshed again for a tab's whole lifetime,
  // which is exactly what let a student's re-assigned unit silently revert
  // to whatever it was when the tab first loaded.
  useEffect(() => {
    // 2026-07-10 성능 최적화: visibilitychange와 focus는 같은 "앱으로
    // 돌아옴" 순간에 거의 동시에(모바일에서는 둘 다) 발생하는 경우가
    // 많아서, 이 핸들러가 두 번 연달아 불리며 6개 Supabase 쿼리
    // (refreshWordLibrary 4개 + refreshStudents 1개 + refreshClassSettings
    // 1개)를 두 번, 총 12개를 쏘고 있었다. 이미 진행 중인 새로고침이
    // 있으면 겹쳐 시작하지 않도록 가드 — 실제 새로고침 자체(최초 트리거
    // 시점, 어떤 데이터를 가져오는지)는 전혀 안 바뀜, 근접 중복 호출만
    // 제거.
    let inFlight = false
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !inFlight) {
        inFlight = true
        Promise.all([refreshWordLibrary(), refreshStudents(), refreshClassSettings()])
          .then(() => setRefreshTick((t) => t + 1))
          .catch(() => {})
          .finally(() => { inFlight = false })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // v1.5: 단어 목록에서 클릭한 단어와 "다음 단어" 진행은 지금 활성화된
  // 학습 범위(sessionWords — 전체일 땐 classWords와 동일)를 기준으로
  // 인덱싱한다. 그래야 "모르는 단어만" 등에서 다음으로 넘어갈 때 필터링
  // 안 된 단어를 건너뛰지 않고, 정확히 그 범위 안에서만 순환한다.
  const handleWordSelect = (w) => {
    const idx = sessionWords.findIndex(cw => cw.id === w.id)
    const safeIdx = idx >= 0 ? idx : 0
    setWord(w)
    setWordIdx(safeIdx)
    studentData.setLastWordIndex(safeIdx, currentUnitId)
    setWriteSessionStats([]) // 새 세션 시작 — 쓰기 성적 집계 초기화
    setScreen('wordDetail')
  }

  // Jumps straight into word study at a specific index — used by the
  // Dashboard's "이어서 학습하기" recommendation, which reads
  // studentData.lastWordIndex instead of always restarting from word 1.
  // 항상 반 전체 단어 기준(scope와 무관) — "이어서 학습하기"는 필터링과
  // 상관없이 지난번에 멈춘 그 자리부터 이어가는 게 맞는 의미라서.
  const goToWordIndex = (idx) => {
    if (idx < 0 || idx >= classWords.length) return
    setWord(classWords[idx])
    setWordIdx(idx)
    studentData.setLastWordIndex(idx, currentUnitId)
    setWriteSessionStats([]) // 새 세션 시작 — 쓰기 성적 집계 초기화
    setScreen('wordDetail')
  }

  // Advance to next word in sessionWords; go back to browser after last word.
  // Every 5th completed word (and only if there's a next word to continue
  // to), offer the balloon-game bonus screen instead of jumping straight to
  // the next word — the student picks whether to play or keep going.
  const handleNextWord = () => {
    const nextIdx = selectedWordIdx + 1
    const completedCount = selectedWordIdx + 1
    if (completedCount % 5 === 0 && nextIdx < sessionWords.length) {
      setPendingNextIdx(nextIdx)
      setScreen('bonusChoice')
      return
    }
    if (nextIdx < sessionWords.length) {
      setWord(sessionWords[nextIdx])
      setWordIdx(nextIdx)
      studentData.setLastWordIndex(nextIdx, currentUnitId)
    } else if (studyMode === 'write' && writeSessionStats.length > 0) {
      // v2.0 쓰기 모드 — 마지막 단어까지 끝나면 목록 대신 방향별 성적
      // 요약("한→영 8/10 · 영→한 9/10 · 총점 17/20")을 먼저 보여줌.
      setScreen('spellingResult')
    } else {
      setScreen('wordBrowser')
    }
  }

  const goToPendingWord = () => {
    setWord(sessionWords[pendingNextIdx])
    setWordIdx(pendingNextIdx)
    studentData.setLastWordIndex(pendingNextIdx, currentUnitId)
    setScreen('wordDetail')
  }

  const handleAnswerMission = (wordId) => answerMission(wordId)

  // P0(2026-07-17) 로그인 직후 로딩 게이트 — 이 기기에 로컬 기록이 없는
  // 학생(신규/기기 교체/PIN 초기화 후 재로그인)은 클라우드 백업 복원
  // 확인이 끝날 때까지(성공/실패/5s 타임아웃 무관) Dashboard를 렌더하지
  // 않는다. 복원 전의 빈 record로 화면이 먼저 그려졌다가 데이터가 뒤늦게
  // 갈아끼워지는 깜빡임/불일치 방지. 로컬에 기록이 있는 학생은
  // restoreChecked가 처음부터 true라 이 화면을 전혀 거치지 않는다.
  // (반드시 위의 모든 훅 호출 뒤에 있어야 함 — 훅 순서 규칙.)
  if (!studentData.restoreChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-bounce">📖</div>
          <p className="text-purple-400 font-bold">학습 기록을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {screen === 'dashboard'     && (
        <Dashboard studentId={studentId} studentName={studentName} studentData={studentData} classWords={classWords}
          onGo={setScreen} onLogout={onLogout} onPlayGame={startRandomGame}
          onResumeWord={goToWordIndex}
          resumeIndex={studentData.getResumeIndexForUnit(currentUnitId)}
          onUnitSwitch={handleUnitSwitch}
          onStartGuided={startGuidedSession}
          attachmentStats={attachment.stats} wordTextById={attachment.wordTextById}
          completedUnits={attachment.unitsDone} completedTextbooks={attachment.textbooksDone}
          pendingCeremonyHat={attachment.pendingCeremonyHat} onDismissCeremony={attachment.dismissCeremony}
          textbookOptions={textbookOptions} currentTextbookId={currentTextbookOptionId}
          onTextbookSwitch={handleTextbookSwitch} />
      )}
      {screen === 'guidedSession' && (
        // 3분 데일리 리추얼(2026-07-22) — 가이드 학습은 항상 classWords
        // (반 전체 단어)를 기준으로 한다. sessionWords가 아니다 — 이전에
        // WordBrowser에서 고른 studyScope('unknown' 등)가 세션에 남아
        // 오늘의 목록을 몰래 줄이면 안 되기 때문. 콜백은 wordDetail 화면과
        // 정확히 동일한 useStudent 경로(점수/진행도 로직 재구현 없음).
        // GiftReveal 오버레이(아래 pendingGift 블록)는 screen 값과 무관하게
        // 렌더되므로 이 화면도 자동으로 덮는다.
        <GuidedSession
          classWords={classWords}
          resumeIndex={studentData.getResumeIndexForUnit(currentUnitId)}
          studentId={studentId}
          unitId={currentUnitId}
          onStartKeySentence={startKeySentence}
          spellingSettings={spellingSettings}
          mixedDirections={guidedMixedDirections}
          spellingCombo={studentData.spellingCombo}
          spellingReviewQueue={spellingReviewQueue}
          wordStatus={wordStatus}
          onSpellingAnswer={handleSpellingAnswer}
          onMarkViewed={studentData.markWordViewed}
          onMarkExampleHeard={studentData.markExampleHeard}
          onMarkPronunciationOk={() => { markPronunciationOk(); addStars(1) }}
          onMarkQuizSolved={studentData.markQuizSolved}
          onQuizAnswer={studentData.recordQuizAnswer}
          onPronunciationAttempt={studentData.markPronunciationAttempt}
          onWordKnown={setWordKnown}
          onWordUnknown={setWordUnknown}
          onSetLastWordIndex={(idx) => studentData.setLastWordIndex(idx, currentUnitId)}
          onDone={() => setScreen('dashboard')}
        />
      )}
      {screen === 'sentenceFlow' && pendingKeySentence && (
        // Lesson 5 여정 — 오늘의 핵심 문장 학습(6단계). SentencesTab이
        // SentenceLearningFlow를 부르는 방식과 동일한 props에, 진입 맥락에
        // 맞는 문구만 다르다(목록이 아니라 홈으로 복귀 — 마스터 화면이
        // 미션 완료 순간). readingStudentUI 플래그가 꺼져 있으면 이 화면에
        // 도달할 경로 자체가 없다(pendingKeySentence는 GuidedSession 오퍼
        // 버튼으로만 채워짐).
        <SentenceLearningFlow
          studentId={studentId}
          sentence={pendingKeySentence.sentence}
          unitWordSlugs={unitWordSlugs}
          initialProgress={pendingKeySentence.progress || null}
          backLabel="← 홈"
          doneLabel="🏠 미션 완료! 홈으로"
          onClose={() => { setPendingKeySentence(null); setScreen('dashboard') }}
        />
      )}
      {screen === 'wordBrowser'   && (
        <WordBrowser words={classWords} cleared={cleared} onSelect={handleWordSelect} onBack={() => setScreen('dashboard')}
          mode={studyMode} onModeChange={setStudyMode}
          scope={studyScope} onScopeChange={setStudyScope} wordStatus={wordStatus} reviewWordIds={reviewWordIds}
          // v3.4 Phase B — [문장] 탭(SentencesTab) 전용. readingStudentUI
          // 플래그(기본 false)가 꺼져 있으면 WordBrowser는 이 두 prop을
          // 어디에도 쓰지 않는다(탭 바 비렌더 — 화면 변화 0).
          studentId={studentId} unitId={currentUnitId} />
      )}
      {screen === 'wordDetail'    && selectedWord && (
        <WordDetail word={selectedWord}
          classWords={classWords}
          mode={studyMode}
          spellingSettings={spellingSettings}
          onSpellingAnswer={handleSpellingAnswer}
          spellingDirectionOverride={mixedDirections ? mixedDirections[selectedWordIdx] || 'kr2en' : null}
          spellingCombo={studentData.spellingCombo}
          spellingReviewQueue={spellingReviewQueue}
          sessionProgress={{ current: selectedWordIdx + 1, total: sessionWords.length }}
          onBack={() => setScreen('wordBrowser')}
          onNext={handleNextWord}
          onMarkViewed={studentData.markWordViewed}
          onMarkExampleHeard={studentData.markExampleHeard}
          onMarkPronunciationOk={() => { markPronunciationOk(); addStars(1) }}
          onMarkQuizSolved={studentData.markQuizSolved}
          onQuizAnswer={studentData.recordQuizAnswer}
          onPronunciationAttempt={studentData.markPronunciationAttempt}
          wordStatus={wordStatus} onWordKnown={setWordKnown} onWordUnknown={setWordUnknown} />
      )}
      {screen === 'quiz'          && (
        <QuizGame initWord={selectedWord} classWords={classWords}
          onBack={() => setScreen('dashboard')}
          onAddMission={studentData.addMission}
          onMarkQuizSolved={studentData.markQuizSolved}
          onMarkPronunciationOk={markPronunciationOk}
          onAddStars={addStars}
          onQuizAnswer={studentData.recordQuizAnswer}
          onPronunciationAttempt={studentData.markPronunciationAttempt} />
      )}
      {screen === 'levelUpMission' && <LevelUpMission missions={missions} words={classWords} onAnswer={handleAnswerMission} onBack={() => setScreen('dashboard')} />}
      {screen === 'diary'         && <DiaryPage studentData={studentData} onBack={() => setScreen('dashboard')} />}
      {screen === 'studyCalendar' && <StudyCalendar studentData={studentData} onBack={() => setScreen('dashboard')} />}
      {/* 애착 시스템(2026-07-22) — 4개 화면 전부 lazy(공유 fallback), 진입은
          Dashboard "더 많은 메뉴"의 feature flag 게이트를 거친다. */}
      {(screen === 'hatCollection' || screen === 'wordMuseum' || screen === 'growthAlbum' || screen === 'englishGarden' || screen === 'paulTown' || screen === 'bookshelf' || screen === 'timeMachine') && (
        <React.Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-5xl mb-3 animate-bounce">🎁</div>
              <p className="text-gray-400 font-bold">화면을 불러오는 중...</p>
            </div>
          </div>
        }>
          {screen === 'hatCollection' && (
            <HatCollection studentName={studentName} hatInventory={studentData.hatInventory}
              equippedHatId={studentData.equippedHatId} onEquip={(id) => { studentData.equipHat(id); trackEvent(studentId, EV.hatEquipped) }}
              onBack={() => setScreen('dashboard')} />
          )}
          {screen === 'wordMuseum' && (
            <WordMuseum studentId={studentId} stats={attachment.stats} lib={attachment.lib}
              onBack={() => setScreen('dashboard')} />
          )}
          {screen === 'growthAlbum' && (
            <GrowthAlbum milestones={studentData.milestones} stats={attachment.stats}
              onBack={() => setScreen('dashboard')} />
          )}
          {screen === 'englishGarden' && (
            <EnglishGarden stats={attachment.stats} onBack={() => setScreen('dashboard')} />
          )}
          {/* Paul Town v2.0 — 순수 파생 마을 화면. 읽는 영속 상태는 기존
              사실 2가지(hatInventory/equippedHatId)뿐, 장착은 기존 equipHat
              그대로(새 저장 경로 없음). */}
          {screen === 'paulTown' && (
            <PaulTown stats={attachment.stats} hatInventory={studentData.hatInventory}
              equippedHatId={studentData.equippedHatId} onEquip={studentData.equipHat}
              onGo={setScreen} onBack={() => setScreen('dashboard')} />
          )}
          {/* Paul Town 월드 — 도서관/시계탑. 마을 건물 카드로만 진입하므로
              뒤로 가기는 마을(paulTown)로. 전부 파생 화면 — 저장 0. */}
          {screen === 'bookshelf' && (
            <Bookshelf lib={attachment.lib} unitsDone={attachment.unitsDone}
              textbooksDone={attachment.textbooksDone}
              onBack={() => setScreen('paulTown')} />
          )}
          {screen === 'timeMachine' && (
            <TimeMachine stats={attachment.stats} wordTextById={attachment.wordTextById}
              onBack={() => setScreen('paulTown')} />
          )}
        </React.Suspense>
      )}
      {screen === 'bonusChoice'   && (
        <BonusChoiceScreen
          completedCount={pendingNextIdx}
          wordCount={sessionWords.length}
          onPlayGame={() => { setBalloonFromLesson(true); startRandomGame() }}
          onContinue={goToPendingWord}
        />
      )}
      {screen === 'game'          && (
        <CurrentGame
          words={classWords}
          onBack={balloonFromLesson ? goToPendingWord : () => setScreen('dashboard')}
          onAddStars={addStars}
          onContinue={balloonFromLesson ? goToPendingWord : null}
        />
      )}
      {pendingGift && (
        <GiftReveal
          key={`${pendingGift.sticker.id}-${pendingGift.isMilestone ? 'm' : pendingGift.isBadge ? 'b' : 'r'}-${pendingGift.streakDays || pendingGift.badgeThreshold || 0}`}
          sticker={pendingGift.sticker}
          isDuplicate={pendingGift.isDuplicate}
          isMilestone={pendingGift.isMilestone}
          streakDays={pendingGift.streakDays}
          isBadge={pendingGift.isBadge}
          badgeThreshold={pendingGift.badgeThreshold}
          onClose={handleDismissGift}
        />
      )}
      {screen === 'entranceTest' && (
        <React.Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-5xl mb-3 animate-bounce">📝</div>
              <p className="text-gray-400 font-bold">시험 화면을 불러오는 중...</p>
            </div>
          </div>
        }>
          <EntranceTest studentId={studentId} studentName={studentName} onBack={() => setScreen('dashboard')} />
        </React.Suspense>
      )}
      {screen === 'spellingResult' && (
        <SpellingSessionResult
          stats={writeSessionStats}
          onDone={() => { setWriteSessionStats([]); setScreen('wordBrowser') }}
        />
      )}
      {screen === 'spellingReview' && (
        <SpellingReview
          // Writing MVP(2026-07-20) — 오늘치 오답노트 + 영구 복습 대기열을
          // 합쳐서(중복 제거) 한 번에 순회. SpellingReview 자체는 이 구분을
          // 몰라도 되고, comebackWordIds만 별도로 받아 배지 판단에 쓴다.
          wrongWordIds={Array.from(new Set([...spellingWrongToday, ...spellingReviewQueue]))}
          comebackWordIds={spellingReviewQueue}
          classWords={classWords}
          onClearWord={clearSpellingReviewWord}
          onDone={() => setScreen('dashboard')}
          hintEnabled={spellingSettings.spellingHintEnabled}
          direction={spellingSettings.spellingDirection}
        />
      )}
      <SpeedBtn />
    </>
  )
}

const SESSION_KEY = 'paulEasyVoca_currentStudent'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// P0(2026-07-15) identity 리팩터링 — 세션은 이제 { id, name } JSON을
// 저장한다(예전엔 이름 문자열 그대로). 예전 형식(순수 이름 문자열, 또는
// UUID가 아닌 값)이 남아있는 기기는 "레거시 세션"으로 간주해 안전하게
// 로그아웃 처리한다 — PIN 없이는 그 세션을 어느 학생 것인지 확인할 방법이
// 없으므로(동명이인 가능), 자동으로 아무 계정에나 로그인시키지 않는다.
// 크래시 없이 그냥 로그인 화면으로 돌려보내는 게 유일하게 안전한 선택.
function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && UUID_RE.test(parsed.id || '')) return parsed
    return null // 형식이 안 맞음 — legacy 취급
  } catch {
    return null // JSON.parse 실패 = 예전의 순수 이름 문자열이었던 경우 포함 — legacy 취급
  }
}

export default function App() {
  const [student, setStudent] = useState(() => readSession()) // null | { id, name, className, unitName }
  const [showAdmin, setAdmin] = useState(false)
  const [showParent, setParent] = useState(false)
  const [ready, setReady]     = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [removedNotice, setRemovedNotice] = useState(false)
  // 로그인 방식이 이름 전용 → 이름+PIN으로 바뀌면서, 예전 형식(이름 문자열
  // 또는 구버전 세션)이 저장돼 있던 기기는 최초 로드 시 한 번 여기로 걸린다.
  const [legacySessionNotice, setLegacySessionNotice] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return !!raw && !readSession()
    } catch { return false }
  })

  // Load class/word data from Supabase before rendering anything that needs
  // it — guarantees every screen starts from the current DB state, not a
  // stale local cache. Legacy(형식 안 맞는) 세션은 여기서 정리.
  useEffect(() => {
    initWordLibrary().then(() => {
      setReady(true)
      if (!readSession() && localStorage.getItem(SESSION_KEY)) {
        localStorage.removeItem(SESSION_KEY)
      }
      // [진단 로그 4-b] 캐시된 로그인(페이지 새로고침으로 재입장)의 경우도
      // 여기서 Home 진입 직전 상태를 확인할 수 있음.
      if (student) {
        console.log('[App] initWordLibrary 완료 — 캐시된 currentStudent:', {
          id: student.id, name: student.name, class: getStudentClass(student.id), unit: getStudentUnit(student.id),
        })
      }
    }).catch((err) => setLoadError(err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If an admin deleted this student's account from another device while
  // this one was still logged in, don't silently fall through to an empty
  // "0 words" dashboard under an id that no longer exists — log out with a
  // clear explanation instead.
  useEffect(() => {
    if (ready && student && !getStudentById(student.id)) {
      localStorage.removeItem(SESSION_KEY)
      setStudent(null)
      setRemovedNotice(true)
    }
  }, [ready, student])

  // Unlock AudioContext + warm up speechSynthesis + ask for microphone
  // permission, all on the very first user gesture in the whole app
  // (iOS/Android requirement — must happen inside a gesture handler).
  // getMicStream() caches the granted stream module-wide, so no later
  // getUserMedia() call — on any word, on any screen — asks again.
  // touchstart covers mobile; pointerdown also covers PC mouse clicks.
  useEffect(() => {
    const handler = () => { unlockAudio(); primeSpeech(); getMicStream().catch(() => {}) }
    document.addEventListener('touchstart', handler, { once: true, passive: true })
    document.addEventListener('pointerdown', handler, { once: true, passive: true })
    return () => {
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('pointerdown', handler)
    }
  }, [])

  // Always re-pull this student's class/unit from Supabase at the exact
  // moment of login — logout->re-login is a pure client-side state change
  // (no page reload), so without this, a unit reassignment an admin made
  // earlier in the same tab's lifetime would keep being invisible, since
  // _students was otherwise only ever loaded once when the tab first opened.
  // `sel`은 StudentSelect.jsx가 로그인/등록 성공 시 넘기는 { id, name,
  // className, unitName } — PIN 서버 검증(로그인) 또는 addStudent+set-
  // student-pin(등록) 둘 다 이 모양으로 통일해서 넘긴다.
  const handleSelect = async (sel) => {
    try { await refreshStudents() } catch {}
    // [진단 로그 4] Home(Dashboard) 진입 직전 currentStudent + 그 시점의 반/유닛
    console.log('[App] handleSelect — Home 진입 직전 currentStudent:', {
      id: sel.id, name: sel.name, class: getStudentClass(sel.id), unit: getStudentUnit(sel.id),
    })
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: sel.id, name: sel.name }))
    setRemovedNotice(false)
    setLegacySessionNotice(false)
    setStudent(sel)
  }
  const handleLogout = () => { localStorage.removeItem(SESSION_KEY); setStudent(null) }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-lg">
          <div className="text-5xl mb-4">📡</div>
          <h2 className="font-black text-xl text-gray-800 mb-2">단어 서버에 연결할 수 없어요</h2>
          <p className="text-xs text-red-400 mb-6 break-all bg-red-50 p-3 rounded-xl">{String(loadError.message || loadError)}</p>
          <button onClick={() => window.location.reload()} className="w-full bg-purple-500 text-white font-black py-3 rounded-2xl">
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-bounce">📚</div>
          <p className="text-purple-400 font-bold">단어를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (showAdmin) return (
    <AppErrorBoundary>
      <React.Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-5xl mb-3 animate-bounce">⚙️</div>
            <p className="text-gray-400 font-bold">관리자 화면을 불러오는 중...</p>
          </div>
        </div>
      }>
        <AdminScreen onBack={() => setAdmin(false)} />
      </React.Suspense>
    </AppErrorBoundary>
  )
  if (showParent) return (
    <AppErrorBoundary>
      <React.Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="text-5xl mb-3 animate-bounce">👨‍👩‍👧</div>
            <p className="text-gray-400 font-bold">학부모 화면을 불러오는 중...</p>
          </div>
        </div>
      }>
        <ParentScreen onBack={() => setParent(false)} />
      </React.Suspense>
    </AppErrorBoundary>
  )
  if (!student)  return (
    <AppErrorBoundary>
      <StudentSelect onSelect={handleSelect} onAdmin={() => setAdmin(true)} onParent={() => setParent(true)}
        removedNotice={removedNotice || legacySessionNotice} />
    </AppErrorBoundary>
  )
  return <AppErrorBoundary><AppInner studentId={student.id} studentName={student.name} onLogout={handleLogout} /></AppErrorBoundary>
}
