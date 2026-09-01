import { useState, useEffect, useMemo, useRef } from 'react'
import {
  getClassNames, getRealClassNames, getClassUnitNames, getClassIdByName, getStudentClass, getStudentUnit,
  setStudentClass, setStudentUnit, setStudentsClassBulk, setStudentHouse,
  getClassTextbooks, getTextbookUnits, getStudentClassAssignments, getTextbookById, fetchDashboardData,
} from '../../utils/wordLibrary'
// House System(2026-07-19, 게임화 하위카드 8번) — 학생 로스터에 최소
// 하우스 확인/재배정 UI(HOUSES 상수만 필요, 순수 함수는 wordLibrary.js가
// 대신 소비).
import { HOUSES, getHouseById } from '../../utils/houseSystem'
import { fetchPinStatusMap } from '../../utils/pinStatusApi'
import { getStudents } from '../../hooks/useStudent'
// 계정 종류(테스트) 판별의 단일 진실 공급원 — 2026-08-11 운영자 확정
// (accountStatus.js 헤더 주석 참고). 이 화면의 로컬 사본(Cookie/Paul/
// Jinaa만 하드코딩, Barry 누락)을 대체한다.
import { isTestAccountStudent } from '../../utils/accountStatus'
import TextbookAssignmentPanel from './TextbookAssignmentPanel'
import DuplicateStudentAudit from './DuplicateStudentAudit'

const devLog = import.meta.env?.DEV ? console.log : () => {}

// 2026-08-08 — 관리자 학생 로스터가 archive/QA 픽스처까지 필터 없이 전부
// 노출되던 버그 수정(정확히는: 이 화면이 getStudents()의 원본 배열을 그대로
// 표시/카운트에 써서, 방금 로스터 정리로 rename만 된 archive 계정
// (`_INACTIVE`)과 예전 QA 테스트 픽스처(`QA_`/`_QA_` 접두)가 실제 학생과
// 함께 표시됨 — students 테이블 총 1156행 중 QA 987 + archive 128이 여기
// 섞여 보였다). DB 삭제/정리가 아니라 **순수 표시 필터**다 — students
// 테이블·getStudents()의 반환값 자체는 전혀 건드리지 않고, 이 컴포넌트가
// 화면에 그릴 목록/카운트만 걸러낸다.
//
// StudentSelect.jsx의 isRealSetupStudent(학생용 PIN 만들기 반 목록 필터,
// 2026-08-09 커밋 예정/동일 사고 계열)와 판정 기준(정규식)은 같지만, 그
// 함수는 "테스트 계정(Cookie/Paul/Jinaa)"도 학생용 화면에서 제외한다 —
// 여기 관리자 화면은 그 3계정도 관리자가 조회/관리해야 하므로 **제외하지
// 않는다**(두 화면의 목적이 다르므로 로컬 사본을 둔다 — wordLibrary 등
// 공용 유틸에 옮기지 않음, 이번 작업 범위는 이 파일 1개로 한정).
// 2026-08-08(검색 강화 + 비활성화/재활성화 UI 세션) — 위 isRealDirectoryStudent가
// 하던 "_DUP/_INACTIVE/QA 제외" 로드 필터를 두 단계로 쪼갠다:
// (1) 로드 시점 필터(isRealDirectoryStudent, 아래)는 이제 _DUP/QA만 제외한다
//     (항상 숨김, 토글 없음 — 삭제 예정/테스트 픽스처는 관리자도 볼 이유가 없음).
// (2) _INACTIVE는 "비활성화" 기능의 대상이 됐으므로(재활성화 UI로 다시 봐야
//     함) 로드 필터에서 빼고, 아래 표시 단계(displayStudents, 컴포넌트 내부)
//     에서 "🗄️ 비활성 학생 보기" 토글에 따라 걸러낸다.
// 테스트 계정(Cookie/Paul/Jinaa) 판정 기준은 StudentSelect.jsx의
// isRealSetupStudent와 동일(트림·소문자 정확 일치)하지만, 그 화면과 달리
// 여기서는 "완전 제외"가 아니라 기본값만 숨김이고 "🧪 테스트 계정 보기"
// 토글로 다시 볼 수 있다(관리자는 여전히 그 3계정을 관리해야 하므로).
//
// 2026-08-11 추가 — 위 "3계정"/"로컬 사본" 서술은 이제 정확하지 않다.
// 운영자 확정으로 Barry(운영자 QA 계정)가 테스트 계정 4번째로 추가됐고,
// 판정 로직 자체는 이 파일의 로컬 사본이 아니라 src/utils/accountStatus.js
// (단일 진실 공급원, StudentSelect.jsx도 여기서 import)로 옮겨졌다 — 삭제
// 금지/교재 배정 회수 금지/입실시험 응시 가능 유지 요건 때문에 "실제 학생
// 집계"에서만 제외해야 하는 계정이 StudentSelect 하드코딩엔 없던 Barry까지
// 늘어나면서, 두 화면이 같은 판정을 쓰지 않으면 또 어긋날 위험이 커졌다.
function isRealDirectoryStudent(s) {
  const rawName = s?.name || ''
  // 1) archive/중복 계정 — 이름에 _DUP 접미(대소문자 무시)
  if (/_dup/i.test(rawName)) return false
  // 2) 시스템/QA 테스트 픽스처 — 이름이 QA_ 또는 _QA_ 로 시작(대소문자 무시)
  if (/^(qa_|_qa_)/i.test(rawName)) return false
  return true
}
// 비활성(재활성화 대상) 계정 — 이름에 _INACTIVE 접미(대소문자 무시).
function isInactiveDirectoryStudent(s) {
  return /_inactive/i.test(s?.name || '')
}
// 알려진 테스트 계정 판정 — 2026-08-11부터 accountStatus.js로 이관(파일
// 상단 import). 기존엔 여기 로컬 사본에 cookie/paul/jinaa만 있었고 운영자
// 실제 QA 계정인 barry가 빠져 있었다(운영자 확정으로 accountStatus.js에
// 추가됨).

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
  // 표시 필터만 적용(위 isRealDirectoryStudent 주석 참고) — getStudents()
  // 자체는 무변경, 이 state에 담기는 배열만 실학생으로 좁힌다. 이후
  // students.length(헤더 카운트)/CSV 내보내기/검색/아코디언/일괄선택 등
  // 이 컴포넌트의 모든 파생값이 이 state 하나를 참조하므로 자동으로 함께
  // 필터된다.
  const [students, setStudents] = useState(() => getStudents().filter(isRealDirectoryStudent))
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
  // pinSetupAllowed, locked, hasFailedAttempts}(api/student-pin-status.js
  // 배치 조회, pin_hash 원문/실패 카운트 원값은 절대 안 내려옴 — boolean만).
  // supabase_v1_7 SQL 미실행 상태에서도(컬럼 없음 에러) 크래시 없이
  // "상태 알 수 없음"으로 안전하게 표시.
  const [pinStatus, setPinStatus] = useState({})
  const [allowBusyId, setAllowBusyId] = useState(null)
  // 2026-08-29 보안 — "PIN 설정 허용" 직후 서버가 발급한 1회용 확인코드를
  // 관리자에게 한 번 보여주기 위한 상태. 화면 표시 전용이며 어디에도
  // 저장하지 않는다(코드는 서버가 SESSION_SECRET에서 매번 파생한다).
  // 2026-08-30 P0 수정 — 반별 일괄 허용(handleBulkAllowPinSetup)이
  // 서버가 돌려주는 N명분 코드를 전혀 읽지 않아, 일괄 허용한 반 전원이
  // PIN을 못 만드는 사각지대가 있었다. 단건/일괄 두 경로가 같은 모양을
  // 쓰도록 { items: [{ id, name, code }], expiresAt, missing } 로 확장.
  // missing=true는 "허용 자체는 됐지만 서버가 코드를 0개 줬다"는 뜻으로,
  // SESSION_SECRET 미설정 등으로 전원이 무증상으로 PIN을 못 만드는
  // 상태를 관리자가 놓치지 않게 하기 위한 명시적 경고 트리거다.
  const [setupCodeNotice, setSetupCodeNotice] = useState(null)
  // 2026-08-30 — "확인코드 보기"(재조회) 버튼의 진행 상태. get_pin_setup_code는
  // 조회 전용(SELECT만, pin_setup_allowed/pin_hash 어느 쪽도 갱신하지 않음)
  // 이라 몇 번을 눌러도 안전 — 새 코드를 "발급"하는 게 아니라 이미 유효한
  // (10분 버킷 내) 코드를 서버에서 다시 읽어오는 것뿐이다.
  const [viewCodeBusyId, setViewCodeBusyId] = useState(null)
  const [unlockBusyId, setUnlockBusyId] = useState(null)
  // 파괴적 액션(학생 삭제/PIN 삭제)을 담는 카드별 "⋯" 오버플로 메뉴 —
  // 열려 있는 카드 id(한 번에 하나). 핸들러는 기존 handleRemove/
  // handleClearPin 그대로, 버튼 위치만 메뉴 안으로 이동(오터치 방지).
  const [menuOpenId, setMenuOpenId] = useState(null)
  // 2026-08-08 — 표시 토글 2종(기본 둘 다 off — 실학생만 기본 노출) +
  // 비활성화/재활성화/완전삭제 상태. DB/getStudents() 자체는 무변경, 이
  // state들은 위 `students`(로드 필터만 적용된 배열)를 추가로 좁히거나
  // (displayStudents, 아래) 파괴적 액션의 진행 상태만 담는다.
  const [showTestAccounts, setShowTestAccounts] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState(null) // { id, name } — 확인 모달 대상
  const [deactivateBusy, setDeactivateBusy] = useState(false)
  const [reactivateBusyId, setReactivateBusyId] = useState(null)
  const [hardDeleteBusyId, setHardDeleteBusyId] = useState(null)
  // 학생 카드 보강 정보(최근 학습일/별/완료 단어 수) — 완전삭제 1차 가드
  // (PIN 미설정 && 별/완료 0)에도 재사용. 전체 로스터를 한 번에 조회하지
  // 않고, 실제로 화면에 보이는(펼친 반 또는 검색 결과) 학생 id만 배치
  // 조회한다(fetchDashboardData 재사용, wordLibrary.js 무변경). id ->
  // { lastStudiedDate, totalStars, clearedCount } | null(조회 실패).
  const [progressMap, setProgressMap] = useState({})
  const classList = getClassNames()

  // ── 반 배정 드롭다운 = 실제 수업 반만(2026-08-08, P1 실사고 재발 방지) ──
  // 실사고: 2026-08-08 오전, 운영자가 Harry에게 YMB "교과서"를 배정하려다
  // 이 화면의 반 배정 드롭다운(당시엔 classList = 전체 반)에서 "중2 YMB
  // 박준원"(class_type='textbook' 컨테이너 반)을 선택 → students.class_id가
  // 그 컨테이너로 이동해 운영 중이던 실반 배정이 깨졌다. 학생용 PIN
  // 선택기(StudentSelect.jsx)는 getRealClassNames()로 이미 고쳐져 있었으나
  // 관리자 로스터의 반 배정 드롭다운 2곳(개별 편집 editClass / 일괄 이동
  // bulkTargetClass)은 미적용 상태였다. classList(전체 반, CSV 내보내기·
  // 반 그룹 아코디언 등에는 그대로 필요)는 건드리지 않고, 이 두 드롭다운의
  // 옵션 소스만 realClassList로 교체한다.
  const realClassList = getRealClassNames()
  const realClassSet = new Set(realClassList)
  // 편집 대상 학생이 이미 컨테이너 반 소속이면(예: 보류 중인 "Presentation
  // 6 -2026" 컨테이너 소속 학생) 옵션에서 완전히 숨기지 않고, 그 반 하나를
  // "(현재: … — 교과서 컨테이너)" 라벨로 최상단에 추가해 현재 상태를 유지
  // 선택할 수 있게 한다(저장 시 의도치 않은 강제 이동 방지 — 제거가 아니라
  // 현상 유지용 옵션 1개 추가).
  const classOptionsFor = (currentClassName) => {
    if (currentClassName && !realClassSet.has(currentClassName)) {
      return [
        { value: currentClassName, label: `(현재: ${currentClassName} — 교과서 컨테이너)` },
        ...realClassList.map(c => ({ value: c, label: c })),
      ]
    }
    return realClassList.map(c => ({ value: c, label: c }))
  }

  // ── 소속 반/배정 교과서/현재 Unit 3축 요약(2026-08-07 운영자 지시) ─────
  // PIN 만들기 첫 드롭다운이 "소속 반(students.class_id)"인데 교과서
  // 선택기로 오해되는 문제의 관리자 화면 쪽 보강 — 학생 카드를 펼칠 때
  // (📚 교재 관리 패널 토글) 그 학생 1명만 getStudentClassAssignments로
  // 조회해 배정 교과서 목록을 보여준다(목록 전체 N명 자동 조회 금지).
  // 표시 전용, 조회 로직·데이터는 무변경.
  const [assignmentSummary, setAssignmentSummary] = useState({}) // id -> 'loading' | string(요약 텍스트)
  useEffect(() => {
    if (!textbookManaging) return
    const id = textbookManaging
    let cancelled = false
    setAssignmentSummary(prev => ({ ...prev, [id]: 'loading' }))
    getStudentClassAssignments(id).then(list => {
      if (cancelled) return
      const parts = (list || [])
        .map(a => {
          if (!a.textbookId || a.textbookId.startsWith('synthetic-tb:')) return null // 합성(미커버) 교재는 실제 배정이 아니므로 제외
          const tb = getTextbookById(a.textbookId)
          if (!tb) return null
          return tb.name + (a.isPrimary ? '(현재)' : '')
        })
        .filter(Boolean)
      setAssignmentSummary(prev => ({ ...prev, [id]: parts.length ? parts.join(', ') : '배정 없음(소속 반 교과서만)' }))
    }).catch(() => {
      if (!cancelled) setAssignmentSummary(prev => ({ ...prev, [id]: '확인 불가' })) // fail-open — 조회 실패가 화면을 막지 않음
    })
    return () => { cancelled = true }
  }, [textbookManaging])

  // ── 학생 추가(2026-08-06 P0) ─────────────────────────────────────────
  // 학생 생성은 이 UI(서버 api/admin-pin-actions.js의 create_student 액션,
  // 관리자 PIN 인가, 클라이언트가 미리 만드는 멱등 studentId)로만 한다 —
  // 로그인 화면의 자기등록 탭은 같은 날 제거됐다(중복 계정 생성 사고
  // 대응, .ai-status 2026-08-06 기록 참고). anon insert(옛 wordLibrary.
  // addStudent 경로)는 더 이상 이 화면에서 쓰지 않는다.
  const [newName, setNewName] = useState('')
  const [newClass, setNewClass] = useState('')
  // 2026-09-01 — 생성 폼의 교과서 선택. 반과 교재는 독립(2026-08-07 확정
  // 정책 — 같은 반 학생이라도 다른 교재를 공부할 수 있다)이라 반만으로는
  // 시작 유닛을 정할 수 없다. 박민준·박성준 실사고(2026-08-31, regular 반
  // 생성 시 current_unit_id/textbook_id 둘 다 NULL) 재발 방지의 UI 쪽 절반 —
  // 서버 쪽 절반은 create_student의 textbookId 기반 유닛 확정.
  const [newTextbook, setNewTextbook] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newAllowPinSetup, setNewAllowPinSetup] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null) // { message }
  const [duplicateInfo, setDuplicateInfo] = useState(null) // { existing: [...] }
  const [createSuccess, setCreateSuccess] = useState(null) // { name, allowPinSetup }
  // 2026-08-07(중복 경고 강화) — 중복 경고창 전용 부가 상태. 기존 PIN
  // 상태(pinStatus)는 학생 목록 전체 대상이라 중복 후보 id가 아직 그
  // 안에 없을 수 있어(스크롤 밖 반 등) 별도로 소규모 조회한다.
  const [duplicatePinStatus, setDuplicatePinStatus] = useState({}) // id -> {hasPinHash,...}
  const [duplicateAllowedIds, setDuplicateAllowedIds] = useState(() => new Set()) // "PIN 설정 허용" 성공 표시
  const [copiedId, setCopiedId] = useState(null) // "ID 전체 복사" 버튼 일시 피드백
  // 멱등성 키 — 같은 제출의 재시도(네트워크 재전송, "그래도 새로 만들기"
  // force 재요청)는 항상 같은 studentId를 재사용한다. 성공하거나 폼을
  // 초기화할 때만 다음 제출을 위해 비운다.
  const newStudentIdRef = useRef(null)

  // 중복 경고창만 닫기(생성 폼 입력값은 유지 — 이름/반을 다시 손볼 수
  // 있게). resetCreateForm(전체 초기화)도 이 안의 상태 리셋을 재사용한다.
  const closeDuplicateWarning = () => {
    setDuplicateInfo(null)
    setDuplicateAllowedIds(new Set())
    setDuplicatePinStatus({})
    setCopiedId(null)
  }

  const resetCreateForm = () => {
    setNewName(''); setNewClass(''); setNewTextbook(''); setNewUnit(''); setNewAllowPinSetup(true)
    setCreateError(null)
    closeDuplicateWarning()
    newStudentIdRef.current = null
  }

  // 2026-09-01 — 선택한 반에 연결된 교재 목록(class_textbooks 합집합, 위
  // newTextbook 주석 참고). 렌더마다 캐시(_classTextbooks)에서 동기 조회라
  // 비용 없음. 반에 연결 교재가 있으면 교과서 선택이 필수다 — 안 고르면
  // 서버가 유닛을 확정할 수 없어 예전 껍데기 배정이 재발한다.
  const createTextbookOptions = newClass ? getClassTextbooks(getClassIdByName(newClass) || '') : []

  // existing(중복 확인 응답)의 반 이름 표시 — getClassIdByName의 역방향이
  // wordLibrary에 없으므로, 이미 로드된 students 캐시에서 같은 classId를
  // 가진 학생을 찾아 그 className을 재사용한다(새 쿼리 없음).
  const classNameForExistingId = (classId) => students.find(s => s.classId === classId)?.className || null

  // 2026-08-07(중복 경고 강화) — 중복 경고창의 "기존 계정 열기"/"교과서
  // 추가 배정" 액션. 새 상태 개념을 만들지 않고 기존 검색(search)/아코디언
  // (openGroup, sessionStorage 동기화 포함)/카드 메뉴(menuOpenId)/교재 관리
  // 패널(textbookManaging) state를 그대로 재사용해 그 학생 카드가 화면에
  // 보이게 만든다(항목 6 — 검색→상세는 기존 메커니즘 재사용으로 충족).
  const revealExistingStudent = (existingEntry, { forTextbook = false } = {}) => {
    const target = students.find(s => s.id === existingEntry.id)
    const name = target?.name || newName.trim()
    const groupName = target?.className || classNameForExistingId(existingEntry.classId) || '⚠️ 반 미배정'
    setSearch(name)
    setOpenGroup(groupName)
    ssSet(SS_OPEN, groupName || '')
    setMenuOpenId(existingEntry.id) // 카드 "⋯" 메뉴를 열어 해당 행을 짚어줌(별도 하이라이트 개념 발명 안 함)
    if (forTextbook) {
      setTextbookManaging(existingEntry.id) // 기존 TextbookAssignmentPanel 토글 재사용
      alert('학생 카드를 펼쳤어요 — "📚 교재 관리" 영역(자동으로 열림)에서 교과서를 추가로 배정하세요.')
    }
    closeDuplicateWarning()
  }

  // PIN 설정 허용 — 항목 7: pin_setup_allowed 컬럼만 갱신하는 기존
  // handleTogglePinSetupAllowed(action: set_pin_setup_allowed)를 그대로
  // 재사용. 별/XP/학습·숙제 기록/교재 배정에는 전혀 접근하지 않는다.
  const handleDuplicateAllowPinSetup = async (existingEntry) => {
    const target = students.find(s => s.id === existingEntry.id)
    const ok = await handleTogglePinSetupAllowed(existingEntry.id, target?.name || newName.trim(), true)
    if (ok) setDuplicateAllowedIds(prev => new Set(prev).add(existingEntry.id))
  }

  const submitCreateStudent = async (force = false) => {
    const trimmed = newName.trim()
    if (trimmed.length < 1 || trimmed.length > 10) { setCreateError({ message: '이름은 1~10자로 입력해주세요.' }); return }
    if (!newClass) { setCreateError({ message: '반을 선택해주세요.' }); return }
    const classId = getClassIdByName(newClass)
    if (!classId) { setCreateError({ message: '선택한 반을 찾을 수 없어요. 새로고침 후 다시 시도해주세요.' }); return }
    // 반에 연결된 교재가 있는데 교과서를 안 골랐으면 진행하지 않는다 —
    // 서버로 textbookId 없이 보내면 유닛이 NULL인 껍데기 배정이 재발한다.
    if (createTextbookOptions.length > 0 && !newTextbook) { setCreateError({ message: '교과서를 선택해주세요.' }); return }
    if (!newStudentIdRef.current) newStudentIdRef.current = crypto.randomUUID()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_student',
          adminPin,
          studentId: newStudentIdRef.current,
          name: trimmed,
          classId,
          // 교과서 지정 시: unitName 비움(빈 값) = 서버가 그 교재의 "첫 학습
          // 유닛"(단어 2개 이상인 첫 유닛 — 1단어 유령 유닛 자동 제외)을
          // 확정. 관리자가 유닛을 직접 골랐으면 그 이름을 그대로 보낸다.
          textbookId: newTextbook || undefined,
          unitName: newTextbook
            ? (newUnit || undefined)
            : (newUnit || getClassUnitNames(newClass)[0] || 'Unit 1'),
          allowPinSetup: newAllowPinSetup,
          force,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') { setCreateError({ message: '관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.' }); return }
        if (data.reason === 'duplicate_name') { setDuplicateInfo({ existing: data.existing || [] }); return }
        if (data.reason) { setCreateError({ message: `요청이 거부됐어요 (${data.reason})` }); return }
        setCreateError({ message: data.error || '학생 생성에 실패했어요.' })
        return
      }
      refresh()
      const successInfo = { name: trimmed, allowPinSetup: newAllowPinSetup }
      resetCreateForm()
      setCreateSuccess(successInfo)
    } catch (err) {
      setCreateError({ message: '네트워크 오류가 발생했어요: ' + (err.message || err) })
    } finally {
      setCreating(false)
    }
  }

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
    const list = getStudents().filter(isRealDirectoryStudent) // 표시 필터만 — DB 삭제 아님
    setStudents(list)
    loadPinStatus(list)
  }
  useEffect(() => { loadPinStatus(students) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 2026-08-07(중복 경고 강화, 항목 1) — 중복 경고창이 뜰 때만 그 후보
  // id들의 PIN 상태를 별도로 조회(fetchPinStatusMap 재사용, 새 API 없음).
  // pinStatus(학생 목록 전체)와 별개로 두는 이유: 중복 후보가 검색/필터에
  // 걸리지 않은 반에 있어도(펼치지 않은 반 등) 배지를 정확히 보여주기 위함.
  useEffect(() => {
    const ids = duplicateInfo?.existing?.map(e => e.id) || []
    if (ids.length === 0) { setDuplicatePinStatus({}); return }
    let cancelled = false
    fetchPinStatusMap(ids).then(map => { if (!cancelled) setDuplicatePinStatus(map) }).catch(() => {
      // v1.7 SQL 미실행/네트워크 실패 — loadPinStatus와 동일하게 조용히 무시,
      // 배지가 "확인 중…"으로 남을 뿐 경고창의 다른 액션은 그대로 동작.
    })
    return () => { cancelled = true }
  }, [duplicateInfo])

  // ── 학생 비활성화/재활성화/완전삭제(2026-08-08) ─────────────────────
  // 구 handleRemove(클라이언트 removeStudent 즉시 hard delete, confirm
  // 1회로 학습 기록까지 삭제)는 이 안전 경로로 대체하고 제거했다 — 삭제의
  // 기본 방식은 "비활성화"(기록 보존), 완전삭제는 서버가 데이터 0임을
  // 재검증하는 hard_delete_student(⚙️ 고급)만 남긴다. 서버
  // api/admin-pin-actions.js의 deactivate_student/reactivate_student/
  // hard_delete_student 3개 액션을 계약대로 호출한다.
  const openDeactivateModal = (id, name) => setDeactivateTarget({ id, name })
  const closeDeactivateModal = () => { if (!deactivateBusy) setDeactivateTarget(null) }
  const confirmDeactivate = async () => {
    if (!deactivateTarget) return
    setDeactivateBusy(true)
    try {
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate_student', adminPin, studentId: deactivateTarget.id }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        throw new Error(data.reason ? `요청이 거부됐어요 (${data.reason})` : (data.error || '비활성화에 실패했어요.'))
      }
      setDeactivateTarget(null)
      refresh()
    } catch (err) {
      alert('비활성화 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setDeactivateBusy(false)
    }
  }

  // 재활성화 — 확인 모달 없이 바로 호출(비활성 목록은 "🗄️ 비활성 학생
  // 보기" 토글을 켜야만 보이므로 오터치 위험이 낮음, PIN 잠금 해제 등
  // 기존 비파괴 액션과 동일한 패턴).
  const handleReactivate = async (id, name) => {
    setReactivateBusyId(id)
    try {
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate_student', adminPin, studentId: id }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        if (data.reason === 'no_clean_marker') {
          alert(`"${name}" 학생은 자동으로 재활성화할 수 없어요 — 이름에서 원래 이름을 복원할 표식을 찾지 못했어요. 개발자에게 문의해주세요.`)
          return
        }
        throw new Error(data.reason ? `요청이 거부됐어요 (${data.reason})` : (data.error || '재활성화에 실패했어요.'))
      }
      refresh()
    } catch (err) {
      alert('재활성화 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setReactivateBusyId(null)
    }
  }

  // 완전삭제 — 카드 "⚙️ 고급" 영역 안, 그리고 클라이언트 1차 가드(PIN
  // 미설정 && 별/완료 단어 0)를 통과한 계정에만 버튼이 렌더된다(아래
  // renderStudentCard). 서버가 최종 재검증(has_data)하므로 여기 가드가
  // 뚫려도 데이터가 있는 계정은 실제로 지워지지 않는다.
  const handleHardDelete = async (id, name) => {
    if (!window.confirm(`"${name}" 학생을 완전히 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다. 학습 기록이 조금이라도 있으면 서버가 거부해요.`)) return
    if (!window.confirm('정말 완전 삭제할까요? 한 번 더 확인합니다 — 취소하면 삭제되지 않아요.')) return
    setHardDeleteBusyId(id)
    try {
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hard_delete_student', adminPin, studentId: id }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.reason === 'not_authorized') throw new Error('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        if (data.reason === 'has_data') {
          // detail은 { word_status, stars, hasPin, daily, spellingQueue } 객체 —
          // 그대로 문자열 연결하면 "[object Object]"가 되므로 사람이 읽을 수
          // 있는 요약으로 바꿔 보여준다.
          const d = data.detail || {}
          const parts = []
          if (d.hasPin) parts.push('PIN 설정됨')
          if (d.word_status > 0) parts.push(`단어 기록 ${d.word_status}건`)
          if (d.stars) parts.push('별/XP 있음')
          if (d.daily > 0) parts.push(`일별 기록 ${d.daily}건`)
          if (d.spellingQueue > 0) parts.push(`복습 큐 ${d.spellingQueue}건`)
          throw new Error(`학습 기록이 있어 완전 삭제할 수 없어요${parts.length ? ` (${parts.join(', ')})` : ''} — 대신 "비활성화"를 사용하세요.`)
        }
        throw new Error(data.reason ? `요청이 거부됐어요 (${data.reason})` : (data.error || '완전 삭제에 실패했어요.'))
      }
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
      refresh()
    } catch (err) {
      alert('완전 삭제 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setHardDeleteBusyId(null)
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
    devLog('[AdminScreen] saveEdit — 선택한 unit 값:', { studentId: editing, editClass, editUnit })
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
      // 2026-08-29 보안 — 허용을 열면 서버가 1회용 확인코드를 함께 준다.
      // 학생은 이 코드가 있어야 PIN을 만들 수 있으므로, 관리자가 학생에게
      // 구두로 전달해야 한다. 코드는 저장되지 않고 최대 20분만 유효하며,
      // 학생이 PIN을 만드는 즉시 소모된다. 화면에만 띄우고 어디에도
      // 기록하지 않는다(로그/localStorage 저장 없음).
      // 2026-08-30 — 단건/일괄 공용 notice 모양({items, expiresAt, missing})
      // 으로 통일. 단건 경로는 기존 동작을 그대로 보존한다(회귀 0).
      const issued = Array.isArray(data.setupCodes) ? data.setupCodes[0] : null
      if (nextAllowed && issued?.code) {
        setSetupCodeNotice({ items: [{ id, name, code: issued.code }], expiresAt: issued.expiresAt, missing: false })
      } else if (nextAllowed) {
        // 허용은 성공했는데 서버가 코드를 하나도 안 줬다(SESSION_SECRET
        // 미설정 의심) — 무증상 실패를 막기 위해 명시적으로 알린다.
        setSetupCodeNotice({ items: [], expiresAt: null, missing: true })
      } else {
        setSetupCodeNotice(null)
      }
      await loadPinStatus(students)
      return true // 2026-08-07 — 중복 경고창의 handleDuplicateAllowPinSetup이 성공 여부로
      // "허용됨" 인라인 표시 여부를 판단(기존 호출부는 반환값을 쓰지 않아 영향 없음).
    } catch (err) {
      alert(`PIN 설정 ${nextAllowed ? '허용' : '허용 취소'} 중 오류가 발생했어요: ` + (err.message || err))
      return false
    } finally {
      setAllowBusyId(null)
    }
  }

  // 2026-08-30 — 확인코드 "보기"(조회 전용, admin-pin-actions.js의
  // get_pin_setup_code 액션). set_pin_setup_allowed(허용 토글)의 응답으로만
  // 1회 볼 수 있던 확인코드를, 카드를 닫거나 새로고침해서 잊어버렸을 때도
  // 다시 확인할 수 있게 한다 — pin_setup_allowed/pin_hash를 전혀 건드리지
  // 않으므로(서버 쪽 SELECT만) 몇 번을 눌러도 안전하다. 성공 시 기존
  // setupCodeNotice(단건 items 1개 렌더)를 그대로 재사용한다 — 새 표시
  // 컴포넌트를 만들지 않는다.
  const handleViewPinSetupCode = async (id, name) => {
    setViewCodeBusyId(id)
    try {
      const res = await fetch('/api/admin-pin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_pin_setup_code', studentId: id, adminPin }),
      })
      const data = await res.json()
      if (data.reason === 'not_authorized') {
        alert('관리자 인증에 실패했어요. 관리자 화면을 다시 로그인해주세요.')
        return
      }
      if (data.ok && data.code) {
        setSetupCodeNotice({
          items: [{ id, name: data.name || name, code: data.code }],
          expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : null,
          missing: false,
        })
        return
      }
      if (data.reason === 'no_secret') {
        // 기존 "허용은 됐지만 코드를 못 받았다" amber 경고와 동일 원인
        // (SESSION_SECRET 서버 설정 미비) — 같은 렌더를 재사용한다.
        setSetupCodeNotice({ items: [], expiresAt: null, missing: true })
        return
      }
      if (data.reason === 'not_allowed') {
        alert(`"${name}" 학생은 아직 확인코드를 받을 수 없어요 — 먼저 이 학생의 "PIN 설정 허용"을 눌러주세요.`)
        return
      }
      if (data.reason === 'already_set') {
        alert(`"${name}" 학생은 이미 PIN 이 설정된 학생이에요.`)
        return
      }
      if (data.reason === 'not_found') {
        alert('학생 정보를 찾을 수 없어요.')
        return
      }
      alert('확인코드 조회에 실패했어요: ' + (data.error || '알 수 없는 오류'))
    } catch (err) {
      alert('확인코드 조회 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setViewCodeBusyId(null)
    }
  }

  // 반별 일괄 "설정 허용" — PIN 미설정 학생이 많은 반에서 한 명씩
  // 누르지 않아도 되게. 이미 PIN이 있는 학생은 서버(set-pin-setup-
  // allowed.js)가 자동으로 걸러내므로 안전.
  // 2026-08-30 P0 수정 — 서버(action: set_pin_setup_allowed)는 허용 시
  // 대상 전원의 1회용 확인코드(setupCodes: [{studentId, code, expiresAt}])
  // 를 함께 돌려주는데, 이 핸들러가 그 응답을 읽지 않아 일괄 허용한 반
  // 학생 전원이 코드를 안내받지 못해 PIN을 만들 수 없었다. 아래에서
  // setupCodes를 읽어 handleTogglePinSetupAllowed와 같은 notice 모양으로
  // 화면에 띄운다. 학생 이름 매칭은 이름 문자열이 아니라 studentId(UUID)
  // 로 한다(저장소 헌법 규칙 4 — 동명이인 안전).
  const handleBulkAllowPinSetup = async (className) => {
    const targets = displayStudents.filter(s => s.className === className && !pinStatus[s.id]?.hasPinHash)
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
      const issued = Array.isArray(data.setupCodes) ? data.setupCodes : []
      if (issued.length > 0) {
        const items = issued.map((c) => {
          const target = targets.find((t) => t.id === c.studentId)
          return { id: c.studentId, name: target?.name || c.studentId, code: c.code }
        })
        setSetupCodeNotice({ items, expiresAt: issued[0]?.expiresAt ?? null, missing: false })
      } else {
        // 허용은 성공했는데 코드가 하나도 안 왔다(SESSION_SECRET 미설정
        // 의심) — 반 전체가 무증상으로 PIN을 못 만드는 상태이므로 반드시
        // 알린다.
        setSetupCodeNotice({ items: [], expiresAt: null, missing: true })
      }
      await loadPinStatus(students)
    } catch (err) {
      alert('일괄 허용 중 오류가 발생했어요: ' + (err.message || err))
    }
  }

  // 관리자 "로그인 잠금 해제" — unlock_student_pin 액션은 pin_fail_count/
  // pin_locked_until만 초기화하고 pin_hash(PIN 값 자체)는 절대 건드리지 않는다.
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
    // 2026-08-08 — 화면에 실제로 보이는 목록(토글 반영)과 일치하도록
    // displayStudents로 내보낸다(기존엔 students 전체를 그대로 썼음).
    const rows = [['반', '유닛', '이름'], ...displayStudents.map(s => [s.className || '미배정', s.unitName || '', s.name])]
    downloadCsv(`학생명단_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  // ── 표시 필터(토글) — 순수 파생값, DB/students state 자체는 무변경 ─────
  // students(로드 필터만 적용 — _DUP/QA만 제외)에서 토글 상태에 따라 테스트
  // 계정/비활성 계정을 추가로 걸러낸 배열. 아래 그룹핑/검색/CSV/헤더 카운트
  // (일부)가 전부 이 배열 하나를 참조하므로 토글을 켜고 끄면 자동으로 함께
  // 갱신된다 — refresh() 재호출 불필요.
  const activeCanonicalStudents = students.filter(s => !isInactiveDirectoryStudent(s) && !isTestAccountStudent(s))
  const testAccountCount = students.length - students.filter(s => !isTestAccountStudent(s)).length
  const inactiveCount = students.length - students.filter(s => !isInactiveDirectoryStudent(s)).length
  let displayStudents = students
  if (!showTestAccounts) displayStudents = displayStudents.filter(s => !isTestAccountStudent(s))
  if (!showInactive) displayStudents = displayStudents.filter(s => !isInactiveDirectoryStudent(s))

  // ── 그룹핑 (기존 로직 그대로, 소스만 displayStudents로 교체) ───────────
  // 반별로 묶어 보여주기 — 관리자가 여러 반을 한눈에 비교할 수 있게. 미배정
  // 학생은 별도 그룹으로 맨 위에 표시해 눈에 잘 띄게 함. classList에 없는
  // (반 삭제 직후 등으로 이름이 어긋난) 학생도 별도 그룹으로 반드시 표시해
  // 전체 학생 수(헤더)·CSV에는 있는데 목록에서만 조용히 사라지는 일이 없게 함.
  const knownClassNames = new Set(classList)
  const groups = [
    { name: '⚠️ 반 미배정', students: displayStudents.filter(s => !s.className) },
    ...classList.map(c => ({ name: c, students: displayStudents.filter(s => s.className === c) })),
    { name: '❓ 알 수 없는 반 (새로고침 필요)', students: displayStudents.filter(s => s.className && !knownClassNames.has(s.className)) },
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
    () => new Set(displayStudents.slice(-RECENT_COUNT).map(s => s.id)),
    [displayStudents],
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

  // 2026-08-08 — 카드 보강 정보(최근 학습일/별/완료 단어 수) 배치 조회.
  // 실제로 화면에 보이는 학생(검색/필터 중이면 그 결과 전체, 아니면 펼친
  // 반 하나)의 id만 대상 — 전체 로스터 동시 조회 없음(성능/네트워크 비용
  // 방지, 이 파일의 기존 아코디언 설계 원칙과 동일). fetchDashboardData는
  // wordLibrary.js에 이미 있는 관리자 대시보드용 배치 조회 함수를 그대로
  // 재사용한다(이번 세션에서 wordLibrary.js는 수정하지 않음).
  const visibleStudentIds = isFiltering
    ? filteredGroups.flatMap(g => g.students.map(s => s.id))
    : (openGroup ? (groups.find(g => g.name === openGroup)?.students || []).map(s => s.id) : [])
  const visibleIdsKey = visibleStudentIds.join(',')
  useEffect(() => {
    const missingIds = visibleStudentIds.filter(id => progressMap[id] === undefined)
    if (missingIds.length === 0) return
    let cancelled = false
    fetchDashboardData(missingIds).then(rows => {
      if (cancelled) return
      setProgressMap(prev => {
        const next = { ...prev }
        rows.forEach(r => {
          next[r.id] = r.progress
            ? { lastStudiedDate: r.progress.last_studied_date || null, totalStars: r.progress.total_stars ?? 0, clearedCount: r.progress.cleared_count ?? 0 }
            : { lastStudiedDate: null, totalStars: 0, clearedCount: 0 }
        })
        return next
      })
    }).catch(() => {
      // 조회 실패 — 부가 정보일 뿐이므로 조용히 무시(카드는 "확인 불가"로
      // 표시). 완전삭제 가드는 progressMap[id]===undefined일 때 버튼을
      // 숨기므로(아래 renderStudentCard) 실패 시에도 안전 측(가드 걸림)으로 동작.
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsKey])

  // ── 학생 카드 (아코디언/검색 양쪽에서 재사용) ────────────────────────
  // 2026-07-22 컴팩트화: 세로 간격 축소(px-3 py-2.5), 한국어 라벨 세로
  // 줄바꿈 방지(whitespace-nowrap/break-keep), 터치 타겟 최소 40px
  // (min-h-[40px]/w-10 h-10). 파괴적 액션 2개(학생 삭제/PIN 삭제)는 "⋯"
  // 오버플로 메뉴 뒤로 이동 — 핸들러(handleRemove/handleClearPin)는 그대로.
  const renderStudentCard = (s) => {
    const status = pinStatus[s.id] // undefined면 아직 로딩 전이거나 v1.7 SQL 미적용
    const menuOpen = menuOpenId === s.id
    // 2026-08-08 — 비활성화/재활성화/완전삭제 판정. progress는 카드가 화면에
    // 보일 때(위 visibleStudentIds 이펙트)만 채워짐 — 아직 undefined면
    // "확인 중"으로 표시하고, 완전삭제 가드는 undefined를 통과시키지 않는다
    // (데이터를 확인 못 한 계정을 섣불리 삭제 가능하게 두지 않기 위함).
    const inactive = isInactiveDirectoryStudent(s)
    const progress = progressMap[s.id]
    const canHardDelete = status && !status.hasPinHash &&
      progress && progress.totalStars === 0 && progress.clearedCount === 0
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
                  {inactive && <span className="text-gray-400"> · 🗄️ 비활성</span>}
                  {isTestAccountStudent(s) && <span className="text-purple-400"> · 🧪 테스트</span>}
                </p>
              )}
              {/* 2026-08-08 — 최근 학습일 + student_id 앞자리(관리자가 DB에서
                  직접 찾을 때 대조용, 작은 회색 텍스트). progress가
                  undefined면 아직 배치 조회 전(카드가 막 보이기 시작)이라
                  "확인 중"으로만 표시 — 크래시 없음. */}
              <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
                {progress === undefined
                  ? '최근 학습: 확인 중…'
                  : progress.lastStudiedDate
                    ? `최근 학습: ${progress.lastStudiedDate}`
                    : '최근 학습 기록 없음'}
                <span className="ml-1.5 text-gray-300">id {s.id.slice(0, 8)}</span>
              </p>
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
            {/* 2026-08-30 — 확인코드 "보기"(조회 전용, get_pin_setup_code).
                안내 카드를 닫거나 새로고침해서 코드를 잊어버렸을 때 다시
                확인하는 유일한 경로 — pin_setup_allowed/pin_hash를 전혀
                건드리지 않는다(SELECT만). PIN 없는 학생 카드에 항상 노출하고,
                아직 "설정 허용"을 안 눌렀으면 클릭 시 안내만 뜬다. */}
            {status && !status.hasPinHash && (
              <button onClick={() => handleViewPinSetupCode(s.id, s.name)}
                disabled={viewCodeBusyId === s.id}
                className="bg-emerald-100 text-emerald-700 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press disabled:opacity-50 whitespace-nowrap">
                {viewCodeBusyId === s.id ? '⏳' : '🔎 확인코드 보기'}
              </button>
            )}
            {(status?.locked || status?.hasFailedAttempts) && (
              <button onClick={() => handleUnlockPin(s.id, s.name)} disabled={unlockBusyId === s.id}
                title={status?.locked ? '현재 잠김 — 잠금과 실패 기록을 초기화합니다' : '실패 기록이 누적됨 — 잠기기 전에 초기화합니다'}
                className="bg-red-100 text-red-600 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press disabled:opacity-50 whitespace-nowrap">
                {unlockBusyId === s.id ? '⏳' : '🔓 로그인 잠금 해제'}
              </button>
            )}
            <button onClick={() => handleResetPin(s.id, s.name)} disabled={pinResetId === s.id}
              className="bg-yellow-100 text-yellow-700 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press disabled:opacity-50 whitespace-nowrap">
              {pinResetId === s.id ? '⏳' : '🔑 PIN 초기화'}
            </button>
            <button onClick={() => startEdit(s.id)}
              className="bg-blue-100 text-blue-600 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press whitespace-nowrap">반 배정</button>
            {/* 2026-08-08 — 비활성화/재활성화. 활성 학생은 "비활성화"(확인
                모달 필요, 아래 렌더 참고), 비활성 학생(🗄️ 비활성 학생 보기
                토글이 켜져 있어야 카드 자체가 보임)은 "재활성화". 삭제
                (handleRemove)와 달리 학습 기록을 보존하는 안전한 경로. */}
            {inactive ? (
              <button onClick={() => handleReactivate(s.id, s.name)} disabled={reactivateBusyId === s.id}
                className="bg-green-100 text-green-700 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press disabled:opacity-50 whitespace-nowrap">
                {reactivateBusyId === s.id ? '⏳' : '♻️ 재활성화'}
              </button>
            ) : (
              <button onClick={() => openDeactivateModal(s.id, s.name)}
                className="bg-orange-100 text-orange-600 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press whitespace-nowrap">
                🚫 비활성화
              </button>
            )}
            {/* v2.9 다중 교재 — 기본 반이 있어야 의미가 있으므로
                (반 미배정 학생은 "반 배정"부터 먼저) 이 학생이
                이미 어떤 반에 속해 있을 때만 노출. */}
            {s.className && (
              <button onClick={() => setTextbookManaging(textbookManaging === s.id ? null : s.id)}
                className="bg-purple-100 text-purple-600 font-bold px-2.5 min-h-[40px] rounded-xl text-xs btn-press whitespace-nowrap">
                📚 교재 관리
              </button>
            )}
            {/* "⋯" 오버플로 메뉴 — 파괴적 액션(PIN 삭제 handleClearPin)만
                이 안에. 구 "🗑 학생 삭제"(handleRemove, confirm 1회 즉시
                hard delete)는 2026-08-08 안전 경로로 대체·제거 — 삭제는
                기본 "비활성화" 버튼, 완전삭제는 카드 하단 "⚙️ 고급"(서버
                has_data 재검증)만 남긴다. 바깥 클릭 시 닫힘(투명 배경). */}
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
                    <p className="px-3 py-2 text-[10px] text-gray-400 whitespace-nowrap">
                      삭제는 🚫 비활성화(기록 보존) 또는<br />카드 하단 ⚙️ 고급의 완전 삭제를 사용하세요.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {/* 2026-08-08 — "⚙️ 고급": 완전삭제(hard_delete_student)만 이 안에.
            일반 카드/오버플로 메뉴 어디에도 노출하지 않고, 클라이언트 1차
            가드(PIN 미설정 && 별·완료 단어 0)를 통과했을 때만 버튼을 보여준다
            — 서버가 has_data로 최종 재검증하므로 이 가드가 뚫려도 실제
            데이터가 있는 계정은 지워지지 않는다. status/progress가 아직
            로딩 전(undefined)이면 버튼을 아예 숨김(안전 측 — 확인 안 된
            계정을 성급히 지울 수 있게 하지 않음). */}
        <details className="mt-1.5">
          <summary className="text-[10px] text-gray-300 font-bold cursor-pointer select-none">⚙️ 고급</summary>
          <div className="mt-1 pl-1">
            {canHardDelete ? (
              <button onClick={() => handleHardDelete(s.id, s.name)} disabled={hardDeleteBusyId === s.id}
                className="text-[11px] font-bold text-red-500 underline btn-press disabled:opacity-50">
                {hardDeleteBusyId === s.id ? '⏳ 삭제 중...' : '🗑️ 완전 삭제 (되돌릴 수 없음, 데이터 없는 계정만)'}
              </button>
            ) : (
              <p className="text-[10px] text-gray-300">
                완전 삭제 불가 — PIN·학습 데이터가 있거나 아직 확인 중이에요. 대신 &quot;비활성화&quot;를 사용하세요.
              </p>
            )}
          </div>
        </details>
        {textbookManaging === s.id && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            {/* 2026-08-07 운영자 지시 — 소속 반(students.class_id)/배정 교과서(SCA)/
                현재 Unit(students.current_unit_id) 3축을 분리 표시해 혼동 방지.
                표시 전용, 조회 로직·데이터 무변경. */}
            <div className="bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 mb-3 text-xs text-purple-700 space-y-0.5">
              <p>
                <span className="font-black">소속 반:</span> {s.className || '⚠️ 반 미배정'}
                <span className="mx-1.5">·</span>
                <span className="font-black">현재 선택 Unit:</span> {getStudentUnit(s.id) || '—'}
              </p>
              <p>
                <span className="font-black">배정 교과서:</span>{' '}
                {assignmentSummary[s.id] === 'loading' || assignmentSummary[s.id] === undefined
                  ? '확인 중…'
                  : assignmentSummary[s.id]}
              </p>
            </div>
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
              {classOptionsFor(s.className).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
      {/* 2026-08-29 보안 — "PIN 설정 허용" 직후 1회용 확인코드 안내.
          학생은 이 코드가 있어야 PIN을 만들 수 있다(제2 인증 요소).
          코드는 서버가 SESSION_SECRET에서 파생하므로 저장되지 않고,
          최대 20분 유효하며 학생이 PIN을 만드는 즉시 소모된다.
          2026-08-30 P0 수정 — 단건(items 1개)은 기존과 시각적으로 동일하게
          큰 코드 하나를 보여주고(회귀 0), 일괄 허용(items 2개 이상)은
          "이름 — 코드" 목록으로, 코드가 0개 발급됐으면(missing) 경고
          톤으로 별도 안내한다. 코드 자체는 이 렌더 외에는 어디에도
          남기지 않는다(console/localStorage/sessionStorage 사용 금지).
          2026-08-30 — 이 안내 카드는 이제 "PIN 설정 허용" 직후뿐 아니라
          학생 카드의 "🔎 확인코드 보기"(handleViewPinSetupCode,
          get_pin_setup_code 조회 전용 액션) 클릭 시에도 뜬다 — 새 표시
          컴포넌트를 만들지 않고 이 카드를 그대로 재사용한다. */}
      {setupCodeNotice && (
        setupCodeNotice.missing ? (
          <div className="border-2 border-amber-300 bg-amber-50 rounded-2xl p-4 space-y-2">
            <p className="text-sm font-bold text-amber-800">
              ⚠️ PIN 설정은 허용됐지만 확인코드를 받지 못했어요
            </p>
            <p className="text-[11px] text-amber-700">
              서버가 확인코드를 발급하지 못했어요(SESSION_SECRET 서버 설정 확인 필요).
              지금 상태로는 학생이 아직 PIN을 만들 수 없어요 — 서버 설정을 확인한 뒤
              "PIN 설정 허용"을 다시 눌러주세요.
            </p>
            <button onClick={() => setSetupCodeNotice(null)}
              className="w-full bg-amber-600 text-white text-xs font-bold rounded-xl py-2">
              확인했어요
            </button>
          </div>
        ) : (
          <div className="border-2 border-emerald-300 bg-emerald-50 rounded-2xl p-4 space-y-2">
            {setupCodeNotice.items.length === 1 ? (
              <>
                <p className="text-sm font-bold text-emerald-800">
                  {`"${setupCodeNotice.items[0].name}" 학생에게 아래 확인코드를 알려주세요`}
                </p>
                <p className="text-2xl font-black tracking-[0.3em] text-center text-emerald-900 select-all">
                  {setupCodeNotice.items[0].code}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-emerald-800">
                  {`${setupCodeNotice.items.length}명에게 아래 확인코드를 각각 알려주세요`}
                </p>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {setupCodeNotice.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 bg-white/60 rounded-lg px-2 py-1">
                      <span className="text-xs font-bold text-emerald-800 overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</span>
                      <span className="text-base font-black tracking-[0.3em] text-emerald-900 select-all">{item.code}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* 2026-08-30 — 남은 유효시간. expiresAt은 이전부터 상태에
                저장돼 있었지만 화면에 쓰이지 않고 있었다(get_pin_setup_code
                도입을 계기로 이제 표시). 코드는 10분 버킷 단위라 "새 코드
                생성" 개념이 없다 — 같은 버킷 안에서는 다시 조회해도 같은
                코드가 나온다는 점을 정직하게 안내한다. */}
            {typeof setupCodeNotice.expiresAt === 'number' && (
              <p className="text-[11px] font-bold text-emerald-800">
                {(() => {
                  const remainMin = Math.max(0, Math.ceil((setupCodeNotice.expiresAt - Date.now()) / 60000))
                  return remainMin > 0
                    ? `⏳ 이 코드는 약 ${remainMin}분 후 만료돼요.`
                    : '⏳ 이 코드는 곧 만료돼요 — 만료됐다면 카드의 "확인코드 보기"를 다시 눌러주세요.'
                })()}
              </p>
            )}
            <p className="text-[11px] text-emerald-700">
              학생이 "PIN 만들기" 화면에서 이 코드를 입력해야 PIN을 만들 수 있어요.
              {' '}코드는 <b>약 10분마다 자동으로 바뀌고</b> 최대 20분 안에 사용해야 해요 — 같은
              버킷 안에서는 다시 조회해도 같은 코드가 나오므로 "새로 발급"이 아니라 학생
              카드의 <b>"🔎 확인코드 보기"</b>로 언제든 다시 확인하세요.
            </p>
            <button onClick={() => setSetupCodeNotice(null)}
              className="w-full bg-emerald-600 text-white text-xs font-bold rounded-xl py-2">
              확인했어요
            </button>
          </div>
        )
      )}
      {/* 2026-08-08 — 비활성화 확인 모달(window.confirm이 아니라 실제 모달 —
          운영자 지시 문구를 그대로 보여주기 위함). fixed 오버레이라 렌더
          위치는 트리 어디든 상관없음, 최상단에 둬서 눈에 잘 띄게. */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeDeactivateModal}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800 whitespace-pre-line">
              {`"${deactivateTarget.name}" 학생을 비활성화할까요?\n\n로그인과 학생 목록에서는 숨겨지지만 학습기록은 보존됩니다.`}
            </p>
            <div className="flex gap-2">
              <button onClick={closeDeactivateModal} disabled={deactivateBusy}
                className="flex-1 border-2 border-gray-200 text-gray-500 font-bold py-2 rounded-xl text-xs btn-press disabled:opacity-50">취소</button>
              <button onClick={confirmDeactivate} disabled={deactivateBusy}
                className="flex-1 bg-orange-500 disabled:bg-gray-300 text-white font-black py-2 rounded-xl text-xs btn-press">
                {deactivateBusy ? '⏳ 처리 중...' : '비활성화'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pinResetResult && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-yellow-800">
            🔑 <span className="font-black">{pinResetResult.name}</span>의 새 PIN: <span className="font-black text-lg tracking-widest">{pinResetResult.pin}</span>
            <br /><span className="text-xs font-normal">이 화면을 닫으면 다시 볼 수 없어요 — 학생에게 지금 알려주세요.</span>
          </p>
          <button onClick={() => setPinResetResult(null)} className="text-yellow-600 font-bold text-xs btn-press flex-shrink-0">닫기</button>
        </div>
      )}

      {/* ➕ 학생 추가(2026-08-06 P0) — 위 handlers 주석 참고: 학생 생성은
          이제 이 폼(서버 create_student, 관리자 PIN 인가, 멱등 studentId)
          으로만. */}
      <div className="bg-white rounded-3xl card-shadow p-5">
        <p className="text-sm font-black text-gray-700 mb-3">➕ 학생 추가</p>
        {createSuccess && (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl px-3 py-2 mb-3 text-xs font-bold text-green-700 flex items-center justify-between gap-2">
            <span>
              &quot;{createSuccess.name}&quot; 학생을 추가했어요.
              {createSuccess.allowPinSetup && ' PIN 설정 허용됨 — 학생이 로그인 화면 "PIN 만들기" 탭에서 PIN을 만들면 돼요.'}
            </span>
            <button onClick={() => setCreateSuccess(null)} className="text-green-600 font-bold flex-shrink-0">닫기</button>
          </div>
        )}
        {createError && (
          <p className="text-xs font-bold text-red-500 mb-3">{createError.message}</p>
        )}
        {duplicateInfo ? (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-orange-700">
              같은 이름의 계정이 {duplicateInfo.existing.length}개 있어요(같은 반 {duplicateInfo.existing.filter(e => e.sameClass).length}개). 그래도 새로 만들까요? 동명이인이 확실할 때만 진행하세요.
            </p>
            {/* 2026-08-07(중복 경고 강화) — 항목 1~2: 각 기존 계정에 반/id/
                가입일(기존)에 더해 PIN 배지 + ID 전체 복사 + 계정별 액션
                4종. 별/XP/학습·숙제 기록/교재 배정 데이터에는 전혀
                접근하지 않고, 아래 4개 핸들러 모두 pin_* 컬럼만 갱신하는
                기존 서버 API(또는 순수 UI state 재사용)만 호출한다(항목 5). */}
            <ul className="text-[11px] text-orange-600 space-y-1.5">
              {duplicateInfo.existing.map(e => {
                const status = duplicatePinStatus[e.id]
                const target = students.find(s => s.id === e.id)
                const name = target?.name || newName.trim()
                const allowBusy = allowBusyId === e.id
                const resetBusy = pinResetId === e.id
                const justAllowed = duplicateAllowedIds.has(e.id)
                return (
                  <li key={e.id} className="bg-white border border-orange-200 rounded-lg p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        {classNameForExistingId(e.classId) || (e.classId ? `반 id ${e.classId.slice(0, 8)}…` : '반 미배정')}
                        {' · id '}{e.id.slice(0, 8)}…
                        {e.createdAt ? ` · ${new Date(e.createdAt).toLocaleDateString('ko-KR')} 가입` : ''}
                      </span>
                      <button type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(e.id).catch(() => {})
                          setCopiedId(e.id)
                          setTimeout(() => setCopiedId(cur => (cur === e.id ? null : cur)), 1500)
                        }}
                        className="text-orange-500 font-bold underline btn-press flex-shrink-0">
                        {copiedId === e.id ? '복사됨' : 'ID 전체 복사'}
                      </button>
                    </div>
                    <p className="font-bold">
                      {status
                        ? (status.hasPinHash
                            ? <span className="text-green-600">🟢 PIN 있음</span>
                            : <span className="text-red-500">🔴 PIN 없음</span>)
                        : <span className="text-gray-400">PIN 상태 확인 중…</span>}
                      {justAllowed && <span className="text-green-600"> · 허용됨 — 학생이 &apos;PIN 만들기&apos; 탭에서 만들면 됨</span>}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      <button type="button" onClick={() => revealExistingStudent(e)}
                        className="bg-blue-100 text-blue-600 font-bold px-2 py-1 rounded-lg btn-press">
                        기존 계정 열기
                      </button>
                      <button type="button" onClick={() => handleDuplicateAllowPinSetup(e)}
                        disabled={allowBusy || status?.hasPinHash === true}
                        className="bg-yellow-100 text-yellow-700 font-bold px-2 py-1 rounded-lg btn-press disabled:opacity-40">
                        {allowBusy ? '⏳' : 'PIN 설정 허용'}
                      </button>
                      <button type="button" onClick={() => handleResetPin(e.id, name)}
                        disabled={resetBusy || status?.hasPinHash !== true}
                        className="bg-yellow-100 text-yellow-700 font-bold px-2 py-1 rounded-lg btn-press disabled:opacity-40">
                        {resetBusy ? '⏳' : 'PIN 재설정'}
                      </button>
                      <button type="button" onClick={() => revealExistingStudent(e, { forTextbook: true })}
                        className="bg-purple-100 text-purple-600 font-bold px-2 py-1 rounded-lg btn-press">
                        교과서 추가 배정
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            {/* 2026-08-06(재등록 우회 차단 안내) — 다중 교과서 배정 기능
                (TextbookAssignmentPanel)이 이미 있으므로, 다른 출판사
                교과서를 주려고 중복 계정을 만드는 걸 여기서 막아 안내한다.
                "그래도 새로 만들기" 자체는 정당한 동명이인 등록을 위해
                그대로 둔다(동작 변경 없음). */}
            <p className="text-[11px] text-orange-600">
              💡 다른 출판사 교과서를 주려는 것이라면 새 계정을 만들지 마세요 — 학생 목록에서 그 학생을 펼쳐 "교과서 추가 배정"을 쓰면 계정 1개로 여러 교과서를 오갈 수 있어요(별·XP·기록 유지).
            </p>
            {/* 2026-08-07(항목 3) — 경고 문구 강화: "그래도 새로 만들기"
                버튼 바로 위에 재확인 문구. */}
            <p className="text-[11px] font-bold text-red-500">
              ⚠️ 정말 다른 학생(동명이인)일 때만 새로 만드세요. 같은 학생이면 위 버튼으로 기존 계정을 쓰세요 — 새로 만들면 별·XP·기록이 두 계정으로 갈라집니다.
            </p>
            <div className="flex gap-2">
              <button onClick={closeDuplicateWarning} className="flex-1 border-2 border-gray-200 text-gray-500 font-bold py-2 rounded-xl text-xs btn-press">취소</button>
              <button onClick={() => submitCreateStudent(true)} disabled={creating}
                className="flex-1 bg-orange-500 disabled:bg-gray-300 text-white font-black py-2 rounded-xl text-xs btn-press">
                {creating ? '⏳ 생성 중...' : '그래도 새로 만들기'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input type="text" value={newName} maxLength={10} onChange={e => setNewName(e.target.value)}
              placeholder="학생 이름 (1~10자)"
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:border-purple-400" />
            <select value={newClass} onChange={e => {
                setNewClass(e.target.value)
                // 2026-09-01 — 반이 바뀌면 교과서/유닛 선택을 다시 시작한다.
                // 연결 교재가 정확히 1개면 자동 선택(관리자 클릭 절약),
                // 여러 개면 빈 값으로 두어 명시적 선택을 강제한다(다수결
                // 자동 배정 금지 — 박민준·박성준 사고의 교훈).
                const tbs = getClassTextbooks(getClassIdByName(e.target.value) || '')
                const autoTb = tbs.length === 1 ? tbs[0].id : ''
                setNewTextbook(autoTb)
                setNewUnit(tbs.length > 0 ? '' : (getClassUnitNames(e.target.value)[0] || ''))
              }}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold bg-white">
              <option value="">반 선택</option>
              {/* 2026-08-08 — 학생 추가 폼도 반 배정 드롭다운과 동일 위험
                  (컨테이너 반 노출) 이 있어 realClassList로 교체. 신규
                  학생은 아직 소속 반이 없으므로 "현재 반 유지" 예외
                  (classOptionsFor)는 필요 없음 — realClassList만으로 충분. */}
              {realClassList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* 2026-09-01 — 교과서 선택(반에 연결된 교재가 있을 때 필수).
                이 학생의 primary 교재가 되고, 서버(create_student)가 이
                교재 기준으로 시작 유닛을 확정한다. */}
            {newClass && createTextbookOptions.length > 0 && (
              <select value={newTextbook} onChange={e => { setNewTextbook(e.target.value); setNewUnit('') }}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold bg-white">
                <option value="">📚 교과서 선택 (필수)</option>
                {createTextbookOptions.map(tb => <option key={tb.id} value={tb.id}>{tb.name}</option>)}
              </select>
            )}
            {newClass && (newTextbook || createTextbookOptions.length === 0) && (
              <select value={newUnit} onChange={e => setNewUnit(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold bg-white">
                {newTextbook
                  ? [<option key="__auto" value="">첫 학습 유닛 (자동)</option>,
                     ...getTextbookUnits(newTextbook).map(u => <option key={u.id} value={u.name}>{u.name}</option>)]
                  : getClassUnitNames(newClass).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
              <input type="checkbox" checked={newAllowPinSetup} onChange={e => setNewAllowPinSetup(e.target.checked)}
                className="w-4 h-4 accent-purple-500" />
              PIN 설정 허용 (학생이 &apos;PIN 만들기&apos; 탭에서 스스로 PIN을 만들 수 있게)
            </label>
            <button onClick={() => submitCreateStudent(false)} disabled={creating}
              className="w-full bg-purple-500 disabled:bg-gray-300 text-white font-black py-2.5 rounded-xl text-sm btn-press">
              {creating ? '⏳ 생성 중...' : '학생 추가'}
            </button>
          </div>
        )}
      </div>

      {/* 🔍 중복 학생 계정 점검(2026-08-06, 읽기 전용) — 실학생 172명 중
          31개 이름 그룹·96계정 중복 생성 사고 조사용. 접어둔 상태가 기본
          (details 기본 닫힘) — 관리자가 필요할 때만 펼쳐서 본다. */}
      <details className="bg-white rounded-3xl card-shadow p-5">
        <summary className="text-sm font-black text-gray-700 cursor-pointer">🔍 중복 학생 계정 점검 (읽기 전용)</summary>
        <div className="mt-3">
          <DuplicateStudentAudit />
        </div>
      </details>

      <div className="bg-white rounded-3xl card-shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-black text-gray-700">
            👦 전체 학생 ({activeCanonicalStudents.length}명)
            {(testAccountCount > 0 || inactiveCount > 0) && (
              <span className="text-xs font-normal text-gray-400 ml-1">
                {testAccountCount > 0 && `· 테스트 ${testAccountCount} `}
                {inactiveCount > 0 && `· 비활성 ${inactiveCount}`}
              </span>
            )}
          </p>
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
          {/* 2026-08-08 — 표시 토글 2종(기본 둘 다 off). 실학생 카운트(헤더)/
              그룹/검색/CSV는 전부 displayStudents 하나를 참조하므로 여기서
              켜고 끄면 목록이 즉시 갱신된다(추가 조회 없음). */}
          <div className="flex gap-3 px-1">
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
              <input type="checkbox" checked={showTestAccounts} onChange={e => setShowTestAccounts(e.target.checked)}
                className="w-3.5 h-3.5 accent-purple-500" />
              🧪 테스트 계정 보기{testAccountCount > 0 ? ` (${testAccountCount})` : ''}
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
                className="w-3.5 h-3.5 accent-purple-500" />
              🗄️ 비활성 학생 보기{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
            </label>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="bg-blue-50 rounded-2xl p-3 mb-3 flex items-center gap-2 flex-wrap">
            <p className="text-xs font-bold text-blue-700">{selected.size}명 선택됨</p>
            <select value={bulkTargetClass} onChange={e => setBulkTargetClass(e.target.value)}
              className="flex-1 min-w-[8rem] border-2 border-blue-200 rounded-xl px-2 py-1.5 text-xs font-bold bg-white">
              <option value="">이동할 반 선택</option>
              {realClassList.map(c => <option key={c} value={c}>{c}</option>)}
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
        ) : displayStudents.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">
            표시할 학생이 없어요 — 테스트/비활성 계정만 있어요. 위 토글을 켜보세요.
          </p>
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
