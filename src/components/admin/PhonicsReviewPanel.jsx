// 관리자 전용 — PAUL PHONICS 검토 자료 (255차, 읽기 전용). 43개 Unit은 구조만 승인됐고 전부 임시다.
// 운영 DB·학생 기록·저장소·네트워크를 쓰지 않는다. 숫자는 데이터에서 그때그때 계산한다(하드코딩 없음).
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BOOKS, DIALECT_NOTES, GAME_NAME, STATUS_LABEL_KO, objectiveKo, prereqKo, recordableTargets, unitLabel } from '../../data/phonics/curriculum.js'
import { PHONICS_ITEMS } from '../../data/phonics/phonicsWords.js'
import { PHONEME_CLIPS, RECORDING_LIST, recordingStatus } from '../../data/phonics/phonemeClips.js'
import { RECORDINGS, recordingStatuses } from '../../data/phonics/recordings.js'
import { CANDIDATE_NOTE_KO, IMAGE_CANDIDATES } from '../../data/phonics/imageCandidates.js'
import { validateUpload } from '../../utils/phonics/recordingUpload.js'
import { learnedPairs, pairOf, reusedIpas, unitWords, wordDifficulty } from '../../utils/phonics/curriculum.js'

const MARK = { ready: '🖼', needed: '⏳', 'not-needed': '🔤' }
const MARK_TITLE = { ready: '그림 준비', needed: '제작 대기', 'not-needed': '그림 없이' }
const REVIEW_REASON = { jumper: '영국식 jumper = 미국식 sweater', rubber: '영국식 rubber = 미국식 eraser' }
const REVIEW_DEFAULT = '희귀·확인 필요 단어'
const REC_STATE = { missing: '파일 없음', uploaded: '승인 대기', approved: '승인' }
const FILTERS = [['all', '전체'], ['ready', '그림 준비'], ['needed', '제작 대기'], ['candidate', '기존 후보'], ['free', '그림 없이'], ['review', '검토 필요']]
const CAND_WORDS = new Set(IMAGE_CANDIDATES.map((c) => c.word))
const CHIP = 'rounded-full bg-purple-100 px-2 py-1 text-xs font-black text-purple-800'
const BTN = 'mr-1 min-h-[32px] rounded-full bg-purple-100 px-2 font-black text-purple-800 disabled:opacity-40'
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
    const where = new Map()
    for (const { b, u } of units) for (const w of unitWords(b.id, u.id)) if (!where.has(w.word)) where.set(w.word, `Book ${b.no} · Unit ${u.id.slice(1)}`)
    const by = (s) => PHONICS_ITEMS.filter((i) => i.image === s)
    const approved = RECORDING_LIST.filter((r) => recordingStatus(r.ipa) === 'approved').length
    const needed = by('needed')
    return { units, unlearned, where, review: PHONICS_ITEMS.filter((i) => i.needsReview), candidates: needed.filter((i) => CAND_WORDS.has(i.word)), newImages: needed.filter((i) => !CAND_WORDS.has(i.word)).length, ready: by('ready'), needed: by('needed').map((i) => i.word).sort(), free: by('not-needed').map((i) => i.word).sort(), approved }
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
          {words.map((w) => <span key={w.id} data-image={w.image} title={MARK_TITLE[w.image]} className="whitespace-nowrap">{MARK[w.image]} {w.word}{w.needsReview ? <span data-testid="phr-unit-review" title={REVIEW_REASON[w.word] || REVIEW_DEFAULT} className="ml-0.5 rounded bg-rose-100 px-1 font-black text-rose-700">⚠</span> : null}</span>)}
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

function CandidateSection({ list }) {
  return (
    <section data-testid="phr-candidates" className="min-w-0 rounded-2xl border-2 border-gray-200 bg-white p-3">
      <p className="text-sm font-black text-gray-800">기존 에셋 후보 <span data-testid="phr-candidates-count">{list.length}</span> <span className="text-xs font-bold text-gray-500">({CANDIDATE_NOTE_KO})</span></p>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {IMAGE_CANDIDATES.map((c) => (
          <li key={c.word} data-testid="phr-candidate" data-word={c.word} className="min-w-0 rounded-xl bg-gray-50 p-2 text-center text-xs text-gray-700">
            {c.url ? <img src={c.url} alt={c.word} draggable={false} className="mx-auto h-24 w-24 bg-white object-contain" /> : <p className="mx-auto flex h-24 w-24 items-center justify-center bg-white text-[10px] font-bold text-gray-500">마을 kit 그림 — 파일 경로만 표시</p>}
            <p className="mt-1 font-black text-gray-900">{c.word}</p>
            <p className="break-all text-[10px] text-gray-500">{c.source}</p>
            <p className="font-black text-rose-700">승인 필요 — 학생 화면에 사용 안 함</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function WordTable({ stats }) {
  const [filter, setFilter] = useState('all')
  const pass = { all: () => true, ready: (i) => i.image === 'ready', needed: (i) => i.image === 'needed', candidate: (i) => CAND_WORDS.has(i.word) && i.image === 'needed', free: (i) => i.image === 'not-needed', review: (i) => i.needsReview }[filter]
  const rows = PHONICS_ITEMS.filter(pass)
  return (
    <section className="min-w-0 rounded-2xl border-2 border-gray-200 bg-white p-3">
      <p className="text-sm font-black text-gray-800">단어 표 <span data-testid="phr-words-count">{rows.length}</span></p>
      <div data-testid="phr-filter" className="mt-2 flex flex-wrap gap-1">
        {FILTERS.map(([k, t]) => <button key={k} type="button" data-testid={`phr-filter-${k}`} aria-pressed={filter === k} onClick={() => setFilter(k)} className={`min-h-[36px] rounded-full px-3 text-xs font-black ${filter === k ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800'}`}>{t}</button>)}
      </div>
      <div className="mt-2 max-h-96 max-w-full overflow-auto">
        <table data-testid="phr-words" className="min-w-[44rem] border-collapse">
          <thead><tr>{['단어', 'Book·Unit', '철자 분해', '음가', '난이도', '그림 상태', '검토'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.word} data-testid="phr-word" data-word={i.word} data-image={i.image}>
                <td className={`${TD} font-black text-gray-900`}>{i.word}</td>
                <td className={`${TD} whitespace-nowrap`}>{stats.where.get(i.word)}</td>
                <td className={TD}>{i.graphemes.join(' · ')}</td>
                <td className={TD}>{i.phonemes.map((p) => `/${p}/`).join(' ')}</td>
                <td className={TD}>{wordDifficulty(i)}</td>
                <td className={`${TD} whitespace-nowrap`}>{MARK[i.image]} {MARK_TITLE[i.image]}{CAND_WORDS.has(i.word) && i.image === 'needed' ? ' (기존 후보)' : ''}</td>
                <td className={TD}>{i.needsReview ? <span data-testid="phr-word-review" className="rounded bg-rose-100 px-1 font-black text-rose-700">검토 필요 · {REVIEW_REASON[i.word] || REVIEW_DEFAULT}</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const recs = recordingStatuses([])
// Preview only: a chosen file lives in memory as an object URL (revoked on replace/unmount). Nothing is saved, uploaded or played for students.
const VERDICT = { pending: '검수 대기', approved: '승인(미리보기)', rejected: '반려(미리보기)' }
function RecordingPreview() {
  const [f, setF] = useState({})
  const urls = useRef({})
  useEffect(() => () => Object.values(urls.current).forEach((u) => URL.revokeObjectURL(u)), [])
  const set = (id, patch) => setF((o) => ({ ...o, [id]: { ...o[id], ...patch } }))
  const pick = (id, file) => {
    if (urls.current[id]) URL.revokeObjectURL(urls.current[id])
    if (!file) { delete urls.current[id]; setF((o) => ({ ...o, [id]: undefined })); return }
    urls.current[id] = URL.createObjectURL(file)
    set(id, { url: urls.current[id], name: file.name, size: file.size, type: file.type, duration: undefined, verdict: 'pending' })
  }
  const res = (r) => (f[r.id] ? validateUpload(f[r.id], r) : null)
  const all = RECORDINGS.map((r) => ({ r, v: res(r) }))
  const chosen = all.filter((x) => x.v)
  return (
    <div data-testid="phr-rec-preview" className="mt-2">
      <p data-testid="phr-rec-notice" className="rounded-xl bg-rose-50 p-2 text-xs font-black text-rose-800">Preview 전용 — 선택한 파일은 이 브라우저 메모리에만 있고 저장·업로드되지 않습니다. 새로고침하면 사라지며 학생 화면에는 적용되지 않습니다.</p>
      <p className="mt-2 text-xs font-bold text-gray-700"><span data-testid="phr-rec-real">실제 등록 0 / 42 · 승인 0 / 42</span> · <span data-testid="phr-rec-preview-summary">선택 {chosen.length} · 검증 통과 {chosen.filter((x) => x.v.ok).length} · 승인(미리보기) {chosen.filter((x) => x.v.ok && f[x.r.id].verdict === 'approved').length}</span></p>
      <div className="mt-2 max-h-96 max-w-full overflow-auto">
        <table data-testid="phr-recordings" className="min-w-[56rem] border-collapse">
          <thead><tr>{['no', 'id', '소리', '대표 철자', '예시 단어', '파일 이름 규칙', '상태', '미리보기'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {all.map(({ r, v }, n) => {
              const x = f[r.id]
              return (
                <tr key={r.id} data-testid="phr-recording" data-ipa={r.ipa} data-status={recs[n].status}>
                  <td className={TD}>{r.no}</td><td className={`${TD} font-mono`}>{r.id}</td><td className={`${TD} font-black text-gray-900`}>/{r.ipa}/</td>
                  <td className={TD}>{r.grapheme}</td><td className={TD}>{r.exampleWord}</td>
                  <td className={`${TD} font-mono`}>{r.fileBase}.mp3</td>
                  <td className={`${TD} whitespace-nowrap`}><span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-800">{REC_STATE[recs[n].status]}</span></td>
                  <td data-testid="phr-rec-row" className={TD}>
                    <input type="file" data-testid={`phr-rec-file-${r.id}`} accept=".mp3,.m4a,.wav" aria-label={`${r.id} 파일`} onChange={(e) => pick(r.id, e.target.files[0])} className="max-w-[10rem] text-xs" />
                    {x ? (
                      <div data-testid={`phr-rec-result-${r.id}`} data-ok={v.ok} className="mt-1 space-y-1">
                        <audio src={x.url} preload="metadata" onLoadedMetadata={(e) => set(r.id, { duration: e.currentTarget.duration })} onError={() => set(r.id, { duration: null })} />
                        {v.errors.map((m) => <p key={m} className="font-black text-rose-700">{m}</p>)}
                        {v.warnings.map((m) => <p key={m} className="font-black text-amber-700">{m}</p>)}
                        <button type="button" data-testid={`phr-rec-play-${r.id}`} disabled={!v.ok} onClick={(e) => e.currentTarget.parentNode.querySelector('audio').play()} className={BTN}>재생</button>
                        <span data-testid={`phr-rec-verdict-${r.id}`} className="mx-1 font-black">{VERDICT[v.ok ? x.verdict : 'pending']}</span>
                        {['approved', 'rejected'].map((k) => <button key={k} type="button" data-testid={`phr-rec-${k}-${r.id}`} disabled={!v.ok} onClick={() => set(r.id, { verdict: k })} className={BTN}>{VERDICT[k]}</button>)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


export default function PhonicsReviewPanel() {
  const s = useStats()
  const chips = [
    ['unit', `Unit ${s.units.length}`], ['approved', `승인 ${s.units.filter(({ u }) => u.status === 'approved').length}`], ['words', `단어 ${PHONICS_ITEMS.length}`],
    ['ready', `그림 준비 ${s.ready.length}`], ['newimg', `새 이미지 제작 ${s.newImages}`], ['cand', `기존 에셋 후보 ${s.candidates.length}`], ['review', `검토 필요 단어 ${s.review.length}`], ['needed', `이미지 제작 대기 ${s.needed.length}`], ['free', `그림 없이 학습 ${s.free.length}`],
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

      <CandidateSection list={s.candidates} />
      <WordTable stats={s} />

      <section className="min-w-0 rounded-2xl border-2 border-gray-200 bg-white p-3">
        <p className="text-sm font-black text-gray-800">녹음 필요 <span data-testid="phr-recordings-count">{RECORDINGS.length}</span> <span className="text-xs font-bold text-gray-500">(소리 하나는 음성 합성으로 읽지 않습니다)</span></p>
        <RecordingPreview />
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
