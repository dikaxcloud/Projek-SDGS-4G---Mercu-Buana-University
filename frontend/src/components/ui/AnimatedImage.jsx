import { useState } from 'react'

export function AnimatedImage({ src, alt, fallback, className = '', wrapClassName = '', width, height, loading = 'lazy', ...props }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error && fallback) {
    return <div className={fallback ? '' : className}>{fallback}</div>
  }
  if (!src || error) {
    return (
      <div
        className={`skeleton ${className}`}
        style={{ width: width || '100%', height: height || 180, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}
        role="img"
        aria-label={alt || 'Gambar tidak tersedia'}
      >
        Gambar tidak tersedia
      </div>
    )
  }

  return (
    <div className={`img-zoom-wrap ${wrapClassName}`} style={{ borderRadius: 'inherit' }}>
      {!loaded && <div className="skeleton" style={{ width: '100%', height: height || 180, position: 'absolute', inset: 0 }} aria-hidden="true" />}
      <img
        src={src}
        alt={alt || ''}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`${loaded ? 'img-reveal' : ''} ${className}`}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity .3s ease', ...props.style }}
        {...props}
      />
    </div>
  )
}
