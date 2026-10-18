import { useEffect, useState } from 'react'
import { Download, Share } from 'lucide-react'
import { getPwaState, installInstructions, promptInstall, subscribePwa } from '../lib/pwa'

export function PwaInstallButton({ variant = 'primary', label = 'Instal Aplikasi' }) {
  const [state, setState] = useState(() => getPwaState())
  const [showHint, setShowHint] = useState(false)

  useEffect(() => subscribePwa(() => setState({ ...getPwaState() })), [])

  if (state.isStandalone) return null

  const handleClick = async () => {
    if (state.canInstall) {
      const ok = await promptInstall()
      if (!ok) setShowHint(false)
      setState({ ...getPwaState() })
      return
    }
    setShowHint((v) => !v)
  }

  return (
    <div className="pwa-install-wrap">
      <button type="button" className={`btn ${variant === 'ghost' ? 'btn-ghost' : 'btn-primary'} pwa-install-btn`} onClick={() => void handleClick()}>
        {state.canInstall ? <Download size={17} /> : <Share size={17} />}
        {state.canInstall ? label : 'Cara Instal Aplikasi'}
      </button>
      {showHint && !state.canInstall && (
        <p className="pwa-install-hint" role="note">{installInstructions()}</p>
      )}
    </div>
  )
}
