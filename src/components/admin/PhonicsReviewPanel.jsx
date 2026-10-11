// 관리자 전용 — PAUL PHONICS 검토 자료 (255차, 읽기 전용). 43개 Unit은 구조만 승인됐고 전부 임시다.
// 운영 DB·학생 기록·저장소·네트워크를 쓰지 않는다. 숫자는 데이터에서 그때그때 계산한다(하드코딩 없음).
import React, { useMemo } from 'react'
import { BOOKS, DIALECT_NOTES, GAME_NAME, STATUS_LABEL_KO, objectiveKo, prereqKo, recordableTargets, unitLabel } from '../../data/phonics/curriculum.js'
import { PHONICS_ITEMS } from '../../data/phonics/phonicsWords.js'
import { PHONEME_CLIPS, RECORDING_LIST, recordingStatus } from '../../data/phonics/phonemeClips.js'
import { learnedPairs, pairOf, reusedIpas, unitWords } from '../../utils/phonics/curriculum.js'

const MARK = { ready: '🖼', needed: '⏳', 'not-needed': '🔤' }
const MARK_TITLE = { ready: '그림 준비', needed: '제작 대기', 'not-needed': '그림 없이' }
const CHIP = 'rounded-full bg-purple-100 px-2 py-1 text-xs font-black text-purple-800'
const TH = 'whitespace-nowrap border-b-2 border-gray-200 bg-gray-50 px-2 py-1 text-left text-xs font-black text-gray-600'
const TD = 'border-b border-gray-100 px-2 py-2 align-top text-xs text-gray-700'

function useStats() {
  return useMemo(() => {
    const units = BOOKS.flatMap((b) => b.units.map((u) => ({ b, u })))
    let unlearned = 0
    for (const { b, u } of units) {
      if (b.focus === 'vowel-recognition') continue
      const learned = new Set(learnedPairs(b.id, u.id))
      for (const w of unitWords(b.id, u.id)) if (!w.graphemes.every((_, i) => learned.has(pairOf(w, i)))) unlearned++
    }
    const by = (s) => PHONICS_ITEMS.filter((i) => i.image === s)
    const approved = RECORDING_LIST.filter((r) => recordingStatus(r.ipa) === 'approved').length
    return { units, unlearned, ready: by('ready'), needed: by('needed').map((i) => i.word).sort(), free: by('not-needed').map((i) => i.word).sort(), approved }
  }, [])
}

function UnitRow({ b, u }) {
  const words = unitWords(b.id, u.id)
  const rec = [...new Set(recordableTargets(u).map((x) => x.ipa))]
  const reuse = reusedIpas(b.id, u.id)
  const ready = words.filter((w) => w.image === 'ready').length
  const notes = [
    ...u.aux.map((p) => `${p.split('|')[0]} 보조 철자`),
    u.note,
    ...(reuse.length ? [`재사용: ${reuse.map((x) => `/${x}/`).join(' ')} (같은 녹음)`] : []),
    u.dialect && `방언: ${u.dialect}`,
  ].filter(Boolean)
  return (
    <tr data-testid={`phr-unit-${b.id}-${u.id}`} data-status={u.status}>
      <td className={`${TD} whitespace-nowrap font-black`}>Unit {u.id.slice(1)}</td>
      <td className={`${TD} whitespace-nowrap`}><span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-800">{STATUS_LABEL_KO[u.status]}</span></td>
      <td className={TD}>{u.targets.length ? [...new Set(u.targets.map((x) => `/${x.ipa}/`))].join(' ') : '—'}</td>
      <td className={`${TD} font-black text-pink-600`}>{unitLabel(u)}</td>
      <td className={TD}>
        <div className="flex min-w-[10rem] flex-wrap gap-x-2 gap-y-1">
          {words.map((w) => <span key={w.id} data-image={w.image} title={MARK_TITLE[w.image]} className="whitespace-nowrap">{MARK[w.image]} {w.word}</span>)}
        </div>
      </td>
      <td className={TD}>{u.games.split('').map((g) => GAME_NAME[g]).join(' · ')}</td>
      <td className={`${TD} whitespace-nowrap`}>{rec.length ? `승인 0 / 필요 ${rec.length}` : '녹음 불필요'}</td>
      <td className={`${TD} whitespace-nowrap`}>{ready} / {words.length}</td>
      <td className={`${TD} whitespace-nowrap`}>{u.difficulty}</td>
      <td className={TD}>{prereqKo(b.id, u.id)}</td>
      <td className={TD}>{objectiveKo(b, u)}{notes.length ? ` · ${notes.join(' · ')}` : ''}</td>
    </tr>
  )
}

function WordList({ testid, title, words }) {
  return (
    <section className="min-w-0 rounded-2xl border-2 border-gray-200 bg-white p-3">
      <p className="text-sm font-black text-gray-800">{title} <span data-testid={`${testid}-count`}>{words.length}</span></p>
      <ul data-testid={testid} className="mt-2 flex flex-wrap gap-1">
        {words.map((w) => <li key={w} data-testid={`${testid}-item`} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">{w}</li>)}
      </ul>
    </section>
  )
}

export default function PhonicsReviewPanel() {
  const s = useStats()
  const chips = [
    ['unit', `Unit ${s.units.length}`], ['approved', `승인 ${s.units.filter(({ u }) => u.status === 'approved').length}`], ['words', `단어 ${PHONICS_ITEMS.length}`],
    ['ready', `그림 준비 ${s.ready.length}`], ['needed', `이미지 제작 대기 ${s.needed.length}`], ['free', `그림 없이 학습 ${s.free.length}`],
    ['rec', `녹음 필요 ${RECORDING_LIST.length}`], ['recok', `녹음 승인 ${s.approved}`], ['unlearned', `배우지 않은 소리가 필요한 단어 ${s.unlearned}`],
  ]
  return (
    <div data-testid="phr-root" className="min-w-0 space-y-4">
      <div className="min-w-0 rounded-2xl bg-amber-50 p-3">
        <p className="text-base font-black text-amber-900">PAUL PHONICS 관리자 검토 자료 — 구조만 승인, 모든 Unit 임시</p>
        <p className="mt-1 text-xs font-bold text-amber-800">단어·소리·그림·녹음은 승인 전입니다. 이 화면은 읽기 전용이고 아무것도 저장하거나 전송하지 않습니다.</p>
        <div data-testid="phr-summary" className="mt-2 flex flex-wrap gap-2">
          {chips.map(([k, t]) => <span key={k} data-testid={`phr-chip-${k}`} className={CHIP}>{t}</span>)}
        </div>
      </div>

      {BOOKS.map((b) => (
        <section key={b.id} className="min-w-0 space-y-2">
          <p className="text-sm font-black text-gray-800">Book {b.no} · {b.titleEn} · {b.titleKo} <span className="text-xs font-bold text-gray-500">(Unit {b.units.length})</span></p>
          <div className="max-w-full overflow-x-auto rounded-2xl border-2 border-gray-200 bg-white">
            <table data-testid={`phr-book-${b.id}`} className="min-w-[64rem] border-collapse">
              <thead>
                <tr>{['Unit', '상태', '목표 음소', '철자 패턴', '대표 단어', '게임', '음성 준비', '이미지 준비', '난이도', '선수 학습', '비고'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
              </thead>
              <tbody>{b.units.map((u) => <UnitRow key={u.id} b={b} u={u} />)}</tbody>
            </table>
          </div>
        </section>
      ))}

      <WordList testid="phr-need-image" title="이미지 제작 대기" words={s.needed} />
      <WordList testid="phr-no-image" title="그림 없이 학습" words={s.free} />

      <section className="min-w-0 rounded-2xl border-2 border-gray-200 bg-white p-3">
        <p className="text-sm font-black text-gray-800">녹음 필요 <span data-testid="phr-recordings-count">{RECORDING_LIST.length}</span> <span className="text-xs font-bold text-gray-500">(없음 = 대기, 소리 하나는 음성 합성으로 읽지 않습니다)</span></p>
        <ul data-testid="phr-recordings" className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {RECORDING_LIST.map((r) => (
            <li key={r.ipa} data-testid="phr-recording" data-ipa={r.ipa} data-status={recordingStatus(r.ipa, PHONEME_CLIPS)} className="flex min-w-0 items-center gap-2 rounded-xl bg-gray-50 px-2 py-1 text-xs text-gray-700">
              <span className="w-12 shrink-0 font-black text-gray-900">/{r.ipa}/</span>
              <span className="min-w-0 flex-1 break-words">{r.grapheme} · {r.example}</span>
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-800">{recordingStatus(r.ipa, PHONEME_CLIPS) === 'approved' ? '승인' : '대기'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-w-0 rounded-2xl border-2 border-gray-200 bg-white p-3">
        <p className="text-sm font-black text-gray-800">방언 메모 <span className="text-xs font-bold text-gray-500">(영국식 RP 기준)</span></p>
        <ul data-testid="phr-dialect" className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-700">
          {DIALECT_NOTES.map((t) => <li key={t} className="break-words">{t}</li>)}
        </ul>
      </section>
    </div>
  )
}
