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
// classId -> today's assigned word-slug array (v1.3 "오늘의 단어 배정") —
// preloaded alongside everything else so getStudentWords stays synchronous.
// Absent/empty for a class = no assignment set = fall back to showing the
// full unit (existing v1.0/v1.1/v1.2 behavior, never broken by this).
let _dailyAssignments = {}
const todayDateStr = () => new Date().toISOString().slice(0, 10)

export async function refreshWordLibrary() {
  const [classesRes, unitsRes, wordsRes, assignmentsRes] = await Promise.all([
    supabase.from('classes').select('id,name,class_type').order('created_at'),
    supabase.from('units').select('id,class_id,name,position').order('position'),
    supabase.from('words').select('id,unit_id,word,meaning,position,word_audio_url,example_audio_url,example_text,example_translation,memory_tip').order('position'),
    supabase.from('daily_assignments').select('class_id,word_ids').eq('date', todayDateStr()),
  ])
  if (classesRes.error) throw classesRes.error
  if (unitsRes.error) throw unitsRes.error
  if (wordsRes.error) throw wordsRes.error
  // Assignments table is new (v1.3) — don't let a query hiccup here ever
  // break the whole app; worst case, today's assignment silently falls back
  // to "no assignment" (full unit shown), never a hard failure.
  if (!assignmentsRes.error) {
    _dailyAssignments = Object.fromEntries((assignmentsRes.data || []).map((a) => [a.class_id, a.word_ids || []]))
  } else {
    console.warn('[wordLibrary] daily_assignments fetch failed (non-fatal):', assignmentsRes.error.message)
  }

  const tree = {}
  classesRes.data.forEach((c) => {
    tree[c.name] = { id: c.id, classType: c.class_type, units: [] }
  })
  const unitById = {}
  unitsRes.data.forEach((u) => {
    const cls = classesRes.data.find((c) => c.id === u.class_id)
    if (!cls) return
    const unitObj = { id: u.id, classId: cls.id, name: u.name, words: [] }
    tree[cls.name].units.push(unitObj)
    unitById[u.id] = unitObj
  })
  wordsRes.data.forEach((w) => {
    const unitObj = unitById[w.unit_id]
    if (unitObj) {
      unitObj.words.push({
        id: w.id, classId: unitObj.classId, unitId: unitObj.id,
        word: w.word, meaning: w.meaning,
        wordAudioUrl: w.word_audio_url || null,
        exampleAudioUrl: w.example_audio_url || null,
        exampleText: w.example_text || null,
        exampleTranslation: w.example_translation || null,
        memoryTip: w.memory_tip || null,
      })
    }
  })
  _cache = tree
  return tree
}

// The example sentence the app shows/speaks for a word before the real one
// (admin-authored or AI-generated) is ready — per-word, never one generic
// sentence for every word, and matches the audio we generate for it.
const VOWEL_SOUND = /^[aeiou]/i
export const exampleTextFor = (word) => `I can see ${VOWEL_SOUND.test(word) ? 'an' : 'a'} ${word}.`

// Default memory tip shown before the real AI-generated one is ready.
export const memoryTipFor = (word, meaning) => `${word} = ${meaning}! 소리 내어 3번 읽어보면 금방 외워져요.`

// ── Students cache: { [name]: { id, className, unitName } } ───────────────
let _students = {}

export async function refreshStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('id,name,class_id,unit_name,classes(name)')
    .order('created_at')
  if (error) throw error
  const map = {}
  data.forEach((s) => {
    map[s.name] = {
      id: s.id,
      classId: s.class_id || null,
      className: s.classes?.name || '',
      unitName: s.unit_name || DEFAULT_UNIT_NAME,
    }
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

  // Carry forward audio + example for words that already had it (matched by
  // word text) so re-saving a unit — e.g. adding one more word to an
  // existing list — doesn't throw away and regenerate content that already
  // worked.
  const { data: existingRows, error: selErr } = await supabase
    .from('words').select('word,word_audio_url,example_audio_url,example_text').eq('unit_id', unit.id)
  if (selErr) throw selErr
  const priorByWord = new Map((existingRows || []).map((r) => [r.word.toLowerCase(), r]))

  const { error: delErr } = await supabase.from('words').delete().eq('unit_id', unit.id)
  if (delErr) throw delErr

  if (words.length > 0) {
    const rows = words.map((w, i) => {
      const prior = priorByWord.get(w.word.toLowerCase())
      return {
        unit_id: unit.id, word: w.word, meaning: w.meaning, position: i,
        word_audio_url: prior?.word_audio_url || null,
        example_audio_url: prior?.example_audio_url || null,
        example_text: prior?.example_text || (w.example || '').trim() || null,
      }
    })
    const { data: inserted, error: insErr } = await supabase.from('words').insert(rows).select('id,word,meaning,word_audio_url,example_text')
    if (insErr) throw insErr
    // Fire-and-forget: ask the server to generate + attach pronunciation
    // audio (and an AI example sentence, if none was carried forward or
    // admin-provided) for any word that doesn't already have audio. Never
    // blocks the save, never throws — if the API route isn't deployed yet
    // (e.g. local dev) the word just has no audio until this succeeds later.
    inserted.forEach((row) => {
      if (!row.word_audio_url) requestAudioGeneration(row.id, row.word, row.meaning, row.example_text)
    })
  }
  await refreshWordLibrary()
}

// Tracks in-flight requests so a word is never asked for twice at once (e.g.
// admin save + a student opening the word a second later both notice missing
// audio).
const _pendingAudioRequests = new Set()

export function requestAudioGeneration(wordId, word, meaning, example) {
  if (!wordId || !word || _pendingAudioRequests.has(wordId)) return
  _pendingAudioRequests.add(wordId)
  console.log('[wordLibrary] requesting audio generation for', word, wordId)
  fetch('/api/generate-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wordId, word, meaning, example }),
    // keepalive lets this request finish even if the tab is backgrounded or
    // the user navigates away right after triggering it — without this, a
    // mobile browser can silently cancel the fetch mid-flight, leaving the
    // word with no audio forever.
    keepalive: true,
  })
    .then((res) => {
      if (res.ok) { console.log('[wordLibrary] audio generation done for', word); refreshWordLibrary().catch(() => {}) }
      else console.warn('[wordLibrary] audio generation failed for', word, res.status)
    })
    .catch((err) => console.warn('[wordLibrary] audio generation request failed (non-fatal):', word, err.message))
    .finally(() => _pendingAudioRequests.delete(wordId))
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

// Renaming only ever touches the classes.name column — every student is
// linked by class_id (see getStudentClassId/getClassNameById below), so a
// rename never breaks an existing student's class assignment.
export async function renameClass(oldName, newName) {
  const cls = _cache[oldName]
  if (!cls) return
  const trimmed = newName.trim()
  if (!trimmed || trimmed === oldName) return
  if (_cache[trimmed]) throw new Error(`"${trimmed}" 반이 이미 있어요.`)
  const { error } = await supabase.from('classes').update({ name: trimmed }).eq('id', cls.id)
  if (error) throw error
  await refreshWordLibrary()
}

// ── Students: roster + class/unit assignment, shared across every device ──
export const getStudents = () => Object.keys(_students)

// Case-insensitive lookup — returns the student's name exactly as stored in
// the DB (the "canonical" casing), or null if no student matches. A young
// student retyping their name with different capitalization (e.g. "heeja"
// vs "Heeja") must resolve back to the SAME account: progress is keyed by
// exact name string (see useStudent.js), so logging in under a differently-
// cased spelling would silently fork into a brand-new, empty progress
// record and look like all their stars/stickers vanished.
export function findStudentByName(name) {
  const target = name.trim().toLowerCase()
  if (!target) return null
  return Object.keys(_students).find(n => n.toLowerCase() === target) || null
}

// Students linked by class_id (the DB foreign key), never by matching the
// className string — so this stays correct even if the class was renamed
// after the student was assigned to it.
export function getStudentsInClass(className) {
  const classId = _cache[className]?.id
  if (!classId) return []
  return Object.entries(_students)
    .filter(([, s]) => s.classId === classId)
    .map(([name, s]) => ({ name, unitName: s.unitName }))
}

export async function addStudent(name, className = '', unitName = DEFAULT_UNIT_NAME) {
  // Defense in depth: never create a second account that only differs by
  // capitalization — see findStudentByName for why that's dangerous.
  if (findStudentByName(name)) return
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
export const getStudentClassId = (name) => _students[name]?.classId || null
export const getStudentUnit = (name) => _students[name]?.unitName || DEFAULT_UNIT_NAME

// _cache is keyed by class NAME (see refreshWordLibrary), but a student is
// linked to a class by class_id (the DB foreign key) — this resolves a
// class's current name from its id, which is robust against the same class
// being renamed after a student was assigned to it (a plain className
// string comparison would silently break in that case).
const getClassNameById = (classId) => {
  if (!classId) return ''
  for (const [name, cls] of Object.entries(_cache)) {
    if (cls.id === classId) return name
  }
  return ''
}

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

// Bulk reassignment (admin "일괄 이동") — one Supabase write + one refresh for
// N students, instead of N sequential setStudentClass/setStudentUnit calls
// (which would be 2N round-trips and could leave the roster in a
// half-moved state if one call in the middle failed).
export async function setStudentsClassBulk(names, className, unitName) {
  const ids = names.map(n => _students[n]?.id).filter(Boolean)
  if (ids.length === 0) return
  const classId = className ? (await ensureClass(className)).id : null
  const { error } = await supabase.from('students').update({ class_id: classId, unit_name: unitName }).in('id', ids)
  if (error) throw error
  await refreshStudents()
}

// v1.3 admin dashboard — one-way, fire-and-forget sync of a student's
// progress from their device's localStorage (the source of truth, never
// touched by this) into Supabase, so the admin can see it from a different
// device. Every caller already wraps this in .catch(() => {}) — never
// throw somewhere that would surface as a student-facing error, since
// missing/offline sync must never block or visibly affect the lesson flow.
export async function syncStudentProgress(name, { totalStars, clearedCount, streak, stickersCount, daily }) {
  const s = _students[name]
  if (!s) return // student not yet known to this device's Supabase cache (e.g. offline at first load) — next sync retries
  const today = new Date().toISOString().slice(0, 10)

  const { error: progressErr } = await supabase.from('student_progress').upsert({
    student_id: s.id,
    total_stars: totalStars,
    cleared_count: clearedCount,
    streak,
    stickers_count: stickersCount,
    last_studied_date: today,
    updated_at: new Date().toISOString(),
  })
  if (progressErr) throw progressErr

  const { error: dailyErr } = await supabase.from('student_daily_progress').upsert({
    student_id: s.id,
    date: today,
    categories_completed: daily.categoriesCompleted,
    stars_earned: daily.starsEarned,
    quiz_correct: daily.quizCorrect,
    quiz_total: daily.quizTotal,
    pronunciation_attempts: daily.pronunciationAttempts,
    missed_word_ids: daily.missedWordIds,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,date' })
  if (dailyErr) throw dailyErr
}

// Returns full word objects for a student, sourced ONLY from Supabase class
// data — word and meaning always come straight from the DB row, never from
// the built-in demo bank (data/words.js), even if the text happens to match.
// No class assigned (on this device) or an empty unit both mean "no words
// yet"; the screen shows nothing rather than substituting sample content.
export const getStudentWords = (name) => {
  const classId = getStudentClassId(name)
  const unitName = getStudentUnit(name)
  // Resolve the class by id first (robust to renames) — the joined
  // className is only a fallback for legacy rows with no class_id at all.
  const cls = getClassNameById(classId) || getStudentClass(name)
  try {
    if (!cls) {
      console.log('[wordLibrary] getStudentWords: no class resolved', {
        selectedStudent: name,
        selectedClass: getStudentClass(name),
        selectedClassId: classId,
        selectedUnit: unitName,
        queryResult: null,
        queryError: 'student has no class_id and no joined class name',
      })
      return []
    }
    const raw = getClassWords(cls, unitName)
    if (!Array.isArray(raw) || !raw.length) {
      console.log('[wordLibrary] getStudentWords: empty result', {
        selectedStudent: name,
        selectedClass: cls,
        selectedClassId: classId,
        selectedUnit: unitName,
        queryResult: raw,
        queryError: null,
      })
      return []
    }
    const todaysAssignment = _dailyAssignments[classId]
    const mapped = raw.map((cw) => {
      if (!cw || !cw.word) return null
      return {
        id:              cw.word.toLowerCase().replace(/\s+/g, '_'),
        word:            cw.word,
        meaning:         cw.meaning || '',
        // Real example/tip are admin-provided (example only) or AI-generated
        // server-side (see api/generate-audio.js) and stored per word. Until
        // that finishes (brand-new word, generation still in flight), fall
        // back to a per-word placeholder rather than showing nothing.
        memoryTip:          cw.memoryTip || memoryTipFor(cw.word, cw.meaning),
        easyExample:        cw.exampleText || exampleTextFor(cw.word),
        // Translation of the example SENTENCE (not the word's meaning) —
        // only real, AI-generated translations are shown; null until that
        // finishes, rather than substituting the word's meaning, which was
        // confusingly wrong for a full-sentence example.
        exampleTranslation: cw.exampleTranslation || null,
        quiz:            `${cw.word} means ____.`,
        answer:          cw.meaning || '',
        wordAudioUrl:    cw.wordAudioUrl || null,
        exampleAudioUrl: cw.exampleAudioUrl || null,
        // Raw DB id + example (nullable) — used to lazily (re)trigger server
        // audio/example generation when a word is opened without it. The
        // display `id` above is a word-text slug used elsewhere (missions,
        // quiz option de-dup) and must not change.
        dbId:            cw.id || null,
        exampleText:     cw.exampleText || null,
        // classId/unitId: the real DB foreign keys this word belongs to —
        // words are looked up via unit_id -> class_id in Supabase (never by
        // matching a className string), these are exposed for callers that
        // need to confirm/display which class+unit a word belongs to.
        classId:         cw.classId || classId,
        unitId:          cw.unitId || null,
      }
    }).filter(Boolean)

    // v1.3 날짜별 단어 배정: 오늘 지정된 단어가 있으면 그 서브셋만, 없으면
    // (배정 안 함/전부 삭제됨 등) 기존처럼 유닛 전체 단어를 그대로 보여줌 —
    // 기존 동작을 절대 깨뜨리지 않기 위한 폴백.
    if (Array.isArray(todaysAssignment) && todaysAssignment.length > 0) {
      const assignedSet = new Set(todaysAssignment)
      const filtered = mapped.filter((w) => assignedSet.has(w.id))
      if (filtered.length > 0) return filtered
    }
    return mapped
  } catch (err) {
    console.log('[wordLibrary] getStudentWords: query error', {
      selectedStudent: name,
      selectedClass: cls,
      selectedClassId: classId,
      selectedUnit: unitName,
      queryResult: null,
      queryError: err?.message || String(err),
    })
    return []
  }
}

// v1.3 관리자용 — 오늘 이 반에 배정된 단어 slug 목록 (없으면 빈 배열 =
// "배정 안 함", getStudentWords는 이 경우 유닛 전체 단어를 그대로 보여줌).
export function getTodaysAssignmentWordIds(className) {
  const classId = _cache[className]?.id
  if (!classId) return []
  return _dailyAssignments[classId] || []
}

// 반별 오늘의 단어 배정 저장/해제. wordIds가 빈 배열이면 배정을 지우는
// 것과 같음 (getStudentWords가 빈 배열은 "배정 없음"으로 취급).
export async function setTodaysAssignment(className, wordIds) {
  const classId = _cache[className]?.id
  if (!classId) return
  const { error } = await supabase.from('daily_assignments').upsert({
    class_id: classId,
    date: todayDateStr(),
    word_ids: wordIds,
  }, { onConflict: 'class_id,date' })
  if (error) throw error
  await refreshWordLibrary()
}
