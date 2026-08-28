import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return <main className="auth-page"><p>Memuat sesi...</p></main>
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RoleRoute({ roles, requireCitizen = false }) {
  const { access, loading, session } = useAuth()
  const location = useLocation()
  if (loading) return <main className="auth-page"><p>Memuat akses...</p></main>
  if (!access) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (requireCitizen && !access.citizen_id) {
    if (session) return <Navigate to="/registrasi" replace state={{ from: location.pathname }} />
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (!roles.includes(access.role)) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function CitizenRoute() {
  return <RoleRoute roles={['warga']} requireCitizen />
}
