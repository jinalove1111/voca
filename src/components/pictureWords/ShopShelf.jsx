// 가게 구경(250차): 8개 가게의 학습 가능한 물건을 보는 선반. 둘러보기 + 단어 연습 연결만. 마을 상점 코드와 무관하다. 저장·네트워크·보상 0.
import React, { useMemo, useState } from 'react'
import { shopSets } from '../../data/pictureWords/index.js'
import { rng, shuffled } from '../../utils/pictureWords/practice.js'
import { imgUrl } from './pictureImg.jsx'

const BTN = 'min-h-[44px] px-3 rounded-2xl font-black btn-press disabled:opacity-40'

export default function ShopShelf({ onPractice, onBack }) {
  const sets = useMemo(() => shopSets(), [])
  const [open, setOpen] = useState(null)
  const cur = sets.find((s) => s.shop === open)
  // 이 물건 + 같은 가게의 다른 단어 최대 5개 (세션 크기 ≤ 6)
  const withItem = (set, item) => [item, ...shuffled(set.words.filter((w) => w.id !== item.id), rng(Date.now() % 2147483647)).slice(0, 5)]
  return (
    <div data-testid="pws-root" className="space-y-3">
      <p className="text-center text-sm font-black text-purple-700">가게 구경</p>
      <p className="text-center text-xs text-gray-600">구매는 아직 열리지 않았어요. 구경하고 단어를 연습해 봐요.</p>
      <div className="grid grid-cols-2 gap-2">
        {sets.map((s) => (
          <button key={s.shop} type="button" data-testid={`pws-shop-${s.shop}`} data-open={open === s.shop ? 'true' : 'false'} onClick={() => setOpen(open === s.shop ? null : s.shop)}
            className={`${BTN} border-2 py-3 ${open === s.shop ? 'border-purple-500 bg-purple-50' : 'border-purple-200 bg-white'} text-purple-700`}>
            {s.labelKo}<span className="block text-xs font-bold text-gray-500">{s.ready ? `${s.words.length}개` : '준비 중'}</span>
          </button>
        ))}
      </div>
      {cur && (
        <div className="space-y-2 rounded-2xl bg-white p-3 card-shadow">
          <p className="font-black text-gray-800">{cur.labelKo} · {cur.labelEn}{cur.ready ? '' : ' (준비 중)'}</p>
          <button type="button" data-testid="pws-practice-all" disabled={!cur.ready} onClick={() => onPractice(cur.words)} className={`${BTN} w-full bg-purple-600 text-white`}>이 가게 전체 연습</button>
          <ul className="grid grid-cols-2 gap-2">
            {cur.words.map((w) => (
              <li key={w.id} data-testid={`pws-item-${w.asset}`} className="min-w-0 space-y-1 rounded-xl bg-gray-50 p-2 text-center">
                <img src={imgUrl(w.asset)} alt="" loading="lazy" draggable={false} className="mx-auto h-24 w-24 max-w-full object-contain" />
                <p className="font-black text-gray-900 break-words">{w.en}</p>
                <p className="text-xs text-gray-600 break-words">{w.ko}</p>
                <button type="button" data-testid={`pws-practice-${w.asset}`} disabled={!cur.ready} onClick={() => onPractice(withItem(cur, w))} className={`${BTN} w-full bg-sky-100 text-sm text-sky-700`}>단어 연습</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" data-testid="pws-back" onClick={onBack} className={`${BTN} w-full bg-gray-200 text-gray-700`}>뒤로</button>
    </div>
  )
}
