import React, { useState, useEffect, useCallback } from 'react'
import { getStudents, fetchDebugSnapshot } from '../utils/wordLibrary'
import { getSyncMeta, getLocalRecordRaw } from '../hooks/useStudent'

// v1.5 Stability Milestone — hidden admin-only page (reachable via a hidden
// trigger in AdminScreen, not the visible tab bar). Shows, for one student:
// 1) this device's localStorage snapshot, 2) live Supabase rows, 3) this
// device's sync health (status/last attempt/last success/failed count), and
// 4) an automatic mismatch check between local and cloud so a persistence
// bug shows up as a red banner instead of requiring manual comparison.
// "This device" is called out explicitly everywhere below because
// localStorage and sync-meta are inherently per-device — this page can only
// ever show what THIS browser has seen, never another student device.

const SYNC_STATUS_LABEL = {
  idle: ['⚪', '아직 동기화 시도 없음', 'text-gray-500'],
  syncing: ['🔄', '동기화 중...', 'text-blue-500'],
  success: ['✅', '동기화 성공', 'text-green-600'],
  error: ['❌', '동기화 실패', 'text-red-600'],
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR')
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between items-start gap-3 py-1 border-b border-gray-100 last:border-0">
      <span className="text-xs font-bold text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-mono text-gray-800 text-right break-all">{children}</span>
    </div>
  )
}

function JsonBlock({ value }) {
  return (
    <pre className="text-[10px] leading-tight bg-gray-900 text-green-300 rounded-lg p-2 overflow-x-auto max-h-64 overflow-y-auto">
      {value === null || value === undefined ? 'null' : JSON.stringify(value, null, 2)}
    </pre>
  )
}

// Compares the values that MUST agree between the local record and the
// cloud backup if sync is healthy. Only flags fields that are actually
// denormalized/backed-up (see syncStudentProgress) — anything else would be
// a false positive (e.g. cloud's `daily` rows are 14-day history, not a
// live mirror of `round`).
function computeMismatches(local, cloud) {
  if (!local || !cloud?.progress) return []
  const p = cloud.progress
  const mismatches = []
  if (local.totalStars !== p.total_stars) mismatches.push(`totalStars: 로컬 ${local.totalStars} ≠ DB total_stars ${p.total_stars}`)
  if ((local.stickers?.length || 0) !== p.stickers_count) mismatches.push(`stickers 개수: 로컬 ${local.stickers?.length || 0} ≠ DB stickers_count ${p.stickers_count}`)
  const cloudWordStatusCount = cloud.wordStatusRows?.length || 0
  const localWordStatusCount = Object.keys(local.wordStatus || {}).length
  if (localWordStatusCount !== cloudWordStatusCount) mismatches.push(`word_status 개수: 로컬 ${localWordStatusCount} ≠ DB ${cloudWordStatusCount}개 row`)
  if (!p.progress_data || Object.keys(p.progress_data).length === 0) mismatches.push('progress_data(전체 백업)가 비어있음 — 클라우드 복구 불가 상태')
  return mismatches
}

// P0(2026-07-15): getStudents()가 이제 {id,name,...} 객체 배열을 반환한다
// (예전엔 이름 문자열 배열) — 선택값/조회를 전부 id 기준으로 바꿨다.
// getLocalRecordRaw/getSyncMeta/fetchDebugSnapshot 전부 studentId를 받는다.
export default function DebugPage() {
  const [students] = useState(() => getStudents())
  const [selected, setSelected] = useState(students[0]?.id || '')
  const [cloud, setCloud] = useState(null)
  const [local, setLocal] = useState(null)
  const [syncMeta, setSyncMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    setLocal(getLocalRecordRaw(selected))
    setSyncMeta(getSyncMeta(selected))
    try {
      setCloud(await fetchDebugSnapshot(selected))
    } catch (err) {
      setError(err.message || String(err))
      setCloud(null)
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => { load() }, [load])

  const mismatches = computeMismatches(local, cloud)
  const [icon, label, color] = SYNC_STATUS_LABEL[syncMeta?.status || 'idle']

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-3 text-xs font-bold text-yellow-800">
        🔧 디버그 페이지 — 관리자 전용. 학생에게 보여주지 마세요.
      </div>

      <div className="flex gap-2 items-center">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}
          className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 font-bold text-sm bg-white">
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          className="bg-purple-500 text-white font-black px-4 py-2 rounded-xl btn-press disabled:opacity-50 text-sm whitespace-nowrap">
          {loading ? '⏳' : '🔄 새로고침'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 text-xs font-bold text-red-700">
          ⚠ 조회 오류: {error}
        </div>
      )}

      {mismatches.length > 0 && (
        <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3 space-y-1">
          <p className="text-xs font-black text-red-700">🚨 로컬 ↔ 클라우드 불일치 감지</p>
          {mismatches.map((m, i) => <p key={i} className="text-xs font-bold text-red-600">• {m}</p>)}
        </div>
      )}
      {mismatches.length === 0 && local && cloud?.progress && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-3 text-xs font-bold text-green-700">
          ✅ 로컬과 클라우드 데이터 일치
        </div>
      )}

      <div className="bg-white rounded-xl p-3 card-shadow space-y-1">
        <p className="text-xs font-black text-gray-700 mb-1">🔄 이 기기의 동기화 상태</p>
        <Row label="상태"><span className={color}>{icon} {label}</span></Row>
        <Row label="마지막 종류">{syncMeta?.lastType || '—'}</Row>
        <Row label="마지막 시도 시각">{fmtTime(syncMeta?.lastAttemptAt)}</Row>
        <Row label="마지막 성공 시각">{fmtTime(syncMeta?.lastSuccessAt)}</Row>
        <Row label="연속 실패 횟수">{syncMeta?.failedCount ?? 0}</Row>
        {syncMeta?.lastError && <Row label="마지막 에러"><span className="text-red-600">{syncMeta.lastError}</span></Row>}
      </div>

      <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
        <p className="text-xs font-black text-gray-700">💾 이 기기의 localStorage 스냅샷</p>
        {local ? <JsonBlock value={local} /> : <p className="text-xs text-gray-400 font-bold">이 기기에 이 학생의 로컬 데이터 없음</p>}
      </div>

      <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
        <p className="text-xs font-black text-gray-700">☁️ Supabase student_progress</p>
        {cloud?.progress ? (
          <>
            <Row label="total_stars">{cloud.progress.total_stars}</Row>
            <Row label="streak / streak_count">{cloud.progress.streak} / {cloud.progress.streak_count}</Row>
            <Row label="total_xp">{cloud.progress.total_xp}</Row>
            <Row label="stickers_count">{cloud.progress.stickers_count}</Row>
            <Row label="last_studied_date">{cloud.progress.last_studied_date}</Row>
            <Row label="updated_at">{fmtTime(cloud.progress.updated_at)}</Row>
            <p className="text-[11px] font-bold text-gray-500 mt-2">progress_data (전체 백업)</p>
            <JsonBlock value={cloud.progress.progress_data} />
          </>
        ) : <p className="text-xs text-gray-400 font-bold">DB에 student_progress row 없음</p>}
      </div>

      <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
        <p className="text-xs font-black text-gray-700">☁️ student_daily_progress (최근 14일)</p>
        {cloud?.daily?.length ? (
          <div className="overflow-x-auto">
            <table className="text-[10px] w-full">
              <thead><tr className="text-left text-gray-500">
                <th className="pr-2">날짜</th><th className="pr-2">완료</th><th className="pr-2">별</th><th className="pr-2">퀴즈</th>
              </tr></thead>
              <tbody>
                {cloud.daily.map((d) => (
                  <tr key={d.date} className="border-t border-gray-100">
                    <td className="pr-2 font-mono">{d.date}</td>
                    <td className="pr-2">{d.categories_completed}/4</td>
                    <td className="pr-2">{d.stars_earned}</td>
                    <td className="pr-2">{d.quiz_correct}/{d.quiz_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-xs text-gray-400 font-bold">row 없음</p>}
      </div>

      <div className="bg-white rounded-xl p-3 card-shadow space-y-2">
        <p className="text-xs font-black text-gray-700">☁️ word_status ({cloud?.wordStatusRows?.length ?? 0}개)</p>
        {cloud?.wordStatusError && <p className="text-xs text-red-600 font-bold">⚠ {cloud.wordStatusError} (v1.5 마이그레이션 미실행 가능성)</p>}
        {cloud?.wordStatusRows?.length ? (
          <div className="overflow-x-auto">
            <table className="text-[10px] w-full">
              <thead><tr className="text-left text-gray-500">
                <th className="pr-2">word_id</th><th className="pr-2">상태</th><th className="pr-2">업데이트</th>
              </tr></thead>
              <tbody>
                {cloud.wordStatusRows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="pr-2 font-mono">{r.word_id.slice(0, 8)}…</td>
                    <td className="pr-2">{r.status}</td>
                    <td className="pr-2">{fmtTime(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !cloud?.wordStatusError && <p className="text-xs text-gray-400 font-bold">row 없음</p>}
      </div>
    </div>
  )
}
