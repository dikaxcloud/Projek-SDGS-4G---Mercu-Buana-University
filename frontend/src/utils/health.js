export const HEALTH_LIMITS = {
  systolic: [40, 300],
  diastolic: [20, 200],
  sugar: [1, 2000],
  weight: [1, 500],
  height: [30, 250],
  temperature: [25, 45],
  pulse: [20, 250],
}

export function numberInRange(value, [min, max]) {
  if (value === '' || value === null || value === undefined) return true
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max
}

export function calculateBmi(weightKg, heightCm) {
  const weight = Number(weightKg)
  const height = Number(heightCm) / 100
  if (!weight || !height) return null
  return Number((weight / (height * height)).toFixed(1))
}

export function bmiLabel(bmi) {
  if (bmi === null) return 'Belum dapat dihitung'
  if (bmi < 18.5) return 'Di bawah rentang umum'
  if (bmi < 25) return 'Dalam rentang umum'
  if (bmi < 30) return 'Di atas rentang umum'
  return 'Jauh di atas rentang umum'
}

export function needsFollowUp({ systolic, diastolic, sugar, temperature }) {
  return Number(systolic) >= 140 || Number(diastolic) >= 90 || Number(sugar) >= 200 || Number(temperature) >= 38
}

export function validateExamination(values) {
  const fields = [
    ['systolic', 'Sistolik', HEALTH_LIMITS.systolic], ['diastolic', 'Diastolik', HEALTH_LIMITS.diastolic],
    ['sugar', 'Gula darah', HEALTH_LIMITS.sugar], ['weight', 'Berat badan', HEALTH_LIMITS.weight],
    ['height', 'Tinggi badan', HEALTH_LIMITS.height], ['temperature', 'Suhu tubuh', HEALTH_LIMITS.temperature],
    ['pulse', 'Denyut nadi', HEALTH_LIMITS.pulse],
  ]
  for (const [key, label, range] of fields) if (!numberInRange(values[key], range)) return `${label} berada di luar rentang yang dapat diterima.`
  if (!values.systolic && !values.diastolic && !values.sugar && !values.weight && !values.temperature && !values.pulse) return 'Isi setidaknya satu hasil pemeriksaan.'
  if ((values.systolic && !values.diastolic) || (!values.systolic && values.diastolic)) return 'Sistolik dan diastolik harus diisi bersama.'
  return ''
}
