import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Topbar } from '../components/Topbar'
import { Footer } from '../components/Footer'

export function PublicLayout() {
  const location = useLocation()

  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
    window.scrollTo(0, 0)
  }, [location.pathname])

  return <div className="app-shell"><Topbar /><Outlet /><Footer /></div>
}
