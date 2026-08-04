// Vercel Serverless Function — runs server-side, never in the browser.
// For a new word this:
//   1. Uses the admin-provided example sentence, or asks Claude (Haiku 4.5)
//      to write a short, simple one if none was given — plus a fun Korean
//      memory tip, in the same call.
//   2. Generates British-English (en-GB) pronunciation audio for the word
//      and the example, via Google Translate's TTS endpoint.
//   3. Uploads both mp3s to the Supabase Storage "AUDIO" bucket.
//   4. Writes example_text + memory_tip + both audio URLs back onto the
//      word's row.
// Called once per new word (see setClassWords in src/utils/wordLibrary.js) —
// students never call any TTS or AI service themselves, they only ever play
// the stored mp3 / read the stored example text / memory tip.

import Anthropic from '@anthropic-ai/sdk'

function stripQuotes(s) {
  return (s || '').replace(/^["'“]+|["'”]+$/g, '').trim()
}

// One call generates the example sentence, its Korean translation, and a
// memory tip together — cheaper and faster than separate requests.
async function generateExampleAndTip(word, meaning) {
  const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY from env
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `A Korean elementary-school student is learning the English word "${word}" (Korean meaning: "${meaning}"). Give me three things:
1. One short, simple English example sentence using "${word}" naturally — under 10 words, beginner-level vocabulary and grammar only.
2. The natural Korean translation of that exact example sentence (translate the whole sentence, not just the word).
3. A friendly, natural Korean explanation (about 2 sentences) that helps the child understand when/how "${word}" is actually used — like explaining it to a curious kid, not a mechanical "word = meaning" formula. It's fine to reference how the word sounds in Korean if that genuinely helps, but the main point is real-world context and usage, ideally with a short quoted example phrase. Write both sentences on a single line (no line breaks).

Respond in EXACTLY this format, nothing else:
EXAMPLE: <the example sentence>
TRANSLATION: <the Korean translation of the example sentence>
TIP: <the two-sentence Korean explanation, on one line>`,
    }],
  })
  const text = response.content.find((b) => b.type === 'text')?.text?.trim() || ''
  const exampleMatch = text.match(/EXAMPLE:\s*(.+)/i)
  const translationMatch = text.match(/TRANSLATION:\s*(.+)/i)
  const tipMatch = text.match(/TIP:\s*(.+)/i)
  return {
    example: stripQuotes(exampleMatch?.[1] || ''),
    exampleTranslation: stripQuotes(translationMatch?.[1] || ''),
    memoryTip: stripQuotes(tipMatch?.[1] || ''),
  }
}

// Repair-only path for rows that already have a good example_text but are
// missing example_translation/memory_tip (2026-08 carry-forward bug — see
// handoff.md). Reuses the exact given example sentence instead of asking
// Claude to invent a new one, so example_audio_url never goes stale.
async function generateTranslationAndTip(word, meaning, exampleText) {
  const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY from env
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `A Korean elementary-school student is learning the English word "${word}" (Korean meaning: "${meaning}"). This example sentence has already been chosen and must NOT be changed: "${exampleText}". Give me two things:
1. The natural Korean translation of that exact example sentence (translate the whole sentence, not just the word).
2. A friendly, natural Korean explanation (about 2 sentences) that helps the child understand when/how "${word}" is actually used — like explaining it to a curious kid, not a mechanical "word = meaning" formula. It's fine to reference how the word sounds in Korean if that genuinely helps, but the main point is real-world context and usage, ideally with a short quoted example phrase. Write both sentences on a single line (no line breaks).

Respond in EXACTLY this format, nothing else:
TRANSLATION: <the Korean translation of the example sentence>
TIP: <the two-sentence Korean explanation, on one line>`,
    }],
  })
  const text = response.content.find((b) => b.type === 'text')?.text?.trim() || ''
  const translationMatch = text.match(/TRANSLATION:\s*(.+)/i)
  const tipMatch = text.match(/TIP:\s*(.+)/i)
  return {
    exampleTranslation: stripQuotes(translationMatch?.[1] || ''),
    memoryTip: stripQuotes(tipMatch?.[1] || ''),
  }
}

const TTS_ENDPOINTS = (text) => {
  const q = encodeURIComponent(text.slice(0, 190))
  return [
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${q}&tl=en-GB&client=tw-ob`,
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en-GB&q=${q}`,
  ]
}

async function fetchTtsMp3(text) {
  let lastErr = null
  for (const url of TTS_ENDPOINTS(text)) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } })
      const contentType = res.headers.get('content-type') || ''
      if (res.ok && contentType.includes('audio')) {
        return Buffer.from(await res.arrayBuffer())
      }
      lastErr = new Error(`TTS endpoint returned ${res.status} ${contentType}`)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('TTS fetch failed')
}

// Bucket name is "AUDIO" (uppercase) — Supabase Storage bucket names are
// case-sensitive, and this project's bucket was created as AUDIO.
const AUDIO_BUCKET = 'AUDIO'

async function uploadToStorage(supabaseUrl, serviceKey, filename, mp3Buffer) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${AUDIO_BUCKET}/${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: mp3Buffer,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Storage upload failed (${res.status}): ${body}`)
  }
  return `${supabaseUrl}/storage/v1/object/public/${AUDIO_BUCKET}/${filename}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Server not configured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' })
    return
  }

  // 2026-07-16 P7 감사 후속 — 이 라우트는 학생 화면(WordDetail/QuizGame의
  // 지연 백필)에서도 자동 호출되므로 관리자 인증을 요구할 수 없다. 대신
  // 최소 방어로: (1) wordId가 실제 words 테이블에 존재해야만 진행(없으면
  // 404 — 임의 텍스트로 Anthropic/TTS 비용을 태우는 것 차단), (2) 생성에
  // 쓰는 word/meaning/example은 클라이언트 body가 아니라 DB row 값을 쓴다
  // (익명 fetch로 body를 조작해도 실제 단어 데이터로만 생성됨), (3) 이미
  // 오디오+예문이 모두 있는 단어는 no-op(반복 호출 비용 차단 — 정상
  // 클라이언트는 word_audio_url과 example_text가 모두 있으면 애초에 호출
  // 안 하므로 동작 불변).
  const { wordId } = req.body || {}
  if (!wordId) {
    res.status(400).json({ error: 'wordId is required' })
    return
  }

  try {
    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/words?id=eq.${encodeURIComponent(wordId)}&select=id,word,meaning,example_text,word_audio_url,memory_tip,example_translation`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    if (!lookupRes.ok) {
      const body = await lookupRes.text().catch(() => '')
      throw new Error(`word lookup failed (${lookupRes.status}): ${body}`)
    }
    const rows = await lookupRes.json()
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row) {
      res.status(404).json({ error: 'word not found' })
      return
    }
    if (row.word_audio_url && row.example_text && row.memory_tip) {
      res.status(200).json({ alreadyComplete: true, wordAudioUrl: row.word_audio_url, exampleText: row.example_text })
      return
    }

    // Narrow repair path (2026-08): word audio + example text already exist,
    // only memory_tip (and usually example_translation alongside it) are
    // missing — the carry-forward bug that dropped these two text fields on
    // unit re-save, now fixed at the source. This path never calls TTS and
    // never touches example_text/word_audio_url/example_audio_url; it only
    // asks Claude to translate+explain the EXISTING example sentence and
    // PATCHes the missing text field(s). Self-extinguishing: once a row's
    // memory_tip is filled, it no longer matches this condition.
    if (row.word_audio_url && row.example_text && !row.memory_tip) {
      try {
        const generated = await generateTranslationAndTip(row.word, row.meaning || '', row.example_text)
        const patchBody = {}
        if (generated.exampleTranslation && !row.example_translation) patchBody.example_translation = generated.exampleTranslation
        if (generated.memoryTip) patchBody.memory_tip = generated.memoryTip
        if (Object.keys(patchBody).length === 0) {
          // AI response didn't parse into usable fields — write nothing,
          // leave the row exactly as it was for a future retry.
          res.status(200).json({ alreadyComplete: true, wordAudioUrl: row.word_audio_url, exampleText: row.example_text })
          return
        }
        const patchRes = await fetch(`${supabaseUrl}/rest/v1/words?id=eq.${wordId}`, {
          method: 'PATCH',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(patchBody),
        })
        if (!patchRes.ok) {
          const body = await patchRes.text().catch(() => '')
          throw new Error(`DB update failed (${patchRes.status}): ${body}`)
        }
        res.status(200).json({
          wordAudioUrl: row.word_audio_url,
          exampleText: row.example_text,
          exampleTranslation: patchBody.example_translation || row.example_translation || null,
          memoryTip: patchBody.memory_tip || null,
        })
        return
      } catch (tipErr) {
        console.error('[generate-audio] tip-only repair failed (non-fatal):', tipErr.message || tipErr)
        res.status(500).json({ error: tipErr.message || String(tipErr) })
        return
      }
    }

    const word = row.word
    const meaning = row.meaning
    const example = row.example_text

    const wordMp3 = await fetchTtsMp3(word)
    const wordAudioUrl = await uploadToStorage(supabaseUrl, serviceKey, `${wordId}-word.mp3`, wordMp3)

    // Admin-provided example wins as-is; only ask Claude when none was given.
    // The AI call (and its own TTS/upload) is isolated in its own try/catch —
    // if Anthropic billing isn't set up yet, or the call fails for any other
    // reason, the word's pronunciation audio (already generated above, no
    // Anthropic dependency) still gets saved. The word just has no example/
    // memory tip yet, filled in gracefully client-side until this succeeds.
    let exampleText = (example || '').trim()
    let exampleTranslation = ''
    let memoryTip = ''
    let exampleAudioUrl = null
    try {
      if (!exampleText) {
        const generated = await generateExampleAndTip(word, meaning || '')
        exampleText = generated.example
        exampleTranslation = generated.exampleTranslation
        memoryTip = generated.memoryTip
      }
      if (exampleText) {
        const exampleMp3 = await fetchTtsMp3(exampleText)
        exampleAudioUrl = await uploadToStorage(supabaseUrl, serviceKey, `${wordId}-example.mp3`, exampleMp3)
      }
    } catch (exampleErr) {
      console.error('[generate-audio] example/tip generation failed (non-fatal):', exampleErr.message || exampleErr)
      exampleText = example || null
      exampleAudioUrl = null
    }

    const patchRes = await fetch(`${supabaseUrl}/rest/v1/words?id=eq.${wordId}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        word_audio_url: wordAudioUrl,
        example_audio_url: exampleAudioUrl,
        example_text: exampleText || null,
        example_translation: exampleTranslation || null,
        memory_tip: memoryTip || null,
      }),
    })
    if (!patchRes.ok) {
      const body = await patchRes.text().catch(() => '')
      throw new Error(`DB update failed (${patchRes.status}): ${body}`)
    }

    res.status(200).json({ wordAudioUrl, exampleAudioUrl, exampleText, exampleTranslation, memoryTip })
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) })
  }
}
