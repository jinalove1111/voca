import { useState, useRef, useEffect, useMemo } from 'react'
import { getClassNames, getStudentsInClass } from '../utils/wordLibrary'
import { fetchPinStatuses, fetchPinStatusMap } from '../utils/pinStatusApi'
import { getReactionById } from '../utils/paulReactions'
import HeroReaction from './HeroReaction'

// P0 identity 리팩터링 + 운영자 지시(2026-07-15) — 로그인 방식을 "이름
// 자유 입력"(동명이인이면 조용히 아무 것도 안 되던 방식)에서 "이름 + PIN
// (4자리)"으로 교체했다. student_id(UUID)가 여전히 유일한 데이터
// 식별자라는 점은 그대로다 — PIN은 그 id 계정에 접근하는 로그인 수단일
// 뿐이다. 이름이 같아도(동명이인) PIN이 다르면 서로 다른 student_id로
// 로그인된다 — 서버(api/verify-student-pin.js)가 이름으로 후보를 찾고
// PIN으로 정확히 하나를 골라낸다(클라이언트는 PIN 해시를 절대 보지
// 않음).
//
// 2026-08-06 P0 — 자기등록("처음이에요") 탭 제거. 중복 계정 사고(로그인
// 실패 시 학생이 재등록해 동일 이름 계정 다수 생성 — 3개 시점 클러스터:
// 7/15-16 PIN 도입기, 7/20-22 교재 마이그레이션기, 8/4-5 학생 캐시 1000행
// 잘림기)의 생성 경로 차단. 신규 학생 등록은 관리자 화면 학생 추가(서버
// create_student 액션, 관리자 PIN 인가)로만 가능 — 로그인 과정에서는 새
// 학생을 만들지 않는다.
export default function StudentSelect({ onSelect, onAdmin, onParent, removedNotice, legacyNotice }) {
  const [mode, setMode] = useState('login') // 'login' | 'setup'

  // ── 로그인(기존 학생) ──────────────────────────────────────────────────
  const [loginName, setLoginName] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const loginPinRef = useRef(null)

  const handleLogin = async () => {
    const name = loginName.trim()
    if (!name) { setLoginError('이름을 입력해주세요!'); return }
    if (!/^\d{4}$/.test(loginPin)) { setLoginError('PIN은 숫자 4자리예요.'); return }
    setLoggingIn(true)
    setLoginError('')
    try {
      const res = await fetch('/api/verify-student-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin: loginPin }),
      })
      const data = await res.json()
      if (data.ok) {
        await onSelect({ id: data.studentId, name: data.name, className: data.className, unitName: data.unitName })
        return
      }
      const MESSAGES = {
        not_found: '등록된 학생을 찾을 수 없어요. 이름 철자를 확인해주세요.',
        invalid_format: 'PIN은 숫자 4자리예요.',
        wrong_pin: 'PIN 번호가 맞지 않아요.',
        locked: 'PIN을 여러 번 틀려서 잠시 로그인할 수 없어요. 5분 후 다시 시도해주세요.',
        no_pin_setup: '선생님의 승인이 필요합니다. 승인을 받았다면 위 "PIN 만들기" 탭에서 PIN을 만들 수 있어요.',
        duplicate_accounts: '계정 확인이 필요해요. 선생님께 문의해주세요.',
      }
      setLoginError(MESSAGES[data.reason] || '로그인에 실패했어요. 다시 시도해주세요.')
    } catch (err) {
      console.warn('[StudentSelect] 로그인 네트워크 오류:', err)
      setLoginError('인터넷 연결을 확인해주세요.')
    } finally {
      setLoggingIn(false)
    }
  }

  const classNames = getClassNames()

  // ── PIN 만들기(2026-07-16, 운영자 지시 — 관리자가 학생 등록 후 "설정
  // 허용"을 누른 학생만 자기 PIN을 1회 직접 만들 수 있는 플로우) ──────────
  // 이름을 자유 입력하지 않고 "반 선택 → 이름 선택"으로 정확히 한 학생을
  // 고른다 — PIN이 아직 없는 학생을 자유 이름 입력+PIN 로그인으로는 애초에
  // 식별할 수 없기 때문(로그인은 PIN이 있어야 성립). 반/학생 목록은 이미
  // 앱 전체가 로그인 전에도 들고 있는 캐시(getClassNames/
  // getStudentsInClass, initWordLibrary가 항상 먼저 불러옴)라 새로 노출되는
  // 정보는 없다 — PIN 상태(허용 여부/이미 설정됐는지)는 항상 서버(api/
  // student-pin-status.js)에서 실제로 조회해서 판단한다(더미/캐시값 절대
  // 사용 안 함) — 반 선택 시 목록 전체 배지용으로 1번 배치 조회, 학생
  // 선택 시 그 학생만 다시 1번 더 조회(둘 다 실제 DB 기준).
  //
  // 2026-07-16 실사용 버그 수정: pickSetupStudent가 비동기 fetch 응답을
  // "지금 선택된 학생"인지 확인 안 하고 그대로 반영해서, 학생을 빠르게
  // 연달아 선택하면(또는 네트워크 지연으로 응답 순서가 뒤바뀌면) 이전에
  // 선택했던(그리고 PIN이 있었던) 학생의 응답이 나중에 도착해 지금 선택된
  // (PIN 없는) 학생 화면에 "이미 설정됨"으로 잘못 덮어써지는 레이스
  // 컨디션이 있었다 — setupRequestIdRef로 "이 요청이 아직도 최신 선택에
  // 해당하는지" 확인한 뒤에만 상태를 반영하도록 수정.
  const [setupClass, setSetupClass] = useState('')
  const [setupStudentId, setSetupStudentId] = useState('')
  const [setupStatus, setSetupStatus] = useState(null) // { hasPinHash, pinSetupAllowed } | null(조회 전/조회 중)
  const [setupChecking, setSetupChecking] = useState(false)
  const [setupPin, setSetupPin] = useState('')
  const [setupPinConfirm, setSetupPinConfirm] = useState('')
  const [setupError, setSetupError] = useState('')
  const [settingUp, setSettingUp] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  // 반 선택 시 그 반 학생 전원의 PIN 상태를 한 번에 배치 조회(목록 배지용
  // — 학생 수만큼 개별 요청하지 않음). id -> {hasPinHash,pinSetupAllowed,locked}.
  const [setupRosterStatus, setSetupRosterStatus] = useState({})
  const [setupRosterStatusLoading, setSetupRosterStatusLoading] = useState(false)
  const setupPinConfirmRef = useRef(null)
  const setupRequestIdRef = useRef(0) // 마지막으로 시작된 "학생 선택" 요청 번호 — 응답이 여전히 최신 선택에 대한 것인지 확인용
  const setupRoster = setupClass ? getStudentsInClass(setupClass) : []
  const setupPicked = setupRoster.find(s => s.id === setupStudentId) || null

  // 2026-08-06 운영자 지시(최초) — 같은 반에 이름이 같은(정규화 기준)
  // 학생이 2명 이상이면(중복 계정 생성 사고 산출물일 가능성) 학생 스스로
  // 어느 계정이 자기 것인지 구분할 방법이 없으므로 PIN 설정을 차단하고
  // 관리자 정리를 유도한다. 다른 반의 동명이인은 로스터가 다르므로 영향
  // 없음.
  //
  // 2026-08-06 정밀화(같은 날 후속 운영자 지시) — 라이브 실측: 같은 반
  // 동명 그룹 23개의 전원이 이미 PIN을 보유(hasPinHash true)한 상태였다.
  // 위 "이름만 겹치면 차단" 기준은 PIN 보유 여부와 무관하게 걸려, "이미
  // 설정됨 → 로그인 탭 이용" 안내를 받아야 할 학생 전원이 "관리자에게
  // 문의" 차단 문구에 막혔다(현재 로그인 중인 학생조차 자기 이름을 못
  // 찾는 것처럼 보이는 원인). 차단은 "진짜 모호한 경우"에만 걸어야 한다
  // — 선택한 학생이 아직 PIN이 없고, 같은 반 동명 그룹 중 PIN 미보유가
  // 2명 이상일 때만(그래야 "어느 계정인지 고를 수 없음"이 실제로 성립).
  // PIN을 이미 가진 동명 학생은 애초에 로그인 탭에서 이름+PIN으로 정확히
  // 식별되므로 모호하지 않다. 서버(api/self-set-student-pin.js)가 항상
  // 최종 방어(pin_hash IS NULL + pin_setup_allowed) — 여기 클라이언트
  // 차단은 UX 안내일 뿐 보안 경계가 아니다.
  const normalizeName = (n) => (n || '').trim().toLowerCase().normalize('NFC')
  const dupNamesInRoster = useMemo(() => {
    const counts = new Map()
    for (const s of setupRoster) {
      const key = normalizeName(s.name)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const dups = new Set()
    for (const [key, count] of counts) { if (count >= 2) dups.add(key) }
    return dups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupClass, setupRoster.length])
  // 동명 그룹 중 "PIN 미보유" 인원이 2명 이상인 이름만 — setupRosterStatus
  // (반 선택 시 배치 조회, 아래 useEffect)가 로딩 전이면 해당 학생 항목이
  // 없어 카운트에서 자연스럽게 빠진다(과소평가만 가능, 절대 과다 차단
  // 아님).
  const pinlessDupNames = useMemo(() => {
    const counts = new Map()
    for (const s of setupRoster) {
      const key = normalizeName(s.name)
      if (!dupNamesInRoster.has(key)) continue
      const rs = setupRosterStatus[s.id]
      if (rs && rs.hasPinHash === false) counts.set(key, (counts.get(key) || 0) + 1)
    }
    const set = new Set()
    for (const [key, count] of counts) { if (count >= 2) set.add(key) }
    return set
  }, [setupRoster, setupRosterStatus, dupNamesInRoster])
  // 선택된 학생 본인의 로스터 상태가 아직 로딩 전(해당 id 키 없음)이면
  // 차단 판정을 보류 — 기존 정상 분기(허용 대기/PIN 생성 폼)로 진행하고
  // 서버(self-set-student-pin)가 최종 방어한다.
  const setupPickedStatusLoaded = !!(setupPicked && setupRosterStatus[setupPicked.id] !== undefined)
  const setupPickedIsDup = !!(
    setupPicked &&
    setupPickedStatusLoaded &&
    pinlessDupNames.has(normalizeName(setupPicked.name))
  )

  // 반을 고르면 그 반 학생 전원의 PIN 상태를 배치로 실제 DB에서 조회 —
  // 목록에 배지(🟢 PIN 완료 / 🔴 PIN 없음)를 보여주기 위함.
  useEffect(() => {
    if (!setupClass) { setSetupRosterStatus({}); return }
    const roster = getStudentsInClass(setupClass)
    if (roster.length === 0) { setSetupRosterStatus({}); return }
    let cancelled = false
    setSetupRosterStatusLoading(true)
    fetchPinStatusMap(roster.map(s => s.id))
      .then(map => { if (!cancelled) setSetupRosterStatus(map) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSetupRosterStatusLoading(false) })
    return () => { cancelled = true }
  }, [setupClass])

  const pickSetupStudent = async (id) => {
    const requestId = ++setupRequestIdRef.current // 이 픽의 고유 번호 — 응답 도착 시 아직 최신 선택인지 확인
    setSetupStudentId(id)
    setSetupStatus(null)
    setSetupError('')
    setSetupDone(false)
    setSetupPin(''); setSetupPinConfirm('')
    // 2026-08-06 정밀화 — 예전엔 동명 중복이면 여기서 서버 조회 자체를
    // 생략했다(위 dupNamesInRoster만으로 차단 판정). 지금은 "PIN 보유
    // 여부"가 차단 판정에 필요하므로(pinlessDupNames 정의 참고) 동명
    // 여부와 무관하게 항상 이 학생의 실제 상태를 조회한다 — 렌더 쪽의
    // setupPickedIsDup(정밀화된 기준)가 이 setupStatus와 pinlessDupNames를
    // 함께 봐서 최종 분기를 정한다.
    setSetupChecking(true)
    try {
      // 매번 학생을 선택할 때마다 실제 DB를 다시 조회한다(배치 조회 결과를
      // 재사용하지 않음) — 반 목록을 불러온 이후 관리자가 방금 "설정
      // 허용"을 눌렀거나 다른 기기에서 이미 PIN을 설정했을 수 있으므로,
      // 항상 최신 상태를 확인해야 안전하다.
      const results = await fetchPinStatuses([id])
      const status = results[0]
      if (!status) throw new Error('조회에 실패했어요.')
      // 이 응답이 도착한 시점에 사용자가 이미 다른 학생을 선택했다면(더
      // 최신 요청이 시작됐다면) 이 응답은 버린다 — 화면에 반영하면 방금
      // 고친 레이스 컨디션 버그가 재발한다.
      if (setupRequestIdRef.current !== requestId) return
      setSetupStatus(status)
    } catch (err) {
      if (setupRequestIdRef.current !== requestId) return
      setSetupError('상태를 확인하는 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      if (setupRequestIdRef.current === requestId) setSetupChecking(false)
    }
  }

  const handleSetupPin = async () => {
    if (!/^\d{4}$/.test(setupPin)) { setSetupError('PIN은 숫자 4자리로 만들어주세요.'); return }
    if (setupPin !== setupPinConfirm) { setSetupError('PIN이 서로 달라요. 다시 확인해주세요.'); return }
    setSettingUp(true)
    setSetupError('')
    try {
      const res = await fetch('/api/self-set-student-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: setupStudentId, pin: setupPin, pinConfirm: setupPinConfirm }),
      })
      const data = await res.json()
      if (data.ok) {
        setSetupDone(true)
        // 방금 PIN을 설정했으니 그 학생의 목록 배지(🔴 PIN 없음)도 즉시
        // 🟢로 갱신 — 다시 반을 고르지 않아도 최신 상태로 보이게.
        setSetupRosterStatus(prev => ({ ...prev, [setupStudentId]: { ...(prev[setupStudentId] || {}), hasPinHash: true, pinSetupAllowed: false } }))
        return
      }
      const MESSAGES = {
        invalid_format: 'PIN은 숫자 4자리예요.',
        mismatch: 'PIN이 서로 달라요. 다시 확인해주세요.',
        weak_pin: '너무 쉬운 PIN이에요(0000, 1234 같은 값). 다른 숫자로 만들어주세요.',
        already_set: '이미 PIN이 설정된 계정이에요 — "로그인" 탭을 이용해주세요.',
        not_allowed: '선생님이 아직 PIN 설정을 허용하지 않았어요. 선생님께 요청해주세요.',
        not_found: '학생 정보를 찾을 수 없어요. 다시 선택해주세요.',
      }
      setSetupError(MESSAGES[data.reason] || 'PIN 설정에 실패했어요. 다시 시도해주세요.')
    } catch (err) {
      setSetupError('PIN 설정 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setSettingUp(false)
    }
  }

  const handleSetupStart = () => {
    if (!setupPicked) return
    onSelect({ id: setupPicked.id, name: setupPicked.name, className: setupClass, unitName: setupPicked.unitName })
  }

  // PIN 설정 성공 축하 문구를 잠깐 보여준 뒤 자동으로 진입 — "바로
  // 시작하기!" 버튼을 또 눌러야 하는 순수 추가 탭 제거(버튼은 자동 진입이
  // 실패하거나 사용자가 더 빨리 넘어가고 싶을 때를 위한 폴백으로 유지).
  useEffect(() => {
    if (!setupDone) return
    const timer = setTimeout(() => { handleSetupStart() }, 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupDone])

  const busy = loggingIn || settingUp
  const tabBtn = (key, label, sub) => (
    <button onClick={() => { setMode(key); setLoginError(''); setSetupError('') }} disabled={busy}
      className={`flex-1 py-2 rounded-xl font-black text-xs sm:text-sm btn-press transition-colors disabled:opacity-50 ${
        mode === key ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-400'}`}>
      {label}
      {sub && <div className={`text-[10px] font-normal mt-0.5 ${mode === key ? 'text-purple-100' : 'text-purple-300'}`}>{sub}</div>}
    </button>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="text-center mb-8 animate-fade-in min-w-0 max-w-full px-2">
        <img src={`${import.meta.env.BASE_URL}image/KakaoTalk_20260620_210208708.png`} alt="Paul Easy Voca" className="mx-auto mb-3 w-[180px] sm:w-[250px] h-auto rounded-[20px] shadow-lg object-cover" />
        <HeroReaction image={getReactionById('brand')?.image} size="sm" />
        <h1 className="text-3xl sm:text-4xl font-black text-purple-700 mt-1">Paul Easy Voca</h1>
        <p className="text-purple-400 font-medium mt-1">이름과 PIN을 입력하고 시작해요 ✨</p>
      </div>

      <div className="w-[calc(100vw-2rem)] max-w-sm min-w-0 bg-white rounded-3xl card-shadow p-6 animate-slide-up space-y-3">
        {removedNotice && (
          <p className="bg-blue-50 border-2 border-blue-200 text-blue-500 text-xs font-bold text-center rounded-xl p-3">
            로그인이 풀렸어요 — 이름과 PIN으로 다시 로그인해주세요.
          </p>
        )}
        {!removedNotice && legacyNotice && (
          <p className="bg-blue-50 border-2 border-blue-200 text-blue-500 text-xs font-bold text-center rounded-xl p-3">
            🔄 로그인 방식이 새로워졌어요 — 이름과 PIN으로 다시 로그인해주세요.
          </p>
        )}

        <div className="flex gap-2">
          {tabBtn('login', '로그인')}
          {tabBtn('setup', 'PIN 만들기', '선생님이 허용해준 경우')}
        </div>

        {mode === 'setup' ? (
          <>
            <p className="bg-purple-50 border-2 border-purple-100 text-purple-500 text-[11px] font-bold rounded-xl p-2.5 text-center">
              이 기능은 선생님이 이미 등록한 학생이 처음 PIN을 설정할 때만 사용해요.
              교과서 변경에는 사용하지 않아요 — 교과서는 로그인 후 홈 화면에서 바꿀 수 있어요.
              교과서명이 아니라 학생이 등록된 반을 선택하세요.
              여러 교과서를 배정받은 학생도 이 목록에는 소속 반 아래에만 나타나요.
            </p>
            {/* 2026-08-07 운영자 지시 — 이 select는 students.class_id(소속 반) 기준
                조회로 로직은 항상 올바랐으나, 라벨이 없어 "교과서 선택"으로 오해되는
                사례가 있었다. 라벨/배지로 "소속 반" 의미를 명확히 한다(표시 전용). */}
            <label htmlFor="setup-class-select" className="block text-xs font-black text-purple-600 px-1">학생이 소속된 반 선택</label>
            <select id="setup-class-select" value={setupClass} disabled={settingUp} onChange={e => {
                setSetupClass(e.target.value); setSetupStudentId(''); setSetupStatus(null); setSetupError(''); setSetupDone(false)
              }}
              className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-500 bg-white disabled:opacity-50">
              <option value="">반 선택</option>
              {/* option 태그 안에는 스타일 요소를 넣을 수 없어 텍스트로 "[반]" 접두 —
                  교과서명과 혼동되지 않게 하기 위함(2026-08-07 운영자 지시). */}
              {classNames.map(c => <option key={c} value={c}>{'[반] ' + c}</option>)}
            </select>

            {setupClass && (
              setupRoster.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">학생 계정이 없습니다. 선생님께 문의하세요.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {setupRosterStatusLoading && <p className="text-xs text-gray-400 w-full text-center">⏳ 학생별 PIN 상태 확인 중...</p>}
                  {setupRoster.map(s => {
                    // 목록 배지는 반 선택 시 배치 조회한 setupRosterStatus 기준(학생 수만큼
                    // 개별 요청 안 함) — 아직 로딩 전이면 배지 없이 이름만 표시.
                    const rs = setupRosterStatus[s.id]
                    // 2026-08-06 정밀화 — 배지도 "PIN 미보유 동명 2+"
                    // 기준으로만 표시(PIN을 이미 가진 동명 학생은 로그인
                    // 탭에서 정확히 식별되므로 경고 대상이 아님).
                    const isDup = pinlessDupNames.has(normalizeName(s.name))
                    return (
                      <button key={s.id} onClick={() => pickSetupStudent(s.id)} disabled={settingUp}
                        className={`px-3 py-2 rounded-xl text-sm font-bold btn-press disabled:opacity-50 text-left ${
                          setupStudentId === s.id ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-600'}`}>
                        {rs && (
                          <div className={`text-[10px] font-black ${setupStudentId === s.id ? 'text-white' : rs.hasPinHash ? 'text-green-600' : 'text-red-500'}`}>
                            {rs.hasPinHash ? '🟢 PIN 완료' : '🔴 PIN 없음'}
                          </div>
                        )}
                        {/* 2026-08-07 운영자 지시로 유닛 표기 제거 — 교과서/Unit 정보가
                            여기 보이면 "이 목록이 교과서 목록"이라는 오해를 강화한다.
                            동명이인 구분은 PIN 배지·중복 차단 가드(pinlessDupNames)가 담당. */}
                        <div>{isDup && '⚠️ '}{s.name}</div>
                      </button>
                    )
                  })}
                </div>
              )
            )}

            {setupClass && setupRoster.length > 0 && !setupPicked && !setupChecking && (
              <p className="text-xs text-gray-400 text-center py-1">학생을 선택해주세요.</p>
            )}

            {/* 2026-08-06 정밀화 — 차단은 "어느 계정인지 고를 수 없는 진짜
                모호성"(PIN 미보유 동명 2+)에만 건다. PIN을 이미 보유한
                계정은(동명 여부 무관) 항상 "로그인 탭 이용" 안내가 정답이고
                (setupStatus.hasPinHash가 최우선), PIN 미보유가 1명뿐이면 그
                계정이 유일 후보라 모호성이 없다. 서버(self-set-student-pin)
                가 항상 최종 방어(pin_hash IS NULL + pin_setup_allowed). */}
            {setupChecking && <p className="text-xs text-gray-400 text-center">⏳ 확인하는 중...</p>}

            {setupPicked && setupStatus && !setupChecking && (
              setupDone ? (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 space-y-2">
                  <p className="text-sm font-bold text-green-700 text-center">🎉 PIN이 만들어졌어요!<br />다음부터 "로그인" 탭에서 이름과 PIN으로 시작하세요.</p>
                  <button onClick={handleSetupStart}
                    className="w-full bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600">
                    바로 시작하기!
                  </button>
                </div>
              ) : setupStatus.hasPinHash ? (
                <p className="bg-blue-50 border-2 border-blue-200 text-blue-600 text-xs font-bold text-center rounded-xl p-3">
                  이미 PIN이 설정되어 있습니다. "로그인" 탭에서 이름과 PIN으로 로그인하세요.
                </p>
              ) : setupPickedIsDup ? (
                <p className="bg-yellow-50 border-2 border-yellow-200 text-yellow-700 text-xs font-bold text-center rounded-xl p-3" role="alert">
                  ⚠️ 중복 계정이 확인되었습니다. 관리자(선생님)에게 문의하세요.
                </p>
              ) : !setupStatus.pinSetupAllowed ? (
                <p className="bg-yellow-50 border-2 border-yellow-200 text-yellow-700 text-xs font-bold text-center rounded-xl p-3">
                  아직 PIN 설정이 허용되지 않았어요 — 선생님께 요청해주세요.
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-500 text-center">이 학생은 아직 PIN이 없습니다. 아래에서 4자리 PIN을 만들어주세요.</p>
                  <input type="password" inputMode="numeric" pattern="[0-9]*" value={setupPin}
                    onChange={e => { setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setSetupError('') }}
                    onKeyDown={e => e.key === 'Enter' && setupPinConfirmRef.current?.focus()}
                    placeholder="사용할 PIN 4자리 만들기" disabled={settingUp}
                    className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold text-center tracking-[0.5em] focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:bg-gray-50" />
                  <input ref={setupPinConfirmRef} type="password" inputMode="numeric" pattern="[0-9]*" value={setupPinConfirm}
                    onChange={e => { setSetupPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setSetupError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleSetupPin()}
                    placeholder="PIN 다시 입력" disabled={settingUp}
                    className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold text-center tracking-[0.5em] focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:bg-gray-50" />
                  <p className="text-[11px] text-purple-400 px-1">PIN은 다음에 로그인할 때 필요해요. 잊지 않게 잘 기억해두세요!</p>
                  {setupError && <p className="text-red-500 text-xs text-center" role="alert">{setupError}</p>}
                  <button onClick={handleSetupPin} disabled={settingUp}
                    className="w-full bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600 disabled:opacity-50">
                    {settingUp ? '⏳ 만드는 중...' : 'PIN 만들기'}
                  </button>
                </>
              )
            )}
            {setupError && !setupChecking && (!setupPicked || !setupStatus) && (
              <p className="text-red-500 text-xs text-center" role="alert">{setupError}</p>
            )}
          </>
        ) : (
          <>
            <input type="text" value={loginName} onChange={e => { setLoginName(e.target.value); setLoginError('') }}
              onKeyDown={e => e.key === 'Enter' && loginPinRef.current?.focus()}
              placeholder="이름 입력..." maxLength={10} disabled={loggingIn}
              className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:bg-gray-50"
              autoFocus />
            <input ref={loginPinRef} type="password" inputMode="numeric" pattern="[0-9]*" value={loginPin}
              onChange={e => { setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setLoginError('') }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="PIN 4자리" disabled={loggingIn}
              className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold text-center tracking-[0.5em] focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:bg-gray-50" />
            {loginError && <p className="text-rose-500 text-xs text-center" role="alert">{loginError}</p>}
            <button onClick={handleLogin} disabled={loggingIn}
              className="w-full bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600 disabled:opacity-50">
              {loggingIn ? '⏳ 확인하는 중...' : '시작하기!'}
            </button>
            <p className="text-[11px] text-purple-400 px-1 text-center">우리 공부방이 처음이에요? 선생님께 등록을 요청해주세요.</p>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center gap-4">
        {onParent && (
          <button onClick={onParent}
            className="text-gray-400 text-xs font-bold btn-press hover:text-gray-600 transition-colors">
            👨‍👩‍👧 학부모용
          </button>
        )}
        <button onClick={onAdmin}
          className="text-gray-400 text-xs font-bold btn-press hover:text-gray-600 transition-colors">
          ⚙️ 관리자
        </button>
      </div>
    </div>
  )
}
