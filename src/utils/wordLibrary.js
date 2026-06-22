import { WORDS as DB_WORDS } from '../data/words'

const CLS_KEY = 'paulEasyVoca_classWords'
const STU_CLS = (name) => `paulEasyVoca_${name}_class`

const FIXED_CLASS_NAMES = ['월수금초급', '화목초급', '중등내신']
const DEFAULT_CLASS_WORDS = {
  '월수금초급': [
    { word: 'apple', meaning: '사과' },
    { word: 'banana', meaning: '바나나' },
    { word: 'orange', meaning: '오렌지' },
    { word: 'milk', meaning: '우유' },
    { word: 'water', meaning: '물' },
  ],
  '화목초급': [
    { word: 'pizza', meaning: '피자' },
    { word: 'cake', meaning: '케이크' },
    { word: 'bread', meaning: '빵' },
    { word: 'cookie', meaning: '쿠키' },
    { word: 'juice', meaning: '주스' },
  ],
  '중등내신': [
    { word: 'school', meaning: '학교' },
    { word: 'book', meaning: '책' },
    { word: 'pencil', meaning: '연필' },
    { word: 'teacher', meaning: '선생님' },
    { word: 'student', meaning: '학생' },
  ],
}

export const getAllClasses = () => {
  try { return JSON.parse(localStorage.getItem(CLS_KEY)) || {} } catch { return {} }
}
export const saveAllClasses = (obj) => localStorage.setItem(CLS_KEY, JSON.stringify(obj))

export const getClassNames = () => {
  const saved = Object.keys(getAllClasses())
  return [...new Set([...FIXED_CLASS_NAMES, ...saved])]
}

export const getClassWords = (className) => {
  const all = getAllClasses()
  if (all[className] && all[className].length > 0) return all[className]
  return DEFAULT_CLASS_WORDS[className] || []
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
  if (!raw.length) return []
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
