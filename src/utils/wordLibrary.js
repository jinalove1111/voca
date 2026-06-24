import { WORDS as DB_WORDS } from '../data/words'

const CLS_KEY = 'paulEasyVoca_classWords'
const CLS_META_KEY = 'paulEasyVoca_classMeta'
const CLS_DELETED_KEY = 'paulEasyVoca_deletedClasses'
const STU_CLS = (name) => `paulEasyVoca_${name}_class`
const STU_UNIT = (name) => `paulEasyVoca_${name}_unit`
const DEFAULT_UNIT_NAME = 'Unit 1'

const getDeletedClasses = () => {
  try { return new Set(JSON.parse(localStorage.getItem(CLS_DELETED_KEY)) || []) } catch { return new Set() }
}
const saveDeletedClasses = (set) => localStorage.setItem(CLS_DELETED_KEY, JSON.stringify([...set]))

// Real class list provided by user
const DEFAULT_CLASS_LIST = [
  // 정규반 (regular)
  'Presentation 6 - 2025',
  '2026 Conversation1',
  'MS advanced class (8:00) - 2026',
  'Conversation 4 - 2026',
  '2026 - Conversation 2',
  'Presentation1 - 2026',
  'Pre-middle school MW (8:00) - 2026',
  'Presentation 3 - 2026',
  '2026 Phonics 2',
  // 특강반 (special)
  'MS 중1',
  'MS 중2',
  'MS 중3',
]

// Default metadata for classes
const DEFAULT_CLASS_META = {}
DEFAULT_CLASS_LIST.forEach(name => {
  const specialNames = ['MS 중1', 'MS 중2', 'MS 중3']
  DEFAULT_CLASS_META[name] = { classType: specialNames.includes(name) ? 'special' : 'regular' }
})

// Backwards-compatible small sample word sets for legacy classes
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

export const getAllClassMeta = () => {
  try { return JSON.parse(localStorage.getItem(CLS_META_KEY)) || {} } catch { return {} }
}
export const saveAllClassMeta = (obj) => localStorage.setItem(CLS_META_KEY, JSON.stringify(obj))

// Ensure defaults exist in storage (called lazily)
const ensureDefaults = () => {
  const classes = getAllClasses()
  const meta = getAllClassMeta()
  const deleted = getDeletedClasses()
  let changed = false

  // Initialize meta for default class list (skip deleted)
  Object.entries(DEFAULT_CLASS_META).forEach(([name, m]) => {
    if (!deleted.has(name) && !meta[name]) { meta[name] = m; changed = true }
  })

  // Initialize empty class entries for default classes if missing (skip deleted)
  DEFAULT_CLASS_LIST.forEach(name => {
    if (!deleted.has(name) && !classes[name]) { classes[name] = []; changed = true }
  })

  if (changed) {
    saveAllClassMeta(meta)
    saveAllClasses(classes)
  }
}

export const getClassNames = () => {
  ensureDefaults()
  const deleted = getDeletedClasses()
  const saved = Object.keys(getAllClasses()).filter(n => !deleted.has(n))
  const metaNames = Object.keys(getAllClassMeta()).filter(n => !deleted.has(n))
  const legacy = Object.keys(DEFAULT_CLASS_WORDS).filter(n => !deleted.has(n))
  return [...new Set([...DEFAULT_CLASS_LIST.filter(n => !deleted.has(n)), ...metaNames, ...saved, ...legacy])]
}

const normalizeClassData = (value) => {
  if (Array.isArray(value)) {
    return [{ name: DEFAULT_UNIT_NAME, words: value }]
  }
  if (value && Array.isArray(value.units)) {
    return value.units.map((unit) => ({
      name: typeof unit.name === 'string' ? unit.name : DEFAULT_UNIT_NAME,
      words: Array.isArray(unit.words) ? unit.words : [],
    }))
  }
  return [{ name: DEFAULT_UNIT_NAME, words: [] }]
}

export const getClassUnits = (className) => {
  const all = getAllClasses()
  const raw = all[className]
  if (raw === undefined) {
    const fallback = DEFAULT_CLASS_WORDS[className]
    if (fallback) return [{ name: DEFAULT_UNIT_NAME, words: fallback }]
    return [{ name: DEFAULT_UNIT_NAME, words: [] }]
  }
  return normalizeClassData(raw)
}

export const getClassUnitNames = (className) => getClassUnits(className).map((unit) => unit.name)

export const getClassWords = (className, unitName = DEFAULT_UNIT_NAME) => {
  const units = getClassUnits(className)
  const unit = units.find((u) => u.name === unitName) || units[0]
  return unit?.words || []
}

export const setClassWords = (className, words, unitName = DEFAULT_UNIT_NAME) => {
  const all = getAllClasses()
  const units = getClassUnits(className)
  const target = units.find((u) => u.name === unitName)
  if (target) {
    target.words = words
  } else {
    units.push({ name: unitName, words })
  }
  all[className] = { units }
  saveAllClasses(all)
}

export const addClassUnit = (className, unitName) => {
  const all = getAllClasses()
  const units = getClassUnits(className)
  if (!units.some((u) => u.name === unitName)) {
    units.push({ name: unitName, words: [] })
  }
  all[className] = { units }
  saveAllClasses(all)
}

export const deleteClassUnit = (className, unitName) => {
  const all = getAllClasses()
  const units = getClassUnits(className).filter((u) => u.name !== unitName)
  if (units.length === 0) {
    units.push({ name: DEFAULT_UNIT_NAME, words: [] })
  }
  all[className] = { units }
  saveAllClasses(all)
}

export const deleteClass = (className) => {
  const all = getAllClasses()
  delete all[className]
  saveAllClasses(all)
  const meta = getAllClassMeta()
  delete meta[className]
  saveAllClassMeta(meta)
  const deleted = getDeletedClasses()
  deleted.add(className)
  saveDeletedClasses(deleted)
}

export const getStudentClass = (name) => localStorage.getItem(STU_CLS(name)) || ''
export const setStudentClass = (name, cls) => localStorage.setItem(STU_CLS(name), cls)
export const getStudentUnit = (name) => localStorage.getItem(STU_UNIT(name)) || DEFAULT_UNIT_NAME
export const setStudentUnit = (name, unit) => localStorage.setItem(STU_UNIT(name), unit)

// Returns full word objects for a student (merged with DB if possible)
export const getStudentWords = (name) => {
  try {
    const cls = getStudentClass(name)
    if (!cls) return Array.isArray(DB_WORDS) ? DB_WORDS : []
    const unitName = getStudentUnit(name)
    const raw = getClassWords(cls, unitName)
    if (!Array.isArray(raw) || !raw.length) return []
    return raw.map((cw) => {
      if (!cw || !cw.word) return null
      const db = Array.isArray(DB_WORDS) ? DB_WORDS.find((w) => w.word.toLowerCase() === cw.word.toLowerCase()) : null
      if (db) return db
      return {
        id:           cw.word.toLowerCase().replace(/\s+/g, '_'),
        word:         cw.word,
        meaning:      cw.meaning || '',
        memoryTip:    `${cw.word} = ${cw.meaning}`,
        easyExample:  `I know the word "${cw.word}".`,
        easyMeaning:  `나는 "${cw.meaning}"이라는 단어를 알아요.`,
        funnyExample: `Even my dog knows "${cw.word}"!`,
        funnyMeaning: `내 강아지도 "${cw.meaning}"를 알아요!`,
        realExample:  `Can you use "${cw.word}" in a sentence?`,
        realMeaning:  `"${cw.meaning}"를 문장에서 사용해볼 수 있나요?`,
        quiz:         `${cw.word} means ____.`,
        answer:       cw.meaning || '',
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}
