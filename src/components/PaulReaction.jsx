import { useEffect, useRef, useMemo, useState } from 'react'
import { resolveReaction } from '../utils/paulReactions'

// 요청 사양: 기본 표시 크기 180px, 모바일 140~180px, 태블릿 220px,
// object-fit: contain, width 지정 + height auto. size="sm"/"lg"는 이
// 기본 크기의 축소/확대 버전(퀴즈/쓰기 등 좁은 피드백 박스에 끼워 넣을
// 때는 sm, 레벨업 같은 큰 축하 팝업엔 lg).
const SIZE_CLASS = {
  sm: 'w-16 sm:w-20',
  md: 'w-[140px] sm:w-[180px] md:w-[220px]',
  lg: 'w-[200px] sm:w-[240px] md:w-[280px]',
}

// 폴 선생님(Project Paul 공식 마스코트) 리액션 표시 — CTO 설계 변경
// (2026-07-08)으로 개별 PNG Asset 방식만 사용함. 이미지가 없으면
// 이모지 등으로 대신 채우지 않고 콘솔 경고만 남기고 아무것도 그리지
// 않음 — "브랜드 캐릭터가 없으면 기능이 실패한 것으로 간주".
//
// 리액션 지정 방법 두 가지(둘 중 하나만 주면 됨):
//   - reaction={객체}: 부모가 이미 pickReaction()/resolveReaction()으로
//     직접 뽑아서 자기 상태에 들고 있는 경우(정답/오답 시점마다 정확히
//     한 번만 뽑혀야 하는 기존 화면들 — 퀴즈/쓰기/레벨업미션/미니게임/
//     단어학습이 전부 이 방식). 리렌더링돼도 절대 안 바뀜.
//   - type="success"(또는 "fail"/"thinking"/"levelup" 등): 이 컴포넌트가
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
export default function PaulReaction({ reaction: reactionProp, type, message, size = 'md', overlay = false, onDone, durationMs = 2000, muted = false }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolvedFromType = useMemo(() => (type ? resolveReaction(type) : null), [type])
  const reaction = reactionProp ?? resolvedFromType
  const doneRef = useRef(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!reaction) return
    doneRef.current = false
    setHidden(false)
    if (reaction.sound && !muted) {
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
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.md
  // message="" (명시적 빈 문자열)는 "메시지 없이 캐릭터만" 표시하라는
  // 뜻으로 취급 — undefined(prop 자체를 안 넘김)일 때만 reaction 기본
  // 메시지로 대체함. 그냥 `message || reaction.message`로 하면 빈 문자열도
  // falsy라 항상 기본 메시지로 덮어써져서 "메시지 숨기기"가 불가능해짐.
  const text = message !== undefined ? message : reaction.message

  // 이미지 로드 자체가 실패하는 경우(배포 경로 문제 등)는 이모지로
  // 대체하지 않고 조용히 숨김 + 콘솔 경고만 — "실패는 실패로 보이게".
  const face = (
    <img
      src={reaction.image}
      alt=""
      className={`${sizeClass} h-auto object-contain`}
      onError={(e) => {
        console.warn(`[Paul] 이미지 로드 실패: ${reaction.id} (${reaction.image})`)
        e.currentTarget.style.display = 'none'
      }}
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
