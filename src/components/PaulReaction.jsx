import { useEffect, useRef, useState, useMemo } from 'react'
import { resolveReaction } from '../utils/paulReactions'

const SIZE_PX = { sm: 56, md: 96, lg: 144 }

// 폴 선생님(Project Paul 공식 마스코트) 리액션 표시 — assets/paul/*.png
// (투명 배경)가 준비되면 자동으로 그 이미지를 쓰고, 아직 없거나 로드에
// 실패하면 큰 이모지로 조용히 대체됨(onError fallback) — 관리자가 나중에
// PNG만 /public/assets/paul/에 추가해도 이 컴포넌트는 코드 수정 없이
// 바로 반영됨.
//
// 리액션 지정 방법 두 가지(둘 중 하나만 주면 됨):
//   - reaction={객체}: 부모가 이미 pickReaction()/resolveReaction()으로
//     직접 뽑아서 자기 상태에 들고 있는 경우(정답/오답 시점마다 정확히
//     한 번만 뽑혀야 하는 기존 화면들 — 퀴즈/쓰기/레벨업미션/미니게임/
//     단어학습이 전부 이 방식). 리렌더링돼도 절대 안 바뀜.
//   - type="success"(또는 "retry"/"thinking"/"levelup" 등): 이 컴포넌트가
//     마운트되는 시점에 한 번 resolveReaction(type)으로 알아서 랜덤(또는
//     정확한 id) 리액션을 고름 — <PaulReaction type="success" /> 처럼
//     바로 쓸 수 있는 간단한 방식. 주의: type 문자열이 같은 채로 계속
//     떠 있으면(리마운트 없이) 다시 안 뽑힘 — 매번 새로 뽑히게 하려면
//     호출부에서 key를 바꿔 새로 마운트시킬 것(예: key={answerId}).
//
// 두 가지 표시 모드:
//   - overlay(기본 false): 레벨업/별 획득/트로피처럼 화면 전체를 잠깐
//     덮는 큰 축하 팝업. 2초 후 자동으로 사라지고(onDone), 탭하면 바로
//     사라짐(즉시 onDone).
//   - inline(overlay=false): 퀴즈/쓰기/미니게임처럼 이미 화면 안에 정답·
//     오답 피드백 박스가 있는 곳에 폴 캐릭터+메시지만 끼워 넣는 모드.
//     자체 타이머가 없음 — 각 화면이 이미 갖고 있는 "몇 초 후 다음 문제로"
//     타이밍을 그대로 따르고, 폴은 그 안에 얹히는 시각 요소일 뿐임(같은
//     피드백에 대해 화면마다 서로 다른 두 개의 타이머가 경쟁하는 걸 피함).
export default function PaulReaction({ reaction: reactionProp, type, message, size = 'md', overlay = false, onDone, durationMs = 2000 }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolvedFromType = useMemo(() => (type ? resolveReaction(type) : null), [type])
  const reaction = reactionProp ?? resolvedFromType
  const [imgFailed, setImgFailed] = useState(false)
  const [hidden, setHidden] = useState(false)
  const doneRef = useRef(false)

  useEffect(() => {
    if (!reaction) return
    doneRef.current = false
    setImgFailed(false)
    setHidden(false)
    if (reaction.sound) {
      const a = new Audio(reaction.sound)
      a.volume = 0.75
      a.play()?.catch(() => {})
    }
    if (!overlay) return
    const t = setTimeout(finish, durationMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction, overlay])

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone?.()
  }

  const dismissNow = () => {
    setHidden(true)
    finish()
  }

  if (!reaction || hidden) return null
  const px = SIZE_PX[size] || SIZE_PX.md
  // message="" (명시적 빈 문자열)는 "메시지 없이 캐릭터만" 표시하라는
  // 뜻으로 취급 — undefined(prop 자체를 안 넘김)일 때만 reaction 기본
  // 메시지로 대체함. 그냥 `message || reaction.message`로 하면 빈 문자열도
  // falsy라 항상 기본 메시지로 덮어써져서 "메시지 숨기기"가 불가능해짐.
  const text = message !== undefined ? message : reaction.message

  const face = imgFailed ? (
    <span style={{ fontSize: px * 0.6, lineHeight: 1 }}>{reaction.emoji}</span>
  ) : (
    <img
      src={reaction.image}
      alt=""
      style={{ width: px, height: px }}
      className="object-contain"
      onError={() => setImgFailed(true)}
    />
  )

  if (!overlay) {
    return (
      <div className="flex flex-col items-center gap-1 animate-paul-pop">
        {face}
        {text && <p className="font-black text-current text-center">{text}</p>}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" role="status" aria-live="polite">
      <button
        onClick={dismissNow}
        className="pointer-events-auto bg-white rounded-3xl card-shadow px-8 py-6 flex flex-col items-center gap-2 animate-paul-pop btn-press"
      >
        {face}
        {text && <p className="font-black text-gray-700 text-lg text-center">{text}</p>}
      </button>
    </div>
  )
}
