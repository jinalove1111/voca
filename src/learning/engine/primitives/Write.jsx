// src/learning/engine/primitives/Write.jsx — 상호작용 프리미티브 ⑥: 쓰기.
//
// "문장 따라 쓰기" 자가 확인 전용(설계 §8 — "쓰기(문장 따라 쓰기 — 채점
// 없음, checkAnswer 자가 확인만)"). 이 컴포넌트는 DB에 아무것도 쓰지
// 않는다(persistence 0). 결과는 onCheck 콜백으로만 상위(LearningEngine)에
// 전달되고, 그 결과로 저장/보상을 할지는 전적으로 호스트 화면의 몫이다
// (설계 §13.4 "엔진은 보상·저장을 모른다").
import { useState } from 'react'
import TextInput from './TextInput'

export default function Write({ item, grade, onCheck }) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(null) // null | true | false

  const handleCheck = () => {
    const ok = typeof grade === 'function' ? grade(value, item?.text) : null
    setChecked(ok)
    onCheck?.(ok)
  }

  return (
    <div className="learning-primitive learning-primitive-write flex flex-col gap-2">
      <TextInput value={value} onChange={setValue} onSubmit={handleCheck} placeholder="문장을 그대로 따라 써보세요" />
      <button
        type="button"
        onClick={handleCheck}
        className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 font-semibold"
      >
        확인
      </button>
      {checked === true ? <p className="text-sm text-emerald-600">잘 썼어요!</p> : null}
      {checked === false ? <p className="text-sm text-amber-600">원문과 다시 비교해보세요.</p> : null}
    </div>
  )
}
