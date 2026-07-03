// Vercel Serverless Function — runs server-side, never in the browser.
// Generates British-English (en-GB) pronunciation audio for a word and its
// example sentence, uploads both to the Supabase Storage "audio" bucket, and
// writes the resulting public URLs back onto the word's row. Called once per
// new word (see setClassWords in src/utils/wordLibrary.js) — students never
// call any TTS service themselves, they only ever play the stored mp3.

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

  const { wordId, word, example } = req.body || {}
  if (!wordId || !word) {
    res.status(400).json({ error: 'wordId and word are required' })
    return
  }

  try {
    const wordMp3 = await fetchTtsMp3(word)
    const wordAudioUrl = await uploadToStorage(supabaseUrl, serviceKey, `${wordId}-word.mp3`, wordMp3)

    let exampleAudioUrl = null
    if (example) {
      const exampleMp3 = await fetchTtsMp3(example)
      exampleAudioUrl = await uploadToStorage(supabaseUrl, serviceKey, `${wordId}-example.mp3`, exampleMp3)
    }

    const patchRes = await fetch(`${supabaseUrl}/rest/v1/words?id=eq.${wordId}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ word_audio_url: wordAudioUrl, example_audio_url: exampleAudioUrl }),
    })
    if (!patchRes.ok) {
      const body = await patchRes.text().catch(() => '')
      throw new Error(`DB update failed (${patchRes.status}): ${body}`)
    }

    res.status(200).json({ wordAudioUrl, exampleAudioUrl })
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) })
  }
}
