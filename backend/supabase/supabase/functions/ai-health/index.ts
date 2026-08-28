// Supabase Edge Function: ai-health
// Secure AI gateway for citizen health features.
// - Auth: requires a valid Supabase user JWT (Authorization: Bearer ...)
// - Authorization: only reads health data linked to the requesting user
// - Minimum necessary data is sent to the AI provider (no NIK/KK/phone/address)
// - Caching: results are stored in ai_health_analyses (reused unless regenerated)
// - Rate limiting: per-user daily limits via audit_logs (configurable via env)
// - Medical safety: rule engine classifies; AI only explains. No diagnosis.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DISCLAIMER = 'Analisis AI ini bersifat edukatif dan bukan diagnosis medis. Jika Anda memiliki keluhan atau kondisi khusus, konsultasikan dengan tenaga kesehatan.'
const CHAT_DISCLAIMER = 'Informasi dari AI bersifat edukatif dan bukan pengganti konsultasi dengan tenaga kesehatan.'
const OFFLINE_NOTE = 'Analisis AI sedang tidak tersedia.'

const EMERGENCY_KEYWORDS = ['darurat', 'sesak napas', 'sesak', 'pingsan', 'kejang', 'muntah darah', 'nyeri dada hebat', 'kecelakaan', 'tidak sadar', 'pendarahan hebat', 'tenggorokan bengkak']
const EMERGENCY_REPLY = `Kondisi yang Anda ceritakan bisa berada pada kategori gawat darurat. Segera hubungi petugas kesehatan atau layanan darurat resmi setempat, atau gunakan tombol "Bantuan Darurat" pada aplikasi ini. Jangan menunggu balasan dari AI.\n\n${CHAT_DISCLAIMER}`

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-1.5-flash'
const RATE_LIMIT_CHAT_DAILY = Number(Deno.env.get('RATE_LIMIT_CHAT_DAILY') ?? 20)
const RATE_LIMIT_ANALYSIS_DAILY = Number(Deno.env.get('RATE_LIMIT_ANALYSIS_DAILY') ?? 60)
const RATE_LIMIT_TREND_DAILY = Number(Deno.env.get('RATE_LIMIT_TREND_DAILY') ?? 30)
const RATE_LIMIT_EDUCATION_DAILY = Number(Deno.env.get('RATE_LIMIT_EDUCATION_DAILY') ?? 30)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

function fail(error: string, status = 400) {
  return json({ ok: false, error }, status)
}

type Metrics = {
  systolic?: number | null
  diastolic?: number | null
  pulse?: number | null
  sugar?: number | null
  sugarContext?: string | null
  weight?: number | null
  height?: number | null
  temperature?: number | null
  examinedAt?: string | null
  complaint?: string | null
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function flattenRecord(raw: any): Metrics {
  const bp = raw?.blood_pressure_records?.[0] ?? raw?.blood_pressure ?? null
  const sugar = raw?.blood_sugar_records?.[0] ?? raw?.blood_sugar ?? null
  const weight = raw?.weight_records?.[0] ?? raw?.weight ?? null
  const temperature = raw?.temperature_records?.[0] ?? null
  const pulse = raw?.pulse_records?.[0] ?? null
  return {
    systolic: num(bp?.systolic ?? raw?.systolic),
    diastolic: num(bp?.diastolic ?? raw?.diastolic),
    pulse: num(pulse?.pulse_bpm ?? bp?.pulse_bpm ?? raw?.pulse),
    sugar: num(sugar?.value_mg_dl ?? raw?.sugar),
    sugarContext: sugar?.context ?? raw?.sugarContext ?? null,
    weight: num(weight?.weight_kg ?? raw?.weight),
    height: num(weight?.height_cm ?? raw?.height),
    temperature: num(temperature?.temperature_c ?? raw?.temperature),
    examinedAt: raw?.examined_at ?? null,
    complaint: raw?.complaint ?? null,
  }
}

function classify(m: Metrics) {
  const observations: string[] = []
  const recommendations: string[] = []
  let status: 'normal' | 'perlu_dipantau' | 'perlu_konsultasi' = 'normal'
  const raise = (s: typeof status) => {
    if (s === 'perlu_konsultasi') status = s
    else if (status !== 'perlu_konsultasi') status = s
  }

  if (m.systolic && m.diastolic) {
    if (m.systolic >= 140 || m.diastolic >= 90) {
      raise('perlu_konsultasi')
      observations.push(`Tekanan darah tercatat ${m.systolic}/${m.diastolic} mmHg, di atas rentang acuan umum (>=140/90 mmHg).`)
      recommendations.push('Lakukan pemeriksaan ulang secara berkala dan pertimbangkan berkonsultasi dengan tenaga kesehatan.')
    } else if (m.systolic > 120 || m.diastolic > 80) {
      raise('perlu_dipantau')
      observations.push(`Tekanan darah tercatat ${m.systolic}/${m.diastolic} mmHg, sedikit di atas rentang ideal.`)
      recommendations.push('Batasi asupan garam dan tetap aktif bergerak.')
    } else if (m.systolic < 90 || m.diastolic < 60) {
      raise('perlu_dipantau')
      observations.push(`Tekanan darah tercatat ${m.systolic}/${m.diastolic} mmHg, cenderung di bawah rentang umum.`)
      recommendations.push('Cukupi minum air dan istirahat yang teratur.')
    } else {
      observations.push(`Tekanan darah tercatat ${m.systolic}/${m.diastolic} mmHg, dalam rentang acuan baik.`)
    }
  }
  if (m.sugar != null) {
    const ctx = m.sugarContext ?? 'sewaktu'
    if (m.sugar >= 200) {
      raise('perlu_konsultasi')
      observations.push(`Gula darah (${ctx}) tercatat ${m.sugar} mg/dL dan memerlukan perhatian.`)
      recommendations.push('Disarankan mengecek ulang dan membahas hasil dengan tenaga kesehatan.')
    } else if ((ctx === 'puasa' && m.sugar >= 100) || (ctx !== 'puasa' && m.sugar >= 140)) {
      raise('perlu_dipantau')
      observations.push(`Gula darah (${ctx}) tercatat ${m.sugar} mg/dL, di atas batas acuan.`)
      recommendations.push('Perhatikan pola makan dan asupan gula harian.')
    } else {
      observations.push(`Gula darah (${ctx}) tercatat ${m.sugar} mg/dL, dalam rentang acuan.`)
    }
  }
  if (m.temperature != null) {
    if (m.temperature >= 38) {
      raise('perlu_konsultasi')
      observations.push(`Suhu tubuh ${m.temperature} °C mengindikasikan demam.`)
      recommendations.push('Istirahat cukup, perbanyak minum, dan pantau suhu secara berkala.')
    } else if (m.temperature >= 37.5) {
      raise('perlu_dipantau')
      observations.push(`Suhu tubuh ${m.temperature} °C sedikit di atas normal.`)
    } else {
      observations.push(`Suhu tubuh ${m.temperature} °C dalam rentang normal.`)
    }
  }
  if (m.pulse != null && (m.pulse > 100 || m.pulse < 60)) {
    raise('perlu_dipantau')
    observations.push(`Denyut nadi ${m.pulse} bpm di luar rentang istirahat umum (60-100 bpm).`)
  }
  if (!observations.length) observations.push('Pemeriksaan berhasil dicatat.')
  if (!recommendations.length) {
    recommendations.push('Jaga pola makan bergizi, cukup tidur, tetap aktif bergerak, dan lakukan pemeriksaan rutin.')
  }
  return { status, observations, recommendations }
}

async function geminiJson(prompt: string): Promise<any | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      },
    )
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    return JSON.parse(text)
  } catch (_e) {
    return null
  }
}

function validStr(v: unknown, max = 600): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

function validArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const items = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 300))
  return items.length ? items : null
}

const UNSAFE_AI_CONTENT = /\b(diagnosis|didiagnosis|menderita|terkena|diabetes|hipertensi|resep|obat|dosis|hentikan obat|pasti aman|pasti sembuh)\b/i

function safeText(value: unknown, max = 600): string | null {
  const text = validStr(value, max)
  return text && !UNSAFE_AI_CONTENT.test(text) ? text : null
}

function safeArray(value: unknown): string[] | null {
  const items = validArray(value)
  return items?.every((item) => !UNSAFE_AI_CONTENT.test(item)) ? items : null
}

async function countRecentRequests(admin: any, userId: string, action: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('audit_logs')
    .select('audit_log_id', { count: 'exact', head: true })
    .eq('actor_user_id', userId)
    .eq('action', action)
    .gte('created_at', since)
  return count ?? 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return fail('Metode tidak didukung.', 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) return fail('Sesi masuk diperlukan.', 401)
    const userId = userData.user.id

    const admin = createClient(supabaseUrl, serviceKey)

    const body = await req.json().catch(() => null)
    const action = body?.action
    const payload = body?.payload ?? {}

    const { data: profile } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', userId)
      .maybeSingle()
    const isStaff = profile?.is_active && ['nakes', 'admin'].includes(profile.role)
    const { data: links } = await admin
      .from('linked_accounts')
      .select('citizen_id')
      .eq('user_id', userId)
      .limit(1)
    const citizenId: string | null = links?.[0]?.citizen_id ?? null

    // ---------- ANALYZE ----------
    if (action === 'analyze') {
      if (await countRecentRequests(admin, userId, 'AI_HEALTH_ANALYSIS') >= RATE_LIMIT_ANALYSIS_DAILY) {
        return fail('Kuota analisis hari ini sudah habis. Silakan coba lagi besok.', 429)
      }
      const recordId = validStr(payload.health_record_id, 64)
      if (!recordId) return fail('ID pemeriksaan diperlukan.')

      let recordQuery = admin
        .from('health_records')
        .select('health_record_id, citizen_id, examined_at, complaint, blood_pressure_records(systolic, diastolic, pulse_bpm), blood_sugar_records(value_mg_dl, context), weight_records(weight_kg, height_cm), temperature_records(temperature_c), pulse_records(pulse_bpm)')
        .eq('health_record_id', recordId)
      if (!isStaff) recordQuery = recordQuery.eq('citizen_id', citizenId ?? '__none__')
      const { data: owned } = await recordQuery.maybeSingle()
      if (!owned) return fail('Data pemeriksaan tidak ditemukan.', 403)
      const metrics = { ...flattenRecord(owned), examinedAt: owned.examined_at }

      const { data: cached } = await admin
        .from('ai_health_analyses')
        .select('*')
        .eq('health_record_id', recordId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (cached?.[0]) return json({ ok: true, data: { ...cached[0], cached: true } })

      const rule = classify(metrics)
      const ai = await geminiJson(`Anda asisten edukasi kesehatan warga desa dalam bahasa Indonesia sederhana.
ATURAN KERAS: DILARANG memberi diagnosis, nama penyakit, resep obat, dosis, atau keputusan medis. Gunakan frasa seperti "perlu dipantau" / "sebaiknya dikonsultasikan".
Data pemeriksaan: ${JSON.stringify(metrics)}
Status aturan sistem: ${rule.status}
Observasi sistem: ${JSON.stringify(rule.observations)}
Balas HANYA JSON: {"summary": "2-3 kalimat ringkasan ramah", "observations": ["poin"], "recommendations": ["poin"]}`)

      const summary = safeText(ai?.summary, 800) ??
        `Pemeriksaan terbaru Anda telah dianalisis. ${rule.observations[0]}`
      const observations = safeArray(ai?.observations) ?? rule.observations
      const recommendations = safeArray(ai?.recommendations) ?? rule.recommendations

      await admin.from('ai_health_analyses').insert({
          citizen_id: owned.citizen_id,
          health_record_id: recordId,
          analysis_type: 'record_analysis',
          status: rule.status,
          summary,
          observations,
          recommendations,
          disclaimer: DISCLAIMER,
          model: GEMINI_MODEL,
          prompt_version: 'v1',
        })
      await admin.from('audit_logs').insert({ actor_user_id: userId, action: 'AI_HEALTH_ANALYSIS', entity: 'ai_health', metadata: { status: rule.status } })
      return json({ ok: true, data: { summary, status: rule.status, observations, recommendations, disclaimer: DISCLAIMER, cached: false } })
    }

    // ---------- TREND ----------
    if (action === 'trend') {
      if (await countRecentRequests(admin, userId, 'AI_TREND_ANALYSIS') >= RATE_LIMIT_TREND_DAILY) {
        return fail('Kuota analisis tren hari ini sudah habis. Silakan coba lagi besok.', 429)
      }
      const metric = ['blood_pressure', 'sugar', 'weight', 'temperature', 'pulse'].includes(payload.metric) ? payload.metric : 'blood_pressure'
      if (!citizenId) return json({ ok: true, data: { summary: 'Belum ada data pemeriksaan yang cukup untuk dianalisis.', trendDirection: 'stabil', disclaimer: DISCLAIMER, insufficient: true } })

      // Cache: reuse a trend result for the same metric made in the last 24h.
      const { data: cachedRows } = await admin
        .from('ai_health_analyses')
        .select('*')
        .eq('citizen_id', citizenId)
        .eq('analysis_type', `trend_analysis:${metric}`)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
      if (cachedRows?.[0]) return json({ ok: true, data: { ...cachedRows[0], cached: true } })

      const selectMap: Record<string, string> = {
        blood_pressure: 'health_record_id,examined_at,blood_pressure_records(systolic,diastolic)',
        sugar: 'health_record_id,examined_at,blood_sugar_records(value_mg_dl,context)',
        weight: 'health_record_id,examined_at,weight_records(weight_kg,height_cm)',
        temperature: 'health_record_id,examined_at,temperature_records(temperature_c)',
        pulse: 'health_record_id,examined_at,pulse_records(pulse_bpm)',
      }
      const { data: rows } = await admin
        .from('health_records')
        .select(selectMap[metric])
        .eq('citizen_id', citizenId)
        .not(`${metric}_records.${metric === 'blood_pressure' ? 'systolic' : metric === 'sugar' ? 'value_mg_dl' : metric === 'weight' ? 'weight_kg' : metric === 'temperature' ? 'temperature_c' : 'pulse_bpm'}`, 'is', null)
        .order('examined_at', { ascending: false })
        .limit(10)

      const series: { date: string; value: number }[] = []
      for (const row of rows ?? []) {
        const detail =
          row.blood_pressure_records?.[0] ?? row.blood_sugar_records?.[0] ?? row.weight_records?.[0] ??
          row.temperature_records?.[0] ?? row.pulse_records?.[0]
        const value = metric === 'blood_pressure'
          ? (detail ? Math.round((Number(detail.systolic) + Number(detail.diastolic)) / 2) : null)
          : num(detail && (detail.value_mg_dl ?? detail.weight_kg ?? detail.temperature_c ?? detail.pulse_bpm))
        if (value != null) series.push({ date: row.examined_at, value })
      }

      if (series.length < 2) {
        return json({
          ok: true,
          data: {
            summary: 'Belum ada cukup riwayat pemeriksaan untuk melihat tren. Lakukan pemeriksaan secara berkala agar tren dapat dianalisis.',
            series, trendDirection: 'stabil', disclaimer: DISCLAIMER, insufficient: true,
          },
        })
      }

      const latest = series[0].value
      const previous = series[1].value
      const diff = latest - previous
      const direction = Math.abs(diff) <= 3 ? 'stabil' : diff > 0 ? 'meningkat' : 'menurun'

      let summary = `Berdasarkan ${series.length} pemeriksaan terakhir, nilai tercatat ${latest} (sebelumnya ${previous}), cenderung ${direction}.`
      if (direction === 'meningkat') {
        summary += ' Sebaiknya lakukan pengukuran secara rutin dengan kondisi serupa dan konsultasikan jika kecenderungan terus berlanjut.'
      } else if (direction === 'stabil') {
        summary += ' Pertahankan pola hidup sehat dan jadwalkan pemeriksaan rutin.'
      }

      const ai = await geminiJson(`Anda asisten edukasi kesehatan dalam bahasa Indonesia sederhana. DILARANG diagnosis atau menyebut penyakit.
Riwayat (terbaru dulu): ${JSON.stringify(series)}
Arah tren: ${direction}
Balas HANYA JSON: {"summary": "2-3 kalimat penjelasan tren yang mudah dipahami warga"} `)
      if (validStr(ai?.summary, 800)) summary = ai.summary

      await admin.from('ai_health_analyses').insert({
        citizen_id: citizenId,
        analysis_type: `trend_analysis:${metric}`,
        status: direction === 'meningkat' ? 'perlu_dipantau' : 'normal',
        summary,
        observations: [`Nilai terakhir ${latest}, sebelumnya ${previous}.`],
        recommendations: [direction === 'meningkat' ? 'Pantau secara rutin dan konsultasikan jika berlanjut.' : 'Pertahankan gaya hidup sehat.'],
        disclaimer: DISCLAIMER,
        model: GEMINI_MODEL,
        prompt_version: `v1:${metric}`,
      })
      await admin.from('audit_logs').insert({ actor_user_id: userId, action: 'AI_TREND_ANALYSIS', entity: 'ai_health', metadata: { metric, direction } })
      return json({ ok: true, data: { summary, series, trendDirection: direction, disclaimer: DISCLAIMER, insufficient: false } })
    }

    // ---------- CHAT ----------
    if (action === 'chat') {
      const message = validStr(payload.message, 500)
      if (!message) return fail('Pertanyaan tidak boleh kosong.')

      if (EMERGENCY_KEYWORDS.some((k) => message.toLowerCase().includes(k))) {
        return json({ ok: true, data: { reply: EMERGENCY_REPLY, emergency: true } })
      }

      if (await countRecentRequests(admin, userId, 'AI_HEALTH_CHAT') >= RATE_LIMIT_CHAT_DAILY) {
        return fail('Kuota tanya AI hari ini sudah habis. Silakan coba lagi besok.', 429)
      }

      let contextNote = 'Warga belum memiliki data pemeriksaan.'
      if (citizenId) {
        const { data: recents } = await admin
          .from('health_records')
          .select('examined_at, blood_pressure_records(systolic,diastolic), blood_sugar_records(value_mg_dl,context), weight_records(weight_kg)')
          .eq('citizen_id', citizenId)
          .order('examined_at', { ascending: false })
          .limit(5)
        if (recents?.length) contextNote = `Riwayat minimal warga: ${JSON.stringify(recents.map((r: any) => ({ tanggal: r.examined_at?.slice(0, 10), tensi: r.blood_pressure_records?.[0] ? `${r.blood_pressure_records[0].systolic}/${r.blood_pressure_records[0].diastolic}` : null, gula: r.blood_sugar_records?.[0]?.value_mg_dl ?? null, berat: r.weight_records?.[0]?.weight_kg ?? null })))}`
      }

      const { data: articles } = await admin
        .from('health_articles')
        .select('title,summary,content')
        .eq('is_published', true)
        .limit(8)

      const lower = message.toLowerCase()
      const relevant = (articles ?? []).filter((a: any) =>
        [a.title, a.summary].some((t: string) => t.toLowerCase().split(/\s+/).some((w) => w.length > 5 && lower.includes(w.toLowerCase()))))
      const knowledge = (relevant.length ? relevant : (articles ?? []).slice(0, 3))
        .map((a: any) => `- ${a.title}: ${a.summary}`).join('\n')

      const reply = (await geminiJson(`Anda "Asisten Kesehatan Desa", asisten edukasi berbahasa Indonesia yang ramah untuk warga desa.
ATURAN: hanya edukasi & penjelasan data. DILARANG diagnosis/penyakit/obat/dosis. Jika pertanyaan medis serius, arahkan ke tenaga kesehatan.
Data warga (minimum necessary): ${contextNote}
Artikel kesehatan tersedia:\n${knowledge}
Pertanyaan warga: ${message}
Balas HANYA JSON: {"reply": "jawaban singkat 2-5 kalimat"}`))?.reply

      const safeReply = validStr(reply, 1200) ??
        'Terima kasih atas pertanyaannya. Berdasarkan data pemeriksaan Anda, penting untuk menjaga pola makan, istirahat cukup, dan melakukan pemeriksaan rutin. Untuk kondisi tertentu, silakan konsultasikan dengan tenaga kesehatan.'
      await admin.from('audit_logs').insert({ actor_user_id: userId, action: 'AI_HEALTH_CHAT', entity: 'ai_health', metadata: {} })
      return json({ ok: true, data: { reply: `${safeReply}\n\n${CHAT_DISCLAIMER}`, emergency: false } })
    }

    // ---------- EDUCATION ----------
    if (action === 'education') {
      if (await countRecentRequests(admin, userId, 'AI_EDUCATION') >= RATE_LIMIT_EDUCATION_DAILY) {
        return fail('Kuota edukasi hari ini sudah habis. Silakan coba lagi besok.', 429)
      }
      const topicsByFlag: Record<string, { id: string; title: string; points: string[] }> = {
        bp: { id: 'bp', title: 'Menjaga Tekanan Darah', points: ['Batasi garam & makanan olahan.', 'Aktif bergerak 30 menit sehari.', 'Cek tensi secara rutin.'] },
        sugar: { id: 'sugar', title: 'Mengatur Gula Darah', points: ['Kurangi minuman manis.', 'Pilih karbohidrat kompleks.', 'Pemeriksaan berkala membantu pemantauan.'] },
        weight: { id: 'weight', title: 'Berat Badan Ideal', points: ['Porsi makan seimbang.', 'Sayur & buah tiap makan.', 'Tidur cukup membantu metabolisme.'] },
        general: { id: 'general', title: 'Hidrasi & Istirahat', points: ['Minum air putih yang cukup.', 'Tidur 7-8 jam sehari.', 'Cuci tangan & jaga kebersihan.'] },
      }

      let flags: string[] = []
      if (citizenId) {
        const { data: recents } = await admin
          .from('health_records')
          .select('blood_pressure_records(systolic,diastolic), blood_sugar_records(value_mg_dl,context), weight_records(weight_kg,height_cm)')
          .eq('citizen_id', citizenId)
          .order('examined_at', { ascending: false })
          .limit(10)
        for (const r of recents ?? []) {
          const m = flattenRecord(r)
          const res = classify(m)
          if (m.systolic != null && res.status !== 'normal') flags.push('bp')
          if (m.sugar != null && res.status !== 'normal') flags.push('sugar')
          if (m.weight != null) flags.push('weight')
        }
      }
      flags = [...new Set(flags)].slice(0, 3)
      if (!flags.length) flags = ['general']

      const topics = flags.map((f) => topicsByFlag[f]).filter(Boolean)
      const intro = (await geminiJson(`Bahasa Indonesia sederhana, edukatif tanpa diagnosis. Warga memiliki topik relevan: ${JSON.stringify(topics.map((t) => t.title))}.
Balas HANYA JSON: {"intro": "1-2 kalimat pengantar personal, contoh: Beberapa hasil pemeriksaan Anda menunjukkan nilai yang perlu dipantau. Berikut informasi umum yang bisa membantu."}`))?.intro

      const { data: articles } = await admin
        .from('health_articles')
        .select('article_id,title,slug,summary')
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(6)

      await admin.from('audit_logs').insert({ actor_user_id: userId, action: 'AI_EDUCATION', entity: 'ai_health', metadata: { topics: flags } })

      return json({ ok: true, data: { intro: validStr(intro, 400) ?? 'Berikut beberapa informasi umum untuk membantu Anda menjaga kesehatan.', topics, articles: articles ?? [] } })
    }

    return fail('Aksi tidak dikenali.', 400)
  } catch (e) {
    console.error('ai-health error', e)
    return json({ ok: false, error: OFFLINE_NOTE }, 500)
  }
})
