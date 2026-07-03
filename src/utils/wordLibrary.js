import { supabase } from './supabaseClient'

const DEFAULT_UNIT_NAME = 'Unit 1'

// Real class list provided by user — used only to seed Supabase the very
// first time the app runs against an empty database.
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
const SPECIAL_CLASS_NAMES = new Set(['MS 중1', 'MS 중2', 'MS 중3'])

// ── In-memory cache, rebuilt from Supabase on init/refresh ────────────────
// { [className]: { id, classType, units: [{ id, name, words: [{id,word,meaning}] }] } }
let _cache = {}
let _initPromise = null

export function isWordLibraryReady() {
  return _initPromise !== null
}

// Rebuilds the entire in-memory cache from Supabase. Call this any time you
// need guaranteed-fresh data (app start, tab refocus, after a write).
export async function refreshWordLibrary() {
  const [classesRes, unitsRes, wordsRes] = await Promise.all([
    supabase.from('classes').select('id,name,class_type').order('created_at'),
    supabase.from('units').select('id,class_id,name,position').order('position'),
    supabase.from('words').select('id,unit_id,word,meaning,position,word_audio_url,example_audio_url').order('position'),
  ])
  if (classesRes.error) throw classesRes.error
  if (unitsRes.error) throw unitsRes.error
  if (wordsRes.error) throw wordsRes.error

  const tree = {}
  classesRes.data.forEach((c) => {
    tree[c.name] = { id: c.id, classType: c.class_type, units: [] }
  })
  const unitById = {}
  unitsRes.data.forEach((u) => {
    const cls = classesRes.data.find((c) => c.id === u.class_id)
    if (!cls) return
    const unitObj = { id: u.id, name: u.name, words: [] }
    tree[cls.name].units.push(unitObj)
    unitById[u.id] = unitObj
  })
  wordsRes.data.forEach((w) => {
    const unitObj = unitById[w.unit_id]
    if (unitObj) {
      unitObj.words.push({
        id: w.id, word: w.word, meaning: w.meaning,
        wordAudioUrl: w.word_audio_url || null,
        exampleAudioUrl: w.example_audio_url || null,
      })
    }
  })
  _cache = tree
  return tree
}

// The single example sentence the app actually shows/speaks for a word when
// no admin-authored example exists — kept here so the audio we generate
// matches the text on screen exactly.
export const exampleTextFor = (word) => `I know the word "${word}".`

// ── Students cache: { [name]: { id, className, unitName } } ───────────────
let _students = {}

export async function refreshStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('id,name,unit_name,classes(name)')
    .order('created_at')
  if (error) throw error
  const map = {}
  data.forEach((s) => {
    map[s.name] = { id: s.id, className: s.classes?.name || '', unitName: s.unit_name || DEFAULT_UNIT_NAME }
  })
  _students = map
  return map
}

async function seedDefaultClasses() {
  const rows = DEFAULT_CLASS_LIST.map((name) => ({
    name,
    class_type: SPECIAL_CLASS_NAMES.has(name) ? 'special' : 'regular',
  }))
  const { data: inserted, error } = await supabase.from('classes').insert(rows).select()
  if (error) { console.error('[wordLibrary] seed classes failed', error); return }
  const unitRows = inserted.map((c) => ({ class_id: c.id, name: DEFAULT_UNIT_NAME, position: 0 }))
  const { error: uerr } = await supabase.from('units').insert(unitRows)
  if (uerr) console.error('[wordLibrary] seed units failed', uerr)
}

// Call once at app startup, before rendering anything that reads class/word
// data. Safe to call multiple times — subsequent calls reuse the same promise.
// NOTE: there is deliberately no localStorage->Supabase auto-migration here.
// An earlier version imported each device's old local word/student data into
// Supabase on first load, which polluted the shared database with stale
// per-device test data. Supabase is the single source of truth; local data
// is never read back into it.
export function initWordLibrary() {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    await Promise.all([refreshWordLibrary(), refreshStudents()])
    if (Object.keys(_cache).length === 0) {
      await seedDefaultClasses()
      await refreshWordLibrary()
    }
  })()
  return _initPromise
}

// ── DB write helpers (do not touch the class_type of an existing class) ───
async function ensureClass(name, classType = 'regular') {
  const { data: existing, error: selErr } = await supabase
    .from('classes').select('id,name,class_type').eq('name', name).maybeSingle()
  if (selErr) throw selErr
  if (existing) return existing
  const { data, error } = await supabase
    .from('classes').insert({ name, class_type: classType }).select().single()
  if (error) throw error
  return data
}

async function ensureUnit(classId, unitName) {
  const { data: existing, error: selErr } = await supabase
    .from('units').select('id,name').eq('class_id', classId).eq('name', unitName).maybeSingle()
  if (selErr) throw selErr
  if (existing) return existing
  const { data, error } = await supabase
    .from('units').insert({ class_id: classId, name: unitName }).select().single()
  if (error) throw error
  return data
}

// ── Public API (mirrors the old localStorage-backed shape) ────────────────
export const getClassNames = () => Object.keys(_cache)

export const getClassUnits = (className) => {
  const cls = _cache[className]
  if (!cls || cls.units.length === 0) return [{ name: DEFAULT_UNIT_NAME, words: [] }]
  return cls.units
}

export const getClassUnitNames = (className) => getClassUnits(className).map((u) => u.name)

export const getClassWords = (className, unitName = DEFAULT_UNIT_NAME) => {
  const units = getClassUnits(className)
  const unit = units.find((u) => u.name === unitName) || units[0]
  return unit?.words || []
}

export async function createClass(name, classType = 'regular') {
  const cls = await ensureClass(name, classType)
  await ensureUnit(cls.id, DEFAULT_UNIT_NAME)
  await refreshWordLibrary()
}

export async function setClassWords(className, words, unitName = DEFAULT_UNIT_NAME) {
  const cls = await ensureClass(className)
  const unit = await ensureUnit(cls.id, unitName)

  // Carry forward audio for words that already had it (matched by word
  // text) so re-saving a unit — e.g. adding one more word to an existing
  // list — doesn't throw away and regenerate audio that already worked.
  const { data: existingRows, error: selErr } = await supabase
    .from('words').select('word,word_audio_url,example_audio_url').eq('unit_id', unit.id)
  if (selErr) throw selErr
  const priorAudioByWord = new Map((existingRows || []).map((r) => [r.word.toLowerCase(), r]))

  const { error: delErr } = await supabase.from('words').delete().eq('unit_id', unit.id)
  if (delErr) throw delErr

  if (words.length > 0) {
    const rows = words.map((w, i) => {
      const prior = priorAudioByWord.get(w.word.toLowerCase())
      return {
        unit_id: unit.id, word: w.word, meaning: w.meaning, position: i,
        word_audio_url: prior?.word_audio_url || null,
        example_audio_url: prior?.example_audio_url || null,
      }
    })
    const { data: inserted, error: insErr } = await supabase.from('words').insert(rows).select('id,word,word_audio_url')
    if (insErr) throw insErr
    // Fire-and-forget: ask the server to generate + attach pronunciation
    // audio for any word that doesn't already have it. Never blocks the
    // save, never throws — if the API route isn't deployed yet (e.g. local
    // dev) the word just has no audio until this succeeds later.
    inserted.forEach((row) => {
      if (!row.word_audio_url) requestAudioGeneration(row.id, row.word, exampleTextFor(row.word))
    })
  }
  await refreshWordLibrary()
}

function requestAudioGeneration(wordId, word, example) {
  fetch('/api/generate-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wordId, word, example }),
  })
    .then((res) => { if (res.ok) refreshWordLibrary().catch(() => {}) })
    .catch((err) => console.warn('[wordLibrary] audio generation request failed (non-fatal):', err.message))
}

export async function addClassUnit(className, unitName) {
  const cls = await ensureClass(className)
  await ensureUnit(cls.id, unitName)
  await refreshWordLibrary()
}

export async function deleteClassUnit(className, unitName) {
  const unit = _cache[className]?.units.find((u) => u.name === unitName)
  if (!unit) return
  const { error } = await supabase.from('units').delete().eq('id', unit.id)
  if (error) throw error
  await refreshWordLibrary()
}

export async function deleteClass(className) {
  const cls = _cache[className]
  if (!cls) return
  const { error } = await supabase.from('classes').delete().eq('id', cls.id)
  if (error) throw error
  await refreshWordLibrary()
}

// ── Students: roster + class/unit assignment, shared across every device ──
export const getStudents = () => Object.keys(_students)

export async function addStudent(name, className = '', unitName = DEFAULT_UNIT_NAME) {
  let classId = null
  if (className) classId = (await ensureClass(className)).id
  const { error } = await supabase
    .from('students').insert({ name, class_id: classId, unit_name: unitName || DEFAULT_UNIT_NAME })
  if (error) throw error
  await refreshStudents()
}

export async function removeStudent(name) {
  const s = _students[name]
  if (!s) return
  const { error } = await supabase.from('students').delete().eq('id', s.id)
  if (error) throw error
  await refreshStudents()
}

export const getStudentClass = (name) => _students[name]?.className || ''
export const getStudentUnit = (name) => _students[name]?.unitName || DEFAULT_UNIT_NAME

export async function setStudentClass(name, className) {
  const s = _students[name]
  if (!s) return
  const classId = className ? (await ensureClass(className)).id : null
  const { error } = await supabase.from('students').update({ class_id: classId }).eq('id', s.id)
  if (error) throw error
  await refreshStudents()
}

export async function setStudentUnit(name, unitName) {
  const s = _students[name]
  if (!s) return
  const { error } = await supabase.from('students').update({ unit_name: unitName }).eq('id', s.id)
  if (error) throw error
  await refreshStudents()
}

// Returns full word objects for a student, sourced ONLY from Supabase class
// data — word and meaning always come straight from the DB row, never from
// the built-in demo bank (data/words.js), even if the text happens to match.
// No class assigned (on this device) or an empty unit both mean "no words
// yet"; the screen shows nothing rather than substituting sample content.
export const getStudentWords = (name) => {
  try {
    const cls = getStudentClass(name)
    if (!cls) return []
    const unitName = getStudentUnit(name)
    const raw = getClassWords(cls, unitName)
    if (!Array.isArray(raw) || !raw.length) return []
    return raw.map((cw) => {
      if (!cw || !cw.word) return null
      return {
        id:              cw.word.toLowerCase().replace(/\s+/g, '_'),
        word:            cw.word,
        meaning:         cw.meaning || '',
        memoryTip:       `${cw.word} = ${cw.meaning}`,
        easyExample:     exampleTextFor(cw.word),
        easyMeaning:     `나는 "${cw.meaning}"이라는 단어를 알아요.`,
        funnyExample:    `Even my dog knows "${cw.word}"!`,
        funnyMeaning:    `내 강아지도 "${cw.meaning}"를 알아요!`,
        realExample:     `Can you use "${cw.word}" in a sentence?`,
        realMeaning:     `"${cw.meaning}"를 문장에서 사용해볼 수 있나요?`,
        quiz:            `${cw.word} means ____.`,
        answer:          cw.meaning || '',
        wordAudioUrl:    cw.wordAudioUrl || null,
        exampleAudioUrl: cw.exampleAudioUrl || null,
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}
