import React, { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { getClassNames, getClassWords, setClassWords, deleteClass, createClass, renameClass, getClassUnits, addClassUnit, deleteClassUnit, getClassUnitNames, getStudentClass, getStudentUnit, setStudentClass, setStudentUnit, setStudentsClassBulk, getStudentsInClass, getTodaysAssignmentWordIds, setTodaysAssignment, getAssignmentForDate, setAssignmentForDate, fetchDashboardData, getClassSettings, setClassSettings, localIsoDateStr, fetchWordStatusSummary, resetWordStatus, setWordAcceptedMeanings } from '../utils/wordLibrary'
import { fetchPendingSpellingReviews, resolveSpellingReview } from '../utils/spellingReviewApi'
import { fetchPinStatusMap } from '../utils/pinStatusApi'
import { getStudents, removeStudent } from '../hooks/useStudent'
import { buildWeeklyReport, computeStudentStats } from '../utils/weeklyReport'
import FeatureManagementPanel from './FeatureManagementPanel'
import TestPaperGenerator from './TestPaperGenerator'
import DebugPage from './DebugPage'
import EntranceTestAdmin from './EntranceTestAdmin'

const wordSlug = (word) => word.toLowerCase().replace(/\s+/g, '_')

// CSV 셀 안전 이스케이프 — 이름/반/유닛에 쉼표·따옴표·줄바꿈이 섞여도 깨지지 않게.
function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(filename, rows) {
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n') // BOM: 엑셀에서 한글 깨짐 방지
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 2026-07-09: UTC 기준(toISOString)이던 걸 로컬(한국) 날짜 기준으로 수정 —
// wordLibrary.js의 localIsoDateStr 주석 참고. 자정~오전 9시 사이에 UTC로
// 계산하면 "내일"이 실제 로컬 기준보다 하루씩 밀려서 오늘의 단어 배정이
// 엉뚱한 날짜에 붙는 버그가 있었다.
const tomorrowIsoStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return localIsoDateStr(d) }

// 쓰기 시험(Spelling Test) 반별 설정 — 쓰기시험 사용 여부/철자 힌트 사용
// 여부/오답 반복 횟수. 기본값이 전부 꺼짐/3회라, 관리자가 여기서 직접
// 켜기 전까지는 학생 쪽에 아무 변화도 없음(WordBrowser의 모드 선택에서
// "쓰기"/"종합"의 스펠링 단계가 숨겨진 채로 유지됨).
function SpellingSettingsPanel({ targetClass, onSaved }) {
  const [settings, setSettings] = useState(() => getClassSettings(targetClass))
  const [saving, setSaving] = useState(false)

  const save = async (next) => {
    setSettings(next) // 즉시 반영 (낙관적 업데이트) — 실패하면 아래서 되돌림
    setSaving(true)
    try {
      await setClassSettings(targetClass, next)
      onSaved?.()
    } catch (err) {
      alert('설정 저장 중 오류가 발생했어요: ' + (err.message || err))
      setSettings(getClassSettings(targetClass)) // 실패 시 이전 값으로 복구
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-purple-50 rounded-xl p-3 space-y-2">
      <p className="text-xs font-black text-purple-700">✏️ 쓰기 시험 설정</p>
      <label className="flex items-center justify-between text-xs font-bold text-gray-700">
        쓰기 시험 사용
        <input type="checkbox" checked={settings.spellingTestEnabled} disabled={saving}
          onChange={e => save({ ...settings, spellingTestEnabled: e.target.checked })}
          className="w-5 h-5 accent-purple-500" />
      </label>
      <label className="flex items-center justify-between text-xs font-bold text-gray-700">
        철자 힌트 사용
        <input type="checkbox" checked={settings.spellingHintEnabled} disabled={saving}
          onChange={e => save({ ...settings, spellingHintEnabled: e.target.checked })}
          className="w-5 h-5 accent-purple-500" />
      </label>
      <label className="flex items-center justify-between text-xs font-bold text-gray-700 gap-2">
        오답 반복 횟수
        <input type="number" min={1} max={10} value={settings.wrongAnswerRepeatCount} disabled={saving}
          onChange={e => save({ ...settings, wrongAnswerRepeatCount: e.target.value })}
          className="w-16 border-2 border-purple-200 rounded-lg px-2 py-1 text-center font-bold bg-white" />
      </label>
      <label className="flex items-center justify-between text-xs font-bold text-gray-700 gap-2">
        출제 방향
        <select value={settings.spellingDirection || 'mixed'} disabled={saving}
          onChange={e => save({ ...settings, spellingDirection: e.target.value })}
          className="border-2 border-purple-200 rounded-lg px-2 py-1 font-bold bg-white">
          <option value="mixed">혼합 50:50 (기본값)</option>
          <option value="kr2en">한글→영어만</option>
          <option value="en2kr">영어→한글만</option>
          <option value="random">랜덤 (문제마다 50% 확률)</option>
        </select>
      </label>
    </div>
  )
}

// v2.0(2026-07-17) 쓰기 답안 교사 검토 큐 — 영→한 문제에서 학생이 한글로
// 답했는데 오답 처리된 제출("뜻은 아는데 등록된 표기가 아닌" 후보)을
// 교사가 직접 판정하는 패널. "이 답 인정" 원클릭 = 그 단어의
// accepted_meanings에 추가(다음부터 전 반에서 정답 처리) + 큐에서 제거.
// AI 자동 판정은 없음(운영자 방침 — 최종 판정은 항상 교사).
// 테이블 미존재(supabase_v2_0_spelling_mixed.sql 미실행)면 안내만 표시.
function SpellingReviewQueuePanel({ onChanged }) {
  const [rows, setRows] = useState([]) // null = 테이블 없음
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    setRows(await fetchPendingSpellingReviews())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const accept = async (r) => {
    setBusyId(r.id)
    try {
      await setWordAcceptedMeanings(r.wordId, [...r.acceptedMeanings, r.submittedAnswer])
      await resolveSpellingReview(r.id, 'accepted')
      await load()
      onChanged?.()
    } catch (err) {
      alert('인정 처리 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }
  const dismiss = async (r) => {
    setBusyId(r.id)
    try {
      await resolveSpellingReview(r.id, 'dismissed')
      await load()
    } catch (err) {
      alert('무시 처리 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-black text-gray-700">📝 쓰기 답안 검토 {rows && rows.length > 0 && <span className="text-orange-500">({rows.length}건 대기)</span>}</p>
        <button onClick={load} disabled={loading} className="text-xs font-bold text-purple-500 btn-press py-2 px-2 -my-2">새로고침</button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">영→한 시험에서 등록된 뜻과 달라 오답 처리된 한글 답이에요. 맞는 표현이면 "인정"을 눌러주세요 — 그 단어의 인정 뜻에 추가되어 다음부터 정답 처리됩니다.</p>
      {loading ? (
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      ) : rows === null ? (
        <p className="text-xs text-orange-500 font-bold bg-orange-50 rounded-xl p-3">⚠️ 준비 중 — supabase_v2_0_spelling_mixed.sql을 Supabase SQL Editor에서 실행하면 이 기능이 켜져요.</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-400 text-sm">검토할 답안이 없어요. 👍</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="bg-gray-50 rounded-xl p-3 flex items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-black text-gray-800">{r.word} <span className="text-gray-400 font-bold text-xs">등록 뜻: {r.meaning}</span></p>
                <p className="text-gray-600">학생 답: <span className="font-black text-orange-600">{r.submittedAnswer}</span></p>
                {r.acceptedMeanings.length > 0 && (
                  <p className="text-[11px] text-gray-400">현재 인정 뜻: {r.acceptedMeanings.join(', ')}</p>
                )}
              </div>
              <button onClick={() => accept(r)} disabled={busyId === r.id}
                className="flex-shrink-0 bg-green-500 hover:bg-green-600 text-white font-black px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-40">
                ✅ 인정
              </button>
              <button onClick={() => dismiss(r)} disabled={busyId === r.id}
                className="flex-shrink-0 bg-white border-2 border-gray-200 text-gray-500 font-bold px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-40">
                무시
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// v1.3 "날짜별 숙제 배정" — 오늘이 아닌 미래 날짜(내일 이후)에 미리 단어를
// 배정해두는 UI. 과거 날짜는 min 속성으로 아예 선택 못 하게 막아 이미
// 지나간 학습 기록을 실수로 고쳐쓰는 걸 방지. 오늘 배정(체크박스 토글, 위
// 블록)과 완전히 분리된 별도 컴포넌트라 기존 "오늘의 단어" 동작에는 전혀
// 영향 없음.
function FutureAssignmentPlanner({ targetClass, words }) {
  const [date, setDate] = useState(tomorrowIsoStr())
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  // P7 감사(2026-07-16): 날짜/반을 빠르게 바꾸면 먼저 시작된 조회의 응답이
  // "나중에" 도착해 방금 바꾼 날짜의 선택 상태를 덮어쓸 수 있었다(6dd6c7a
  // PIN 버그와 같은 stale 응답 레이스). 이 상태로 저장을 누르면 엉뚱한
  // 날짜의 단어 목록이 그 날짜 배정으로 저장될 수 있음 — 요청 번호로 최신
  // 요청의 응답만 반영한다.
  const loadReqIdRef = useRef(0)

  const load = async (d) => {
    const reqId = ++loadReqIdRef.current
    setLoading(true)
    setSaved(false)
    try {
      const ids = await getAssignmentForDate(targetClass, d)
      if (loadReqIdRef.current !== reqId) return // 더 최신 조회가 시작됨 — 이 응답은 버림
      setSelected(new Set(ids))
    } catch (err) {
      if (loadReqIdRef.current !== reqId) return
      alert('불러오는 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      if (loadReqIdRef.current === reqId) setLoading(false)
    }
  }

  useEffect(() => { load(date) }, [date, targetClass]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (slug) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
    setSaved(false)
  }

  const save = async () => {
    try {
      await setAssignmentForDate(targetClass, date, [...selected])
      setSaved(true)
    } catch (err) {
      alert('저장 중 오류가 발생했어요: ' + (err.message || err))
    }
  }

  return (
    <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-black text-indigo-700 flex-shrink-0">📅 다음 날짜 미리 배정</p>
        <input type="date" value={date} min={tomorrowIsoStr()} onChange={e => setDate(e.target.value)}
          className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold bg-white" />
      </div>
      {loading ? <p className="text-xs text-gray-400">불러오는 중...</p> : (
        <>
          {words.length === 0 ? (
            <p className="text-xs text-gray-400">이 유닛에 단어가 없어요.</p>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {words.map((w, i) => {
                const slug = wordSlug(w.word)
                const isOn = selected.has(slug)
                return (
                  <button key={i} onClick={() => toggle(slug)}
                    className={`px-2 py-1 rounded-lg text-xs font-bold btn-press ${isOn ? 'bg-indigo-500 text-white' : 'bg-white border-2 border-gray-200 text-gray-600'}`}>
                    {w.word}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={save} className="bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs btn-press">저장</button>
            <p className="text-xs text-gray-500">{selected.size > 0 ? `${selected.size}개 선택됨` : '선택 안 하면 그날 전체 단어가 보여요'}</p>
            {saved && <p className="text-xs text-green-600 font-bold">✅ 저장됨</p>}
          </div>
        </>
      )}
    </div>
  )
}

// 학생 관리 — admin-only. Students themselves never see this roster (see
// StudentSelect.jsx, which only ever shows a name+PIN 로그인/등록 화면).
// P0(2026-07-15): getStudents()가 이제 {id,name,className,classId,
// unitName} 객체 배열을 반환한다(예전엔 이름 문자열 배열) — 이 컴포넌트의
// 모든 selection/edit 상태 키를 이름 대신 id로 바꿨다. 동명이인이 허용된
// 지금, 이름만으로는 어느 학생을 편집/삭제/선택 중인지 더 이상 구분할 수
// 없기 때문(선택 키가 이름이면 동명이인 학생을 동시에 잘못 선택하는
// 버그가 생김).
function StudentManagement({ adminPin }) {
  const [students, setStudents] = useState(() => getStudents())
  const [editing, setEditing] = useState(null) // student id currently being reassigned
  const [editClass, setEditClass] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [selected, setSelected] = useState(() => new Set()) // bulk-move checkbox selection (ids)
  const [bulkTargetClass, setBulkTargetClass] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [pinResetId, setPinResetId] = useState(null)
  const [pinResetResult, setPinResetResult] = useState(null) // { id, name, pin } — 관리자에게 1회만 보여줌
  const [bulkPinBusy, setBulkPinBusy] = useState(false)
  const [pinClearId, setPinClearId] = useState(null) // "PIN 초기화(삭제)" 진행 중인 학생 id
  // 2026-07-16 — 학생 최초 PIN 자기설정. pinStatus: id -> {hasPinHash,
  // pinSetupAllowed, locked}(api/student-pin-status.js 배치 조회, pin_hash
  // 원문은 절대 안 내려옴). supabase_v1_7 SQL 미실행 상태에서도(컬럼 없음
  // 에러) 크래시 없이 "상태 알 수 없음"으로 안전하게 표시.
  const [pinStatus, setPinStatus] = useState({})
  const [allowBusyId, setAllowBusyId] = useState(null)
  const [unlockBusyId, setUnlockBusyId] = useState(null)
  const classList = getClassNames()

  const loadPinStatus = async (list) => {
    if (!list.length) { setPinStatus({}); return }
    try {
      setPinStatus(await fetchPinStatusMap(list.map(s => s.id)))
      // supabase_v1_7_student_pin_selfsetup.sql이 아직 안 돌았으면(컬럼
      // 없음) 헬퍼가 throw하는데, 아래 catch가 조용히 무시 — 배지가 그냥
      // "상태 알 수 없음"으로 남을 뿐 화면이 깨지지 않음.
    } catch {
      // 네트워크 실패도 동일하게 무시 — PIN 상태 배지는 부가 정보일 뿐,
      // 학생 관리 화면의 핵심 기능(반 배정/삭제 등)을 막으면 안 됨.
    }
  }

  const refresh = () => {
    const list = getStudents()
    setStudents(list)
    loadPinStatus(list)
  }
  useEffect(() => { loadPinStatus(students) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = async (id, name) => {
    if (!window.confirm(`"${name}" 학생을 삭제할까요? 학습 기록도 함께 삭제됩니다.`)) return
    try {
      await removeStudent(id)
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
      refresh()
    } catch (err) {
      alert('삭제 중 오류가 발생했어요: ' + (err.message || err))
    }
  }

  const startEdit = (id) => {
    setEditing(id)
    setEditClass(getStudentClass(id))
    setEditUnit(getStudentUnit(id))
  }

  const saveEdit = async () => {
    if (!editClass) { alert('반을 선택해주세요!'); return }
    // [진단 로그 1] 관리자가 선택한 unit 값
    console.log('[AdminScreen] saveEdit — 선택한 unit 값:', { studentId: editing, editClass, editUnit })
    try {
      await setStudentClass(editing, editClass)
      await setStudentUnit(editing, editUnit || 'Unit 1')
      setEditing(null)
      refresh()
    } catch (err) {
      alert('반 배정 중 오류가 발생했어요: ' + (err.message || err))
    }
  }

  const toggleSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // PIN 재설정 — 새 4자리 PIN을 서버가 생성해서 반환, 관리자에게 딱 1번
  // 화면에 보여준다(다시 조회 불가, 해시만 저장됨 — api/set-student-pin.js).
  const handleResetPin = async (id, name) => {
    if (!window.confirm(`"${name}" 학생의 PIN을 재설정할까요? 기존 PIN은 더 이상 쓸 수 없게 돼요.`)) return
    setPinResetId(id)
    setPinResetResult(null)
    try {
      const res = await fetch('/api/set-student-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // P7 감사 후속 — 무작위 재설정은 서버가 요청마다 adminPin을 재검증
        // (기존 PIN 덮어쓰기 = 계정 탈취 가능 경로라 clear-student-pin과 동일 급).
        body: JSON.stringify({ studentId: id, adminPin }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        throw new Error(data.error || 'PIN 재설정에 실패했어요.')
      }
      setPinResetResult({ id, name, pin: data.pin })
    } catch (err) {
      alert('PIN 재설정 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setPinResetId(null)
    }
  }

  // PIN 초기화(삭제) — 위 "PIN 재설정"(handleResetPin, 새 랜덤 PIN을 즉시
  // 채워 넣음)과는 완전히 별개 기능. 이건 pin_hash를 실제로 null로 지워서
  // 학생을 진짜 "PIN 없음" 상태로 되돌린다 — "PIN 만들기" 탭에서 그 학생을
  // 다시 자기설정할 수 있게(api/clear-student-pin.js). 기존 PIN은 그
  // 즉시 로그인에 쓸 수 없게 된다(api/verify-student-pin.js가 pin_hash
  // 없는 후보는 no_pin_setup으로 거부).
  const handleClearPin = async (id, name) => {
    if (!window.confirm(`"${name}" 학생의 PIN을 삭제할까요?\n\n기존 PIN은 즉시 로그인할 수 없게 되고, "PIN 만들기" 탭에서 새로 만들어야 해요.`)) return
    setPinClearId(id)
    try {
      const res = await fetch('/api/clear-student-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: id, adminPin }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        throw new Error(data.error || 'PIN 삭제에 실패했어요.')
      }
      await loadPinStatus(students)
      alert(`"${name}" 학생의 PIN을 삭제했어요. 이제 "PIN 만들기" 탭에서 새로 설정할 수 있어요.`)
    } catch (err) {
      alert('PIN 삭제 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setPinClearId(null)
    }
  }

  // 임시 PIN 일괄 생성 — PIN 로그인 도입 전에 등록됐던 기존 학생들
  // (pin_hash가 아직 없는 학생) 전원에게 무작위 4자리 PIN을 부여하고,
  // 평문 목록을 CSV로 1회 다운로드한다 — 관리자 인증 뒤(이 화면)에서만
  // 접근 가능, 서버에도 평문으로 남지 않음(api/bulk-generate-temp-pins.js).
  const handleBulkGeneratePins = async () => {
    if (!window.confirm('PIN이 아직 없는 모든 학생에게 임시 PIN을 새로 발급할까요?')) return
    setBulkPinBusy(true)
    try {
      const res = await fetch('/api/bulk-generate-temp-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // P7 감사 후속 — 평문 PIN 목록을 받는 가장 민감한 응답이라 요청마다
        // 서버에서 adminPin 재검증.
        body: JSON.stringify({ adminPin }),
      })
      const data = await res.json()
      if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
      if (data.error) throw new Error(data.error)
      if (!data.results || data.results.length === 0) {
        alert('PIN이 없는 학생이 없어요 — 전부 이미 PIN이 설정돼 있어요.')
        return
      }
      const rows = [['반', '유닛', '이름', '임시 PIN'], ...data.results.map(r => [r.className || '미배정', r.unitName || '', r.name, r.pin || `(실패: ${r.error})`])]
      downloadCsv(`임시PIN_${new Date().toISOString().slice(0, 10)}.csv`, rows)
      alert(`${data.count}명에게 임시 PIN을 발급하고 CSV로 저장했어요.`)
    } catch (err) {
      alert('임시 PIN 발급 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBulkPinBusy(false)
    }
  }

  // 2026-07-16 — "PIN 설정 허용" 토글. 학생이 직접 자기 PIN을 만들 수
  // 있게 1회성으로 허용한다(api/self-set-student-pin.js가 성공 시 다시
  // false로 원복). allowed:false로 다시 누르면 허용 취소(학생이 아직
  // 설정 전이면).
  const handleTogglePinSetupAllowed = async (id, name, nextAllowed) => {
    setAllowBusyId(id)
    try {
      const res = await fetch('/api/set-pin-setup-allowed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: [id], allowed: nextAllowed, adminPin }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        throw new Error(data.error || '요청에 실패했어요.')
      }
      await loadPinStatus(students)
    } catch (err) {
      alert(`PIN 설정 ${nextAllowed ? '허용' : '허용 취소'} 중 오류가 발생했어요: ` + (err.message || err))
    } finally {
      setAllowBusyId(null)
    }
  }

  // 반별 일괄 "설정 허용" — PIN 미설정 학생이 많은 반에서 한 명씩
  // 누르지 않아도 되게. 이미 PIN이 있는 학생은 서버(set-pin-setup-
  // allowed.js)가 자동으로 걸러내므로 안전.
  const handleBulkAllowPinSetup = async (className) => {
    const targets = students.filter(s => s.className === className && !pinStatus[s.id]?.hasPinHash)
    if (targets.length === 0) { alert('이 반에는 PIN 설정이 필요한 학생이 없어요.'); return }
    if (!window.confirm(`"${className}" 반의 PIN 미설정 학생 ${targets.length}명 전원에게 PIN 설정을 허용할까요?`)) return
    try {
      const res = await fetch('/api/set-pin-setup-allowed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: targets.map(s => s.id), allowed: true, adminPin }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        throw new Error(data.error || '요청에 실패했어요.')
      }
      await loadPinStatus(students)
    } catch (err) {
      alert('일괄 허용 중 오류가 발생했어요: ' + (err.message || err))
    }
  }

  // 관리자 "잠금 해제" — pin_hash는 안 건드리고 실패카운트/잠금만 해제.
  const handleUnlockPin = async (id, name) => {
    setUnlockBusyId(id)
    try {
      const res = await fetch('/api/unlock-student-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: id, adminPin }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        throw new Error(data.error || '잠금 해제에 실패했어요.')
      }
      await loadPinStatus(students)
      alert(`"${name}" 학생의 잠금을 해제했어요.`)
    } catch (err) {
      alert('잠금 해제 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setUnlockBusyId(null)
    }
  }

  // 반별로 묶어 보여주기 — 관리자가 여러 반을 한눈에 비교할 수 있게. 미배정
  // 학생은 별도 그룹으로 맨 위에 표시해 눈에 잘 띄게 함. classList에 없는
  // (반 삭제 직후 등으로 이름이 어긋난) 학생도 별도 그룹으로 반드시 표시해
  // 전체 학생 수(헤더)·CSV에는 있는데 목록에서만 조용히 사라지는 일이 없게 함.
  const knownClassNames = new Set(classList)
  const groups = [
    { name: '⚠️ 반 미배정', students: students.filter(s => !s.className) },
    ...classList.map(c => ({ name: c, students: students.filter(s => s.className === c) })),
    { name: '❓ 알 수 없는 반 (새로고침 필요)', students: students.filter(s => s.className && !knownClassNames.has(s.className)) },
  ].filter(g => g.students.length > 0)

  const handleBulkMove = async () => {
    if (!bulkTargetClass || selected.size === 0) return
    setBulkBusy(true)
    try {
      await setStudentsClassBulk([...selected], bulkTargetClass, getClassUnitNames(bulkTargetClass)[0] || 'Unit 1')
      setSelected(new Set())
      setBulkTargetClass('')
    } catch (err) {
      alert('일괄 이동 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      refresh()
      setBulkBusy(false)
    }
  }

  const exportCsv = () => {
    const rows = [['반', '유닛', '이름'], ...students.map(s => [s.className || '미배정', s.unitName || '', s.name])]
    downloadCsv(`학생명단_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <div className="space-y-3">
      {pinResetResult && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-yellow-800">
            🔑 <span className="font-black">{pinResetResult.name}</span>의 새 PIN: <span className="font-black text-lg tracking-widest">{pinResetResult.pin}</span>
            <br /><span className="text-xs font-normal">이 화면을 닫으면 다시 볼 수 없어요 — 학생에게 지금 알려주세요.</span>
          </p>
          <button onClick={() => setPinResetResult(null)} className="text-yellow-600 font-bold text-xs btn-press flex-shrink-0">닫기</button>
        </div>
      )}
      <div className="bg-white rounded-3xl card-shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-black text-gray-700">👦 전체 학생 ({students.length}명)</p>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="text-xs text-green-600 font-bold btn-press">⬇️ CSV</button>
            <button onClick={refresh} className="text-xs text-purple-500 font-bold btn-press">🔄 새로고침</button>
          </div>
        </div>
        <button onClick={handleBulkGeneratePins} disabled={bulkPinBusy}
          className="w-full mb-3 bg-yellow-100 text-yellow-700 font-bold py-2 rounded-xl text-xs btn-press disabled:opacity-50">
          {bulkPinBusy ? '⏳ 발급 중...' : '🔑 PIN 없는 학생 전원 임시 PIN 일괄 생성 + CSV'}
        </button>

        {selected.size > 0 && (
          <div className="bg-blue-50 rounded-2xl p-3 mb-3 flex items-center gap-2 flex-wrap">
            <p className="text-xs font-bold text-blue-700">{selected.size}명 선택됨</p>
            <select value={bulkTargetClass} onChange={e => setBulkTargetClass(e.target.value)}
              className="flex-1 min-w-[8rem] border-2 border-blue-200 rounded-xl px-2 py-1.5 text-xs font-bold bg-white">
              <option value="">이동할 반 선택</option>
              {classList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={handleBulkMove} disabled={!bulkTargetClass || bulkBusy}
              className="bg-blue-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-xl text-xs btn-press">
              {bulkBusy ? '이동 중...' : '이동'}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="text-gray-400 font-bold px-2 py-1.5 text-xs btn-press">선택 해제</button>
          </div>
        )}

        {students.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">아직 등록된 학생이 없어요.</p>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {groups.map(group => (
              <div key={group.name}>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <p className="text-xs font-black text-gray-500">{group.name} ({group.students.length}명)</p>
                  {classList.includes(group.name) && (
                    <button onClick={() => handleBulkAllowPinSetup(group.name)}
                      className="text-[11px] text-yellow-700 font-bold btn-press hover:underline">
                      🔓 이 반 전체 PIN 설정 허용
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {group.students.map((s) => {
                    const status = pinStatus[s.id] // undefined면 아직 로딩 전이거나 v1.7 SQL 미적용
                    return (
                    <div key={s.id} className="bg-gray-50 rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)}
                            className="w-4 h-4 accent-blue-500" />
                          <div>
                            <p className="font-black text-gray-800">{s.name}</p>
                            <p className={`text-xs ${s.className ? 'text-gray-400' : 'text-red-500 font-bold'}`}>
                              {[s.className, s.unitName].filter(Boolean).join(' · ') || '⚠️ 반 미배정'}
                            </p>
                            {status && (
                              <p className="text-[11px] font-bold mt-0.5">
                                {status.locked && <span className="text-red-500">🔒 잠김 · </span>}
                                {status.hasPinHash
                                  ? <span className="text-green-600">✅ PIN 설정됨</span>
                                  : status.pinSetupAllowed
                                    ? <span className="text-yellow-600">🔓 학생 설정 대기중</span>
                                    : <span className="text-gray-400">⬜ PIN 미설정</span>}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          {status && !status.hasPinHash && (
                            <button onClick={() => handleTogglePinSetupAllowed(s.id, s.name, !status.pinSetupAllowed)}
                              disabled={allowBusyId === s.id}
                              className="bg-yellow-100 text-yellow-700 font-bold px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-50">
                              {allowBusyId === s.id ? '⏳' : status.pinSetupAllowed ? '🔓 허용 취소' : '🔓 설정 허용'}
                            </button>
                          )}
                          {status?.locked && (
                            <button onClick={() => handleUnlockPin(s.id, s.name)} disabled={unlockBusyId === s.id}
                              className="bg-red-100 text-red-600 font-bold px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-50">
                              {unlockBusyId === s.id ? '⏳' : '🔒 잠금 해제'}
                            </button>
                          )}
                          <button onClick={() => handleResetPin(s.id, s.name)} disabled={pinResetId === s.id}
                            className="bg-yellow-100 text-yellow-700 font-bold px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-50">
                            {pinResetId === s.id ? '⏳' : '🔑 PIN 초기화'}
                          </button>
                          {status?.hasPinHash && (
                            <button onClick={() => handleClearPin(s.id, s.name)} disabled={pinClearId === s.id}
                              className="bg-red-50 text-red-500 font-bold px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-50">
                              {pinClearId === s.id ? '⏳' : '🗑 PIN 초기화(삭제)'}
                            </button>
                          )}
                          <button onClick={() => startEdit(s.id)}
                            className="bg-blue-100 text-blue-600 font-bold px-3 py-2 rounded-xl text-xs btn-press">반 배정</button>
                          <button onClick={() => handleRemove(s.id, s.name)}
                            className="bg-red-100 text-red-500 font-bold px-3 py-2 rounded-xl text-xs btn-press">삭제</button>
                        </div>
                      </div>
                      {editing === s.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                          <select value={editClass} onChange={e => {
                              setEditClass(e.target.value)
                              setEditUnit(getClassUnitNames(e.target.value)[0] || 'Unit 1')
                            }}
                            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold bg-white">
                            <option value="">반 선택</option>
                            {classList.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {editClass && (
                            <select value={editUnit} onChange={e => setEditUnit(e.target.value)}
                              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold bg-white">
                              {getClassUnitNames(editClass).map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => setEditing(null)}
                              className="flex-1 border-2 border-gray-200 text-gray-500 font-bold py-2 rounded-xl text-xs btn-press">취소</button>
                            <button onClick={saveEdit}
                              className="flex-1 bg-blue-500 text-white font-black py-2 rounded-xl text-xs btn-press">저장</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 2026-07-09 버그 수정: UTC 기준(toISOString)이던 걸 로컬(한국) 날짜
// 기준으로 수정 — 이게 "방금 공부했는데 오늘 공부함이 안 뜬다" 버그의
// 직접 원인이었다. 자세한 설명은 wordLibrary.js의 localIsoDateStr 주석 참고.
const todayIsoStr = () => localIsoDateStr()

// v1.3 관리자 대시보드 — 반 선택 시 그 반 학생들의 누적 진행도(별/스티커/
// 클리어 단어 수/스트릭) + 최근 60일 일별 기록(오늘 공부 여부, 숙제=오늘의
// 단어 배정 완료 여부, 퀴즈 정답률, 발음 연습 횟수, 많이 틀린 단어)을
// fetchDashboardData()로 한 번에 배치 조회해서 보여줌. Supabase 동기화가
// 아직 안 된 학생(방금 가입해서 첫 동기화 전 등)은 "기록 없음"으로 표시될
// 뿐 에러가 나지 않음.
function AdminDashboard() {
  const classList = getClassNames()
  const [selectedClass, setSelectedClass] = useState(classList[0] || '')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [reportFor, setReportFor] = useState(null) // student name currently showing a generated report
  const [copied, setCopied] = useState(false)
  const [wordStatusSummary, setWordStatusSummary] = useState({}) // v1.5 — studentId -> {known,unknown,skipped,mastered}
  const [resettingId, setResettingId] = useState(null)

  const wordLookup = useMemo(() => {
    if (!selectedClass) return {}
    const units = getClassUnits(selectedClass) || []
    const map = {}
    units.forEach(u => (u.words || []).forEach(w => { map[wordSlug(w.word)] = w }))
    return map
  }, [selectedClass])

  // P7 감사(2026-07-16): 반 선택을 빠르게 바꾸면 이전 반의 느린 응답이
  // 나중에 도착해 새 반의 현황을 덮어쓸 수 있었다(stale 응답 레이스) —
  // 요청 번호 가드로 최신 선택의 응답만 반영.
  const dashLoadReqIdRef = useRef(0)

  const load = async (className) => {
    const reqId = ++dashLoadReqIdRef.current
    if (!className) { setRows([]); return }
    setLoading(true)
    try {
      // P0(2026-07-15): fetchDashboardData/fetchWordStatusSummary가 이제
      // id 배열을 받는다(예전엔 이름 배열) — 동명이인이 같은 반에 있어도
      // 서로 섞이지 않는다.
      const ids = getStudentsInClass(className).map(s => s.id)
      const [dashboardRows, wsSummary] = await Promise.all([
        fetchDashboardData(ids),
        // v1.5 — word_status 마이그레이션(supabase_v1_5_word_status.sql) 전에도
        // 안전하게 빈 객체를 반환하도록 wordLibrary.js에서 이미 처리함.
        fetchWordStatusSummary(ids).catch(() => ({})),
      ])
      if (dashLoadReqIdRef.current !== reqId) return // 더 최신 반 선택이 있음 — 버림
      setRows(dashboardRows)
      setWordStatusSummary(wsSummary)
    } catch (err) {
      if (dashLoadReqIdRef.current !== reqId) return
      alert('반 현황을 불러오는 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      if (dashLoadReqIdRef.current === reqId) setLoading(false)
    }
  }

  // v1.5.1 — "반별 진도 통계를 관리자 화면 밖으로도 볼 수 있게"(ROADMAP.md
  // 백로그). 지금까지는 학생 한 명씩 "자세히 보기"를 눌러야만 보이던 값들을
  // (오늘 공부 여부/숙제완료/퀴즈정답률/발음횟수/단어숙지현황) 반 전체
  // 한 번에 CSV로. 새 Supabase 조회 없음 — 이미 로드된 rows/wordStatusSummary
  // 를 computeStudentStats()로 가공만 함(렌더 루프와 완전히 같은 계산).
  const exportClassStatsCsv = () => {
    const header = ['이름', '오늘 공부함', '숙제 완료', '퀴즈 정답률(%)', '퀴즈 정답/전체', '발음 연습 횟수', '별', '연속학습일', '스티커', '클리어 단어', '아는 단어', '복습 필요 단어', '많이 틀린 단어(상위5)']
      .concat(['최근 7일 완료 카테고리(0~4, 오늘부터 과거순)'])
    const body = rows.map(r => {
      const { studiedToday, homeworkDone, last7, quizCorrect, quizTotal, quizAccuracy, pronAttempts, topMissed, ws } =
        computeStudentStats(r, wordStatusSummary)
      return [
        r.name,
        studiedToday ? 'O' : 'X',
        homeworkDone ? 'O' : 'X',
        quizAccuracy ?? '',
        `${quizCorrect}/${quizTotal}`,
        pronAttempts,
        r.progress?.total_stars ?? 0,
        r.progress?.streak ?? 0,
        r.progress?.stickers_count ?? 0,
        r.progress?.cleared_count ?? 0,
        ws.known,
        ws.unknown,
        topMissed.map(([slug, count]) => `${wordLookup[slug]?.word || slug}×${count}`).join(' '),
        last7.map(d => d.categories_completed).join(' '),
      ]
    })
    downloadCsv(`${selectedClass}_통계_${todayIsoStr()}.csv`, [header, ...body])
  }

  // v1.5 — 학생의 단어 숙지 상태를 전부 초기화("다시 전체 복습 대상으로
  // 포함"). 관리자가 명시적으로 요청한 학생 한 명만 지워지고, 나머지
  // 진행 기록(별/스티커/캘린더 등)은 전혀 안 건드림.
  const handleResetWordStatus = async (id, name) => {
    if (!confirm(`${name} 학생의 "알아요/모르겠어요" 표시를 전부 초기화할까요?\n(별/스티커/캘린더 등 다른 기록은 그대로 유지됩니다)`)) return
    setResettingId(id)
    try {
      await resetWordStatus(id)
      await load(selectedClass)
    } catch (err) {
      alert('초기화 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setResettingId(null)
    }
  }

  useEffect(() => { load(selectedClass) }, [selectedClass]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-3xl card-shadow p-5">
        <p className="text-sm font-black text-gray-700 mb-3">📊 반별 학생 현황</p>
        <div className="flex gap-2">
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
            className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 font-bold bg-white">
            <option value="">반 선택</option>
            {classList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => load(selectedClass)}
            className="bg-purple-100 text-purple-600 font-bold px-3 rounded-xl btn-press">🔄</button>
        </div>
        {selectedClass && rows.length > 0 && (
          <button onClick={exportClassStatsCsv}
            className="w-full mt-2 bg-green-100 text-green-700 font-bold py-2 rounded-xl text-xs btn-press">
            ⬇️ 반 전체 통계 CSV로 내보내기 ({rows.length}명)
          </button>
        )}
      </div>

      {loading && <p className="text-center text-gray-400 text-sm py-6">불러오는 중...</p>}
      {!loading && selectedClass && rows.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-6">이 반에 학생이 없어요.</p>
      )}

      {!loading && rows.map(r => {
        const { studiedToday, homeworkDone, last7, quizCorrect, quizTotal, quizAccuracy, pronAttempts, topMissed, ws } =
          computeStudentStats(r, wordStatusSummary)
        const isOpen = expanded === r.id

        return (
          <div key={r.id} className="bg-white rounded-2xl card-shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black text-gray-800">{r.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {studiedToday ? '✅ 오늘 공부함' : '⬜ 오늘 아직 안 함'} · {homeworkDone ? '✅ 숙제 완료' : '⬜ 숙제 미완료'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  😀 아는 단어 {ws.known}개 · 😅 모르는 단어 {ws.unknown}개
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-black text-yellow-600">⭐ {r.progress?.total_stars ?? 0}</p>
                <p className="text-xs text-orange-400">🔥 {r.progress?.streak ?? 0}일 연속</p>
              </div>
            </div>
            <button onClick={() => setExpanded(isOpen ? null : r.id)}
              className="mt-2 text-xs text-blue-500 font-bold btn-press">
              {isOpen ? '접기 ▲' : '자세히 보기 ▼'}
            </button>
            {isOpen && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-black text-gray-500 mb-1">최근 7일 (숫자 = 0~4개 미션 완료)</p>
                  {last7.length === 0 ? (
                    <p className="text-gray-400 text-xs">기록 없음 (아직 동기화 전이거나 공부한 적 없음)</p>
                  ) : (
                    <div className="flex gap-1">
                      {last7.map(d => (
                        <div key={d.date} title={d.date}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${
                            d.categories_completed >= 4 ? 'bg-green-400 text-white' :
                            d.categories_completed > 0  ? 'bg-yellow-200 text-yellow-700' :
                                                          'bg-gray-100 text-gray-400'}`}>
                          {d.categories_completed}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p>퀴즈 정답률: <span className="font-black">{quizAccuracy !== null ? `${quizAccuracy}% (${quizCorrect}/${quizTotal})` : '기록 없음'}</span></p>
                <p>발음 연습 횟수: <span className="font-black">{pronAttempts}회</span></p>
                <p>스티커 <span className="font-black">{r.progress?.stickers_count ?? 0}개</span> · 클리어한 단어 <span className="font-black">{r.progress?.cleared_count ?? 0}개</span></p>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-black text-gray-500 mb-1">단어 숙지 상태 (Skip 기능)</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs">
                      😀 아는 단어 <span className="font-black">{ws.known}</span> · 😅 복습 필요 <span className="font-black text-orange-500">{ws.unknown}</span>
                    </p>
                    <button onClick={() => handleResetWordStatus(r.id, r.name)} disabled={resettingId === r.id}
                      className="text-xs text-gray-400 font-bold btn-press hover:text-red-500 disabled:opacity-50">
                      {resettingId === r.id ? '⏳ 초기화 중...' : '🔄 전체 초기화'}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-black text-gray-500 mb-1">많이 틀린 단어</p>
                  {topMissed.length === 0 ? <p className="text-gray-400 text-xs">없음</p> : (
                    <div className="flex flex-wrap gap-1">
                      {topMissed.map(([slug, count]) => (
                        <span key={slug} className="bg-red-50 text-red-600 rounded-lg px-2 py-1 text-xs font-bold">
                          {wordLookup[slug]?.word || slug} ×{count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={() => { setReportFor(reportFor === r.id ? null : r.id); setCopied(false) }}
                  className="w-full bg-pink-100 text-pink-600 font-bold py-2 rounded-xl text-xs btn-press">
                  📝 {reportFor === r.id ? '리포트 닫기' : '학부모 리포트 만들기'}
                </button>
                {reportFor === r.id && (() => {
                  const report = buildWeeklyReport({
                    name: r.name, last7, quizAccuracy, quizCorrect, quizTotal, pronAttempts,
                    progress: r.progress, topMissed, wordLookup,
                  })
                  return (
                    <div className="bg-pink-50 rounded-xl p-3">
                      <pre className="whitespace-pre-wrap text-xs text-gray-700 font-sans mb-2">{report}</pre>
                      <button onClick={() => {
                          navigator.clipboard?.writeText(report).then(() => setCopied(true)).catch(() => {})
                        }}
                        className="w-full bg-pink-500 text-white font-bold py-2 rounded-xl text-xs btn-press">
                        {copied ? '✅ 복사됨!' : '📋 복사하기'}
                      </button>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-lg">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="font-black text-xl text-gray-800 mb-2">오류가 발생했어요</h2>
            <p className="text-xs text-gray-400 mb-4 break-all">{String(this.state.error)}</p>
            <button onClick={() => this.setState({ hasError: false, error: null })}
              className="bg-purple-500 text-white font-black py-3 px-6 rounded-2xl">
              다시 시도
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Column mapping is ALWAYS by header name, never by position/guessing — a
// "No" column (row numbers 1, 2, 3...) was previously being mistaken for a
// class name column, which created bogus classes literally named "1", "2",
// etc. The class a word belongs to always comes from the class selected in
// the admin UI (selectedClass), never from anything in the file.
const HEADER_ALIASES = {
  word:    ['word', '단어', '영단어'],
  meaning: ['meaning', '뜻', '의미', '한글뜻'],
  unit:    ['unit', '유닛'],
  // "no"/"번호" is recognized only so it can be explicitly ignored — it's
  // a row number, never a word/meaning/class.
  no:      ['no', '번호'],
}

function detectHeaderMap(row) {
  const norm = (row || []).map(cell => String(cell ?? '').trim().toLowerCase())
  const map = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = norm.findIndex(h => aliases.includes(h))
    if (idx !== -1) map[field] = idx
  }
  return map
}

function parseExcelRows(rows, selectedClass = '') {
  if (!rows.length) return []

  // If the first row's headers match known names, use them to map columns
  // exactly and skip that row as data. Otherwise fall back to a plain
  // "word, meaning" (or "unit, word, meaning") positional guess — but
  // NEVER treat any column as a class name.
  const headerMap = detectHeaderMap(rows[0])
  const hasHeader = headerMap.word !== undefined && headerMap.meaning !== undefined
  const dataRows = hasHeader ? rows.slice(1) : rows

  return dataRows
    .map(r => {
      if (!Array.isArray(r) || r.length === 0) return null
      const values = r.map((cell) => (cell == null ? '' : String(cell).trim()))
      let word = '', meaning = '', unit = ''

      if (hasHeader) {
        word    = headerMap.word    !== undefined ? values[headerMap.word]    : ''
        meaning = headerMap.meaning !== undefined ? values[headerMap.meaning] : ''
        unit    = headerMap.unit   !== undefined ? values[headerMap.unit]     : ''
      } else if (values.length >= 3) {
        const isUnit = /^(unit|유닛)\s*\d*/i.test(values[0])
        if (isUnit) { unit = values[0]; word = values[1]; meaning = values[2] }
        else { word = values[0]; meaning = values[1] }
      } else {
        word = values[0]; meaning = values[1]
      }

      return { className: selectedClass, unit: unit || 'Unit 1', word, meaning }
    })
    .filter(r => r && r.word && r.meaning)
}

function ExcelUpload({ onDone }) {
  const [selectedClass, setSelectedClass] = useState('')
  const [preview, setPreview]             = useState(null)
  const [saving, setSaving]               = useState(false)
  const fileRef                           = useRef()
  const classList                         = getClassNames()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const data = await file.arrayBuffer()
    const wb   = XLSX.read(data)
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    // Class always comes from the dropdown above — never from the file.
    setPreview(parseExcelRows(rows, selectedClass))
  }

  const handleSave = async () => {
    const targetClass = selectedClass.trim()
    if (!targetClass) { alert('반을 선택해주세요!'); return }
    if (!preview || preview.length === 0) { alert('저장할 단어가 없어요. 파일 내용을 확인해주세요!'); return }

    // De-dupe within this one upload (case-insensitive on the word) — an
    // accidental double row would otherwise create duplicate quiz options.
    const byUnit = {}
    let skippedDupes = 0
    preview.forEach(r => {
      const u = r.unit || 'Unit 1'
      if (!byUnit[u]) byUnit[u] = { seen: new Set(), words: [] }
      const key = r.word.toLowerCase()
      if (byUnit[u].seen.has(key)) { skippedDupes++; return }
      byUnit[u].seen.add(key)
      byUnit[u].words.push({ word: r.word, meaning: r.meaning })
    })

    // Saving to a unit that already has words REPLACES them entirely
    // (setClassWords deletes-then-inserts) — confirm first so a wrong file
    // pick can't silently wipe existing data.
    const unitsWithExisting = Object.keys(byUnit).filter(u => getClassWords(targetClass, u).length > 0)
    if (unitsWithExisting.length > 0) {
      const ok = window.confirm(
        `"${targetClass}" 반의 ${unitsWithExisting.join(', ')}에 이미 단어가 있어요.\n` +
        `업로드하면 기존 단어는 모두 지워지고 새 파일 내용으로 바뀝니다. 계속할까요?`
      )
      if (!ok) return
    }

    setSaving(true)
    try {
      let totalWords = 0
      for (const [unit, { words }] of Object.entries(byUnit)) {
        await setClassWords(targetClass, words, unit)
        totalWords += words.length
      }
      alert(`"${targetClass}" 반에 ${totalWords}개 단어 저장 완료!` + (skippedDupes > 0 ? `\n(중복 단어 ${skippedDupes}개는 제외했어요)` : ''))
      onDone()
    } catch (err) {
      alert('저장 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-2xl p-4 text-sm text-blue-700 font-bold">
        <p>📋 지원하는 컬럼 (첫 줄이 헤더일 때):</p>
        <p className="text-xs mt-1 font-normal">No/번호 (무시됨) · Word/단어 · Meaning/뜻 · Unit/유닛 (선택, 없으면 Unit 1)</p>
        <p className="text-xs mt-2 text-blue-500 font-normal">※ 반은 항상 아래에서 선택한 반으로 저장돼요 — 엑셀 안의 어떤 칸도 반 이름으로 쓰지 않습니다.</p>
      </div>

      <div className="space-y-2">
        <p className="font-black text-gray-700 text-sm">① 반 선택</p>
        <select
          value={selectedClass}
          onChange={e => { setSelectedClass(e.target.value); setPreview(null) }}
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
          <button onClick={handleSave} disabled={saving || !selectedClass}
            className="w-full bg-blue-500 text-white font-black py-4 rounded-2xl btn-press hover:bg-blue-600 disabled:opacity-50">
            {saving ? '⏳ 저장 중...' : `💾 "${selectedClass}" 반에 저장`}
          </button>
        </div>
      )}
    </div>
  )
}

function PdfUpload({ onDone }) {
  const [text, setText]     = useState('')
  const [cls, setCls]       = useState('')
  const [unit, setUnit]     = useState('')
  const [loading, setLoad]  = useState(false)
  const [words, setWords]   = useState([])
  const [saving, setSaving] = useState(false)
  const fileRef             = useRef()
  const classList           = getClassNames()

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

  const handleSave = async () => {
    if (!cls) { alert('반을 선택해주세요!'); return }
    if (!unit) { alert('유닛을 선택해주세요!'); return }
    if (!words.length) { alert('먼저 [단어 파싱] 버튼을 눌러주세요!'); return }

    // Same de-dupe + overwrite-confirm safeguards as the Excel upload.
    const seen = new Set()
    const deduped = words.filter(w => {
      const key = w.word.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const skippedDupes = words.length - deduped.length

    if (getClassWords(cls, unit).length > 0) {
      const ok = window.confirm(
        `"${cls}" 반의 ${unit}에 이미 단어가 있어요.\n업로드하면 기존 단어는 모두 지워지고 새 내용으로 바뀝니다. 계속할까요?`
      )
      if (!ok) return
    }

    setSaving(true)
    try {
      await setClassWords(cls, deduped, unit)
      alert(`"${cls}" 반 ${unit}에 ${deduped.length}개 단어 저장 완료!` + (skippedDupes > 0 ? `\n(중복 단어 ${skippedDupes}개는 제외했어요)` : ''))
      onDone()
    } catch (err) {
      alert('저장 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
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
              <select value={cls} onChange={e => {
                  const next = e.target.value
                  setCls(next)
                  setUnit(getClassUnitNames(next)[0] || 'Unit 1')
                }}
                className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-orange-500 bg-white">
                <option value="">-- 반을 선택하세요 --</option>
                {classList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {cls && (
                <select value={unit} onChange={e => setUnit(e.target.value)}
                  className="w-full border-2 border-orange-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:border-orange-500 bg-white">
                  {getClassUnitNames(cls).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              )}
              <button onClick={handleSave} disabled={saving}
                className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl btn-press hover:bg-orange-600 disabled:opacity-50">
                {saving ? '⏳ 저장 중...' : `💾 관리자 확인 후 저장 (${words.length}개)`}
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
  const [checkingPin, setCheckingPin] = useState(false)
  const [tab, setTab]         = useState('classes') // classes | excel | pdf | features | testpaper | debug (debug is hidden — not in the visible tab bar, reached via 5x tap on the title)
  const [titleTapCount, setTitleTapCount] = useState(0)
  const titleTapTimer = useRef(null)

  const handleTitleTap = () => {
    setTitleTapCount((c) => {
      const next = c + 1
      if (titleTapTimer.current) clearTimeout(titleTapTimer.current)
      if (next >= 5) { setTab('debug'); titleTapTimer.current = null; return 0 }
      titleTapTimer.current = setTimeout(() => setTitleTapCount(0), 1500)
      return next
    })
  }
  const [classes, setClasses] = useState(() => getClassNames())
  const [viewClass, setView]  = useState(null)
  const [viewUnit, setViewUnit] = useState('Unit 1')
  const [newClassName, setNewClassName] = useState('')
  const [newUnitName, setNewUnitName] = useState('')
  const [newWord, setNewWord] = useState('')
  const [newMeaning, setNewMeaning] = useState('')
  const [newExample, setNewExample] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [renamingClass, setRenamingClass] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const refresh = () => {
    setClasses(getClassNames())
    if (viewClass) {
      const units = getClassUnitNames(viewClass)
      if (!units.includes(viewUnit)) setViewUnit(units[0] || 'Unit 1')
    }
  }

  const startRename = (c) => { setRenamingClass(c); setRenameValue(c) }

  const saveRename = async () => {
    const next = renameValue.trim()
    if (!next) return alert('반 이름을 입력해주세요!')
    try {
      await renameClass(renamingClass, next)
      if (viewClass === renamingClass) setView(next)
      setRenamingClass(null)
      refresh()
    } catch (err) {
      alert('반 이름 수정 중 오류가 발생했어요: ' + (err.message || err))
    }
  }

  const handlePin = async () => {
    setCheckingPin(true)
    try {
      const res = await fetch('/api/verify-admin-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (data.ok) setAuthed(true)
      else { alert('비밀번호가 틀렸어요!'); setPin('') }
    } catch (err) {
      alert('확인 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setCheckingPin(false)
    }
  }

  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="bg-white rounded-3xl card-shadow p-8 w-full max-w-xs text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-black text-xl text-gray-800 mb-6">관리자 로그인</h2>
        <input type="password" value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !checkingPin && handlePin()}
          placeholder="비밀번호" maxLength={8}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-bold text-center focus:outline-none focus:border-purple-400 mb-3" autoFocus />
        <button onClick={handlePin} disabled={checkingPin}
          className="w-full bg-purple-500 text-white font-black py-3 rounded-2xl btn-press mb-3 disabled:opacity-50">
          {checkingPin ? '⏳ 확인 중...' : '로그인'}
        </button>
        <button onClick={onBack} className="text-gray-400 font-bold text-sm btn-press">← 돌아가기</button>
      </div>
    </div>
  )

  return (
    <ErrorBoundary>
    <div className="min-h-screen p-4 pb-8 bg-gray-50">
      <div className="max-w-lg mx-auto">
        <div className="no-print flex items-center gap-3 pt-2 mb-6">
          <button onClick={onBack} className="text-gray-500 font-bold btn-press">← 나가기</button>
          <h1 className="text-2xl font-black text-gray-800 select-none" onClick={handleTitleTap}>⚙️ 관리자</h1>
        </div>

        {tab === 'debug' && (
          <div className="no-print mb-3 flex items-center gap-2 bg-yellow-100 rounded-xl px-3 py-2">
            <span className="text-xs font-black text-yellow-800">🔧 숨김 디버그 탭</span>
            <button onClick={() => setTab('classes')} className="text-xs font-bold text-yellow-700 underline btn-press">탭 목록으로</button>
          </div>
        )}

        {/* Tabs */}
        <div className="no-print flex gap-2 mb-6 overflow-x-auto">
          {[['classes','📚 반 관리'],['students','👦 학생 관리'],['dashboard','📊 대시보드'],['entrance','🏁 입실시험'],['excel','📊 Excel'],['pdf','📄 PDF'],['testpaper','📝 시험지'],['features','🎯 기능']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`py-2 px-3 rounded-xl font-black text-sm btn-press transition-colors whitespace-nowrap ${tab === k ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 border-2 border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Classes tab */}
        {tab === 'classes' && (
          <div className="space-y-3">
            <SpellingReviewQueuePanel onChanged={refresh} />

            <div className="bg-white rounded-3xl card-shadow p-5">
              <p className="text-sm font-black text-gray-700 mb-3">새 반 추가하기</p>
              <div className="flex gap-2">
                <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)}
                  placeholder="반 이름 입력 (예: Basic 1)"
                  className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                <button onClick={async () => {
                    const name = newClassName.trim()
                    if (!name) return alert('반 이름을 입력해주세요!')
                    if (classes.includes(name)) return alert('이미 있는 반 이름이에요.')
                    try {
                      await createClass(name)
                      setNewClassName('')
                      refresh()
                    } catch (err) {
                      alert('반 추가 중 오류가 발생했어요: ' + (err.message || err))
                    }
                  }}
                  className="bg-purple-500 text-white font-black px-4 py-3 rounded-xl btn-press hover:bg-purple-600">
                  추가
                </button>
              </div>
            </div>

            {classes.length === 0 ? (
              <div className="bg-white rounded-3xl card-shadow p-8 text-center">
                <div className="text-5xl mb-3">📭</div>
                <p className="font-bold text-gray-500">아직 반이 없어요.</p>
                <p className="text-sm text-gray-400 mt-1">아래에서 새 반을 추가해보세요!</p>
              </div>
            ) : (
            <div className="space-y-4">
              {(classes || []).map(c => {
                const units = getClassUnits(c) || []
                const totalWords = units.reduce((sum, unit) => sum + (unit?.words?.length ?? 0), 0)
                const unitNames = getClassUnitNames(c) || []
                const isOpen = viewClass === c
                const activeUnit = isOpen ? viewUnit : (unitNames[0] || 'Unit 1')
                const words = getClassWords(c, activeUnit) || []
                const studentsInClass = isOpen ? getStudentsInClass(c) : []
                const todaysAssigned = isOpen ? new Set(getTodaysAssignmentWordIds(c)) : new Set()
                const toggleTodaysWord = async (slug) => {
                  const current = getTodaysAssignmentWordIds(c)
                  const next = current.includes(slug) ? current.filter(id => id !== slug) : [...current, slug]
                  try {
                    await setTodaysAssignment(c, next)
                    refresh()
                  } catch (err) {
                    alert('오늘의 단어 배정 중 오류가 발생했어요: ' + (err.message || err))
                  }
                }
                return (
                  <div key={c} className="bg-white rounded-2xl card-shadow p-4">
                    <div className="flex items-center justify-between">
                      {renamingClass === c ? (
                        <div className="flex gap-2 flex-1 mr-2">
                          <input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveRename()}
                            className="flex-1 border-2 border-purple-300 rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-purple-500"
                            autoFocus />
                          <button onClick={saveRename} className="bg-purple-500 text-white font-black px-3 py-2 rounded-xl text-sm btn-press">저장</button>
                          <button onClick={() => setRenamingClass(null)} className="border-2 border-gray-200 text-gray-500 font-bold px-3 py-2 rounded-xl text-sm btn-press">취소</button>
                        </div>
                      ) : (
                        <div>
                          <p className="font-black text-gray-800">{c}</p>
                          <p className="text-sm text-gray-400">{units.length}개 유닛 · {totalWords}개 단어 · 학생 {getStudentsInClass(c).length}명</p>
                        </div>
                      )}
                      {renamingClass !== c && (
                        <div className="flex gap-2">
                          <button onClick={() => {
                              const next = isOpen ? null : c
                              setView(next)
                              if (next) setViewUnit(unitNames[0] || 'Unit 1')
                            }}
                            className="bg-blue-100 text-blue-600 font-bold px-3 py-2 rounded-xl text-sm btn-press">
                            {isOpen ? '닫기' : '보기'}
                          </button>
                          <button onClick={() => startRename(c)}
                            className="bg-gray-100 text-gray-600 font-bold px-3 py-2 rounded-xl text-sm btn-press">
                            이름 수정
                          </button>
                          <button onClick={() => setConfirmDelete(c)}
                            className="bg-red-100 text-red-500 font-bold px-3 py-2 rounded-xl text-sm btn-press">
                            삭제
                          </button>
                        </div>
                      )}
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
                            <button onClick={async () => {
                              const name = newUnitName.trim()
                              if (!name) return alert('유닛 이름을 입력해주세요.')
                              if (unitNames.includes(name)) return alert('이미 있는 유닛이에요.')
                              try {
                                await addClassUnit(c, name)
                                setNewUnitName('')
                                setViewUnit(name)
                                refresh()
                              } catch (err) {
                                alert('유닛 추가 중 오류가 발생했어요: ' + (err.message || err))
                              }
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
                          {(words || []).length === 0 ? (
                            <p className="text-gray-400 text-sm">이 유닛에 단어가 아직 없습니다.</p>
                          ) : (words || []).map((w, i) => {
                            const slug = wordSlug(w.word)
                            const isAssigned = todaysAssigned.has(slug)
                            return (
                              <div key={i} className="flex items-center gap-3 py-1 border-b border-gray-100 last:border-0 text-sm">
                                <button onClick={() => toggleTodaysWord(slug)}
                                  className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center text-xs btn-press ${isAssigned ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-300 text-transparent'}`}>
                                  ✓
                                </button>
                                <span className="font-bold text-gray-800 min-w-0">{w.word}</span>
                                <span className="text-gray-500 min-w-0 flex-1">{w.meaning}</span>
                                {/* v2.0 단어별 "추가 인정 뜻" 편집 — 등록된 뜻(meaning)
                                    외에 채점에서 정답으로 인정할 표기를 쉼표로 구분해
                                    관리. prompt 기반 최소 UI(관리자 전용, 사용 빈도 낮음
                                    — 주 경로는 위 "쓰기 답안 검토" 패널의 원클릭 인정). */}
                                <button onClick={async () => {
                                    const cur = Array.isArray(w.acceptedMeanings) ? w.acceptedMeanings : []
                                    const raw = window.prompt(
                                      `"${w.word}"의 추가 인정 뜻 (쉼표로 구분, 비우면 전부 삭제)\n등록 뜻: ${w.meaning}`,
                                      cur.join(', '))
                                    if (raw === null) return // 취소
                                    try {
                                      await setWordAcceptedMeanings(w.id, raw.split(',').map(s => s.trim()).filter(Boolean))
                                      refresh()
                                    } catch (err) {
                                      alert('저장 중 오류가 발생했어요 (v2.0 SQL 미실행일 수 있음): ' + (err.message || err))
                                    }
                                  }}
                                  className={`flex-shrink-0 text-[11px] font-bold px-2 py-1.5 rounded-lg btn-press border-2 ${
                                    (w.acceptedMeanings || []).length > 0
                                      ? 'bg-green-50 border-green-200 text-green-600'
                                      : 'bg-white border-gray-200 text-gray-400'
                                  }`}>
                                  인정뜻 {(w.acceptedMeanings || []).length > 0 ? (w.acceptedMeanings || []).length : '+'}
                                </button>
                              </div>
                            )
                          })}
                        </div>

                        <div className="bg-teal-50 rounded-xl p-3 flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs text-teal-700">
                            <span className="font-black">📌 오늘의 단어:</span>{' '}
                            {todaysAssigned.size > 0 ? `${todaysAssigned.size}개 지정됨 (체크박스로 선택)` : '지정 안 함 (학생은 유닛 전체 단어를 봐요)'}
                          </p>
                          <div className="flex gap-2 flex-shrink-0">
                            {/* 운영자 목표 9 — "유닛 전체를 오늘 숙제로" 원클릭. 기존
                                setTodaysAssignment 그대로 재사용(체크박스와 같은 저장
                                경로) — 지금 보고 있는 유닛(viewUnit/words)의 단어 전체를
                                slug 배열로 바꿔서 한 번에 넘길 뿐, 새 배정 개념 없음. */}
                            {words.length > 0 && (
                              <button onClick={async () => {
                                  try { await setTodaysAssignment(c, words.map(w => wordSlug(w.word))); refresh() }
                                  catch (err) { alert('배정 중 오류가 발생했어요: ' + (err.message || err)) }
                                }}
                                className="bg-teal-500 text-white font-bold px-2 py-1 rounded-lg text-xs btn-press hover:bg-teal-600">
                                이 유닛 전체 배정
                              </button>
                            )}
                            {todaysAssigned.size > 0 && (
                              <button onClick={async () => {
                                  try { await setTodaysAssignment(c, []); refresh() }
                                  catch (err) { alert('해제 중 오류가 발생했어요: ' + (err.message || err)) }
                                }}
                                className="bg-white border-2 border-teal-300 text-teal-600 font-bold px-2 py-1 rounded-lg text-xs btn-press">
                                전체 해제
                              </button>
                            )}
                          </div>
                        </div>

                        <FutureAssignmentPlanner targetClass={c} words={words} />

                        <SpellingSettingsPanel targetClass={c} onSaved={refresh} />

                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs font-black text-gray-500 mb-2">👦 이 반 학생 ({studentsInClass.length}명)</p>
                          {studentsInClass.length === 0 ? (
                            <p className="text-gray-400 text-sm">아직 이 반에 배정된 학생이 없어요.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {studentsInClass.map(s => (
                                <span key={s.id} className="bg-white border-2 border-gray-200 rounded-xl px-3 py-1 text-sm font-bold text-gray-700">
                                  {s.name} <span className="text-gray-400 font-normal">· {s.unitName}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={newWord} onChange={e => setNewWord(e.target.value)}
                            placeholder="단어"
                            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                          <input type="text" value={newMeaning} onChange={e => setNewMeaning(e.target.value)}
                            placeholder="뜻"
                            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                        </div>
                        <input type="text" value={newExample} onChange={e => setNewExample(e.target.value)}
                          placeholder="예문 (선택사항 — 비워두면 AI가 자동 생성해요)"
                          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                        <button onClick={async () => {
                            if (!newWord.trim() || !newMeaning.trim()) return alert('단어와 뜻을 모두 입력해주세요.')
                            try {
                              const existing = getClassWords(c, viewUnit)
                              await setClassWords(c, [...existing, { word: newWord.trim(), meaning: newMeaning.trim(), example: newExample.trim() }], viewUnit)
                              setNewWord('')
                              setNewMeaning('')
                              setNewExample('')
                              refresh()
                            } catch (err) {
                              alert('단어 추가 중 오류가 발생했어요: ' + (err.message || err))
                            }
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

        {tab === 'students' && <StudentManagement adminPin={pin} />}
        {tab === 'dashboard' && <AdminDashboard />}
        {tab === 'entrance' && <EntranceTestAdmin />}
        {tab === 'excel' && <ExcelUpload onDone={() => { refresh(); setTab('classes') }} />}
        {tab === 'pdf'   && <PdfUpload   onDone={() => { refresh(); setTab('classes') }} />}
        {tab === 'testpaper' && <TestPaperGenerator />}
        {tab === 'features' && <FeatureManagementPanel />}
        {tab === 'debug' && <DebugPage />}
      </div>
    </div>

    {/* 반 삭제 확인 다이얼로그 */}
    {confirmDelete && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl p-6 max-w-sm w-full card-shadow">
          <div className="text-4xl text-center mb-3">🗑️</div>
          <h3 className="font-black text-gray-800 text-lg text-center mb-2">반 삭제</h3>
          <p className="text-gray-600 text-sm text-center mb-1"><span className="font-black text-red-500">"{confirmDelete}"</span></p>
          <p className="text-gray-500 text-sm text-center mb-5">이 반과 연결된 단어/Unit/학습기록이 함께 삭제됩니다. 정말 삭제하시겠습니까?</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl btn-press">
              취소
            </button>
            <button onClick={async () => {
              try {
                await deleteClass(confirmDelete)
                if (viewClass === confirmDelete) setView(null)
                setConfirmDelete(null)
                refresh()
              } catch (err) {
                alert('반 삭제 중 오류가 발생했어요: ' + (err.message || err))
              }
            }}
              className="flex-1 bg-red-500 text-white font-black py-3 rounded-2xl btn-press hover:bg-red-600">
              삭제
            </button>
          </div>
        </div>
      </div>
    )}
    </ErrorBoundary>
  )
}
