import React, { useState, useEffect, useMemo } from 'react'
import {
  getClassNames, getClassUnitNames, getStudentClass, getStudentUnit,
  setStudentClass, setStudentUnit, setStudentsClassBulk, setStudentHouse,
  getClassTextbooks,
} from '../../utils/wordLibrary'
// House System(2026-07-19, 게임화 하위카드 8번) — 학생 로스터에 최소
// 하우스 확인/재배정 UI(HOUSES 상수만 필요, 순수 함수는 wordLibrary.js가
// 대신 소비).
import { HOUSES, getHouseById } from '../../utils/houseSystem'
import { fetchPinStatusMap } from '../../utils/pinStatusApi'
import { getStudents, removeStudent } from '../../hooks/useStudent'
import TextbookAssignmentPanel from './TextbookAssignmentPanel'

// 학생 관리 디렉터리 (2026-07-22, 관리자 규모 대응 — 300~1000명) —
// AdminScreen.jsx의 StudentManagement를 그대로 옮겨온 컴포넌트.
// 핸들러/데이터 흐름(반 배정/삭제/PIN 4종/하우스/교재 관리/일괄 이동/CSV)은
// 전부 기존 코드 그대로이고, "렌더링 구조"만 규모에 맞게 재구성했다:
//
// 1. 기본 화면 = 반 그룹 아코디언(한 번에 한 반만 펼침) — 학생 카드를
//    처음부터 전부 렌더하지 않아 DOM 크기가 "펼친 반 하나"로 제한된다
//    (가상화 라이브러리 불필요 — CLAUDE.md 규칙 6, 신규 의존성 금지).
// 2. 검색(학생 이름/반 이름/교재 이름/출판사) + 퀵필터(PIN 완료/미설정/
//    반 미배정/최근 등록) — 검색·필터 중에는 일치 학생만 반별 그룹으로
//    직접 렌더(아코디언 수동 펼침 불필요).
// 3. 마지막으로 펼친 반/필터/검색어를 sessionStorage에 기억(관리자 세션
//    한정 — 브라우저 탭 닫으면 초기화).
//
// P0(2026-07-15): getStudents()가 이제 {id,name,className,classId,
// unitName} 객체 배열을 반환한다(예전엔 이름 문자열 배열) — 이 컴포넌트의
// 모든 selection/edit 상태 키를 이름 대신 id로 쓴다(CLAUDE.md 규칙 4).
// 동명이인이 허용된 지금, 이름만으로는 어느 학생을 편집/삭제/선택 중인지
// 구분할 수 없기 때문.

// CSV 셀 안전 이스케이프 — 이름/반/유닛에 쉼표·따옴표·줄바꿈이 섞여도
// 깨지지 않게. AdminScreen.jsx의 동명 헬퍼와 같은 구현 — AdminScreen이
// 이 파일을 import하므로 역방향 import(순환)를 피하려고 로컬 사본을 둔다.
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

// sessionStorage 헬퍼 — 시크릿 모드/저장소 차단 환경에서도 크래시 없이
// 그냥 "기억 안 함"으로 동작해야 하므로 전부 try/catch.
const SS_OPEN = 'adminStudentDir.openGroup'
const SS_FILTER = 'adminStudentDir.filter'
const SS_SEARCH = 'adminStudentDir.search'
const ssGet = (key, fallback) => { try { return sessionStorage.getItem(key) ?? fallback } catch { return fallback } }
const ssSet = (key, value) => { try { sessionStorage.setItem(key, value) } catch { /* 무시 */ } }

// "최근 등록" 필터의 크기 — created_at이 학생 캐시에 없어(아래 주석) 날짜
// 기준 14일 필터가 불가능하므로, 등록순 최신 N명 폴백으로 대체.
const RECENT_COUNT = 20

const FILTERS = [
  ['all', '전체'],
  ['pin_done', 'PIN 완료'],
  ['pin_missing', 'PIN 미설정'],
  ['no_class', '반 미배정'],
  ['recent', '최근 등록'],
]

export default function StudentDirectory({ adminPin }) {
  const [students, setStudents] = useState(() => getStudents())
  const [editing, setEditing] = useState(null) // student id currently being reassigned
  const [editClass, setEditClass] = useState('')
  const [editUnit, setEditUnit] = useState('')
  // v2.9 다중 교재 — 교재 관리 패널을 펼쳐서 보고 있는 학생 id(한 번에 한
  // 명만, editing과 같은 패턴).
  const [textbookManaging, setTextbookManaging] = useState(null)
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
  // 파괴적 액션(학생 삭제/PIN 삭제)을 담는 카드별 "⋯" 오버플로 메뉴 —
  // 열려 있는 카드 id(한 번에 하나). 핸들러는 기존 handleRemove/
  // handleClearPin 그대로, 버튼 위치만 메뉴 안으로 이동(오터치 방지).
  const [menuOpenId, setMenuOpenId] = useState(null)
  const classList = getClassNames()

  // ── 디렉터리 렌더링 상태(2026-07-22 신규 — 동작 아님, 표시만) ──────────
  // sessionStorage에서 복원: 마지막으로 펼친 반 / 퀵필터 / 검색어.
  const [openGroup, setOpenGroup] = useState(() => ssGet(SS_OPEN, '') || null)
  const [filter, setFilterState] = useState(() => {
    const saved = ssGet(SS_FILTER, 'all')
    return FILTERS.some(([k]) => k === saved) ? saved : 'all'
  })
  const [search, setSearchState] = useState(() => ssGet(SS_SEARCH, ''))

  const toggleGroup = (name) => setOpenGroup(prev => {
    const next = prev === name ? null : name // 단일 펼침 아코디언 — 이전에 열린 반은 자동으로 닫힘
    ssSet(SS_OPEN, next || '')
    return next
  })
  const setFilter = (value) => { setFilterState(value); ssSet(SS_FILTER, value) }
  const setSearch = (value) => { setSearchState(value); ssSet(SS_SEARCH, value) }

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

  // House System(2026-07-19) — 재배정. select onChange가 바로 저장(반/유닛
  // 배정처럼 "편집 모드 진입 → 저장" 2단계가 아니라, 값 하나만 바꾸는
  // 최소 UI라 즉시 반영이 더 간단하다). 컬럼 부재(v2.7 SQL 미실행)면
  // setStudentHouse가 DB 에러를 던지므로 alert로 안내만 하고 크래시 없음.
  const [houseBusyId, setHouseBusyId] = useState(null)
  const handleHouseChange = async (id, value) => {
    setHouseBusyId(id)
    try {
      await setStudentHouse(id, value === '' ? null : Number(value))
      refresh()
    } catch (err) {
      alert('하우스 배정 중 오류가 발생했어요: ' + (err.message || err) + ' (supabase_v2_7_house_system.sql 실행 여부를 확인해주세요)')
    } finally {
      setHouseBusyId(null)
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
  // 접근 가능, 서버에도 평문으로 남지 않음(api/admin-pin-actions.js의
  // bulk_generate_temp_pins 액션).
  const handleBulkGeneratePins = async () => {
    if (!window.confirm('PIN이 아직 없는 모든 학생에게 임시 PIN을 새로 발급할까요?')) return
    setBulkPinBusy(true)
    try {
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // P7 감사 후속 — 평문 PIN 목록을 받는 가장 민감한 응답이라 요청마다
        // 서버에서 adminPin 재검증. 2026-07-20: admin-pin-actions.js로 통합
        // (Vercel Hobby 함수 개수 한도 대응, handoff.md 참고).
        body: JSON.stringify({ action: 'bulk_generate_temp_pins', adminPin }),
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
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_pin_setup_allowed', studentIds: [id], allowed: nextAllowed, adminPin }),
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
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_pin_setup_allowed', studentIds: targets.map(s => s.id), allowed: true, adminPin }),
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
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlock_student_pin', studentId: id, adminPin }),
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

  // ── 그룹핑 (기존 로직 그대로) ────────────────────────────────────────
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

  // ── 검색/필터 (2026-07-22 신규 — 조회 전용, 새 API 호출 없음) ─────────
  // 반 id -> "반 이름 + 연결된 교재 이름/출판사" 소문자 검색 문자열.
  // getClassTextbooks는 이미 메모리에 로드된 캐시(refreshTextbooks)만 읽는
  // 동기 함수라 추가 네트워크 비용이 없다. v3.1 SQL 미실행(합성 폴백)
  // 상태에서도 "반 이름 = 교재 이름"인 합성 교재가 반환되므로 안전.
  const classSearchText = useMemo(() => {
    const map = {}
    for (const s of students) {
      if (!s.classId || map[s.classId] !== undefined) continue
      const textbooks = getClassTextbooks(s.classId) || []
      map[s.classId] = [s.className, ...textbooks.flatMap(t => [t.name, t.publisherName])]
        .filter(Boolean).join(' ').toLowerCase()
    }
    return map
  }, [students])

  // "최근 등록" — students 캐시(wordLibrary.js refreshStudents)에 created_at
  // 컬럼이 포함되지 않아(select: id,name,class_id,unit_name,...) 날짜 기준
  // 14일 필터가 불가능하다. 대신 refreshStudents가 .order('created_at')
  // (오름차순)으로 조회하고 Map/배열이 그 순서를 보존하므로, "배열 뒤쪽
  // N명 = 가장 최근 등록 N명" 폴백을 쓴다(문서화된 의도적 폴백 —
  // wordLibrary.js는 이 작업 범위에서 수정 금지 파일).
  const recentIds = useMemo(
    () => new Set(students.slice(-RECENT_COUNT).map(s => s.id)),
    [students],
  )

  const query = search.trim().toLowerCase()
  const isFiltering = query !== '' || filter !== 'all'

  const matchesStudent = (s) => {
    if (query) {
      const nameHit = s.name.toLowerCase().includes(query)
      const classHit = s.classId ? (classSearchText[s.classId] || '').includes(query) : false
      // 반 미배정 학생도 (빈) 반 이름이 아니라 이름으로만 검색되게.
      if (!nameHit && !classHit) return false
    }
    // PIN 필터 의미는 기존 handleBulkAllowPinSetup과 동일 기준:
    // "완료" = hasPinHash truthy, "미설정" = !hasPinHash (상태 미로드 포함).
    if (filter === 'pin_done' && !pinStatus[s.id]?.hasPinHash) return false
    if (filter === 'pin_missing' && pinStatus[s.id]?.hasPinHash) return false
    if (filter === 'no_class' && s.className) return false
    if (filter === 'recent' && !recentIds.has(s.id)) return false
    return true
  }

  const filteredGroups = isFiltering
    ? groups.map(g => ({ ...g, students: g.students.filter(matchesStudent) })).filter(g => g.students.length > 0)
    : groups

  const filteredCount = isFiltering ? filteredGroups.reduce((sum, g) => sum + g.students.length, 0) : students.length

  // PIN 상태가 하나라도 로드됐을 때만 그룹 헤더에 "PIN 완료 n/m" 표시 —
  // v1.7 SQL 미실행/네트워크 실패면 기존 학생 카드 배지처럼 조용히 생략.
  const pinLoaded = Object.keys(pinStatus).length > 0
  const pinDoneCount = (list) => list.filter(s => pinStatus[s.id]?.hasPinHash).length

  // ── 학생 카드 (아코디언/검색 양쪽에서 재사용) ────────────────────────
  // 2026-07-22 컴팩트화: 세로 간격 축소(px-3 py-2.5), 한국어 라벨 세로
  // 줄바꿈 방지(whitespace-nowrap/break-keep), 터치 타겟 최소 40px
  // (min-h-[40px]/w-10 h-10). 파괴적 액션 2개(학생 삭제/PIN 삭제)는 "⋯"
  // 오버플로 메뉴 뒤로 이동 — 핸들러(handleRemove/handleClearPin)는 그대로.
  const renderStudentCard = (s) => {
    const status = pinStatus[s.id] // undefined면 아직 로딩 전이거나 v1.7 SQL 미적용
    const menuOpen = menuOpenId === s.id
    return (
      <div key={s.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)}
              className="w-4 h-4 mt-1 accent-blue-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-black text-gray-800 break-keep">{s.name}</p>
              <p className={`text-xs break-keep ${s.className ? 'text-gray-400' : 'text-red-500 font-bold'}`}>
                {[s.className, s.unitName].filter(Boolean).join(' · ') || '⚠️ 반 미배정'}
              </p>
              {status && (
                <p className="text-[11px] font-bold mt-0.5 whitespace-nowrap">
                  {status.locked && <span className="text-red-500">🔒 잠김 · </span>}
                  {status.hasPinHash
                    ? <span className="text-green-600">✅ PIN 설정됨</span>
                    : status.pinSetupAllowed
                      ? <span className="text-yellow-600">🔓 학생 설정 대기중</span>
                      : <span className="text-gray-400">⬜ PIN 미설정</span>}
                </p>
              )}
              {/* House System(2026-07-19, 게임화 하위카드 8번) —
                  최소 확인/재배정. select 값이 바뀌면 즉시 저장
                  (반/유닛처럼 "편집 모드" 없이 값 하나만 바꾸는
                  최소 UI). 컬럼 부재/미실행 SQL이면 house_id가
                  항상 null이라 "미배정"으로만 보임(크래시 없음). */}
              <label className="inline-flex items-center gap-1 mt-0.5">
                <span className="text-[11px] text-gray-400 font-bold whitespace-nowrap">
                  {getHouseById(s.houseId) ? `${getHouseById(s.houseId).emoji} ${getHouseById(s.houseId).name}` : '하우스 미배정'}
                </span>
                <select value={s.houseId ?? ''} disabled={houseBusyId === s.id}
                  onChange={(e) => handleHouseChange(s.id, e.target.value)}
                  className="text-[11px] font-bold border border-gray-200 rounded-lg px-1 py-0.5 bg-white disabled:opacity-50">
                  <option value="">미배정</option>
                  {HOUSES.map((h) => <option key={h.id} value={h.id}>{h.emoji} {h.name}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end items-center flex-shrink-0">
            {status && !status.hasPinHash && (
              <button onClick={() => handleTogglePinSetupAllowed(s.id, s.name, !status.pinSetupAllowed)}
                disabled={allowBusyId === s.id}
                className="bg-yellow-100 text-yellow-700 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press disabled:opacity-50 whitespace-nowrap">
                {allowBusyId === s.id ? '⏳' : status.pinSetupAllowed ? '🔓 허용 취소' : '🔓 설정 허용'}
              </button>
            )}
            {status?.locked && (
              <button onClick={() => handleUnlockPin(s.id, s.name)} disabled={unlockBusyId === s.id}
                className="bg-red-100 text-red-600 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press disabled:opacity-50 whitespace-nowrap">
                {unlockBusyId === s.id ? '⏳' : '🔒 잠금 해제'}
              </button>
            )}
            <button onClick={() => handleResetPin(s.id, s.name)} disabled={pinResetId === s.id}
              className="bg-yellow-100 text-yellow-700 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press disabled:opacity-50 whitespace-nowrap">
              {pinResetId === s.id ? '⏳' : '🔑 PIN 초기화'}
            </button>
            <button onClick={() => startEdit(s.id)}
              className="bg-blue-100 text-blue-600 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press whitespace-nowrap">반 배정</button>
            {/* v2.9 다중 교재 — 기본 반이 있어야 의미가 있으므로
                (반 미배정 학생은 "반 배정"부터 먼저) 이 학생이
                이미 어떤 반에 속해 있을 때만 노출. */}
            {s.className && (
              <button onClick={() => setTextbookManaging(textbookManaging === s.id ? null : s.id)}
                className="bg-purple-100 text-purple-600 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press whitespace-nowrap">
                📚 교재 관리
              </button>
            )}
            {/* "⋯" 오버플로 메뉴 — 파괴적 액션(학생 삭제 handleRemove /
                PIN 삭제 handleClearPin)만 이 안에. 핸들러·확인 다이얼로그는
                기존 그대로, 버튼 위치만 이동(실수 터치로 즉시 confirm이
                뜨는 것 자체를 줄이기 위해). 바깥 클릭 시 닫힘(투명 배경). */}
            <div className="relative">
              <button type="button" aria-label="더보기 (삭제 등)" aria-expanded={menuOpen}
                onClick={() => setMenuOpenId(menuOpen ? null : s.id)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl font-black text-gray-500 btn-press ${menuOpen ? 'bg-gray-200' : 'bg-gray-100'}`}>
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                  <div className="absolute right-0 top-full mt-1 z-20 min-w-[11rem] bg-white border-2 border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {status?.hasPinHash && (
                      <button onClick={() => { setMenuOpenId(null); handleClearPin(s.id, s.name) }} disabled={pinClearId === s.id}
                        className="w-full min-h-[40px] px-3 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap btn-press">
                        {pinClearId === s.id ? '⏳ 처리 중...' : '🗑 PIN 초기화(삭제)'}
                      </button>
                    )}
                    <button onClick={() => { setMenuOpenId(null); handleRemove(s.id, s.name) }}
                      className="w-full min-h-[40px] px-3 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-50 whitespace-nowrap btn-press">
                      🗑 학생 삭제
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {textbookManaging === s.id && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <TextbookAssignmentPanel studentId={s.id} onChanged={refresh} />
          </div>
        )}
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
    )
  }

  // 반별 일괄 PIN 설정 허용 버튼 — 아코디언(펼친 반 상단)과 검색/필터
  // 그룹 헤더 양쪽에서 재사용. 실제 반일 때만(특수 그룹 제외).
  const renderBulkAllowButton = (groupName) => classList.includes(groupName) && (
    <button onClick={() => handleBulkAllowPinSetup(groupName)}
      className="text-[11px] text-yellow-700 font-bold btn-press hover:underline whitespace-nowrap">
      🔓 이 반 전체 PIN 설정 허용
    </button>
  )

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

        {/* 검색 + 퀵필터 — 조회 전용(핸들러/데이터 흐름 무관), 300~1000명
            규모에서 특정 학생/반/교재를 스크롤 없이 바로 찾기 위한 것. */}
        <div className="mb-3 space-y-2">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 학생 이름 · 반 · 교재 · 출판사 검색"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-purple-400" />
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {FILTERS.map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold btn-press whitespace-nowrap transition-colors ${
                  filter === key ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 border-2 border-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

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
        ) : isFiltering ? (
          // ── 검색/필터 모드: 일치 학생만 반별 그룹으로 직접 렌더 ────────
          filteredCount === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">
              조건에 맞는 학생이 없어요.
              {filter === 'recent' && <span className="block text-xs mt-1">(최근 등록 = 등록순 최신 {RECENT_COUNT}명)</span>}
            </p>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-xs font-bold text-gray-400 px-1">
                {filteredCount}명 일치
                {filter === 'recent' && ` · 최근 등록 = 등록순 최신 ${RECENT_COUNT}명`}
              </p>
              {filteredGroups.map(group => (
                <div key={group.name}>
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <p className="text-xs font-black text-gray-500 break-keep">{group.name} ({group.students.length}명)</p>
                    {renderBulkAllowButton(group.name)}
                  </div>
                  <div className="space-y-2">
                    {group.students.map(renderStudentCard)}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          // ── 기본 모드: 반 그룹 아코디언(한 번에 한 반만 펼침) ──────────
          // 학생 카드는 펼친 반에서만 렌더 — DOM 크기가 반 하나 분량으로
          // 제한된다(1000명 규모 대응의 핵심).
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {groups.map(group => {
              const isOpen = openGroup === group.name
              return (
                <div key={group.name}>
                  <button type="button" onClick={() => toggleGroup(group.name)}
                    className={`w-full min-h-[44px] flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 btn-press ${
                      isOpen ? 'bg-purple-50 border-2 border-purple-200' : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-black text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">{group.name}</span>
                      <span className="text-xs font-bold text-gray-400 whitespace-nowrap">{group.students.length}명</span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {pinLoaded && (
                        <span className="text-[11px] font-bold text-gray-400 whitespace-nowrap">
                          PIN 완료 {pinDoneCount(group.students)}/{group.students.length}
                        </span>
                      )}
                      <span className="text-gray-400 text-xs">{isOpen ? '▼' : '▶'}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mt-1.5 space-y-2">
                      {classList.includes(group.name) && (
                        <div className="flex justify-end px-1">
                          {renderBulkAllowButton(group.name)}
                        </div>
                      )}
                      {group.students.map(renderStudentCard)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
