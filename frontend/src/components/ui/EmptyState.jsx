export function EmptyState({ icon, title = 'Belum ada data', desc, action, className = '' }) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`}>
      {icon && <div style={{ fontSize: 28 }}>{icon}</div>}
      <strong>{title}</strong>
      {desc && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, maxWidth: '32ch' }}>{desc}</p>}
      {action}
    </div>
  )
}

export function LoadingState({ message = 'Memuat...' }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <span className="spin" style={{ display: 'grid' }}>⏳</span>
      <strong>{message}</strong>
    </div>
  )
}

export function ErrorState({ title = 'Terjadi kesalahan', desc, onRetry }) {
  return (
    <div className="error-state">
      <div style={{ fontSize: 28 }}>⚠️</div>
      <strong>{title}</strong>
      {desc && <p style={{ margin: 0, fontSize: 13 }}>{desc}</p>}
      {onRetry && <button type="button" className="btn btn-ghost" onClick={onRetry}>Coba lagi</button>}
    </div>
  )
}

export function SuccessState({ title = 'Berhasil', desc }) {
  return (
    <div className="success-state">
      <div style={{ fontSize: 28 }}>✓</div>
      <strong>{title}</strong>
      {desc && <p style={{ margin: 0, fontSize: 13 }}>{desc}</p>}
    </div>
  )
}
