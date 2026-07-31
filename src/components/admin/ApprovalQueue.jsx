import { useEffect, useState } from 'react'
import { listExamples, approveExample, rejectExample } from '../../utils/curriculum/exampleLibrary'

const SOURCE_BADGE = { teacher: '👩‍🏫', import: '📥', rule: '⚙️', ai: '🤖' }

// ApprovalQueue.jsx — 타입 불문 통합 검수 인박스(docs/CURRICULUM_ENGINE.md
// §7 관리자 플로우 4번). 필터 없이 approval_status='pending' 전체를 한
// 화면에서 승인/반려한다. Phase 0은 examples만 있으므로 이 인박스도 examples
// 전용이지만, "타입 불문"이라는 설계 의도를 지키기 위해 후속 콘텐츠 모듈
// (listening_items 등, §11 Phase 2+)이 같은 출처·승인 표준 블록을 갖추면
// 이 파일에 조회를 추가하기만 하면 되도록 구조를 열어둔다(지금은 examples
// 하나뿐이라 실제 통합 로직은 없음 — 과장하지 않음, 규칙 18).
export default function ApprovalQueue({ adminPin }) {
  const [rows, setRows] = useState([])
  const [featureDisabled, setFeatureDisabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoaded(false)
    const { rows: r, featureDisabled: fd } = await listExamples({ approvalStatus: 'pending' }, { limit: 200 })
    setRows(r)
    setFeatureDisabled(fd)
    setLoaded(true)
  }

  useEffect(() => { load() }, [])

  const handleApprove = async (row) => {
    setBusy(true)
    try {
      await approveExample(row.id, adminPin)
      await load()
    } catch (err) {
      alert('승인 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async (row) => {
    setBusy(true)
    try {
      await rejectExample(row.id, adminPin)
      await load()
    } catch (err) {
      alert('반려 중 오류: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {featureDisabled && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 text-xs font-bold text-orange-700">
          ⚠️ 검수함 기능은 supabase_v3_13 실행 후 사용 가능해요.
        </div>
      )}
      <div className="bg-white rounded-xl p-3 card-shadow">
        <p className="text-xs font-black text-gray-700">✅ 검수 대기 ({rows.length}건)</p>
      </div>
      {!loaded && <p className="text-xs text-gray-400 py-2">불러오는 중...</p>}
      {loaded && rows.length === 0 && !featureDisabled && (
        <p className="text-xs text-gray-400 py-2">검수 대기 중인 예문이 없어요.</p>
      )}
      {rows.map((row) => (
        <div key={row.id} className="bg-white rounded-xl p-3 card-shadow space-y-1.5">
          <p className="text-[10px] font-black text-indigo-500 font-mono">
            {SOURCE_BADGE[row.source] || '❓'} {row.targetWord}
          </p>
          <p className="text-sm font-bold text-gray-800 break-words">{row.englishSentence}</p>
          {row.koreanTranslation && <p className="text-xs text-gray-500">{row.koreanTranslation}</p>}
          <div className="flex gap-2">
            <button onClick={() => handleApprove(row)} disabled={busy}
              className="flex-1 bg-green-500 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
              ✅ 승인
            </button>
            <button onClick={() => handleReject(row)} disabled={busy}
              className="flex-1 bg-red-400 disabled:bg-gray-300 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
              🚫 반려
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
