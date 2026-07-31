// src/learning/engine/LearningEngine.jsx — 제네릭 러너(모드별 페이지 없음,
// docs/CURRICULUM_ENGINE.md §13.2 "③ 상호작용 프리미티브"/§13.4).
//
// registry.js에서 mode 설정을 조회해 프리미티브 파이프라인을 렌더링하고,
// 결과는 onEvent로만 방출한다. 어떤 콘텐츠 타입(단어/예문/문장)이든
// adapters/learningItem.js가 정규화한 LearningItem만 알면 된다 — 원본
// 테이블을 모른다(설계 §13.2 "모드는 테이블을 모른다"와 대칭).
//
// ⚠️ 보상/저장 격리(설계 §13.4, 저장소 헌법 규칙 1/12 — 명시적 확인 주석):
// 이 파일은 useStudent를 import하지 않고, 별/XP/정원/퀴즈 카운터 지급이나
// 어떤 DB 쓰기도 하지 않는다. onEvent({type:'result'|'complete', ...})만
// 방출하고, 그 결과를 저장할지/보상할지는 전적으로 호스트 화면(예: 후속
// 커밋에서 WordDetail 예문 단계)의 몫이다 — 같은 모드가 연습(보상 없음)과
// 퀴즈(보상 있음) 양쪽에서 안전하게 재사용되는 이유가 이 격리다.
//
// 결정론: Math.random()을 쓰지 않는다. seed prop은 향후 셔플이 필요한 모드
// (예: multiple_choice)를 위해 미리 받아두는 자리이고, Phase 0 모드 5종은
// 셔플을 쓰지 않는다(fill_blank의 makeFillBlank는 첫 whole-word 매치만
// 결정론적으로 치환).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MODES } from './registry'
import Show from './primitives/Show'
import AudioPlay from './primitives/AudioPlay'
import TextInput from './primitives/TextInput'
import Record from './primitives/Record'
import Write from './primitives/Write'

export default function LearningEngine({ mode, item, options = {}, seed, onEvent, renderRecorder }) {
  const modeConfig = MODES[mode]

  const [inputValue, setInputValue] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lastResult, setLastResult] = useState(null) // null | true | false
  const [done, setDone] = useState(false)

  // 아이템/모드/시드가 바뀌면(다음 단어·다음 문제로 이동) 내부 진행 상태를
  // 전부 리셋한다 — 이전 단어의 attempts/입력값이 새 단어로 새지 않도록
  // (과거 STEPS 상태 붕괴 회귀 이력에 대한 동일한 방어 원칙, 설계 §10).
  useEffect(() => {
    setInputValue('')
    setAttempts(0)
    setLastResult(null)
    setDone(false)
  }, [mode, item?.id, seed])

  const prepared = useMemo(() => {
    if (!modeConfig || !item) return null
    return modeConfig.prepare(item, options)
    // options는 세션 안에서 안정적으로 유지되는 설정 객체로 취급(설계
    // 예시: options={{retries:2}}) — 매 렌더 재계산 방지 위해 의도적으로
    // deps에서 제외, mode/item.id/seed 변화에만 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, item?.id, seed])

  const emit = useCallback(
    (evt) => {
      onEvent?.({ mode, itemId: item?.id, seed, ...evt })
    },
    [onEvent, mode, item, seed],
  )

  const finishComplete = useCallback(
    (correct) => {
      setDone(true)
      emit({ type: 'complete', correct })
    },
    [emit],
  )

  const handleGradedSubmit = useCallback(
    (rawInput, correctAnswer) => {
      if (done) return
      const grade = modeConfig?.grade
      const correct = typeof grade === 'function' ? grade(rawInput, correctAnswer) : null
      const nextAttempts = attempts + 1
      setAttempts(nextAttempts)
      setLastResult(correct)
      emit({ type: 'result', correct, attempts: nextAttempts })

      const maxRetries = Number.isFinite(options.retries) ? options.retries : Infinity
      if (correct || nextAttempts >= maxRetries) {
        finishComplete(correct)
      }
    },
    [done, modeConfig, attempts, emit, finishComplete, options.retries],
  )

  if (!modeConfig || !item) return null

  const primitives = modeConfig.primitives || []
  // fill_blank는 prepared가 { prompt, answer }(원문이 아니라 빈칸 프롬프트)
  // 이므로 Show에 그 prompt를 넘긴다. 나머지 모드(learn/listen/shadowing/
  // write)는 prepare가 identity라 item.text를 그대로 보여준다.
  const showText = mode === 'fill_blank' ? prepared?.prompt : item.text

  return (
    <div className="learning-engine" data-mode={mode}>
      {primitives.includes('show') ? (
        <Show text={showText} translation={item.translation} targetWord={item.targetWord} />
      ) : null}

      {primitives.includes('audio') ? (
        <AudioPlay audioText={item.audioText} source={`learning-engine-${mode}`} />
      ) : null}

      {primitives.includes('text-input') ? (
        <div className="learning-engine-answer flex flex-col gap-2">
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={() => handleGradedSubmit(inputValue, prepared?.answer)}
            disabled={done}
          />
          <button
            type="button"
            onClick={() => handleGradedSubmit(inputValue, prepared?.answer)}
            disabled={done}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-40"
          >
            확인
          </button>
          {lastResult === true ? <p className="text-sm text-emerald-600">정답이에요!</p> : null}
          {lastResult === false ? <p className="text-sm text-amber-600">다시 해볼까요?</p> : null}
        </div>
      ) : null}

      {primitives.includes('write') ? (
        <Write
          item={item}
          grade={modeConfig.grade}
          onCheck={(ok) => {
            setLastResult(ok)
            finishComplete(ok)
          }}
        />
      ) : null}

      {primitives.includes('record') ? <Record renderRecorder={renderRecorder} item={item} onEvent={emit} /> : null}

      {/* grade도 record도 없는 모드(learn/listen)는 학생이 직접 "다음"으로
          완료를 알린다 — 자동 채점/녹음 결과가 없어 엔진이 스스로 완료
          시점을 판단할 근거가 없기 때문(정직한 최소 구현, 설계 §13.5). */}
      {!modeConfig.grade && !primitives.includes('record') && !done ? (
        <button
          type="button"
          onClick={() => finishComplete(null)}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold"
        >
          다음
        </button>
      ) : null}
    </div>
  )
}
