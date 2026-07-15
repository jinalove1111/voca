import { useState, useRef } from 'react'
import { addStudent } from '../hooks/useStudent'
import { getClassNames, getClassUnitNames, getStudentsInClass } from '../utils/wordLibrary'
import { getReactionById } from '../utils/paulReactions'
import HeroReaction from './HeroReaction'

// P0 identity 리팩터링 + 운영자 지시(2026-07-15) — 로그인 방식을 "이름
// 자유 입력"(동명이인이면 조용히 아무 것도 안 되던 방식)에서 "이름 + PIN
// (4자리)"으로 교체했다. student_id(UUID)가 여전히 유일한 데이터
// 식별자라는 점은 그대로다 — PIN은 그 id 계정에 접근하는 로그인 수단일
// 뿐이다. 이름이 같아도(동명이인) PIN이 다르면 서로 다른 student_id로
// 로그인된다 — 서버(api/verify-student-pin.js)가 이름으로 후보를 찾고
// PIN으로 정확히 하나를 골라낸다(클라이언트는 PIN 해시를 절대 보지
// 않음). 신규 학생 등록은 이름+반+유닛 선택에 PIN 만들기 단계가 추가됐다.
export default function StudentSelect({ onSelect, onAdmin, onParent, removedNotice }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'

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
        not_found: '해당 이름의 학생을 찾을 수 없어요. 처음이면 아래 "처음이에요" 탭에서 등록해주세요.',
        invalid_format: 'PIN은 숫자 4자리예요.',
        wrong_pin: '이름 또는 PIN이 올바르지 않아요.',
        locked: '⚠️ PIN을 여러 번 틀려서 잠시 로그인할 수 없어요. 5분 후 다시 시도하거나 선생님께 문의해주세요.',
        no_pin_setup: '아직 PIN이 설정되지 않은 계정이에요. 선생님(관리자)에게 문의해주세요.',
      }
      setLoginError(MESSAGES[data.reason] || '로그인에 실패했어요. 다시 시도해주세요.')
    } catch (err) {
      setLoginError('로그인 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setLoggingIn(false)
    }
  }

  // ── 등록(신규 학생) ────────────────────────────────────────────────────
  const [regName, setRegName] = useState('')
  const [regClass, setRegClass] = useState('')
  const [regUnit, setRegUnit] = useState('')
  const [regPin, setRegPin] = useState('')
  const [regPinConfirm, setRegPinConfirm] = useState('')
  const [regError, setRegError] = useState('')
  const [registering, setRegistering] = useState(false)
  const classNames = getClassNames()
  const regPinRef = useRef(null)
  const regPinConfirmRef = useRef(null)

  const handleRegister = async () => {
    const name = regName.trim()
    if (!name)            { setRegError('이름을 입력해주세요!'); return }
    if (name.length > 10) { setRegError('이름은 10글자 이하로 해주세요!'); return }
    if (!regClass)         { setRegError('반을 선택해주세요!'); return }
    if (!regUnit)          { setRegError('유닛을 선택해주세요!'); return }
    if (!/^\d{4}$/.test(regPin)) { setRegError('PIN은 숫자 4자리로 만들어주세요.'); return }
    if (regPin !== regPinConfirm) { setRegError('PIN이 서로 달라요. 다시 확인해주세요.'); return }

    setRegistering(true)
    setRegError('')
    try {
      const studentId = await addStudent(name, regClass, regUnit)
      const pinRes = await fetch('/api/set-student-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, pin: regPin }),
      })
      const pinData = await pinRes.json()
      if (!pinData.ok) throw new Error(pinData.error || 'PIN 저장에 실패했어요.')
      await onSelect({ id: studentId, name, className: regClass, unitName: regUnit })
    } catch (err) {
      setRegError('등록 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setRegistering(false)
    }
  }

  // ── PIN 만들기(2026-07-16, 운영자 지시 — 관리자가 학생 등록 후 "설정
  // 허용"을 누른 학생만 자기 PIN을 1회 직접 만들 수 있는 플로우) ──────────
  // 이름을 자유 입력하지 않고 "반 선택 → 이름 선택"으로 정확히 한 학생을
  // 고른다 — PIN이 아직 없는 학생을 자유 이름 입력+PIN 로그인으로는 애초에
  // 식별할 수 없기 때문(로그인은 PIN이 있어야 성립). 반/학생 목록은 이미
  // 앱 전체가 로그인 전에도 들고 있는 캐시(getClassNames/
  // getStudentsInClass, initWordLibrary가 항상 먼저 불러옴)라 새로 노출되는
  // 정보는 없다 — PIN 상태(허용 여부/이미 설정됐는지)만 서버에 확인한다.
  const [setupClass, setSetupClass] = useState('')
  const [setupStudentId, setSetupStudentId] = useState('')
  const [setupStatus, setSetupStatus] = useState(null) // { hasPinHash, pinSetupAllowed } | null(조회 전)
  const [setupChecking, setSetupChecking] = useState(false)
  const [setupPin, setSetupPin] = useState('')
  const [setupPinConfirm, setSetupPinConfirm] = useState('')
  const [setupError, setSetupError] = useState('')
  const [settingUp, setSettingUp] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const setupPinConfirmRef = useRef(null)
  const setupRoster = setupClass ? getStudentsInClass(setupClass) : []
  const setupPicked = setupRoster.find(s => s.id === setupStudentId) || null

  const pickSetupStudent = async (id) => {
    setSetupStudentId(id)
    setSetupStatus(null)
    setSetupError('')
    setSetupDone(false)
    setSetupPin(''); setSetupPinConfirm('')
    setSetupChecking(true)
    try {
      const res = await fetch('/api/student-pin-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: [id] }),
      })
      const data = await res.json()
      const status = data.results?.[0]
      if (!status) throw new Error(data.error || '조회에 실패했어요.')
      setSetupStatus(status)
    } catch (err) {
      setSetupError('상태를 확인하는 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setSetupChecking(false)
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
      if (data.ok) { setSetupDone(true); return }
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

  const busy = loggingIn || registering || settingUp
  const tabBtn = (key, label) => (
    <button onClick={() => { setMode(key); setLoginError(''); setRegError(''); setSetupError('') }} disabled={busy}
      className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm btn-press transition-colors disabled:opacity-50 ${
        mode === key ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-400'}`}>
      {label}
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
          <p className="bg-orange-50 border-2 border-orange-200 text-orange-600 text-xs font-bold text-center rounded-xl p-3">
            ⚠️ 계정 정보를 찾을 수 없어요. 선생님께 문의하거나 다시 시작해주세요.
          </p>
        )}

        <div className="flex gap-2">
          {tabBtn('login', '로그인')}
          {tabBtn('setup', 'PIN 만들기')}
          {tabBtn('register', '처음이에요')}
        </div>

        {mode === 'setup' ? (
          <>
            <select value={setupClass} disabled={settingUp} onChange={e => {
                setSetupClass(e.target.value); setSetupStudentId(''); setSetupStatus(null); setSetupError(''); setSetupDone(false)
              }}
              className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-500 bg-white disabled:opacity-50">
              <option value="">반 선택</option>
              {classNames.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {setupClass && (
              setupRoster.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">이 반에는 아직 등록된 학생이 없어요. 선생님께 등록을 요청해주세요.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {setupRoster.map(s => (
                    <button key={s.id} onClick={() => pickSetupStudent(s.id)} disabled={settingUp}
                      className={`px-3 py-2 rounded-xl text-sm font-bold btn-press disabled:opacity-50 ${
                        setupStudentId === s.id ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-600'}`}>
                      {s.name} <span className="opacity-60 font-normal">· {s.unitName}</span>
                    </button>
                  ))}
                </div>
              )
            )}

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
                  이미 PIN이 설정되어 있어요! "로그인" 탭에서 이름과 PIN으로 시작해주세요.
                </p>
              ) : !setupStatus.pinSetupAllowed ? (
                <p className="bg-yellow-50 border-2 border-yellow-200 text-yellow-700 text-xs font-bold text-center rounded-xl p-3">
                  😊 아직 PIN을 만들 수 없어요. 선생님께 "PIN 설정 허용"을 요청해주세요.
                </p>
              ) : (
                <>
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
                  {setupError && <p className="text-red-500 text-xs text-center" role="alert">⚠️ {setupError}</p>}
                  <button onClick={handleSetupPin} disabled={settingUp}
                    className="w-full bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600 disabled:opacity-50">
                    {settingUp ? '⏳ 만드는 중...' : 'PIN 만들기'}
                  </button>
                </>
              )
            )}
            {setupError && !setupChecking && (!setupPicked || !setupStatus) && (
              <p className="text-red-500 text-xs text-center" role="alert">⚠️ {setupError}</p>
            )}
          </>
        ) : mode === 'login' ? (
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
            {loginError && <p className="text-red-500 text-xs text-center" role="alert">⚠️ {loginError}</p>}
            <button onClick={handleLogin} disabled={loggingIn}
              className="w-full bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600 disabled:opacity-50">
              {loggingIn ? '⏳ 확인하는 중...' : '시작하기!'}
            </button>
          </>
        ) : (
          <>
            <input type="text" value={regName} onChange={e => { setRegName(e.target.value); setRegError('') }}
              onKeyDown={e => e.key === 'Enter' && (regClass ? regPinRef.current?.focus() : setRegError('반을 선택해주세요!'))}
              placeholder="이름 입력..." maxLength={10} disabled={registering}
              className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:bg-gray-50" />
            {classNames.length > 0 && (
              <select value={regClass} disabled={registering} onChange={e => {
                  const nextClass = e.target.value
                  setRegClass(nextClass)
                  setRegUnit(getClassUnitNames(nextClass)[0] || 'Unit 1')
                  setRegError('')
                }}
                className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-500 bg-white disabled:opacity-50">
                <option value="">반 선택</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {regClass && (
              <select value={regUnit} disabled={registering} onChange={e => setRegUnit(e.target.value)}
                className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-500 bg-white disabled:opacity-50">
                <option value="">유닛 선택</option>
                {getClassUnitNames(regClass).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
            <input ref={regPinRef} type="password" inputMode="numeric" pattern="[0-9]*" value={regPin}
              onChange={e => { setRegPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setRegError('') }}
              onKeyDown={e => e.key === 'Enter' && regPinConfirmRef.current?.focus()}
              placeholder="사용할 PIN 4자리 만들기" disabled={registering}
              className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold text-center tracking-[0.5em] focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:bg-gray-50" />
            <input ref={regPinConfirmRef} type="password" inputMode="numeric" pattern="[0-9]*" value={regPinConfirm}
              onChange={e => { setRegPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setRegError('') }}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              placeholder="PIN 다시 입력" disabled={registering}
              className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold text-center tracking-[0.5em] focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 disabled:bg-gray-50" />
            <p className="text-[11px] text-purple-400 px-1">PIN은 다음에 로그인할 때 필요해요. 잊지 않게 잘 기억해두세요!</p>
            {regError && <p className="text-red-500 text-xs text-center" role="alert">⚠️ {regError}</p>}
            <button onClick={handleRegister} disabled={registering}
              className="w-full bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600 disabled:opacity-50">
              {registering ? '⏳ 등록하는 중...' : '등록하고 시작하기!'}
            </button>
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
