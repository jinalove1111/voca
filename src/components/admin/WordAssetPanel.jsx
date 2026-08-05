import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../utils/supabaseClient'
import { isMissingTableError, groupAssetPayloadsByShape } from '../../utils/wordLibrary'
import {
  normalizeWordAssetRow, upsertWordAsset, upsertWordAssets, WORD_ASSET_WRITABLE_COLUMNS,
  selectAiGenerationCandidates, buildAiGeneratedAssetPayload, generateWordAssetsViaAi,
  summarizeAiGenerationOutcome,
  AI_GENERATE_MAX_WORDS_PER_RUN,
} from '../../utils/wordAssets'

// WordAssetPanel.jsx — M4: Word Asset Library 관리자 편집기(word_assets 테이블
// 목록/검색/편집/승인). AdminScreen.jsx의 새 최상위 탭('wordassets')으로
// 등록되어 tab === 'wordassets'일 때만 마운트된다(다른 탭 컴포넌트와 동일한
// "탭 선택 시에만 렌더" 지연 마운트 관례 — CurriculumHub.jsx/StudentDirectory.jsx
// 참고, 별도 React.lazy 코드스플리팅은 이 저장소에 아직 선례가 없어 새로
// 도입하지 않음).
//
// 이 파일은 src/utils/wordAssets.js(M2)/wordAssetRules.js(M3b)를 읽기만 하고
// 절대 수정하지 않는다(작업 지시 소유권 경계). 목록 조회는 그 파일의
// fetchWordAssetsByWords(단어 배열 전용)로는 처리할 수 없어(전체/필터 조회가
// 필요) 이 파일 안에서 직접 supabase.from('word_assets').select(...)를
// 호출하되, wordAssets.js와 동일한 "빈 결과 계약"(절대 throw 없이 빈 배열로
// 폴백)을 그대로 지킨다 — isMissingTableError(wordLibrary.js, export됨)로
// 테이블 부재를 감지한다.
//
// 쓰기(생성/수정/승인)는 항상 upsertWordAsset(payload, adminPin)만 쓴다 —
// 이 함수는 절대 throw하지 않고 { ok:false, reason, detail? }를 반환하므로
// (wordAssets.js 헤더 주석), 이 컴포넌트도 그 계약에 맞춰 try/catch 없이
// res.ok만 확인한다. word_assets는 anon SELECT-only이므로(v3_15 SQL 헤더의
// RLS 설계 정정) 쓰기는 반드시 admin-content-write Edge Function의
// word_asset.upsert 액션을 거쳐야 하고, 그 액션이 아직 배포되지 않았으면
// (M4 시점 예상되는 가장 흔한 실패) reason:'action_not_deployed'로 안전하게
// 실패한다 — 이 컴포넌트는 그 실패를 안내 배너로만 보여주고 크래시하지
// 않는다.
//
// ── AI 생성 배선(P2, 2026-08-05) ────────────────────────────────────────
// "🤖 AI 생성" 버튼은 generate-word-assets Edge Function(별도 함수, DB 쓰기
// 없음 — preview-only)을 호출해 cefr/pronunciation_uk/example_sentence(+
// translation)/part_of_speech 4~5개 필드를 채운 뒤, 그 결과를 이 화면이
// upsertWordAssets(word_asset.upsert_bulk)로 저장한다. "어떤 단어를 요청할지"
// (selectAiGenerationCandidates)와 "AI 결과 중 어떤 필드를 실제로 저장할지"
// (buildAiGeneratedAssetPayload) 판단은 전부 wordAssets.js의 순수 함수가
// 하고, 이 컴포넌트는 그 결과를 그대로 호출·표시만 한다(로직을 여기서
// 재구현하지 않음 — tests/harness/runWordAssets.mjs가 그 순수 함수를
// 이미 전수 검증). ExcelUpload(AdminScreen.jsx, M3c)의 "이미 채워진 필드는
// 절대 덮어쓰지 않는다 + approval_status=approved 행은 통째로 건너뛴다"
// 원칙을 이 흐름도 그대로 물려받는다(buildAiGeneratedAssetPayload가 그
// 원칙을 구현). 실패(예산 초과/미배포/인증 실패/네트워크 오류 전부)는
// writeFailureMessage로 통일된 배너 문구로만 보여주고 절대 크래시하지 않는다.

// select 컬럼은 WORD_ASSET_WRITABLE_COLUMNS(단일 원본, wordAssets.js export)
// + id/created_at/updated_at. select('*') 금지 관례를 그대로 따른다.
const LIST_SELECT = [...WORD_ASSET_WRITABLE_COLUMNS, 'id', 'created_at', 'updated_at'].join(',')

// 599행 규모라 페이지네이션 대신 단순 상한 + 검색/필터로 좁히는 방식으로
// 충분하다(작업 지시). 상한에 걸리면 배너로 안내한다.
const LIST_LIMIT = 300

const PIPELINE_STATUSES = ['pending', 'partial', 'complete', 'failed']
const APPROVAL_STATUSES = ['draft', 'pending', 'approved', 'rejected']
const IMAGE_STATUSES = ['none', 'prompt_ready', 'queued', 'generating', 'ready', 'failed']
const DIFFICULTY_OPTIONS = [1, 2, 3, 4, 5]
// leitner.js BOX_INTERVALS_DAYS와 정확히 동일한 도메인(DB CHECK) — wordAssetRules.js
// 헤더 주석과 동일 근거, 임의로 값을 추가하면 저장이 DB CHECK 위반으로 실패한다.
const INTERVAL_OPTIONS = [0, 1, 3, 7, 14, 30]

const SOURCE_BADGE = { teacher: '👩‍🏫 teacher', import: '📥 import', rule: '⚙️ rule', ai: '🤖 ai' }
const APPROVAL_STYLE = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const APPROVAL_LABEL = { draft: '초안', pending: '검수요청', approved: '승인', rejected: '반려' }
const PIPELINE_LABEL = { pending: '대기', partial: '부분완성', complete: '완성', failed: '실패' }
const IMAGE_LABEL = { none: '없음', prompt_ready: '프롬프트준비', queued: '대기열', generating: '생성중', ready: '완료', failed: '실패' }

// snake_case(DB/payload) <-> camelCase(normalizeWordAssetRow 결과) 매핑.
// 편집 가능 필드만 여기 있다 — word_key/sense_key/word는 조회 키라 편집 UI에
// 없다(작업 지시).
const EDIT_FIELD_MAP = {
  meaning_primary: { camel: 'meaningPrimary', label: '뜻(표시용)', kind: 'text' },
  part_of_speech: { camel: 'partOfSpeech', label: '품사', kind: 'text' },
  cefr: { camel: 'cefr', label: 'CEFR', kind: 'text' },
  pronunciation_uk: { camel: 'pronunciationUk', label: '영국식 발음', kind: 'text' },
  example_sentence: { camel: 'exampleSentence', label: '예문', kind: 'textarea' },
  example_translation: { camel: 'exampleTranslation', label: '예문 번역', kind: 'text' },
  story_memory: { camel: 'storyMemory', label: '기억법(스토리)', kind: 'textarea' },
  gesture: { camel: 'gesture', label: '제스처', kind: 'text' },
  emoji: { camel: 'emoji', label: '이모지', kind: 'text' },
  difficulty: { camel: 'difficulty', label: '난이도(1~5)', kind: 'difficulty' },
  base_review_interval_days: { camel: 'baseReviewIntervalDays', label: '기본 복습 간격(일)', kind: 'interval' },
  tags: { camel: 'tags', label: '태그(쉼표로 구분)', kind: 'array' },
  synonyms: { camel: 'synonyms', label: '동의어(쉼표로 구분)', kind: 'array' },
  antonyms: { camel: 'antonyms', label: '반의어(쉼표로 구분)', kind: 'array' },
  image_prompt: { camel: 'imagePrompt', label: '이미지 프롬프트', kind: 'textarea' },
}
const EDIT_SNAKE_KEYS = Object.keys(EDIT_FIELD_MAP)

function parseCommaText(text) {
  return String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

function assetKeyOf(asset) {
  return `${asset.wordKey}::${asset.senseKey ?? ''}`
}

// upsertWordAsset의 { ok:false, reason, detail? }를 사람이 바로 이해할 수
// 있는 한국어 안내로 변환. reason 목록은 wordAssets.js classifyAdminWriteError/
// upsertWordAsset 헤더 주석 그대로.
function writeFailureMessage(res) {
  if (res.reason === 'admin_pin_required') return '관리자 인증(PIN)이 없어서 저장할 수 없어요. 관리자 화면에 다시 로그인해주세요.'
  if (res.reason === 'not_authorized') return res.detail || '관리자 인증이 만료됐거나 서버에 전달되지 않았어요. 관리자 화면을 새로고침 후 다시 로그인해주세요.'
  if (res.reason === 'action_not_deployed') {
    return '이 저장 기능은 아직 서버에 배포되지 않았어요(admin-content-write Edge Function에 word_asset.upsert 액션이 아직 없어요). 배포 전까지 저장/승인은 동작하지 않지만, 목록 조회·검색은 계속 쓸 수 있어요.'
  }
  if (res.reason === 'invalid_payload') return res.detail || '입력값을 확인해주세요.'
  return res.detail || '저장 중 오류가 발생했어요.'
}

function buildFormFromAsset(asset) {
  const form = {}
  for (const snakeKey of EDIT_SNAKE_KEYS) {
    const { camel, kind } = EDIT_FIELD_MAP[snakeKey]
    if (kind === 'array') {
      form[camel] = (Array.isArray(asset[camel]) ? asset[camel] : []).join(', ')
    } else if (kind === 'difficulty' || kind === 'interval') {
      form[camel] = asset[camel] === null || asset[camel] === undefined ? '' : String(asset[camel])
    } else {
      form[camel] = asset[camel] ?? ''
    }
  }
  return form
}

// form(문자열/텍스트 상태)과 asset(원래 로드된 값)을 비교해, 실제로 값이
// 바뀐 필드만 payload/generatedFieldsPatch에 담는다. 안 바뀐 필드는 payload에
// 아예 넣지 않는다 — buildUnitWordAssetPayloads(wordLibrary.js)가 이미 세운
// "값 유무 자체가 신호" 관례(키 부재 ≠ null)와 동일 원칙, 그리고 서버가
// 부분 payload를 partial upsert로 처리하는 기존 관례와도 맞다.
function diffFormAgainstAsset(form, asset) {
  const payload = {}
  const generatedFieldsPatch = {}
  for (const snakeKey of EDIT_SNAKE_KEYS) {
    const { camel, kind } = EDIT_FIELD_MAP[snakeKey]
    let newVal
    let oldVal
    if (kind === 'array') {
      newVal = parseCommaText(form[camel])
      oldVal = Array.isArray(asset[camel]) ? asset[camel] : []
      if (JSON.stringify(newVal) === JSON.stringify(oldVal)) continue
    } else if (kind === 'difficulty' || kind === 'interval') {
      const raw = form[camel]
      newVal = raw === '' || raw === null || raw === undefined ? null : Number(raw)
      oldVal = asset[camel] ?? null
      if (newVal === oldVal) continue
    } else {
      const raw = form[camel]
      newVal = typeof raw === 'string' && raw.trim() === '' ? null : raw
      oldVal = asset[camel] ?? null
      if (newVal === oldVal) continue
    }
    payload[snakeKey] = newVal
    generatedFieldsPatch[snakeKey] = 'teacher'
  }
  return { payload, generatedFieldsPatch }
}

export default function WordAssetPanel({ adminPin }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [truncated, setTruncated] = useState(false)

  const [search, setSearch] = useState('')
  const [pipelineFilter, setPipelineFilter] = useState('')
  const [approvalFilter, setApprovalFilter] = useState('')
  const [imageFilter, setImageFilter] = useState('')

  const [expandedKey, setExpandedKey] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [writeBanner, setWriteBanner] = useState(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      let query = supabase.from('word_assets').select(LIST_SELECT).order('word', { ascending: true }).limit(LIST_LIMIT)
      const term = search.trim()
      if (term) query = query.ilike('word', `%${term}%`)
      if (pipelineFilter) query = query.eq('pipeline_status', pipelineFilter)
      if (approvalFilter) query = query.eq('approval_status', approvalFilter)
      if (imageFilter) query = query.eq('image_status', imageFilter)

      const { data, error } = await query
      if (error) {
        if (isMissingTableError(error)) {
          setTableMissing(true)
          setRows([])
        } else {
          console.warn('[WordAssetPanel] 목록 조회 실패(빈 목록으로 폴백):', error.message || error)
          setLoadError(error.message || String(error))
          setRows([])
        }
        setTruncated(false)
        return
      }
      setTableMissing(false)
      const list = (data || []).map(normalizeWordAssetRow)
      setRows(list)
      setTruncated(list.length >= LIST_LIMIT)
    } catch (err) {
      console.warn('[WordAssetPanel] 목록 조회 예외(빈 목록으로 폴백):', err?.message || err)
      setLoadError(err?.message || String(err))
      setRows([])
      setTruncated(false)
    } finally {
      setLoading(false)
    }
  }

  // 탭 선택 시(마운트 시) + 검색/필터 변경 시에만 조회 — ExampleManager.jsx와
  // 동일한 관례(디바운스 없음, 필터 종류가 적어 문제되지 않음).
  useEffect(() => { load() }, [search, pipelineFilter, approvalFilter, imageFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = (asset) => {
    setExpandedKey(assetKeyOf(asset))
    setForm(buildFormFromAsset(asset))
    setWriteBanner(null)
  }
  const closeEdit = () => { setExpandedKey(null); setForm(null) }

  const handleSave = async (asset) => {
    if (!form) return
    const { payload, generatedFieldsPatch } = diffFormAgainstAsset(form, asset)
    if (Object.keys(payload).length === 0) {
      alert('변경된 내용이 없어요.')
      return
    }
    setBusy(true)
    setWriteBanner(null)
    try {
      const mergedGeneratedFields = { ...(asset.generatedFields || {}), ...generatedFieldsPatch }
      const fullPayload = {
        word_key: asset.wordKey,
        sense_key: asset.senseKey ?? '',
        word: asset.word,
        ...payload,
        source: 'teacher',
        generated_fields: mergedGeneratedFields,
      }
      const res = await upsertWordAsset(fullPayload, adminPin)
      if (!res.ok) { setWriteBanner(writeFailureMessage(res)); return }
      closeEdit()
      await load()
    } finally {
      setBusy(false)
    }
  }

  const handleApprovalChange = async (asset, nextStatus) => {
    if (nextStatus === asset.approvalStatus) return
    if (nextStatus === 'approved') {
      const ok = window.confirm('승인하면 앞으로 엑셀 재업로드가 이 단어 행을 자동으로 건드리지 않게 돼요(교사 승인 콘텐츠는 보호됨). 승인할까요?')
      if (!ok) return
    }
    setBusy(true)
    setWriteBanner(null)
    try {
      const res = await upsertWordAsset({
        word_key: asset.wordKey,
        sense_key: asset.senseKey ?? '',
        word: asset.word,
        approval_status: nextStatus,
      }, adminPin)
      if (!res.ok) { setWriteBanner(writeFailureMessage(res)); return }
      await load()
    } finally {
      setBusy(false)
    }
  }

  // ── AI 생성(P2 배선) ─────────────────────────────────────────────────────
  // rows(현재 목록/필터 결과)가 바뀔 때만 재계산 — 순수 함수라 rows 참조가
  // 그대로면(필터/검색 안 바뀜) 매 렌더마다 다시 계산하지 않아도 된다.
  const aiCandidates = useMemo(() => selectAiGenerationCandidates(rows), [rows])
  const [aiBusy, setAiBusy] = useState(false)
  const [aiBanner, setAiBanner] = useState(null) // { tone: 'error'|'info'|'success', text }

  const handleAiGenerate = async () => {
    if (aiCandidates.selected.length === 0) return
    const n = aiCandidates.selected.length
    const remaining = aiCandidates.remainingCount
    const confirmMsg =
      `현재 목록에서 ${n}개 단어의 빈 필드(CEFR/영국식 발음/예문+번역/품사)를 AI로 채울게요.\n` +
      `이 AI 비용은 쓰기시험 채점(grade-writing-answers)과 같은 하루 예산을 나눠 써요.\n` +
      (remaining > 0 ? `조건에 맞는 단어가 ${remaining}개 더 있지만, 한 번에 최대 ${AI_GENERATE_MAX_WORDS_PER_RUN}개까지만 처리해요(나머지는 다음 실행에서).\n` : '') +
      `이미 값이 있는 필드나 '승인' 상태인 단어는 절대 건드리지 않아요. 계속할까요?`
    const ok = window.confirm(confirmMsg)
    if (!ok) return

    setAiBusy(true)
    setAiBanner(null)
    setWriteBanner(null)
    try {
      const targets = aiCandidates.selected
      const res = await generateWordAssetsViaAi(
        targets.map((a) => ({ word: a.word, word_key: a.wordKey, meaning: a.meaningPrimary || '' })),
        adminPin,
      )
      if (!res.ok) {
        setAiBanner({ tone: 'error', text: writeFailureMessage(res) })
        return
      }
      if (res.budget?.exceeded) {
        setAiBanner({
          tone: 'error',
          text: `오늘 AI 비용 예산(하루 상한 $${res.budget.capUsd ?? '?'}, 쓰기시험 채점과 공유)을 이미 넘어서 이번 실행은 생성을 건너뛰었어요. 저장도 시도하지 않았어요 — 내일 다시 시도해주세요.`,
        })
        return
      }

      const aiByWordKey = new Map((res.results || []).map((r) => [r.word_key, r]))
      const payloads = []
      for (const asset of targets) {
        const aiResult = aiByWordKey.get(asset.wordKey)
        if (!aiResult) continue
        const payload = buildAiGeneratedAssetPayload(asset, aiResult)
        if (payload) payloads.push(payload)
      }

      // 진단성 개선(2026-08-05) — 서버가 warnings/usage.batchCount로 이미
      // 실패 사유를 정직하게 알려주는데도 이전 배너는 그 정보를 버리고
      // 뭉뚱그린 문구만 보여줬다(운영자가 "AI가 동작했다"고 착각한 실사고
      // 원인). summarizeAiGenerationOutcome로 서버가 준 원인을 그대로 화면에
      // 노출한다.
      const outcome = summarizeAiGenerationOutcome(res.results, res.usage)

      if (payloads.length === 0) {
        let text = `AI 호출은 완료됐지만 실제로 채워진(그리고 아직 비어있던) 필드가 없어서 저장할 내용이 없었어요(${n}개 단어 확인함).`
        if (outcome.aiCallCount === 0) {
          text += ' 서버가 AI를 실제로 호출하지 않았어요(예산 초과이거나 요청이 AI 단계까지 도달하지 못했을 가능성이 커요).'
        }
        if (outcome.distinctWarnings.length > 0) {
          text += ` — 사유: ${outcome.distinctWarnings.join(' / ')}`
        } else if (outcome.aiCallCount > 0) {
          text += ' AI는 호출됐지만 응답에서 사용할 수 있는 값이 하나도 없었어요(파싱/검증 단계에서 전부 제외됐을 수 있어요) — Supabase 대시보드에서 generate-word-assets Edge Function 로그를 확인해보세요.'
        }
        setAiBanner({ tone: 'info', text })
        await load()
        return
      }

      let anyFail = null
      for (const group of groupAssetPayloadsByShape(payloads)) {
        const upsertRes = await upsertWordAssets(group, adminPin)
        if (!upsertRes.ok && !anyFail) anyFail = upsertRes
      }
      if (anyFail) {
        setAiBanner({ tone: 'error', text: `일부 저장에 실패했어요: ${writeFailureMessage(anyFail)}` })
      } else {
        let text = `${payloads.length}개 단어의 빈 필드를 AI로 채워 저장했어요(확인한 단어 ${n}개 중).`
        if (outcome.warningCount > 0) {
          text += ` (경고 ${outcome.warningCount}건 — 일부 필드는 채워지지 않았어요)`
        }
        setAiBanner({ tone: 'success', text })
      }
      await load()
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-3 text-xs font-bold text-indigo-800">
        🗂 단어 자산 편집기 — word_assets(단어 텍스트 키 기반 콘텐츠 자산: 뜻/예문/발음/태그 등)를
        검색·편집·승인해요. 여기서 바꾸는 값은 표시/힌트 전용이고, 채점 정답(뜻)은 절대
        영향받지 않아요(반별 words 테이블은 이 화면에서 건드리지 않아요).
      </div>

      {tableMissing && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 text-xs font-bold text-orange-700">
          ⚠️ 아직 준비되지 않았어요 — word_assets 테이블이 없어요(supabase_v3_15_word_assets.sql이
          아직 Supabase에서 실행되지 않았어요). 운영자가 Supabase 대시보드 SQL Editor에서
          실행하면 새로고침 후 자동으로 목록이 보여요.
          <div className="mt-2">
            <button onClick={load} className="bg-orange-500 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
              🔄 다시 확인
            </button>
          </div>
        </div>
      )}

      {!tableMissing && loadError && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-xs font-bold text-red-700">
          ⚠️ 목록을 불러오지 못했어요: {loadError}
          <div className="mt-2">
            <button onClick={load} className="bg-red-500 text-white font-black px-3 py-1.5 rounded-lg text-xs btn-press">
              🔄 다시 시도
            </button>
          </div>
        </div>
      )}

      {writeBanner && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 text-xs font-bold text-orange-700 flex items-start justify-between gap-2">
          <span>⚠️ {writeBanner}</span>
          <button onClick={() => setWriteBanner(null)} className="flex-shrink-0 text-orange-400 font-black btn-press">✕</button>
        </div>
      )}

      {aiBanner && (
        <div className={`rounded-xl p-3 text-xs font-bold flex items-start justify-between gap-2 border-2 ${
          aiBanner.tone === 'success' ? 'bg-green-50 border-green-200 text-green-700'
            : aiBanner.tone === 'error' ? 'bg-orange-50 border-orange-200 text-orange-700'
            : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          <span>{aiBanner.tone === 'success' ? '✅' : aiBanner.tone === 'error' ? '⚠️' : 'ℹ️'} {aiBanner.text}</span>
          <button onClick={() => setAiBanner(null)} className="flex-shrink-0 font-black btn-press opacity-60">✕</button>
        </div>
      )}

      {!tableMissing && (
        <>
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-black text-indigo-800">
              🤖 AI 생성 — 현재 목록(검색/필터 반영)에서 승인되지 않았고 빈 필드가 있는 단어를 대상으로 해요.
            </p>
            <p className="text-[11px] text-indigo-500">
              대상 {aiCandidates.selected.length}개
              {aiCandidates.remainingCount > 0 ? ` (조건에 맞는 단어가 ${aiCandidates.remainingCount}개 더 있어요 — 한 번에 최대 ${AI_GENERATE_MAX_WORDS_PER_RUN}개까지)` : ''}
              . 이미 값이 있는 필드는 절대 덮어쓰지 않고, AI 비용은 쓰기시험 채점과 같은 하루 예산을 공유해요.
            </p>
            <button
              onClick={handleAiGenerate}
              disabled={aiBusy || busy || aiCandidates.selected.length === 0}
              className="w-full bg-indigo-500 disabled:bg-gray-300 text-white font-black py-1.5 rounded-lg text-xs btn-press"
            >
              {aiBusy ? '⏳ AI 생성 중...' : aiCandidates.selected.length === 0 ? '🤖 AI로 채울 단어 없음' : `🤖 AI 생성 (${aiCandidates.selected.length}개)`}
            </button>
          </div>

          <div className="bg-white rounded-xl p-3 card-shadow space-y-1.5">
            <p className="text-xs font-black text-gray-700">검색 · 필터</p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="단어 검색 (부분일치)"
              aria-label="단어 검색"
              className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5"
            />
            <div className="grid grid-cols-3 gap-1.5">
              <select value={pipelineFilter} onChange={(e) => setPipelineFilter(e.target.value)}
                aria-label="생성 상태 필터"
                className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="">생성상태 전체</option>
                {PIPELINE_STATUSES.map((s) => <option key={s} value={s}>{PIPELINE_LABEL[s] || s}</option>)}
              </select>
              <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)}
                aria-label="승인 상태 필터"
                className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="">승인상태 전체</option>
                {APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{APPROVAL_LABEL[s] || s}</option>)}
              </select>
              <select value={imageFilter} onChange={(e) => setImageFilter(e.target.value)}
                aria-label="이미지 상태 필터"
                className="text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="">이미지상태 전체</option>
                {IMAGE_STATUSES.map((s) => <option key={s} value={s}>{IMAGE_LABEL[s] || s}</option>)}
              </select>
            </div>
            <button onClick={load} className="w-full bg-indigo-100 text-indigo-700 font-bold py-1.5 rounded-lg text-xs btn-press">
              🔄 새로고침
            </button>
          </div>

          {loading && <p className="text-xs text-gray-400 py-2">불러오는 중...</p>}
          {!loading && rows.length === 0 && !loadError && (
            <p className="text-xs text-gray-400 py-2">조건에 맞는 단어 자산이 없어요.</p>
          )}
          {!loading && rows.length > 0 && (
            <p className="text-[11px] text-gray-400">
              {rows.length}개 표시{truncated ? ` (상한 ${LIST_LIMIT}개 도달 — 검색이나 필터로 좁혀보면 더 정확해요)` : ''}
            </p>
          )}

          <div className="space-y-2">
            {rows.map((asset) => {
              const key = assetKeyOf(asset)
              const isOpen = expandedKey === key
              return (
                <div key={key} className="bg-white rounded-xl p-3 card-shadow space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-800 break-words">
                        {asset.word} <span className="text-[10px] text-gray-400 font-mono">({asset.wordKey})</span>
                      </p>
                      {asset.meaningPrimary && <p className="text-xs text-gray-500 break-words">{asset.meaningPrimary}</p>}
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <span className="text-[10px] font-black text-gray-500">{SOURCE_BADGE[asset.source] || `❓ ${asset.source || '?'}`}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${APPROVAL_STYLE[asset.approvalStatus] || 'bg-gray-100 text-gray-500'}`}>
                        {APPROVAL_LABEL[asset.approvalStatus] || asset.approvalStatus || '?'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    생성상태 {PIPELINE_LABEL[asset.pipelineStatus] || asset.pipelineStatus || '?'} · 이미지 {IMAGE_LABEL[asset.imageStatus] || asset.imageStatus || '?'}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {APPROVAL_STATUSES.filter((s) => s !== asset.approvalStatus).map((s) => (
                      <button key={s} onClick={() => handleApprovalChange(asset, s)} disabled={busy}
                        className="text-[11px] font-bold bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 btn-press disabled:opacity-40">
                        → {APPROVAL_LABEL[s]}
                      </button>
                    ))}
                    <button onClick={() => (isOpen ? closeEdit() : openEdit(asset))} disabled={busy}
                      className="text-[11px] font-bold bg-blue-50 text-blue-700 rounded-lg px-2 py-1 btn-press disabled:opacity-40">
                      {isOpen ? '닫기' : '편집'}
                    </button>
                  </div>
                  {asset.approvalStatus !== 'approved' && (
                    <p className="text-[10px] text-gray-400">※ '승인'으로 바꾸면 앞으로 엑셀 재업로드가 이 단어를 자동으로 건드리지 않아요.</p>
                  )}

                  {isOpen && form && (
                    <div className="border-t border-gray-100 pt-2 space-y-2">
                      <div className="bg-gray-50 rounded-lg p-2 text-[10px] font-mono text-gray-500 space-y-0.5">
                        <p>word_key: {asset.wordKey} (편집 불가)</p>
                        <p>sense_key: {asset.senseKey || '(빈 값)'} (편집 불가)</p>
                        <p>word: {asset.word} (편집 불가)</p>
                      </div>

                      {asset.generatedFields && Object.keys(asset.generatedFields).length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-[10px] font-black text-gray-500 mb-1">필드별 출처(generated_fields)</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(asset.generatedFields).map(([k, v]) => (
                              <span key={k} className="text-[10px] font-bold bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-gray-400">
                        ※ 뜻(meaning_primary)은 표시/힌트 전용이에요 — 실제 채점은 각 반 단어(words.meaning)를 그대로 쓰고 여기서는 바뀌지 않아요.
                      </p>

                      {EDIT_SNAKE_KEYS.map((snakeKey) => {
                        const { camel, label, kind } = EDIT_FIELD_MAP[snakeKey]
                        const value = form[camel] ?? ''
                        const setValue = (v) => setForm((prev) => ({ ...prev, [camel]: v }))
                        return (
                          <label key={snakeKey} className="block">
                            <span className="text-[10px] font-black text-gray-500">{label}</span>
                            {kind === 'textarea' && (
                              <textarea value={value} rows={2} onChange={(e) => setValue(e.target.value)}
                                className="w-full text-xs border-2 border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 resize-none focus:outline-none focus:border-indigo-400 bg-white" />
                            )}
                            {kind === 'text' && (
                              <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
                                className="w-full text-xs border-2 border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-indigo-400 bg-white" />
                            )}
                            {kind === 'array' && (
                              <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
                                placeholder="예: fast, quick"
                                className="w-full text-xs border-2 border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-indigo-400 bg-white" />
                            )}
                            {kind === 'difficulty' && (
                              <select value={value} onChange={(e) => setValue(e.target.value)}
                                className="w-full text-xs border-2 border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white focus:outline-none focus:border-indigo-400">
                                <option value="">미설정</option>
                                {DIFFICULTY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                              </select>
                            )}
                            {kind === 'interval' && (
                              <select value={value} onChange={(e) => setValue(e.target.value)}
                                className="w-full text-xs border-2 border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white focus:outline-none focus:border-indigo-400">
                                <option value="">미설정</option>
                                {INTERVAL_OPTIONS.map((d) => <option key={d} value={d}>{d}일</option>)}
                              </select>
                            )}
                          </label>
                        )
                      })}

                      <div className="flex gap-2">
                        <button onClick={() => handleSave(asset)} disabled={busy}
                          className="flex-1 bg-indigo-500 disabled:bg-gray-300 text-white font-black px-3 py-2 rounded-xl text-xs btn-press">
                          {busy ? '⏳ 저장 중...' : '💾 저장'}
                        </button>
                        <button onClick={closeEdit} disabled={busy}
                          className="flex-1 bg-gray-100 text-gray-500 font-black px-3 py-2 rounded-xl text-xs btn-press">
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
