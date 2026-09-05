export function Brand() {
  return (
    <span className="brand">
      <picture>
        <source srcSet="/logo-76.webp 1x, /logo-152.webp 2x" type="image/webp" />
        <img
          src="/logo-152.png"
          alt="Logo Desa Kenanga"
          className="brand-logo"
          width={38}
          height={38}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onError={(event) => { event.currentTarget.style.display = 'none' }}
        />
      </picture>
      <span>Desa Sehat <strong>Kenanga</strong></span>
    </span>
  )
}
