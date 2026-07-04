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

// One call generates both the example sentence and a memory tip together —
// cheaper and faster than two separate requests.
async function generateExampleAndTip(word, meaning) {
  const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY from env
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `A Korean elementary-school student is learning the English word "${word}" (Korean meaning: "${meaning}"). Give me two things:
1. One short, simple English example sentence using "${word}" naturally — under 10 words, beginner-level vocabulary and grammar only.
2. A short, fun Korean memory tip (mnemonic) to help the child remember the word — playful, one sentence, can use sound-alikes or a silly association. Write it in Korean.

Respond in EXACTLY this format, nothing else:
EXAMPLE: <the example sentence>
TIP: <the Korean memory tip>`,
    }],
  })
  const text = response.content.find((b) => b.type === 'text')?.text?.trim() || ''
  const exampleMatch = text.match(/EXAMPLE:\s*(.+)/i)
  const tipMatch = text.match(/TIP:\s*(.+)/i)
  return {
    example: stripQuotes(exampleMatch?.[1] || ''),
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

  const { wordId, word, meaning, example } = req.body || {}
  if (!wordId || !word) {
    res.status(400).json({ error: 'wordId and word are required' })
    return
  }

  try {
    const wordMp3 = await fetchTtsMp3(word)
    const wordAudioUrl = await uploadToStorage(supabaseUrl, serviceKey, `${wordId}-word.mp3`, wordMp3)

    // Admin-provided example wins as-is; only ask Claude when none was given.
    // The AI call (and its own TTS/upload) is isolated in its own try/catch —
    // if Anthropic billing isn't set up yet, or the call fails for any other
    // reason, the word's pronunciation audio (already generated above, no
    // Anthropic dependency) still gets saved. The word just has no example/
    // memory tip yet, filled in gracefully client-side until this succeeds.
    let exampleText = (example || '').trim()
    let memoryTip = ''
    let exampleAudioUrl = null
    try {
      if (!exampleText) {
        const generated = await generateExampleAndTip(word, meaning || '')
        exampleText = generated.example
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
        memory_tip: memoryTip || null,
      }),
    })
    if (!patchRes.ok) {
      const body = await patchRes.text().catch(() => '')
      throw new Error(`DB update failed (${patchRes.status}): ${body}`)
    }

    res.status(200).json({ wordAudioUrl, exampleAudioUrl, exampleText, memoryTip })
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) })
  }
}
