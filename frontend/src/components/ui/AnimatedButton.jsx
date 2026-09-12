/** Button with micro-interaction: hover elevation + active scale 0.98 + focus + loading spinner */
export function AnimatedButton({ children, loading = false, loadingText = 'Memproses...', disabled, className = '', ...props }) {
  const isDisabled = disabled || loading
  return (
    <button className={`btn${loading ? ' loading' : ''}${className ? ` ${className}` : ''}`} disabled={isDisabled} {...props}>
      {loading ? (
        <>
          <span className="spin" style={{ display: 'inline-grid' }} aria-hidden="true">⏳</span>
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
