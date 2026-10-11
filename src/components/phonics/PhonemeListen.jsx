// 소리 하나 듣기 / 따라 말하기 (254차). 소리 하나는 선생님이 승인한 녹음 파일(phonemeClips)로만 들려준다 — 음성 합성(TTS)에 글자·소리를 절대 보내지 않는다.
// 승인된 녹음이 없으면 "선생님 녹음 준비 중" 상태로 잠긴다(지금은 모든 소리가 그렇다). 녹음기는 기기 메모리 전용 — 업로드·채점 없음.
import React from 'react'
import { phonemeClip } from '../../data/phonics/phonemeClips.js'
import useLocalRecorder from '../../hooks/useLocalRecorder'
import { RecorderControls } from '../SpeakingPracticeItem'
import { PICTURE_REC_LABELS } from '../pictureWords/recLabels.js'

export const LOCKED_TEXT_KO = '선생님 녹음 준비 중'

// 승인된 녹음이 있을 때만 마운트된다 — 그래야 녹음이 없는 화면은 마이크 훅을 올리지 않는다.
function Clip({ target, clip, repeat }) {
  const rec = useLocalRecorder()
  return (
    <div className="space-y-1">
      <audio data-testid="pph-clip-audio" controls src={clip.src} className="w-full" />
      {repeat && (
        <div data-testid="pph-clip-rec">
          <RecorderControls rec={rec} prefix={`pph-rec-${target.pair}`} labels={PICTURE_REC_LABELS} idleText="" />
        </div>
      )}
    </div>
  )
}

export default function PhonemeListen({ target, repeat = false, clips }) {
  const clip = phonemeClip(target.ipa, clips)
  return (
    <div data-testid="pph-phoneme" data-pair={target.pair} data-state={clip ? 'ready' : 'locked'} className="rounded-2xl border-2 border-sky-100 bg-white p-2">
      <p className="break-words text-center text-lg font-black text-gray-800">
        <span className="text-pink-600">{target.grapheme}</span> <span className="text-gray-500">/{target.ipa}/</span>
      </p>
      {clip ? <Clip target={target} clip={clip} repeat={repeat} /> : <p data-testid="pph-phoneme-locked" className="text-center text-sm font-bold text-gray-500">{LOCKED_TEXT_KO}</p>}
    </div>
  )
}
