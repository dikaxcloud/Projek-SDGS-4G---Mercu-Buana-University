/* Boot splash controller: never leave users staring at a spinner forever.
 * 1) Hide the splash quickly once the app takes over (main.jsx also does this).
 * 2) If the React bundle never renders (e.g. poisoned cache serving a stale
 *    index.html whose hashed assets are gone), replace the spinner with a
 *    recovery message + reload button instead of spinning forever. */
(function () {
  function hideBoot() {
    var boot = document.getElementById('boot')
    if (boot && !boot.classList.contains('boot-done')) {
      boot.classList.add('boot-done')
      setTimeout(function () { if (boot.parentNode) boot.parentNode.removeChild(boot) }, 600)
    }
  }
  setTimeout(hideBoot, 1200)

  // Safety net: app bundle failed to render anything within 8s.
  setTimeout(function () {
    var root = document.getElementById('root')
    var boot = document.getElementById('boot')
    var rendered = root && root.childNodes.length > 0
    if (rendered || !boot || boot.getAttribute('data-recovered')) return
    boot.setAttribute('data-recovered', '1')
    boot.classList.remove('boot-done')
    var inner = boot.querySelector('.boot-inner')
    if (!inner) return
    inner.innerHTML = ''
    var title = document.createElement('div')
    title.className = 'boot-name'
    title.textContent = 'Gagal memuat aplikasi'
    var sub = document.createElement('div')
    sub.className = 'boot-sub'
    sub.textContent = 'Sepertinya ada cache lama di browser. Muat ulang untuk mengambil versi terbaru.'
    var btn = document.createElement('button')
    btn.textContent = 'Muat ulang sekarang'
    btn.style.cssText = 'margin-top:10px;min-height:48px;padding:0 22px;border:0;border-radius:999px;background:#0f766e;color:#fff;font-weight:800;font-size:14px;cursor:pointer'
    btn.addEventListener('click', function () { window.location.reload() })
    inner.appendChild(title)
    inner.appendChild(sub)
    inner.appendChild(btn)
  }, 8000)
})()
