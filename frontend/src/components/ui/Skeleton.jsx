export function Skeleton({ variant = 'line', width, height, className = '', style, ...props }) {
  const base = variant === 'card' ? 'skeleton skeleton-card' : variant === 'circle' ? 'skeleton' : 'skeleton skeleton-line'
  const circle = variant === 'circle'
  return (
    <div
      className={`${base}${className ? ` ${className}` : ''}`}
      style={{
        width: width || undefined,
        height: height || (circle ? width : undefined),
        borderRadius: circle ? '50%' : undefined,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  )
}

export function SkeletonText({ lines = 3 }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={`${88 - i * 12}%`} height={12} />
      ))}
    </div>
  )
}
