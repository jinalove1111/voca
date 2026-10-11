// PAUL PHONICS teacher-recorded single-sound clips (254차). EMPTY today: no clip is approved, so a sound is never spoken.
// A single letter/grapheme/IPA string is NEVER sent to TTS; without an approved clip the UI says "선생님 녹음 준비 중".
// To register a recording: import the audio asset from src/assets/phonics/clips/ and add
//   'a|æ': { src: aClip, status: 'teacher-approved', approvedBy: '<teacher>', approvedOn: 'YYYY-MM-DD' }
export const PHONEME_CLIPS = {}

// the entry only when it is teacher-approved, else null
export function phonemeClip(pair, clips = PHONEME_CLIPS) {
  const c = clips[pair]
  return c && c.status === 'teacher-approved' ? c : null
}
