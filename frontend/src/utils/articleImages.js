// Shared mapping — single source agar list & detail SELALU gambar sama per judul/kategori
// file 800w di /public/images, 400w auto-derivasi via toSrcSet()
export const CATEGORY_IMAGE = {
  'Tekanan Darah': 'memahami-tekanan-darah-800.webp',
  'Gula Darah': 'mengenal-gula-darah-800.webp',
  'Pola Makan': 'pola-makan-800.webp',
  'Aktivitas Fisik': 'aktivitas-fisik-ringan-untuk-semua-800.webp',
  'Kesehatan Lansia': 'menjaga-kesehatan-lansia-800.webp',
  'Kesehatan Anak': 'imunisasi-dan-kesehatan-anak-800.webp',
  'Pertolongan Pertama': 'pertolongan-pertama-luka-ringan-800.webp',
  'Pencegahan Penyakit': 'cuci-tangan-pencegahan-paling-mudah-800.webp',
  'Pemeriksaan Rutin': 'kapan-harus-menghubungi-petugas-800.webp',
  'Kesehatan Keluarga': 'satu-keluarga-sehat-satu-desa-kuat-800.webp',
}

// Urutan penting: yang lebih spesifik di atas. Ditambah 'informasi sehat' untuk hero-artikel.
export const TITLE_KEYWORDS = [
  { kw: ['tekanan darah', 'hipertensi', 'tensi'], file: 'cara-menjaga-tekanan-darah-tetap-sehat-800.webp' },
  { kw: ['gula darah', 'diabetes'], file: 'mengenal-gula-darah-800.webp' },
  { kw: ['pola makan', 'gizi', 'makan'], file: 'pola-makan-800.webp' },
  { kw: ['aktivitas', 'fisik', 'olahraga', 'senam'], file: 'aktivitas-fisik-ringan-untuk-semua-800.webp' },
  { kw: ['lansia', 'lanjut usia'], file: 'menjaga-kesehatan-lansia-800.webp' },
  { kw: ['anak', 'imunisasi', 'balita'], file: 'imunisasi-dan-kesehatan-anak-800.webp' },
  { kw: ['posyandu'], file: 'rutin-ke-posyandu-kenapa-penting-800.webp' },
  { kw: ['luka', 'pertolongan pertama', 'p3k'], file: 'pertolongan-pertama-luka-ringan-800.webp' },
  { kw: ['cuci tangan', 'pencegahan', 'paling mudah'], file: 'cuci-tangan-pencegahan-paling-mudah-800.webp' },
  { kw: ['petugas', 'menghubungi', 'kapan harus'], file: 'kapan-harus-menghubungi-petugas-800.webp' },
  { kw: ['informasi sehat', 'informasi untuk anda'], file: 'informasi-sehat-untuk-anda-dan-keluarga-800.webp' },
  { kw: ['keluarga', 'desa kuat'], file: 'satu-keluarga-sehat-satu-desa-kuat-800.webp' },
]

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function getArticleImageByFields({ title = '', category = '', thumbnail_url = null }, fallbackIndex = null) {
  if (thumbnail_url) return thumbnail_url
  const t = (title || '').toLowerCase()
  for (const entry of TITLE_KEYWORDS) {
    if (entry.kw.some(k => t.includes(k))) return `/images/${entry.file}`
  }
  if (category && CATEGORY_IMAGE[category]) return `/images/${CATEGORY_IMAGE[category]}`
  const fallbacks = Object.values(CATEGORY_IMAGE)
  // fallback deterministik berdasarkan judul (agar list & detail sama), bukan index posisi
  const idx = fallbackIndex != null ? fallbackIndex : hashStr(t + '|' + category) % fallbacks.length
  return `/images/${fallbacks[idx % fallbacks.length]}`
}

export function toSrcSet(p800) {
  if (!p800 || p800.startsWith('http') || p800.startsWith('data:') || p800.startsWith('blob:')) return undefined
  if (!p800.includes('-800.webp')) return undefined
  return `${p800.replace('-800.webp', '-400.webp')} 400w, ${p800} 800w`
}
