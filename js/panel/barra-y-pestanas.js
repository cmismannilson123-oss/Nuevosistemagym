// Medición de barras y scroll al cambiar de pestaña (panel).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
/* v48: medición en vivo de la barra superior e inferior + scroll limpio al cambiar de panel */
(function(){
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch(e){}
  var root = document.documentElement, raf = 0;
  function medir(){
    raf = 0;
    var tb = document.getElementById('topbarPrincipal');
    var nav = document.querySelector('.tabs');
    var top = 0;
    if (tb && getComputedStyle(tb).display !== 'none') top = Math.ceil(tb.getBoundingClientRect().height);
    root.style.setProperty('--cy-top', (top || 0) + 'px');
    var espacio = 24;
    if (nav && getComputedStyle(nav).display !== 'none') {
      var vh = window.innerHeight, r = nav.getBoundingClientRect(), mayor = vh - r.top;
      var qr = nav.querySelector('.tabbtn-centro');
      if (qr) { var rq = qr.getBoundingClientRect(); mayor = Math.max(mayor, vh - rq.top); }
      espacio = Math.ceil(mayor) + 22;
    } else {
      espacio = 24;
    }
    root.style.setProperty('--cy-nav-space', espacio + 'px');
  }
  function pedir(){ if (!raf) raf = requestAnimationFrame(medir); }
  window.cyMedirBarras = medir;
  ['load','resize','orientationchange','pageshow'].forEach(function(ev){ window.addEventListener(ev, pedir); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', pedir);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) pedir(); });
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(pedir);
    var a = document.getElementById('topbarPrincipal'), b = document.querySelector('.tabs');
    if (a) ro.observe(a); if (b) ro.observe(b);
  }
  [0, 60, 300, 900, 2000].forEach(function(t){ setTimeout(pedir, t); });
  pedir();

  /* Al cambiar de panel, siempre se empieza arriba (antes quedaba la posición del panel anterior: contenido cortado o en blanco) */
  var orig = window.showTab;
  if (typeof orig === 'function' && !orig.__v48) {
    var envuelta = function(){
      var antes = document.querySelector('.panel.active');
      var res = orig.apply(this, arguments);
      var ahora = document.querySelector('.panel.active');
      if (ahora !== antes) { try { window.scrollTo(0, 0); } catch(e){} }
      pedir();
      return res;
    };
    envuelta.__v48 = true;
    window.showTab = envuelta;
  }
})();
