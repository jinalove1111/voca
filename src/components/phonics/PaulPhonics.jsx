// PAUL PHONICS (폴 파닉스) 진입 화면 (254차, 테스터 전용): 책장(5권) → Book(Unit 목록) → Unit 허브 → 게임 세션.
// 화면 위치와 이번 방문의 기록(phonicsAttempt)은 React state뿐 — 저장·네트워크·보상 0. Unit과 단어 목록은 아직 운영자 승인 전 임시 구성이다.
import React, { useState } from 'react'
import { BOOKS, STATUS_LABEL_KO, bookById, unitLabel, unitsOf } from '../../data/phonics/curriculum.js'
import { unitWords } from '../../utils/phonics/curriculum.js'
import { GameStyle, MUTED, T2, W } from '../pictureWords/pictureImg.jsx'
import PhonicsAdventure from './PhonicsAdventure.jsx'
import PhonicsProgress from './PhonicsProgress.jsx'
import UnitHub, { BTN } from './UnitHub.jsx'

const GRAY = `${BTN} ${W.gray}`
export const DRAFT_NOTICE_KO = '기본 구조만 승인된 임시 교육과정입니다 — 단어·소리·그림·녹음은 승인 전입니다'
// 책 표지 색(분홍/민트/하늘/노랑/연보라) — 순수 CSS로 그린 표지와 책등
const COVER = {
  b1: 'border-pink-400 bg-pink-50',
  b2: 'border-emerald-400 bg-emerald-50',
  b3: 'border-sky-400 bg-sky-50',
  b4: 'border-yellow-400 bg-yellow-50',
  b5: 'border-purple-400 bg-purple-50',
}

function Main({ onOpen, onProgress, onExit }) {
  return (
    <div data-testid="pph-main" className="space-y-3">
      <div className="text-center">
        <p className={T2}>PAUL PHONICS · 폴 파닉스</p>
        <p data-testid="pph-draft-notice" className="mt-1 rounded-2xl bg-amber-50 p-2 text-sm font-bold text-amber-800">{DRAFT_NOTICE_KO}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {BOOKS.map((b) => {
          const n = unitWords(b.id, 'review').length
          return (
            <button key={b.id} type="button" data-testid={`pph-book-${b.id}`} onClick={() => onOpen(b.id)}
              className={`min-h-[120px] min-w-0 break-words rounded-xl border-l-[14px] p-3 text-left shadow btn-press ${COVER[b.id]}`}>
              <span className="block text-xs font-black text-gray-500">Book {b.no}</span>
              <span className="block text-base font-black leading-tight text-gray-900">{b.titleEn}</span>
              <span className="block text-sm font-bold text-gray-700">{b.titleKo}</span>
              <span className="mt-1 block text-xs font-bold text-gray-600">Unit {b.units.length}개 · {n ? `단어 ${n}개` : '단어 준비 중'}</span>
            </button>
          )
        })}
      </div>
      <button type="button" data-testid="pph-open-progress" onClick={onProgress} className={`${BTN} w-full bg-sky-100 text-sky-800`}>나의 학습 발달상황 (샘플)</button>
      <button type="button" data-testid="pph-exit" onClick={onExit} className={GRAY}>나가기</button>
    </div>
  )
}

function Book({ bookId, onOpen, onBack }) {
  const book = bookById(bookId)
  const row = (id, label, targets, status, difficulty) => {
    const words = unitWords(bookId, id)
    const n = words.length
    const pics = words.filter((w) => w.image === 'ready').length
    return (
      <button key={id} type="button" data-testid={`pph-unit-${id}`} data-words={n} data-pictures={pics} onClick={() => onOpen(id)} className="flex min-h-[56px] w-full items-center gap-2 rounded-2xl border-2 border-purple-200 bg-white p-3 text-left btn-press">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-black text-gray-800">{label}</span>
          <span className="block break-words text-sm font-bold text-pink-600">{targets}</span>
          <span data-testid={`pph-unit-${id}-count`} className="block text-xs font-bold text-gray-600">{n ? `단어 ${n}개` : '단어 준비 중'}</span>
          {n > 0 && <span data-testid={`pph-unit-${id}-media`} className={`block ${MUTED}`}>그림 {pics} · 듣기 {n - pics}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span data-testid={`pph-unit-${id}-badge`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">{STATUS_LABEL_KO[status]}</span>
          {difficulty > 0 && <span data-testid="pph-unit-difficulty" data-level={difficulty} aria-label={`난이도 ${difficulty}`} className="text-xs font-black text-purple-500">{'●'.repeat(difficulty)}{'○'.repeat(3 - difficulty)}</span>}
        </span>
      </button>
    )
  }
  const unitRow = (u) => row(u.id, `Unit ${u.id.slice(1)}`, unitLabel(u), u.status, u.difficulty)
  const units = unitsOf(bookId, { includeDraft: true })
  return (
    <div data-testid="pph-book" data-book={bookId} className="space-y-3">
      <div className={`rounded-xl border-l-[14px] p-3 ${COVER[bookId]}`}>
        <p className="text-xs font-black text-gray-500">Book {book.no}</p>
        <p className="text-xl font-black text-gray-900">{book.titleEn} · {book.titleKo}</p>
        <p className="text-xs font-bold text-amber-800">{DRAFT_NOTICE_KO}</p>
      </div>
      {book.notes.map((t, i) => <p key={i} data-testid="pph-book-note" className="rounded-2xl bg-sky-50 p-2 text-sm font-bold text-sky-800">{t}</p>)}
      <div className="space-y-2">
        {book.groups
          ? book.groups.map((g) => (
            <div key={g.id} data-testid={`pph-group-${g.id}`} className="space-y-2">
              <p className="pt-1 text-sm font-black text-purple-700">{g.titleKo}</p>
              {units.filter((u) => g.unitIds.includes(u.id)).map(unitRow)}
            </div>
          ))
          : units.map(unitRow)}
        {row('review', 'Book 전체 연습', `Book ${book.no} 전체`, 'draft', 0)}
      </div>
      <button type="button" data-testid="pph-back" onClick={onBack} className={GRAY}>책장으로 돌아가기</button>
    </div>
  )
}

export default function PaulPhonics({ studentId, onExit, onPractice, onTest, onGame }) {
  const [nav, setNav] = useState({ screen: 'main' }) // main | book | unit | session | progress
  const [records, setRecords] = useState([])
  const [seen, setSeen] = useState([]) // 이 방문에서 열어 본 단계(소개·연습 등) — 기록이 남지 않는 단계의 "오늘 했어요" 표시용
  const toUnit = () => setNav({ screen: 'unit', bookId: nav.bookId, unitId: nav.unitId })
  let body
  if (nav.screen === 'session') {
    body = <PhonicsAdventure key={nav.key} game={nav.game} items={nav.items} ctx={nav.ctx} studentId={studentId} onRecord={(r) => setRecords((x) => [...x, r])} onBack={toUnit}
      onStart={(game, items, ctx) => setNav({ ...nav, game, items, ctx, key: Date.now() })} onNext={(run) => { toUnit(); run() }} />
  } else if (nav.screen === 'unit') {
    body = <UnitHub bookId={nav.bookId} unitId={nav.unitId} records={records} seen={seen} onSeen={(k) => setSeen((s) => (s.includes(k) ? s : [...s, k]))} onBack={() => setNav({ screen: 'book', bookId: nav.bookId })}
      onSession={(game, items, ctx) => setNav({ ...nav, screen: 'session', game, items, ctx, key: Date.now() })} onPractice={onPractice} onTest={onTest} onGame={onGame} />
  } else if (nav.screen === 'book') {
    body = <Book bookId={nav.bookId} onOpen={(unitId) => setNav({ screen: 'unit', bookId: nav.bookId, unitId })} onBack={() => setNav({ screen: 'main' })} />
  } else if (nav.screen === 'progress') {
    body = <PhonicsProgress onBack={() => setNav({ screen: 'main' })} />
  } else {
    body = <Main onOpen={(bookId) => setNav({ screen: 'book', bookId })} onProgress={() => setNav({ screen: 'progress' })} onExit={onExit} />
  }
  return (
    <div data-testid="pph-root" data-screen={nav.screen} className="space-y-3">
      <GameStyle />
      {body}
    </div>
  )
}
