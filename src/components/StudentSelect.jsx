import { useState, useEffect } from 'react'
import { addStudent, findStudentByName } from '../hooks/useStudent'
import { getClassNames, getClassUnitNames, getStudentClass, getStudentUnit, setStudentUnit } from '../utils/wordLibrary'
import PaulReaction from './PaulReaction'

// Students only ever see a name/class entry form here — never a roster of
// other students. Typing an EXISTING name logs back in as that student
// (student names are unique in the DB, so a name unambiguously identifies
// one student); a new name registers with the chosen class/unit. Once
// selected, App.jsx caches the name in localStorage so returning to the
// app skips this screen entirely and loads only that student's own data.
//
// ROOT CAUSE of the "unit keeps reverting" bug (reported 3 times): for an
// EXISTING student, this screen used to call onSelect(existing) directly —
// the class/unit <select> elements were still visibly rendered and
// interactive, but handleStart's existing-student branch never looked at
// selectedClass/selectedUnit at all. So a student could pick "Unit5" in the
// dropdown, see it visibly selected, click "시작하기", and the app would
// silently log them in with whatever unit was ALREADY in the DB (e.g.
// Unit4) — the dropdown selection was pure decoration for a returning
// student, never applied anywhere. Fix: once the typed name resolves to an
// existing student, show ONLY a unit dropdown (class stays admin-controlled,
// out of scope for self-service), pre-filled with their CURRENT unit from
// Supabase, and actually call setStudentUnit() before logging in if they
// pick a different one.
export default function StudentSelect({ onSelect, onAdmin, removedNotice }) {
  const [input, setInput]           = useState('')
  const [selectedClass, setClass]   = useState('')
  const [selectedUnit, setUnit]     = useState('')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)
  const classNames                  = getClassNames()

  const trimmedName   = input.trim()
  const existingName   = trimmedName ? findStudentByName(trimmedName) : null
  const isExisting     = !!existingName
  const existingClass  = isExisting ? getStudentClass(existingName) : ''
  const existingUnitOptions = isExisting ? getClassUnitNames(existingClass) : []

  // As soon as the typed name resolves to an existing student, seed the
  // unit dropdown with THEIR current unit (not whatever was left over from
  // a previous new-student registration attempt on this same screen).
  useEffect(() => {
    if (isExisting) setUnit(getStudentUnit(existingName))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingName])

  const handleStart = async () => {
    const name = input.trim()
    if (!name)            { setError('이름을 입력해주세요!'); return }
    if (name.length > 10) { setError('이름은 10글자 이하로 해주세요!'); return }

    // Case-insensitive: a student retyping "heeja" instead of "Heeja" must
    // log back into the SAME account, not silently fork a new empty one.
    const existing = findStudentByName(name)
    if (existing) {
      const currentUnit = getStudentUnit(existing)
      console.log('[StudentSelect] 로그인 시 fetch된 student:', {
        name: existing, class: getStudentClass(existing), currentUnit,
      })
      console.log('[StudentSelect] Unit 선택 화면에서 고른 값:', { selectedUnit })
      setSaving(true)
      try {
        // 학생이 유닛 드롭다운을 실제로 다른 값으로 바꿨을 때만 반영 —
        // 아무것도 안 건드렸으면 기존 유닛 그대로 로그인.
        if (selectedUnit && selectedUnit !== currentUnit) {
          await setStudentUnit(existing, selectedUnit)
        }
        // onSelect가 로그인 시점에 다시 한번 refreshStudents()로 최신
        // 값을 가져오므로, 방금 반영한 유닛이 그대로 Home에 표시됨.
        await onSelect(existing)
      } catch (err) {
        setError('시작하는 중 오류가 발생했어요: ' + (err.message || err))
      } finally {
        setSaving(false)
      }
      return
    }

    if (!selectedClass) { setError('반을 선택해주세요!'); return }
    if (!selectedUnit)  { setError('유닛을 선택해주세요!'); return }
    setSaving(true)
    try {
      await addStudent(name, selectedClass, selectedUnit)
      await onSelect(name)
    } catch (err) {
      setError('시작하는 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="text-center mb-8 animate-fade-in min-w-0 max-w-full px-2">
        <img src={`${import.meta.env.BASE_URL}image/KakaoTalk_20260620_210208708.png`} alt="Paul Easy Voca" className="mx-auto mb-3 w-[180px] sm:w-[250px] h-auto rounded-[20px] shadow-lg object-cover" />
        <PaulReaction type="brand" message="" size="sm" />
        <h1 className="text-3xl sm:text-4xl font-black text-purple-700 mt-1">Paul Easy Voca</h1>
        <p className="text-purple-400 font-medium mt-1">이름을 입력하고 시작해요 ✨</p>
      </div>

      <div className="w-[calc(100vw-2rem)] max-w-sm min-w-0 bg-white rounded-3xl card-shadow p-6 animate-slide-up space-y-3">
        {removedNotice && (
          <p className="bg-orange-50 border-2 border-orange-200 text-orange-600 text-xs font-bold text-center rounded-xl p-3">
            ⚠️ 계정 정보를 찾을 수 없어요. 선생님께 문의하거나 다시 시작해주세요.
          </p>
        )}
        <input type="text" value={input} onChange={e => { setInput(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleStart()}
          placeholder="이름 입력..." maxLength={10}
          className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 text-base font-bold focus:outline-none focus:border-purple-500 transition-colors"
          autoFocus />

        {isExisting ? (
          // 기존 학생 — 반은 선생님이 관리하는 값이라 여기서 바꾸지 않음.
          // 유닛만 자유롭게 다시 고를 수 있음 (실제로 DB에 반영됨).
          <>
            <p className="text-xs text-purple-400 px-1">
              {existingClass ? `${existingClass} 반 · 유닛을 다시 골라도 돼요` : '유닛을 다시 골라도 돼요'}
            </p>
            {existingUnitOptions.length > 0 && (
              <select value={selectedUnit} onChange={e => setUnit(e.target.value)}
                className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-500 bg-white">
                {existingUnitOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </>
        ) : (
          <>
            {classNames.length > 0 && (
              <select value={selectedClass} onChange={e => {
                  const nextClass = e.target.value
                  setClass(nextClass)
                  setUnit(getClassUnitNames(nextClass)[0] || 'Unit 1')
                }}
                className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-500 bg-white">
                <option value="">반 선택</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {selectedClass && (
              <select value={selectedUnit} onChange={e => setUnit(e.target.value)}
                className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-500 bg-white">
                <option value="">유닛 선택</option>
                {getClassUnitNames(selectedClass).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </>
        )}

        {error && <p className="text-red-500 text-xs text-center">⚠️ {error}</p>}
        <button onClick={handleStart} disabled={saving}
          className="w-full bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600 disabled:opacity-50">
          {saving ? '⏳ 시작하는 중...' : '시작하기!'}
        </button>
      </div>

      <button onClick={onAdmin}
        className="mt-6 text-gray-400 text-xs font-bold btn-press hover:text-gray-600 transition-colors">
        ⚙️ 관리자
      </button>
    </div>
  )
}
