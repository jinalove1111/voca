import React, { useState, useRef, useEffect, useMemo } from 'react'
// B7(2026-08-02) — xlsx 정적 import는 관리자 번들에 항상 포함돼 크기를
// 키웠다(엑셀 업로드는 자주 쓰는 기능이 아님). PdfUpload.handleFile이 이미
// pdfjs-dist를 동적 import하는 선례가 있어 동일 패턴으로 handleFile 안에서만
// 로드하도록 바꾼다(정적 import 제거, 동작은 동일).
import { getClassNames, getClassWords, setClassWords, deleteClass, createClass, renameClass, getClassUnits, addClassUnit, deleteClassUnit, getClassUnitNames, getStudentsInClass, getTodaysAssignmentWordIds, setTodaysAssignment, getAssignmentForDate, setAssignmentForDate, fetchAssignmentHistory, fetchDashboardData, getClassSettings, setClassSettings, localIsoDateStr, fetchWordStatusSummary, resetWordStatus, setWordAcceptedMeanings, fetchXpTotals, fetchXpByEventType, getClassIdByName, getStudents, wordSlug, isoDaysAgoStr, buildUnitWordAssetPayloads, groupAssetPayloadsByShape, ensureTextbookLayerBackfilled, getOwnTextbookOfClass, getClassTypeByName } from '../utils/wordLibrary'
// Word Asset Library(M3c, 2026-08-05) — 엑셀 업로드 저장 "이후" 자산
// 업서트 배선 전용(조회 배선은 이번 범위 아님, 규칙 12). fetchWordAssetsByWords/
// upsertWordAssets 둘 다 절대 throw하지 않는 계약(src/utils/wordAssets.js
// 헤더 주석) — 이 파일에서도 그 계약을 그대로 신뢰한다.
import { fetchWordAssetsByWords, upsertWordAssets } from '../utils/wordAssets'
// 숙제 "자동 생성" 순수 플래너(2026-08-01) — 이 파일은 미리보기(체크박스
// Set 채우기)에만 쓰고, 실제 저장은 항상 기존 setTodaysAssignment/
// setAssignmentForDate(adminPin 듀얼패스) 그대로 사용한다.
import { pickNextAssignment, planBulkDates } from '../utils/assignmentPlanner'
// Paul Rank System(2026-07-19) — 최소 관리자 통합: 학생별 XP/Rank 조회만
// (관리자 UI 전면 개편 아님, 기존 학생 카드에 텍스트 한 줄 추가).
import { computeRankState } from '../utils/paulRankShared'
// Word King(2026-07-19, 게임화 하위카드 7번) — 관리자 수동 트리거 +
// 결과 확인 최소 UI(GameSettingsPanel 바로 아래에 슬롯).
import { triggerComputeWordKing, fetchLatestWordKingPeriod } from '../utils/wordKingApi'
// Seasonal Progression(2026-07-19, 게임화 하위카드 9번, GAME_DESIGN.md 9번
// 섹션) — 관리자 수동 "새 시즌 시작" 트리거 + 현재 시즌 표시(SeasonPanel,
// classes 탭 최상단 — 반과 무관한 전역 액션이라 반 목록 루프 밖에 둔다).
import { fetchCurrentSeasonDetailed, triggerStartNewSeason } from '../utils/seasonApi'
import { buildWeeklyReport, computeStudentStats } from '../utils/weeklyReport'
import FeatureManagementPanel from './FeatureManagementPanel'
import TestPaperGenerator from './TestPaperGenerator'
import DebugPage from './DebugPage'
import EntranceTestAdmin from './EntranceTestAdmin'
// 학생 관리 디렉터리(2026-07-22, 300~1000명 규모 대응) — 예전에 이 파일
// 안에 있던 StudentManagement 컴포넌트를 handlers 그대로 옮기고 렌더링만
// 아코디언/검색/퀵필터 구조로 재구성한 것(파일 헤더 주석 참고). v2.9
// 다중 교재 TextbookAssignmentPanel도 그 안에서 그대로 쓰인다.
import StudentDirectory from './admin/StudentDirectory'
// v3.1 반↔교재 연결 관리(2026-07-22) — 반 관리 탭에서 반을 펼쳤을 때
// 그 반에 연결된 교재를 연결/해제하는 패널(교재 모드 꺼짐이면 안내만).
import ClassTextbookLinks from './admin/ClassTextbookLinks'
import AnalyticsPanel from './admin/AnalyticsPanel'
// 배정 이력 + 완료 현황(2026-08-01) — 완전히 읽기 전용, admin-content-write
// 배포 여부와 무관하게 항상 동작(AssignmentHistoryPanel.jsx 헤더 참고).
import AssignmentHistoryPanel from './admin/AssignmentHistoryPanel'
// 쓰기 답안 검토 큐 + "선생님이 같은 검토를 두 번 하지 않는" 자동 학습
// 시스템 카드 3개(2026-07-24, 코드 품질 감사 대응으로 분리) —
// StudentDirectory.jsx(2026-07-22)와 동일한 순수 이동(로직 변경 없음),
// 각 파일 헤더 주석 참고.
import SpellingReviewQueuePanel from './admin/SpellingReviewQueuePanel'
import WritingStatsDashboard from './admin/WritingStatsDashboard'
import LearningRecommendationsCard from './admin/LearningRecommendationsCard'
import AiSavingsCard from './admin/AiSavingsCard'
import LearningRateCard from './admin/LearningRateCard'
// Reading Foundation v3.3(2026-07-23) — 유닛별 읽기 지문 편집기(관리자
// 전용, readingFoundation 플래그 게이팅). 학생용 읽기 화면은 이번 범위
// 밖(features.js readingStudentUI 예약 플래그 참고).
import PassageEditor from './admin/PassageEditor'
import { isFeatureEnabled } from '../config/features'
// Curriculum Engine Phase 0(2026-08-01) — 관리자 전용 커리큘럼 허브(출판사/
// 학년/교재·유닛 메타/예문 CRUD·승인). 학생 화면 무관, supabase_v3_13 미실행
// 상태에서도 각 서브탭이 독립적으로 안전 배너로 폴백한다(docs/CURRICULUM_ENGINE.md).
import CurriculumHub from './admin/CurriculumHub'
// Word Asset Library 관리자 편집기(M4, 2026-08-05) — word_assets(단어 텍스트
// 키 기반 콘텐츠 자산) 목록/검색/편집/승인. 학생 화면 무관, supabase_v3_15
// 미실행이나 admin-content-write의 word_asset.upsert 액션 미배포 상태에서도
// 크래시 없이 각각 다른 안내 배너로 폴백한다(WordAssetPanel.jsx 헤더 주석).
import WordAssetPanel from './admin/WordAssetPanel'

// v3.12(2026-08-01) — 숙제 배정 저장(setTodaysAssignment/setAssignmentForDate)
// 실패 메시지를 사람이 바로 행동할 수 있는 한국어로 다듬는다. HTTP 404(
// admin-content-write 함수 자체가 아직 배포 안 됨 — wordLibrary.js
// callAdminContentWrite의 `관리자 쓰기 서비스 응답 실패(HTTP ${status})`
// 메시지)와 "연결 실패"(같은 함수의 fetch 자체가 실패한 경우)만 이 특정
// 안내로 바꾸고, 그 외 에러(예: 관리자 인증 만료 등 이미 명확한 메시지)는
// wordLibrary.js가 만든 원본 메시지를 그대로 보여준다 — wordLibrary.js의
// 에러 계약 자체는 전혀 바꾸지 않음(호출부에서만 표시 문구를 다듬음).
function assignmentErrorMessage(err) {
  const msg = err?.message || String(err || '')
  if (/HTTP 404/.test(msg) || msg.includes('연결 실패')) {
    return '숙제 저장 서버(admin-content-write)가 아직 배포되지 않았어요. docs/DEPLOY_COMMANDS_V311_V312.md 순서로 배포 후 다시 시도해주세요. (조회/현황은 계속 사용 가능)'
  }
  return msg
}

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

// 2026-08-01 "자동 생성"/일괄 배정용 — n일 전 로컬 날짜. tomorrowIsoStr과
// 동일한 조립 방식(wordLibrary.js의 localIsoDateStr, UTC toISOString()
// 절대 사용 안 함 — 위 버그와 같은 클래스 방지).
//
// 2026-08-02 — 로컬 정의를 제거하고 wordLibrary.js가 export하는 동일 구현을
// import한다(AssignmentHistoryPanel.jsx와 바이트 단위로 중복돼 있던 것을
// 단일 원본화, § import 목록 상단).

// 쓰기 시험(Spelling Test) 반별 설정 — 쓰기시험 사용 여부/철자 힌트 사용
// 여부/오답 반복 횟수. 기본값이 전부 꺼짐/3회라, 관리자가 여기서 직접
// 켜기 전까지는 학생 쪽에 아무 변화도 없음(WordBrowser의 모드 선택에서
// "쓰기"/"종합"의 스펠링 단계가 숨겨진 채로 유지됨).
function SpellingSettingsPanel({ targetClass, onSaved, adminPin }) {
  const [settings, setSettings] = useState(() => getClassSettings(targetClass))
  const [saving, setSaving] = useState(false)

  const save = async (next) => {
    setSettings(next) // 즉시 반영 (낙관적 업데이트) — 실패하면 아래서 되돌림
    setSaving(true)
    try {
      await setClassSettings(targetClass, next, adminPin)
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
          onChange={e => {
            // 2026-08-02 — 저장 직전에 UI가 직접 1~10으로 클램프해 "화면에
            // 보이는 값 = 실제 저장되는 값"을 보장한다(wordLibrary.js
            // setClassSettings도 동일한 범위로 방어적 클램프 — 이중 안전).
            // 빈 입력(지우는 중)은 아직 유효한 숫자가 아니므로 저장을
            // 건너뛰고 화면 표시만 갱신 — 그대로 save()를 호출하면 지우는
            // 순간(빈 문자열)에 서버가 이를 1로 해석해 저장해버려, 교사가
            // 다음 숫자를 마저 입력하기도 전에 원치 않는 값이 저장된다.
            const raw = e.target.value
            if (raw === '') { setSettings({ ...settings, wrongAnswerRepeatCount: raw }); return }
            const n = Number(raw)
            const clamped = Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : settings.wrongAnswerRepeatCount
            save({ ...settings, wrongAnswerRepeatCount: clamped })
          }}
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

// Teacher Controls 마스터 스위치(2026-07-19, GAME_DESIGN.md 13번 섹션) —
// SpellingSettingsPanel과 완전히 같은 패턴(같은 classes 테이블 반별 boolean
// 설정 관례, getClassSettings/setClassSettings 그대로 재사용, 기본 false
// opt-in). 이 스위치가 꺼진 반의 학생 화면에서는 Paul Rank/XP 관련 UI가
// 전혀 보이지 않는다(Dashboard.jsx 게이팅 참고) — 111명 실사용 학생에게
// 미검증 게임화 기능이 갑자기 노출되지 않도록 교사가 반별로 직접 켜야 한다.
function GameSettingsPanel({ targetClass, onSaved, adminPin }) {
  const [settings, setSettings] = useState(() => getClassSettings(targetClass))
  const [saving, setSaving] = useState(false)

  const save = async (next) => {
    setSettings(next) // 즉시 반영 (낙관적 업데이트) — 실패하면 아래서 되돌림
    setSaving(true)
    try {
      await setClassSettings(targetClass, next, adminPin)
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
      <p className="text-xs font-black text-purple-700">🎩 게임화 설정</p>
      <label className="flex items-center justify-between text-xs font-bold text-gray-700">
        게임화(Paul Rank) 사용
        <input type="checkbox" checked={settings.gamificationEnabled} disabled={saving}
          onChange={e => save({ ...settings, gamificationEnabled: e.target.checked })}
          className="w-5 h-5 accent-purple-500" />
      </label>
    </div>
  )
}

// Word King(2026-07-19, 게임화 하위카드 7번, GAME_DESIGN.md 5번 섹션) —
// "이번 주 Word King 계산" 수동 트리거(이 저장소엔 cron이 없어 관리자가
// 주 1회 버튼을 누르는 방식, api/compute-word-king.js 헤더 참고) + 결과
// 확인. 실제 미니게임/시상식 연출은 이번 범위 밖(텍스트 목록만).
// 점수 계산 자체는 전부 서버(service_role)가 entrance_test_results/
// xp_ledger를 재집계해서 수행 — 이 컴포넌트는 트리거 버튼과 결과 렌더링만.
function WordKingPanel({ targetClass, adminPin }) {
  const classId = getClassIdByName(targetClass)
  const [computing, setComputing] = useState(false)
  const [result, setResult] = useState(null) // 최근 계산 응답 또는 불러온 기록
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!classId) return
    fetchLatestWordKingPeriod(classId).then((r) => {
      if (!cancelled && r.scores.length > 0) setResult(r)
    })
    return () => { cancelled = true }
  }, [classId])

  if (!classId) return null

  const handleCompute = async () => {
    setComputing(true)
    setError('')
    try {
      const res = await triggerComputeWordKing({ classId, adminPin })
      if (res.reason === 'no_students') {
        setError('이 반에 학생이 없어 계산할 수 없어요.')
      } else {
        setResult({ periodStart: res.periodStart, periodEnd: res.periodEnd, scores: res.scores })
      }
    } catch (err) {
      setError('계산 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setComputing(false)
    }
  }

  return (
    <div className="bg-amber-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-black text-amber-700">👑 Word King (주간, 서버 계산)</p>
        <button onClick={handleCompute} disabled={computing}
          className="bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs btn-press hover:bg-amber-600 disabled:opacity-60">
          {computing ? '계산 중...' : '이번 주 Word King 계산'}
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-500">{error}</p>}
      {result && result.scores.length > 0 && (
        <div className="bg-white rounded-lg p-2">
          <p className="text-xs text-gray-400 mb-1">{result.periodStart} ~ {result.periodEnd} (활동 있는 학생만 표시)</p>
          <div className="space-y-1">
            {result.scores.map((s) => (
              <div key={s.studentId} className="flex items-center justify-between text-xs">
                <span className={s.rank === 1 ? 'font-black text-amber-600' : 'text-gray-600'}>
                  {s.rank === 1 ? '👑 ' : `${s.rank}. `}{s.studentName}
                </span>
                <span className="font-bold text-gray-500">{s.score}점</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {(!result || result.scores.length === 0) && !error && (
        <p className="text-xs text-gray-400">아직 계산된 기록이 없어요 — 버튼을 눌러 이번 주 점수를 계산하세요.</p>
      )}
    </div>
  )
}

// Seasonal Progression(2026-07-19, 게임화 하위카드 9번, GAME_DESIGN.md 9번
// 섹션) — "새 시즌 시작" 수동 트리거(이 저장소엔 cron이 없어 관리자가
// 학기/방학 경계에서 버튼을 누르는 방식, api/start-new-season.js 헤더
// 참고) + 현재 시즌 시작일 표시. House 팀 점수가 반(class) 경계를 넘어
// 전역 집계되므로(supabase_v2_8_seasonal_progression.sql "classes 컬럼
// 대신 별도 테이블을 쓴 이유" 참고) 이 패널도 반별 루프 안이 아니라
// 'classes' 탭 최상단에 한 번만 렌더된다(SpellingReviewQueuePanel과 같은
// 위치 — 반 무관 전역 패널 관례).
//
// 레벨/뱃지/스트릭은 이 액션으로 절대 바뀌지 않는다 — 이 컴포넌트는
// seasons 테이블에 새 경계 마커 행을 추가할 뿐, students/xp_ledger 등
// 어떤 영구 기록 테이블도 건드리지 않는다(api/start-new-season.js가
// seasons 테이블 하나만 다룬다). 확인 다이얼로그에 이 사실을 명확히 적어
// 관리자 불안감을 줄인다(반 삭제 확인 다이얼로그가 "학생 계정은 유지되고
// 반 배정만 해제됩니다"를 안내하는 것과 같은 방향).
//
// 2026-07-23(season-system-specialist) — 시즌 생애주기 확장에 맞춰 확인
// 다이얼로그를 구체화(현재/새 시즌 번호·시작일·영향 학생 수 표시) +
// fetchCurrentSeasonDetailed()로 "시즌 없음"과 "조회 실패"를 구분해
// 관리자가 오판하지 않게 함 + 더블클릭/중복 요청 방어(startingRef) +
// 에러 상세(code/details/hint) 표면화 + 새 시즌 이름/메모 입력칸 추가
// (triggerStartNewSeason이 이미 note를 받았지만 이 화면이 한 번도 넘긴
// 적이 없었다 — 원래 설계된 기능을 실제로 연결).
function SeasonPanel({ adminPin }) {
  const [season, setSeason] = useState(null) // {id, startedAt, note, seasonNumber, endedAt, isActive} | null(시즌 없음/SQL 미실행)
  const [loadError, setLoadError] = useState(null) // {code,message,details,hint} | null — "시즌 없음"이 아니라 진짜 조회 실패일 때만
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const startingRef = useRef(false) // React state 배칭 타이밍과 무관하게 더블클릭을 동기적으로 즉시 막는 보강 가드

  const load = async () => {
    setLoading(true)
    const { season: s, error: err } = await fetchCurrentSeasonDetailed()
    setSeason(s)
    setLoadError(err)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const studentCount = getStudents().length

  const handleStart = async () => {
    if (startingRef.current) return
    const currentLabel = season
      ? `${season.seasonNumber ? `${season.seasonNumber}번째 시즌` : '(번호 없음 — v3.5 SQL 실행 전)'}${season.note ? ` "${season.note}"` : ''} · 시작일 ${new Date(season.startedAt).toLocaleDateString('ko-KR')}`
      : '없음(이번이 첫 시즌)'
    const nextNumber = season?.seasonNumber ? season.seasonNumber + 1 : (season ? '?' : 1)
    const trimmedNote = noteInput.trim()
    const nextLabel = `${nextNumber}번째 시즌${trimmedNote ? ` "${trimmedNote}"` : ''}`
    const ok = window.confirm(
      '새 시즌을 시작할까요?\n\n' +
      `현재 시즌: ${currentLabel}\n` +
      `새 시즌: ${nextLabel}\n` +
      `영향받는 학생 수: ${studentCount}명\n\n` +
      '🔄 리셋되는 것: 하우스 팀 점수 화면(이 시점부터 새로 쌓이는 값으로 바뀜)\n' +
      '✅ 보존되는 것: XP, 누적 포인트, 레벨, 학습 기록, 연속학습일(스트릭), 티켓 잔액/상점 — 하나도 지워지지 않아요.\n\n' +
      '⚠️ 되돌릴 수 없어요 — 시작 후에는 이전 시즌으로 되돌아갈 수 없습니다(단, 이전 시즌 기록 자체는 삭제되지 않고 그대로 남아있어요).'
    )
    if (!ok) return
    startingRef.current = true
    setStarting(true)
    setError('')
    try {
      const res = await triggerStartNewSeason({ adminPin, note: trimmedNote || undefined })
      setSeason(res.season)
      setLoadError(null)
      setNoteInput('')
    } catch (err) {
      const msg = String(err?.message || err)
      if (err?.reason === 'table_missing' || msg.includes('table_missing')) {
        setError('아직 준비 중이에요 — supabase_v2_8_seasonal_progression.sql을 Supabase SQL Editor에서 실행해주세요.')
      } else {
        const detail = [err?.code, err?.details, err?.hint].filter(Boolean).join(' / ')
        setError(`시즌 시작 중 오류가 발생했어요: ${msg}${detail ? ` (${detail})` : ''}`)
      }
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <p className="text-sm font-black text-gray-700 mb-2">🗓️ 시즌 (House 리셋 경계)</p>
      <p className="text-xs text-gray-400 mb-3">
        레벨/뱃지/연속학습일/XP/티켓 잔액은 절대 리셋되지 않아요. 새 시즌을
        시작하면 하우스 팀 점수 화면만 이 시점부터 새로 쌓이는 값으로
        바뀌어요(기존 기록은 삭제되지 않고 이전 시즌 기록으로 그대로
        보존됩니다).
      </p>
      {loading ? (
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      ) : loadError ? (
        <p className="text-xs font-bold text-red-500 mb-3">
          시즌 정보를 불러오지 못했어요(시즌이 없는 게 아니라 조회 오류예요): {loadError.message}
          {loadError.code ? ` (code: ${loadError.code})` : ''}
        </p>
      ) : (
        <p className="text-xs text-gray-500 mb-3">
          {season
            ? `현재 시즌: ${season.seasonNumber ? `${season.seasonNumber}번째` : '(번호 없음 — v3.5 SQL 실행 전)'} · 시작일 ${new Date(season.startedAt).toLocaleDateString('ko-KR')}${season.note ? ` (${season.note})` : ''} · 대상 학생 ${studentCount}명`
            : `아직 시즌이 시작되지 않았어요(대상 학생 ${studentCount}명) — 하우스 팀 점수가 전체 누적 값으로 표시되고 있어요.`}
        </p>
      )}
      <input
        type="text"
        value={noteInput}
        onChange={(e) => setNoteInput(e.target.value)}
        placeholder="새 시즌 이름/메모(선택, 예: 2026 2학기)"
        maxLength={200}
        disabled={starting}
        className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 mb-3 disabled:opacity-60"
      />
      {error && <p className="text-xs font-bold text-red-500 mb-2">{error}</p>}
      <button onClick={handleStart} disabled={starting}
        className="bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs btn-press hover:bg-indigo-600 disabled:opacity-60">
        {starting ? '시작 중...' : '새 시즌 시작'}
      </button>
    </div>
  )
}

// 쓰기 답안 검토 큐(SpellingReviewQueuePanel) + "선생님이 같은 검토를 두
// 번 하지 않는" 자동 학습 시스템 카드 3개(LearningRecommendationsCard/
// AiSavingsCard/LearningRateCard)는 2026-07-24 코드 품질 감사 대응으로
// src/components/admin/ 아래 별도 파일로 이동했다(StudentDirectory.jsx
// 2026-07-22와 동일한 순수 이동 — 로직 변경 없음, 위 import 참고).

// v1.3 "날짜별 숙제 배정" — 오늘 포함 이후 날짜에 미리 단어를 배정해두는
// UI. 과거 날짜는 min 속성으로 아예 선택 못 하게 막아 이미 지나간 학습
// 기록을 실수로 고쳐쓰는 걸 방지. 오늘 배정(체크박스 토글, 위 블록)과
// 완전히 분리된 별도 컴포넌트라 기존 "오늘의 단어" 동작에는 전혀 영향
// 없음(같은 setAssignmentForDate 저장 경로를 공유할 뿐 — 실제
// setTodaysAssignment도 내부적으로 이 함수를 today 날짜로 호출함).
//
// A2(2026-08-02) — min이 "내일"이라 "자동 생성"/"여러 날짜 일괄 배정"을
// 정작 매일 하는 "오늘 숙제"에는 못 썼다. min을 오늘로 완화해 오늘 날짜도
// 이 패널로 자동 생성/저장할 수 있게 한다(저장 경로는 기존
// setAssignmentForDate + adminPin 그대로 — 새 쓰기 경로 없음).
function FutureAssignmentPlanner({ targetClass, words, adminPin, units, activeUnit }) {
  const [date, setDate] = useState(localIsoDateStr())
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  // 2026-08-01 "자동 생성" — 미리보기 전용 상태(체크박스 Set만 채움).
  // 실제 저장은 항상 아래 기존 save()/setAssignmentForDate(adminPin
  // 듀얼패스) 그대로 사용 — 이 기능이 새 쓰기 경로를 만들지 않는다.
  const [autoCount, setAutoCount] = useState(10)
  const [autoUnitName, setAutoUnitName] = useState(activeUnit)
  const [autoGenLoading, setAutoGenLoading] = useState(false)
  // 지금 보고 있던 유닛이 바뀌면 "자동 생성" 대상 유닛 선택도 그 유닛으로
  // 맞춘다(관리자가 명시적으로 다른 유닛을 골라도 되지만, 기본값은 항상
  // 지금 보고 있는 유닛).
  useEffect(() => { setAutoUnitName(activeUnit) }, [activeUnit, targetClass])

  // 2026-08-01 "여러 날짜 일괄 배정" — planBulkDates(순수 함수)로 미리보기
  // 표(날짜→단어)를 만든 다음, 승인하면 날짜별로 순차 저장한다. 각
  // 저장은 기존 setAssignmentForDate(adminPin 듀얼패스) 그대로 — upsert라
  // 재시도해도 안전(멱등)하다. bulkPlan이 null이면 아직 미리보기 전.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkUnitName, setBulkUnitName] = useState(activeUnit)
  const [bulkStart, setBulkStart] = useState(localIsoDateStr())
  const [bulkDays, setBulkDays] = useState(7)
  const [bulkCount, setBulkCount] = useState(10)
  const [bulkPlan, setBulkPlan] = useState(null) // { [dateStr]: string[] } | null
  const [bulkStates, setBulkStates] = useState([]) // [{ date, status: 'idle'|'pending'|'done'|'error', message }]
  const [bulkSaving, setBulkSaving] = useState(false)
  useEffect(() => { setBulkUnitName(activeUnit) }, [activeUnit, targetClass])

  // "YYYY-MM-DD" 문자열을 로컬 자정 Date로 직접 조립(new Date(str) 문자열
  // 파싱은 UTC로 해석돼 wordLibrary.js의 localIsoDateStr()과 하루씩
  // 어긋날 수 있다 — tomorrowIsoStr()과 동일한 "직접 조립" 원칙).
  const parseIsoDateLocal = (s) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const bulkDatesList = () => {
    const n = Math.min(14, Math.max(1, Number(bulkDays) || 0))
    const start = parseIsoDateLocal(bulkStart)
    const out = []
    for (let i = 0; i < n; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      out.push(localIsoDateStr(d))
    }
    return out
  }

  const buildBulkPreview = async () => {
    const unitObj = (units || []).find((u) => u.name === bulkUnitName)
    const unitWords = unitObj?.words || []
    if (unitWords.length === 0) {
      alert('선택한 유닛에 단어가 없어요 — 다른 유닛을 골라주세요.')
      return
    }
    try {
      const toDateStr = localIsoDateStr()
      const fromDateStr = isoDaysAgoStr(14)
      const history = await fetchAssignmentHistory(targetClass, fromDateStr, toDateStr)
      const recentAssignedSlugSets = history.map((h) => new Set(h.wordIds))
      const dates = bulkDatesList()
      const plan = planBulkDates({ unitWords, recentAssignedSlugSets, dates, count: Math.max(1, Number(bulkCount) || 0) })
      setBulkPlan(plan)
      setBulkStates(dates.map((d) => ({ date: d, status: 'idle', message: '' })))
    } catch (err) {
      alert('일괄 계획 생성 중 오류가 발생했어요: ' + assignmentErrorMessage(err))
    }
  }

  // 날짜별 순차 저장 — 병렬로 쏘지 않고 하나씩(레이스/서버 부하 방지),
  // 도중 실패해도 나머지 날짜는 계속 진행. upsert 저장이라 재시도해도
  // 안전(멱등) — "실패한 날짜만 다시 저장" 버튼이 이 함수를 그 목록으로만
  // 재호출한다.
  const saveBulkDates = async (datesToSave) => {
    if (!bulkPlan || datesToSave.length === 0) return
    setBulkSaving(true)
    setBulkStates((prev) => prev.map((s) => (datesToSave.includes(s.date) ? { ...s, status: 'pending', message: '' } : s)))
    for (const d of datesToSave) {
      const wordIds = bulkPlan[d] || []
      try {
        await setAssignmentForDate(targetClass, d, wordIds, adminPin)
        setBulkStates((prev) => prev.map((s) => (s.date === d ? { ...s, status: 'done', message: '' } : s)))
      } catch (err) {
        setBulkStates((prev) => prev.map((s) => (s.date === d ? { ...s, status: 'error', message: assignmentErrorMessage(err) } : s)))
      }
    }
    setBulkSaving(false)
  }
  const saveAllBulk = () => saveBulkDates(bulkStates.map((s) => s.date))
  const retryFailedBulk = () => saveBulkDates(bulkStates.filter((s) => s.status === 'error').map((s) => s.date))

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
      await setAssignmentForDate(targetClass, date, [...selected], adminPin)
      setSaved(true)
    } catch (err) {
      alert('저장 중 오류가 발생했어요: ' + assignmentErrorMessage(err))
    }
  }

  // 2026-08-01 "자동 생성" — assignmentPlanner.js(순수 함수)로 다음 배정
  // 후보를 계산해 체크박스 Set만 채운다(미리보기 — 저장은 여전히 위
  // save() 버튼을 눌러야 함). 최근 배정 이력은 fetchAssignmentHistory로
  // 최근 14일치를 읽어 "이미 최근에 낸 단어"를 최대한 피하게 한다(조회
  // 실패해도 fetchAssignmentHistory가 빈 배열로 폴백하므로 이 기능
  // 자체가 죽지 않음 — 그냥 이력 없이 유닛 처음부터 채움).
  const autoGenerate = async () => {
    const unitObj = (units || []).find((u) => u.name === autoUnitName)
    const unitWords = unitObj?.words || []
    if (unitWords.length === 0) {
      alert('선택한 유닛에 단어가 없어요 — 다른 유닛을 골라주세요.')
      return
    }
    setAutoGenLoading(true)
    try {
      const toDateStr = localIsoDateStr()
      const fromDateStr = isoDaysAgoStr(14)
      const history = await fetchAssignmentHistory(targetClass, fromDateStr, toDateStr)
      const recentAssignedSlugSets = history.map((h) => new Set(h.wordIds))
      const picked = pickNextAssignment({ unitWords, recentAssignedSlugSets, count: Math.max(1, Number(autoCount) || 0) })
      setSelected(new Set(picked))
      setSaved(false)
    } catch (err) {
      alert('자동 생성 중 오류가 발생했어요: ' + assignmentErrorMessage(err))
    } finally {
      setAutoGenLoading(false)
    }
  }

  return (
    <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-black text-indigo-700 flex-shrink-0">📅 날짜 배정 (오늘 포함)</p>
        <input type="date" value={date} min={localIsoDateStr()} onChange={e => setDate(e.target.value)}
          className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold bg-white" />
      </div>
      {/* 2026-08-01 "자동 생성" — 아래 체크박스 목록을 자동으로 채우기만
          함(미리보기). 실제 저장은 여전히 아래 "저장" 버튼을 눌러야 함 —
          새 저장 경로 없음. */}
      {(units || []).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-white rounded-lg p-2 border-2 border-indigo-100">
          <select value={autoUnitName} onChange={(e) => setAutoUnitName(e.target.value)} disabled={autoGenLoading}
            className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold bg-white">
            {(units || []).map((u) => <option key={u.id || u.name} value={u.name}>{u.name}</option>)}
          </select>
          <input type="number" min={1} value={autoCount} disabled={autoGenLoading}
            onChange={(e) => setAutoCount(e.target.value)}
            className="w-16 border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold text-center bg-white" />
          <button onClick={autoGenerate} disabled={autoGenLoading}
            className="bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg text-xs btn-press disabled:opacity-60">
            {autoGenLoading ? '생성 중...' : `자동 생성 (${autoCount}개)`}
          </button>
        </div>
      )}
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

      {/* 2026-08-01 "여러 날짜 일괄 배정" — 위 단일 날짜 배정과 완전히
          분리된 별도 미리보기/저장 흐름(같은 setAssignmentForDate 저장
          경로 재사용). 미리보기 승인 전에는 어떤 쓰기도 일어나지 않는다. */}
      <div className="border-t-2 border-indigo-100 pt-2">
        <button onClick={() => setBulkOpen((v) => !v)}
          className="text-xs font-bold text-indigo-600 btn-press">
          {bulkOpen ? '▲ 여러 날짜 일괄 배정 닫기' : '▼ 여러 날짜 일괄 배정 (여러 날에 나눠서 자동 생성)'}
        </button>
        {bulkOpen && (units || []).length > 0 && (
          <div className="mt-2 space-y-2 bg-white rounded-lg p-2 border-2 border-indigo-100">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={bulkUnitName} onChange={(e) => setBulkUnitName(e.target.value)} disabled={bulkSaving}
                className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold bg-white">
                {(units || []).map((u) => <option key={u.id || u.name} value={u.name}>{u.name}</option>)}
              </select>
              <input type="date" value={bulkStart} min={localIsoDateStr()} disabled={bulkSaving}
                onChange={(e) => setBulkStart(e.target.value)}
                className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold bg-white" />
              <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
                일수
                <input type="number" min={1} max={14} value={bulkDays} disabled={bulkSaving}
                  onChange={(e) => setBulkDays(e.target.value)}
                  className="w-14 border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold text-center bg-white" />
              </label>
              <label className="text-xs font-bold text-gray-600 flex items-center gap-1">
                하루 단어수
                <input type="number" min={1} value={bulkCount} disabled={bulkSaving}
                  onChange={(e) => setBulkCount(e.target.value)}
                  className="w-14 border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold text-center bg-white" />
              </label>
              <button onClick={buildBulkPreview} disabled={bulkSaving}
                className="bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg text-xs btn-press disabled:opacity-60">
                미리보기 생성
              </button>
            </div>
            {bulkPlan && (
              <>
                <div className="max-h-48 overflow-y-auto border-2 border-gray-100 rounded-lg">
                  <table className="w-full text-xs">
                    <tbody>
                      {bulkStates.map(({ date: d, status, message }) => {
                        const bulkUnitObj = (units || []).find((u) => u.name === bulkUnitName)
                        const wordLookupBulk = new Map((bulkUnitObj?.words || []).map((w) => [wordSlug(w.word), w.word]))
                        const wordTexts = (bulkPlan[d] || []).map((slug) => wordLookupBulk.get(slug) || slug)
                        const badge = status === 'done' ? '✅ 저장됨'
                          : status === 'pending' ? '⏳ 저장 중'
                          : status === 'error' ? '❌ 실패'
                          : '⬜ 대기'
                        return (
                          <tr key={d} className="border-b border-gray-50 last:border-0">
                            <td className="px-2 py-1 font-bold text-gray-700 whitespace-nowrap">{d}</td>
                            <td className="px-2 py-1 text-gray-600">{wordTexts.join(', ')}</td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              {badge}
                              {status === 'error' && message && <span className="block text-red-500">{message}</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={saveAllBulk} disabled={bulkSaving}
                    className="bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs btn-press disabled:opacity-60">
                    {bulkSaving ? '저장 중...' : '일괄 저장'}
                  </button>
                  {bulkStates.some((s) => s.status === 'error') && (
                    <button onClick={retryFailedBulk} disabled={bulkSaving}
                      className="bg-white border-2 border-red-300 text-red-500 font-bold px-3 py-1.5 rounded-lg text-xs btn-press disabled:opacity-60">
                      실패한 날짜만 다시 저장
                    </button>
                  )}
                </div>
              </>
            )}
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
// Phase 2 M4e(2026-08-04) — "Completed XP"(요구 7)가 가리키는 event_type.
// paulRankShared.js XP_EVENT_TABLE의 'word-view-complete' 키와 반드시
// 동일해야 한다(M4c에서 이 이벤트가 round.completedToday, 즉 "완료" 신호
// 기준으로 트리거되도록 재정의됨 — 그 파일 헤더 주석 참고). 문자열을 여기
// 하드코딩하는 이유: paulRankShared.js는 이벤트 키를 별도 export로 노출하지
// 않고(XP_EVENT_TABLE 객체 자체만 export), 이 화면은 그 표 전체가 아니라
// 딱 이 한 축만 필요하다 — 표 전체를 import해 순회하는 것보다 이 쪽이
// 더 명확하다고 판단(과도한 일반화 지양).
const COMPLETED_XP_EVENT_TYPE = 'word-view-complete'

function AdminDashboard({ adminPin } = {}) {
  const classList = getClassNames()
  const [selectedClass, setSelectedClass] = useState(classList[0] || '')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [reportFor, setReportFor] = useState(null) // student name currently showing a generated report
  const [copied, setCopied] = useState(false)
  const [wordStatusSummary, setWordStatusSummary] = useState({}) // v1.5 — studentId -> {known,unknown,skipped,mastered}
  const [resettingId, setResettingId] = useState(null)
  const [xpTotals, setXpTotals] = useState({}) // Paul Rank System — studentId -> total_xp (xp_ledger 미존재 시 빈 객체, 전원 0 취급)
  const [completedXpMap, setCompletedXpMap] = useState({}) // Phase 2 M4e(2026-08-04) — studentId -> { [eventType]: amount }, fetchXpByEventType 원본 그대로 보관(다음 라운드에 다른 축 추가 시 재사용)

  const wordLookup = useMemo(() => {
    if (!selectedClass) return {}
    const units = getClassUnits(selectedClass) || []
    const map = {}
    units.forEach(u => (u.words || []).forEach(w => { map[wordSlug(w.word)] = w }))
    return map
  }, [selectedClass])

  // Phase 2 M4(2026-08-03) — Completed %/Cleared % 분모("그 학생의 현재
  // 유닛 단어 수")용. 새 Supabase 조회 0건 — getStudentsInClass/getClassWords
  // 둘 다 이미 로드된 캐시(wordLibrary.js)에서만 읽는다. 학생마다 현재 유닛이
  // 다를 수 있어(setStudentUnit) 반 전체가 아니라 학생별로 계산한다.
  // rows도 deps에 둔 이유: load() 이후(유닛 변경 반영 등) 캐시가 갱신되면
  // 다시 계산되게.
  const unitNameById = useMemo(() => {
    if (!selectedClass) return {}
    return Object.fromEntries(getStudentsInClass(selectedClass).map(s => [s.id, s.unitName]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, rows])

  const getUnitWordSlugs = (studentId) => getClassWords(selectedClass, unitNameById[studentId]).map(w => w.id)

  const statsFor = (r) => computeStudentStats(r, wordStatusSummary, null, getUnitWordSlugs(r.id))

  // Phase 2 M4e(2026-08-04) — Completed XP(요구 7). completedXpMap이
  // 비어있으면(xp_ledger 미실행/조회 실패) 0으로 안전 폴백(크래시 없음,
  // fetchXpTotals의 xpTotals[r.id] || 0과 동일한 원칙).
  const completedXpFor = (studentId) => completedXpMap[studentId]?.[COMPLETED_XP_EVENT_TYPE] || 0

  // 반 평균 Completed %(요약 줄용) — unitSize>0(분모 있음)인 학생만 평균에
  // 포함, 전원 분모 0(반에 단어 자체가 없음 등)이면 null로 안전하게 폴백.
  const classAvgCompletedPct = useMemo(() => {
    if (!selectedClass || rows.length === 0) return null
    const pcts = rows.map(r => statsFor(r).completedPct).filter(p => p !== null)
    if (pcts.length === 0) return null
    return Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, wordStatusSummary, unitNameById])

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
      const [dashboardRows, wsSummary, xpMap, completedXp] = await Promise.all([
        fetchDashboardData(ids),
        // v1.5 — word_status 마이그레이션(supabase_v1_5_word_status.sql) 전에도
        // 안전하게 빈 객체를 반환하도록 wordLibrary.js에서 이미 처리함.
        fetchWordStatusSummary(ids).catch(() => ({})),
        // Paul Rank System — supabase_v2_3_paul_rank.sql 미실행이어도
        // fetchXpTotals 자체가 빈 객체로 폴백(크래시 없음).
        fetchXpTotals(ids).catch(() => ({})),
        // Phase 2 M4e(2026-08-04) — Completed XP(요구 7). fetchXpTotals와
        // 나란히 같은 Promise.all에 추가(학생별 N회 조회 금지) — 쿼리 1회 추가.
        fetchXpByEventType(ids, [COMPLETED_XP_EVENT_TYPE]).catch(() => ({})),
      ])
      if (dashLoadReqIdRef.current !== reqId) return // 더 최신 반 선택이 있음 — 버림
      setRows(dashboardRows)
      setWordStatusSummary(wsSummary)
      setXpTotals(xpMap)
      setCompletedXpMap(completedXp)
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
    // Phase 2 M4(2026-08-03) — Completed %/Cleared % 2열 추가(statsFor가
    // 카드 렌더와 동일 계산을 재사용, 새 조회 없음). hasProgressData가
    // false면 퍼센트 대신 빈 문자열("")로 남겨 "0%"와 구분(정직성 원칙).
    const header = ['이름', '오늘 공부함', '숙제 완료', '퀴즈 정답률(%)', '퀴즈 정답/전체', '발음 연습 횟수', '별', '연속학습일', '스티커', '클리어 단어', '아는 단어', '복습 필요 단어', '많이 틀린 단어(상위5)']
      .concat(['학습 완료 Completed(%, 현재 유닛 기준)', '실력 인증 Cleared(%, 현재 유닛 기준)'])
      // M4b(2026-08-04) Cleared Stars — 기존 Completed %/Cleared % 열 옆에 추가.
      .concat(['실력 별(Cleared Stars)'])
      // M4e(2026-08-04) — Completed XP(요구 7). xp_ledger 원장 기준(파생 아님).
      .concat(['🎓 Completed XP'])
      .concat(['최근 7일 완료 카테고리(0~4, 오늘부터 과거순)'])
    const body = rows.map(r => {
      const { studiedToday, homeworkDone, last7, quizCorrect, quizTotal, quizAccuracy, pronAttempts, topMissed, ws,
              hasProgressData, completedPct, clearedWordPct, clearedStars } = statsFor(r)
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
        hasProgressData && completedPct !== null ? completedPct : '',
        hasProgressData && clearedWordPct !== null ? clearedWordPct : '',
        clearedStars,
        completedXpFor(r.id),
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

  // 2026-08-01 — 대시보드 헤더 한 줄 요약("오늘 숙제 완료 N/M명 · 오늘
  // 배정 단어 K개"). 새 Supabase 조회 없음(헌법 규칙, 이 파일 위쪽 CSV
  // 내보내기 주석과 동일한 원칙) — 이미 로드된 rows/wordStatusSummary를
  // computeStudentStats()로, K는 이미 있던 getTodaysAssignmentWordIds
  // 캐시 조회로만 계산.
  const todaysAssignedCount = selectedClass ? getTodaysAssignmentWordIds(selectedClass).length : 0
  const todaysHomeworkDoneCount = rows.filter((r) => computeStudentStats(r, wordStatusSummary).homeworkDone).length

  // A10(2026-08-02) — 대시보드에 정렬/필터가 없어 학생 수가 많은 반은
  // 미완료 학생을 찾으려면 카드를 하나씩 훑어야 했다. 이미 계산 중인
  // computeStudentStats().homeworkDone만 써서(새 조회 0건) "숙제 미완료만
  // 보기" 퀵필터 + 미완료 우선 정렬을 추가한다 — 원본 rows/렌더 로직은
  // 그대로 두고 표시 순서/목록만 파생.
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false)
  const displayRows = useMemo(() => {
    const withDone = rows.map((r) => ({ r, homeworkDone: computeStudentStats(r, wordStatusSummary).homeworkDone }))
    const filtered = showIncompleteOnly ? withDone.filter((x) => !x.homeworkDone) : withDone
    // 미완료 우선(안정 정렬 — 완료/미완료 그룹 내부 순서는 원래 rows 순서 유지)
    return filtered
      .map((x, i) => ({ ...x, i }))
      .sort((a, b) => (a.homeworkDone === b.homeworkDone ? a.i - b.i : a.homeworkDone ? 1 : -1))
      .map((x) => x.r)
  }, [rows, wordStatusSummary, showIncompleteOnly])

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
          <p className="text-xs font-bold text-teal-700 mt-2">
            📌 오늘 숙제 완료 {todaysHomeworkDoneCount} / {rows.length}명 · 오늘 배정 단어 {todaysAssignedCount}개
          </p>
        )}
        {/* Phase 2 M4(2026-08-03) — 반 평균 Completed %(학습 진행률, 각
            학생 현재 유닛 기준). 분모가 있는 학생이 1명도 없으면(반에 단어가
            아직 없는 등) 문구 자체를 숨긴다(0%로 오해할 여지 차단). */}
        {selectedClass && rows.length > 0 && classAvgCompletedPct !== null && (
          <p className="text-xs font-bold text-blue-600 mt-1">
            📖 반 평균 학습 완료(Completed) {classAvgCompletedPct}% (각자 현재 유닛 기준)
          </p>
        )}
        {selectedClass && rows.length > 0 && (
          <button onClick={() => setShowIncompleteOnly((v) => !v)}
            aria-pressed={showIncompleteOnly}
            className={`w-full mt-2 font-bold py-2 rounded-xl text-xs btn-press ${showIncompleteOnly ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
            {showIncompleteOnly ? `⬜ 숙제 미완료만 보기 중(${todaysHomeworkDoneCount < rows.length ? rows.length - todaysHomeworkDoneCount : 0}명) — 전체 보기로` : '⬜ 숙제 미완료만 보기'}
          </button>
        )}
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
      {!loading && selectedClass && rows.length > 0 && showIncompleteOnly && displayRows.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-6">🎉 전원 오늘 숙제 완료!</p>
      )}

      {/* 2026-08-01 — 배정 이력 + 완료 현황(읽기 전용, admin-content-write
          배포 여부와 무관하게 항상 동작). 대시보드 탭 어디서든 볼 수 있게
          반 선택 위젯 아래, 학생 카드 목록 위에 배치.
          A3(2026-08-02) — "오늘로 복사" 저장 버튼이 setAssignmentForDate를
          쓰므로 adminPin을 전달(기존 dual-path 그대로, 없으면 레거시 anon
          upsert로 폴백). */}
      <AssignmentHistoryPanel adminPin={adminPin} />

      {/* A10(2026-08-02) — displayRows(미완료 우선 정렬 + 선택적 미완료
          전용 필터)로 렌더. 카드 내부 렌더/로직은 전혀 안 바꿈. */}
      {!loading && displayRows.map(r => {
        const { studiedToday, homeworkDone, last7, quizCorrect, quizTotal, quizAccuracy, pronAttempts, topMissed, ws,
                hasProgressData, unitSize, completedInUnitCount, clearedWordInUnitCount, completedPct, clearedWordPct,
                todayCompletedCount, todayWordsViewedCount, clearedStars } =
          statsFor(r)
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
                {/* Phase 2 M4(2026-08-03) — 운영자 확정 정의: completed(학습
                    진행률)/cleared(실력 판단, 퀴즈 1회 이상 정답) 둘 다 표시.
                    분모는 "현재 유닛 단어 수"(unitSize) — 화면에 그대로 명시.
                    hasProgressData가 false(한 번도 동기화 안 됨)면 "0%"가
                    아니라 "아직 기록 없음"으로 정직하게 표시(정의상 구분). */}
                <p className="text-xs text-gray-400 mt-0.5">
                  {!hasProgressData
                    ? '📖 학습/실력 기록 없음(아직 동기화 전)'
                    : unitSize === 0
                      ? '📖 학습/실력 기록: 현재 유닛에 단어 없음'
                      : `📖 학습 완료 ${completedPct}%(${completedInUnitCount}/${unitSize}) · 🎯 실력 인증 ${clearedWordPct}%(${clearedWordInUnitCount}/${unitSize})`}
                </p>
                {/* Phase 2 M4a(2026-08-04, 관측 배선) — round.completedToday
                    (신규 일별 카운터)/wordsViewed 노출. 새 쿼리 0건(progress_data는
                    이미 위 통계와 같은 row에서 읽음), 보상 판정과 무관한 순수
                    관측 지표 — 값이 없거나 아직 동기화 전이면 "-"로 크래시 없이. */}
                <p className="text-xs text-gray-400 mt-0.5">
                  {hasProgressData
                    ? `📚 오늘 학습완료 ${todayCompletedCount}개 / 단어보기 ${todayWordsViewedCount}개`
                    : '📚 오늘 학습완료 - / 단어보기 -'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-black text-yellow-600">⭐ {r.progress?.total_stars ?? 0}</p>
                {/* M4b(2026-08-04) Cleared Stars — clearedWords.length에서
                    파생(useStudent.js CLEARED_STAR_PER_WORD 헤더 참고), total_stars와
                    합산하지 않고 별도 줄로만 표시(관리자는 원본 별/실력 별을
                    구분해서 볼 수 있어야 함). clearedStars가 0이면 구 데이터일
                    수 있으므로 숨기지 않고 0으로 그대로 표시(정직성). */}
                <p className="text-xs text-yellow-500">✨ 실력 별 {clearedStars}</p>
                {/* Phase 2 M4e(2026-08-04, 요구 7) — Completed XP. xp_ledger
                    원장에서 event_type='word-view-complete'만 골라 합산한
                    값(파생 아님, xpTotals의 전체 합과는 다른 축) — M4b의 실력
                    별(clearedStars) 표시 바로 옆에 배치. xp_ledger 미실행/조회
                    실패 환경은 completedXpFor가 0으로 안전 폴백. */}
                <p className="text-xs text-emerald-500">🎓 Completed XP {completedXpFor(r.id)}</p>
                <p className="text-xs text-orange-400">🔥 {r.progress?.streak ?? 0}일 연속</p>
                {/* Paul Rank System(2026-07-19) — XP는 별과 별개 원장(파생 아님).
                    xp_ledger 미실행 환경이면 xpTotals[r.id]가 undefined → 0으로 표시. */}
                <p className="text-xs text-indigo-400">🎩 {computeRankState(xpTotals[r.id] || 0).rank.name} (XP {xpTotals[r.id] || 0})</p>
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
  // [2026-08-25 재발 방지] 실사고 6건에서 실제로 관측된 헤더 라벨을 추가한다.
  // 교재 9개 중 6개에 이름이 "Unit"이고 단어가 1개뿐인 가짜 유닛이 있었고,
  // 그 1개 단어의 정체는 전부 헤더 라벨이었다("English"/"Korean" 5건,
  // "Word / Phrase"/"뜻" 1건). 이 라벨들이 별칭에 없어 hasHeader가 false가
  // 되고, 헤더 행이 rows.slice(1)로 잘리지 않은 채 데이터로 편입됐다.
  // 추가만 한다 — 기존 별칭이 매칭되던 파일의 인식 결과는 그대로다.
  // 의도적 제외: '영어'/'한글'처럼 흔한 낱말은 넣지 않는다. 실제 어휘 행
  // ("English"/"영어")이 헤더로 오인돼 통째로 버려지는 것을 막기 위해서다.
  word:    ['word', '단어', '영단어', 'word / phrase', 'word/phrase', 'english', '영어·어구', '어휘·어구'],
  meaning: ['meaning', '뜻', '의미', '한글뜻', 'korean'],
  unit:    ['unit', '유닛', '단원'],
  // "no"/"번호" is recognized only so it can be explicitly ignored — it's
  // a row number, never a word/meaning/class.
  no:      ['no', '번호'],
  // M3c(2026-08-05) — 전부 선택 컬럼(없어도 기존과 100% 동일 동작). 헤더가
  // 명시적으로 있을 때만 인식된다 — 헤더 미검출 시의 위치 추정 폴백
  // (parseExcelRows의 "no header" 분기, :1189-1197 근방)은 word/meaning/
  // unit 3종만 다루고 이 4개는 절대 추정하지 않는다(지어내지 않음).
  example:            ['example', '예문', '영어예문'],
  exampleTranslation: ['example_translation', '예문번역', '해석'],
  partOfSpeech:       ['pos', 'part_of_speech', '품사'],
  cefr:               ['cefr', '레벨', '난이도등급'],
}

// [2026-08-25 재발 방지] 위 별칭 전부를 합친 헤더 라벨 집합. 위치 추정
// 경로(헤더 미검출)에서 "첫 행이 사실은 헤더였다"를 판정하는 데만 쓴다 —
// 컬럼 매핑에는 관여하지 않는다.
const HEADER_LABELS = new Set(Object.values(HEADER_ALIASES).flat())
const isHeaderLabel = (s) => HEADER_LABELS.has(String(s ?? '').trim().toLowerCase())

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

  // [2026-08-28] 컬럼 매핑 오인 경고 — "조용히 잘못 저장"을 막는 신호.
  // 파싱 결과를 재해석하지 않는다(3열 파일에서 첫 칸이 행번호인지 유닛번호
  // 인지는 원리적으로 구분 불가). 대신 의심 신호만 모아 미리보기가 저장을
  // 막게 한다. 오탐이 잦으면 관리자가 경고를 무시하게 되므로, 정상 파일에서
  // 절대 뜨지 않는 강한 신호만 쓴다(verify:excel-header CASE I 오탐 반증).
  const warnings = []
  const warn = (code, message, detail) => {
    if (!warnings.some((w) => w.code === code)) warnings.push({ code, message, detail })
  }

  // A6(2026-08-02) — 헤더 없는 파일의 위치 추정 경로에서, 첫 칸이 전부
  // 숫자(번호 열)면 이전엔 그 번호를 그대로 word로 읽어버렸다(예:
  // "1, apple, 사과" -> word="1"). 데이터 행 전체의 0번째 칸이 전부
  // 순수 숫자일 때만 번호 열로 간주해 한 칸씩 밀어 읽는다(오탐 방지 —
  // 헤더가 이미 감지된 경우엔 적용 안 함).
  // [2026-08-28] 선두 헤더/제목 블록 — 첫 "실데이터로 보이는 행" 직전까지.
  // 헤더는 파일 맨 위에만 존재하므로 이 구간에서만 헤더 라벨 행을 걸러낸다.
  // 3행을 넘겨 탐색하지 않는다(그 아래는 무조건 데이터로 취급 — 실제 어휘를
  // 잃지 않는 쪽으로 보수적으로).
  let leadingCount = 0
  if (!hasHeader) {
    const MAX_LEADING = 3
    for (let i = 0; i < Math.min(MAX_LEADING, dataRows.length); i++) {
      const v = (dataRows[i] || []).map((c) => (c == null ? '' : String(c).trim()))
      const nonEmpty = v.filter(Boolean)
      // 셀이 1개뿐인 행(파일 제목) 또는 헤더 라벨이 2개 이상인 행은 선두 블록.
      if (nonEmpty.length <= 1 || nonEmpty.filter(isHeaderLabel).length >= 2) leadingCount = i + 1
      else break
    }
  }
  // leadingCount 가 0 이면 아래 rowIdx 가드는 예전의 rowIdx===0 과 완전히
  // 동일하게 동작한다(첫 행이 헤더 라벨 쌍이면 leadingCount 가 1 이 되어
  // rowIdx <= 0, 즉 0번 행만 대상) — 기존 동작 무회귀.
  const leadingHeaderEnd = Math.max(0, leadingCount - 1)

  // 선두 제목/헤더 블록은 번호 열 판정에서 제외한다. 제목 행
  // ("2학년 천재소영순 Unit 8") 하나 때문에 col0AllNumeric 이 false 가 되면
  // 진짜 번호 열이 있는 파일에서도 오프셋이 0 이 되어 컬럼이 한 칸 밀린다
  // (word="1", meaning="learn"). leadingCount 가 0 이면 예전과 동일한 입력.
  const bodyRows = leadingCount > 0 ? dataRows.slice(leadingCount) : dataRows
  let numberColOffset = 0
  if (!hasHeader && bodyRows.length > 0) {
    const col0AllNumeric = bodyRows.every((r) => {
      if (!Array.isArray(r) || r.length === 0) return false
      const v = String(r[0] ?? '').trim()
      return v !== '' && /^\d+$/.test(v)
    })
    if (col0AllNumeric) numberColOffset = 1
  }

  // M3c(2026-08-05) — 빈 셀은 undefined로 남긴다(''가 아니라) — 다운스트림
  // (buildUnitWordAssetPayloads/buildRuleBasedAssets)이 "값이 없음"과
  // "빈 문자열이 명시적으로 들어옴"을 구분하지 않고 둘 다 지어내지 않기로
  // 처리하지만, undefined로 통일해 두면 그 계약이 더 명확해진다.
  const orUndef = (v) => (v === '' || v === undefined ? undefined : v)

  const result = dataRows
    .map((r, rowIdx) => {
      if (!Array.isArray(r) || r.length === 0) return null
      const values = r.map((cell) => (cell == null ? '' : String(cell).trim()))
      let word = '', meaning = '', unit = ''

      if (hasHeader) {
        word    = headerMap.word    !== undefined ? values[headerMap.word]    : ''
        meaning = headerMap.meaning !== undefined ? values[headerMap.meaning] : ''
        unit    = headerMap.unit   !== undefined ? values[headerMap.unit]     : ''
      } else {
        const v = numberColOffset ? values.slice(numberColOffset) : values
        if (v.length >= 3) {
          // [2026-08-25 재발 방지] \d* -> \d+ : 숫자를 필수로 요구한다.
          // 기존엔 0자리를 허용해 헤더 라벨 "Unit"/"유닛" 자체가 유닛 값으로
          // 인정됐고, 그게 DB에 이름 "Unit"인 가짜 유닛을 만든 직접 원인이다
          // (AdminScreen 저장 루프 -> setClassWords -> wordLibrary.ensureUnit).
          // "Unit1" / "Unit 1" / "유닛3" / "unit 01" 같은 정상 값은 전부 그대로
          // 통과한다 — 실DB 유닛명 전수(16종)로 회귀 고정(verify:excel-header).
          const isUnit = /^(unit|유닛|단원)\s*\d+/i.test(v[0])
          if (isUnit) { unit = v[0]; word = v[1]; meaning = v[2] }
          else { word = v[0]; meaning = v[1] }
        } else {
          word = v[0]; meaning = v[1]
        }
      }

      // 선택 컬럼 4종 — 헤더가 명시적으로 감지됐고(hasHeader) 그 헤더가
      // 실제로 매핑됐을 때만 읽는다. 위치 추정(hasHeader===false) 경로는
      // 절대 이 4개를 추정하지 않는다 — 항상 undefined.
      const example            = hasHeader && headerMap.example            !== undefined ? orUndef(values[headerMap.example])            : undefined
      const exampleTranslation = hasHeader && headerMap.exampleTranslation !== undefined ? orUndef(values[headerMap.exampleTranslation]) : undefined
      const partOfSpeech       = hasHeader && headerMap.partOfSpeech       !== undefined ? orUndef(values[headerMap.partOfSpeech])       : undefined
      const cefr                = hasHeader && headerMap.cefr               !== undefined ? orUndef(values[headerMap.cefr])                : undefined

      // [2026-08-25 재발 방지] 최후 안전망 — 위치 추정 경로의 **첫 행**이
      // word·meaning 둘 다 헤더 라벨이면 그 행은 데이터가 아니라 헤더다.
      // 위 별칭 추가로 대부분은 hasHeader 경로에서 이미 걸러지지만, 아직
      // 모르는 헤더 표기가 들어와도 가짜 단어가 저장되지 않게 한다.
      // 조건이 AND인 이유: 한쪽만 라벨인 행은 실제 어휘일 수 있다
      // (word="word"/meaning="말", word="unit"/meaning="단위") — 절대 버리지
      // 않는다. 첫 행에만 적용하는 이유: 헤더는 파일 맨 위에만 존재하므로,
      // 아래 행의 실제 단어를 오탐으로 잃을 위험을 원천 차단한다.
      //
      // [2026-08-28 확장] rowIdx===0 -> "선두 블록" 으로 넓힌다. 파일 맨 위에
      // 제목 행이 하나 있고 그 아래에 헤더가 오는 형태
      //   ["2학년 천재소영순 Unit 8"] / ["No","English","Korean"] / ["1","learn",...]
      // 에서는 헤더가 1번째 행이라 rowIdx===0 가드를 그냥 지나갔고, 결국
      // word="No"/meaning="English" 라는 가짜 단어가 저장됐다(유령 유닛 사고의
      // 재발 형태 — verify:excel-header CASE I G3 로 재현·고정).
      // 범위를 "아직 실데이터 행이 하나도 안 나온 구간"으로만 넓히므로,
      // 파일 중간/아래의 실제 어휘 행은 예전과 똑같이 절대 버리지 않는다
      // (헤더는 파일 맨 위 블록에만 존재한다는 사실을 그대로 쓴다).
      if (!hasHeader && rowIdx <= leadingHeaderEnd && isHeaderLabel(word) && isHeaderLabel(meaning)) {
        warn('header-label-row', '헤더로 보이는 행이 데이터 안에 있어 제외했어요', `${word} / ${meaning}`)
        return null
      }
      return { className: selectedClass, unit: unit || 'Unit 1', word, meaning, example, exampleTranslation, partOfSpeech, cefr }
    })
    .filter(r => r && r.word && r.meaning)
  // 배열에 메타 정보만 덧붙임(호출부는 여전히 평범한 배열로 취급 가능) —
  // 미리보기에서 "헤더 미검출 — 위치 추정으로 읽었어요" 경고 배지에 사용.
  // ── 저장 전 오인 신호 판정 (파싱 결과는 이미 확정 — 여기서 안 바꾼다) ──
  //
  // ① 맨숫자 단어 — 영어 어휘가 순수 숫자인 경우는 없다. 컬럼이 한 칸 밀려
  //    읽혔다는 거의 확실한 증거다. 실사고 형태:
  //      무헤더 4열 ["1","8","learn","배우다"] -> 번호 열이 소비되고 남은
  //      "8"(맨숫자 유닛)이 isUnit 정규식에 안 걸려 word 로 읽힘 => word="8".
  //    그대로 저장하면 이름이 "8"인 가짜 단어가 유닛 하나를 통째로 채운다.
  if (!hasHeader) {
    const numericWords = result.filter((r) => /^\d+$/.test(r.word)).map((r) => r.word)
    if (numericWords.length > 0) {
      warn('numeric-word', '단어 칸에 숫자만 있는 행이 있어요 — 컬럼이 밀려 읽힌 것 같아요',
        `${[...new Set(numericWords)].slice(0, 5).join(', ')} (${numericWords.length}행)`)
    }

    // ② 첫 칸이 전부 "같은" 숫자 — 행번호라면 1,2,3…으로 증가해야 한다.
    //    전부 동일하면 그건 행번호가 아니라 유닛 번호일 가능성이 크고,
    //    numberColOffset 이 그걸 행번호로 오해해 유닛을 통째로 잃는다
    //    (Unit 8 단어 40개가 조용히 "Unit 1" 로 저장되는 오배정).
    //    파싱을 바꾸지는 않는다 — 3열 파일에서 행번호와 유닛번호는 원리적으로
    //    구분 불가라, 추측해서 재해석하는 대신 사람에게 확인을 받는다.
    const col0 = dataRows.map((r) => String((r || [])[0] ?? '').trim()).filter((v) => v !== '')
    const allNum = col0.length > 1 && col0.every((v) => /^\d+$/.test(v))
    if (allNum && new Set(col0).size === 1 && !result.some((r) => r.unit !== 'Unit 1')) {
      warn('constant-number-column', '첫 칸이 모든 행에서 같은 숫자예요 — 행번호가 아니라 유닛 번호일 수 있어요',
        `"${col0[0]}" × ${col0.length}행 → 지금은 전부 Unit 1 로 저장돼요`)
    }
  }

  result.headerDetected = hasHeader
  result.warnings = warnings
  return result
}

function ExcelUpload({ onDone, adminPin }) {
  const [selectedClass, setSelectedClass] = useState('')
  const [preview, setPreview]             = useState(null)
  const [saving, setSaving]               = useState(false)
  // [2026-08-28] 컬럼 오인 경고 확인 여부. 파일을 새로 고르면 반드시 false 로
  // 되돌린다 — 앞 파일에서 눌러둔 확인이 다음 파일의 경고를 통과시키면 안 된다.
  const [warnAck, setWarnAck]             = useState(false)
  const fileRef                           = useRef()
  const classList                         = getClassNames()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    // [2026-08-28] 새 파일을 고르는 순간 이전 파일에서 눌러둔 경고 확인을
    // 반드시 해제한다 — 안 그러면 다음 파일의 경고가 조용히 통과한다.
    setWarnAck(false)
    // 2026-08-02 — 손상된 파일/암호 보호 엑셀 등으로 XLSX.read가 던지면
    // 이전엔 잡히지 않은 예외로 콘솔에만 남고 화면은 "파일 선택" 상태 그대로
    // 멈춰 원인 파악이 어려웠다 — PdfUpload.handleFile(:1191-1213)과 동일하게
    // 한국어 안내로 정직하게 알린다.
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb   = XLSX.read(data)
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      // Class always comes from the dropdown above — never from the file.
      setPreview(parseExcelRows(rows, selectedClass))
    } catch (err) {
      alert('엑셀 파일을 읽는 중 오류가 발생했어요(손상된 파일이거나 지원하지 않는 형식일 수 있어요): ' + (err.message || err))
      setPreview(null)
    } finally {
      // A7(2026-08-02) — input value가 그대로면 같은 파일을 다시 선택해도
      // change 이벤트가 안 떠서 버튼이 죽은 것처럼 보였다(수정 후 재업로드
      // 흐름에서 자주 겪는 마찰). 매 선택 후 리셋해 재선택이 항상 먹게 한다.
      e.target.value = ''
    }
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
      // M3c(2026-08-05) — example은 기존과 동일하게 setClassWords가
      // w.example로 읽어 words.example_text carry-forward 경로에 그대로
      // 쓴다(planWordsBulkReplace, 변경 없음). exampleTranslation/
      // partOfSpeech/cefr은 words 테이블에 없는 컬럼이라 setClassWords는
      // 이 필드들을 전혀 읽지 않는다 — 아래 word_assets 업서트 블록에서만
      // 쓰인다.
      byUnit[u].words.push({
        word: r.word, meaning: r.meaning, example: r.example,
        exampleTranslation: r.exampleTranslation, partOfSpeech: r.partOfSpeech, cefr: r.cefr,
      })
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
        await setClassWords(targetClass, words, unit, adminPin)
        totalWords += words.length
        // M3c(2026-08-05) — Word Asset Library 배선. setClassWords가 이미
        // 성공한 "뒤에만" 시도하고, 이 블록 전체를 별도 try/catch로 완전히
        // 격리한다 — 실패해도(테이블 부재/Edge Function 미배포/네트워크
        // 문제 전부 포함) 단어 저장은 이미 끝난 상태라 교사에게는 절대
        // "저장 실패"로 보이면 안 된다(위 catch로 떨어지지 않게 함).
        // fetchWordAssetsByWords/upsertWordAssets 둘 다 자체적으로 throw하지
        // 않는 계약이지만(wordAssets.js 헤더 주석), 이 블록에서 새로 작성한
        // buildUnitWordAssetPayloads/groupAssetPayloadsByShape(wordLibrary.js)
        // 까지 포함해 방어적으로 한 번 더 감싼다.
        try {
          const existingAssets = await fetchWordAssetsByWords(words)
          const payloads = buildUnitWordAssetPayloads(words, existingAssets)
          for (const group of groupAssetPayloadsByShape(payloads)) {
            const result = await upsertWordAssets(group, adminPin)
            // ok:false는 정상 범위(v3_15 SQL 미실행/Edge Function 미배포 등,
            // upsertWordAssets 헤더 주석 참고) — 관리자에게 alert 없이
            // 콘솔에만 조용히 남긴다(단어 저장 성공 메시지를 방해하지 않음).
            if (!result?.ok) {
              console.warn(`[ExcelUpload] "${unit}" word_assets 업서트 스킵(${result?.reason || 'unknown'}) — 단어 저장에는 영향 없음`)
            }
          }
        } catch (assetErr) {
          console.warn(`[ExcelUpload] "${unit}" word_assets 자산 업서트 중 예외(단어 저장에는 영향 없음):`, assetErr?.message || assetErr)
        }
      }
      alert(`"${targetClass}" 반에 ${totalWords}개 단어 저장 완료!` + (skippedDupes > 0 ? `\n(중복 단어 ${skippedDupes}개는 제외했어요)` : ''))
      // A8(2026-08-02) — 업로드 후 반 목록 탭으로만 돌아가고 방금 올린
      // 반/유닛은 직접 다시 펼쳐 찾아야 했다(확인까지 4단계). 첫 번째
      // 업로드 유닛을 그대로 넘겨 카드가 바로 열리고 그 유닛이 보이게 한다.
      onDone(targetClass, Object.keys(byUnit)[0])
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
        {/* M3c(2026-08-05) — 전부 선택 컬럼, 없어도 기존과 동일하게 동작. */}
        <p className="text-xs mt-1 font-normal text-blue-500">선택 컬럼: 예문(Example/예문) · 예문번역(해석) · 품사(POS/품사) · 레벨(CEFR/레벨) — 없어도 무방해요.</p>
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
          {/* A6(2026-08-02) — 헤더를 못 찾아 위치 추정으로 읽은 경우 정직하게
              경고. 저장이 유닛 전체 delete-then-insert라 잘못 읽혔으면
              저장 전에 미리보기로 확인할 수 있어야 한다. */}
          {preview.headerDetected === false && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl px-4 py-2 text-xs font-bold text-amber-700">
              ⚠️ 헤더 미검출 — 위치 추정으로 읽었어요. 유닛/단어/뜻이 맞는지 아래 미리보기로 꼭 확인해주세요.
            </div>
          )}
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
          {/* [2026-08-28] 컬럼 매핑 오인 경고 — "헤더가 불확실하면 자동 저장하지
              않는다". 2026-08-27 Unit 8 사고에서 "8 | learn" 처럼 컬럼이 한 칸
              밀려 읽혀 이름이 "8"인 가짜 단어가 저장될 뻔했다. 저장은 유닛
              전체 delete-then-insert 라 잘못 저장하면 그 유닛의 기존 단어가
              통째로 날아간다 — 그래서 경고가 있으면 확인 체크 전까지 저장
              버튼을 잠근다. 경고가 없는 정상 파일은 예전과 100% 동일하게
              바로 저장된다(verify:excel-header CASE I 오탐 반증으로 고정). */}
          {(preview.warnings || []).length > 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 space-y-2">
              <p className="text-sm font-black text-red-700">🛑 컬럼이 잘못 읽혔을 수 있어요 — 저장 전에 확인이 필요해요</p>
              <ul className="space-y-1">
                {(preview.warnings || []).map((w) => (
                  <li key={w.code} className="text-xs font-bold text-red-600">
                    · {w.message}
                    {w.detail ? <span className="block ml-3 font-normal text-red-400">{w.detail}</span> : null}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] font-normal text-red-500">
                위 미리보기의 유닛/단어/뜻이 실제 엑셀과 같은지 꼭 확인해주세요.
                저장하면 그 유닛의 기존 단어가 이 내용으로 통째로 교체돼요.
              </p>
              <label className="flex items-center gap-2 text-xs font-black text-red-700">
                <input type="checkbox" checked={warnAck} disabled={saving}
                  onChange={(e) => setWarnAck(e.target.checked)} />
                미리보기를 확인했어요 — 이대로 저장할게요
              </label>
            </div>
          )}
          <button onClick={handleSave}
            disabled={saving || !selectedClass || ((preview.warnings || []).length > 0 && !warnAck)}
            className="w-full bg-blue-500 text-white font-black py-4 rounded-2xl btn-press hover:bg-blue-600 disabled:opacity-50">
            {saving ? '⏳ 저장 중...' : `💾 "${selectedClass}" 반에 저장`}
          </button>
        </div>
      )}
    </div>
  )
}

function PdfUpload({ onDone, adminPin }) {
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
    // A7(2026-08-02) — ExcelUpload.handleFile과 동일하게, 같은 파일을
    // 다시 선택해도 change 이벤트가 뜨도록 매 선택 후 리셋.
    e.target.value = ''
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
      await setClassWords(cls, deduped, unit, adminPin)
      alert(`"${cls}" 반 ${unit}에 ${deduped.length}개 단어 저장 완료!` + (skippedDupes > 0 ? `\n(중복 단어 ${skippedDupes}개는 제외했어요)` : ''))
      // A8(2026-08-02) — Excel 업로드와 동일하게 방금 저장한 반/유닛을 바로 연다.
      onDone(cls, unit)
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
  // 5연속 탭 감지용 리셋 타이머(1500ms) — 관리자 화면을 벗어나며 언마운트될
  // 때 정리하지 않으면 이미 떠난 컴포넌트의 setTitleTapCount가 늦게 호출될
  // 수 있다(React 경고 대상은 아니지만 불필요한 사이드이펙트 방지).
  useEffect(() => () => clearTimeout(titleTapTimer.current), [])

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
  // 2026-08-08 — 반 관리 목록 렌더를 "🏫 수업 반"/"📚 교과서 라이브러리"
  // 두 섹션으로 분리하기 위한 파생 배열(운영자 확정 — 교과서 라이브러리
  // 모델). 판별 자체는 이미 v3_19로 구조화된 classType(class_textbooks/
  // ensureClass가 채우는 classes.class_type)을 그대로 재사용 — QA_ 반은
  // 여전히 classType이 'textbook'이 아니므로 자동으로 수업 반 섹션에
  // 남는다(기존 목록에 섞여 보이던 동작 그대로, 규칙 3 — 이름 매칭이
  // 아니라 이미 있는 구조 신호를 재사용). 펼침/유닛 관리 등 실제 로직은
  // renderClassCard(아래)가 그대로 담당하므로 이 배열은 순수 그룹핑용.
  const regularClassNames = useMemo(
    () => classes.filter((c) => getClassTypeByName(c) !== 'textbook'),
    [classes]
  )
  const libraryClassNames = useMemo(
    () => classes.filter((c) => getClassTypeByName(c) === 'textbook'),
    [classes]
  )
  const [viewClass, setView]  = useState(null)
  const [viewUnit, setViewUnit] = useState('Unit 1')
  const [newClassName, setNewClassName] = useState('')
  // 2026-08-08 — 신설 반 유형(교과서 컨테이너 / 수업 반). 기본값 'textbook'
  // 은 fail-closed 선택: 실수로 컨테이너가 학생 PIN 만들기 목록에 노출되는
  // 것보다, 실반을 나중에 유형 변경하는 쪽이 훨씬 안전하다(§ createClass
  // 호출부 주석). admin-content-write가 아직 재배포 전이면 'textbook'
  // 요청도 'regular'로 저장될 수 있음(wordLibrary.js createClass 경고 참고).
  const [newClassType, setNewClassType] = useState('textbook')
  const [newUnitName, setNewUnitName] = useState('')
  const [newWord, setNewWord] = useState('')
  const [newMeaning, setNewMeaning] = useState('')
  const [newExample, setNewExample] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [renamingClass, setRenamingClass] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  // "오늘 AI 절약 카드"(2026-07-24) — SpellingReviewQueuePanel의 미리보기/
  // AI 확인 실행이 끝날 때마다 이 값을 올려 AiSavingsCard가 localStorage를
  // 다시 읽게 한다(두 컴포넌트가 상태를 공유하지 않으므로 최소한의 prop
  // 신호만 전달, 헌법 규칙 12와 무관한 순수 관리자 UI 배선).
  const [aiSavingsTick, setAiSavingsTick] = useState(0)
  // B1(2026-08-02) — 관찰 패널 지연 마운트 여부(닫혀 있으면 조회 안 함)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  // 2026-08-06 — v3.1 이후 생성된 반 교재 레이어 자동 백필(멱등, 관리자
  // 진입 시 1회). 결과는 콘솔만 — 실패해도 관리자 화면 동작 무영향. PIN
  // 인증 후(캐시가 initWordLibrary로 이미 준비된 상태) 1회만 실행.
  useEffect(() => {
    if (!authed) return
    ensureTextbookLayerBackfilled().then((r) => { if (r?.created > 0) console.log('[AdminScreen] 교재 레이어 자동 백필:', r.created, '개 반 등록') }).catch(() => {})
  }, [authed])

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
      await renameClass(renamingClass, next, pin)
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
          {[['classes','📚 반 관리'],['students','👦 학생 관리'],['dashboard','📊 대시보드'],['entrance','🏁 입실시험'],['excel','📊 Excel'],['pdf','📄 PDF'],['testpaper','📝 시험지'],['curriculum','📚 커리큘럼'],['wordassets','🗂 단어자산'],['features','🎯 기능']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`py-2 px-3 rounded-xl font-black text-sm btn-press transition-colors whitespace-nowrap ${tab === k ? 'bg-purple-500 text-white' : 'bg-white text-gray-500 border-2 border-gray-200'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Classes tab */}
        {tab === 'classes' && (
          <div className="space-y-3">
            <SeasonPanel adminPin={pin} />

            {/* 익명 관찰(2026-07-23) — 접힌 섹션, 열 때만 조회.
                2026-08-02(B1): <details>는 닫혀 있어도 자식이 계속 마운트돼
                있어 탭 진입마다 AnalyticsPanel의 대용량 조회(product_events
                2만행 + student_progress/word_status/student_class_assignments
                무필터 전체)가 실행됐다 — onToggle로 열림 여부를 추적해
                열렸을 때만 마운트한다(로직/조회 자체는 변경 없음). */}
            <details className="bg-white rounded-3xl card-shadow" onToggle={(e) => setAnalyticsOpen(e.target.open)}>
              <summary className="cursor-pointer select-none list-none p-5 font-black text-gray-700">📊 관찰 (어떤 기능이 아이를 돌아오게 하나)</summary>
              <div className="px-5 pb-5">{analyticsOpen && <AnalyticsPanel />}</div>
            </details>

            {/* 2026-08-01(자기학습형 검토 파이프라인, Commit 2) — 통계 우선
                배치: "선생님이 같은 검토를 두 번 하지 않는" 자동 학습 시스템
                (2026-07-24) 카드 3개를 검수 큐보다 위로 승격했다(관리자는
                패턴을 먼저 보고, 개별 케이스는 그 다음에 본다는 순서). 카드
                내부 로직/렌더는 전혀 안 바꿈(순서만 재배치, 헌법 규칙 3).
                SQL 미실행이면 각 카드가 자체적으로 "SQL 실행 필요" 안내로
                폴백한다(아래 SpellingReviewQueuePanel과 동일 관례). */}
            {/* 2026-08-01(P3) — 전체 현황 요약 카드. 개별 패턴 등록/무시는
                여전히 LearningRecommendationsCard(Top50) 몫 — 중복 없음. */}
            <WritingStatsDashboard />
            <LearningRecommendationsCard adminPin={pin} />
            <AiSavingsCard refreshTick={aiSavingsTick} />
            <LearningRateCard />

            <SpellingReviewQueuePanel onChanged={refresh} adminPin={pin} onSavingsUpdate={() => setAiSavingsTick((t) => t + 1)} />

            <div className="bg-white rounded-3xl card-shadow p-5">
              <p className="text-sm font-black text-gray-700 mb-3">새 반 추가하기</p>
              {/* 2026-08-08 — 유형 선택 추가(v3_19 구조 판별 대응). 기본값
                  'textbook'인 이유는 위 newClassType state 주석 참고. */}
              <div className="flex gap-3 mb-2 text-xs font-bold text-gray-600">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="newClassType" checked={newClassType === 'textbook'}
                    onChange={() => setNewClassType('textbook')} />
                  교과서 (학생 반 목록에 안 나옴)
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="newClassType" checked={newClassType === 'regular'}
                    onChange={() => setNewClassType('regular')} />
                  수업 반 (학생이 PIN 만들기에서 선택 가능)
                </label>
              </div>
              <div className="flex gap-2">
                <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)}
                  placeholder="반 이름 입력 (예: Basic 1)"
                  className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400" />
                <button onClick={async () => {
                    const name = newClassName.trim()
                    if (!name) return alert('반 이름을 입력해주세요!')
                    if (classes.includes(name)) return alert('이미 있는 반 이름이에요.')
                    try {
                      await createClass(name, newClassType, pin)
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
            ) : (() => {
              /* 2026-08-08 — 운영자 확정(교과서 라이브러리 모델): "🏫 수업
                 반"과 "📚 교과서 라이브러리"를 별 섹션으로 렌더한다. 카드
                 마크업/펼침·유닛 관리·단어 추가 등 로직은 기존
                 `.map(c => {...})` 바디를 글자 그대로 옮긴 것 — renderClassCard
                 로 이름만 붙여 두 배열(regularClassNames/libraryClassNames)에
                 재사용한다(동작 무변경, 그룹 분리만 — 규칙 3). */
              const renderClassCard = (c) => {
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
                    await setTodaysAssignment(c, next, pin)
                    refresh()
                  } catch (err) {
                    alert('오늘의 단어 배정 중 오류가 발생했어요: ' + assignmentErrorMessage(err))
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
                          {/* 2026-08-08 — 소유 교과서 라벨(표시 전용). 왜: v3_18
                              개명으로 실반 이름이 소유 교과서 이름과 달라진
                              케이스(예: "고1 능률 민병천"→"Presentation 6")에서
                              관리자가 콘텐츠 관리 화면(반 이름 기준)에서 교과서를
                              찾지 못했다 — 교과서 이름이 반 이름과 다를 때만,
                              synthetic 교과서는 제외하고 보조 배지로 보여준다.
                              반 이름 자체/정렬/동작은 전혀 바뀌지 않는다. */}
                          <p className="font-black text-gray-800">
                            {c}
                            {(() => {
                              const classId = getClassIdByName(c)
                              const ownTextbook = classId ? getOwnTextbookOfClass(classId) : null
                              if (!ownTextbook || String(ownTextbook.id).startsWith('synthetic-tb:')) return null
                              if (ownTextbook.name === c) return null
                              return (
                                <span className="ml-2 align-middle inline-block text-xs font-bold text-purple-500 bg-purple-50 rounded-full px-2 py-0.5">
                                  📖 {ownTextbook.name}
                                </span>
                              )
                            })()}
                          </p>
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
                                await addClassUnit(c, name, pin)
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
                                      await setWordAcceptedMeanings(w.id, raw.split(',').map(s => s.trim()).filter(Boolean), pin)
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
                                  try { await setTodaysAssignment(c, words.map(w => wordSlug(w.word)), pin); refresh() }
                                  catch (err) { alert('배정 중 오류가 발생했어요: ' + assignmentErrorMessage(err)) }
                                }}
                                className="bg-teal-500 text-white font-bold px-2 py-1 rounded-lg text-xs btn-press hover:bg-teal-600">
                                이 유닛 전체 배정
                              </button>
                            )}
                            {todaysAssigned.size > 0 && (
                              <button onClick={async () => {
                                  try { await setTodaysAssignment(c, [], pin); refresh() }
                                  catch (err) { alert('해제 중 오류가 발생했어요: ' + assignmentErrorMessage(err)) }
                                }}
                                className="bg-white border-2 border-teal-300 text-teal-600 font-bold px-2 py-1 rounded-lg text-xs btn-press">
                                전체 해제
                              </button>
                            )}
                          </div>
                        </div>

                        <FutureAssignmentPlanner targetClass={c} words={words} adminPin={pin} units={units} activeUnit={activeUnit} />

                        {/* Reading Foundation v3.3 — 지금 보고 있는 유닛(activeUnit)의
                            읽기 지문 편집. 합성 폴백 유닛(id 없음 — 유닛 0개 반의
                            DEFAULT_UNIT_NAME 표시용 가짜 유닛)은 DB에 실체가 없어
                            지문을 매달 수 없으므로 렌더하지 않는다. key=unitId로
                            유닛 전환 시 편집 상태를 초기화한다. */}
                        {isFeatureEnabled('readingFoundation') && (() => {
                          const activeUnitObj = units.find(u => u.name === activeUnit)
                          return activeUnitObj?.id
                            ? <PassageEditor key={activeUnitObj.id} unitId={activeUnitObj.id} unitName={activeUnit} />
                            : null
                        })()}

                        <ClassTextbookLinks targetClass={c} onChanged={refresh} />

                        <SpellingSettingsPanel targetClass={c} onSaved={refresh} adminPin={pin} />

                        <GameSettingsPanel targetClass={c} onSaved={refresh} adminPin={pin} />

                        <WordKingPanel targetClass={c} adminPin={pin} />

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
                              await setClassWords(c, [...existing, { word: newWord.trim(), meaning: newMeaning.trim(), example: newExample.trim() }], viewUnit, pin)
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
              }
              return (
                <>
                  <div>
                    <p className="font-black text-gray-700 text-sm">🏫 수업 반</p>
                    <p className="text-xs text-gray-400 mb-2">학생이 소속되는 반</p>
                    {regularClassNames.length === 0 ? (
                      <p className="text-xs text-gray-400">수업 반이 없어요.</p>
                    ) : (
                      <div className="space-y-4">{regularClassNames.map(renderClassCard)}</div>
                    )}
                  </div>
                  {libraryClassNames.length > 0 && (
                    <div className="mt-6">
                      <p className="font-black text-gray-700 text-sm">📚 교과서 라이브러리</p>
                      <p className="text-xs text-gray-400 mb-2">교과서 콘텐츠(유닛/단어) — 학생 반 목록에 노출되지 않음. 반에 제공하려면 반의 🔗 교재 연결 사용</p>
                      <div className="space-y-4">{libraryClassNames.map(renderClassCard)}</div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {tab === 'students' && <StudentDirectory adminPin={pin} />}
        {tab === 'dashboard' && <AdminDashboard adminPin={pin} />}
        {tab === 'entrance' && <EntranceTestAdmin />}
        {/* A8(2026-08-02) — 업로드 완료 시 방금 올린 반/유닛을 바로 열어
            "확인까지 4단계"였던 마찰을 없앤다(반 목록 탭으로만 보내던 것에서,
            해당 반 카드 펼침 + 유닛 선택까지). refresh()는 기존 viewClass
            기준으로도 viewUnit을 보정하지만, 뒤이은 setView/setViewUnit이
            같은 이벤트 핸들러 안에서 최종값으로 덮어써 새 반/유닛이 반영된다. */}
        {tab === 'excel' && <ExcelUpload onDone={(targetClass, unitName) => { refresh(); if (targetClass) { setView(targetClass); if (unitName) setViewUnit(unitName) } setTab('classes') }} adminPin={pin} />}
        {tab === 'pdf'   && <PdfUpload   onDone={(targetClass, unitName) => { refresh(); if (targetClass) { setView(targetClass); if (unitName) setViewUnit(unitName) } setTab('classes') }} adminPin={pin} />}
        {tab === 'testpaper' && <TestPaperGenerator />}
        {tab === 'curriculum' && <CurriculumHub adminPin={pin} />}
        {tab === 'wordassets' && <WordAssetPanel adminPin={pin} />}
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
          <p className="text-gray-500 text-sm text-center mb-1">이 반과 연결된 단어/Unit/학습기록이 함께 삭제됩니다.</p>
          <p className="text-gray-400 text-xs text-center mb-3">✅ 학생 계정과 학생별 진행도는 그대로 유지되고, 반 배정만 해제돼요.</p>
          <p className="text-gray-500 text-sm text-center mb-5">정말 삭제하시겠습니까?</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)}
              className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl btn-press">
              취소
            </button>
            <button onClick={async () => {
              try {
                await deleteClass(confirmDelete, pin)
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
