import { LogOut } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'
import { useLogout } from './LogoutExperience'

export function AuthStatus() {
  const { access } = useAuth()
  const { requestLogout } = useLogout()
  if (!access) return null
  const logout = () => requestLogout()
  return <>
    <button className="btn btn-ghost auth-logout-desktop" onClick={logout} title="Keluar"><LogOut size={16} /> Keluar</button>
    <button className="btn btn-ghost auth-logout-mobile" onClick={logout} aria-label="Keluar dari akun" title="Keluar"><LogOut size={18} /></button>
  </>
}
