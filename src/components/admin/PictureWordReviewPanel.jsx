// 관리자 전용 — 그림 단어 승인 검토(248차). 운영 DB·단어 데이터·학생 기록을 읽거나 쓰지 않는다.
// 결정은 이 브라우저의 localStorage에만 저장된다. 네트워크 0, 보상 호출 0.
import React, { useMemo, useState } from 'react'
import { PICTURE_WORDS, COUNTS, SHOP_LABEL_KO, byStatus, phonicsGroups, shopGroups, reuseSummary, applyDecisions } from '../../data/pictureWords/index.js'

const IMG = import.meta.glob('../../assets/pictureWords/*.webp', { eager: true, query: '?url', import: 'default' })
const imgUrl = (asset) => IMG[`../../assets/pictureWords/${asset}.webp`]

const KEY = 'paulEasyVoca_pictureWordReview'
const loadDecisions = () => {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null')
    return o && o.v === 1 && o.decisions && typeof o.decisions === 'object' ? o.decisions : {}
  } catch { return {} }
}
const saveDecisions = (decisions) => {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, decisions })) } catch { /* 저장 실패는 화면 상태로만 유지 */ }
}

const STATUS_KO = { MISMATCH: '불일치', UNCERTAIN: '불확실', MULTIPLE: '여러 개', UNUSABLE: '사용 불가', MATCH: '일치' }
const STATUS_CLS = { MISMATCH: 'bg-red-100 text-red-700', UNCERTAIN: 'bg-yellow-100 text-yellow-800', MULTIPLE: 'bg-blue-100 text-blue-700', UNUSABLE: 'bg-gray-200 text-gray-700', MATCH: 'bg-green-100 text-green-700' }
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const btn = 'min-h-[44px] px-3 rounded-xl font-black text-sm btn-press border-2'

function Card({ e, decision, onSave, onReset }) {
  const [editing, setEditing] = useState(false)
  const [en, setEn] = useState(decision?.en ?? e.en)
  const [ko, setKo] = useState(decision?.ko ?? e.ko)
  const state = decision?.action || 'none'
  const unusable = e.status === 'UNUSABLE'
  const approve = () => { onSave(e.id, editing ? { action: 'approve', en: en.trim(), ko: ko.trim() } : { action: 'approve' }); setEditing(false) }
  return (
    <div data-testid={`pwr-card-${e.asset}`} data-status={e.status} data-decision={state}
      className={`bg-white rounded-2xl border-2 p-3 min-w-0 ${state === 'approve' ? 'border-green-400' : state === 'exclude' ? 'border-gray-300 opacity-70' : 'border-gray-200'}`}>
      <div className="flex gap-3 min-w-0">
        <img data-testid={`pwr-img-${e.asset}`} src={imgUrl(e.asset)} alt={e.shown} loading="lazy" className="w-20 h-20 shrink-0 object-contain bg-gray-50 rounded-xl" />
        <div className="min-w-0 flex-1 text-sm break-words">
          <span className={`inline-block text-xs font-black px-2 py-0.5 rounded-full ${STATUS_CLS[e.status]}`}>{STATUS_KO[e.status]} · {e.status}</span>
          <p className="text-xs text-gray-400 mt-1">기존 파일명: {e.sourceFile}</p>
          <p className="font-black text-gray-800 mt-1">추천 단어: {decision?.en || e.en}{e.enUS ? <span className="font-bold text-gray-500"> (미국식 {e.enUS})</span> : null}</p>
          <p className="text-gray-700">한국어 뜻: {decision?.ko || e.ko}</p>
        </div>
      </div>
      <p className="text-xs text-gray-600 mt-2 break-words">그림 설명: {e.shown}</p>
      <p className="text-xs text-gray-600 break-words">판단 근거: {e.reason}</p>
      <p className="text-[11px] text-gray-400 mt-1">그림: 직접 열어 확인 · 뜻/카테고리/미국식: 추론 · 기존 단어 대조: 문자열 비교</p>
      {editing && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input data-testid={`pwr-en-${e.asset}`} value={en} onChange={(ev) => setEn(ev.target.value)} aria-label="영어 단어" className="min-h-[44px] min-w-0 border-2 border-gray-200 rounded-xl px-2 text-sm" />
          <input data-testid={`pwr-ko-${e.asset}`} value={ko} onChange={(ev) => setKo(ev.target.value)} aria-label="한국어 뜻" className="min-h-[44px] min-w-0 border-2 border-gray-200 rounded-xl px-2 text-sm" />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {!unusable && <button data-testid={`pwr-approve-${e.asset}`} onClick={approve} className={`${btn} bg-green-500 text-white border-green-500`}>승인</button>}
        {!unusable && <button data-testid={`pwr-edit-${e.asset}`} onClick={() => setEditing((v) => !v)} className={`${btn} bg-white text-purple-600 border-purple-300`}>단어 수정</button>}
        <button data-testid={`pwr-exclude-${e.asset}`} onClick={() => { onSave(e.id, { action: 'exclude' }); setEditing(false) }} className={`${btn} bg-white text-red-600 border-red-300`}>제외</button>
        <button data-testid={`pwr-reset-${e.asset}`} onClick={() => { onReset(e.id); setEditing(false); setEn(e.en); setKo(e.ko) }} className={`${btn} bg-white text-gray-600 border-gray-300`}>보류</button>
      </div>
    </div>
  )
}

function ReviewTab({ decisions, onSave, onReset, onClear }) {
  const [statusF, setStatusF] = useState('ALL')
  const [decF, setDecF] = useState('ALL')
  const [confirmClear, setConfirmClear] = useState(false)
  const [exportText, setExportText] = useState('')
  const [copied, setCopied] = useState('')
  const doubtful = useMemo(() => PICTURE_WORDS.filter((e) => ['MISMATCH', 'UNCERTAIN', 'MULTIPLE'].includes(e.status)), [])
  const unusable = byStatus('UNUSABLE')
  const applied = useMemo(() => applyDecisions(doubtful, decisions), [doubtful, decisions])
  const n = (d) => applied.filter((e) => e.decision === d).length
  const approved = n('approve'), excluded = n('exclude'), pending = doubtful.length - approved - excluded
  const shown = doubtful.filter((e) => (statusF === 'ALL' || e.status === statusF) &&
    (decF === 'ALL' || (decisions[e.id]?.action || 'pending') === decF))
  const doExport = async () => {
    const text = JSON.stringify({ v: 1, decisions }, null, 2)
    setExportText(text)
    try { await navigator.clipboard.writeText(text); setCopied('복사했습니다.') } catch { setCopied('복사 권한이 없어 아래 텍스트를 직접 복사하세요.') }
  }
  const chip = (cur, set, v, label, tid) => (
    <button key={v} data-testid={tid} onClick={() => set(v)} className={`min-h-[44px] px-3 rounded-full text-xs font-black border-2 ${cur === v ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-500 border-gray-200'}`}>{label}</button>
  )
  return (
    <div>
      <div className="flex gap-3 text-sm font-black mb-2" aria-live="polite">
        <span className="text-green-600">승인 <span data-testid="pwr-count-approved">{approved}</span></span>
        <span className="text-red-600">제외 <span data-testid="pwr-count-excluded">{excluded}</span></span>
        <span className="text-gray-600">남음 <span data-testid="pwr-count-pending">{pending}</span></span>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {[['ALL', '전체'], ['MISMATCH', '불일치'], ['UNCERTAIN', '불확실'], ['MULTIPLE', '여러 개']].map(([v, l]) => chip(statusF, setStatusF, v, l, `pwr-fs-${v}`))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {[['ALL', '결정 전체'], ['pending', '남음'], ['approve', '승인'], ['exclude', '제외']].map(([v, l]) => chip(decF, setDecF, v, l, `pwr-fd-${v}`))}
      </div>
      <div className="space-y-3">
        {shown.map((e) => <Card key={e.id} e={e} decision={decisions[e.id]} onSave={onSave} onReset={onReset} />)}
        {shown.length === 0 && <p className="text-sm text-gray-400 text-center py-4">조건에 맞는 항목이 없습니다.</p>}
      </div>
      <h3 className="font-black text-gray-700 mt-5 mb-2">사용 불가 ({unusable.length})</h3>
      <div className="space-y-3">{unusable.map((e) => <Card key={e.id} e={e} decision={decisions[e.id]} onSave={onSave} onReset={onReset} />)}</div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button data-testid="pwr-export" onClick={doExport} className={`${btn} bg-purple-500 text-white border-purple-500`}>내보내기 복사</button>
        {!confirmClear
          ? <button data-testid="pwr-clear" onClick={() => setConfirmClear(true)} className={`${btn} bg-white text-red-600 border-red-300`}>전체 초기화</button>
          : <span className="flex flex-wrap items-center gap-2 text-sm"><span className="font-bold text-red-600">저장된 결정을 모두 지울까요?</span>
              <button data-testid="pwr-clear-confirm" onClick={() => { onClear(); setConfirmClear(false); setExportText('') }} className={`${btn} bg-red-500 text-white border-red-500`}>지우기</button>
              <button data-testid="pwr-clear-cancel" onClick={() => setConfirmClear(false)} className={`${btn} bg-white text-gray-600 border-gray-300`}>취소</button></span>}
      </div>
      {copied && <p className="text-xs text-gray-500 mt-1">{copied}</p>}
      {exportText && <textarea data-testid="pwr-export-text" readOnly value={exportText} rows={8} className="w-full mt-2 border-2 border-gray-200 rounded-xl p-2 text-xs font-mono" />}
    </div>
  )
}

function Thumb({ e }) {
  return (
    <div className="w-[72px] text-center">
      <img src={imgUrl(e.asset)} alt={e.shown} loading="lazy" className="w-[72px] h-[72px] object-contain bg-gray-50 rounded-lg" />
      <p className="text-[11px] font-bold text-gray-700 break-words">{e.en}</p>
      <p className="text-[10px] text-gray-400 break-words">{e.ko}</p>
    </div>
  )
}

function ResultTab() {
  const reuse = reuseSummary()
  const groups = phonicsGroups()
  return (
    <div className="space-y-5 text-sm">
      <section className="bg-white rounded-2xl p-3 border-2 border-gray-200">
        <h3 className="font-black text-gray-800 mb-1">요약</h3>
        <p>전체 {COUNTS.total}장 · 일치 {COUNTS.byStatus.MATCH} · 불일치 {COUNTS.byStatus.MISMATCH} · 불확실 {COUNTS.byStatus.UNCERTAIN} · 여러 개 {COUNTS.byStatus.MULTIPLE} · 사용 불가 {COUNTS.byStatus.UNUSABLE}</p>
        <p className="text-xs text-gray-600 mt-1"><b>직접 확인</b> = 그림을 직접 열어 본 것(그림 내용). <b>추론</b> = 뜻·카테고리·미국식·파닉스 그룹처럼 그림과 철자에서 추정한 값. 기존 단어 대조는 문자열 비교.</p>
      </section>
      <section>
        <h3 className="font-black text-gray-800 mb-1">Phonics {COUNTS.phonics}</h3>
        <p data-testid="pwr-phonics-order-notice" className="text-xs font-bold text-red-600 bg-red-50 rounded-lg px-2 py-1 mb-2">학습 순서 미확정 — 커리큘럼 확인 필요(임의 순서 아님)</p>
        <div className="space-y-2">
          {groups.map(({ group, items }) => (
            <div key={group} data-testid={`pwr-phonics-group-${slug(group)}`} className="bg-white rounded-2xl p-2 border-2 border-gray-200">
              <p className="font-black text-gray-700 mb-1">{group} ({items.length})</p>
              <div className="flex flex-wrap gap-2">
                {items.map((e) => (
                  <div key={e.id} className="w-[104px] min-w-0 text-center">
                    <img src={imgUrl(e.asset)} alt={e.shown} loading="lazy" className="w-16 h-16 mx-auto object-contain bg-gray-50 rounded-lg" />
                    <p className="text-xs font-black text-gray-800 break-words">{e.en}</p>
                    <p className="text-[10px] text-gray-500 break-words">{e.phonics.pattern} · {e.phonics.ipa}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="font-black text-gray-800 mb-1">Picture Vocabulary (일치 {COUNTS.byStatus.MATCH}, 샵 8종)</h3>
        <div className="space-y-2">
          {shopGroups().map(({ shop, items }) => (
            <div key={shop} data-testid={`pwr-shop-${shop}`} className="bg-white rounded-2xl p-2 border-2 border-gray-200">
              <p className="font-black text-gray-700 mb-1">{SHOP_LABEL_KO[shop]} · {shop} ({items.length})</p>
              <div className="flex flex-wrap gap-2">{items.map((e) => <Thumb key={e.id} e={e} />)}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-white rounded-2xl p-3 border-2 border-gray-200">
        <h3 className="font-black text-gray-800 mb-1">기존 단어 재사용 <span data-testid="pwr-reuse-count">{reuse.existing.length}</span> / 신규 등록 후보 <span data-testid="pwr-new-count">{reuse.newCandidates.length}</span></h3>
        <p className="text-xs text-gray-500 mb-1">일치 항목 기준. 승인 필요 {reuse.pendingApproval}장은 승인 후 별도 분류.</p>
        <p className="text-xs font-bold text-gray-700">재사용: <span className="font-normal break-words">{reuse.existing.map((e) => `${e.en}→${e.existingWord}`).join(', ')}</span></p>
        <p className="text-xs font-bold text-gray-700 mt-1">신규 후보: <span className="font-normal break-words">{reuse.newCandidates.map((e) => e.en).join(', ')}</span></p>
      </section>
      <section className="bg-gray-50 rounded-2xl p-3 border-2 border-dashed border-gray-300">
        <h3 className="font-black text-gray-800 mb-1">학습 흐름 <span className="text-xs text-red-600">설계 — 미구현</span></h3>
        <p>그림 보기 → 영국식 발음 듣기 → 따라 말하기 → 그림 보고 단어 맞히기 → 복습</p>
      </section>
    </div>
  )
}

export default function PictureWordReviewPanel() {
  const [tab, setTab] = useState('review')
  const [decisions, setDecisions] = useState(loadDecisions)
  const commit = (next) => { setDecisions(next); saveDecisions(next) }
  const onSave = (id, d) => commit({ ...decisions, [id]: { ...d, at: Date.now() } })
  const onReset = (id) => { const { [id]: _drop, ...rest } = decisions; commit(rest) }
  const tabBtn = (k, l) => (
    <button key={k} data-testid={`pwr-tab-${k}`} onClick={() => setTab(k)} className={`min-h-[44px] flex-1 rounded-xl font-black text-sm border-2 ${tab === k ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-500 border-gray-200'}`}>{l}</button>
  )
  return (
    <div data-testid="pwr-root" className="min-w-0 overflow-x-hidden">
      <p data-testid="pwr-local-notice" className="text-xs font-bold text-blue-700 bg-blue-50 rounded-xl px-3 py-2 mb-3">이 브라우저에만 저장됩니다. 운영 DB·단어 데이터·학생 기록은 바뀌지 않습니다.</p>
      <div className="flex gap-2 mb-3">{tabBtn('review', '승인 필요')}{tabBtn('result', '분류 결과')}</div>
      {tab === 'review' ? <ReviewTab decisions={decisions} onSave={onSave} onReset={onReset} onClear={() => commit({})} /> : <ResultTab />}
    </div>
  )
}
