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
  }))
  const { data, error: insErr } = await supabase
    .from('words').insert(insertRows).select('id,word,meaning,word_audio_url,example_text')
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

const ACTION_HANDLERS: Record<string, (supabase: any, payload: any) => Promise<unknown>> = {
  'class.create': handleClassCreate,
  'unit.create': handleUnitCreate,
  'class.rename': handleClassRename,
  'class.delete': handleClassDelete,
  'unit.delete': handleUnitDelete,
  'words.bulk_replace': handleWordsBulkReplace,
  'word.accepted_meanings.update': handleWordAcceptedMeaningsUpdate,
  'class.update_settings': handleClassUpdateSettings,
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
