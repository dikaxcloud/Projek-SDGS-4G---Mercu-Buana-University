export function Brand() {
  return (
    <span className="brand">
      <img
        src="/logo.png"
        alt="Logo Desa Kenanga"
        className="brand-logo"
        onError={(event) => { event.currentTarget.style.display = 'none' }}
      />
      <span>Desa Sehat <strong>Kenanga</strong></span>
    </span>
  )
}
