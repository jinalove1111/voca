// PAUL PHONICS 나의 학습 발달상황 (257차, 샘플 미리보기, 테스터 전용). 보여 주는 것은 항상 가상의 `샘플 학생 A`뿐이다 — 로그인한 학생의 이름·기록을 읽지 않는다.
// 저장·네트워크·보상 0. 아직 학습 기록 저장 기능이 없어서(설계만, docs/design/PHONICS_PROGRESS_2026-10-11.md) 화면 모양만 확인하는 용도다.
import React, { useState } from 'react'
import { EMPTY_KO, emptyState } from '../../utils/phonics/progress.js'
import { SAMPLE_NOTICE_KO, SAMPLE_STUDENTS } from '../../data/phonics/sampleProgress.js'
import ProgressViews from './ProgressViews.jsx'

export default function PhonicsProgress({ onBack }) {
  const [i, setI] = useState(0)
  const s = SAMPLE_STUDENTS[i]
  return (
    <div data-testid="ppg-root" className="min-w-0 space-y-3">
      <p data-testid="ppg-sample-notice" className="sticky top-0 z-10 rounded-2xl bg-amber-100 p-2 text-center text-sm font-black text-amber-900">{SAMPLE_NOTICE_KO}</p>
      <div className="text-center">
        <p className="text-xl font-black text-gray-900">나의 학습 발달상황 (샘플)</p>
        <p className="text-sm font-bold text-gray-600">{s.name}의 예시 화면이에요. 다른 친구와 비교하지 않아요.</p>
      </div>
      <p className="text-center text-xs font-black text-amber-800">지금은 점수가 저장되지 않아요</p>
      <div data-testid="ppg-sample-switch" className="flex gap-2">
        {[[0, 'A'], [SAMPLE_STUDENTS.length - 1, 'G']].map(([k, n]) => <button key={n} type="button" data-testid={`ppg-sample-${n}`} aria-pressed={i === k} onClick={() => setI(k)} className={`min-h-[44px] flex-1 rounded-2xl text-sm font-black ${i === k ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'}`}>샘플 학생 {n}</button>)}
      </div>
      {emptyState(s.records).empty ? <p data-testid="ppg-empty" className="rounded-2xl bg-white p-4 text-center text-base font-black text-gray-700">{EMPTY_KO}</p> : <ProgressViews records={s.records} prefix="ppg" kid />}
      <button type="button" data-testid="ppg-back" onClick={onBack} className="min-h-[44px] w-full rounded-2xl bg-gray-200 px-4 py-3 text-base font-black text-gray-700 btn-press">돌아가기</button>
    </div>
  )
}
