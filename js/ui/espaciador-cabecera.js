// Ajusta el espacio bajo la cabecera fija (presentación).
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
(function ajustarSpacerHeader(){
  function actualizar() {
    var tb = document.getElementById('topbarPrincipal');
    var sp = document.getElementById('topbarSpacer');
    if (tb && sp) sp.style.height = tb.getBoundingClientRect().bottom + 'px';
  }
  window.addEventListener('load', actualizar);
  window.addEventListener('resize', actualizar);
  window.addEventListener('orientationchange', actualizar);
  // Reintentamos varias veces al inicio por si las fuentes/íconos tardan en cargar y cambian el alto
  setTimeout(actualizar, 50);
  setTimeout(actualizar, 300);
  setTimeout(actualizar, 1000);
  setTimeout(actualizar, 2000);
  actualizar();

  // Detección en tiempo real: si el header cambia de tamaño por CUALQUIER motivo
  // (rotar el celular, la barra del navegador que aparece/desaparece al hacer scroll,
  // cambio de pestaña, fuentes que tardan en cargar, etc.), esto lo detecta al instante
  // y ajusta el espacio reservado, sin depender de adivinar tiempos.
  var tbEl = document.getElementById('topbarPrincipal');
  if (tbEl && window.ResizeObserver) {
    new ResizeObserver(actualizar).observe(tbEl);
  }
})();
