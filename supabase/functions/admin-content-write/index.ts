// supabase/functions/admin-content-write/index.ts
//
// Supabase Edge Function(Deno) — classes/units/words(커리큘럼 콘텐츠) 쓰기
// 전용 관리자 action-dispatcher.
//
// 왜 여기(Edge Function)에 있나, Vercel api/*.js가 아니라:
// 이 저장소의 Vercel 서버리스 함수는 배포당 12개 한도(Hobby 플랜)이고 실측상
// 이미 12/12(여유 0) 상태다 — api/admin-pin-actions.js 헤더 주석과
// supabase/functions/grade-writing-answers/index.ts 헤더 주석이 각각 같은
// 이유로 "새 Vercel 함수를 늘리지 않는다"는 선례를 이미 남겼다. 이번에도
// 같은 패턴(새 Supabase Edge Function)을 따른다.
//
// 무엇을 하나: classes/units/words 세 테이블에 대한 INSERT/UPDATE/DELETE를
// 전부 이 함수 하나로 모은 단일 dispatcher(action 필드로 분기, api/
// admin-pin-actions.js와 정확히 같은 dispatch 관례)로 처리한다. SELECT(조회)는
// 이 함수의 대상이 아니다 — 학생/관리자 화면의 기존 조회는 계속 anon key로
// 직접 Supabase를 읽는다(변경 없음, 성능 감사가 별도로 지적한 전체조회 이슈는
// 이 작업 범위 밖).
//
// 왜 필요했나(2026-07-24 보안 감사, 라이브 실측): classes/units/words
// 테이블에 RLS/GRANT 제한이 전혀 없어 공개된 anon key만으로 인터넷 누구나
// 인증 없이 전체 CRUD가 가능했다(INSERT/PATCH/DELETE 실측 확인). 이 함수
// 배포 + src/utils/wordLibrary.js의 클라이언트 쓰기 경로 전환 +
// supabase_v3_11_lockdown_curriculum_write.sql(RLS로 anon INSERT/UPDATE/
// DELETE 차단, SELECT는 계속 허용) 셋이 합쳐져야 실제로 막힌다 — SQL 실행
// 순서 경고는 그 SQL 파일 헤더 참고(★ 매우 중요, AdminScreen.jsx 후속 배선
// 필요).
//
// 인가 경로(모든 action 공통, action 분기보다 반드시 먼저 실행) —
// api/_pinAuth.js checkAdminReauth / api/admin-pin-actions.js:45-49 /
// supabase/functions/grade-writing-answers/pipeline.js verifyAdminPin과
// 동일한 원칙: process.env(Deno.env)의 ADMIN_PIN과 요청 body의 adminPin을
// 매 요청마다 서버에서 문자열 완전일치로 재검증한다. 실패 시 항상 같은
// { ok:false, reason:'not_authorized' }를 반환(요청이 action 값을 바꿔가며
// "어떤 액션이 존재하는지" 탐지할 수 없게) + grade-writing-answers/index.ts와
// 동일한 1.5초 지연(온라인 브루트포스 완화). 비교 로직 자체는 이 저장소
// 기존 관례(pipeline.js verifyAdminPin, api/_pinAuth.js checkAdminReauth)와
// 마찬가지로 문자열 완전일치다 — crypto.timingSafeEqual을 새로 도입하지
// 않은 이유: 이미 저 두 곳이 이 방식이라 이 함수만 다른 비교 방식을 쓰면
// 드리프트가 생긴다(pipeline.js verifyAdminPin 헤더 주석의 "한쪽만 고치면
// 드리프트" 경고와 동일 원칙). PIN 자체가 4자리라 진짜 방어선은 비교
// 알고리즘이 아니라 "서버측에서만 검증 + 실패 시 지연"이라는 점도 동일
// (api/_pinAuth.js hashPin 헤더 주석 참고).
//
// 인가 통과 후에만 SUPABASE_SERVICE_ROLE_KEY로 client를 만든다(RLS 우회) —
// 이 서비스 롤 키는 이 함수 실행 환경(Deno.env)에만 존재하고 응답 바디에도
// 절대 포함되지 않는다.
//
// ⚠️ 배포는 운영자 수동(에이전트가 실행 불가, DDL과 동일 취급):
//   supabase functions deploy admin-content-write
// ⚠️ 시크릿: ADMIN_PIN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY는 Supabase
//   시크릿이 프로젝트 단위로 공유되므로(grade-writing-answers 함수가 이미
//   이 세 값을 쓰고 있다면) 추가 설정 없이 이 함수도 동일한 값을 즉시 쓸 수
//   있다 — 운영자는 `supabase secrets list`로 이미 설정돼 있는지 먼저
//   확인하고, 없으면만 `supabase secrets set ADMIN_PIN=... SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE_KEY=...`를 실행하면 된다.
//
// ⚠️ 실행 순서(★ SQL 파일 헤더에도 동일 경고, 여기 한 번 더 — 매우 중요):
//   이 함수를 배포해도, 그리고 supabase_v3_11_...sql을 실행해도, 관리자
//   화면(AdminScreen.jsx)이 실제로 pin 값을 이 함수 호출에 실어 보내도록
//   고쳐지기 전까지는 관리자의 반/유닛/단어 생성·수정·삭제가 전부
//   "관리자 인증 실패"로 깨진다. wordLibrary.js 쪽 함수들은 이미 adminPin을
//   받을 수 있게(하위호환 옵셔널 마지막 인자) 고쳐졌지만, AdminScreen.jsx의
//   실제 호출부는 이번 작업 범위에서 의도적으로 건드리지 않았다(동시 작업
//   중인 다른 세션과의 파일 충돌 방지 원칙, CLAUDE.md 규칙 16) — 그 배선은
//   반드시 별도 후속 세션이 완료해야 하고, supabase_v3_11 SQL은 그 후속
//   배선이 배포된 뒤에만 실행해야 한다.
//
// 브라우저에 SERVICE_ROLE_KEY 절대 노출 안 됨.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  // 관리자 전용 쓰기 API(그래도 개인정보/PIN 자체는 다루지 않음) —
  // grade-writing-answers/index.ts와 동일하게 Vercel 프론트(voca-drab.
  // vercel.app)에서 크로스오리진 호출을 허용해야 한다.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// pipeline.js:545-548(grade-writing-answers)과 정확히 동일한 비교 로직 —
// 두 Edge Function 어느 한쪽만 고치면 드리프트가 생기므로 이 파일을 고칠
// 때는 반드시 저 파일도 함께 확인할 것(§ 위 헤더 주석).
function verifyAdminPin(candidatePin: unknown, expectedPin: string | undefined): boolean {
  if (!expectedPin) return false
  return typeof candidatePin === 'string' && candidatePin === expectedPin
}

class BadRequestError extends Error {
  status = 400
  constructor(message: string) {
    super(message)
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestError(`${field} is required`)
  return value
}

function requireId(value: unknown, field: string): string {
  if (value == null || (typeof value !== 'string' && typeof value !== 'number')) {
    throw new BadRequestError(`${field} is required`)
  }
  return String(value)
}

// ── action 핸들러 ──────────────────────────────────────────────────────
// 각 핸들러는 src/utils/wordLibrary.js의 대응 함수가 오늘 하던 것과 정확히
// 같은 쿼리 모양(컬럼/조건/select 목록)을 유지한다 — 동작 변화 0, 실행
// 주체(anon key 직접 → service role key 경유)만 바뀐다.

// class.create — ensureClass()의 "없으면 생성" 브랜치(wordLibrary.js:493-502
// 대응). 클라이언트가 이미 SELECT로 "없음"을 확인한 뒤에만 호출하지만,
// 동시 요청 경합(23505, unique 제약)에도 안전하게 기존 행을 반환한다.
async function handleClassCreate(supabase: any, payload: any) {
  const name = requireString(payload?.name, 'name')
  const classType = payload?.classType === 'special' ? 'special' : 'regular'
  const { data, error } = await supabase
    .from('classes').insert({ name, class_type: classType }).select('id,name,class_type').single()
  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: selErr } = await supabase
        .from('classes').select('id,name,class_type').eq('name', name).maybeSingle()
      if (selErr) throw selErr
      if (existing) return existing
    }
    throw error
  }
  return data
}

// unit.create — ensureUnit()의 "없으면 생성" 브랜치(wordLibrary.js:504-513 대응).
async function handleUnitCreate(supabase: any, payload: any) {
  const classId = requireId(payload?.classId, 'classId')
  const unitName = requireString(payload?.unitName, 'unitName')
  const { data, error } = await supabase
    .from('units').insert({ class_id: classId, name: unitName }).select('id,name').single()
  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: selErr } = await supabase
        .from('units').select('id,name').eq('class_id', classId).eq('name', unitName).maybeSingle()
      if (selErr) throw selErr
      if (existing) return existing
    }
    throw error
  }
  return data
}

// class.rename — renameClass()의 update(wordLibrary.js:636 대응). name
// 중복/공백 검증은 클라이언트(_cache 기준)가 이미 하므로 여기서는 반복하지
// 않는다(그 검증은 로컬 캐시 조회일 뿐 보안 경계가 아님 — 실제 unique
// 제약은 DB가 23505로 최종 방어).
async function handleClassRename(supabase: any, payload: any) {
  const classId = requireId(payload?.classId, 'classId')
  const name = requireString(payload?.name, 'name')
  const { error } = await supabase.from('classes').update({ name }).eq('id', classId)
  if (error) throw error
  return { ok: true }
}

// class.delete — deleteClass()(wordLibrary.js:622 대응).
async function handleClassDelete(supabase: any, payload: any) {
  const classId = requireId(payload?.classId, 'classId')
  const { error } = await supabase.from('classes').delete().eq('id', classId)
  if (error) throw error
  return { ok: true }
}

// unit.delete — deleteClassUnit()(wordLibrary.js:614 대응).
async function handleUnitDelete(supabase: any, payload: any) {
  const unitId = requireId(payload?.unitId, 'unitId')
  const { error } = await supabase.from('units').delete().eq('id', unitId)
  if (error) throw error
  return { ok: true }
}

// words.bulk_replace — setClassWords()의 delete-then-insert(wordLibrary.js:
// 551,564 대응, 엑셀/PDF 일괄 업로드 + 단어별 추가가 전부 이 경로). rows는
// 클라이언트가 이미 계산한 완성된 행(오디오/예문 carry-forward 포함) —
// 이 핸들러는 그대로 저장만 한다. rows가 빈 배열이면(반 전체 단어 비우기)
// delete만 하고 insert는 생략 — 원본 setClassWords의 `if (words.length > 0)`
// 분기와 동일.
//
// 2026-08-04 M3a 데이터 손실 버그 수정 — memory_tip/example_translation을
// 화이트리스트에 추가한다. v3.11 락다운 이후 adminPin 경로(이 핸들러)가
// 사실상 유일한 쓰기 경로라서, wordLibrary.js가 이 두 컬럼을 carry-forward
// 해서 보내도 여기서 걸러버리면 클라이언트 수정이 전부 무의미했다 — 이번
// 수정 전에는 두 컬럼 모두 여기서 조용히 drop되어 매 재저장마다
// NULL로 덮어써졌다(라이브 실측 NULL 40건의 근본 원인).
async function handleWordsBulkReplace(supabase: any, payload: any) {
  const unitId = requireId(payload?.unitId, 'unitId')
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  const { error: delErr } = await supabase.from('words').delete().eq('unit_id', unitId)
  if (delErr) throw delErr
  if (rows.length === 0) return []
  const insertRows = rows.map((r: any, i: number) => ({
    unit_id: unitId,
    word: requireString(r?.word, `rows[${i}].word`),
    meaning: requireString(r?.meaning, `rows[${i}].meaning`),
    position: Number.isFinite(r?.position) ? r.position : i,
    word_audio_url: r?.word_audio_url ?? null,
    example_audio_url: r?.example_audio_url ?? null,
    example_text: r?.example_text ?? null,
    memory_tip: r?.memory_tip ?? null,
    example_translation: r?.example_translation ?? null,
  }))
  const { data, error: insErr } = await supabase
    .from('words').insert(insertRows).select('id,word,meaning,word_audio_url,example_text,memory_tip')
  if (insErr) throw insErr
  return data
}

// word.accepted_meanings.update — setWordAcceptedMeanings()(wordLibrary.js:
// 486 대응). 중복 제거(대소문자/공백 무시)는 이미 클라이언트가 하고 온
// deduped 배열을 그대로 신뢰 — 여기서는 문자열 배열인지 최소 검증만.
async function handleWordAcceptedMeaningsUpdate(supabase: any, payload: any) {
  const wordId = requireId(payload?.wordId, 'wordId')
  const meanings = Array.isArray(payload?.meanings)
    ? payload.meanings.filter((m: unknown) => typeof m === 'string' && m.trim())
    : []
  const { error } = await supabase.from('words').update({ accepted_meanings: meanings }).eq('id', wordId)
  if (error) throw error
  return { ok: true }
}

// class.update_settings — setClassSettings()(wordLibrary.js:436-469 대응).
// 컬럼 부재(부분 마이그레이션) 폴백 로직을 클라이언트와 정확히 같은 순서로
// 서버에서도 재현한다: spelling_direction 먼저 제외 후 재시도, 그래도
// 실패하면 gamification_enabled까지 제외 후 재시도 — 이미 켜둔 다른 설정이
// 신규 컬럼 하나 때문에 통째로 저장 실패하지 않게 하는 원본의 안전장치를
// 그대로 보존한다.
async function handleClassUpdateSettings(supabase: any, payload: any) {
  const classId = requireId(payload?.classId, 'classId')
  const settings = payload?.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new BadRequestError('settings object is required')
  }
  let toSend: Record<string, unknown> = { ...settings }
  let { error } = await supabase.from('classes').update(toSend).eq('id', classId)
  if (error && 'spelling_direction' in toSend) {
    const { spelling_direction: _drop, ...rest } = toSend
    toSend = rest
    ;({ error } = await supabase.from('classes').update(toSend).eq('id', classId))
  }
  if (error && 'gamification_enabled' in toSend) {
    const { gamification_enabled: _drop, ...rest } = toSend
    toSend = rest
    ;({ error } = await supabase.from('classes').update(toSend).eq('id', classId))
  }
  if (error) throw error
  return { ok: true }
}

// assignment.set — setAssignmentForDate()의 upsert(wordLibrary.js 대응).
// wordIds가 빈 배열이면 배정 해제(원본과 동일 의미).
async function handleAssignmentSet(supabase: any, payload: any) {
  const classId = requireId(payload?.classId, 'classId')
  const date = requireString(payload?.date, 'date')
  const wordIds = Array.isArray(payload?.wordIds) ? payload.wordIds : []
  const { error } = await supabase
    .from('daily_assignments')
    .upsert({ class_id: classId, date, word_ids: wordIds }, { onConflict: 'class_id,date' })
  if (error) throw error
  return { ok: true }
}

// unit.meta.update — curriculumApi.js updateUnitMeta()의 anon update
// (id/position/lesson_no/objectives, curriculumApi.js:244-259 대응) 락다운
// 이후 경로. why: v3.11 실행으로 units anon 쓰기(UPDATE 포함)가 RLS
// default-deny로 차단돼, 유닛이 실제로 존재해도 anon UPDATE가 0 rows를
// 반환해 "해당 유닛을 찾을 수 없어요"로 오탐하던 문제(락다운의 부작용,
// upsert/insert가 필요한 문제가 아니었음) — 메타 갱신도 다른 쓰기들과
// 동일하게 service_role 경유가 필요하다. patch는 payload에 실제로 존재하는
// 키만 반영한다(클라이언트가 부분 필드만 보낼 수 있음, curriculumApi.js의
// "PRESENT keys only" 시맨틱을 그대로 서버에서 재현).
async function handleUnitMetaUpdate(supabase: any, payload: any) {
  const unitId = requireId(payload?.unitId, 'unitId')
  const patch: Record<string, unknown> = {}
  if ('position' in (payload || {})) {
    patch.position = payload.position !== '' && payload.position != null ? Number(payload.position) : null
  }
  if ('lessonNo' in (payload || {})) {
    patch.lesson_no = payload.lessonNo !== '' && payload.lessonNo != null ? Number(payload.lessonNo) : null
  }
  if ('objectives' in (payload || {})) {
    patch.objectives = payload.objectives ? String(payload.objectives).trim() : null
  }
  if (Object.keys(patch).length === 0) {
    const { data, error } = await supabase
      .from('units').select('id,name,position,lesson_no,objectives').eq('id', unitId).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('해당 유닛을 찾을 수 없어요.')
    return data
  }
  const { data, error } = await supabase
    .from('units').update(patch).eq('id', unitId)
    .select('id,name,position,lesson_no,objectives').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('해당 유닛을 찾을 수 없어요.')
  return data
}

// ── word_asset.upsert / word_asset.upsert_bulk (2026-08-04 M3a/M4) ────────
// Word Asset Library(word_assets 테이블, supabase_v3_15_word_assets.sql —
// 운영자 수동 실행 대기, 이 함수 배포 시점에 아직 테이블이 없을 수 있음)
// 전용 쓰기 액션. src/utils/wordAssets.js(M2)가 이미 이 두 액션명·payload
// 모양을 전제로 작성돼 있다(upsertWordAsset/upsertWordAssets,
// WORD_ASSET_WRITABLE_COLUMNS) — 이 핸들러가 그 계약을 구현한다.
//
// 순수 upsert 전용 — delete를 절대 쓰지 않는다(이 액션의 유일한 목적이
// "콘텐츠 자산을 채우고 보정하는 것"이지 삭제가 아님). conflict 키는
// (word_key, sense_key)로, supabase_v3_15_word_assets.sql:143의
// `unique (word_key, sense_key)` 제약과 정확히 일치시켰다.
//
// 클라이언트 화이트리스트(wordAssets.js WORD_ASSET_WRITABLE_COLUMNS)와
// 이름·순서를 동일하게 맞췄지만, 이 상수는 독립적으로 유지한다 — "클라이언트
// 페이로드에 있는 키를 그대로 신뢰하지 않는다"는 이 파일의 기존 원칙
// (모든 핸들러가 requireString/requireId로 이미 따르는 방향)을 이 액션에도
// 동일하게 적용하기 위함. 두 목록 중 한쪽만 고치면 필드가 조용히 드롭되는
// 드리프트가 생기므로, 컬럼을 추가/변경할 때는 반드시 두 파일 모두 확인할 것.
const WORD_ASSET_WRITABLE_COLUMNS = [
  'word_key', 'sense_key', 'word',
  'meaning_primary', 'part_of_speech', 'cefr', 'pronunciation_uk',
  'example_sentence', 'example_translation', 'example_source',
  'difficulty',
  'image_prompt', 'image_url', 'image_status',
  'gesture', 'emoji', 'story_memory',
  'base_review_interval_days',
  'tags', 'synonyms', 'antonyms',
  'source', 'approval_status', 'pipeline_status',
  'generated_fields', 'ai_model', 'created_by',
]

// PostgREST가 스키마 캐시에 없는 테이블(= word_assets 미생성, supabase_v3_15
// 미실행 상태)을 대상으로 쿼리하면 보통 42P01(raw Postgres) 또는
// PGRST205(PostgREST)로 응답한다 — src/utils/wordLibrary.js의
// isMissingTableError와 판단 기준은 동일하지만, 이 파일은 Deno Edge
// Function 런타임이라 Vite 번들(src/) 모듈을 import할 수 없어 별도 사본을
// 둔다(api/*.js가 이미 같은 이유로 각자 사본을 유지하는 선례와 동일,
// wordLibrary.js:1187-1190 주석 참고 — 억지 공유 금지).
function isMissingWordAssetsTableError(error: any): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = String(error.message || '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('schema cache')
}

// 화이트리스트를 통과한 키만 남기고, word_key는 클라이언트 값을 신뢰하지
// 않고 서버에서 다시 정규화(trim+lowercase, wordAssets.js wordAssetKey와
// 동일 규칙)한다. sense_key가 없으면 DB 기본값과 동일한 ''로 채워
// onConflict 대상 컬럼이 항상 명시적으로 존재하게 한다.
function filterWordAssetRow(input: any, index: number): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestError(`rows[${index}] is required`)
  }
  if (typeof input.word_key !== 'string' || !input.word_key.trim()) {
    throw new BadRequestError(`rows[${index}].word_key is required`)
  }
  const out: Record<string, unknown> = {}
  for (const key of WORD_ASSET_WRITABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key]
  }
  out.word_key = input.word_key.trim().toLowerCase()
  if (typeof out.sense_key !== 'string') out.sense_key = ''
  return out
}

// word_asset.upsert_bulk와 동일한 상한을 단건 액션에도 방어적으로 적용
// (단건은 항상 1행이라 사실상 무의미하지만 upsertWordAssetRows 하나로
// 두 액션을 공유하기 위해 같은 함수를 통과시킨다). 기존 액션들에는 배열
// 상한 관례가 없어(예: words.bulk_replace/assignment.set 전부 무제한),
// wordAssets.js 클라이언트의 WRITE_CHUNK_SIZE=50보다 여유 있게 200으로
// 잡았다 — 청크 크기가 나중에 조정돼도 이 상한에 바로 걸리지 않도록.
const WORD_ASSET_MAX_ROWS = 200

async function upsertWordAssetRows(supabase: any, rawRows: any[]) {
  if (rawRows.length === 0) return []
  if (rawRows.length > WORD_ASSET_MAX_ROWS) {
    throw new BadRequestError(`rows exceeds max of ${WORD_ASSET_MAX_ROWS}`)
  }
  const rows = rawRows.map((r, i) => filterWordAssetRow(r, i))
  const { data, error } = await supabase
    .from('word_assets')
    .upsert(rows, { onConflict: 'word_key,sense_key' })
    .select('id,word_key,sense_key')
  if (error) {
    if (isMissingWordAssetsTableError(error)) {
      // 500이 아니라 400 + 구분 가능한 메시지 — 클라이언트(wordAssets.js
      // classifyAdminWriteError)는 not_authorized가 아닌 모든 실패를
      // action_not_deployed로 묶어 절대 throw하지 않고 { ok:false }로
      // 폴백하므로, 여기서 500을 던지지만 않으면 이 상태(SQL 미실행)에서도
      // 관리자 화면이 깨지지 않는다(규칙 9).
      throw new BadRequestError('word_assets 테이블이 아직 없어요(supabase_v3_15_word_assets.sql 미실행 — 운영자 수동 실행 필요)')
    }
    throw error
  }
  return data
}

// word_asset.upsert — 단건. payload = 컬럼 객체 그 자체(wordAssets.js
// upsertWordAsset의 filterWordAssetPayload 출력과 동일 모양).
async function handleWordAssetUpsert(supabase: any, payload: any) {
  const data = await upsertWordAssetRows(supabase, [payload])
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

// word_asset.upsert_bulk — payload = { rows: [...] }(wordAssets.js
// upsertWordAssets의 50개 청크 호출과 동일 모양, 서버 상한은
// WORD_ASSET_MAX_ROWS=200으로 청크 크기보다 여유 있게 설정).
async function handleWordAssetUpsertBulk(supabase: any, payload: any) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  return upsertWordAssetRows(supabase, rows)
}

const ACTION_HANDLERS: Record<string, (supabase: any, payload: any) => Promise<unknown>> = {
  'class.create': handleClassCreate,
  'unit.create': handleUnitCreate,
  'class.rename': handleClassRename,
  'class.delete': handleClassDelete,
  'unit.delete': handleUnitDelete,
  'words.bulk_replace': handleWordsBulkReplace,
  'word.accepted_meanings.update': handleWordAcceptedMeaningsUpdate,
  'class.update_settings': handleClassUpdateSettings,
  'assignment.set': handleAssignmentSet,
  'unit.meta.update': handleUnitMetaUpdate,
  'word_asset.upsert': handleWordAssetUpsert,
  'word_asset.upsert_bulk': handleWordAssetUpsertBulk,
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { adminPin?: string; action?: string; payload?: unknown } | null = null
  try {
    body = await req.json()
  } catch {
    body = null
  }
  const { adminPin, action, payload } = body || {}

  // 인가가 항상 먼저 — action 값이 뭐든(존재/미존재 불문) adminPin이 틀리면
  // 항상 같은 not_authorized(§ 위 헤더 주석).
  const ADMIN_PIN = Deno.env.get('ADMIN_PIN')
  if (!verifyAdminPin(adminPin, ADMIN_PIN)) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return json({ ok: false, reason: 'not_authorized' })
  }

  if (typeof action !== 'string' || !ACTION_HANDLERS[action]) {
    return json({ ok: false, error: `unknown action: ${String(action)}` }, 400)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Server not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' }, 500)
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const data = await ACTION_HANDLERS[action](supabase, payload)
    return json({ ok: true, data })
  } catch (err: any) {
    const status = err?.status === 400 ? 400 : 500
    return json({ ok: false, error: err?.message || String(err) }, status)
  }
})
