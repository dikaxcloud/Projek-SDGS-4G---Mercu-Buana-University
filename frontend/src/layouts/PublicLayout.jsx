import { Outlet } from 'react-router-dom'
import { Topbar } from '../components/Topbar'
import { Footer } from '../components/Footer'

export function PublicLayout() {
  return <div className="app-shell"><Topbar /><Outlet /><Footer /></div>
}
