// PAUL PHONICS teacher-recorded single-sound clips (255차, 256차: built on recordings.js + clipFiles.js). EMPTY today: no recording exists, so a sound is never spoken and every recording is missing.
// A single letter/grapheme/IPA string is NEVER sent to TTS; without an approved clip the UI says "선생님 녹음 준비 중".
// The registry is keyed by PHONEME (ipa): one recording serves every spelling of that sound (u_e /uː/ and oo /uː/ share one clip).
// To add a recording: put ph-<NN>-<id>.<ext> in src/assets/phonics/clips/ and approve it in recordings.js (PHONEME_APPROVALS) — see recordings.js.
import { PHONEME_APPROVALS, RECORDINGS, recordingStatuses } from './recordings.js'
import { CLIP_URLS } from './clipFiles.js'

// [ipa, representative grapheme, example word] — the 42 phonemes in teaching order. /kw/ /ks/ /ŋk/, doubles and clusters need no recording.
export const RECORDING_LIST = RECORDINGS.map(({ ipa, grapheme, exampleWord }) => ({ ipa, grapheme, example: exampleWord }))

// ipa -> { src, status: 'teacher-approved', approvedBy, approvedOn } for every recording that has a file AND a complete approval
export function buildClips(urls = CLIP_URLS, approvals = PHONEME_APPROVALS) {
  const names = Object.keys(urls)
  const out = {}
  for (const s of recordingStatuses(names, approvals)) {
    if (s.status !== 'approved') continue
    const a = approvals[s.id]
    out[s.ipa] = { src: urls[s.file], status: 'teacher-approved', approvedBy: a.approvedBy, approvedOn: a.approvedOn }
  }
  return out
}
export const PHONEME_CLIPS = buildClips()

// the entry only when it is teacher-approved, else null
export function phonemeClip(ipa, clips = PHONEME_CLIPS) {
  const c = clips[ipa]
  return c && c.status === 'teacher-approved' ? c : null
}
export const recordingStatus = (ipa, clips = PHONEME_CLIPS) => (phonemeClip(ipa, clips) ? 'approved' : 'pending')
