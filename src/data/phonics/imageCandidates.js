// PAUL PHONICS (257차): existing Paul Town art that MIGHT serve as a learning picture for a word that still needs one. These are NOT approved learning images.
// Imported ONLY by the admin review panel — never by student code (the static test pins this). The words keep image:'needed' in the student data.
import cat from '../../assets/town/animals/cat.webp'
import tree from '../../assets/town/nature/tree.webp'
import lamp from '../../assets/town/decorations/street-lamp.webp'
import duck from '../../assets/town/kit/animals/duck.webp'
import fox from '../../assets/town/kit/animals/fox.webp'
import tent from '../../assets/town/kit/props/tent.webp'
import gate from '../../assets/town/kit/props/garden-gate.webp'

export const CANDIDATE_NOTE_KO = '마을 그림 — 학습용 승인 필요'
const row = (word, url, source) => ({ word, url, source, note: CANDIDATE_NOTE_KO })
export const IMAGE_CANDIDATES = [
  row('cat', cat, 'src/assets/town/animals/cat.webp'),
  row('tree', tree, 'src/assets/town/nature/tree.webp'),
  row('lamp', lamp, 'src/assets/town/decorations/street-lamp.webp'),
  row('duck', duck, 'src/assets/town/kit/animals/duck.webp'),
  row('fox', fox, 'src/assets/town/kit/animals/fox.webp'),
  row('tent', tent, 'src/assets/town/kit/props/tent.webp'),
  row('gate', gate, 'src/assets/town/kit/props/garden-gate.webp'),
]
// related-looking picture-word entries that are NOT matches: they stay pending and are never used
export const REJECTED_LOOKALIKES = [['rubber duck', 'UNCERTAIN'], ['rocks', 'UNCERTAIN'], ['globe', 'MISMATCH']]
