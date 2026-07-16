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
// 2026-07-09 버그 수정: toISOString()은 UTC 기준이라, 한국(UTC+9)에서는
// 자정~오전 9시 사이에 실제 로컬 날짜보다 하루 전 날짜를 반환한다. 학생이
// 아침 일찍 공부한 기록이 UTC 기준 "어제" 날짜로 DB에 저장되고, 관리자가
// 같은 날 오전 9시 이후(이미 UTC도 날짜가 넘어간 뒤)에 확인하면 "오늘"
// 조회 날짜와 어긋나 "오늘 공부함"이 체크되지 않는 원인이었다. getFullYear/
// getMonth/getDate는 전부 로컬 타임존 기준이라 이걸로 YYYY-MM-DD를 직접
// 조립하면 학생 쪽(useStudent.js의 todayStr())과 항상 같은 날짜가 된다.
export function localIsoDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const todayDateStr = () => localIsoDateStr()

// Phase 1 (2026-07-15) 유닛 자연 정렬 — Supabase `units.position` 컬럼이
// 실제로는 새 유닛 추가 시(addClassUnit) 채워지지 않고 전부 0으로 저장돼
// 있어서(라이브 DB 확인 완료), order('position')이 사실상 아무 순서도
// 보장하지 못했다 — 그래서 "Unit1, Unit2, Unit6, Unit3, Unit5"처럼 Supabase가
// 반환한 순서 그대로 뒤섞여 보였다. position을 고치는 대신(기존 저장된
// 값을 잘못 재해석할 위험), 유닛 "이름"에서 숫자를 뽑아 자연 정렬한다 —
// "Unit 1, Unit 2, Unit 3, Unit 5, Unit 6" 순서가 나오고, 숫자가 없는
// 이름(그냥 "Unit")은 문자열 비교로 자연스럽게 뒤쪽에 놓인다. DB 값은 전혀
// 안 바꿈 — 표시 순서만 정렬.
function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g
  // 라이브 데이터에 "Unit 1"(공백 있음)과 "Unit8"(공백 없음)이 섞여 있어
  // (진단 스크립트로 확인) 공백을 먼저 제거하지 않으면 " " 문자 하나
  // 때문에 숫자 비교까지 가지도 못하고 문자열 청크에서 순서가 어긋난다
  // (예: "Unit " > "Unit"이 "1" vs "8" 숫자 비교보다 먼저 이겨버림).
  // 공백만 제거해 비교하고, 실제 표시 이름(a/b 원본)은 전혀 안 바꿈.
  const norm = (s) => String(s).replace(/\s+/g, '')
  const partsA = norm(a).match(re) || []
  const partsB = norm(b).match(re) || []
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const pa = partsA[i]
    const pb = partsB[i]
    if (pa === undefined) return -1
    if (pb === undefined) return 1
    const na = /^\d+$/.test(pa) ? Number(pa) : null
    const nb = /^\d+$/.test(pb) ? Number(pb) : null
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb
    } else {
      const cmp = pa.localeCompare(pb)
      if (cmp !== 0) return cmp
    }
  }
  return 0
}
const sortUnitsByName = (units) => [...units].sort((a, b) => naturalCompare(a.name, b.name))

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
  // 유닛을 이름 기준 자연 정렬 — position 컬럼이 신뢰 불가(위 설명 참고).
  Object.values(tree).forEach((cls) => { cls.units = sortUnitsByName(cls.units) })
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

// ── Students cache ──────────────────────────────────────────────────────
// P0 (2026-07-15) identity 리팩터링: 예전엔 이 캐시가 `{ [name]: {...} }`
// 였다 — 학생을 이름으로 전역 유일 식별한다는 잘못된 전제였고, 그래서
// 동명이인 학생(다른 반이라도)이 서로의 별/포인트/캘린더/학습기록을
// 덮어쓰는 실사고가 있었다(진단: 라이브 Supabase students.name에 UNIQUE
// 제약까지 걸려 있어 동명이인 자체가 DB 레벨에서 막혀 있었음 — 별도
// 마이그레이션 SQL로 제거 필요, supabase_v1_6_student_identity.sql 참고).
// 지금은 Map<studentId, {...}> — 학생의 유일한 식별자는 항상
// students.id(UUID)이고, 이름은 표시용일 뿐이다. 반별 로그인 후보 목록이
// 필요하면 getStudentsInClass()를 쓴다(이름은 여전히 그 안에서 표시 라벨).
let _students = new Map()

export async function refreshStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('id,name,class_id,unit_name,classes(name)')
    .order('created_at')
  if (error) throw error
  const map = new Map()
  data.forEach((s) => {
    map.set(s.id, {
      id: s.id,
      name: s.name,
      classId: s.class_id || null,
      className: s.classes?.name || '',
      unitName: s.unit_name || DEFAULT_UNIT_NAME,
    })
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
    await Promise.all([refreshWordLibrary(), refreshStudents(), refreshClassSettings()])
    if (Object.keys(_cache).length === 0) {
      await seedDefaultClasses()
      await refreshWordLibrary()
    }
  })()
  return _initPromise
}

// ── 쓰기 시험(Spelling Test) 반별 관리자 설정 ──────────────────────────────
// 별도의 격리된 조회 — classes 테이블의 select 목록에 이 컬럼들을 바로
// 끼워 넣지 않는 이유: supabase_spelling_test_schema.sql이 아직 실행되기
// 전이면 그 컬럼들 자체가 없어서 select 자체가 에러가 나고, 그게
// refreshWordLibrary() 안에 있으면 앱 전체(반/단어 로딩)가 깨짐. 이 조회는
// 완전히 분리해서 실패해도 그냥 "전부 꺼짐"으로 안전하게 기본값 처리 —
// SQL을 실행하기 전에 이 코드가 먼저 배포돼도 앱이 절대 깨지지 않음.
let _classSettings = {}
const DEFAULT_CLASS_SETTINGS = { spellingTestEnabled: false, spellingHintEnabled: false, wrongAnswerRepeatCount: 3, spellingDirection: 'kr2en' }
const VALID_SPELLING_DIRECTIONS = new Set(['kr2en', 'en2kr', 'random'])

export async function refreshClassSettings() {
  try {
    // spelling_direction 컬럼은 별도 마이그레이션(supabase_spelling_direction_
    // schema.sql)이라, 기존 spelling_test_enabled 등은 이미 실행돼 있는데
    // 이 컬럼만 아직 없는 "부분 마이그레이션" 상태가 있을 수 있음. select에
    // 없는 컬럼이 섞이면 쿼리 전체가 에러나서 이미 켜둔 다른 설정까지
    // 몽땅 꺼짐으로 되돌아가 버리므로, 먼저 컬럼 포함해서 시도하고 실패하면
    // 그 컬럼만 빼고 재시도해서 기존 설정은 그대로 유지되게 한다.
    let data
    let error
    ;({ data, error } = await supabase
      .from('classes').select('name,spelling_test_enabled,spelling_hint_enabled,wrong_answer_repeat_count,spelling_direction'))
    if (error) {
      ;({ data, error } = await supabase
        .from('classes').select('name,spelling_test_enabled,spelling_hint_enabled,wrong_answer_repeat_count'))
    }
    if (error) throw error
    _classSettings = Object.fromEntries((data || []).map((c) => [c.name, {
      spellingTestEnabled: !!c.spelling_test_enabled,
      spellingHintEnabled: !!c.spelling_hint_enabled,
      wrongAnswerRepeatCount: c.wrong_answer_repeat_count ?? 3,
      // supabase_spelling_direction_schema.sql이 아직 실행 안 됐거나(컬럼
      // null) 값이 이상하면 무조건 'kr2en'으로 폴백 — 기존에 이미 쓰기
      // 시험을 켜둔 반들이 아무것도 안 바꿨는데 동작이 달라지면 안 됨.
      spellingDirection: VALID_SPELLING_DIRECTIONS.has(c.spelling_direction) ? c.spelling_direction : 'kr2en',
    }]))
  } catch (err) {
    console.warn('[wordLibrary] class settings fetch failed (spelling_test_schema.sql이 아직 실행 안 됐을 수 있음, 전부 꺼짐으로 처리):', err.message)
    _classSettings = {}
  }
}

export function getClassSettings(className) {
  return _classSettings[className] || DEFAULT_CLASS_SETTINGS
}

export async function setClassSettings(className, settings) {
  const classId = _cache[className]?.id
  if (!classId) return
  const payload = {}
  if ('spellingTestEnabled' in settings) payload.spelling_test_enabled = !!settings.spellingTestEnabled
  if ('spellingHintEnabled' in settings) payload.spelling_hint_enabled = !!settings.spellingHintEnabled
  if ('wrongAnswerRepeatCount' in settings) payload.wrong_answer_repeat_count = Number(settings.wrongAnswerRepeatCount) || 3
  if ('spellingDirection' in settings) {
    payload.spelling_direction = VALID_SPELLING_DIRECTIONS.has(settings.spellingDirection) ? settings.spellingDirection : 'kr2en'
  }
  let { error } = await supabase.from('classes').update(payload).eq('id', classId)
  if (error && 'spelling_direction' in payload) {
    // spelling_direction 컬럼이 아직 없을 수 있음(마이그레이션 미실행) —
    // 그 필드만 빼고 재시도해서 나머지 설정(쓰기 시험 on/off 등)은 계속
    // 정상 저장되게 한다. 이거 없으면 방향 select UI가 추가된 것만으로
    // 기존 체크박스 저장까지 깨질 수 있음(회귀 금지 원칙).
    const { spelling_direction, ...rest } = payload
    ;({ error } = await supabase.from('classes').update(rest).eq('id', classId))
  }
  if (error) throw error
  await refreshClassSettings()
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
// getStudents()는 이제 이름 문자열 배열이 아니라 학생 객체 배열을
// 반환한다({id,name,className,classId,unitName}) — 호출부(AdminScreen/
// DebugPage)는 항상 s.id를 키로, s.name을 표시로 써야 한다.
export const getStudents = () => Array.from(_students.values())

export const getStudentById = (id) => _students.get(id) || null
export const getStudentName = (id) => _students.get(id)?.name || ''

// 이름으로 후보를 찾는 함수 — 이제 유일 식별이 불가능하므로(동명이인
// 허용) 단일 값이 아니라 배열을 반환한다. PIN 로그인은 서버(api/
// verify-student-pin.js)가 이 클라이언트 캐시와 무관하게 라이브 DB를
// 직접 조회해서 처리하므로, 이 함수는 관리자 도구/디버깅용으로만 남긴다.
export function findStudentByName(name) {
  const target = (name || '').trim().toLowerCase()
  if (!target) return []
  return Array.from(_students.values()).filter(s => s.name.trim().toLowerCase() === target)
}

// Students linked by class_id (the DB foreign key), never by matching the
// className string — so this stays correct even if the class was renamed
// after the student was assigned to it.
export function getStudentsInClass(className) {
  const classId = _cache[className]?.id
  if (!classId) return []
  return Array.from(_students.values())
    .filter(s => s.classId === classId)
    .map(s => ({ id: s.id, name: s.name, unitName: s.unitName }))
}

// 반환값: 새로 생성된 학생의 id(UUID). 호출부(StudentSelect.jsx 자기등록,
// AdminScreen.jsx)가 이 id로 곧바로 PIN 설정(api/set-student-pin.js) 및
// 로그인 세션을 이어간다. 동명이인 차단 로직은 의도적으로 제거했다 —
// 학생은 이제 이름이 아니라 id(PIN 로그인으로 찾아낸 id)로 식별되므로
// 같은 반이든 다른 반이든 이름이 겹쳐도 안전하다. DB에 남아있던
// students.name UNIQUE 제약은 별도 SQL 마이그레이션으로 제거 대상 —
// 아직 적용 전이면 Supabase가 23505(duplicate key)로 거부하는데, 그 경우
// 에러 메시지를 마이그레이션 필요성을 알 수 있게 보강해서 던진다.
export async function addStudent(name, className = '', unitName = DEFAULT_UNIT_NAME) {
  let classId = null
  if (className) classId = (await ensureClass(className)).id
  const { data, error } = await supabase
    .from('students').insert({ name, class_id: classId, unit_name: unitName || DEFAULT_UNIT_NAME })
    .select('id').single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('같은 이름의 학생이 이미 있어요. (관리자: supabase_v1_6_student_identity.sql의 UNIQUE 제약 제거 마이그레이션이 아직 적용 안 됐을 수 있어요)')
    }
    throw error
  }
  await refreshStudents()
  return data.id
}

export async function removeStudent(id) {
  const s = _students.get(id)
  if (!s) return
  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) throw error
  await refreshStudents()
}

export const getStudentClass = (id) => _students.get(id)?.className || ''
export const getStudentClassId = (id) => _students.get(id)?.classId || null
export const getStudentUnit = (id) => _students.get(id)?.unitName || DEFAULT_UNIT_NAME

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

// v1.8 입실시험 — 반 이름으로 classes.id 조회(관리자 화면은 반을 이름으로
// 다루지만 entrance_tests는 class_id FK로 저장하므로 변환이 필요).
// getClassNameById의 역방향. 없으면 null — 호출부가 안내 처리.
export function getClassIdByName(className) {
  return _cache[className]?.id || null
}

export async function setStudentClass(id, className) {
  const s = _students.get(id)
  if (!s) return
  const classId = className ? (await ensureClass(className)).id : null
  const payload = { class_id: classId }
  // P7 감사(2026-07-16): 예전엔 뒤에 bare .select()가 붙어 있었는데, 반환
  // 데이터를 아무도 안 쓰는데도 업데이트된 행의 "모든" 컬럼(pin_hash 포함)이
  // 네트워크 응답에 실려 내려왔다 — 제거(동작 불변, 응답에서 해시 노출만 차단).
  const { error } = await supabase.from('students').update(payload).eq('id', id)
  if (error) throw error
  await refreshStudents()
}

export async function setStudentUnit(id, unitName) {
  const s = _students.get(id)
  if (!s) return
  const payload = { unit_name: unitName }
  // P7 감사: bare .select() 제거 — setStudentClass와 동일한 pin_hash 응답 노출 차단.
  const { error } = await supabase.from('students').update(payload).eq('id', id)
  if (error) throw error
  await refreshStudents()
}

// Bulk reassignment (admin "일괄 이동") — one Supabase write + one refresh for
// N students, instead of N sequential setStudentClass/setStudentUnit calls
// (which would be 2N round-trips and could leave the roster in a
// half-moved state if one call in the middle failed).
export async function setStudentsClassBulk(ids, className, unitName) {
  const validIds = ids.filter(id => _students.has(id))
  if (validIds.length === 0) return
  const classId = className ? (await ensureClass(className)).id : null
  const { error } = await supabase.from('students').update({ class_id: classId, unit_name: unitName }).in('id', validIds)
  if (error) throw error
  await refreshStudents()
}

// v1.3 admin dashboard — one-way, fire-and-forget sync of a student's
// progress from their device's localStorage (the source of truth, never
// touched by this) into Supabase, so the admin can see it from a different
// device. Every caller already wraps this in .catch(() => {}) — never
// throw somewhere that would surface as a student-facing error, since
// missing/offline sync must never block or visibly affect the lesson flow.
//
// v1.4: also upserts `fullRecord` (the ENTIRE useStudent.js record object —
// streak/calendar history/missions/stickers/diary, not just the summary
// numbers above) into student_progress.progress_data (+ denormalized
// streak_count/total_xp/calendar_data/mission_data/review_data columns for
// quick SQL access — see supabase_v1_4_full_progress_backup.sql). This is a
// real cloud BACKUP, not just admin-dashboard analytics — see
// fetchFullProgress() below, which useStudent.js calls to restore a
// student's progress if their device's localStorage is ever empty/wiped.
// fullRecord is optional so existing callers (and the sync test) that don't
// pass it keep working. `onConflict: 'student_id'` matters here: the v1.4
// table uses a separate `id` primary key (not student_id), so without it
// upsert() would always INSERT a new row instead of updating the existing
// one.
// studentId(UUID)를 직접 FK로 쓴다 — 예전엔 이름으로 _students 캐시를
// 조회해 id를 얻어야 했지만(캐시가 아직 안 채워졌으면 "student not yet
// known" 상태로 조용히 스킵되는 취약점이 있었다), 이제 호출부가 이미
// id를 들고 있으므로 캐시 의존 없이 항상 정확한 FK로 쓴다.
export async function syncStudentProgress(studentId, { totalStars, clearedCount, streak, stickersCount, daily, fullRecord }) {
  if (!studentId) return
  const today = localIsoDateStr() // 로컬(한국) 날짜 — UTC 쓰면 안 됨(위 localIsoDateStr 주석 참고)

  const progressRow = {
    student_id: studentId,
    total_stars: totalStars,
    cleared_count: clearedCount,
    streak,
    stickers_count: stickersCount,
    last_studied_date: today,
    updated_at: new Date().toISOString(),
  }
  if (fullRecord) {
    progressRow.progress_data = fullRecord
    progressRow.streak_count = streak
    progressRow.total_xp = totalStars
    progressRow.calendar_data = fullRecord.history || {}
    progressRow.mission_data = { missions: fullRecord.missions || [], cleared: fullRecord.cleared || [] }
    progressRow.review_data = { spellingWrongToday: fullRecord.round?.spellingWrongToday || [] }
  }

  const { error: progressErr } = await supabase.from('student_progress').upsert(progressRow, { onConflict: 'student_id' })
  if (progressErr) throw progressErr

  const { error: dailyErr } = await supabase.from('student_daily_progress').upsert({
    student_id: studentId,
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

// v1.4 — reads back the full progress backup for a student (see
// syncStudentProgress's fullRecord above). Returns null if the student is
// unknown, has never synced, the `progress_data` column/table doesn't exist
// yet (migration not run — see supabase_v1_4_full_progress_backup.sql) or
// the backup itself is empty. Callers must treat null as "no backup
// available", not as an error — never used to overwrite existing local
// data, only to restore when local is missing.
export async function fetchFullProgress(studentId) {
  if (!studentId) return null
  const { data, error } = await supabase
    .from('student_progress')
    .select('progress_data')
    .eq('student_id', studentId)
    .maybeSingle()
  if (error || !data?.progress_data || Object.keys(data.progress_data).length === 0) return null
  return data.progress_data
}

// v1.5 "알아요/모르겠어요" (Skip) 기능 — 단어별 숙지 상태를 word_status
// 테이블에 저장한다. 학생 이름이 아니라 words.id(UUID, word.dbId)로 저장
// 하므로 word_status.sql(v1.5) 마이그레이션이 먼저 반영돼 있어야 한다 —
// 반영 전이면(테이블/컬럼 없음) 에러를 조용히 삼키고 로컬 저장만 유지
// (기존 progress_data 백업과 동일한 안전 원칙: 클라우드 동기화 실패가
// 학생의 학습 흐름을 절대 막지 않음).
export async function setWordStatus(studentId, wordDbId, status) {
  if (!studentId || !wordDbId) return
  const { error } = await supabase.from('word_status').upsert({
    student_id: studentId,
    word_id: wordDbId,
    status,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,word_id' })
  if (error) throw error
}

// 로그인 시 로컬에 저장된 단어 상태가 없으면(다른 기기 등) 이걸로 복구.
// { [wordDbId]: status } 형태의 맵을 반환, 에러/빈 결과는 빈 객체.
export async function fetchWordStatusMap(studentId) {
  if (!studentId) return {}
  const { data, error } = await supabase.from('word_status').select('word_id,status').eq('student_id', studentId)
  if (error || !data) return {}
  return Object.fromEntries(data.map((r) => [r.word_id, r.status]))
}

// v1.5 관리자 대시보드 — 반 학생들의 "아는/모르는/복습 필요 단어 수"를
// 한 번에 배치 조회(학생별 N번 조회 안 함, fetchDashboardData와 동일 패턴).
// P0(2026-07-15): studentIds를 직접 받는다 — 예전엔 이름 배열을 받아
// _students 캐시로 id를 재조회했지만, 이제 호출부가 이미 id를 들고 있다.
export async function fetchWordStatusSummary(studentIds) {
  const ids = (studentIds || []).filter(Boolean)
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('word_status').select('student_id,status').in('student_id', ids)
  if (error || !data) return {}
  const byStudent = {}
  data.forEach((r) => {
    const bucket = (byStudent[r.student_id] ||= { known: 0, unknown: 0, skipped: 0, mastered: 0 })
    if (bucket[r.status] !== undefined) bucket[r.status]++
  })
  return byStudent
}

// v1.5 관리자 — 특정 학생의 단어 숙지 상태를 전부 초기화("다시 전체
// 복습 대상으로 포함") — word_status 행을 지우면 그 학생에게는 해당
// 단어들이 다시 "아직 상태 없음"으로 보여 어떤 학습 모드에서도 다시
// 나타난다. 다른 학생/다른 데이터는 전혀 건드리지 않음.
//
// 2026-07-10 데이터 정합성 수정: word_status 테이블만 지우고 끝내면,
// student_progress.progress_data(전체 기록 클라우드 백업, fullRecord)
// 안에는 예전 wordStatus 값이 그대로 남아있었다 — 이 학생이 나중에
// 정말로 기기를 잃어버려 새 기기에서 복구하면(fetchFullProgress),
// 방금 관리자가 초기화한 값이 그대로 되살아나는 조용한 재발 버그가
// 있었다. 백업 blob의 wordStatus만 함께 비워서 막는다. (주의: 이
// 학생이 지금 로그인해 있는 기기의 로컬 localStorage는 서버가 직접
// 건드릴 수 없으므로 별개 — 그 기기는 다음에 스스로 뭔가 동기화할 때
// 자기 로컬 값을 그대로 다시 올려보낸다. 이건 이 함수의 책임 범위 밖.)
export async function resetWordStatus(studentId) {
  if (!studentId) return
  const { error } = await supabase.from('word_status').delete().eq('student_id', studentId)
  if (error) throw error
  const { data: existing, error: fetchErr } = await supabase
    .from('student_progress').select('progress_data').eq('student_id', studentId).maybeSingle()
  if (fetchErr) throw fetchErr
  if (existing?.progress_data && Object.keys(existing.progress_data).length > 0) {
    const nextProgressData = { ...existing.progress_data, wordStatus: {} }
    const { error: updateErr } = await supabase
      .from('student_progress').update({ progress_data: nextProgressData }).eq('student_id', studentId)
    if (updateErr) throw updateErr
  }
}

// v1.5 Stability Milestone — hidden admin Debug page support. Pulls every
// Supabase-side row for one student in one shot (student_progress single
// row, last 14 days of student_daily_progress, all word_status rows) so the
// Debug page can show "what's actually in the DB right now" next to
// whatever's in this device's localStorage, without needing N separate
// round-trips. word_status errors (e.g. v1.5 migration not run yet on this
// project) are swallowed to an empty array + error string rather than
// thrown, since the rest of the snapshot is still useful on its own.
export async function fetchDebugSnapshot(studentId) {
  const s = _students.get(studentId)
  if (!s) return { student: null, progress: null, daily: [], wordStatusRows: [], wordStatusError: null }
  const [progressRes, dailyRes, wsRes] = await Promise.all([
    supabase.from('student_progress').select('*').eq('student_id', studentId).maybeSingle(),
    supabase.from('student_daily_progress').select('*').eq('student_id', studentId).order('date', { ascending: false }).limit(14),
    supabase.from('word_status').select('*').eq('student_id', studentId),
  ])
  if (progressRes.error) throw progressRes.error
  if (dailyRes.error) throw dailyRes.error
  return {
    student: { id: s.id, name: s.name, className: s.className, unitName: s.unitName },
    progress: progressRes.data || null,
    daily: dailyRes.data || [],
    wordStatusRows: wsRes.error ? [] : (wsRes.data || []),
    wordStatusError: wsRes.error ? wsRes.error.message : null,
  }
}

// Returns full word objects for a student, sourced ONLY from Supabase class
// data — word and meaning always come straight from the DB row, never from
// the built-in demo bank (data/words.js), even if the text happens to match.
// No class assigned (on this device) or an empty unit both mean "no words
// yet"; the screen shows nothing rather than substituting sample content.
export const getStudentWords = (studentId) => {
  const classId = getStudentClassId(studentId)
  const unitName = getStudentUnit(studentId)
  // Resolve the class by id first (robust to renames) — the joined
  // className is only a fallback for legacy rows with no class_id at all.
  const cls = getClassNameById(classId) || getStudentClass(studentId)
  try {
    if (!cls) {
      console.log('[wordLibrary] getStudentWords: no class resolved', {
        selectedStudentId: studentId,
        selectedClass: getStudentClass(studentId),
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
        selectedStudentId: studentId,
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
      selectedStudentId: studentId,
      selectedClass: cls,
      selectedClassId: classId,
      selectedUnit: unitName,
      queryResult: null,
      queryError: err?.message || String(err),
    })
    return []
  }
}

// v1.5 Skip 기능 — "학습 모드"(scope)에 따라 이번 세션에 보여줄 단어만
// 골라낸다. wordStatus는 useStudent.js의 record.wordStatus({ [dbId]:
// status }), reviewWordIds는 기존 복습 소스(레벨업 미션 대기 단어 +
// 오늘 오답노트)의 word id(슬러그) Set — "복습 단어만"은 이 Skip 기능
// 하나만이 아니라 앱에 이미 있던 복습 신호까지 합쳐서 보여준다.
export function filterWordsByScope(words, scope, wordStatus = {}, reviewWordIds = new Set()) {
  switch (scope) {
    case 'unknown':
      return words.filter((w) => wordStatus[w.dbId] === 'unknown')
    case 'unseen':
      return words.filter((w) => !wordStatus[w.dbId])
    case 'review':
      return words.filter((w) => wordStatus[w.dbId] === 'unknown' || reviewWordIds.has(w.id))
    default:
      return words
  }
}

// v1.3 관리자 대시보드용 — 반 학생들의 누적 진행도 + 최근 일별 기록을 한
// 번에 배치 조회 (학생별로 N번 조회하지 않음). 최근 60일로 제한해 계정이
// 오래될수록 쿼리가 무한정 커지지 않게 함 — "최근 7일"/최근 정답률·발음
// 횟수·많이 틀린 단어 전부 이 정도 기간이면 충분히 의미 있는 표본.
// P0(2026-07-15): studentIds를 직접 받는다(예전엔 이름 배열 → _students
// 캐시로 id 재조회). name은 여전히 결과에 포함하되(표시용, AdminScreen/
// ParentScreen/CSV/weeklyReport가 그대로 씀), 캐시에서 조회해 채운다 —
// 캐시가 아직 그 학생을 모르면(드묾) '(알 수 없음)'으로 안전하게 표시.
export async function fetchDashboardData(studentIds) {
  const ids = (studentIds || []).filter(Boolean)
  if (ids.length === 0) return []

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 60)
  const cutoffStr = localIsoDateStr(cutoff)

  const [progressRes, dailyRes] = await Promise.all([
    supabase.from('student_progress').select('*').in('student_id', ids),
    supabase.from('student_daily_progress').select('*').in('student_id', ids).gte('date', cutoffStr).order('date', { ascending: false }),
  ])
  if (progressRes.error) throw progressRes.error
  if (dailyRes.error) throw dailyRes.error

  const progressByStudent = Object.fromEntries((progressRes.data || []).map(p => [p.student_id, p]))
  const dailyByStudent = {}
  ;(dailyRes.data || []).forEach(d => {
    if (!dailyByStudent[d.student_id]) dailyByStudent[d.student_id] = []
    dailyByStudent[d.student_id].push(d)
  })

  return ids.map(id => ({
    id,
    studentId: id,
    name: _students.get(id)?.name || '(알 수 없음)',
    progress: progressByStudent[id] || null,
    dailyRows: dailyByStudent[id] || [],
  }))
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
  return setAssignmentForDate(className, todayDateStr(), wordIds)
}

// v1.3 "날짜별 숙제 배정" — 오늘 외의 날짜(주로 내일 이후, 미리 준비) 배정
// 조회/저장. 미래 날짜는 그날이 되기 전까지 학생에게 전혀 영향 없음
// (getStudentWords는 오늘 날짜로 미리 로드된 _dailyAssignments 캐시만
// 봄) — 과거 날짜를 고쳐써서 이미 지나간 학습 기록을 바꾸는 실수를
// 막기 위해 관리자 화면에서는 오늘 이전 날짜를 선택할 수 없게 함.
export async function getAssignmentForDate(className, dateStr) {
  const classId = _cache[className]?.id
  if (!classId) return []
  const { data, error } = await supabase.from('daily_assignments')
    .select('word_ids').eq('class_id', classId).eq('date', dateStr).maybeSingle()
  if (error) throw error
  return data?.word_ids || []
}

export async function setAssignmentForDate(className, dateStr, wordIds) {
  const classId = _cache[className]?.id
  if (!classId) return
  const { error } = await supabase.from('daily_assignments').upsert({
    class_id: classId,
    date: dateStr,
    word_ids: wordIds,
  }, { onConflict: 'class_id,date' })
  if (error) throw error
  await refreshWordLibrary()
}
