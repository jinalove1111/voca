import { useState, useEffect } from 'react'
import { getStudentClass, getStudentClassId, getStudentUnit, getClassNames, getClassUnitNames, getTodaysAssignmentWordIds, getClassSettings, getClassIdByName, getStudentById, fetchHouseWeeklyScore, fetchHouseSeasonScore } from '../utils/wordLibrary'
// v2.9(2026-07-21, decision 0004 다중 교재) — 2개 이상 교재가 배정된
// 학생에게만 나타나는 선택기. 0/1개면 컴포넌트 자체가 아무것도 렌더하지
// 않는다(TextbookSelector.jsx 참고) — 기존 294명 단일-반 학생 화면은
// 이 import 한 줄 말고는 전혀 바뀌지 않는다.
import TextbookSelector from './TextbookSelector'
// House System(2026-07-19, 게임화 하위카드 8번) — 학생 화면 최소 표시
// ("우리 하우스: OO · 이번 주 팀 점수"). 개인 순위/타 하우스 비교 없음
// (PAUL_PRINCIPLES.md 3번 원칙 그대로 — 소속감이지 경쟁 연출이 아님).
import { getHouseById } from '../utils/houseSystem'
import { getMicStreamOnce, hasMicStream } from '../utils/speech'
import { useMicReady } from '../hooks/useMicReady'
import { isInAppBrowser } from '../utils/browserDetect'
import { STICKERS } from '../data/stickers'
import InAppBrowserNotice from './InAppBrowserNotice'
import HeroReaction from './HeroReaction'
import { getReactionById } from '../utils/paulReactions'
// 입실 단어시험 진입 배너 — 오늘 이 반의 시험이 없으면(또는 v1.8 테이블이
// 아직 없으면) 아무것도 렌더하지 않아 기존 대시보드에 영향 0.
// 성능(Phase 3, 2026-07-18): 무거운 EntranceTest.jsx(응시/채점/랭킹 전체
// 로직) 대신 이 배너만 담은 작은 파일에서 import — 정적 import 체인이
// 학생 메인 번들에 EntranceTest.jsx 전체를 끌고 오는 것을 막는다.
import { EntranceTestBanner } from './EntranceTestBanner'
// Paul Rank System(2026-07-19) — 최소 통합: 예쁜 모자 그래픽 없이 텍스트/
// 숫자로만 현재 Rank/모자단계/다음 단계까지 진행률을 표시(운영자 지시:
// 큰 UI 리디자인 금지, 시각/애니메이션은 이번 범위 밖).
import { usePaulRank } from '../hooks/usePaulRank'
// Ticket Economy(2026-07-19, GAME_DESIGN.md 4·7·10번 섹션) — 최소 상점
// UI(카탈로그 2개, 결정론적 구매만). ticketBalance/redeemTicketReward는
// useStudent.js(studentData)에서 그대로 내려온다 — 이 파일은 카탈로그
// 표시/구매 버튼만 담당.
import { REWARD_CATALOG } from '../utils/ticketEconomy'
// Word King(2026-07-19, 게임화 하위카드 7번) — 최소 통합: 텍스트 한 줄만
// ("이번 주 챔피언: OOO"). 시각/발표 연출은 이번 범위 밖(PAUL_BIBLE.md
// §11 DESIGN DIRECTION 참고).
import { fetchWeeklyChampion } from '../utils/wordKingApi'
// Seasonal Progression(2026-07-19, 게임화 하위카드 9번, GAME_DESIGN.md 9번
// 섹션) — 시즌이 실제로 시작된 뒤에만("관리자가 새 시즌 시작 버튼을
// 누른 적 있음") 나타나는 추가 텍스트 한 줄("이번 시즌 누적 점수"). 시즌이
// 아직 없으면(SQL 미실행 포함) fetchCurrentSeason()이 null을 반환해 이
// 블록 전체가 조용히 안 보인다 — 기존 "이번 주 팀 점수" 표시는 전혀
// 바뀌지 않는다(레벨/뱃지/스트릭과 마찬가지로 이 라운드의 변경과 무관).
import { fetchCurrentSeason } from '../utils/seasonApi'

const GOAL = 5
const stickerById = (id) => STICKERS.find(s => s.id === id)

// One explicit button to request mic permission up front — a single user
// gesture, once per app session. After this, every word's "따라 말하기"
// reuses the same granted stream and never prompts again.
function MicPrimeBtn() {
  const micReady = useMicReady(1000)
  const [state, setState] = useState(() => (hasMicStream() ? 'ready' : 'idle'))
  const [errMsg, setErrMsg] = useState('')

  // micReady flips true if the stream becomes available from ANY source
  // (e.g. another screen's getMicStream() call) — mirror that into this
  // button's own richer state machine without duplicating the polling.
  useEffect(() => {
    if (micReady && state !== 'ready') setState('ready')
  }, [micReady, state])

  if (isInAppBrowser()) return <InAppBrowserNotice />

  const handleClick = async () => {
    setState('requesting')
    setErrMsg('')
    try {
      await getMicStreamOnce()
      console.log('[Dashboard] mic ready success')
      setState('ready')
      console.log('[Dashboard] micReady state true')
    } catch (err) {
      setState('error')
      console.error('[Dashboard] mic prime failed:', err.name, '-', err.message, '\n', err.stack)
      // Only getUserMedia's own rejection decides this — never the
      // Permissions API, which can report a stale/wrong state. Only
      // NotAllowedError/PermissionDeniedError actually mean "denied";
      // everything else (no mic hardware, insecure origin, bad constraints)
      // is a different problem, and we always show the real error.message
      // rather than a generic label so the actual cause is visible.
      if (err.name === 'InsecureContextError' || err.name === 'MediaDevicesUnavailableError') {
        setErrMsg(err.message)
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrMsg(`마이크 권한이 거부됐어요. 브라우저 설정에서 마이크를 허용해주세요. (${err.name}: ${err.message})`)
      } else if (err.name === 'NotFoundError') {
        setErrMsg(`마이크를 찾을 수 없어요. 기기에 마이크가 있는지 확인해주세요. (${err.name}: ${err.message})`)
      } else if (err.name === 'NotReadableError') {
        setErrMsg(`다른 앱이 마이크를 사용 중이에요. (${err.name}: ${err.message})`)
      } else {
        setErrMsg(`마이크를 시작할 수 없어요 — ${err.name}: ${err.message}`)
      }
    }
  }

  if (state === 'ready') {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-3 text-center">
        <p className="font-black text-green-700 text-sm">✅ 마이크 준비 완료 — 이제 녹음할 때 권한을 다시 묻지 않아요</p>
      </div>
    )
  }

  return (
    <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-3 text-center">
      <button onClick={handleClick} disabled={state === 'requesting'}
        className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-black py-3 rounded-xl btn-press">
        {state === 'requesting' ? '⏳ 허용을 눌러주세요...' : '🎤 마이크 준비하기'}
      </button>
      {state === 'error' && (
        <p className="text-red-500 text-xs font-bold mt-2">{errMsg}</p>
      )}
      <p className="text-purple-400 text-xs mt-2">처음 1번만 누르면 계속 유지돼요!</p>
    </div>
  )
}

function MissionBar({ label, current, goal, emoji }) {
  const pct = Math.min(100, (current / goal) * 100)
  const done = current >= goal
  return (
    <div className={`rounded-2xl p-3 ${done ? 'bg-green-50 border-2 border-green-200' : 'bg-gray-50'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-gray-600">{emoji} {label}</span>
        <span className={`text-sm font-black ${done ? 'text-green-600' : 'text-purple-600'}`}>
          {done ? '✅ 완료!' : `${current}/${goal}`}
        </span>
      </div>
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-400' : 'bg-gradient-to-r from-purple-400 to-pink-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// Rule-based "what should I do next?" banner — no AI, just reads existing
// student state (review queue, today's mission progress, resume position)
// and picks ONE recommendation, in priority order:
//   1. Review words waiting (레벨업 미션 대기 중) — always comes first.
//   2. Studied a lot already today — nudge toward a fun bonus game instead
//      of pushing more drilling.
//   3. Mid-unit — offer to resume exactly where they left off.
//   4. Otherwise — plain "start studying" default.
// 3분 데일리 리추얼(2026-07-22) — 이 배너가 화면에서 가장 크고 지배적인
// 히어로 CTA다. 스마트 브랜칭(우선순위 1~4)은 그대로 유지하되, canResume/
// hasWords 두 가지(3·4번)만 목적지가 가이드 세션(onStartGuided)으로 바뀐다
// — 복습(1번 → levelUpMission)/보너스게임(2번) 브랜치는 기존 목적지 그대로.
// onStartGuided가 없으면(구버전 App.jsx) 기존 onResumeWord 경로로 폴백.
function RecommendationBanner({ studentData, classWords, onGo, onResumeWord, onPlayGame, resumeIndex, onStartGuided }) {
  const { activeMissions, giftsToday } = studentData
  // v2.1 — 이어서-학습 위치는 "현재 유닛"의 저장 지점(App.jsx가
  // getResumeIndexForUnit으로 계산해서 내려줌). 구버전 경로(prop 미전달)는
  // 기존 전역 lastWordIndex 그대로.
  const lastWordIndex = resumeIndex !== undefined ? resumeIndex : studentData.lastWordIndex
  const hasWords = classWords.length > 0
  const canResume = hasWords && lastWordIndex > 0 && lastWordIndex < classWords.length

  let rec
  if (activeMissions.length > 0) {
    rec = {
      emoji: '🔁', title: '복습할 단어가 있어요!',
      desc: `${activeMissions.length}개 단어를 다시 연습하면 완전히 내 것이 돼요.`,
      label: '지금 복습하기', onClick: () => onGo('levelUpMission'),
    }
  } else if (giftsToday >= 2) {
    rec = {
      emoji: '🌟', title: '정말 열심히 했어요!',
      desc: '오늘 미션을 이미 여러 번 완료했어요. 보너스 게임 어때요?',
      label: '보너스 게임 하기', onClick: onPlayGame,
    }
  } else if (canResume) {
    rec = {
      emoji: '📖', title: '이어서 학습할까요?',
      desc: `${lastWordIndex + 1}번째 단어부터 3분 세션으로 이어가요.`,
      label: '▶ 오늘의 학습 계속하기',
      onClick: () => (onStartGuided ? onStartGuided() : onResumeWord(lastWordIndex)),
    }
  } else if (hasWords) {
    rec = {
      emoji: '✨', title: '오늘도 시작해볼까요?',
      desc: '딱 3분씩, 짧은 세션으로 차근차근 시작해요!',
      label: '▶ 오늘의 학습 시작',
      onClick: () => (onStartGuided ? onStartGuided() : onResumeWord(0)),
    }
  } else {
    rec = {
      emoji: '📭', title: '단어가 부족해요',
      desc: '선생님이 단어를 추가하면 학습을 시작할 수 있어요.',
      label: null, onClick: null,
    }
  }

  return (
    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white card-shadow">
      <HeroReaction
        image={getReactionById('hello')?.image}
        title={`${rec.emoji} ${rec.title}`}
        message={rec.desc}
        theme="banner"
        size="lg"
      />
      {rec.label && (
        <button onClick={rec.onClick}
          className="w-full mt-5 bg-white text-indigo-600 font-black text-xl py-5 rounded-2xl btn-press shadow-lg">
          {rec.label}
        </button>
      )}
    </div>
  )
}

// P0(2026-07-15): student(이름 문자열) 대신 studentId(식별자)+studentName
// (표시용)을 따로 받는다 — getStudentClass/getStudentUnit은 이제 id 기반.
export default function Dashboard({ studentId, studentName, studentData, classWords, onGo, onLogout, onPlayGame, onResumeWord, resumeIndex, onUnitSwitch, onStartGuided, textbookAssignments, onTextbookSwitch }) {
  const { stars, stickerTypes, activeMissions, dailyProgress, liveMissionsCompleted, streak, cleared, ticketBalance, redeemTicketReward } = studentData
  const { rankState, loading: rankLoading } = usePaulRank(studentId)

  const className = getStudentClass(studentId)
  const unitName = getStudentUnit(studentId)
  // Teacher Controls 마스터 스위치(2026-07-19, GAME_DESIGN.md 13번 섹션) —
  // 컬럼이 아직 없거나(SQL 미실행) 관리자가 이 반에서 꺼뒀으면 항상 false
  // (getClassSettings의 안전한 기본값, wordLibrary.js 참고). Paul Rank
  // 표시는 이 값이 true인 반에서만 렌더된다(아래 JSX).
  const gamificationEnabled = !!getClassSettings(className).gamificationEnabled

  // Word King(2026-07-19) — 이번 주 챔피언 텍스트. gamificationEnabled과
  // 같은 마스터 스위치로 게이팅(Paul Rank/Ticket과 동일 원칙). 조회 실패
  // (테이블 미생성 등)는 wordKingApi.js가 조용히 빈 결과로 폴백하므로
  // 이 텍스트는 그냥 안 보일 뿐 크래시 없음.
  const [weeklyChampion, setWeeklyChampion] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (!gamificationEnabled || !className) { setWeeklyChampion(null); return }
    const classId = getClassIdByName(className)
    if (!classId) return
    fetchWeeklyChampion(classId).then((c) => { if (!cancelled) setWeeklyChampion(c) })
    return () => { cancelled = true }
  }, [gamificationEnabled, className])

  // House System(2026-07-19, 게임화 하위카드 8번) — "우리 하우스: OO ·
  // 이번 주 팀 점수" 최소 텍스트. Word King과 같은 gamificationEnabled
  // 마스터 스위치로 게이팅(별도 house_enabled 스위치를 만들지 않은 이유는
  // supabase_v2_7_house_system.sql 헤더 "설계 판단 3" 참고 — Word King
  // 선례와 일관성). house_id가 아직 없으면(컬럼 미실행/미배정)
  // getHouseById가 null을 반환해 이 블록 자체가 조용히 안 보인다(크래시
  // 없음). 팀 점수는 다른 학생 목록을 화면에 노출하지 않고 숫자 하나만
  // 보여준다 — 개인 순위/타 하우스 비교 없음(PAUL_PRINCIPLES.md 3번).
  const myHouse = getHouseById(getStudentById(studentId)?.houseId)
  const [houseWeeklyScore, setHouseWeeklyScore] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (!gamificationEnabled || !myHouse) { setHouseWeeklyScore(null); return }
    fetchHouseWeeklyScore(myHouse.id).then((score) => { if (!cancelled) setHouseWeeklyScore(score) })
    return () => { cancelled = true }
  }, [gamificationEnabled, myHouse?.id, studentId])

  // Seasonal Progression(2026-07-19, 게임화 하위카드 9번) — "이번 시즌 누적
  // 점수" 추가 텍스트. 위 houseWeeklyScore(그 주 월~일)와는 완전히 다른
  // 축(시즌 시작~지금 누적)이라 별도 state로 관리 — 기존 주간 표시 로직은
  // 손대지 않는다. currentSeason이 null이면(아직 시즌 시작 전) 이 블록
  // 전체가 렌더되지 않는다.
  const [currentSeason, setCurrentSeason] = useState(null)
  const [houseSeasonScore, setHouseSeasonScore] = useState(null)
  useEffect(() => {
    let cancelled = false
    if (!gamificationEnabled || !myHouse) { setCurrentSeason(null); setHouseSeasonScore(null); return }
    fetchCurrentSeason().then((season) => {
      if (cancelled) return
      setCurrentSeason(season)
      if (!season) { setHouseSeasonScore(null); return }
      fetchHouseSeasonScore(myHouse.id, season.startedAt).then((score) => { if (!cancelled) setHouseSeasonScore(score) })
    })
    return () => { cancelled = true }
  }, [gamificationEnabled, myHouse?.id, studentId])
  // [진단 로그 5] Home(Dashboard)에서 실제로 표시하는 unit 값 — 렌더될 때마다 확인
  console.log('[Dashboard] 표시하는 unit 값:', { studentId, studentName, className, unitName })
  const classDeleted = className && !getClassNames().includes(className)
  const recentStickers = [...stickerTypes].reverse().slice(0, 8).map(stickerById).filter(Boolean)

  // v2.1 유닛 선택기 — 자기 반의 유닛 목록만. 전환은 App.jsx의
  // handleUnitSwitch(setStudentUnit → 단어 목록 즉시 갱신 + Supabase 영속,
  // 다음 로그인/새로고침에도 유지)로 위임. 전환 중에는 셀렉트를 잠가
  // 연타로 인한 중복 쓰기를 막는다. 진행도(별/스트릭/스티커/오늘 미션)는
  // 어떤 것도 리셋되지 않는다 — useStudent 레코드는 전혀 안 건드림.
  const unitNames = className && !classDeleted ? getClassUnitNames(className) : []
  const [unitSwitching, setUnitSwitching] = useState(false)
  const [unitSwitchError, setUnitSwitchError] = useState('')
  const handleUnitChange = async (nextUnit) => {
    if (!onUnitSwitch || nextUnit === unitName) return
    setUnitSwitching(true)
    setUnitSwitchError('')
    try {
      await onUnitSwitch(nextUnit)
    } catch (err) {
      setUnitSwitchError('유닛 변경에 실패했어요. 잠시 후 다시 시도해주세요. (' + (err?.message || err) + ')')
    } finally {
      setUnitSwitching(false)
    }
  }

  // v2.9(2026-07-21, decision 0004 다중 교재) — 위 유닛 전환과 정확히 같은
  // 상호작용 패턴(전환 중 disabled, 실패 시 인라인 에러). textbookAssignments
  // 가 없거나(구버전 App.jsx) 1개 이하면 TextbookSelector 자체가 아무것도
  // 렌더하지 않으므로 이 핸들러는 그 경우 절대 호출되지 않는다.
  const [textbookSwitching, setTextbookSwitching] = useState(false)
  const [textbookSwitchError, setTextbookSwitchError] = useState('')
  const currentClassId = getStudentClassId(studentId)
  const handleTextbookChange = async (nextClassId) => {
    if (!onTextbookSwitch || nextClassId === currentClassId) return
    setTextbookSwitching(true)
    setTextbookSwitchError('')
    try {
      await onTextbookSwitch(nextClassId)
    } catch (err) {
      setTextbookSwitchError('교재 전환에 실패했어요. 잠시 후 다시 시도해주세요. (' + (err?.message || err) + ')')
    } finally {
      setTextbookSwitching(false)
    }
  }
  // 오늘의 숙제(반+날짜 축 — 유닛과 독립) 배정 여부 — 있으면 단어 공부가
  // 그 단어들로 열린다는 안내만(기존 getStudentWords 동작을 표시로 강화).
  const hasTodaysHomework = className && getTodaysAssignmentWordIds(className).length > 0

  return (
    <div className="min-h-screen p-4 pb-8">
      {/* Header */}
      <div className="max-w-lg mx-auto pt-2 mb-4 flex items-center justify-between">
        <button onClick={onLogout} className="py-3 px-2 -my-3 -mx-2 text-purple-400 text-sm font-bold btn-press hover:text-purple-600">← 나가기</button>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <div className="flex items-center gap-1 bg-orange-100 px-3 py-2 rounded-2xl">
              <span className="text-lg">🔥</span>
              <span className="font-black text-orange-600 text-sm">{streak}일</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-yellow-100 px-4 py-2 rounded-2xl">
            <span className="text-xl">⭐</span>
            <span className="font-black text-yellow-700 text-lg">{stars}</span>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        {/* Profile */}
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl p-6 text-white text-center card-shadow">
          <div className="text-5xl mb-2">👑</div>
          <h1 className="text-3xl font-black">{studentName}</h1>
          <TextbookSelector
            assignments={textbookAssignments}
            currentClassId={currentClassId}
            switching={textbookSwitching}
            error={textbookSwitchError}
            onSwitch={handleTextbookChange}
          />
          {className && (
            <div className="text-sm text-purple-200 mt-1 flex items-center justify-center gap-1.5 flex-wrap">
              <span>반: {className} ·</span>
              {unitNames.length > 0 && onUnitSwitch ? (
                <label className="inline-flex items-center gap-1">
                  <span className="sr-only">현재 유닛 선택</span>
                  <select value={unitName} disabled={unitSwitching}
                    onChange={(e) => handleUnitChange(e.target.value)}
                    className="bg-white/20 text-white font-bold rounded-xl px-2 py-1.5 text-sm border-2 border-white/30 focus:outline-none focus:border-white/70 disabled:opacity-60 appearance-auto">
                    {/* 저장된 유닛이 목록에 없는 예외(방금 삭제됨 등)에도 셀렉트가 빈 값이 되지 않게 */}
                    {!unitNames.includes(unitName) && <option value={unitName}>{unitName}</option>}
                    {unitNames.map((u) => <option key={u} value={u} className="text-gray-800">{u}</option>)}
                  </select>
                  {unitSwitching && <span className="text-xs">⏳</span>}
                </label>
              ) : (
                <span>유닛: {unitName}</span>
              )}
            </div>
          )}
          {unitSwitchError && (
            <p className="text-xs font-bold text-yellow-200 mt-1">⚠️ {unitSwitchError}</p>
          )}
          {hasTodaysHomework && (
            <p className="text-xs font-bold text-yellow-200 mt-2">📌 오늘의 숙제 단어가 준비돼 있어요 — 단어 공부에서 바로 시작!</p>
          )}
          <div className="flex justify-center gap-4 mt-3">
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-white font-black text-xl">{cleared.length}</p>
              <p className="text-purple-200 text-xs">단어 클리어</p>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-white font-black text-xl">{stickerTypes.length}</p>
              <p className="text-purple-200 text-xs">스티커</p>
            </div>
            <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
              <p className="text-white font-black text-xl">{activeMissions.length}</p>
              <p className="text-purple-200 text-xs">레벨업 미션</p>
            </div>
          </div>
          {/* Paul Rank — 텍스트/숫자만(모자 그래픽 없음, DESIGN DIRECTION은
              PAUL_BIBLE.md §8 참고). totalStars와 무관한 별도 원장(XP)에서
              계산 — 별을 XP로 변환하지 않는다는 판단, paulRankShared.js 참고. */}
          {gamificationEnabled && !rankLoading && (
            <p className="text-purple-100 text-xs mt-3">
              🎩 {rankState.rank.name} · {rankState.hatStage.name} 단계
              {rankState.isMaxRank
                ? ' · 최고 단계!'
                : ` · 다음 Rank까지 XP ${rankState.xpRemainingToNextRank}`}
            </p>
          )}
          {/* Word King(2026-07-19) — "이번 주 챔피언" 최소 텍스트(교실
              발표용). 계산 기록이 아직 없으면(관리자 미실행) 아무것도
              렌더하지 않음. */}
          {gamificationEnabled && weeklyChampion && (
            <p className="text-purple-100 text-xs mt-1">
              👑 이번 주 챔피언: {weeklyChampion.studentName}
              {weeklyChampion.studentId === studentId ? ' (나예요!)' : ''}
            </p>
          )}
          {/* House System(2026-07-19, 게임화 하위카드 8번) — 최소 텍스트.
              개인/타 하우스 비교 없이 "우리 팀" 소속감만 전달
              (PAUL_PRINCIPLES.md 3번 원칙). */}
          {gamificationEnabled && myHouse && houseWeeklyScore != null && (
            <p className="text-purple-100 text-xs mt-1">
              {myHouse.emoji} 우리 하우스: {myHouse.name} · 이번 주 팀 점수 {houseWeeklyScore}
            </p>
          )}
          {/* Seasonal Progression(2026-07-19, 게임화 하위카드 9번) — 시즌이
              실제로 시작된 뒤에만 나타나는 추가 텍스트. 레벨/뱃지/스트릭은
              이 화면 어디에도 "리셋"이라는 개념으로 노출되지 않는다(영구
              유지 — 이 라운드에서 절대 안 바뀜을 지키는 설계). */}
          {gamificationEnabled && myHouse && currentSeason && houseSeasonScore != null && (
            <p className="text-purple-100 text-xs mt-1">
              🌱 이번 시즌 누적 점수 {houseSeasonScore}
            </p>
          )}
        </div>

        {/* 입실시험이 시작되면 다른 무엇보다 먼저 보여야 하는 배너 */}
        <EntranceTestBanner studentId={studentId} onGo={onGo} />

        <RecommendationBanner studentData={studentData} classWords={classWords} onGo={onGo} onResumeWord={onResumeWord} onPlayGame={onPlayGame} resumeIndex={resumeIndex} onStartGuided={onStartGuided} />

        <MicPrimeBtn />

        {/* 반 삭제 경고 배너 */}
        {classDeleted && (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-4 text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <p className="font-black text-orange-700">등록된 반이 없어요</p>
            <p className="text-sm text-orange-500 mt-1">
              &ldquo;{className}&rdquo; 반이 삭제되었습니다.<br/>
              선생님께 문의해주세요.
            </p>
          </div>
        )}

        {/* Daily Mission — repeats all day, each round pops a gift automatically */}
        <div className="bg-white rounded-3xl card-shadow p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🎯</span>
            <h2 className="font-black text-gray-800 text-lg">오늘의 미션</h2>
            {liveMissionsCompleted > 0 && (
              <span className={`ml-auto font-black text-xs px-3 py-1 rounded-full ${liveMissionsCompleted >= 4 ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-700'}`}>
                오늘 미션 {liveMissionsCompleted}/4 완료{liveMissionsCompleted >= 4 ? '! 🎉' : ''}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <MissionBar label="단어 5개 보기"       current={dailyProgress.words}          goal={GOAL} emoji="📖" />
            <MissionBar label="예문 5번 듣기"       current={dailyProgress.examples}        goal={GOAL} emoji="🔊" />
            <MissionBar label="퀴즈 5개 풀기"       current={dailyProgress.quizzes}         goal={GOAL} emoji="🎮" />
            <MissionBar label="발음 5개 성공하기"   current={dailyProgress.pronunciations}  goal={GOAL} emoji="🎤" />
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">4개를 모두 완료하면 🎁 선물상자! 완료 즉시 새 미션이 또 시작돼요</p>
        </div>

        {/* Ticket Economy(2026-07-19) — Teacher Controls 마스터 스위치로
            게이팅(Paul Rank와 동일한 gamificationEnabled 변수 재사용).
            스위치 꺼진 반은 티켓 UI/지급 전부 안 보임(useStudent.js의
            grantTicket 자체는 계속 호출되지만, 노출만 막는 게이트라는
            점도 Paul Rank의 기존 판단(handoff.md 2026-07-19(6차))과 동일). */}
        {gamificationEnabled && (
          <TicketShopCard ticketBalance={ticketBalance} ownedStickerIds={stickerTypes} onRedeem={redeemTicketReward} />
        )}

        {/* Nav Grid */}
        <div className="grid grid-cols-2 gap-3">
          <NavBtn emoji="📖" label="단어 공부"    sub="100개 단어"                          color="from-blue-400 to-blue-600"     onClick={() => onGo('wordBrowser')} />
          <NavBtn emoji="🎮" label="퀴즈"          sub="단어 맞히기"                         color="from-yellow-400 to-orange-500" onClick={() => onGo('quiz')} />
          <NavBtn
            emoji="⚔️" label="레벨업 미션"
            sub={activeMissions.length > 0 ? `${activeMissions.length}개 도전 중!` : '없음'}
            color="from-red-400 to-rose-600"
            onClick={() => onGo('levelUpMission')}
            badge={activeMissions.length > 0 ? activeMissions.length : null}
          />
          <NavBtn emoji="📔" label="내 다이어리" sub={`스티커 ${stickerTypes.length}개`}    color="from-pink-400 to-purple-500"    onClick={() => onGo('diary')} />
          <NavBtn emoji="📅" label="공부 캘린더" sub={`🔥 ${streak}일 연속`}                color="from-amber-400 to-orange-500"   onClick={() => onGo('studyCalendar')} />
          <NavBtn emoji="🎮" label="미니 게임"    sub="풍선/낚시/피자/기차 중 랜덤"          color="from-sky-400 to-indigo-500"    onClick={onPlayGame} />
        </div>

        {/* Recent stickers */}
        {recentStickers.length > 0 && (
          <div className="bg-white rounded-3xl card-shadow p-4">
            <p className="text-sm font-black text-gray-600 mb-3">🎀 최근 모은 스티커</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {recentStickers.map((s, i) => (
                <div key={i} className="flex-shrink-0 text-center">
                  <div className="text-3xl mb-1">{s.emoji}</div>
                  <p className="text-xs text-gray-500 font-bold">{s.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Ticket Economy 최소 상점(2026-07-19) — 큰 UI 리디자인 없이 기존 카드
// (오늘의 미션/최근 스티커)와 같은 스타일만 재사용. 확률형 요소 없음 —
// 카탈로그(REWARD_CATALOG)가 정한 고정 가격을 그대로 보여주고, 구매 버튼
// 하나가 redeemTicketReward(순수 함수 결과를 그대로 반영)를 부른다.
function TicketShopCard({ ticketBalance, ownedStickerIds, onRedeem }) {
  const [message, setMessage] = useState('')

  const handleBuy = (rewardId) => {
    const outcome = onRedeem(rewardId)
    if (outcome.ok) setMessage(`${outcome.reward.label} 획득! 🎉`)
    else if (outcome.reason === 'already-owned') setMessage('이미 가지고 있는 스티커예요!')
    else if (outcome.reason === 'insufficient-balance') setMessage('티켓이 부족해요 — 오늘의 미션을 완료해보세요!')
  }

  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🎫</span>
        <h2 className="font-black text-gray-800 text-lg">티켓 상점</h2>
        <span className="ml-auto font-black text-sm bg-cyan-100 text-cyan-700 px-3 py-1 rounded-full">🎫 {ticketBalance}장</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {REWARD_CATALOG.map((reward) => {
          const owned = ownedStickerIds.includes(reward.stickerId)
          const canAfford = ticketBalance >= reward.cost
          const sticker = stickerById(reward.stickerId)
          return (
            <button
              key={reward.id}
              disabled={owned || !canAfford}
              onClick={() => handleBuy(reward.id)}
              className={`rounded-2xl p-3 text-center border-2 btn-press ${
                owned ? 'bg-green-50 border-green-200' : canAfford ? 'bg-cyan-50 border-cyan-200 hover:opacity-90' : 'bg-gray-50 border-gray-200 opacity-60'
              }`}
            >
              <div className="text-3xl mb-1">{sticker?.emoji || '🎁'}</div>
              <p className="text-xs font-black text-gray-700">{reward.label}</p>
              <p className={`text-xs font-bold mt-1 ${owned ? 'text-green-600' : 'text-cyan-600'}`}>
                {owned ? '보유중 ✅' : `🎫 ${reward.cost}장`}
              </p>
            </button>
          )
        })}
      </div>
      {message && <p className="text-center text-xs text-gray-500 mt-3">{message}</p>}
      <p className="text-center text-xs text-gray-400 mt-2">오늘의 미션(4/4)을 완료할 때마다 티켓 1장이 쌓여요</p>
    </div>
  )
}

function NavBtn({ emoji, label, sub, color, onClick, badge }) {
  return (
    <button onClick={onClick} className={`relative bg-gradient-to-br ${color} text-white rounded-3xl p-5 text-left btn-press card-shadow hover:opacity-90 transition-all`}>
      {badge && (
        <span className="absolute top-3 right-3 bg-white text-red-500 font-black rounded-full w-6 h-6 flex items-center justify-center text-xs">{badge}</span>
      )}
      <div className="text-3xl mb-2">{emoji}</div>
      <p className="font-black text-base leading-tight">{label}</p>
      <p className="text-white/70 text-xs mt-0.5">{sub}</p>
    </button>
  )
}
