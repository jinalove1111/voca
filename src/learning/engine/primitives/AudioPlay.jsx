// src/learning/engine/primitives/AudioPlay.jsx — 상호작용 프리미티브 ②: 재생.
//
// 기존 utils/speech.js의 playWordAudio를 그대로 감싼다(WordDetail.jsx의
// SpeechBtn/단어 발음 버튼이 이미 쓰는 것과 동일한 함수) — 3-tier 재생
// (저장된 오디오 → device TTS → network TTS)/echo 가드/claimTtsCall 단일
// 재생 보장을 전부 그대로 재사용한다. 이 컴포넌트는 재생 요청 버튼 하나일
// 뿐, 재생 로직을 재구현하지 않는다(중복 금지 원칙).
import { useCallback } from 'react'
import { playWordAudio, unlockAudio } from '../../../utils/speech'

export default function AudioPlay({ audioText, audioUrl = null, source = 'learning-engine', label = '🔊 듣기', times = 1 }) {
  const handlePlay = useCallback(() => {
    unlockAudio()
    playWordAudio(audioUrl, audioText, { times, source })
  }, [audioUrl, audioText, times, source])

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={!audioText}
      className="learning-primitive learning-primitive-audio min-h-[44px] px-4 py-2 rounded-lg bg-blue-50 text-blue-700 font-semibold disabled:opacity-40"
    >
      {label}
    </button>
  )
}
