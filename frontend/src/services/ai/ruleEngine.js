export const RULE_STATUS = {
  NORMAL: 'normal',
  PERLU_DIPANTAU: 'perlu_dipantau',
  PERLU_KONSULTASI: 'perlu_konsultasi',
}

export const STATUS_UI = {
  [RULE_STATUS.NORMAL]: { label: '🟢 Terlihat baik', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300' },
  [RULE_STATUS.PERLU_DIPANTAU]: { label: '🟡 Perlu dipantau', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300' },
  [RULE_STATUS.PERLU_KONSULTASI]: { label: '🟠 Sebaiknya dikonsultasikan', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-300' },
}

export function evaluateRecordRule(record = {}) {
  const observations = []
  const recommendations = []
  let highestStatus = RULE_STATUS.NORMAL

  const setStatus = (status) => {
    if (status === RULE_STATUS.PERLU_KONSULTASI) highestStatus = RULE_STATUS.PERLU_KONSULTASI
    else if (status === RULE_STATUS.PERLU_DIPANTAU && highestStatus !== RULE_STATUS.PERLU_KONSULTASI) highestStatus = RULE_STATUS.PERLU_DIPANTAU
  }

  // Blood Pressure
  if (record.systolic && record.diastolic) {
    const sys = Number(record.systolic)
    const dia = Number(record.diastolic)
    if (sys >= 140 || dia >= 90) {
      setStatus(RULE_STATUS.PERLU_KONSULTASI)
      observations.push(`Tekanan darah (${sys}/${dia} mmHg) berada di atas rentang acuan umum (≥140/90 mmHg).`)
      recommendations.push('Disarankan memantau tensi secara rutin dan berkonsultasi dengan tenaga kesehatan.')
    } else if (sys > 120 || dia > 80) {
      setStatus(RULE_STATUS.PERLU_DIPANTAU)
      observations.push(`Tekanan darah (${sys}/${dia} mmHg) dalam kategori pra-peningkatan.`)
      recommendations.push('Batasi konsumsi garam dan jaga pola hidup aktif.')
    } else if (sys < 90 || dia < 60) {
      setStatus(RULE_STATUS.PERLU_DIPANTAU)
      observations.push(`Tekanan darah (${sys}/${dia} mmHg) cenderung di bawah rentang acuan (<90/60 mmHg).`)
      recommendations.push('Pastikan asupan cairan mencukupi dan istirahat teratur.')
    } else {
      observations.push(`Tekanan darah (${sys}/${dia} mmHg) berada dalam rentang acuan normal.`)
    }
  }

  // Blood Sugar
  if (record.sugar !== undefined && record.sugar !== null && record.sugar !== '') {
    const sugar = Number(record.sugar)
    const ctx = record.sugarContext || 'sewaktu'
    if (sugar >= 200) {
      setStatus(RULE_STATUS.PERLU_KONSULTASI)
      observations.push(`Kadar gula darah (${sugar} mg/dL - ${ctx}) memerlukan perhatian khusus.`)
      recommendations.push('Disarankan melakukan pengecekan ulang dan berkonsultasi ke fasilitas kesehatan.')
    } else if ((ctx === 'puasa' && sugar >= 100) || (ctx !== 'puasa' && sugar >= 140)) {
      setStatus(RULE_STATUS.PERLU_DIPANTAU)
      observations.push(`Kadar gula darah (${sugar} mg/dL - ${ctx}) di atas batas acuan normal.`)
      recommendations.push('Perhatikan konsumsi gula dan karbohidrat sederhana.')
    } else {
      observations.push(`Kadar gula darah (${sugar} mg/dL - ${ctx}) dalam rentang acuan tergolong baik.`)
    }
  }

  // Temperature
  if (record.temperature) {
    const temp = Number(record.temperature)
    if (temp >= 38.0) {
      setStatus(RULE_STATUS.PERLU_KONSULTASI)
      observations.push(`Suhu tubuh (${temp}°C) mengindikasikan demam.`)
      recommendations.push('Istirahat cukup, penuhi cairan tubuh, dan pantau perkembangan suhu.')
    } else if (temp >= 37.5) {
      setStatus(RULE_STATUS.PERLU_DIPANTAU)
      observations.push(`Suhu tubuh (${temp}°C) sedikit di atas normal.`)
      recommendations.push('Kompres hangat dan pantau berkala.')
    } else {
      observations.push(`Suhu tubuh (${temp}°C) dalam rentang normal.`)
    }
  }

  // Pulse
  if (record.pulse) {
    const pulse = Number(record.pulse)
    if (pulse > 100 || pulse < 60) {
      setStatus(RULE_STATUS.PERLU_DIPANTAU)
      observations.push(`Denyut nadi (${pulse} bpm) di luar rentang istirahat umum (60-100 bpm).`)
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('Pertahankan pola hidup sehat, makan bergizi seimbang, dan olahraga teratur.')
  }

  return {
    status: highestStatus,
    statusUi: STATUS_UI[highestStatus],
    observations,
    recommendations,
  }
}

const EDUCATION_LIBRARY = {
  bp: { id: 'bp', title: 'Menjaga Tekanan Darah', points: ['Batasi garam dan makanan olahan.', 'Aktif bergerak setidaknya 30 menit sehari.', 'Lakukan pemeriksaan tekanan darah secara rutin.'] },
  sugar: { id: 'sugar', title: 'Mengatur Gula Darah', points: ['Kurangi minuman dan jajanan manis.', 'Pilih karbohidrat kompleks seperti nasi merah.', 'Pemeriksaan berkala membantu pemantauan.'] },
  weight: { id: 'weight', title: 'Berat Badan Ideal', points: ['Gunakan porsi makan seimbang.', 'Tambahkan sayur dan buah di tiap makan.', 'Tidur yang cukup membantu metabolisme.'] },
  general: { id: 'general', title: 'Hidrasi & Istirahat', points: ['Minum air putih yang cukup setiap hari.', 'Tidur 7-8 jam agar tubuh bugar.', 'Cuci tangan dan jaga kebersihan diri.'] },
}

/** Pick education topics from rule-engine flags (bp / sugar / weight / general). */
export function suggestEducationTopics(flags = []) {
  const unique = [...new Set(flags.filter(Boolean))]
  if (unique.length === 0) return [EDUCATION_LIBRARY.general]
  const topics = unique.map((flag) => EDUCATION_LIBRARY[flag]).filter(Boolean)
  return topics.length ? topics.slice(0, 3) : [EDUCATION_LIBRARY.general]
}
