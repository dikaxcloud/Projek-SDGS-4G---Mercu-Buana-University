import { useEffect, useState } from 'react'
import { CalendarDays, MapPin, Users, XCircle } from 'lucide-react'
import { cancelServiceRegistration, listMyServiceRegistrations, listServiceSchedules, registerForService } from '../features/health/serviceScheduleService'

function dateTime(value) {
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })
}

export function ServiceSchedulePage() {
  const [schedules, setSchedules] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [nextSchedules, nextRegistrations] = await Promise.all([listServiceSchedules(), listMyServiceRegistrations()])
      setSchedules(nextSchedules); setRegistrations(nextRegistrations)
    } catch (err) { setError(err.message || 'Jadwal belum dapat dimuat.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const register = async (scheduleId) => {
    setBusy(scheduleId); setError(''); setMessage('')
    try { const result = await registerForService(scheduleId); setMessage(`Pendaftaran dikonfirmasi. Nomor antrean Anda: ${result.queue_number}.`); await load() } catch (err) { setError(err.message || 'Pendaftaran belum berhasil.') } finally { setBusy('') }
  }
  const cancel = async (registrationId) => {
    if (!window.confirm('Batalkan pendaftaran pemeriksaan ini?')) return
    setBusy(registrationId); setError(''); setMessage('')
    try { await cancelServiceRegistration(registrationId); setMessage('Pendaftaran dibatalkan.'); await load() } catch (err) { setError(err.message || 'Pendaftaran tidak dapat dibatalkan.') } finally { setBusy('') }
  }

  return <div className="dashboard-page"><div className="container service-page">
    <header className="service-head"><div><p className="eyebrow">Layanan kesehatan desa</p><h1 className="display">Jadwal pemeriksaan</h1><p>Pilih jadwal yang tersedia. Nomor antrean diberikan setelah pendaftaran dikonfirmasi.</p></div></header>
    {message && <div className="service-feedback success-state" role="status">{message}</div>}
    {error && <div className="service-feedback error-state" role="alert">{error}<button type="button" className="btn btn-ghost" onClick={() => void load()}>Muat ulang</button></div>}
    <section aria-labelledby="schedule-list"><h2 id="schedule-list">Jadwal tersedia</h2>
      {loading ? <p className="muted-text" role="status">Memuat jadwal pemeriksaan...</p> : schedules.length === 0 ? <div className="empty-state"><strong>Belum ada jadwal terbuka.</strong><span>Hubungi petugas desa untuk informasi pemeriksaan berikutnya.</span></div> : <div className="service-list">{schedules.map((schedule) => {
        const registered = registrations.find((row) => row.schedule_id === schedule.schedule_id && row.status !== 'cancelled')
        const remaining = Math.max(0, schedule.capacity - schedule.registered_count)
        return <article className="service-card" key={schedule.schedule_id}><div><h3>{schedule.title}</h3>{schedule.description && <p>{schedule.description}</p>}<dl><div><dt><CalendarDays size={16} /> Waktu</dt><dd>{dateTime(schedule.starts_at)}</dd></div><div><dt><MapPin size={16} /> Lokasi</dt><dd>{schedule.location}</dd></div><div><dt><Users size={16} /> Kuota</dt><dd>{remaining > 0 ? `${remaining} tempat tersisa` : 'Kuota penuh'}</dd></div></dl></div>{registered ? <div className="queue-confirmation"><strong>Antrean {registered.queue_number}</strong><span>Status: {registered.status}</span></div> : <button type="button" className="btn btn-primary" disabled={busy === schedule.schedule_id || remaining === 0} onClick={() => void register(schedule.schedule_id)}>{busy === schedule.schedule_id ? 'Mendaftarkan...' : remaining === 0 ? 'Kuota penuh' : 'Daftar pemeriksaan'}</button>}</article>
      })}</div>}
    </section>
    <section className="my-registration" aria-labelledby="my-registration"><h2 id="my-registration">Pendaftaran saya</h2>{loading ? <p className="muted-text">Memuat pendaftaran...</p> : registrations.length === 0 ? <div className="empty-state"><strong>Belum ada pendaftaran.</strong><span>Pilih jadwal pemeriksaan di atas saat tersedia.</span></div> : <div className="service-list">{registrations.map((row) => <article className="service-card compact" key={row.registration_id}><div><h3>{row.title}</h3><p>{dateTime(row.starts_at)} · {row.location}</p><strong>Nomor antrean: {row.queue_number}</strong><p>Status: {row.status}</p></div>{['pending', 'confirmed', 'waiting'].includes(row.status) && <button type="button" className="btn btn-ghost" disabled={busy === row.registration_id} onClick={() => void cancel(row.registration_id)}><XCircle size={16} /> Batalkan</button>}</article>)}</div>}</section>
  </div></div>
}
