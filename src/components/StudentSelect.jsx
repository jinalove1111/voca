import { useState } from 'react'
import { getStudents, addStudent, removeStudent } from '../hooks/useStudent'
import { getClassNames, setStudentClass, getStudentClass, getClassUnitNames, getStudentUnit, setStudentUnit } from '../utils/wordLibrary'

export default function StudentSelect({ onSelect, onAdmin }) {
  const [students, setStudents]     = useState(() => getStudents())
  const [input, setInput]           = useState('')
  const [selectedClass, setClass]   = useState('')
  const [selectedUnit, setUnit]     = useState('')
  const [error, setError]           = useState('')
  const [showAdd, setShowAdd]       = useState(false)
  const classNames                  = getClassNames()

  const refresh = () => setStudents(getStudents())

  const handleAdd = () => {
    const name = input.trim()
    if (!name)               { setError('이름을 입력해주세요!'); return }
    if (name.length > 10)    { setError('이름은 10글자 이하로 해주세요!'); return }
    if (!selectedClass)      { setError('반을 선택해주세요!'); return }
    if (!selectedUnit)       { setError('유닛을 선택해주세요!'); return }
    if (students.includes(name)) { setError('이미 있는 이름이에요!'); return }
    addStudent(name)
    setStudentClass(name, selectedClass)
    setStudentUnit(name, selectedUnit)
    refresh()
    setInput('')
    setClass('')
    setUnit('')
    setError('')
    setShowAdd(false)
    onSelect(name)
  }

  const handleRemove = (e, name) => {
    e.stopPropagation()
    if (window.confirm(`"${name}" 학생을 삭제할까요?`)) { removeStudent(name); refresh() }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="text-center mb-8 animate-fade-in">
        <img src={`${import.meta.env.BASE_URL}image/KakaoTalk_20260620_210208708.png`} alt="Paul Easy Voca" className="mx-auto mb-3 w-[180px] sm:w-[250px] h-auto rounded-[20px] shadow-lg object-cover" />
        <h1 className="text-4xl font-black text-purple-700">Paul Easy Voca</h1>
        <p className="text-purple-400 font-medium mt-1">누구로 시작할까요? ✨</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl card-shadow p-6 animate-slide-up">
        {students.length > 0 && !showAdd && (
          <div className="mb-5">
            <p className="text-center text-sm text-gray-400 font-bold mb-3">내 이름을 눌러요 👇</p>
            <div className="space-y-2">
              {students.map((s, i) => {
                const cls = getStudentClass(s)
                const unit = getStudentUnit(s)
                return (
                  <button key={s} onClick={() => onSelect(s)}
                    className="w-full flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl px-4 py-3 btn-press hover:border-purple-400 transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{['🦊','🐱','🐶','🐰','🐹','🐼','🦄'][i % 7]}</span>
                      <div className="text-left">
                        <p className="font-black text-lg text-purple-700">{s}</p>
                        {(cls || unit) && (
                          <p className="text-xs text-purple-400">{[cls, unit].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={(e) => handleRemove(e, s)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-lg">✕</button>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!showAdd && (
          <button onClick={() => setShowAdd(true)}
            className="w-full border-2 border-dashed border-purple-300 text-purple-500 font-black py-3 rounded-2xl btn-press hover:border-purple-500 hover:bg-purple-50 transition-all">
            ➕ 새 학생 추가
          </button>
        )}

        {showAdd && (
          <div className="space-y-3">
            <p className="text-center text-sm text-gray-500 font-bold">새 학생 등록</p>
            <input type="text" value={input} onChange={e => { setInput(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
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
            <div className="flex gap-2">
              <button onClick={() => { setShowAdd(false); setError('') }}
                className="flex-1 border-2 border-gray-200 text-gray-500 font-bold py-3 rounded-xl btn-press">취소</button>
              <button onClick={handleAdd}
                className="flex-1 bg-purple-500 text-white font-black py-3 rounded-xl btn-press hover:bg-purple-600">시작!</button>
            </div>
          </div>
        )}
      </div>

      <button onClick={onAdmin}
        className="mt-6 text-gray-400 text-xs font-bold btn-press hover:text-gray-600 transition-colors">
        ⚙️ 관리자
      </button>
    </div>
  )
}
