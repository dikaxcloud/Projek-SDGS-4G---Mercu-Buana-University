import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, RefreshCw, Search, UserPlus } from 'lucide-react'
import { listStaffCitizens, listStaffRts } from '../features/staff/staffService'

export function NakesWargaPage() {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [rtFilter, setRtFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rts, setRts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [citizens, rtsData] = await Promise.all([
        listStaffCitizens({ query, rt: rtFilter, status: statusFilter }),
        listStaffRts().catch(() => []),
      ])
      setRows(citizens ?? [])
      setRts(rtsData ?? [])
    } catch (err) {
      setError(err.message || 'Data warga belum dapat dimuat.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    const t = setTimeout(() => void load(), 300)
    return () => clearTimeout(t)
  }, [query, rtFilter, statusFilter])

  return (
    <div className="staff-page">
      <div className="container">
        <div className="staff-header">
          <div>
            <div className="eyebrow">Kelola warga</div>
            <h1 className="display">Daftar Warga</h1>
            <p>Cari, filter, dan buka detail warga untuk pemeriksaan.</p>
          </div>
          <Link className="btn btn-primary" to="/nakes/warga/baru"><UserPlus size={17} /> Tambah Warga</Link>
        </div>

        {error && <div className="staff-alert"><AlertTriangle size={17} /> {error} <button onClick={load} className="btn btn-ghost"><RefreshCw size={15} /> Coba lagi</button></div>}

        <div className="admin-toolbar">
          <label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, KK, atau RT" aria-label="Cari warga" /></label>
          <select value={rtFilter} onChange={(e) => setRtFilter(e.target.value)} aria-label="Filter RT" style={{ minHeight: 44, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 12 }}>
            <option value="">Semua RT</option>{(rts ?? []).map((rt) => <option key={rt.rt_id} value={rt.code}>{rt.code}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status" style={{ minHeight: 44, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 12 }}>
            <option value="">Semua status</option>
            <option value="verified">Terverifikasi</option>
            <option value="pending_verification">Pending Verifikasi</option>
            <option value="rejected">Ditolak</option>
            <option value="active">Aktif</option>
            <option value="inactive">Tidak aktif</option>
          </select>
        </div>

        {loading ? (
          <p className="muted-text">Memuat data...</p>
        ) : rows.length === 0 ? (
          <div className="panel" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <p className="muted-text">Belum ada warga ditemukan.</p>
            <p className="muted-text" style={{ fontSize: 12 }}>Coba ubah filter atau kata kunci pencarian.</p>
          </div>
        ) : (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Nama</th><th>NIK Akhir</th><th>KK</th><th>RT</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.citizen_id}>
                  <td data-label="Nama">{row.full_name || '—'}</td>
                  <td data-label="NIK Akhir">{row.nik_last4 || '—'}</td>
                  <td data-label="KK">{row.household_number || '—'}</td>
                  <td data-label="RT">{row.rt_code || '—'}</td>
                  <td data-label="Status">{row.is_active ? 'Aktif' : 'Tidak aktif'}{row.verification_status ? ` · ${row.verification_status}` : ''}</td>
                  <td data-label="Aksi"><Link className="btn btn-ghost table-action" to={`/nakes/warga/${row.citizen_id}`}>Detail <ArrowRight size={14} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
