import { WORDS as DB_WORDS } from '../data/words'

const CLS_KEY = 'paulEasyVoca_classWords'
const STU_CLS = (name) => `paulEasyVoca_${name}_class`

export const getAllClasses = () => {
  try { return JSON.parse(localStorage.getItem(CLS_KEY)) || {} } catch { return {} }
}
export const saveAllClasses = (obj) => localStorage.setItem(CLS_KEY, JSON.stringify(obj))

export const getClassNames = () => Object.keys(getAllClasses())

export const getClassWords = (className) => {
  const all = getAllClasses()
  return all[className] || []
}

export const setClassWords = (className, words) => {
  const all = getAllClasses()
  all[className] = words
  saveAllClasses(all)
}

export const deleteClass = (className) => {
  const all = getAllClasses()
  delete all[className]
  saveAllClasses(all)
}

export const getStudentClass = (name) => localStorage.getItem(STU_CLS(name)) || ''
export const setStudentClass = (name, cls) => localStorage.setItem(STU_CLS(name), cls)

// Returns full word objects for a student (merged with DB if possible)
export const getStudentWords = (name) => {
  const cls = getStudentClass(name)
  if (!cls) return DB_WORDS
  const raw = getClassWords(cls)
  if (!raw.length) return DB_WORDS
  return raw.map(cw => {
    const db = DB_WORDS.find(w => w.word.toLowerCase() === cw.word.toLowerCase())
    if (db) return db
    return {
      id:           cw.word.toLowerCase().replace(/\s+/g, '_'),
      word:         cw.word,
      meaning:      cw.meaning,
      memoryTip:    `${cw.word} = ${cw.meaning}`,
      easyExample:  `I know the word "${cw.word}".`,
      easyMeaning:  `나는 "${cw.meaning}"이라는 단어를 알아요.`,
      funnyExample: `Even my dog knows "${cw.word}"!`,
      funnyMeaning: `내 강아지도 "${cw.meaning}"를 알아요!`,
      realExample:  `Can you use "${cw.word}" in a sentence?`,
      realMeaning:  `"${cw.meaning}"를 문장에서 사용해볼 수 있나요?`,
      quiz:         `${cw.word} means ____.`,
      answer:       cw.meaning,
    }
  })
}
