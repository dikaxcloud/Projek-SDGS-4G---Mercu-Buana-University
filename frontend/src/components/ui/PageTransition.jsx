import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/** Global page transition — opacity 0→1 + translateY 8px→0, 200-350ms, lightweight (opacity+transform only) */
export function PageTransition({ children }) {
  const location = useLocation()
  const [key, setKey] = useState(location.pathname)

  useEffect(() => {
    setKey(location.pathname)
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  }, [location.pathname])

  return (
    <div key={key} className="page-transition">
      {children}
    </div>
  )
}
