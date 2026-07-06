import { useState } from 'react'
import { addStudent, findStudentByName } from '../hooks/useStudent'
import { getClassNames, getClassUnitNames } from '../utils/wordLibrary'

// Students only ever see a name/class entry form here — never a roster of
// other students. Typing an EXISTING name logs back in as that student
// (student names are unique in the DB, so a name unambiguously identifies
// one student); a new name registers with the chosen class/unit. Once
// selected, App.jsx caches the name in localStorage so returning to the
// app skips this screen entirely and loads only that student's own data.
export default function StudentSelect({ onSelect, onAdmin, removedNotice }) {
  const [input, setInput]           = useState('')
  const [selectedClass, setClass]   = useState('')
  const [selectedUnit, setUnit]     = useState('')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)
  const classNames                  = getClassNames()

  const handleStart = async () => {
    const name = input.trim()
    if (!name)            { setError('이름을 입력해주세요!'); return }
    if (name.length > 10) { setError('이름은 10글자 이하로 해주세요!'); return }

    // Case-insensitive: a student retyping "heeja" instead of "Heeja" must
    // log back into the SAME account, not silently fork a new empty one.
    const existing = findStudentByName(name)
    if (existing) {
      setSaving(true)
      try {
        // onSelect re-pulls this student's class/unit from Supabase before
        // switching screens, so a reassignment made earlier in this tab's
        // session (by an admin, on another device) is never stale.
        await onSelect(existing)
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
        <h1 className="text-3xl sm:text-4xl font-black text-purple-700">Paul Easy Voca</h1>
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
