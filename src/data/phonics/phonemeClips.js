// PAUL PHONICS teacher-recorded single-sound clips (255차). EMPTY today: no recording exists, so a sound is never spoken and every recording is 대기 (pending).
// A single letter/grapheme/IPA string is NEVER sent to TTS; without an approved clip the UI says "선생님 녹음 준비 중".
// The registry is keyed by PHONEME (ipa): one recording serves every spelling of that sound (u_e /uː/ and oo /uː/ share one clip).
// To register a recording: import the audio asset from src/assets/phonics/clips/ and add
//   'æ': { src: aClip, status: 'teacher-approved', approvedBy: '<teacher>', approvedOn: 'YYYY-MM-DD' }
export const PHONEME_CLIPS = {}

// [ipa, representative grapheme, example word] — the 42 phonemes in teaching order. /kw/ /ks/ /ŋk/, doubles and clusters need no recording.
export const RECORDING_LIST = [
  ['æ', 'a', 'cat'], ['e', 'e', 'pen'], ['ɪ', 'i', 'pig'], ['ɒ', 'o', 'dog'], ['ʌ', 'u', 'cup'],
  ['m', 'm', 'mat'], ['s', 's', 'sat'], ['t', 't', 'tap'], ['p', 'p', 'pot'],
  ['n', 'n', 'nut'], ['d', 'd', 'dog'], ['ɡ', 'g', 'dig'], ['k', 'c', 'can'],
  ['b', 'b', 'bag'], ['h', 'h', 'hat'], ['f', 'f', 'fan'], ['l', 'l', 'leg'],
  ['r', 'r', 'red'], ['dʒ', 'j', 'jam'], ['w', 'w', 'wet'], ['v', 'v', 'van'], ['j', 'y', 'yes'], ['z', 'z', 'zip'],
  ['eɪ', 'a_e', 'cake'], ['aɪ', 'i_e', 'kite'], ['əʊ', 'o_e', 'bone'], ['juː', 'u_e', 'cube'], ['uː', 'u_e', 'rule'],
  ['ʃ', 'sh', 'ship'], ['tʃ', 'ch', 'chip'], ['θ', 'th', 'thin'], ['ð', 'th', 'this'], ['ŋ', 'ng', 'ring'],
  ['iː', 'ee', 'green'], ['aʊ', 'ow', 'cow'], ['ɔɪ', 'oi', 'coin'], ['ʊ', 'oo', 'book'], ['ɑː', 'ar', 'car'], ['ɔː', 'or', 'fork'], ['ɜː', 'ir', 'bird'], ['ə', 'er', 'butter'], ['eə', 'air', 'chair'],
].map(([ipa, grapheme, example]) => ({ ipa, grapheme, example }))

// the entry only when it is teacher-approved, else null
export function phonemeClip(ipa, clips = PHONEME_CLIPS) {
  const c = clips[ipa]
  return c && c.status === 'teacher-approved' ? c : null
}
export const recordingStatus = (ipa, clips = PHONEME_CLIPS) => (phonemeClip(ipa, clips) ? 'approved' : 'pending')
