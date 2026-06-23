import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { getClassNames, getClassWords, setClassWords, deleteClass, getAllClasses, getClassUnits, addClassUnit, deleteClassUnit, getClassUnitNames } from '../utils/wordLibrary'
import FeatureManagementPanel from './FeatureManagementPanel'

const PIN = '1234'

function parseExcelRows(rows, selectedClass = '') {
  return rows
    .map(r => {
      if (!Array.isArray(r) || r.length < 2) return null
      const values = r.map((cell) => (cell == null ? '' : String(cell).trim()))
      if (values.length >= 4) {
        // 기존 형식: 반이름 | Unit | 단어 | 뜻
        return { className: values[0], unit: values[1] || 'Unit 1', word: values[2], meaning: values[3] }
      }
      if (values.length === 3) {
        const isUnit = /^(unit|유닛)\s*\d*/i.test(values[0])
        if (isUnit) {
          // 새 형식: Unit | 단어 | 뜻
          return { className: selectedClass, unit: values[0], word: values[1], meaning: values[2] }
        }
        // 기존 3열 형식: 반이름 | 단어 | 뜻
        return { className: values[0], unit: 'Unit 1', word: values[1], meaning: values[2] }
      }
      // 2열: 단어 | 뜻
      return { className: selectedClass, unit: 'Unit 1', word: values[0], meaning: values[1] }
    })
    .filter(r => r && r.word)
}

function ExcelUpload({ onDone }) {
  const [selectedClass, setSelectedClass] = useState('')
  const [preview, setPreview]             = useState(null)
  const [classOverride, setClassOverride] = useState('')
  const fileRef                           = useRef()
  const classList                         = getClassNames()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const data = await file.arrayBuffer()
    const wb   = XLSX.read(data)
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    const parsed = parseExcelRows(rows, selectedClass)
    setPreview(parsed)
    // 기존 형식(반이름 포함)이면 파일의 첫 반이름 사용, 아니면 선택된 반 유지
    const fileClass = parsed[0]?.className
    setClassOverride(fileClass || selectedClass)
  }

  const handleSave = () => {
    const targetClass = classOverride.trim() || selectedClass.trim()
    if (!targetClass) { alert('반을 선택하거나 반 이름을 입력해주세요!'); return }
    const byClass = {}
    preview.forEach(r => {
      const c = r.className || targetClass
      if (!c) return
      const u = r.unit || 'Unit 1'
      if (!byClass[c]) byClass[c] = {}
      if (!byClass[c][u]) byClass[c][u] = []
      byClass[c][u].push({ word: r.word, meaning: r.meaning })
    })
    let totalWords = 0
    Object.entries(byClass).forEach(([className, units]) => {
      Object.entries(units).forEach(([unit, words]) => {
        setClassWords(className, words, unit)
        totalWords += words.length
      })
    })
    const displayClass = Object.keys(byClass)[0] || targetClass
    alert(`"${displayClass}" 반에 ${totalWords}개 단어 저장 완료!`)
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-2xl p-4 text-sm text-blue-700 font-bold">
        <p>📋 Excel/CSV 기본 형식:</p>
        <p className="text-xs mt-1 font-normal">Unit 1 | incorrect | 틀린, 옳지 않은</p>
        <p className="text-xs mt-2 text-blue-500 font-normal">※ 기존 형식(반이름 | Unit | 단어 | 뜻)도 계속 지원됩니다.</p>
      </div>

      <div className="space-y-2">
        <p className="font-black text-gray-700 text-sm">① 반 선택</p>
        <select
          value={selectedClass}
          onChange={e => { setSelectedClass(e.target.value); setClassOverride(e.target.value); setPreview(null) }}
          className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-purple-500 bg-white"
        >
          <option value="">-- 반을 선택하세요 --</option>
          {classList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <p className="font-black text-gray-700 text-sm">② 파일 선택</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
        <button onClick={() => fileRef.current.click()}
          className="w-full border-2 border-dashed border-blue-300 text-blue-600 font-black py-4 rounded-2xl btn-press hover:bg-blue-50">
          📂 파일 선택 (.xlsx / .csv)
        </button>
      </div>

      {preview && (
        <div className="space-y-3">
          <input type="text" value={classOverride} onChange={e => setClassOverride(e.target.value)}
            placeholder="저장할 반 이름 확인/수정"
            className="w-full border-2 border-blue-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-blue-500" />
          <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-black text-gray-600">유닛</th>
                  <th className="text-left p-2 font-black text-gray-600">단어</th>
                  <th className="text-left p-2 font-black text-gray-600">뜻</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="p-2 text-xs text-gray-400">{r.unit}</td>
                    <td className="p-2 font-bold">{r.word}</td>
                    <td className="p-2 text-gray-600">{r.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 20 && (
              <p className="text-center text-xs text-gray-400 p-2">... 외 {preview.length - 20}개</p>
            )}
          </div>
          <p className="text-center text-sm text-gray-500">총 {preview.length}개 단어 발견</p>
          <button onClick={handleSave}
            className="w-full bg-blue-500 text-white font-black py-4 rounded-2xl btn-press hover:bg-blue-600">
            💾 "{classOverride || selectedClass}" 반에 저장
          </button>
        </div>
      )}
    </div>
  )
}

function PdfUpload({ onDone }) {
  const [text, setText]     = useState('')
  const [cls, setCls]       = useState('')
  const [loading, setLoad]  = useState(false)
  const [words, setWords]   = useState([])
  const fileRef             = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLoad(true)
    setText('')
    setWords([])
    try {
      const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist')
      GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
      const data = await file.arrayBuffer()
      const pdf  = await getDocument({ data }).promise
      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        fullText += content.items.map(item => item.str).join(' ') + '\n'
      }
      setText(fullText.trim())
    } catch (err) {
      setText('PDF 추출 실패: ' + err.message)
    }
    setLoad(false)
  }

  const handleParse = () => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const parsed = lines.map(l => {
      const parts = l.split(/[,|\t]/).map(p => p.trim())
      return parts.length >= 2 ? { word: parts[0], meaning: parts[1] } : null
    }).filter(Boolean)
    setWords(parsed)
  }

  const handleSave = () => {
    if (!cls.trim()) { alert('반 이름을 입력해주세요!'); return }
    if (!words.length) { alert('먼저 [단어 파싱] 버튼을 눌러주세요!'); return }
    setClassWords(cls.trim(), words)
    alert(`"${cls}" 반에 ${words.length}개 단어 저장 완료!`)
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 rounded-2xl p-4 text-sm text-orange-700 font-bold">
        <p>📄 PDF에서 텍스트를 추출합니다.</p>
        <p className="text-xs mt-1 font-normal">추출 후 직접 확인/수정 후 저장하세요.</p>
        <p className="text-xs font-normal">파싱 형식: 단어, 뜻 (줄별)</p>
      </div>

      <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile} className="hidden" />
      <button onClick={() => fileRef.current.click()} disabled={loading}
        className="w-full border-2 border-dashed border-orange-300 text-orange-600 font-black py-4 rounded-2xl btn-press hover:bg-orange-50">
        {loading ? '⏳ 추출 중...' : '📂 PDF 파일 선택'}
      </button>

      {text && (
        <div className="space-y-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm font-mono resize-none focus:outline-none focus:border-orange-400"
            placeholder="추출된 텍스트..." />
          <div className="flex gap-2">
            <button onClick={handleParse}
              className="flex-1 bg-orange-100 text-orange-700 font-black py-3 rounded-xl btn-press hover:bg-orange-200">
              🔍 단어 파싱
            </button>
          </div>
          {words.length > 0 && (
            <>
              <div className="bg-white rounded-2xl border-2 border-gray-200 max-h-40 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0"><tr>
                    <th className="text-left p-2 font-black text-gray-600">단어</th>
                    <th className="text-left p-2 font-black text-gray-600">뜻</th>
                  </tr></thead>
                  <tbody>
                    {words.slice(0, 15).map((w, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-2 font-bold">{w.word}</td>
                        <td className="p-2 text-gray-600">{w.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {words.length > 15 && <p className="text-center text-xs text-gray-400 p-2">... 외 {words.length - 15}개</p>}
              </div>
              <input type="text" value={cls} onChange={e => setCls(e.target.value)}
                placeholder="저장할 반 이름 (예: Reading 2)"
                className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-orange-500" />
              <button onClick={handleSave}
                className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl btn-press hover:bg-orange-600">
                💾 관리자 확인 후 저장 ({words.length}개)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminScreen({ onBack }) {
  const [pin, setPin]         = useState('')
  const [authed, setAuthed]   = useState(false)
  const [tab, setTab]         = useState('classes') // classes | excel | pdf | features
  const [classes, setClasses] = useState(() => getClassNames())
  const [viewClass, setView]  = useState(null)
  const [viewUnit, setViewUnit] = useState('Unit 1')
  const [newClassName, setNewClassName] = useState('')
  const [newUnitName, setNewUnitName] = useState('')
  const [newWord, setNewWord] = useState('')
  const [newMeaning, setNewMeaning] = useState('')

  const refresh = () => {
    setClasses(getClassNames())
    if (viewClass) {
      const units = getClassUnitNames(viewClass)
      if (!units.includes(viewUnit)) setViewUnit(units[0] || 'Unit 1')
    }
  }

  const handlePin = () => {
    if (pin === PIN) setAuthed(true)
    else { alert('비밀번호가 틀렸어요!'); setPin('') }
  }

  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="bg-white rounded-3xl card-shadow p-8 w-full max-w-xs text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-black text-xl text-gray-800 mb-6">관리자 로그인</h2>
        <input type="password" value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handlePin()}
          placeholder="비밀번호 (기본: 1234)" maxLength={8}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-bold text-center focus:outline-none focus:border-purple-400 mb-3" autoFocus />
        <button onClick={handlePin}
          className="w-full bg-purple-500 text-white font-black py-3 rounded-2xl btn-press mb-3">로그인</button>
        <button onClick={onBack} className="text-gray-400 font-bold text-sm btn-press">← 돌아가기</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen p-4 pb-8 bg-gray-50">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 pt-2 mb-6">
          <button onClick={onBack} className="text-gray-500 font-bold btn-press">← 나가기</button>
          <h1 className="text-2xl font-black text-gray-800">⚙️ 관리자</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[['classes','📚 반 관리'],['excel','📊 Excel'],['pdf','📄 PDF'],['features','🎯 기능']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`py-2 px-3 rounded-xl font-black text-sm btn-press transition-colors whitespace-nowrap ${tab === k ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 border-2 border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Classes tab */}
        {tab === 'classes' && (
          <div className="space-y-3">
            {classes.length === 0 ? (
              <div className="bg-white rounded-3xl card-shadow p-8 text-center">
                <div className="text-5xl mb-3">📭</div>
                <p className="font-bold text-gray-500">아직 반이 없어요.</p>
                <p className="text-sm text-gray-400 mt-1">Excel 업로드로 반을 만들어보세요!</p>
              </div>
            ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-3xl card-shadow p-5">
                <p className="text-sm font-black text-gray-700 mb-3">새 반 추가하기</p>
                <div className="flex gap-2">
                  <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)}
                    placeholder="반 이름 입력 (예: Basic 1)"
                    className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                  <button onClick={() => {
                      const name = newClassName.trim()
                      if (!name) return alert('반 이름을 입력해주세요!')
                      if (classes.includes(name)) return alert('이미 있는 반 이름이에요.')
                      setClassWords(name, [])
                      setNewClassName('')
                      refresh()
                    }}
                    className="bg-purple-500 text-white font-black px-4 py-3 rounded-xl btn-press hover:bg-purple-600">
                    추가
                  </button>
                </div>
              </div>

              {classes.map(c => {
                const units = getClassUnits(c)
                const totalWords = units.reduce((sum, unit) => sum + unit.words.length, 0)
                const unitNames = getClassUnitNames(c)
                const isOpen = viewClass === c
                const activeUnit = isOpen ? viewUnit : unitNames[0] || 'Unit 1'
                const words = getClassWords(c, activeUnit)
                return (
                  <div key={c} className="bg-white rounded-2xl card-shadow p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-gray-800">{c}</p>
                        <p className="text-sm text-gray-400">{units.length}개 유닛 · {totalWords}개 단어</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => {
                            const next = isOpen ? null : c
                            setView(next)
                            if (next) setViewUnit(unitNames[0] || 'Unit 1')
                          }}
                          className="bg-blue-100 text-blue-600 font-bold px-3 py-2 rounded-xl text-sm btn-press">
                          {isOpen ? '닫기' : '보기'}
                        </button>
                        <button onClick={() => { if (window.confirm(`"${c}" 반을 삭제할까요?`)) { deleteClass(c); setView(null); refresh() } }}
                          className="bg-red-100 text-red-500 font-bold px-3 py-2 rounded-xl text-sm btn-press">
                          삭제
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-col gap-3">
                          <div className="flex gap-2 flex-wrap">
                            <select value={viewUnit} onChange={e => setViewUnit(e.target.value)}
                              className="flex-1 min-w-[160px] border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400 bg-white">
                              {unitNames.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <input type="text" value={newUnitName} onChange={e => setNewUnitName(e.target.value)}
                              placeholder="새 유닛 이름 (예: Unit 2)"
                              className="flex-1 min-w-[160px] border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                            <button onClick={() => {
                              const name = newUnitName.trim()
                              if (!name) return alert('유닛 이름을 입력해주세요.')
                              if (unitNames.includes(name)) return alert('이미 있는 유닛이에요.')
                              addClassUnit(c, name)
                              setNewUnitName('')
                              setViewUnit(name)
                              refresh()
                            }}
                              className="bg-indigo-500 text-white font-black px-4 py-3 rounded-xl btn-press hover:bg-indigo-600">
                              유닛 추가
                            </button>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                            <p>현재 유닛: <span className="font-black text-gray-700">{viewUnit}</span> ({words.length}개 단어)</p>
                            <p>전체 유닛: {unitNames.join(', ')}</p>
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto">
                          {words.length === 0 ? (
                            <p className="text-gray-400 text-sm">이 유닛에 단어가 아직 없습니다.</p>
                          ) : words.map((w, i) => (
                            <div key={i} className="flex gap-3 py-1 border-b border-gray-100 last:border-0 text-sm">
                              <span className="font-bold text-gray-800 min-w-0">{w.word}</span>
                              <span className="text-gray-500">{w.meaning}</span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={newWord} onChange={e => setNewWord(e.target.value)}
                            placeholder="단어"
                            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                          <input type="text" value={newMeaning} onChange={e => setNewMeaning(e.target.value)}
                            placeholder="뜻"
                            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                        </div>
                        <button onClick={() => {
                            if (!newWord.trim() || !newMeaning.trim()) return alert('단어와 뜻을 모두 입력해주세요.')
                            const existing = getClassWords(c, viewUnit)
                            setClassWords(c, [...existing, { word: newWord.trim(), meaning: newMeaning.trim() }], viewUnit)
                            setNewWord('')
                            setNewMeaning('')
                            refresh()
                          }}
                          className="w-full bg-green-500 text-white font-black py-3 rounded-xl btn-press hover:bg-green-600">
                          단어 추가
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </div>
        )}

        {tab === 'excel' && <ExcelUpload onDone={() => { refresh(); setTab('classes') }} />}
        {tab === 'pdf'   && <PdfUpload   onDone={() => { refresh(); setTab('classes') }} />}
        {tab === 'features' && <FeatureManagementPanel />}
      </div>
    </div>
  )
}
