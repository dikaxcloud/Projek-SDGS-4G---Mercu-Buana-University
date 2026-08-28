// AI Service abstraction for citizen health features.
// All AI requests go through the secure "ai-health" Supabase Edge Function.
// The AI provider key NEVER lives in the frontend (see perbaikan.txt #18).
// Every function degrades gracefully: if AI is unavailable, the local
// rule engine result is used so existing flows never break.

import { evaluateRecordRule, STATUS_UI, suggestEducationTopics } from './ruleEngine'
import { supabase } from '../../lib/supabase'

export const DISCLAIMER = 'Analisis AI ini bersifat edukatif dan bukan diagnosis medis. Jika Anda memiliki keluhan atau kondisi khusus, konsultasikan dengan tenaga kesehatan.'
const CHAT_DISCLAIMER = 'Informasi dari AI bersifat edukatif dan bukan pengganti konsultasi dengan tenaga kesehatan.'

const OFFLINE_MESSAGE = 'Anda sedang offline. Fitur AI membutuhkan koneksi internet.'
const UNAVAILABLE_MESSAGE = 'Analisis AI sedang tidak tersedia. Data pemeriksaan Anda tetap tersimpan.'

function hasNetwork() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/** Flatten a health record (raw nested or formatted) into minimal metrics. */
export function flattenRecord(raw = {}) {
  const bp = raw.blood_pressure_records?.[0] ?? null
  const sugar = raw.blood_sugar_records?.[0] ?? null
  const weight = raw.weight_records?.[0] ?? null
  const temperature = raw.temperature_records?.[0] ?? null
  const pulse = raw.pulse_records?.[0] ?? null
  const num = (value) => {
    if (value === '' || value === null || value === undefined) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return {
    systolic: num(bp?.systolic ?? raw.systolic),
    diastolic: num(bp?.diastolic ?? raw.diastolic),
    pulse: num(pulse?.pulse_bpm ?? bp?.pulse_bpm ?? raw.pulse),
    sugar: num(sugar?.value_mg_dl ?? raw.sugar),
    sugarContext: sugar?.context ?? raw.sugarContext ?? 'sewaktu',
    weight: num(weight?.weight_kg ?? raw.weight),
    height: num(weight?.height_cm ?? raw.height),
    temperature: num(temperature?.temperature_c ?? raw.temperature),
    examinedAt: raw.examined_at ?? null,
    complaint: raw.complaint ?? null,
  }
}

async function callAiHealth(action, payload) {
  if (!supabase) throw new Error('AI tidak dikonfigurasi.')
  if (!hasNetwork()) {
    const error = new Error(OFFLINE_MESSAGE)
    error.code = 'offline'
    throw error
  }
  const { data, error } = await supabase.functions.invoke('ai-health', { body: { action, payload } })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || UNAVAILABLE_MESSAGE)
  return data.data
}

function normalizeAnalysis(analysis, fallbackStatusUi) {
  if (!analysis) return null
  const status = analysis.status ?? 'normal'
  return {
    ...analysis,
    statusUi: STATUS_UI[status] ?? STATUS_UI.normal,
    observations: Array.isArray(analysis.observations) ? analysis.observations : [],
    recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
    disclaimer: analysis.disclaimer ?? DISCLAIMER,
    ...(fallbackStatusUi ? {} : {}),
  }
}

/**
 * Analyze a single examination record.
 * Order: DB cache -> secure edge function -> local rule engine fallback.
 * Never throws; AI failure never blocks the caller (health record stays saved).
 */
export async function analyzeHealthRecord(recordData, options = {}) {
  const metrics = flattenRecord(recordData)
  const recordId = options.recordId ?? recordData?.health_record_id ?? null

  if (!recordId) {
    const rule = evaluateRecordRule(metrics)
    return {
      summary: `Pemeriksaan terbaru Anda telah dicatat. ${rule.observations[0]} ${UNAVAILABLE_MESSAGE}`,
      status: rule.status,
      statusUi: rule.statusUi,
      observations: rule.observations,
      recommendations: rule.recommendations,
      disclaimer: DISCLAIMER,
      degraded: true,
      source: 'rule-engine',
    }
  }

  try {
    const data = await callAiHealth('analyze', { health_record_id: recordId })
    return { ...normalizeAnalysis(data), source: 'ai' }
  } catch (error) {
    if (error?.code !== 'offline' && !String(error?.message || '').includes('Kuota')) {
      // Provider unavailable -> fall through to local rule engine.
    }
  }

  // 3. Local rule engine fallback (no network, no diagnosis).
  const rule = evaluateRecordRule(metrics)
  return {
    summary: `Pemeriksaan terbaru Anda telah dicatat. ${rule.observations[0]} ${UNAVAILABLE_MESSAGE}`,
    status: rule.status,
    statusUi: rule.statusUi,
    observations: rule.observations,
    recommendations: rule.recommendations,
    disclaimer: DISCLAIMER,
    degraded: true,
    source: 'rule-engine',
  }
}

/** Extract a metric series from formatted/raw records (latest first). */
function extractSeries(records, metric) {
  const pick = (detail, keys) => {
    for (const key of keys) {
      const value = Number(detail?.[key])
      if (Number.isFinite(value)) return value
    }
    return null
  }
  const series = []
  for (const record of records ?? []) {
    let value = null
    if (metric === 'blood_pressure') {
      const detail = record.blood_pressure_records?.[0]
      const sys = Number(detail?.systolic)
      const dia = Number(detail?.diastolic)
      if (Number.isFinite(sys) && Number.isFinite(dia)) value = Math.round((sys + dia) / 2)
    } else if (metric === 'sugar') value = pick(record.blood_sugar_records?.[0], ['value_mg_dl'])
    else if (metric === 'weight') value = pick(record.weight_records?.[0], ['weight_kg'])
    else if (metric === 'temperature') value = pick(record.temperature_records?.[0], ['temperature_c'])
    else if (metric === 'pulse') value = pick(record.pulse_records?.[0], ['pulse_bpm'])
    if (value != null) series.push({ date: record.examined_at, value })
  }
  return series
}

/**
 * Trend analysis for one metric. Server aggregates (max 10 points);
 * client falls back to a purely local computation when AI is unavailable.
 */
export async function analyzeHealthTrend(records = [], metric = 'blood_pressure') {
  const localSeries = extractSeries(records, metric)

  try {
    const data = await callAiHealth('trend', { metric })
    if (data?.summary) return { ...data, series: data.series ?? localSeries, source: 'ai' }
  } catch { /* fall back locally */ }

  if (localSeries.length < 2) {
    return {
      summary: 'Belum ada cukup riwayat pemeriksaan untuk melihat tren. Lakukan pemeriksaan berkala agar tren dapat dianalisis.',
      trendDirection: 'stabil',
      series: localSeries,
      disclaimer: DISCLAIMER,
      insufficient: true,
      source: 'local',
    }
  }
  const latest = localSeries[0].value
  const previous = localSeries[1].value
  const diff = latest - previous
  const direction = Math.abs(diff) <= 3 ? 'stabil' : diff > 0 ? 'meningkat' : 'menurun'
  let summary = `Berdasarkan ${localSeries.length} pemeriksaan terakhir, nilai tercatat ${latest} (sebelumnya ${previous}), cenderung ${direction}.`
  if (direction === 'meningkat') summary += ' Sebaiknya lakukan pengukuran rutin dan konsultasikan jika kecenderungan berlanjut.'
  else if (direction === 'stabil') summary += ' Pertahankan pola hidup sehat dan jadwalkan pemeriksaan rutin.'
  return { summary, trendDirection: direction, series: localSeries, disclaimer: DISCLAIMER, insufficient: false, source: 'local' }
}

/**
 * Chat with the health assistant. Server-side only (context + rate limit).
 * Returns { reply, emergency?, offline?, unavailable? } and never throws hard.
 */
export async function chatHealthAssistant(message) {
  try {
    const data = await callAiHealth('chat', { message })
    return { reply: data.reply, emergency: Boolean(data.emergency), ok: true }
  } catch (error) {
    if (error?.code === 'offline') return { reply: `${OFFLINE_MESSAGE} Data pemeriksaan yang sudah tersimpan tetap dapat dilihat.`, offline: true, ok: false }
    if (String(error?.message || '').includes('Kuota')) return { reply: `${error.message}`, unavailable: true, ok: false }
    return { reply: `${UNAVAILABLE_MESSAGE}\n\n${CHAT_DISCLAIMER}`, unavailable: true, ok: false }
  }
}

/**
 * Personalized education topics based on the citizen's own recent results.
 * Uses the edge function when available; falls back to static local topics.
 */
export async function getPersonalEducation(records = []) {
  try {
    const data = await callAiHealth('education', {})
    if (data?.topics?.length) return { ...data, source: 'ai' }
  } catch { /* offline / provider down */ }

  // Local fallback: classify each of the latest records, tally flags.
  const flags = []
  for (const record of records.slice(0, 10)) {
    const metrics = flattenRecord(record)
    if (metrics.systolic != null && metrics.sugar != null) {}
    if (metrics.systolic != null) flags.push(metrics.systolic >= 120 || metrics.diastolic >= 80 || metrics.systolic < 90 ? 'bp' : null)
    if (metrics.sugar != null) flags.push(metrics.sugar >= 100 ? 'sugar' : null)
    if (metrics.weight != null) flags.push('weight')
  }
  const cleanFlags = [...new Set(flags.filter(Boolean))]
  return {
    intro: 'Berikut beberapa informasi umum untuk membantu Anda menjaga kesehatan.',
    topics: suggestEducationTopics(cleanFlags),
    articles: [],
    degraded: true,
    source: 'local',
  }
}

/**
 * Simple non-intrusive reminder computed locally from the last examination date.
 * Does NOT write to the notification system (per spec: keep it simple).
 */
export function buildHealthReminder(latestExaminedAt) {
  if (!latestExaminedAt) return null
  const days = Math.floor((Date.now() - new Date(latestExaminedAt).getTime()) / 86400000)
  if (days < 14) return null
  return {
    days,
    message: `Sudah ${days} hari sejak pemeriksaan terakhir Anda. Jika Anda memang dijadwalkan melakukan pemeriksaan rutin, silakan hubungi petugas kesehatan.`,
  }
}

/** Draft helper for nakes examination notes (template-based, no external AI). */
export async function generateNakesNote(inputData = {}) {
  const parts = []
  if (inputData.systolic && inputData.diastolic) parts.push(`Tekanan darah ${inputData.systolic}/${inputData.diastolic} mmHg.`)
  if (inputData.sugar) parts.push(`Kadar gula darah ${inputData.sugar} mg/dL (${inputData.sugarContext || 'sewaktu'}).`)
  if (inputData.weight) parts.push(`Berat badan ${inputData.weight} kg.`)
  if (inputData.temperature) parts.push(`Suhu tubuh ${inputData.temperature}°C.`)
  if (inputData.pulse) parts.push(`Denyut nadi ${inputData.pulse} bpm.`)
  if (inputData.complaint) parts.push(`Keluhan warga: ${inputData.complaint}.`)
  return parts.length > 0
    ? `Pemeriksaan fisik telah dilakukan. ${parts.join(' ')} Kondisi umum terpantau dan warga disarankan menjaga pola hidup sehat.`
    : 'Pemeriksaan rutin warga telah dilakukan tanpa keluhan utama.'
}
