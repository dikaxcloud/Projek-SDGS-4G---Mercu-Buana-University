/** Subtle card reveal — use once on mount, not infinite */
export function AnimatedCard({ children, className = '', delay = 0, hover = true, ...props }) {
  const cls = `card-reveal${hover ? ' card-hover' : ''}${className ? ` ${className}` : ''}`
  return (
    <div className={cls} style={delay ? { animationDelay: `${delay}ms` } : undefined} {...props}>
      {children}
    </div>
  )
}
