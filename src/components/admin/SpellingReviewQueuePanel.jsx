import React, { useState, useEffect, useMemo } from 'react'
import { setWordAcceptedMeanings, getStudents } from '../../utils/wordLibrary'
import { fetchPendingSpellingReviews, resolveSpellingReview } from '../../utils/spellingReviewApi'
// 쓰기 답안 검토 AI 보조(Task 2, 2026-07-23) — writingReviewAiAssist
// 플래그로 게이팅되는 SpellingReviewQueuePanel 확장. 기존 accept()/
// dismiss() 로직은 위 두 함수 그대로 재사용(새 쓰기 경로 추가 안 함).
import {
  runRulesPhase, runAiPhase, executeAccept, executeBulkAccept, executeBulkDismiss,
  estimateAiCostUsd, AI_BATCH_SIZE, MAX_REQUESTS_PER_RUN, evaluateCostGate, AI_MODEL_ID,
  DEFAULT_AI_PROVIDER, formatProviderDisplay,
  getCostCeilingUsd, setCostCeilingUsd, getDailyCeilingUsd, setDailyCeilingUsd,
  getTodaySpentUsd, recordEstimatedSpendUsd,
} from '../../utils/spellingReviewAiApi'
import {
  selectRows, findDuplicateAnswerRows, selectCertainAccepts, selectAllDuplicateGroupRows, groupRowsByAnswer,
  filterProposals, filterProposalsBySource, filterProposalsByBand, confidenceBand, summarizeConfidenceBands,
  filterRowsByStudent, distinctStudentIds, sortDisplayItems,
  summarizeBulkResults, summarizeProposals, normalizeForCompare, buildConfirmSummary,
} from '../../utils/spellingReviewBulkPlan'
// "선생님이 같은 검토를 두 번 하지 않는" 자동 학습 시스템(2026-07-24) —
// SpellingReviewQueuePanel의 미리보기/AI 확인 실행이 끝날 때마다
// accumulateSavingsCounters로 localStorage에 절약 카운터를 쌓는다.
// AiSavingsCard(별도 파일)가 이 값을 읽어 보여준다.
import { accumulateSavingsCounters } from '../../utils/writingAnswerStatsApi'
import { isFeatureEnabled } from '../../config/features'

// AdminScreen.jsx → src/components/admin/SpellingReviewQueuePanel.jsx로 이동
// (2026-07-24, 코드 품질 감사 대응 — AdminScreen.jsx가 하루 만에 57% 증가한
// 것 중 이 패널(685줄)이 큰 비중이었다). StudentDirectory.jsx(2026-07-22)
// 분리와 동일한 방식 — 순수 이동, 로직 변경 없음. 아래 원본 주석은 그대로
// 보존:
//
// v2.0(2026-07-17) 쓰기 답안 교사 검토 큐 — 영→한 문제에서 학생이 한글로
// 답했는데 오답 처리된 제출("뜻은 아는데 등록된 표기가 아닌" 후보)을
// 교사가 직접 판정하는 패널. "이 답 인정" 원클릭 = 그 단어의
// accepted_meanings에 추가(다음부터 전 반에서 정답 처리) + 큐에서 제거.
// AI 자동 판정은 없음(운영자 방침 — 최종 판정은 항상 교사).
// 테이블 미존재(supabase_v2_0_spelling_mixed.sql 미실행)면 안내만 표시.

// "오늘 AI 절약 카드"(2026-07-24) 집계 헬퍼 — 완료된 proposal 배열에서
// rules(정확일치/레벤슈타인)/cache(캐시 히트)/variants(동의어 규칙 히트)/
// ai(실제 AI 처리)를 센다. statsSkips는 서버 응답(runAiPhase 결과)에서
// 별도로 오므로 이 함수 몫이 아니다. 실패/이월(ai_unavailable/ai_error/
// parse_error/ai_deferred/ai_budget_exceeded)은 "아꼈다"도 "AI를 썼다"도
// 아닌 애매한 상태라 어느 카운터에도 넣지 않는다(과대 계상 방지).
// (이 헬퍼는 SpellingReviewQueuePanel 안에서만 쓰여 AdminScreen.jsx의
// 모듈 스코프 함수였던 것을 이 파일로 함께 옮겼다 — 신규 로직 아님.)
function computeSavingsFromProposals(proposals) {
  let rules = 0, cache = 0, variants = 0, ai = 0
  for (const p of proposals || []) {
    if (p.cache_hit) { cache++; continue }
    if (p.decision_source === 'synonym') { variants++; continue }
    if (p.decision_source === 'exact_match' || p.decision_source === 'levenshtein') { rules++; continue }
    if (p.decision_source === 'ai') { ai++; continue }
  }
  return { rules, cache, variants, ai }
}

export default function SpellingReviewQueuePanel({ onChanged, adminPin, onSavingsUpdate }) {
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
      await setWordAcceptedMeanings(r.wordId, [...r.acceptedMeanings, r.submittedAnswer], adminPin)
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
    // 오늘 AI 절약 카드(요구사항 7) — 미해결 0건이면 AI 확인 단계 자체가
    // 필요 없어 이 시점이 곧 "이번 실행의 완료" 지점이다(ai/statsSkips는
    // 0, AI를 한 번도 호출하지 않았으므로). 미해결이 남아 있으면 runAiConfirm
    // 쪽에서 최종(규칙+AI 합산) 집계를 담당한다 — 여기선 중복 집계하지 않음.
    if (unresolved.length === 0) {
      accumulateSavingsCounters({ ...computeSavingsFromProposals(resolved), statsSkips: 0 })
      onSavingsUpdate?.()
    }
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
      const { proposals, usage, callFailed, callError, budgetExceeded, budgetInfo, deferredCount, statsSkips } = await runAiPhase({
        adminPin,
        unresolvedRows: rulesResult.unresolved,
        batchSize: AI_BATCH_SIZE,
        onProgress: (p) => setAiProgress(p),
        rulesResolvedCount: rulesResult.resolved.length,
      })
      const finalProposals = [...rulesResult.resolved, ...proposals]
      setAiProposals(finalProposals)
      setAiUsage(usage)
      setAiCallFailed(callFailed)
      setAiCallError(callError || '')
      setAiBudgetExceeded(!!budgetExceeded)
      setAiBudgetInfo(budgetInfo || null)
      setAiDeferredCount(deferredCount || 0)
      setTodaySpent(recordEstimatedSpendUsd(usage?.estimatedCostUsd ?? estCost))
      // 오늘 AI 절약 카드(요구사항 7) — 이 실행(규칙+AI 전체)의 최종 집계.
      accumulateSavingsCounters({ ...computeSavingsFromProposals(finalProposals), statsSkips: statsSkips || 0 })
      onSavingsUpdate?.()
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
      await executeAccept(row, { mode, duplicateRows, adminPin })
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
        : await executeBulkAccept(targetRows, { mode: kind === 'synonym' ? 'synonym' : 'answer_only', adminPin })
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
