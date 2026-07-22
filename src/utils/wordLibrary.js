import { supabase } from './supabaseClient'
// House System(2026-07-19, 게임화 하위카드 8번) — 순수 배정/집계 함수만
// import한다(HOUSES 상수/assignBalancedHouseId/computeHouseCounts/
// computeHouseWeeklyScores). houseSystem.js 자신은 이 파일을 거꾸로
// import하지 않는다(순수 모듈 무의존 원칙, houseSystem.js 헤더 참고) —
// 여기(브라우저 측 데이터 계층)에서 순수 함수를 소비하는 것은
// ticketEconomy.js를 useStudent.js가 소비하는 것과 같은 방향의 의존이다.
import { HOUSES, assignBalancedHouseId, computeHouseCounts, computeHouseWeeklyScores, computeHouseSeasonScores } from './houseSystem'

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

// words 조회 — accepted_meanings(v2.0, 단어별 추가 인정 뜻) 컬럼은 아직
// SQL 마이그레이션(supabase_v2_0_spelling_mixed.sql)이 실행 안 됐을 수
// 있어서, 컬럼 포함으로 먼저 시도하고 실패하면 그 컬럼만 빼고 재시도한다
// (refreshClassSettings의 spelling_direction과 동일한 부분 마이그레이션
// 안전 패턴 — SQL보다 코드가 먼저 배포돼도 앱이 절대 깨지지 않음).
const WORDS_SELECT_BASE = 'id,unit_id,word,meaning,position,word_audio_url,example_audio_url,example_text,example_translation,memory_tip'
async function fetchWordsRows() {
  let res = await supabase.from('words').select(`${WORDS_SELECT_BASE},accepted_meanings`).order('position')
  if (res.error) res = await supabase.from('words').select(WORDS_SELECT_BASE).order('position')
  return res
}

export async function refreshWordLibrary() {
  const [classesRes, unitsRes, wordsRes, assignmentsRes] = await Promise.all([
    supabase.from('classes').select('id,name,class_type').order('created_at'),
    supabase.from('units').select('id,class_id,name,position').order('position'),
    fetchWordsRows(),
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
        // v2.0 단어별 추가 인정 뜻 — 컬럼 미존재(마이그레이션 전)/null이면
        // 빈 목록(기존 채점과 완전 동일 동작).
        acceptedMeanings: Array.isArray(w.accepted_meanings) ? w.accepted_meanings.filter((m) => typeof m === 'string' && m.trim()) : [],
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

// v2.1 학생-Unit 분리 — current_unit_id(uuid FK)가 학생 현재 유닛의 1차
// 저장소, unit_name(문자열)은 하위호환 폴백. 컬럼이 아직 없으면(마이그레이션
// supabase_v2_1_student_unit_decouple.sql 실행 전) 그 컬럼만 빼고 재시도 —
// refreshClassSettings/fetchWordsRows와 동일한 부분 마이그레이션 안전 패턴
// (SQL보다 코드가 먼저 배포돼도 앱이 절대 깨지지 않음).
const STUDENTS_SELECT_BASE = 'id,name,class_id,unit_name,classes(name)'
export async function refreshStudents() {
  // House System(2026-07-19) — house_id도 current_unit_id와 같은 컬럼
  // 부재 폴백이 필요(supabase_v2_7_house_system.sql 미실행 대비). 두 신규
  // 컬럼이 서로 다른 마이그레이션(v2.1/v2.7)에 속해 독립적으로 실행될 수
  // 있으므로, 어느 한쪽만 있어도 안전하게 동작해야 한다 — 3단계로
  // cascading 폴백한다(둘 다 있음 → current_unit_id만 있음 → 둘 다 없음).
  let res = await supabase
    .from('students')
    .select(`${STUDENTS_SELECT_BASE},current_unit_id,house_id`)
    .order('created_at')
  if (res.error) {
    res = await supabase
      .from('students')
      .select(`${STUDENTS_SELECT_BASE},current_unit_id`)
      .order('created_at')
  }
  if (res.error) {
    res = await supabase.from('students').select(STUDENTS_SELECT_BASE).order('created_at')
  }
  const { data, error } = res
  if (error) throw error
  const map = new Map()
  data.forEach((s) => {
    map.set(s.id, {
      id: s.id,
      name: s.name,
      classId: s.class_id || null,
      className: s.classes?.name || '',
      unitName: s.unit_name || DEFAULT_UNIT_NAME,
      // 컬럼 부재/백필 전 null — 이름 폴백 경로가 기존 동작 그대로 커버.
      unitId: s.current_unit_id || null,
      // 컬럼 부재(v2.7 SQL 미실행)/미배정이면 null — 화면은 "하우스
      // 미배정"으로 안전하게 처리(houseSystem.js getOwnHouseWeeklyDisplay
      // 가 null 반환).
      houseId: s.house_id != null ? Number(s.house_id) : null,
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
    // v3.1 교재 레이어 — 반/유닛 캐시가 준비된 뒤 로드(합성 폴백이 _cache에
    // 의존). 실패해도 앱은 "반=교재 1개" 폴백으로 오늘과 동일 동작.
    await refreshTextbooks()
  })()
  return _initPromise
}

// ════════════════════════════════════════════════════════════════════════
// v3.1 교재(Textbook) 레이어 — 도메인 모델 교정(2026-07-22, 운영자 지시):
//   반(사람 그룹) → 교재(출판사/저자) → 유닛 → 단어.
// supabase_v3_1_textbooks.sql 실행 전에는 테이블 부재를 감지해 "유닛 보유
// 반 = 자동 교재 1개(자기 반에 연결)" 합성으로 폴백 — 오늘과 100% 동일
// 동작(규칙 9). 실행 후에는 class_textbooks 연결로 한 반이 여러 교재를,
// 한 교재가 여러 반을 가질 수 있다(단어 중복 없음).
//
// 학생별 교재 상태는 v2.9 student_class_assignments를 그대로 재사용 —
// 행의 class_id는 "교재의 소유 컨테이너"(units.class_id의 반)라 기존
// unique(student_id, class_id)와 호환. 의미론 교정 한 가지: 교재 전환이
// students.class_id(사람 반)를 더 이상 바꾸지 않는다(setPrimaryTextbook).
// ════════════════════════════════════════════════════════════════════════
let _textbooks = new Map()        // textbookId -> {id, name, publisherName, ownerClassId}
let _classTextbooks = new Map()   // classId -> [textbookId...] (sort_order 순)
let _textbookMode = false         // true = 실제 테이블 로드됨(합성 아님)

const SYNTH_TB_PREFIX = 'synthetic-tb:'
function synthesizeTextbooks() {
  _textbooks = new Map()
  _classTextbooks = new Map()
  for (const [name, cls] of Object.entries(_cache)) {
    if (!cls.id || (cls.units || []).length === 0) continue
    const tbId = SYNTH_TB_PREFIX + cls.id
    _textbooks.set(tbId, { id: tbId, name, publisherName: null, ownerClassId: cls.id })
    _classTextbooks.set(cls.id, [tbId])
  }
  _textbookMode = false
}

export async function refreshTextbooks() {
  try {
    const [tbRes, ctRes] = await Promise.all([
      supabase.from('textbooks').select('id,name,publisher_name,owner_class_id'),
      supabase.from('class_textbooks').select('class_id,textbook_id,enabled,sort_order').order('sort_order'),
    ])
    if (tbRes.error || ctRes.error) {
      synthesizeTextbooks() // 테이블 부재(SQL 미실행)/일시 실패 — 합성 폴백
      return
    }
    _textbooks = new Map((tbRes.data || []).map((t) => [t.id, {
      id: t.id, name: t.name, publisherName: t.publisher_name || null, ownerClassId: t.owner_class_id || null,
    }]))
    _classTextbooks = new Map()
    for (const r of ctRes.data || []) {
      if (r.enabled === false) continue
      if (!_classTextbooks.has(r.class_id)) _classTextbooks.set(r.class_id, [])
      _classTextbooks.get(r.class_id).push(r.textbook_id)
    }
    _textbookMode = _textbooks.size > 0
    if (!_textbookMode) synthesizeTextbooks() // 테이블은 있는데 백필 전 — 합성 유지
  } catch {
    synthesizeTextbooks()
  }
}

export const isTextbookMode = () => _textbookMode
export const getTextbookById = (id) => _textbooks.get(id) || null

// 반에 연결된 교재 목록(정렬 순) — 교재 선택기의 원천. 합성 모드에서는
// 항상 자기 반의 자동 교재 1개뿐이라 선택기가 렌더되지 않는다(기존 화면
// 변화 0).
export function getClassTextbooks(classId) {
  if (!classId) return []
  return (_classTextbooks.get(classId) || []).map((id) => _textbooks.get(id)).filter(Boolean)
}

// 교재의 유닛 목록 — 소유 컨테이너 반의 유닛(= 그 교재의 전체 콘텐츠).
export function getTextbookUnits(textbookId) {
  const tb = _textbooks.get(textbookId)
  if (!tb || !tb.ownerClassId) return []
  const clsName = getClassNameById(tb.ownerClassId)
  return _cache[clsName]?.units || []
}

// 반 소속 자동 교재(그 반이 소유 컨테이너인 교재) — 상태 행의 textbook_id
// 폴백 해석(백필 전 NULL 행)에 쓰인다.
export function getOwnTextbookOfClass(classId) {
  if (!classId) return null
  for (const tb of _textbooks.values()) if (tb.ownerClassId === classId) return tb
  return null
}

// 학생의 현재(primary) 교재 — 상태 행 캐시(_studentAssignmentsCache)에서
// 동기 해석. 캐시가 아직 차기 전(콜드 스타트)엔 학생 반의 자동 교재로
// 폴백 — 기존 단일 반 동작과 동일한 결과라 화면이 절대 깨지지 않는다.
export function getStudentPrimaryTextbook(studentId) {
  const cached = _studentAssignmentsCache.get(studentId)
  const primary = cached?.find((a) => a.isPrimary)
  if (primary?.textbookId && _textbooks.has(primary.textbookId)) return _textbooks.get(primary.textbookId)
  if (primary?.classId) {
    const own = getOwnTextbookOfClass(primary.classId)
    if (own) return own
  }
  return getOwnTextbookOfClass(getStudentClassId(studentId))
}

// ── 쓰기 시험(Spelling Test) 반별 관리자 설정 ──────────────────────────────
// 별도의 격리된 조회 — classes 테이블의 select 목록에 이 컬럼들을 바로
// 끼워 넣지 않는 이유: supabase_spelling_test_schema.sql이 아직 실행되기
// 전이면 그 컬럼들 자체가 없어서 select 자체가 에러가 나고, 그게
// refreshWordLibrary() 안에 있으면 앱 전체(반/단어 로딩)가 깨짐. 이 조회는
// 완전히 분리해서 실패해도 그냥 "전부 꺼짐"으로 안전하게 기본값 처리 —
// SQL을 실행하기 전에 이 코드가 먼저 배포돼도 앱이 절대 깨지지 않음.
let _classSettings = {}
// spellingDirection 기본값 'mixed'(2026-07-17 운영자 지시: "혼합 50:50이
// 기본") — 예전 기본은 'kr2en'(기존 동작 보존)이었으나, 방향 기능이 나오자
// 마자 운영자가 혼합을 기본으로 확정. 기존 반들도 일괄 'mixed'로 전환됨
// (scripts/opsSetAllClassesMixed.mjs). 특정 반만 한→영으로 돌리려면 관리자
// 화면 출제 방향에서 바꾸면 됨. mixed는 클라이언트만으로 완전 동작
// (App.jsx assignDirections — DB 컬럼이 없어도 배정 자체는 로컬 계산).
// gamificationEnabled(2026-07-19, Teacher Controls 마스터 스위치,
// GAME_DESIGN.md 13번 섹션) — spelling_test_enabled와 동일한 opt-in 관례,
// 기본 false. 컬럼이 아직 없거나(supabase_v2_5_gamification_master_switch.sql
// 미실행) 값이 없으면 항상 false로 폴백(Rank/XP UI가 절대 갑자기 노출되지
// 않게 하는 안전한 기본값 — Dashboard.jsx 게이팅이 이 값을 그대로 씀).
const DEFAULT_CLASS_SETTINGS = { spellingTestEnabled: false, spellingHintEnabled: false, wrongAnswerRepeatCount: 3, spellingDirection: 'mixed', gamificationEnabled: false }
// v2.0: 'mixed'(세션 단위 정확 50:50 배분) 추가 — 배정 로직 자체는
// entranceTest.js의 assignDirections(입실시험과 공용)가 담당.
const VALID_SPELLING_DIRECTIONS = new Set(['kr2en', 'en2kr', 'random', 'mixed'])

export async function refreshClassSettings() {
  try {
    // spelling_direction 컬럼은 별도 마이그레이션(supabase_spelling_direction_
    // schema.sql)이라, 기존 spelling_test_enabled 등은 이미 실행돼 있는데
    // 이 컬럼만 아직 없는 "부분 마이그레이션" 상태가 있을 수 있음. select에
    // 없는 컬럼이 섞이면 쿼리 전체가 에러나서 이미 켜둔 다른 설정까지
    // 몽땅 꺼짐으로 되돌아가 버리므로, 먼저 컬럼 포함해서 시도하고 실패하면
    // 그 컬럼만 빼고 재시도해서 기존 설정은 그대로 유지되게 한다.
    // gamification_enabled(v2.5)도 spelling_direction과 같은 이유로 별도
    // 마이그레이션이라 부분 실행 상태가 있을 수 있다 — 가장 넓은 select부터
    // 시도하고, 실패하면 최근에 추가된 컬럼부터 하나씩 빼며 재시도해서 이미
    // 켜둔 다른 설정이 이 컬럼 하나 때문에 몽땅 꺼짐으로 되돌아가지 않게 한다.
    let data
    let error
    ;({ data, error } = await supabase
      .from('classes').select('name,spelling_test_enabled,spelling_hint_enabled,wrong_answer_repeat_count,spelling_direction,gamification_enabled'))
    if (error) {
      ;({ data, error } = await supabase
        .from('classes').select('name,spelling_test_enabled,spelling_hint_enabled,wrong_answer_repeat_count,spelling_direction'))
    }
    if (error) {
      ;({ data, error } = await supabase
        .from('classes').select('name,spelling_test_enabled,spelling_hint_enabled,wrong_answer_repeat_count'))
    }
    if (error) throw error
    _classSettings = Object.fromEntries((data || []).map((c) => [c.name, {
      spellingTestEnabled: !!c.spelling_test_enabled,
      spellingHintEnabled: !!c.spelling_hint_enabled,
      wrongAnswerRepeatCount: c.wrong_answer_repeat_count ?? 3,
      // 컬럼이 아직 없거나(부분 마이그레이션) 값이 이상하면 'mixed' 폴백
      // (2026-07-17 기본값 변경 — DEFAULT_CLASS_SETTINGS 주석 참고).
      // mixed 배정은 App.jsx의 로컬 계산이라 컬럼 부재 상태에서도 완전 동작.
      spellingDirection: VALID_SPELLING_DIRECTIONS.has(c.spelling_direction) ? c.spelling_direction : 'mixed',
      // Teacher Controls 마스터 스위치(2026-07-19) — 컬럼 부재/null/false
      // 전부 false로 수렴(opt-in, DEFAULT_CLASS_SETTINGS 주석 참고).
      gamificationEnabled: !!c.gamification_enabled,
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
    payload.spelling_direction = VALID_SPELLING_DIRECTIONS.has(settings.spellingDirection) ? settings.spellingDirection : 'mixed'
  }
  // Teacher Controls 마스터 스위치(2026-07-19, GAME_DESIGN.md 13번 섹션).
  if ('gamificationEnabled' in settings) payload.gamification_enabled = !!settings.gamificationEnabled
  let payloadToSend = payload
  let { error } = await supabase.from('classes').update(payloadToSend).eq('id', classId)
  if (error && 'spelling_direction' in payloadToSend) {
    // spelling_direction 컬럼이 아직 없을 수 있음(마이그레이션 미실행) —
    // 그 필드만 빼고 재시도해서 나머지 설정(쓰기 시험 on/off 등)은 계속
    // 정상 저장되게 한다. 이거 없으면 방향 select UI가 추가된 것만으로
    // 기존 체크박스 저장까지 깨질 수 있음(회귀 금지 원칙).
    const { spelling_direction, ...rest } = payloadToSend
    payloadToSend = rest
    ;({ error } = await supabase.from('classes').update(payloadToSend).eq('id', classId))
  }
  if (error && 'gamification_enabled' in payloadToSend) {
    // gamification_enabled 컬럼이 아직 없을 수 있음
    // (supabase_v2_5_gamification_master_switch.sql 미실행) — 그 필드만
    // 빼고 재시도해서 나머지 설정 저장은 계속 정상 동작하게 한다.
    const { gamification_enabled, ...rest } = payloadToSend
    payloadToSend = rest
    ;({ error } = await supabase.from('classes').update(payloadToSend).eq('id', classId))
  }
  if (error) throw error
  await refreshClassSettings()
}

// v2.0 단어별 추가 인정 뜻 저장 — 관리자 화면(단어별 편집 + 교사 검토 큐의
// "이 답 인정")만 호출. 컬럼 미존재(마이그레이션 전)면 에러를 그대로 던져
// 호출부가 alert로 안내(조용히 삼키면 관리자가 저장된 줄 착각함).
export async function setWordAcceptedMeanings(wordDbId, meanings) {
  const list = (Array.isArray(meanings) ? meanings : [])
    .map((m) => String(m ?? '').trim())
    .filter(Boolean)
  // 중복 제거(대소문자/공백 무시 기준) — 같은 뜻이 큐에서 두 번 인정돼도 1개만
  const seen = new Set()
  const deduped = list.filter((m) => {
    const key = m.toLowerCase().replace(/\s+/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const { error } = await supabase.from('words').update({ accepted_meanings: deduped }).eq('id', wordDbId)
  if (error) throw error
  await refreshWordLibrary()
  return deduped
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
// unitName은 항상 "해석된" 값(resolveStudentUnitObj — id 우선)으로 내보낸다 —
// 관리자 로스터/CSV가 학생이 실제로 보고 있는 유닛과 절대 어긋나지 않게.
export const getStudents = () =>
  Array.from(_students.values()).map((s) => ({ ...s, unitName: getStudentUnit(s.id) }))

export const getStudentById = (id) => _students.get(id) || null

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
    .map(s => ({ id: s.id, name: s.name, unitName: getStudentUnit(s.id) }))
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
  const baseRow = { name, class_id: classId, unit_name: unitName || DEFAULT_UNIT_NAME }
  // v2.1: 첫 유닛 id를 함께 기록(반의 유닛 중 이름 일치 — 없으면 null,
  // 폴백이 커버). 컬럼 부재(마이그레이션 전) 에러면 기존 row로 재시도 —
  // 단, 23505(동명 UNIQUE 제약)는 컬럼 문제가 아니므로 재시도 없이 기존
  // 안내 에러 경로로 바로 보낸다.
  const unitId = className
    ? (_cache[className]?.units.find((u) => u.name === baseRow.unit_name)?.id || null)
    : null
  // House System(2026-07-19) — 자동 배정: 이미 메모리에 있는 전체 학생
  // 캐시(_students, refreshStudents가 앱 시작 시 반 무관하게 전원 로드)로
  // 현재 하우스별 인원을 계산해 가장 적은 하우스에 배정한다(별도 DB 집계
  // 쿼리 없음, 결정론적 라운드로빈 — houseSystem.js assignBalancedHouseId
  // 참고).
  const houseId = assignBalancedHouseId(computeHouseCounts(Array.from(_students.values())))
  // v2.1(current_unit_id)과 v2.7(house_id)은 서로 다른 마이그레이션이라
  // 어느 한쪽만 실행된 상태가 있을 수 있다 — 단일 폴백(전부 아니면 bare
  // baseRow)이면 house_id 컬럼만 없어도 이미 실행된 current_unit_id까지
  // 함께 못 쓰게 되는 회귀가 생긴다(실측 확인, testStudentUnitDecouple.mjs
  // FAIL로 재현됨). refreshStudents()와 같은 3단계 cascading 폴백으로 수정.
  let { data, error } = await supabase
    .from('students').insert({ ...baseRow, current_unit_id: unitId, house_id: houseId })
    .select('id').single()
  if (error && error.code !== '23505') {
    ;({ data, error } = await supabase
      .from('students').insert({ ...baseRow, current_unit_id: unitId })
      .select('id').single())
  }
  if (error && error.code !== '23505') {
    ;({ data, error } = await supabase.from('students').insert(baseRow).select('id').single())
  }
  if (error) {
    if (error.code === '23505') {
      throw new Error('같은 이름의 학생이 이미 있어요. (관리자: supabase_v1_6_student_identity.sql의 UNIQUE 제약 제거 마이그레이션이 아직 적용 안 됐을 수 있어요)')
    }
    throw error
  }
  await refreshStudents()
  // v2.9(다중 교재, 2026-07-21 라이브 e2e로 발견된 gap 수정) — 새로 생성된
  // 학생에게도 student_class_assignments의 is_primary=true 행을 함께 만든다.
  // 이걸 빼먹으면(백필 이후 시점에 생성된 학생) 이후 두 번째 교재가
  // assignTextbook으로 배정될 때 이 테이블엔 non-primary 행만 남아
  // getStudentClassAssignments가 "primary 없음" 상태를 반환하게 되고, 원래
  // 교재가 목록에서 사라지며 setPrimaryAssignment로도 되돌아갈 수 없게 되는
  // 실제 회귀가 확인됐다. 컬럼 구성은 supabase_v2_9_student_class_assignments.sql의
  // 백필 INSERT(115~120행)와 정확히 동일(student_id, class_id, current_unit_id,
  // is_primary). class_id가 없으면(className 미지정 생성) 이 테이블도
  // class_id not null 제약이라 insert할 게 없어 스킵 — 그런 학생은 오늘도
  // syntheticPrimaryAssignment가 계속 커버(그 폴백은 classId 없으면 빈 배열을
  // 반환하도록 이미 설계돼 있음, 863행 인근). 테이블 자체가 없으면
  // (마이그레이션 미실행) isMissingTableError로 감지해 조용히 스킵 —
  // CLAUDE.md 규칙 9(실행 순서 무관 안전성)대로 학생 생성 자체는 이 보조
  // 테이블 때문에 절대 실패하면 안 된다.
  if (classId) {
    const { error: assignErr } = await supabase.from('student_class_assignments').insert({
      student_id: data.id,
      class_id: classId,
      current_unit_id: unitId,
      is_primary: true,
    })
    if (assignErr && !isMissingTableError(assignErr) && assignErr.code !== '23505') {
      // 네트워크 등 그 외 사유 — 학생 생성 자체는 이미 성공했으므로 여기서
      // throw하지 않는다(계약: 이 보조 테이블 실패가 학생 생성 실패로 번지면
      // 안 됨). 콘솔에는 남겨 후속 진단이 가능하게 한다.
      console.warn('[wordLibrary] addStudent: student_class_assignments primary row insert failed (non-fatal):', assignErr.message)
    }
  }
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

// ── v2.1 학생 현재 유닛 해석 (단일 진실 공급원) ──────────────────────────
// 우선순위: ① current_unit_id(UUID — 유닛 이름이 바뀌거나 표기가 달라도
// 절대 안 끊어짐) ② unit_name 문자열 매칭(마이그레이션 전/백필 실패 행
// 하위호환) ③ 반의 첫 유닛(기존 getClassWords 폴백과 동일 — 조용히 첫
// 유닛으로 떨어지던 기존 동작을 "최후 폴백"으로만 남김).
// 화면 표시(getStudentUnit)와 단어 로딩(getStudentWords)이 반드시 같은
// 함수를 거친다 — 표시되는 유닛과 실제 보이는 단어가 어긋날 수 없게.
function resolveStudentUnitObj(id) {
  const s = _students.get(id)
  if (!s) return null
  // v3.1 교재 모드 — 현재 교재의 유닛에서 해석한다(학생의 사람 반이 아닌
  // 교재 소유 컨테이너의 유닛). 사람 반=박준원, 교재=김기택인 학생의
  // current_unit_id는 김기택 컨테이너의 유닛이라 반 유닛에선 못 찾는다.
  // 교재 정보가 없거나 합성 모드면 기존 반 기반 경로 그대로(변화 0).
  if (_textbookMode) {
    const tb = getStudentPrimaryTextbook(id)
    if (tb) {
      const tbUnits = getTextbookUnits(tb.id)
      if (tbUnits.length > 0) {
        if (s.unitId) {
          const byId = tbUnits.find((u) => u.id === s.unitId)
          if (byId) return byId
        }
        return tbUnits.find((u) => u.name === s.unitName) || tbUnits[0]
      }
    }
  }
  const clsName = getClassNameById(s.classId) || s.className
  const units = _cache[clsName]?.units || []
  if (units.length === 0) return null
  if (s.unitId) {
    const byId = units.find((u) => u.id === s.unitId)
    if (byId) return byId
  }
  return units.find((u) => u.name === s.unitName) || units[0]
}

// 표시용 유닛 이름 — 항상 해석된 값. 반/유닛 캐시가 아직 없으면(반 삭제
// 등) 저장된 문자열 그대로.
export const getStudentUnit = (id) =>
  resolveStudentUnitObj(id)?.name || _students.get(id)?.unitName || DEFAULT_UNIT_NAME

// 해석된 유닛의 실제 DB id — 유닛별 이어서-학습 위치(useStudent
// lastWordIndexByUnit) 등 id 기반 소비자용. 캐시 미비 시 null.
export const getStudentUnitId = (id) => resolveStudentUnitObj(id)?.id || null

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

// v2.1 — 반이 바뀌면 current_unit_id도 함께 정리한다: 예전 반의 유닛 id가
// 그대로 남으면 "학생의 유닛이 자기 반 소속이 아닌" 불일치 행이 생긴다.
// 새 반에서 같은 이름의 유닛이 있으면 그 id로, 없으면 null(이름/첫 유닛
// 폴백이 커버). 컬럼 부재(마이그레이션 전)면 기존 payload로 재시도.
export async function setStudentClass(id, className) {
  const s = _students.get(id)
  if (!s) return
  const classId = className ? (await ensureClass(className)).id : null
  const base = { class_id: classId }
  // P7 감사(2026-07-16): 예전엔 뒤에 bare .select()가 붙어 있었는데, 반환
  // 데이터를 아무도 안 쓰는데도 업데이트된 행의 "모든" 컬럼(pin_hash 포함)이
  // 네트워크 응답에 실려 내려왔다 — 제거(동작 불변, 응답에서 해시 노출만 차단).
  const unitIdInNewClass = className
    ? (_cache[className]?.units.find((u) => u.name === s.unitName)?.id || null)
    : null
  let { error } = await supabase.from('students')
    .update({ ...base, current_unit_id: unitIdInNewClass }).eq('id', id)
  if (error) ({ error } = await supabase.from('students').update(base).eq('id', id))
  if (error) throw error
  // 2026-07-22 레거시 다중 교재 버그 수정 — 반 배정이 assignment 테이블을
  // 유지보수하지 않아 유령 primary 행이 남고, 그 행이 이후 "원래 반을 두
  // 번째 교재로 추가"(assignTextbook)를 unique 충돌로 조용히 차단하던
  // 문제의 근원. 이제 반 배정도 조인 테이블을 함께 동기화한다(non-fatal).
  await maintainPrimaryAssignmentForClassChange(id, classId, unitIdInNewClass)
  await refreshStudents()
}

// House System(2026-07-19) — 관리자 수동 재배정. houseId는 houseSystem.js
// HOUSES의 id(1~4) 또는 null(하우스 미배정으로 되돌리기). 자동배정
// (addStudent)과 달리 관리자가 명시적으로 고른 값이므로 균형 로직을
// 거치지 않고 그대로 저장한다 — 반/유닛과 달리 하우스는 학사 데이터가
// 아니라 CHECK 제약(1~4)만 지키면 되므로 별도 조회/변환이 필요 없다.
export async function setStudentHouse(id, houseId) {
  const s = _students.get(id)
  if (!s) return
  const value = houseId == null ? null : Number(houseId)
  if (value != null && !HOUSES.some((h) => h.id === value)) {
    throw new Error(`알 수 없는 하우스 id: ${houseId}`)
  }
  const { error } = await supabase.from('students').update({ house_id: value }).eq('id', id)
  if (error) throw error
  await refreshStudents()
}

// 특정 하우스 소속 학생 목록(반 무관, 전체 학생 캐시 기준) — 관리자 화면/
// 팀 점수 집계 양쪽에서 재사용.
export function getStudentsInHouse(houseId) {
  const id = Number(houseId)
  return Array.from(_students.values()).filter((s) => s.houseId === id)
}

// 학생 화면의 "우리 하우스: OO · 이번 주 팀 점수" 표시용 배치 조회 —
// fetchDashboardData/fetchXpTotals와 같은 패턴(학생별 N번 조회 안 함,
// house_id CHECK 제약 SQL/GRANT 미실행이면 getStudentsInHouse가 빈 배열을
// 반환해 이 함수도 조용히 null을 반환한다 — 크래시 없음).
//
// 팀 점수는 houseSystem.js computeHouseWeeklyScores(양수 delta만 그 주
// 범위로 합산 — 소비/구매 제외, 파일 헤더 원칙 근거)를 그대로 재사용한다.
export async function fetchHouseWeeklyScore(houseId) {
  const id = Number(houseId)
  if (!Number.isFinite(id)) return null
  const members = getStudentsInHouse(id)
  if (members.length === 0) return 0
  const ids = members.map((s) => s.id)
  const { data, error } = await supabase
    .from('student_progress')
    .select('student_id, progress_data')
    .in('student_id', ids)
  if (error || !data) return 0
  const ledgerByStudentId = {}
  data.forEach((r) => { ledgerByStudentId[r.student_id] = r.progress_data?.ticketLedger || [] })
  const studentsForCalc = members.map((s) => ({ id: s.id, houseId: s.houseId }))
  const scores = computeHouseWeeklyScores(studentsForCalc, ledgerByStudentId)
  return scores[id] || 0
}

// Seasonal Progression(2026-07-19, 게임화 하위카드 9번) — "시즌 누적" 팀
// 점수. fetchHouseWeeklyScore와 완전히 같은 구조(학생별 N번 조회 안 함,
// SQL 미실행/미배정이면 조용히 0)이고 유일한 차이는 집계 함수(houseSystem.js
// computeHouseWeeklyScores의 "그 주" 고정 창 대신 computeHouseSeasonScores의
// "시즌 시작 이후 전부" 창)뿐이다. seasonStartedAt은 호출부(Dashboard.jsx)
// 가 src/utils/seasonApi.js fetchCurrentSeason()으로 먼저 조회해 넘긴다 —
// 이 파일이 seasonApi.js를 직접 import하지 않는 이유는 이미 이 파일이
// 다루는 것("학생 캐시 + 티켓 원장 DB 조회")과 시즌 경계 조회(다른 테이블)
// 를 분리해 각 함수가 "무엇을 위한 시즌 경계인지" 호출부가 명시적으로
// 결정하게 하기 위함(fetchDashboardData가 xpTotals를 직접 안 가져오고
// 호출부가 fetchXpTotals를 따로 부르는 것과 같은 조합 원칙).
export async function fetchHouseSeasonScore(houseId, seasonStartedAt) {
  const id = Number(houseId)
  if (!Number.isFinite(id) || typeof seasonStartedAt !== 'string' || seasonStartedAt.length < 10) return 0
  const members = getStudentsInHouse(id)
  if (members.length === 0) return 0
  const ids = members.map((s) => s.id)
  const { data, error } = await supabase
    .from('student_progress')
    .select('student_id, progress_data')
    .in('student_id', ids)
  if (error || !data) return 0
  const ledgerByStudentId = {}
  data.forEach((r) => { ledgerByStudentId[r.student_id] = r.progress_data?.ticketLedger || [] })
  const studentsForCalc = members.map((s) => ({ id: s.id, houseId: s.houseId }))
  const scores = computeHouseSeasonScores(studentsForCalc, ledgerByStudentId, seasonStartedAt)
  return scores[id] || 0
}

// v2.1 — 호출부 시그니처(유닛 "이름")는 그대로 두되(관리자/대시보드 셀렉트
// 전부 반 내 유닛 이름 목록에서 고른다 — 반 안에서 이름은 유일, ensureUnit
// 보장), 저장은 id를 1차로 기록한다. unit_name도 병행 기록(하위호환 —
// 구버전 클라이언트/마이그레이션 전 폴백 경로가 계속 읽음). 컬럼 부재면
// 기존 payload(unit_name만)로 재시도 — SQL 실행 전에도 완전 동작.
export async function setStudentUnit(id, unitName) {
  const s = _students.get(id)
  if (!s) return
  // v3.1 교재 모드 — 유닛은 현재 교재의 유닛에서 찾는다(사람 반이 아니라).
  // 합성/레거시 모드에서는 기존 반 기반 검색 그대로.
  let unitId = null
  if (_textbookMode) {
    const tb = getStudentPrimaryTextbook(id)
    if (tb) unitId = getTextbookUnits(tb.id).find((u) => u.name === unitName)?.id || null
  }
  if (unitId == null) {
    const clsName = getClassNameById(s.classId) || s.className
    unitId = _cache[clsName]?.units.find((u) => u.name === unitName)?.id || null
  }
  // P7 감사: bare .select() 제거 — setStudentClass와 동일한 pin_hash 응답 노출 차단.
  let { error } = await supabase.from('students')
    .update({ unit_name: unitName, current_unit_id: unitId }).eq('id', id)
  if (error) ({ error } = await supabase.from('students').update({ unit_name: unitName }).eq('id', id))
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
  // v2.1: 목적지 반에서 unitName과 일치하는 유닛 id를 함께 기록(전원 같은
  // 반·같은 유닛으로 이동하므로 단일 값). 없으면 null — 이름/첫 유닛 폴백.
  const unitId = className
    ? (_cache[className]?.units.find((u) => u.name === unitName)?.id || null)
    : null
  const base = { class_id: classId, unit_name: unitName }
  let { error } = await supabase.from('students')
    .update({ ...base, current_unit_id: unitId }).in('id', validIds)
  if (error) ({ error } = await supabase.from('students').update(base).in('id', validIds))
  if (error) throw error
  // 2026-07-22 — setStudentClass와 동일한 assignment 유지보수(위 주석 참고).
  // 순차 실행(학생 수는 반 단위 이동이라 수십 명 수준, 각 호출은 non-fatal).
  for (const sid of validIds) {
    await maintainPrimaryAssignmentForClassChange(sid, classId, unitId)
  }
  await refreshStudents()
}

// ════════════════════════════════════════════════════════════════════════
// v2.9 다중 교재(Multi-Textbook) 동시 배정 — decision 0004
// (docs/agent-decisions/0004-multi-textbook-architecture.md)
//
// student_class_assignments 조인 테이블은 supabase_v2_9_student_class_
// assignments.sql이 아직 실행 안 됐을 수 있다(CLAUDE.md 규칙 8 — 에이전트가
// DDL을 직접 실행하지 않음, 운영자가 Supabase 대시보드에서 수동 실행 예정).
// 아래 함수들은 그 SQL이 실행되기 전/후 어느 쪽이든 앱을 절대 깨뜨리지
// 않아야 한다(규칙 9) — "테이블 없음" 감지 방식은 isMissingTableError 참고.
//
// students.class_id/current_unit_id는 계속 "권위 있는 필드"로 남는다(삭제
// 없음) — is_primary=true 행의 캐시(sync)일 뿐이다. 그래서 이 섹션 아래
// 함수들을 전혀 호출하지 않는 기존 15개 이상의 호출부(getStudentClassId/
// resolveStudentUnitObj/getStudentWords의 기존 무-override 경로 등)는 이
// 섹션이 통째로 존재하지 않는 것처럼 계속 동작한다 — 순수 추가(additive).
// ════════════════════════════════════════════════════════════════════════

// PostgREST가 스키마 캐시에 없는 테이블(= DB에 아예 없는 테이블, 이 SQL
// 미실행 상태)을 조회하면 보통 PGRST205("Could not find the table ... in
// the schema cache")로 응답한다 — raw Postgres 42P01("relation ... does not
// exist")과는 다른 레이어의 에러 코드다. 이 파일의 기존 관례
// (fetchProgressBackupStrict의 42703/42P01 이중 체크, 위 906행 인근)에
// PGRST205를 추가하고, code 필드가 없는 예외적인 에러 모양까지 방어적으로
// 커버하기 위해 메시지 텍스트도 보조로 확인한다.
function isMissingTableError(error) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = String(error.message || '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('schema cache')
}

// getStudentWords(studentId, { classId })의 override 검증을 "동기"로 하기
// 위한 캐시(아래 getStudentWords 주석 참고) — getStudentClassAssignments가
// 호출될 때마다 최신 결과로 채워진다. _cache/_students/_dailyAssignments와
// 같은 "한 번 비동기로 채우고 이후 동기로 읽는다" 관례를 그대로 재사용.
const _studentAssignmentsCache = new Map()

// 내부(2026-07-22, 레거시 다중 교재 버그 수정) — "반 배정"(단일 반 전환)
// 의미론으로 student_class_assignments를 유지보수한다: 대상 반 행을
// primary로 보장(insert, 이미 있으면 primary 승격)하고, 다른 반의 기존
// primary 행은 삭제한다(반 배정 = "이동"이므로 — 남겨두면 이동한 모든
// 학생에게 교재 선택기가 나타나는 의도치 않은 동작이 되고, 지우지 않으면
// 유령 행이 unique(student_id,class_id)로 이후 assignTextbook(그 반 재추가)
// 을 조용히 차단한다 — 2026-07-22 재현으로 확정된 실제 버그의 근원).
// assignTextbook으로 만든 진짜 secondary 배정(is_primary=false)은 절대
// 건드리지 않는다. 전 과정 non-fatal(콘솔 warn만) — 반 배정 자체는 이
// 보조 테이블 때문에 절대 실패하면 안 된다(addStudent와 동일 계약).
async function maintainPrimaryAssignmentForClassChange(studentId, classId, unitId) {
  try {
    if (!studentId || !classId) return
    // v3.1 교재 모드 — 다른 행은 "교재별 진도 상태"라 절대 삭제하지 않는다
    // (유령 개념은 반=교재이던 레거시 모델의 것). 전부 demote만 하고, 새
    // 반의 자동 교재 행을 primary로 보장(textbook_id 포함).
    if (_textbookMode) {
      const { error: demErr } = await supabase.from('student_class_assignments')
        .update({ is_primary: false }).eq('student_id', studentId).eq('is_primary', true).neq('class_id', classId)
      if (demErr) {
        if (isMissingTableError(demErr)) return
        throw demErr
      }
      const own = getOwnTextbookOfClass(classId)
      const { error: insErr } = await supabase.from('student_class_assignments').insert({
        student_id: studentId, class_id: classId, textbook_id: own?.id ?? null,
        current_unit_id: unitId ?? null, is_primary: true,
      })
      if (insErr) {
        if (insErr.code === '23505') {
          const { error: updErr } = await supabase.from('student_class_assignments')
            .update({ is_primary: true }).eq('student_id', studentId).eq('class_id', classId)
          if (updErr) throw updErr
        } else if (!isMissingTableError(insErr)) {
          throw insErr
        }
      }
      _studentAssignmentsCache.delete(studentId)
      return
    }
    // 1) 다른 반의 primary(유령/이전 반) 행 삭제 — 조건부(이 학생 + primary
    //    + 대상 반이 아닌 것만). 테이블 부재면 여기서 바로 조용히 끝.
    const { error: delErr } = await supabase.from('student_class_assignments')
      .delete().eq('student_id', studentId).eq('is_primary', true).neq('class_id', classId)
    if (delErr) {
      if (isMissingTableError(delErr)) return
      throw delErr
    }
    // 2) 대상 반 행을 primary로 보장 — 없으면 insert, 이미 있으면(교사가
    //    전에 secondary로 배정해 둔 반으로 이동하는 경우) primary 승격만
    //    하고 그 행의 current_unit_id(그 반 전용 진도)는 보존한다.
    const { error: insErr } = await supabase.from('student_class_assignments').insert({
      student_id: studentId, class_id: classId, current_unit_id: unitId ?? null, is_primary: true,
    })
    if (insErr) {
      if (insErr.code === '23505') {
        const { error: updErr } = await supabase.from('student_class_assignments')
          .update({ is_primary: true }).eq('student_id', studentId).eq('class_id', classId)
        if (updErr) throw updErr
      } else if (!isMissingTableError(insErr)) {
        throw insErr
      }
    }
    _studentAssignmentsCache.delete(studentId)
  } catch (err) {
    console.warn('[wordLibrary] 반 배정 assignment 행 유지보수 실패 (non-fatal):', err?.message || err)
  }
}

// 테이블이 없거나(마이그레이션 전) 학생에게 배정 행이 0개(신규 학생 등
// 백필 이후 시점에 앱 계층 insert 없이 생성된 경우)이면, students.class_id/
// current_unit_id/unit_name으로부터 합성(synthetic) 단일 배정 1개를
// 만들어 반환한다 — 오늘의 단일 반 동작과 100% 동일. resolveStudentUnitObj
// 기반 getStudentUnitId를 그대로 재사용해 "표시되는 유닛과 실제 로드되는
// 단어가 항상 같은 유닛" 불변식을 여기서도 그대로 유지한다.
function syntheticPrimaryAssignment(studentId) {
  const s = _students.get(studentId)
  if (!s || !s.classId) return []
  return [{
    id: null, // 합성 행 — 실제 student_class_assignments.id 없음
    studentId,
    classId: s.classId,
    unitId: getStudentUnitId(studentId),
    isPrimary: true,
  }]
}

// 1) 읽기 전용 — 학생의 전체 교재 배정 목록. 테이블 부재/학생 배정 0건 모두
// syntheticPrimaryAssignment로 폴백하므로, 호출부는 "테이블이 있는지"를
// 절대 스스로 분기할 필요가 없다(이 함수가 그 분기를 흡수하는 게 핵심
// 계약). getStudentWords의 classId override 검증용 캐시도 여기서 채운다.
export async function getStudentClassAssignments(studentId) {
  if (!studentId) return []
  // v3.1 — textbook_id 컬럼은 마이그레이션 전이면 없다: 컬럼 포함 조회를
  // 먼저 시도하고 42703(undefined column)이면 기존 컬럼 셋으로 재시도
  // (refreshStudents의 current_unit_id/house_id cascading 폴백과 동일 관례).
  let { data, error } = await supabase
    .from('student_class_assignments')
    .select('id,student_id,class_id,current_unit_id,is_primary,textbook_id')
    .eq('student_id', studentId)
    .order('is_primary', { ascending: false })
  if (error && error.code === '42703') {
    ;({ data, error } = await supabase
      .from('student_class_assignments')
      .select('id,student_id,class_id,current_unit_id,is_primary')
      .eq('student_id', studentId)
      .order('is_primary', { ascending: false }))
  }
  let result
  if (error) {
    if (!isMissingTableError(error)) {
      // 테이블은 있는데 다른 이유(네트워크 등)로 실패 — 이 파일 전역 원칙
      // (읽기 함수는 학생 화면을 절대 깨뜨리지 않음, fetchXpTotal과 동일
      // 정신)대로 조용히 단일 반 폴백으로 처리하되 콘솔에는 남긴다.
      console.warn('[wordLibrary] getStudentClassAssignments failed (non-fatal, falling back to single-class):', error.message)
    }
    result = syntheticPrimaryAssignment(studentId)
  } else if (!data || data.length === 0) {
    result = syntheticPrimaryAssignment(studentId)
  } else {
    const mapped = data.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      classId: r.class_id,
      unitId: r.current_unit_id,
      isPrimary: !!r.is_primary,
      // v3.1 — 백필 전 NULL은 그 행의 반(컨테이너) 소속 자동 교재로 해석
      textbookId: r.textbook_id || getOwnTextbookOfClass(r.class_id)?.id || null,
    }))
    // 방어적 self-heal(2026-07-21, 라이브 e2e로 발견) — 행이 1개 이상
    // 있더라도 그중 is_primary=true인 행이 하나도 없는 손상된 상태가 실제로
    // 발생했다(addStudent가 아직 이 테이블에 primary 행을 만들지 않던
    // 시기에 생성된 학생에게 두 번째 교재가 assignTextbook으로 배정되면,
    // 이 테이블엔 non-primary 행 1개만 존재 — 원래 교재가 목록에서 조용히
    // 사라지고 setPrimaryAssignment로 되돌아갈 수도 없게 됨). addStudent
    // 쪽 수정(아래, 이제 학생 생성 시 primary 행을 함께 만듦)이 근본 원인을
    // 막지만, 이미 손상된 기존 데이터/향후 다른 경로로 같은 상태가 재발할
    // 가능성까지 대비해 읽기 시점에도 자가 치유한다 — 실제로 반환된
    // non-primary 행은 버리지 않고 합성 primary와 병합한다.
    const hasPrimary = mapped.some((r) => r.isPrimary)
    result = hasPrimary ? mapped : [...syntheticPrimaryAssignment(studentId), ...mapped]
    // 읽기 시점 보정(2026-07-21, 라이브 드리프트 수정) — decision 0004가
    // 명시한 대로 `students.class_id`/`current_unit_id`가 "is_primary=true
    // 행의 캐시"가 아니라 그 반대(권위 있는 값)다: 학생이 정상적으로
    // 진도를 나가면(setStudentUnit 등, 786행 인근) students 테이블만
    // 갱신되고 이 조인 테이블 행은 건드리지 않으므로, primary 행의 저장된
    // current_unit_id/class_id는 시간이 지날수록 조용히 stale해진다(백필
    // 시점 스냅샷에 고정). primary 행에 한해 _students 캐시(앱 시작
    // 시(refreshStudents) 이미 로드되어 있고, 이 파일의 모든 학생 쓰기
    // 함수가 끝날 때 다시 채워지는 "권위 있는 최신 값" — resolveStudentUnitObj
    // 등 기존 다수 함수와 동일한 재사용 패턴)로 덮어써서, primary 행이
    // 항상 학생의 실제 현재 진도를 정확히 보고하게 한다. non-primary 행은
    // 손대지 않는다(그 저장값은 setAssignmentUnit이 유일한 writer이고
    // 정확하다).
    const live = _students.get(studentId)
    if (live) {
      const primary = result.find((r) => r.isPrimary)
      if (primary) {
        // 2026-07-22 레거시 다중 교재 버그 수정 — 반 불일치는 "마스킹"만
        // 하던 기존 동작이 유령 행을 DB에 그대로 남겨, 이후 그 반을 두
        // 번째 교재로 재추가하는 assignTextbook을 unique 충돌로 조용히
        // 차단했다(재현: scripts/reproLegacyMultiClass.mjs). 이제 불일치를
        // 감지하면 표시용 마스킹은 유지하되 DB도 실제로 고친다(fire-and-
        // forget — 읽기 경로를 절대 막지 않고, 실패해도 다음 읽기가 재시도).
        // v3.1 교재 모드에서는 primary 행의 class_id(교재 소유 컨테이너)가
        // students.class_id(사람 반)와 다른 것이 정상이다(예: 박준원 반
        // 학생이 김기택 교재 학습 중) — 반 불일치 수리/마스킹은 교재
        // 레이어가 없는 레거시 모드에서만 수행한다(2026-07-22 버그 수정의
        // 유령 행 수리 로직, 그 시나리오는 여전히 레거시 모드에서 유효).
        if (!_textbookMode && live.classId != null && primary.classId !== live.classId) {
          // 수리 행의 유닛은 "그 반 소속이 확실한 id"만 신뢰한다 —
          // getStudentUnitId의 unit_name 폴백은 이전 반의 유닛 이름이
          // 새 반의 같은 이름 유닛(빈 유닛일 수도)에 잘못 매칭될 수 있어
          // (교재들이 전부 "Unit 1..N" 작명이라 실제로 발생) 여기서는
          // 쓰지 않는다. 확신이 없으면 NULL로 두면 setPrimaryAssignment의
          // "단어 있는 첫 유닛" 확정 로직이 전환 시점에 올바르게 채운다.
          const clsName = getClassNameById(live.classId)
          const strictUnitId = (live.unitId != null &&
            (_cache[clsName]?.units || []).some((u) => u.id === live.unitId))
            ? live.unitId : null
          maintainPrimaryAssignmentForClassChange(studentId, live.classId, strictUnitId)
        }
        // 유닛 보정 — students.current_unit_id는 두 모드 모두 권위 값.
        const resolvedUnitId = live.unitId ?? getStudentUnitId(studentId)
        if (resolvedUnitId != null) primary.unitId = resolvedUnitId
        if (!_textbookMode && live.classId != null) primary.classId = live.classId
      }
    }
  }
  _studentAssignmentsCache.set(studentId, result)
  return result
}

// 2) 쓰기 — 두 번째 이상 교재 배정. is_primary는 항상 false로 insert한다
// (주 교재를 바꾸는 건 setPrimaryAssignment의 책임, 이 함수의 책임 아님).
// current_unit_id는 의도적으로 null로 시작한다(설계 선택, 문서화: 이 반의
// "첫 유닛"으로 자동 지정하지 않는 이유는 관리자가 setAssignmentUnit으로
// 명시적으로 진도를 고르게 하기 위함 — 자동으로 유닛을 고르면 관리자가
// 확인 없이 잘못된 유닛에서 시작하는 상태를 조용히 만들 수 있음). 호출부가
// 필요하면 assignTextbook 직후 setAssignmentUnit을 이어서 호출한다.
// unique(student_id, class_id) 충돌(23505)은 "이미 배정됨" 상태이므로
// 에러 없이 조용히 no-op(멱등 계약).
// 테이블 미존재(마이그레이션 전)면 명확히 catchable한 에러를 던진다 — 이건
// "아직 안 된 기능"을 위한 쓰기 작업이라, 호출부(관리자 UI)는 테이블이
// 생기기 전까지 "교재 추가" 옵션 자체를 노출하면 안 된다(계약).
export async function assignTextbook(studentId, classId) {
  if (!studentId || !classId) throw new Error('assignTextbook: studentId/classId가 필요합니다.')
  const { error } = await supabase.from('student_class_assignments').insert({
    student_id: studentId,
    class_id: classId,
    current_unit_id: null,
    is_primary: false,
  })
  if (error) {
    if (isMissingTableError(error)) {
      throw new Error('student_class_assignments 테이블이 아직 없습니다 (supabase_v2_9_student_class_assignments.sql 미실행) — 관리자 UI는 이 마이그레이션이 실행되기 전까지 "교재 추가" 옵션을 노출하면 안 됩니다.')
    }
    if (error.code === '23505') return // unique(student_id, class_id) 충돌 — 이미 배정됨, no-op(멱등)
    throw error
  }
  _studentAssignmentsCache.delete(studentId) // 캐시 무효화 — 다음 getStudentClassAssignments가 새로 채움
}

// 3) 쓰기 — 교재 배정 해제. is_primary=true 행(=학생의 유일한 진실 원천,
// students.class_id/current_unit_id와 동기화돼 있는 행)은 이 함수로 절대
// 지울 수 없다 — "주 교재를 바꾼다"는 다른 연산(setPrimaryAssignment)이고,
// 이 함수는 그걸 대신하지 않는다. 이 불변식 덕분에 이 함수를 통해서는
// 학생이 배정 0개 상태가 될 수 없다(주 배정은 항상 최소 1개 남음).
export async function removeTextbookAssignment(studentId, classId) {
  if (!studentId || !classId) throw new Error('removeTextbookAssignment: studentId/classId가 필요합니다.')
  const { data: existing, error: selErr } = await supabase
    .from('student_class_assignments')
    .select('id,is_primary')
    .eq('student_id', studentId).eq('class_id', classId).maybeSingle()
  if (selErr) {
    if (isMissingTableError(selErr)) {
      throw new Error('student_class_assignments 테이블이 아직 없습니다 (supabase_v2_9_student_class_assignments.sql 미실행) — 제거할 배정 자체가 존재할 수 없습니다.')
    }
    throw selErr
  }
  if (!existing) return // 이미 없음 — no-op(멱등)
  if (existing.is_primary) {
    throw new Error('주 교재(is_primary) 배정은 removeTextbookAssignment로 제거할 수 없습니다 — 먼저 setPrimaryAssignment로 다른 교재를 주 교재로 바꾼 뒤 다시 시도하세요.')
  }
  const { error: delErr } = await supabase.from('student_class_assignments').delete().eq('id', existing.id)
  if (delErr) throw delErr
  _studentAssignmentsCache.delete(studentId)
}

// 4) 쓰기 — 특정 (학생, 반) 배정의 현재 유닛 변경. setStudentUnit(786행
// 인근)과 같은 검증 패턴을 재사용한다 — _cache는 반 "이름"으로 키잉되므로
// getClassNameById로 이름을 구한 뒤 그 반의 units 배열 안에서만 unitId를
// 찾는다. 다른 반 소속 unitId/존재하지 않는 id를 넘기면(호출부 버그) 저장
// 하지 않고 명확히 던진다 — decision 0004가 못박은 불변식("현재 유닛은
// 반드시 그 반 소속", supabase_v2_1_student_unit_decouple.sql:129-133과
// 동일 불변식을 조인 테이블에서도 유지)을 재확인하는 것.
export async function setAssignmentUnit(studentId, classId, unitId) {
  if (!studentId || !classId) throw new Error('setAssignmentUnit: studentId/classId가 필요합니다.')
  const clsName = getClassNameById(classId)
  const units = _cache[clsName]?.units || []
  if (unitId != null && !units.some((u) => u.id === unitId)) {
    throw new Error(`setAssignmentUnit: 유닛(${unitId})이 반(${classId}) 소속이 아닙니다.`)
  }
  const { error } = await supabase.from('student_class_assignments')
    .update({ current_unit_id: unitId })
    .eq('student_id', studentId).eq('class_id', classId)
  if (error) {
    if (isMissingTableError(error)) {
      throw new Error('student_class_assignments 테이블이 아직 없습니다 (supabase_v2_9_student_class_assignments.sql 미실행).')
    }
    throw error
  }
  _studentAssignmentsCache.delete(studentId)
}

// 5) 쓰기 — 주 교재 전환. 대상 (학생, 반) 행의 is_primary를 true로, 그
// 학생의 다른 모든 배정 행은 false로 플립하고, students.class_id/
// current_unit_id를 그 배정 행과 동기화한다 — 이 동기화 덕분에
// getStudentClassId/resolveStudentUnitObj/getStudentWords의 기존
// "override 없는" 경로를 포함한 모든 기존 단일-반 호출부가 이 함수
// 호출만으로 정확히 유지된다(코드 변경 0).
//
// 동기화 payload는 setStudentClass(685행 인근)가 오늘 쓰는 것과 정확히
// 같은 모양이다(base { class_id } + current_unit_id) — 값의 "출처"만
// 다르다: setStudentClass는 유닛 "이름" 재매칭으로 unitId를 구하고, 여기는
// 그 배정 행 자체의 current_unit_id를 그대로 신뢰한다(이 시점엔 이미 그
// 교재 전용 진도가 배정 행에 있으므로 이름 재매칭이 필요 없고, 오히려
// 재매칭하면 다른 교재의 같은 이름 유닛으로 잘못 튈 위험이 있다). unit_name
// 컬럼은 setStudentClass와 마찬가지로 여기서도 갱신하지 않는다 — 현재
// 유닛 해석은 이미 current_unit_id 우선(resolveStudentUnitObj)이라
// unit_name은 항상 최후 폴백일 뿐이며, 두 함수의 동기화 범위를 동일하게
// 맞추는 것이 이 함수 헤더가 요구하는 "정확히 같은 sync 로직" 요건이다.
export async function setPrimaryAssignment(studentId, classId) {
  if (!studentId || !classId) throw new Error('setPrimaryAssignment: studentId/classId가 필요합니다.')
  const { data: target, error: selErr } = await supabase
    .from('student_class_assignments')
    .select('id,current_unit_id')
    .eq('student_id', studentId).eq('class_id', classId).maybeSingle()
  if (selErr) {
    if (isMissingTableError(selErr)) {
      throw new Error('student_class_assignments 테이블이 아직 없습니다 (supabase_v2_9_student_class_assignments.sql 미실행).')
    }
    throw selErr
  }
  if (!target) throw new Error(`setPrimaryAssignment: 학생이 반(${classId})에 배정돼 있지 않습니다 — 먼저 assignTextbook으로 배정하세요.`)

  // 쓰기 시점 self-heal(2026-07-21, 라이브 드리프트 수정) — 위
  // getStudentClassAssignments의 read-time 보정은 "현재" primary 행에만
  // 적용되므로, 여기서 primary 지위를 잃는 순간의 outgoing 행을 미리
  // 못박아 두지 않으면 나중에 이 교재로 되돌아왔을 때 훨씬 오래된(전환
  // 시점보다도 이전, 최악의 경우 백필 스냅샷 그대로인) stale
  // current_unit_id가 남는다. is_primary 플립 전에, target과 다른 반의
  // 기존 primary 행이 있으면 그 행의 current_unit_id를 지금 이 순간의
  // 라이브 students.current_unit_id로 갱신해 "전환 직전 실제 진도"를
  // 스냅샷으로 남긴다. 테이블 부재(마이그레이션 전)는 이미 위 target
  // select에서 걸러지므로 여기서도 동일하게 감지해 조용히 스킵(새로운
  // 실패 모드 없음).
  const { data: outgoingRows, error: outSelErr } = await supabase
    .from('student_class_assignments')
    .select('id,class_id')
    .eq('student_id', studentId).eq('is_primary', true)
  if (outSelErr && !isMissingTableError(outSelErr)) throw outSelErr
  const outgoing = (outgoingRows || []).find((r) => r.class_id !== classId)
  if (outgoing) {
    // 2026-07-22 레거시 수정 — live.unitId가 null인 레거시 학생(current_
    // unit_id 미백필, unit_name 문자열 의존)은 기존 코드가 캡처를 통째로
    // 건너뛰어 "전환 직전 진도"가 영영 스냅샷되지 않았다. getStudentUnitId
    // (이름→id→첫 유닛 해석, resolveStudentUnitObj 단일 경로)로 항상
    // 구체적인 유닛 id를 캡처한다 — 학습 이력을 잃지 않는 핵심 장치.
    const live = _students.get(studentId)
    let capturedUnitId = (live && live.unitId != null) ? live.unitId : null
    if (capturedUnitId == null) {
      // 이름 폴백은 "실제 진도"일 때만 신뢰한다: 레거시 학생의 stale
      // unit_name이 지금 반의 같은 이름 빈 유닛에 매칭되면(교재들이 전부
      // "Unit 1..N" 작명이라 실제 발생) 그건 진도가 아니라 잡음이다 —
      // 단어가 있는 유닛으로 해석될 때만 캡처하고, 아니면 캡처를 건너뛴다
      // (행이 NULL로 남으면 다음 전환의 "단어 있는 첫 유닛" 확정이 처리).
      const resolved = resolveStudentUnitObj(studentId)
      if (resolved && (resolved.words || []).length > 0) capturedUnitId = resolved.id
    }
    if (capturedUnitId != null) {
      const { error: healErr } = await supabase.from('student_class_assignments')
        .update({ current_unit_id: capturedUnitId }).eq('id', outgoing.id)
      if (healErr) throw healErr
    }
  }

  // 대상을 먼저 true로(그 다음 나머지를 false로) — 두 단계 사이에 실패해도
  // "주 교재가 0개"가 되는 순간이 없도록(반대 순서면 그 순간이 생김).
  const { error: trueErr } = await supabase.from('student_class_assignments')
    .update({ is_primary: true }).eq('id', target.id)
  if (trueErr) throw trueErr
  const { error: falseErr } = await supabase.from('student_class_assignments')
    .update({ is_primary: false }).eq('student_id', studentId).neq('id', target.id)
  if (falseErr) throw falseErr

  // 2026-07-22 레거시 수정 — 대상 배정 행의 unit이 NULL이면(교사가 아직
  // setAssignmentUnit으로 안 정했거나 레거시 백필 산출물) 그대로 NULL을
  // students에 쓰지 않는다: NULL이면 이후 유닛 해석이 stale unit_name
  // 문자열(이전 교재의 유닛 이름!)로 폴백해 다른 교재의 같은 이름 유닛에
  // 잘못 매칭될 수 있다(교재별 유닛 진도 분리 위반). 대상 반의 첫 유닛으로
  // 결정론적으로 확정하고, 배정 행에도 같은 값을 되써서 이후 전환이 항상
  // 구체적 id 기반이 되게 한다.
  let syncUnitId = target.current_unit_id
  if (syncUnitId == null) {
    const clsName = getClassNameById(classId)
    const units = _cache[clsName]?.units || []
    // 단어가 실제로 있는 첫 유닛 우선(첫 유닛이 빈 껍데기인 반이 실존 —
    // 라이브 테스트에서 확인) — 전부 비었으면 첫 유닛이라도(유닛 선택기로
    // 학생/교사가 이동 가능, 기존 resolveStudentUnitObj 최후 폴백과 동일).
    syncUnitId = (units.find((u) => (u.words || []).length > 0) || units[0])?.id ?? null
    if (syncUnitId != null) {
      const { error: fillErr } = await supabase.from('student_class_assignments')
        .update({ current_unit_id: syncUnitId }).eq('id', target.id)
      if (fillErr) throw fillErr
    }
  }
  const { error: syncErr } = await supabase.from('students')
    .update({ class_id: classId, current_unit_id: syncUnitId }).eq('id', studentId)
  if (syncErr) throw syncErr
  _studentAssignmentsCache.delete(studentId)
  await refreshStudents()
}

// ── v3.1 교재 전환(setPrimaryTextbook) — 사람 반은 절대 안 바꾼다 ──
// v2.9 setPrimaryAssignment(반 축 전환, students.class_id 동기화 포함)의
// 교재 축 버전. 차이: ① 상태 행이 없으면 즉시 만들어준다(반에 연결된
// 교재는 학생이 자유롭게 고를 수 있어야 하므로 — 연결 자체(class_textbooks)
// 는 관리자만 관리), ② students.class_id는 건드리지 않는다(사람 반 유지 —
// 숙제/입실시험/게임화 설정은 계속 사람 반을 따른다), ③ students.
// current_unit_id만 대상 교재의 유닛으로 동기화(기존 권위 관계 유지).
// 나가는 교재의 진도 캡처는 setPrimaryAssignment과 동일 로직 재사용.
export async function setPrimaryTextbook(studentId, textbookId) {
  if (!studentId || !textbookId) throw new Error('setPrimaryTextbook: studentId/textbookId가 필요합니다.')
  const tb = _textbooks.get(textbookId)
  if (!tb || !tb.ownerClassId) throw new Error(`setPrimaryTextbook: 알 수 없는 교재(${textbookId})`)
  if (String(textbookId).startsWith(SYNTH_TB_PREFIX)) {
    // 합성 모드(SQL 미실행) — 교재가 1개뿐이라 전환할 것이 없다. 명확히 던짐.
    throw new Error('교재 기능이 아직 활성화되지 않았습니다 (supabase_v3_1_textbooks.sql 미실행).')
  }

  // 1) 대상 상태 행 확보(없으면 생성 — class_id는 교재의 소유 컨테이너)
  let { data: target, error: selErr } = await supabase
    .from('student_class_assignments')
    .select('id,current_unit_id')
    .eq('student_id', studentId).eq('textbook_id', textbookId).maybeSingle()
  if (selErr) throw selErr
  if (!target) {
    const { error: insErr } = await supabase.from('student_class_assignments').insert({
      student_id: studentId, class_id: tb.ownerClassId, textbook_id: textbookId,
      current_unit_id: null, is_primary: false,
    })
    if (insErr && insErr.code !== '23505') throw insErr
    ;({ data: target, error: selErr } = await supabase
      .from('student_class_assignments')
      .select('id,current_unit_id')
      .eq('student_id', studentId).eq('textbook_id', textbookId).maybeSingle())
    if (selErr || !target) throw selErr || new Error('setPrimaryTextbook: 상태 행 생성 실패')
  }

  // 2) 나가는 primary의 진도 캡처(setPrimaryAssignment의 검증된 로직 그대로)
  const { data: outgoingRows, error: outErr } = await supabase
    .from('student_class_assignments')
    .select('id').eq('student_id', studentId).eq('is_primary', true).neq('id', target.id)
  if (outErr) throw outErr
  if ((outgoingRows || []).length > 0) {
    const live = _students.get(studentId)
    let capturedUnitId = (live && live.unitId != null) ? live.unitId : null
    if (capturedUnitId == null) {
      const resolved = resolveStudentUnitObj(studentId)
      if (resolved && (resolved.words || []).length > 0) capturedUnitId = resolved.id
    }
    if (capturedUnitId != null) {
      for (const row of outgoingRows) {
        const { error: healErr } = await supabase.from('student_class_assignments')
          .update({ current_unit_id: capturedUnitId }).eq('id', row.id)
        if (healErr) throw healErr
      }
    }
  }

  // 3) primary 플립(대상 먼저 true — "primary 0개" 순간 없음)
  const { error: trueErr } = await supabase.from('student_class_assignments')
    .update({ is_primary: true }).eq('id', target.id)
  if (trueErr) throw trueErr
  const { error: falseErr } = await supabase.from('student_class_assignments')
    .update({ is_primary: false }).eq('student_id', studentId).neq('id', target.id)
  if (falseErr) throw falseErr

  // 4) 유닛 동기화 — 대상 교재 진도(없으면 단어 있는 첫 유닛). class_id는 안 바꿈!
  let syncUnitId = target.current_unit_id
  if (syncUnitId == null) {
    const units = getTextbookUnits(textbookId)
    syncUnitId = (units.find((u) => (u.words || []).length > 0) || units[0])?.id ?? null
    if (syncUnitId != null) {
      const { error: fillErr } = await supabase.from('student_class_assignments')
        .update({ current_unit_id: syncUnitId }).eq('id', target.id)
      if (fillErr) throw fillErr
    }
  }
  const { error: syncErr } = await supabase.from('students')
    .update({ current_unit_id: syncUnitId }).eq('id', studentId)
  if (syncErr) throw syncErr
  _studentAssignmentsCache.delete(studentId)
  await refreshStudents()
  // 캐시 즉시 재예열 — 동기 소비자(resolveStudentUnitObj →
  // getStudentPrimaryTextbook)가 다음 fetch 전까지 "사람 반의 자동 교재"
  // 폴백으로 잘못 해석하는 창을 없앤다(전환 직후 유닛/단어가 잠깐 이전
  // 교재로 보이는 라이브 검증 FAIL의 원인이었음). refreshStudents 이후에
  // 호출해야 read-heal이 방금 동기화된 current_unit_id를 본다.
  await getStudentClassAssignments(studentId)
}

// v3.1 관리자 — 반↔교재 연결 관리(연결/해제/순서). 해제는 연결만 끊고
// 교재/유닛/단어 데이터는 절대 삭제하지 않는다(운영자 요구사항).
export async function linkTextbookToClass(classId, textbookId, sortOrder = 0) {
  if (!classId || !textbookId) throw new Error('linkTextbookToClass: classId/textbookId 필요')
  const { error } = await supabase.from('class_textbooks')
    .insert({ class_id: classId, textbook_id: textbookId, sort_order: sortOrder })
  if (error && error.code !== '23505') throw error
  await refreshTextbooks()
}
export async function unlinkTextbookFromClass(classId, textbookId) {
  const { error } = await supabase.from('class_textbooks')
    .delete().eq('class_id', classId).eq('textbook_id', textbookId)
  if (error) throw error
  await refreshTextbooks()
}
export const getAllTextbooks = () => [..._textbooks.values()]

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

// v2.2(2026-07-17) 다중 기기 병합 업로드용 — fetchFullProgress와 달리
// "백업이 확실히 없음(null)"과 "읽기 실패(throw)"를 구분한다. 업로드 직전
// 병합(useStudent.js doSync)은 이 구분이 필수다: 읽기 실패를 null로
// 뭉개면 "클라우드 상태를 모르는 채로 로컬 단독 blob을 덮어쓰는" 경로가
// 되는데, 그게 정확히 이 병합이 없애려는 데이터 유실 시나리오이기 때문.
// 컬럼/테이블 미존재(42703/42P01 — v1.4 마이그레이션 전 환경)만은 "백업
// 기능 자체가 없는 환경"이므로 null(=병합 없이 기존 동작)로 취급한다.
export async function fetchProgressBackupStrict(studentId) {
  if (!studentId) return null
  const { data, error } = await supabase
    .from('student_progress')
    .select('progress_data')
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) {
    if (error.code === '42703' || error.code === '42P01') return null
    throw error
  }
  const blob = data?.progress_data
  return blob && Object.keys(blob).length > 0 ? blob : null
}

// ── Paul Rank System (2026-07-19) — XP 지급/조회 ────────────────────────
// "별을 조용히 XP로 변환하지 말라" 판단 근거는 src/utils/paulRankShared.js
// 헤더 참고. 여기 두 함수는 그 판단의 클라이언트측 구현:
//   · postXpEvent — 유일한 "쓰기" 경로. 학생 화면이 xp_ledger에 직접
//     insert/update하지 않는다 — 서버(api/grant-xp.js, service_role)만
//     쓴다. syncStudentProgress와 동일한 fire-and-forget 원칙: 네트워크
//     실패/테이블 미존재가 학습 흐름을 절대 막지 않는다(호출부는 절대
//     await하지 않고 그냥 던져 놓는다 — useStudent.js addStars 호출
//     지점들 참고). 실패해도 별(star) 지급 자체는 이미 로컬에서 끝난
//     뒤이므로 학생 경험에 영향 없음 — 이 함수가 실패하면 그 XP 이벤트
//     하나만 원장에 안 남을 뿐이다(다음 학습 이벤트는 정상 지급됨).
//   · fetchXpTotal/fetchXpTotals — 유일한 "읽기" 경로. xp_ledger는 anon
//     SELECT가 허용돼 있으므로(공개 표시값, 민감정보 아님) 직접
//     xp_totals 뷰를 읽는다 — 이 뷰는 저장된 사본이 아니라 매 조회 시
//     xp_ledger를 합산하는 순수 파생값(SQL 파일 주석 참고) — "저장된
//     중복값보다 파생값을 우선한다" 원칙을 스키마 레벨에서 강제.
//   테이블/뷰가 아직 없으면(supabase_v2_3_paul_rank.sql 미실행) 조용히
//   xp=0으로 폴백 — 코드가 스키마보다 먼저 배포돼도 절대 안 깨짐.
export async function postXpEvent(studentId, eventType, sourceEventId) {
  if (!studentId || !eventType || !sourceEventId) return
  try {
    await fetch('/api/grant-xp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, eventType, sourceEventId }),
    })
  } catch {
    // 네트워크 실패 — 조용히 무시(위 주석 참고, 학습 흐름 비차단 원칙).
  }
}

export async function fetchXpTotal(studentId) {
  if (!studentId) return 0
  const { data, error } = await supabase
    .from('xp_totals')
    .select('total_xp')
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) return 0 // 뷰/테이블 미존재(42P01) 등 — 폴백 0
  return Number(data?.total_xp) || 0
}

// 관리자 대시보드용 배치 조회(fetchDashboardData와 동일 패턴 — 학생별 N번
// 조회하지 않음). 반환: { [studentId]: totalXp }. 조회 실패/테이블 미존재
// 시 빈 객체(=전원 0으로 표시, 크래시 없음).
export async function fetchXpTotals(studentIds) {
  const ids = (studentIds || []).filter(Boolean)
  if (ids.length === 0) return {}
  const { data, error } = await supabase
    .from('xp_totals')
    .select('student_id, total_xp')
    .in('student_id', ids)
  if (error) return {}
  return Object.fromEntries((data || []).map((r) => [r.student_id, Number(r.total_xp) || 0]))
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
    student: { id: s.id, name: s.name, className: s.className, unitName: getStudentUnit(studentId) },
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
// 단어 슬러그 — 앱 전역 표시용 id(미션/퀴즈 중복 제거/오답노트가 전부 이
// 값 기준이라 유닛을 오가도 진행도가 끊기지 않는 근거). 절대 바꾸지 말 것.
const wordSlug = (word) => word.toLowerCase().replace(/\s+/g, '_')

// DB 단어 행 -> 앱 단어 객체 매핑 (getStudentWords 전용 — 현재 유닛 경로와
// v2.1 숙제 교차 유닛 경로가 정확히 같은 모양을 반환하도록 공용화).
const mapWordRow = (cw, classId) => {
  if (!cw || !cw.word) return null
  return {
    id:              wordSlug(cw.word),
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
    // v2.0 단어별 추가 인정 뜻 — en2kr 채점 시 정답 후보에 합류.
    acceptedMeanings: Array.isArray(cw.acceptedMeanings) ? cw.acceptedMeanings : [],
    // classId/unitId: the real DB foreign keys this word belongs to —
    // words are looked up via unit_id -> class_id in Supabase (never by
    // matching a className string), these are exposed for callers that
    // need to confirm/display which class+unit a word belongs to.
    classId:         cw.classId || classId,
    unitId:          cw.unitId || null,
  }
}

// v2.9(decision 0004) — 두 번째 인자는 선택(optional)이다. 생략하면(기존
// 모든 호출부, 예: App.jsx:179) 아래 로직은 v2.8까지와 100% 동일하게
// 동작한다(override 관련 코드는 전부 무조건 false 분기로 스킵됨) — 이게
// 이 확장의 핵심 하위호환 계약이다.
//
// { classId } override가 주어지면(그리고 그 값이 실제로 이 학생의 배정
// 중 하나로 "검증"되면) 학생의 주 반이 아니라 그 반의 단어/유닛/오늘의
// 배정을 조회한다. 검증은 반드시 getStudentClassAssignments(studentId)가
// 미리 채워둔 _studentAssignmentsCache를 "동기"로 조회하는 방식이다 — 이
// 함수 자체는 (App.jsx 등 15개 이상 호출부가 동기로 기대하므로) async로
// 바꿀 수 없는데, 실제 배정 목록은 DB 조회가 필요한 비동기 정보이기
// 때문에, 이 파일의 기존 관례(_cache/_students/_dailyAssignments — 앱
// 시작/새로고침 시 한 번 비동기로 채우고 이후 모든 읽기는 동기)를 그대로
// 재사용한 것. 계약: classId override를 쓰려는 호출부(교재 선택기 UI 등)는
// 그 UI가 뜰 때 먼저 `await getStudentClassAssignments(studentId)`를 한 번
// 호출해 캐시를 채워야 한다. 캐시가 아직 없거나(콜드 스타트) 검증에
// 실패하면(다른 학생의 반 등) override를 조용히 무시하고 학생의 주 반으로
// 폴백한다 — 절대 throw하지 않는다(학생 학습 화면을 절대 깨뜨리지 않는다는
// 이 파일 전체 원칙, fetchXpTotal의 에러 시 0 폴백과 동일한 정신).
export const getStudentWords = (studentId, { classId: classIdOverride } = {}) => {
  const primaryClassId = getStudentClassId(studentId)
  let classId = primaryClassId
  let usingOverride = false

  if (classIdOverride != null && classIdOverride !== primaryClassId) {
    const cachedAssignments = _studentAssignmentsCache.get(studentId)
    const validated = cachedAssignments?.some((a) => a.classId === classIdOverride)
    if (validated) {
      classId = classIdOverride
      usingOverride = true
    } else {
      console.warn('[wordLibrary] getStudentWords: classId override ignored (배정 캐시 미검증 — 먼저 await getStudentClassAssignments(studentId)를 호출하세요)', { studentId, classIdOverride })
    }
  }

  const unitName = usingOverride ? null : getStudentUnit(studentId)
  // Resolve the class by id first (robust to renames) — the joined
  // className is only a fallback for legacy rows with no class_id at all.
  // v3.1 교재 모드(no-override 경로): 단어/유닛의 "콘텐츠 반"은 현재 교재의
  // 소유 컨테이너다(사람 반과 다를 수 있음 — 박준원 반 학생이 김기택 교재
  // 학습 중). 숙제(_dailyAssignments) 조회는 아래에서 계속 사람 반 기준.
  let cls = usingOverride ? getClassNameById(classId) : (getClassNameById(classId) || getStudentClass(studentId))
  const humanClassId = classId
  if (!usingOverride && _textbookMode) {
    const tb = getStudentPrimaryTextbook(studentId)
    if (tb?.ownerClassId) {
      const contentCls = getClassNameById(tb.ownerClassId)
      if (contentCls) { cls = contentCls; classId = tb.ownerClassId }
    }
  }
  let unitObj = null
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
    if (usingOverride) {
      // 학생의 주 반이 아니라 override된 반의 유닛을 해석한다 — 그 배정
      // 행 자체의 current_unit_id를 우선(있으면), 없으면 그 반의 첫 유닛
      // (resolveStudentUnitObj의 "반의 첫 유닛" 최후 폴백과 동일한 정신).
      const targetUnitId = _studentAssignmentsCache.get(studentId)?.find((a) => a.classId === classId)?.unitId
      const units = _cache[cls]?.units || []
      unitObj = (targetUnitId && units.find((u) => u.id === targetUnitId)) || units[0] || null
    } else {
      // v2.1: 유닛 해석은 resolveStudentUnitObj 단일 경로(id 우선 → 이름 →
      // 첫 유닛) — Dashboard가 표시하는 유닛 이름(getStudentUnit)과 여기서
      // 로드하는 단어 목록이 구조적으로 항상 같은 유닛을 가리킨다.
      unitObj = resolveStudentUnitObj(studentId)
    }
    const raw = unitObj?.words || []
    if (!raw.length) {
      console.log('[wordLibrary] getStudentWords: empty result', {
        selectedStudentId: studentId,
        selectedClass: cls,
        selectedClassId: classId,
        selectedUnit: unitObj?.name || unitName,
        queryResult: raw,
        queryError: null,
      })
      return []
    }
    // 숙제는 사람 반 축(반+날짜) — 교재 모드에서도 학생의 실제 반 기준.
    const todaysAssignment = _dailyAssignments[humanClassId]
    const mapped = raw.map((cw) => mapWordRow(cw, classId)).filter(Boolean)

    // v1.3 날짜별 단어 배정: 오늘 지정된 단어가 있으면 그 서브셋만, 없으면
    // (배정 안 함/전부 삭제됨 등) 기존처럼 유닛 전체 단어를 그대로 보여줌 —
    // 기존 동작을 절대 깨뜨리지 않기 위한 폴백.
    if (Array.isArray(todaysAssignment) && todaysAssignment.length > 0) {
      const assignedSet = new Set(todaysAssignment)
      const filtered = mapped.filter((w) => assignedSet.has(w.id))
      if (filtered.length > 0) return filtered
      // v2.1 숙제-유닛 독립: 배정 단어가 지금 보고 있는 유닛에 하나도 없으면
      // (학생이 복습용으로 다른 유닛에 가 있는 경우) 반 전체 유닛에서 찾아
      // 숙제를 우선 표시한다 — 숙제는 반+날짜 축이지 유닛 축이 아니다.
      // 배정 목록 순서 유지, 같은 슬러그가 여러 유닛에 있으면 첫 매치만.
      const bySlug = new Map()
      for (const u of _cache[cls]?.units || []) {
        for (const cw of u.words) {
          if (cw?.word) {
            const slug = wordSlug(cw.word)
            if (!bySlug.has(slug)) bySlug.set(slug, cw)
          }
        }
      }
      const fromWholeClass = todaysAssignment
        .map((slug) => mapWordRow(bySlug.get(slug), classId))
        .filter(Boolean)
      if (fromWholeClass.length > 0) return fromWholeClass
    }
    return mapped
  } catch (err) {
    console.log('[wordLibrary] getStudentWords: query error', {
      selectedStudentId: studentId,
      selectedClass: cls,
      selectedClassId: classId,
      selectedUnit: unitObj?.name || unitName,
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
