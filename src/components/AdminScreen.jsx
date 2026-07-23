import React, { useState, useRef, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { getClassNames, getClassWords, setClassWords, deleteClass, createClass, renameClass, getClassUnits, addClassUnit, deleteClassUnit, getClassUnitNames, getStudentsInClass, getTodaysAssignmentWordIds, setTodaysAssignment, getAssignmentForDate, setAssignmentForDate, fetchDashboardData, getClassSettings, setClassSettings, localIsoDateStr, fetchWordStatusSummary, resetWordStatus, setWordAcceptedMeanings, fetchXpTotals, getClassIdByName, getStudents } from '../utils/wordLibrary'
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
import { fetchPendingSpellingReviews, resolveSpellingReview } from '../utils/spellingReviewApi'
// 쓰기 답안 검토 AI 보조(Task 2, 2026-07-23) — writingReviewAiAssist
// 플래그로 게이팅되는 SpellingReviewQueuePanel 확장. 기존 accept()/
// dismiss() 로직은 위 두 함수 그대로 재사용(새 쓰기 경로 추가 안 함).
import {
  runRulesPhase, runAiPhase, executeAccept, executeBulkAccept, executeBulkDismiss,
  estimateAiCostUsd, AI_BATCH_SIZE, MAX_REQUESTS_PER_RUN, evaluateCostGate, AI_MODEL_ID,
  DEFAULT_AI_PROVIDER, formatProviderDisplay,
  getCostCeilingUsd, setCostCeilingUsd, getDailyCeilingUsd, setDailyCeilingUsd,
  getTodaySpentUsd, recordEstimatedSpendUsd,
} from '../utils/spellingReviewAiApi'
import {
  selectRows, findDuplicateAnswerRows, selectCertainAccepts, selectAllDuplicateGroupRows, groupRowsByAnswer,
  filterProposals, filterProposalsBySource, filterProposalsByBand, confidenceBand, summarizeConfidenceBands,
  filterRowsByStudent, distinctStudentIds, sortDisplayItems,
  summarizeBulkResults, summarizeProposals, normalizeForCompare, buildConfirmSummary,
} from '../utils/spellingReviewBulkPlan'
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
// Reading Foundation v3.3(2026-07-23) — 유닛별 읽기 지문 편집기(관리자
// 전용, readingFoundation 플래그 게이팅). 학생용 읽기 화면은 이번 범위
// 밖(features.js readingStudentUI 예약 플래그 참고).
import PassageEditor from './admin/PassageEditor'
import { isFeatureEnabled } from '../config/features'

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

// Teacher Controls 마스터 스위치(2026-07-19, GAME_DESIGN.md 13번 섹션) —
// SpellingSettingsPanel과 완전히 같은 패턴(같은 classes 테이블 반별 boolean
// 설정 관례, getClassSettings/setClassSettings 그대로 재사용, 기본 false
// opt-in). 이 스위치가 꺼진 반의 학생 화면에서는 Paul Rank/XP 관련 UI가
// 전혀 보이지 않는다(Dashboard.jsx 게이팅 참고) — 111명 실사용 학생에게
// 미검증 게임화 기능이 갑자기 노출되지 않도록 교사가 반별로 직접 켜야 한다.
function GameSettingsPanel({ targetClass, onSaved }) {
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

// v2.0(2026-07-17) 쓰기 답안 교사 검토 큐 — 영→한 문제에서 학생이 한글로
// 답했는데 오답 처리된 제출("뜻은 아는데 등록된 표기가 아닌" 후보)을
// 교사가 직접 판정하는 패널. "이 답 인정" 원클릭 = 그 단어의
// accepted_meanings에 추가(다음부터 전 반에서 정답 처리) + 큐에서 제거.
// AI 자동 판정은 없음(운영자 방침 — 최종 판정은 항상 교사).
// 테이블 미존재(supabase_v2_0_spelling_mixed.sql 미실행)면 안내만 표시.
function SpellingReviewQueuePanel({ onChanged, adminPin }) {
  const [rows, setRows] = useState([]) // null = 테이블 없음
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  // ── AI 보조(Task 2, 2026-07-23 v1 / v1.1 / v1.2 관리자 UI 2차 개편) —
  // writingReviewAiAssist 플래그 뒤에서만 동작. 꺼져 있으면 아래 상태들은
  // 전부 미사용 상태로 남고, 기존 accept/dismiss 버튼·로직(위)은 100%
  // 그대로다(§ 폴백 보존).
  // v1.2: "미리보기" = 규칙 단계만(무료, 네트워크 0회) 실행 → 결과(해결/
  // 미해결 건수 + 예상 AI 비용)를 먼저 보여주고, 관리자가 별도로 "AI 확인
  // 진행" 버튼을 눌러야만 Edge Function 호출이 시작된다(§ 비용 상한/투명성
  // 요구사항). AI 단계는 25건씩 순차 청크로 나뉘어 실행되고 배치별 진행률이
  // 표시된다.
  const aiEnabled = isFeatureEnabled('writingReviewAiAssist')

  // 2단계 미리보기 상태
  const [scopeMode, setScopeMode] = useState('all') // 'all' | 'selected' — 분석 범위
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [rulesResult, setRulesResult] = useState(null) // {resolved, unresolved} — 규칙 단계 직후 결과(null=아직 미리보기 안 돌림)
  const [analyzedIds, setAnalyzedIds] = useState(() => new Set()) // 이번 분석 범위(scope)에 포함된 행 id 전체
  const [aiProposals, setAiProposals] = useState(null) // null=미분석, 규칙만 끝나면 resolved만, AI까지 끝나면 resolved+ai 전체
  const [aiUsage, setAiUsage] = useState(null) // 마지막 AI 확인 실행의 실측 토큰/비용(usage)
  const [aiRunning, setAiRunning] = useState(false)
  const [aiProgress, setAiProgress] = useState(null) // {batchIndex,batchCount,completed,total,cacheHits,failures}
  const [aiError, setAiError] = useState('') // 미리보기/확인 자체를 못 돌린 경우(예: 선택 0건, 비용 상한 초과)
  const [aiCallFailed, setAiCallFailed] = useState(false) // Edge Function 호출 실패 여부(규칙 결과는 살아있음)
  const [aiCallError, setAiCallError] = useState('')
  // v1.3(2026-07-24, 운영자 비용 최소화 스펙) — 일일 예산 초과 배너 +
  // 이번 실행에서 아예 못 보낸(호출 한도/예산 초과) 이월 건수.
  const [aiBudgetExceeded, setAiBudgetExceeded] = useState(false)
  const [aiBudgetInfo, setAiBudgetInfo] = useState(null) // {exceeded, todayUsd, capUsd} — 서버 응답 그대로(§ agent P 계약)
  const [aiDeferredCount, setAiDeferredCount] = useState(0)

  // 비용 상한(관리자 조정 가능, localStorage 영속) — 전부 클라이언트
  // best-effort다(§ spellingReviewAiApi.js 상단 안내 — 서버 측 진짜 상한은
  // 이 저장소에 없음, agent B/운영자 영역).
  const [costCeiling, setCostCeilingState] = useState(() => getCostCeilingUsd())
  const [dailyCeiling, setDailyCeilingState] = useState(() => getDailyCeilingUsd())
  const [todaySpent, setTodaySpent] = useState(() => getTodaySpentUsd())

  // 필터/정렬(v1.2 신규: 출처/학생 필터 + 정렬)
  const [filterDecision, setFilterDecision] = useState('all')
  const [filterSource, setFilterSource] = useState('all') // 'all' | 'rule' | 'ai' | 'cache'
  const [filterBand, setFilterBand] = useState('all') // v1.3: 'all' | 'high' | 'mid' | 'low' — 신뢰도 3-밴드
  const [filterWord, setFilterWord] = useState('')
  const [filterStudent, setFilterStudent] = useState('all') // 'all' | studentId
  const [sortBy, setSortBy] = useState('none') // 'none' | 'confidence' | 'word' | 'decision' | 'student'
  const [sortDir, setSortDir] = useState('desc')
  const [groupView, setGroupView] = useState(false) // "동일 답안 묶어 보기"
  const [bulkBusy, setBulkBusy] = useState(false)
  const [doneSummary, setDoneSummary] = useState('') // "완료 요약" 배너
  const [confirmAction, setConfirmAction] = useState(null) // {title, kind, summary, count, run}

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

  const proposalsById = useMemo(() => {
    const m = new Map()
    for (const p of aiProposals || []) m.set(p.pending_answer_id, p)
    return m
  }, [aiProposals])

  const aiSummary = useMemo(() => (aiProposals ? summarizeProposals(aiProposals) : null), [aiProposals])
  // v1.3 신뢰도 3-밴드 요약(≥95% 자동 인정 후보/70~95% 관리자 검토/<70% review) —
  // 순수 표시용, "확실한 답안 모두 인정" 게이트(selectCertainAccepts)와 무관.
  const aiBandSummary = useMemo(() => (aiProposals ? summarizeConfidenceBands(aiProposals) : null), [aiProposals])

  // 운영자 요구사항 13 — 현재 AI provider 표시 배지. AI 확인을 아직 한 번도
  // 실행하지 않았으면(aiUsage===null) 정직하게 "기본값" 문구를 붙이고
  // 코드 기본 상수(DEFAULT_AI_PROVIDER/AI_MODEL_ID)로 보여준다 — 실제로
  // 실행 중인 provider는 서버 env(AI_PROVIDER 등)에 따라 다를 수 있으므로
  // 여기 표시가 "그 실행이 진짜 이 provider였다"는 보장이 아니라는 점을
  // 문구로 명시한다(§ 정직한 표기). AI 확인을 실행한 뒤에는 그 실행의
  // 실측 usage.provider/model로 갱신되고, 폴백이 섞였으면(provider='mixed')
  // formatProviderDisplay가 그 사실을 짧게 알려준다.
  const aiProviderBadgeLabel = aiUsage
    ? `🟢 ${formatProviderDisplay(aiUsage.provider, aiUsage.model)}`
    : `🟢 ${formatProviderDisplay(DEFAULT_AI_PROVIDER, AI_MODEL_ID)} (기본값 — 실제 값은 실행 후 서버 응답 기준)`

  // 학생 표시 이름 — wordLibrary.js의 getStudents() 캐시(이미 이 화면
  // 최상단에서 동기로 로드돼 있음, 이 패널이 새로 fetch하지 않는다)에서
  // id -> name을 찾는다. 못 찾으면(캐시 미로드/삭제된 학생) UUID를 앞
  // 8자만 잘라 보여준다(§ "학생 표시 이름 없으면 잘린 UUID" 요구사항).
  const studentNameById = useMemo(() => {
    const m = new Map()
    try { for (const s of getStudents()) m.set(s.id, s.name) } catch { /* 캐시 미로드 — 아래 폴백으로 처리 */ }
    return m
  }, [rows])
  const studentLabel = (id) => studentNameById.get(id) || (id ? `${String(id).slice(0, 8)}…` : '(알수없음)')
  const studentOptions = useMemo(() => distinctStudentIds(rows || []), [rows])

  // 분석 전(rulesResult===null)에도 항상 보이는 worst-case 예상 비용 —
  // scopeMode에 따라 "전체 pending건" 또는 "선택한 건수" 전량이 AI로
  // 넘어간다고 가정한 상한(실제로는 규칙 단계가 상당수를 무료로 해결하므로
  // 이보다 훨씬 낮아지는 게 보통).
  const totalPendingCount = rows ? rows.length : 0
  const preRunScopeCount = scopeMode === 'selected' ? selectedIds.size : totalPendingCount
  const preRunWorstCostUsd = estimateAiCostUsd(preRunScopeCount)

  // analyzedIds 크기 === (규칙 해결 + 미해결) 전체 건수. aiProposals가 그
  // 크기에 도달했다는 건 AI 단계까지 끝났거나(또는 애초에 미해결이 0건이라
  // AI 단계가 필요 없었다는) 뜻 — "분석 완료"로 취급해 전체 필터/정렬/일괄
  // 액션 UI를 연다.
  const analysisComplete = !!rulesResult && !!aiProposals && aiProposals.length >= analyzedIds.size && analyzedIds.size > 0
  const unresolvedCount = rulesResult ? rulesResult.unresolved.length : 0
  const aiPhaseEstimatedCostUsd = rulesResult ? estimateAiCostUsd(unresolvedCount) : 0
  const costGate = rulesResult && unresolvedCount > 0
    ? evaluateCostGate({ estimatedCostUsd: aiPhaseEstimatedCostUsd, ceilingUsd: costCeiling, todaySpentUsd: todaySpent, dailyCeilingUsd: dailyCeiling })
    : null

  // 1단계 — 규칙 기반 분류만 실행(무료, 네트워크 0회, 순수 계산이라 사실상
  // 즉시 끝난다).
  const runRulesPreview = () => {
    if (scopeMode === 'selected' && selectedIds.size === 0) {
      setAiError('분석할 답안을 먼저 선택하거나 "전체"를 선택하세요.')
      return
    }
    setAiError('')
    setAiCallFailed(false)
    setAiCallError('')
    setDoneSummary('')
    setAiProgress(null)
    setAiUsage(null)
    setAiBudgetExceeded(false)
    setAiBudgetInfo(null)
    setAiDeferredCount(0)
    const scopeIds = scopeMode === 'selected' ? selectedIds : null
    const { resolved, unresolved } = runRulesPhase({ rows: rows || [], scopeIds })
    setAnalyzedIds(new Set([...resolved.map((p) => p.pending_answer_id), ...unresolved.map((r) => r.id)]))
    setRulesResult({ resolved, unresolved })
    setAiProposals(resolved) // 미해결 0건이면 이 시점에 이미 "분석 완료" 상태가 된다
    setSelectedIds(new Set())
  }

  // 2단계 — 관리자가 "AI 확인 진행" 버튼을 눌렀을 때만 실행. 실행 직전에
  // 실행당/일일 비용 상한을 다시 한 번 확인한다(버튼이 이미 비활성화돼
  // 있어야 정상이지만, 상태가 그 사이 바뀌었을 가능성에 대비한 이중 방어).
  const runAiConfirm = async () => {
    if (!rulesResult || rulesResult.unresolved.length === 0) return
    const estCost = estimateAiCostUsd(rulesResult.unresolved.length)
    const gate = evaluateCostGate({
      estimatedCostUsd: estCost, ceilingUsd: costCeiling,
      todaySpentUsd: getTodaySpentUsd(), dailyCeilingUsd: dailyCeiling,
    })
    if (gate.blocked) {
      setAiError(gate.overRunCeiling
        ? `이번 실행 예상 비용($${estCost.toFixed(4)})이 실행당 상한($${costCeiling.toFixed(2)})을 초과해 차단됐어요. 상한을 조정하거나 범위를 줄이세요.`
        : `오늘 누적 예상 비용이 일일 상한($${dailyCeiling.toFixed(2)})을 초과해 차단됐어요.`)
      return
    }
    setAiRunning(true)
    setAiError('')
    setAiCallFailed(false)
    setAiCallError('')
    setAiBudgetExceeded(false)
    setAiBudgetInfo(null)
    setAiDeferredCount(0)
    setAiProgress({ batchIndex: 0, batchCount: Math.min(Math.ceil(rulesResult.unresolved.length / AI_BATCH_SIZE), MAX_REQUESTS_PER_RUN), completed: 0, total: rulesResult.unresolved.length, cacheHits: 0, failures: 0, deferredByCap: 0 })
    try {
      const { proposals, usage, callFailed, callError, budgetExceeded, budgetInfo, deferredCount } = await runAiPhase({
        adminPin,
        unresolvedRows: rulesResult.unresolved,
        batchSize: AI_BATCH_SIZE,
        onProgress: (p) => setAiProgress(p),
      })
      setAiProposals([...rulesResult.resolved, ...proposals])
      setAiUsage(usage)
      setAiCallFailed(callFailed)
      setAiCallError(callError || '')
      setAiBudgetExceeded(!!budgetExceeded)
      setAiBudgetInfo(budgetInfo || null)
      setAiDeferredCount(deferredCount || 0)
      setTodaySpent(recordEstimatedSpendUsd(usage?.estimatedCostUsd ?? estCost))
    } catch (err) {
      // runAiPhase/callEdgeFunctionForUnresolved는 설계상 던지지 않지만
      // (§ 절대 미리보기 실패로 전체가 죽지 않게), 방어적으로 남겨둔다.
      setAiError('AI 확인 중 예기치 못한 오류: ' + (err.message || err))
    } finally {
      setAiRunning(false)
    }
  }

  const updateCostCeiling = (raw) => {
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return
    setCostCeilingUsd(n)
    setCostCeilingState(n)
  }
  const updateDailyCeiling = (raw) => {
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return
    setDailyCeilingUsd(n)
    setDailyCeilingState(n)
  }

  // 이번 분석 범위(scope)에 포함된 행만(분석 전이면 전체 rows 그대로 — 아직
  // 좁힐 근거가 없음).
  const baseRows = useMemo(() => {
    if (!aiEnabled || !rulesResult) return rows || []
    return (rows || []).filter((r) => analyzedIds.has(r.id))
  }, [rows, rulesResult, analyzedIds, aiEnabled])

  const filteredRows = useMemo(() => {
    if (!aiEnabled || !rulesResult) return rows || []
    // 학생/단어 필터는 행 필드로 직접 적용 — 분석 완료 여부와 무관하게 항상
    // 동작한다(AI 확인 전에도 "이 학생 것만 먼저 볼" 수 있게).
    let list = filterRowsByStudent(baseRows, filterStudent)
    if (filterWord) {
      const q = filterWord.toLowerCase()
      list = list.filter((r) => String(r.word || '').toLowerCase().includes(q))
    }
    // 판정/출처 필터는 proposal 필드가 있어야 하므로 분석이 완전히 끝난
    // 뒤에만 적용한다(그 전엔 미해결 행에 proposal이 아직 없어 걸러내면
    // "AI 확인 대기 중" 행이 통째로 안 보이게 된다).
    if (analysisComplete) {
      let filteredProposals = filterProposals(aiProposals, { decision: filterDecision })
      filteredProposals = filterProposalsBySource(filteredProposals, filterSource)
      filteredProposals = filterProposalsByBand(filteredProposals, filterBand)
      const idSet = new Set(filteredProposals.map((p) => p.pending_answer_id))
      list = list.filter((r) => idSet.has(r.id))
    }
    return list
  }, [aiEnabled, rulesResult, baseRows, filterStudent, filterWord, analysisComplete, aiProposals, filterDecision, filterSource, filterBand])

  // "동일 답안 묶어 보기" — (단어, 정규화 답안) 그룹끼리 인접하게 재정렬만
  // 한다(필터링 자체는 안 바뀜).
  const groupedRows = useMemo(() => {
    if (!groupView) return filteredRows
    return [...groupRowsByAnswer(filteredRows, normalizeForCompare).values()].flat()
  }, [filteredRows, groupView])

  // 정렬(v1.2 신규) — confidence/판정은 proposal 필드가 필요해 "행+proposal"
  // 짝을 만들어 sortDisplayItems에 넘긴다. sortBy==='none'이면 groupView
  // 순서를 그대로 유지.
  const displayRows = useMemo(() => {
    if (sortBy === 'none') return groupedRows
    const items = groupedRows.map((r) => ({ row: r, proposal: proposalsById.get(r.id) }))
    return sortDisplayItems(items, sortBy, sortDir).map((it) => it.row)
  }, [groupedRows, sortBy, sortDir, proposalsById])

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.size === displayRows.length ? new Set() : new Set(displayRows.map((r) => r.id))))
  }
  const clearSelection = () => setSelectedIds(new Set())

  const acceptWithMode = async (row, mode) => {
    setBusyId(row.id)
    try {
      const duplicateRows = mode === 'all_duplicates' ? findDuplicateAnswerRows(rows || [], row, normalizeForCompare) : []
      await executeAccept(row, { mode, duplicateRows })
      await load()
      onChanged?.()
      setDoneSummary(mode === 'all_duplicates' && duplicateRows.length > 0
        ? `"${row.word}" 답안 ${duplicateRows.length + 1}건 함께 인정 완료`
        : `"${row.word}" 답안 인정 완료`)
    } catch (err) {
      alert('인정 처리 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBusyId(null)
    }
  }

  const runBulk = async (targetRows, kind) => {
    if (targetRows.length === 0) return
    setBulkBusy(true)
    setDoneSummary('')
    try {
      const results = kind === 'dismiss'
        ? await executeBulkDismiss(targetRows)
        : await executeBulkAccept(targetRows, { mode: kind === 'synonym' ? 'synonym' : 'answer_only' })
      const summary = summarizeBulkResults(results)
      const label = kind === 'dismiss' ? '무시' : kind === 'synonym' ? '동의어로 저장' : '인정'
      setDoneSummary(`${label} ${summary.ok}건 완료${summary.failed > 0 ? `, 실패 ${summary.failed}건` : ''}`)
      await load()
      onChanged?.()
      setSelectedIds(new Set())
    } catch (err) {
      alert('일괄 처리 중 오류가 발생했어요: ' + (err.message || err))
    } finally {
      setBulkBusy(false)
    }
  }

  // 일괄 액션은 전부 실행 전 확인 모달을 거친다(§ 안전 요구사항) — 정확한
  // 대상 건수를 모달에 먼저 보여주고, 확인해야만 runBulk가 실제로 돈다.
  const requestBulkConfirm = (title, targetRows, kind) => {
    if (targetRows.length === 0) return
    const summary = buildConfirmSummary(targetRows, { kind })
    setConfirmAction({ title, kind, summary, count: targetRows.length, run: () => runBulk(targetRows, kind) })
  }

  const selectedRows = selectRows(displayRows, [...selectedIds])
  // "확실한 답안 모두 인정" — decision=accept(safe_accept) AND confidence>=0.95
  // AND 품사 경고 없음 AND 파싱 오류 없음 AND 의미 범위 경고 없음(전부 AND,
  // selectCertainAccepts가 그대로 구현).
  const certainRows = aiProposals ? selectRows(rows || [], selectCertainAccepts(aiProposals, 0.95).map((p) => p.pending_answer_id)) : []
  // "동일한 답안 모두 인정" — 큐 전체(rows)에서 그룹 크기 2 이상인 행 전부.
  const duplicateGroupRows = aiEnabled && rows ? selectAllDuplicateGroupRows(rows, normalizeForCompare) : []

  const decisionLabel = (d) => (d === 'accept' ? 'safe_accept' : d) // 관리자 확정 전까지 "최종 인정/거부" 표현 금지(§ UI 스펙)
  const decisionColor = (d) => (d === 'accept' ? 'text-green-600' : d === 'reject_candidate' ? 'text-red-500' : 'text-amber-600')
  const sourceLabel = (p) => {
    if (p.cache_hit) return 'cache'
    if (p.decision_source === 'ai') return 'ai'
    if (p.decision_source === 'synonym') return 'synonym'
    if (p.decision_source === 'exact_match' || p.decision_source === 'levenshtein') return 'rule'
    // v1.3 — 이월(아예 전송 안 됨)은 "실패"가 아니라 "다음 실행 대기"라
    // ai(실패)와 구분해 정직하게 표시한다(§ 운영자 비용 최소화 스펙).
    if (p.decision_source === 'ai_deferred') return '이월(호출 한도)'
    if (p.decision_source === 'ai_budget_exceeded') return '이월(예산 한도)'
    return 'ai(실패)' // ai_unavailable/ai_error/parse_error — 출처는 AI 경로였지만 실패했다는 뜻
  }
  // v1.3 신뢰도 3-밴드 배지 — 순수 표시용(spellingReviewBulkPlan.confidenceBand
  // 그대로 재사용, 여기선 라벨/색만 매핑).
  const bandLabel = (b) => (b === 'high' ? '≥95% 자동인정후보' : b === 'mid' ? '70~95% 검토' : b === 'low' ? '<70% 검토' : '')
  const bandColor = (b) => (b === 'high' ? 'bg-emerald-100 text-emerald-700' : b === 'mid' ? 'bg-amber-100 text-amber-700' : b === 'low' ? 'bg-gray-200 text-gray-600' : '')

  return (
    <div className="bg-white rounded-3xl card-shadow p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-black text-gray-700">📝 쓰기 답안 검토 {rows && rows.length > 0 && <span className="text-orange-500">({rows.length}건 대기)</span>}</p>
        <button onClick={load} disabled={loading} className="text-xs font-bold text-purple-500 btn-press py-2 px-2 -my-2">새로고침</button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">영→한 시험에서 등록된 뜻과 달라 오답 처리된 한글 답이에요. 맞는 표현이면 "인정"을 눌러주세요 — 그 단어의 인정 뜻에 추가되어 다음부터 정답 처리됩니다.</p>

      {doneSummary && <p className="text-xs font-bold text-green-600 bg-green-50 rounded-xl p-2 mb-2">✅ {doneSummary}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      ) : rows === null ? (
        <p className="text-xs text-orange-500 font-bold bg-orange-50 rounded-xl p-3">⚠️ 준비 중 — supabase_v2_0_spelling_mixed.sql을 Supabase SQL Editor에서 실행하면 이 기능이 켜져요.</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-400 text-sm">검토할 답안이 없어요. 👍</p>
      ) : (
        <>
          {aiEnabled && (
            <div className="bg-indigo-50 rounded-xl p-3 mb-3 text-xs">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="font-black text-indigo-700">🤖 자동 검토 미리보기</p>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 font-bold text-indigo-600">
                    <input type="radio" name="ai-scope" checked={scopeMode === 'all'} onChange={() => setScopeMode('all')} />
                    전체 {rows.length}건
                  </label>
                  <label className="flex items-center gap-1 font-bold text-indigo-600">
                    <input type="radio" name="ai-scope" checked={scopeMode === 'selected'} onChange={() => setScopeMode('selected')} />
                    선택한 답안만({selectedIds.size}건)
                  </label>
                  <button onClick={runRulesPreview} disabled={aiRunning}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press disabled:opacity-50">
                    미리보기(규칙 기반, 무료)
                  </button>
                </div>
              </div>

              {/* (a) 실행 전에도 항상 보이는 worst-case 상한 추정 — 미리보기를
                  누르기 전이라 실제 규칙 해결 건수를 모르므로 "대상 전량이
                  AI로 넘어간다"는 가장 비관적인 가정. */}
              <p className="text-indigo-400 mb-2">
                {aiProviderBadgeLabel} · 예상 상한(최악의 경우, 대상 {preRunScopeCount}건 전량 AI 처리 가정): 약 ${preRunWorstCostUsd.toFixed(4)} —
                미리보기를 누르면 규칙으로 먼저 걸러진 뒤 정확한 AI 대상 건수/비용이 나와요.
              </p>

              {aiError && <p className="text-red-500 font-bold mb-1">{aiError}</p>}
              {aiCallFailed && (
                <p className="text-orange-600 font-bold mb-1 bg-orange-50 rounded-lg p-2">
                  ⚠ AI 서비스 호출 실패 — 규칙으로 해결 안 된 항목은 "검토 필요"로 표시됐어요(규칙 기반 결과는 정상). 사유: {aiCallError}
                </p>
              )}

              {/* (b)(c) 1단계 결과 — 규칙 해결/미해결 건수 + 정확한 AI 비용
                  + 비용 상한 + "AI 확인 진행" 버튼(관리자가 직접 눌러야만
                  2단계가 시작된다). */}
              {rulesResult && (
                <div className="bg-white rounded-lg p-2 mb-2 border border-indigo-100">
                  <p className="text-indigo-700 font-bold">
                    규칙 분류 완료 — 규칙으로 해결 {rulesResult.resolved.length}건 / AI 확인 필요 {unresolvedCount}건
                  </p>
                  {unresolvedCount > 0 && !analysisComplete && (
                    <>
                      <p className="text-indigo-500 mt-1">
                        {aiProviderBadgeLabel} · AI 확인 예상 비용: 약 ${aiPhaseEstimatedCostUsd.toFixed(4)}(오늘 누적 추정 지출 ${todaySpent.toFixed(4)}, 이 브라우저 기준 best-effort 집계)
                      </p>
                      {unresolvedCount > AI_BATCH_SIZE * MAX_REQUESTS_PER_RUN && (
                        <p className="text-purple-500 font-bold mt-1">
                          ℹ 이번 실행은 호출 한도({MAX_REQUESTS_PER_RUN}회 = 최대 {AI_BATCH_SIZE * MAX_REQUESTS_PER_RUN}건)까지만 처리하고,
                          나머지 {unresolvedCount - AI_BATCH_SIZE * MAX_REQUESTS_PER_RUN}건은 "검토 필요"로 이월돼요(다음 실행에서 이어서 처리).
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <label className="flex items-center gap-1 font-bold text-indigo-600">
                          실행당 상한($)
                          <input type="number" min="0.01" step="0.01" defaultValue={costCeiling}
                            onBlur={(e) => updateCostCeiling(e.target.value)}
                            className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs w-20" />
                        </label>
                        <label className="flex items-center gap-1 font-bold text-indigo-600">
                          일일 상한($)
                          <input type="number" min="0.01" step="0.01" defaultValue={dailyCeiling}
                            onBlur={(e) => updateDailyCeiling(e.target.value)}
                            className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs w-20" />
                        </label>
                      </div>
                      {costGate?.blocked && (
                        <p className="text-red-500 font-bold mt-1">
                          ⛔ {costGate.overRunCeiling ? '실행당 상한을 초과해 AI 확인이 차단됐어요.' : '일일 누적 상한을 초과해 AI 확인이 차단됐어요.'} 규칙 기반 결과는 그대로 사용할 수 있어요. 상한을 올리거나 범위(선택한 답안만)를 줄여보세요.
                        </p>
                      )}
                      <button onClick={runAiConfirm} disabled={aiRunning || !!costGate?.blocked}
                        className="mt-2 bg-purple-600 hover:bg-purple-700 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press disabled:opacity-50">
                        {aiRunning
                          ? (aiProgress
                              ? `AI 호출 ${aiProgress.batchIndex}/${aiProgress.batchCount}${aiProgress.deferredByCap > 0 ? `, 이월 ${aiProgress.deferredByCap}건` : ''} (${Math.round((aiProgress.completed / Math.max(1, aiProgress.total)) * 100)}%, 캐시 ${aiProgress.cacheHits}건·실패 ${aiProgress.failures}건)`
                              : 'AI 확인 준비 중...')
                          : `AI 확인 진행 (${unresolvedCount}건, 약 $${aiPhaseEstimatedCostUsd.toFixed(4)})`}
                      </button>
                    </>
                  )}
                </div>
              )}

              {aiBudgetExceeded && (
                <p className="text-red-600 font-bold mb-2 bg-red-50 rounded-lg p-2">
                  ⛔ 일일 AI 비용 한도(약 ${(aiBudgetInfo?.capUsd ?? dailyCeiling).toFixed(2)}) 도달 — 오늘 사용 약 ${(aiBudgetInfo?.todayUsd ?? todaySpent).toFixed(4)}.
                  미해결 답안은 관리자 검토 필요 상태로 유지됩니다{aiDeferredCount > 0 ? `(이월 ${aiDeferredCount}건)` : ''}.
                </p>
              )}

              {aiSummary && (
                <>
                  <p className="text-indigo-600">
                    분석 대상 {aiSummary.total}건 — 자동 인정 가능 {aiSummary.safeAccept} / 관리자 확인 필요 {aiSummary.review} / 오답 후보 {aiSummary.rejectCandidate}
                  </p>
                  <p className="text-indigo-400 mt-0.5">
                    규칙 기반 처리 {aiSummary.ruleBased}건 · AI 처리 {aiSummary.aiProcessed}건 · 캐시 재사용 {aiSummary.cacheHits}건 · 처리 실패 {aiSummary.failed}건
                  </p>
                  {aiBandSummary && (
                    <p className="text-indigo-400 mt-0.5">
                      신뢰도 밴드 — <span className="font-bold text-emerald-600">≥95% 자동인정후보 {aiBandSummary.high}건</span> ·
                      <span className="font-bold text-amber-600"> 70~95% 검토 {aiBandSummary.mid}건</span> ·
                      <span className="font-bold text-gray-500"> &lt;70% 검토 {aiBandSummary.low}건</span>
                      {aiBandSummary.none > 0 && ` · 신뢰도 없음 ${aiBandSummary.none}건`}
                    </p>
                  )}
                  {aiUsage && (
                    <p className="text-indigo-400 mt-1">이번 실행 실측 토큰: 입력 {aiUsage.inputTokens} / 출력 {aiUsage.outputTokens} — 추정 비용 ${aiUsage.estimatedCostUsd.toFixed(4)}({aiUsage.model})</p>
                  )}

                  {analysisComplete && (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <select value={filterDecision} onChange={(e) => setFilterDecision(e.target.value)} className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold">
                          <option value="all">전체 판정</option>
                          <option value="accept">safe_accept만</option>
                          <option value="review">review만</option>
                          <option value="reject_candidate">reject_candidate만</option>
                        </select>
                        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold">
                          <option value="all">전체 출처</option>
                          <option value="rule">규칙만</option>
                          <option value="ai">AI만</option>
                          <option value="cache">캐시</option>
                        </select>
                        <select value={filterBand} onChange={(e) => setFilterBand(e.target.value)} className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold">
                          <option value="all">전체 신뢰도</option>
                          <option value="high">≥95%(자동인정후보)</option>
                          <option value="mid">70~95%(검토)</option>
                          <option value="low">&lt;70%(검토)</option>
                        </select>
                        <input value={filterWord} onChange={(e) => setFilterWord(e.target.value)} placeholder="단어 검색"
                          className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs w-24" />
                        <select value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)} className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold">
                          <option value="all">전체 학생(최초 제출)</option>
                          {studentOptions.map((id) => (
                            <option key={id} value={id}>{studentLabel(id)}</option>
                          ))}
                        </select>
                        <button onClick={() => setGroupView((v) => !v)}
                          className={`px-2 py-1 rounded-lg font-bold btn-press ${groupView ? 'bg-indigo-500 text-white' : 'bg-white border-2 border-indigo-200 text-indigo-600'}`}>
                          동일 답안 묶어 보기
                        </button>
                      </div>
                      <p className="text-indigo-300 mt-1">※ "학생" 필터는 최초 제출자 기준이에요 — 이 큐는 (단어,답안) 조합이 겹치면 1건만 남기고 나머지는 병합되기 때문에, 같은 오답을 나중에 낸 다른 학생은 여기 안 보여요.</p>

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="font-bold text-indigo-600">정렬</span>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border-2 border-indigo-200 rounded-lg px-2 py-1 text-xs font-bold">
                          <option value="none">기본(변경 없음)</option>
                          <option value="confidence">신뢰도</option>
                          <option value="word">단어</option>
                          <option value="decision">판정</option>
                          <option value="student">학생</option>
                        </select>
                        <button onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} disabled={sortBy === 'none'}
                          className="px-2 py-1 rounded-lg font-bold btn-press bg-white border-2 border-indigo-200 text-indigo-600 disabled:opacity-40">
                          {sortDir === 'asc' ? '오름차순' : '내림차순'}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <label className="flex items-center gap-1 font-bold text-indigo-600">
                          <input type="checkbox" checked={displayRows.length > 0 && selectedIds.size === displayRows.length} onChange={toggleSelectAll} />
                          전체 선택({selectedIds.size}/{displayRows.length})
                        </label>
                        <button onClick={clearSelection} disabled={selectedIds.size === 0}
                          className="text-indigo-500 font-bold btn-press disabled:opacity-40">선택 해제</button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button onClick={() => requestBulkConfirm('선택한 답안을 인정합니다', selectedRows, 'accept')} disabled={bulkBusy || selectedRows.length === 0}
                          className="bg-green-500 hover:bg-green-600 text-white font-black px-2 py-1 rounded-lg btn-press disabled:opacity-40">선택 인정({selectedRows.length})</button>
                        <button onClick={() => requestBulkConfirm('선택한 답안을 무시합니다', selectedRows, 'dismiss')} disabled={bulkBusy || selectedRows.length === 0}
                          className="bg-white border-2 border-gray-300 text-gray-600 font-bold px-2 py-1 rounded-lg btn-press disabled:opacity-40">선택 무시({selectedRows.length})</button>
                        <button onClick={() => requestBulkConfirm('확실한 답안(safe_accept, 신뢰도 95%↑, 경고 없음)을 모두 인정합니다', certainRows, 'accept')} disabled={bulkBusy || certainRows.length === 0}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2 py-1 rounded-lg btn-press disabled:opacity-40">확실한 답안 모두 인정({certainRows.length})</button>
                        <button onClick={() => requestBulkConfirm('동일한 답안이 여러 건 있는 것들을 모두 인정합니다', duplicateGroupRows, 'accept')} disabled={bulkBusy || duplicateGroupRows.length === 0}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2 py-1 rounded-lg btn-press disabled:opacity-40">동일한 답안 모두 인정({duplicateGroupRows.length})</button>
                        <button onClick={() => requestBulkConfirm('선택한 답안을 동의어로 저장합니다', selectedRows, 'synonym')} disabled={bulkBusy || selectedRows.length === 0}
                          className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded-lg btn-press disabled:opacity-40">동의어로 저장({selectedRows.length})</button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {displayRows.map((r) => {
              const proposal = proposalsById.get(r.id)
              const duplicates = aiEnabled && rows ? findDuplicateAnswerRows(rows, r, normalizeForCompare) : []
              return (
                <div key={r.id} className="bg-gray-50 rounded-xl p-3 flex items-start gap-2 text-sm">
                  {aiEnabled && (
                    <input type="checkbox" className="mt-1.5" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-gray-800">
                      {r.word} <span className="text-gray-400 font-bold text-xs">등록 뜻: {r.meaning}</span>
                      {groupView && duplicates.length > 0 && <span className="text-purple-500 font-bold text-xs"> · 동일 답안 그룹 {duplicates.length + 1}건</span>}
                    </p>
                    <p className="text-gray-600">학생 답: <span className="font-black text-orange-600">{r.submittedAnswer}</span></p>
                    {r.acceptedMeanings.length > 0 && (
                      <p className="text-[11px] text-gray-400">현재 인정 뜻: {r.acceptedMeanings.join(', ')}</p>
                    )}
                    {proposal && (
                      <p className={`text-[11px] font-bold mt-1 ${decisionColor(proposal.decision)}`}>
                        🤖 {decisionLabel(proposal.decision)}
                        {typeof proposal.confidence === 'number' && ` (신뢰도 ${Math.round(proposal.confidence * 100)}%)`}
                        {confidenceBand(proposal.confidence) && (
                          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${bandColor(confidenceBand(proposal.confidence))}`}>
                            {bandLabel(confidenceBand(proposal.confidence))}
                          </span>
                        )}
                        {' · 출처: '}{sourceLabel(proposal)}
                        {' — '}{proposal.reason}
                        {proposal.part_of_speech_warning && <span className="text-purple-500"> · ⚠품사 {proposal.part_of_speech_warning}</span>}
                        {proposal.meaning_scope_warning && <span className="text-purple-500"> · ⚠의미범위 {proposal.meaning_scope_warning}</span>}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <button onClick={() => accept(r)} disabled={busyId === r.id}
                        className="flex-shrink-0 bg-green-500 hover:bg-green-600 text-white font-black px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-40">
                        ✅ 이번 답안만 인정
                      </button>
                      {aiEnabled && (
                        <button onClick={() => acceptWithMode(r, 'synonym')} disabled={busyId === r.id}
                          className="flex-shrink-0 bg-emerald-100 text-emerald-700 font-bold px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-40">
                          이 단어 허용 답안으로 저장
                        </button>
                      )}
                      {aiEnabled && duplicates.length > 0 && (
                        <button onClick={() => acceptWithMode(r, 'all_duplicates')} disabled={busyId === r.id}
                          className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-40">
                          같은 대기 답안 {duplicates.length + 1}건 모두 인정
                        </button>
                      )}
                      <button onClick={() => dismiss(r)} disabled={busyId === r.id}
                        className="flex-shrink-0 bg-white border-2 border-gray-200 text-gray-500 font-bold px-3 py-2 rounded-xl text-xs btn-press disabled:opacity-40">
                        무시
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfirmAction(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <p className="font-black text-gray-800 mb-2">{confirmAction.title}</p>
            <p className="text-sm text-gray-600 mb-2">정확히 <span className="font-black text-orange-600">{confirmAction.count}건</span>에 적용됩니다.</p>
            {confirmAction.summary && (
              <div className="text-xs text-gray-600 space-y-1.5 mb-4 bg-gray-50 rounded-lg p-3">
                <p>
                  <span className="font-bold text-gray-700">단어: </span>
                  {confirmAction.summary.wordsDisplay.join(', ')}
                  {confirmAction.summary.wordsTruncatedCount > 0 && ` 외 ${confirmAction.summary.wordsTruncatedCount}개`}
                </p>
                <p>
                  <span className="font-bold text-gray-700">영향 학생(최초 제출자 기준) {confirmAction.summary.studentCount}명</span>
                  {' — '}이 큐는 (단어,답안) 중복 시 최초 제출자만 남기므로, 실제 그 오답을 낸 전체 학생 수보다 적을 수 있어요.
                </p>
                <p>단어 인정 목록(accepted_meanings) 갱신: <span className="font-bold">{confirmAction.summary.savesAcceptedMeanings ? '예' : '아니오'}</span></p>
                <p>인정 변형 감사 이력 저장: <span className="font-bold">{confirmAction.summary.savesAcceptedVariant ? '예(v3_7 SQL 실행 후 반영, 미실행 시 조용히 스킵)' : '아니오'}</span></p>
                <p className="text-red-500 font-bold">⚠ {confirmAction.summary.irreversibleWarning}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="flex-1 bg-white border-2 border-gray-300 text-gray-600 font-bold px-3 py-2 rounded-xl btn-press">취소</button>
              <button
                onClick={async () => { const run = confirmAction.run; setConfirmAction(null); await run() }}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-black px-3 py-2 rounded-xl btn-press">
                실행({confirmAction.count}건)
              </button>
            </div>
          </div>
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
  const [xpTotals, setXpTotals] = useState({}) // Paul Rank System — studentId -> total_xp (xp_ledger 미존재 시 빈 객체, 전원 0 취급)

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
      const [dashboardRows, wsSummary, xpMap] = await Promise.all([
        fetchDashboardData(ids),
        // v1.5 — word_status 마이그레이션(supabase_v1_5_word_status.sql) 전에도
        // 안전하게 빈 객체를 반환하도록 wordLibrary.js에서 이미 처리함.
        fetchWordStatusSummary(ids).catch(() => ({})),
        // Paul Rank System — supabase_v2_3_paul_rank.sql 미실행이어도
        // fetchXpTotals 자체가 빈 객체로 폴백(크래시 없음).
        fetchXpTotals(ids).catch(() => ({})),
      ])
      if (dashLoadReqIdRef.current !== reqId) return // 더 최신 반 선택이 있음 — 버림
      setRows(dashboardRows)
      setWordStatusSummary(wsSummary)
      setXpTotals(xpMap)
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
            <SeasonPanel adminPin={pin} />

            {/* 익명 관찰(2026-07-23) — 접힌 섹션, 열 때만 조회 */}
            <details className="bg-white rounded-3xl card-shadow">
              <summary className="cursor-pointer select-none list-none p-5 font-black text-gray-700">📊 관찰 (어떤 기능이 아이를 돌아오게 하나)</summary>
              <div className="px-5 pb-5"><AnalyticsPanel /></div>
            </details>

            <SpellingReviewQueuePanel onChanged={refresh} adminPin={pin} />

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

                        <SpellingSettingsPanel targetClass={c} onSaved={refresh} />

                        <GameSettingsPanel targetClass={c} onSaved={refresh} />

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

        {tab === 'students' && <StudentDirectory adminPin={pin} />}
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
