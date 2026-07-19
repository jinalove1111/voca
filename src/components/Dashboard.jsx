import { useState, useEffect } from 'react'
import { getStudentClass, getStudentUnit, getClassNames, getClassUnitNames, getTodaysAssignmentWordIds, getClassSettings } from '../utils/wordLibrary'
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
function RecommendationBanner({ studentData, classWords, onGo, onResumeWord, onPlayGame, resumeIndex }) {
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
      desc: `${lastWordIndex + 1}번째 단어부터 이어서 공부해요.`,
      label: '이어서 학습하기', onClick: () => onResumeWord(lastWordIndex),
    }
  } else if (hasWords) {
    rec = {
      emoji: '✨', title: '오늘도 시작해볼까요?',
      desc: '단어 학습부터 차근차근 시작해요!',
      label: '단어 공부 시작', onClick: () => onResumeWord(0),
    }
  } else {
    rec = {
      emoji: '📭', title: '단어가 부족해요',
      desc: '선생님이 단어를 추가하면 학습을 시작할 수 있어요.',
      label: null, onClick: null,
    }
  }

  return (
    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-5 text-white card-shadow">
      <HeroReaction
        image={getReactionById('hello')?.image}
        title={`${rec.emoji} ${rec.title}`}
        message={rec.desc}
        theme="banner"
        size="md"
      />
      {rec.label && (
        <button onClick={rec.onClick}
          className="w-full mt-4 bg-white text-indigo-600 font-black py-3 rounded-2xl btn-press">
          {rec.label} →
        </button>
      )}
    </div>
  )
}

// P0(2026-07-15): student(이름 문자열) 대신 studentId(식별자)+studentName
// (표시용)을 따로 받는다 — getStudentClass/getStudentUnit은 이제 id 기반.
export default function Dashboard({ studentId, studentName, studentData, classWords, onGo, onLogout, onPlayGame, onResumeWord, resumeIndex, onUnitSwitch }) {
  const { stars, stickerTypes, activeMissions, dailyProgress, missionsCompletedToday, streak, cleared } = studentData
  const { rankState, loading: rankLoading } = usePaulRank(studentId)

  const className = getStudentClass(studentId)
  const unitName = getStudentUnit(studentId)
  // Teacher Controls 마스터 스위치(2026-07-19, GAME_DESIGN.md 13번 섹션) —
  // 컬럼이 아직 없거나(SQL 미실행) 관리자가 이 반에서 꺼뒀으면 항상 false
  // (getClassSettings의 안전한 기본값, wordLibrary.js 참고). Paul Rank
  // 표시는 이 값이 true인 반에서만 렌더된다(아래 JSX).
  const gamificationEnabled = !!getClassSettings(className).gamificationEnabled
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
        </div>

        {/* 입실시험이 시작되면 다른 무엇보다 먼저 보여야 하는 배너 */}
        <EntranceTestBanner studentId={studentId} onGo={onGo} />

        <RecommendationBanner studentData={studentData} classWords={classWords} onGo={onGo} onResumeWord={onResumeWord} onPlayGame={onPlayGame} resumeIndex={resumeIndex} />

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
            {missionsCompletedToday > 0 && (
              <span className={`ml-auto font-black text-xs px-3 py-1 rounded-full ${missionsCompletedToday >= 4 ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-700'}`}>
                오늘 미션 {missionsCompletedToday}/4 완료{missionsCompletedToday >= 4 ? '! 🎉' : ''}
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
