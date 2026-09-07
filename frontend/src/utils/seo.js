export function setSeo({ title, description, canonical, image, type = 'website', noindex = false }) {
  if (title) document.title = title
  const set = (sel, attr, val) => {
    let el = document.querySelector(sel)
    if (!el) {
      if (sel.startsWith('meta[property')) {
        el = document.createElement('meta')
        const prop = sel.match(/property="([^"]+)"/)?.[1]
        if (prop) el.setAttribute('property', prop)
        document.head.appendChild(el)
      } else if (sel.startsWith('meta[name')) {
        el = document.createElement('meta')
        const name = sel.match(/name="([^"]+)"/)?.[1]
        if (name) el.setAttribute('name', name)
        document.head.appendChild(el)
      } else if (sel === 'link[rel="canonical"]') {
        el = document.createElement('link')
        el.setAttribute('rel', 'canonical')
        document.head.appendChild(el)
      }
    }
    if (el && val) el.setAttribute(attr, val)
  }
  if (description) {
    set('meta[name="description"]', 'content', description)
    set('meta[property="og:description"]', 'content', description)
    set('meta[name="twitter:description"]', 'content', description)
  }
  if (title) {
    set('meta[property="og:title"]', 'content', title)
    set('meta[name="twitter:title"]', 'content', title)
  }
  if (canonical) {
    set('link[rel="canonical"]', 'href', canonical)
    set('meta[property="og:url"]', 'content', canonical)
  }
  if (image) {
    set('meta[property="og:image"]', 'content', image)
    set('meta[name="twitter:image"]', 'content', image)
  }
  if (type) set('meta[property="og:type"]', 'content', type)
  let robots = document.querySelector('meta[name="robots"]')
  if (!robots) { robots = document.createElement('meta'); robots.setAttribute('name','robots'); document.head.appendChild(robots) }
  robots.setAttribute('content', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')
  // JSON-LD for organization (once)
  if (!document.querySelector('#ld-org')) {
    const s = document.createElement('script')
    s.id = 'ld-org'
    s.type = 'application/ld+json'
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Desa Sehat Kenanga',
      url: 'https://dika-web.web.id',
      logo: 'https://dika-web.web.id/logo-512.webp',
      description: 'Portal kesehatan warga Desa Sehat Kenanga'
    })
    document.head.appendChild(s)
  }
}
