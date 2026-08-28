import { useState } from 'react'
import { ArrowLeft, Link2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { linkAccount } from '../features/auth/authService'
import { useAuth } from '../features/auth/AuthProvider'

export function AccountLinkingPage() {
  const navigate = useNavigate(); const [params] = useSearchParams(); const { refreshAccess } = useAuth()
  const [token, setToken] = useState(params.get('code') ?? ''); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false)
  const submit = async (event) => { event.preventDefault(); setSaving(true); setMessage(''); try { const result = await linkAccount(token); if (result.status === 'linked') { await refreshAccess(); navigate('/warga', { replace: true }); return } setMessage('Tautan tidak valid, sudah dipakai, atau sudah kedaluwarsa. Hubungi admin desa.') } catch (error) { setMessage(error.message || 'Akun belum dapat dihubungkan.') } finally { setSaving(false) } }
  return <main className="auth-page"><div className="auth-card"><Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--muted)', fontSize: 13 }}><ArrowLeft size={15} /> Kembali</Link><div style={{ marginTop: 24 }}><Brand /></div><div className="icon-tile" style={{ marginTop: 25 }}><Link2 size={20} /></div><h1 className="display">Hubungkan data warga</h1><p>{token ? 'Kode dari QR terdeteksi. Pastikan Anda sudah login Google, lalu tekan hubungkan akun.' : 'Masukkan kode aktivasi dari petugas desa, atau scan QR yang diberikan. Jangan kirim kode ini di ruang publik.'}</p><form onSubmit={submit}><label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 700 }}>Kode tautan<input value={token} onChange={(event) => setToken(event.target.value)} required autoComplete="off" style={{ minHeight: 48, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 13 }} /></label>{message && <p role="alert" style={{ color: '#b42318', fontSize: 13 }}>{message}</p>}<button className="btn btn-primary btn-wide" style={{ marginTop: 18 }} disabled={saving}>{saving ? 'Memeriksa...' : 'Hubungkan akun'}</button></form></div></main>
}
