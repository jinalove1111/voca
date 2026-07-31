import { useState } from 'react'
import CurriculumTree from './CurriculumTree'
import ExampleManager from './ExampleManager'
import ApprovalQueue from './ApprovalQueue'

// CurriculumHub.jsx — Curriculum Engine Phase 0 관리자 탭 진입점
// (docs/CURRICULUM_ENGINE.md §5 폴더 구조 / §7 관리자 플로우).
//
// AdminScreen.jsx 탭 배열에 ['curriculum','📚 커리큘럼'] 1줄 + 이 컴포넌트
// 렌더 1줄만 추가된다(설계 지시 그대로 — 이 파일 자신이 실제 UI를 갖는다).
// 서브탭 3개: 구조(CurriculumTree, 출판사/학년/교재·유닛 메타) / 예문
// (ExampleManager, examples CRUD) / 검수함(ApprovalQueue, pending 통합
// 인박스). 세 서브탭 모두 supabase_v3_13이 아직 실행 안 됐어도(featureDisabled
// 폴백) 크래시하지 않고 각자 안내 배너만 보여준다 — 이 파일 자체는 배너
// 로직을 갖지 않고 하위 컴포넌트에 위임한다.
const SUB_TABS = [
  ['tree', '🗂 구조'],
  ['examples', '📝 예문'],
  ['approval', '✅ 검수함'],
]

export default function CurriculumHub({ adminPin }) {
  const [subTab, setSubTab] = useState('tree')

  return (
    <div className="space-y-3">
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-3 text-xs font-bold text-indigo-800">
        📚 커리큘럼 허브 — 출판사/학년/교재·유닛 메타 + 교과서 연계 예문 CRUD·승인.
        supabase_v3_13 실행 전에도 안전하게 열려요(기능 비활성 배너로 안내).
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {SUB_TABS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setSubTab(k)}
            className={`py-2 px-3 rounded-xl font-black text-sm btn-press whitespace-nowrap transition-colors ${
              subTab === k ? 'bg-indigo-500 text-white' : 'bg-white text-gray-500 border-2 border-gray-200'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {subTab === 'tree' && <CurriculumTree adminPin={adminPin} />}
      {subTab === 'examples' && <ExampleManager adminPin={adminPin} />}
      {subTab === 'approval' && <ApprovalQueue adminPin={adminPin} />}
    </div>
  )
}
