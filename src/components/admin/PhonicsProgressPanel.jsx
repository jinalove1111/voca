// 관리자 전용 — PAUL PHONICS 학습 발달 (257차, 샘플 미리보기, 읽기 전용). 모든 데이터는 가상의 `샘플반`이다 — 실제 학생 기록·DB·저장소·네트워크를 쓰지 않는다.
// 선택한 학생은 React state뿐이다. 설계: docs/design/PHONICS_PROGRESS_2026-10-11.md
import React, { useMemo, useState } from 'react'
import { BOOKS } from '../../data/phonics/curriculum.js'
import { SAMPLE_CLASS_NAME, SAMPLE_NOTICE_KO, SAMPLE_STUDENTS } from '../../data/phonics/sampleProgress.js'
import { classOverview, classWeakPhonemes, parentSummary, recommendations, unitName, unitTestResults } from '../../utils/phonics/progress.js'
import ProgressViews, { Bar, Empty, slash } from '../phonics/ProgressViews.jsx'

const BOX = 'min-w-0 rounded-2xl border-2 border-gray-200 bg-white p-3'
const H = 'text-sm font-black text-gray-800'
const TH = 'whitespace-nowrap border-b-2 border-gray-200 bg-gray-50 px-2 py-1 text-left text-xs font-black text-gray-600'
const TD = 'border-b border-gray-100 px-2 py-2 align-top text-xs text-gray-700'
const testText = (t) => (t ? `${unitName(t.bookId, t.unitId)} ${t.score}/${t.total}` : '—')

export default function PhonicsProgressPanel() {
  const [selected, setSelected] = useState(null)
  const d = useMemo(() => {
    const unitKeys = BOOKS.flatMap((b) => b.units.map((u) => [b.id, u.id]))
    const results = SAMPLE_STUDENTS.map((s) => new Map(unitTestResults(s.records).map((t) => [`${t.bookId}/${t.unitId}`, t])))
    return {
      overview: classOverview(SAMPLE_STUDENTS), weak: classWeakPhonemes(SAMPLE_STUDENTS), results,
      cols: unitKeys.filter(([b, u]) => results.some((m) => m.has(`${b}/${u}`))),
      recs: SAMPLE_STUDENTS.map((s) => recommendations(s.records)),
    }
  }, [])
  const sel = SAMPLE_STUDENTS.find((s) => s.id === selected) || null
  return (
    <div data-testid="ppa-root" className="min-w-0 space-y-4">
      <p data-testid="ppa-sample-notice" className="rounded-2xl bg-amber-100 p-3 text-center text-sm font-black text-amber-900">{SAMPLE_NOTICE_KO} — 읽기 전용 미리보기</p>

      <section data-testid="ppa-class" className={BOX}>
        <p className={H}>반별 학생 목록 · {SAMPLE_CLASS_NAME}</p>
        <div className="mt-2 max-w-full overflow-x-auto">
          <table className="min-w-[32rem] border-collapse">
            <thead><tr>{['학생', '진도', '최근 시험', '취약 소리'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {d.overview.map((o) => (
                <tr key={o.id} data-testid="ppa-class-row" data-id={o.id} data-selected={selected === o.id ? 'true' : 'false'} onClick={() => setSelected(o.id)} className={`cursor-pointer ${selected === o.id ? 'bg-purple-50' : ''}`}>
                  <td className={`${TD} whitespace-nowrap font-black text-gray-900`}>{o.name}</td>
                  <td className={`${TD} min-w-[7rem]`}>{o.percent}% ({o.completed}/43)<Bar percent={o.percent} color="bg-pink-400" /></td>
                  <td className={`${TD} whitespace-nowrap`}>{testText(o.latestTest)}</td>
                  <td className={TD}>{o.weakest.length ? o.weakest.map(slash).join(' ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section data-testid="ppa-student" className={BOX}>
        <p className={H}>학생별 학습 현황{sel ? ` · ${sel.name}` : ''}</p>
        {sel ? <div className="mt-2"><ProgressViews records={sel.records} prefix="ppa-student" /></div> : <Empty>위 표에서 학생을 선택하세요.</Empty>}
      </section>

      <section data-testid="ppa-compare" className={BOX}>
        <p className={H}>시험 결과 비교 (학생 × Unit)</p>
        <div className="mt-2 max-h-96 max-w-full overflow-auto">
          <table className="border-collapse">
            <thead><tr><th className={TH}>학생</th>{d.cols.map(([b, u]) => <th key={`${b}${u}`} className={TH}>{unitName(b, u).replace('Book ', 'B').replace(' Unit ', '-U')}</th>)}</tr></thead>
            <tbody>
              {SAMPLE_STUDENTS.map((s, i) => (
                <tr key={s.id} data-testid="ppa-compare-row">
                  <td className={`${TD} whitespace-nowrap font-black`}>{s.name}</td>
                  {d.cols.map(([b, u]) => { const t = d.results[i].get(`${b}/${u}`); return <td key={`${b}${u}`} className={`${TD} whitespace-nowrap text-center`}>{t ? `${t.score}/${t.total}` : '—'}</td> })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section data-testid="ppa-weak" className={BOX}>
        <p className={H}>취약 음소 분석 (반 전체)</p>
        {d.weak.length ? (
          <ul className="mt-2 space-y-1">
            {d.weak.map((w) => <li key={w.phoneme} data-testid="ppa-weak-item" className="text-xs font-bold text-gray-700">{slash(w.phoneme)} · 취약 학생 {w.students}명 · 반 전체 오답률 {w.rate}% ({w.attempts}번 중 {w.wrong}번)</li>)}
          </ul>
        ) : <Empty>취약 소리가 없어요.</Empty>}
      </section>

      <section data-testid="ppa-recommend" className={BOX}>
        <p className={H}>복습 추천</p>
        <ul className="mt-2 space-y-2">
          {SAMPLE_STUDENTS.map((s, i) => (
            <li key={s.id} data-testid="ppa-recommend-item" className="min-w-0 text-xs text-gray-700"><span className="font-black text-gray-900">{s.name}</span><ul className="list-disc pl-5">{d.recs[i].map((t) => <li key={t} className="break-words">{t}</li>)}</ul></li>
          ))}
        </ul>
      </section>

      <section data-testid="ppa-parent" className={BOX}>
        <p className={H}>학부모 상담용 요약</p>
        <p data-testid="ppa-parent-text" className="mt-2 break-words text-sm text-gray-800">{sel ? parentSummary(sel, sel.records) : '학생을 선택하면 요약이 보여요.'}</p>
        <p className="mt-2 text-xs font-black text-amber-700">샘플 — 가상의 학생이며 실제 상담 자료가 아닙니다. 점수와 횟수만 적고 추측은 적지 않습니다.</p>
      </section>
    </div>
  )
}
