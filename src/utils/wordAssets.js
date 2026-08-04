// src/utils/wordAssets.js — Word Asset Library 클라이언트 읽기/쓰기 계층
// (M2, 2026-08-04). 대상 테이블: word_assets(supabase_v3_15_word_assets.sql,
// 아직 운영자 수동 실행 대기 — 이 파일이 배포된 시점에도 라이브 DB에
// 테이블이 없을 수 있다).
//
// ── 빈 결과 계약(규칙 9) ────────────────────────────────────────────────
// 이 파일의 모든 조회/쓰기 함수는 테이블 부재/컬럼 부재/권한 오류/네트워크
// 실패 등 어떤 실패에서도 절대 throw하지 않고, 조회 함수는 빈 Map을,
// 쓰기 함수는 `{ ok: false, reason, detail? }` 형태의 구조화된 실패 객체를
// 반환한다 — 호출부가 캐치 블록 없이도 안전하게 "아직 준비 안 됨"을 처리할
// 수 있게 하기 위함(SQL 미실행/Edge Function 액션 미배포 두 시점 모두).
//
// ── import 0 설계(테스트 용이성) ────────────────────────────────────────
// 이 파일은 의도적으로 모듈 최상단에 어떤 static import도 두지 않는다.
// ./supabaseClient.js는 `import.meta.env.VITE_SUPABASE_URL`을 모듈 평가
// 시점에 바로 읽어서(Vite 전용 문법), 이 파일을 plain Node(esbuild 번들
// 없이 `node tests/harness/...`)로 직접 import하면 즉시 크래시한다 —
// wordLibrary.js도 동일한 이유로 scripts/buildWordLibBundle.mjs(esbuild +
// import.meta.env 치환)를 거쳐야만 plain Node에서 실행 가능하다(그 파일
// 헤더 주석 참고). 이 파일의 순수 함수(wordAssetKey/normalizeWordAssetRow/
// mergeWordAsset/mergeWordAssetsIntoWords/filterWordAssetPayload)를 esbuild
// 없이 곧바로 테스트할 수 있게 하기 위해, supabaseClient.js와
// wordLibrary.js(callAdminContentWrite/isMissingTableError)는 실제로 필요한
// 네트워크 함수 내부에서만 동적 `await import(...)`로 지연 로드한다 — Vite
// 프로덕션/개발 빌드에서는 동적 import도 정상 동작(코드 스플리팅될 뿐,
// 동작 변화 없음).

// ════════════════════════════════════════════════════════════════════════
// 순수 함수 — import 0, 네트워크 0
// ════════════════════════════════════════════════════════════════════════

// word_assets.word_key와 동일한 정규화(SQL: lower(btrim(word))의 클라이언트
// 등가물). wordLibrary.js의 wordSlug(공백→'_')와는 다른 정규화다 — 혼동 금지
// (word_key는 공백을 그대로 유지한다).
export function wordAssetKey(word) {
  return String(word ?? '').trim().toLowerCase()
}

// DB snake_case 행 -> 카멜케이스 객체. 배열 컬럼은 배열이 아니면 항상 []로
// 방어, 그 외 누락 필드는 null.
export function normalizeWordAssetRow(row) {
  if (!row) return null
  const arr = (v) => (Array.isArray(v) ? v : [])
  return {
    id: row.id ?? null,
    wordKey: row.word_key ?? null,
    senseKey: row.sense_key ?? '',
    word: row.word ?? null,
    meaningPrimary: row.meaning_primary ?? null,
    partOfSpeech: row.part_of_speech ?? null,
    cefr: row.cefr ?? null,
    pronunciationUk: row.pronunciation_uk ?? null,
    exampleSentence: row.example_sentence ?? null,
    exampleTranslation: row.example_translation ?? null,
    exampleSource: row.example_source ?? null,
    difficulty: row.difficulty ?? null,
    imagePrompt: row.image_prompt ?? null,
    imageUrl: row.image_url ?? null,
    imageStatus: row.image_status ?? null,
    gesture: row.gesture ?? null,
    emoji: row.emoji ?? null,
    storyMemory: row.story_memory ?? null,
    baseReviewIntervalDays: row.base_review_interval_days ?? null,
    tags: arr(row.tags),
    synonyms: arr(row.synonyms),
    antonyms: arr(row.antonyms),
    source: row.source ?? null,
    approvalStatus: row.approval_status ?? null,
    pipelineStatus: row.pipeline_status ?? null,
    generatedFields: row.generated_fields ?? null,
    aiModel: row.ai_model ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

// mappedWord는 wordLibrary.js의 mapWordRow() 결과 모양(meaning/memoryTip/
// easyExample/exampleText/exampleTranslation 등)을 전제한다. asset은
// normalizeWordAssetRow()의 반환 모양(카멜케이스)을 전제한다.
//
// 절대 규칙: 교사가 입력한 값(meaning/memoryTip/easyExample·exampleText/
// exampleTranslation)은 asset으로 절대 덮어쓰지 않는다 — 이미 값이 있으면
// 그대로 두고, 비어 있을 때만 asset으로 채운다.
//
// ⚠️ meaning은 어떤 경우에도 asset으로 채우지 않는다 — word_assets.
// meaning_primary는 표시 전용이고 유닛 컨텍스트가 없어 채점이 깨질 수
// 있다(supabase_v3_15_word_assets.sql 74~80행 주석). asset의 뜻은 별도
// 필드 assetMeaningPrimary로만 노출한다.
export function mergeWordAsset(mappedWord, asset) {
  if (!mappedWord) return mappedWord
  if (!asset) return mappedWord

  const merged = { ...mappedWord }

  // 표시 전용 — 채점(meaning)에는 절대 쓰지 않음.
  merged.assetMeaningPrimary = asset.meaningPrimary ?? null

  if (!merged.memoryTip && asset.storyMemory) {
    merged.memoryTip = asset.storyMemory
  }

  // easyExample/exampleText는 mapWordRow에서 같은 원본(exampleText)에서
  // 파생되므로 함께 채운다 — exampleText가 비어 있을 때만.
  if (!merged.exampleText && asset.exampleSentence) {
    merged.exampleText = asset.exampleSentence
    merged.easyExample = asset.exampleSentence
  }

  if (!merged.exampleTranslation && asset.exampleTranslation) {
    merged.exampleTranslation = asset.exampleTranslation
  }

  // 순수 신규 필드 — 교사 입력과 겹치지 않으므로 항상 asset 값으로 채움.
  merged.partOfSpeech = asset.partOfSpeech ?? null
  merged.cefr = asset.cefr ?? null
  merged.pronunciationUk = asset.pronunciationUk ?? null
  merged.gesture = asset.gesture ?? null
  merged.emoji = asset.emoji ?? null
  merged.tags = Array.isArray(asset.tags) ? asset.tags : []
  merged.synonyms = Array.isArray(asset.synonyms) ? asset.synonyms : []
  merged.antonyms = Array.isArray(asset.antonyms) ? asset.antonyms : []
  merged.imageUrl = asset.imageUrl ?? null
  merged.imageStatus = asset.imageStatus ?? null
  merged.assetDifficulty = asset.difficulty ?? null
  merged.baseReviewIntervalDays = asset.baseReviewIntervalDays ?? null
  merged.assetApprovalStatus = asset.approvalStatus ?? null

  return merged
}

// 배열 헬퍼 — assetMap이 비어 있으면(테이블 부재/조회 실패 폴백 포함)
// 입력 배열을 그대로(새 배열 생성 없이) 반환한다. 참조 동일성을 유지해야
// 호출부(React)가 불필요한 리렌더를 겪지 않는다.
export function mergeWordAssetsIntoWords(mappedWords, assetMap) {
  if (!Array.isArray(mappedWords)) return mappedWords
  if (!assetMap || assetMap.size === 0) return mappedWords
  return mappedWords.map((mw) => {
    if (!mw) return mw
    const key = wordAssetKey(mw.word)
    const asset = key ? assetMap.get(key) : null
    return mergeWordAsset(mw, asset)
  })
}

// ── 쓰기 화이트리스트 ────────────────────────────────────────────────────
// word_assets에서 클라이언트가 upsert 가능한 컬럼만 명시(id/created_at/
// updated_at 제외 — id/created_at은 서버가 관리, updated_at은 DB 기본값+
// 향후 트리거 대상). word_key/sense_key는 충돌 키이자 upsert 시 반드시
// 필요한 식별 컬럼이라 화이트리스트에 포함한다. M4에서 admin-content-write
// Edge Function이 word_asset.upsert 액션을 구현할 때 이 목록과 서버측
// 화이트리스트를 대조할 근거로 쓴다(아직 Edge Function 미구현 — 이 파일
// 범위 밖).
export const WORD_ASSET_WRITABLE_COLUMNS = [
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

// 화이트리스트에 있는 키만 통과시키는 순수 필터(값은 가공하지 않고 그대로
// 전달 — 타입/도메인 검증은 서버(Edge Function, M4)가 최종 책임진다).
export function filterWordAssetPayload(asset) {
  const out = {}
  if (!asset || typeof asset !== 'object') return out
  for (const key of WORD_ASSET_WRITABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(asset, key)) out[key] = asset[key]
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════
// 네트워크 함수 — 아래부터는 실제 Supabase/Edge Function 호출. 위 "import 0
// 설계" 주석 참고 — supabaseClient/wordLibrary는 함수 내부에서만 동적 로드.
// ════════════════════════════════════════════════════════════════════════

const FETCH_CHUNK_SIZE = 200

// select 컬럼은 명시적으로 나열(select('*') 금지 — 컬럼이 늘어날 때 결과
// 모양이 예측 불가능해지는 것을 방지).
const WORD_ASSETS_SELECT = [
  'id', 'word_key', 'sense_key', 'word',
  'meaning_primary', 'part_of_speech', 'cefr', 'pronunciation_uk',
  'example_sentence', 'example_translation', 'example_source',
  'difficulty',
  'image_prompt', 'image_url', 'image_status',
  'gesture', 'emoji', 'story_memory',
  'base_review_interval_days',
  'tags', 'synonyms', 'antonyms',
  'source', 'approval_status', 'pipeline_status',
  'generated_fields', 'ai_model', 'created_by',
  'created_at', 'updated_at',
].join(',')

// words는 문자열 배열 또는 {word} 객체 배열 둘 다 받는다. 반환:
// Map<word_key, normalizeWordAssetRow(row)>. 같은 키가 여러 번 오면 첫 행
// 유지. 어떤 에러에서도 throw하지 않고 빈 Map으로 폴백한다(테이블 부재/
// 컬럼 부재/권한/네트워크 실패 전부 포함 — 위 "빈 결과 계약" 참고).
export async function fetchWordAssetsByWords(words) {
  const list = Array.isArray(words) ? words : []
  const keys = []
  const seen = new Set()
  for (const w of list) {
    const raw = w && typeof w === 'object' ? w.word : w
    const key = wordAssetKey(raw)
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  const result = new Map()
  if (keys.length === 0) return result

  let supabase
  let isMissingTableError
  try {
    ;({ supabase } = await import('./supabaseClient'))
    ;({ isMissingTableError } = await import('./wordLibrary'))
  } catch (err) {
    console.warn('[wordAssets] fetchWordAssetsByWords: 클라이언트 로드 실패(빈 Map으로 폴백):', err?.message || err)
    return result
  }

  try {
    for (let i = 0; i < keys.length; i += FETCH_CHUNK_SIZE) {
      const chunk = keys.slice(i, i + FETCH_CHUNK_SIZE)
      const { data, error } = await supabase.from('word_assets').select(WORD_ASSETS_SELECT).in('word_key', chunk)
      if (error) {
        const reason = isMissingTableError?.(error) ? 'word_assets 테이블이 아직 없음(supabase_v3_15 미실행)' : (error.message || String(error))
        console.warn(`[wordAssets] fetchWordAssetsByWords 조회 실패(빈 Map으로 폴백): ${reason}`)
        return new Map()
      }
      for (const row of data || []) {
        if (!row || !row.word_key) continue
        if (result.has(row.word_key)) continue
        result.set(row.word_key, normalizeWordAssetRow(row))
      }
    }
  } catch (err) {
    console.warn('[wordAssets] fetchWordAssetsByWords 예외(빈 Map으로 폴백):', err?.message || err)
    return new Map()
  }
  return result
}

// admin-content-write 에러 메시지를 대략 분류(구조화 정보가 없어 메시지
// 텍스트로만 판단 — callAdminContentWrite는 not_authorized일 때만 특정
// 문구를 던진다, wordLibrary.js 헤더 주석 참고). 그 외는 전부
// "action_not_deployed"로 취급 — 지금 시점(M2)엔 admin-content-write
// Edge Function에 word_asset.* 액션 자체가 없으므로(M4 범위) 이게 가장
// 흔한 실패 사유다.
function classifyAdminWriteError(err) {
  const msg = String(err?.message || err || '')
  if (/관리자 인증|not_authorized/i.test(msg)) return 'not_authorized'
  return 'action_not_deployed'
}

// adminPin이 없으면 즉시(네트워크 호출 없이) { ok:false, reason:
// 'admin_pin_required' }를 반환한다. adminPin이 있으면 admin-content-write
// Edge Function의 word_asset.upsert 액션을 호출한다 — 단, 이 액션은 M2
// 시점에 아직 배포돼 있지 않다(Edge Function 수정은 M4 범위, 이 파일에서
// 절대 건드리지 않음). 그래서 실패는 거의 항상 { ok:false, reason:
// 'action_not_deployed' } 형태로 돌아온다 — 절대 throw하지 않는다.
export async function upsertWordAsset(asset, adminPin) {
  if (!adminPin) return { ok: false, reason: 'admin_pin_required' }
  const payload = filterWordAssetPayload(asset)
  if (!payload.word_key) return { ok: false, reason: 'invalid_payload', detail: 'word_key가 필요해요' }
  try {
    const { callAdminContentWrite } = await import('./wordLibrary')
    const data = await callAdminContentWrite('word_asset.upsert', payload, adminPin)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, reason: classifyAdminWriteError(err), detail: err?.message || String(err) }
  }
}

const WRITE_CHUNK_SIZE = 50

// upsertWordAsset의 배열 버전 — 50개씩 청크로 나눠 word_asset.upsert_bulk
// 액션을 호출한다(단일 upsert 액션과 이름을 구분해 둔 것은 M4 Edge Function
// 설계 시 계약을 명시적으로 남기기 위함일 뿐, 실제 액션명은 M4에서
// 확정한다 — 이 파일 범위 밖). adminPin 없으면 청크 계산조차 하지 않고
// 즉시 admin_pin_required. 어느 청크든 실패하면 그 시점까지의 성공 결과와
// 함께 구조화된 실패를 반환(throw 없음).
export async function upsertWordAssets(assets, adminPin) {
  if (!adminPin) return { ok: false, reason: 'admin_pin_required' }
  const list = Array.isArray(assets) ? assets : []
  const chunks = []
  for (let i = 0; i < list.length; i += WRITE_CHUNK_SIZE) {
    const rows = list.slice(i, i + WRITE_CHUNK_SIZE).map(filterWordAssetPayload).filter((p) => !!p.word_key)
    if (rows.length > 0) chunks.push(rows)
  }
  if (chunks.length === 0) return { ok: true, data: [] }

  const results = []
  try {
    const { callAdminContentWrite } = await import('./wordLibrary')
    for (const rows of chunks) {
      const data = await callAdminContentWrite('word_asset.upsert_bulk', { rows }, adminPin)
      results.push(data)
    }
  } catch (err) {
    return { ok: false, reason: classifyAdminWriteError(err), detail: err?.message || String(err), partial: results }
  }
  return { ok: true, data: results }
}
